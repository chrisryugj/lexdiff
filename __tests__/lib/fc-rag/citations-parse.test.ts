/**
 * parseCitationsFromAnswer / calcAnswerConfidence 회귀 테스트
 *
 * H2: 낫표 없는 bare 법령명 인용("도로교통법 제44조")도 citation으로 인정 —
 *     낫표 누락 시 citation 0개 → 거짓 "일반 지식 기반" 배너 + 신뢰도 low 오탐 방지.
 * H1: 텍스트 경로(relay/claude) 공용 신뢰도 함수 — 경로별 3원화 제거.
 */
import { describe, test, expect } from 'vitest'
import { parseCitationsFromAnswer, calcAnswerConfidence } from '@/lib/fc-rag/citations'

describe('parseCitationsFromAnswer — bare 법령명 (H2)', () => {
  test('낫표 없는 "도로교통법 제44조" 인용 인식', () => {
    const answer = '## 결론\n음주운전은 도로교통법 제44조에 따라 금지됨.\n\n## 근거 법령\n- 도로교통법 제44조'
    const cits = parseCitationsFromAnswer(answer)
    expect(cits.some(c => c.lawName === '도로교통법' && c.articleNumber === '제44조')).toBe(true)
  })

  test('bare 시행령/시행규칙 접미사 포함 인식', () => {
    const cits = parseCitationsFromAnswer('여권법 시행령 제10조에 따르면 수수료가 정해져 있음')
    expect(cits.some(c => c.lawName === '여권법 시행령' && c.articleNumber === '제10조')).toBe(true)
  })

  test('낫표·bare 동일 조문은 중복 없이 1건', () => {
    const answer = '「도로교통법」 제44조와 도로교통법 제44조는 같은 조문'
    const cits = parseCitationsFromAnswer(answer)
    expect(cits.filter(c => c.lawName === '도로교통법' && c.articleNumber === '제44조')).toHaveLength(1)
  })

  test('대명사형(동법/이 법/같은 법)은 법령명으로 잡지 않음', () => {
    const cits = parseCitationsFromAnswer('동법 제3조와 같은법 제5조 참조')
    expect(cits.some(c => /동법|같은법/.test(c.lawName))).toBe(false)
  })

  test('조의N 가지번호 보존', () => {
    const cits = parseCitationsFromAnswer('근로기준법 제74조의2에 따라')
    expect(cits.some(c => c.lawName === '근로기준법' && c.articleNumber === '제74조의2')).toBe(true)
  })

  test('기존 낫표 패턴은 그대로 동작 (회귀 방지)', () => {
    const cits = parseCitationsFromAnswer('「관세법」 제38조에 따라 신고함')
    expect(cits.some(c => c.lawName === '관세법' && c.articleNumber === '제38조')).toBe(true)
  })
})

describe('calcAnswerConfidence — 텍스트 경로 공용 신뢰도 (H1)', () => {
  const mkCits = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      lawName: `법령${i}`, articleNumber: `제${i + 1}조`, chunkText: '', source: 'claude-cli',
    }))
  const longAnswer = (grounds: boolean) =>
    `## 결론\n${'가'.repeat(500)}\n${grounds ? '## 근거 법령\n- 「법령0」 제1조' : ''}`

  test('인용 2개 + 근거섹션 + 사전조회 1 → high (relay 캘리브레이션 보존)', () => {
    expect(calcAnswerConfidence(longAnswer(true), mkCits(2), 1)).toBe('high')
  })

  test('인용 1개 + 근거섹션 + evidence 1 → high (기존 relay 기준 보존)', () => {
    expect(calcAnswerConfidence(longAnswer(true), mkCits(1), 1)).toBe('high')
  })

  test('인용 0 + 근거섹션만 → medium 이하', () => {
    expect(calcAnswerConfidence(longAnswer(true), [], 2)).not.toBe('high')
  })

  test('인용 0 + evidence 0 (학습데이터 답변 의심) → low', () => {
    expect(calcAnswerConfidence(longAnswer(false), [], 0)).toBe('low')
  })

  test('200자 미만 답변은 hard floor로 medium 이상 불가', () => {
    const short = '## 결론\n가능함\n## 근거 법령\n- 「관세법」 제38조'
    expect(short.length).toBeLessThan(200)
    expect(calcAnswerConfidence(short, mkCits(3), 3)).not.toBe('high')
  })

  test('인용 다수 + 도구 다수 + 장문 → high', () => {
    expect(calcAnswerConfidence(longAnswer(true), mkCits(5), 4)).toBe('high')
  })
})
