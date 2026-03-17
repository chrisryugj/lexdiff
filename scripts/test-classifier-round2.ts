/**
 * 2차 검증: 실전 유저 시나리오 + 극한 edge case
 *
 * 실제 법률 실무자가 검색바에 입력하는 패턴 재현
 * Usage: npx tsx scripts/test-classifier-round2.ts
 */

import { classifySearchQuery } from '../src/domain/search/services/QueryClassifier'
import { isOrdinanceQuery, containsLocalGovName, extractLocalGovName } from '../src/domain/patterns/OrdinancePattern'

type SearchType = 'law' | 'ordinance' | 'ai' | 'precedent' | 'interpretation' | 'ruling' | 'multi'

interface TestCase {
  query: string
  expectedType: SearchType | SearchType[]
  minConfidence?: number
  description: string
}

const ROUND2_CASES: TestCase[] = [
  // ═══════════════════════════════════════════
  // 실전 시나리오 1: 법률 전문가가 조문 조회
  // ═══════════════════════════════════════════
  { query: '민법 제750조', expectedType: 'law', description: '불법행위 조문' },
  { query: '민법 750조', expectedType: 'law', description: '제 생략' },
  { query: '형법 제347조', expectedType: 'law', description: '사기죄 조문' },
  { query: '형법 347조', expectedType: 'law', description: '사기죄 제 생략' },
  { query: '상법 제382조의3', expectedType: 'law', description: '조의X 패턴' },
  { query: '소득세법 제127조 제1항 제4호', expectedType: 'law', minConfidence: 0.85, description: '조+항+호 전체' },
  { query: '부가가치세법 시행령 제42조', expectedType: 'law', description: '시행령+조문' },
  { query: '관세법 시행규칙 제10조', expectedType: 'law', description: '시행규칙+조문' },

  // ═══════════════════════════════════════════
  // 실전 시나리오 2: 세무사가 세법 검색
  // ═══════════════════════════════════════════
  { query: '종합부동산세법', expectedType: 'law', description: '종부세법' },
  { query: '지방세특례제한법', expectedType: 'law', description: '지방세 특례법' },
  { query: '조세특례제한법', expectedType: 'law', description: '조특법' },
  { query: '법인세법 시행령', expectedType: 'law', description: '법인세 시행령' },
  { query: '상속세 및 증여세법', expectedType: 'law', description: '상증세법' },
  { query: '국세기본법', expectedType: 'law', description: '국세기본법' },
  { query: '세금 감면 조건이 뭐야', expectedType: 'ai', description: 'AI 세금 질문' },
  { query: '양도소득세 비과세 요건은?', expectedType: 'ai', description: 'AI 세금 질문 2' },

  // ═══════════════════════════════════════════
  // 실전 시나리오 3: 공무원이 복무규정 검색
  // ═══════════════════════════════════════════
  { query: '공무원 복무규정', expectedType: 'law', description: '복무규정' },
  { query: '지방공무원 복무규칙', expectedType: 'law', description: '복무규칙 (규칙=시행규칙 아님)' },
  { query: '공무원 겸직 허가 기준', expectedType: 'ai', description: 'AI 겸직 질문' },
  { query: '공무원 징계 양정 기준', expectedType: 'ai', description: 'AI 징계 질문' },
  { query: '광진구 공무원 복무 조례', expectedType: 'ordinance', description: '지자체 복무 조례' },

  // ═══════════════════════════════════════════
  // 실전 시나리오 4: 건축사가 건축법 검색
  // ═══════════════════════════════════════════
  { query: '건축법', expectedType: 'law', description: '건축법' },
  { query: '건축법 시행령', expectedType: 'law', description: '건축 시행령' },
  { query: '건축법 시행규칙', expectedType: 'law', description: '건축 시행규칙' },
  { query: '건축물의 구조기준 등에 관한 규칙', expectedType: 'law', description: '긴 규칙명' },
  { query: '서울 건축 조례', expectedType: 'ordinance', description: '서울 건축 조례' },
  { query: '강남구 건축 조례', expectedType: 'ordinance', description: '강남구 건축 조례' },
  { query: '건축허가 절차는?', expectedType: 'ai', description: 'AI 건축 질문' },
  { query: '불법건축물 처벌은?', expectedType: 'ai', description: 'AI 건축 질문 2' },

  // ═══════════════════════════════════════════
  // 실전 시나리오 5: 노무사가 근로기준법 검색
  // ═══════════════════════════════════════════
  { query: '근로기준법', expectedType: 'law', description: '근로기준법' },
  { query: '근로기준법 시행령', expectedType: 'law', description: '근로기준 시행령' },
  { query: '최저임금법', expectedType: 'law', description: '최저임금법' },
  { query: '산업재해보상보험법', expectedType: 'law', description: '산재법' },
  { query: '부당해고 구제신청 절차는?', expectedType: 'ai', description: 'AI 노동 질문' },
  { query: '연차수당 계산 방법', expectedType: 'ai', description: 'AI 연차 질문' },
  { query: '야근 수당 어떻게 계산해', expectedType: 'ai', description: '구어체 질문' },

  // ═══════════════════════════════════════════
  // 실전 시나리오 6: 판례 검색 다양한 포맷
  // ═══════════════════════════════════════════
  { query: '대법원 2020다200000', expectedType: 'precedent', description: '실제 대법원 판결번호' },
  { query: '서울중앙지법 2024가합12345', expectedType: 'precedent', description: '중앙지법 민사합의' },
  { query: '인천지법 2023고단1234', expectedType: 'precedent', description: '지법 형사단독' },
  { query: '부산고법 2024나5678', expectedType: 'precedent', description: '고법 약칭' },
  { query: '대법원 2024두12345', expectedType: 'precedent', description: '행정상고' },
  { query: '특허법원 판결', expectedType: ['precedent', 'multi'], description: '특허법원 (COURT_NAMES에 없을수도)' },

  // ═══════════════════════════════════════════
  // 극한 Edge Case: 오분류 함정
  // ═══════════════════════════════════════════

  // "결정" 키워드 함정 — 법원 결정 vs 일반 단어
  { query: '법원 결정', expectedType: ['precedent', 'multi'], description: '법원+결정 → 판례/multi' },
  { query: '행정처분 취소 결정', expectedType: ['ai', 'law', 'multi'], description: '처분+결정 → 경계/복합' },

  // "법" 키워드 함정
  { query: '법 모르는 사람도 이해하게 설명해줘', expectedType: 'ai', description: '법=일반 단어 → AI' },

  // "규칙" 함정 — 시행규칙 vs 자치규칙
  { query: '관세법 시행규칙', expectedType: 'law', description: '시행규칙 → law' },

  // 조례 키워드 없이 지자체명만
  { query: '성남시 장애인', expectedType: 'ordinance', description: '지자체+키워드 → 조례' },
  { query: '제주 관광', expectedType: 'ordinance', description: '도+키워드 → 조례' },
  { query: '세종 교육', expectedType: 'ordinance', description: '세종+키워드 → 조례' },

  // "해석" 함정 — 해석례 vs 일반
  { query: '이 조문 해석이 궁금해요', expectedType: 'ai', description: '해석=일반 단어 → AI' },
  { query: '법령 해석례', expectedType: 'interpretation', description: '해석례 키워드' },

  // 판례 번호 비슷하지만 아닌 것
  { query: '2024년도 예산', expectedType: 'law', description: '연도+도 ≠ 판례번호' },
  { query: '2024년 개정 사항', expectedType: ['ai', 'law'], description: '연도+개정 → 경계' },

  // 긴 자연어 질문
  { query: '아파트 분양 시 계약금을 납부한 후 계약을 해제하려면 어떤 절차를 거쳐야 하나요', expectedType: 'ai', description: '매우 긴 자연어 질문' },
  { query: '개인사업자가 폐업할 때 부가가치세 신고는 언제까지 해야 하나요', expectedType: 'ai', description: '세금 긴 질문' },

  // 약어 / 줄임말
  { query: '관세법', expectedType: 'law', description: '정식 법명' },
  { query: '민소법', expectedType: 'law', description: '민사소송법 약어? → 짧은 law' },
  { query: '형소법', expectedType: 'law', description: '형사소송법 약어?' },

  // ═══════════════════════════════════════════
  // 자동완성 필터링 테스트 (지자체 필터)
  // ═══════════════════════════════════════════
  // extractLocalGovName으로 필터가 제대로 작동하는지
  { query: '마포구 주차', expectedType: 'ordinance', description: '마포구 → extractLocalGovName=마포구' },
  { query: '영등포구 건축', expectedType: 'ordinance', description: '영등포구 → extractLocalGovName=영등포구' },
  { query: '용인시 도시계획', expectedType: 'ordinance', description: '용인시 → extractLocalGovName=용인시' },
]

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Runner
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log('═══════════════════════════════════════════════════════')
console.log(' 2차 검증: 실전 유저 시나리오 + 극한 edge case')
console.log('═══════════════════════════════════════════════════════\n')

let passed = 0
let failed = 0
const failures: string[] = []

for (const tc of ROUND2_CASES) {
  const r = classifySearchQuery(tc.query)
  const allowed = Array.isArray(tc.expectedType) ? tc.expectedType : [tc.expectedType]

  let ok = allowed.includes(r.searchType as SearchType)
  if (tc.minConfidence && r.confidence < tc.minConfidence) ok = false

  if (ok) {
    passed++
  } else {
    failed++
    failures.push(
      `  FAIL "${tc.query}" (${tc.description})\n` +
      `    expected: [${allowed.join('|')}] | actual: ${r.searchType} | conf: ${r.confidence.toFixed(2)} | reason: ${r.reason}`
    )
  }
}

if (failures.length > 0) {
  console.log('FAILURES:\n')
  failures.forEach(f => console.log(f))
  console.log('')
}

// extractLocalGovName 정밀 검증
const govCases = [
  { q: '마포구 주차', expect: '마포구' },
  { q: '영등포구 건축', expect: '영등포구' },
  { q: '용인시 도시계획', expect: '용인시' },
  { q: '서울특별시 강남구 조례', expect: '강남구' },
  { q: '부산 해운대구 조례', expect: '해운대구' },
  { q: '경기 가평군', expect: '가평군' },
  { q: '관세법', expect: null },
]

let govPassed = 0
let govFailed = 0
for (const gc of govCases) {
  const result = extractLocalGovName(gc.q)
  if (result === gc.expect) {
    govPassed++
  } else {
    govFailed++
    failures.push(`  GOV FAIL "${gc.q}": expected "${gc.expect}", got "${result}"`)
  }
}

console.log(`━━━ 분류기: ${passed}/${ROUND2_CASES.length} passed, ${failed} failed ━━━`)
console.log(`━━━ 지자체 추출: ${govPassed}/${govCases.length} passed, ${govFailed} failed ━━━`)
console.log('')

const total = passed + govPassed
const totalAll = ROUND2_CASES.length + govCases.length
const totalFail = failed + govFailed

console.log('═══════════════════════════════════════════════════════')
console.log(` FINAL: ${total}/${totalAll} passed (${totalFail} failed)`)
console.log(` Pass rate: ${((total / totalAll) * 100).toFixed(1)}%`)
console.log('═══════════════════════════════════════════════════════')

if (totalFail > 0) process.exit(1)
