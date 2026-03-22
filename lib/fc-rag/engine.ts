/**
 * FC-RAG Engine - Function Calling 기반 RAG 엔진
 *
 * korean-law-mcp 도구를 LLM Function Calling으로 호출하여
 * 법제처 API 실시간 데이터 기반 답변 생성.
 *
 * ── LLM 구성 ──
 * Primary : Sonnet 4.6 (Claude) — CLI subprocess (stream-json 모드)
 *           로컬: claude.exe 직접 spawn / Vercel: OpenClaw Bridge 프록시
 * Fallback: Gemini Flash — Claude 불능 시 이 엔진이 직접 Gemini 호출
 *
 * 도구 어댑터(tool-adapter), Tier 시스템(tool-tiers), 프롬프트(prompts)는
 * 양쪽 LLM이 공유하는 인프라.
 *
 * SSE 스트리밍 지원: executeClaudeRAGStream() / executeGeminiRAGStream()
 */

import { GoogleGenAI, type Part } from '@google/genai'
import { getToolDeclarations, executeTool, executeToolsParallel, type ToolCallResult } from './tool-adapter'
import { buildSystemPrompt, type LegalQueryType } from './prompts'
import { TOOL_DISPLAY_NAMES, selectToolsForQuery, CHAIN_COVERS, detectDomain } from './tool-tiers'
import { KNOWN_MST, cacheMSTEntries, detectFastPath, parseLawEntries, findBestMST, findBestOrdinanceSeq, type LawEntry } from './fast-path'
import { buildCitations, calcConfidence, parseCitationsFromAnswer } from './citations'
import { summarizeToolResult, getToolCallQuery, correctToolArgs, rerankAiSearchResult } from './result-utils'
import { callAnthropicStream, type DirectMessage } from './anthropic-client'
import { evaluateResponseQuality } from './quality-evaluator'
import { AI_CONFIG } from '@/lib/ai-config'

type QueryComplexity = 'simple' | 'moderate' | 'complex'

// ── 대화 컨텍스트 스토어 (로컬 dev용, Bridge 경로는 서버사이드 세션 사용) ──
interface ConversationEntry { query: string; answer: string }
const conversationStore = new Map<string, ConversationEntry[]>()
const CONV_MAX_ENTRIES = 5
const CONV_MAX_AGE_MS = 30 * 60_000 // 30분
const CONV_MAX_SIZE = 500 // Map 크기 상한 (메모리 보호)
const conversationTimestamps = new Map<string, number>()

function getConversationContext(conversationId?: string): string {
  if (!conversationId) return ''
  const entries = conversationStore.get(conversationId)
  if (!entries?.length) return ''
  // 최근 3턴만 포함 (토큰 절약)
  const recent = entries.slice(-3)
  return recent.map((e, i) => `[이전 질문 ${i + 1}] ${e.query}\n[이전 답변 ${i + 1}] ${e.answer.slice(0, 500)}`).join('\n\n')
}

function storeConversation(conversationId: string | undefined, query: string, answer: string) {
  if (!conversationId) return
  // 만료된 대화 정리
  const now = Date.now()
  for (const [id, ts] of conversationTimestamps) {
    if (now - ts > CONV_MAX_AGE_MS) {
      conversationStore.delete(id)
      conversationTimestamps.delete(id)
    }
  }
  // 크기 상한 초과 시 가장 오래된 엔트리 LRU 삭제
  while (conversationStore.size >= CONV_MAX_SIZE) {
    let oldestId: string | null = null
    let oldestTs = Infinity
    for (const [id, ts] of conversationTimestamps) {
      if (ts < oldestTs) { oldestTs = ts; oldestId = id }
    }
    if (!oldestId) break
    conversationStore.delete(oldestId)
    conversationTimestamps.delete(oldestId)
  }
  const entries = conversationStore.get(conversationId) || []
  entries.push({ query, answer: answer.slice(0, 2000) })
  if (entries.length > CONV_MAX_ENTRIES) entries.shift()
  conversationStore.set(conversationId, entries)
  conversationTimestamps.set(conversationId, now)
}

interface GeminiPart {
  text?: string
  functionCall?: { name?: string; args?: Record<string, unknown> }
  functionResponse?: { name?: string; response?: { result?: string } }
}

// ─── 타입 ───

export type { LegalQueryType } from './prompts'

export interface FCRAGCitation {
  lawName: string
  articleNumber: string
  chunkText: string
  source: string
}

export interface FCRAGResult {
  answer: string
  citations: FCRAGCitation[]
  confidenceLevel: 'high' | 'medium' | 'low'
  complexity: QueryComplexity
  queryType: LegalQueryType
  isTruncated?: boolean
  warnings?: string[]
}

// ─── SSE 스트림 이벤트 타입 ───

export type FCRAGStreamEvent =
  | { type: 'status'; message: string; progress: number }
  | { type: 'tool_call'; name: string; displayName: string; query?: string }
  | { type: 'tool_result'; name: string; displayName: string; success: boolean; summary: string }
  | { type: 'token_usage'; inputTokens: number; outputTokens: number; totalTokens: number }
  | { type: 'answer'; data: FCRAGResult }
  | { type: 'answer_token'; data: { text: string } }
  | { type: 'citation_verification'; citations: Array<{ lawName: string; articleNum: string; text: string; source: string; verified: boolean; verificationMethod: string }> }
  | { type: 'source'; source: 'claude' | 'openclaw' | 'gemini' }
  | { type: 'error'; message: string }

// ─── 설정 ───

const MODEL = AI_CONFIG.gemini.primary

const MAX_TOKENS: Record<QueryComplexity, number> = {
  simple: 3072,
  moderate: 4096,
  complex: 6144,
}

/** Gemini API complexity별 타임아웃 (ms) */
const GEMINI_TIMEOUT: Record<QueryComplexity, number> = {
  simple: 30_000,
  moderate: 45_000,
  complex: 60_000,
}

/** Promise에 타임아웃을 적용하는 유틸 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 타임아웃 (${ms}ms)`)), ms)
    promise.then(
      (val) => { clearTimeout(timer); resolve(val) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}

/** Gemini: complexity 기반 최대 도구 턴 수 */
function getMaxToolTurns(complexity: QueryComplexity): number {
  switch (complexity) {
    case 'simple': return 2
    case 'moderate': return 3
    case 'complex': return 4
  }
}

/** Claude CLI: complexity 기반 max-turns (도구 호출 횟수 제한) */
function getMaxClaudeTurns(complexity: QueryComplexity): number {
  switch (complexity) {
    case 'simple': return 5
    case 'moderate': return 8
    case 'complex': return 12
  }
}

// ── Re-export for external consumers ──
export { KNOWN_MST } from './fast-path'

// ─── 메인 엔진 (SSE 스트림) ───

/** RAG 스트림 옵션 */
interface RAGStreamOptions {
  apiKey?: string
  signal?: AbortSignal
  conversationId?: string
  /** 프론트에서 이미 가진 조문 데이터 — 있으면 도구 호출 없이 즉답 */
  preEvidence?: string
}

// ─── Fast Path 공통 (Claude/Gemini 공유) ───

/**
 * Fast Path 처리. 단순 패턴은 LLM 없이 직접 도구 호출.
 * 처리됐으면 true, 아니면 false 반환.
 */
async function* handleFastPath(
  query: string,
  queryType: LegalQueryType,
  signal?: AbortSignal,
): AsyncGenerator<FCRAGStreamEvent, boolean> {
  const fastPath = detectFastPath(query)
  if (fastPath.type === 'none') return false

  // ── 패턴 A: 판례/해석례/행정규칙 검색 ──
  if (fastPath.type === 'precedent_search' || fastPath.type === 'interpretation_search' || fastPath.type === 'admin_rule_search') {
    const toolName = fastPath.toolName!
    const displayName = TOOL_DISPLAY_NAMES[toolName] || toolName
    yield { type: 'tool_call', name: toolName, displayName, query: fastPath.searchQuery }
    yield { type: 'status', message: '검색 중...', progress: 40 }
    const searchResult = await executeTool(toolName, { query: fastPath.searchQuery }, signal)
    yield { type: 'tool_result', name: toolName, displayName, success: !searchResult.isError, summary: summarizeToolResult(toolName, searchResult) }
    if (!searchResult.isError) {
      yield { type: 'status', message: '완료', progress: 100 }
      yield {
        type: 'answer',
        data: {
          answer: searchResult.result,
          citations: buildCitations([searchResult]),
          confidenceLevel: 'medium',
          complexity: 'simple',
          queryType,
        },
      }
      return true
    }
  }

  // ── 패턴 B: 별표 조회 ──
  if (fastPath.type === 'annex_resolve') {
    let mst = fastPath.mst
    if (!mst) {
      yield { type: 'tool_call', name: 'search_law', displayName: '법령 검색', query: fastPath.lawName }
      const searchResult = await executeTool('search_law', { query: fastPath.lawName }, signal)
      if (!searchResult.isError) {
        yield { type: 'tool_result', name: 'search_law', displayName: '법령 검색', success: true, summary: summarizeToolResult('search_law', searchResult) }
        const entries = parseLawEntries(searchResult.result)
        cacheMSTEntries(entries)
        mst = findBestMST(entries, query) || undefined
      }
    }
    if (mst) {
      yield { type: 'tool_call', name: 'get_annexes', displayName: '별표/서식 조회', query: fastPath.searchQuery }
      yield { type: 'status', message: '별표를 조회하고 있습니다...', progress: 50 }
      const annexResult = await executeTool('get_annexes', { lawName: fastPath.searchQuery }, signal)
      yield { type: 'tool_result', name: 'get_annexes', displayName: '별표/서식 조회', success: !annexResult.isError, summary: summarizeToolResult('get_annexes', annexResult) }
      if (!annexResult.isError) {
        yield { type: 'status', message: '완료', progress: 100 }
        yield {
          type: 'answer',
          data: {
            answer: annexResult.result,
            citations: buildCitations([annexResult]),
            confidenceLevel: 'high',
            complexity: 'simple',
            queryType,
          },
        }
        return true
      }
    }
  }

  // ── 패턴 C: 법명+조문번호 ──
  if (fastPath.type === 'article_hit' || fastPath.type === 'article_resolve') {
    let mst = fastPath.mst
    const articles = fastPath.articles!

    if (fastPath.type === 'article_resolve') {
      yield { type: 'tool_call', name: 'search_law', displayName: '법령 검색', query: fastPath.lawName }
      yield { type: 'status', message: `${fastPath.lawName} MST 확인 중...`, progress: 20 }
      const searchResult = await executeTool('search_law', { query: fastPath.lawName }, signal)
      if (searchResult.isError) {
        yield { type: 'tool_result', name: 'search_law', displayName: '법령 검색', success: false, summary: '검색 실패' }
      } else {
        yield { type: 'tool_result', name: 'search_law', displayName: '법령 검색', success: true, summary: summarizeToolResult('search_law', searchResult) }
        const entries = parseLawEntries(searchResult.result)
        cacheMSTEntries(entries)
        mst = findBestMST(entries, query) || undefined
      }
    }

    if (mst) {
      yield { type: 'tool_call', name: 'get_batch_articles', displayName: '조문 일괄 조회', query: articles.join(', ') }
      yield { type: 'status', message: '조문을 가져오고 있습니다...', progress: 50 }
      const articlesResult = await executeTool('get_batch_articles', { mst, articles }, signal)
      yield {
        type: 'tool_result', name: 'get_batch_articles', displayName: '조문 일괄 조회',
        success: !articlesResult.isError, summary: summarizeToolResult('get_batch_articles', articlesResult),
      }

      if (!articlesResult.isError) {
        yield { type: 'status', message: '완료', progress: 100 }
        yield {
          type: 'answer',
          data: {
            answer: articlesResult.result,
            citations: buildCitations([articlesResult]),
            confidenceLevel: 'high',
            complexity: 'simple',
            queryType,
          },
        }
        return true
      }
    }
  }

  // fast path 실패 → full pipeline으로 진행
  return false
}

// ─── Claude Primary 엔진 (CLI subprocess stream-json) ───

/**
 * Claude FC-RAG 스트리밍 실행 (Primary)
 * Claude CLI subprocess를 stream-json 모드로 spawn.
 * CLI가 korean-law MCP 도구를 네이티브로 호출, 중간 이벤트를 실시간 SSE로 전달.
 */
export async function* executeClaudeRAGStream(
  query: string,
  options?: RAGStreamOptions,
): AsyncGenerator<FCRAGStreamEvent> {
  const { signal, preEvidence, conversationId } = options || {}
  const warnings: string[] = []
  const complexity = inferComplexity(query)
  const queryType = inferQueryType(query)
  const complexityLabel = complexity === 'simple' ? '단순' : complexity === 'moderate' ? '보통' : '복합'

  yield { type: 'status', message: `질문 분석 완료 (${complexityLabel})`, progress: 8 }

  // ── 대화 컨텍스트 (follow-up 질의 시 이전 Q&A 참조) ──
  const prevContext = getConversationContext(conversationId)

  // ── preEvidence 있으면 fast-path 스킵 (이미 조문 데이터 있음) ──
  let collectedEvidence = preEvidence
  if (!collectedEvidence) {
    // ── Fast Path: LLM 없이 직접 도구 호출 ──
    const fastPathGen = handleFastPath(query, queryType, signal)
    let fastPathNext = await fastPathGen.next()
    while (!fastPathNext.done) {
      yield fastPathNext.value
      fastPathNext = await fastPathGen.next()
    }
    if (fastPathNext.value === true) return
  }

  // ── 분류기 기반 Pre-evidence 수집 ──
  // 복잡도 + queryType + domain 조합으로 최적 사전 수집 전략 결정.
  // LLM이 도구를 고르는 대신, 분류기가 먼저 핵심 데이터를 수집하여 Claude 턴 수 절감.
  if (!collectedEvidence) {
    const domain = detectDomain(query)
    const preResults: string[] = []

    if (complexity === 'simple') {
      // simple: search_ai_law 1회로 사전 수집 → Claude는 정리만
      yield { type: 'status', message: '관련 법령 사전 검색 중...', progress: 12 }
      const aiSearch = await executeTool('search_ai_law', { query }, signal)
      if (!aiSearch.isError && aiSearch.result.length > 200) {
        yield { type: 'tool_call', name: 'search_ai_law', displayName: TOOL_DISPLAY_NAMES['search_ai_law'], query }
        yield { type: 'tool_result', name: 'search_ai_law', displayName: TOOL_DISPLAY_NAMES['search_ai_law'], success: true, summary: summarizeToolResult('search_ai_law', aiSearch) }
        preResults.push(aiSearch.result)
      }
    } else if (complexity === 'moderate') {
      // moderate: search_ai_law + queryType별 보충 도구
      yield { type: 'status', message: '도메인별 법령 사전 수집 중...', progress: 12 }
      const aiSearch = await executeTool('search_ai_law', { query }, signal)
      if (!aiSearch.isError && aiSearch.result.length > 200) {
        yield { type: 'tool_call', name: 'search_ai_law', displayName: TOOL_DISPLAY_NAMES['search_ai_law'], query }
        yield { type: 'tool_result', name: 'search_ai_law', displayName: TOOL_DISPLAY_NAMES['search_ai_law'], success: true, summary: summarizeToolResult('search_ai_law', aiSearch) }
        preResults.push(aiSearch.result)

        // search_ai_law 결과에서 법명 추출 (쿼리가 아닌 실제 조회 결과 기반)
        const extractedLaw = aiSearch.result.match(/📜\s+(.+?)(?:\n|$)/)?.[1]?.trim()
          || query.match(/「([^」]+)」/)?.[1]
          || query.match(/([\w가-힣]+법)/)?.[1]

        // queryType별 보충 수집
        if (queryType === 'consequence' && extractedLaw) {
          // 벌칙 질문: 해당 법률의 벌칙편 추가 검색
          const penaltySearch = await executeTool('search_ai_law', { query: `${extractedLaw} 벌칙 과태료` }, signal)
          if (!penaltySearch.isError && penaltySearch.result.length > 100) {
            yield { type: 'tool_call', name: 'search_ai_law', displayName: '벌칙 조문 검색', query: `${extractedLaw} 벌칙` }
            yield { type: 'tool_result', name: 'search_ai_law', displayName: '벌칙 조문 검색', success: true, summary: summarizeToolResult('search_ai_law', penaltySearch) }
            preResults.push(penaltySearch.result)
          }
        } else if (queryType === 'scope' && extractedLaw) {
          // 금액/수치 질문: 별표 조회
          const annexSearch = await executeTool('get_annexes', { lawName: extractedLaw }, signal)
          if (!annexSearch.isError && annexSearch.result.length > 100) {
            yield { type: 'tool_call', name: 'get_annexes', displayName: '별표/서식 조회', query: extractedLaw }
            yield { type: 'tool_result', name: 'get_annexes', displayName: '별표/서식 조회', success: true, summary: summarizeToolResult('get_annexes', annexSearch) }
            preResults.push(annexSearch.result)
          }
        } else if (queryType === 'procedure') {
          // 절차 질문: 위임법령 구조 조회
          const lawName = extractedLaw || query.replace(/절차|방법|신청|어떻게/g, '').trim().slice(0, 20)
          const threeSearch = await executeTool('search_ai_law', { query: `${lawName} 절차 신청 서류` }, signal)
          if (!threeSearch.isError && threeSearch.result.length > 100) {
            preResults.push(threeSearch.result)
          }
        }
      }
    }
    // complex: 사전 수집 없이 Claude에게 풀 파이프라인 위임

    if (preResults.length > 0) {
      collectedEvidence = preResults.join('\n\n---\n\n')
    }
  }

  // ── Full Pipeline: Claude CLI stream-json 모드로 실시간 도구 호출 추적 ──
  const systemPrompt = buildSystemPrompt(complexity, queryType, query, false)

  yield { type: 'status', message: 'AI가 법령을 검색하고 있습니다...', progress: 15 }

  if (signal?.aborted) {
    yield { type: 'status', message: '검색이 취소되었습니다.', progress: 0 }
    return
  }

  try {
    // collectedEvidence가 있으면 조문 데이터를 user message에 주입
    const hasEvidence = !!collectedEvidence
    let userContent: string
    let maxTurns: number

    // 대화 컨텍스트 프리픽스
    const contextPrefix = prevContext
      ? `[이전 대화 맥락 — 사용자의 후속 질문임]\n${prevContext}\n\n---\n\n`
      : ''

    if (hasEvidence && complexity === 'simple') {
      userContent = `${contextPrefix}⚡ 빠른 답변 모드 — 관련 조문이 사전 수집됨.\n아래 데이터로 즉시 답변할 것. 추가 도구는 핵심 정보가 완전히 빠진 경우에만 최대 1회.\n"추가 조회 필요"만으로 끝내지 말고 반드시 실질 답변을 포함할 것.\n\n[사전 수집된 법령 데이터]\n${collectedEvidence}\n\n${query}`
      maxTurns = 5
    } else if (hasEvidence) {
      userContent = `${contextPrefix}📋 사전 검색 결과가 아래에 있음. 이를 참고하되, 부족한 부분은 추가 도구를 적극 호출하여 충분하고 상세한 답변을 생성할 것.\n\n[사전 검색 결과]\n${collectedEvidence}\n\n${query}`
      maxTurns = getMaxClaudeTurns(complexity)
    } else {
      userContent = `${contextPrefix}${query}`
      maxTurns = getMaxClaudeTurns(complexity)
    }

    const messages: DirectMessage[] = [{ role: 'user', content: userContent }]
    let toolCount = 0

    for await (const event of callAnthropicStream(systemPrompt, messages, { signal, maxTurns })) {
      if (signal?.aborted) {
        yield { type: 'status', message: '검색이 취소되었습니다.', progress: 0 }
        return
      }

      if (event.type === 'tool_call') {
        // Claude CLI 내부 도구 (ToolSearch 등) 필터링 — 법령 도구만 SSE 전달
        if (!TOOL_DISPLAY_NAMES[event.name]) continue
        toolCount++
        const progress = Math.min(15 + toolCount * 10, 85)
        yield { type: 'status', message: `법령 도구 호출 중 (${toolCount})...`, progress }
        yield {
          type: 'tool_call',
          name: event.name,
          displayName: TOOL_DISPLAY_NAMES[event.name],
          query: getToolCallQuery(event.name, event.input),
        }
      } else if (event.type === 'tool_result') {
        // Claude CLI 내부 도구 결과 필터링
        if (!TOOL_DISPLAY_NAMES[event.name]) continue
        const summary = summarizeToolResult(event.name, {
          name: event.name, result: event.content, isError: event.isError,
        })
        yield {
          type: 'tool_result',
          name: event.name,
          displayName: TOOL_DISPLAY_NAMES[event.name],
          success: !event.isError,
          summary,
        }
      } else if (event.type === 'text') {
        // Claude CLI의 텍스트 출력을 실시간 answer_token으로 전달
        yield { type: 'answer_token', data: { text: event.text } }
      } else if (event.type === 'result') {
        const answer = event.text?.trim()
        if (!answer || answer.length < 10) {
          throw new Error('Claude 응답이 비어있습니다.')
        }

        // 메타 답변 감지: 실질 내용 없는 짧은 응답 → 에러로 전환하여 Gemini 폴백 유도
        // 1) 100자 미만은 무조건 메타 답변 (실질적 법률 답변은 최소 100자 이상)
        // 2) 150자 미만 + "추가 조회/확인하겠" 패턴
        const isMetaAnswer = answer.length < 100 ||
          (answer.length < 150 && /추가\s*조회|추가.*필요|부족|확인되지\s*않|수집.*없|확인하겠|조회하겠|검색하겠/.test(answer))
        if (isMetaAnswer) {
          throw new Error(`메타 답변 감지 (${answer.length}ch) — 실질 답변 없음`)
        }

        yield {
          type: 'token_usage',
          inputTokens: event.usage.inputTokens,
          outputTokens: event.usage.outputTokens,
          totalTokens: event.usage.inputTokens + event.usage.outputTokens,
        }
        yield { type: 'status', message: '답변을 정리하고 있습니다...', progress: 92 }
        // 대화 컨텍스트 저장
        storeConversation(conversationId, query, answer)

        yield {
          type: 'answer',
          data: {
            answer,
            citations: parseCitationsFromAnswer(answer),
            confidenceLevel: 'high' as const,
            complexity,
            queryType,
            isTruncated: event.stopReason === 'max_tokens',
            warnings: warnings.length > 0 ? warnings : undefined,
          },
        }
        return
      }
    }

    // 스트림 완료 후 result 이벤트가 없었던 경우
    throw new Error('Claude CLI 스트림에서 결과를 받지 못했습니다.')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warnings.push(`Claude 오류: ${message}`)
    yield { type: 'error', message }
    // route.ts가 claudeHadError 시 answer를 삼키고 Gemini 폴백하므로, 여기서 answer를 보내지 않음
  }
}

// ─── Gemini Fallback 엔진 ───

/**
 * Gemini FC-RAG 스트리밍 실행 (Fallback)
 * Claude 불능 시 Gemini Flash로 대체
 */
export async function* executeGeminiRAGStream(
  query: string,
  options?: RAGStreamOptions
): AsyncGenerator<FCRAGStreamEvent> {
  const { apiKey: geminiApiKey, signal, preEvidence, conversationId } = options || {}
  const warnings: string[] = []
  const complexity = inferComplexity(query)
  const queryType = inferQueryType(query)
  const maxToolTurns = getMaxToolTurns(complexity)
  const complexityLabel = complexity === 'simple' ? '단순' : complexity === 'moderate' ? '보통' : '복합'

  yield { type: 'status', message: `질문 분석 완료 (${complexityLabel})`, progress: 8 }

  // ── 대화 컨텍스트 ──
  const prevContext = getConversationContext(conversationId)

  // ── preEvidence 있으면 fast-path 스킵 ──
  let geminiEvidence = preEvidence
  if (!geminiEvidence) {
    // ── Fast Path ──
    const fastPathGen = handleFastPath(query, queryType, signal)
    let fastPathNext = await fastPathGen.next()
    while (!fastPathNext.done) {
      yield fastPathNext.value
      fastPathNext = await fastPathGen.next()
    }
    if (fastPathNext.value === true) return
  }

  // ── 분류기 기반 Pre-evidence (Gemini도 동일 전략) ──
  if (!geminiEvidence && (complexity === 'simple' || complexity === 'moderate')) {
    yield { type: 'status', message: '관련 법령 사전 검색 중...', progress: 12 }
    const aiSearch = await executeTool('search_ai_law', { query }, signal)
    if (!aiSearch.isError && aiSearch.result.length > 200) {
      yield { type: 'tool_call', name: 'search_ai_law', displayName: TOOL_DISPLAY_NAMES['search_ai_law'], query }
      yield { type: 'tool_result', name: 'search_ai_law', displayName: TOOL_DISPLAY_NAMES['search_ai_law'], success: true, summary: summarizeToolResult('search_ai_law', aiSearch) }
      geminiEvidence = aiSearch.result
    }
  }

  // ── Full Pipeline: Gemini 멀티턴 ──
  const effectiveKey = geminiApiKey || process.env.GEMINI_API_KEY
  if (!effectiveKey) {
    yield { type: 'error', message: 'Gemini API 키가 설정되지 않았습니다.' }
    yield {
      type: 'answer',
      data: {
        answer: '죄송합니다. AI 엔진이 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
        citations: [],
        confidenceLevel: 'low' as const,
        complexity,
        queryType,
        warnings: ['Gemini API 키 미설정'],
      },
    }
    return
  }

  const systemPrompt = buildSystemPrompt(complexity, queryType, query, true /* isGemini */)
  const ai = new GoogleGenAI({ apiKey: effectiveKey })
  const selectedTools = new Set(selectToolsForQuery(query))
  const toolDeclarations = getToolDeclarations().filter(d => selectedTools.has(d.name!))

  // geminiEvidence + 대화 컨텍스트
  const contextPrefix = prevContext ? `[이전 대화 맥락]\n${prevContext}\n\n---\n\n` : ''
  const userText = geminiEvidence
    ? `${contextPrefix}⚡ 빠른 답변 모드 — 필요한 조문이 이미 수집됨.\n규칙: 아래 데이터만으로 답변 가능하면 추가 도구 호출하지 말 것. 부족한 경우에만 최소한 추가 사용.\n\n[사전 수집된 법령 데이터]\n${geminiEvidence}\n\n${query}`
    : `${contextPrefix}${query}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: Array<{ role: 'user' | 'model'; parts: any[] }> = [
    { role: 'user', parts: [{ text: userText }] },
  ]

  let allToolResults: ToolCallResult[] = []
  const MAX_TOOL_RESULTS = 30
  let turnCount = 0
  let latestSearchEntries: LawEntry[] = []
  const failureCount = new Map<string, number>()
  let totalInputTokens = 0
  let totalOutputTokens = 0
  // Chain 도구가 호출되면 커버하는 TIER_0 도구를 이후 턴에서 제외
  const chainCoveredTools = new Set<string>()
  let geminiAnswerYielded = false  // 루프 내에서 answer를 yield했는지 추적

  // 프로그레스: 8% → 88% 범위를 턴 수에 따라 분배
  const progressRange = 80
  const progressPerTurn = progressRange / (maxToolTurns + 1)
  let currentProgress = 8

  while (turnCount <= maxToolTurns) {
    try {
      const isLastTurn = turnCount === maxToolTurns

      // LLM 요청 중
      currentProgress = Math.min(8 + (turnCount * progressPerTurn), 85)
      yield { type: 'status', message: 'AI가 분석하고 있습니다...', progress: currentProgress }

      const activeDeclarations = toolDeclarations.filter(
        d => (failureCount.get(d.name!) || 0) < 2 && !chainCoveredTools.has(d.name!)
      )

      // 클라이언트 취소 시 조기 종료
      if (signal?.aborted) {
        yield { type: 'status', message: '검색이 취소되었습니다.', progress: 0 }
        return
      }

      // ── Gemini 스트리밍: 텍스트 답변을 실시간 answer_token으로 전달 ──
      const stream = await withTimeout(
        ai.models.generateContentStream({
          model: MODEL,
          contents: messages,
          config: {
            systemInstruction: systemPrompt,
            tools: [{ functionDeclarations: activeDeclarations }],
            temperature: 0,
            maxOutputTokens: MAX_TOKENS[complexity],
          },
        }),
        GEMINI_TIMEOUT[complexity],
        'Gemini API',
      )

      // 스트림에서 파트 누적 + 텍스트 실시간 전달
      const accParts: GeminiPart[] = []
      let accFinishReason: string | undefined
      let accUsage: { promptTokenCount?: number; candidatesTokenCount?: number } | undefined
      let hasFunctionCall = false

      for await (const chunk of stream) {
        if (signal?.aborted) break
        const chunkCandidate = chunk.candidates?.[0]
        if (chunkCandidate?.finishReason) accFinishReason = chunkCandidate.finishReason
        const chunkUsage = (chunk as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata
        if (chunkUsage) accUsage = chunkUsage

        if (chunkCandidate?.content?.parts) {
          for (const part of chunkCandidate.content.parts as GeminiPart[]) {
            accParts.push(part)
            if (part.functionCall) hasFunctionCall = true
            // 실시간 텍스트 스트리밍 (도구 호출이 없는 턴에서만)
            if (part.text && !hasFunctionCall) {
              yield { type: 'answer_token', data: { text: part.text } }
            }
          }
        }
      }

      // 토큰 사용량 추적
      if (accUsage) {
        totalInputTokens += accUsage.promptTokenCount || 0
        totalOutputTokens += accUsage.candidatesTokenCount || 0
        yield { type: 'token_usage', inputTokens: totalInputTokens, outputTokens: totalOutputTokens, totalTokens: totalInputTokens + totalOutputTokens }
      }

      if (accParts.length === 0) {
        warnings.push('Gemini 응답이 비어있습니다.')
        break
      }

      const parts = accParts
      const functionCalls = parts.filter((p: GeminiPart) => p.functionCall)

      // 텍스트 답변 (도구 호출 없음) → 품질 평가 후 완료
      if (functionCalls.length === 0) {
        const answer = parts.filter((p: GeminiPart) => p.text).map((p: GeminiPart) => p.text).join('')
        // 품질 평가 (Gemini 할루시네이션 감지)
        const quality = evaluateResponseQuality(allToolResults, answer)
        if (quality.warnings.length > 0) warnings.push(...quality.warnings)
        const confidence = quality.level === 'fail' ? 'low' as const
          : quality.level === 'marginal' ? 'medium' as const
          : calcConfidence(allToolResults)
        yield { type: 'status', message: '답변을 정리하고 있습니다...', progress: 92 }
        yield {
          type: 'answer',
          data: {
            answer,
            citations: buildCitations(allToolResults, answer),
            confidenceLevel: confidence,
            complexity,
            queryType,
            isTruncated: accFinishReason === 'MAX_TOKENS',
            warnings: warnings.length > 0 ? warnings : undefined,
          },
        }
        return
      }

      // 마지막 턴: 도구 호출 무시, 텍스트 답변 강제
      if (isLastTurn) {
        const textParts = parts.filter((p: GeminiPart) => p.text)
        if (textParts.length > 0) {
          // 스트리밍에서 이미 answer_token을 전달했으므로 최종 answer만 emit
          const answer = textParts.map((p: GeminiPart) => p.text).join('')
          yield { type: 'status', message: '답변을 정리하고 있습니다...', progress: 92 }
          yield {
            type: 'answer',
            data: {
              answer,
              citations: buildCitations(allToolResults, answer),
              confidenceLevel: calcConfidence(allToolResults),
              complexity,
              queryType,
              isTruncated: accFinishReason === 'MAX_TOKENS',
              warnings: warnings.length > 0 ? warnings : undefined,
            },
          }
          return
        }
        if (signal?.aborted) return
        yield { type: 'status', message: '답변 생성을 요청하고 있습니다...', progress: 88 }
        messages.push({ role: 'model', parts })
        messages.push({
          role: 'user',
          parts: [{ text: '수집된 정보를 바탕으로 한국어로 답변해주세요. 추가 도구 호출 없이 바로 답변하세요.' }],
        })
        // 마지막 턴 재시도도 스트리밍으로 실시간 답변 표시
        const retryStream = await withTimeout(
          ai.models.generateContentStream({
            model: MODEL,
            contents: messages,
            config: { systemInstruction: systemPrompt, temperature: 0, maxOutputTokens: MAX_TOKENS[complexity] },
          }),
          GEMINI_TIMEOUT[complexity],
          'Gemini API (마지막 턴)',
        )
        let retryText = ''
        let retryFinishReason: string | undefined
        let retryUsage: { promptTokenCount?: number; candidatesTokenCount?: number } | undefined

        for await (const chunk of retryStream) {
          if (signal?.aborted) break
          const retryCandidate = chunk.candidates?.[0]
          if (retryCandidate?.finishReason) retryFinishReason = retryCandidate.finishReason
          const chunkUsage = (chunk as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata
          if (chunkUsage) retryUsage = chunkUsage

          if (retryCandidate?.content?.parts) {
            for (const part of retryCandidate.content.parts as GeminiPart[]) {
              if (part.text) {
                retryText += part.text
                yield { type: 'answer_token', data: { text: part.text } }
              }
            }
          }
        }

        if (retryUsage) {
          totalInputTokens += retryUsage.promptTokenCount || 0
          totalOutputTokens += retryUsage.candidatesTokenCount || 0
          yield { type: 'token_usage', inputTokens: totalInputTokens, outputTokens: totalOutputTokens, totalTokens: totalInputTokens + totalOutputTokens }
        }
        yield {
          type: 'answer',
          data: {
            answer: retryText || '답변 생성에 실패했습니다.',
            citations: buildCitations(allToolResults, retryText),
            confidenceLevel: calcConfidence(allToolResults),
            complexity,
            queryType,
            isTruncated: retryFinishReason === 'MAX_TOKENS',
            warnings: warnings.length > 0 ? warnings : undefined,
          },
        }
        return
      }

      // ── Function Call 실행 ──
      const calls = functionCalls.map((p: GeminiPart) => ({
        name: (p.functionCall!.name || '') as string,
        args: (p.functionCall!.args || {}) as Record<string, unknown>,
      }))

      // MST 보정 (unknown MST면 search_law 자동 호출)
      const fallbackEvents: FCRAGStreamEvent[] = []
      await correctToolArgs(calls, latestSearchEntries, query, (entries, searchResult) => {
        // fallback search_law 호출을 SSE로 알림
        fallbackEvents.push({
          type: 'tool_call', name: 'search_law',
          displayName: '법령 검색 (MST 자동 확인)',
          query: entries[0]?.name,
        })
        fallbackEvents.push({
          type: 'tool_result', name: 'search_law',
          displayName: '법령 검색 (MST 자동 확인)',
          success: true,
          summary: summarizeToolResult('search_law', searchResult),
        })
        allToolResults.push(searchResult)
      })

      // fallback 이벤트 전송
      for (const evt of fallbackEvents) yield evt

      // 도구 호출 이벤트
      for (const call of calls) {
        yield {
          type: 'tool_call',
          name: call.name,
          displayName: TOOL_DISPLAY_NAMES[call.name] || call.name,
          query: getToolCallQuery(call.name, call.args),
        }
      }

      const results = await executeToolsParallel(calls, signal)

      // ── Context Precision 향상: search_ai_law 결과를 쿼리 관련성 기준으로 재정렬 ──
      for (const r of results) {
        if (r.name === 'search_ai_law' && !r.isError) {
          r.result = rerankAiSearchResult(r.result, query)
        }
      }

      allToolResults.push(...results)

      // 메모리 누수 방지: 에러 결과 우선 제거하여 제한 유지
      while (allToolResults.length > MAX_TOOL_RESULTS) {
        const errIdx = allToolResults.findIndex(r => r.isError)
        allToolResults.splice(errIdx >= 0 ? errIdx : 0, 1)
      }

      currentProgress = Math.min(8 + ((turnCount + 0.5) * progressPerTurn), 85)

      // 도구 결과 이벤트
      for (const r of results) {
        yield {
          type: 'tool_result',
          name: r.name,
          displayName: TOOL_DISPLAY_NAMES[r.name] || r.name,
          success: !r.isError,
          summary: summarizeToolResult(r.name, r),
        }
        if (r.isError) failureCount.set(r.name, (failureCount.get(r.name) || 0) + 1)
        else failureCount.delete(r.name)
      }

      // search_law 결과 추적 (MST 보정 + KNOWN_MST 캐시 축적)
      for (const r of results) {
        if (r.name === 'search_law' && !r.isError) {
          latestSearchEntries = parseLawEntries(r.result)
          cacheMSTEntries(latestSearchEntries)
        }
      }

      // Chain 도구 호출 감지 → 이후 턴에서 커버되는 도구 제외 (중복 호출 방지)
      for (const call of calls) {
        if (CHAIN_COVERS[call.name]) {
          for (const covered of CHAIN_COVERS[call.name]) {
            chainCoveredTools.add(covered)
          }
        }
      }

      // ── Auto-chain (검색→상세 자동 연결, 법령 조문은 Gemini에게 위임) ──
      const autoChains: Array<{ name: string; args: Record<string, unknown> }> = []

      // search_law → get_law_text 전체 fetch 제거됨
      // Gemini가 search_law/search_ai_law 결과를 보고 get_batch_articles/get_law_text(jo지정)를 직접 호출

      const searchOK = results.filter(r => r.name === 'search_law' && !r.isError)

      // Auto-chain: search_precedents 0건 시 키워드 단순화 재검색
      const precedentSearches = results.filter(r => r.name === 'search_precedents' && !r.isError)
      if (precedentSearches.length > 0) {
        const hasResults = precedentSearches.some(r => /총 [1-9]\d*건/.test(r.result))
        if (!hasResults) {
          const precStopWords = /(?:은|는|이|가|을|를|에|의|로|으로|와|과|에서|한|하는|대한|무엇|어떤|어떻게|경우|관련|대해|할|수|있|되|것|법|조|항|호)$/
          const coreKeywords = query
            .replace(/[「」]/g, '')
            .replace(/제\d+조(?:의\d+)?/g, '')
            .split(/\s+/)
            .map(w => w.replace(precStopWords, ''))
            .filter(w => w.length >= 2)
            .slice(0, 3)
          if (coreKeywords.length >= 2) {
            autoChains.push({ name: 'search_precedents', args: { query: coreKeywords.join(' ') } })
          }
        }
      }

      // Auto-chain: 조문 결과에서 "별표" 참조 감지 → get_annexes 자동 호출
      const alreadyGotAnnexes = results.some(r => r.name === 'get_annexes')
      if (!alreadyGotAnnexes) {
        const annexSources = results.filter(r =>
          (r.name === 'search_ai_law' || r.name === 'get_batch_articles' || r.name === 'get_law_text') && !r.isError
        )
        for (const src of annexSources) {
          const annexMatch = src.result.match(/(?:별표|부표|별지)\s*(?:제?\s*)?(\d+)/)
          if (annexMatch) {
            const lawNameMatch = src.result.match(/(?:📜\s+|법령명:\s*)(.+?)(?:\n|$)/)
            const lawName = lawNameMatch?.[1]?.trim()
            if (lawName) {
              autoChains.push({ name: 'get_annexes', args: { lawName: `${lawName} 별표${annexMatch[1]}` } })
              break
            }
          }
        }
      }

      const interpSearchOK = results.filter(r => r.name === 'search_interpretations' && !r.isError)
      const alreadyGotInterpText = results.some(r => r.name === 'get_interpretation_text')
      if (interpSearchOK.length > 0 && !alreadyGotInterpText) {
        const idMatch = interpSearchOK[0].result.match(/(?:ID|id)[:\s]+(\S+)/)
        if (idMatch) autoChains.push({ name: 'get_interpretation_text', args: { id: idMatch[1] } })
      }

      // 자치법규 auto-chain: search_ordinance → get_ordinance (가장 관련 높은 결과 선택)
      const ordinSearchOK = results.filter(r => r.name === 'search_ordinance' && !r.isError)
      const alreadyGotOrdinance = results.some(r => r.name === 'get_ordinance')
      if (ordinSearchOK.length > 0 && !alreadyGotOrdinance) {
        const bestSeq = findBestOrdinanceSeq(ordinSearchOK[0].result, query)
        if (bestSeq) autoChains.push({ name: 'get_ordinance', args: { ordinSeq: bestSeq } })
      }

      const alreadyCompared = results.some(r => r.name === 'compare_old_new')
      if (searchOK.length > 0 && !alreadyCompared && /(?:개정|변경|바뀐|신구|대조)/.test(query)) {
        const bestMST = findBestMST(latestSearchEntries, query)
        if (bestMST) autoChains.push({ name: 'compare_old_new', args: { mst: bestMST } })
      }

      // Auto-chain 병렬 실행 (독립적인 호출이므로 동시 처리 → 시간 절약)
      if (autoChains.length > 0) {
        for (const chain of autoChains) {
          yield {
            type: 'tool_call',
            name: chain.name,
            displayName: TOOL_DISPLAY_NAMES[chain.name] || chain.name,
            query: getToolCallQuery(chain.name, chain.args),
          }
        }

        const autoResults = await executeToolsParallel(autoChains, signal)

        for (const autoResult of autoResults) {
          allToolResults.push(autoResult)
          yield {
            type: 'tool_result',
            name: autoResult.name,
            displayName: TOOL_DISPLAY_NAMES[autoResult.name] || autoResult.name,
            success: !autoResult.isError,
            summary: summarizeToolResult(autoResult.name, autoResult),
          }
          results.push(autoResult)
        }
      }

      // 에러 경고
      const errors = results.filter(r => r.isError)
      if (errors.length > 0) {
        warnings.push(...errors.map(e => `도구 오류 (${e.name}): ${e.result.slice(0, 100)}`))
      }

      // 히스토리 추가 — auto-chain은 functionCall로 위장하지 않고 텍스트로 보충
      // (Gemini 2.5 Flash의 thought_signature 요구사항 호환)
      messages.push({ role: 'model', parts })
      const responseParts: any[] = results.slice(0, results.length - autoChains.length).map(r => ({
        functionResponse: { name: r.name, response: { result: r.result } },
      }))
      // auto-chain 결과는 보충 텍스트로 추가 (thought_signature 필요 없음)
      if (autoChains.length > 0) {
        const autoTexts = results.slice(results.length - autoChains.length)
          .map(r => `[보충 조회: ${TOOL_DISPLAY_NAMES[r.name] || r.name}]\n${r.result}`)
          .join('\n\n')
        responseParts.push({ text: autoTexts })
      }
      messages.push({ role: 'user', parts: responseParts })

      turnCount++
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      warnings.push(`Gemini API 오류: ${message}`)
      yield { type: 'error', message }
      break
    }
  }

  // 루프 종료 (에러/예외) — route.ts의 geminiAnswerSent 안전장치와 중복 방지
  if (turnCount > maxToolTurns) {
    warnings.push('도구 호출 횟수 제한에 도달했습니다.')
  }
  // route.ts가 geminiAnswerSent=false 시 별도 안전장치 answer를 보내므로,
  // 여기서는 error 이벤트만 보내고 answer는 route.ts에 위임
}

// ─── 하위 호환 래퍼 ───

/** @deprecated route.ts에서 직접 executeClaudeRAGStream/executeGeminiRAGStream 사용 */
export const executeRAGStream = executeGeminiRAGStream

/**
 * FC-RAG 실행 (비스트리밍 버전)
 * Claude 우선, 실패 시 Gemini fallback
 */
export async function executeRAG(
  query: string,
  geminiApiKey?: string
): Promise<FCRAGResult> {
  // Claude 우선
  try {
    for await (const event of executeClaudeRAGStream(query)) {
      if (event.type === 'answer') return event.data
      if (event.type === 'error') throw new Error(event.message)
    }
  } catch {
    // Claude 실패 → Gemini fallback
  }
  for await (const event of executeGeminiRAGStream(query, { apiKey: geminiApiKey })) {
    if (event.type === 'answer') return event.data
    if (event.type === 'error') throw new Error(event.message)
  }
  throw new Error('답변이 생성되지 않았습니다.')
}

// ─── 유틸 ───

function inferComplexity(query: string): QueryComplexity {
  const lawMatches = query.match(/「([^」]+)」/g) || []
  const articleMatches = query.match(/제\d+조(?:의\d+)?/g) || []

  const complexPatterns = /(?:하고|와\s*함께|판례|전후\s*비교|비교해|변경.{0,5}판례|개정.{0,5}판례)/
  // 벌칙/처벌/과태료: 본문+벌칙편 양쪽 조회 필요 → moderate 이상
  const moderatePatterns = /(?:위임|시행령|시행규칙|해석례|유권해석|이력|변경|개정|바뀐|신구|대조|절차|방법|벌칙|처벌|과태료|벌금|영업정지|허가취소|감면|면제|비과세|특례|요건)/

  // 요구 자료 종류 수: 판례+해석례+조문+별표 등 다양한 자료 요구 시 complex
  const sourceTypes = [
    /판례|판결/.test(query),
    /해석례|유권해석|질의회신/.test(query),
    /별표|서식|부표/.test(query),
    /조례|자치법규/.test(query),
    /비교|대조|신구/.test(query),
  ].filter(Boolean).length

  if (lawMatches.length > 1 || articleMatches.length > 2 || query.length > 100
    || complexPatterns.test(query) || sourceTypes >= 2) {
    return 'complex'
  }
  if (query.length > 50 || articleMatches.length > 0 || moderatePatterns.test(query) || sourceTypes >= 1) {
    return 'moderate'
  }
  return 'simple'
}

/** @internal 테스트용 export */
export function inferQueryType(query: string): LegalQueryType {
  // ── 복합 의도 사전 감지 (순차 매칭 전 오버라이드) ──
  // "형사처벌과 행정처분 차이" → 비교 질문이지 벌칙 질문이 아님
  if (/(?:차이|비교|vs|대비|장단점|구분|구별)/.test(query) && /(?:처벌|벌금|과태료|제재|형사|행정처분)/.test(query)) return 'comparison'
  // "과태료 얼마", "벌금 금액", "과태료 한도" → 금액 질문이지 불이익 질문이 아님
  if (/(?:과태료|벌금|범칙금|과징금).{0,8}(?:얼마|금액|한도|상한|세율|별표|기준액)/.test(query)) return 'scope'
  if (/(?:얼마|금액|한도|상한|세율|별표|기준액).{0,8}(?:과태료|벌금|범칙금|과징금)/.test(query)) return 'scope'
  // "수당 얼마", "사례금 상한" → scope
  if (/(?:수당|사례금|강의료|보상비|급여).{0,8}(?:얼마|금액|한도|상한|기준액|별표)/.test(query)) return 'scope'
  if (/(?:얼마|금액|한도|상한|기준액|별표).{0,8}(?:수당|사례금|강의료|보상비|급여)/.test(query)) return 'scope'

  // 좁은 패턴(consequence, exemption) 우선, 넓은 범용 패턴(알려줘/설명) 마지막
  const patterns: [RegExp, LegalQueryType][] = [
    [/(?:면제|감면|특례|예외|비과세|영세율|감경)/,                     'exemption'],
    [/(?:벌칙|과태료|처벌|위반|제재|벌금|징역|형사|영업정지|허가취소|과징금|불이익)/, 'consequence'],
    [/(?:절차|방법|신청|신고|등록|제출|처리|납부|환급|경정청구|어떻게|순서|과정|단계)/, 'procedure'],
    [/(?:비교|차이|구별|구분|다른\s*점|vs|대비|장단점)/,               'comparison'],
    [/(?:요건|조건|자격|충족|해당.*경우|갖추|필요.*서류|하려면)/,        'requirement'],
    [/(?:범위|적용.*범위|해당.*대상|포함|제외.*범위|얼마|세율|금액|기한|산정|계산|수당|사례금|강의료|한도|상한|기준액)/, 'scope'],
    [/(?:정의|뜻|의미|개념|무엇|이란\??$)/,                           'definition'],
    [/(?:적용|해당|판단|가능|여부|할\s*수)/,                          'application'],
    [/(?:알려|궁금|설명|내용|전반|개요|현황|주요|핵심|요약|정리)/,       'definition'],
  ]
  for (const [pattern, type] of patterns) {
    if (pattern.test(query)) return type
  }
  return 'application'
}

