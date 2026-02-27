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
const HEALTH_CHECK_TIMEOUT = 2_000 // 2초

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

// ─── 서킷 브레이커 ───

const CIRCUIT_FAILURE_THRESHOLD = 3
const CIRCUIT_OPEN_DURATION = 5 * 60_000 // 5분

let circuitFailureCount = 0
let circuitOpenUntil = 0

function isCircuitOpen(): boolean {
  if (Date.now() > circuitOpenUntil) {
    if (circuitFailureCount >= CIRCUIT_FAILURE_THRESHOLD) {
      circuitFailureCount = 0
    }
    return false
  }
  return true
}

function recordSuccess(): void {
  circuitFailureCount = 0
  circuitOpenUntil = 0
}

function recordFailure(): void {
  circuitFailureCount++
  if (circuitFailureCount >= CIRCUIT_FAILURE_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_OPEN_DURATION
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
 * OpenClaw Bridge에 법률 질문 전송 → 완성된 JSON 답변 수신.
 * 대기 중 가짜 진행 이벤트를 send()로 전송하여 UX 유지.
 * 성공하면 true, 실패하면 false (→ Gemini fallback).
 */
export async function fetchFromOpenClaw(
  query: string,
  send: (data: unknown) => void,
  options?: { abortSignal?: AbortSignal; userId?: string; conversationId?: string },
): Promise<boolean> {
  try {
    // 진행 UX: 분석 시작
    send({ type: 'status', message: '법률 AI 분석 중...', progress: 10 })

    const timeoutSignal = AbortSignal.timeout(OPENCLAW_TIMEOUT)
    const signals = options?.abortSignal
      ? AbortSignal.any([options.abortSignal, timeoutSignal])
      : timeoutSignal

    // 가짜 진행 이벤트 (대기 중 UX)
    const progressSteps = [
      { delay: 3000, message: '관련 법령 검색 중...', progress: 25 },
      { delay: 7000, message: '조문 분석 중...', progress: 45 },
      { delay: 12000, message: '답변 구성 중...', progress: 65 },
      { delay: 20000, message: '최종 검토 중...', progress: 80 },
    ]
    const timers: ReturnType<typeof setTimeout>[] = []
    for (const step of progressSteps) {
      timers.push(setTimeout(() => {
        send({ type: 'status', message: step.message, progress: step.progress })
      }, step.delay))
    }

    const response = await fetch(`${OPENCLAW_URL}/api/legal-query`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        query,
        userId: options?.userId,
        conversationId: options?.conversationId,
      } satisfies OpenClawRequest),
      signal: signals,
    })

    // 타이머 정리
    for (const t of timers) clearTimeout(t)

    if (!response.ok) {
      recordFailure()
      return false
    }

    const result: OpenClawResponse = await response.json()

    if (!result.ok || !result.answer) {
      recordFailure()
      return false
    }

    // 도구 사용 내역이 있으면 이벤트로 전송 (UI에 표시)
    if (result.toolsUsed) {
      for (const tool of result.toolsUsed) {
        send({
          type: 'tool_result',
          name: tool.name,
          displayName: tool.displayName || tool.name,
          success: tool.success,
          summary: tool.summary || '',
        })
      }
    }

    // 방어: 브릿지가 JSON 래퍼 그대로 넘긴 경우 answer 추출
    let finalAnswer = result.answer
    if (typeof finalAnswer === 'string' && finalAnswer.startsWith('{')) {
      try {
        const parsed = JSON.parse(finalAnswer)
        if (parsed && typeof parsed.answer === 'string') {
          finalAnswer = parsed.answer
        }
      } catch { /* JSON 아님, 원문 사용 */ }
    }

    // 최종 답변 전송
    send({
      type: 'answer',
      data: {
        answer: finalAnswer,
        citations: result.citations || [],
        confidenceLevel: result.confidenceLevel || 'medium',
        complexity: result.complexity || 'moderate',
        queryType: (result.queryType || 'definition') as LegalQueryType,
        warnings: result.warnings,
      } satisfies FCRAGResult,
    })

    recordSuccess()
    return true
  } catch {
    recordFailure()
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
