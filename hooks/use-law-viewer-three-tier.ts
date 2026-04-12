import { useState, useEffect, useRef } from 'react'
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
  const [delegationPanelSize, setDelegationPanelSizeState] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('lex:lawViewer:delegationSplit') ?? localStorage.getItem('lawViewerDelegationSplit')
      const parsed = saved ? parseInt(saved, 10) : NaN
      return Number.isFinite(parsed) ? parsed : 35
    }
    return 35
  })
  // P1-LV-4: 변경 시 localStorage 저장
  const setDelegationPanelSize = (size: number) => {
    setDelegationPanelSizeState(size)
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('lex:lawViewer:delegationSplit', String(size)) } catch { /* quota */ }
    }
  }

  // Reset delegation panel state when law changes
  useEffect(() => {
    setTierViewMode("1-tier")
    setThreeTierCitation(null)
    setThreeTierDelegation(null)
  }, [meta.lawTitle])

  // AbortController for cancelling in-flight requests
  const abortRef = useRef<AbortController | null>(null)

  // Fetch 3-tier comparison data on demand (button click only)
  const fetchThreeTierData = async () => {
    if (aiAnswerMode || isOrdinance) return
    if (!meta.lawId && !meta.mst) return

    // 이전 요청 취소 (중복 클릭 방지)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoadingThreeTier(true)
    try {
      const params = new URLSearchParams()
      if (meta.lawId) params.append("lawId", meta.lawId)
      else if (meta.mst) params.append("mst", meta.mst)

      debugLogger.info("3단비교 데이터 조회 시작", { lawId: meta.lawId, mst: meta.mst })
      const response = await fetch(`/api/three-tier?${params.toString()}`, { signal: controller.signal })
      if (!response.ok) {
        debugLogger.error("3단비교 API 오류", { status: response.status })
        return
      }

      const data = await response.json()
      if (controller.signal.aborted) return
      if (data.success) {
        debugLogger.success("3단비교 완료", {
          citation: data.citation?.articles?.length || 0,
          delegation: data.delegation?.articles?.length || 0
        })
        setThreeTierCitation(data.citation)
        setThreeTierDelegation(data.delegation)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      debugLogger.error("3단비교 오류", error)
    } finally {
      if (!controller.signal.aborted) setIsLoadingThreeTier(false)
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
