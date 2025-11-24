"use client"

import type React from "react"
import { useState, useEffect, useRef, useMemo } from "react"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  BookOpen,
  GitCompare,
  Star,
  Sparkles,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ExternalLink,
  Bookmark,
  FileText,
  Link2,
  Eye,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Copy,
  AlertTriangle,
  Check,
  Calendar,
  ListOrdered,
  Building2,
  GitMerge,
  MessageCircleQuestion,
} from "lucide-react"
import type { LawArticle, LawMeta, ThreeTierData } from "@/lib/law-types"
import { extractArticleText, formatDelegationContent } from "@/lib/law-xml-parser"
import { buildJO, formatJO, formatSimpleJo, type ParsedRelatedLaw } from "@/lib/law-parser"
import { ReferenceModal } from "@/components/reference-modal"
import { RevisionHistory } from "@/components/revision-history"
import { ArticleBottomSheet } from "@/components/article-bottom-sheet"
import { FloatingActionButton } from "@/components/ui/floating-action-button"
import { VirtualizedArticleList } from "@/components/virtualized-article-list"
import { VirtualizedFullArticleView } from "@/components/virtualized-full-article-view"
import { DelegationLoadingSkeleton } from "@/components/delegation-loading-skeleton"
import { DelegationPanel } from "@/components/law-viewer-delegation-panel"
import { SwipeTutorial, SwipeHint } from "@/components/swipe-tutorial"
import { parseArticleHistoryXML } from "@/lib/revision-parser"
import { clearAdminRuleContentCache } from "@/lib/admin-rule-cache"
import { useToast } from "@/hooks/use-toast"
import { useLawViewerAdminRules } from "@/hooks/use-law-viewer-admin-rules"
import { useLawViewerModals } from "@/hooks/use-law-viewer-modals"
import { useLawViewerThreeTier } from "@/hooks/use-law-viewer-three-tier"
import { useSwipe } from "@/hooks/use-swipe"
import { convertAIAnswerToHTML } from '@/lib/ai-answer-processor'
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
}: LawViewerProps) {
  const isFullView = isOrdinance || viewMode === "full"
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
  const articleRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})
  const contentRef = useRef<HTMLDivElement>(null)
  const [revisionHistory, setRevisionHistory] = useState<any[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Swipe tutorial and hints
  const [swipeHint, setSwipeHint] = useState<{ direction: "left" | "right" } | null>(null)

  // AI 답변 HTML 변환 (섹션별 링크 처리)
  const aiAnswerHTML = useMemo(() => {
    if (!aiAnswerContent) return ''
    return convertAIAnswerToHTML(aiAnswerContent)
  }, [aiAnswerContent])

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
    adminRules,
    loadingAdminRules,
    adminRulesError,
    adminRulesProgress,
    handleViewAdminRuleFullContent,
    getLawGoKrLink,
  } = useLawViewerAdminRules(activeArticleNumber || "", meta)

  // Update loadedArticles when props.articles changes
  useEffect(() => {
    setLoadedArticles(actualArticles)
  }, [articles])

  // Log when loadedArticles changes
  useEffect(() => {
  }, [loadedArticles, activeJo])

  const activeArticle = loadedArticles.find((a) => a.jo === activeJo)

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

  // Total delegation count (시행령 + 시행규칙 + 행정규칙)
  // 행정규칙은 lazy loading이므로 loadedAdminRulesCount 사용
  const totalDelegationCount = validDelegations.length + (showAdminRules ? adminRules.length : loadedAdminRulesCount)

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
    if (isOrdinance) {
      return
    }
    if (!activeJo) {
      return
    }

    fetchRevisionHistory(activeJo)
  }, [meta.lawId, activeJo, isOrdinance])

  const handleArticleClick = async (jo: string) => {

    // Close article list on mobile after selection
    setIsArticleListExpanded(false)

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

    if (isFullView) {
      const element = articleRefs.current[jo]
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    } else {
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

  const increaseFontSize = () => setFontSize((prev) => Math.min(prev + 2, 24))
  const decreaseFontSize = () => setFontSize((prev) => Math.max(prev - 2, 10))
  const resetFontSize = () => setFontSize(14)

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

      // Ordinance format: 6-digit AABBCC (AA = article, BB = branch, CC = sub)
      // Example: "010000" = 제1조, "010100" = 제1조의1
      if ((isOrdinance || forceOrdinance) && jo.length === 6 && /^\d{6}$/.test(jo)) {
        const articleNum = Number.parseInt(jo.substring(0, 2), 10)
        const branchNum = Number.parseInt(jo.substring(2, 4), 10)
        const subNum = Number.parseInt(jo.substring(4, 6), 10)

        let result = `제${articleNum}조`
        if (branchNum > 0) result += `의${branchNum}`
        if (subNum > 0) result += `-${subNum}`

        return result
      }

      // Law format: 6-digit AAAABB (AAAA = article, BB = branch)
      if (!isOrdinance && jo.length === 6 && /^\d{6}$/.test(jo)) {
        const articleNum = Number.parseInt(jo.substring(0, 4), 10)
        const branchNum = Number.parseInt(jo.substring(4, 6), 10)
        return branchNum === 0 ? `제${articleNum}조` : `제${articleNum}조의${branchNum}`
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

  // Handle clicks on linkified references inside article content
  const handleContentClick: React.MouseEventHandler<HTMLDivElement> = async (e) => {
    const target = e.target as HTMLElement
    if (target && target.tagName === "A") {
      e.preventDefault()
      e.stopPropagation() // 이벤트 버블링 차단


      const refType = target.getAttribute("data-ref")
      if (refType === "article") {
        const articleLabel = target.getAttribute("data-article") || ""
        // If immediately preceded by external law anchor, treat as external
        const prev = target.previousElementSibling as HTMLElement | null
        if (
          prev &&
          prev.tagName === "A" &&
          prev.classList.contains("law-ref") &&
          prev.getAttribute("data-ref") === "law"
        ) {
          const lawName = prev.getAttribute("data-law") || ""
          await openExternalLawArticleModal(lawName, articleLabel)
          setLastExternalRef({ lawName, joLabel: articleLabel })
          return
        }

        // AI 답변 모드에서는 법령명을 자동으로 추론
        if (aiAnswerMode) {
          const { inferLawNameFromArticle } = await import('@/lib/ai-law-inference')

          const inferred = inferLawNameFromArticle(articleLabel, {
            userQuery,
            relatedLaws: relatedArticles,
            aiAnswerContent,
            citations: aiCitations,
          })

          if (inferred) {
            debugLogger.info('법령명 자동 추론', {
              article: articleLabel,
              lawName: inferred.lawName,
              confidence: inferred.confidence,
              reason: inferred.reason
            })

            await openExternalLawArticleModal(inferred.lawName, articleLabel)
            setLastExternalRef({ lawName: inferred.lawName, joLabel: articleLabel })
            return
          }

          // 추론 실패 시 lastExternalRef 사용 (fallback)
          if (lastExternalRef?.lawName) {
            await openExternalLawArticleModal(lastExternalRef.lawName, articleLabel)
            setLastExternalRef({ ...lastExternalRef, joLabel: articleLabel })
            return
          }

          // 둘 다 실패 시 에러 메시지
          toast({
            title: "법령명을 찾을 수 없습니다",
            description: `"${articleLabel}"의 법령명을 자동으로 찾을 수 없습니다. 법령명과 함께 명시된 링크를 클릭해주세요.`,
            variant: "destructive"
          })
          return
        }

        // 일반 모드: 현재 법령에서 검색
        try {
          const joCode = buildJO(articleLabel)
          const found = articles.find((a) => a.jo === joCode || formatJO(a.jo) === formatJO(joCode))
          if (found) {
            // 현재 모달이 열려있으면 히스토리에 저장
            if (refModal.open && refModal.title) {
              setRefModalHistory(prev => [...prev, {
                title: refModal.title!,
                html: refModal.html,
                forceWhiteTheme: refModal.forceWhiteTheme,
                lawName: refModal.lawName,
                articleNumber: refModal.articleNumber,
              }])
            }

            setRefModal({
              open: true,
              title: `${meta.lawTitle} ${formatJO(found.jo)}${found.title ? ` (${found.title})` : ""}`,
              html: extractArticleText(found, false, meta.lawTitle),
              lawName: meta.lawTitle,
              articleNumber: formatJO(found.jo),
            })
            return
          }
        } catch { }

        // 못 찾았으면 외부 법령으로 간주 (lastExternalRef 사용)
        if (lastExternalRef && lastExternalRef.lawName) {
          await openExternalLawArticleModal(lastExternalRef.lawName, articleLabel)
          setLastExternalRef({ lawName: lastExternalRef.lawName, joLabel: articleLabel })
        } else {
          // Fallback: 새 창으로 법제처 검색
          window.open(`https://www.law.go.kr/법령/${encodeURIComponent(meta.lawTitle)}/${articleLabel}`, "_blank", "noopener")
        }
      } else if (refType === "law") {
        const lawName = target.getAttribute("data-law") || ""
        // Try to pair with next article anchor on the same line
        let articleLabel = ""
        const next = target.nextElementSibling as HTMLElement | null
        if (
          next &&
          next.tagName === "A" &&
          next.classList.contains("law-ref") &&
          next.getAttribute("data-ref") === "article"
        ) {
          articleLabel = next.getAttribute("data-article") || ""
        }
        if (articleLabel) {
          await openExternalLawArticleModal(lawName, articleLabel)
          setLastExternalRef({ lawName, joLabel: articleLabel })
        } else {
          // 자치법규 여부 감지
          const isOrdinance = /조례|규칙/.test(lawName) ||
            /(특별시|광역시|[가-힣]+도|[가-힣]+(시|군|구))\s+[가-힣]/.test(lawName)
          const lawPath = isOrdinance ? '자치법규' : '법령'
          window.open(`https://www.law.go.kr/${lawPath}/${encodeURIComponent(lawName)}`, "_blank", "noopener")
          setLastExternalRef({ lawName })
        }
      } else if (refType === "regulation") {
        const clickedText = target.textContent || ""

        // Load 3-tier data first if not loaded
        if (!threeTierDelegation && !threeTierCitation) {
          await fetchThreeTierData()
        }

        // Enable admin rules, set list view mode, switch to 2-tier view, and open admin tab
        if (!showAdminRules) {
          setShowAdminRules(true)
        }
        setAdminRuleViewMode("list")
        setTierViewMode("2-tier")
        setDelegationActiveTab("admin") // 행정규칙 탭 자동 선택
      } else if (refType === "law-article") {
        const lawName = target.getAttribute("data-law") || ""
        const articleLabel = target.getAttribute("data-article") || ""

        // 모든 법령 링크는 모달로 열기 (사이드바 방식과 동일)
        await openExternalLawArticleModal(lawName, articleLabel)
        setLastExternalRef({ lawName, joLabel: articleLabel })
      } else if (refType === "same") {
        // Use last external reference law + current article, change to requested part
        if (lastExternalRef && lastExternalRef.joLabel) {
          const part = target.getAttribute("data-part") || ""
          const base = lastExternalRef.joLabel.replace(/제\d+항(제\d+호)?/, "").trim()
          const articleLabel = `${base}${part}`
          await openExternalLawArticleModal(lastExternalRef.lawName, articleLabel)
          setLastExternalRef({ lawName: lastExternalRef.lawName, joLabel: articleLabel })
        }
      } else if (refType === "related") {
        const kind = target.getAttribute("data-kind") || "decree"

        // AI 답변 모드: 시행령/시행규칙 → 법령명 추론하여 모달 열기
        if (aiAnswerMode) {
          const { inferLawNameFromArticle } = await import('@/lib/ai-law-inference')

          // 컨텍스트에서 법령명 추론
          const inferred = inferLawNameFromArticle('', {
            userQuery,
            relatedLaws: relatedArticles,
            aiAnswerContent,
            citations: aiCitations,
          })

          if (inferred) {
            const baseLawName = inferred.lawName.replace(/\s*(법|규칙|조례)$/, '$1')
            const relatedLawName = kind === 'decree'
              ? `${baseLawName} 시행령`
              : kind === 'rule'
                ? `${baseLawName} 시행규칙`
                : baseLawName

            window.open(`https://www.law.go.kr/법령/${encodeURIComponent(relatedLawName)}`, "_blank", "noopener")
            return
          }
        }

        // 일반 모드: 3단 비교 뷰로 전환
        if (!activeArticle) return

        // Load 3-tier data first if not loaded
        if (!threeTierDelegation && !threeTierCitation) {
          await fetchThreeTierData()
        }

        // Close admin rules view and restore delegation view
        setShowAdminRules(false)
        setAdminRuleViewMode("list")
        setAdminRuleHtml(null)

        setTierViewMode("2-tier")

        // Set appropriate tab based on kind
        if (kind === "decree") {
          setDelegationActiveTab("decree") // 시행령 탭
        } else if (kind === "rule") {
          setDelegationActiveTab("rule") // 시행규칙 탭
        }
      }
    }
  }



  return (
    <>
      <div className="w-full mx-auto max-w-[1280px]">
        <div className="relative grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 h-[calc(100vh-12rem)] lg:h-auto" style={{ fontFamily: "Pretendard, sans-serif" }}>
        {/* Mobile overlay backdrop */}
        {isArticleListExpanded && (
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsArticleListExpanded(false)}
          />
        )}

        {/* Left sidebar - AI 답변 모드 or 조문 목록 (Desktop only) */}
        <Card className="hidden lg:flex flex-col overflow-hidden lg:max-h-[calc(100vh-12rem)]">
          {aiAnswerMode ? (
            <AIAnswerSidebar
              relatedArticles={relatedArticles}
              onRelatedArticleClick={openExternalLawArticleModal}
            />
          ) : (
            // ========== 기존 조문 목록 ==========
            <>
              {/* 헤더 - 본문 헤더와 동일한 디자인 */}
              <div className="border-b border-border px-4 pt-4 pb-3 flex-shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <ListOrdered className="h-5 w-5 text-primary" />
                  <h3 className="text-xl font-bold text-foreground">조문 목록</h3>
                </div>
                <Badge variant="outline" className="text-xs">
                  <FileText className="h-3 w-3 mr-1" />
                  {actualArticles.length}개 조문
                </Badge>
              </div>

              <div className="flex-1 min-h-0 px-4 pt-2 pb-4">
                <VirtualizedArticleList
                  articles={actualArticles}
                  activeJo={activeJo}
                  loadingJo={loadingJo}
                  favorites={favorites}
                  isOrdinance={isOrdinance}
                  onArticleClick={handleArticleClick}
                  onToggleFavorite={(jo) => onToggleFavorite?.(jo)}
                />
              </div>
            </>
          )
          }
        </Card >

        {/* Mobile Bottom Sheet for Article List */}
        <ArticleBottomSheet
          isOpen={isArticleListExpanded}
          onClose={() => setIsArticleListExpanded(false)}
          title={aiAnswerMode ? "관련 법령 목록" : "조문 목록"}
          snapPoints={[40, 70, 90]}
        >
          {aiAnswerMode ? (
            <AIAnswerSidebar
              relatedArticles={relatedArticles}
              onRelatedArticleClick={openExternalLawArticleModal}
              onCloseSidebar={() => setIsArticleListExpanded(false)}
              showHeader={false}
            />
          ) : (
            // 일반 모드: 조문 목록
            <>
              <div className="mb-4">
                <Badge variant="outline" className="text-xs">
                  <FileText className="h-3 w-3 mr-1" />
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
          icon={<ListOrdered className="h-5 w-5" />}
          count={aiAnswerMode ? relatedArticles.length : actualArticles.length}
          label={aiAnswerMode ? "관련 법령 목록 열기" : "조문 목록 열기"}
        />

        {/* Right panel - Article content */}
        <Card className="flex flex-col overflow-hidden lg:max-h-[calc(100vh-12rem)]">
          {/* Header - Hidden in AI Answer Mode */}
          {!aiAnswerMode && (
            <div className="border-b border-border px-4 pt-2 pb-5">
              <div className="flex items-center gap-2 mb-1">
                <BookOpen className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold text-foreground">{meta.lawTitle}</h2>
                {!isOrdinance && viewMode === "full" && (
                  <Badge variant="outline" className="text-xs">
                    전체 조문
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {meta.latestEffectiveDate && (
                  <Badge variant="outline" className="text-xs">
                    <Calendar className="h-3 w-3 mr-1" />
                    시행: {meta.latestEffectiveDate}
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs">
                  <FileText className="h-3 w-3 mr-1" />
                  {articles.length}개 조문
                </Badge>

                {isOrdinance && (
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs">
                    <Building2 className="h-3 w-3 mr-1" />
                    자치법규
                  </Badge>
                )}
                {meta.revisionType && (
                  <Badge variant="secondary" className="text-xs">
                    {meta.revisionType}
                  </Badge>
                )}
                {!isOrdinance && viewMode === "full" && activeArticle && (
                  <Badge variant="outline" className="text-xs">
                    현재: {formatSimpleJo(activeArticle.jo)}
                    {activeArticle.title && ` (${activeArticle.title})`}
                  </Badge>
                )}
                {(() => {
                  const currentLawFavorites = articles.filter(a => favorites.has(a.jo)).length
                  return currentLawFavorites > 0 && (
                    <Badge variant="outline" className="text-xs">
                      ⭐ {currentLawFavorites}개
                    </Badge>
                  )
                })()}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {
            !aiAnswerMode && !isOrdinance && activeArticle && (
              <div className="border-b border-border px-4 py-0.5 pt-0 pb-5">
                <div className="flex flex-wrap gap-1.5">
                  <Button variant="default" size="sm" onClick={() => onCompare?.(activeArticle.jo)} className="h-7 px-2">
                    <GitCompare className="h-3.5 w-3.5 mr-1" />
                    신·구법 비교
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onSummarize?.(activeArticle.jo)} className="h-7 px-2">
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    AI 요약
                  </Button>
                  <Button
                    variant={favorites.has(activeArticle.jo) ? "default" : "outline"}
                    size="sm"
                    onClick={() => onToggleFavorite?.(activeArticle.jo)}
                    className="h-7 px-2"
                  >
                    <Star className={`h-3.5 w-3.5 mr-1 ${favorites.has(activeArticle.jo) ? "fill-current" : ""}`} />
                    즐겨찾기
                  </Button>
                  <Button variant="outline" size="sm" onClick={openLawCenter} className="h-7 px-2">
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    원문 보기
                  </Button>
                  {/* 위임법령 보기 버튼 (2단 뷰 + 탭 구조) */}
                  {!isOrdinance && !aiAnswerMode && (
                    <Button
                      variant={tierViewMode === "2-tier" ? "default" : "outline"}
                      size="sm"
                      disabled={isLoadingThreeTier}
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
                      className="h-7 px-2"
                    >
                      {isLoadingThreeTier ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 mr-1" />
                      )}
                      {tierViewMode === "2-tier" ? "위임법령 닫기" : `위임법령${totalDelegationCount > 0 ? ` (${totalDelegationCount})` : ""}`}
                    </Button>
                  )}
                </div>
              </div>
            )
          }

          {
            isOrdinance && (
              <div className="border-b border-border px-4 py-0.5 pt-0 pb-5">
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={openLawCenter} className="mr-2 bg-transparent h-7 px-2">
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    원문 보기
                  </Button>

                  <Button variant="ghost" size="sm" onClick={decreaseFontSize} title="글자 작게" className="h-7 px-2">
                    <ZoomOut className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={resetFontSize} title="기본 크기" className="h-7 px-2">
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={increaseFontSize} title="글자 크게" className="h-7 px-2">
                    <ZoomIn className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs text-muted-foreground ml-1">{fontSize}px</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const content = actualArticles.map(a => `${formatSimpleJo(a.jo)}\n${a.content}`).join('\n\n')
                      navigator.clipboard.writeText(content)
                      toast({ title: "복사 완료", description: "법령 전체 내용이 클립보드에 복사되었습니다." })
                    }}
                    title="전체 복사"
                    className="h-7 px-2"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          }

          <div className="flex-1 min-h-0">
            {/* 전문조회 모드: 자체 스크롤 관리 */}
            {viewMode === "full" ? (
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
                  adminRules={adminRules}
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
                      onContentClick={handleContentClick}
                      articleRefs={articleRefs}
                    />
                  </div>
                </ScrollArea>
              )
            ) : aiAnswerMode && aiAnswerContent ? (
              <ScrollArea className="h-full" ref={contentRef}>
                <div className="p-6 pb-20">
                  <AIAnswerContent
                    aiAnswerHTML={aiAnswerHTML}
                    userQuery={userQuery}
                    aiConfidenceLevel={aiConfidenceLevel}
                    fileSearchFailed={fileSearchFailed}
                    aiCitations={aiCitations}
                    fontSize={fontSize}
                    setFontSize={setFontSize}
                    handleContentClick={handleContentClick}
                  />
                </div>
              </ScrollArea>
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
                  adminRules={adminRules}
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
                  <div ref={swipeRef} className="px-6 pt-3 pb-20">
                    <div className="mb-3 pb-2 border-b border-border">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <h2 className="text-xl font-bold text-foreground">
                            {formatSimpleJo(activeArticle.jo, isOrdinance)}
                          </h2>
                          {activeArticle.title && (
                            <span className="text-muted-foreground text-lg">({activeArticle.title})</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={decreaseFontSize} title="글자 작게" className="h-7 px-2">
                            <ZoomOut className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={resetFontSize} title="기본 크기" className="h-7 px-2">
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={increaseFontSize} title="글자 크게" className="h-7 px-2">
                            <ZoomIn className="h-3.5 w-3.5" />
                          </Button>
                          <span className="text-xs text-muted-foreground ml-1 mr-2">{fontSize}px</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const content = `${formatSimpleJo(activeArticle.jo, isOrdinance)}${activeArticle.title ? ` (${activeArticle.title})` : ''}\n\n${activeArticle.content}`
                              navigator.clipboard.writeText(content)
                              toast({ title: "복사 완료", description: "조문 내용이 클립보드에 복사되었습니다." })
                            }}
                            title="복사"
                            className="h-7 px-2"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {isOrdinance ? "자치법규" : "법령"}
                      </Badge>
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
                      dangerouslySetInnerHTML={{ __html: extractArticleText(activeArticle, false, meta.lawTitle) }}
                    />

                    {!isOrdinance && revisionHistory.length > 0 && (
                      <div className="mt-12">
                        <RevisionHistory
                          history={revisionHistory}
                          articleTitle={`${formatSimpleJo(activeArticle.jo, isOrdinance)}${activeArticle.title ? ` (${activeArticle.title})` : ""}`}
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
