/**
 * FC-RAG Engine - Function Calling 기반 RAG 엔진
 *
 * korean-law-mcp 도구를 Gemini Function Calling으로 호출하여
 * 법제처 API 실시간 데이터 기반 답변 생성.
 *
 * SSE 스트리밍 지원: executeRAGStream()으로 도구 호출 과정을 실시간 전송
 */

import { GoogleGenAI } from '@google/genai'
import { getToolDeclarations, executeTool, executeToolsParallel, type ToolCallResult } from './tool-adapter'

type QueryComplexity = 'simple' | 'moderate' | 'complex'

// ─── 타입 ───

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
  warnings?: string[]
}

// ─── SSE 스트림 이벤트 타입 ───

export type FCRAGStreamEvent =
  | { type: 'status'; message: string; progress: number }
  | { type: 'tool_call'; name: string; displayName: string; query?: string }
  | { type: 'tool_result'; name: string; displayName: string; success: boolean; summary: string }
  | { type: 'answer'; data: FCRAGResult }
  | { type: 'error'; message: string }

// ─── 설정 ───

const MODEL = 'gemini-3-flash-preview'

const MAX_TOKENS: Record<QueryComplexity, number> = {
  simple: 3072,
  moderate: 4096,
  complex: 6144,
}

const LENGTH_HINT: Record<QueryComplexity, string> = {
  simple: '800자 이내로 간결하게',
  moderate: '1500자 이내',
  complex: '2500자 이내',
}

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  search_law: '법령 검색',
  get_law_text: '법령 본문 조회',
  search_precedents: '판례 검색',
  get_precedent_text: '판례 본문 조회',
  search_interpretations: '해석례 검색',
  get_interpretation_text: '해석례 본문 조회',
  get_three_tier: '위임법령 조회',
  compare_old_new: '신구법 대조',
  get_article_history: '조문 이력 조회',
}

// ─── 프롬프트 ───

function buildSystemPrompt(complexity: QueryComplexity): string {
  return `한국 법령 전문가. 도구로 조회한 법령 데이터만 참고하여 정확하게 답변하세요.

## 답변 형식 (공문 스타일)
1. **결론 먼저** (두괄식): 핵심 답변을 첫 1-2문장으로 명확히 요약
2. **본문 개조식**: 세부 내용은 번호로 구조화
   - 대항목: 1., 2., 3.
   - 소항목: 가., 나., 다.
3. **근거 법령**: 각 항목에 「법령명」 제N조 형식으로 인용
4. **참고사항**: 주의점이나 예외사항은 마지막에 별도 기재

## 문체 규칙
- 해요체 사용
- 법률용어 첫 등장시 괄호 풀이 (예: "선의(사정을 모르는 것)")
- 핵심 항만 부분 인용 (전문 복사 금지)
- 도구로 확인되지 않은 조문번호를 추측하여 인용하지 마세요
- ${LENGTH_HINT[complexity]}

## 도구 사용
1. 사용자 질문에 언급된 법령명을 정확히 search_law의 query로 사용하세요.
2. search_law 결과의 MST 값으로 get_law_text를 호출하세요.
3. 특정 조문이 필요하면 jo 파라미터를 사용하세요.
4. 판례가 필요하면 search_precedents로 검색하세요.`
}

/** complexity 기반 최대 도구 턴 수 */
function getMaxToolTurns(complexity: QueryComplexity): number {
  switch (complexity) {
    case 'simple': return 1
    case 'moderate': return 2
    case 'complex': return 4
  }
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
  return entries[0].mst
}

// ─── 도구 결과 요약 유틸 (SSE용) ───

function summarizeToolResult(name: string, result: ToolCallResult): string {
  if (result.isError) return `오류: ${result.result.slice(0, 60)}`

  const text = result.result
  switch (name) {
    case 'search_law': {
      const countMatch = text.match(/총 (\d+)건/)
      const entries = parseLawEntries(text)
      const firstName = entries[0]?.name
      if (countMatch && firstName) {
        return entries.length > 1 ? `${firstName} 외 ${entries.length - 1}건` : firstName
      }
      return firstName || '검색 완료'
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
    default: return '완료'
  }
}

function getToolCallQuery(name: string, args: Record<string, unknown>): string | undefined {
  switch (name) {
    case 'search_law': return args.query as string
    case 'get_law_text': return args.jo ? `${args.jo}` : undefined
    case 'search_precedents': return args.query as string
    case 'search_interpretations': return args.query as string
    default: return undefined
  }
}

/** 파라미터 보정: Gemini가 잘못 보낸 MST/jo를 엔진에서 교정 */
function correctToolArgs(
  calls: Array<{ name: string; args: Record<string, unknown> }>,
  latestSearchEntries: LawEntry[],
  query: string
) {
  for (const call of calls) {
    if (call.name === 'get_law_text') {
      if (call.args.mst && latestSearchEntries.length > 0) {
        const knownMSTs = new Set(latestSearchEntries.map(e => e.mst))
        if (!knownMSTs.has(call.args.mst as string)) {
          const corrected = findBestMST(latestSearchEntries, query)
          if (corrected) call.args.mst = corrected
        }
      }
      if (call.args.jo) {
        const jo = String(call.args.jo)
        if (/^\d+$/.test(jo)) call.args.jo = `제${jo}조`
        else if (/^\d+의\d+$/.test(jo)) call.args.jo = `제${jo.replace(/(\d+)의(\d+)/, '$1조의$2')}`
      }
    }
  }
}

// ─── 메인 엔진 (SSE 스트림) ───

/**
 * FC-RAG 스트리밍 실행 (SSE용 AsyncGenerator)
 * 도구 호출 과정을 실시간으로 yield
 */
export async function* executeRAGStream(
  query: string,
  geminiApiKey?: string
): AsyncGenerator<FCRAGStreamEvent> {
  const effectiveKey = geminiApiKey || process.env.GEMINI_API_KEY
  if (!effectiveKey) {
    yield { type: 'error', message: 'Gemini API 키가 설정되지 않았습니다.' }
    return
  }

  const warnings: string[] = []
  const complexity = inferComplexity(query)
  const maxToolTurns = getMaxToolTurns(complexity)
  const complexityLabel = complexity === 'simple' ? '단순' : complexity === 'moderate' ? '보통' : '복합'

  yield { type: 'status', message: `질문 분석 완료 (${complexityLabel})`, progress: 8 }

  const systemPrompt = buildSystemPrompt(complexity)
  const ai = new GoogleGenAI({ apiKey: effectiveKey })
  const toolDeclarations = getToolDeclarations()

  const messages: Array<{ role: 'user' | 'model'; parts: any[] }> = [
    { role: 'user', parts: [{ text: query }] },
  ]

  let allToolResults: ToolCallResult[] = []
  let turnCount = 0
  let latestSearchEntries: LawEntry[] = []
  const failureCount = new Map<string, number>()

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
      if (!candidate?.content?.parts) {
        warnings.push('Gemini 응답이 비어있습니다.')
        break
      }

      const parts = candidate.content.parts
      const functionCalls = parts.filter((p: any) => p.functionCall)

      // 텍스트 답변 (도구 호출 없음) → 완료
      if (functionCalls.length === 0) {
        const answer = parts.filter((p: any) => p.text).map((p: any) => p.text).join('')
        yield { type: 'status', message: '답변을 정리하고 있습니다...', progress: 92 }
        yield {
          type: 'answer',
          data: {
            answer,
            citations: buildCitations(allToolResults, answer),
            confidenceLevel: calcConfidence(allToolResults),
            complexity,
            warnings: warnings.length > 0 ? warnings : undefined,
          },
        }
        return
      }

      // 마지막 턴: 도구 호출 무시, 텍스트 답변 강제
      if (isLastTurn) {
        const textParts = parts.filter((p: any) => p.text)
        if (textParts.length > 0) {
          const answer = textParts.map((p: any) => p.text).join('')
          yield { type: 'status', message: '답변을 정리하고 있습니다...', progress: 92 }
          yield {
            type: 'answer',
            data: {
              answer,
              citations: buildCitations(allToolResults, answer),
              confidenceLevel: calcConfidence(allToolResults),
              complexity,
              warnings: warnings.length > 0 ? warnings : undefined,
            },
          }
          return
        }
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
        const retryText = (retry.candidates?.[0]?.content?.parts || [])
          .filter((p: any) => p.text).map((p: any) => p.text).join('')
        yield {
          type: 'answer',
          data: {
            answer: retryText || '답변 생성에 실패했습니다.',
            citations: buildCitations(allToolResults, retryText),
            confidenceLevel: calcConfidence(allToolResults),
            complexity,
            warnings: warnings.length > 0 ? warnings : undefined,
          },
        }
        return
      }

      // ── Function Call 실행 ──
      const calls = functionCalls.map((p: any) => ({
        name: p.functionCall.name as string,
        args: (p.functionCall.args || {}) as Record<string, unknown>,
      }))

      correctToolArgs(calls, latestSearchEntries, query)

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

      // search_law 결과 추적 (MST 보정용)
      for (const r of results) {
        if (r.name === 'search_law' && !r.isError) {
          latestSearchEntries = parseLawEntries(r.result)
        }
      }

      // ── Auto-chain ──
      const autoChains: Array<{ name: string; args: Record<string, unknown> }> = []

      const searchOK = results.filter(r => r.name === 'search_law' && !r.isError)
      const alreadyGotLawText = results.some(r => r.name === 'get_law_text' && !r.isError)

      if (searchOK.length > 0 && !alreadyGotLawText) {
        const bestMST = findBestMST(latestSearchEntries, query)
        if (bestMST) {
          const joMatch = query.match(/제(\d+)조(?:의(\d+))?/)
          const args: Record<string, unknown> = { mst: bestMST }
          if (joMatch) {
            args.jo = joMatch[2] ? `제${joMatch[1]}조의${joMatch[2]}` : `제${joMatch[1]}조`
          }
          autoChains.push({ name: 'get_law_text', args })
        }
      }

      const interpSearchOK = results.filter(r => r.name === 'search_interpretations' && !r.isError)
      const alreadyGotInterpText = results.some(r => r.name === 'get_interpretation_text')
      if (interpSearchOK.length > 0 && !alreadyGotInterpText) {
        const idMatch = interpSearchOK[0].result.match(/(?:ID|id)[:\s]+(\S+)/)
        if (idMatch) autoChains.push({ name: 'get_interpretation_text', args: { id: idMatch[1] } })
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
        if (!autoResult.isError) results.push(autoResult)
      }

      // 에러 경고
      const errors = results.filter(r => r.isError)
      if (errors.length > 0) {
        warnings.push(...errors.map(e => `도구 오류 (${e.name}): ${e.result.slice(0, 100)}`))
      }

      // 히스토리 추가
      const modelParts = [...parts]
      for (const chain of autoChains) {
        modelParts.push({ functionCall: { name: chain.name, args: chain.args } } as any)
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
  for await (const event of executeRAGStream(query, geminiApiKey)) {
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

    if (result.name === 'get_law_text') {
      const lawNameMatch = text.match(/(?:##\s+|법령명:\s*)(.+?)(?:\n|$)/)
      const lawName = lawNameMatch?.[1]?.trim() || ''

      for (const match of Array.from(text.matchAll(/제(\d+)조(?:의(\d+))?(?:\(([^)]+)\))?/g))) {
        const articleNum = match[2] ? `제${match[1]}조의${match[2]}` : `제${match[1]}조`
        if (mentionedArticles && !mentionedArticles.has(articleNum)) continue

        const key = `${lawName}:${articleNum}`
        if (!seen.has(key)) {
          seen.add(key)
          const idx = text.indexOf(match[0])
          const chunkText = text.slice(Math.max(0, idx), Math.min(text.length, idx + 200))
          citations.push({ lawName, articleNumber: articleNum, chunkText, source: 'get_law_text' })
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
  }

  return citations
}

function calcConfidence(toolResults: ToolCallResult[]): 'high' | 'medium' | 'low' {
  const successful = toolResults.filter(r => !r.isError)
  if (successful.length >= 3) return 'high'
  if (successful.length >= 1) return 'medium'
  return 'low'
}
