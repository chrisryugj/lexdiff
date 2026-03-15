/**
 * 법령 영향 추적기 SSE API 엔드포인트
 *
 * fc-rag/route.ts 패턴 복제:
 * - IP 추출 + 할당량 확인
 * - ReadableStream + AsyncGenerator → SSE
 * - AbortSignal 전달
 */

import { NextRequest } from 'next/server'
import { executeImpactAnalysis } from '@/lib/impact-tracker/engine'
import {
  getUsageHeaders,
  isQuotaExceeded,
  recordAIUsage,
} from '@/lib/usage-tracker'

function getClientIP(request: NextRequest): string {
  const vercelIP = request.headers.get('x-vercel-forwarded-for')
  if (vercelIP) return vercelIP.split(',')[0].trim()

  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()

  const realIP = request.headers.get('x-real-ip')
  if (realIP) return realIP

  return '127.0.0.1'
}

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request)

  // Body 파싱
  let lawNames: string[]
  let dateFrom: string
  let dateTo: string
  let mode: 'impact' | 'ordinance-sync' = 'impact'
  let region: string | undefined

  try {
    const body = await request.json()
    lawNames = body.lawNames
    dateFrom = body.dateFrom
    dateTo = body.dateTo
    mode = body.mode || 'impact'
    region = body.region
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // 입력 검증
  if (!Array.isArray(lawNames) || lawNames.length === 0 || lawNames.length > 5) {
    return Response.json(
      { error: '법령명은 1~5개까지 입력 가능합니다.' },
      { status: 400 },
    )
  }

  if (!dateFrom || !dateTo || !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return Response.json(
      { error: '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).' },
      { status: 400 },
    )
  }

  // 할당량 확인
  if (await isQuotaExceeded(clientIP)) {
    return Response.json(
      { error: '일일 AI 검색 시도를 초과했습니다. 내일 다시 시도해 주세요.' },
      { status: 429, headers: await getUsageHeaders(clientIP) },
    )
  }

  const usageHeaders = await getUsageHeaders(clientIP)
  const userApiKey = request.headers.get('X-User-API-Key') || undefined
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let usageRecorded = false
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        for await (const event of executeImpactAnalysis(
          { lawNames, dateFrom, dateTo, mode, region },
          { signal: request.signal, apiKey: userApiKey },
        )) {
          // 첫 번째 의미 있는 이벤트 수신 시 사용량 기록
          if (!usageRecorded && (event as { type?: string }).type !== 'error') {
            await recordAIUsage(clientIP)
            usageRecorded = true
          }
          send(event)
        }
      } catch (error) {
        send({
          type: 'error',
          message: '영향 분석 처리 중 오류가 발생했습니다.',
          recoverable: false,
        })
      } finally {
        controller.close()
      }
    },
  })

  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  }

  for (const [key, value] of Object.entries(usageHeaders)) {
    headers[key] = value
  }

  return new Response(stream, { headers })
}
