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
import { requireAiAuth } from '@/lib/api-auth'

export async function POST(request: NextRequest) {
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
  if (
    !Array.isArray(lawNames) || lawNames.length === 0 || lawNames.length > 5 ||
    !lawNames.every((n: unknown) => typeof n === 'string' && n.length > 0 && n.length < 200)
  ) {
    return Response.json(
      { error: '법령명은 1~5개 문자열(200자 이내)만 허용됩니다.' },
      { status: 400 },
    )
  }

  if (!dateFrom || !dateTo || !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return Response.json(
      { error: '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).' },
      { status: 400 },
    )
  }

  // 인증 + 기능별 쿼터 (BYOK 시 스킵)
  const auth = await requireAiAuth(request, 'impact')
  if ('error' in auth) return auth.error
  const userApiKey = auth.ctx.byokKey || undefined
  const encoder = new TextEncoder()

  const abortController = new AbortController()

  // AbortSignal.any 폴백 (E1과 동일 패턴)
  const combineSignals = (signals: AbortSignal[]): AbortSignal => {
    if (typeof (AbortSignal as unknown as { any?: unknown }).any === 'function') {
      return (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any(signals)
    }
    const c = new AbortController()
    for (const s of signals) {
      if (s.aborted) { c.abort(s.reason); break }
      s.addEventListener('abort', () => c.abort(s.reason), { once: true })
    }
    return c.signal
  }

  const stream = new ReadableStream({
    cancel() {
      abortController.abort()
    },
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch { /* closed */ }
      }

      try {
        for await (const event of executeImpactAnalysis(
          { lawNames, dateFrom, dateTo, mode, region },
          { signal: combineSignals([request.signal, abortController.signal]), apiKey: userApiKey },
        )) {
          send(event)
        }
      } catch {
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

  return new Response(stream, { headers })
}
