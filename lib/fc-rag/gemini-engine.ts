/**
 * FC-RAG Gemini Fallback 엔진
 * Claude 불능 시 Gemini Flash로 대체. 멀티턴 Function Calling + SSE 스트리밍.
 */

import { GoogleGenAI } from '@google/genai'
import { getToolDeclarations, executeTool, executeToolsParallel, type ToolCallResult } from './tool-adapter'
import { buildStaticSystemPrompt, buildDynamicHeader } from './prompts'
import { getCachedAnswer, cacheAnswer } from './answer-cache'
import { routeQuery, shouldUseRouter, type RouterPlan } from './router-engine'
import { TOOL_DISPLAY_NAMES, selectToolsForQuery, CHAIN_COVERS } from './tool-tiers'
import { cacheMSTEntries, parseLawEntries, findBestMST, findBestOrdinanceSeq, type LawEntry } from './fast-path'
import { buildCitations, calcConfidence } from './citations'
import { summarizeToolResult, getToolCallQuery, correctToolArgs, rerankAiSearchResult } from './result-utils'
import { evaluateResponseQuality } from './quality-evaluator'
import {
  isDecisionSearchTool, isDecisionGetTool, isDecisionTool,
  extractDomain, DOMAIN_META,
  SEARCH_DECISIONS_TOOL, GET_DECISION_TEXT_TOOL,
  type DecisionDomain,
} from './decision-domains'

/** 도메인 인식 displayName — unified-decisions 는 도메인별 라벨, 그 외는 TOOL_DISPLAY_NAMES */
function displayNameFor(name: string, args?: Record<string, unknown>): string {
  if (isDecisionTool(name)) {
    const d = extractDomain(args)
    const label = d ? DOMAIN_META[d].label : '결정문'
    return isDecisionSearchTool(name) ? `${label} 검색` : `${label} 조회`
  }
  return TOOL_DISPLAY_NAMES[name] || name
}
import {
  type FCRAGStreamEvent,
  type RAGStreamOptions,
  type GeminiPart,
  type QueryComplexity,
  MODEL,
  MAX_TOKENS,
  GEMINI_TIMEOUT,
  getConversationContext,
  storeConversation,
  handleFastPath,
  inferComplexity,
  inferQueryType,
  getMaxToolTurns,
  withTimeout,
} from './engine-shared'

// ─── Auto-chain 로직 (도구 결과 기반 자동 후속 호출) ───

function buildAutoChains(
  results: ToolCallResult[],
  query: string,
  latestSearchEntries: LawEntry[],
): Array<{ name: string; args: Record<string, unknown> }> {
  const autoChains: Array<{ name: string; args: Record<string, unknown> }> = []

  // search_decisions (precedent 도메인) 0건 시 키워드 단순화 재검색
  const precedentSearches = results.filter(r =>
    isDecisionSearchTool(r.name) && !r.isError && extractDomain(r.args) === 'precedent'
  )
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
        autoChains.push({
          name: SEARCH_DECISIONS_TOOL,
          args: { domain: 'precedent', query: coreKeywords.join(' ') },
        })
      }
    }
  }

  // 조문 결과에서 "별표" 참조 감지 → get_annexes 자동 호출
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

  // search_decisions → get_decision_text (동일 도메인 자동 체인)
  // 이미 get_decision_text 호출된 도메인은 제외. 한 턴에 최대 1개만 자동 추가.
  const fetchedDomains = new Set<DecisionDomain>()
  for (const r of results) {
    if (isDecisionGetTool(r.name)) {
      const d = extractDomain(r.args) as DecisionDomain | null
      if (d) fetchedDomains.add(d)
    }
  }
  for (const r of results) {
    if (!isDecisionSearchTool(r.name) || r.isError) continue
    const domain = extractDomain(r.args) as DecisionDomain | null
    if (!domain || fetchedDomains.has(domain)) continue
    // 해석례는 ID, 판례/헌재/행정심판은 사건번호, 조세심판은 일련번호 등 — 범용 매칭
    const idMatch = r.result.match(/(?:ID|id|일련번호|사건번호|결정번호|회신번호)[:\s]+(\S+)/)
    if (idMatch) {
      autoChains.push({
        name: GET_DECISION_TEXT_TOOL,
        args: { domain, id: idMatch[1] },
      })
      fetchedDomains.add(domain)
      break  // 한 번에 하나만
    }
  }

  // search_ordinance → get_ordinance
  const ordinSearchOK = results.filter(r => r.name === 'search_ordinance' && !r.isError)
  const alreadyGotOrdinance = results.some(r => r.name === 'get_ordinance')
  if (ordinSearchOK.length > 0 && !alreadyGotOrdinance) {
    const bestSeq = findBestOrdinanceSeq(ordinSearchOK[0].result, query)
    if (bestSeq) autoChains.push({ name: 'get_ordinance', args: { ordinSeq: bestSeq } })
  }

  // 개정/변경 질의 → compare_old_new
  const searchOK = results.filter(r => r.name === 'search_law' && !r.isError)
  const alreadyCompared = results.some(r => r.name === 'compare_old_new')
  if (searchOK.length > 0 && !alreadyCompared && /(?:개정|변경|바뀐|신구|대조)/.test(query)) {
    const bestMST = findBestMST(latestSearchEntries, query)
    if (bestMST) autoChains.push({ name: 'compare_old_new', args: { mst: bestMST } })
  }

  return autoChains
}

// ─── Gemini 최종턴 강제 답변 생성 ───

interface ForceLastTurnOptions {
  ai: GoogleGenAI
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: Array<{ role: 'user' | 'model'; parts: any[] }>
  parts: GeminiPart[]
  systemPrompt: string
  complexity: QueryComplexity
  queryType: import('./engine-shared').LegalQueryType
  allToolResults: ToolCallResult[]
  warnings: string[]
  accFinishReason?: string
  totalInputTokens: number
  totalOutputTokens: number
  signal?: AbortSignal
}

async function* forceLastTurnAnswer(opts: ForceLastTurnOptions): AsyncGenerator<FCRAGStreamEvent> {
  const { ai, messages, parts, systemPrompt, complexity, queryType, allToolResults, warnings, accFinishReason, totalInputTokens, totalOutputTokens, signal } = opts

  // 텍스트 답변이 이미 있으면 사용
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
        isTruncated: accFinishReason === 'MAX_TOKENS',
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    }
    return
  }

  if (signal?.aborted) return

  // 텍스트 없으면 강제 답변 요청
  yield { type: 'status', message: '답변 생성을 요청하고 있습니다...', progress: 88 }
  messages.push({ role: 'model', parts })
  messages.push({
    role: 'user',
    parts: [{ text: '수집된 정보를 바탕으로 한국어로 답변해주세요. 추가 도구 호출 없이 바로 답변하세요.' }],
  })

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
  let retryInputTokens = totalInputTokens
  let retryOutputTokens = totalOutputTokens
  let retryCachedTokens = 0

  for await (const chunk of retryStream) {
    if (signal?.aborted) break
    const retryCandidate = chunk.candidates?.[0]
    if (retryCandidate?.finishReason) retryFinishReason = retryCandidate.finishReason
    const chunkUsage = (chunk as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number } }).usageMetadata
    if (chunkUsage) {
      retryInputTokens = totalInputTokens + (chunkUsage.promptTokenCount || 0)
      retryOutputTokens = totalOutputTokens + (chunkUsage.candidatesTokenCount || 0)
      retryCachedTokens = chunkUsage.cachedContentTokenCount || 0
    }

    if (retryCandidate?.content?.parts) {
      for (const part of retryCandidate.content.parts as GeminiPart[]) {
        if (part.text) {
          retryText += part.text
          yield { type: 'answer_token', data: { text: part.text } }
        }
      }
    }
  }

  if (retryInputTokens > totalInputTokens || retryOutputTokens > totalOutputTokens) {
    if (retryCachedTokens > 0) {
      const rate = ((retryCachedTokens / (retryInputTokens - totalInputTokens)) * 100).toFixed(1)
      console.log(`[context-cache] forceLastTurn: cached=${retryCachedTokens} (${rate}%)`)
    }
    yield { type: 'token_usage', inputTokens: retryInputTokens, outputTokens: retryOutputTokens, totalTokens: retryInputTokens + retryOutputTokens, cachedTokens: retryCachedTokens }
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
}

// ─── 메인 Gemini 엔진 ───

/**
 * Gemini FC-RAG 스트리밍 실행 (Fallback)
 * Claude 불능 시 Gemini Flash로 대체
 */
export async function* executeGeminiRAGStream(
  query: string,
  options?: RAGStreamOptions,
): AsyncGenerator<FCRAGStreamEvent> {
  const { apiKey: geminiApiKey, signal, preEvidence, conversationId } = options || {}
  const warnings: string[] = []
  // complexity/queryType/maxToolTurns는 S1 Router가 덮어쓸 수 있도록 let
  let complexity = inferComplexity(query)
  let queryType = inferQueryType(query)
  let maxToolTurns = getMaxToolTurns(complexity)
  let complexityLabel = complexity === 'simple' ? '단순' : complexity === 'moderate' ? '보통' : '복합'
  let routerPlan: RouterPlan | null = null
  // 🔴 Router 경로와 메인 루프가 공유해야 함 (MST 교정 + chain 중복 방지)
  let latestSearchEntries: LawEntry[] = []
  const chainCoveredTools = new Set<string>()

  yield { type: 'status', message: `질문 분석 완료 (${complexityLabel})`, progress: 8 }

  // ── Answer Cache lookup (동일 질의 재호출 시 즉시 응답) ──
  // conversationId/preEvidence 있으면 자동 스킵. TTL 6h, 품질 필터 적용.
  const cacheOpts = { conversationId, hasPreEvidence: !!preEvidence }
  const cached = await getCachedAnswer(query, cacheOpts)
  if (cached) {
    yield { type: 'status', message: '캐시된 답변 반환 중...', progress: 95 }
    yield { type: 'answer', data: cached }
    return
  }

  // ── 대화 컨텍스트 ──
  const prevContext = await getConversationContext(conversationId)

  // ── preEvidence 있으면 fast-path 스킵 ──
  let geminiEvidence = preEvidence
  if (!geminiEvidence) {
    const fastPathGen = handleFastPath(query, queryType, signal)
    let fastPathNext = await fastPathGen.next()
    while (!fastPathNext.done) {
      yield fastPathNext.value
      fastPathNext = await fastPathGen.next()
    }
    if (fastPathNext.value === true) return
  }

  // ── S1 Router (Flash-Lite) — 옵션, 해시 기반 점진 롤아웃 ──
  // 환경변수: FC_RAG_S1_ROUTER_ENABLED=true, FC_RAG_S1_ROUTER_ROLLOUT_PCT=20 (기본 20%)
  // conversationId / preEvidence 있으면 스킵 (맥락 의존). 실패 시 조용히 regex로 폴백.
  const routerEnabled = process.env.FC_RAG_S1_ROUTER_ENABLED === 'true'
  const rolloutPct = parseInt(process.env.FC_RAG_S1_ROUTER_ROLLOUT_PCT || '20', 10)
  const canUseRouter = routerEnabled
    && !preEvidence
    && !conversationId
    && !geminiEvidence
    && shouldUseRouter(query, rolloutPct)

  if (canUseRouter) {
    yield { type: 'status', message: 'S1 라우터 분석 중...', progress: 10 }
    const routerKey = process.env.GEMINI_ROUTER_API_KEY || geminiApiKey || process.env.GEMINI_API_KEY
    if (routerKey) {
      routerPlan = await routeQuery(query, routerKey, signal)
    }
    if (routerPlan) {
      // 라우터 결과로 분류 재설정 (regex 결과보다 정확도 높음 가정)
      complexity = routerPlan.complexity
      queryType = routerPlan.queryType
      maxToolTurns = routerPlan.expectedTurns  // 🔴 동적 maxTurns — 핵심 효과
      complexityLabel = complexity === 'simple' ? '단순' : complexity === 'moderate' ? '보통' : '복합'

      // 플랜이 있으면 선제 실행 (pre-fetch) → geminiEvidence 로 구성
      if (routerPlan.toolPlan.length > 0) {
        yield { type: 'status', message: `S1 플랜 실행 (${routerPlan.toolPlan.length}개 도구)`, progress: 14 }

        // tool_call 이벤트 발행
        for (const call of routerPlan.toolPlan) {
          yield {
            type: 'tool_call',
            name: call.name,
            displayName: displayNameFor(call.name, call.args),
            query: getToolCallQuery(call.name, call.args),
          }
        }

        // 🔴 MST 환각 방지: Router 경로에서도 법령명이 있으면 search_law 를 병렬 prefetch.
        // chain 도구들은 본체 법령 MST 를 주지 않아 LLM 이 환각 lawId 로 get_batch_articles 를
        // 부르는 사고(P0-1) 재발 방지.
        const lawNameMatch = query.match(/「([^」]+)」/) || query.match(/([가-힣]+법(?:\s*시행(?:령|규칙))?)/)
        const hasSearchLawInPlan = routerPlan.toolPlan.some(c => c.name === 'search_law')
        const extraSearchLaw = (lawNameMatch && !hasSearchLawInPlan)
          ? executeTool('search_law', { query: (lawNameMatch[1] || lawNameMatch[0]).trim() }, signal)
          : Promise.resolve(null)

        const [planResults, prefetchSearch] = await Promise.all([
          executeToolsParallel(
            routerPlan.toolPlan.map(c => ({ name: c.name, args: c.args })),
            signal,
          ),
          extraSearchLaw,
        ])

        // tool_result 이벤트 발행
        for (const r of planResults) {
          yield {
            type: 'tool_result',
            name: r.name,
            displayName: displayNameFor(r.name, r.args),
            success: !r.isError,
            summary: summarizeToolResult(r.name, r),
          }
        }

        // Router 플랜 내 search_law 결과에서 MST 추출
        for (const r of planResults) {
          if (r.name === 'search_law' && !r.isError) {
            latestSearchEntries = parseLawEntries(r.result)
            cacheMSTEntries(latestSearchEntries)
          }
        }
        // 별도 prefetch 결과 반영 (plan 에 search_law 없을 때)
        if (prefetchSearch && !prefetchSearch.isError) {
          const entries = parseLawEntries(prefetchSearch.result)
          if (entries.length > 0) {
            latestSearchEntries = entries
            cacheMSTEntries(entries)
          }
        }

        // 🔴 CHAIN_COVERS 병합: Router 가 실행한 chain 이 커버하는 하위 도구는 S2 가 중복 호출하지 않도록.
        for (const call of routerPlan.toolPlan) {
          if (CHAIN_COVERS[call.name]) {
            for (const covered of CHAIN_COVERS[call.name]) {
              chainCoveredTools.add(covered)
            }
          }
        }

        // 성공한 결과만 evidence 로 연결 (실패는 S2 가 보충하도록 맡김)
        const successResults = planResults.filter(r => !r.isError && r.result.length > 100)
        if (successResults.length > 0) {
          geminiEvidence = successResults
            .map(r => `[${displayNameFor(r.name, r.args)}]\n${r.result}`)
            .join('\n\n---\n\n')
        }
      }
    } else {
      // 라우터 실패 → 조용히 regex 경로로 폴백 (사용자는 인지 못 함)
      yield { type: 'status', message: '질문 분석 중...', progress: 10 }
    }
  }

  // ── 분류기 기반 Pre-evidence (Gemini도 동일 전략) ──
  // 라우터가 evidence 를 구성했으면 이 블록은 자동 스킵됨 (geminiEvidence 존재)
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

  // 🔴 Context Cache 전략: systemInstruction은 100% 고정, 동적 부분은 user message 앞에 prefix.
  // 같은 isGemini 값이면 매 호출마다 systemInstruction 문자열이 identical → Gemini 2.5+ implicit
  // caching (min 1,024 tokens, 90% 할인) 자동 발동.
  const systemPrompt = buildStaticSystemPrompt(true /* isGemini */)
  const dynamicHeader = buildDynamicHeader(complexity, queryType, query)
  const ai = new GoogleGenAI({ apiKey: effectiveKey })
  const selectedTools = new Set(selectToolsForQuery(query))
  const toolDeclarations = getToolDeclarations().filter(d => selectedTools.has(d.name!))

  const contextPrefix = prevContext ? `[이전 대화 맥락]\n${prevContext}\n\n---\n\n` : ''
  const userText = geminiEvidence
    ? `${dynamicHeader}${contextPrefix}⚡ 빠른 답변 모드 — 필요한 조문이 이미 수집됨.\n규칙: 아래 데이터만으로 답변 가능하면 추가 도구 호출하지 말 것. 부족한 경우에만 최소한 추가 사용.\n\n[사전 수집된 법령 데이터]\n${geminiEvidence}\n\n${query}`
    : `${dynamicHeader}${contextPrefix}${query}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: Array<{ role: 'user' | 'model'; parts: any[] }> = [
    { role: 'user', parts: [{ text: userText }] },
  ]

  let allToolResults: ToolCallResult[] = []
  const MAX_TOOL_RESULTS = 30

  /** 메모리 캡 유지: 에러 → 최단 → 최오래된 순서로 퇴거 (index 0 보호) */
  const enforceToolResultsCap = () => {
    while (allToolResults.length > MAX_TOOL_RESULTS) {
      const errIdx = allToolResults.findIndex(r => r.isError)
      if (errIdx >= 0) {
        allToolResults.splice(errIdx, 1)
      } else {
        let minIdx = 1
        let minLen = allToolResults[1]?.result.length ?? Infinity
        for (let i = 2; i < allToolResults.length; i++) {
          if (allToolResults[i].result.length < minLen) {
            minLen = allToolResults[i].result.length
            minIdx = i
          }
        }
        allToolResults.splice(minIdx, 1)
      }
    }
  }
  let turnCount = 0
  const failureCount = new Map<string, number>()
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCachedTokens = 0

  const progressRange = 80
  const progressPerTurn = progressRange / (maxToolTurns + 1)
  let currentProgress = 8

  while (turnCount <= maxToolTurns) {
    try {
      const isLastTurn = turnCount === maxToolTurns

      currentProgress = Math.min(8 + (turnCount * progressPerTurn), 85)
      yield { type: 'status', message: 'AI가 분석하고 있습니다...', progress: currentProgress }

      const activeDeclarations = toolDeclarations.filter(
        d => (failureCount.get(d.name!) || 0) < 2 && !chainCoveredTools.has(d.name!)
      )

      if (signal?.aborted) {
        yield { type: 'status', message: '검색이 취소되었습니다.', progress: 0 }
        return
      }

      // ── Gemini 스트리밍 ──
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

      const accParts: GeminiPart[] = []
      let accFinishReason: string | undefined
      let accUsage: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number } | undefined
      let hasFunctionCall = false

      for await (const chunk of stream) {
        if (signal?.aborted) break
        const chunkCandidate = chunk.candidates?.[0]
        if (chunkCandidate?.finishReason) accFinishReason = chunkCandidate.finishReason
        const chunkUsage = (chunk as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number } }).usageMetadata
        if (chunkUsage) accUsage = chunkUsage

        if (chunkCandidate?.content?.parts) {
          for (const part of chunkCandidate.content.parts as GeminiPart[]) {
            accParts.push(part)
            if (part.functionCall) hasFunctionCall = true
            if (part.text && !hasFunctionCall) {
              yield { type: 'answer_token', data: { text: part.text } }
            }
          }
        }
      }

      if (accUsage) {
        totalInputTokens += accUsage.promptTokenCount || 0
        totalOutputTokens += accUsage.candidatesTokenCount || 0
        const turnCached = accUsage.cachedContentTokenCount || 0
        totalCachedTokens += turnCached
        // 🔴 Context Cache 적중 관측용. Gemini 2.5+ implicit cache (systemInstruction 고정) 검증.
        // cachedContentTokenCount 는 promptTokenCount 에 포함된 cached 부분 → 90% 할인 대상.
        if (turnCached > 0) {
          const hitRate = accUsage.promptTokenCount ? (turnCached / accUsage.promptTokenCount * 100).toFixed(1) : '0'
          console.log(`[context-cache] turn ${turnCount}: cached=${turnCached}/${accUsage.promptTokenCount} (${hitRate}%)`)
        }
        yield { type: 'token_usage', inputTokens: totalInputTokens, outputTokens: totalOutputTokens, totalTokens: totalInputTokens + totalOutputTokens, cachedTokens: totalCachedTokens }
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
        const quality = evaluateResponseQuality(allToolResults, answer)
        if (quality.warnings.length > 0) warnings.push(...quality.warnings)
        const confidence = quality.level === 'fail' ? 'low' as const
          : quality.level === 'marginal' ? 'medium' as const
          : calcConfidence(allToolResults)
        yield { type: 'status', message: '답변을 정리하고 있습니다...', progress: 92 }
        // 대화 컨텍스트 저장
        await storeConversation(conversationId, query, answer)
        const answerData = {
          answer,
          citations: buildCitations(allToolResults, answer),
          confidenceLevel: confidence,
          complexity,
          queryType,
          isTruncated: accFinishReason === 'MAX_TOKENS',
          warnings: warnings.length > 0 ? warnings : undefined,
        }
        // Answer Cache 저장 (warnings/low confidence/truncated는 내부 필터로 스킵)
        await cacheAnswer(query, answerData, cacheOpts)
        yield { type: 'answer', data: answerData }
        return
      }

      // 마지막 턴: 도구 호출 무시, 텍스트 답변 강제
      if (isLastTurn) {
        yield* forceLastTurnAnswer({
          ai, messages, parts, systemPrompt, complexity, queryType,
          allToolResults, warnings, accFinishReason, totalInputTokens, totalOutputTokens, signal,
        })
        return
      }

      // ── Function Call 실행 ──
      const calls = functionCalls.map((p: GeminiPart) => ({
        name: (p.functionCall!.name || '') as string,
        args: (p.functionCall!.args || {}) as Record<string, unknown>,
      }))

      // MST 보정
      const fallbackEvents: FCRAGStreamEvent[] = []
      await correctToolArgs(calls, latestSearchEntries, query, (entries, searchResult) => {
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

      for (const evt of fallbackEvents) yield evt

      // 도구 호출 이벤트
      for (const call of calls) {
        yield {
          type: 'tool_call',
          name: call.name,
          displayName: displayNameFor(call.name, call.args),
          query: getToolCallQuery(call.name, call.args),
        }
      }

      const results = await executeToolsParallel(calls, signal)

      // search_ai_law 결과 재정렬
      for (const r of results) {
        if (r.name === 'search_ai_law' && !r.isError) {
          r.result = rerankAiSearchResult(r.result, query)
        }
      }

      allToolResults.push(...results)

      enforceToolResultsCap()

      // 도구 결과 이벤트
      for (const r of results) {
        yield {
          type: 'tool_result',
          name: r.name,
          displayName: displayNameFor(r.name, r.args),
          success: !r.isError,
          summary: summarizeToolResult(r.name, r),
        }
        if (r.isError) failureCount.set(r.name, (failureCount.get(r.name) || 0) + 1)
        else failureCount.delete(r.name)
      }

      // search_law 결과 추적
      for (const r of results) {
        if (r.name === 'search_law' && !r.isError) {
          latestSearchEntries = parseLawEntries(r.result)
          cacheMSTEntries(latestSearchEntries)
        }
      }

      // Chain 도구 커버리지 추적
      for (const call of calls) {
        if (CHAIN_COVERS[call.name]) {
          for (const covered of CHAIN_COVERS[call.name]) {
            chainCoveredTools.add(covered)
          }
        }
      }

      // ── Auto-chain ──
      const autoChains = buildAutoChains(results, query, latestSearchEntries)

      if (autoChains.length > 0) {
        for (const chain of autoChains) {
          yield {
            type: 'tool_call',
            name: chain.name,
            displayName: displayNameFor(chain.name, chain.args),
            query: getToolCallQuery(chain.name, chain.args),
          }
        }

        const autoResults = await executeToolsParallel(autoChains, signal)

        for (const autoResult of autoResults) {
          allToolResults.push(autoResult)
          yield {
            type: 'tool_result',
            name: autoResult.name,
            displayName: displayNameFor(autoResult.name, autoResult.args),
            success: !autoResult.isError,
            summary: summarizeToolResult(autoResult.name, autoResult),
          }
          results.push(autoResult)
        }

        enforceToolResultsCap()
      }

      // 에러 경고
      const errors = results.filter(r => r.isError)
      if (errors.length > 0) {
        warnings.push(...errors.map(e => `도구 오류 (${e.name}): ${e.result.slice(0, 100)}`))
      }

      // 히스토리 추가
      messages.push({ role: 'model', parts })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const responseParts: any[] = results.slice(0, results.length - autoChains.length).map(r => ({
        functionResponse: { name: r.name, response: { result: r.result } },
      }))
      if (autoChains.length > 0) {
        const autoTexts = results.slice(results.length - autoChains.length)
          .map(r => `[보충 조회: ${TOOL_DISPLAY_NAMES[r.name] || r.name}]\n${r.result}`)
          .join('\n\n')
        responseParts.push({ text: autoTexts })
      }
      messages.push({ role: 'user', parts: responseParts })

      turnCount++
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error)
      // Sanitize: strip API keys and Bearer tokens that may leak from error messages
      const message = rawMessage
        .replace(/key=\S+/gi, 'key=[REDACTED]')
        .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
        .slice(0, 200)
      warnings.push(`Gemini API 오류: ${message}`)
      yield { type: 'error', message }
      break
    }
  }

  if (turnCount > maxToolTurns) {
    warnings.push('도구 호출 횟수 제한에 도달했습니다.')
  }
}
