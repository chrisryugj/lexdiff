/**
 * 조례 검색 다단계 전략 생성 (Ordinance Search Strategy)
 *
 * 사용자의 조례 검색 쿼리를 분석하여 다단계 검색 전략을 생성.
 * 동의어 치환, 토픽 클러스터 필터링, 지역명+키워드 조합 등을 활용.
 *
 * @module ordinance-search-strategy
 */

import { TOPIC_CLUSTERS } from './query-expansion-data'
import { expandKeyword, parseQueryRegionAndKeywords } from './query-expansion'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 조례 검색 필살기 — 다단계 검색 전략 생성
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface OrdinanceSearchStrategy {
  /** 검색 쿼리 */
  query: string
  /** API에 넘길 display 수 */
  display: number
  /** 클라이언트 측 필터링 키워드 (없으면 결과 전체 사용) */
  filterKeywords?: string[]
  /** 전략 설명 (디버깅용) */
  description: string
  /** 우선도 (높을수록 먼저 실행, 결과 머징 시 가중치) */
  priority: number
}

/**
 * 검색 결과 관련도 점수 산출
 * 원본 키워드가 결과명에 얼마나 포함되는지 측정
 */
export function scoreRelevance(resultName: string, originalKeywords: string[], expandedKeywords: string[]): number {
  const name = resultName.toLowerCase()
  let score = 0

  // 원본 키워드 직접 포함 → 높은 점수
  for (const kw of originalKeywords) {
    if (name.includes(kw.toLowerCase())) score += 10
  }

  // 확장 키워드 포함 → 중간 점수
  for (const kw of expandedKeywords) {
    if (name.includes(kw.toLowerCase())) score += 3
  }

  return score
}

/**
 * 조례 검색 다단계 전략 생성
 *
 * 사용자가 "광진구 중소기업에 관한 조례"를 검색하면:
 *
 * Step 1: "광진구 중소기업" (불용어 제거한 원본)
 * Step 2: "광진구 소상공인" (동의어 치환)
 * Step 3: "광진구 벤처기업" (동의어 치환)
 * Step 4: "광진구 창업"     (동의어 치환)
 * Step 5: "광진구 기업육성"  (동의어 치환)
 * Step 6: "광진구" (display=100) + 필터:["중소기업","소상공인","벤처","창업","기업","기금"] ← 필살기
 * Step 7: "중소기업" (전국 범위, 지역명 없이)
 *
 * @param query 원본 검색 쿼리 (예: "광진구 중소기업에 관한 조례")
 */
export function buildOrdinanceSearchStrategies(query: string): OrdinanceSearchStrategy[] {
  const strategies: OrdinanceSearchStrategy[] = []
  const seenQueries = new Set<string>()

  const { region, subRegion, keywords } = parseQueryRegionAndKeywords(query)

  let priorityCounter = 100 // 높을수록 우선

  function addStrategy(q: string, display: number, filterKeywords: string[] | undefined, desc: string, prio?: number) {
    const key = q.toLowerCase()
    if (!seenQueries.has(key)) {
      seenQueries.add(key)
      strategies.push({ query: q, display, filterKeywords, description: desc, priority: prio ?? priorityCounter-- })
    }
  }

  // ── Step 1: 원본 (추출된 키워드 기반) ──
  const baseQuery = region
    ? `${region} ${keywords.join(' ')}`
    : keywords.join(' ')
  addStrategy(baseQuery, 20, undefined, `원본: "${baseQuery}"`, 100)
  // 도+시 조합이면 시/군/구+키워드 버전도 추가
  if (subRegion && subRegion !== region && keywords.length > 0) {
    addStrategy(`${subRegion} ${keywords.join(' ')}`, 20, undefined, `원본(시군구): "${subRegion} ${keywords.join(' ')}"`)
  }

  if (region && keywords.length > 0) {
    // 도+시 조합인 경우 시/군/구만으로도 검색 (API가 "경기 수원시 X"보다 "수원시 X"를 선호)
    const regionVariants = subRegion && subRegion !== region ? [region, subRegion] : [region]

    // ── Step 2~N: 지역명 + 동의어 치환 ──
    for (const kw of keywords) {
      // 동의어 (synonym index + hypernym + colloquial)
      const expansion = expandKeyword(kw)
      for (const rv of regionVariants) {
        for (const synonym of expansion.expanded) {
          if (synonym !== kw) {
            addStrategy(`${rv} ${synonym}`, 20, undefined, `동의어: "${kw}" → "${synonym}" (${rv})`)
          }
        }
      }
      // 토픽 클러스터 핵심어도 검색 쿼리로 시도 (필살기 전에 빠르게 잡기 위해)
      const cluster = TOPIC_CLUSTERS[kw.toLowerCase()]
      if (cluster) {
        for (const rv of regionVariants) {
          for (const related of cluster) {
            addStrategy(`${rv} ${related}`, 20, undefined, `관련어: "${kw}" → "${related}" (${rv})`)
          }
        }
      }
    }

    // ── 필살기: 지역명으로 넓게 검색 → 동의어 + 토픽 클러스터로 필터링 ──
    const allFilterKeywords = new Set<string>()
    for (const kw of keywords) {
      // 동의어 확장
      const expansion = expandKeyword(kw)
      for (const e of expansion.expanded) {
        allFilterKeywords.add(e)
      }
      // 토픽 클러스터 (의미적 관련어 그물망)
      const cluster = TOPIC_CLUSTERS[kw.toLowerCase()]
      if (cluster) {
        for (const related of cluster) {
          allFilterKeywords.add(related)
        }
      }
    }
    const filterArr = Array.from(allFilterKeywords)
    for (const rv of regionVariants) {
      addStrategy(rv, 200, filterArr, `필살기: "${rv}" 전체 → [${filterArr.slice(0, 8).join(',')}${filterArr.length > 8 ? '...' : ''}] 필터`, 10)
    }

    // ── Fallback: 키워드만 (전국 범위) ──
    for (const kw of keywords) {
      addStrategy(kw, 20, undefined, `전국: "${kw}"`, 20)
    }
  } else if (keywords.length > 0) {
    // 지역명 없이 키워드만 있는 경우
    for (const kw of keywords) {
      const expansion = expandKeyword(kw)
      for (const synonym of expansion.expanded) {
        if (synonym !== kw) {
          addStrategy(synonym, 20, undefined, `동의어: "${kw}" → "${synonym}"`)
        }
      }
    }
  }

  return strategies
}
