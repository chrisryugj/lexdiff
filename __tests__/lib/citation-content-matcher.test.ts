/**
 * C4: citation-content-matcher 다층 매칭 테스트
 * LLM 인용 텍스트와 실제 조문 본문의 일치/불일치를 구분할 수 있는지.
 */
import { describe, test, expect } from 'vitest'
import { matchCitationContent, normalizeLegalText } from '@/lib/citation-content-matcher'

describe('normalizeLegalText', () => {
  test('원문자 ①②③ → (1)(2)(3)', () => {
    expect(normalizeLegalText('①관세 ②면제')).toBe('(1)관세 (2)면제')
  })
  test('「」『』 제거', () => {
    expect(normalizeLegalText('「관세법」 제38조')).toBe('관세법 제38조')
  })
  test('중점/구분자 → 공백', () => {
    expect(normalizeLegalText('수입·수출·통관')).toBe('수입 수출 통관')
  })
  test('NBSP / zero-width 제거', () => {
    expect(normalizeLegalText('관세\u00A0법\u200B제38조')).toBe('관세 법제38조')
  })
})

describe('matchCitationContent L1 exact', () => {
  test('30자 이상 연속 일치 → exact match', () => {
    const claim = '관세법 제38조에 따라 신고납부를 하려는 자는 수입신고시 관세를 납부하여야 한다'
    const actual = `[전문] 관세법 제38조에 따라 신고납부를 하려는 자는 수입신고시 관세를 납부하여야 한다. 기타 세부사항은...`
    const result = matchCitationContent(claim, actual)
    expect(result.matched).toBe(true)
    expect(result.method).toBe('exact')
  })

  test('짧은 claim (30자 미만)이 actual에 포함 → exact match', () => {
    const claim = '신고납부'
    const actual = '관세법상 신고납부 제도를 채택한다'
    expect(matchCitationContent(claim, actual).matched).toBe(true)
  })
})

describe('matchCitationContent L2 jaccard (paraphrase)', () => {
  test('어순/조사 변경, 핵심 단어 보존 → token jaccard 통과', () => {
    // 실제 RAG citation은 수십~수백자. 공통 어휘가 충분히 많음.
    const claim = '수입신고를 한 자는 신고수리 전에 관세를 납부하여야 하며, 신고납부 제도를 채택한 관세법 제38조의 핵심은 납세의무자가 직접 세액을 계산하여 신고하는 데 있다'
    const actual = '관세법 제38조의 신고납부 제도는 납세의무자가 수입신고와 함께 세액을 직접 계산하여 신고하고 관세를 납부하도록 규정한다. 납부는 신고수리 전에 이뤄져야 한다'
    const result = matchCitationContent(claim, actual)
    expect(result.matched).toBe(true)
    expect(['exact', 'token-jaccard']).toContain(result.method)
  })
})

describe('matchCitationContent mismatch (환각)', () => {
  test('완전 다른 주제 → mismatch', () => {
    const claim = '상속세 납부기한은 상속개시일로부터 6개월 이내이다'
    const actual = '관세법 제38조는 신고납부 수입신고시 관세 납부 의무를 정한다'
    const result = matchCitationContent(claim, actual)
    expect(result.matched).toBe(false)
    expect(result.method).toBe('mismatch')
  })

  test('조문 번호만 일치 (제5조라며 전혀 다른 내용 인용) → mismatch', () => {
    // LLM이 제5조(목적)인 것처럼 인용했지만 실제 제5조는 벌칙 조항이라고 가정
    const claim = '제5조는 본 법의 목적이 국민경제 발전에 기여함을 규정한다'
    const actual = '제5조 다음 각 호의 어느 하나에 해당하는 자는 3년 이하의 징역 또는 3천만원 이하의 벌금에 처한다'
    const result = matchCitationContent(claim, actual)
    expect(result.matched).toBe(false)
  })

  test('빈 actual → mismatch', () => {
    const result = matchCitationContent('뭔가', '')
    expect(result.matched).toBe(false)
  })

  test('빈 claim → mismatch', () => {
    const result = matchCitationContent('', '본문')
    expect(result.matched).toBe(false)
  })
})
