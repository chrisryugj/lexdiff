/**
 * 공무원 실전 질의 + 광진구 조례 철저 검증 테스트
 *
 * Part 1: 공무원이 실제로 검색할만한 모든 쿼리 패턴
 * Part 2: 광진구 조례 자동완성 API 실제 호출 (지자체 필터링 검증)
 * Part 3: 분류기 + 자동완성 통합 시나리오
 *
 * Usage: npx tsx scripts/test-civil-servant-gwangjin.ts
 */

import { classifySearchQuery } from '../src/domain/search/services/QueryClassifier'
import { extractLocalGovName, containsLocalGovName, isOrdinanceQuery } from '../src/domain/patterns/OrdinancePattern'
import { expandQuery } from '../lib/query-expansion'

type SearchType = 'law' | 'ordinance' | 'ai' | 'precedent' | 'interpretation' | 'ruling' | 'multi'

interface TestCase {
  query: string
  expectedType: SearchType | SearchType[]
  minConfidence?: number
  description: string
}

// ═══════════════════════════════════════════════════════════════════════
// Part 1: 공무원이 검색할만한 모든 쿼리 (7개 카테고리, 100+ 케이스)
// ═══════════════════════════════════════════════════════════════════════

const CIVIL_SERVANT_CASES: TestCase[] = [

  // ───────────────────────────────────────────────
  // 1-A. 복무 관련
  // ───────────────────────────────────────────────
  { query: '국가공무원 복무규정', expectedType: 'law', description: '복무규정 (대통령령)' },
  { query: '지방공무원 복무규칙', expectedType: 'law', description: '복무규칙' },
  { query: '공무원 복무규정', expectedType: 'law', description: '복무규정 일반' },
  { query: '공무원 근무시간', expectedType: ['ai', 'law'], description: '짧은 키워드 → 경계' },
  { query: '공무원 출퇴근 시간은?', expectedType: 'ai', description: 'AI 출퇴근 질문' },
  { query: '공무원 유연근무제', expectedType: ['ai', 'law'], description: '짧은 키워드 → 경계' },
  { query: '탄력근무제 신청 방법', expectedType: 'ai', description: 'AI 탄력근무' },
  { query: '시간선택제 공무원', expectedType: ['ai', 'law'], description: '짧은 키워드 → 경계' },
  { query: '재택근무 규정', expectedType: 'law', description: '재택근무 규정' },
  { query: '공무원 재택근무 요건은?', expectedType: 'ai', description: 'AI 재택근무 요건' },

  // ───────────────────────────────────────────────
  // 1-B. 휴가/휴직 관련
  // ───────────────────────────────────────────────
  { query: '공무원 연가 일수', expectedType: 'ai', description: 'AI 연가 일수' },
  { query: '공무원 연가 일수 산정 방법은?', expectedType: 'ai', description: 'AI 연가 산정' },
  { query: '공무원 병가', expectedType: ['ai', 'law'], description: '짧은 키워드 → 경계' },
  { query: '공무원 병가 일수는?', expectedType: 'ai', description: 'AI 병가 일수' },
  { query: '공무원 특별휴가', expectedType: ['ai', 'law'], description: '짧은 키워드 → 경계' },
  { query: '경조사 휴가 일수', expectedType: 'ai', description: 'AI 경조사' },
  { query: '출산휴가 기간은?', expectedType: 'ai', description: 'AI 출산휴가' },
  { query: '육아휴직 요건', expectedType: 'ai', description: 'AI 육아휴직 요건' },
  { query: '육아휴직 기간은?', expectedType: 'ai', description: 'AI 육아휴직 기간' },
  { query: '공무원 휴직 종류', expectedType: ['ai', 'law'], description: '짧은 키워드 → 경계' },
  { query: '질병휴직 요건은?', expectedType: 'ai', description: 'AI 질병휴직' },
  { query: '유학휴직 요건', expectedType: 'ai', description: 'AI 유학휴직' },

  // ───────────────────────────────────────────────
  // 1-C. 인사/승진 관련
  // ───────────────────────────────────────────────
  { query: '공무원 승진 요건은?', expectedType: 'ai', description: 'AI 승진 요건' },
  { query: '공무원임용시험령', expectedType: 'law', description: '임용시험령' },
  { query: '공무원임용령', expectedType: 'law', description: '임용령' },
  { query: '승진임용규정', expectedType: 'law', description: '승진임용규정' },
  { query: '근무성적평정규칙', expectedType: 'law', description: '근평규칙' },
  { query: '공무원 전보 기준', expectedType: 'ai', description: 'AI 전보' },
  { query: '공무원 파견 근무', expectedType: ['ai', 'law'], description: '짧은 키워드 → 경계' },
  { query: '5급 승진 요건은?', expectedType: 'ai', description: 'AI 5급 승진' },
  { query: '7급에서 6급 승진 기간', expectedType: 'ai', description: 'AI 승진 기간' },
  { query: '공무원 성과평가 기준은?', expectedType: 'ai', description: 'AI 성과평가' },
  { query: '공무원 인사 규정', expectedType: 'law', description: '인사규정' },

  // ───────────────────────────────────────────────
  // 1-D. 징계/처분 관련
  // ───────────────────────────────────────────────
  { query: '공무원 징계령', expectedType: 'law', description: '징계령 (대통령령)' },
  { query: '공무원 징계 종류', expectedType: ['ai', 'law'], description: '짧은 키워드 → 경계' },
  { query: '공무원 징계 절차는?', expectedType: 'ai', description: 'AI 징계 절차' },
  { query: '징계 양정 기준은?', expectedType: 'ai', description: 'AI 양정 기준' },
  { query: '경징계 중징계 차이', expectedType: 'ai', description: 'AI 경징계/중징계' },
  { query: '감봉 기간은?', expectedType: 'ai', description: 'AI 감봉' },
  { query: '정직 처분 효과', expectedType: 'ai', description: 'AI 정직' },
  { query: '파면과 해임의 차이점', expectedType: 'ai', description: 'AI 파면/해임' },
  { query: '공무원 소청심사 절차', expectedType: 'ai', description: 'AI 소청심사' },
  { query: '소청심사위원회', expectedType: ['ai', 'law'], description: '짧은 키워드 → 경계' },
  { query: '징계부가금', expectedType: ['ai', 'law'], description: '짧은 키워드 → 경계' },

  // ───────────────────────────────────────────────
  // 1-E. 급여/수당 관련
  // ───────────────────────────────────────────────
  { query: '공무원 보수규정', expectedType: 'law', description: '보수규정' },
  { query: '공무원수당 등에 관한 규정', expectedType: 'law', description: '수당규정' },
  { query: '공무원 봉급표', expectedType: ['ai', 'law'], description: '짧은 키워드 → 경계' },
  { query: '초과근무수당 계산', expectedType: ['ai', 'law'], description: '짧은 키워드 → 경계' },
  { query: '야근수당 어떻게 계산하나요', expectedType: 'ai', description: 'AI 야근수당' },
  { query: '정근수당', expectedType: ['ai', 'law'], description: '짧은 키워드 → 경계' },
  { query: '가족수당 지급 기준은?', expectedType: 'ai', description: 'AI 가족수당' },
  { query: '명절휴가비', expectedType: ['ai', 'law'], description: '짧은 키워드 → 경계' },
  { query: '성과상여금 지급 기준', expectedType: 'ai', description: 'AI 성과상여금' },

  // ───────────────────────────────────────────────
  // 1-F. 겸직/영리업무 관련
  // ───────────────────────────────────────────────
  { query: '공무원 겸직 허가', expectedType: ['ai', 'law'], description: '짧은 키워드 → 경계' },
  { query: '공무원 겸직 가능한가요', expectedType: 'ai', description: 'AI 겸직 질문' },
  { query: '영리업무 금지 범위', expectedType: 'ai', description: 'AI 영리업무' },
  { query: '공무원 주식투자 가능한가요', expectedType: 'ai', description: 'AI 주식' },
  { query: '공무원 부동산 투자 제한', expectedType: ['ai', 'law'], description: '경계 (15자 미만)' },
  { query: '공무원 유튜브 가능한가요', expectedType: 'ai', description: 'AI 유튜브' },

  // ───────────────────────────────────────────────
  // 1-G. 퇴직/연금 관련
  // ───────────────────────────────────────────────
  { query: '공무원연금법', expectedType: 'law', description: '연금법' },
  { query: '공무원연금법 시행령', expectedType: 'law', description: '연금법 시행령' },
  { query: '퇴직수당 계산 방법', expectedType: 'ai', description: 'AI 퇴직수당' },
  { query: '명예퇴직 요건은?', expectedType: 'ai', description: 'AI 명예퇴직' },
  { query: '조기퇴직 수당', expectedType: ['ai', 'law'], description: '짧은 키워드 → 경계' },
  { query: '연금 수령 시기', expectedType: ['ai', 'law'], description: '짧은 키워드 → 경계' },
  { query: '공무원 퇴직연금 산정 방법', expectedType: 'ai', description: 'AI 퇴직연금' },

  // ───────────────────────────────────────────────
  // 1-H. 법령 직접 검색 (시행령/시행규칙 포함)
  // ───────────────────────────────────────────────
  { query: '국가공무원법', expectedType: 'law', description: '국가공무원법' },
  { query: '국가공무원법 제78조', expectedType: 'law', description: '징계 조문' },
  { query: '국가공무원법 제78조의2', expectedType: 'law', description: '징계부가금 조문' },
  { query: '국가공무원법 시행령', expectedType: 'law', description: '시행령' },
  { query: '국가공무원법 시행규칙', expectedType: 'law', description: '시행규칙' },
  { query: '지방공무원법', expectedType: 'law', description: '지방공무원법' },
  { query: '지방공무원법 제69조', expectedType: 'law', description: '지방 징계 조문' },
  { query: '지방공무원법 시행령', expectedType: 'law', description: '지방 시행령' },
  { query: '공무원 행동강령', expectedType: 'law', description: '행동강령' },
  { query: '부정청탁 및 금품등 수수의 금지에 관한 법률', expectedType: 'law', description: '청탁금지법' },
  { query: '국가공무원 복무규정 제9조', expectedType: 'law', description: '복무규정+조문' },
  { query: '국가공무원 복무규정 제9조 제1항', expectedType: 'law', description: '복무규정+조+항' },

  // ───────────────────────────────────────────────
  // 1-I. 판례/재결례/해석례 검색
  // ───────────────────────────────────────────────
  { query: '공무원 징계 판례', expectedType: ['multi', 'precedent'], description: '법령+판례 복합' },
  { query: '대법원 2022두12345', expectedType: 'precedent', description: '행정 판례' },
  { query: '공무원 해임 판례', expectedType: ['multi', 'precedent'], description: '해임 판례' },
  { query: '인사혁신처 예규', expectedType: 'interpretation', description: '인사혁신처 예규' },
  { query: '행정안전부 훈령', expectedType: 'interpretation', description: '행안부 훈령' },

  // ───────────────────────────────────────────────
  // 1-J. 지자체 공무원의 조례 검색
  // ───────────────────────────────────────────────
  { query: '서울시 공무원 정원 조례', expectedType: 'ordinance', description: '서울시 정원 조례' },
  { query: '광진구 공무원 복무 조례', expectedType: 'ordinance', description: '광진구 복무 조례' },
  { query: '광진구 정원 조례', expectedType: 'ordinance', description: '광진구 정원 조례' },
  { query: '강남구 공무원 수당 조례', expectedType: 'ordinance', description: '강남구 수당 조례' },
  { query: '수원시 공무원 교육훈련 조례', expectedType: 'ordinance', description: '수원시 교육훈련' },
]

// ═══════════════════════════════════════════════════════════════════════
// Part 2: 광진구 조례 철저 검증
// ═══════════════════════════════════════════════════════════════════════

const GWANGJIN_CASES: TestCase[] = [
  // 광진구 + 조례 키워드
  { query: '광진구 조례', expectedType: 'ordinance', description: '광진구 조례 일반' },
  { query: '광진구 복무 조례', expectedType: 'ordinance', description: '광진구 복무 조례' },
  { query: '광진구 정원 조례', expectedType: 'ordinance', description: '광진구 정원 조례' },
  { query: '광진구 수당 조례', expectedType: 'ordinance', description: '광진구 수당 조례' },
  { query: '광진구 주차장 조례', expectedType: 'ordinance', description: '광진구 주차장 조례' },
  { query: '광진구 건축 조례', expectedType: 'ordinance', description: '광진구 건축 조례' },
  { query: '광진구 환경 조례', expectedType: 'ordinance', description: '광진구 환경 조례' },
  { query: '광진구 도시계획 조례', expectedType: 'ordinance', description: '광진구 도시계획 조례' },
  { query: '광진구 청소년 조례', expectedType: 'ordinance', description: '광진구 청소년 조례' },
  { query: '광진구 복지 조례', expectedType: 'ordinance', description: '광진구 복지 조례' },
  { query: '광진구 교육 조례', expectedType: 'ordinance', description: '광진구 교육 조례' },
  { query: '광진구 안전 조례', expectedType: 'ordinance', description: '광진구 안전 조례' },
  { query: '광진구 문화 조례', expectedType: 'ordinance', description: '광진구 문화 조례' },
  { query: '광진구 체육시설 조례', expectedType: 'ordinance', description: '광진구 체육시설 조례' },
  { query: '광진구 어린이집 조례', expectedType: 'ordinance', description: '광진구 어린이집 조례' },

  // 광진구 + 조례 키워드 없음 (지자체명 감지로 ordinance)
  { query: '광진구 복무', expectedType: 'ordinance', description: '광진구+복무 (조례 없음)' },
  { query: '광진구 주차', expectedType: 'ordinance', description: '광진구+주차' },
  { query: '광진구 건축', expectedType: 'ordinance', description: '광진구+건축' },
  { query: '광진구 복지', expectedType: 'ordinance', description: '광진구+복지' },
  { query: '광진구 청소년', expectedType: 'ordinance', description: '광진구+청소년' },
  { query: '광진구 환경', expectedType: 'ordinance', description: '광진구+환경' },
  { query: '광진구 도시', expectedType: 'ordinance', description: '광진구+도시' },

  // 광진구 + 규칙 (자치규칙)
  { query: '광진구 규칙', expectedType: 'ordinance', description: '광진구 규칙' },
  { query: '광진구 자치법규', expectedType: 'ordinance', description: '광진구 자치법규' },

  // 광진구의회
  { query: '광진구의회 조례', expectedType: 'ordinance', description: '광진구의회 조례' },

  // 서울특별시 광진구 (정식명칭)
  { query: '서울특별시 광진구 조례', expectedType: 'ordinance', description: '정식명칭 조례' },
  { query: '서울특별시 광진구 복무 조례', expectedType: 'ordinance', description: '정식명칭 복무 조례' },
  { query: '서울시 광진구 주차장 조례', expectedType: 'ordinance', description: '서울시 광진구 주차장' },
]

// ═══════════════════════════════════════════════════════════════════════
// Part 3: 광진구 지자체 필터링 검증 (extractLocalGovName)
// ═══════════════════════════════════════════════════════════════════════

interface FilterTestCase {
  query: string
  expectGov: string | null
  expectContains: boolean
  expectIsOrdinance: boolean
  description: string
}

const FILTER_CASES: FilterTestCase[] = [
  // 광진구 추출
  { query: '광진구 조례', expectGov: '광진구', expectContains: true, expectIsOrdinance: true, description: '광진구 추출' },
  { query: '광진구 복무', expectGov: '광진구', expectContains: true, expectIsOrdinance: false, description: '조례 키워드 없어도 지자체 추출' },
  { query: '서울특별시 광진구 조례', expectGov: '광진구', expectContains: true, expectIsOrdinance: true, description: '서울+광진구 → 광진구 우선' },
  { query: '광진구의회 조례', expectGov: '광진구', expectContains: true, expectIsOrdinance: true, description: '의회 포함 → 광진구 추출' },

  // 다른 지자체는 광진구 아님
  { query: '강남구 조례', expectGov: '강남구', expectContains: true, expectIsOrdinance: true, description: '강남구 ≠ 광진구' },
  { query: '가평군 복무', expectGov: '가평군', expectContains: true, expectIsOrdinance: false, description: '가평군 ≠ 광진구' },

  // 광진구 없는 쿼리
  { query: '복무 조례', expectGov: null, expectContains: false, expectIsOrdinance: true, description: '지자체 없음' },
  { query: '관세법', expectGov: null, expectContains: false, expectIsOrdinance: false, description: '법률' },
]

// ═══════════════════════════════════════════════════════════════════════
// Part 4: 자동완성 API 실제 호출 (서버 필요)
// ═══════════════════════════════════════════════════════════════════════

interface SuggestTestCase {
  query: string
  expectAllContainGov?: string   // 조례 결과에 이 지자체명 포함되어야
  expectNoOtherGov?: boolean     // 다른 지자체 조례 없어야
  expectHasLaw?: boolean         // 법령 추천 있어야
  expectHasAi?: boolean          // AI 질문 추천 있어야
  description: string
}

const SUGGEST_CASES: SuggestTestCase[] = [
  { query: '광진구 복무', expectAllContainGov: '광진구', expectNoOtherGov: true, description: '광진구 복무 → 광진구 조례만' },
  { query: '광진구 주차', expectAllContainGov: '광진구', expectNoOtherGov: true, description: '광진구 주차 → 광진구만' },
  { query: '광진구 건축', expectAllContainGov: '광진구', expectNoOtherGov: true, description: '광진구 건축 → 광진구만' },
  { query: '광진구 조례', expectAllContainGov: '광진구', expectNoOtherGov: true, description: '광진구 조례 → 광진구만' },
  { query: '강남구 주차', expectAllContainGov: '강남구', expectNoOtherGov: true, description: '강남구 주차 → 강남구만' },
  { query: '관세법', expectHasLaw: true, description: '관세법 → 법령 추천' },
  { query: '공무원 연가 일수는?', expectHasAi: true, description: 'AI 질문 추천' },
]

// ═══════════════════════════════════════════════════════════════════════
// Runners
// ═══════════════════════════════════════════════════════════════════════

function runCases(label: string, cases: TestCase[]): { passed: number; failed: number; failures: string[] } {
  let passed = 0, failed = 0
  const failures: string[] = []

  for (const tc of cases) {
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

  return { passed, failed, failures }
}

function runFilterTests(): { passed: number; failed: number; failures: string[] } {
  let passed = 0, failed = 0
  const failures: string[] = []

  for (const tc of FILTER_CASES) {
    const errors: string[] = []
    const gov = extractLocalGovName(tc.query)
    if (gov !== tc.expectGov) errors.push(`extractLocalGovName: expected "${tc.expectGov}", got "${gov}"`)

    const contains = containsLocalGovName(tc.query)
    if (contains !== tc.expectContains) errors.push(`containsLocalGovName: expected ${tc.expectContains}, got ${contains}`)

    const isOrdin = isOrdinanceQuery(tc.query)
    if (isOrdin !== tc.expectIsOrdinance) errors.push(`isOrdinanceQuery: expected ${tc.expectIsOrdinance}, got ${isOrdin}`)

    if (errors.length === 0) {
      passed++
    } else {
      failed++
      failures.push(`  FAIL "${tc.query}" (${tc.description})`)
      errors.forEach(e => failures.push(`    - ${e}`))
    }
  }

  return { passed, failed, failures }
}

async function runSuggestTests(): Promise<{ passed: number; failed: number; failures: string[]; skipped: boolean }> {
  const BASE = 'http://localhost:3000/api/search-suggest'
  let passed = 0, failed = 0
  const failures: string[] = []

  // Check if server is running
  try {
    const check = await fetch(`${BASE}?q=test`, { signal: AbortSignal.timeout(3000) })
    if (!check.ok) throw new Error('Server not OK')
  } catch {
    return { passed: 0, failed: 0, failures: ['서버 미실행 — 자동완성 API 테스트 스킵'], skipped: true }
  }

  for (const tc of SUGGEST_CASES) {
    const errors: string[] = []

    try {
      const res = await fetch(`${BASE}?q=${encodeURIComponent(tc.query)}`, {
        signal: AbortSignal.timeout(5000)
      })
      const data = await res.json() as {
        suggestions: Array<{ text: string; type: string; category: string }>
      }

      const suggestions = data.suggestions || []

      // 조례 결과만 필터 (법령의 시행규칙/규정 제외)
      // 조례 category: 조례, 자치조례, 자치규칙 등
      // 법령 category: 법률, 대통령령, 총리령, 부령 등
      const LAW_CATEGORIES = ['법률', '대통령령', '총리령', '부령', '법령']
      const ordinSuggestions = suggestions.filter(s =>
        s.type === 'law' &&
        !LAW_CATEGORIES.includes(s.category) &&
        (s.category === '조례' || s.category === '자치조례' || s.category === '자치규칙' ||
         /조례/.test(s.text))
      )

      // 지자체 필터링 검증
      if (tc.expectAllContainGov && ordinSuggestions.length > 0) {
        const wrongGov = ordinSuggestions.filter(s => !s.text.includes(tc.expectAllContainGov!))
        if (wrongGov.length > 0) {
          errors.push(`다른 지자체 조례 노출: [${wrongGov.map(s => s.text).join(', ')}]`)
        }
      }

      if (tc.expectHasLaw) {
        const hasLaw = suggestions.some(s => s.type === 'law')
        if (!hasLaw) errors.push('법령 추천 없음')
      }

      if (tc.expectHasAi) {
        const hasAi = suggestions.some(s => s.type === 'ai')
        if (!hasAi) errors.push('AI 추천 없음')
      }

      // 결과 요약 출력
      if (errors.length === 0) {
        const summary = suggestions.slice(0, 3).map(s => s.text).join(' | ')
        console.log(`    OK "${tc.query}" → [${suggestions.length}개] ${summary}...`)
      }
    } catch (err) {
      errors.push(`API 호출 실패: ${err}`)
    }

    if (errors.length === 0) {
      passed++
    } else {
      failed++
      failures.push(`  FAIL "${tc.query}" (${tc.description})`)
      errors.forEach(e => failures.push(`    - ${e}`))
    }
  }

  return { passed, failed, failures, skipped: false }
}

// ═══════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════════════════')
  console.log(' 공무원 실전 질의 + 광진구 조례 철저 검증')
  console.log('═══════════════════════════════════════════════════════\n')

  // Part 1
  console.log('━━━ [1/4] 공무원 실전 질의 분류기 테스트 ━━━')
  const p1 = runCases('공무원', CIVIL_SERVANT_CASES)
  if (p1.failures.length > 0) {
    console.log('\n  FAILURES:')
    p1.failures.forEach(f => console.log(f))
  }
  console.log(`  결과: ${p1.passed}/${CIVIL_SERVANT_CASES.length} passed, ${p1.failed} failed\n`)

  // Part 2
  console.log('━━━ [2/4] 광진구 조례 분류기 테스트 ━━━')
  const p2 = runCases('광진구', GWANGJIN_CASES)
  if (p2.failures.length > 0) {
    console.log('\n  FAILURES:')
    p2.failures.forEach(f => console.log(f))
  }
  console.log(`  결과: ${p2.passed}/${GWANGJIN_CASES.length} passed, ${p2.failed} failed\n`)

  // Part 3
  console.log('━━━ [3/4] 지자체 필터링 함수 테스트 ━━━')
  const p3 = runFilterTests()
  if (p3.failures.length > 0) {
    console.log('\n  FAILURES:')
    p3.failures.forEach(f => console.log(f))
  }
  console.log(`  결과: ${p3.passed}/${FILTER_CASES.length} passed, ${p3.failed} failed\n`)

  // Part 4
  console.log('━━━ [4/4] 자동완성 API 실제 호출 테스트 ━━━')
  const p4 = await runSuggestTests()
  if (p4.skipped) {
    console.log('  (dev 서버 미실행 — 스킵)\n')
  } else {
    if (p4.failures.length > 0) {
      console.log('\n  FAILURES:')
      p4.failures.forEach(f => console.log(f))
    }
    console.log(`  결과: ${p4.passed}/${SUGGEST_CASES.length} passed, ${p4.failed} failed\n`)
  }

  // Final
  const totalPassed = p1.passed + p2.passed + p3.passed + p4.passed
  const totalFailed = p1.failed + p2.failed + p3.failed + p4.failed
  const totalTests = totalPassed + totalFailed

  console.log('═══════════════════════════════════════════════════════')
  console.log(` FINAL: ${totalPassed}/${totalTests} passed (${totalFailed} failed)`)
  console.log(` Pass rate: ${totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : 'N/A'}%`)
  console.log('═══════════════════════════════════════════════════════')

  if (totalFailed > 0) process.exit(1)
}

main()
