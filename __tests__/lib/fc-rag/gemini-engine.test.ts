/**
 * gemini-engine 단위 테스트.
 *
 * full multi-turn function calling은 GoogleGenAI 의존이 깊어 단위테스트 비용이 큼.
 * 여기서는 분기 중 단위 검증이 용이한 케이스만 커버:
 *  - Gemini API key 미설정 → error + fallback answer 반환
 *  - executeTool mock 상태에서 preEvidence 경로 시 초기 이벤트 순서
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { FCRAGStreamEvent } from '@/lib/fc-rag/engine-shared'

const { geminiStream, toolExec } = vi.hoisted(() => ({
  geminiStream: vi.fn(),
  toolExec: vi.fn(),
}))

// GoogleGenAI mock: Gemini SDK 대체
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContentStream: geminiStream,
    }
  },
}))

vi.mock('@/lib/fc-rag/tool-adapter', () => ({
  executeTool: toolExec,
  executeToolsParallel: vi.fn(async () => []),
  getToolDeclarations: () => [],
}))

import { executeGeminiRAGStream } from '@/lib/fc-rag/gemini-engine'

async function collect(gen: AsyncGenerator<FCRAGStreamEvent>): Promise<FCRAGStreamEvent[]> {
  const out: FCRAGStreamEvent[] = []
  for await (const e of gen) out.push(e)
  return out
}

beforeEach(() => {
  geminiStream.mockReset()
  toolExec.mockReset()
  delete process.env.GEMINI_API_KEY
})

describe('executeGeminiRAGStream', () => {
  it('API key 미설정 + preEvidence 있음 → error + fallback answer', async () => {
    // preEvidence로 fast-path/pre-evidence 모두 건너뛰고 키 체크로 직행
    const events = await collect(
      executeGeminiRAGStream('관세법 제38조 내용', { preEvidence: 'ev' }),
    )

    const errorEvent = events.find(e => e.type === 'error')
    expect(errorEvent).toBeDefined()
    if (errorEvent && errorEvent.type === 'error') {
      expect(errorEvent.message).toMatch(/API 키/)
    }

    const answerEvent = events.find(e => e.type === 'answer')
    expect(answerEvent).toBeDefined()
    if (answerEvent && answerEvent.type === 'answer') {
      expect(answerEvent.data.confidenceLevel).toBe('low')
      expect(answerEvent.data.warnings).toContain('Gemini API 키 미설정')
    }

    // Gemini API 호출은 일어나지 않음
    expect(geminiStream).not.toHaveBeenCalled()
  })

  it('사용자 API key가 options.apiKey로 전달되면 process.env 미설정이어도 진행', async () => {
    // generateContentStream이 빈 stream 반환 → 에러 없이 완주는 하지 못할 수 있으나
    // 최소 "API 키 없음" 에러 경로는 타지 않음을 검증
    geminiStream.mockImplementation(async () => {
      async function* empty() { /* no events */ }
      return empty()
    })

    const events = await collect(
      executeGeminiRAGStream('관세법 검색', {
        apiKey: 'AIzaSyA'.padEnd(39, 'x'),
        preEvidence: 'ev',
      }),
    )

    const errorEvent = events.find(
      e => e.type === 'error' && /API 키/.test(e.message),
    )
    expect(errorEvent).toBeUndefined()
  })

  it('초기 status 이벤트에 complexity label 포함', async () => {
    process.env.GEMINI_API_KEY = 'dummy'
    // stream이 빈 async iterable 반환
    geminiStream.mockImplementation(async () => {
      async function* empty() { /* no events */ }
      return empty()
    })

    const events = await collect(
      executeGeminiRAGStream('세금이 뭐야?', { preEvidence: 'ev' }),
    )

    const firstStatus = events.find(e => e.type === 'status') as
      | { type: 'status'; message: string }
      | undefined
    expect(firstStatus).toBeDefined()
    if (firstStatus) {
      expect(firstStatus.message).toMatch(/단순|보통|복합/)
    }
  })
})
