/**
 * Hermes Agent API 클라이언트
 *
 * Claude CLI subprocess 대신 Hermes gateway의 OpenAI-compatible API 호출.
 * - localhost:8642/v1/chat/completions (SSE 스트리밍)
 * - korean-law-mcp 도구는 Hermes가 네이티브로 관리
 * - GPT-5.4 + Codex OAuth (Hermes 자체 인증)
 */

import { debugLogger } from '../debug-logger'

const IS_PROD = process.env.NODE_ENV === 'production'
const HERMES_BASE = process.env.HERMES_API_URL || 'http://127.0.0.1:8642'
const HERMES_KEY = process.env.HERMES_API_KEY || (IS_PROD ? '' : 'lexdiff-hermes-local')
const HERMES_MODEL = process.env.HERMES_MODEL || 'hermes-agent'

// 프로덕션 + 런타임(빌드 time 아님) 검증을 호출 시점에 수행
// Vercel 빌드 단계에선 'phase-production-build'에서 모듈이 평가되므로 throw 금지
const IS_BUILD_PHASE = process.env.NEXT_PHASE === 'phase-production-build'

function ensureHermesConfig(): void {
  if (!IS_PROD || IS_BUILD_PHASE) return
  if (!HERMES_KEY) {
    throw new Error('[hermes] HERMES_API_KEY 환경변수가 필수입니다 (production)')
  }
  const isLoopback = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(HERMES_BASE)
  if (!isLoopback && !HERMES_BASE.startsWith('https://')) {
    throw new Error('[hermes] HERMES_API_URL은 https여야 합니다 (production)')
  }
}

export interface DirectMessage {
  role: 'user' | 'assistant'
  content: string | unknown
}

export interface DirectResponse {
  content: Array<{ type: string; text?: string; [k: string]: unknown }>
  stopReason: string | null
  usage: { inputTokens: number; outputTokens: number }
}

export type ClaudeStreamEvent =
  | { type: 'tool_call'; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; name: string; content: string; isError: boolean }
  | { type: 'text'; text: string }
  | { type: 'result'; text: string; stopReason: string; usage: { inputTokens: number; outputTokens: number } }

/** MCP 도구 이름에서 hermes prefix 제거 */
function stripMcpPrefix(name: string): string {
  return name
    .replace(/^mcp_korean_law_/, '')
    .replace(/^mcp__korean-law__/, '')
}

/**
 * Hermes API를 SSE 모드로 호출하여 스트리밍 이벤트를 yield.
 * OpenAI-compatible /v1/chat/completions 엔드포인트 사용.
 */
export async function* callAnthropicStream(
  systemPrompt: string,
  messages: DirectMessage[],
  options?: { signal?: AbortSignal; maxTurns?: number },
): AsyncGenerator<ClaudeStreamEvent> {
  ensureHermesConfig()
  const { signal } = options || {}

  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
  const userContent = typeof lastUserMsg?.content === 'string'
    ? lastUserMsg.content
    : JSON.stringify(lastUserMsg?.content || '')

  const body = {
    model: HERMES_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    stream: true,
    skip_context_files: true,
  }

  debugLogger.debug(`[hermes] calling ${HERMES_BASE}/v1/chat/completions, prompt: ${userContent.length} chars`)

  const response = await fetch(`${HERMES_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${HERMES_KEY}`,
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Hermes API ${response.status}: ${errText.slice(0, 300)}`)
  }

  if (!response.body) {
    throw new Error('Hermes API: 응답 body가 없습니다.')
  }

  let fullText = ''
  let usage = { inputTokens: 0, outputTokens: 0 }
  let stopReason = 'end_turn'

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  // 한 줄을 처리해 yield할 이벤트 배열을 반환 (generator 외부에서 호출)
  const processLine = (line: string): ClaudeStreamEvent[] => {
    const events: ClaudeStreamEvent[] = []
    const trimmed = line.trim()
    if (!trimmed) return events
    if (trimmed.startsWith('event:')) return events
    if (!trimmed.startsWith('data:')) return events
    const data = trimmed.slice(5).trim()
    if (!data || data === '[DONE]') return events

    // hermes.tool.progress 이벤트 데이터 (heuristic)
    if (data.includes('"tool"') && data.includes('"label"')) {
      try {
        const toolEvent = JSON.parse(data) as { tool?: string }
        if (toolEvent.tool) {
          const name = stripMcpPrefix(toolEvent.tool)
          events.push({ type: 'tool_call', name, input: {} })
          events.push({ type: 'tool_result', name, content: '(Hermes 내부 실행)', isError: false })
        }
      } catch { /* JSON parse 실패 무시 */ }
      return events
    }

    let chunk: Record<string, unknown>
    try { chunk = JSON.parse(data) } catch { return events }

    const choices = chunk.choices as Array<Record<string, unknown>> | undefined
    if (!choices || choices.length === 0) return events

    const choice = choices[0]
    const delta = choice.delta as Record<string, unknown> | undefined
    const finishReason = choice.finish_reason as string | null

    if (delta?.content && typeof delta.content === 'string') {
      fullText += delta.content
      events.push({ type: 'text', text: delta.content })
    }

    if (finishReason) {
      stopReason = finishReason === 'stop' ? 'end_turn' : finishReason
      const chunkUsage = chunk.usage as Record<string, number> | undefined
      if (chunkUsage) {
        usage = {
          inputTokens: chunkUsage.prompt_tokens || 0,
          outputTokens: chunkUsage.completion_tokens || 0,
        }
      }
    }
    return events
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        for (const ev of processLine(line)) yield ev
      }
    }

    // ✅ 루프 종료 후 잔여 버퍼 drain (CLAUDE.md 핵심 규칙)
    buffer += decoder.decode()
    if (buffer.trim()) {
      for (const line of buffer.split('\n')) {
        for (const ev of processLine(line)) yield ev
      }
      buffer = ''
    }
  } finally {
    try { reader.releaseLock() } catch { /* noop */ }
  }

  if (!fullText) {
    throw new Error('Hermes API: 답변 텍스트 없음')
  }

  debugLogger.debug(`[hermes] stream done: ${fullText.length} chars`)

  yield {
    type: 'result',
    text: fullText,
    stopReason,
    usage,
  }
}

// ── 비스트리밍 호출 (summarize, benchmark 등 호환) ──

export async function callAnthropic(
  systemPrompt: string,
  messages: DirectMessage[],
  options?: { maxTokens?: number; signal?: AbortSignal },
): Promise<DirectResponse> {
  ensureHermesConfig()
  const { maxTokens = 4096, signal } = options || {}

  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
  const userContent = typeof lastUserMsg?.content === 'string'
    ? lastUserMsg.content
    : JSON.stringify(lastUserMsg?.content || '')

  const body = {
    model: HERMES_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    max_tokens: maxTokens,
    stream: false,
  }

  const response = await fetch(`${HERMES_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${HERMES_KEY}`,
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Hermes API ${response.status}: ${errText.slice(0, 300)}`)
  }

  const result = await response.json() as Record<string, unknown>
  const choices = result.choices as Array<Record<string, unknown>> | undefined
  const text = (choices?.[0]?.message as Record<string, unknown>)?.content as string || ''
  const resUsage = result.usage as Record<string, number> | undefined

  return {
    content: [{ type: 'text', text }],
    stopReason: (choices?.[0]?.finish_reason as string) || 'stop',
    usage: {
      inputTokens: resUsage?.prompt_tokens || 0,
      outputTokens: resUsage?.completion_tokens || 0,
    },
  }
}

// ── 호환 래퍼: callGateway 인터페이스 유지 ──

export interface GatewayMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface GatewayResponse {
  id: string
  choices: Array<{ index: number; message: { role: string; content: string }; finish_reason: string }>
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

export async function callGateway(
  messages: GatewayMessage[],
  options?: { maxTokens?: number; temperature?: number; signal?: AbortSignal },
): Promise<GatewayResponse> {
  const { maxTokens = 4096, signal } = options || {}

  const systemMsg = messages.find(m => m.role === 'system')?.content || ''
  const chatMessages: DirectMessage[] = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const response = await callAnthropic(systemMsg, chatMessages, { maxTokens, signal })

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text || '')
    .join('')

  return {
    id: `hermes-${Date.now()}`,
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: response.stopReason || 'stop' }],
    usage: {
      prompt_tokens: response.usage.inputTokens,
      completion_tokens: response.usage.outputTokens,
      total_tokens: response.usage.inputTokens + response.usage.outputTokens,
    },
  }
}
