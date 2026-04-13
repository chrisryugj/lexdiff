/**
 * M6: inferComplexity 경계값 테스트
 */
import { describe, test, expect } from 'vitest'
import { inferComplexity } from '@/lib/fc-rag/engine-shared'

describe('inferComplexity (M6)', () => {
  test('단순 질의 → simple', () => {
    expect(inferComplexity('관세란?')).toBe('simple')
  })

  test('조문 번호 포함 → moderate', () => {
    expect(inferComplexity('제38조 알려줘')).toBe('moderate')
  })

  test('100자 초과 → complex', () => {
    const long = '납세자가 알아야 할 기본적인 사항들을 이해하기 쉽게 풀어서 설명해 주시고 더불어 관련 실무상 유의할 점도 같이 정리하여 주시면 대단히 감사하겠습니다 부탁드립니다 답변을 기다리고 있습니다'
    expect(long.length).toBeGreaterThan(100)
    expect(inferComplexity(long)).toBe('complex')
  })

  test('50~100자 → moderate', () => {
    const mid = '납세자가 알아야 할 기본적인 사항들을 이해하기 쉽게 풀어서 설명해 주시면 감사드립니다 부탁드려요'
    expect(mid.length).toBeGreaterThan(50)
    expect(mid.length).toBeLessThanOrEqual(100)
    expect(inferComplexity(mid)).toBe('moderate')
  })

  test('중괄호 법령 2건 이상 → complex', () => {
    expect(inferComplexity('「관세법」과 「민법」 비교')).toBe('complex')
  })

  test('source type 2개 이상 → complex', () => {
    expect(inferComplexity('판례와 해석례 비교')).toBe('complex')
  })

  test('조문 번호 3건 이상 → complex', () => {
    expect(inferComplexity('제38조 제39조 제40조 내용')).toBe('complex')
  })

  test('과태료 키워드 → moderate (moderate pattern)', () => {
    expect(inferComplexity('과태료가 부과되나요')).toBe('moderate')
  })

  test('판례 키워드 → complex (complex pattern)', () => {
    expect(inferComplexity('관련 판례')).toBe('complex')
  })

  test('시행령 키워드 → moderate', () => {
    expect(inferComplexity('시행령 확인')).toBe('moderate')
  })
})
