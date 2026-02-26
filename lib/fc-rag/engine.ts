/**
 * FC-RAG Engine - Function Calling 기반 RAG 엔진
 *
 * File Search Store를 대체하는 핵심 엔진.
 * korean-law-mcp 도구를 Gemini Function Calling으로 호출하여
 * 법제처 API 실시간 데이터 기반 답변 생성.
 */

import { GoogleGenAI } from '@google/genai'
import { quickClassify } from '@/lib/ai-agents/router-agent'
import { getSpecialistPrompt, MAX_TOKENS_BY_COMPLEXITY } from '@/lib/ai-agents/specialist-agents'
import { getToolDeclarations, executeTool, executeToolsParallel, type ToolCallResult } from './tool-adapter'
import type { QueryType, QueryComplexity } from '@/lib/ai-agents/types'

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
  queryType: QueryType
  warnings?: string[]
}

// ─── 설정 ───

const MAX_TOOL_TURNS = 1  // 최대 추가 턴 (총 2턴: 도구+답변)
const MODEL = 'gemini-2.5-flash'

// ─── search_law 결과 파싱 유틸 ───

interface LawEntry { name: string; mst: string }

/** search_law 결과 텍스트에서 법령명-MST 쌍 추출 (압축/원본 양쪽 대응) */
function parseLawEntries(text: string): LawEntry[] {
  const entries: LawEntry[] = []
  // 압축 포맷: "1. 관세법 (MST:268725, 법률)"
  // 원본 포맷: "1. 관세법\n   - 법령ID: ...\n   - MST: 268725"
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
  // 「관세법」 또는 일반 "~법" 패턴 추출
  const nameMatch = query.match(/「([^」]+)」/) || query.match(/([\w가-힣]+법)/)
  const target = nameMatch?.[1]
  if (target) {
    // exact match
    const exact = entries.find(e => e.name === target)
    if (exact) return exact.mst
    // prefix match (가장 짧은 이름 = 가장 정확)
    const prefixed = entries
      .filter(e => e.name.startsWith(target))
      .sort((a, b) => a.name.length - b.name.length)
    if (prefixed.length > 0) return prefixed[0].mst
  }
  return entries[0].mst
}

// ─── 메인 엔진 ───

/**
 * FC-RAG 실행
 * @param query 유저 질문
 * @param geminiApiKey BYO-Key (없으면 서버 키 사용)
 */
export async function executeRAG(
  query: string,
  geminiApiKey?: string
): Promise<FCRAGResult> {
  const effectiveKey = geminiApiKey || process.env.GEMINI_API_KEY
  if (!effectiveKey) {
    throw new Error('Gemini API 키가 설정되지 않았습니다.')
  }

  const warnings: string[] = []

  // 1. 규칙 기반 분류 (0ms, LLM 없음)
  const { type: queryType } = quickClassify(query)
  const complexity = inferComplexity(query)

  // 2. Specialist Prompt 선택 + 도구 규칙
  const toolGuide = `\n\n## 도구 사용 규칙 (엄격 준수)
1. 사용자 질문에 언급된 법령명을 **정확히** search_law의 query로 사용하세요. 질문과 다른 법령을 검색하면 오답입니다.
2. search_law 결과의 MST 값으로 get_law_text(mst="해당값")을 호출하세요.
3. 특정 조문이 필요하면 jo 파라미터를 사용하세요. 예: get_law_text(mst="268725", jo="38")
4. 판례가 필요하면 search_precedents로 검색하세요.`
  const systemPrompt = getSpecialistPrompt(queryType, complexity) + toolGuide

  // 3. Gemini + Function Calling
  const ai = new GoogleGenAI({ apiKey: effectiveKey })
  const toolDeclarations = getToolDeclarations()

  // 메시지 히스토리
  const messages: Array<{
    role: 'user' | 'model'
    parts: any[]
  }> = [
    { role: 'user', parts: [{ text: query }] },
  ]

  let allToolResults: ToolCallResult[] = []
  let turnCount = 0
  let latestSearchEntries: LawEntry[] = []

  // 4. 멀티턴 Function Calling 루프
  while (turnCount <= MAX_TOOL_TURNS) {
    try {
      const isLastTurn = turnCount === MAX_TOOL_TURNS
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: messages,
        config: {
          systemInstruction: systemPrompt,
          tools: [{ functionDeclarations: toolDeclarations }],
          temperature: 0,
          maxOutputTokens: MAX_TOKENS_BY_COMPLEXITY[complexity],
        },
      })

      const candidate = response.candidates?.[0]
      if (!candidate?.content?.parts) {
        warnings.push('Gemini 응답이 비어있습니다.')
        break
      }

      const parts = candidate.content.parts
      const functionCalls = parts.filter((p: any) => p.functionCall)

      // 텍스트 답변 추출 (도구 호출 없거나, 텍스트도 함께 포함)
      if (functionCalls.length === 0) {
        const textParts = parts.filter((p: any) => p.text)
        const answer = textParts.map((p: any) => p.text).join('')
        return {
          answer,
          citations: buildCitations(allToolResults, answer),
          confidenceLevel: calcConfidence(allToolResults),
          queryType,
          warnings: warnings.length > 0 ? warnings : undefined,
        }
      }

      // 마지막 턴에서 도구 호출 → 무시하고 텍스트 답변 강제
      if (isLastTurn) {
        const textParts = parts.filter((p: any) => p.text)
        if (textParts.length > 0) {
          const answer = textParts.map((p: any) => p.text).join('')
          return {
            answer,
            citations: buildCitations(allToolResults, answer),
            confidenceLevel: calcConfidence(allToolResults),
            queryType,
            warnings: warnings.length > 0 ? warnings : undefined,
          }
        }
        // 텍스트 없으면 "답변하세요" 프롬프트로 재시도
        messages.push({ role: 'model', parts })
        messages.push({
          role: 'user',
          parts: [{ text: '수집된 정보를 바탕으로 한국어로 답변해주세요. 추가 도구 호출 없이 바로 답변하세요.' }],
        })
        const retry = await ai.models.generateContent({
          model: MODEL,
          contents: messages,
          config: { systemInstruction: systemPrompt, temperature: 0, maxOutputTokens: MAX_TOKENS_BY_COMPLEXITY[complexity] },
        })
        const retryParts = retry.candidates?.[0]?.content?.parts || []
        const retryText = retryParts.filter((p: any) => p.text).map((p: any) => p.text).join('')
        return {
          answer: retryText || '답변 생성에 실패했습니다.',
          citations: buildCitations(allToolResults, retryText),
          confidenceLevel: calcConfidence(allToolResults),
          queryType,
          warnings: warnings.length > 0 ? warnings : undefined,
        }
      }

      // Function Call 실행
      const calls = functionCalls.map((p: any) => ({
        name: p.functionCall.name as string,
        args: (p.functionCall.args || {}) as Record<string, unknown>,
      }))

      // 파라미터 보정: Gemini가 잘못 보낸 MST/jo를 엔진에서 교정
      for (const call of calls) {
        if (call.name === 'get_law_text') {
          // MST 보정: 환각된 MST → search_law 결과 기반 교정
          if (call.args.mst && latestSearchEntries.length > 0) {
            const knownMSTs = new Set(latestSearchEntries.map(e => e.mst))
            if (!knownMSTs.has(call.args.mst as string)) {
              const corrected = findBestMST(latestSearchEntries, query)
              if (corrected) {
                call.args.mst = corrected
              }
            }
          }
          // jo 포맷 정규화: "38" → "제38조", "38의2" → "제38조의2"
          if (call.args.jo) {
            const jo = String(call.args.jo)
            if (/^\d+$/.test(jo)) {
              call.args.jo = `제${jo}조`
            } else if (/^\d+의\d+$/.test(jo)) {
              call.args.jo = `제${jo.replace(/(\d+)의(\d+)/, '$1조의$2')}`
            }
          }
        }
      }

      const results = await executeToolsParallel(calls)
      allToolResults.push(...results)

      // search_law 결과 추적 (MST 보정용)
      for (const r of results) {
        if (r.name === 'search_law' && !r.isError) {
          latestSearchEntries = parseLawEntries(r.result)
        }
      }

      // Auto-chain: search_law 성공 시 자동으로 get_law_text 실행
      const searchOK = results.filter(r => r.name === 'search_law' && !r.isError)
      const alreadyGotLawText = results.some(r => r.name === 'get_law_text' && !r.isError)
      let autoChainArgs: Record<string, unknown> | null = null

      if (searchOK.length > 0 && !alreadyGotLawText) {
        const bestMST = findBestMST(latestSearchEntries, query)
        if (bestMST) {
          const joMatch = query.match(/제(\d+)조(?:의(\d+))?/)
          autoChainArgs = { mst: bestMST }
          if (joMatch) {
            autoChainArgs.jo = joMatch[2]
              ? `제${joMatch[1]}조의${joMatch[2]}`
              : `제${joMatch[1]}조`
          }

          const autoResult = await executeTool('get_law_text', autoChainArgs)
          allToolResults.push(autoResult)

          if (!autoResult.isError) {
            results.push(autoResult)
          }
        }
      }

      // 에러 도구 경고
      const errors = results.filter(r => r.isError)
      if (errors.length > 0) {
        warnings.push(...errors.map(e => `도구 오류 (${e.name}): ${e.result.slice(0, 100)}`))
      }

      // 모델 응답 + 도구 결과를 히스토리에 추가
      // auto-chain 실행 시, 합성 functionCall을 model parts에 추가
      // (Gemini는 functionResponse마다 대응하는 functionCall을 요구)
      const modelParts = [...parts]
      if (autoChainArgs) {
        modelParts.push({
          functionCall: {
            name: 'get_law_text',
            args: autoChainArgs,
          },
        } as any)
      }

      messages.push({
        role: 'model',
        parts: modelParts,
      })

      messages.push({
        role: 'user',
        parts: results.map(r => ({
          functionResponse: {
            name: r.name,
            response: { result: r.result },
          },
        })),
      })

      turnCount++
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      warnings.push(`Gemini API 오류: ${message}`)
      break
    }
  }

  // 루프 종료 (정상적으로는 위에서 텍스트 답변이 생성됨)
  // 여기에 도달하면 에러 또는 예외 상황
  if (turnCount > MAX_TOOL_TURNS) {
    warnings.push('도구 호출 횟수 제한에 도달했습니다.')
  }

  return {
    answer: '죄송합니다. 답변을 생성하는 중 오류가 발생했습니다. 다시 시도해주세요.',
    citations: buildCitations(allToolResults),
    confidenceLevel: 'low',
    queryType,
    warnings: warnings.length > 0 ? warnings : undefined,
  }
}

// ─── 유틸 ───

/**
 * 질문 길이/엔티티 수 기반 복잡도 추론
 */
function inferComplexity(query: string): QueryComplexity {
  const lawMatches = query.match(/「([^」]+)」/g) || []
  const articleMatches = query.match(/제\d+조(?:의\d+)?/g) || []

  if (lawMatches.length > 1 || articleMatches.length > 2 || query.length > 100) {
    return 'complex'
  }
  if (query.length > 50 || articleMatches.length > 0) {
    return 'moderate'
  }
  return 'simple'
}

/**
 * 도구 결과에서 Citation 구성 (답변 텍스트 기반 필터링)
 * answerText가 있으면 답변에 언급된 조문만 citation으로 포함
 */
function buildCitations(toolResults: ToolCallResult[], answerText?: string): FCRAGCitation[] {
  const citations: FCRAGCitation[] = []
  const seen = new Set<string>()

  // 답변에 언급된 조문 Set (있으면 필터링, 없으면 전체 포함)
  const mentionedArticles = answerText
    ? new Set(
        Array.from(answerText.matchAll(/제(\d+)조(?:의(\d+))?/g))
          .map(m => m[2] ? `제${m[1]}조의${m[2]}` : `제${m[1]}조`)
      )
    : null

  for (const result of toolResults) {
    if (result.isError) continue

    const text = result.result

    // search_law → citation 생략 (법령명만으로는 가치 없음, get_law_text에서 생성)

    // get_law_text 결과에서 법령명 + 조문 추출
    if (result.name === 'get_law_text') {
      const lawNameMatch = text.match(/(?:##\s+|법령명:\s*)(.+?)(?:\n|$)/)
      const lawName = lawNameMatch?.[1]?.trim() || ''

      for (const match of Array.from(text.matchAll(/제(\d+)조(?:의(\d+))?(?:\(([^)]+)\))?/g))) {
        const articleNum = match[2] ? `제${match[1]}조의${match[2]}` : `제${match[1]}조`

        // 답변 기반 필터: 언급된 조문만 포함
        if (mentionedArticles && !mentionedArticles.has(articleNum)) continue

        const key = `${lawName}:${articleNum}`
        if (!seen.has(key)) {
          seen.add(key)
          const idx = text.indexOf(match[0])
          const chunkText = text.slice(Math.max(0, idx), Math.min(text.length, idx + 200))
          citations.push({
            lawName,
            articleNumber: articleNum,
            chunkText,
            source: 'get_law_text',
          })
        }
      }
    }

    // search_precedents / get_precedent_text
    if (result.name === 'search_precedents' || result.name === 'get_precedent_text') {
      for (const match of Array.from(text.matchAll(/사건번호[:\s]+(\S+)/g))) {
        const caseNo = match[1]
        if (!seen.has(caseNo)) {
          seen.add(caseNo)
          citations.push({
            lawName: '판례',
            articleNumber: caseNo,
            chunkText: text.slice(0, 200),
            source: result.name,
          })
        }
      }
    }

    // search_interpretations
    if (result.name === 'search_interpretations') {
      for (const match of Array.from(text.matchAll(/(?:해석례|회신번호)[:\s]+(\S+)/g))) {
        const interpNo = match[1]
        if (!seen.has(interpNo)) {
          seen.add(interpNo)
          citations.push({
            lawName: '법령해석례',
            articleNumber: interpNo,
            chunkText: text.slice(0, 200),
            source: 'search_interpretations',
          })
        }
      }
    }
  }

  return citations
}

/**
 * 도구 결과 기반 신뢰도 계산
 */
function calcConfidence(toolResults: ToolCallResult[]): 'high' | 'medium' | 'low' {
  const successful = toolResults.filter(r => !r.isError)
  if (successful.length >= 3) return 'high'
  if (successful.length >= 1) return 'medium'
  return 'low'
}
