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

export type HistoryMode = 'full' | 'latest-only'

// C2: 전체 대화 히스토리를 전달하되, 과다 입력으로 413 방지를 위해 캡 적용.
// 오래된 턴부터 드롭하며 마지막 user 턴은 반드시 포함.
const MAX_HISTORY_CHARS = 40_000

type OpenAIRoleMessage = { role: 'system' | 'user' | 'assistant'; content: string }

function normalizeContent(c: unknown): string {
  return typeof c === 'string' ? c : JSON.stringify(c ?? '')
}

function buildOpenAIMessages(
  systemPrompt: string,
  messages: DirectMessage[],
  historyMode: HistoryMode = 'full',
): OpenAIRoleMessage[] {
  const sys: OpenAIRoleMessage = { role: 'system', content: systemPrompt }

  if (historyMode === 'latest-only') {
    const last = [...messages].reverse().find(m => m.role === 'user')
    if (!last) return [sys]
    return [sys, { role: 'user', content: normalizeContent(last.content) }]
  }

  const mapped: OpenAIRoleMessage[] = messages.map(m => ({
    role: m.role,
    content: normalizeContent(m.content),
  }))

  let total = mapped.reduce((s, m) => s + m.content.length, 0)
  let start = 0
  // 마지막 항목(= 가장 최근 user)은 반드시 보존
  while (total > MAX_HISTORY_CHARS && start < mapped.length - 1) {
    total -= mapped[start].content.length
    start++
  }
  return [sys, ...mapped.slice(start)]
}

/** MCP 도구 이름에서 hermes prefix 제거 */
function stripMcpPrefix(name: string): string {
  return name
    .replace(/^mcp_korean_law_/, '')
    .replace(/^mcp__korean-law__/, '')
}

// C1: Hermes SSE 이벤트 타입 가드 — 문자열 heuristic 대신 JSON 구조 검증.
interface HermesToolProgress {
  tool: string
  label?: string
  status?: 'started' | 'completed' | 'error'
}

function isHermesToolProgress(obj: unknown): obj is HermesToolProgress {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  return typeof o.tool === 'string' && !('choices' in o)
}

interface OpenAIChatChunk {
  choices: Array<Record<string, unknown>>
  usage?: Record<string, number>
}

function isOpenAIChatChunk(obj: unknown): obj is OpenAIChatChunk {
  if (!obj || typeof obj !== 'object') return false
  return Array.isArray((obj as Record<string, unknown>).choices)
}

/**
 * Hermes API를 SSE 모드로 호출하여 스트리밍 이벤트를 yield.
 * OpenAI-compatible /v1/chat/completions 엔드포인트 사용.
 */
export async function* callAnthropicStream(
  systemPrompt: string,
  messages: DirectMessage[],
  options?: { signal?: AbortSignal; maxTurns?: number; historyMode?: HistoryMode },
): AsyncGenerator<ClaudeStreamEvent> {
  ensureHermesConfig()
  const { signal, historyMode = 'full' } = options || {}

  const openaiMessages = buildOpenAIMessages(systemPrompt, messages, historyMode)
  const totalChars = openaiMessages.reduce((s, m) => s + m.content.length, 0)

  const body = {
    model: HERMES_MODEL,
    messages: openaiMessages,
    stream: true,
    skip_context_files: true,
  }

  debugLogger.debug(`[hermes] calling ${HERMES_BASE}/v1/chat/completions, messages: ${openaiMessages.length}, total: ${totalChars} chars`)

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

  // C1: SSE 라인 처리 — JSON.parse 선행 후 shape guard로 분기.
  // 문자열 heuristic(`data.includes('"tool"')`)은 사용자 질의 delta에 false-fire 가능.
  const processLine = (line: string): ClaudeStreamEvent[] => {
    const events: ClaudeStreamEvent[] = []
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('event:') || !trimmed.startsWith('data:')) return events
    const data = trimmed.slice(5).trim()
    if (!data || data === '[DONE]') return events

    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      debugLogger.debug(`[hermes] non-JSON SSE line dropped: ${data.slice(0, 80)}`)
      return events
    }

    // Hermes tool progress 이벤트 (OpenAI chunk와 구분: choices 없음 + tool:string)
    if (isHermesToolProgress(parsed)) {
      const name = stripMcpPrefix(parsed.tool)
      const status = parsed.status
      // status 미정이면 기존 동작 유지 (call+result 동시 발행)
      if (status === undefined || status === 'started') {
        events.push({ type: 'tool_call', name, input: {} })
      }
      if (status === undefined || status === 'completed') {
        events.push({ type: 'tool_result', name, content: '(Hermes 내부 실행)', isError: false })
      }
      if (status === 'error') {
        events.push({ type: 'tool_result', name, content: '(Hermes 도구 오류)', isError: true })
      }
      return events
    }

    if (!isOpenAIChatChunk(parsed)) {
      // 알 수 없는 스키마 — drop하되 디버그 로그
      debugLogger.debug(`[hermes] unknown SSE event shape dropped: ${data.slice(0, 120)}`)
      return events
    }

    if (parsed.choices.length === 0) return events

    const choice = parsed.choices[0]
    const delta = choice.delta as Record<string, unknown> | undefined
    const finishReason = choice.finish_reason as string | null

    if (delta?.content && typeof delta.content === 'string') {
      fullText += delta.content
      events.push({ type: 'text', text: delta.content })
    }

    if (finishReason) {
      stopReason = finishReason === 'stop' ? 'end_turn' : finishReason
      if (parsed.usage) {
        usage = {
          inputTokens: parsed.usage.prompt_tokens || 0,
          outputTokens: parsed.usage.completion_tokens || 0,
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
  options?: { maxTokens?: number; signal?: AbortSignal; historyMode?: HistoryMode },
): Promise<DirectResponse> {
  ensureHermesConfig()
  const { maxTokens = 4096, signal, historyMode = 'full' } = options || {}

  const openaiMessages = buildOpenAIMessages(systemPrompt, messages, historyMode)

  const body = {
    model: HERMES_MODEL,
    messages: openaiMessages,
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
