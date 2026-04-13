/**
 * FC-RAG API endpoint with SSE streaming.
 *
 * ── LLM 구성 ──
 * Primary : Hermes Agent API (GPT-5.4)
 *   로컬: localhost:8642 직접 호출
 *   Vercel: CF Worker → Quick Tunnel → Hermes API (동일 경로)
 * Fallback: Gemini Flash — Hermes 불능 시
 */

import { NextRequest } from "next/server"
import { debugLogger } from "@/lib/debug-logger"
import { verifyAllCitations, type Citation, type VerifiedCitation } from "@/lib/citation-verifier"
import { executeClaudeRAGStream, executeGeminiRAGStream, type FCRAGCitation } from "@/lib/fc-rag/engine"
import {
  getUsageWarningMessage,
  recordAITokens,
} from "@/lib/usage-tracker"
import { requireAiAuth } from "@/lib/api-auth"
import { generateTraceId, traceLogger } from "@/lib/trace-logger"
import { appendQueryLog, type QueryLogEntry } from "@/lib/query-logger"
import { logAIQueryIfConsented } from "@/lib/ai-query-logger"
import { getClientIP } from "@/lib/get-client-ip"
import { validate, ragRequestSchema, createErrorResponse } from "@/lib/api-validation"

/**
 * M5: citation 검증 블록 공통화.
 * Hermes/Gemini 양쪽 경로에서 20줄 중복이었던 로직을 한 곳에 모음.
 * - 10초 timeout
 * - 실패 시 모든 citation을 verified:false + 'skipped'로 처리
 * - 결과를 `citation_verification` 이벤트로 flush
 */
export async function streamCitationVerification(
  citations: FCRAGCitation[],
  sendAndLog: (event: unknown) => void,
): Promise<void> {
  if (citations.length === 0) return
  try {
    const { verifiable, skipped } = convertForVerification(citations)
    if (verifiable.length === 0) return
    sendAndLog({ type: "status", message: "인용 법조문 검증 중...", progress: 95 })
    const verified: VerifiedCitation[] = await Promise.race<VerifiedCitation[]>([
      verifyAllCitations(verifiable),
      new Promise<VerifiedCitation[]>((_, reject) =>
        setTimeout(() => reject(new Error('citation verification timeout')), 10_000),
      ),
    ]).catch(() =>
      verifiable.map<VerifiedCitation>((c) => ({
        ...c,
        verified: false,
        verificationMethod: 'skipped',
      })),
    )
    sendAndLog({ type: "citation_verification", citations: [...verified, ...skipped] })
  } catch (error) {
    debugLogger.error("[FC-RAG] Citation verification failed:", error)
  }
}

function convertForVerification(fcCitations: FCRAGCitation[]): {
  verifiable: Citation[]
  skipped: VerifiedCitation[]
} {
  const verifiable: Citation[] = []
  const skipped: VerifiedCitation[] = []

  for (const citation of fcCitations) {
    if (/^제?\d+조(?:의\d+)?(?:의\d+)?/.test(citation.articleNumber)) {
      verifiable.push({
        lawName: citation.lawName,
        articleNum: citation.articleNumber,
        text: citation.chunkText,
        source: citation.source,
      })
      continue
    }

    skipped.push({
      lawName: citation.lawName,
      articleNum: citation.articleNumber,
      text: citation.chunkText,
      source: citation.source,
      verified: false,
      verificationMethod: "skipped",
    })
  }

  return { verifiable, skipped }
}

// AbortSignal.any 폴백 — Node 20.3 미만 / 일부 엣지 런타임 대비
export function combineSignals(signals: AbortSignal[]): AbortSignal {
  if (typeof (AbortSignal as unknown as { any?: unknown }).any === 'function') {
    return (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any(signals)
  }
  const controller = new AbortController()
  const onAbort = (reason: unknown) => {
    if (!controller.signal.aborted) controller.abort(reason)
  }
  for (const s of signals) {
    if (s.aborted) {
      onAbort(s.reason)
      break
    }
    s.addEventListener('abort', () => onAbort(s.reason), { once: true })
  }
  return controller.signal
}

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request)
  const userApiKey = request.headers.get("X-User-API-Key") || undefined

  if (userApiKey && !/^AIzaSy[A-Za-z0-9_-]{33}$/.test(userApiKey)) {
    return Response.json({ error: "API key format is invalid." }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return createErrorResponse("Invalid JSON body", 400)
  }

  const validation = validate(ragRequestSchema, body)
  if (!validation.success) {
    return createErrorResponse(validation.error, 400)
  }

  const { query, conversationId, preEvidence } = validation.data

  // Supabase 사용자 인증 + 기능별 쿼터 (BYOK 시 스킵)
  const auth = await requireAiAuth(request, 'fc_rag')
  if ('error' in auth) return auth.error
  const authedUserId = auth.ctx.userId

  const traceId = generateTraceId()
  traceLogger.startTrace(traceId, query)

  const encoder = new TextEncoder()
  const abortController = new AbortController()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          // controller already closed (client disconnected)
        }
      }

      // ── 질의 로그 수집기 ──
      const logStartMs = Date.now()
      const logTools: string[] = []
      let logAnswerLen = 0
      let logCitationCount = 0
      let logVerifiedCount = 0
      let logComplexity = ''
      let logQueryType = ''
      let logError: string | null = null
      let logAnswerText = ''
      const logToolCalls: Array<{ name: string; args?: unknown }> = []

      const sendAndLog = (data: unknown) => {
        const evt = data as Record<string, unknown>
        if (evt.type === 'tool_call' && evt.name) {
          logTools.push(evt.name as string)
          logToolCalls.push({ name: evt.name as string, args: evt.args })
        }
        if (evt.type === 'answer') {
          const d = evt.data as Record<string, unknown> | undefined
          logAnswerText = String(d?.answer || '')
          logAnswerLen = logAnswerText.length
          logCitationCount = (d?.citations as unknown[] || []).length
          logComplexity = String(d?.complexity || '')
          logQueryType = String(d?.queryType || '')
        }
        if (evt.type === 'citation_verification') {
          const cits = (evt.citations as Array<{ verified?: boolean }> | undefined) || []
          logVerifiedCount = cits.filter((c) => c?.verified).length
        }
        if (evt.type === 'error') logError = String(evt.message || 'unknown')
        send(data)
      }

      // request.signal + cancel() 양쪽 모두 반응하는 합성 signal (E1: 폴백 적용)
      const combinedSignal = combineSignals([request.signal, abortController.signal])
      // E2: 동일 응답 안에서 token 이중 차감 방지
      let tokensRecorded = false

      try {
        let handled = false
        let source: 'hermes' | 'gemini' = 'gemini'

        // ── Hermes Primary ──
        // 사용자 자체 API 키 사용 시엔 Gemini로 직행 (Hermes 비용 도용 차단)
        // 🔴 HERMES 임시 비활성화 — 60s 타임아웃 이슈 해결 전까지 Gemini only
        //    살릴 때: DISABLE_HERMES 환경변수 제거 또는 'false' 로 설정 (2026-04-13)
        const HERMES_DISABLED = process.env.DISABLE_HERMES !== 'false'
        if (!HERMES_DISABLED && !userApiKey) {
          try {
          traceLogger.addEvent(traceId, 'hermes_start', {})
          sendAndLog({ type: "status", message: "AI 엔진 연결 중...", progress: 2 })

          let lastAnswerCitations: FCRAGCitation[] = []

          const isTransient = (msg: string) => /타임아웃|timeout|ECONNRESET|EPIPE|ETIMEDOUT/i.test(msg)
          let cliSuccess = false

          // H-RAG2: 하이브리드 buffering.
          //  - attempt 0: 즉시 스트리밍 (사용자 체감 레이턴시 우선)
          //  - attempt 1+: buffer 후 성공 확정시에만 일괄 flush
          //  → 실패한 시도의 partial answer_token이 클라이언트에 남지 않음.
          type StreamEvent = Parameters<typeof send>[0]
          for (let attempt = 0; attempt < 2 && !cliSuccess; attempt++) {
            const isRetry = attempt > 0
            const retryBuffer: StreamEvent[] = []
            const emit = (event: StreamEvent) => {
              if (isRetry) retryBuffer.push(event)
              else sendAndLog(event)
            }

            if (isRetry) {
              // 이전 시도에서 send된 partial 데이터를 클라에서 초기화시킴
              sendAndLog({ type: "stream_reset", reason: "retry" })
              sendAndLog({ type: "status", message: "Hermes 타임아웃 — 재시도 중...", progress: 3 })
              traceLogger.addEvent(traceId, 'hermes_retry', { attempt })
            }

            let claudeHadError = false
            let errorMessage = ''

            for await (const event of executeClaudeRAGStream(query, {
              signal: combinedSignal,
              conversationId,
              preEvidence,
            })) {
              if (event.type === "error") {
                claudeHadError = true
                errorMessage = event.message
                traceLogger.addEvent(traceId, 'hermes_internal_error', { message: event.message })
                continue
              }
              if (claudeHadError && event.type === "answer") continue

              if (event.type === "answer") {
                lastAnswerCitations = event.data.citations || []
                if (!tokensRecorded) {
                  tokensRecorded = true
                  const usageStats = await recordAITokens(clientIP, event.data.answer.length)
                  const warningMessage = getUsageWarningMessage(usageStats)
                  if (warningMessage) {
                    const warnings = [...(event.data.warnings || []), warningMessage]
                    emit({ ...event, data: { ...event.data, warnings } })
                    continue
                  }
                }
              }

              emit(event)
            }

            if (!claudeHadError) {
              // retry 성공 시 버퍼링된 이벤트 일괄 flush
              if (isRetry) {
                for (const bufferedEvent of retryBuffer) sendAndLog(bufferedEvent)
              }
              cliSuccess = true
            } else if (attempt === 0 && isTransient(errorMessage)) {
              continue // 1회 재시도
            } else {
              throw new Error('Hermes internal error, falling back to Gemini')
            }
          }

          if (!cliSuccess) throw new Error('Hermes API failed after retries')

          // M5: Citation 검증 (양쪽 경로 공통 헬퍼)
          await streamCitationVerification(lastAnswerCitations, sendAndLog)

          handled = true
          source = 'hermes'
          traceLogger.completeTrace(traceId, 'hermes')
          } catch (hermesError) {
            traceLogger.addEvent(traceId, 'hermes_failed', {
              message: hermesError instanceof Error ? hermesError.message : 'unknown',
              fallback: 'gemini',
            })
          }
        }

        // ── Gemini Fallback ──
        if (!handled) {
          // F1: Hermes 도중에 흘려보낸 답변/툴 로그가 있다면 클라에서 비우게 함
          sendAndLog({ type: "stream_reset", reason: "fallback" })
          sendAndLog({ type: "status", message: "Gemini 엔진으로 전환 중...", progress: 3 })
          traceLogger.addEvent(traceId, 'gemini_start', {})

          let lastAnswerCitations: FCRAGCitation[] = []
          let geminiAnswerSent = false

          for await (const event of executeGeminiRAGStream(query, {
            apiKey: userApiKey,
            signal: combinedSignal,
            conversationId,
            preEvidence,
          })) {
            if (event.type === "answer") {
              geminiAnswerSent = true
              lastAnswerCitations = event.data.citations || []

              if (!userApiKey && !tokensRecorded) {
                tokensRecorded = true
                const usageStats = await recordAITokens(clientIP, event.data.answer.length)
                const warningMessage = getUsageWarningMessage(usageStats)

                if (warningMessage) {
                  const warnings = [...(event.data.warnings || []), warningMessage]
                  sendAndLog({ ...event, data: { ...event.data, warnings } })
                  continue
                }
              }
            }

            sendAndLog(event)
          }

          // 안전장치: Hermes+Gemini 모두 answer를 보내지 못한 경우
          if (!geminiAnswerSent) {
            sendAndLog({
              type: "answer",
              data: {
                answer: "죄송합니다. AI 엔진에 일시적 문제가 발생하여 답변을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
                citations: [],
                confidenceLevel: "low",
                complexity: "simple",
                queryType: "application",
                warnings: ["Hermes 및 Gemini 엔진 모두 응답 실패"],
              },
            })
          }

          // M5: Citation 검증 (헬퍼 재사용)
          await streamCitationVerification(lastAnswerCitations, sendAndLog)

          source = 'gemini'
          traceLogger.completeTrace(traceId, 'gemini')
        }

        sendAndLog({ type: 'source', source })

        // ── 질의 로그 기록 ──
        appendQueryLog({
          ts: new Date().toISOString(),
          traceId,
          query,
          source,
          model: source === 'hermes' ? 'gpt-5.4' : 'gemini-flash',
          env: process.env.VERCEL ? 'vercel' : 'local',
          complexity: logComplexity,
          queryType: logQueryType,
          durationMs: Date.now() - logStartMs,
          tools: logTools,
          answerLength: logAnswerLen,
          citationCount: logCitationCount,
          verifiedCount: logVerifiedCount,
          error: logError,
        })

        // Supabase 로그 (opt-in 동의한 사용자만, fire-and-forget)
        logAIQueryIfConsented({
          userId: authedUserId,
          query,
          answer: logAnswerText,
          source,
          model: source === 'hermes' ? 'gpt-5.4' : 'gemini-flash',
          queryType: logQueryType,
          toolCalls: logToolCalls,
          latencyMs: Date.now() - logStartMs,
          citationCount: logCitationCount,
          verifiedCount: logVerifiedCount,
        }).catch(() => { /* already swallowed inside */ })
      } catch (error) {
        logError = error instanceof Error ? error.message : 'unknown'
        traceLogger.addEvent(traceId, 'error', { message: logError })
        sendAndLog({
          type: "error",
          message: "AI 검색 처리 중 오류가 발생했습니다. 다시 시도해 주세요.",
        })
        // 에러 시에도 로그 기록
        appendQueryLog({
          ts: new Date().toISOString(),
          traceId,
          query,
          source: 'gemini',
          model: 'error',
          env: process.env.VERCEL ? 'vercel' : 'local',
          complexity: logComplexity,
          queryType: logQueryType,
          durationMs: Date.now() - logStartMs,
          tools: logTools,
          answerLength: 0,
          citationCount: 0,
          verifiedCount: 0,
          error: logError,
        })
      } finally {
        controller.close()
      }
    },
    cancel() {
      abortController.abort()
    },
  })

  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  }

  return new Response(stream, { headers })
}
