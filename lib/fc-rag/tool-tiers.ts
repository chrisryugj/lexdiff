// Tier 0: Always loaded (7 tools) — every query
// 판례/해석례는 search_decisions(domain) 로 통합 — LLM이 domain 지정으로 접근
export const TIER_0 = [
  'search_ai_law', 'search_law', 'get_law_text',
  'get_batch_articles', 'get_article_detail',
  'search_decisions', 'get_decision_text',
  'get_annexes',
] as const

// Tier 1: Domain-activated — based on query classification
// search_decisions/get_decision_text 는 TIER_0 에 이미 있으므로 각 도메인은 chain + 보조 도구만 지정
export const TIER_1: Record<string, readonly string[]> = {
  tax: ['chain_law_system', 'chain_dispute_prep', 'chain_procedure_detail'],
  customs: ['chain_law_system', 'chain_action_basis', 'chain_procedure_detail'],
  labor: ['chain_law_system', 'chain_dispute_prep', 'chain_full_research'],
  privacy: ['chain_law_system', 'chain_dispute_prep', 'chain_full_research'],
  competition: [],
  constitutional: [],
  admin: ['search_admin_rule', 'get_admin_rule'],
  public_servant: ['search_admin_rule', 'get_admin_rule', 'get_annexes', 'search_ordinance', 'get_ordinance'],
  housing: ['search_ordinance', 'get_ordinance', 'chain_ordinance_compare', 'chain_action_basis', 'chain_procedure_detail'],
  environment: ['search_ordinance', 'search_admin_rule', 'chain_law_system', 'chain_action_basis', 'chain_amendment_track'],
  construction: ['search_admin_rule', 'get_three_tier', 'chain_ordinance_compare', 'chain_action_basis', 'chain_procedure_detail'],
  civil_service: ['search_ordinance', 'get_ordinance'],
  medical: ['chain_law_system', 'chain_full_research', 'chain_procedure_detail'],
  education: ['chain_law_system', 'chain_full_research', 'chain_procedure_detail'],
  finance: ['chain_law_system', 'chain_full_research', 'chain_dispute_prep'],
  military: ['chain_law_system', 'chain_full_research', 'chain_procedure_detail'],
}

// Tier 2: Context-activated (12 tools) — structural/historical/comparison needs
export const TIER_2: Record<string, readonly string[]> = {
  structural: ['get_three_tier', 'get_law_tree', 'get_law_system_tree', 'get_external_links'],
  historical: ['get_article_history', 'get_law_history', 'compare_old_new', 'get_historical_law', 'search_historical_law'],
  ordinance: ['search_ordinance', 'get_ordinance'],
  annex: ['get_annexes'],
}

// Tier 3: On-demand (remaining tools) — special requests only
export const TIER_3 = [
  'search_legal_terms', 'get_legal_term_detail', 'get_legal_term_kb',
  'find_similar_precedents', 'advanced_search', 'suggest_law_names',
  'get_daily_term', 'get_daily_to_legal', 'get_legal_to_daily',
  'get_term_articles', 'get_related_laws', 'get_law_statistics',
  'parse_article_links', 'parse_jo_code',
  'compare_articles', 'summarize_precedent',
  'extract_precedent_keywords',
] as const

// Domain detection for query classification
export type LegalDomain = 'tax' | 'customs' | 'labor' | 'privacy' | 'competition' |
  'constitutional' | 'admin' | 'public_servant' | 'housing' | 'environment' |
  'construction' | 'civil_service' | 'medical' | 'education' | 'finance' | 'military' | 'general'

export function detectDomain(query: string): LegalDomain {
  const src = query.toLowerCase()

  // 조례/자치법규 키워드가 있으면 다른 도메인보다 우선
  // (e.g., "광진구 복무조례 휴가" → 조례 검색이 핵심이지 행정규칙이 아님)
  const hasOrdinance = /조례|자치법규/.test(src)
  const hasRegion = /[가-힣]+[시도군구]/.test(src)
  if (hasOrdinance || (hasRegion && /복무|근무|휴가|수당/.test(src) && !/법\s|법률/.test(src))) {
    // 지역+복무/휴가 조합은 조례 질의 (복무조례, 근무조례 등)
    // 단, "지방공무원법" 같이 명시적으로 법률을 지칭하면 제외
    if (hasOrdinance) return 'civil_service'
    if (hasRegion) return 'civil_service'
  }

  if (/관세|수입|수출|통관|hs코드|원산지|fta|보세/.test(src)) return 'customs'
  if (/개인정보|정보주체|개인정보처리자/.test(src)) return 'privacy'
  if (/세금|납세|과세|세율|법인세|소득세|부가가치세/.test(src)) return 'tax'
  // 공무원을 labor보다 먼저 — "공무원 수당", "경찰공무원 휴가" 등이 labor로 오분류되는 것 방지
  if (/공무원|겸직|복무|복무규정|행동강령|자문료|사례금|공직자|징계/.test(src)) return 'public_servant'
  if (/근로|임금|해고|퇴직금|최저임금|산재|산업재해|고용보험|연차/.test(src)) return 'labor'
  // "수당", "휴가"는 공무원/근로 양쪽에 걸림 — 위에서 공무원 우선 매칭 후 여기로 fall-through
  if (/수당|휴가/.test(src) && /근로자|노동|직장|회사|사업장/.test(src)) return 'labor'
  if (/행정|허가|처분|이의신청|행정심판|행정소송|정보공개|민원|계약|보조금|조달|입찰/.test(src)) return 'admin'
  if (/여권|주민등록|인감|가족관계|출생신고|사망신고|혼인신고|운전면허/.test(src)) return 'civil_service'
  if (/주택|임대차|공동주택|아파트|관리비|층간소음|전세|월세/.test(src)) return 'housing'
  if (/건설|시공|도급|건설업|주차장|주차/.test(src)) return 'construction'
  if (/환경|대기|수질|폐기물|오염/.test(src)) return 'environment'
  if (/공정거래|하도급|독점|카르텔|납품단가/.test(src)) return 'competition'
  if (/헌법|기본권|위헌|헌법소원|헌법재판/.test(src)) return 'constitutional'
  if (/의료|의사|병원|환자|진료|약사|약국|의료기기|감염병|응급의료/.test(src)) return 'medical'
  if (/교육|학교|학생|교사|교원|입학|졸업|학교폭력|평생교육/.test(src)) return 'education'
  if (/금융|은행|보험|자본시장|증권|투자|여신|대출|금융소비자/.test(src)) return 'finance'
  if (/병역|군인|군복무|입영|징집|전역|군형법|예비군|사회복무요원/.test(src)) return 'military'
  return 'general'
}

// Context detection for Tier 2 activation
export function detectContextNeeds(query: string): string[] {
  const needs: string[] = []
  if (/위임|시행령|시행규칙|3단|체계/.test(query)) needs.push('structural')
  if (/개정|변경|이력|역사|신구|대조|바뀐/.test(query)) needs.push('historical')
  if (/조례|자치법규|지방/.test(query) || /[가-힣]+[시도군구]\s/.test(query)) needs.push('ordinance')
  if (/별표|서식|부표|급여표|수당표|세율표|가액|금액.?기준|한도|상한|범위표|기준표/.test(query)) needs.push('annex')
  return needs
}

/**
 * Select tools for a given query based on classification.
 * Returns deduplicated tool names, max 25.
 */
export function selectToolsForQuery(query: string): string[] {
  const domain = detectDomain(query)
  const contextNeeds = detectContextNeeds(query)

  const tools = new Set<string>([...TIER_0])

  // Add domain-specific Tier 1 tools (includes chain tools per domain)
  if (domain !== 'general' && TIER_1[domain]) {
    for (const tool of TIER_1[domain]) tools.add(tool)
  }

  // Default tools when no domain matched
  if (domain === 'general') {
    tools.add('search_all')
    tools.add('get_article_with_precedents')
    tools.add('chain_full_research')
    tools.add('chain_procedure_detail')
  }

  // Chain priority boost based on query keywords
  if (/절차|수수료|비용/.test(query)) tools.add('chain_procedure_detail')
  if (/조례|자치법규/.test(query)) tools.add('chain_ordinance_compare')
  if (/개정|바뀐/.test(query)) tools.add('chain_amendment_track')
  if (/심판|소송|불복/.test(query)) tools.add('chain_dispute_prep')

  // Add context-specific Tier 2 tools
  for (const need of contextNeeds) {
    if (TIER_2[need]) {
      for (const tool of TIER_2[need]) tools.add(tool)
    }
  }

  // search_decisions/get_decision_text are already in TIER_0 — always available

  // ── Chain-aware deduplication ──
  // chain 도구가 포함되면, 해당 chain이 내부에서 호출하는 기본 도구를 제거하여
  // LLM이 chain 1회로 처리하도록 유도 (토큰 + 턴 수 절감)
  for (const [chain, covered] of Object.entries(CHAIN_COVERS)) {
    if (tools.has(chain)) {
      for (const basic of covered) {
        // TIER_0 도구는 초기 선택 시점에서는 제거하지 않음 (런타임 중복 방지는 engine.ts에서 처리)
        if (!(TIER_0 as readonly string[]).includes(basic)) {
          tools.delete(basic)
        }
      }
    }
  }

  // Cap at 25
  return Array.from(tools).slice(0, 25)
}

// Chain 도구가 내부에서 커버하는 기본 도구 매핑 (engine.ts 런타임 중복 방지에도 사용).
//
// 🔴 search_decisions 는 의도적으로 제외 — prompts.ts:263-264 의 특수 도메인 규칙
// (precedent/nlrc/pipc/ftc/tax_tribunal/customs/acr/... 는 chain 후에도 반드시 1회 추가
// 호출) 과 충돌해서 chain 후 특수 도메인 결정문 조회가 막히는 품질 문제 발생.
// 대신 gemini-engine.ts 의 callCount 기반 max-call-per-tool 제한으로 중복 차단.
export const CHAIN_COVERS: Record<string, string[]> = {
    chain_full_research: ['search_ai_law'],
    chain_dispute_prep: [],
    chain_action_basis: ['get_three_tier'],
    chain_procedure_detail: ['get_three_tier', 'get_annexes', 'search_ai_law'],
    chain_law_system: ['get_three_tier', 'get_annexes'],
    chain_amendment_track: ['compare_old_new', 'get_article_history'],
    chain_ordinance_compare: ['get_three_tier'],
}

// Display names (unified-decisions 는 displayNameFor() 헬퍼가 도메인별 라벨 생성)
export const TOOL_DISPLAY_NAMES: Record<string, string> = {
  search_ai_law: '지능형 법령 검색',
  search_law: '법령 검색',
  get_law_text: '법령 본문 조회',
  get_batch_articles: '조문 일괄 조회',
  get_article_detail: '조항호목 정밀 조회',
  get_article_with_precedents: '조문+판례 조회',
  search_decisions: '결정문 검색',
  get_decision_text: '결정문 본문 조회',
  get_three_tier: '위임법령 조회',
  compare_old_new: '신구법 대조',
  get_article_history: '조문 이력 조회',
  search_ordinance: '자치법규 검색',
  get_ordinance: '자치법규 조회',
  get_legal_term_kb: '법령용어 검색',
  get_legal_term_detail: '법령용어 상세',
  get_annexes: '별표/서식 조회',
  search_admin_rule: '행정규칙 검색',
  get_admin_rule: '행정규칙 조회',
  search_all: '통합 검색',
  advanced_search: '고급 법령 검색',
  find_similar_precedents: '유사 판례 검색',
  get_law_tree: '법령 체계도 조회',
  get_law_system_tree: '법령 체계 분류 조회',
  get_external_links: '참조 법령 조회',
  get_law_history: '법령 연혁 조회',
  get_historical_law: '과거 법령 조회',
  search_historical_law: '과거 법령 검색',
  get_law_statistics: '법령 통계 조회',
  suggest_law_names: '법령명 자동완성',
  search_legal_terms: '법령용어 검색',
  get_daily_term: '일상용어 검색',
  get_daily_to_legal: '일상→법률 용어 변환',
  get_legal_to_daily: '법률→일상 용어 변환',
  get_term_articles: '용어 관련 조문 조회',
  get_related_laws: '관련 법령 조회',
  parse_article_links: '조문 참조 분석',
  parse_jo_code: '조문번호 변환',
  compare_articles: '조문 비교',
  summarize_precedent: '판례 요약',
  extract_precedent_keywords: '판례 키워드 추출',
  // Chain tools (7)
  chain_law_system: '법체계 파악',
  chain_action_basis: '처분근거 확인',
  chain_dispute_prep: '쟁송 대비',
  chain_amendment_track: '개정 추적',
  chain_ordinance_compare: '조례 비교',
  chain_full_research: '종합 리서치',
  chain_procedure_detail: '절차/비용 안내',
}
