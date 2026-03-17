/**
 * OpenClaw Gateway를 OpenAI-compatible LLM 엔드포인트로 사용.
 *
 * Gateway가 내부적으로 Anthropic OAuth 처리 + Claude Sonnet 4.6 호출.
 * 이 모듈은 Gateway의 /v1/chat/completions를 호출하는 얇은 래퍼.
 *
 * 환경변수:
 * - OPENCLAW_GATEWAY_URL (기본: http://127.0.0.1:18789)
 * - OPENCLAW_GATEWAY_TOKEN (필수)
 */

export const CLAUDE_MODEL = 'anthropic/claude-sonnet-4-6'

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789'
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || '27034d1e40c21276201d2e06eeae276841c90cb94e3fecdc'

export interface GatewayMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface GatewayResponse {
  id: string
  choices: Array<{
    index: number
    message: { role: string; content: string }
    finish_reason: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * Gateway /v1/chat/completions 호출 (non-streaming)
 */
export async function callGateway(
  messages: GatewayMessage[],
  options?: { maxTokens?: number; temperature?: number; signal?: AbortSignal },
): Promise<GatewayResponse> {
  const { maxTokens = 4096, temperature = 0, signal } = options || {}

  const res = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GATEWAY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature,
      agent_id: 'lexdiff-law',
    }),
    signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Gateway 오류 (${res.status}): ${text.slice(0, 200)}`)
  }

  return res.json()
}

/**
 * Gateway /v1/chat/completions 스트리밍 호출
 * SSE 청크를 AsyncGenerator로 yield
 */
export async function* streamGateway(
  messages: GatewayMessage[],
  options?: { maxTokens?: number; temperature?: number; signal?: AbortSignal },
): AsyncGenerator<string> {
  const { maxTokens = 4096, temperature = 0, signal } = options || {}

  const res = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GATEWAY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: true,
      agent_id: 'lexdiff-law',
    }),
    signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Gateway 스트리밍 오류 (${res.status}): ${text.slice(0, 200)}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('Gateway 응답에 body가 없습니다.')

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') return

        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) yield content
        } catch {
          // 파싱 불가능한 청크 무시
        }
      }
    }

    // 잔여 버퍼 처리
    if (buffer.trim()) {
      for (const line of buffer.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') return
        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) yield content
        } catch {
          // ignore
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
