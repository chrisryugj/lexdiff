/**
 * Fast Path — 단순 조문 질문 바이패스
 *
 * 복잡한 키워드 없이 법명+조문번호가 명확한 질문은
 * Gemini 멀티턴 없이 직접 API 호출로 처리.
 */

// ─── KNOWN_MST 런타임 캐시 ───
// search_law 호출 결과에서 자동 축적. 서버 프로세스 수명 동안 유지.
export const KNOWN_MST = new Map<string, string>()
const KNOWN_MST_MAX = 5000

// ─── 타입 ───

export interface LawEntry { name: string; mst: string }

interface FastPathDetection {
  type: 'hit' | 'resolve' | 'none'
  lawName?: string
  articles?: string[]
  mst?: string
}

interface OrdinEntry { seq: string; name: string }

// ─── KNOWN_MST 캐시 관리 ───

/** search_law 결과를 KNOWN_MST에 저장 */
export function cacheMSTEntries(entries: LawEntry[]) {
  for (const e of entries) {
    if (e.name && e.mst) {
      if (KNOWN_MST.size >= KNOWN_MST_MAX) {
        // FIFO: 가장 오래된 엔트리 제거
        const firstKey = KNOWN_MST.keys().next().value
        if (firstKey) KNOWN_MST.delete(firstKey)
      }
      KNOWN_MST.set(e.name, e.mst)
    }
  }
}

// ─── Fast Path 감지 ───

/** 복잡한 키워드가 없고 법명+조문번호가 명확한 단순 질문인지 판단 */
export function detectFastPath(query: string): FastPathDetection {
  // 복잡한 질문은 full pipeline으로
  if (/(?:비교|판례|해석례|개정|위임|시행령|시행규칙|신구|대조|이력|조례|자치법규|처벌|벌칙|과태료|면제|감면|특례|예외)/.test(query)) {
    return { type: 'none' }
  }
  // 100자 초과면 복잡 질문으로 간주 (inferComplexity의 기준과 통일)
  if (query.length > 100) return { type: 'none' }

  // 법명 추출: 「법명」 > ~법 패턴
  const lawNameMatch = query.match(/「([^」]+)」/) || query.match(/([\w가-힣]+(?:법|령|규칙))(?:\s|$|의|에|을|를|이|가|은|는)/)
  if (!lawNameMatch) return { type: 'none' }
  const lawName = lawNameMatch[1].trim()

  // 조문번호 추출
  const articleMatches = Array.from(query.matchAll(/제(\d+)조(?:의(\d+))?/g))
  if (articleMatches.length === 0) return { type: 'none' }
  const articles = articleMatches.map(m => m[2] ? `제${m[1]}조의${m[2]}` : `제${m[1]}조`)

  // KNOWN_MST 조회
  const mst = KNOWN_MST.get(lawName)
  if (mst) {
    return { type: 'hit', lawName, articles, mst }
  }
  return { type: 'resolve', lawName, articles }
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
