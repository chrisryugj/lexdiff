"use client"

import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from "react"
import dynamic from "next/dynamic"
import { Card } from "@/components/ui/card"
import type { LawArticle, LawMeta, RevisionHistoryItem } from "@/lib/law-types"
import { extractArticleText } from "@/lib/law-xml-parser"
import { buildJO, formatJO, formatSimpleJo as formatSimpleJoBase, type ParsedRelatedLaw } from "@/lib/law-parser"

// Dynamic import for ReferenceModal (reduce initial bundle)
const ReferenceModal = dynamic(
  () => import("@/components/reference-modal").then(m => m.ReferenceModal),
  { ssr: false }
)

// Dynamic import for AnnexModal (별표 모달)
const AnnexModal = dynamic(
  () => import("@/components/annex-modal").then(m => m.AnnexModal),
  { ssr: false }
)
import { SwipeTutorial, SwipeHint } from "@/components/swipe-tutorial"
import { parseArticleHistoryXML } from "@/lib/revision-parser"
import { clearAdminRuleContentCache } from "@/lib/admin-rule-cache"
import { useToast } from "@/hooks/use-toast"
import { useLawViewerAdminRules } from "@/hooks/use-law-viewer-admin-rules"
import { useLawViewerPrecedents } from "@/hooks/use-law-viewer-precedents"
import { useLawViewerModals } from "@/hooks/use-law-viewer-modals"
import { useLawViewerThreeTier } from "@/hooks/use-law-viewer-three-tier"
import { useContentClickHandlers } from "@/hooks/use-content-click-handlers"
import type { ContentClickContext, ContentClickActions } from "@/lib/content-click-handlers"
import { useLawViewerNavigation } from "@/hooks/use-law-viewer-navigation"
import { useRelatedPrecedentCases } from "@/hooks/use-related-precedent-cases"
import { debugLogger } from '@/lib/debug-logger'
import type { VerifiedCitation } from '@/lib/citation-verifier'
import { mergeCitationsWithRelated } from '@/lib/merge-citations'
import { LawViewerActionButtons, LawViewerRelatedCases, LawViewerOrdinanceActions, LawViewerSidebar, LawViewerHeader, LawViewerMainContent, LawViewerProvider, type LawViewerContextValue } from "@/components/law-viewer/index"
import { ImpactAnalysisPanel } from "@/components/law-viewer/impact-analysis-panel"

// ── Module-level constants (prevent new object allocation every render) ──
const DEFAULT_META = { lawTitle: '', fetchedAt: '' } as const
const EMPTY_SET = new Set<string>()
const EMPTY_ARRAY: never[] = []

// ── Props 그루핑 ──

interface LawViewerCoreProps {
  meta?: LawMeta
  articles?: LawArticle[]
  selectedJo?: string
  favorites: Set<string>
  isOrdinance: boolean
  viewMode: "single" | "full"
  isPrecedent?: boolean
  onRefresh?: () => void
  onCompare?: (jo: string) => void
  onSummarize?: (jo: string) => void
  onToggleFavorite?: (jo: string) => void
  onAiQuery?: (query: string, preEvidence?: string) => void
}

interface LawViewerAIProps {
  aiAnswerMode?: boolean
  aiAnswerContent?: string
  relatedArticles?: ParsedRelatedLaw[]
  onRelatedArticleClick?: (lawName: string, jo: string, article: string) => void
  fileSearchFailed?: boolean
  aiCitations?: VerifiedCitation[]
  userQuery?: string
  aiConfidenceLevel?: 'high' | 'medium' | 'low'
  aiQueryType?: 'definition' | 'requirement' | 'procedure' | 'comparison' | 'application' | 'consequence' | 'scope' | 'exemption'
  aiIsTruncated?: boolean
  onAiRefresh?: () => void
  // SSE 스트리밍
  isStreaming?: boolean
  searchProgress?: number
  toolCallLogs?: import("@/components/search-result-view/types").ToolCallLogEntry[]
  // 연속 대화
  conversationHistory?: import("@/components/search-result-view/types").ConversationEntry[]
  onFollowUp?: (query: string) => void
  onNewConversation?: () => void
  onStopAiStream?: () => void
}

interface LawViewerAnalysisProps {
  onDelegationGap?: (meta: LawMeta) => void
  onTimeMachine?: (meta: LawMeta) => void
  onImpactTracker?: (lawName: string) => void
  onOrdinanceSync?: (lawName: string) => void
  onOrdinanceBenchmark?: (lawName: string) => void
}

type LawViewerProps = LawViewerCoreProps & LawViewerAIProps & LawViewerAnalysisProps

function LawViewerComponent({
  meta = DEFAULT_META,
  articles = EMPTY_ARRAY,
  selectedJo,
  onCompare,
  onSummarize,
  onToggleFavorite,
  favorites = EMPTY_SET,
  isOrdinance = false,
  viewMode = "single",
  aiAnswerMode = false,
  aiAnswerContent,
  relatedArticles = EMPTY_ARRAY,
  onRelatedArticleClick,
  fileSearchFailed = false,
  aiCitations = EMPTY_ARRAY,
  userQuery = '',
  aiConfidenceLevel = 'high',
  aiQueryType = 'application',
  aiIsTruncated = false,
  onAiRefresh,
  isStreaming = false,
  searchProgress = 0,
  toolCallLogs = EMPTY_ARRAY,
  conversationHistory = EMPTY_ARRAY,
  onFollowUp,
  onNewConversation,
  onStopAiStream,
  isPrecedent = false,
  onRefresh,
  onDelegationGap,
  onTimeMachine,
  onImpactTracker,
  onOrdinanceSync,
  onOrdinanceBenchmark,
  onAiQuery,
}: LawViewerProps) {
  const isFullView = isOrdinance || viewMode === "full" || isPrecedent  // 판례는 항상 전체 뷰
  const { toast } = useToast()


  const actualArticles = useMemo(() => articles.filter((a) => !a.isPreamble), [articles])
  const preambles = useMemo(() => articles.filter((a) => a.isPreamble), [articles])

  // State for dynamically loaded articles
  const [loadedArticles, setLoadedArticles] = useState<LawArticle[]>(actualArticles)
  const [loadingJo, setLoadingJo] = useState<string | null>(null)

  const [activeJo, setActiveJo] = useState<string>(selectedJo || actualArticles[0]?.jo || "")
  const [fontSize, setFontSize] = useState<number>(15)
  const [copied, setCopied] = useState(false)
  const [isArticleListExpanded, setIsArticleListExpanded] = useState(false)
  const [isArticleListCollapsed, setIsArticleListCollapsed] = useState(false) // 조문목록 접기 상태
  const articleRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})
  const contentRef = useRef<HTMLDivElement>(null)
  const [revisionHistory, setRevisionHistory] = useState<RevisionHistoryItem[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [showImpactAnalysis, setShowImpactAnalysis] = useState(false)
  // F8: 모든 setTimeout 추적 → unmount 시 일괄 clear
  const pendingTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
  const safeSetTimeout = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      pendingTimers.current.delete(t)
      fn()
    }, ms)
    pendingTimers.current.add(t)
    return t
  }, [])
  // F4: 조문 fetch 취소용 + 최신 요청 ID 가드
  const articleAbortRef = useRef<AbortController | null>(null)
  const articleReqIdRef = useRef(0)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      pendingTimers.current.forEach(clearTimeout)
      pendingTimers.current.clear()
      articleAbortRef.current?.abort()
    }
  }, [])

  // ✅ AI 답변 법령 링크 클릭 핸들러
  const handleLawLinkClick = (lawName: string, article?: string) => {
    debugLogger.info('🔗 [AI답변] 법령 링크 클릭', { lawName, article })
    openExternalLawArticleModal(lawName, article || '')
  }

  // Citations를 ParsedRelatedLaw로 변환 후 relatedArticles와 병합
  const mergedRelatedArticles = useMemo(
    () => mergeCitationsWithRelated(aiCitations, relatedArticles),
    [aiCitations, relatedArticles],
  )

  // Parse activeJo to extract article number for admin rules matching
  const activeArticleNumber = useMemo(() => {
    if (!activeJo) return null
    // activeJo is in format "003800" -> convert to "제38조"
    const formatted = formatJO(activeJo)
    return formatted // e.g., "제38조"
  }, [activeJo])

  // Admin Rules Hook
  const {
    showAdminRules,
    setShowAdminRules,
    adminRuleViewMode,
    setAdminRuleViewMode,
    adminRuleHtml,
    setAdminRuleHtml,
    adminRuleTitle,
    setAdminRuleTitle,
    adminRuleMobileTab,
    setAdminRuleMobileTab,
    adminRulePanelSize,
    setAdminRulePanelSize,
    loadedAdminRulesCount,
    hasEverLoaded,
    adminRules,
    loadingAdminRules,
    adminRulesError,
    adminRulesProgress,
    handleViewAdminRuleFullContent,
    getLawGoKrLink,
  } = useLawViewerAdminRules(activeArticleNumber || "", meta)

  // Precedents Hook (판례 데이터)
  const {
    showPrecedents,
    setShowPrecedents,
    precedentViewMode,
    setPrecedentViewMode,
    selectedPrecedent,
    precedentPanelSize,
    setPrecedentPanelSize,
    loadingDetail: loadingPrecedentDetail,
    precedents,
    totalCount: precedentTotalCount,
    loadingPrecedents,
    precedentsError,
    handleViewPrecedentDetail,
    expandToSidePanel: expandPrecedentPanel,
    collapseToBottom: collapsePrecedentPanel,
  } = useLawViewerPrecedents(activeArticleNumber || "", meta)

  // Update loadedArticles and reset refs when articles change
  useEffect(() => {
    setLoadedArticles(actualArticles)
    articleRefs.current = {}
  }, [actualArticles])

  const activeArticle = useMemo(() => loadedArticles.find((a) => a.jo === activeJo), [loadedArticles, activeJo])

  // ✅ 즐겨찾기 키 정규화 (backward compatible)
  const favoriteKey = useCallback((jo: string) => `${meta.lawTitle}-${jo}`, [meta.lawTitle])
  const isFavorite = useCallback((jo: string) => favorites.has(favoriteKey(jo)) || favorites.has(jo), [meta.lawTitle, favorites])
  const favoriteCount = useMemo(() => actualArticles.reduce((acc, a) => acc + (isFavorite(a.jo) ? 1 : 0), 0), [actualArticles, favorites, meta.lawTitle])

  // ✅ useMemo로 HTML 생성 결과 캐싱 (중복 호출 방지)
  const activeArticleHtml = useMemo(() => {
    if (!activeArticle) return ''
    return extractArticleText(activeArticle, false, meta.lawTitle)
  }, [activeArticle?.jo, activeArticle?.content, meta.lawTitle])

  // Three-Tier hook (위임법령 데이터 및 로직)
  const {
    threeTierCitation,
    threeTierDelegation,
    isLoadingThreeTier,
    tierViewMode,
    setTierViewMode,
    delegationActiveTab,
    setDelegationActiveTab,
    delegationPanelSize,
    setDelegationPanelSize,
    currentArticleDelegations,
    currentArticleCitations,
    validDelegations,
    validCitations,
    hasValidThreeTierData,
    hasValidSihyungkyuchik,
    threeTierDataType,
    tierItems,
    fetchThreeTierData,
  } = useLawViewerThreeTier(meta, activeJo, activeArticle, aiAnswerMode, isOrdinance)

  // 위임법령 버튼 비활성화 조건 계산
  // 1. 위임법령 데이터가 로드된 적 있음 (threeTierDelegation 존재)
  // 2. 현재 조문에 시행령/시행규칙 없음 (validDelegations.length === 0)
  // 3. 행정규칙이 로드된 적 있으나 현재 조문과 연관 없음 (showAdminRules && adminRules.length === 0)
  const shouldDisableDelegationButton =
    threeTierDelegation !== null && // 위임법령 데이터 로드됨
    validDelegations.length === 0 && // 시행령/시행규칙 없음
    (!showAdminRules || (showAdminRules && adminRules.length === 0)) // 행정규칙도 없거나 연관 없음

  // 위임법령 버튼 카운트 (시행령 + 시행규칙 + 행정규칙)
  const delegationButtonCount = validDelegations.length + (showAdminRules ? adminRules.length : 0)


  // Modals hook (must be after activeArticle is defined)
  const {
    refModal,
    setRefModal,
    refModalHistory,
    setRefModalHistory,
    lastExternalRef,
    setLastExternalRef,
    openExternalLawArticleModal,
    openRelatedLawModal,
    openLawHierarchyModal,
    handleRefModalBack,
    handleViewFullLaw,
    handleSearchArticle,
    // 별표 모달
    annexModal,
    openAnnexModal,
    closeAnnexModal,
  } = useLawViewerModals(meta, activeArticle)

  // Sync selectedJo → activeJo ONLY when selectedJo prop changes.
  // ⚠️ 이전 버전은 deps에 activeJo를 두어, 사이드바 클릭으로 activeJo가 바뀌면
  // 이펙트가 재실행되며 다시 selectedJo로 덮어씌우는 버그가 있었음.
  // selectedJo 변화만 추적하려고 prev ref 패턴 사용.
  const prevSelectedJoRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!selectedJo) return
    if (selectedJo === prevSelectedJoRef.current) return
    prevSelectedJoRef.current = selectedJo

    setActiveJo(selectedJo)

    // Reset admin rules when changing articles to prevent unnecessary searches
    setShowAdminRules(false)
    setAdminRuleViewMode("list")
    setAdminRuleHtml(null)

    // Reset tier view mode to 1-tier when changing articles
    setTierViewMode("1-tier")

    if (!isFullView && contentRef.current) {
      safeSetTimeout(() => {
        contentRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      }, 100)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJo])

  // Reset admin rules state when law changes
  useEffect(() => {
    setShowAdminRules(false)
    setAdminRuleViewMode("list")
  }, [meta.lawTitle, setShowAdminRules, setAdminRuleViewMode])

  const fetchRevisionHistory = async (jo: string) => {
    if (!meta.lawId || !jo) return

    setIsLoadingHistory(true)
    try {
      const params = new URLSearchParams({
        lawId: meta.lawId,
        jo: jo,
      })

      const response = await fetch(`/api/article-history?${params.toString()}`)

      if (!response.ok) {
        const contentType = response.headers.get("content-type")
        if (contentType?.includes("application/json")) {
          const errorData = await response.json()
          // Silently fail - this is expected for some laws
        } else {
        }
        setRevisionHistory([])
        return
      }

      const xmlText = await response.text()

      const history = parseArticleHistoryXML(xmlText)

      setRevisionHistory(history)
    } catch (error) {
      debugLogger.warning('[LawViewer] article fetch failed', error)
      setRevisionHistory([])
    } finally {
      setIsLoadingHistory(false)
    }
  }

  useEffect(() => {

    if (!meta.lawId) {
      return
    }
    // AI 모드에서는 article-history API 호출 스킵 (lawId가 'ai-answer'인 경우)
    if (meta.lawId === 'ai-answer') {
      return
    }
    // 판례 모드에서는 조문이력 API 호출 불필요
    if (isPrecedent) {
      return
    }
    if (isOrdinance) {
      return
    }
    if (!activeJo) {
      return
    }

    fetchRevisionHistory(activeJo)
  }, [meta.lawId, activeJo, isOrdinance, isPrecedent])

  // 관련 심급 훅
  const {
    showRelatedCases,
    setShowRelatedCases,
    relatedCases,
    loadingRelatedCases,
    hasLevelSection,
    currentCourtLevel,
    handleRelatedPrecedentClick,
  } = useRelatedPrecedentCases({
    isPrecedent,
    meta,
    actualArticles,
    setRefModal,
  })

  const handleArticleClick = useCallback((jo: string) => {

    // Close article list on mobile after selection
    setIsArticleListExpanded(false)

    // ✅ 단문 조회 모드에서만 스크롤을 top으로
    if (!isFullView) {
      const scrollToTop = () => {
        if (contentRef.current) {
          const scrollContainer = contentRef.current.querySelector('[data-radix-scroll-area-viewport]')
          if (scrollContainer) {
            scrollContainer.scrollTop = 0
            scrollContainer.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
          }
        }
      }

      scrollToTop()
      safeSetTimeout(scrollToTop, 50)
    }

    // Check if article is already loaded
    const existingArticle = loadedArticles.find((a) => a.jo === jo)

    if (!existingArticle && !isOrdinance && (meta.lawId || meta.mst)) {
      // F4: 이전 fetch 취소 + 요청 ID 가드
      articleAbortRef.current?.abort()
      const ctrl = new AbortController()
      articleAbortRef.current = ctrl
      const reqId = ++articleReqIdRef.current

      setLoadingJo(jo)

      const params = new URLSearchParams()
      if (meta.lawId) params.append("lawId", meta.lawId)
      else if (meta.mst) params.append("mst", meta.mst)
      params.append("jo", jo)

      ;(async () => {
        try {
          const response = await fetch(`/api/eflaw?${params.toString()}`, { signal: ctrl.signal })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const xmlText = await response.text()
          const { parseLawXML } = await import("@/lib/law-xml-parser")
          const parsed = parseLawXML(xmlText)

          if (!mountedRef.current || reqId !== articleReqIdRef.current) return

          if (parsed.articles.length > 0) {
            const newArticle = parsed.articles[0]
            setLoadedArticles((prev) => {
              if (prev.find((a) => a.jo === newArticle.jo)) return prev
              return [...prev, newArticle]
            })
          }
        } catch (error) {
          if ((error as { name?: string })?.name === 'AbortError') return
          debugLogger.warning('[LawViewer] article fetch failed', error)
        } finally {
          if (mountedRef.current && reqId === articleReqIdRef.current) {
            setLoadingJo(null)
          }
        }
      })()
    }

    // Always set active JO immediately (UI 반응성)
    setActiveJo(jo)
  }, [isFullView, loadedArticles, isOrdinance, meta.lawId, meta.mst, safeSetTimeout])

  // Keyboard/Swipe navigation (refModal, handleArticleClick 선언 이후)
  const { swipeRef, swipeHint, dismissSwipeHint } = useLawViewerNavigation({
    activeJo,
    actualArticles,
    isModalOpen: refModal.open,
    onNavigate: handleArticleClick,
  })

  const increaseFontSize = useCallback(() => setFontSize((prev) => Math.min(prev + 2, 28)), [])
  const decreaseFontSize = useCallback(() => setFontSize((prev) => Math.max(prev - 2, 10)), [])
  const resetFontSize = useCallback(() => setFontSize(15), [])

  const handleCopy = async () => {
    if (!contentRef.current) return
    const textContent = contentRef.current.innerText
    const title = activeArticle
      ? `${meta.lawTitle} ${formatJO(activeArticle.jo)}${activeArticle.title ? ` (${activeArticle.title})` : ""}`
      : meta.lawTitle
    await navigator.clipboard.writeText(`${title}\n\n${textContent}`)
    setCopied(true)
    safeSetTimeout(() => {
      if (mountedRef.current) setCopied(false)
    }, 2000)
  }

  const openLawCenter = useCallback(() => {
    const lawTitle = meta.lawTitle

    // 판례 모드: 사건번호로 검색 링크 생성
    if (isPrecedent) {
      // meta.caseNumber가 있으면 사건번호로 검색, 없으면 사건명으로 검색
      const caseNumber = meta.caseNumber
      const searchQuery = caseNumber || lawTitle
      const url = `https://www.law.go.kr/precSc.do?menuId=7&subMenuId=47&tabMenuId=213&query=${encodeURIComponent(searchQuery)}`
      window.open(url, "_blank", "noopener,noreferrer")
      return
    }

    if (isOrdinance) {
      // 조례는 다른 URL 형식 사용
      const url = `https://www.law.go.kr/자치법규/${encodeURIComponent(lawTitle)}`
      window.open(url, "_blank", "noopener,noreferrer")
    } else if (isFullView || !activeArticle) {
      const url = `https://www.law.go.kr/법령/${encodeURIComponent(lawTitle)}`
      window.open(url, "_blank", "noopener,noreferrer")
    } else {
      const articleNum = formatJO(activeArticle.jo)
      const url = `https://www.law.go.kr/법령/${encodeURIComponent(lawTitle)}/${articleNum}`
      window.open(url, "_blank", "noopener,noreferrer")
    }
  }, [meta.lawTitle, meta.caseNumber, isPrecedent, isOrdinance, isFullView, activeArticle])

  const formatSimpleJo = useCallback(
    (jo: string, forceOrdinance = false): string => formatSimpleJoBase(jo, isOrdinance || forceOrdinance),
    [isOrdinance],
  )

  // Content Click Handlers - 링크 클릭 이벤트 처리 (분리된 훅 사용)
  const contentClickContext: ContentClickContext = useMemo(() => ({
    meta,
    articles,
    activeArticle,
    aiAnswerMode,
    userQuery,
    aiAnswerContent,
    aiCitations,
    relatedArticles,
    tierViewMode,
    threeTierDelegation,
    threeTierCitation,
    validDelegations,
    showAdminRules,
    lastExternalRef,
    refModal,
  }), [
    meta, articles, activeArticle, aiAnswerMode, userQuery, aiAnswerContent,
    aiCitations, relatedArticles, tierViewMode, threeTierDelegation,
    threeTierCitation, validDelegations, showAdminRules, lastExternalRef, refModal
  ])

  const contentClickActions: ContentClickActions = useMemo(() => ({
    setActiveJo,
    openExternalLawArticleModal,
    setRefModal,
    setRefModalHistory,
    setLastExternalRef,
    fetchThreeTierData,
    setTierViewMode,
    setDelegationActiveTab,
    setShowAdminRules,
    setAdminRuleViewMode,
    setAdminRuleHtml,
    toast,
    // 별표 모달 액션
    openAnnexModal,
  }), [
    setActiveJo, openExternalLawArticleModal, setRefModal, setRefModalHistory, setLastExternalRef,
    fetchThreeTierData, setTierViewMode, setDelegationActiveTab, setShowAdminRules,
    setAdminRuleViewMode, setAdminRuleHtml, toast, openAnnexModal
  ])

  const { handleContentClick } = useContentClickHandlers(contentClickContext, contentClickActions)

  // AI 추천 질의 — 법령 액션 핸들러 (시행령/별표/판례 등)
  const handleLawAction = useCallback((action: string) => {
    switch (action) {
      case 'three_tier':
        if (tierViewMode === '1-tier') {
          if (!threeTierDelegation && !threeTierCitation) fetchThreeTierData()
          setTierViewMode('2-tier')
        }
        break
      case 'annexes':
        if (meta?.lawTitle) openAnnexModal('', meta.lawTitle, meta.lawId)
        break
      case 'precedents':
        setShowPrecedents(true)
        break
      case 'history':
        // 조문 이력은 이미 LawViewerSingleArticle에서 표시
        break
    }
  }, [tierViewMode, threeTierDelegation, threeTierCitation, fetchThreeTierData, setTierViewMode, meta, openAnnexModal, setShowPrecedents])

  // ─── LawViewerContext value ───
  const ctxValue: LawViewerContextValue = useMemo(() => ({
    meta,
    isPrecedent,
    isOrdinance,
    aiAnswerMode,
    viewMode,
    fontSize,
    increaseFontSize,
    decreaseFontSize,
    resetFontSize,
    favorites,
    isFavorite,
    favoriteKey,
    onToggleFavorite,
    onCompare,
    onSummarize,
    onRefresh,
    onDelegationGap,
    onTimeMachine,
    onImpactTracker: () => setShowImpactAnalysis(prev => !prev),
    onOrdinanceSync,
    onOrdinanceBenchmark,
    openLawCenter,
    formatSimpleJo,
  }), [
    meta, isPrecedent, isOrdinance, aiAnswerMode, viewMode,
    fontSize, increaseFontSize, decreaseFontSize, resetFontSize,
    favorites, isFavorite, favoriteKey,
    onToggleFavorite, onCompare, onSummarize, onRefresh,
    onDelegationGap, onTimeMachine, onOrdinanceSync, onOrdinanceBenchmark,
    openLawCenter, formatSimpleJo,
  ])

  // Props 그룹화 (LawViewerMainContent용)
  const fontProps = useMemo(() => ({
    fontSize,
    setFontSize,
    increaseFontSize,
    decreaseFontSize,
    resetFontSize,
  }), [fontSize])

  const aiAnswerPropsGroup = useMemo(() => ({
    content: aiAnswerContent,
    userQuery,
    confidenceLevel: aiConfidenceLevel,
    fileSearchFailed,
    citations: aiCitations,
    queryType: aiQueryType,
    isTruncated: aiIsTruncated,
    onRefresh: onAiRefresh,
    isStreaming,
    searchProgress,
    onLawClick: handleLawLinkClick,
    toolCallLogs,
    conversationHistory,
    onFollowUp,
    onNewConversation,
    onStop: onStopAiStream,
  }), [aiAnswerContent, userQuery, aiConfidenceLevel, fileSearchFailed, aiCitations, aiQueryType, aiIsTruncated, onAiRefresh, isStreaming, searchProgress, toolCallLogs, conversationHistory, onFollowUp, onNewConversation, onStopAiStream])

  const delegationPropsGroup = useMemo(() => ({
    validDelegations,
    isLoading: isLoadingThreeTier,
    activeTab: delegationActiveTab,
    setActiveTab: setDelegationActiveTab,
    panelSize: delegationPanelSize,
    setPanelSize: setDelegationPanelSize,
    showAdminRules,
    setShowAdminRules,
    loadingAdminRules,
    loadedAdminRulesCount,
    hasEverLoaded,
    adminRules,
    adminRulesProgress,
    adminRuleViewMode,
    setAdminRuleViewMode,
    adminRuleHtml,
    adminRuleTitle,
    handleViewAdminRuleFullContent,
  }), [validDelegations, isLoadingThreeTier, delegationActiveTab, delegationPanelSize, showAdminRules, loadingAdminRules, loadedAdminRulesCount, hasEverLoaded, adminRules, adminRulesProgress, adminRuleViewMode, adminRuleHtml, adminRuleTitle])

  const precedentPropsGroup = useMemo(() => ({
    showPrecedents,
    viewMode: precedentViewMode,
    panelSize: precedentPanelSize,
    setPanelSize: setPrecedentPanelSize,
    precedents,
    totalCount: precedentTotalCount,
    loading: loadingPrecedents,
    error: precedentsError,
    selectedPrecedent,
    loadingDetail: loadingPrecedentDetail,
    handleViewDetail: handleViewPrecedentDetail,
    expandPanel: expandPrecedentPanel,
    collapsePanel: collapsePrecedentPanel,
  }), [showPrecedents, precedentViewMode, precedentPanelSize, precedents, precedentTotalCount, loadingPrecedents, precedentsError, selectedPrecedent, loadingPrecedentDetail])

  return (
    <LawViewerProvider value={ctxValue}>
      <div className="w-full max-w-full mx-auto lg:max-w-[1280px] overflow-hidden">
        <div
          className={`relative grid gap-0 sm:gap-4 min-h-0 lg:h-[calc(100vh-80px)] ${
            isArticleListCollapsed
              ? 'grid-cols-1 lg:grid-cols-[64px_1fr]'
              : 'grid-cols-1 lg:grid-cols-[1fr_4fr]'
          }`}
          style={{ fontFamily: "Pretendard, sans-serif" }}
        >
          {/* Left Sidebar + Mobile Bottom Sheet + FAB */}
          <LawViewerSidebar
            isArticleListCollapsed={isArticleListCollapsed}
            setIsArticleListCollapsed={setIsArticleListCollapsed}
            isArticleListExpanded={isArticleListExpanded}
            setIsArticleListExpanded={setIsArticleListExpanded}
            actualArticles={actualArticles}
            relatedArticles={relatedArticles}
            mergedRelatedArticles={mergedRelatedArticles}
            activeJo={activeJo}
            loadingJo={loadingJo}
            isStreaming={isStreaming}
            handleArticleClick={handleArticleClick}
            openExternalLawArticleModal={openExternalLawArticleModal}
          />

          {/* Right panel - Article content */}
          <Card className="flex flex-col overflow-hidden h-auto lg:h-full p-0 gap-0 min-w-0 max-w-full">
            {/* Header - Hidden in AI Answer Mode */}
            {!aiAnswerMode && (
              <LawViewerHeader
                meta={meta}
                isPrecedent={isPrecedent}
                isOrdinance={isOrdinance}
                viewMode={viewMode}
                activeArticle={activeArticle}
                hasLevelSection={hasLevelSection}
                currentCourtLevel={currentCourtLevel}
                favoriteCount={favoriteCount}
                articlesLength={articles.length}
                formatSimpleJo={formatSimpleJo}
              />
            )}

            {/* Action Buttons */}
            <LawViewerActionButtons
              activeArticle={activeArticle ?? null}
              actualArticles={actualArticles}
              hasLevelSection={hasLevelSection}
              showRelatedCases={showRelatedCases}
              setShowRelatedCases={setShowRelatedCases}
              loadingRelatedCases={loadingRelatedCases}
              relatedCases={relatedCases}
              tierViewMode={tierViewMode}
              setTierViewMode={setTierViewMode}
              threeTierDelegation={threeTierDelegation}
              threeTierCitation={threeTierCitation}
              isLoadingThreeTier={isLoadingThreeTier}
              fetchThreeTierData={fetchThreeTierData}
              shouldDisableDelegationButton={shouldDisableDelegationButton}
              delegationButtonCount={delegationButtonCount}
              delegationActiveTab={delegationActiveTab}
              loadedAdminRulesCount={loadedAdminRulesCount}
              setShowAdminRules={setShowAdminRules}
              showPrecedents={showPrecedents}
              setShowPrecedents={setShowPrecedents}
              precedentTotalCount={precedentTotalCount}
            />

            {/* 판례 관련 심급 목록 */}
            <LawViewerRelatedCases
              isPrecedent={isPrecedent}
              showRelatedCases={showRelatedCases}
              loadingRelatedCases={loadingRelatedCases}
              relatedCases={relatedCases}
              onRelatedPrecedentClick={handleRelatedPrecedentClick}
            />

            {/* 조례 전용 액션 버튼 */}
            <LawViewerOrdinanceActions
              actualArticles={actualArticles}
            />

            {/* 영향 분석 패널 */}
            {showImpactAnalysis && (
              <ImpactAnalysisPanel
                lawId={meta?.mst || meta?.lawId}
                jo={activeArticle?.jo}
                lawTitle={meta?.lawTitle}
                onClose={() => setShowImpactAnalysis(false)}
              />
            )}

            <LawViewerMainContent
              contentRef={contentRef}
              swipeRef={swipeRef}
              aiAnswerMode={aiAnswerMode}
              viewMode={viewMode}
              tierViewMode={tierViewMode}
              isOrdinance={isOrdinance}
              isPrecedent={isPrecedent}
              activeArticle={activeArticle}
              activeArticleHtml={activeArticleHtml}
              actualArticles={actualArticles}
              preambles={preambles}
              activeJo={activeJo}
              articleRefs={articleRefs}
              meta={meta}
              revisionHistory={revisionHistory}
              fontProps={fontProps}
              aiAnswerProps={aiAnswerPropsGroup}
              delegationProps={delegationPropsGroup}
              precedentProps={precedentPropsGroup}
              handleContentClick={handleContentClick}
              onRefresh={onRefresh}
              onToggleFavorite={onToggleFavorite}
              isFavorite={isFavorite}
              formatSimpleJo={formatSimpleJo}
              onAiQuery={onAiQuery}
              onLawAction={handleLawAction}
            />
          </Card >
          <ReferenceModal
            isOpen={refModal.open}
            onClose={() => {
              setRefModal({ open: false })
              setRefModalHistory([]) // 히스토리 초기화
              setLastExternalRef(null) // P1-LV-2: stale 외부 ref 초기화
            }}
            title={refModal.title || "연결된 본문"}
            html={refModal.html}
            onContentClick={handleContentClick}
            forceWhiteTheme={refModal.forceWhiteTheme}
            lawName={refModal.lawName}
            articleNumber={refModal.articleNumber}
            hasHistory={refModalHistory.length > 0}
            onBack={handleRefModalBack}
            loading={refModal.loading}
            precedentMeta={refModal.precedentMeta}
            onViewFullLaw={handleViewFullLaw}
            onSearchArticle={handleSearchArticle}
          />
          <AnnexModal
            isOpen={annexModal.open}
            onClose={closeAnnexModal}
            annexNumber={annexModal.annexNumber}
            lawName={annexModal.lawName}
            lawId={annexModal.lawId}
            onLawClick={(lawName, article) => {
              // 별표 모달 내에서 법령 링크 클릭 시
              closeAnnexModal()
              if (article) {
                openExternalLawArticleModal(lawName, article)
              }
            }}
          />
        </div >

        {/* Swipe Tutorial (첫 방문 시 표시) */}
        <SwipeTutorial onComplete={() => { }} />

        {/* Swipe Hint (스와이프 시 힌트 표시) */}
        {
          swipeHint && (
            <SwipeHint
              direction={swipeHint.direction}
              onDismiss={dismissSwipeHint}
            />
          )
        }
      </div>
    </LawViewerProvider>
  )
}

// React.memo로 불필요한 리렌더링 방지
export const LawViewer = memo(LawViewerComponent)
