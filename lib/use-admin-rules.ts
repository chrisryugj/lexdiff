/**
 * 행정규칙 조회 Hook
 * - IndexedDB 영구 캐싱 지원
 * - API 호출 병렬화로 성능 개선
 */

import { useState, useEffect } from "react"
import { parseHierarchyXML } from "./hierarchy-parser"
import { parseAdminRulePurposeOnly, checkLawArticleReference, type AdminRuleArticle } from "./admrul-parser"
import { getAdminRulesListCache, setAdminRulesListCache } from "./admin-rule-cache"

export interface AdminRuleMatch {
  name: string
  id: string
  serialNumber?: string // 행정규칙일련번호 (API 호출 시 우선 사용)
  purpose: AdminRuleArticle
  matchType: "title" | "content" // 제목에서 매칭 or 내용에서 매칭
}

interface UseAdminRulesResult {
  adminRules: AdminRuleMatch[]
  loading: boolean
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
  const [adminRules, setAdminRules] = useState<AdminRuleMatch[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)

  useEffect(() => {
    // enabled가 false면 fetch하지 않지만, 기존 데이터는 유지
    if (!enabled) {
      setLoading(false)
      setError(null)
      setProgress(null)
      return
    }

    // lawName이나 articleNumber가 없으면 데이터 초기화
    if (!lawName || !articleNumber) {
      setAdminRules([])
      setLoading(false)
      setError(null)
      setProgress(null)
      return
    }

    // 이미 데이터가 있으면 다시 fetch하지 않음 (캐시 활용)
    if (adminRules.length > 0) {
      setLoading(false)
      setError(null)
      setProgress(null)
      return
    }

    let cancelled = false

    const fetchAdminRules = async () => {
      setLoading(true)
      setError(null)
      setProgress(null)

      try {
        // Step 0: IndexedDB 캐시 확인
        const cachedRules = await getAdminRulesListCache(lawName, articleNumber)
        if (cachedRules && !cancelled) {
          console.log("[use-admin-rules] Using cached rules:", cachedRules.length)
          setAdminRules(cachedRules)
          setLoading(false)
          setProgress(null)
          return
        }

        // Step 1: 법령 체계도에서 행정규칙 목록 가져오기 (브라우저 캐시 활용)
        const hierarchyUrl = `/api/hierarchy?lawName=${encodeURIComponent(lawName)}`
        const hierarchyResponse = await fetch(hierarchyUrl, {
          cache: 'force-cache',
          next: { revalidate: 3600 } // 1시간 캐시
        })

        if (!hierarchyResponse.ok) {
          throw new Error(`체계도 조회 실패: ${hierarchyResponse.status}`)
        }

        const hierarchyXml = await hierarchyResponse.text()
        const hierarchy = parseHierarchyXML(hierarchyXml)

        if (!hierarchy || !hierarchy.adminRules || hierarchy.adminRules.length === 0) {
          if (cancelled) return
          setAdminRules([])
          setLoading(false)
          setProgress(null)
          return
        }

        const rules = hierarchy.adminRules
        setProgress({ current: 0, total: rules.length })

        const matching: AdminRuleMatch[] = []

        // Step 2: 모든 행정규칙 완전 병렬 처리 (최대 속도)
        let completed = 0
        const allPromises = rules.map(async (rule, idx) => {
          const idParam = rule.serialNumber || rule.id
          if (!idParam) {
            completed++
            if (!cancelled) setProgress({ current: completed, total: rules.length })
            return null
          }

          try {
            const contentUrl = `/api/admrul?ID=${encodeURIComponent(idParam)}`
            const contentResponse = await fetch(contentUrl, {
              cache: 'force-cache',
              next: { revalidate: 86400 } // 24시간 캐시 (행정규칙은 자주 변경되지 않음)
            })

            if (!contentResponse.ok) {
              completed++
              if (!cancelled) setProgress({ current: completed, total: rules.length })
              return null
            }

            const contentXml = await contentResponse.text()
            const purposeData = parseAdminRulePurposeOnly(contentXml)

            if (!purposeData || !purposeData.purpose) {
              completed++
              if (!cancelled) setProgress({ current: completed, total: rules.length })
              return null
            }

            // 매칭 확인
            const isMatch = checkLawArticleReference(
              purposeData.purpose.content,
              lawName,
              articleNumber,
              purposeData.name
            )

            completed++
            if (!cancelled) setProgress({ current: completed, total: rules.length })

            if (isMatch) {
              // 제목에서 매칭되었는지 내용에서 매칭되었는지 구분
              const matchType = purposeData.name.includes(articleNumber) ? "title" : "content"

              return {
                name: purposeData.name,
                id: purposeData.id,
                serialNumber: rule.serialNumber,
                purpose: purposeData.purpose,
                matchType,
              } as AdminRuleMatch
            }

            return null
          } catch (err) {
            console.error(`[use-admin-rules] Error processing ${rule.name}:`, err)
            completed++
            if (!cancelled) setProgress({ current: completed, total: rules.length })
            return null
          }
        })

        const allResults = await Promise.all(allPromises)

        allResults.forEach((result) => {
          if (result) matching.push(result)
        })

        if (!cancelled) {
          // IndexedDB에 캐싱
          await setAdminRulesListCache(lawName, articleNumber, matching, hierarchy.mst || "")
          console.log("[use-admin-rules] Cached rules to IndexedDB:", matching.length)

          setAdminRules(matching)
          setLoading(false)
          setProgress(null)
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error("[use-admin-rules] Error:", err)
          setError(err.message || "행정규칙 조회 중 오류 발생")
          setLoading(false)
          setProgress(null)
        }
      }
    }

    fetchAdminRules()

    return () => {
      cancelled = true
    }
  }, [lawName, articleNumber, enabled])

  return { adminRules, loading, error, progress }
}
