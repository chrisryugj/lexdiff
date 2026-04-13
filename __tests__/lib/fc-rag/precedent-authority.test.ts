/**
 * M7: precedent authority scoring
 */
import { describe, test, expect } from 'vitest'
import {
  courtTierWeight,
  parseYear,
  yearDecayWeight,
  isEnBancJudgment,
  scorePrecedent,
  rankPrecedents,
} from '@/lib/fc-rag/precedent-authority'

describe('courtTierWeight', () => {
  test('대법원 → 1.0', () => expect(courtTierWeight('대법원')).toBe(1.0))
  test('고등법원 → 0.8', () => expect(courtTierWeight('서울고등법원')).toBe(0.8))
  test('지방법원 → 0.6', () => expect(courtTierWeight('서울지방법원')).toBe(0.6))
  test('헌법재판소 → 1.0', () => expect(courtTierWeight('헌법재판소')).toBe(1.0))
  test('unknown → 0.4', () => expect(courtTierWeight('가상법원')).toBe(0.4))
  test('undefined → 0.4', () => expect(courtTierWeight(undefined)).toBe(0.4))
})

describe('parseYear', () => {
  test('YYYY-MM-DD', () => expect(parseYear('2020-05-10')).toBe(2020))
  test('YYYYMMDD', () => expect(parseYear('20200510')).toBe(2020))
  test('invalid → null', () => expect(parseYear('abc')).toBe(null))
})

describe('yearDecayWeight', () => {
  test('현재 연도 → 1.0', () => {
    const now = new Date().getFullYear()
    expect(yearDecayWeight(now, now)).toBe(1.0)
  })
  test('15년 전 → 0.5 (반감기)', () => {
    const now = 2024
    expect(yearDecayWeight(now - 15, now)).toBeCloseTo(0.5, 3)
  })
  test('30년 전 → 0.25', () => {
    const now = 2024
    expect(yearDecayWeight(now - 30, now)).toBeCloseTo(0.25, 3)
  })
  test('null → 0.5', () => expect(yearDecayWeight(null)).toBe(0.5))
})

describe('isEnBancJudgment', () => {
  test('전원합의체 문자열 감지', () => {
    expect(isEnBancJudgment({ judgmentType: '전원합의체 판결' })).toBe(true)
  })
  test('일반 판결', () => {
    expect(isEnBancJudgment({ judgmentType: '판결' })).toBe(false)
  })
  test('isEnBanc 직접 true', () => {
    expect(isEnBancJudgment({ isEnBanc: true })).toBe(true)
  })
})

describe('scorePrecedent', () => {
  test('최신 대법원 > 오래된 대법원', () => {
    const recent = scorePrecedent({ court: '대법원', date: '2023-01-01' })
    const old = scorePrecedent({ court: '대법원', date: '1990-01-01' })
    expect(recent).toBeGreaterThan(old)
  })

  test('대법원 > 지방법원 (같은 연도)', () => {
    const s = scorePrecedent({ court: '대법원', date: '2020-01-01' })
    const d = scorePrecedent({ court: '서울지방법원', date: '2020-01-01' })
    expect(s).toBeGreaterThan(d)
  })

  test('전원합의체 boost', () => {
    const normal = scorePrecedent({ court: '대법원', date: '2020-01-01' })
    const enBanc = scorePrecedent({ court: '대법원', date: '2020-01-01', judgmentType: '전원합의체 판결' })
    expect(enBanc).toBeGreaterThan(normal)
  })

  test('score ∈ [0, 1.2]', () => {
    const s = scorePrecedent({ court: '대법원', date: new Date().toISOString(), judgmentType: '전원합의체' })
    expect(s).toBeLessThanOrEqual(1.2)
    expect(s).toBeGreaterThanOrEqual(0)
  })
})

describe('rankPrecedents', () => {
  test('내림차순 정렬, 안정적', () => {
    const list = [
      { court: '서울지방법원', date: '2020-01-01' },
      { court: '대법원', date: '1990-01-01' },
      { court: '대법원', date: '2023-01-01', judgmentType: '전원합의체' },
      { court: '서울고등법원', date: '2022-01-01' },
    ]
    const ranked = rankPrecedents(list)
    expect(ranked[0].court).toBe('대법원')
    expect(ranked[0].judgmentType).toContain('전원합의체')
    expect(ranked[ranked.length - 1].court).toBe('서울지방법원')
  })
})
