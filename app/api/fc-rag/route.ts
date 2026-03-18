/**
 * FC-RAG API endpoint with SSE streaming.
 *
 * ── LLM 구성 ──
 * Primary : OpenClaw Bridge (미니PC Claude CLI via Cloudflare Tunnel)
 * Fallback: Gemini Flash — Bridge 불능 시
 */

import { NextRequest } from "next/server"
import { verifyAllCitations, type Citation, type VerifiedCitation } from "@/lib/citation-verifier"
import { executeGeminiRAGStream, type FCRAGCitation } from "@/lib/fc-rag/engine"
import { fetchFromOpenClaw, isOpenClawHealthy } from "@/lib/openclaw-client"
import {
  getUsageHeaders,
  getUsageWarningMessage,
  isQuotaExceeded,
  recordAITokens,
  recordAIUsage,
} from "@/lib/usage-tracker"
import { generateTraceId, traceLogger } from "@/lib/trace-logger"

function convertForVerification(fcCitations: FCRAGCitation[]): {
  verifiable: Citation[]
  skipped: VerifiedCitation[]
} {
  const verifiable: Citation[] = []
  const skipped: VerifiedCitation[] = []

  for (const citation of fcCitations) {
    if (/^제?\d+조/.test(citation.articleNumber)) {
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

  try {
    const body = await request.json()
    query = body.query
    conversationId = body.conversationId || undefined
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
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        let handled = false
        let source: 'claude' | 'gemini' = 'gemini'

        // ── OpenClaw Bridge Primary (미니PC Claude CLI via Cloudflare Tunnel) ──
        try {
          const bridgeHealthy = await isOpenClawHealthy()
          if (!bridgeHealthy) {
            throw new Error('OpenClaw Bridge unavailable')
          }

          traceLogger.addEvent(traceId, 'openclaw_start', {})

          let lastAnswerCitations: FCRAGCitation[] = []

          // fetchFromOpenClaw이 send()를 직접 호출하므로, 래핑하여 citations 캡처 + usage 추적
          const wrappedSend = (data: unknown) => {
            const event = data as Record<string, unknown>

            if (event?.type === 'answer') {
              const answerData = event.data as Record<string, unknown> | undefined
              lastAnswerCitations = (answerData?.citations || []) as FCRAGCitation[]

              if (!userApiKey && answerData?.answer) {
                // usage tracking은 비동기이지만 SSE 전송을 막지 않도록 fire-and-forget
                recordAITokens(clientIP, String(answerData.answer).length).then(usageStats => {
                  const warningMessage = getUsageWarningMessage(usageStats)
                  if (warningMessage) {
                    send({ type: "status", message: warningMessage, progress: 99 })
                  }
                }).catch(() => {})
              }
            }

            send(data)
          }

          const success = await fetchFromOpenClaw(query, wrappedSend, {
            abortSignal: request.signal,
            conversationId,
          })

          if (!success) {
            throw new Error('OpenClaw Bridge returned failure')
          }

          // Citation 검증
          if (lastAnswerCitations.length > 0) {
            try {
              const { verifiable, skipped } = convertForVerification(lastAnswerCitations)
              if (verifiable.length > 0) {
                send({ type: "status", message: "인용 법조문 검증 중...", progress: 95 })
                const verified = await verifyAllCitations(verifiable)
                send({ type: "citation_verification", citations: [...verified, ...skipped] })
              }
            } catch (error) {
              console.error("[FC-RAG] Citation verification failed:", error)
            }
          }

          handled = true
          source = 'claude'
          traceLogger.completeTrace(traceId, 'openclaw')
        } catch (bridgeError) {
          traceLogger.addEvent(traceId, 'openclaw_failed', {
            message: bridgeError instanceof Error ? bridgeError.message : 'unknown',
            fallback: 'gemini',
          })
        }

        // ── Gemini Fallback ──
        if (!handled) {
          send({ type: "status", message: "Gemini 엔진으로 전환 중...", progress: 3 })
          traceLogger.addEvent(traceId, 'gemini_start', {})

          let lastAnswerCitations: FCRAGCitation[] = []
          let geminiAnswerSent = false

          for await (const event of executeGeminiRAGStream(query, {
            apiKey: userApiKey,
            signal: request.signal,
            conversationId,
          })) {
            if (event.type === "answer") {
              geminiAnswerSent = true
              lastAnswerCitations = event.data.citations || []

              if (!userApiKey) {
                const usageStats = await recordAITokens(clientIP, event.data.answer.length)
                const warningMessage = getUsageWarningMessage(usageStats)

                if (warningMessage) {
                  const warnings = [...(event.data.warnings || []), warningMessage]
                  send({ ...event, data: { ...event.data, warnings } })
                  continue
                }
              }
            }

            send(event)
          }

          // 안전장치: Claude도 Gemini도 answer를 보내지 못한 경우 에러 답변 전송
          if (!geminiAnswerSent) {
            send({
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
                send({ type: "status", message: "인용 법조문 검증 중...", progress: 95 })
                const verified = await verifyAllCitations(verifiable)
                send({ type: "citation_verification", citations: [...verified, ...skipped] })
              }
            } catch (error) {
              console.error("[FC-RAG] Citation verification failed:", error)
            }
          }

          source = 'gemini'
          traceLogger.completeTrace(traceId, 'gemini')
        }

        send({ type: 'source', source })
      } catch (error) {
        traceLogger.addEvent(traceId, 'error', { message: error instanceof Error ? error.message : 'unknown' })
        send({
          type: "error",
          message: "AI 검색 처리 중 오류가 발생했습니다. 다시 시도해 주세요.",
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
