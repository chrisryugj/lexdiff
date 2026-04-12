/**
 * FC-RAG Primary 엔진
 * Hermes Agent API (OpenAI-compatible, localhost:8642)를 통한 실시간 SSE 전달.
 * GPT-5.4 + korean-law-mcp v3.2.1 (18도구).
 */

import { executeTool } from './tool-adapter'
import { buildSystemPrompt } from './prompts'
import { TOOL_DISPLAY_NAMES } from './tool-tiers'
import { parseCitationsFromAnswer } from './citations'
import { summarizeToolResult, getToolCallQuery } from './result-utils'
import { callAnthropicStream, type DirectMessage } from './hermes-client'
import {
  type FCRAGStreamEvent,
  type RAGStreamOptions,
  getConversationContext,
  storeConversation,
  handleFastPath,
  inferComplexity,
  inferQueryType,
  getMaxClaudeTurns,
} from './engine-shared'

/**
 * FC-RAG 스트리밍 실행 (Primary)
 * Hermes Gateway(localhost:8642, OpenAI-compatible /v1/chat/completions, stream:true)에 HTTP SSE fetch.
 * Hermes가 GPT-5.4(Codex OAuth) + korean-law-mcp를 자식 프로세스로 관리하며, lexdiff는 MCP를 직접 다루지 않음.
 * (함수명 executeClaudeRAGStream은 legacy — 실제 LLM은 Hermes 경유 GPT-5.4)
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
  const prevContext = await getConversationContext(conversationId)

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
  // H-ARC2: 매 tool 호출 전후로 signal.aborted 체크 → 취소 시 즉시 중단.
  // 기존 구현은 tool 호출 사이에 체크가 없어 사용자 취소 후에도 3-4회 추가 호출 진행.
  const checkAbort = (): boolean => {
    if (signal?.aborted) return true
    return false
  }

  if (!collectedEvidence && !checkAbort()) {
    const preResults: string[] = []

    if (complexity === 'simple') {
      yield { type: 'status', message: '관련 법령 사전 검색 중...', progress: 12 }
      if (checkAbort()) return
      const aiSearch = await executeTool('search_ai_law', { query }, signal)
      if (checkAbort()) return
      if (!aiSearch.isError && aiSearch.result.length > 200) {
        yield { type: 'tool_call', name: 'search_ai_law', displayName: TOOL_DISPLAY_NAMES['search_ai_law'], query }
        yield { type: 'tool_result', name: 'search_ai_law', displayName: TOOL_DISPLAY_NAMES['search_ai_law'], success: true, summary: summarizeToolResult('search_ai_law', aiSearch) }
        preResults.push(aiSearch.result)
      }
    } else if (complexity === 'moderate') {
      yield { type: 'status', message: '도메인별 법령 사전 수집 중...', progress: 12 }
      if (checkAbort()) return
      const aiSearch = await executeTool('search_ai_law', { query }, signal)
      if (checkAbort()) return
      if (!aiSearch.isError && aiSearch.result.length > 200) {
        yield { type: 'tool_call', name: 'search_ai_law', displayName: TOOL_DISPLAY_NAMES['search_ai_law'], query }
        yield { type: 'tool_result', name: 'search_ai_law', displayName: TOOL_DISPLAY_NAMES['search_ai_law'], success: true, summary: summarizeToolResult('search_ai_law', aiSearch) }
        preResults.push(aiSearch.result)

        const extractedLaw = aiSearch.result.match(/📜\s+(.+?)(?:\n|$)/)?.[1]?.trim()
          || query.match(/「([^」]+)」/)?.[1]
          || query.match(/([\w가-힣]+법)/)?.[1]

        if (queryType === 'consequence' && extractedLaw) {
          if (checkAbort()) return
          const penaltySearch = await executeTool('search_ai_law', { query: `${extractedLaw} 벌칙 과태료` }, signal)
          if (checkAbort()) return
          if (!penaltySearch.isError && penaltySearch.result.length > 100) {
            yield { type: 'tool_call', name: 'search_ai_law', displayName: '벌칙 조문 검색', query: `${extractedLaw} 벌칙` }
            yield { type: 'tool_result', name: 'search_ai_law', displayName: '벌칙 조문 검색', success: true, summary: summarizeToolResult('search_ai_law', penaltySearch) }
            preResults.push(penaltySearch.result)
          }
        } else if (queryType === 'scope' && extractedLaw) {
          if (checkAbort()) return
          const annexSearch = await executeTool('get_annexes', { lawName: extractedLaw }, signal)
          if (checkAbort()) return
          if (!annexSearch.isError && annexSearch.result.length > 100) {
            yield { type: 'tool_call', name: 'get_annexes', displayName: '별표/서식 조회', query: extractedLaw }
            yield { type: 'tool_result', name: 'get_annexes', displayName: '별표/서식 조회', success: true, summary: summarizeToolResult('get_annexes', annexSearch) }
            preResults.push(annexSearch.result)
          }
        } else if (queryType === 'procedure') {
          const lawName = extractedLaw || query.replace(/절차|방법|신청|어떻게/g, '').trim().slice(0, 20)
          if (checkAbort()) return
          const threeSearch = await executeTool('search_ai_law', { query: `${lawName} 절차 신청 서류` }, signal)
          if (checkAbort()) return
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

  // ── Full Pipeline: Hermes Gateway SSE로 실시간 tool_call/tool_result 추적 ──
  const systemPrompt = buildSystemPrompt(complexity, queryType, query, false)

  yield { type: 'status', message: 'AI가 법령을 검색하고 있습니다...', progress: 15 }

  if (signal?.aborted) {
    yield { type: 'status', message: '검색이 취소되었습니다.', progress: 0 }
    return
  }

  try {
    const hasEvidence = !!collectedEvidence
    let userContent: string
    let maxTurns: number

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
        yield { type: 'answer_token', data: { text: event.text } }
      } else if (event.type === 'result') {
        const answer = event.text?.trim()
        if (!answer || answer.length < 10) {
          throw new Error('Claude 응답이 비어있습니다.')
        }

        // 메타 답변 감지: 실질 내용 없는 응답 → Gemini 폴백 유도
        // F10: 키워드 매칭이 핵심 신호. 짧은 정의형 답변(80~100자)도 정상이므로 length 기준 완화
        const hasMetaPhrase = /추가\s*조회|추가.*필요|부족|확인되지\s*않|수집.*없|확인하겠|조회하겠|검색하겠/.test(answer)
        const isMetaAnswer =
          answer.length < 40 ||                       // 너무 짧은 응답만 무조건 reject
          (answer.length < 200 && hasMetaPhrase)      // 메타 키워드 있을 때만 200자 미만 reject
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
        await storeConversation(conversationId, query, answer)

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

    throw new Error('Claude CLI 스트림에서 결과를 받지 못했습니다.')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warnings.push(`Claude 오류: ${message}`)
    yield { type: 'error', message }
  }
}
