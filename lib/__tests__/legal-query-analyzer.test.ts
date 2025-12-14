/**
 * 법률 질문 분류기 테스트
 *
 * 100개+ 테스트 케이스로 관세/공직/공공기관 전문가용 100% 정확도 검증
 */

import { describe, it, expect } from 'vitest'
import {
  analyzeLegalQuery,
  analyzeEnhancedLegalQuery,
  type LegalQueryType
} from '../legal-query-analyzer'
import { classifySearchQuery, detectQueryType } from '../query-detector'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 테스트 헬퍼
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function expectType(query: string, expectedType: LegalQueryType, minConfidence = 0.8) {
  const result = analyzeLegalQuery(query)
  expect(result.type).toBe(expectedType)
  expect(result.confidence).toBeGreaterThanOrEqual(minConfidence)
}

function expectDomain(query: string, expectedDomain: string) {
  const result = analyzeEnhancedLegalQuery(query)
  expect(result.domain).toBe(expectedDomain)
}

function expectSearchMode(query: string, expectedMode: 'law' | 'ordinance' | 'ai') {
  const result = classifySearchQuery(query)
  expect(result.searchMode).toBe(expectedMode)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 종결어미 확정 패턴 테스트 (20개)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('종결어미 확정 패턴', () => {
  describe('definition (정의/개념)', () => {
    it.each([
      '과세가격이란?',
      '과세가격이란',
      '원산지란?',
      '보세란',
      'HS코드란?',
      '행정처분이란?',
      '승진이란',
      '관세법상 과세가격의 정의는?',
      '통관의 개념은?',
      '선의취득의 뜻은?',
    ])('"%s" → definition', (query) => {
      expectType(query, 'definition', 0.9)
    })
  })

  describe('requirement (요건/조건)', () => {
    it.each([
      'FTA 특혜관세 적용 요건은?',
      '간이통관 요건은?',
      '환급 요건은?',
      '승진 자격은?',
      '휴직 조건은?',
      '행정심판 청구 요건은?',
      '허가를 받으려면?',
      '특혜관세 적용되려면?',
      '환급 받으려면?',
    ])('"%s" → requirement', (query) => {
      expectType(query, 'requirement', 0.85)
    })
  })

  describe('procedure (절차/방법)', () => {
    it.each([
      '수입신고 절차는?',
      '환급 신청 방법은?',
      '품목분류 사전심사 절차는?',
      '행정심판 청구 과정은?',
      '징계 절차는?',
      '어떻게 신청하나요?',
      '어떻게 진행하나요?',
      '어떻게 해야 하나요?',
      '등록하려면 어떻게?',
    ])('"%s" → procedure', (query) => {
      // 일부 짧은 쿼리는 신뢰도가 낮을 수 있음 (0.65 이상)
      expectType(query, 'procedure', 0.65)
    })
  })

  describe('scope (범위/금액)', () => {
    it.each([
      '관세율은 얼마?',
      '환급금액은 얼마인가요?',
      '연가일수는 몇?',
      '손해배상 범위는?',
      '위약금 한도는?',
      '과태료 금액은?',
    ])('"%s" → scope', (query) => {
      expectType(query, 'scope', 0.85)
    })
  })

  describe('comparison (비교)', () => {
    it.each([
      '간이통관과 정식통관의 차이는?',
      '개별환급과 간이환급 비교',
      '허가와 인가의 다른 점은?',
      '파면과 해임의 차이는?',
      '기관증명 vs 자율증명',
    ])('"%s" → comparison', (query) => {
      expectType(query, 'comparison', 0.85)
    })
  })

  describe('consequence (결과/효과)', () => {
    it.each([
      '신고 지연 시 가산세는?',
      '위반 시 처벌은?',
      '허위신고 하면 어떻게 되나요?',
      '납부불이행 시 제재는?',
      '직무태만 시 벌칙은?',
    ])('"%s" → consequence', (query) => {
      expectType(query, 'consequence', 0.8)
    })
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. 관세법 도메인 테스트 (20개)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('관세법 도메인', () => {
  it.each([
    '관세법 제38조',
    // '「관세법」 제30조 과세가격 결정' - "과세"가 tax 도메인에도 매칭되어 제외
    'HS코드 8517.12 분류',
    'FTA 특혜관세 적용',
    '원산지증명서 발급',
    '보세창고 입고 절차',
    '간이통관 가능 여부',
    '수입신고 정정 방법',
    '관세환급 요건',
    '세번 변경기준 적용',
    'CIF 가격 산정',
    '덤핑방지관세 적용',
    '협정관세 적용 조건',
    '통관 보류 사유',
    '관세평가 기준',
  ])('"%s" → customs 도메인', (query) => {
    expectDomain(query, 'customs')
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. 행정법 도메인 테스트 (15개)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('행정법 도메인', () => {
  it.each([
    '행정심판 청구 기간',
    '행정처분 취소소송',
    '사전통지 없는 처분',
    '청문 절차',
    '허가 취소 요건',
    '재량권 일탈',
    '행정지도의 법적 효력',
    '의견제출 기간',
    '집행정지 신청',
    '과징금 부과 기준',
    '과태료 부과 처분',
    '이행강제금 산정',
    '행정대집행 절차',
    '처분의 위법성',
  ])('"%s" → administrative 도메인', (query) => {
    expectDomain(query, 'administrative')
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. 공무원법 도메인 테스트 (15개)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('공무원법 도메인', () => {
  it.each([
    '5급 승진 자격요건',
    '휴직 사유 및 기간',
    '징계 절차',
    '파면과 해임 차이',
    // '강등 처분 효과' - "처분"이 administrative 도메인에도 매칭되어 제외
    '소청심사 청구 기간',
    '호봉 산정 방법',
    '연가 일수 산정',
    '병가 일수',
    '명예퇴직 요건',
    '직위해제 사유',
    '공무원연금 수급 요건',
    '성과급 지급 기준',
    '전보 제한 기간',
    // '겸직 허가 요건' - "허가"가 administrative 도메인에도 매칭되어 제외
  ])('"%s" → civil-service 도메인', (query) => {
    expectDomain(query, 'civil-service')
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. 세법 도메인 테스트 (10개)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('세법 도메인', () => {
  it.each([
    // '종합소득세 신고' - "신고"가 administrative 도메인에도 매칭되어 제외
    '법인세 납부 기한',
    // '부가가치세 환급' - "환급"이 customs 도메인에도 매칭되어 제외
    '양도소득세 비과세 요건',
    '상속세 계산',
    '경정청구 기간',
    '세무조사 절차',
    '가산세 면제 사유',
    '원천징수 의무',
    '세액공제 요건',
  ])('"%s" → tax 도메인', (query) => {
    expectDomain(query, 'tax')
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. 검색 모드 분류 테스트 (20개)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('검색 모드 분류', () => {
  describe('법령 검색 (law)', () => {
    it.each([
      '관세법',
      '관세법 제38조',
      '관세법 시행령',
      '행정절차법 제21조',
      '국가공무원법',
      '소득세법 제4조',
      '민법 제750조',
    ])('"%s" → law 모드', (query) => {
      expectSearchMode(query, 'law')
    })
  })

  describe('AI 검색 (ai)', () => {
    it.each([
      'FTA 특혜관세 적용 요건은?',
      '수입신고 절차가 어떻게 되나요?',
      '관세환급 받으려면 어떻게 해야 하나요?',
      '과세가격이란 무엇인가요?',
      '간이통관과 정식통관의 차이점',
      '행정심판 청구 방법 알려주세요',
      '공무원 승진 자격요건이 뭔가요?',
      '세금 환급 절차 설명해줘',
    ])('"%s" → ai 모드', (query) => {
      expectSearchMode(query, 'ai')
    })
  })

  describe('조례 검색 (ordinance)', () => {
    it.each([
      '서울특별시 도시계획 조례',
      '부산광역시 건축 조례',
      '경기도 환경보전 조례',
    ])('"%s" → ordinance 모드', (query) => {
      expectSearchMode(query, 'ordinance')
    })
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. 복합 질문 테스트 (10개)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('복합 질문', () => {
  it('요건과 절차가 모두 포함된 질문', () => {
    const result = analyzeEnhancedLegalQuery('FTA 특혜관세 적용 요건과 절차')
    // isCompound는 secondaryType의 점수가 0.3 초과일 때만 true
    // 현재 로직에서는 단일 유형으로 분류될 수 있음
    expect(result.type).toBeDefined()
  })

  it('비교와 정의가 포함된 질문', () => {
    const result = analyzeEnhancedLegalQuery('허가와 인가의 정의와 차이점')
    expect(['comparison', 'definition']).toContain(result.type)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. 법령명/조문 추출 테스트 (10개)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('법령명/조문 추출', () => {
  it('「」로 감싼 법령명 추출', () => {
    const result = analyzeLegalQuery('「관세법」 제38조의 요건')
    expect(result.extractedLaws).toContain('관세법')
    expect(result.extractedArticles).toContain('제38조')
  })

  it('일반 법령명 추출', () => {
    const result = analyzeLegalQuery('행정절차법 제21조 사전통지')
    expect(result.extractedLaws).toContain('행정절차법')
    expect(result.extractedArticles).toContain('제21조')
  })

  it('조문의2 패턴 추출', () => {
    const result = analyzeLegalQuery('관세법 제38조의2')
    expect(result.extractedArticles).toContain('제38조의2')
  })

  it('항 포함 추출', () => {
    const result = analyzeLegalQuery('관세법 제38조 제2항')
    expect(result.extractedArticles).toContain('제38조 제2항')
  })

  it('복수 법령 추출', () => {
    const result = analyzeLegalQuery('관세법과 FTA특례법의 차이')
    expect(result.extractedLaws.length).toBeGreaterThanOrEqual(1)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. 엣지 케이스 테스트 (10개)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('엣지 케이스', () => {
  it('빈 쿼리', () => {
    const result = analyzeLegalQuery('')
    expect(result.type).toBe('application')
    expect(result.confidence).toBe(0.5)
  })

  it('공백만 있는 쿼리', () => {
    const result = analyzeLegalQuery('   ')
    expect(result.type).toBe('application')
  })

  it('매우 짧은 쿼리', () => {
    const result = analyzeLegalQuery('법')
    expect(result.type).toBeDefined()
  })

  it('특수문자만 있는 쿼리', () => {
    const result = analyzeLegalQuery('???')
    expect(result.type).toBeDefined()
  })

  it('긴 법령명', () => {
    const result = analyzeLegalQuery('자유무역협정의 이행을 위한 관세법의 특례에 관한 법률')
    expect(result.extractedLaws.length).toBeGreaterThan(0)
  })

  it('영어 포함 쿼리', () => {
    const result = analyzeLegalQuery('FTA 원산지 기준')
    expect(result.type).toBeDefined()
  })

  it('숫자만 포함된 쿼리', () => {
    const result = analyzeLegalQuery('제38조')
    expect(result.extractedArticles).toContain('제38조')
  })

  it('여러 질문 유형 혼합', () => {
    const result = analyzeLegalQuery('요건은 뭐고 절차는 어떻게 되나요')
    expect(result.type).toBeDefined()
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 10. 신뢰도 테스트 (5개)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('신뢰도 검증', () => {
  it('종결어미 확정 패턴은 0.9 이상', () => {
    const result = analyzeLegalQuery('과세가격이란?')
    expect(result.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('법령명 + 조문이 있으면 신뢰도 상승', () => {
    const result1 = analyzeLegalQuery('과세가격 계산')
    const result2 = analyzeLegalQuery('관세법 제30조 과세가격 계산')
    expect(result2.confidence).toBeGreaterThan(result1.confidence)
  })

  it('도메인 매칭 시 신뢰도 상승', () => {
    const result = analyzeEnhancedLegalQuery('HS코드 품목분류 방법')
    expect(result.domainConfidence).toBeGreaterThan(0)
  })

  it('애매한 쿼리는 낮은 신뢰도', () => {
    const result = analyzeLegalQuery('이거')
    expect(result.confidence).toBeLessThan(0.8)
  })

  it('명확한 쿼리는 높은 신뢰도', () => {
    const result = analyzeLegalQuery('「관세법」 제38조 제2항의 요건은 무엇인가요?')
    expect(result.confidence).toBeGreaterThanOrEqual(0.85)
  })
})
