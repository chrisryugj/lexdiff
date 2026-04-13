/**
 * Fast Path — 단순 질문 바이패스
 *
 * 복잡한 키워드 없이 패턴이 명확한 질문은
 * LLM 멀티턴 없이 직접 API 호출로 처리.
 *
 * 지원 패턴:
 * 1. 법명+조문번호 → search_law + get_batch_articles
 * 2. 판례 검색 → search_decisions(domain=precedent) (직접)
 * 3. 해석례 검색 → search_decisions(domain=interpretation) (직접)
 * 4. 행정규칙 검색 → search_admin_rule (직접)
 * 5. 별표 조회 → search_law + get_annexes
 */

// ─── KNOWN_MST 런타임 캐시 ───
// search_law 호출 결과에서 자동 축적 (cacheMSTEntries).
// 서버 프로세스 수명 동안 유지. 첫 호출 시에는 비어있어 search_law 먼저 돌음.
//
// ⚠️ 프리로드 제거 (2026-04-14):
//   - 법제처에서 MST 값이 개정마다 변경되어 하드코딩된 프리로드는 시간 지나면 stale.
//   - stale MST → get_batch_articles 실패("법령 데이터를 찾을 수 없습니다") → 에러 복구 낭비.
//   - 런타임 cacheMSTEntries 만으로도 동일 프로세스 내 재호출 hit rate 충분.
export const KNOWN_MST = new Map<string, string>()
const KNOWN_MST_MAX = 5000

// ─── 타입 ───

export interface LawEntry { name: string; mst: string }

export type FastPathType = 'article_hit' | 'article_resolve' | 'precedent_search' | 'interpretation_search' | 'admin_rule_search' | 'ordinance_search' | 'annex_resolve' | 'term_search' | 'law_system' | 'none'

interface FastPathDetection {
  type: FastPathType
  lawName?: string
  articles?: string[]
  mst?: string
  /** 판례/해석례/행정규칙 검색 시 사용할 키워드 */
  searchQuery?: string
  /** 도구 이름 (precedent_search 등에서 사용) */
  toolName?: string
  /** 도구 실행 시 넘길 인자 (unified-decisions 의 domain 등) */
  toolArgs?: Record<string, unknown>
}

interface OrdinEntry { seq: string; name: string }

// ─── KNOWN_MST 캐시 관리 ───

/** search_law 결과를 KNOWN_MST에 저장 (LRU: 접근 시 재삽입으로 최신화) */
export function cacheMSTEntries(entries: LawEntry[]) {
  for (const e of entries) {
    if (e.name && e.mst) {
      // LRU: 이미 있으면 삭제 후 재삽입 (Map 순서가 최신으로 이동)
      if (KNOWN_MST.has(e.name)) KNOWN_MST.delete(e.name)
      if (KNOWN_MST.size >= KNOWN_MST_MAX) {
        // 가장 오래 접근 안 된 엔트리 제거
        const firstKey = KNOWN_MST.keys().next().value
        if (firstKey) KNOWN_MST.delete(firstKey)
      }
      KNOWN_MST.set(e.name, e.mst)
    }
  }
}

// ─── Fast Path 감지 ───

/**
 * 패턴 매칭으로 Fast Path 감지.
 * 단순 패턴이면 LLM 없이 직접 도구 호출.
 */
export function detectFastPath(query: string): FastPathDetection {
  // 100자 초과면 복잡 질문으로 간주
  if (query.length > 100) return { type: 'none' }

  // ── 패턴 1: 판례 검색 ("OO 판례", "OO 판결") ──
  const precedentMatch = query.match(/^(.+?)(?:\s+(?:판례|판결|사례))(?:\s*(?:검색|찾아|알려|보여))?[\s?]*$/)
  if (precedentMatch && !/비교|분석|요약/.test(query)) {
    const q = precedentMatch[1].trim()
    return {
      type: 'precedent_search',
      searchQuery: q,
      toolName: 'search_decisions',
      toolArgs: { domain: 'precedent', query: q },
    }
  }

  // ── 패턴 2: 해석례 검색 ("OO 해석례", "OO 유권해석") ──
  const interpMatch = query.match(/^(.+?)(?:\s+(?:해석례|유권해석|질의회신))(?:\s*(?:검색|찾아|알려|보여))?[\s?]*$/)
  if (interpMatch && !/비교|분석/.test(query)) {
    const q = interpMatch[1].trim()
    return {
      type: 'interpretation_search',
      searchQuery: q,
      toolName: 'search_decisions',
      toolArgs: { domain: 'interpretation', query: q },
    }
  }

  // ── 패턴 3: 행정규칙 검색 ("OO 훈령/예규/고시") ──
  const adminRuleMatch = query.match(/^(.+?)(?:\s+(?:훈령|예규|고시|행정규칙))(?:\s*(?:검색|찾아|알려|보여))?[\s?]*$/)
  if (adminRuleMatch && !/비교|분석/.test(query)) {
    const q = adminRuleMatch[1].trim()
    return {
      type: 'admin_rule_search',
      searchQuery: q,
      toolName: 'search_admin_rule',
      toolArgs: { query: q },
    }
  }

  // ── 패턴 3.5: 조례/자치법규 검색 ("광진구 복무조례", "서울시 OO조례") ──
  // 복잡 키워드(비교/분석/개정/판례/해석례/신구/대조/처벌/벌칙/과태료) 없고 "조례" 또는 "자치법규" 포함이면 직결
  if (/(?:조례|자치법규)/.test(query) && !/(?:비교|분석|개정|판례|해석례|신구|대조|처벌|벌칙|과태료|벌금)/.test(query)) {
    const searchQuery = query
      .replace(/(?:에\s*대해|에\s*대한|알려줘|알려|궁금|설명해|설명|찾아줘|찾아|보여줘|보여|검색해|검색|내용|전반|주요|이란|란\??|요약|정리)/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (searchQuery.length >= 2) {
      return {
        type: 'ordinance_search',
        searchQuery,
        toolName: 'search_ordinance',
        toolArgs: { query: searchQuery },
      }
    }
  }

  // ── 패턴 4: 별표 조회 ("OO법 별표 N") ──
  const annexMatch = query.match(/^(.+?(?:법|령|규칙))\s+별표\s*(\d+)?/)
  if (annexMatch && !/비교|분석|개정/.test(query)) {
    const lawName = annexMatch[1].trim()
    const mst = KNOWN_MST.get(lawName)
    if (mst) {
      return { type: 'annex_resolve', lawName, mst, searchQuery: `${lawName} 별표${annexMatch[2] || ''}` }
    }
    return { type: 'annex_resolve', lawName, searchQuery: `${lawName} 별표${annexMatch[2] || ''}` }
  }

  // ── 패턴 5: 용어 정의 ("XX란?", "XX 뜻") ──
  const termMatch = query.match(/^(.{2,20})(?:이란|란|의\s*(?:뜻|의미|개념|정의))[\s?]*$/)
  if (termMatch && !/법|령|조례|규칙/.test(termMatch[1])) {
    return { type: 'term_search', searchQuery: termMatch[1].trim(), toolName: 'search_legal_terms' }
  }

  // ── 패턴 6: 법체계/위임법령 조회 ──
  const lawSystemMatch = query.match(/^(.+?법)\s*(?:시행령|시행규칙|하위법령|법체계|위임법령|3단비교)[\s?]*$/)
  if (lawSystemMatch && !/비교|개정|판례/.test(query)) {
    return { type: 'law_system', lawName: lawSystemMatch[1].trim(), searchQuery: lawSystemMatch[1].trim(), toolName: 'chain_law_system' }
  }

  // ── 패턴 8: 법명+조문번호 ──
  // 복잡한 키워드가 있으면 full pipeline으로
  // (조례/자치법규는 위 패턴 3.5에서 선처리되므로 여기서 차단할 필요 없음)
  if (/(?:비교|판례|해석례|개정|위임|시행령|시행규칙|신구|대조|이력|처벌|벌칙|과태료|면제|감면|특례|예외)/.test(query)) {
    return { type: 'none' }
  }

  // 법명 추출: 「법명」 > ~법 패턴
  const lawNameMatch = query.match(/「([^」]+)」/) || query.match(/([\w가-힣]+(?:법|령|규칙))(?:\s|$|의|에|을|를|이|가|은|는)/)
  if (!lawNameMatch) return { type: 'none' }
  const lawName = lawNameMatch[1].trim()

  // 조문번호 추출
  const articleMatches = Array.from(query.matchAll(/제?\s*(\d+)\s*조(?:의\s*(\d+))?/g))
  if (articleMatches.length === 0) return { type: 'none' }

  const mainArticles = articleMatches.map(m => m[2] ? `제${m[1]}조의${m[2]}` : `제${m[1]}조`)

  // ── 조문 자동 확장 (Bridge 역이식) ──
  const articles = new Set(mainArticles)
  for (const m of articleMatches) {
    if (!m[2]) {
      articles.add(`제${m[1]}조의2`)
      articles.add(`제${m[1]}조의3`)
    }
  }
  articles.add('제2조') // 정의 조문

  const expandedArticles = Array.from(articles)

  // KNOWN_MST 조회
  const mst = KNOWN_MST.get(lawName)
  if (mst) {
    return { type: 'article_hit', lawName, articles: expandedArticles, mst }
  }
  return { type: 'article_resolve', lawName, articles: expandedArticles }
}

// ─── search_law 결과 파싱 유틸 ───

/** search_law 결과 텍스트에서 법령명-MST 쌍 추출 (압축/원본 양쪽 대응) */
export function parseLawEntries(text: string): LawEntry[] {
  const entries: LawEntry[] = []
  const regex = /\d+\.\s+(.+?)\s*(?:\(MST:(\d+),\s*\S+\)|\n\s+- 법령ID:.+\n\s+- MST:\s*(\d+))/g
  let m
  while ((m = regex.exec(text)) !== null) {
    entries.push({ name: m[1].trim(), mst: m[2] || m[3] })
  }
  return entries
}

/** 검색 결과에서 질문에 가장 맞는 법령의 MST 찾기 */
export function findBestMST(entries: LawEntry[], query: string): string | null {
  if (entries.length === 0) return null

  // 1. 「법령명」 또는 ~법 패턴으로 정확 매칭
  const nameMatch = query.match(/「([^」]+)」/) || query.match(/([\w가-힣]+법)/)
  const target = nameMatch?.[1]
  if (target) {
    const exact = entries.find(e => e.name === target)
    if (exact) return exact.mst
    const prefixed = entries
      .filter(e => e.name.startsWith(target))
      .sort((a, b) => a.name.length - b.name.length)
    if (prefixed.length > 0) return prefixed[0].mst
  }

  // 2. 자연어 질문: 키워드 매칭 점수로 선택
  if (entries.length > 1) {
    const cleaned = query.replace(/(?:법|에\s*대해|알려줘|궁금|설명|관련|조문|내용)/g, '').trim()
    const keywords = cleaned.split(/\s+/).filter(w => w.length >= 2)
    if (keywords.length > 0) {
      const scored = entries.map(e => {
        let score = 0
        for (const kw of keywords) {
          if (e.name.includes(kw)) score += kw.length
        }
        return { ...e, score }
      }).sort((a, b) => b.score - a.score)
      if (scored[0].score > 0) return scored[0].mst
    }
  }

  return entries[0].mst
}

// ─── 조례 검색 결과 파싱 유틸 ───

/** search_ordinance 결과에서 [일련번호] 자치법규명 쌍 추출 */
function parseOrdinEntries(text: string): OrdinEntry[] {
  const entries: OrdinEntry[] = []
  const regex = /\[(\d+)\]\s+(.+)/g
  let m
  while ((m = regex.exec(text)) !== null) {
    entries.push({ seq: m[1], name: m[2].trim() })
  }
  return entries
}

/** 조례 검색 결과에서 쿼리에 가장 맞는 자치법규 일련번호 찾기 */
export function findBestOrdinanceSeq(text: string, query: string): string | null {
  const entries = parseOrdinEntries(text)
  if (entries.length === 0) return null
  if (entries.length === 1) return entries[0].seq

  // 쿼리에서 핵심 키워드 추출 (조례/규칙/에 대해/알려줘 등 제거)
  const cleaned = query.replace(/(?:조례|규칙|에\s*대해|알려줘|궁금|설명|관련|내용|전반|주요)/g, '').trim()
  const keywords = cleaned.split(/\s+/).filter(w => w.length >= 2)

  // 키워드 매칭: matchCount(매칭된 키워드 수) 우선, 동점이면 totalScore(길이합) 순
  const scored = entries.map(e => {
    let matchCount = 0
    let totalScore = 0
    for (const kw of keywords) {
      if (e.name.includes(kw)) {
        matchCount++
        totalScore += kw.length
      }
    }
    // 이름 길이가 짧을수록 정확 매칭 가능성 높음 (보너스)
    const brevityBonus = 100 - Math.min(e.name.length, 100)
    return { ...e, matchCount, totalScore, brevityBonus }
  }).sort((a, b) =>
    b.matchCount - a.matchCount ||
    b.totalScore - a.totalScore ||
    b.brevityBonus - a.brevityBonus
  )

  return scored[0].seq
}
