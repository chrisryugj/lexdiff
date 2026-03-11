/**
 * Debug endpoint for FC-RAG trace inspection.
 * GET /api/debug/traces?traceId=xxx — specific trace
 * GET /api/debug/traces?last=10 — recent traces summary
 *
 * Only active in development (NODE_ENV !== 'production').
 */

import { NextRequest } from 'next/server'
import { traceLogger } from '@/lib/trace-logger'

export async function GET(request: NextRequest) {
  // Only allow in development — block production and preview environments
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview') {
    return Response.json({ error: 'Not available' }, { status: 404 })
  }

  // Optional token-based authentication for non-production environments
  const debugToken = process.env.DEBUG_TRACE_TOKEN
  if (debugToken) {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || authHeader !== `Bearer ${debugToken}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
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
