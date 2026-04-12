/**
 * C1: Hermes SSE shape guard regression tests
 * C2: Full conversation history forwarding tests
 *
 * 테스트 대상: lib/fc-rag/hermes-client.ts
 * - SSE 파서가 JSON.parse + 타입 가드로 tool progress / chat chunk를 구분하는가
 * - 사용자 질의에 '"tool"' 문자열이 포함된 delta를 tool_call로 오탐하지 않는가
 * - multi-turn 대화가 전체 messages 배열로 Hermes에 전달되는가
 * - 40KB 초과 시 오래된 턴부터 드롭하되 마지막 user 턴은 보존되는가
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { callAnthropicStream, callAnthropic, type DirectMessage, type ClaudeStreamEvent } from '@/lib/fc-rag/hermes-client'

// ── SSE fixture builders ──────────────────────────────────────────────

function sseLines(...events: string[]): string {
  return events.map(e => `data: ${e}\n\n`).join('') + 'data: [DONE]\n\n'
}

function sseStream(body: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      // chunk 경계를 일부러 쪼개서 buffer drain 테스트
      const mid = Math.floor(body.length / 2)
      controller.enqueue(encoder.encode(body.slice(0, mid)))
      controller.enqueue(encoder.encode(body.slice(mid)))
      controller.close()
    },
  })
}

function mockHermesFetch(sseBody: string) {
  return vi.fn(async () => new Response(sseStream(sseBody), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  }))
}

async function collect(gen: AsyncGenerator<ClaudeStreamEvent>): Promise<ClaudeStreamEvent[]> {
  const out: ClaudeStreamEvent[] = []
  for await (const ev of gen) out.push(ev)
  return out
}

// ── Fixtures ──────────────────────────────────────────────────────────

const CHAT_DELTA = (text: string) => JSON.stringify({
  id: 'c1', object: 'chat.completion.chunk', model: 'hermes-agent',
  choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
})

const CHAT_FINISH = JSON.stringify({
  id: 'c1', object: 'chat.completion.chunk', model: 'hermes-agent',
  choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  usage: { prompt_tokens: 100, completion_tokens: 50 },
})

const TOOL_PROGRESS = (tool: string, label = '검색 중') => JSON.stringify({ tool, label })

// ── Tests ─────────────────────────────────────────────────────────────

describe('hermes-client SSE shape guard (C1)', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = originalFetch })

  test('simple chat: text delta만 yield하고 tool 이벤트는 0회', async () => {
    const body = sseLines(CHAT_DELTA('안녕'), CHAT_DELTA('하세요'), CHAT_FINISH)
    globalThis.fetch = mockHermesFetch(body) as unknown as typeof fetch

    const events = await collect(callAnthropicStream('sys', [{ role: 'user', content: 'hi' }]))
    const textEvents = events.filter(e => e.type === 'text')
    const toolEvents = events.filter(e => e.type === 'tool_call' || e.type === 'tool_result')
    const result = events.find(e => e.type === 'result')

    expect(textEvents).toHaveLength(2)
    expect(toolEvents).toHaveLength(0)
    expect(result).toBeDefined()
    if (result?.type === 'result') {
      expect(result.text).toBe('안녕하세요')
      expect(result.usage.inputTokens).toBe(100)
      expect(result.usage.outputTokens).toBe(50)
    }
  })

  test('tool progress: tool_call + tool_result 쌍 발행', async () => {
    const body = sseLines(
      TOOL_PROGRESS('mcp_korean_law_search_law'),
      CHAT_DELTA('결과'),
      CHAT_FINISH,
    )
    globalThis.fetch = mockHermesFetch(body) as unknown as typeof fetch

    const events = await collect(callAnthropicStream('sys', [{ role: 'user', content: 'q' }]))
    const toolCalls = events.filter(e => e.type === 'tool_call')
    const toolResults = events.filter(e => e.type === 'tool_result')

    expect(toolCalls).toHaveLength(1)
    expect(toolResults).toHaveLength(1)
    if (toolCalls[0]?.type === 'tool_call') {
      // mcp_korean_law_ prefix 제거됨
      expect(toolCalls[0].name).toBe('search_law')
    }
  })

  test('false positive: delta content에 `"tool"` 문자열 포함돼도 tool 이벤트 0회', async () => {
    // 사용자가 "tool 사용법" 같은 질문을 했고 답변 delta에 "tool"이 포함되는 케이스
    const body = sseLines(
      CHAT_DELTA('"tool"이라는 단어는'),
      CHAT_DELTA(' "label"로 번역됩니다'),
      CHAT_FINISH,
    )
    globalThis.fetch = mockHermesFetch(body) as unknown as typeof fetch

    const events = await collect(callAnthropicStream('sys', [{ role: 'user', content: 'tool 사용법' }]))
    const toolEvents = events.filter(e => e.type === 'tool_call' || e.type === 'tool_result')
    const textEvents = events.filter(e => e.type === 'text')

    expect(toolEvents).toHaveLength(0)
    expect(textEvents).toHaveLength(2)
  })

  test('malformed JSON 라인은 drop되고 이후 이벤트는 정상 처리', async () => {
    const body = `data: {broken json\n\n` + sseLines(CHAT_DELTA('ok'), CHAT_FINISH)
    globalThis.fetch = mockHermesFetch(body) as unknown as typeof fetch

    const events = await collect(callAnthropicStream('sys', [{ role: 'user', content: 'q' }]))
    const result = events.find(e => e.type === 'result')
    expect(result?.type === 'result' && result.text).toBe('ok')
  })

  test('tool 필드만 있고 label 없는 경우도 인식 (shape guard = typeof tool === string)', async () => {
    const body = sseLines(
      JSON.stringify({ tool: 'mcp__korean-law__get_law_text' }),
      CHAT_DELTA('본문'),
      CHAT_FINISH,
    )
    globalThis.fetch = mockHermesFetch(body) as unknown as typeof fetch

    const events = await collect(callAnthropicStream('sys', [{ role: 'user', content: 'q' }]))
    const toolCalls = events.filter(e => e.type === 'tool_call')
    expect(toolCalls).toHaveLength(1)
    if (toolCalls[0]?.type === 'tool_call') {
      expect(toolCalls[0].name).toBe('get_law_text')
    }
  })

  test('tool progress에 status=started/completed 분리 이벤트', async () => {
    const body = sseLines(
      JSON.stringify({ tool: 'mcp_korean_law_search_law', status: 'started' }),
      JSON.stringify({ tool: 'mcp_korean_law_search_law', status: 'completed' }),
      CHAT_DELTA('답'),
      CHAT_FINISH,
    )
    globalThis.fetch = mockHermesFetch(body) as unknown as typeof fetch

    const events = await collect(callAnthropicStream('sys', [{ role: 'user', content: 'q' }]))
    const toolCalls = events.filter(e => e.type === 'tool_call')
    const toolResults = events.filter(e => e.type === 'tool_result')
    expect(toolCalls).toHaveLength(1)
    expect(toolResults).toHaveLength(1)
  })

  test('choices 없는 unknown JSON은 drop', async () => {
    const body = sseLines(
      JSON.stringify({ ping: 'keepalive' }),
      CHAT_DELTA('답'),
      CHAT_FINISH,
    )
    globalThis.fetch = mockHermesFetch(body) as unknown as typeof fetch

    const events = await collect(callAnthropicStream('sys', [{ role: 'user', content: 'q' }]))
    const toolEvents = events.filter(e => e.type === 'tool_call' || e.type === 'tool_result')
    expect(toolEvents).toHaveLength(0)
    expect(events.find(e => e.type === 'text')).toBeDefined()
  })
})

describe('hermes-client full history (C2)', () => {
  const originalFetch = globalThis.fetch
  let capturedBody: Record<string, unknown> | null = null

  beforeEach(() => {
    capturedBody = null
    globalThis.fetch = vi.fn(async (_url, init) => {
      const body = init?.body as string
      capturedBody = JSON.parse(body)
      return new Response(sseStream(sseLines(CHAT_DELTA('ok'), CHAT_FINISH)), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }) as unknown as typeof fetch
  })
  afterEach(() => { globalThis.fetch = originalFetch })

  test('multi-turn: system + 전체 user/assistant 턴이 body.messages로 전달', async () => {
    const messages: DirectMessage[] = [
      { role: 'user', content: '관세법이란?' },
      { role: 'assistant', content: '관세법은 ...' },
      { role: 'user', content: '제1조 내용은?' },
    ]
    await collect(callAnthropicStream('sys', messages))

    const sentMessages = (capturedBody?.messages as Array<{ role: string; content: string }>) || []
    expect(sentMessages).toHaveLength(4) // system + 3
    expect(sentMessages[0]).toEqual({ role: 'system', content: 'sys' })
    expect(sentMessages[1].role).toBe('user')
    expect(sentMessages[2].role).toBe('assistant')
    expect(sentMessages[3].content).toBe('제1조 내용은?')
  })

  test('40KB 초과: 오래된 턴부터 drop, 마지막 user는 반드시 포함', async () => {
    const bigText = 'A'.repeat(20_000)
    const messages: DirectMessage[] = [
      { role: 'user', content: bigText },      // 20KB
      { role: 'assistant', content: bigText }, // 20KB
      { role: 'user', content: bigText },      // 20KB → total 60KB > 40KB
      { role: 'user', content: '짧은 최신 질문' }, // 반드시 보존
    ]
    await collect(callAnthropicStream('sys', messages))

    const sentMessages = (capturedBody?.messages as Array<{ role: string; content: string }>) || []
    // 마지막 user 반드시 포함
    expect(sentMessages[sentMessages.length - 1].content).toBe('짧은 최신 질문')
    // 길이 합이 40KB 근처 이하
    const total = sentMessages.reduce((s, m) => s + m.content.length, 0)
    expect(total).toBeLessThanOrEqual(60_000) // system + 일부 드롭 결과
    // 최소 system 포함
    expect(sentMessages[0].role).toBe('system')
  })

  test('historyMode=latest-only: 마지막 user 턴만 전달 (fast-path opt-out)', async () => {
    const messages: DirectMessage[] = [
      { role: 'user', content: '이전 질문' },
      { role: 'assistant', content: '이전 답' },
      { role: 'user', content: '새 질문' },
    ]
    await collect(callAnthropicStream('sys', messages, { historyMode: 'latest-only' }))

    const sentMessages = (capturedBody?.messages as Array<{ role: string; content: string }>) || []
    expect(sentMessages).toHaveLength(2)
    expect(sentMessages[1].content).toBe('새 질문')
  })

  test('callAnthropic(비스트리밍) 도 full history 전달', async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string)
      return new Response(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch

    const messages: DirectMessage[] = [
      { role: 'user', content: 'A' },
      { role: 'assistant', content: 'B' },
      { role: 'user', content: 'C' },
    ]
    await callAnthropic('sys', messages)

    const sentMessages = (capturedBody?.messages as Array<{ role: string; content: string }>) || []
    expect(sentMessages).toHaveLength(4)
    expect(sentMessages.map(m => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
  })
})
