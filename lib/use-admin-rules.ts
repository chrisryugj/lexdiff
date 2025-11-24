/**
 * 행정규칙 조회 Hook
 * - 개선된 구조: 법령별 전체 규칙을 한 번만 로드하고, 조문별 필터링은 메모리에서 수행
 * - 효과: 조문 이동 시 로딩 없음, 즉각적인 반응
 */

import { useState, useEffect, useMemo } from "react"
import { parseHierarchyXML } from "./hierarchy-parser"
import { parseAdminRulePurposeOnly, checkLawArticleReference, type AdminRuleArticle } from "./admrul-parser"
import {
  getLawAdminRulesPurposeCache,
  setLawAdminRulesPurposeCache,
} from "./admin-rule-cache"

export interface AdminRuleMatch {
  name: string
  id: string
  serialNumber?: string // 행정규칙일련번호 (API 호출 시 우선 사용)
  purpose: AdminRuleArticle
  matchType: "title" | "content" // 제목에서 매칭 or 내용에서 매칭
}

interface UseAdminRulesResult {
  adminRules: AdminRuleMatch[]
  loading: boolean // 법령 데이터 로딩 중 여부 (조문 변경 시에는 false 유지)
  error: string | null
  progress: { current: number; total: number } | null
}

/**
 * 특정 법령 조문에 대한 행정규칙 조회
 */
export function useAdminRules(
  lawName: string | null,
  articleNumber: string | null,
  enabled: boolean = true
): UseAdminRulesResult {
  // 1. 법령 수준의 전체 데이터 상태
  const [allRules, setAllRules] = useState<Array<{
    id: string
    name: string
    serialNumber?: string
    purpose: AdminRuleArticle | null
  }>>([])

  const [loadingLaw, setLoadingLaw] = useState(false)
  const [lawError, setLawError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)

  // 2. 현재 로드된 법령 이름 추적 (불필요한 재로딩 방지)
  const [loadedLawName, setLoadedLawName] = useState<string | null>(null)

  // 3. 법령 데이터 Fetching Effect (법령명이 바뀔 때만 실행)
  useEffect(() => {
    if (!enabled || !lawName) {
      setLoadingLaw(false)
      setLawError(null)
      setProgress(null)
      return
    }

    // 이미 로드된 법령이면 스킵
    if (lawName === loadedLawName && allRules.length > 0) {
      return
    }

    let cancelled = false

    const fetchAllRulesForLaw = async () => {
      setLoadingLaw(true)
      setLawError(null)
      setProgress(null)
      setAllRules([]) // 법령이 바뀌면 일단 비움

      try {
        // Step 0: 법령 체계도에서 MST 가져오기
        const hierarchyUrl = `/api/hierarchy?lawName=${encodeURIComponent(lawName)}`
        const hierarchyResponse = await fetch(hierarchyUrl, {
          cache: 'no-store'
        })

        if (!hierarchyResponse.ok) {
          throw new Error(`체계도 조회 실패: ${hierarchyResponse.status}`)
        }

        const hierarchyXml = await hierarchyResponse.text()
        const hierarchy = parseHierarchyXML(hierarchyXml)

        if (!hierarchy || !hierarchy.adminRules || hierarchy.adminRules.length === 0) {
          if (cancelled) return
          setAllRules([])
          setLoadedLawName(lawName)
          setLoadingLaw(false)
          return
        }

        const currentMst = hierarchy.mst || ""
        const hierarchyRules = hierarchy.adminRules

        // Step 1: 캐시 확인 (법령별 전체 데이터)
        const cachedRules = await getLawAdminRulesPurposeCache(lawName, currentMst)

        if (cachedRules && !cancelled) {
          console.log("[use-admin-rules] Cache HIT:", cachedRules.length, "rules")
          setAllRules(cachedRules)
          setLoadedLawName(lawName)
          setLoadingLaw(false)
          return
        }

        // Step 2: 캐시 MISS -> API 호출하여 전체 수집
        console.log("[use-admin-rules] Cache MISS, fetching all rules:", hierarchyRules.length)
        if (!cancelled) {
          setProgress({ current: 0, total: hierarchyRules.length })
        }

        const fetchedRules: Array<{
          id: string
          name: string
          serialNumber?: string
          purpose: AdminRuleArticle | null
        }> = []

        let completed = 0
        const BATCH_SIZE = 10

        const processRule = async (rule: any): Promise<void> => {
          const idParam = rule.serialNumber || rule.id
          if (!idParam) {
            completed++
            if (!cancelled) setProgress({ current: completed, total: hierarchyRules.length })
            return
          }

          try {
            const contentUrl = `/api/admrul?ID=${encodeURIComponent(idParam)}`
            const contentResponse = await fetch(contentUrl, { cache: 'no-store' })

            if (!contentResponse.ok) {
              completed++
              if (!cancelled) setProgress({ current: completed, total: hierarchyRules.length })
              fetchedRules.push({
                id: rule.id,
                name: rule.name,
                serialNumber: rule.serialNumber,
                purpose: null,
              })
              return
            }

            const contentXml = await contentResponse.text()
            const purposeData = parseAdminRulePurposeOnly(contentXml)

            fetchedRules.push({
              id: rule.id,
              name: rule.name,
              serialNumber: rule.serialNumber,
              purpose: purposeData?.purpose || null,
            })

            completed++
            if (!cancelled) setProgress({ current: completed, total: hierarchyRules.length })

          } catch (err) {
            console.error(`[use-admin-rules] Error processing ${rule.name}:`, err)
            completed++
            if (!cancelled) setProgress({ current: completed, total: hierarchyRules.length })
            fetchedRules.push({
              id: rule.id,
              name: rule.name,
              serialNumber: rule.serialNumber,
              purpose: null,
            })
          }
        }

        // 배치 처리
        for (let i = 0; i < hierarchyRules.length; i += BATCH_SIZE) {
          if (cancelled) break
          const batch = hierarchyRules.slice(i, i + BATCH_SIZE)
          await Promise.all(batch.map(processRule))
        }

        if (!cancelled) {
          // 캐시 저장
          await setLawAdminRulesPurposeCache(lawName, currentMst, fetchedRules)
          console.log("[use-admin-rules] Saved to cache:", fetchedRules.length, "rules")

          setAllRules(fetchedRules)
          setLoadedLawName(lawName)
          setLoadingLaw(false)
          setProgress(null)
        }

      } catch (err: any) {
        if (!cancelled) {
          console.error("[use-admin-rules] Error:", err)
          setLawError(err.message || "행정규칙 조회 중 오류 발생")
          setLoadingLaw(false)
          setProgress(null)
        }
      }
    }

    fetchAllRulesForLaw()

    return () => {
      cancelled = true
    }
  }, [lawName, enabled, loadedLawName]) // articleNumber 의존성 제거됨!

  // 4. 조문별 필터링 (메모리 연산 - 즉시 실행)
  const filteredRules = useMemo(() => {
    if (!articleNumber || allRules.length === 0) {
      return []
    }

    const matching: AdminRuleMatch[] = []

    allRules.forEach((rule) => {
      if (!rule.purpose) return

      // 1. 제목 매칭 (가장 우선)
      if (rule.name.includes(articleNumber)) {
        matching.push({
          name: rule.name,
          id: rule.id,
          serialNumber: rule.serialNumber,
          purpose: rule.purpose,
          matchType: "title",
        })
        return
      }

      // 2. 내용 매칭
      const isMatch = checkLawArticleReference(
        rule.purpose.content,
        lawName || "",
        articleNumber,
        rule.name
      )

      if (isMatch) {
        matching.push({
          name: rule.name,
          id: rule.id,
          serialNumber: rule.serialNumber,
          purpose: rule.purpose,
          matchType: "content",
        })
      }
    })

    return matching
  }, [allRules, articleNumber, lawName])

  return {
    adminRules: filteredRules,
    loading: loadingLaw, // 법령 로딩 중일 때만 true
    error: lawError,
    progress
  }
}
