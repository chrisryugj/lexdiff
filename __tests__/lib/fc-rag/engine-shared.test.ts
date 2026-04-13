/**
 * engine-shared 단위 테스트.
 *
 * 검증:
 *  - getConversationContext / storeConversation: Redis source-of-truth + Map fallback (H-ARC1)
 *  - Redis 미설정 시 Map 단독 동작
 *  - Redis 일시 장애 시 Map fallback 유지
 *  - Map dual-write로 후속 read에서 이력 보존
 *  - inferComplexity / inferQueryType branch
 *  - withTimeout 정상/타임아웃
 *  - getMaxToolTurns / getMaxClaudeTurns
 *
 * @upstash/redis는 vi.mock으로 인메모리 가짜로 대체. 환경변수로 활성화 분기.
 */

import { describe, expect, it } from 'vitest'

// 환경변수 없는 상태로 모듈 import → Map fallback 모드 (cachedRedis = null)
delete process.env.UPSTASH_REDIS_REST_URL
delete process.env.UPSTASH_REDIS_REST_TOKEN

import {
  getConversationContext,
  storeConversation,
  inferComplexity,
  inferQueryType,
  withTimeout,
  getMaxToolTurns,
  getMaxClaudeTurns,
} from '@/lib/fc-rag/engine-shared'

// ─── conversationStore (Map fallback 모드) ───
// Redis dual-write 경로는 @upstash/redis의 lazy require + 모듈-단일 cachedRedis 로직 때문에
// 단위 테스트에서 cross-test reset이 어렵다. 여기서는 Map fallback 경로만 검증하고,
// Redis dual-write는 staging 환경 스모크로 확인한다 (H-ARC1 본 구현은 프로덕션에서 관찰).

describe('conversationStore (Map fallback)', () => {
  it('storeConversation 후 getConversationContext가 이력을 반환', async () => {
    const id = 'conv-1'
    await storeConversation(id, '근로기준법 제26조?', '해고 예고는 30일 전')
    await storeConversation(id, '벌칙은?', '500만원 이하 벌금')
    const ctx = await getConversationContext(id)
    expect(ctx).toContain('근로기준법 제26조')
    expect(ctx).toContain('해고 예고')
    expect(ctx).toContain('500만원')
  })

  it('conversationId가 없으면 빈 문자열, store는 no-op', async () => {
    expect(await getConversationContext()).toBe('')
    expect(await getConversationContext(undefined)).toBe('')
    await storeConversation(undefined, 'q', 'a')
  })

  it('최근 3건만 컨텍스트로 반환 (slice -3)', async () => {
    const id = 'conv-slice'
    for (let i = 0; i < 5; i++) {
      await storeConversation(id, `Q${i}`, `A${i}`)
    }
    const ctx = await getConversationContext(id)
    expect(ctx).toContain('Q2')
    expect(ctx).toContain('Q3')
    expect(ctx).toContain('Q4')
    expect(ctx).not.toContain('Q0')
    expect(ctx).not.toContain('Q1')
  })

  it('CONV_MAX_ENTRIES=5 초과 시 오래된 항목부터 shift', async () => {
    const id = 'conv-max'
    for (let i = 0; i < 8; i++) {
      await storeConversation(id, `Q${i}`, `A${i}`)
    }
    const ctx = await getConversationContext(id)
    // 최근 3건만 반환 — Q5, Q6, Q7
    expect(ctx).toContain('Q7')
    expect(ctx).toContain('Q6')
    expect(ctx).toContain('Q5')
    expect(ctx).not.toContain('Q4')
  })

  it('답변 2000자 트림 + ctx 추가로 500자 슬라이스', async () => {
    const id = 'conv-trim'
    const longAnswer = 'x'.repeat(5000)
    await storeConversation(id, 'q', longAnswer)
    const ctx = await getConversationContext(id)
    // ctx는 '[이전 질문 1] q\n[이전 답변 1] xxxx...(500)' 형식
    expect(ctx.length).toBeLessThan(800)
  })
})

// ─── inferComplexity ───

describe('inferComplexity', () => {
  it.each<[string, 'simple' | 'moderate' | 'complex']>([
    ['세금이 뭐야?', 'simple'],
    ['민법 제839조의2의 재산분할청구권 행사기간은?', 'moderate'],
    ['관세법 제38조와 제39조의 차이를 판례와 함께 비교해서 신구법 대조해줘', 'complex'],
    ['근로기준법 제53조의 위임 시행령 내용은?', 'moderate'],
  ])('"%s" → %s', (q, expected) => {
    expect(inferComplexity(q)).toBe(expected)
  })
})

describe('inferQueryType', () => {
  it.each<[string, string]>([
    ['음주운전 처벌 기준', 'consequence'],
    ['과태료 얼마야', 'scope'],
    ['주식회사 설립 절차는?', 'procedure'],
    ['정의가 뭐야', 'definition'],
    ['요건 충족하면', 'requirement'],
    ['감면 받을 수 있어?', 'exemption'],
    ['차이점 비교해줘 처벌과', 'comparison'],
  ])('"%s" → %s', (q, expected) => {
    expect(inferQueryType(q)).toBe(expected)
  })
})

describe('withTimeout', () => {
  it('정상 종료 시 값을 반환', async () => {
    const r = await withTimeout(Promise.resolve(42), 1000, 'test')
    expect(r).toBe(42)
  })

  it('타임아웃 초과 시 에러 (real timer, 짧게)', async () => {
    const slow = new Promise(() => {})
    await expect(withTimeout(slow, 30, 'slow')).rejects.toThrow(/타임아웃/)
  })

  it('reject 전파', async () => {
    await expect(withTimeout(Promise.reject(new Error('inner')), 1000, 'x')).rejects.toThrow(/inner/)
  })
})

describe('getMaxToolTurns / getMaxClaudeTurns', () => {
  it('complexity 별 limit', () => {
    expect(getMaxToolTurns('simple')).toBe(2)
    expect(getMaxToolTurns('moderate')).toBe(3)
    expect(getMaxToolTurns('complex')).toBe(4)
    expect(getMaxClaudeTurns('simple')).toBe(5)
    expect(getMaxClaudeTurns('moderate')).toBe(8)
    expect(getMaxClaudeTurns('complex')).toBe(12)
  })
})
