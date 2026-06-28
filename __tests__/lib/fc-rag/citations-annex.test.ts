/**
 * parseCitationsFromAnswer — 별표/법령 인용 인식 회귀 테스트.
 *
 * 배경: 릴레이(Themis) 경로는 tool 결과 본문이 없어 답변 텍스트의 인용만으로
 * citation/신뢰도를 산정한다. 별표가 근거인 답변(수수료·과태료·서식 등)이
 * 「법령명」 제N조 패턴에 안 걸려 citation 0개 → 거짓 "일반 지식 기반" 배너로
 * 떨어지던 문제(여권발급 수수료 질의)를 막는다.
 */
import { describe, expect, it } from 'vitest'
import { parseCitationsFromAnswer } from '@/lib/fc-rag/citations'

describe('parseCitationsFromAnswer — 별표/법령 인용', () => {
  it('별표가 근거인 답변(여권 수수료)을 citation 으로 인식한다', () => {
    const answer = `## 결론

여권 발급 수수료는 17,000~40,000원 범위임.

## 근거 법령

「여권법 시행령」 [별표] 수수료 및 사무의 대행에 드는 비용 (제39조 관련, 시행 2026-03-01)`

    const citations = parseCitationsFromAnswer(answer)
    expect(citations.length).toBeGreaterThanOrEqual(1)
    expect(citations[0].lawName).toBe('여권법 시행령')
    // 별표 근거는 조문 번호가 아니라 별표 라벨로 인용된다.
    expect(citations.some((c) => /별표/.test(c.articleNumber))).toBe(true)
  })

  it('번호 있는 별표("[별표 2]")는 번호를 라벨에 보존한다', () => {
    const citations = parseCitationsFromAnswer('「자동차관리법 시행규칙」 [별표 2] 정기검사 기준')
    expect(citations.some((c) => c.lawName === '자동차관리법 시행규칙' && c.articleNumber === '별표 2')).toBe(true)
  })

  it('기존 「법령명」 제N조 인용은 그대로 동작한다', () => {
    const citations = parseCitationsFromAnswer('「민법」 제839조의2 에 따른 재산분할')
    expect(citations.some((c) => c.lawName === '민법' && c.articleNumber === '제839조의2')).toBe(true)
  })

  it('근거 법령 섹션의 조문/별표 없는 법령 단독 인용도 인정한다', () => {
    const answer = `## 근거 법령

「국적법」 — 대한민국 국적 취득의 일반 요건`
    const citations = parseCitationsFromAnswer(answer)
    expect(citations.some((c) => c.lawName === '국적법')).toBe(true)
  })

  it('같은 법령을 조문·별표·단독으로 중복 인용하지 않는다(별표는 별개 라벨)', () => {
    const answer = `「여권법 시행령」 제39조 — 수수료의 근거

## 근거 법령

「여권법 시행령」 [별표] 수수료`
    const citations = parseCitationsFromAnswer(answer)
    const byKey = citations.map((c) => `${c.lawName}:${c.articleNumber}`)
    // 제39조(조문)와 별표는 서로 다른 근거이므로 둘 다 인정하되, 단독 '법령' 중복은 없어야 한다.
    expect(byKey).toContain('여권법 시행령:제39조')
    expect(byKey.filter((k) => k === '여권법 시행령:법령').length).toBe(0)
  })

  it('근거 섹션 밖의 일반어/비법령 낫표는 인용으로 오탐하지 않는다', () => {
    const citations = parseCitationsFromAnswer('이 사건의 「쟁점」은 명확하다. 「홍길동」 진술 참고.')
    expect(citations.length).toBe(0)
  })
})
