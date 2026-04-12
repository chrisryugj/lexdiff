/**
 * H-RAG3: extractRelatedLaws false positive 가드 회귀
 */
import { describe, test, expect } from 'vitest'
import { extractRelatedLaws } from '@/lib/law-parser'

describe('extractRelatedLaws H-RAG3 false positive 가드', () => {
  test('"제정법" 같은 일반 명사는 법령으로 매칭 안 됨', () => {
    const md = '이는 제정법 제5조 수준의 효력이 있다.'
    const laws = extractRelatedLaws(md)
    expect(laws.find(l => l.lawName === '제정법')).toBeUndefined()
  })

  test('"방법" / "요령" / "수법"', () => {
    const md = '적용 방법 제3조, 시행 요령 제1조, 공격 수법 제2조'
    const laws = extractRelatedLaws(md)
    expect(laws.find(l => l.lawName === '방법')).toBeUndefined()
    expect(laws.find(l => l.lawName === '요령')).toBeUndefined()
    expect(laws.find(l => l.lawName === '수법')).toBeUndefined()
  })

  test('"동법/본법/구법" 같은 대명사 배제', () => {
    const md = '동법 제5조 및 본법 제7조, 구법 제10조 참조'
    const laws = extractRelatedLaws(md)
    expect(laws.find(l => l.lawName === '동법')).toBeUndefined()
    expect(laws.find(l => l.lawName === '본법')).toBeUndefined()
    expect(laws.find(l => l.lawName === '구법')).toBeUndefined()
  })

  test('정상 법령명은 여전히 매칭 (관세법 제38조)', () => {
    const md = '관세법 제38조에 따라 신고납부를 한다.'
    const laws = extractRelatedLaws(md)
    const match = laws.find(l => l.lawName === '관세법' && l.article === '제38조')
    expect(match).toBeDefined()
  })

  test('조사가 붙은 직전 문자열 차단 (엄마는 실정법 제5조)', () => {
    // "실정법"은 블랙리스트, 추가로 앞 단어 "엄마는" 뒤에서 매칭 안 됨
    const md = '엄마는 실정법 제5조를 언급했다.'
    const laws = extractRelatedLaws(md)
    expect(laws.find(l => l.lawName === '실정법')).toBeUndefined()
  })

  test('시행령 단독은 제외', () => {
    const md = '시행령 제1조'
    const laws = extractRelatedLaws(md)
    expect(laws.find(l => l.lawName === '시행령')).toBeUndefined()
  })

  test('최소 3자 룰: "법 제1조" (단독 "법") 거부', () => {
    const md = '이 법 제1조는 중요하다.'
    const laws = extractRelatedLaws(md)
    expect(laws.find(l => l.lawName === '법' || l.lawName === '이 법')).toBeUndefined()
  })
})
