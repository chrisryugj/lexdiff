import { useState, useEffect, useRef } from 'react'
import type { LawMeta, LawArticle, ThreeTierData, DelegationItem, CitationItem } from '@/lib/law-types'
import { debugLogger } from '@/lib/debug-logger'

export function useLawViewerThreeTier(
  meta: LawMeta,
  activeJo: string,
  activeArticle: LawArticle | undefined,
  aiAnswerMode: boolean,
  isOrdinance: boolean,
  // DELEG-1: 행정규칙이 로드되어 내용이 있는지 (showAdminRules && adminRules.length > 0).
  // 시행령/시행규칙이 모두 비고 행정규칙만 위임된 조문에서 admin 탭으로 자동 전환하는 데 사용.
  hasLoadedAdminContent: boolean = false
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

  // DELEG-1: 위임법령 패널을 열었을 때 기본 탭(시행령)이 비어있으면 내용 있는 탭으로 1회 자동 전환.
  // 우선순위: 시행령(내용 있으면 유지) → 시행규칙 → 행정규칙(adminRules).
  // - panel open당 1회로 한정(autoSwitchedTabRef) → 사용자가 수동으로 고른 탭을 덮지 않음
  // - 조문 전환으로 validDelegations가 바뀌어도 가드로 재전환하지 않음
  // - 행정규칙은 별도 비동기 훅이 로드 → 아직 로드 전이면 가드를 세우지 않고 대기했다가
  //   hasLoadedAdminContent=true가 되는 렌더에서 전환(동기 전환 경합 방지)
  const autoSwitchedTabRef = useRef(false)
  useEffect(() => {
    if (tierViewMode === "1-tier") {
      // 패널이 닫히면 가드와 활성 탭을 기본값(decree)으로 리셋 → 다음 오픈 때 빈 탭 자동전환을
      // 다시 평가한다. 안 그러면 한 번 rule/admin으로 전환된 뒤 활성 탭이 계속 비-decree로 남아
      // (조문/법령 변경 후 재오픈 시) 가드(아래 decree 체크)에 막혀 stale·빈 탭으로 열린다.
      autoSwitchedTabRef.current = false
      setDelegationActiveTab("decree")
      return
    }
    if (autoSwitchedTabRef.current || isLoadingThreeTier) return
    if (delegationActiveTab !== "decree") return
    const decreeCount = validDelegations.filter((d) => d.type === "시행령").length
    const ruleCount = validDelegations.filter((d) => d.type === "시행규칙").length
    // 시행령에 내용이 있으면 기본 탭 유지
    if (decreeCount > 0) {
      autoSwitchedTabRef.current = true
      return
    }
    // 시행령 비고 시행규칙에 내용 → 시행규칙 탭
    if (ruleCount > 0) {
      setDelegationActiveTab("rule")
      autoSwitchedTabRef.current = true
      return
    }
    // 시행령·시행규칙 모두 비고 행정규칙만 로드돼 있으면 행정규칙 탭 (DELEG-1 잔여)
    if (hasLoadedAdminContent) {
      setDelegationActiveTab("admin")
      autoSwitchedTabRef.current = true
    }
    // 셋 다 비어 있으면(행정규칙 로드 전 포함) 가드를 세우지 않고 다음 렌더에서 재평가
  }, [tierViewMode, isLoadingThreeTier, validDelegations, delegationActiveTab, hasLoadedAdminContent])

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
