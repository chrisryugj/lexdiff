import { useState, useEffect } from 'react'
import type { LawMeta, LawArticle, ThreeTierData, DelegationItem, CitationItem } from '@/lib/law-types'
import { debugLogger } from '@/lib/debug-logger'

export function useLawViewerThreeTier(
  meta: LawMeta,
  activeJo: string,
  activeArticle: LawArticle | undefined,
  aiAnswerMode: boolean,
  isOrdinance: boolean
) {
  // 3-tier comparison data
  const [threeTierCitation, setThreeTierCitation] = useState<ThreeTierData | null>(null)
  const [threeTierDelegation, setThreeTierDelegation] = useState<ThreeTierData | null>(null)
  const [isLoadingThreeTier, setIsLoadingThreeTier] = useState(false)

  // View mode: 1-tier (default) -> 2-tier (article + delegations with tabs) -> 3-tier (article + decree + rule)
  const [tierViewMode, setTierViewMode] = useState<"1-tier" | "2-tier" | "3-tier">("1-tier")

  // Active tab for 2-tier delegation view (법률/시행령/시행규칙/행정규칙)
  const [delegationActiveTab, setDelegationActiveTab] = useState<"law" | "decree" | "rule" | "admin">("decree")

  // Panel sizes for drag resize (2-tier views)
  const [delegationPanelSize, setDelegationPanelSize] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('lawViewerDelegationSplit')
      return saved ? parseInt(saved) : 35
    }
    return 35
  })

  // Reset delegation panel state when law changes
  useEffect(() => {
    setTierViewMode("1-tier")
    setThreeTierCitation(null)
    setThreeTierDelegation(null)
  }, [meta.lawTitle])

  // Fetch 3-tier comparison data on demand (button click only)
  const fetchThreeTierData = async () => {
    if (aiAnswerMode || isOrdinance) return
    if (!meta.lawId && !meta.mst) return

    setIsLoadingThreeTier(true)
    try {
      const params = new URLSearchParams()
      if (meta.lawId) params.append("lawId", meta.lawId)
      else if (meta.mst) params.append("mst", meta.mst)

      debugLogger.info("3단비교 데이터 조회 시작", { lawId: meta.lawId, mst: meta.mst })
      const response = await fetch(`/api/three-tier?${params.toString()}`)
      if (!response.ok) {
        debugLogger.error("3단비교 API 오류", { status: response.status })
        return
      }

      const data = await response.json()
      if (data.success) {
        debugLogger.success("3단비교 완료", {
          citation: data.citation?.articles?.length || 0,
          delegation: data.delegation?.articles?.length || 0
        })
        setThreeTierCitation(data.citation)
        setThreeTierDelegation(data.delegation)
      }
    } catch (error) {
      debugLogger.error("3단비교 오류", error)
    } finally {
      setIsLoadingThreeTier(false)
    }
  }

  // Get delegation and citation data for current article
  const currentArticleDelegations: DelegationItem[] = threeTierDelegation?.articles.find((a) => a.jo === activeJo)?.delegations || []
  const currentArticleCitations: CitationItem[] = threeTierCitation?.articles.find((a) => a.jo === activeJo)?.citations || []

  // Filter to only include items with actual content
  const validDelegations = currentArticleDelegations.filter((d) => d.content && d.content.trim() !== "")
  const validCitations = currentArticleCitations.filter((c) => c.content && c.content.trim() !== "")

  // Check if there's any valid 3-tier data for current article
  const hasValidThreeTierData = validDelegations.length > 0 || validCitations.length > 0

  // Determine which type of 3-tier data to show (prioritize delegation over citation)
  const threeTierDataType: "delegation" | "citation" | null =
    validDelegations.length > 0 ? "delegation" : validCitations.length > 0 ? "citation" : null

  // Get the items to display based on tier view mode
  const tierItems = threeTierDataType === "delegation" ? validDelegations : validCitations

  // Check if there are valid 시행규칙 items (for 3-tier view)
  const hasValidSihyungkyuchik = validDelegations.some((d) => d.type === "시행규칙")

  // Auto-reset tier view mode if the current article doesn't support it
  useEffect(() => {
    if (tierViewMode === "3-tier" && !hasValidSihyungkyuchik) {
      setTierViewMode(hasValidThreeTierData ? "2-tier" : "1-tier")
    }
    // 2-tier 모드는 자동으로 리셋하지 않음 - 행정규칙이 있을 수 있기 때문
    // 사용자가 "위임법령 닫기" 버튼을 눌러야만 1-tier로 복귀
  }, [tierViewMode, hasValidSihyungkyuchik, hasValidThreeTierData, activeJo])

  return {
    // State
    threeTierCitation,
    setThreeTierCitation,
    threeTierDelegation,
    setThreeTierDelegation,
    isLoadingThreeTier,
    tierViewMode,
    setTierViewMode,
    delegationActiveTab,
    setDelegationActiveTab,
    delegationPanelSize,
    setDelegationPanelSize,

    // Computed values
    currentArticleDelegations,
    currentArticleCitations,
    validDelegations,
    validCitations,
    hasValidThreeTierData,
    hasValidSihyungkyuchik,
    threeTierDataType,
    tierItems,

    // Handlers
    fetchThreeTierData,
  }
}
