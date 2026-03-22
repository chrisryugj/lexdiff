/**
 * FC-RAG API endpoint with SSE streaming.
 *
 * ── LLM 구성 ──
 * Primary : Claude CLI (미니PC subprocess 또는 Bridge 프록시)
 * Fallback: Gemini Flash — Claude 불능 시
 *
 * ── 환경 분기 ──
 * 미니PC (로컬): executeClaudeRAGStream → claude.exe subprocess 직접
 * Vercel (배포): fetchFromOpenClaw → CF Worker → Tunnel → Bridge → Gateway → Claude CLI
 */

import { NextRequest } from "next/server"
import { verifyAllCitations, type Citation, type VerifiedCitation } from "@/lib/citation-verifier"
import { executeClaudeRAGStream, executeGeminiRAGStream, type FCRAGCitation } from "@/lib/fc-rag/engine"
import { fetchFromOpenClaw, isOpenClawHealthy } from "@/lib/openclaw-client"
import {
  getUsageHeaders,
  getUsageWarningMessage,
  isQuotaExceeded,
  recordAITokens,
  recordAIUsage,
} from "@/lib/usage-tracker"
import { generateTraceId, traceLogger } from "@/lib/trace-logger"
import { appendQueryLog, type QueryLogEntry } from "@/lib/query-logger"

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

function getClientIP(request: NextRequest): string {
  const vercelIP = request.headers.get("x-vercel-forwarded-for")
  if (vercelIP) return vercelIP.split(",")[0].trim()

  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()

  const realIP = request.headers.get("x-real-ip")
  if (realIP) return realIP

  return "127.0.0.1"
}

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request)
  const userApiKey = request.headers.get("X-User-API-Key") || undefined

  if (userApiKey && !/^AIzaSy[A-Za-z0-9_-]{33}$/.test(userApiKey)) {
    return Response.json({ error: "API key format is invalid." }, { status: 400 })
  }

  let query: string
  let conversationId: string | undefined
  let preEvidence: string | undefined

  try {
    const body = await request.json()
    query = body.query
    conversationId = body.conversationId || undefined
    preEvidence = typeof body.preEvidence === 'string' ? body.preEvidence.slice(0, 5000) : undefined
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!query || typeof query !== "string") {
    return Response.json({ error: "Query is required" }, { status: 400 })
  }

  if (query.length > 2000) {
    return Response.json({ error: "Query too long (max 2000 chars)" }, { status: 400 })
  }

  let usageHeaders: Record<string, string> | undefined
  if (!userApiKey) {
    if (await isQuotaExceeded(clientIP)) {
      return Response.json(
        { error: "일일 AI 검색 시도를 초과했습니다. 내일 다시 시도해 주세요." },
        { status: 429, headers: await getUsageHeaders(clientIP) }
      )
    }

    await recordAIUsage(clientIP)
    usageHeaders = await getUsageHeaders(clientIP)
  }

  const traceId = generateTraceId()
  traceLogger.startTrace(traceId, query)

  const encoder = new TextEncoder()

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

      const sendAndLog = (data: unknown) => {
        const evt = data as Record<string, unknown>
        if (evt.type === 'tool_call' && evt.name) logTools.push(evt.name as string)
        if (evt.type === 'answer') {
          const d = evt.data as Record<string, unknown> | undefined
          logAnswerLen = String(d?.answer || '').length
          logCitationCount = (d?.citations as unknown[] || []).length
          logComplexity = String(d?.complexity || '')
          logQueryType = String(d?.queryType || '')
        }
        if (evt.type === 'citation_verification') {
          logVerifiedCount = ((evt.citations as unknown[]) || []).filter((c: any) => c?.verified).length
        }
        if (evt.type === 'error') logError = String(evt.message || 'unknown')
        send(data)
      }

      try {
        let handled = false
        let source: 'claude' | 'gemini' = 'gemini'

        // ── Claude Primary (환경별 분기) ──
        // 미니PC: CLI subprocess 직접 / Vercel: Bridge 프록시 (CF Worker → Tunnel → 미니PC)
        try {
          traceLogger.addEvent(traceId, 'claude_start', {})
          sendAndLog({ type: "status", message: "AI 엔진 연결 중...", progress: 2 })

          let lastAnswerCitations: FCRAGCitation[] = []

          if (process.env.VERCEL) {
            // ── Vercel: Bridge 프록시 경유 ──
            const bridgeHealthy = await isOpenClawHealthy()
            if (!bridgeHealthy) throw new Error('Bridge unavailable')

            traceLogger.addEvent(traceId, 'bridge_start', {})

            const wrappedSend = (data: unknown) => {
              const evt = data as Record<string, unknown>
              if (evt?.type === 'answer') {
                const answerData = evt.data as Record<string, unknown> | undefined
                lastAnswerCitations = (answerData?.citations || []) as FCRAGCitation[]
                if (!userApiKey && answerData?.answer) {
                  recordAITokens(clientIP, String(answerData.answer).length).then(usageStats => {
                    const warningMessage = getUsageWarningMessage(usageStats)
                    if (warningMessage) {
                      sendAndLog({ type: "status", message: warningMessage, progress: 99 })
                    }
                  }).catch(() => {})
                }
              }
              sendAndLog(data)
            }

            const success = await fetchFromOpenClaw(query, wrappedSend, {
              abortSignal: request.signal,
              conversationId,
              preEvidence,
            })

            if (!success) throw new Error('Bridge returned failure')
          } else {
            // ── 미니PC: CLI subprocess 직접 (transient error 시 1회 재시도) ──
            const isTransient = (msg: string) => /타임아웃|timeout|ECONNRESET|EPIPE|ETIMEDOUT/i.test(msg)
            let cliSuccess = false

            for (let attempt = 0; attempt < 2 && !cliSuccess; attempt++) {
              if (attempt > 0) {
                sendAndLog({ type: "status", message: "Claude 타임아웃 — 재시도 중...", progress: 3 })
                traceLogger.addEvent(traceId, 'claude_retry', { attempt })
              }

              let claudeHadError = false
              let errorMessage = ''

              for await (const event of executeClaudeRAGStream(query, {
                signal: request.signal,
                conversationId,
                preEvidence,
              })) {
                if (event.type === "error") {
                  claudeHadError = true
                  errorMessage = event.message
                  traceLogger.addEvent(traceId, 'claude_internal_error', { message: event.message })
                  continue
                }
                if (claudeHadError && event.type === "answer") continue

                if (event.type === "answer") {
                  lastAnswerCitations = event.data.citations || []
                  if (!userApiKey) {
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

              if (!claudeHadError) {
                cliSuccess = true
              } else if (attempt === 0 && isTransient(errorMessage)) {
                continue // 1회 재시도
              } else {
                throw new Error('Claude internal error, falling back to Gemini')
              }
            }

            if (!cliSuccess) throw new Error('Claude CLI failed after retries')
          }

          // Citation 검증 (양쪽 경로 공통)
          if (lastAnswerCitations.length > 0) {
            try {
              const { verifiable, skipped } = convertForVerification(lastAnswerCitations)
              if (verifiable.length > 0) {
                sendAndLog({ type: "status", message: "인용 법조문 검증 중...", progress: 95 })
                const verified = await verifyAllCitations(verifiable)
                sendAndLog({ type: "citation_verification", citations: [...verified, ...skipped] })
              }
            } catch (error) {
              console.error("[FC-RAG] Citation verification failed:", error)
            }
          }

          handled = true
          source = 'claude'
          traceLogger.completeTrace(traceId, 'openclaw')
        } catch (claudeError) {
          traceLogger.addEvent(traceId, 'claude_failed', {
            message: claudeError instanceof Error ? claudeError.message : 'unknown',
            fallback: 'gemini',
          })
        }

        // ── Gemini Fallback ──
        if (!handled) {
          sendAndLog({ type: "status", message: "Gemini 엔진으로 전환 중...", progress: 3 })
          traceLogger.addEvent(traceId, 'gemini_start', {})

          let lastAnswerCitations: FCRAGCitation[] = []
          let geminiAnswerSent = false

          for await (const event of executeGeminiRAGStream(query, {
            apiKey: userApiKey,
            signal: request.signal,
            conversationId,
            preEvidence,
          })) {
            if (event.type === "answer") {
              geminiAnswerSent = true
              lastAnswerCitations = event.data.citations || []

              if (!userApiKey) {
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

          // 안전장치: Claude+Gemini 모두 answer를 보내지 못한 경우
          if (!geminiAnswerSent) {
            sendAndLog({
              type: "answer",
              data: {
                answer: "죄송합니다. AI 엔진에 일시적 문제가 발생하여 답변을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
                citations: [],
                confidenceLevel: "low",
                complexity: "simple",
                queryType: "application",
                warnings: ["Claude 및 Gemini 엔진 모두 응답 실패"],
              },
            })
          }

          if (lastAnswerCitations.length > 0) {
            try {
              const { verifiable, skipped } = convertForVerification(lastAnswerCitations)
              if (verifiable.length > 0) {
                sendAndLog({ type: "status", message: "인용 법조문 검증 중...", progress: 95 })
                const verified = await verifyAllCitations(verifiable)
                sendAndLog({ type: "citation_verification", citations: [...verified, ...skipped] })
              }
            } catch (error) {
              console.error("[FC-RAG] Citation verification failed:", error)
            }
          }

          source = 'gemini'
          traceLogger.completeTrace(traceId, 'gemini')
        }

        // Vercel+Claude 경로: Bridge(openclaw-client.ts)가 이미 source:'openclaw' 전송 → 중복 방지
        if (!(process.env.VERCEL && source === 'claude')) {
          sendAndLog({ type: 'source', source })
        }

        // ── 질의 로그 기록 ──
        appendQueryLog({
          ts: new Date().toISOString(),
          traceId,
          query,
          source,
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
  })

  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  }

  if (usageHeaders) {
    for (const [key, value] of Object.entries(usageHeaders)) {
      headers[key] = value
    }
  }

  return new Response(stream, { headers })
}
