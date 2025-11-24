/**
 * 행정규칙 조회 Hook
 * - 2단계 IndexedDB 캐싱: 법령별 제1조 캐시 + 조문별 매칭 인덱스
 * - 배치 처리로 API 호출 최적화
 */

import { useState, useEffect } from "react"
import { parseHierarchyXML } from "./hierarchy-parser"
import { parseAdminRulePurposeOnly, checkLawArticleReference, type AdminRuleArticle } from "./admrul-parser"
import {
  getLawAdminRulesPurposeCache,
  setLawAdminRulesPurposeCache,
  getArticleMatchIndex,
  setArticleMatchIndex,
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

    // ✅ 조문 변경 시 즉시 상태 초기화 + 로딩 전환 (캐시 조회 중에도 스피너 표시)
    setAdminRules([]) // ← useEffect에서 즉시 호출 (동기)
    setLoading(true)  // ← useEffect에서 즉시 호출 (동기)
    setError(null)
    setProgress(null)

    let cancelled = false

    const fetchAdminRules = async () => {
      try {
        // Step 0: 법령 체계도에서 MST 가져오기
        const hierarchyUrl = `/api/hierarchy?lawName=${encodeURIComponent(lawName)}`
        const hierarchyResponse = await fetch(hierarchyUrl, {
          cache: 'no-store' // 항상 최신 데이터 가져오기
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

        const currentMst = hierarchy.mst || ""
        const hierarchyRules = hierarchy.adminRules

        // Step 1: 조문별 매칭 인덱스 확인 (2단계 캐시)
        const matchedRuleIds = await getArticleMatchIndex(lawName, articleNumber, currentMst)

        if (matchedRuleIds !== null) {
          // ✅ 매칭 인덱스 캐시 HIT
          // 법령별 제1조 캐시에서 해당 규칙들만 조회
          const purposeCache = await getLawAdminRulesPurposeCache(lawName, currentMst)

          if (purposeCache && !cancelled) {
            // 매칭된 ID에 해당하는 규칙들만 필터링
            const matching: AdminRuleMatch[] = []

            matchedRuleIds.forEach((ruleId) => {
              const cached = purposeCache.find(r => (r.serialNumber || r.id) === ruleId)
              if (cached && cached.purpose) {
                const matchType = cached.name.includes(articleNumber) ? "title" : "content"
                matching.push({
                  name: cached.name,
                  id: cached.id,
                  serialNumber: cached.serialNumber,
                  purpose: cached.purpose,
                  matchType,
                })
              }
            })

            console.log("[use-admin-rules] Using cached match index:", matching.length, "matches")
            setAdminRules(matching)
            setLoading(false)
            setProgress(null)
            return
          }
        }

        // Step 2: 법령별 제1조 캐시 확인 (1단계 캐시)
        const purposeCache = await getLawAdminRulesPurposeCache(lawName, currentMst)

        if (purposeCache && !cancelled) {
          // ✅ 제1조 캐시 HIT → 메모리에서 매칭만 수행 (API 호출 0회)
          console.log("[use-admin-rules] Using cached purposes:", purposeCache.length, "rules")

          const matching: AdminRuleMatch[] = []

          purposeCache.forEach((cached) => {
            if (!cached.purpose) return

            const isMatch = checkLawArticleReference(
              cached.purpose.content,
              lawName,
              articleNumber,
              cached.name
            )

            if (isMatch) {
              const matchType = cached.name.includes(articleNumber) ? "title" : "content"
              matching.push({
                name: cached.name,
                id: cached.id,
                serialNumber: cached.serialNumber,
                purpose: cached.purpose,
                matchType,
              })
            }
          })

          // 매칭 인덱스 저장
          const matchedIds = matching.map(m => m.serialNumber || m.id)
          await setArticleMatchIndex(lawName, articleNumber, currentMst, matchedIds)

          setAdminRules(matching)
          setLoading(false)
          setProgress(null)
          return
        }

        // Step 3: 캐시 MISS → API 호출하여 제1조 수집
        console.log("[use-admin-rules] Cache MISS, fetching purposes from API:", hierarchyRules.length, "rules")
        setProgress({ current: 0, total: hierarchyRules.length })

        const allPurposes: Array<{
          id: string
          name: string
          serialNumber?: string
          purpose: AdminRuleArticle | null
        }> = []

        const matching: AdminRuleMatch[] = []
        let completed = 0
        const BATCH_SIZE = 10 // 5 → 10으로 증가

        const processRule = async (rule: any): Promise<void> => {
          const idParam = rule.serialNumber || rule.id
          if (!idParam) {
            completed++
            if (!cancelled) setProgress({ current: completed, total: hierarchyRules.length })
            return
          }

          try {
            const contentUrl = `/api/admrul?ID=${encodeURIComponent(idParam)}`
            const contentResponse = await fetch(contentUrl, {
              cache: 'no-store' // 항상 최신 데이터 가져오기
            })

            if (!contentResponse.ok) {
              completed++
              if (!cancelled) setProgress({ current: completed, total: hierarchyRules.length })
              // 실패해도 제1조 캐시에 null로 저장 (다음번에 스킵 가능)
              allPurposes.push({
                id: rule.id,
                name: rule.name,
                serialNumber: rule.serialNumber,
                purpose: null,
              })
              return
            }

            const contentXml = await contentResponse.text()
            const purposeData = parseAdminRulePurposeOnly(contentXml)

            if (!purposeData || !purposeData.purpose) {
              completed++
              if (!cancelled) setProgress({ current: completed, total: hierarchyRules.length })
              allPurposes.push({
                id: rule.id,
                name: rule.name,
                serialNumber: rule.serialNumber,
                purpose: null,
              })
              return
            }

            // 제1조 캐시에 저장
            allPurposes.push({
              id: purposeData.id,
              name: purposeData.name,
              serialNumber: rule.serialNumber,
              purpose: purposeData.purpose,
            })

            // 매칭 확인
            const isMatch = checkLawArticleReference(
              purposeData.purpose.content,
              lawName,
              articleNumber,
              purposeData.name
            )

            completed++
            if (!cancelled) setProgress({ current: completed, total: hierarchyRules.length })

            if (isMatch) {
              const matchType = purposeData.name.includes(articleNumber) ? "title" : "content"
              matching.push({
                name: purposeData.name,
                id: purposeData.id,
                serialNumber: rule.serialNumber,
                purpose: purposeData.purpose,
                matchType,
              })
            }
          } catch (err) {
            console.error(`[use-admin-rules] Error processing ${rule.name}:`, err)
            completed++
            if (!cancelled) setProgress({ current: completed, total: hierarchyRules.length })
            allPurposes.push({
              id: rule.id,
              name: rule.name,
              serialNumber: rule.serialNumber,
              purpose: null,
            })
          }
        }

        // 배치 단위로 처리
        for (let i = 0; i < hierarchyRules.length; i += BATCH_SIZE) {
          if (cancelled) break

          const batch = hierarchyRules.slice(i, i + BATCH_SIZE)
          await Promise.all(batch.map(processRule))
        }

        if (!cancelled) {
          // 법령별 제1조 캐시 저장 (1단계)
          await setLawAdminRulesPurposeCache(lawName, currentMst, allPurposes)
          console.log("[use-admin-rules] Saved purpose cache:", allPurposes.length, "rules")

          // 조문별 매칭 인덱스 저장 (2단계)
          const matchedIds = matching.map(m => m.serialNumber || m.id)
          await setArticleMatchIndex(lawName, articleNumber, currentMst, matchedIds)
          console.log("[use-admin-rules] Saved match index:", matchedIds.length, "matches")

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
