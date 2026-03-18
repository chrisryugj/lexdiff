/**
 * FC-RAG Engine - Function Calling 기반 RAG 엔진
 *
 * korean-law-mcp 도구를 LLM Function Calling으로 호출하여
 * 법제처 API 실시간 데이터 기반 답변 생성.
 *
 * ── LLM 구성 ──
 * Primary : Sonnet 4.6 (Claude) — Anthropic SDK + OpenClaw OAuth 토큰
 * Fallback: Gemini Flash — Claude 불능 시 이 엔진이 직접 Gemini 호출
 *
 * 도구 어댑터(tool-adapter), Tier 시스템(tool-tiers), 프롬프트(prompts)는
 * 양쪽 LLM이 공유하는 인프라.
 *
 * SSE 스트리밍 지원: executeClaudeRAGStream() / executeGeminiRAGStream()
 */

import { GoogleGenAI, type Part } from '@google/genai'
import { getToolDeclarations, getAnthropicToolDefinitions, executeTool, executeToolsParallel, type ToolCallResult } from './tool-adapter'
import { buildSystemPrompt, type LegalQueryType } from './prompts'
import { TOOL_DISPLAY_NAMES, selectToolsForQuery } from './tool-tiers'
import { KNOWN_MST, cacheMSTEntries, detectFastPath, parseLawEntries, findBestMST, findBestOrdinanceSeq, type LawEntry } from './fast-path'
import { buildCitations, calcConfidence } from './citations'
import { summarizeToolResult, getToolCallQuery, correctToolArgs, rerankAiSearchResult } from './result-utils'
import { evaluateResponseQuality } from './quality-evaluator'
import { callAnthropic, type DirectMessage } from './anthropic-client'

type QueryComplexity = 'simple' | 'moderate' | 'complex'

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
  warnings?: string[]
}

// ─── SSE 스트림 이벤트 타입 ───

export type FCRAGStreamEvent =
  | { type: 'status'; message: string; progress: number }
  | { type: 'tool_call'; name: string; displayName: string; query?: string }
  | { type: 'tool_result'; name: string; displayName: string; success: boolean; summary: string }
  | { type: 'token_usage'; inputTokens: number; outputTokens: number; totalTokens: number }
  | { type: 'answer'; data: FCRAGResult }
  | { type: 'error'; message: string }

// ─── 설정 ───

const MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview'

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

/** complexity 기반 최대 도구 턴 수 */
function getMaxToolTurns(complexity: QueryComplexity): number {
  switch (complexity) {
    case 'simple': return 2
    case 'moderate': return 3
    case 'complex': return 4
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

// ─── Claude Primary 엔진 (OpenClaw Gateway 경유) ───

/**
 * Claude FC-RAG 스트리밍 실행 (Primary)
 * OpenClaw Gateway /v1/chat/completions 호출.
 * Gateway 에이전트가 korean-law MCP 도구를 내부적으로 처리.
 */
export async function* executeClaudeRAGStream(
  query: string,
  options?: RAGStreamOptions,
): AsyncGenerator<FCRAGStreamEvent> {
  const { signal } = options || {}
  const warnings: string[] = []
  const complexity = inferComplexity(query)
  const queryType = inferQueryType(query)
  const complexityLabel = complexity === 'simple' ? '단순' : complexity === 'moderate' ? '보통' : '복합'

  yield { type: 'status', message: `질문 분석 완료 (${complexityLabel})`, progress: 8 }

  // ── Fast Path: LLM 없이 직접 도구 호출 ──
  const fastPathGen = handleFastPath(query, queryType, signal)
  let fastPathNext = await fastPathGen.next()
  while (!fastPathNext.done) {
    yield fastPathNext.value
    fastPathNext = await fastPathGen.next()
  }
  if (fastPathNext.value === true) return

  // ── Full Pipeline: Anthropic SDK 직접 호출 + tool_use 멀티턴 ──
  const systemPrompt = buildSystemPrompt(complexity, queryType, query, false)

  yield { type: 'status', message: 'AI가 법령을 검색하고 있습니다...', progress: 15 }

  if (signal?.aborted) {
    yield { type: 'status', message: '검색이 취소되었습니다.', progress: 0 }
    return
  }

  const maxToolTurnsClaude = getMaxToolTurns(complexity)
  const anthropicTools = getAnthropicToolDefinitions()
  const allToolResults: ToolCallResult[] = []
  let totalInput = 0
  let totalOutput = 0

  try {
    const messages: DirectMessage[] = [
      { role: 'user', content: query },
    ]

    for (let turn = 0; turn < maxToolTurnsClaude; turn++) {
      if (signal?.aborted) break

      const response = await callAnthropic(systemPrompt, messages, {
        maxTokens: MAX_TOKENS[complexity],
        temperature: 0,
        tools: anthropicTools,
        signal,
      })

      totalInput += response.usage.inputTokens
      totalOutput += response.usage.outputTokens

      // 텍스트 블록 추출
      const textBlocks = response.content.filter(b => b.type === 'text')
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use')

      // tool_use가 없으면 최종 답변
      if (toolUseBlocks.length === 0 || response.stopReason === 'end_turn') {
        const answer = textBlocks.map(b => 'text' in b ? b.text : '').join('\n').trim()

        if (!answer || answer.length < 10) {
          throw new Error('Claude 응답이 비어있습니다.')
        }

        const quality = evaluateResponseQuality(allToolResults, answer)
        if (quality.warnings.length > 0) warnings.push(...quality.warnings)

        yield { type: 'token_usage', inputTokens: totalInput, outputTokens: totalOutput, totalTokens: totalInput + totalOutput }
        yield { type: 'status', message: '답변을 정리하고 있습니다...', progress: 92 }
        yield {
          type: 'answer',
          data: {
            answer,
            citations: buildCitations(allToolResults, answer),
            confidenceLevel: quality.level === 'fail' ? 'low' : quality.level === 'pass' ? 'high' : 'medium',
            complexity,
            queryType,
            warnings: warnings.length > 0 ? warnings : undefined,
          },
        }
        return
      }

      // tool_use 처리: 도구 실행 후 결과를 assistant → user 메시지로 추가
      messages.push({ role: 'assistant', content: response.content as any })

      const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = []

      for (const block of toolUseBlocks) {
        if (block.type !== 'tool_use') continue
        const displayName = TOOL_DISPLAY_NAMES[block.name] || block.name
        yield { type: 'tool_call', name: block.name, displayName, query: getToolCallQuery(block.name, block.input as Record<string, unknown>) }

        try {
          const result = await executeTool(block.name, block.input as Record<string, unknown>, signal)
          allToolResults.push(result)
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: summarizeToolResult(block.name, result) })
          yield { type: 'tool_result', name: block.name, displayName, success: !result.isError, summary: result.result.substring(0, 200) }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: `오류: ${errMsg}` })
          yield { type: 'tool_result', name: block.name, displayName, success: false, summary: errMsg }
        }
      }

      messages.push({ role: 'user', content: toolResults as any })
    }

    // 턴 초과 — 마지막 응답을 그대로 사용
    throw new Error('도구 호출 턴 초과')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warnings.push(`Claude 오류: ${message}`)
    yield { type: 'error', message }
    yield {
      type: 'answer',
      data: {
        answer: '죄송합니다. 답변을 생성하는 중 오류가 발생했습니다. 다시 시도해주세요.',
        citations: [],
        confidenceLevel: 'low',
        complexity,
        queryType,
        warnings,
      },
    }
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
  const { apiKey: geminiApiKey, signal } = options || {}
  const warnings: string[] = []
  const complexity = inferComplexity(query)
  const queryType = inferQueryType(query)
  const maxToolTurns = getMaxToolTurns(complexity)
  const complexityLabel = complexity === 'simple' ? '단순' : complexity === 'moderate' ? '보통' : '복합'

  yield { type: 'status', message: `질문 분석 완료 (${complexityLabel})`, progress: 8 }

  // ── Fast Path ──
  const fastPathGen = handleFastPath(query, queryType, signal)
  let fastPathNext = await fastPathGen.next()
  while (!fastPathNext.done) {
    yield fastPathNext.value
    fastPathNext = await fastPathGen.next()
  }
  if (fastPathNext.value === true) return

  // ── Full Pipeline: Gemini 멀티턴 ──
  const effectiveKey = geminiApiKey || process.env.GEMINI_API_KEY
  if (!effectiveKey) {
    yield { type: 'error', message: 'Gemini API 키가 설정되지 않았습니다.' }
    return
  }

  const systemPrompt = buildSystemPrompt(complexity, queryType, query, true /* isGemini */)
  const ai = new GoogleGenAI({ apiKey: effectiveKey })
  const selectedTools = new Set(selectToolsForQuery(query))
  const toolDeclarations = getToolDeclarations().filter(d => selectedTools.has(d.name!))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: Array<{ role: 'user' | 'model'; parts: any[] }> = [
    { role: 'user', parts: [{ text: query }] },
  ]

  let allToolResults: ToolCallResult[] = []
  const MAX_TOOL_RESULTS = 30
  let turnCount = 0
  let latestSearchEntries: LawEntry[] = []
  const failureCount = new Map<string, number>()
  let totalInputTokens = 0
  let totalOutputTokens = 0

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
        d => (failureCount.get(d.name!) || 0) < 2
      )

      // 클라이언트 취소 시 조기 종료
      if (signal?.aborted) {
        yield { type: 'status', message: '검색이 취소되었습니다.', progress: 0 }
        return
      }

      const response = await withTimeout(
        ai.models.generateContent({
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

      const candidate = response.candidates?.[0]

      // 토큰 사용량 추적
      const usage = (response as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata
      if (usage) {
        totalInputTokens += usage.promptTokenCount || 0
        totalOutputTokens += usage.candidatesTokenCount || 0
        yield { type: 'token_usage', inputTokens: totalInputTokens, outputTokens: totalOutputTokens, totalTokens: totalInputTokens + totalOutputTokens }
      }

      if (!candidate?.content?.parts) {
        warnings.push('Gemini 응답이 비어있습니다.')
        break
      }

      const parts = candidate.content.parts
      const functionCalls = parts.filter((p: GeminiPart) => p.functionCall)

      // 텍스트 답변 (도구 호출 없음) → 완료
      if (functionCalls.length === 0) {
        const answer = parts.filter((p: GeminiPart) => p.text).map((p: GeminiPart) => p.text).join('')
        yield { type: 'status', message: '답변을 정리하고 있습니다...', progress: 92 }
        yield {
          type: 'answer',
          data: {
            answer,
            citations: buildCitations(allToolResults, answer),
            confidenceLevel: calcConfidence(allToolResults),
            complexity,
            queryType,
            warnings: warnings.length > 0 ? warnings : undefined,
          },
        }
        return
      }

      // 마지막 턴: 도구 호출 무시, 텍스트 답변 강제
      if (isLastTurn) {
        const textParts = parts.filter((p: GeminiPart) => p.text)
        if (textParts.length > 0) {
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
        const retry = await withTimeout(
          ai.models.generateContent({
            model: MODEL,
            contents: messages,
            config: { systemInstruction: systemPrompt, temperature: 0, maxOutputTokens: MAX_TOKENS[complexity] },
          }),
          GEMINI_TIMEOUT[complexity],
          'Gemini API (마지막 턴)',
        )
        const retryUsage = (retry as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata
        if (retryUsage) {
          totalInputTokens += retryUsage.promptTokenCount || 0
          totalOutputTokens += retryUsage.candidatesTokenCount || 0
          yield { type: 'token_usage', inputTokens: totalInputTokens, outputTokens: totalOutputTokens, totalTokens: totalInputTokens + totalOutputTokens }
        }
        const retryText = (retry.candidates?.[0]?.content?.parts || [])
          .filter((p: GeminiPart) => p.text).map((p: GeminiPart) => p.text).join('')
        yield {
          type: 'answer',
          data: {
            answer: retryText || '답변 생성에 실패했습니다.',
            citations: buildCitations(allToolResults, retryText),
            confidenceLevel: calcConfidence(allToolResults),
            complexity,
            queryType,
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
          const annexMatch = src.result.match(/별표\s*(\d+)/)
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

      // 히스토리 추가
      const modelParts = [...parts]
      for (const chain of autoChains) {
        modelParts.push({ functionCall: { name: chain.name, args: chain.args } } as Part)
      }
      messages.push({ role: 'model', parts: modelParts })
      messages.push({
        role: 'user',
        parts: results.map(r => ({
          functionResponse: { name: r.name, response: { result: r.result } },
        })),
      })

      turnCount++
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      warnings.push(`Gemini API 오류: ${message}`)
      yield { type: 'error', message }
      break
    }
  }

  // 루프 종료 (에러/예외)
  if (turnCount > maxToolTurns) {
    warnings.push('도구 호출 횟수 제한에 도달했습니다.')
  }
  yield {
    type: 'answer',
    data: {
      answer: '죄송합니다. 답변을 생성하는 중 오류가 발생했습니다. 다시 시도해주세요.',
      citations: buildCitations(allToolResults),
      confidenceLevel: 'low',
      complexity,
      queryType,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
  }
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

  const complexPatterns = /(?:하고|와\s*함께|에\s*대한\s*판례|판례도|전후\s*비교|비교해|변경.{0,5}판례|개정.{0,5}판례)/
  const moderatePatterns = /(?:위임|시행령|시행규칙|해석례|유권해석|이력|변경|개정|바뀐|신구|대조)/

  if (lawMatches.length > 1 || articleMatches.length > 2 || query.length > 100 || complexPatterns.test(query)) {
    return 'complex'
  }
  if (query.length > 50 || articleMatches.length > 0 || moderatePatterns.test(query)) {
    return 'moderate'
  }
  return 'simple'
}

/** @internal 테스트용 export */
export function inferQueryType(query: string): LegalQueryType {
  // 좁은 패턴(consequence, exemption) 우선, 넓은 범용 패턴(알려줘/설명) 마지막
  const patterns: [RegExp, LegalQueryType][] = [
    [/(?:면제|감면|특례|예외|비과세|영세율|감경)/,                     'exemption'],
    [/(?:벌칙|과태료|처벌|위반|제재|벌금|징역|형사)/,                  'consequence'],
    [/(?:절차|방법|신청|신고|등록|제출|처리|납부|환급|경정청구|어떻게)/, 'procedure'],
    [/(?:비교|차이|구별|구분|다른\s*점|vs|대비)/,                     'comparison'],
    [/(?:요건|조건|자격|충족|해당.*경우|갖추|필요.*서류|하려면)/,        'requirement'],
    [/(?:범위|적용.*범위|해당.*대상|포함|제외.*범위|얼마|세율|금액|기한|산정|계산)/, 'scope'],
    [/(?:정의|뜻|의미|개념|무엇|이란\??$)/,                           'definition'],
    [/(?:적용|해당|판단|가능|여부|할\s*수)/,                          'application'],
    [/(?:알려|궁금|설명|내용|전반|개요|현황|주요|핵심|요약|정리)/,       'definition'],
  ]
  for (const [pattern, type] of patterns) {
    if (pattern.test(query)) return type
  }
  return 'application'
}

