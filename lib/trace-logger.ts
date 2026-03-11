/**
 * Structured trace logger for FC-RAG pipeline.
 * Stores traces in memory with FIFO eviction (max 200 traces).
 * Each trace is identified by a traceId and contains ordered events.
 */

export interface TraceEvent {
  ts: string // ISO timestamp
  event: string // e.g., 'request_start', 'bridge_attempt', 'gemini_fallback', 'tool_call', 'answer', 'error'
  data: Record<string, unknown>
  latencyMs?: number
}

export interface Trace {
  traceId: string
  query: string
  startedAt: string
  completedAt?: string
  source?: 'openclaw' | 'gemini'
  events: TraceEvent[]
}

// Generate traceId: ld-{timestamp}-{random6}
export function generateTraceId(): string {
  return `ld-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

class TraceLogger {
  private traces = new Map<string, Trace>()
  private traceOrder: string[] = [] // for FIFO eviction
  private maxTraces = 200

  startTrace(traceId: string, query: string): void {
    if (this.traces.size >= this.maxTraces) {
      // FIFO: remove oldest
      const oldest = this.traceOrder.shift()
      if (oldest) this.traces.delete(oldest)
    }
    const trace: Trace = {
      traceId,
      query,
      startedAt: new Date().toISOString(),
      events: [],
    }
    this.traces.set(traceId, trace)
    this.traceOrder.push(traceId)
  }

  addEvent(traceId: string, event: string, data: Record<string, unknown>, latencyMs?: number): void {
    const trace = this.traces.get(traceId)
    if (!trace) return
    trace.events.push({
      ts: new Date().toISOString(),
      event,
      data,
      latencyMs,
    })
  }

  completeTrace(traceId: string, source?: 'openclaw' | 'gemini'): void {
    const trace = this.traces.get(traceId)
    if (!trace) return
    trace.completedAt = new Date().toISOString()
    if (source) trace.source = source
  }

  getTrace(traceId: string): Trace | undefined {
    return this.traces.get(traceId)
  }

  getRecentTraces(count: number = 10): Trace[] {
    return this.traceOrder
      .slice(-count)
      .reverse()
      .map(id => this.traces.get(id))
      .filter((t): t is Trace => t !== undefined)
  }

  getAllTraces(): Trace[] {
    return this.traceOrder
      .map(id => this.traces.get(id))
      .filter((t): t is Trace => t !== undefined)
      .reverse()
  }
}

// Singleton
export const traceLogger = new TraceLogger()
