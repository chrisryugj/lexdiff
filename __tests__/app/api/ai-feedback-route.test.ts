/**
 * app/api/ai-feedback/route.ts — 본문 보관 정책 회귀 테스트.
 *
 * 개인정보처리방침이 고지한 두 가지를 코드가 실제로 지키는지 고정한다.
 *  1. good 은 메타만 (query/answer null)
 *  2. bad/improve 로 본문을 보관할 때도 저장 직전 PII 를 마스킹
 *
 * 2번은 실제로 한 번 끊겼던 적이 있다 — 마이그레이션 010 에서 레거시 질의로그
 * 테이블을 드롭하면서 scrubPII 의 유일한 호출부가 같이 사라졌고, 012 에서 피드백
 * 본문 저장 경로가 새로 생겼을 때 다시 연결되지 않았다. scrubber 는 실물을 쓴다.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

const { insertMock } = vi.hoisted(() => ({ insertMock: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: () => ({ from: () => ({ insert: insertMock }) }),
}))

vi.mock('@/lib/ai-telemetry', () => ({
  sessionAnonHash: () => 'test-session-hash',
  classifyUa: () => 'desktop',
}))

vi.mock('@/lib/debug-logger', () => ({
  debugLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

// 레이트리밋(IP 기준 분당 5회)에 걸리지 않도록 호출마다 다른 IP를 준다.
let ipSeq = 0
vi.mock('@/lib/get-client-ip', () => ({
  getClientIP: () => `10.0.0.${++ipSeq}`,
}))

import { POST } from '@/app/api/ai-feedback/route'

function req(body: unknown) {
  return {
    json: async () => body,
    headers: { get: () => 'Mozilla/5.0' },
  } as unknown as Parameters<typeof POST>[0]
}

/** insertMock 이 마지막으로 받은 row */
function lastRow() {
  return insertMock.mock.calls.at(-1)?.[0] as Record<string, unknown>
}

describe('ai-feedback 본문 보관 정책', () => {
  beforeEach(() => {
    insertMock.mockReset()
    insertMock.mockResolvedValue({ error: null })
  })

  it('good 은 본문을 저장하지 않는다', async () => {
    await POST(req({ feedbackType: 'good', query: '퇴직금 질문', answer: '답변 본문' }))

    const row = lastRow()
    expect(row.feedback_type).toBe('good')
    expect(row.query).toBeNull()
    expect(row.answer).toBeNull()
  })

  it('bad 는 본문을 저장하되 주민등록번호를 마스킹한다', async () => {
    await POST(
      req({
        feedbackType: 'bad',
        query: '제가 900101-1234567 인데 퇴직금을 못 받았습니다',
        answer: '근로기준법 제36조에 따라',
      }),
    )

    const query = lastRow().query as string
    expect(query).not.toContain('900101-1234567')
    expect(query).toContain('[RRN]')
    expect(query).toContain('퇴직금을 못 받았습니다')
  })

  it('improve 는 연락처·이메일도 마스킹한다', async () => {
    await POST(
      req({
        feedbackType: 'improve',
        query: '연락처는 010-1234-5678, 메일은 hong@example.com 입니다',
        answer: '답변',
      }),
    )

    const query = lastRow().query as string
    expect(query).not.toContain('010-1234-5678')
    expect(query).not.toContain('hong@example.com')
    expect(query).toContain('[PHONE]')
    expect(query).toContain('[EMAIL]')
  })

  it('마스킹은 답변 본문에도 적용된다', async () => {
    await POST(
      req({
        feedbackType: 'bad',
        query: '질문',
        answer: '담당자 이메일 clerk@gwangjin.go.kr 로 문의하십시오',
      }),
    )

    const answer = lastRow().answer as string
    expect(answer).not.toContain('clerk@gwangjin.go.kr')
    expect(answer).toContain('[EMAIL]')
  })

  it('마스킹 후에도 8000자 상한을 지킨다', async () => {
    await POST(req({ feedbackType: 'bad', query: '가'.repeat(9000), answer: '답변' }))

    expect((lastRow().query as string).length).toBe(8000)
  })

  it('허용되지 않은 feedbackType 은 400 이고 기록하지 않는다', async () => {
    const res = await POST(req({ feedbackType: 'terrible', query: '질문', answer: '답변' }))

    expect(res.status).toBe(400)
    expect(insertMock).not.toHaveBeenCalled()
  })
})
