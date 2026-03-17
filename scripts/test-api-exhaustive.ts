/**
 * 자동완성 API 대규모 실제 호출 테스트
 *
 * 법제처 API를 실제로 호출해서 결과 검증
 * - 지자체 필터링 정확도
 * - 법령/조례/AI 추천 적절성
 * - 점수 순서 (조례 > 법령 when 지자체명)
 * - Edge case 처리
 *
 * Usage: npx tsx scripts/test-api-exhaustive.ts
 */

const BASE = 'http://localhost:3000/api/search-suggest'

interface Suggestion {
  text: string
  type: 'law' | 'ai' | 'precedent' | 'interpretation' | 'ruling'
  category: string
}

interface ApiTestCase {
  query: string
  description: string
  checks: Check[]
}

type Check =
  | { type: 'ordinanceOnlyFrom'; gov: string }        // 조례 결과에 이 지자체만
  | { type: 'noOrdinanceFrom'; gov: string }           // 이 지자체 조례 없어야
  | { type: 'topNContain'; n: number; keyword: string } // 상위 N개에 키워드 포함
  | { type: 'topNType'; n: number; expectedType: string } // 상위 N개 타입
  | { type: 'hasType'; expectedType: string }           // 특정 타입 결과 있어야
  | { type: 'noType'; expectedType: string }            // 특정 타입 결과 없어야
  | { type: 'minResults'; count: number }               // 최소 결과 수
  | { type: 'topIsOrdinance' }                          // 1위가 조례
  | { type: 'topIsLaw' }                                // 1위가 법령
  | { type: 'ordinanceBeforeLaw' }                      // 조례가 법령보다 앞
  | { type: 'containsExact'; text: string }             // 정확한 텍스트 포함

const TESTS: ApiTestCase[] = [
  // ═══════════════════════════════════════════
  // A. 광진구 조례 철저 검증 (10개)
  // ═══════════════════════════════════════════
  {
    query: '광진구 복무',
    description: '광진구 복무 → 광진구 조례만, 다른 지자체 조례 없음',
    checks: [
      { type: 'ordinanceOnlyFrom', gov: '광진구' },
      { type: 'noOrdinanceFrom', gov: '가평' },
      { type: 'noOrdinanceFrom', gov: '강남' },
      { type: 'ordinanceBeforeLaw' },
    ]
  },
  {
    query: '광진구 주차',
    description: '광진구 주차 → 광진구 주차 조례만',
    checks: [
      { type: 'ordinanceOnlyFrom', gov: '광진구' },
      { type: 'topIsOrdinance' },
      { type: 'topNContain', n: 3, keyword: '주차' },
    ]
  },
  {
    query: '광진구 건축',
    description: '광진구 건축 → 광진구 건축 조례만',
    checks: [
      { type: 'ordinanceOnlyFrom', gov: '광진구' },
      { type: 'topIsOrdinance' },
    ]
  },
  {
    query: '광진구 조례',
    description: '광진구 조례 → 광진구 조례 리스트',
    checks: [
      { type: 'ordinanceOnlyFrom', gov: '광진구' },
      { type: 'minResults', count: 5 },
    ]
  },
  {
    query: '광진구 환경',
    description: '광진구 환경 → 광진구 환경 조례',
    checks: [
      { type: 'ordinanceOnlyFrom', gov: '광진구' },
    ]
  },
  {
    query: '광진구 복지',
    description: '광진구 복지 조례',
    checks: [
      { type: 'ordinanceOnlyFrom', gov: '광진구' },
    ]
  },
  {
    query: '광진구 청소년',
    description: '광진구 청소년 조례',
    checks: [
      { type: 'ordinanceOnlyFrom', gov: '광진구' },
    ]
  },
  {
    query: '광진구 교육',
    description: '광진구 교육 조례',
    checks: [
      { type: 'ordinanceOnlyFrom', gov: '광진구' },
    ]
  },
  {
    query: '광진구 공무원',
    description: '광진구 공무원 → 광진구 공무원 관련 조례',
    checks: [
      { type: 'ordinanceOnlyFrom', gov: '광진구' },
    ]
  },
  {
    query: '서울특별시 광진구 조례',
    description: '정식명칭 → 광진구 조례',
    checks: [
      { type: 'ordinanceOnlyFrom', gov: '광진구' },
      { type: 'minResults', count: 3 },
    ]
  },

  // ═══════════════════════════════════════════
  // B. 다른 서울 구 필터링 크로스체크 (5개)
  // ═══════════════════════════════════════════
  {
    query: '강남구 주차',
    description: '강남구 주차 → 강남구만, 광진구 없음',
    checks: [
      { type: 'ordinanceOnlyFrom', gov: '강남구' },
      { type: 'noOrdinanceFrom', gov: '광진' },
      { type: 'topIsOrdinance' },
    ]
  },
  {
    query: '마포구 건축',
    description: '마포구 건축 → 마포구만',
    checks: [
      { type: 'ordinanceOnlyFrom', gov: '마포구' },
    ]
  },
  {
    query: '송파구 복지',
    description: '송파구 복지 → 송파구만',
    checks: [
      { type: 'ordinanceOnlyFrom', gov: '송파구' },
    ]
  },
  {
    query: '영등포구 환경',
    description: '영등포구 환경 → 영등포구만',
    checks: [
      { type: 'ordinanceOnlyFrom', gov: '영등포구' },
    ]
  },
  {
    query: '서초구 주차',
    description: '서초구 주차 → 서초구만',
    checks: [
      { type: 'ordinanceOnlyFrom', gov: '서초구' },
    ]
  },

  // ═══════════════════════════════════════════
  // C. 경기도/광역시 지자체 (5개)
  // ═══════════════════════════════════════════
  {
    query: '수원시 건축',
    description: '수원시 건축 → 수원시만',
    checks: [
      { type: 'ordinanceOnlyFrom', gov: '수원시' },
    ]
  },
  {
    query: '용인시 주차',
    description: '용인시 주차 → 용인시만',
    checks: [
      { type: 'ordinanceOnlyFrom', gov: '용인시' },
    ]
  },
  {
    query: '해운대구 관광',
    description: '해운대구 관광 → 해운대구만',
    checks: [
      { type: 'ordinanceOnlyFrom', gov: '해운대구' },
    ]
  },
  {
    query: '부산 건축 조례',
    description: '부산 건축 조례',
    checks: [
      { type: 'ordinanceOnlyFrom', gov: '부산' },
      { type: 'topIsOrdinance' },
    ]
  },
  {
    query: '경기도 주차장 조례',
    description: '경기도 주차장 조례',
    checks: [
      { type: 'ordinanceOnlyFrom', gov: '경기' },
    ]
  },

  // ═══════════════════════════════════════════
  // D. 법령 검색 — 법령이 최상위 (10개)
  // ═══════════════════════════════════════════
  {
    query: '관세법',
    description: '관세법 → 법령 최상위',
    checks: [
      { type: 'topIsLaw' },
      { type: 'containsExact', text: '관세법' },
      { type: 'containsExact', text: '관세법 시행령' },
    ]
  },
  {
    query: '민법',
    description: '민법 → 법령',
    checks: [
      { type: 'topIsLaw' },
      { type: 'containsExact', text: '민법' },
    ]
  },
  {
    query: '국가공무원법',
    description: '국가공무원법',
    checks: [
      { type: 'topIsLaw' },
      { type: 'containsExact', text: '국가공무원법' },
    ]
  },
  {
    query: '소득세법',
    description: '소득세법',
    checks: [
      { type: 'topIsLaw' },
      { type: 'containsExact', text: '소득세법' },
    ]
  },
  {
    query: '근로기준법',
    description: '근로기준법',
    checks: [
      { type: 'topIsLaw' },
      { type: 'containsExact', text: '근로기준법' },
    ]
  },
  {
    query: '건축법',
    description: '건축법',
    checks: [
      { type: 'topIsLaw' },
      { type: 'containsExact', text: '건축법' },
    ]
  },
  {
    query: '도로교통법',
    description: '도로교통법',
    checks: [
      { type: 'topIsLaw' },
      { type: 'containsExact', text: '도로교통법' },
    ]
  },
  {
    query: '관세법 시행령',
    description: '관세법 시행령 → 시행령 최상위',
    checks: [
      { type: 'topNContain', n: 1, keyword: '시행령' },
    ]
  },
  {
    query: '관세법 38조',
    description: '관세법 38조 → 조문 추천',
    checks: [
      { type: 'topNContain', n: 1, keyword: '제38조' },
    ]
  },
  {
    query: '헌법',
    description: '헌법',
    checks: [
      { type: 'topIsLaw' },
    ]
  },

  // ═══════════════════════════════════════════
  // E. AI 질문 추천 (5개)
  // ═══════════════════════════════════════════
  {
    query: '관세 환급 요건은?',
    description: 'AI 질문 → AI 타입',
    checks: [
      { type: 'hasType', expectedType: 'ai' },
    ]
  },
  {
    query: '공무원 징계 절차는?',
    description: 'AI 징계 질문',
    checks: [
      { type: 'hasType', expectedType: 'ai' },
    ]
  },
  {
    query: '면제 대상은 누구인가요?',
    description: 'AI 면제 질문',
    checks: [
      { type: 'hasType', expectedType: 'ai' },
    ]
  },
  {
    query: '수입통관 시 필요한 서류',
    description: 'AI 수입통관',
    checks: [
      { type: 'hasType', expectedType: 'ai' },
    ]
  },
  {
    query: '퇴직금 계산 방법',
    description: 'AI 퇴직금',
    checks: [
      { type: 'hasType', expectedType: 'ai' },
    ]
  },

  // ═══════════════════════════════════════════
  // F. 판례 패턴 (3개)
  // ═══════════════════════════════════════════
  // NOTE: 자동완성(search-suggest)은 판례 API를 직접 호출하지 않음
  // 판례 번호는 분류기에서 감지 → submit 시 판례 검색으로 라우팅
  // 따라서 suggest에서는 precedent 타입이 나오는 것(법원명+번호 매칭)만 체크
  {
    query: '대법원 2023도1234',
    description: '대법원 판례번호 → suggest에 precedent 표시',
    checks: [
      { type: 'hasType', expectedType: 'precedent' },
      { type: 'topNType', n: 1, expectedType: 'precedent' },
    ]
  },
  {
    query: '2024다56789',
    description: '사건번호만 → suggest는 AI만 (판례 API 미호출)',
    checks: [
      { type: 'hasType', expectedType: 'ai' },  // AI 질문 추천만 나옴
    ]
  },
  {
    query: '대법원 판결',
    description: '대법원 판결 → suggest는 AI (판례 API 미호출)',
    checks: [
      { type: 'hasType', expectedType: 'ai' },
    ]
  },

  // ═══════════════════════════════════════════
  // G. 공무원 실전 쿼리 (10개)
  // ═══════════════════════════════════════════
  {
    query: '국가공무원 복무규정',
    description: '복무규정 → 법령',
    checks: [
      { type: 'topIsLaw' },
      { type: 'topNContain', n: 2, keyword: '복무' },
    ]
  },
  {
    query: '공무원 보수규정',
    description: '보수규정 → 법령',
    checks: [
      { type: 'topIsLaw' },
    ]
  },
  {
    query: '공무원 징계령',
    description: '징계령 → 법령',
    checks: [
      { type: 'topIsLaw' },
    ]
  },
  {
    query: '공무원연금법',
    description: '연금법 → 법령',
    checks: [
      { type: 'topIsLaw' },
      { type: 'containsExact', text: '공무원연금법' },
    ]
  },
  {
    query: '공무원 연가 일수는?',
    description: 'AI 연가 질문',
    checks: [
      { type: 'hasType', expectedType: 'ai' },
    ]
  },
  {
    query: '공무원 병가 일수는?',
    description: 'AI 병가 질문',
    checks: [
      { type: 'hasType', expectedType: 'ai' },
    ]
  },
  {
    query: '겸직 허가 가능한가요',
    description: 'AI 겸직 질문',
    checks: [
      { type: 'hasType', expectedType: 'ai' },
    ]
  },
  {
    query: '광진구 공무원 복무 조례',
    description: '광진구 공무원 복무 조례',
    checks: [
      { type: 'ordinanceOnlyFrom', gov: '광진구' },
      { type: 'topIsOrdinance' },
      { type: 'topNContain', n: 2, keyword: '복무' },
    ]
  },
  {
    query: '강남구 공무원 수당 조례',
    description: '강남구 수당 조례',
    checks: [
      { type: 'ordinanceOnlyFrom', gov: '강남구' },
    ]
  },
  {
    query: '수원시 공무원 교육훈련 조례',
    description: '수원시 교육훈련 조례',
    checks: [
      { type: 'ordinanceOnlyFrom', gov: '수원시' },
    ]
  },

  // ═══════════════════════════════════════════
  // H. Edge case: 짧은/빈 쿼리 (3개)
  // ═══════════════════════════════════════════
  {
    query: '법',
    description: '1글자 → 결과 있어도 됨',
    checks: [
      { type: 'minResults', count: 0 },
    ]
  },
  {
    query: '관',
    description: '1글자 → 최소 결과',
    checks: [
      { type: 'minResults', count: 0 },
    ]
  },
  {
    query: '조례',
    description: '조례 키워드만 → 결과 있어야',
    checks: [
      { type: 'minResults', count: 1 },
    ]
  },

  // ═══════════════════════════════════════════
  // I. 혼합 검증: 지자체 없는 조례 키워드 (3개)
  // ═══════════════════════════════════════════
  {
    query: '주차장 조례',
    description: '지자체 없는 조례 → 전국 조례',
    checks: [
      { type: 'minResults', count: 3 },
    ]
  },
  {
    query: '건축 조례',
    description: '지자체 없는 건축 조례',
    checks: [
      { type: 'minResults', count: 3 },
    ]
  },
  {
    query: '환경 조례',
    description: '지자체 없는 환경 조례',
    checks: [
      { type: 'minResults', count: 1 },
    ]
  },
]

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

const LAW_CATEGORIES = new Set(['법률', '대통령령', '총리령', '부령', '법령'])

function isOrdinanceSuggestion(s: Suggestion): boolean {
  return !LAW_CATEGORIES.has(s.category) &&
    (s.category === '조례' || s.category === '자치조례' || s.category === '자치규칙' ||
     /조례/.test(s.text))
}

function isLawSuggestion(s: Suggestion): boolean {
  return s.type === 'law' && LAW_CATEGORIES.has(s.category)
}

// ═══════════════════════════════════════════════════════════════════════
// Runner
// ═══════════════════════════════════════════════════════════════════════

async function runCheck(suggestions: Suggestion[], check: Check): Promise<string | null> {
  const ordinSuggestions = suggestions.filter(isOrdinanceSuggestion)
  const lawSuggestions = suggestions.filter(isLawSuggestion)

  switch (check.type) {
    case 'ordinanceOnlyFrom': {
      if (ordinSuggestions.length === 0) return null // 조례 결과 없으면 패스 (API가 결과 안 줄 수도)
      const wrong = ordinSuggestions.filter(s => !s.text.includes(check.gov))
      if (wrong.length > 0) return `다른 지자체 조례: [${wrong.map(s => s.text).slice(0, 2).join(', ')}]`
      return null
    }
    case 'noOrdinanceFrom': {
      const has = ordinSuggestions.filter(s => s.text.includes(check.gov))
      if (has.length > 0) return `${check.gov} 조례 포함됨: ${has[0].text}`
      return null
    }
    case 'topNContain': {
      const top = suggestions.slice(0, check.n)
      const has = top.some(s => s.text.includes(check.keyword))
      if (!has) return `상위 ${check.n}개에 "${check.keyword}" 없음: [${top.map(s => s.text).join(', ')}]`
      return null
    }
    case 'topNType': {
      const top = suggestions.slice(0, check.n)
      const has = top.some(s => s.type === check.expectedType)
      if (!has) return `상위 ${check.n}개에 type="${check.expectedType}" 없음`
      return null
    }
    case 'hasType': {
      const has = suggestions.some(s => s.type === check.expectedType)
      if (!has) return `type="${check.expectedType}" 결과 없음`
      return null
    }
    case 'noType': {
      const has = suggestions.some(s => s.type === check.expectedType)
      if (has) return `type="${check.expectedType}" 결과가 있으면 안 됨`
      return null
    }
    case 'minResults': {
      if (suggestions.length < check.count) return `결과 ${suggestions.length}개 < 최소 ${check.count}개`
      return null
    }
    case 'topIsOrdinance': {
      if (suggestions.length === 0) return null
      if (!isOrdinanceSuggestion(suggestions[0])) return `1위가 조례 아님: ${suggestions[0].text} (${suggestions[0].category})`
      return null
    }
    case 'topIsLaw': {
      if (suggestions.length === 0) return '결과 없음'
      if (!isLawSuggestion(suggestions[0])) return `1위가 법령 아님: ${suggestions[0].text} (${suggestions[0].category})`
      return null
    }
    case 'ordinanceBeforeLaw': {
      const firstOrdin = suggestions.findIndex(isOrdinanceSuggestion)
      const firstLaw = suggestions.findIndex(isLawSuggestion)
      if (firstOrdin >= 0 && firstLaw >= 0 && firstOrdin > firstLaw) {
        return `법령(${firstLaw})이 조례(${firstOrdin})보다 앞에 옴`
      }
      return null
    }
    case 'containsExact': {
      const has = suggestions.some(s => s.text === check.text)
      if (!has) return `"${check.text}" 정확 매칭 없음`
      return null
    }
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════')
  console.log(' 자동완성 API 대규모 실제 호출 테스트')
  console.log(`═══════════════════════════════════════════════════════`)
  console.log(`테스트 수: ${TESTS.length}개\n`)

  // Wait for server
  let serverReady = false
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`${BASE}?q=test`, { signal: AbortSignal.timeout(2000) })
      if (r.ok) { serverReady = true; break }
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 1000))
  }

  if (!serverReady) {
    console.log('ERROR: dev 서버 미실행. npm run dev 먼저 실행 필요.')
    process.exit(1)
  }

  console.log('서버 연결 확인 완료.\n')

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

  let passed = 0
  let failed = 0
  const failures: string[] = []
  const categoryStats: Record<string, { passed: number; total: number }> = {}

  for (const tc of TESTS) {
    // 법제처 API rate limit 방지: 요청 간 500ms 딜레이
    await delay(500)
    const cat = tc.query.includes('광진구') ? 'A.광진구' :
      /강남구|마포구|송파구|영등포구|서초구/.test(tc.query) ? 'B.서울구' :
      /수원시|용인시|해운대구|부산|경기도/.test(tc.query) ? 'C.지방' :
      /대법원|\d{4}[도다나]/.test(tc.query) ? 'F.판례' :
      /은\?|요\?|나요|인가요|방법|절차/.test(tc.query) ? 'E.AI' :
      tc.query.length <= 2 ? 'H.Edge' :
      /조례/.test(tc.query) && !/광진|강남|마포|송파|영등포|서초|수원|용인|해운대|부산|경기/.test(tc.query) ? 'I.조례일반' :
      'D.법령'

    if (!categoryStats[cat]) categoryStats[cat] = { passed: 0, total: 0 }
    categoryStats[cat].total++

    try {
      let suggestions: Suggestion[] = []
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(`${BASE}?q=${encodeURIComponent(tc.query)}`, {
          signal: AbortSignal.timeout(10000)
        })
        const data = await res.json() as { suggestions?: Suggestion[]; error?: string; retryAfter?: number }
        if (data.error === 'Too Many Requests') {
          const wait = (data.retryAfter || 3) * 1000 + 500
          console.log(`    (rate limited, waiting ${wait}ms...)`)
          await delay(wait)
          continue
        }
        suggestions = data.suggestions || []
        break
      }

      const errors: string[] = []
      for (const check of tc.checks) {
        const err = await runCheck(suggestions, check)
        if (err) errors.push(err)
      }

      if (errors.length === 0) {
        passed++
        categoryStats[cat].passed++
        const preview = suggestions.slice(0, 2).map(s => `${s.category}:${s.text.slice(0, 20)}`).join(' | ')
        console.log(`  OK "${tc.query}" → [${suggestions.length}] ${preview}`)
      } else {
        failed++
        failures.push(`  FAIL "${tc.query}" (${tc.description})`)
        errors.forEach(e => failures.push(`    - ${e}`))
        const preview = suggestions.slice(0, 3).map(s => `${s.category}:${s.text.slice(0, 25)}`).join(' | ')
        failures.push(`    결과: [${suggestions.length}] ${preview}`)
      }
    } catch (err) {
      failed++
      failures.push(`  FAIL "${tc.query}" — API 에러: ${err}`)
    }
  }

  // Summary
  console.log('')
  if (failures.length > 0) {
    console.log('━━━ FAILURES ━━━\n')
    failures.forEach(f => console.log(f))
    console.log('')
  }

  console.log('━━━ 카테고리별 ━━━')
  const sortedCats = Object.entries(categoryStats).sort((a, b) => a[0].localeCompare(b[0]))
  for (const [cat, stats] of sortedCats) {
    const icon = stats.passed === stats.total ? 'OK' : 'NG'
    console.log(`  [${icon}] ${cat}: ${stats.passed}/${stats.total}`)
  }

  console.log('')
  console.log('═══════════════════════════════════════════════════════')
  console.log(` FINAL: ${passed}/${TESTS.length} passed (${failed} failed)`)
  console.log(` Pass rate: ${((passed / TESTS.length) * 100).toFixed(1)}%`)
  console.log('═══════════════════════════════════════════════════════')

  if (failed > 0) process.exit(1)
}

main()
