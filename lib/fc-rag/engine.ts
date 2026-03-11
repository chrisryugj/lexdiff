/**
 * FC-RAG Engine - Function Calling 기반 RAG 엔진
 *
 * korean-law-mcp 도구를 Gemini Function Calling으로 호출하여
 * 법제처 API 실시간 데이터 기반 답변 생성.
 *
 * SSE 스트리밍 지원: executeRAGStream()으로 도구 호출 과정을 실시간 전송
 */

import { GoogleGenAI, type Part } from '@google/genai'
import { getToolDeclarations, executeTool, executeToolsParallel, type ToolCallResult } from './tool-adapter'
import { buildSystemPrompt, type LegalQueryType } from './prompts'
import { TOOL_DISPLAY_NAMES as TIER_DISPLAY_NAMES, selectToolsForQuery } from './tool-tiers'

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

// 57개 전체 도구 한국어 표시명 (tool-tiers.ts에서 가져옴)
const TOOL_DISPLAY_NAMES: Record<string, string> = { ...TIER_DISPLAY_NAMES }

/** complexity 기반 최대 도구 턴 수 */
function getMaxToolTurns(complexity: QueryComplexity): number {
  switch (complexity) {
    case 'simple': return 2
    case 'moderate': return 3
    case 'complex': return 4
  }
}

// ─── KNOWN_MST 런타임 캐시 ───
// search_law 호출 결과에서 자동 축적. 서버 프로세스 수명 동안 유지.
const KNOWN_MST = new Map<string, string>()
const KNOWN_MST_MAX = 5000

/** search_law 결과를 KNOWN_MST에 저장 */
function cacheMSTEntries(entries: LawEntry[]) {
  for (const e of entries) {
    if (e.name && e.mst) {
      if (KNOWN_MST.size >= KNOWN_MST_MAX) {
        // FIFO: 가장 오래된 엔트리 제거
        const firstKey = KNOWN_MST.keys().next().value
        if (firstKey) KNOWN_MST.delete(firstKey)
      }
      KNOWN_MST.set(e.name, e.mst)
    }
  }
}

// ─── Fast Path: 단순 조문 질문 바이패스 ───

interface FastPathDetection {
  type: 'hit' | 'resolve' | 'none'
  lawName?: string
  articles?: string[]
  mst?: string
}

/** 복잡한 키워드가 없고 법명+조문번호가 명확한 단순 질문인지 판단 */
function detectFastPath(query: string): FastPathDetection {
  // 복잡한 질문은 full pipeline으로
  if (/(?:비교|판례|해석례|개정|위임|시행령|시행규칙|신구|대조|이력|조례|자치법규|처벌|벌칙|과태료|면제|감면|특례|예외)/.test(query)) {
    return { type: 'none' }
  }
  // 120자 초과면 복잡 질문으로 간주
  if (query.length > 120) return { type: 'none' }

  // 법명 추출: 「법명」 > ~법 패턴
  const lawNameMatch = query.match(/「([^」]+)」/) || query.match(/([\w가-힣]+(?:법|령|규칙))(?:\s|$|의|에|을|를|이|가|은|는)/)
  if (!lawNameMatch) return { type: 'none' }
  const lawName = lawNameMatch[1].trim()

  // 조문번호 추출
  const articleMatches = Array.from(query.matchAll(/제(\d+)조(?:의(\d+))?/g))
  if (articleMatches.length === 0) return { type: 'none' }
  const articles = articleMatches.map(m => m[2] ? `제${m[1]}조의${m[2]}` : `제${m[1]}조`)

  // KNOWN_MST 조회
  const mst = KNOWN_MST.get(lawName)
  if (mst) {
    return { type: 'hit', lawName, articles, mst }
  }
  return { type: 'resolve', lawName, articles }
}

// ─── search_law 결과 파싱 유틸 ───

interface LawEntry { name: string; mst: string }

/** search_law 결과 텍스트에서 법령명-MST 쌍 추출 (압축/원본 양쪽 대응) */
function parseLawEntries(text: string): LawEntry[] {
  const entries: LawEntry[] = []
  const regex = /\d+\.\s+(.+?)\s*(?:\(MST:(\d+),\s*\S+\)|\n\s+- 법령ID:.+\n\s+- MST:\s*(\d+))/g
  let m
  while ((m = regex.exec(text)) !== null) {
    entries.push({ name: m[1].trim(), mst: m[2] || m[3] })
  }
  return entries
}

/** 검색 결과에서 질문에 가장 맞는 법령의 MST 찾기 */
function findBestMST(entries: LawEntry[], query: string): string | null {
  if (entries.length === 0) return null

  // 1. 「법령명」 또는 ~법 패턴으로 정확 매칭
  const nameMatch = query.match(/「([^」]+)」/) || query.match(/([\w가-힣]+법)/)
  const target = nameMatch?.[1]
  if (target) {
    const exact = entries.find(e => e.name === target)
    if (exact) return exact.mst
    const prefixed = entries
      .filter(e => e.name.startsWith(target))
      .sort((a, b) => a.name.length - b.name.length)
    if (prefixed.length > 0) return prefixed[0].mst
  }

  // 2. 자연어 질문: 키워드 매칭 점수로 선택
  if (entries.length > 1) {
    const cleaned = query.replace(/(?:법|에\s*대해|알려줘|궁금|설명|관련|조문|내용)/g, '').trim()
    const keywords = cleaned.split(/\s+/).filter(w => w.length >= 2)
    if (keywords.length > 0) {
      const scored = entries.map(e => {
        let score = 0
        for (const kw of keywords) {
          if (e.name.includes(kw)) score += kw.length
        }
        return { ...e, score }
      }).sort((a, b) => b.score - a.score)
      if (scored[0].score > 0) return scored[0].mst
    }
  }

  return entries[0].mst
}

// ─── 조례 검색 결과 파싱 유틸 ───

interface OrdinEntry { seq: string; name: string }

/** search_ordinance 결과에서 [일련번호] 자치법규명 쌍 추출 */
function parseOrdinEntries(text: string): OrdinEntry[] {
  const entries: OrdinEntry[] = []
  const regex = /\[(\d+)\]\s+(.+)/g
  let m
  while ((m = regex.exec(text)) !== null) {
    entries.push({ seq: m[1], name: m[2].trim() })
  }
  return entries
}

/** 조례 검색 결과에서 쿼리에 가장 맞는 자치법규 일련번호 찾기 */
function findBestOrdinanceSeq(text: string, query: string): string | null {
  const entries = parseOrdinEntries(text)
  if (entries.length === 0) return null
  if (entries.length === 1) return entries[0].seq

  // 쿼리에서 핵심 키워드 추출 (조례/규칙/에 대해/알려줘 등 제거)
  const cleaned = query.replace(/(?:조례|규칙|에\s*대해|알려줘|궁금|설명|관련|내용|전반|주요)/g, '').trim()
  const keywords = cleaned.split(/\s+/).filter(w => w.length >= 2)

  // 키워드 매칭: matchCount(매칭된 키워드 수) 우선, 동점이면 totalScore(길이합) 순
  const scored = entries.map(e => {
    let matchCount = 0
    let totalScore = 0
    for (const kw of keywords) {
      if (e.name.includes(kw)) {
        matchCount++
        totalScore += kw.length
      }
    }
    // 이름 길이가 짧을수록 정확 매칭 가능성 높음 (보너스)
    const brevityBonus = 100 - Math.min(e.name.length, 100)
    return { ...e, matchCount, totalScore, brevityBonus }
  }).sort((a, b) =>
    b.matchCount - a.matchCount ||
    b.totalScore - a.totalScore ||
    b.brevityBonus - a.brevityBonus
  )

  return scored[0].seq
}

// ─── 도구 결과 요약 유틸 (SSE용) ───

function summarizeToolResult(name: string, result: ToolCallResult): string {
  if (result.isError) return `오류: ${result.result.slice(0, 60)}`

  const text = result.result
  switch (name) {
    case 'search_ai_law': {
      const countMatch = text.match(/(\d+)건/)
      return countMatch ? `${countMatch[1]}건 조문 검색됨` : '지능형 검색 완료'
    }
    case 'search_law': {
      const countMatch = text.match(/총 (\d+)건/)
      const entries = parseLawEntries(text)
      const firstName = entries[0]?.name
      if (countMatch && firstName) {
        return entries.length > 1 ? `${firstName} 외 ${entries.length - 1}건` : firstName
      }
      return firstName || '검색 완료'
    }
    case 'get_batch_articles': {
      const lawName = text.match(/법령명:\s*(.+?)(?:\n|$)/)?.[1]?.trim()
      const articleCount = new Set(Array.from(text.matchAll(/제(\d+)조/g)).map(m => m[1])).size
      return lawName ? `${lawName} ${articleCount}개 조문` : `${articleCount}개 조문 조회`
    }
    case 'get_law_text': {
      const articleCount = new Set(Array.from(text.matchAll(/제(\d+)조/g)).map(m => m[1])).size
      const lawName = text.match(/(?:##\s+|법령명:\s*)(.+?)(?:\n|$)/)?.[1]?.trim()
      return lawName ? `${lawName} ${articleCount}개 조문` : `${articleCount}개 조문 조회`
    }
    case 'search_precedents': {
      const count = text.match(/총 (\d+)건/)?.[1]
      return count ? `${count}건 검색됨` : '판례 검색 완료'
    }
    case 'get_precedent_text': return '판례 전문 조회 완료'
    case 'search_interpretations': {
      const count = text.match(/총 (\d+)건/)?.[1]
      return count ? `${count}건 검색됨` : '해석례 검색 완료'
    }
    case 'get_interpretation_text': return '해석례 전문 조회 완료'
    case 'get_three_tier': return '위임법령 구조 조회 완료'
    case 'compare_old_new': return '신구법 대조표 조회 완료'
    case 'get_article_history': return '조문 이력 조회 완료'
    case 'search_ordinance': {
      const count = text.match(/총 (\d+)건/)?.[1]
      const firstName = text.match(/\]\s+(.+)/)?.[1]?.trim()
      return count ? `${firstName || '자치법규'} 외 ${count}건` : '자치법규 검색 완료'
    }
    case 'get_ordinance': {
      const name = text.match(/자치법규명:\s*(.+)/)?.[1]?.trim()
      return name || '자치법규 조회 완료'
    }
    default: return '완료'
  }
}

function getToolCallQuery(name: string, args: Record<string, unknown>): string | undefined {
  switch (name) {
    case 'search_ai_law': return args.query as string
    case 'search_law': return args.query as string
    case 'get_law_text': return args.jo ? `${args.jo}` : undefined
    case 'get_batch_articles': {
      const articles = args.articles as string[] | undefined
      return articles?.join(', ')
    }
    case 'search_precedents': return args.query as string
    case 'search_interpretations': return args.query as string
    case 'search_ordinance': return args.query as string
    case 'get_ordinance': return args.ordinSeq ? `#${args.ordinSeq}` : undefined
    default: return undefined
  }
}

/** 파라미터 보정: Gemini가 잘못 보낸 MST/jo를 엔진에서 교정 */
async function correctToolArgs(
  calls: Array<{ name: string; args: Record<string, unknown> }>,
  latestSearchEntries: LawEntry[],
  query: string,
  onSearchFallback?: (entries: LawEntry[], toolResult: ToolCallResult) => void
) {
  for (const call of calls) {
    // get_law_text / get_batch_articles / get_three_tier / compare_old_new / get_article_history: MST 보정
    if (['get_law_text', 'get_batch_articles', 'get_three_tier', 'compare_old_new', 'get_article_history'].includes(call.name)) {
      if (call.args.mst) {
        if (latestSearchEntries.length > 0) {
          // 빠른 경로: known MST에서 보정
          const knownMSTs = new Set(latestSearchEntries.map(e => e.mst))
          if (!knownMSTs.has(call.args.mst as string)) {
            const corrected = findBestMST(latestSearchEntries, query)
            if (corrected) call.args.mst = corrected
          }
        } else {
          // known MST 없음 → search_law 자동 호출하여 수집
          const lawNameMatch = query.match(/「([^」]+)」/) || query.match(/([\w가-힣]+법)/)
          const searchQuery = lawNameMatch?.[1] || query.slice(0, 30)
          const searchResult = await executeTool('search_law', { query: searchQuery })
          if (!searchResult.isError) {
            const entries = parseLawEntries(searchResult.result)
            if (entries.length > 0) {
              latestSearchEntries.push(...entries)
              onSearchFallback?.(entries, searchResult)
              const corrected = findBestMST(entries, query)
              if (corrected) call.args.mst = corrected
            }
          }
        }
      }
    }
    // get_law_text: jo 형식 보정
    if (call.name === 'get_law_text') {
      if (call.args.jo) {
        const jo = String(call.args.jo)
        if (/^\d+$/.test(jo)) call.args.jo = `제${jo}조`
        else if (/^\d+의\d+$/.test(jo)) call.args.jo = `제${jo.replace(/(\d+)의(\d+)/, '$1조의$2')}`
      }
    }
    // get_batch_articles: articles 내 조문번호 형식 보정
    if (call.name === 'get_batch_articles' && Array.isArray(call.args.articles)) {
      call.args.articles = (call.args.articles as string[]).map(a => {
        if (/^\d+$/.test(a)) return `제${a}조`
        if (/^\d+의\d+$/.test(a)) return `제${a.replace(/(\d+)의(\d+)/, '$1조의$2')}`
        return a
      })
    }
  }
}

// ─── 메인 엔진 (SSE 스트림) ───

/** executeRAGStream 옵션 */
interface RAGStreamOptions {
  apiKey?: string
  signal?: AbortSignal
  conversationId?: string
}

/**
 * FC-RAG 스트리밍 실행 (SSE용 AsyncGenerator)
 * 도구 호출 과정을 실시간으로 yield
 */
export async function* executeRAGStream(
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

  // ── Fast Path: 단순 조문 조회는 Gemini 없이 직접 처리 ──
  const fastPath = detectFastPath(query)
  if (fastPath.type !== 'none') {
    let mst = fastPath.mst
    const articles = fastPath.articles!

    if (fastPath.type === 'resolve') {
      // KNOWN_MST에 없음 → search_law로 MST 탐색
      yield { type: 'tool_call', name: 'search_law', displayName: '법령 검색', query: fastPath.lawName }
      yield { type: 'status', message: `${fastPath.lawName} MST 확인 중...`, progress: 20 }
      const searchResult = await executeTool('search_law', { query: fastPath.lawName })
      if (searchResult.isError) {
        yield { type: 'tool_result', name: 'search_law', displayName: '법령 검색', success: false, summary: '검색 실패' }
        // fast path 실패 → full pipeline으로 폴백 (아래로 계속)
      } else {
        yield { type: 'tool_result', name: 'search_law', displayName: '법령 검색', success: true, summary: summarizeToolResult('search_law', searchResult) }
        const entries = parseLawEntries(searchResult.result)
        cacheMSTEntries(entries)
        mst = findBestMST(entries, query) || undefined
      }
    }

    if (mst) {
      // MST 확보 → get_batch_articles 직접 호출
      yield { type: 'tool_call', name: 'get_batch_articles', displayName: '조문 일괄 조회', query: articles.join(', ') }
      yield { type: 'status', message: '조문을 가져오고 있습니다...', progress: 50 }
      const articlesResult = await executeTool('get_batch_articles', { mst, articles })
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
        return
      }
      // get_batch_articles 실패 → full pipeline으로 폴백
    }
    // fast path 실패 시 아래 full pipeline으로 자연스럽게 진행
  }

  // ── Full Pipeline: Gemini 멀티턴 ──
  const effectiveKey = geminiApiKey || process.env.GEMINI_API_KEY
  if (!effectiveKey) {
    yield { type: 'error', message: 'Gemini API 키가 설정되지 않았습니다.' }
    return
  }

  const systemPrompt = buildSystemPrompt(complexity, queryType, query)
  const ai = new GoogleGenAI({ apiKey: effectiveKey })
  const selectedTools = new Set(selectToolsForQuery(query))
  const toolDeclarations = getToolDeclarations().filter(d => selectedTools.has(d.name!))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: Array<{ role: 'user' | 'model'; parts: any[] }> = [
    { role: 'user', parts: [{ text: query }] },
  ]

  let allToolResults: ToolCallResult[] = []
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

      const response = await ai.models.generateContent({
        model: MODEL,
        contents: messages,
        config: {
          systemInstruction: systemPrompt,
          tools: [{ functionDeclarations: activeDeclarations }],
          temperature: 0,
          maxOutputTokens: MAX_TOKENS[complexity],
        },
      })

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
        const retry = await ai.models.generateContent({
          model: MODEL,
          contents: messages,
          config: { systemInstruction: systemPrompt, temperature: 0, maxOutputTokens: MAX_TOKENS[complexity] },
        })
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

      const results = await executeToolsParallel(calls)

      // ── Context Precision 향상: search_ai_law 결과를 쿼리 관련성 기준으로 재정렬 ──
      for (const r of results) {
        if (r.name === 'search_ai_law' && !r.isError) {
          r.result = rerankAiSearchResult(r.result, query)
        }
      }

      allToolResults.push(...results)

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

      for (const chain of autoChains) {
        yield {
          type: 'tool_call',
          name: chain.name,
          displayName: TOOL_DISPLAY_NAMES[chain.name] || chain.name,
          query: getToolCallQuery(chain.name, chain.args),
        }
        const autoResult = await executeTool(chain.name, chain.args)
        allToolResults.push(autoResult)
        yield {
          type: 'tool_result',
          name: chain.name,
          displayName: TOOL_DISPLAY_NAMES[chain.name] || chain.name,
          success: !autoResult.isError,
          summary: summarizeToolResult(chain.name, autoResult),
        }
        // Always push to results so functionCall/functionResponse pairs stay symmetric
        results.push(autoResult)
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

// ─── 동기 래퍼 (하위 호환) ───

/**
 * FC-RAG 실행 (비스트리밍 버전)
 * executeRAGStream의 래퍼 - 최종 결과만 반환
 */
export async function executeRAG(
  query: string,
  geminiApiKey?: string
): Promise<FCRAGResult> {
  for await (const event of executeRAGStream(query, { apiKey: geminiApiKey })) {
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

// ─── search_ai_law 결과 관련성 재정렬 (Context Precision 향상) ───

/**
 * search_ai_law 결과를 쿼리 키워드 매칭으로 재정렬.
 * 쿼리와 관련 없는 조문을 후순위로 밀어 Gemini가 핵심 조문에 집중하게 함.
 *
 * 점수 기준:
 * - 법령명에 쿼리 키워드 포함 시 +3/키워드
 * - 조문 내용에 쿼리 키워드 포함 시 +1/키워드
 * - "제N조" 형태 매칭 시 +5 (사용자가 조문 지정)
 */
function rerankAiSearchResult(text: string, query: string): string {
  const headerMatch = text.match(/^[^\n]*(?:검색|총)[^\n]*\n/)
  const header = headerMatch ? headerMatch[0] : ''
  const body = headerMatch ? text.slice(header.length) : text

  const blocks = body.split(/(?=📜\s)/).filter(b => b.trim().length > 0)
  if (blocks.length <= 1) return text  // 1건 이하면 재정렬 불필요

  // 쿼리에서 키워드 추출 (불용어 제거)
  const stopWords = /(?:은|는|이|가|을|를|에|의|로|으로|와|과|에서|한|하는|대한|대해|무엇|어떤|어떻게|인가요|인지|것|및|또는|경우|위한|있는|없는|되는|되어|알려|설명|궁금|내용|관련|해서|해|줘)$/
  const keywords = query
    .replace(/[「」]/g, '')
    .split(/\s+/)
    .map(w => w.replace(stopWords, ''))
    .filter(w => w.length >= 2)

  // 쿼리에서 조문번호 추출
  const queryArticles = new Set(
    Array.from(query.matchAll(/제(\d+)조(?:의(\d+))?/g))
      .map(m => m[2] ? `제${m[1]}조의${m[2]}` : `제${m[1]}조`)
  )

  const scored = blocks.map(block => {
    let score = 0
    const firstLine = block.split('\n')[0] || ''  // 📜 법령명 라인

    // 법령명 키워드 매칭 (가중치 높음)
    for (const kw of keywords) {
      if (firstLine.includes(kw)) score += 3
      else if (block.includes(kw)) score += 1
    }

    // 조문번호 직접 매칭 (가중치 최고)
    for (const art of queryArticles) {
      if (block.includes(art)) score += 5
    }

    return { block, score }
  })

  // 점수 내림차순 정렬
  scored.sort((a, b) => b.score - a.score)

  // 관련성 없는 노이즈 제거: score > 0 결과가 3건 이상이면 score 0 결과 드롭
  const positiveScored = scored.filter(s => s.score > 0)
  const filtered = positiveScored.length >= 3 ? positiveScored : scored

  return header + filtered.map(s => s.block).join('\n\n')
}

/**
 * 도구 결과에서 Citation 구성 (답변 텍스트 기반 필터링)
 */
function buildCitations(toolResults: ToolCallResult[], answerText?: string): FCRAGCitation[] {
  const citations: FCRAGCitation[] = []
  const seen = new Set<string>()

  const mentionedArticles = answerText
    ? new Set(
        Array.from(answerText.matchAll(/제(\d+)조(?:의(\d+))?/g))
          .map(m => m[2] ? `제${m[1]}조의${m[2]}` : `제${m[1]}조`)
      )
    : null

  for (const result of toolResults) {
    if (result.isError) continue

    const text = result.result

    if (result.name === 'get_law_text' || result.name === 'get_batch_articles') {
      const lawNameMatch = text.match(/(?:##\s+|법령명:\s*)(.+?)(?:\n|$)/)
      const lawName = lawNameMatch?.[1]?.trim() || ''

      for (const match of Array.from(text.matchAll(/제(\d+)조(?:의(\d+))?(?:\(([^)]+)\))?/g))) {
        const articleNum = match[2] ? `제${match[1]}조의${match[2]}` : `제${match[1]}조`
        if (mentionedArticles && !mentionedArticles.has(articleNum)) continue

        const key = `${lawName}:${articleNum}`
        if (!seen.has(key)) {
          seen.add(key)
          const idx = text.indexOf(match[0])
          const chunkText = text.slice(Math.max(0, idx), Math.min(text.length, idx + 400))
          citations.push({ lawName, articleNumber: articleNum, chunkText, source: result.name })
        }
      }
    }

    if (result.name === 'search_ai_law') {
      // search_ai_law 결과에서 법령명 + 조문번호 추출
      for (const match of Array.from(text.matchAll(/📜\s+(.+)\n\s+제(\d+)조(?:의(\d+))?/g))) {
        const lawName = match[1].trim()
        const articleNum = match[3] ? `제${match[2]}조의${match[3]}` : `제${match[2]}조`
        const key = `ai:${lawName}:${articleNum}`
        if (!seen.has(key)) {
          seen.add(key)
          const idx = text.indexOf(match[0])
          const chunkText = text.slice(Math.max(0, idx), Math.min(text.length, idx + 400))
          citations.push({ lawName, articleNumber: articleNum, chunkText, source: 'search_ai_law' })
        }
      }
    }

    if (result.name === 'search_precedents' || result.name === 'get_precedent_text') {
      for (const match of Array.from(text.matchAll(/사건번호[:\s]+(\S+)/g))) {
        const caseNo = match[1]
        if (!seen.has(caseNo)) {
          seen.add(caseNo)
          citations.push({ lawName: '판례', articleNumber: caseNo, chunkText: text.slice(0, 200), source: result.name })
        }
      }
    }

    if (result.name === 'search_interpretations' || result.name === 'get_interpretation_text') {
      for (const match of Array.from(text.matchAll(/(?:해석례|회신번호|ID)[:\s]+(\S+)/g))) {
        const interpNo = match[1]
        if (!seen.has(interpNo)) {
          seen.add(interpNo)
          citations.push({ lawName: '법령해석례', articleNumber: interpNo, chunkText: text.slice(0, 200), source: result.name })
        }
      }
    }

    if (result.name === 'get_three_tier') {
      const lawNames = Array.from(text.matchAll(/(?:법률|시행령|시행규칙)[:\s]+(.+?)(?:\n|$)/g))
      for (const match of lawNames) {
        const name = match[1].trim()
        const key = `위임:${name}`
        if (name && !seen.has(key)) {
          seen.add(key)
          citations.push({ lawName: name, articleNumber: '위임법령', chunkText: text.slice(0, 200), source: 'get_three_tier' })
        }
      }
    }

    if (result.name === 'compare_old_new') {
      const key = '신구법대조'
      if (!seen.has(key)) {
        seen.add(key)
        const lawNameMatch = text.match(/(?:법령명|법률명)[:\s]+(.+?)(?:\n|$)/)
        citations.push({
          lawName: lawNameMatch?.[1]?.trim() || '신구법 대조',
          articleNumber: '신구법 대조표',
          chunkText: text.slice(0, 200),
          source: 'compare_old_new',
        })
      }
    }

    if (result.name === 'get_article_history') {
      for (const match of Array.from(text.matchAll(/(\d{4}[-./]\d{2}[-./]\d{2})\s*(?:개정|신설|삭제)/g))) {
        const date = match[1]
        const key = `이력:${date}`
        if (!seen.has(key)) {
          seen.add(key)
          citations.push({
            lawName: '조문 개정이력',
            articleNumber: date,
            chunkText: text.slice(Math.max(0, text.indexOf(match[0])), Math.min(text.length, text.indexOf(match[0]) + 200)),
            source: 'get_article_history',
          })
        }
      }
    }

    if (result.name === 'get_ordinance') {
      const ordinName = text.match(/자치법규명:\s*(.+)/)?.[1]?.trim()
      if (ordinName) {
        for (const match of Array.from(text.matchAll(/제(\d+)조(?:의(\d+))?(?:\(([^)]+)\))?/g))) {
          const articleNum = match[2] ? `제${match[1]}조의${match[2]}` : `제${match[1]}조`
          if (mentionedArticles && !mentionedArticles.has(articleNum)) continue
          const key = `${ordinName}:${articleNum}`
          if (!seen.has(key)) {
            seen.add(key)
            const idx = text.indexOf(match[0])
            citations.push({ lawName: ordinName, articleNumber: articleNum, chunkText: text.slice(Math.max(0, idx), Math.min(text.length, idx + 400)), source: 'get_ordinance' })
          }
        }
        // 조문 매칭이 없어도 조례 자체는 citation으로 등록
        const baseKey = `조례:${ordinName}`
        if (!seen.has(baseKey)) {
          seen.add(baseKey)
          citations.push({ lawName: ordinName, articleNumber: '자치법규', chunkText: text.slice(0, 200), source: 'get_ordinance' })
        }
      }
    }
  }

  return citations
}

function calcConfidence(toolResults: ToolCallResult[]): 'high' | 'medium' | 'low' {
  const successful = toolResults.filter(r => !r.isError)
  if (successful.length >= 3) return 'high'
  if (successful.length >= 1) return 'medium'
  return 'low'
}
