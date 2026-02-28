/**
 * FC-RAG API Endpoint (SSE 스트리밍)
 *
 * 도구 호출 과정을 실시간 SSE 이벤트로 전송.
 * 클라이언트에서 검색→분석→답변 과정을 실시간으로 표시.
 *
 * SSE 이벤트 형식:
 *   data: {"type":"status","message":"...","progress":10}
 *   data: {"type":"tool_call","name":"search_law","displayName":"법령 검색","query":"..."}
 *   data: {"type":"tool_result","name":"search_law","displayName":"법령 검색","success":true,"summary":"..."}
 *   data: {"type":"answer_token","data":{"text":"..."}}    ← 스트리밍 토큰 (OpenClaw)
 *   data: {"type":"answer","data":{answer,citations,confidenceLevel,complexity,warnings}}
 *   data: {"type":"error","message":"..."}
 */

import { executeRAGStream } from '@/lib/fc-rag/engine'
import { isOpenClawHealthy, fetchFromOpenClaw } from '@/lib/openclaw-client'
import { recordAIUsage, isQuotaExceeded, getUsageHeaders, getUsageWarningMessage } from '@/lib/usage-tracker'
import { NextRequest } from 'next/server'

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const realIP = request.headers.get('x-real-ip')
  if (realIP) return realIP
  return '127.0.0.1'
}

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request)
  const userApiKey = request.headers.get('X-User-API-Key') || undefined

  // BYO-Key가 없을 때만 쿼터 검사
  if (!userApiKey && isQuotaExceeded(clientIP)) {
    return Response.json(
      { error: '일일 AI 검색 한도를 초과했습니다. 내일 다시 시도해주세요.' },
      { status: 429, headers: getUsageHeaders(clientIP) }
    )
  }

  let query: string
  let conversationId: string | undefined
  try {
    const body = await request.json()
    query = body.query
    conversationId = body.conversationId || undefined
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!query || typeof query !== 'string') {
    return Response.json({ error: 'Query is required' }, { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        // OpenClaw 우선 시도 (활성화 + 건강 상태 확인)
        let openClawHandled = false
        if (process.env.OPENCLAW_ENABLED === 'true' && await isOpenClawHealthy()) {
          send({ type: 'status', message: 'AI 엔진 연결 중...', progress: 2 })
          openClawHandled = await fetchFromOpenClaw(query, send, { conversationId })
        }

        // OpenClaw 실패/비활성 → 기존 Gemini fallback
        if (!openClawHandled) {
          if (process.env.OPENCLAW_ENABLED === 'true') {
            send({ type: 'status', message: 'AI 엔진 전환 중...', progress: 3 })
          }

          for await (const event of executeRAGStream(query, userApiKey)) {
            // answer 이벤트에 사용량 경고 추가
            if (event.type === 'answer' && !userApiKey) {
              const usageStats = recordAIUsage(clientIP, event.data.answer.length)
              const warningMessage = getUsageWarningMessage(usageStats)
              if (warningMessage) {
                const warnings = [...(event.data.warnings || []), warningMessage]
                send({ ...event, data: { ...event.data, warnings } })
                continue
              }
            }
            send(event)
          }
        }
      } catch (error) {
        send({
          type: 'error',
          message: error instanceof Error ? error.message : 'FC-RAG 처리 중 오류',
        })
      } finally {
        controller.close()
      }
    },
  })

  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  }

  // 사용량 헤더 추가
  if (!userApiKey) {
    const usageHeaders = getUsageHeaders(clientIP)
    for (const [key, value] of Object.entries(usageHeaders)) {
      headers[key] = value as string
    }
  }

  return new Response(stream, { headers })
}
