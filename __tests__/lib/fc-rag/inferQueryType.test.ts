import { describe, test, expect } from 'vitest'
import { inferQueryType } from '@/lib/fc-rag/engine'

describe('inferQueryType', () => {
  describe('exemption (면제/감면) - 최우선', () => {
    test('면제 → exemption', () => {
      expect(inferQueryType('관세 면제 대상은?')).toBe('exemption')
    })
    test('감면 → exemption', () => {
      expect(inferQueryType('취득세 감면 요건')).toBe('exemption')
    })
    test('비과세 → exemption', () => {
      expect(inferQueryType('비과세 대상 알려줘')).toBe('exemption')
    })
  })

  describe('consequence (위반/처벌) - 2순위', () => {
    test('벌칙 → consequence', () => {
      expect(inferQueryType('관세법 벌칙 알려줘')).toBe('consequence')
    })
    test('위반 → consequence', () => {
      expect(inferQueryType('위반하면 어떻게 되나요')).toBe('consequence')
    })
    test('과태료 → consequence', () => {
      expect(inferQueryType('과태료는 얼마야')).toBe('consequence')
    })
  })

  describe('procedure (절차/방법)', () => {
    test('경정청구 방법 → procedure', () => {
      expect(inferQueryType('경정청구 방법')).toBe('procedure')
    })
    test('신청 절차 → procedure', () => {
      expect(inferQueryType('수입 신고 절차 알려줘')).toBe('procedure')
    })
    test('어떻게 → procedure', () => {
      expect(inferQueryType('수출 통관 어떻게 하나요')).toBe('procedure')
    })
  })

  describe('comparison (비교)', () => {
    test('차이 → comparison', () => {
      expect(inferQueryType('관세와 부가세 차이')).toBe('comparison')
    })
    test('비교 → comparison', () => {
      expect(inferQueryType('FTA 원산지 규정 비교')).toBe('comparison')
    })
  })

  describe('requirement (요건/자격)', () => {
    test('요건 → requirement', () => {
      expect(inferQueryType('관세사 자격 요건')).toBe('requirement')
    })
    test('하려면 → requirement', () => {
      expect(inferQueryType('AEO 인증 하려면')).toBe('requirement')
    })
  })

  describe('scope (범위/금액)', () => {
    test('세율 → scope', () => {
      expect(inferQueryType('쌀 수입 세율은')).toBe('scope')
    })
    test('얼마 → scope', () => {
      expect(inferQueryType('과징금 얼마야')).toBe('scope')
    })
  })

  describe('definition (정의/개념)', () => {
    test('이란 → definition', () => {
      expect(inferQueryType('보세구역이란')).toBe('definition')
    })
    test('뜻 → definition', () => {
      expect(inferQueryType('보세구역의 뜻')).toBe('definition')
    })
    test('환급의 뜻은 procedure에 먼저 매칭 (환급 키워드)', () => {
      // "환급"이 procedure 패턴에 먼저 매칭되는 것은 의도된 동작
      expect(inferQueryType('관세 환급의 뜻')).toBe('procedure')
    })
  })

  describe('application (적용/판단)', () => {
    test('적용 여부 → application', () => {
      expect(inferQueryType('이 경우 관세법 적용 가능한가')).toBe('application')
    })
  })

  describe('범용 표현 fallback', () => {
    test('"알려줘"만 → definition', () => {
      expect(inferQueryType('관세법 알려줘')).toBe('definition')
    })
    test('"설명해줘" → definition', () => {
      expect(inferQueryType('관세법 설명해줘')).toBe('definition')
    })
    test('패턴 없음 → application (기본값)', () => {
      expect(inferQueryType('관세법 제38조')).toBe('application')
    })
  })
})
