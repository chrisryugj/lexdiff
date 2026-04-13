/**
 * claude-engine 단위 테스트 (H-ARC2 abort + pre-evidence + meta answer reject).
 *
 * hermes-client.callAnthropicStream / executeTool을 mock하여
 * 엔진 흐름 분기를 검증한다.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { FCRAGStreamEvent } from '@/lib/fc-rag/engine-shared'

const { hermesStream, toolExec } = vi.hoisted(() => ({
  hermesStream: vi.fn(),
  toolExec: vi.fn(),
}))

vi.mock('@/lib/fc-rag/hermes-client', () => ({
  callAnthropicStream: hermesStream,
}))

vi.mock('@/lib/fc-rag/tool-adapter', () => ({
  executeTool: toolExec,
  executeToolsParallel: vi.fn(async () => []),
  getToolDeclarations: () => [],
  getAnthropicToolDefinitions: () => [],
}))

import { executeClaudeRAGStream } from '@/lib/fc-rag/claude-engine'

async function collect(gen: AsyncGenerator<FCRAGStreamEvent>): Promise<FCRAGStreamEvent[]> {
  const out: FCRAGStreamEvent[] = []
  for await (const e of gen) out.push(e)
  return out
}

beforeEach(() => {
  hermesStream.mockReset()
  toolExec.mockReset()
})

describe('executeClaudeRAGStream', () => {
  it('preEvidence 있으면 fast-path와 pre-evidence 수집을 스킵하고 바로 Hermes 호출', async () => {
    // 메타 키워드(추가 조회/부족/확인되지 않 등) 피한 200+자 답변
    hermesStream.mockImplementation(async function* () {
      yield {
        type: 'result',
        text: '관세법 제38조는 세액의 보정에 관한 조문임. 납세의무자가 신고납부한 세액에 과오가 있는 경우 보정 절차를 거쳐 정확한 세액을 다시 산정함. 세관장은 신고 수리 전에 심사할 수 있으며 신고 수리 후에도 경정 처분을 내릴 수 있음. 시행령에서 구체 절차를 규정함.',
        stopReason: 'end_turn',
        usage: { inputTokens: 100, outputTokens: 50 },
      }
    })

    const events = await collect(
      executeClaudeRAGStream('관세법 제38조', { preEvidence: '[사전 수집] ...' }),
    )

    // executeTool 호출 없음 (preEvidence 경로)
    expect(toolExec).not.toHaveBeenCalled()
    // Hermes 호출 있음
    expect(hermesStream).toHaveBeenCalledTimes(1)

    // answer 이벤트 존재
    const answerEvent = events.find(e => e.type === 'answer')
    expect(answerEvent).toBeDefined()
    if (answerEvent && answerEvent.type === 'answer') {
      expect(answerEvent.data.answer).toContain('제38조')
      expect(answerEvent.data.confidenceLevel).toBe('high')
    }
  })

  it('meta 답변 감지 시 error 이벤트 생성 (짧은 응답 + 메타 문구)', async () => {
    hermesStream.mockImplementation(async function* () {
      yield {
        type: 'result',
        text: '해당 내용은 추가 조회 필요합니다.',
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 5 },
      }
    })

    const events = await collect(
      executeClaudeRAGStream('test query', { preEvidence: 'ev' }),
    )

    const errorEvent = events.find(e => e.type === 'error')
    expect(errorEvent).toBeDefined()
    if (errorEvent && errorEvent.type === 'error') {
      expect(errorEvent.message).toMatch(/메타 답변|empty/)
    }
  })

  it('빈 응답은 error', async () => {
    hermesStream.mockImplementation(async function* () {
      yield {
        type: 'result',
        text: '',
        stopReason: 'end_turn',
        usage: { inputTokens: 5, outputTokens: 0 },
      }
    })

    const events = await collect(
      executeClaudeRAGStream('test', { preEvidence: 'ev' }),
    )
    expect(events.some(e => e.type === 'error')).toBe(true)
  })

  it('H-ARC2: 이미 aborted된 signal이면 Hermes 호출 전에 status 반환 후 종료', async () => {
    const ctrl = new AbortController()
    ctrl.abort()

    const events = await collect(
      executeClaudeRAGStream('아무 질의', {
        preEvidence: 'ev',
        signal: ctrl.signal,
      }),
    )

    // hermes 호출 전 abort 체크로 조기 종료 — hermes 호출 있었더라도
    // 내부 루프에서 즉시 종료되므로 result 이벤트 없음
    const answerEvent = events.find(e => e.type === 'answer')
    expect(answerEvent).toBeUndefined()
    // 취소 상태 메시지가 들어감
    const statusAbort = events.find(e => e.type === 'status' && /취소/.test(e.message))
    expect(statusAbort).toBeDefined()
  })

  it('Hermes가 tool_call/tool_result 이벤트를 yield하면 displayName이 있는 것만 전달', async () => {
    hermesStream.mockImplementation(async function* () {
      // 알려진 도구
      yield { type: 'tool_call', name: 'search_law', input: { query: '관세법' } }
      yield { type: 'tool_result', name: 'search_law', content: '검색 결과', isError: false }
      // 알 수 없는 도구 — display 필터로 스킵됨
      yield { type: 'tool_call', name: 'unknown_tool', input: {} }
      yield {
        type: 'result',
        text: '관세법은 수입 물품에 부과되는 세금에 관한 법률로, 제38조는 신고납부 절차를 규정합니다. 납세의무자는 수입신고 시 납세신고를 함께 해야 합니다.',
        stopReason: 'end_turn',
        usage: { inputTokens: 50, outputTokens: 30 },
      }
    })

    const events = await collect(
      executeClaudeRAGStream('관세법 검색', { preEvidence: 'ev' }),
    )

    const toolCalls = events.filter(e => e.type === 'tool_call')
    const toolResults = events.filter(e => e.type === 'tool_result')
    // search_law만 통과, unknown_tool은 필터
    expect(toolCalls.length).toBe(1)
    expect(toolResults.length).toBe(1)
    if (toolCalls[0].type === 'tool_call') {
      expect(toolCalls[0].name).toBe('search_law')
      expect(toolCalls[0].displayName).toBeTruthy()
    }

    // 정상 answer
    expect(events.some(e => e.type === 'answer')).toBe(true)
  })

  it('answer_token 이벤트가 개별 텍스트 청크로 전달', async () => {
    hermesStream.mockImplementation(async function* () {
      yield { type: 'text', text: '첫 번째 토큰' }
      yield { type: 'text', text: ' 두 번째 토큰' }
      yield {
        type: 'result',
        text: '첫 번째 토큰 두 번째 토큰이 포함된 긴 답변. 관세법에 따르면 신고납부 의무가 있고, 세액 부족 시 보정이 가능합니다.',
        stopReason: 'end_turn',
        usage: { inputTokens: 20, outputTokens: 15 },
      }
    })

    const events = await collect(
      executeClaudeRAGStream('토큰 스트림 테스트', { preEvidence: 'ev' }),
    )

    const tokens = events.filter(e => e.type === 'answer_token')
    expect(tokens.length).toBeGreaterThanOrEqual(2)
  })
})
