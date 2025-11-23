import { useState, useEffect } from 'react'
import type { LawMeta, Article } from '@/lib/law-types'
import { debugLogger } from '@/lib/debug-logger'

export interface ThreeTierData {
  articles: Array<{
    jo: string
    delegations?: Array<{
      lawName: string
      joLabel: string
      content: string
    }>
    citations?: Array<{
      lawName: string
      joLabel: string
      content: string
    }>
  }>
}

export function useLawViewerThreeTier(
  meta: LawMeta,
  activeJo: string,
  activeArticle: Article | undefined,
  aiAnswerMode: boolean,
  isOrdinance: boolean
) {
  // 3-tier comparison data
  const [threeTierCitation, setThreeTierCitation] = useState<ThreeTierData | null>(null)
  const [threeTierDelegation, setThreeTierDelegation] = useState<ThreeTierData | null>(null)
  const [isLoadingThreeTier, setIsLoadingThreeTier] = useState(false)

  // View mode: 1-tier (default) -> 2-tier (article + delegations with tabs)
  const [tierViewMode, setTierViewMode] = useState<"1-tier" | "2-tier">("1-tier")

  // Active tab for 2-tier delegation view (시행령/시행규칙/행정규칙)
  const [delegationActiveTab, setDelegationActiveTab] = useState<"decree" | "rule" | "admin">("decree")

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
  const currentArticleDelegations = threeTierDelegation?.articles.find((a) => a.jo === activeJo)?.delegations || []
  const currentArticleCitations = threeTierCitation?.articles.find((a) => a.jo === activeJo)?.citations || []

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
  const hasValidSihyungkyuchik = validDelegations.some((d: any) => d.type === "시행규칙")

  // Auto-reset tier view mode if the current article doesn't support it
  useEffect(() => {
    if (tierViewMode === "3-tier" && !hasValidSihyungkyuchik) {
      setTierViewMode(hasValidThreeTierData ? "2-tier" : "1-tier")
    } else if (tierViewMode === "2-tier" && !hasValidThreeTierData) {
      setTierViewMode("1-tier")
    }
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
