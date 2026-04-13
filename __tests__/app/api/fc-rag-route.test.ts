/**
 * app/api/fc-rag/route.ts 단위 테스트.
 *
 * POST 핸들러 전체는 NextRequest + Hermes + Gemini + usage-tracker 등
 * 너무 많은 의존성이 얽혀 있어 통합 테스트 수준이 필요하다.
 * 여기서는 route.ts에서 export한 작은 헬퍼 단위로 검증:
 *  - streamCitationVerification (M5): 10초 타임아웃, skipped 전파, articleNumber 분기
 *  - combineSignals: 다수 AbortSignal 합성, 이미 aborted 케이스
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { FCRAGCitation } from '@/lib/fc-rag/engine'

const { verifyAllCitationsMock } = vi.hoisted(() => ({
  verifyAllCitationsMock: vi.fn(),
}))

vi.mock('@/lib/citation-verifier', () => ({
  verifyAllCitations: verifyAllCitationsMock,
}))

// usage-tracker / engine 등 POST import 체인은 모두 stub (route.ts import 시 평가되는 것들)
vi.mock('@/lib/usage-tracker', () => ({
  getUsageHeaders: async () => ({}),
  getUsageWarningMessage: () => null,
  isQuotaExceeded: async () => false,
  recordAITokens: async () => ({}),
  recordAIUsage: async () => {},
}))

vi.mock('@/lib/fc-rag/engine', () => ({
  executeClaudeRAGStream: vi.fn(),
  executeGeminiRAGStream: vi.fn(),
}))

vi.mock('@/lib/trace-logger', () => ({
  generateTraceId: () => 'test-trace-id',
  traceLogger: {
    startTrace: vi.fn(),
    addEvent: vi.fn(),
    completeTrace: vi.fn(),
  },
}))

vi.mock('@/lib/query-logger', () => ({
  appendQueryLog: vi.fn(),
}))

import { streamCitationVerification, combineSignals } from '@/app/api/fc-rag/route'

beforeEach(() => {
  verifyAllCitationsMock.mockReset()
})

// ─── streamCitationVerification ───

describe('streamCitationVerification (M5)', () => {
  function capture() {
    const events: unknown[] = []
    const sendAndLog = (e: unknown) => { events.push(e) }
    return { events, sendAndLog }
  }

  it('citations가 비어있으면 아무것도 보내지 않는다', async () => {
    const { events, sendAndLog } = capture()
    await streamCitationVerification([], sendAndLog)
    expect(events).toHaveLength(0)
    expect(verifyAllCitationsMock).not.toHaveBeenCalled()
  })

  it('조문 번호가 유효하면 verifyAllCitations 결과를 citation_verification 이벤트로 flush', async () => {
    verifyAllCitationsMock.mockResolvedValue([
      {
        lawName: '관세법',
        articleNum: '제38조',
        text: '세액의 보정',
        source: 'hermes',
        verified: true,
        verificationMethod: 'exact',
      },
    ])

    const citations: FCRAGCitation[] = [
      {
        lawName: '관세법',
        articleNumber: '제38조',
        chunkText: '세액의 보정',
        source: 'hermes',
      },
    ]

    const { events, sendAndLog } = capture()
    await streamCitationVerification(citations, sendAndLog)

    expect(verifyAllCitationsMock).toHaveBeenCalledOnce()
    // status 진행 + citation_verification 이벤트
    const verification = events.find(
      (e): e is { type: string } => typeof e === 'object' && e !== null && (e as { type?: string }).type === 'citation_verification',
    )
    expect(verification).toBeDefined()
  })

  it('articleNumber가 형식을 벗어나면 skipped로 분리', async () => {
    verifyAllCitationsMock.mockResolvedValue([])

    const citations: FCRAGCitation[] = [
      {
        lawName: '관세법',
        articleNumber: '부칙',
        chunkText: '부칙 내용',
        source: 'hermes',
      },
    ]

    const { events, sendAndLog } = capture()
    await streamCitationVerification(citations, sendAndLog)

    // verifyAllCitations는 호출되지 않음 (verifiable 0건)
    expect(verifyAllCitationsMock).not.toHaveBeenCalled()
    // 따라서 citation_verification 이벤트도 없음
    const hasVerification = events.some(
      e => typeof e === 'object' && e !== null && (e as { type?: string }).type === 'citation_verification',
    )
    expect(hasVerification).toBe(false)
  })

  it('verifyAllCitations 타임아웃 시 skipped로 fallback하며 throw하지 않음', async () => {
    // 10초 타임아웃 — 그보다 오래 걸리는 promise
    verifyAllCitationsMock.mockImplementation(
      () => new Promise(() => { /* never resolves */ }),
    )

    const citations: FCRAGCitation[] = [
      {
        lawName: '민법',
        articleNumber: '제750조',
        chunkText: '불법행위',
        source: 'hermes',
      },
    ]

    const { events, sendAndLog } = capture()
    // 실제로 10초 대기하지 않도록 fake timer
    vi.useFakeTimers()
    const promise = streamCitationVerification(citations, sendAndLog)
    await vi.advanceTimersByTimeAsync(10_100)
    await promise
    vi.useRealTimers()

    const verification = events.find(
      e => typeof e === 'object' && e !== null && (e as { type?: string }).type === 'citation_verification',
    ) as { type: 'citation_verification'; citations: Array<{ verified: boolean; verificationMethod: string }> } | undefined

    expect(verification).toBeDefined()
    if (verification) {
      expect(verification.citations[0].verified).toBe(false)
      expect(verification.citations[0].verificationMethod).toBe('skipped')
    }
  }, 15_000)
})

// ─── combineSignals ───

describe('combineSignals', () => {
  it('둘 중 하나가 abort되면 합성 signal도 abort', () => {
    const a = new AbortController()
    const b = new AbortController()
    const combined = combineSignals([a.signal, b.signal])
    expect(combined.aborted).toBe(false)
    b.abort()
    expect(combined.aborted).toBe(true)
  })

  it('이미 abort된 signal이 섞여있으면 즉시 abort 상태', () => {
    const a = new AbortController()
    a.abort()
    const b = new AbortController()
    const combined = combineSignals([a.signal, b.signal])
    expect(combined.aborted).toBe(true)
  })
})
