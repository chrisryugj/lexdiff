/**
 * Claude CLI 기반 LLM 클라이언트
 *
 * Anthropic SDK 대신 Claude Code CLI subprocess 호출.
 * - OAuth 인증은 CLI가 자동 처리
 * - korean-law MCP 도구를 CLI가 네이티브로 사용
 * - execFile 직접 호출로 UTF-16 인자 전달 (Windows 코드페이지 문제 회피)
 */

import { execFile, spawn } from 'child_process'
import { createInterface } from 'readline'

export const CLAUDE_MODEL = 'claude-sonnet-4-6'

// Windows 8.3 짧은 경로 사용 (공백 회피)
const CLAUDE_BIN = process.platform === 'win32'
  ? 'C:/Users/MONGNA~1/LOCAL~1/bin/claude.exe'
  : 'claude'

export interface DirectMessage {
  role: 'user' | 'assistant'
  content: string | unknown
}

export interface DirectResponse {
  content: Array<{ type: string; text?: string; [k: string]: unknown }>
  stopReason: string | null
  usage: { inputTokens: number; outputTokens: number }
}

/**
 * Claude CLI를 subprocess로 호출하여 LLM 응답을 받음.
 * execFile 직접 호출 — stdin 파이프 불사용으로 Windows 한글 인코딩 문제 회피.
 * Node.js execFile → CreateProcessW (UTF-16) → claude.exe가 정상 수신.
 */
export async function callAnthropic(
  systemPrompt: string,
  messages: DirectMessage[],
  options?: {
    maxTokens?: number
    tools?: unknown[]
    signal?: AbortSignal
  },
): Promise<DirectResponse> {
  const { signal } = options || {}

  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
  const prompt = typeof lastUserMsg?.content === 'string'
    ? lastUserMsg.content
    : JSON.stringify(lastUserMsg?.content || '')

  const args = [
    '--print',
    '--model', CLAUDE_MODEL,
    '--output-format', 'json',
    '--no-session-persistence',
    '--max-turns', '20',
    '--system-prompt', systemPrompt,
    prompt,
  ]

  const env = { ...process.env }
  delete env.ANTHROPIC_API_KEY

  console.log(`[claude-cli] calling ${CLAUDE_MODEL}, prompt: ${prompt.length} chars, system: ${systemPrompt.length} chars`)

  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const proc = execFile(CLAUDE_BIN, args, {
        env,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 180_000,
        windowsHide: true,
      }, (err, stdout, stderr) => {
        if (err && !stdout?.trim()) {
          reject(new Error(`Claude CLI exit: ${stderr?.substring(0, 300) || err.message}`))
        } else {
          resolve(stdout || '')
        }
      })

      if (signal) {
        signal.addEventListener('abort', () => { proc.kill(); reject(new Error('aborted')) }, { once: true })
      }
    })

    // --output-format json: JSON array of events
    let events: Array<Record<string, unknown>>
    try {
      events = JSON.parse(stdout.trim())
    } catch {
      events = stdout.trim().split('\n')
        .filter(Boolean)
        .map(line => { try { return JSON.parse(line) } catch { return null } })
        .filter(Boolean) as Array<Record<string, unknown>>
    }

    const resultEvent = [...events].reverse().find(e => e.type === 'result')
    if (!resultEvent) {
      throw new Error(`Claude CLI: result 이벤트 없음 (${events.length} events)`)
    }

    // result.result가 있으면 사용, 없으면 assistant 메시지에서 텍스트 추출
    let text = (resultEvent.result || '') as string
    if (!text) {
      const assistantEvents = events.filter(e => e.type === 'assistant')
      for (const evt of [...assistantEvents].reverse()) {
        const msg = evt.message as Record<string, unknown> | undefined
        const content = (msg?.content || []) as Array<Record<string, unknown>>
        for (const block of content) {
          if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 50) {
            text = block.text
            break
          }
        }
        if (text) break
      }
    }

    if (!text) {
      throw new Error(`Claude CLI: 답변 텍스트 없음 (subtype: ${resultEvent.subtype})`)
    }

    const usage = (resultEvent.usage || {}) as Record<string, number>
    console.log(`[claude-cli] success: ${text.length} chars, turns: ${resultEvent.num_turns}`)

    return {
      content: [{ type: 'text', text }],
      stopReason: (resultEvent.stop_reason || 'end_turn') as string,
      usage: {
        inputTokens: usage.input_tokens || 0,
        outputTokens: usage.output_tokens || 0,
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[claude-cli] ERROR: ${msg}`)
    throw new Error(`Claude CLI 호출 실패: ${msg}`)
  }
}

// ── 스트리밍: stream-json 모드로 NDJSON 실시간 파싱 ──

export type ClaudeStreamEvent =
  | { type: 'tool_call'; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; name: string; content: string; isError: boolean }
  | { type: 'text'; text: string }
  | { type: 'result'; text: string; usage: { inputTokens: number; outputTokens: number } }

/** MCP 도구 이름에서 korean-law prefix 제거 */
function stripMcpPrefix(name: string): string {
  return name.replace(/^mcp__korean-law__/, '')
}

/**
 * Claude CLI를 stream-json 모드로 실행하여 NDJSON 이벤트를 실시간으로 yield.
 * tool_use → tool_call, tool_result, text, result 이벤트를 순차적으로 반환.
 * 기존 callAnthropic(일괄)과 달리 중간 도구 호출 과정을 실시간 추적 가능.
 */
export async function* callAnthropicStream(
  systemPrompt: string,
  messages: DirectMessage[],
  options?: { signal?: AbortSignal },
): AsyncGenerator<ClaudeStreamEvent> {
  const { signal } = options || {}

  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
  const prompt = typeof lastUserMsg?.content === 'string'
    ? lastUserMsg.content
    : JSON.stringify(lastUserMsg?.content || '')

  const args = [
    '--print',
    '--model', CLAUDE_MODEL,
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--no-session-persistence',
    '--max-turns', '20',
    '--system-prompt', systemPrompt,
    prompt,
  ]

  const env = { ...process.env }
  delete env.ANTHROPIC_API_KEY

  console.log(`[claude-cli] streaming ${CLAUDE_MODEL}, prompt: ${prompt.length} chars`)

  const proc = spawn(CLAUDE_BIN, args, {
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  // stderr 수집 (에러 진단용)
  let stderrText = ''
  proc.stderr!.on('data', (chunk: Buffer) => { stderrText += chunk.toString() })

  // 프로세스 종료 Promise (미리 등록하여 이벤트 유실 방지)
  const exitPromise = new Promise<number | null>(resolve => {
    proc.on('close', resolve)
  })

  if (signal) {
    const onAbort = () => proc.kill()
    signal.addEventListener('abort', onAbort, { once: true })
    exitPromise.then(() => signal.removeEventListener('abort', onAbort))
  }

  // tool_use id → 도구명 매핑 (tool_result에서 이름 역추적용)
  const toolNameMap = new Map<string, string>()
  let finalText = ''

  const rl = createInterface({ input: proc.stdout! })

  for await (const line of rl) {
    if (!line.trim()) continue

    let event: Record<string, unknown>
    try {
      event = JSON.parse(line)
    } catch { continue }

    // system, stream_event, rate_limit_event → 스킵
    if (event.type === 'system' || event.type === 'stream_event' || event.type === 'rate_limit_event') continue

    // assistant 이벤트 — tool_use 또는 text
    if (event.type === 'assistant') {
      if (event.error) {
        throw new Error(`Claude CLI: ${event.error}`)
      }

      const msg = event.message as Record<string, unknown> | undefined
      const content = (msg?.content || []) as Array<Record<string, unknown>>
      for (const block of content) {
        if (block.type === 'tool_use') {
          const id = block.id as string
          const rawName = block.name as string
          const name = stripMcpPrefix(rawName)
          toolNameMap.set(id, name)
          yield { type: 'tool_call', name, input: (block.input || {}) as Record<string, unknown> }
        } else if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
          finalText = block.text
          yield { type: 'text', text: block.text }
        }
      }
    }

    // user 이벤트 — 도구 실행 결과 (stream-json에서 tool_result는 user 메시지로 전달됨)
    if (event.type === 'user') {
      const msg = event.message as Record<string, unknown> | undefined
      const content = (msg?.content || []) as Array<Record<string, unknown>>
      for (const block of content) {
        const toolUseId = (block.tool_use_id || '') as string
        const name = toolNameMap.get(toolUseId) || 'unknown'
        const resultContent = typeof block.content === 'string'
          ? block.content
          : JSON.stringify(block.content || '')
        yield { type: 'tool_result', name, content: resultContent, isError: !!block.is_error }
      }
    }

    // result 이벤트 — 최종 결과
    if (event.type === 'result') {
      const isError = !!event.is_error
      const resultText = (event.result || finalText) as string

      if (isError && !finalText) {
        throw new Error(`Claude CLI: ${resultText || 'unknown error'}`)
      }

      const usage = (event.usage || {}) as Record<string, number>
      console.log(`[claude-cli] stream done: ${(finalText || resultText).length} chars, turns: ${event.num_turns}`)
      yield {
        type: 'result',
        text: finalText || resultText,
        usage: {
          inputTokens: usage.input_tokens || 0,
          outputTokens: usage.output_tokens || 0,
        },
      }
    }
  }

  // 프로세스 종료 대기
  const exitCode = await exitPromise
  if (exitCode !== 0 && !finalText) {
    throw new Error(`Claude CLI exit code ${exitCode}: ${stderrText.slice(0, 300)}`)
  }
}

// ── 호환 래퍼: 기존 callGateway 인터페이스 유지 (summarize, benchmark 등) ──

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
    id: `claude-cli-${Date.now()}`,
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: response.stopReason || 'stop' }],
    usage: {
      prompt_tokens: response.usage.inputTokens,
      completion_tokens: response.usage.outputTokens,
      total_tokens: response.usage.inputTokens + response.usage.outputTokens,
    },
  }
}
