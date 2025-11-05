/**
 * 행정규칙 조회 Hook
 */

import { useState, useEffect } from "react"
import { parseHierarchyXML } from "./hierarchy-parser"
import { parseAdminRulePurposeOnly, checkLawArticleReference, type AdminRuleArticle } from "./admrul-parser"

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
    if (!enabled || !lawName || !articleNumber) {
      setAdminRules([])
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
        // Step 1: 법령 체계도에서 행정규칙 목록 가져오기
        const hierarchyUrl = `/api/hierarchy?lawName=${encodeURIComponent(lawName)}`
        const hierarchyResponse = await fetch(hierarchyUrl, { cache: 'no-store' })

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

        // Step 2: 각 행정규칙 처리
        for (let i = 0; i < rules.length; i++) {
          if (cancelled) break

          const rule = rules[i]
          const idParam = rule.serialNumber || rule.id

          if (!idParam) continue

          try {
            const contentUrl = `/api/admrul?ID=${encodeURIComponent(idParam)}`
            const contentResponse = await fetch(contentUrl, { cache: 'no-store' })

            if (!contentResponse.ok) continue

            const contentXml = await contentResponse.text()
            const purposeData = parseAdminRulePurposeOnly(contentXml)

            if (!purposeData || !purposeData.purpose) continue

            // 매칭 확인
            const isMatch = checkLawArticleReference(
              purposeData.purpose.content,
              lawName,
              articleNumber,
              purposeData.name
            )

            if (isMatch) {
              // 제목에서 매칭되었는지 내용에서 매칭되었는지 구분
              const matchType = purposeData.name.includes(articleNumber) ? "title" : "content"

              matching.push({
                name: purposeData.name,
                id: purposeData.id,
                serialNumber: rule.serialNumber, // hierarchy에서 가져온 serialNumber 포함
                purpose: purposeData.purpose,
                matchType,
              })
            }
          } catch (err) {
            console.error(`[use-admin-rules] Error processing ${rule.name}:`, err)
          }

          if (!cancelled) {
            setProgress({ current: i + 1, total: rules.length })
          }
        }

        if (!cancelled) {
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
