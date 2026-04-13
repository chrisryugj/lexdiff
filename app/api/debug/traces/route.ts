/**
 * Debug endpoint for FC-RAG trace inspection.
 * GET /api/debug/traces?traceId=xxx — specific trace
 * GET /api/debug/traces?last=10 — recent traces summary
 *
 * Only active in development (NODE_ENV !== 'production').
 */

import { NextRequest } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { traceLogger } from '@/lib/trace-logger'

export async function GET(request: NextRequest) {
  // Only allow in development — block production and preview environments
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview') {
    return Response.json({ error: 'Not available' }, { status: 404 })
  }

  // Token-based authentication required — no token configured = endpoint disabled
  const debugToken = process.env.DEBUG_TRACE_TOKEN
  if (!debugToken) {
    return Response.json({ error: 'Not available' }, { status: 404 })
  }
  // M10: timingSafeEqual은 buffer 길이 불일치 시 throw.
  // 멀티바이트 문자열/잘못된 길이로 500 유발 가능 → try/catch로 감싸 401 반환.
  const authHeader = request.headers.get('authorization')
  const expected = `Bearer ${debugToken}`
  let authOk = false
  try {
    if (authHeader && authHeader.length === expected.length) {
      const a = Buffer.from(authHeader)
      const b = Buffer.from(expected)
      if (a.length === b.length) {
        authOk = timingSafeEqual(a, b)
      }
    }
  } catch {
    authOk = false
  }
  if (!authOk) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const traceId = searchParams.get('traceId')
  const last = searchParams.get('last')

  if (traceId) {
    const trace = traceLogger.getTrace(traceId)
    if (!trace) {
      return Response.json({ error: 'Trace not found' }, { status: 404 })
    }
    return Response.json(trace)
  }

  const count = last ? parseInt(last, 10) || 10 : 10
  const traces = traceLogger.getRecentTraces(count)

  // Return summary view (without full event details for list)
  const summaries = traces.map(t => ({
    traceId: t.traceId,
    query: t.query.slice(0, 100),
    source: t.source,
    startedAt: t.startedAt,
    completedAt: t.completedAt,
    eventCount: t.events.length,
  }))

  return Response.json({ traces: summaries, total: summaries.length })
}
