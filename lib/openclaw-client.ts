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
      recordFailure()
      return false
    }

    // SSE 스트림 파싱
    const reader = response.body?.getReader()
    if (!reader) {
      recordFailure()
      return false
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let gotDone = false

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const chunks = buffer.split('\n\n')
      buffer = chunks.pop() || ''

      for (const chunk of chunks) {
        const lines = chunk.split('\n')
        let eventType = ''
        let eventData = ''

        for (const line of lines) {
          if (line.startsWith('event: ')) eventType = line.slice(7).trim()
          else if (line.startsWith('data: ')) eventData = line.slice(6)
        }

        if (!eventType || !eventData) continue

        try {
          const parsed = JSON.parse(eventData)

          switch (eventType) {
            case 'status':
              send({
                type: 'status',
                message: parsed.message || '',
                progress: parsed.phase === 'searching' ? 25 : parsed.phase === 'analyzing' ? 45 : parsed.phase === 'generating' ? 65 : 50,
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
              gotDone = true
              let finalAnswer = String(parsed.answer || '').trim()
              // 방어: JSON 래퍼 추출
              if (finalAnswer.startsWith('{') && finalAnswer.includes('"answer"')) {
                try {
                  const sanitized = finalAnswer.replace(/\n/g, '\\n').replace(/\r/g, '\\r')
                  const obj = JSON.parse(sanitized)
                  if (obj?.answer) finalAnswer = obj.answer
                } catch {
                  const m = finalAnswer.match(/"answer"\s*:\s*"([\s\S]+?)"\s*,\s*"(?:citations|confidenceLevel|complexity|queryType|toolsUsed)"/)
                  if (m) {
                    finalAnswer = m[1]
                      .replace(/\\n/g, '\n')
                      .replace(/\\t/g, '\t')
                      .replace(/\\"/g, '"')
                      .replace(/\\\\/g, '\\')
                  }
                }
              }

              send({
                type: 'answer',
                data: {
                  answer: finalAnswer,
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
    }

    if (!gotDone) {
      recordFailure()
      return false
    }

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
