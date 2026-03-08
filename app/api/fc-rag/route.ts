/**
 * FC-RAG API endpoint with SSE streaming.
 */

import { NextRequest } from "next/server"
import { verifyAllCitations, type Citation, type VerifiedCitation } from "@/lib/citation-verifier"
import { executeRAGStream, type FCRAGCitation } from "@/lib/fc-rag/engine"
import { fetchFromOpenClaw, isOpenClawHealthy } from "@/lib/openclaw-client"
import {
  getUsageHeaders,
  getUsageWarningMessage,
  isQuotaExceeded,
  recordAITokens,
  recordAIUsage,
} from "@/lib/usage-tracker"

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

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        let openClawHandled = false

        if (process.env.OPENCLAW_ENABLED === "true" && await isOpenClawHealthy()) {
          send({ type: "status", message: "AI 엔진 연결 중...", progress: 2 })
          openClawHandled = await fetchFromOpenClaw(query, send, {
            conversationId,
            abortSignal: request.signal,
          })
        }

        if (!openClawHandled) {
          if (process.env.OPENCLAW_ENABLED === "true") {
            send({ type: "status", message: "Gemini 엔진으로 전환 중...", progress: 3 })
          }

          let lastAnswerCitations: FCRAGCitation[] = []

          for await (const event of executeRAGStream(query, {
            apiKey: userApiKey,
            signal: request.signal,
            conversationId,
          })) {
            if (event.type === "answer") {
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
        }
      } catch (error) {
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
