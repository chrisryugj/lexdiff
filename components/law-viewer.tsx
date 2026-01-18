"use client"

import React, { useState, useEffect, useRef, useMemo, memo } from "react"
import dynamic from "next/dynamic"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import type { LawArticle, LawMeta, ThreeTierData } from "@/lib/law-types"
import { cn } from "@/lib/utils"
import { extractArticleText, formatDelegationContent } from "@/lib/law-xml-parser"
import { buildJO, formatJO, formatSimpleJo, type ParsedRelatedLaw } from "@/lib/law-parser"

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
import { VirtualizedFullArticleView } from "@/components/virtualized-full-article-view"
import { DelegationLoadingSkeleton } from "@/components/delegation-loading-skeleton"
import { DelegationPanel } from "@/components/law-viewer-delegation-panel"
import { PrecedentDetailPanel } from "@/components/precedent-section"
import { SwipeTutorial, SwipeHint } from "@/components/swipe-tutorial"
import { parseArticleHistoryXML, formatDate } from "@/lib/revision-parser"
import { clearAdminRuleContentCache } from "@/lib/admin-rule-cache"
import { useToast } from "@/hooks/use-toast"
import { useLawViewerAdminRules } from "@/hooks/use-law-viewer-admin-rules"
import { useLawViewerPrecedents } from "@/hooks/use-law-viewer-precedents"
import { useLawViewerModals } from "@/hooks/use-law-viewer-modals"
import { useLawViewerThreeTier } from "@/hooks/use-law-viewer-three-tier"
import { useContentClickHandlers } from "@/hooks/use-content-click-handlers"
import type { ContentClickContext, ContentClickActions } from "@/lib/content-click-handlers"
import { useSwipe } from "@/hooks/use-swipe"
import { useRelatedPrecedentCases } from "@/hooks/use-related-precedent-cases"
import { debugLogger } from '@/lib/debug-logger'
import type { VerifiedCitation } from '@/lib/citation-verifier'
import { AIAnswerContent } from "@/components/law-viewer-ai-answer"
import { LawViewerActionButtons, LawViewerRelatedCases, LawViewerOrdinanceActions, LawViewerSidebar, LawViewerSingleArticle } from "@/components/law-viewer/index"

interface LawViewerProps {
  meta?: LawMeta
  articles?: LawArticle[]
  selectedJo?: string
  onCompare?: (jo: string) => void
  onSummarize?: (jo: string) => void
  onToggleFavorite?: (jo: string) => void
  favorites: Set<string>
  isOrdinance: boolean
  viewMode: "single" | "full"

  // AI 답변 모드 (File Search RAG)
  aiAnswerMode?: boolean
  aiAnswerContent?: string
  relatedArticles?: ParsedRelatedLaw[]
  onRelatedArticleClick?: (lawName: string, jo: string, article: string) => void
  fileSearchFailed?: boolean  // 검색 실패 여부
  aiCitations?: VerifiedCitation[]  // ✅ 검증된 인용 목록
  userQuery?: string   // 사용자 질의
  aiConfidenceLevel?: 'high' | 'medium' | 'low'  // AI 신뢰도
  aiQueryType?: 'definition' | 'requirement' | 'procedure' | 'comparison' | 'application' | 'consequence' | 'scope' | 'exemption'  // ✅ 8가지 법률 질문 유형
  aiIsTruncated?: boolean  // ✅ Phase 7: 답변 잘림 여부
  onAiRefresh?: () => void  // ✅ AI 답변 강제 새로고침 (캐시 무시)

  // ✅ Phase 11-B: ChatGPT 스타일 스트리밍 (신규)
  isStreaming?: boolean  // 스트리밍 중 여부
  searchProgress?: number  // 진행률 (0-100)

  // ✅ 판례 모드
  isPrecedent?: boolean  // 판례 뷰 여부

  // ✅ 강제 새로고침 (법령/판례 뷰용)
  onRefresh?: () => void
}

function LawViewerComponent({
  meta = { lawTitle: '', fetchedAt: new Date().toISOString() },
  articles = [],
  selectedJo,
  onCompare,
  onSummarize,
  onToggleFavorite,
  favorites = new Set(),
  isOrdinance = false,
  viewMode = "single",
  aiAnswerMode = false,
  aiAnswerContent,
  relatedArticles = [],
  onRelatedArticleClick,
  fileSearchFailed = false,
  aiCitations = [],
  userQuery = '',
  aiConfidenceLevel = 'high',
  aiQueryType = 'application',
  aiIsTruncated = false,
  onAiRefresh,
  isStreaming = false,
  searchProgress = 0,
  isPrecedent = false,
  onRefresh,
}: LawViewerProps) {
  const isFullView = isOrdinance || viewMode === "full" || isPrecedent  // 판례는 항상 전체 뷰
  const { toast } = useToast()


  const actualArticles = articles.filter((a) => !a.isPreamble)
  const preambles = articles.filter((a) => a.isPreamble)

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
  const [revisionHistory, setRevisionHistory] = useState<any[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Swipe tutorial and hints
  const [swipeHint, setSwipeHint] = useState<{ direction: "left" | "right" } | null>(null)



  // ✅ AI 답변 법령 링크 클릭 핸들러
  const handleLawLinkClick = (lawName: string, article?: string) => {
    debugLogger.info('🔗 [AI답변] 법령 링크 클릭', { lawName, article })
    openExternalLawArticleModal(lawName, article || '')
  }

  // ✅ Citations를 ParsedRelatedLaw 형식으로 변환 및 병합
  const mergedRelatedArticles = useMemo(() => {
    if (!aiCitations || aiCitations.length === 0) {
      return relatedArticles
    }

    // Citations를 ParsedRelatedLaw로 변환
    const citationsAsRelatedLaws: ParsedRelatedLaw[] = aiCitations
      .filter(c => c.lawName && c.articleNum)
      .map(citation => {
        const articleNum = citation.articleNum.replace(/^제/, '').replace(/조$/, '')
        const jo = buildJO(articleNum)

        // ✅ 조문 제목 보완: citation에 제목이 없으면 relatedArticles에서 찾기
        let title = citation.articleTitle
        if (!title && relatedArticles.length > 0) {
          const matching = relatedArticles.find(
            r => r.lawName === citation.lawName && r.article === citation.articleNum && r.title
          )
          if (matching) {
            title = matching.title
          }
        }

        return {
          lawName: citation.lawName,
          article: citation.articleNum,
          jo,
          title,  // ✅ 조문 제목 (보완 포함)
          display: `${citation.lawName} ${citation.articleNum}`,
          source: 'citation' as any,  // ✅ Citations 전용 source (기존 'excerpt' | 'related'과 별개)
          fullText: citation.text
        }
      })

    // relatedArticles와 병합 (중복 허용 - 사이드바에서 source별로 그룹화하여 아이콘 표시)
    // 같은 법령이 본문(excerpt/related)과 AI 인용(citation) 둘 다 있으면 둘 다 유지
    const merged = [...relatedArticles, ...citationsAsRelatedLaws]

    debugLogger.info('Citations 병합 완료', {
      citations: aiCitations.length,
      relatedArticles: relatedArticles.length,
      merged: merged.length
    })

    return merged
  }, [aiCitations, relatedArticles])

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
  }, [articles])

  const activeArticle = loadedArticles.find((a) => a.jo === activeJo)

  // ✅ 즐겨찾기 키 정규화 (backward compatible)
  const favoriteKey = (jo: string) => `${meta.lawTitle}-${jo}`
  const isFavorite = (jo: string) => favorites.has(favoriteKey(jo)) || favorites.has(jo)
  const favoriteCount = actualArticles.reduce((acc, a) => acc + (isFavorite(a.jo) ? 1 : 0), 0)

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
    // 별표 모달
    annexModal,
    openAnnexModal,
    closeAnnexModal,
  } = useLawViewerModals(meta, activeArticle)

  // Sync selectedJo → activeJo and reset related states
  useEffect(() => {

    // Only update activeJo if selectedJo is different from current activeJo
    // This prevents overriding user clicks from the sidebar
    if (selectedJo && selectedJo !== activeJo) {
      setActiveJo(selectedJo)

      // Reset admin rules when changing articles to prevent unnecessary searches
      setShowAdminRules(false)
      setAdminRuleViewMode("list")
      setAdminRuleHtml(null)

      // Reset tier view mode to 1-tier when changing articles
      setTierViewMode("1-tier")

      if (!isFullView && contentRef.current) {
        setTimeout(() => {
          contentRef.current?.scrollTo({ top: 0, behavior: "smooth" })
        }, 100)
      }
    }
  }, [selectedJo, isFullView])

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

  const handleArticleClick = async (jo: string) => {

    // Close article list on mobile after selection
    setIsArticleListExpanded(false)

    // ✅ 단문 조회 모드에서만 스크롤을 top으로 (전문 조회는 VirtualizedFullArticleView가 처리)
    if (!isFullView) {
      // Scroll content area to top - do this first before any state updates
      const scrollToTop = () => {
        if (contentRef.current) {
          const scrollContainer = contentRef.current.querySelector('[data-radix-scroll-area-viewport]')
          if (scrollContainer) {
            scrollContainer.scrollTop = 0
            // Also use scrollTo for better browser compatibility
            scrollContainer.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
          }
        }
      }

      // Scroll immediately
      scrollToTop()

      // Scroll again after a short delay to ensure it works after state updates
      setTimeout(scrollToTop, 50)
    }

    // Check if article is already loaded
    const existingArticle = loadedArticles.find((a) => a.jo === jo)

    if (!existingArticle && !isOrdinance && (meta.lawId || meta.mst)) {
      // Article not loaded - fetch it dynamically
      setLoadingJo(jo)

      try {
        const params = new URLSearchParams()
        if (meta.lawId) {
          params.append("lawId", meta.lawId)
        } else if (meta.mst) {
          params.append("mst", meta.mst)
        }
        params.append("jo", jo)

        const response = await fetch(`/api/eflaw?${params.toString()}`)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const xmlText = await response.text()
        const { parseLawXML } = await import("@/lib/law-xml-parser")
        const parsed = parseLawXML(xmlText)

        // Add newly fetched article to loadedArticles
        if (parsed.articles.length > 0) {
          const newArticle = parsed.articles[0]
          setLoadedArticles((prev) => {
            // Avoid duplicates
            const existing = prev.find((a) => a.jo === newArticle.jo)
            if (existing) {
              return prev
            }
            return [...prev, newArticle]
          })
        }
      } catch (error) {
      } finally {
        setLoadingJo(null)
      }
    }

    // Always set active JO after loading attempt
    setActiveJo(jo)

    // ✅ 전문 조회 모드는 VirtualizedFullArticleView의 useEffect에서 자동 스크롤
    // 단문 조회 모드만 여기서 처리
    if (!isFullView) {
      // 단문 조회 모드 로직 (필요시 추가)
    }
  }

  // Swipe navigation handlers (mobile only)
  const handleSwipeLeft = () => {
    // Swipe left = next article
    const currentIndex = actualArticles.findIndex(a => a.jo === activeJo)
    if (currentIndex < actualArticles.length - 1) {
      const nextArticle = actualArticles[currentIndex + 1]
      setSwipeHint({ direction: "left" }) // Show hint
      handleArticleClick(nextArticle.jo)
    }
  }

  const handleSwipeRight = () => {
    // Swipe right = previous article
    const currentIndex = actualArticles.findIndex(a => a.jo === activeJo)
    if (currentIndex > 0) {
      const prevArticle = actualArticles[currentIndex - 1]
      setSwipeHint({ direction: "right" }) // Show hint
      handleArticleClick(prevArticle.jo)
    }
  }

  // Apply swipe gestures to content area (mobile only)
  const swipeRef = useSwipe<HTMLDivElement>({
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
  }, {
    threshold: 80, // Require 80px swipe distance
    timeThreshold: 400, // Within 400ms
  })

  // 키보드 화살표 네비게이션 (조문 간 이동)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 입력 필드에 포커스 있으면 무시
      const activeEl = document.activeElement
      if (activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA') {
        return
      }

      // 모달이 열려 있으면 무시
      if (refModal.open) {
        return
      }

      const currentIndex = actualArticles.findIndex(a => a.jo === activeJo)
      if (currentIndex === -1) return

      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        // 이전 조문
        if (currentIndex > 0) {
          e.preventDefault()
          handleArticleClick(actualArticles[currentIndex - 1].jo)
        }
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        // 다음 조문
        if (currentIndex < actualArticles.length - 1) {
          e.preventDefault()
          handleArticleClick(actualArticles[currentIndex + 1].jo)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeJo, actualArticles, refModal.open])

  const increaseFontSize = () => setFontSize((prev) => Math.min(prev + 2, 28))
  const decreaseFontSize = () => setFontSize((prev) => Math.max(prev - 2, 10))
  const resetFontSize = () => setFontSize(15)

  const handleCopy = async () => {
    if (!contentRef.current) return
    const textContent = contentRef.current.innerText
    const title = activeArticle
      ? `${meta.lawTitle} ${formatJO(activeArticle.jo)}${activeArticle.title ? ` (${activeArticle.title})` : ""}`
      : meta.lawTitle
    await navigator.clipboard.writeText(`${title}\n\n${textContent}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const openLawCenter = () => {
    const lawTitle = meta.lawTitle

    // 판례 모드: 사건번호로 검색 링크 생성
    if (isPrecedent) {
      // meta.caseNumber가 있으면 사건번호로 검색, 없으면 사건명으로 검색
      const caseNumber = (meta as any).caseNumber
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
  }

  const formatSimpleJo = useMemo(() => {
    return (jo: string, forceOrdinance = false): string => {
      // Already formatted (e.g., "제1조", "제10조의2")
      if (jo.startsWith("제") && jo.includes("조")) {
        return jo
      }

      // 6자리 숫자 코드 처리
      if (jo.length === 6 && /^\d{6}$/.test(jo)) {
        // 조례 여부 판단: isOrdinance 또는 forceOrdinance가 true
        const shouldUseOrdinanceFormat = isOrdinance || forceOrdinance

        if (shouldUseOrdinanceFormat) {
          // Ordinance format: AABBCC (AA = article, BB = branch, CC = sub)
          // Example: "010000" = 제1조, "010100" = 제1조의1
          const articleNum = Number.parseInt(jo.substring(0, 2), 10)
          const branchNum = Number.parseInt(jo.substring(2, 4), 10)
          const subNum = Number.parseInt(jo.substring(4, 6), 10)

          let result = `제${articleNum}조`
          if (branchNum > 0) result += `의${branchNum}`
          if (subNum > 0) result += `-${subNum}`

          return result
        } else {
          // Law format: AAAABB (AAAA = article, BB = branch)
          const articleNum = Number.parseInt(jo.substring(0, 4), 10)
          const branchNum = Number.parseInt(jo.substring(4, 6), 10)
          return branchNum === 0 ? `제${articleNum}조` : `제${articleNum}조의${branchNum}`
        }
      }

      // 8-digit code format (fallback)
      if (jo.length === 8 && /^\d{8}$/.test(jo)) {
        const articleNum = Number.parseInt(jo.substring(0, 4), 10)
        const branchNum = Number.parseInt(jo.substring(4, 6), 10)
        const subNum = Number.parseInt(jo.substring(6, 8), 10)

        let result = `제${articleNum}조`
        if (branchNum > 0) result += `의${branchNum}`
        if (subNum > 0) result += `-${subNum}`

        return result
      }

      // Fallback: return as-is
      return jo
    }
  }, [isOrdinance])

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



  return (
    <>
      <div className="w-full mx-auto lg:max-w-[1280px]">
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
            aiAnswerMode={aiAnswerMode}
            isPrecedent={isPrecedent}
            isOrdinance={isOrdinance}
            isArticleListCollapsed={isArticleListCollapsed}
            setIsArticleListCollapsed={setIsArticleListCollapsed}
            isArticleListExpanded={isArticleListExpanded}
            setIsArticleListExpanded={setIsArticleListExpanded}
            meta={meta}
            actualArticles={actualArticles}
            relatedArticles={relatedArticles}
            mergedRelatedArticles={mergedRelatedArticles}
            activeJo={activeJo}
            loadingJo={loadingJo}
            favorites={favorites}
            isStreaming={isStreaming}
            handleArticleClick={handleArticleClick}
            openExternalLawArticleModal={openExternalLawArticleModal}
            onToggleFavorite={onToggleFavorite}
            formatSimpleJo={formatSimpleJo}
            isFavorite={isFavorite}
          />

          {/* Right panel - Article content */}
          <Card className="flex flex-col overflow-hidden h-auto lg:h-full p-0 gap-0">
            {/* Header - Hidden in AI Answer Mode */}
            {!aiAnswerMode && (
              <div className="border-b border-border px-3 sm:px-4 pt-4 sm:pt-6 pb-2 sm:pb-3.5">
                <div className="flex items-center gap-2 mb-1">
                  <Icon name={isPrecedent ? "gavel" : "book-open"} size={20} className="text-primary" />
                  <h2 className="text-xl font-bold text-foreground">{meta.lawTitle}</h2>
                  {/* 심급 배지 - 제목 옆에 표시 */}
                  {isPrecedent && hasLevelSection && currentCourtLevel && (
                    <Badge
                      className={cn(
                        "text-xs px-1.5 py-0.5 font-medium",
                        currentCourtLevel === 3 && "bg-purple-500/20 text-purple-400 border-purple-500/30",
                        currentCourtLevel === 2 && "bg-blue-500/20 text-blue-400 border-blue-500/30",
                        currentCourtLevel === 1 && "bg-green-500/20 text-green-400 border-green-500/30"
                      )}
                    >
                      {currentCourtLevel}심
                    </Badge>
                  )}
                  {!isPrecedent && !isOrdinance && viewMode === "full" && (
                    <Badge variant="outline" className="text-xs">
                      전체 조문
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {isPrecedent ? (
                    // 판례 전용 배지
                    <>
                      {meta.caseNumber && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                          <Icon name="file-text" size={12} className="mr-1" />
                          {meta.caseNumber}
                        </Badge>
                      )}
                      {meta.promulgationDate && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                          <Icon name="calendar" size={12} className="mr-1" />
                          선고일: {meta.promulgationDate}
                        </Badge>
                      )}
                      {meta.lawType && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                          {meta.lawType}
                        </Badge>
                      )}
                    </>
                  ) : (
                    // 법령 전용 배지
                    <>
                      {meta.latestEffectiveDate && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                          <Icon name="calendar" size={12} className="mr-1" />
                          {formatDate(meta.latestEffectiveDate)}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                        <Icon name="file-text" size={12} className="mr-1" />
                        {articles.length}개 조문
                      </Badge>

                      {isOrdinance && (
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs px-1.5 py-0.5">
                          <Icon name="building-2" size={12} className="mr-1" />
                          자치법규
                        </Badge>
                      )}
                      {meta.revisionType && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                          {meta.revisionType}
                        </Badge>
                      )}
                    </>
                  )}

                  {/* 법령 전체 즐겨찾기 개수 - 판례는 제외 */}
                  {!isPrecedent && favoriteCount > 0 && (
                    <Badge
                      key={`header-fav-count-${favoriteCount}`}
                      variant="outline"
                      className="text-xs px-1.5 py-0.5"
                    >
                      <Icon name="star" size={12} className="mr-1 fill-yellow-400 text-yellow-500" />
                      {favoriteCount}
                    </Badge>
                  )}
                  {!isPrecedent && !isOrdinance && viewMode === "full" && activeArticle && (
                    <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                      현재: {formatSimpleJo(activeArticle.jo)}
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <LawViewerActionButtons
              isPrecedent={isPrecedent}
              isOrdinance={isOrdinance}
              aiAnswerMode={aiAnswerMode}
              activeArticle={activeArticle ?? null}
              actualArticles={actualArticles}
              hasLevelSection={hasLevelSection}
              showRelatedCases={showRelatedCases}
              setShowRelatedCases={setShowRelatedCases}
              loadingRelatedCases={loadingRelatedCases}
              relatedCases={relatedCases}
              favorites={favorites}
              isFavorite={isFavorite}
              favoriteKey={favoriteKey}
              onToggleFavorite={onToggleFavorite}
              fontSize={fontSize}
              increaseFontSize={increaseFontSize}
              decreaseFontSize={decreaseFontSize}
              resetFontSize={resetFontSize}
              onCompare={onCompare}
              onSummarize={onSummarize}
              onRefresh={onRefresh}
              openLawCenter={openLawCenter}
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
              isOrdinance={isOrdinance}
              actualArticles={actualArticles}
              fontSize={fontSize}
              increaseFontSize={increaseFontSize}
              decreaseFontSize={decreaseFontSize}
              resetFontSize={resetFontSize}
              openLawCenter={openLawCenter}
              onRefresh={onRefresh}
              formatSimpleJo={formatSimpleJo}
            />

            <div className="flex-1 min-h-0">
              {/* ✅ Phase 11-B: AI 모드 우선 체크 (viewMode보다 우선) */}
              {aiAnswerMode ? (
                // ✅ Phase 8: AI 모드 - LegalMarkdownRenderer로 Markdown 직접 렌더링
                <ScrollArea className="h-full" ref={contentRef}>
                  <div className="pb-20">
                    <AIAnswerContent
                      aiAnswerContent={aiAnswerContent || ''}
                      userQuery={userQuery}
                      aiConfidenceLevel={aiConfidenceLevel}
                      fileSearchFailed={fileSearchFailed}
                      aiCitations={aiCitations}
                      fontSize={fontSize}
                      setFontSize={setFontSize}
                      onLawClick={handleLawLinkClick}
                      aiQueryType={aiQueryType}
                      isTruncated={aiIsTruncated}
                      onRefresh={onAiRefresh}
                      isStreaming={isStreaming}
                      searchProgress={searchProgress}
                    />
                  </div>
                </ScrollArea>
              ) : viewMode === "full" ? (
                // 전문조회 모드: 자체 스크롤 관리
                tierViewMode === "2-tier" && activeArticle ? (
                  <DelegationPanel
                    activeArticle={activeArticle}
                    meta={meta}
                    fontSize={fontSize}
                    validDelegations={validDelegations}
                    isLoadingThreeTier={isLoadingThreeTier}
                    delegationActiveTab={delegationActiveTab}
                    setDelegationActiveTab={setDelegationActiveTab}
                    delegationPanelSize={delegationPanelSize}
                    setDelegationPanelSize={setDelegationPanelSize}
                    showAdminRules={showAdminRules}
                    setShowAdminRules={setShowAdminRules}
                    loadingAdminRules={loadingAdminRules}
                    loadedAdminRulesCount={loadedAdminRulesCount}
                    hasEverLoaded={hasEverLoaded}
                    adminRules={adminRules}
                    adminRulesProgress={adminRulesProgress}
                    adminRuleViewMode={adminRuleViewMode}
                    setAdminRuleViewMode={setAdminRuleViewMode}
                    adminRuleHtml={adminRuleHtml}
                    adminRuleTitle={adminRuleTitle}
                    handleViewAdminRuleFullContent={handleViewAdminRuleFullContent}
                    increaseFontSize={increaseFontSize}
                    decreaseFontSize={decreaseFontSize}
                    resetFontSize={resetFontSize}
                    handleContentClick={handleContentClick}
                    isOrdinance={isOrdinance}
                  />
                ) : (
                  <ScrollArea className="h-full" ref={contentRef}>
                    <div ref={swipeRef}>
                      <VirtualizedFullArticleView
                        articles={actualArticles}
                        preambles={preambles}
                        activeJo={activeJo}
                        fontSize={fontSize}
                        lawTitle={meta.lawTitle}
                        lawId={meta.lawId}
                        mst={meta.mst}
                        effectiveDate={meta.effectiveDate}
                        onContentClick={handleContentClick}
                        articleRefs={articleRefs}
                        scrollParentRef={contentRef}
                        isOrdinance={isOrdinance}
                        isPrecedent={isPrecedent}
                      />
                    </div>
                  </ScrollArea>
                )
              ) : activeArticle ? (
                tierViewMode === "2-tier" ? (
                  <DelegationPanel
                    activeArticle={activeArticle}
                    meta={meta}
                    fontSize={fontSize}
                    validDelegations={validDelegations}
                    isLoadingThreeTier={isLoadingThreeTier}
                    delegationActiveTab={delegationActiveTab}
                    setDelegationActiveTab={setDelegationActiveTab}
                    delegationPanelSize={delegationPanelSize}
                    setDelegationPanelSize={setDelegationPanelSize}
                    showAdminRules={showAdminRules}
                    setShowAdminRules={setShowAdminRules}
                    loadingAdminRules={loadingAdminRules}
                    loadedAdminRulesCount={loadedAdminRulesCount}
                    hasEverLoaded={hasEverLoaded}
                    adminRules={adminRules}
                    adminRulesProgress={adminRulesProgress}
                    adminRuleViewMode={adminRuleViewMode}
                    setAdminRuleViewMode={setAdminRuleViewMode}
                    adminRuleHtml={adminRuleHtml}
                    adminRuleTitle={adminRuleTitle}
                    handleViewAdminRuleFullContent={handleViewAdminRuleFullContent}
                    increaseFontSize={increaseFontSize}
                    decreaseFontSize={decreaseFontSize}
                    resetFontSize={resetFontSize}
                    handleContentClick={handleContentClick}
                    isOrdinance={isOrdinance}
                  />
                ) : showPrecedents && precedentViewMode === "side" ? (
                  // 판례 사이드 패널 모드
                  <PanelGroup direction="horizontal" className="h-full">
                    {/* 좌측: 조문 본문 */}
                    <Panel defaultSize={100 - precedentPanelSize} minSize={30}>
                      <ScrollArea className="h-full" ref={contentRef}>
                        <div ref={swipeRef}>
                          <LawViewerSingleArticle
                            activeArticle={activeArticle}
                            activeArticleHtml={activeArticleHtml}
                            meta={meta}
                            revisionHistory={revisionHistory}
                            fontSize={fontSize}
                            isOrdinance={isOrdinance}
                            onRefresh={onRefresh}
                            onToggleFavorite={onToggleFavorite}
                            isFavorite={isFavorite}
                            increaseFontSize={increaseFontSize}
                            decreaseFontSize={decreaseFontSize}
                            resetFontSize={resetFontSize}
                            handleContentClick={handleContentClick}
                            formatSimpleJo={formatSimpleJo}
                            showPrecedents={true}
                            precedentViewMode="side"
                            precedents={precedents}
                            precedentTotalCount={precedentTotalCount}
                            loadingPrecedents={loadingPrecedents}
                            precedentsError={precedentsError}
                            selectedPrecedent={selectedPrecedent}
                            loadingPrecedentDetail={loadingPrecedentDetail}
                            handleViewPrecedentDetail={handleViewPrecedentDetail}
                            expandPrecedentPanel={expandPrecedentPanel}
                            collapsePrecedentPanel={collapsePrecedentPanel}
                          />
                        </div>
                      </ScrollArea>
                    </Panel>

                    {/* 리사이즈 핸들 */}
                    <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />

                    {/* 우측: 판례 상세 패널 */}
                    <Panel
                      defaultSize={precedentPanelSize}
                      minSize={25}
                      maxSize={60}
                      onResize={(size) => setPrecedentPanelSize(size)}
                    >
                      <div className="h-full border-l border-border bg-muted/10">
                        <div className="h-full flex flex-col">
                          {/* 패널 헤더 */}
                          <div className="flex items-center justify-between p-3 border-b border-border">
                            <div className="flex items-center gap-2">
                              <Icon name="scale" size={16} className="text-primary" />
                              <h3 className="font-semibold text-sm">판례 상세</h3>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={collapsePrecedentPanel}
                              className="h-7 px-2"
                            >
                              <Icon name="x" size={14} className="mr-1" />
                              닫기
                            </Button>
                          </div>

                          {/* 판례 상세 내용 */}
                          <div className="flex-1 min-h-0">
                            <PrecedentDetailPanel
                              detail={selectedPrecedent}
                              loading={loadingPrecedentDetail}
                              onClose={collapsePrecedentPanel}
                              onContentClick={handleContentClick as (e: React.MouseEvent) => void}
                              onViewPrecedent={handleViewPrecedentDetail}
                            />
                          </div>
                        </div>
                      </div>
                    </Panel>
                  </PanelGroup>
                ) : (
                  <ScrollArea className="h-full" ref={contentRef}>
                    <div ref={swipeRef}>
                      <LawViewerSingleArticle
                        activeArticle={activeArticle}
                        activeArticleHtml={activeArticleHtml}
                        meta={meta}
                        revisionHistory={revisionHistory}
                        fontSize={fontSize}
                        isOrdinance={isOrdinance}
                        onRefresh={onRefresh}
                        onToggleFavorite={onToggleFavorite}
                        isFavorite={isFavorite}
                        increaseFontSize={increaseFontSize}
                        decreaseFontSize={decreaseFontSize}
                        resetFontSize={resetFontSize}
                        handleContentClick={handleContentClick}
                        formatSimpleJo={formatSimpleJo}
                        showPrecedents={showPrecedents}
                        precedentViewMode={precedentViewMode}
                        precedents={precedents}
                        precedentTotalCount={precedentTotalCount}
                        loadingPrecedents={loadingPrecedents}
                        precedentsError={precedentsError}
                        selectedPrecedent={selectedPrecedent}
                        loadingPrecedentDetail={loadingPrecedentDetail}
                        handleViewPrecedentDetail={handleViewPrecedentDetail}
                        expandPrecedentPanel={expandPrecedentPanel}
                        collapsePrecedentPanel={collapsePrecedentPanel}
                      />
                    </div>
                  </ScrollArea>
                )
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p>조문을 선택하세요</p>
                </div>
              )}
            </div>
          </Card >
          <ReferenceModal
            isOpen={refModal.open}
            onClose={() => {
              setRefModal({ open: false })
              setRefModalHistory([]) // 히스토리 초기화
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
              onDismiss={() => setSwipeHint(null)}
            />
          )
        }
      </div>
    </>
  )
}

// React.memo로 불필요한 리렌더링 방지
export const LawViewer = memo(LawViewerComponent)
