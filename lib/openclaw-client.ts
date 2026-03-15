/**
 * OpenClaw 클라이언트 - 집 미니PC의 OpenClaw 봇과 통신
 *
 * JSON 응답 방식: Bridge에 질문 전송 → 완성된 답변 수신 → SSE 이벤트로 변환.
 * 대기 중 가짜 진행 UX 제공 (status 이벤트).
 */

import type { FCRAGResult } from '@/lib/fc-rag/engine'
import type { LegalQueryType } from '@/lib/fc-rag/prompts'

// ─── 설정 ───

const OPENCLAW_URL = process.env.OPENCLAW_URL || ''
const OPENCLAW_TOKEN = process.env.OPENCLAW_API_TOKEN || ''
const CF_ACCESS_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || ''
const CF_ACCESS_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || ''
const HEALTH_CHECK_INTERVAL = 30_000 // 30초
const OPENCLAW_TIMEOUT = 90_000 // 90초 (복잡한 법률 쿼리 대비)
const HEALTH_CHECK_TIMEOUT = 5_000 // 5초 (모바일 네트워크 지연 고려)

/** Cloudflare Access + Bridge 인증 헤더 */
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${OPENCLAW_TOKEN}`,
  }
  if (CF_ACCESS_CLIENT_ID) {
    headers['CF-Access-Client-Id'] = CF_ACCESS_CLIENT_ID
    headers['CF-Access-Client-Secret'] = CF_ACCESS_CLIENT_SECRET
  }
  return headers
}

// ─── 서킷 브레이커 (유형별 분류) ───

const CIRCUIT_FAILURE_THRESHOLD = 5 // 3→5 인프라 실패
const CIRCUIT_OPEN_DURATION = 2 * 60_000 // 5분→2분

let circuitFailureCount = 0
let circuitOpenUntil = 0
let circuitHalfOpen = false

// 인프라 실패만 서킷 브레이커 트리거
const INFRA_ERRORS = ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'HTTP_5xx', 'AbortError', 'timeout', 'fetch failed', 'no_reader']

function isInfraError(error: string): boolean {
  return INFRA_ERRORS.some(e => error.includes(e))
}

function isCircuitOpen(): boolean {
  if (circuitFailureCount < CIRCUIT_FAILURE_THRESHOLD) return false
  if (Date.now() > circuitOpenUntil) {
    if (!circuitHalfOpen) {
      circuitHalfOpen = true  // 첫 번째 호출만 probe 진행 (CAS 패턴)
      return false
    }
    return true  // 이미 probe 중이면 차단
  }
  return true
}

function recordSuccess(): void {
  circuitFailureCount = 0
  circuitOpenUntil = 0
  circuitHalfOpen = false
}

function recordFailure(error?: string): void {
  // Only infra errors trigger the circuit breaker
  if (error && !isInfraError(error)) {
    return // content / quality-gate errors are not infra failures
  }

  // Half-open probe failed — re-open immediately without waiting for threshold
  if (circuitHalfOpen) {
    circuitHalfOpen = false
    circuitOpenUntil = Date.now() + CIRCUIT_OPEN_DURATION
    return
  }

  circuitFailureCount++
  if (circuitFailureCount >= CIRCUIT_FAILURE_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_OPEN_DURATION
  }
}

// ─── SSE 이벤트 처리 (공통 함수) ───

interface SSEProcessState {
  gotDone: boolean
  finalData: OpenClawResponse | null
}

/** SSE 청크에서 eventType/eventData를 파싱 (multi-line data 대응) */
function parseSSEChunk(chunk: string): { eventType: string; eventData: string } {
  const lines = chunk.split('\n')
  let eventType = ''
  const dataLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('event: ')) eventType = line.slice(7).trim()
    else if (line.startsWith('data: ')) dataLines.push(line.slice(6))
  }

  return { eventType, eventData: dataLines.join('\n') }
}

/** SSE 이벤트 하나를 처리하여 send()로 전달 */
function processSSEEvent(
  eventType: string,
  eventData: string,
  send: (data: unknown) => void,
  state: SSEProcessState,
): void {
  if (!eventType || !eventData) return

  try {
    const parsed = JSON.parse(eventData)

    switch (eventType) {
      case 'status': {
        const BRIDGE_PHASE_PROGRESS: Record<string, number> = {
          cached: 90, fetching: 20, analyzing: 45,
          tools: 35, reasoning: 60, finalizing: 80,
        }
        send({
          type: 'status',
          message: parsed.message || '',
          progress: BRIDGE_PHASE_PROGRESS[parsed.phase] ?? 50,
        })
        break
      }

      case 'tool_call':
        send({
          type: 'tool_call',
          name: parsed.name,
          displayName: parsed.displayName || parsed.name,
          query: parsed.query || '',
        })
        break

      case 'tool_result':
        send({
          type: 'tool_result',
          name: parsed.name,
          displayName: parsed.displayName || parsed.name,
          success: parsed.success,
          summary: parsed.summary || '',
        })
        break

      case 'token':
        send({
          type: 'answer_token',
          data: { text: parsed.text },
        })
        break

      case 'done': {
        state.gotDone = true
        send({
          type: 'answer',
          data: {
            answer: String(parsed.answer || '').trim(),
            citations: parsed.citations || [],
            confidenceLevel: parsed.confidenceLevel || 'medium',
            complexity: parsed.complexity || 'moderate',
            queryType: (parsed.queryType || 'definition') as LegalQueryType,
            warnings: parsed.warnings,
          } satisfies FCRAGResult,
        })
        break
      }

      case 'error':
        console.error('[openclaw-client] bridge SSE error:', parsed.error)
        break
    }
  } catch {
    // malformed SSE data, skip
  }
}

// ─── 헬스체크 (캐시) ───

let healthCache = { healthy: false, checkedAt: 0 }

export async function isOpenClawHealthy(): Promise<boolean> {
  if (!OPENCLAW_URL) return false
  if (isCircuitOpen()) return false

  if (Date.now() - healthCache.checkedAt < HEALTH_CHECK_INTERVAL) {
    return healthCache.healthy
  }

  try {
    const res = await fetch(`${OPENCLAW_URL}/health`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT),
    })
    healthCache = { healthy: res.ok, checkedAt: Date.now() }
  } catch {
    healthCache = { healthy: false, checkedAt: Date.now() }
  }

  return healthCache.healthy
}

// ─── OpenClaw 요청 (JSON 응답) ───

/**
 * Bridge 요청 형식
 */
interface OpenClawRequest {
  query: string
  userId?: string
  conversationId?: string
}

/**
 * Bridge 응답 형식 (OpenClaw API 계약)
 *
 * 성공: { ok: true, answer, citations, ... }
 * 오류: HTTP 503 (busy), 504 (timeout), 401 (bad token)
 */
interface OpenClawResponse {
  ok: boolean
  answer: string
  citations?: FCRAGResult['citations']
  confidenceLevel?: 'high' | 'medium' | 'low'
  complexity?: 'simple' | 'moderate' | 'complex'
  queryType?: string
  source?: 'openclaw'
  sessionKey?: string
  latencyMs?: number
  toolsUsed?: Array<{ name: string; displayName?: string; success: boolean; summary?: string }>
  warnings?: string[]
}

/**
 * OpenClaw Bridge에 법률 질문 전송 → SSE 스트리밍으로 실시간 답변 수신.
 * Bridge가 token 이벤트를 실시간으로 전송하여 즉각 UX 제공.
 * 성공하면 true, 실패하면 false (→ Gemini fallback).
 */
export async function fetchFromOpenClaw(
  query: string,
  send: (data: unknown) => void,
  options?: { abortSignal?: AbortSignal; userId?: string; conversationId?: string },
): Promise<boolean> {
  try {
    send({ type: 'status', message: '법률 AI 분석 중...', progress: 10 })

    const timeoutSignal = AbortSignal.timeout(OPENCLAW_TIMEOUT)
    const signals = options?.abortSignal
      ? AbortSignal.any([options.abortSignal, timeoutSignal])
      : timeoutSignal

    const response = await fetch(`${OPENCLAW_URL}/api/legal-query?stream=1`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        query,
        userId: options?.userId,
        conversationId: options?.conversationId,
      } satisfies OpenClawRequest),
      signal: signals,
    })

    if (!response.ok) {
      recordFailure(`HTTP_${response.status >= 500 ? '5xx' : response.status}`)
      return false
    }

    // SSE 스트림 파싱
    const reader = response.body?.getReader()
    if (!reader) {
      recordFailure('no_reader')
      return false
    }

    const decoder = new TextDecoder()
    let buffer = ''
    const state: SSEProcessState = { gotDone: false, finalData: null }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const chunks = buffer.split('\n\n')
      buffer = chunks.pop() || ''

      for (const chunk of chunks) {
        const { eventType, eventData } = parseSSEChunk(chunk)
        processSSEEvent(eventType, eventData, send, state)
      }
    }

    // ── 잔여 버퍼 처리 (캐시 경로에서 done 이벤트가 마지막 청크에 남을 수 있음) ──
    if (buffer.trim()) {
      const chunks = buffer.split('\n\n')
      for (const chunk of chunks) {
        const { eventType, eventData } = parseSSEChunk(chunk)
        processSSEEvent(eventType, eventData, send, state)
      }
    }

    if (!state.gotDone) {
      recordFailure('no_done_event')
      return false
    }

    recordSuccess()
    return true
  } catch (err) {
    recordFailure(err instanceof Error ? err.message : 'unknown')
    return false
  }
}

// ─── 상태 확인 (디버깅용) ───

export function getOpenClawStatus() {
  return {
    configured: !!OPENCLAW_URL,
    healthy: healthCache.healthy,
    circuitOpen: isCircuitOpen(),
    failureCount: circuitFailureCount,
  }
}
