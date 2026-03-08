/**
 * 행정규칙 조회 Hook — Two-Tier Lazy Matching
 *
 * 기존: 법령의 모든 행정규칙 본문을 fetch (N calls) → 제1조 파싱 → 필터링
 * 변경: Tier 1 (이름 매칭, 0 calls) + Tier 2 (admrul-search, 1 call) → 교차 참조
 *
 * API 호출: 50+ → 2~3으로 감소
 */

import { useState, useEffect, useMemo, useRef } from "react"
import { parseHierarchyXML } from "./hierarchy-parser"
import {
  filterAdminRulesByTitle,
  crossReferenceSearchWithHierarchy,
  parseAdminRuleList,
} from "./admrul-parser"
import {
  getLawAdminRulesPurposeCache,
  getLawAdminRulesPurposeCacheOptimistic,
  setLawAdminRulesPurposeCache,
  getArticleMatchIndex,
  setArticleMatchIndex,
} from "./admin-rule-cache"

type HierarchyRule = { id: string; name: string; serialNumber?: string }

// 전역 상태: 현재 fetch 중인 법령명 (중복 fetch 방지)
const fetchingLawNames = new Set<string>()
// 전역 상태: 이미 로드된 hierarchy 데이터 캐시 (메모리)
const loadedHierarchyCache = new Map<string, { rules: HierarchyRule[]; mst: string }>()

export interface AdminRuleMatch {
  name: string
  id: string
  serialNumber?: string // 행정규칙일련번호 (API 호출 시 우선 사용)
  purpose?: { number: string; content: string } // optional — UI에서 미사용
  matchType: "title" | "content" // 제목에서 매칭 or 내용에서 매칭
}

interface UseAdminRulesResult {
  adminRules: AdminRuleMatch[]
  allRulesCount: number // 전체 규칙 수 (hierarchy 기준)
  loading: boolean
  dataReady: boolean
  error: string | null
  progress: { current: number; total: number } | null // 하위 호환 (항상 null)
}

/**
 * 특정 법령 조문에 대한 행정규칙 조회
 */
export function useAdminRules(
  lawName: string | null,
  articleNumber: string | null,
  enabled: boolean = true
): UseAdminRulesResult {
  // === 법령 수준 상태 ===
  const [hierarchyRules, setHierarchyRules] = useState<HierarchyRule[]>([])
  const [hierarchyMst, setHierarchyMst] = useState<string>("")
  const [hierarchyLoaded, setHierarchyLoaded] = useState(false)
  const [loadingHierarchy, setLoadingHierarchy] = useState(false)

  // === 조문 수준 상태 ===
  const [tier1Results, setTier1Results] = useState<AdminRuleMatch[]>([])
  const [tier2Results, setTier2Results] = useState<AdminRuleMatch[]>([])
  const [tier2Loading, setTier2Loading] = useState(false)
  const [dataReady, setDataReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Ref: 현재 로드된 법령 추적
  const loadedLawNameRef = useRef<string | null>(null)

  // ==============================================
  // Effect 1: 법령 수준 — Hierarchy 로드 (lawName 변경 시)
  // ==============================================
  useEffect(() => {
    // 메모리 캐시 먼저 확인
    if (lawName) {
      const memoryCached = loadedHierarchyCache.get(lawName)
      if (memoryCached) {
        setHierarchyRules(memoryCached.rules)
        setHierarchyMst(memoryCached.mst)
        loadedLawNameRef.current = lawName
        setHierarchyLoaded(true)
        setLoadingHierarchy(false)
        return
      }
    }

    if (!enabled || !lawName) {
      setLoadingHierarchy(false)
      setHierarchyLoaded(false)
      setError(null)
      return
    }

    // 이미 로드된 법령이면 스킵
    if (lawName === loadedLawNameRef.current) {
      setLoadingHierarchy(false)
      setHierarchyLoaded(true)
      return
    }

    // 다른 인스턴스가 fetch 중이면 대기
    if (fetchingLawNames.has(lawName)) {
      setLoadingHierarchy(true)
      const waitForFetch = setInterval(() => {
        const cached = loadedHierarchyCache.get(lawName)
        if (cached) {
          clearInterval(waitForFetch)
          setHierarchyRules(cached.rules)
          setHierarchyMst(cached.mst)
          loadedLawNameRef.current = lawName
          setHierarchyLoaded(true)
          setLoadingHierarchy(false)
        }
        if (!fetchingLawNames.has(lawName) && !cached) {
          clearInterval(waitForFetch)
          setHierarchyRules([])
          setHierarchyMst("")
          loadedLawNameRef.current = lawName
          setHierarchyLoaded(true)
          setLoadingHierarchy(false)
        }
      }, 100)
      return () => clearInterval(waitForFetch)
    }

    // 새 법령 요청 시작
    fetchingLawNames.add(lawName)
    setError(null)

    let cancelled = false

    const fetchHierarchy = async () => {
      // Optimistic: IndexedDB 캐시 먼저 확인
      try {
        const optimisticCache = await getLawAdminRulesPurposeCacheOptimistic(lawName)
        if (optimisticCache) {
          setHierarchyRules(optimisticCache.rules)
          setHierarchyMst(optimisticCache.mst)
          loadedHierarchyCache.set(lawName, { rules: optimisticCache.rules, mst: optimisticCache.mst })
          loadedLawNameRef.current = lawName
          setHierarchyLoaded(true)
          setLoadingHierarchy(false)
        } else {
          setLoadingHierarchy(true)
        }
      } catch {
        setLoadingHierarchy(true)
      }

      try {
        // Hierarchy API 호출
        const hierarchyUrl = `/api/hierarchy?lawName=${encodeURIComponent(lawName)}`
        const hierarchyResponse = await fetch(hierarchyUrl, { cache: 'no-store' })

        if (!hierarchyResponse.ok) {
          throw new Error(`체계도 조회 실패: ${hierarchyResponse.status}`)
        }

        const hierarchyXml = await hierarchyResponse.text()
        const hierarchy = parseHierarchyXML(hierarchyXml)

        if (cancelled) return

        const currentMst = hierarchy?.mst || ""
        const rules: HierarchyRule[] = hierarchy?.adminRules || []

        // IndexedDB 캐시의 MST와 비교
        const cachedRules = await getLawAdminRulesPurposeCache(lawName, currentMst)
        if (cachedRules && !cancelled) {
          // MST 일치 캐시 → 그대로 사용
          setHierarchyRules(cachedRules)
          setHierarchyMst(currentMst)
          loadedHierarchyCache.set(lawName, { rules: cachedRules, mst: currentMst })
        } else if (!cancelled) {
          // 새 hierarchy 데이터 저장
          setHierarchyRules(rules)
          setHierarchyMst(currentMst)
          loadedHierarchyCache.set(lawName, { rules, mst: currentMst })
          // IndexedDB에 캐시 저장
          await setLawAdminRulesPurposeCache(lawName, currentMst, rules)
        }

        if (!cancelled) {
          loadedLawNameRef.current = lawName
          setHierarchyLoaded(true)
          setLoadingHierarchy(false)
        }
        fetchingLawNames.delete(lawName)

      } catch (err: any) {
        fetchingLawNames.delete(lawName)
        if (!cancelled) {
          console.error("[use-admin-rules] Hierarchy error:", err)
          setError(err.message || "행정규칙 조회 중 오류 발생")
          setLoadingHierarchy(false)
          setHierarchyLoaded(true) // 에러도 "시도 완료"
        }
      }
    }

    fetchHierarchy()

    return () => { cancelled = true }
  }, [lawName, enabled])

  // ==============================================
  // Effect 2: 조문 수준 — Two-Tier 매칭 (articleNumber 변경 시)
  // ==============================================
  useEffect(() => {
    if (!hierarchyLoaded || !articleNumber || !lawName) {
      setTier1Results([])
      setTier2Results([])
      setDataReady(!hierarchyLoaded ? false : true) // hierarchy 미로드면 not ready
      return
    }

    if (hierarchyRules.length === 0) {
      setTier1Results([])
      setTier2Results([])
      setDataReady(true) // 규칙이 없음 = 완료
      return
    }

    // === Tier 1: 이름 매칭 (즉시, 0 API calls) ===
    const titleMatches = filterAdminRulesByTitle(hierarchyRules, lawName, articleNumber)
    setTier1Results(titleMatches)

    // === Tier 2: admrul-search 본문 검색 (비동기, 1 API call) ===
    let cancelled = false

    const searchContentMatches = async () => {
      setTier2Loading(true)

      try {
        // 캐시 확인: 조문별 매칭 인덱스
        if (hierarchyMst) {
          const cachedMatchIds = await getArticleMatchIndex(lawName, articleNumber, hierarchyMst)
          if (cachedMatchIds && !cancelled) {
            // 캐시된 ID로 규칙 복원
            const idSet = new Set(cachedMatchIds)
            const titleMatchIds = new Set(titleMatches.map(r => r.serialNumber || r.id))
            const cachedContentMatches: AdminRuleMatch[] = hierarchyRules
              .filter(r => {
                const key = r.serialNumber || r.id
                return idSet.has(key) && !titleMatchIds.has(key) // Tier 1과 중복 제거
              })
              .map(r => ({ ...r, matchType: "content" as const }))

            setTier2Results(cachedContentMatches)
            setTier2Loading(false)
            setDataReady(true)
            return
          }
        }

        // admrul-search API 호출
        const searchQuery = `「${lawName}」 ${articleNumber}`
        const params = new URLSearchParams({
          query: searchQuery,
          search: "2",     // 본문 검색
          display: "100",
          nw: "1",         // 현행만
        })

        const response = await fetch(`/api/admrul-search?${params}`)
        if (cancelled) return

        if (!response.ok) {
          console.warn(`[use-admin-rules] Tier 2 search failed: ${response.status}`)
          // Tier 2 실패는 치명적이지 않음 — Tier 1 결과만 표시
          setTier2Loading(false)
          setDataReady(true)
          return
        }

        const xml = await response.text()
        if (cancelled) return

        const searchResults = parseAdminRuleList(xml)
        const contentMatches = crossReferenceSearchWithHierarchy(searchResults, hierarchyRules)

        // Tier 1과 중복 제거
        const titleMatchIds = new Set(titleMatches.map(r => r.serialNumber || r.id))
        const uniqueContentMatches = contentMatches.filter(r => {
          const key = r.serialNumber || r.id
          return !titleMatchIds.has(key)
        })

        if (!cancelled) {
          setTier2Results(uniqueContentMatches)

          // 조문별 매칭 인덱스 캐시 저장
          if (hierarchyMst) {
            const allMatchIds = [
              ...titleMatches.map(r => r.serialNumber || r.id),
              ...uniqueContentMatches.map(r => r.serialNumber || r.id),
            ]
            await setArticleMatchIndex(lawName, articleNumber, hierarchyMst, allMatchIds)
          }
        }
      } catch (err) {
        console.error("[use-admin-rules] Tier 2 error:", err)
        // Tier 2 실패는 graceful degradation — Tier 1 결과는 유지
      } finally {
        if (!cancelled) {
          setTier2Loading(false)
          setDataReady(true)
        }
      }
    }

    searchContentMatches()

    return () => { cancelled = true }
  }, [hierarchyRules, hierarchyMst, articleNumber, lawName, hierarchyLoaded])

  // === 결과 병합 (Tier 1 + Tier 2, 중복 제거) ===
  const mergedResults = useMemo(() => {
    const seen = new Set<string>()
    const results: AdminRuleMatch[] = []

    // Tier 1 먼저 (높은 신뢰도)
    for (const r of tier1Results) {
      const key = r.serialNumber || r.id
      if (!seen.has(key)) {
        seen.add(key)
        results.push(r)
      }
    }

    // Tier 2 추가
    for (const r of tier2Results) {
      const key = r.serialNumber || r.id
      if (!seen.has(key)) {
        seen.add(key)
        results.push(r)
      }
    }

    return results
  }, [tier1Results, tier2Results])

  return {
    adminRules: mergedResults,
    allRulesCount: hierarchyRules.length,
    loading: loadingHierarchy || tier2Loading,
    dataReady,
    error,
    progress: null, // 하위 호환 유지 (배치 progress 더 이상 없음)
  }
}
