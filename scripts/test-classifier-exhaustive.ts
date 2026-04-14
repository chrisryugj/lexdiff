/**
 * 검색어 분류기 + 자동완성 빡센 테스트
 *
 * 실제 프론트엔드 검색바에 입력하는 것처럼 테스트
 * 법령/조례/위임법령/행정규칙/판례/재결례/해석례/AI질문 전체 커버
 *
 * Usage: npx tsx scripts/test-classifier-exhaustive.ts
 */

import { classifySearchQuery } from '../src/domain/search/services/QueryClassifier'
import { isOrdinanceQuery, containsLocalGovName, extractLocalGovName } from '../src/domain/patterns/OrdinancePattern'
import { expandQuery } from '../lib/query-expansion'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type SearchType = 'law' | 'ordinance' | 'ai' | 'precedent' | 'interpretation' | 'ruling' | 'multi' | 'admrul'

interface TestCase {
  query: string
  expectedType: SearchType | SearchType[]  // 허용되는 타입(들)
  minConfidence?: number
  description?: string
  // 추가 검증
  expectOrdinance?: boolean       // isOrdinanceQuery 결과
  expectLocalGov?: string | null  // extractLocalGovName 결과
}

interface TestResult {
  query: string
  description: string
  passed: boolean
  expected: string
  actual: string
  confidence: number
  reason: string
  errors: string[]
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Cases — 법체계 전체 커버
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TEST_CASES: TestCase[] = [
  // ─────────────────────────────────────────────────────
  // A. 법률 (法律) — 국회 제정
  // ─────────────────────────────────────────────────────
  { query: '민법', expectedType: 'law', description: '기본 법률명' },
  { query: '형법', expectedType: 'law', description: '기본 법률명' },
  { query: '관세법', expectedType: 'law', description: '기본 법률명' },
  { query: '국가공무원법', expectedType: 'law', description: '기본 법률명' },
  { query: '지방공무원법', expectedType: 'law', description: '기본 법률명' },
  { query: '소득세법', expectedType: 'law', description: '세법' },
  { query: '부가가치세법', expectedType: 'law', description: '세법' },
  { query: '주택임대차보호법', expectedType: 'law', description: '긴 법률명' },
  { query: '자유무역협정의 이행을 위한 관세법의 특례에 관한 법률', expectedType: 'law', description: '매우 긴 법률명', minConfidence: 0.9 },
  { query: '도로교통법', expectedType: 'law', description: '기본 법률명' },
  { query: '건축법', expectedType: 'law', description: '기본 법률명' },
  { query: '근로기준법', expectedType: 'law', description: '노동법' },
  { query: '산업안전보건법', expectedType: 'law', description: '산업법' },
  { query: '개인정보 보호법', expectedType: 'law', description: '띄어쓰기 있는 법률명' },
  { query: '전자상거래 등에서의 소비자보호에 관한 법률', expectedType: 'law', description: '매우 긴 법률명' },

  // ─────────────────────────────────────────────────────
  // B. 법률 + 조문번호
  // ─────────────────────────────────────────────────────
  { query: '민법 제38조', expectedType: 'law', minConfidence: 0.9, description: '법령+조문' },
  { query: '관세법 38조', expectedType: 'law', description: '제 생략 조문' },
  { query: '관세법 제38조의2', expectedType: 'law', description: '법령+조의X' },
  { query: '관세법 제38조 제1항', expectedType: 'law', description: '법령+조+항' },
  { query: '소득세법 제12조', expectedType: 'law', description: '세법+조문' },
  { query: '국가공무원법 제78조', expectedType: 'law', description: '공무원법+조문' },
  { query: '건축법 시행령 제5조', expectedType: 'law', description: '시행령+조문' },
  { query: '근로기준법 제50조', expectedType: 'law', description: '노동법+조문' },

  // ─────────────────────────────────────────────────────
  // C. 시행령/시행규칙 (대통령령/총리령/부령) — 위임법령
  // ─────────────────────────────────────────────────────
  { query: '관세법 시행령', expectedType: 'law', description: '시행령' },
  { query: '관세법시행령', expectedType: 'law', description: '시행령 (붙여쓰기)' },
  { query: '민법 시행규칙', expectedType: 'law', description: '시행규칙' },
  { query: '소득세법 시행령', expectedType: 'law', description: '세법 시행령' },
  { query: '소득세법 시행규칙', expectedType: 'law', description: '세법 시행규칙' },
  { query: '건축법 시행령', expectedType: 'law', description: '건축 시행령' },
  { query: '국가공무원법 시행령', expectedType: 'law', description: '공무원 시행령' },
  { query: '도로교통법 시행규칙', expectedType: 'law', description: '도로교통 시행규칙' },

  // ─────────────────────────────────────────────────────
  // D. 조례 (條例) — 지자체
  // ─────────────────────────────────────────────────────
  { query: '서울특별시 주차장 조례', expectedType: 'ordinance', description: '광역시 조례', expectOrdinance: true },
  { query: '강남구 주차 조례', expectedType: 'ordinance', description: '서울 구 조례', expectOrdinance: true },
  { query: '광진구 복무 조례', expectedType: 'ordinance', description: '서울 구 조례', expectOrdinance: true, expectLocalGov: '광진구' },
  { query: '부산 건축 조례', expectedType: 'ordinance', description: '광역시 조례', expectOrdinance: true },
  { query: '경기도 주차장 조례', expectedType: 'ordinance', description: '도 조례', expectOrdinance: true },
  { query: '수원시 주차장 조례', expectedType: 'ordinance', description: '시 조례', expectOrdinance: true },
  { query: '인천 조례', expectedType: 'ordinance', description: '광역시+조례', expectOrdinance: true },
  { query: '제주 자치법규', expectedType: 'ordinance', description: '자치법규 키워드', expectOrdinance: true },

  // D-2. 지자체명만 (조례 키워드 없음) — 조례 의도 감지
  { query: '광진구 복무', expectedType: 'ordinance', description: '지자체명+키워드 (조례 키워드 없음)', expectLocalGov: '광진구' },
  { query: '강남구 주차', expectedType: 'ordinance', description: '지자체명+키워드', expectLocalGov: '강남구' },
  { query: '수원시 건축', expectedType: 'ordinance', description: '시+키워드', expectLocalGov: '수원시' },
  { query: '해운대구 관광', expectedType: 'ordinance', description: '광역시 구+키워드', expectLocalGov: '해운대구' },

  // D-3. 지자체명이지만 법령 의도 — law로 분류되어야
  { query: '강남구 법원', expectedType: 'law', description: '구+법원 → 법령', expectOrdinance: false },
  { query: '서울 시행령', expectedType: 'law', description: '서울+시행령 → 법령' },
  { query: '부산 시행규칙', expectedType: 'law', description: '부산+시행규칙 → 법령' },

  // ─────────────────────────────────────────────────────
  // E. 행정규칙 — 예규/고시/훈령/지침 → interpretation 분류
  // ─────────────────────────────────────────────────────
  // 예규/고시/훈령/지침은 법제처 API 상 행정규칙(admrul) target이며, 해석례(expc)와 구분됨
  // "법령해석례/법령해석" 키워드가 있어야만 interpretation으로 분류
  { query: '관세법 예규', expectedType: 'admrul', description: '예규 → 행정규칙', minConfidence: 0.9 },
  { query: '관세 고시', expectedType: 'admrul', description: '고시 → 행정규칙' },
  { query: '관세 훈령', expectedType: 'admrul', description: '훈령 → 행정규칙' },
  { query: '관세 지침', expectedType: 'admrul', description: '지침 → 행정규칙' },
  { query: '행정해석', expectedType: 'interpretation', description: '행정해석 키워드' },
  { query: '법제처 해석', expectedType: 'interpretation', description: '법제처 해석' },
  { query: '유권해석', expectedType: 'interpretation', description: '유권해석' },
  { query: '해석례', expectedType: 'interpretation', description: '해석례' },
  { query: '법령 해석례', expectedType: 'interpretation', description: '법령 해석례' },

  // ─────────────────────────────────────────────────────
  // F. 판례 (判例) — 법원 판결
  // ─────────────────────────────────────────────────────
  { query: '대법원 2023도1234', expectedType: 'precedent', minConfidence: 0.95, description: '대법원 형사상고' },
  { query: '대법원 2024다56789', expectedType: 'precedent', description: '대법원 민사상고' },
  { query: '서울고등법원 2023나1234', expectedType: 'precedent', description: '고법 민사항소' },
  { query: '서울고법 2023나1234', expectedType: 'precedent', description: '고법 약칭' },
  { query: '수원지법 2024가합12345', expectedType: 'precedent', description: '지법 민사합의' },
  { query: '2024도1234', expectedType: 'precedent', description: '사건번호만 (법원명 없음)' },
  { query: '2023다12345', expectedType: 'precedent', description: '민사상고 번호만' },
  { query: '대법원 2024', expectedType: 'precedent', description: '대법원+연도' },
  { query: '대법원 판결', expectedType: 'precedent', description: '대법원+판결' },

  // F-2. 판례 (공백 포함)
  { query: '대법원 2023 도 1234', expectedType: 'precedent', description: '판례 번호 공백 포함' },

  // ─────────────────────────────────────────────────────
  // G. 재결례 — 조세심판원/국세심판원
  // ─────────────────────────────────────────────────────
  { query: '조심2023서0001', expectedType: 'ruling', minConfidence: 0.9, description: '조세심판 재결' },
  { query: '국심2023서0001', expectedType: 'ruling', description: '국세심판 재결' },
  { query: '조세심판', expectedType: 'ruling', description: '조세심판 키워드' },
  { query: '심판청구 2024', expectedType: 'ruling', description: '심판청구+연도' },

  // ─────────────────────────────────────────────────────
  // H. AI 자연어 질문
  // ─────────────────────────────────────────────────────
  { query: '관세 환급 요건은?', expectedType: 'ai', description: '질문 종결어미 ?' },
  { query: '관세 신고 절차는?', expectedType: 'ai', description: '절차 질문' },
  { query: '면제 대상은 누구인가요?', expectedType: 'ai', description: '인가요 종결' },
  { query: '공무원 징계 절차가 어떻게 되나요?', expectedType: 'ai', description: '되나요 종결' },
  { query: '수입통관 시 필요한 서류는 무엇인가요?', expectedType: 'ai', description: '긴 질문' },
  { query: '주택임대차 보증금 반환 받으려면', expectedType: 'ai', description: '~려면 종결' },
  { query: '퇴직금 계산 방법', expectedType: 'ai', description: '방법 종결' },
  { query: '해고 요건', expectedType: 'ai', description: '요건 종결' },
  { query: '연차휴가 산정 방법은?', expectedType: 'ai', description: '방법 질문' },
  { query: '세금 감면 받을 수 있는 조건', expectedType: 'ai', description: '조건 질문' },
  { query: '어떤 경우에 관세가 면제되나요', expectedType: 'ai', description: '의문사+면제' },
  { query: '공무원이 겸직할 수 있나요', expectedType: 'ai', description: '~나요 종결' },
  { query: '건축허가 받으려면 어떻게 해야하나요', expectedType: 'ai', description: '어떻게+하나요' },

  // H-2. AI vs Law 경계 (모호한 케이스)
  { query: '관세법 38조 내용', expectedType: ['ai', 'law'], description: '법령+조문+내용 → 모호' },
  { query: '관세법 38조 설명해줘', expectedType: 'ai', description: '법령+조문+설명해줘 → AI' },
  { query: '관세법 제38조의 요건', expectedType: ['ai', 'law'], description: '법령+조문+요건 → 모호' },

  // ─────────────────────────────────────────────────────
  // I. 복합 쿼리 (Multi)
  // ─────────────────────────────────────────────────────
  { query: '민법 제38조 관련 판례', expectedType: 'multi', description: '법령+판례' },
  { query: '관세법 행정해석', expectedType: ['interpretation', 'multi'], description: '법령+해석' },

  // ─────────────────────────────────────────────────────
  // J. Edge Cases — 오타, 약어, 혼동
  // ─────────────────────────────────────────────────────
  { query: '관세법시행령', expectedType: 'law', description: '시행령 붙여쓰기' },
  { query: '관세법 시행령 제5조', expectedType: 'law', description: '시행령+조문' },
  { query: '조레', expectedType: 'ordinance', description: '조례 오타', expectOrdinance: true },
  { query: '관', expectedType: 'law', description: '1글자 쿼리 (짧음)' },
  { query: '', expectedType: 'law', description: '빈 쿼리' },
  { query: '   ', expectedType: 'law', description: '공백만' },
  { query: '가', expectedType: 'law', description: '한 글자' },

  // J-2. 지자체명 오분류 방지
  { query: '광주 법원', expectedType: 'law', description: '광주(광역시)+법원 → 법령 not 조례' },
  { query: '대전 시행령', expectedType: 'law', description: '대전+시행령 → 법령' },
  { query: '울산 규정', expectedType: 'law', description: '울산+규정 → 법령 (규정≠조례)' },

  // J-3. 고시/지침이 행정규칙이 아닌 AI 질문일 수 있는 케이스
  // "고시 준비 방법" → AI (고시 = 시험), "관세 고시" → interpretation
  // 현재 시스템에서는 "고시" 키워드만으로 interpretation 분류됨
  // 이것은 알려진 제한사항

  // ─────────────────────────────────────────────────────
  // K. 특수 법령 유형
  // ─────────────────────────────────────────────────────
  { query: '헌법', expectedType: 'law', description: '헌법' },
  { query: '헌법 제10조', expectedType: 'law', description: '헌법+조문' },
  { query: '대통령령', expectedType: 'law', description: '대통령령' },
  { query: '국민투표법', expectedType: 'law', description: '특수법' },
  { query: '지방세법', expectedType: 'law', description: '지방세법' },
  { query: '지방세법 시행령', expectedType: 'law', description: '지방세 시행령' },
]

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 자동완성 OrdinancePattern 관련 별도 테스트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface PatternTestCase {
  query: string
  expectIsOrdinance: boolean
  expectContainsLocalGov: boolean
  expectExtractedGov: string | null
  description: string
}

const PATTERN_TEST_CASES: PatternTestCase[] = [
  // 조례 패턴 감지
  { query: '서울특별시 주차장 조례', expectIsOrdinance: true, expectContainsLocalGov: true, expectExtractedGov: '서울', description: '광역시+조례' },
  { query: '강남구 주차 조례', expectIsOrdinance: true, expectContainsLocalGov: true, expectExtractedGov: '강남구', description: '서울구+조례' },
  { query: '광진구 복무', expectIsOrdinance: false, expectContainsLocalGov: true, expectExtractedGov: '광진구', description: '지자체+키워드(조례 키워드 없음)' },
  { query: '수원시 건축 조례', expectIsOrdinance: true, expectContainsLocalGov: true, expectExtractedGov: '수원시', description: '경기도시+조례' },
  { query: '가평군 조례', expectIsOrdinance: true, expectContainsLocalGov: true, expectExtractedGov: '가평군', description: '군+조례' },
  { query: '제주 조례', expectIsOrdinance: true, expectContainsLocalGov: true, expectExtractedGov: '제주', description: '도+조례' },

  // 조례 아닌 것
  { query: '관세법', expectIsOrdinance: false, expectContainsLocalGov: false, expectExtractedGov: null, description: '순수 법률' },
  { query: '관세법 시행령', expectIsOrdinance: false, expectContainsLocalGov: false, expectExtractedGov: null, description: '시행령' },
  { query: '강남구 법원', expectIsOrdinance: false, expectContainsLocalGov: true, expectExtractedGov: '강남구', description: '지자체+법원 (조례 아님)' },
  { query: '서울 시행규칙', expectIsOrdinance: false, expectContainsLocalGov: true, expectExtractedGov: '서울', description: '시행규칙 (법령)' },
  { query: '복무규정', expectIsOrdinance: false, expectContainsLocalGov: false, expectExtractedGov: null, description: '규정 (조례 아님)' },

  // extractLocalGovName 정밀 테스트
  { query: '서울특별시 강남구 조례', expectIsOrdinance: true, expectContainsLocalGov: true, expectExtractedGov: '강남구', description: '광역시+구 → 구 우선' },
  { query: '부산 해운대구 관광 조례', expectIsOrdinance: true, expectContainsLocalGov: true, expectExtractedGov: '해운대구', description: '광역시+구 → 구 우선' },
  { query: '경기 수원시 조례', expectIsOrdinance: true, expectContainsLocalGov: true, expectExtractedGov: '수원시', description: '도+시 → 시 우선' },
]

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 쿼리 확장 테스트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ExpansionTestCase {
  query: string
  expectContains: string[]  // 확장 결과에 포함되어야 하는 키워드
  description: string
}

const EXPANSION_TEST_CASES: ExpansionTestCase[] = [
  { query: '해고', expectContains: ['파면', '해임'], description: '해고 동의어' },
  { query: '세금', expectContains: ['조세', '국세'], description: '세금 법률용어' },
  { query: '야근', expectContains: ['초과근무', '시간외근무'], description: '일상어→법률어' },
  { query: '중소기업', expectContains: ['소상공인'], description: '중소기업 동의어' },
  { query: '임대차', expectContains: ['전세', '월세'], description: '임대차 동의어' },
]

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Runner
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function runClassifierTests(): TestResult[] {
  const results: TestResult[] = []

  for (const tc of TEST_CASES) {
    const r = classifySearchQuery(tc.query)
    const errors: string[] = []
    const allowedTypes = Array.isArray(tc.expectedType) ? tc.expectedType : [tc.expectedType]

    // Type check
    if (!allowedTypes.includes(r.searchType as SearchType)) {
      errors.push(`type: expected [${allowedTypes.join('|')}], got "${r.searchType}"`)
    }

    // Confidence check
    if (tc.minConfidence !== undefined && r.confidence < tc.minConfidence) {
      errors.push(`confidence: expected >= ${tc.minConfidence}, got ${r.confidence.toFixed(2)}`)
    }

    // Ordinance pattern check
    if (tc.expectOrdinance !== undefined) {
      const isOrdin = isOrdinanceQuery(tc.query)
      if (isOrdin !== tc.expectOrdinance) {
        errors.push(`isOrdinanceQuery: expected ${tc.expectOrdinance}, got ${isOrdin}`)
      }
    }

    // Local gov extraction check
    if (tc.expectLocalGov !== undefined) {
      const gov = extractLocalGovName(tc.query)
      if (gov !== tc.expectLocalGov) {
        errors.push(`extractLocalGovName: expected "${tc.expectLocalGov}", got "${gov}"`)
      }
    }

    results.push({
      query: tc.query,
      description: tc.description || '',
      passed: errors.length === 0,
      expected: allowedTypes.join('|'),
      actual: r.searchType,
      confidence: r.confidence,
      reason: r.reason,
      errors
    })
  }

  return results
}

function runPatternTests(): { passed: number; failed: number; details: string[] } {
  let passed = 0
  let failed = 0
  const details: string[] = []

  for (const tc of PATTERN_TEST_CASES) {
    const errors: string[] = []

    const isOrdin = isOrdinanceQuery(tc.query)
    if (isOrdin !== tc.expectIsOrdinance) {
      errors.push(`isOrdinanceQuery: expected ${tc.expectIsOrdinance}, got ${isOrdin}`)
    }

    const hasGov = containsLocalGovName(tc.query)
    if (hasGov !== tc.expectContainsLocalGov) {
      errors.push(`containsLocalGovName: expected ${tc.expectContainsLocalGov}, got ${hasGov}`)
    }

    const gov = extractLocalGovName(tc.query)
    if (gov !== tc.expectExtractedGov) {
      errors.push(`extractLocalGovName: expected "${tc.expectExtractedGov}", got "${gov}"`)
    }

    if (errors.length === 0) {
      passed++
    } else {
      failed++
      details.push(`  FAIL "${tc.query}" (${tc.description})`)
      errors.forEach(e => details.push(`    - ${e}`))
    }
  }

  return { passed, failed, details }
}

function runExpansionTests(): { passed: number; failed: number; details: string[] } {
  let passed = 0
  let failed = 0
  const details: string[] = []

  for (const tc of EXPANSION_TEST_CASES) {
    const expansion = expandQuery(tc.query)
    const all = expansion.allExpanded
    const missing = tc.expectContains.filter(k => !all.some(e => e.includes(k)))

    if (missing.length === 0) {
      passed++
    } else {
      failed++
      details.push(`  FAIL "${tc.query}" (${tc.description})`)
      details.push(`    missing: [${missing.join(', ')}]`)
      details.push(`    got: [${all.join(', ')}]`)
    }
  }

  return { passed, failed, details }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log('═══════════════════════════════════════════════════════')
console.log(' LexDiff 검색 분류기 + 패턴 빡센 테스트')
console.log('═══════════════════════════════════════════════════════\n')

// 1. Classifier Tests
console.log('━━━ [1/3] 쿼리 분류기 테스트 ━━━')
const classifierResults = runClassifierTests()
const cPassed = classifierResults.filter(r => r.passed).length
const cFailed = classifierResults.filter(r => !r.passed).length

// Print failures first
const failures = classifierResults.filter(r => !r.passed)
if (failures.length > 0) {
  console.log('\n  FAILURES:')
  for (const f of failures) {
    console.log(`  FAIL "${f.query}" (${f.description})`)
    console.log(`    expected: ${f.expected} | actual: ${f.actual} | conf: ${f.confidence.toFixed(2)} | reason: ${f.reason}`)
    f.errors.forEach(e => console.log(`    - ${e}`))
  }
}

// Print summary per category
const categories: Record<string, TestResult[]> = {}
for (const r of classifierResults) {
  const tc = TEST_CASES.find(t => t.query === r.query)!
  const cat = tc.description?.split(' ')[0] || 'unknown'
  // group by expected type
  const key = Array.isArray(tc.expectedType) ? tc.expectedType[0] : tc.expectedType
  if (!categories[key]) categories[key] = []
  categories[key].push(r)
}

console.log('\n  Category breakdown:')
for (const [cat, results] of Object.entries(categories)) {
  const p = results.filter(r => r.passed).length
  const icon = p === results.length ? 'OK' : 'NG'
  console.log(`    [${icon}] ${cat}: ${p}/${results.length}`)
}

console.log(`\n  TOTAL: ${cPassed}/${classifierResults.length} passed, ${cFailed} failed\n`)

// 2. Pattern Tests
console.log('━━━ [2/3] OrdinancePattern 테스트 ━━━')
const patternResults = runPatternTests()
if (patternResults.details.length > 0) {
  console.log('\n  FAILURES:')
  patternResults.details.forEach(d => console.log(d))
}
console.log(`\n  TOTAL: ${patternResults.passed}/${patternResults.passed + patternResults.failed} passed, ${patternResults.failed} failed\n`)

// 3. Expansion Tests
console.log('━━━ [3/3] 쿼리 확장 테스트 ━━━')
const expansionResults = runExpansionTests()
if (expansionResults.details.length > 0) {
  console.log('\n  FAILURES:')
  expansionResults.details.forEach(d => console.log(d))
}
console.log(`\n  TOTAL: ${expansionResults.passed}/${expansionResults.passed + expansionResults.failed} passed, ${expansionResults.failed} failed\n`)

// Final summary
const totalPassed = cPassed + patternResults.passed + expansionResults.passed
const totalFailed = cFailed + patternResults.failed + expansionResults.failed
const totalTests = totalPassed + totalFailed

console.log('═══════════════════════════════════════════════════════')
console.log(` FINAL: ${totalPassed}/${totalTests} passed (${totalFailed} failed)`)
console.log(` Pass rate: ${((totalPassed / totalTests) * 100).toFixed(1)}%`)
console.log('═══════════════════════════════════════════════════════')

if (totalFailed > 0) {
  process.exit(1)
}
