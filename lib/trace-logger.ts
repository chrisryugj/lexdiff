/**
 * Structured trace logger for FC-RAG pipeline.
 * Stores traces in memory with FIFO eviction (max 200 traces).
 * Each trace is identified by a traceId and contains ordered events.
 * Completed traces are persisted to logs/fc-rag-traces.jsonl.
 */

import { appendFileSync, readFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const TRACE_LOG_DIR = join(process.cwd(), 'logs')
const TRACE_LOG_FILE = join(TRACE_LOG_DIR, 'fc-rag-traces.jsonl')
const HERMES_TRACE_DIR = process.env.HOME ? join(process.env.HOME, '.hermes', 'logs') : null
const HERMES_TRACE_FILE = HERMES_TRACE_DIR ? join(HERMES_TRACE_DIR, 'fc-rag-traces.jsonl') : null

export interface TraceEvent {
  ts: string // ISO timestamp
  event: string // e.g., 'request_start', 'bridge_attempt', 'gemini_fallback', 'tool_call', 'answer', 'error'
  data: Record<string, unknown>
  latencyMs?: number
}

export interface Trace {
  traceId: string
  // 법령질의(사용자 질문) 원문은 수집하지 않음 — traceId로만 상관관계 추적
  startedAt: string
  completedAt?: string
  source?: 'hermes' | 'gemini' | 'relay'
  events: TraceEvent[]
}

// Generate traceId: ld-{timestamp}-{random6}
export function generateTraceId(): string {
  return `ld-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** 디스크에서 trace 로그 읽기 (최근 N개) */
export function readTraceLog(count: number = 50): Trace[] {
  try {
    if (!existsSync(TRACE_LOG_FILE)) return []
    const content = readFileSync(TRACE_LOG_FILE, 'utf-8').trim()
    if (!content) return []
    const lines = content.split('\n')
    const recent = lines.slice(-count)
    return recent
      .map(line => { try { return JSON.parse(line) as Trace } catch { return null } })
      .filter((t): t is Trace => t !== null)
      .reverse()
  } catch { return [] }
}

/** traceId로 디스크에서 특정 trace 찾기 */
export function readTraceById(traceId: string): Trace | null {
  try {
    if (!existsSync(TRACE_LOG_FILE)) return null
    const content = readFileSync(TRACE_LOG_FILE, 'utf-8').trim()
    if (!content) return null
    const lines = content.split('\n')
    // 역순 탐색 (최근 것이 더 빠르게 발견)
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const trace = JSON.parse(lines[i]) as Trace
        if (trace.traceId === traceId) return trace
      } catch { continue }
    }
    return null
  } catch { return null }
}

class TraceLogger {
  private traces = new Map<string, Trace>()
  private traceOrder: string[] = [] // for FIFO eviction
  private maxTraces = 200

  startTrace(traceId: string): void {
    if (this.traces.size >= this.maxTraces) {
      // FIFO: remove oldest
      const oldest = this.traceOrder.shift()
      if (oldest) this.traces.delete(oldest)
    }
    const trace: Trace = {
      traceId,
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

  completeTrace(traceId: string, source?: 'hermes' | 'gemini' | 'relay'): void {
    const trace = this.traces.get(traceId)
    if (!trace) return
    trace.completedAt = new Date().toISOString()
    if (source) trace.source = source
    // 디스크에 영속화
    this.persistTrace(trace)
  }

  /** 완료된 trace를 JSONL 파일에 저장 */
  private persistTrace(trace: Trace): void {
    if (process.env.VERCEL) return
    const line = JSON.stringify(trace) + '\n'
    try {
      if (!existsSync(TRACE_LOG_DIR)) mkdirSync(TRACE_LOG_DIR, { recursive: true })
      appendFileSync(TRACE_LOG_FILE, line)
    } catch { /* 로깅 실패 무시 */ }
    if (HERMES_TRACE_DIR && HERMES_TRACE_FILE) {
      try {
        if (!existsSync(HERMES_TRACE_DIR)) mkdirSync(HERMES_TRACE_DIR, { recursive: true })
        appendFileSync(HERMES_TRACE_FILE, line)
      } catch { /* Hermes 미설치 시 무시 */ }
    }
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
