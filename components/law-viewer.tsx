"use client"

import type React from "react"
import { useState, useEffect, useRef, useMemo } from "react"
import dynamic from "next/dynamic"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import type { LawArticle, LawMeta, ThreeTierData } from "@/lib/law-types"
import { cn } from "@/lib/utils"
import { extractArticleText, formatDelegationContent } from "@/lib/law-xml-parser"
import { buildJO, formatJO, formatSimpleJo, type ParsedRelatedLaw } from "@/lib/law-parser"
import { RevisionHistory } from "@/components/revision-history"
import { ArticleBottomSheet } from "@/components/article-bottom-sheet"

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
import { FloatingActionButton } from "@/components/ui/floating-action-button"
import { VirtualizedArticleList } from "@/components/virtualized-article-list"
import { VirtualizedFullArticleView } from "@/components/virtualized-full-article-view"
import { DelegationLoadingSkeleton } from "@/components/delegation-loading-skeleton"
import { DelegationPanel } from "@/components/law-viewer-delegation-panel"
import { PrecedentSection, PrecedentDetailPanel } from "@/components/precedent-section"
import { formatPrecedentDate, type PrecedentSearchResult } from "@/lib/precedent-parser"
import { CopyButton } from "@/components/ui/copy-button"
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
import { buildPrecedentHtml } from "@/lib/content-click-handlers"
import { useSwipe } from "@/hooks/use-swipe"
import { debugLogger } from '@/lib/debug-logger'
import type { VerifiedCitation } from '@/lib/citation-verifier'
import { AIAnswerSidebar, AIAnswerContent } from "@/components/law-viewer-ai-answer"

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

export function LawViewer({
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

  // 판례 관련 심급 상태
  const [showRelatedCases, setShowRelatedCases] = useState(false)
  const [relatedCases, setRelatedCases] = useState<PrecedentSearchResult[]>([])
  const [loadingRelatedCases, setLoadingRelatedCases] = useState(false)

  // 관련 심급이 존재하는지 (로딩 완료 후)
  const hasRelatedCases = relatedCases.length > 0

  // 판례 전문에서 심급 정보 추출 (배지 표시 + 버튼 활성화용)
  const { hasLevelSection, currentCourtLevel } = useMemo(() => {
    if (!isPrecedent) return { hasLevelSection: false, currentCourtLevel: null as (1 | 2 | 3 | null) }
    // actualArticles 전체 내용 합치기
    const allContent = actualArticles.map(a => a.content || '').join('')
    // "3심", "2심", "1심" 텍스트에서 숫자 추출
    const match = allContent.match(/([123])심/)
    if (match) {
      return { hasLevelSection: true, currentCourtLevel: parseInt(match[1]) as 1 | 2 | 3 }
    }
    return { hasLevelSection: false, currentCourtLevel: null }
  }, [isPrecedent, actualArticles])


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

  // Update loadedArticles when props.articles changes
  useEffect(() => {
    setLoadedArticles(actualArticles)
  }, [articles])

  // Log when loadedArticles changes
  useEffect(() => {
  }, [loadedArticles, activeJo])

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

  // 디버깅: 현재 조문의 delegation 데이터 확인
  useEffect(() => {
    if (activeJo && currentArticleDelegations.length > 0) {
    }
  }, [activeJo, currentArticleDelegations])

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

  useEffect(() => {
  }, [activeArticle])

  useEffect(() => {
  }, [activeArticle])

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

  useEffect(() => {
    articleRefs.current = {}
  }, [articles])

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

  // 의존성 안정화를 위한 값 추출
  const currentCaseNumber = (meta as any).caseNumber as string | undefined
  const currentCaseName = (meta as any).lawTitle as string | undefined

  // 관련 심급 검색 AbortController
  const relatedCasesAbortRef = useRef<AbortController | null>(null)
  // 이미 검색한 사건명 캐시 (중복 API 호출 방지)
  const lastSearchedNameRef = useRef<string | null>(null)

  // 판례 관련 심급 검색 (사건명 기반 API 검색) - 버튼 클릭 시에만 검색
  useEffect(() => {
    if (!isPrecedent || !showRelatedCases) {
      setRelatedCases([])
      setLoadingRelatedCases(false)
      return
    }

    // 사건명이 없으면 검색 불가
    if (!currentCaseName) {
      setRelatedCases([])
      setLoadingRelatedCases(false)
      return
    }

    // 이미 같은 사건명으로 검색했으면 스킵 (무한 루프 방지)
    if (lastSearchedNameRef.current === currentCaseName) {
      return
    }

    // 이전 요청 취소
    relatedCasesAbortRef.current?.abort()
    relatedCasesAbortRef.current = new AbortController()
    const signal = relatedCasesAbortRef.current.signal

    const fetchRelatedCases = async () => {
      setLoadingRelatedCases(true)
      lastSearchedNameRef.current = currentCaseName

      try {
        // 사건명으로 검색 (같은 사건의 1~3심 찾기)
        const params = new URLSearchParams({
          query: currentCaseName,
          display: '20'
        })
        const res = await fetch(`/api/precedent-search?${params}`, { signal })

        if (!res.ok) {
          setRelatedCases([])
          return
        }

        const data = await res.json()
        const results: PrecedentSearchResult[] = data.precedents || []

        // 사건명 100% 일치 필터링 + 현재 판례 제외
        const related = results.filter(p =>
          p.name === currentCaseName &&
          p.caseNumber !== currentCaseNumber
        )
        console.log('[관련심급] 검색:', currentCaseName, '→', related.length, '건')

        // 선고일자 순 정렬 (오래된 것 먼저 = 1심부터)
        related.sort((a, b) => {
          const dateA = a.date?.replace(/[.\-]/g, '') || ''
          const dateB = b.date?.replace(/[.\-]/g, '') || ''
          return dateA.localeCompare(dateB)
        })

        setRelatedCases(related)
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        console.error('관련 심급 검색 실패:', e)
        setRelatedCases([])
      } finally {
        if (!signal.aborted) {
          setLoadingRelatedCases(false)
        }
      }
    }

    fetchRelatedCases()

    return () => {
      relatedCasesAbortRef.current?.abort()
    }
  }, [isPrecedent, showRelatedCases, currentCaseName, currentCaseNumber])

  // 관련 심급 판례 클릭 → ReferenceModal로 상세 표시 (기존 판례 모달과 동일 스타일)
  const handleRelatedPrecedentClick = async (prec: PrecedentSearchResult) => {
    // 로딩 표시
    setRefModal({
      open: true,
      title: `판례 조회 중...`,
      html: '<div class="flex items-center justify-center py-8"><div class="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div></div>',
    })

    try {
      const res = await fetch(`/api/precedent-detail?id=${prec.id}`)
      if (res.ok) {
        const detail = await res.json()
        const html = buildPrecedentHtml(detail)
        setRefModal({
          open: true,
          title: detail.name || prec.name,
          html,
          precedentMeta: {
            court: detail.court,
            caseNumber: detail.caseNumber,
            date: formatPrecedentDate(detail.date),
            judgmentType: detail.judgmentType,
          },
        })
      } else {
        setRefModal({
          open: true,
          title: '판례 조회 실패',
          html: `<div class="text-destructive p-4"><p>판례를 불러올 수 없습니다.</p></div>`,
        })
      }
    } catch (e) {
      console.error('판례 상세 조회 실패:', e)
      setRefModal({
        open: true,
        title: '판례 조회 실패',
        html: `<div class="text-destructive p-4"><p>판례를 불러올 수 없습니다.</p></div>`,
      })
    }
  }

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
          {/* Mobile overlay backdrop */}
          {isArticleListExpanded && (
            <div
              className="lg:hidden fixed inset-0 bg-black/50 z-40"
              onClick={() => setIsArticleListExpanded(false)}
            />
          )}

          {/* Left sidebar - AI 답변 모드 or 조문 목록 (Desktop only) */}
          <Card className={`hidden lg:flex flex-col overflow-hidden h-full lg:sticky lg:top-4 transition-all duration-300 p-0 gap-0 ${isArticleListCollapsed ? 'lg:w-16' : ''}`}>
            {aiAnswerMode && isArticleListCollapsed ? (
              // ========== AI 슬림 모드 (접힌 상태) ==========
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsArticleListCollapsed(false)}
                  className="mx-auto mt-2 mb-2"
                  title="관련 법령 목록 펼치기"
                >
                  <Icon name="link" size={20} />
                </Button>
                <Separator />
                <ScrollArea className="flex-1">
                  <div className="flex flex-col items-center gap-1 py-2">
                    {relatedArticles.slice(0, 20).map((article, idx) => {
                      const isExcerpt = article.source === 'excerpt'
                      return (
                        <Button
                          key={`${article.lawName}-${article.jo}-${idx}`}
                          variant="ghost"
                          size="sm"
                          onClick={() => openExternalLawArticleModal(article.lawName, article.article)}
                          className="w-12 h-12 p-0 text-xs flex flex-col items-center justify-center relative"
                          title={`${article.lawName} ${article.article}`}
                        >
                          {isExcerpt ? (
                            <Icon name="bookmark" size={14} className="text-purple-400" />
                          ) : (
                            <Icon name="link" size={14} className="text-blue-400" />
                          )}
                        </Button>
                      )
                    })}
                  </div>
                </ScrollArea>
              </>
            ) : aiAnswerMode ? (
              // ========== AI 펼친 상태 ==========
              <AIAnswerSidebar
                relatedArticles={mergedRelatedArticles}
                onRelatedArticleClick={openExternalLawArticleModal}
                showHeader={true}
                onCollapseClick={() => setIsArticleListCollapsed(true)}
                isStreaming={isStreaming}
              />
            ) : isArticleListCollapsed ? (
              // ========== 슬림 모드 (접힌 상태) ==========
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsArticleListCollapsed(false)}
                  className="mx-auto mt-2 mb-2"
                  title={isPrecedent ? "목차 펼치기" : "조문 목록 펼치기"}
                >
                  <Icon name="list-ordered" size={20} />
                </Button>
                <Separator />
                <ScrollArea className="flex-1">
                  <div className="flex flex-col items-center gap-1 py-2">
                    {actualArticles.map((article) => {
                      const joNum = formatSimpleJo(article.jo).replace('제', '').replace('조', '').replace('의', '-')
                      const isActive = article.jo === activeJo
                      const isArticleFavorite = isFavorite(article.jo)

                      return (
                        <Button
                          key={article.jo}
                          variant={isActive ? "default" : "ghost"}
                          size="sm"
                          onClick={() => handleArticleClick(article.jo)}
                          className={`w-12 h-12 p-0 text-xs flex flex-col items-center justify-center relative ${isActive ? 'ring-2 ring-primary ring-offset-1' : ''
                            }`}
                          title={`${formatSimpleJo(article.jo)}${article.title ? ` ${article.title}` : ''}`}
                        >
                          <span className="font-bold">{joNum}</span>
                          {isArticleFavorite && (
                            <Icon name="star" size={10} className="absolute top-0.5 right-0.5 fill-yellow-400 text-yellow-400" />
                          )}
                        </Button>
                      )
                    })}
                  </div>
                </ScrollArea>
              </>
            ) : (
              // ========== 기존 조문 목록 (펼친 상태) ==========
              <>
                {/* 헤더 - 본문 헤더와 동일한 디자인 */}
                <div className="border-b border-border px-4 pt-6 pb-3 flex-shrink-0">
                  <div className="flex items-center gap-2 mb-1 justify-between">
                    <div className="flex items-center gap-2">
                      <Icon name={isPrecedent ? "list-checks" : "list-ordered"} size={20} className="text-primary" />
                      <h3 className="text-xl font-bold text-foreground">{isPrecedent ? "목차" : "조문 목록"}</h3>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsArticleListCollapsed(true)}
                      className="h-7 w-7"
                      title={isPrecedent ? "목차 접기" : "조문 목록 접기"}
                    >
                      <Icon name="chevron-down" size={16} className="rotate-90" />
                    </Button>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    <Icon name="file-text" size={12} className="mr-1" />
                    {actualArticles.length}개 {isPrecedent ? "항목" : "조문"}
                  </Badge>
                </div>

                <div className="flex-1 min-h-0 px-2 pt-2 pb-4">
                  <VirtualizedArticleList
                    articles={actualArticles}
                    activeJo={activeJo}
                    loadingJo={loadingJo}
                    favorites={favorites}
                    isOrdinance={isOrdinance}
                    isPrecedent={isPrecedent}
                    lawTitle={meta.lawTitle}
                    onArticleClick={handleArticleClick}
                    onToggleFavorite={(jo) => onToggleFavorite?.(jo)}
                  />
                </div>
              </>
            )
            }
          </Card>

          {/* Mobile Bottom Sheet for Article List */}
          <ArticleBottomSheet
            isOpen={isArticleListExpanded}
            onClose={() => setIsArticleListExpanded(false)}
            title={aiAnswerMode ? "관련 법령 목록" : isPrecedent ? "목차" : "조문 목록"}
            snapPoints={[40, 70, 90]}
          >
            {aiAnswerMode ? (
              <AIAnswerSidebar
                relatedArticles={mergedRelatedArticles}
                onRelatedArticleClick={openExternalLawArticleModal}
                onCloseSidebar={() => setIsArticleListExpanded(false)}
                showHeader={false}
                isStreaming={isStreaming}
              />
            ) : (
              // 일반 모드: 조문 목록
              <>
                <div className="mb-4">
                  <Badge variant="outline" className="text-xs">
                    <Icon name="file-text" size={12} className="mr-1" />
                    {actualArticles.length}개 조문
                  </Badge>
                </div>

                <div className="h-[60vh]">
                  <VirtualizedArticleList
                    articles={actualArticles}
                    activeJo={activeJo}
                    loadingJo={loadingJo}
                    favorites={favorites}
                    isOrdinance={isOrdinance}
                    lawTitle={meta.lawTitle}
                    onArticleClick={(jo) => {
                      handleArticleClick(jo)
                      setIsArticleListExpanded(false)
                    }}
                    onToggleFavorite={(jo) => onToggleFavorite?.(jo)}
                  />
                </div>
              </>
            )}
          </ArticleBottomSheet>

          {/* Floating Action Button (Mobile only) */}
          <FloatingActionButton
            onClick={() => setIsArticleListExpanded(true)}
            icon={<Icon name="list-ordered" size={20} />}
            count={aiAnswerMode ? relatedArticles.length : actualArticles.length}
            label={aiAnswerMode ? "관련 법령 목록 열기" : isPrecedent ? "목차 열기" : "조문 목록 열기"}
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
            {!aiAnswerMode && (activeArticle || isPrecedent) && (
              <div className="border-b border-border px-3 sm:px-4 pt-1.5 sm:pt-3 pb-1.5 sm:pb-3">
                <div className="flex flex-nowrap gap-1 sm:gap-1.5 overflow-x-auto">
                  {isPrecedent ? (
                    // 판례 전용 액션 버튼
                    <div className="flex items-center justify-between w-full">
                      <div className="flex flex-nowrap gap-1 sm:gap-1.5">
                        <Button variant="outline" size="sm" onClick={openLawCenter} className="h-7 px-1.5 sm:px-2 shrink-0">
                          <Icon name="external-link" size={14} className="sm:mr-1" />
                          <span className="hidden sm:inline">원문 보기</span>
                          <span className="sm:hidden">원문</span>
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => onSummarize?.(activeArticle?.jo || '')} className="h-7 px-1.5 sm:px-2 shrink-0">
                          <Icon name="sparkles" size={14} className="sm:mr-1" />
                          <span className="hidden sm:inline">판례 요약</span>
                          <span className="sm:hidden">요약</span>
                        </Button>
                        {/* 【심급】 섹션이 있는 판례만 관련 심급 버튼 표시 */}
                        {hasLevelSection && (
                          <Button
                            variant={showRelatedCases ? "default" : "outline"}
                            size="sm"
                            onClick={() => setShowRelatedCases(!showRelatedCases)}
                            className="h-7 px-1.5 sm:px-2 shrink-0"
                          >
                            <Icon name="git-compare" size={14} className="sm:mr-1" />
                            <span className="hidden sm:inline">관련 심급</span>
                            <span className="sm:hidden">심급</span>
                            {loadingRelatedCases ? (
                              <Icon name="loader" size={12} className="ml-1 animate-spin" />
                            ) : hasRelatedCases ? (
                              <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">
                                {relatedCases.length}
                              </Badge>
                            ) : null}
                          </Button>
                        )}
                        {activeArticle && (
                          <Button
                            variant={favorites.has(favoriteKey(activeArticle.jo)) ? "default" : "outline"}
                            size="sm"
                            onClick={() => onToggleFavorite?.(activeArticle.jo)}
                            className="h-7 px-1.5 sm:px-2 shrink-0"
                          >
                            <Icon
                              name="star"
                              size={14}
                              className={`sm:mr-1 ${favorites.has(favoriteKey(activeArticle.jo)) ? "fill-yellow-400 text-yellow-500" : ""}`}
                            />
                            <span className="hidden sm:inline">즐겨찾기</span>
                            <span className="sm:hidden">★</span>
                          </Button>
                        )}
                      </div>
                      {/* 우측: 새로고침 + 글자크기 + 복사 */}
                      <div className="flex items-center gap-0.5">
                        {/* ✅ 강제 새로고침 버튼 */}
                        {onRefresh && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-orange-500 hover:text-orange-600 hover:bg-orange-500/10" onClick={onRefresh} title="캐시 무시 새로고침 (개발용)">
                            <Icon name="refresh-cw" size={14} />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={decreaseFontSize} title="글자 작게" className="h-7 px-2">
                          <Icon name="zoom-out" size={14} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={resetFontSize} title="기본 크기" className="h-7 px-2">
                          <Icon name="rotate-clockwise" size={12} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={increaseFontSize} title="글자 크게" className="h-7 px-2">
                          <Icon name="zoom-in" size={14} />
                        </Button>
                        <span className="text-xs text-muted-foreground ml-1">{fontSize}px</span>
                        <CopyButton
                          getText={() => actualArticles.map(a => `【${a.joNum || a.title}】\n${a.content}`).join('\n\n')}
                          message="판례 복사됨"
                          className="h-7 w-7 p-0"
                        />
                      </div>
                    </div>
                  ) : !isOrdinance ? (
                    // 법령 전용 액션 버튼
                    <>
                      <Button variant="default" size="sm" onClick={() => onCompare?.(activeArticle.jo)} className="h-7 px-1.5 sm:px-2 shrink-0">
                        <Icon name="git-compare" size={14} className="sm:mr-1" />
                        <span className="hidden sm:inline">신·구법 비교</span>
                        <span className="sm:hidden">비교</span>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => onSummarize?.(activeArticle.jo)} className="h-7 px-1.5 sm:px-2 shrink-0">
                        <Icon name="sparkles" size={14} className="sm:mr-1" />
                        <span className="hidden sm:inline">AI 요약</span>
                        <span className="sm:hidden">요약</span>
                      </Button>
                      <Button variant="outline" size="sm" onClick={openLawCenter} className="h-7 px-1.5 sm:px-2 shrink-0">
                        <Icon name="external-link" size={14} className="sm:mr-1" />
                        <span className="hidden sm:inline">원문 보기</span>
                        <span className="sm:hidden">원문</span>
                      </Button>
                      {/* 위임법령 보기 버튼 (2단 뷰 + 탭 구조) */}
                      <Button
                        variant={tierViewMode === "2-tier" ? "default" : "outline"}
                        size="sm"
                        disabled={isLoadingThreeTier || (tierViewMode === "1-tier" && shouldDisableDelegationButton)}
                        onClick={async () => {
                          if (tierViewMode === "1-tier") {
                            // 2단 뷰로 전환 (데이터 없으면 먼저 로드)
                            if (!threeTierDelegation && !threeTierCitation) await fetchThreeTierData()
                            setTierViewMode("2-tier")
                            // 행정규칙 탭이 선택되어 있고 데이터가 로드된 적 있으면 자동으로 활성화
                            if (delegationActiveTab === "admin" && loadedAdminRulesCount > 0) {
                              setShowAdminRules(true)
                            }
                          } else {
                            // 1단 뷰로 복귀 (showAdminRules는 유지 - 패널 재오픈 시 복원용)
                            setTierViewMode("1-tier")
                          }
                        }}
                        title="위임법령 보기 (시행령/시행규칙/행정규칙)"
                        className="h-7 px-1.5 sm:px-2 shrink-0"
                      >
                        {isLoadingThreeTier ? (
                          <Icon name="loader" size={14} className="sm:mr-1 animate-spin" />
                        ) : (
                          <Icon name="file-text" size={14} className="sm:mr-1" />
                        )}
                        <span className="hidden sm:inline">{tierViewMode === "2-tier" ? "위임법령 닫기" : `위임법령${delegationButtonCount > 0 ? ` (${delegationButtonCount})` : ""}`}</span>
                        <span className="sm:hidden">{tierViewMode === "2-tier" ? "닫기" : `위임${delegationButtonCount > 0 ? `(${delegationButtonCount})` : ""}`}</span>
                      </Button>
                      {/* 판례 보기 버튼 */}
                      <Button
                        variant={showPrecedents ? "default" : "outline"}
                        size="sm"
                        onClick={() => setShowPrecedents(!showPrecedents)}
                        title="관련 판례 보기"
                        className="h-7 px-1.5 sm:px-2 shrink-0"
                      >
                        <Icon name="scale" size={14} className="sm:mr-1" />
                        <span className="hidden sm:inline">{showPrecedents ? "판례 닫기" : `판례${precedentTotalCount > 0 ? ` (${precedentTotalCount})` : ""}`}</span>
                        <span className="sm:hidden">{showPrecedents ? "닫기" : `판례${precedentTotalCount > 0 ? `(${precedentTotalCount})` : ""}`}</span>
                      </Button>
                      {/* 즐겨찾기 - PC에서만 표시 (모바일은 제목줄에 있음) */}
                      <Button
                        key={`fav-btn-${activeArticle.jo}-${isFavorite(activeArticle.jo)}`}
                        variant="outline"
                        size="sm"
                        onClick={() => onToggleFavorite?.(activeArticle.jo)}
                        data-favorited={isFavorite(activeArticle.jo)}
                        className={`hidden lg:flex h-7 px-2 transition-all ${isFavorite(activeArticle.jo)
                          ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600'
                          : ''
                          }`}
                      >
                        <Icon name="star" size={14} className={`mr-1 transition-all ${isFavorite(activeArticle.jo) ? "fill-yellow-300 text-yellow-300" : ""}`} />
                        즐겨찾기
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            )}

            {/* 판례 관련 심급 목록 */}
            {isPrecedent && showRelatedCases && (
              <div className="border-b border-border px-3 sm:px-4 py-2 bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <Icon name="git-compare" size={14} className="text-blue-500" />
                  <span className="text-sm font-medium">관련 심급</span>
                  {loadingRelatedCases && (
                    <Icon name="loader" size={14} className="animate-spin text-muted-foreground" />
                  )}
                </div>
                {!loadingRelatedCases && relatedCases.length === 0 ? (
                  <p className="text-sm text-muted-foreground">관련 심급 판례가 없습니다</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {relatedCases.map((prec) => (
                      <button
                        key={prec.id}
                        onClick={() => handleRelatedPrecedentClick(prec)}
                        className="flex items-center gap-2 px-2 py-1.5 bg-background/80 rounded-md border border-border hover:border-primary/50 transition-colors text-left"
                      >
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-xs font-medium shrink-0",
                          prec.court.includes("대법원") ? "bg-purple-500/20 text-purple-500 dark:text-purple-400" :
                          prec.court.includes("고등") ? "bg-blue-500/20 text-blue-500 dark:text-blue-400" :
                          "bg-green-500/20 text-green-500 dark:text-green-400"
                        )}>
                          {prec.court.includes("대법원") ? "3심" :
                           prec.court.includes("고등") ? "2심" : "1심"}
                        </span>
                        <span className="text-sm font-medium truncate max-w-[150px]">{prec.caseNumber}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{formatPrecedentDate(prec.date)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {
              isOrdinance && (
                <div className="border-b border-border px-3 sm:px-4 py-0.5 pt-2 sm:pt-3 pb-2 sm:pb-3">
                  <div className="flex items-center justify-between gap-1">
                    {/* 좌측: 원문 보기 */}
                    <Button variant="outline" size="sm" onClick={openLawCenter} className="bg-transparent h-7 px-2">
                      <Icon name="external-link" size={14} className="mr-1" />
                      원문 보기
                    </Button>

                    {/* 우측: 새로고침 + 글자크기 + 복사 */}
                    <div className="flex items-center gap-0.5">
                      {/* ✅ 강제 새로고침 버튼 */}
                      {onRefresh && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-orange-500 hover:text-orange-600 hover:bg-orange-500/10" onClick={onRefresh} title="캐시 무시 새로고침 (개발용)">
                          <Icon name="refresh-cw" size={14} />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={decreaseFontSize} title="글자 작게" className="h-7 px-2">
                        <Icon name="zoom-out" size={14} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={resetFontSize} title="기본 크기" className="h-7 px-2">
                        <Icon name="rotate-clockwise" size={12} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={increaseFontSize} title="글자 크게" className="h-7 px-2">
                        <Icon name="zoom-in" size={14} />
                      </Button>
                      <span className="text-xs text-muted-foreground ml-1">{fontSize}px</span>
                      <CopyButton
                        getText={() => actualArticles.map(a => `${formatSimpleJo(a.jo)}\n${a.content}`).join('\n\n')}
                        message="전체 복사됨"
                        className="h-7 w-7 p-0"
                      />
                    </div>
                  </div>
                </div>
              )
            }

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
                        <div ref={swipeRef} className="px-3 sm:px-4 lg:px-6 pt-2 sm:pt-3 pb-3">
                          <div className="mb-2 sm:mb-3 pb-1.5 sm:pb-2 border-b border-border">
                            {/* 모바일/PC 모두 1줄: 제목 + 배지 + 버튼들 */}
                            <div className="flex items-center justify-between gap-1 lg:gap-2">
                              {/* 제목 + 배지 */}
                              <div className="flex items-center gap-1 lg:gap-2 min-w-0 flex-1">
                                <h2 className="text-lg lg:text-xl font-bold text-foreground truncate">
                                  {formatSimpleJo(activeArticle.jo, isOrdinance)}
                                  {activeArticle.title && (
                                    <span className="text-muted-foreground text-base lg:text-lg ml-1 lg:ml-2">({activeArticle.title})</span>
                                  )}
                                </h2>
                                {meta.lawTitle === "대한민국헌법" ? (
                                  <Badge variant="outline" className="text-xs shrink-0 bg-amber-500/20 text-amber-300 border-amber-500/50 hidden sm:flex">
                                    <Icon name="landmark" size={12} className="mr-1" />
                                    헌법
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs shrink-0 hidden sm:flex">
                                    {isOrdinance ? "자치법규" : "법률"}
                                  </Badge>
                                )}
                              </div>

                              {/* 버튼 그룹: 새로고침 + 즐겨찾기 + 글씨크기 + 복사 (컴팩트하게 1줄) */}
                              <div className="flex items-center gap-0 shrink-0">
                                {/* ✅ 강제 새로고침 버튼 */}
                                {onRefresh && (
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-orange-500 hover:text-orange-600 hover:bg-orange-500/10" onClick={onRefresh} title="캐시 무시 새로고침 (개발용)">
                                    <Icon name="refresh-cw" size={14} />
                                  </Button>
                                )}
                                {/* 즐겨찾기 버튼 */}
                                <Button
                                  key={`fav-btn-title-${activeArticle.jo}-${isFavorite(activeArticle.jo)}`}
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onToggleFavorite?.(activeArticle.jo)}
                                  className="h-7 w-7 p-0"
                                  title={isFavorite(activeArticle.jo) ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                                >
                                  <Icon name="star" size={16} className={`transition-all ${isFavorite(activeArticle.jo) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
                                </Button>
                                {/* 글씨크기 버튼 */}
                                <Button variant="ghost" size="sm" onClick={decreaseFontSize} title="글자 작게" className="h-7 w-7 p-0">
                                  <Icon name="zoom-out" size={14} />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={resetFontSize} title="기본 크기" className="h-7 w-7 p-0">
                                  <Icon name="rotate-clockwise" size={12} />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={increaseFontSize} title="글자 크게" className="h-7 w-7 p-0">
                                  <Icon name="zoom-in" size={14} />
                                </Button>
                                {/* px 텍스트: PC에서만 표시 */}
                                <span className="hidden lg:inline text-xs text-muted-foreground ml-1 mr-1">{fontSize}px</span>
                                {/* 복사 버튼 */}
                                <CopyButton
                                  getText={() => `${formatSimpleJo(activeArticle.jo, isOrdinance)}${activeArticle.title ? ` (${activeArticle.title})` : ''}\n\n${activeArticle.content}`}
                                  message="복사됨"
                                  className="h-7 w-7 p-0"
                                />
                              </div>
                            </div>
                          </div>

                          <div
                            className="text-foreground leading-relaxed break-words whitespace-pre-wrap"
                            style={{
                              fontSize: `${fontSize}px`,
                              lineHeight: "1.8",
                              overflowWrap: "break-word",
                              wordBreak: "break-word",
                            }}
                            onClick={handleContentClick}
                            dangerouslySetInnerHTML={{ __html: activeArticleHtml }}
                          />

                          {!isOrdinance && revisionHistory.length > 0 && (
                            <div className="mt-12">
                              <RevisionHistory
                                history={revisionHistory}
                                articleTitle={`${formatSimpleJo(activeArticle.jo, isOrdinance)}${activeArticle.title ? ` (${activeArticle.title})` : ""}`}
                              />
                            </div>
                          )}

                          {/* 판례 하단 섹션 - 사이드 모드일 때는 목록만 표시 */}
                          <div className="mt-8">
                            <PrecedentSection
                              precedents={precedents}
                              totalCount={precedentTotalCount}
                              loading={loadingPrecedents}
                              error={precedentsError}
                              selectedPrecedent={selectedPrecedent}
                              loadingDetail={loadingPrecedentDetail}
                              viewMode={precedentViewMode}
                              onViewDetail={handleViewPrecedentDetail}
                              onExpand={expandPrecedentPanel}
                              onCollapse={collapsePrecedentPanel}
                            />
                          </div>
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
                              onContentClick={handleContentClick}
                              onViewPrecedent={handleViewPrecedentDetail}
                            />
                          </div>
                        </div>
                      </div>
                    </Panel>
                  </PanelGroup>
                ) : (
                  <ScrollArea className="h-full" ref={contentRef}>
                    <div ref={swipeRef} className="px-3 sm:px-4 lg:px-6 pt-2 sm:pt-3 pb-3">
                      <div className="mb-2 sm:mb-3 pb-1.5 sm:pb-2 border-b border-border">
                        {/* 모바일/PC 모두 1줄: 제목 + 배지 + 버튼들 */}
                        <div className="flex items-center justify-between gap-1 lg:gap-2">
                          {/* 제목 + 배지 */}
                          <div className="flex items-center gap-1 lg:gap-2 min-w-0 flex-1">
                            <h2 className="text-lg lg:text-xl font-bold text-foreground truncate">
                              {formatSimpleJo(activeArticle.jo, isOrdinance)}
                              {activeArticle.title && (
                                <span className="text-muted-foreground text-base lg:text-lg ml-1 lg:ml-2">({activeArticle.title})</span>
                              )}
                            </h2>
                            {meta.lawTitle === "대한민국헌법" ? (
                              <Badge variant="outline" className="text-xs shrink-0 bg-amber-500/20 text-amber-300 border-amber-500/50 hidden sm:flex">
                                <Icon name="landmark" size={12} className="mr-1" />
                                헌법
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs shrink-0 hidden sm:flex">
                                {isOrdinance ? "자치법규" : "법률"}
                              </Badge>
                            )}
                          </div>

                          {/* 버튼 그룹: 새로고침 + 즐겨찾기 + 글씨크기 + 복사 (컴팩트하게 1줄) */}
                          <div className="flex items-center gap-0 shrink-0">
                            {/* ✅ 강제 새로고침 버튼 */}
                            {onRefresh && (
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-orange-500 hover:text-orange-600 hover:bg-orange-500/10" onClick={onRefresh} title="캐시 무시 새로고침 (개발용)">
                                <Icon name="refresh-cw" size={14} />
                              </Button>
                            )}
                            {/* 즐겨찾기 버튼 */}
                            <Button
                              key={`fav-btn-title-${activeArticle.jo}-${isFavorite(activeArticle.jo)}`}
                              variant="ghost"
                              size="sm"
                              onClick={() => onToggleFavorite?.(activeArticle.jo)}
                              className="h-7 w-7 p-0"
                              title={isFavorite(activeArticle.jo) ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                            >
                              <Icon name="star" size={16} className={`transition-all ${isFavorite(activeArticle.jo) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
                            </Button>
                            {/* 글씨크기 버튼 */}
                            <Button variant="ghost" size="sm" onClick={decreaseFontSize} title="글자 작게" className="h-7 w-7 p-0">
                              <Icon name="zoom-out" size={14} />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={resetFontSize} title="기본 크기" className="h-7 w-7 p-0">
                              <Icon name="rotate-clockwise" size={12} />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={increaseFontSize} title="글자 크게" className="h-7 w-7 p-0">
                              <Icon name="zoom-in" size={14} />
                            </Button>
                            {/* px 텍스트: PC에서만 표시 */}
                            <span className="hidden lg:inline text-xs text-muted-foreground ml-1 mr-1">{fontSize}px</span>
                            {/* 복사 버튼 */}
                            <CopyButton
                              getText={() => `${formatSimpleJo(activeArticle.jo, isOrdinance)}${activeArticle.title ? ` (${activeArticle.title})` : ''}\n\n${activeArticle.content}`}
                              message="복사됨"
                              className="h-7 w-7 p-0"
                            />
                          </div>
                        </div>
                      </div>

                      <div
                        className="text-foreground leading-relaxed break-words whitespace-pre-wrap"
                        style={{
                          fontSize: `${fontSize}px`,
                          lineHeight: "1.8",
                          overflowWrap: "break-word",
                          wordBreak: "break-word",
                        }}
                        onClick={handleContentClick}
                        dangerouslySetInnerHTML={{ __html: activeArticleHtml }}
                      />

                      {!isOrdinance && revisionHistory.length > 0 && (
                        <div className="mt-12">
                          <RevisionHistory
                            history={revisionHistory}
                            articleTitle={`${formatSimpleJo(activeArticle.jo, isOrdinance)}${activeArticle.title ? ` (${activeArticle.title})` : ""}`}
                          />
                        </div>
                      )}

                      {/* 판례 섹션 - 하단 모드 */}
                      {showPrecedents && precedentViewMode === "bottom" && (
                        <div className="mt-8">
                          <PrecedentSection
                            precedents={precedents}
                            totalCount={precedentTotalCount}
                            loading={loadingPrecedents}
                            error={precedentsError}
                            selectedPrecedent={selectedPrecedent}
                            loadingDetail={loadingPrecedentDetail}
                            viewMode={precedentViewMode}
                            onViewDetail={handleViewPrecedentDetail}
                            onExpand={expandPrecedentPanel}
                            onCollapse={collapsePrecedentPanel}
                          />
                        </div>
                      )}
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
