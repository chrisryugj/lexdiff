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
import { buildJO, formatJO, type ParsedRelatedLaw } from "@/lib/law-parser"
import { ReferenceModal } from "@/components/reference-modal"
import { RevisionHistory } from "@/components/revision-history"
import { ArticleBottomSheet } from "@/components/article-bottom-sheet"
import { FloatingActionButton } from "@/components/ui/floating-action-button"
import { VirtualizedArticleList } from "@/components/virtualized-article-list"
import { VirtualizedFullArticleView } from "@/components/virtualized-full-article-view"
import { DelegationLoadingSkeleton } from "@/components/delegation-loading-skeleton"
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
      <div className="relative grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 h-[calc(100vh-12rem)] lg:overflow-hidden" style={{ fontFamily: "Pretendard, sans-serif" }}>
        {/* Mobile overlay backdrop */}
        {isArticleListExpanded && (
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsArticleListExpanded(false)}
          />
        )}

        {/* Left sidebar - AI 답변 모드 or 조문 목록 (Desktop only) */}
        <Card className="hidden lg:flex p-4 flex-col overflow-hidden">
          {aiAnswerMode ? (
            // ========== AI 모드: 왼쪽은 관련 법령 목록 ==========
            <>
              <div className="border-b border-border p-4 flex-shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <Link2 className="h-5 w-5 text-primary" />
                  <h3 className="text-xl font-bold text-foreground">관련 법령 목록</h3>
                </div>
                {(() => {
                  // 중복 제거를 위한 그룹화 (카운트 계산용)
                  const grouped = new Map<string, { source: Set<string> }>()
                  relatedArticles.forEach(law => {
                    const key = `${law.lawName}|${law.jo}`
                    const existing = grouped.get(key)
                    if (existing) {
                      existing.source.add(law.source)
                    } else {
                      grouped.set(key, { source: new Set([law.source]) })
                    }
                  })

                  // 중복 제거된 고유 조문 수
                  const uniqueCount = grouped.size

                  // 발췌만 있는 조문 수 (관련법령에도 있으면 제외)
                  const excerptOnlyCount = Array.from(grouped.values()).filter(
                    g => g.source.has('excerpt') && g.source.size === 1
                  ).length

                  // 관련법령만 있는 조문 수 (발췌에도 있으면 제외)
                  const relatedOnlyCount = Array.from(grouped.values()).filter(
                    g => g.source.has('related') && g.source.size === 1
                  ).length

                  // 둘 다 있는 조문 수
                  const bothCount = Array.from(grouped.values()).filter(
                    g => g.source.size === 2
                  ).length

                  return (
                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                      <Badge variant="secondary" className="text-xs whitespace-nowrap">
                        <FileText className="h-3 w-3 mr-1" />
                        전체 {uniqueCount}개
                      </Badge>
                      {excerptOnlyCount > 0 && (
                        <Badge variant="outline" className="text-xs bg-purple-900/30 text-purple-300 border-purple-700/50 whitespace-nowrap">
                          <Bookmark className="h-3 w-3 mr-1" />
                          발췌 {excerptOnlyCount}
                        </Badge>
                      )}
                      {relatedOnlyCount > 0 && (
                        <Badge variant="outline" className="text-xs bg-blue-900/30 text-blue-300 border-blue-700/50 whitespace-nowrap">
                          <Link2 className="h-3 w-3 mr-1" />
                          관련 {relatedOnlyCount}
                        </Badge>
                      )}
                      {bothCount > 0 && (
                        <Badge variant="outline" className="text-xs bg-green-900/30 text-green-300 border-green-700/50 whitespace-nowrap">
                          <GitMerge className="h-3 w-3 mr-1" />
                          둘 다 {bothCount}
                        </Badge>
                      )}
                    </div>
                  )
                })()}
              </div>

              <div className="flex-1 min-h-0">
                <ScrollArea className="h-full">
                  <div className="space-y-1 pr-4 px-4 pt-2 pb-4">
                    {relatedArticles.length > 0 ? (
                      (() => {
                        // 법령명+조문으로 그룹화 (같은 법령이 발췌+관련 둘 다 있을 수 있음)
                        const grouped = new Map<string, { law: ParsedRelatedLaw; sources: Set<string> }>()

                        relatedArticles.forEach(law => {
                          const key = `${law.lawName}|${law.jo}`
                          const existing = grouped.get(key)
                          if (existing) {
                            existing.sources.add(law.source)
                          } else {
                            grouped.set(key, { law, sources: new Set([law.source]) })
                          }
                        })

                        return Array.from(grouped.values()).map(({ law, sources }, idx) => {
                          const handleClick = () => {
                            debugLogger.info('🔗 [사이드바] 법령 링크 클릭 - 모달로 열기', {
                              lawName: law.lawName,
                              jo: law.jo,
                              article: law.article,
                              sources: Array.from(sources)
                            })

                            // 사이드바 닫기 (모바일)
                            setIsArticleListExpanded(false)

                            // ✅ 모달로 법령 조문 열기
                            openExternalLawArticleModal(law.lawName, law.article)
                              .then(() => {
                                setLastExternalRef({ lawName: law.lawName, joLabel: law.article })
                                debugLogger.success('모달 열기 성공', { lawName: law.lawName, article: law.article })
                              })
                              .catch((err) => {
                                debugLogger.error('모달 열기 실패', err)
                              })
                          }

                          return (
                            <button
                              key={`${law.lawName}-${law.jo}-${idx}`}
                              onClick={handleClick}
                              className="w-full text-left pl-4 pr-5 py-3 rounded-md border border-blue-800/20 hover:border-blue-600/40 bg-gradient-to-r from-blue-950/20 to-purple-950/20 hover:from-blue-900/40 hover:to-purple-900/40 transition-all duration-200 group"
                            >
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-1.5 flex-1">
                                  <ExternalLink className="h-3.5 w-3.5 text-blue-400 group-hover:text-blue-300 shrink-0 mt-0.5" />
                                  <span className="font-medium text-blue-300 group-hover:text-blue-200 text-base">
                                    {law.lawName}
                                  </span>
                                </div>
                                {/* 출처 아이콘 (중복 시 여러 개 표시) */}
                                <div className="flex items-center gap-1 shrink-0">
                                  {sources.has('excerpt') && (
                                    <Bookmark className="h-3.5 w-3.5 text-purple-400" title="발췌조문" />
                                  )}
                                  {sources.has('related') && (
                                    <Link2 className="h-3.5 w-3.5 text-blue-400" title="관련법령" />
                                  )}
                                </div>
                              </div>
                              <div className="text-sm text-muted-foreground pl-5">
                                {law.article}
                                {law.title && (
                                  <span className="text-blue-400/70 ml-1">{law.title}</span>
                                )}
                              </div>
                            </button>
                          )
                        })
                      })()
                    ) : (
                      <div className="text-sm text-muted-foreground text-center py-8">
                        관련 법령이 없습니다
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </>
          ) : (
            // ========== 기존 조문 목록 ==========
            <>
              {/* 헤더 - 본문 헤더와 동일한 디자인 */}
              <div className="border-b border-border p-4 flex-shrink-0">
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
            // AI 모드: 관련 법령 목록
            <>
              {(() => {
                // 중복 제거를 위한 그룹화 (카운트 계산용)
                const grouped = new Map<string, { source: Set<string> }>()
                relatedArticles.forEach(law => {
                  const key = `${law.lawName}|${law.jo}`
                  const existing = grouped.get(key)
                  if (existing) {
                    existing.source.add(law.source)
                  } else {
                    grouped.set(key, { source: new Set([law.source]) })
                  }
                })

                const uniqueCount = grouped.size
                const excerptOnlyCount = Array.from(grouped.values()).filter(
                  g => g.source.has('excerpt') && g.source.size === 1
                ).length
                const relatedOnlyCount = Array.from(grouped.values()).filter(
                  g => g.source.has('related') && g.source.size === 1
                ).length
                const bothCount = Array.from(grouped.values()).filter(
                  g => g.source.size === 2
                ).length

                return (
                  <div className="flex items-center gap-2 flex-wrap mb-4">
                    <Badge variant="secondary" className="text-xs">
                      <FileText className="h-3 w-3 mr-1" />
                      전체 {uniqueCount}개
                    </Badge>
                    {excerptOnlyCount > 0 && (
                      <Badge variant="outline" className="text-xs bg-purple-900/30 text-purple-300 border-purple-700/50">
                        <Bookmark className="h-3 w-3 mr-1" />
                        발췌 {excerptOnlyCount}
                      </Badge>
                    )}
                    {relatedOnlyCount > 0 && (
                      <Badge variant="outline" className="text-xs bg-blue-900/30 text-blue-300 border-blue-700/50">
                        <Link2 className="h-3 w-3 mr-1" />
                        관련 {relatedOnlyCount}
                      </Badge>
                    )}
                    {bothCount > 0 && (
                      <Badge variant="outline" className="text-xs bg-green-900/30 text-green-300 border-green-700/50">
                        <GitMerge className="h-3 w-3 mr-1" />
                        둘 다 {bothCount}
                      </Badge>
                    )}
                  </div>
                )
              })()}

              <div className="space-y-2">
                {relatedArticles.length > 0 ? (
                  (() => {
                    const grouped = new Map<string, { law: ParsedRelatedLaw; sources: Set<string> }>()
                    relatedArticles.forEach(law => {
                      const key = `${law.lawName}|${law.jo}`
                      const existing = grouped.get(key)
                      if (existing) {
                        existing.sources.add(law.source)
                      } else {
                        grouped.set(key, { law, sources: new Set([law.source]) })
                      }
                    })

                    return Array.from(grouped.values()).map(({ law, sources }, idx) => {
                      const handleClick = () => {
                        setIsArticleListExpanded(false)
                        openExternalLawArticleModal(law.lawName, law.article)
                          .then(() => {
                            setLastExternalRef({ lawName: law.lawName, joLabel: law.article })
                          })
                          .catch((err) => {
                            debugLogger.error('모달 열기 실패', err)
                          })
                      }

                      return (
                        <button
                          key={`${law.lawName}-${law.jo}-${idx}`}
                          onClick={handleClick}
                          className="w-full text-left pl-4 pr-5 py-3 rounded-md border border-blue-800/20 hover:border-blue-600/40 bg-gradient-to-r from-blue-950/20 to-purple-950/20 hover:from-blue-900/40 hover:to-purple-900/40 transition-all duration-200 group"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-1.5 flex-1">
                              <ExternalLink className="h-3.5 w-3.5 text-blue-400 group-hover:text-blue-300 shrink-0 mt-0.5" />
                              <span className="font-medium text-blue-300 group-hover:text-blue-200 text-base">
                                {law.lawName}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {sources.has('excerpt') && (
                                <Bookmark className="h-3.5 w-3.5 text-purple-400" title="발췌조문" />
                              )}
                              {sources.has('related') && (
                                <Link2 className="h-3.5 w-3.5 text-blue-400" title="관련법령" />
                              )}
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground pl-5">
                            {law.article}
                            {law.title && (
                              <span className="text-blue-400/70 ml-1">{law.title}</span>
                            )}
                          </div>
                        </button>
                      )
                    })
                  })()
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    관련 법령이 없습니다
                  </div>
                )}
              </div>
            </>
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
        <Card className="flex flex-col overflow-hidden">
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
            ) : tierViewMode === "2-tier" && tierItems.length > 0 && activeArticle ? (
              // 2-tier delegation view: COMPLETELY OUTSIDE ScrollArea
              <div className="h-full px-5" ref={swipeRef}>
                {/* 2-tier content will be rendered here - copying from line 2810 */}
                      {/* Mobile: Tab-based view with 4 tabs (법률, 시행령, 시행규칙, 행정규칙) */}
                      <div className="md:hidden h-full">
                        <Tabs
                          defaultValue="law"
                          className="w-full h-full flex flex-col"
                          onValueChange={(value) => {
                            // 행정규칙 탭 선택 시 로드 시작 (단계적 로딩)
                            if (value === "admin" && !showAdminRules) {
                              setShowAdminRules(true)
                            }
                          }}
                        >
                          <TabsList className="w-full mb-2 grid grid-cols-4">
                            <TabsTrigger value="law" className="text-xs">법률</TabsTrigger>
                            <TabsTrigger value="decree" className="text-xs">
                              시행령 ({validDelegations.filter((d) => d.type === "시행령").length})
                            </TabsTrigger>
                            <TabsTrigger value="rule" className="text-xs">
                              시행규칙 ({validDelegations.filter((d) => d.type === "시행규칙").length})
                            </TabsTrigger>
                            <TabsTrigger value="admin" className="text-xs">
                              {loadingAdminRules ? (
                                <>
                                  행정규칙 <Loader2 className="h-3 w-3 ml-0.5 inline-block animate-spin" />
                                </>
                              ) : showAdminRules ? (
                                `행정규칙 (${adminRules.length})`
                              ) : (
                                "행정규칙"
                              )}
                            </TabsTrigger>
                          </TabsList>

                          <TabsContent value="law" className="flex-1 overflow-y-auto mt-0">
                            <div className="prose prose-sm max-w-none dark:prose-invert">
                              <div className="mb-3 pb-2 border-b border-border">
                                <h3 className="text-sm font-bold text-foreground mb-1 leading-tight">
                                  {formatSimpleJo(activeArticle.jo)}
                                  {activeArticle.title && <span className="text-muted-foreground text-xs block mt-0.5"> {activeArticle.title}</span>}
                                </h3>
                                <Badge variant="secondary" className="text-xs">법률 본문</Badge>
                              </div>
                              <div
                                className="text-foreground leading-relaxed break-words whitespace-pre-wrap text-sm"
                                style={{
                                  fontSize: `${fontSize}px`,
                                  lineHeight: "1.8",
                                  overflowWrap: "break-word",
                                  wordBreak: "break-word",
                                }}
                                onClick={handleContentClick}
                                dangerouslySetInnerHTML={{ __html: extractArticleText(activeArticle, false, meta.lawTitle) }}
                              />
                            </div>
                          </TabsContent>

                          <TabsContent value="decree" className="flex-1 overflow-y-auto mt-0">
                            {isLoadingThreeTier ? (
                              <DelegationLoadingSkeleton />
                            ) : (
                              <>
                                <div className="mb-3 pb-2 border-b border-border">
                                  <div className="flex items-center gap-2 mb-1">
                                    <FileText className="h-4 w-4 text-foreground" />
                                    <h3 className="text-sm font-bold text-foreground">시행령</h3>
                                  </div>
                                  <Badge variant="secondary" className="text-xs">
                                    {validDelegations.filter((d) => d.type === "시행령").length}개
                                  </Badge>
                                </div>
                                <div className="space-y-3">
                                  {validDelegations
                                    .filter((d) => d.type === "시행령")
                                    .map((delegation, idx) => (
                                      <div
                                        key={idx}
                                        className="p-3 rounded-lg border border-border"
                                      >
                                        {delegation.title && (
                                          <p className="font-semibold text-sm text-foreground mb-2">
                                            {delegation.title}
                                          </p>
                                        )}
                                        {delegation.content && (
                                          <div
                                            className="text-xs text-foreground leading-relaxed break-words"
                                            style={{
                                              fontSize: `${fontSize}px`,
                                              lineHeight: "1.8",
                                              overflowWrap: "break-word",
                                              wordBreak: "break-word",
                                            }}
                                            onClick={handleContentClick}
                                            dangerouslySetInnerHTML={{ __html: formatDelegationContent(delegation.content) }}
                                          />
                                        )}
                                      </div>
                                    ))}
                                  {validDelegations.filter((d) => d.type === "시행령").length === 0 && (
                                    <p className="text-xs text-muted-foreground text-center py-4">시행령 없음</p>
                                  )}
                                </div>
                              </>
                            )}
                          </TabsContent>

                          <TabsContent value="rule" className="flex-1 overflow-y-auto mt-0">
                            {isLoadingThreeTier ? (
                              <DelegationLoadingSkeleton />
                            ) : (
                              <>
                                <div className="mb-3 pb-2 border-b border-border">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h3 className="text-sm font-bold text-foreground">시행규칙</h3>
                                  </div>
                                  <Badge variant="secondary" className="text-xs">
                                    {validDelegations.filter((d) => d.type === "시행규칙" || d.type === "행정규칙").length}개
                                  </Badge>
                                </div>
                                <div className="space-y-3">
                                  {validDelegations
                                    .filter((d) => d.type === "시행규칙" || d.type === "행정규칙")
                                    .map((delegation, idx) => (
                                      <div
                                        key={idx}
                                        className="p-3 rounded-lg border border-border"
                                      >
                                        {delegation.title && (
                                          <p className="font-semibold text-sm text-foreground mb-2">
                                            {delegation.title}
                                          </p>
                                        )}
                                        {delegation.content && (
                                          <div
                                            className="text-xs text-foreground leading-relaxed break-words"
                                            style={{
                                              fontSize: `${fontSize}px`,
                                              lineHeight: "1.8",
                                              overflowWrap: "break-word",
                                              wordBreak: "break-word",
                                            }}
                                            onClick={handleContentClick}
                                            dangerouslySetInnerHTML={{ __html: formatDelegationContent(delegation.content) }}
                                          />
                                        )}
                                      </div>
                                    ))}
                                  {validDelegations.filter((d) => d.type === "시행규칙").length === 0 && (
                                    <p className="text-xs text-muted-foreground text-center py-4">시행규칙 없음</p>
                                  )}
                                </div>
                              </>
                            )}
                          </TabsContent>

                          {/* Admin Rules Tab - 단계적 로딩 */}
                          <TabsContent value="admin" className="flex-1 overflow-y-auto mt-0">
                            {!showAdminRules ? (
                              // 아직 로드 안 함 (탭 클릭 대기 중)
                              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <FileText className="h-12 w-12 mb-4 opacity-30" />
                                <p className="text-sm">행정규칙을 불러오려면 이 탭을 선택하세요</p>
                                <p className="text-xs mt-2 text-muted-foreground/70">
                                  클릭 시 자동으로 로드됩니다
                                </p>
                              </div>
                            ) : loadingAdminRules ? (
                              // 로딩 중
                              <DelegationLoadingSkeleton />
                            ) : adminRuleViewMode === "detail" && adminRuleHtml ? (
                              // 상세 뷰
                              <>
                                <div className="mb-3 pb-2 border-b border-border">
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <div className="flex items-center gap-2">
                                      <FileText className="h-4 w-4 text-foreground" />
                                      <h3 className="text-sm font-bold text-foreground">{adminRuleTitle || "행정규칙"}</h3>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setAdminRuleViewMode("list")}
                                      className="h-7"
                                    >
                                      ← 목록
                                    </Button>
                                  </div>
                                </div>
                                <div
                                  className="text-foreground leading-relaxed break-words whitespace-pre-wrap text-sm"
                                  style={{
                                    fontSize: `${fontSize}px`,
                                    lineHeight: "1.8",
                                    overflowWrap: "break-word",
                                    wordBreak: "break-word",
                                  }}
                                  onClick={handleContentClick}
                                  dangerouslySetInnerHTML={{ __html: adminRuleHtml }}
                                />
                              </>
                            ) : adminRules.length > 0 ? (
                              // 목록 뷰
                              <>
                                <div className="mb-3 pb-2 border-b border-border">
                                  <div className="flex items-center gap-2 mb-1">
                                    <FileText className="h-4 w-4 text-foreground" />
                                    <h3 className="text-sm font-bold text-foreground">행정규칙</h3>
                                  </div>
                                  <Badge variant="secondary" className="text-xs">
                                    {adminRules.length}개
                                  </Badge>
                                </div>
                                <div className="space-y-3">
                                  {adminRules.map((rule, idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => handleViewAdminRuleFullContent(rule)}
                                      className="w-full text-left p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1">
                                          <p className="font-semibold text-sm text-foreground mb-1">
                                            {rule.name}
                                          </p>
                                          {rule.articleNumber && (
                                            <p className="text-xs text-muted-foreground">
                                              관련 조문: {rule.articleNumber}
                                            </p>
                                          )}
                                        </div>
                                        <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </>
                            ) : (
                              // 결과 없음
                              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <AlertCircle className="h-12 w-12 mb-4 opacity-30" />
                                <p className="text-sm">이 조문과 관련된 행정규칙이 없습니다</p>
                              </div>
                            )}
                          </TabsContent>
                        </Tabs>
                      </div>

                      {/* Desktop: 2-column resizable view with tabs */}
                      <div className="hidden md:block h-full">
                        <PanelGroup direction="horizontal" className="h-full">
                          {/* Left Panel: Main article */}
                          <Panel
                            defaultSize={delegationPanelSize}
                            minSize={20}
                            maxSize={70}
                            onResize={(size) => {
                              setDelegationPanelSize(size)
                              if (typeof window !== 'undefined') {
                                localStorage.setItem('lawViewerDelegationSplit', size.toString())
                              }
                            }}
                          >
                            <div style={{ height: '100%', overflow: 'auto', paddingRight: '0.5rem', paddingBottom: '1rem' }}>
                              <div className="prose prose-sm max-w-none dark:prose-invert">
                                <div className="mb-4 pb-2 border-b border-border">
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-foreground" />
                                    <h3 className="text-base font-bold text-foreground">
                                      {formatSimpleJo(activeArticle.jo)}
                                      {activeArticle.title && <span className="text-muted-foreground text-sm"> ({activeArticle.title})</span>}
                                    </h3>
                                    <Badge variant="secondary" className="text-xs">법률 본문</Badge>
                                  </div>
                                </div>
                              <div
                                className="text-foreground leading-relaxed break-words whitespace-pre-wrap text-sm"
                                style={{
                                  fontSize: `${fontSize}px`,
                                  lineHeight: "1.8",
                                  overflowWrap: "break-word",
                                  wordBreak: "break-word",
                                }}
                                onClick={handleContentClick}
                                dangerouslySetInnerHTML={{ __html: extractArticleText(activeArticle, false, meta.lawTitle) }}
                              />
                              </div>
                            </div>
                          </Panel>

                          {/* Resize Handle */}
                          <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors cursor-col-resize" />

                          {/* Right Panel: Tabs for 시행령/시행규칙/행정규칙 */}
                          <Panel>
                            <div style={{ height: '100%', overflow: 'auto', paddingLeft: '1rem', paddingBottom: '1rem' }}>
                              <Tabs
                                value={delegationActiveTab}
                                onValueChange={(value) => {
                                  setDelegationActiveTab(value as "decree" | "rule" | "admin")
                                  // 행정규칙 탭 선택 시 로드 시작 (단계적 로딩)
                                  if (value === "admin" && !showAdminRules) {
                                    setShowAdminRules(true)
                                  }
                                }}
                                className="w-full flex flex-col"
                              >
                              <TabsList className="w-full grid grid-cols-3 mb-2">
                                <TabsTrigger value="decree" className="text-xs">
                                  시행령 ({validDelegations.filter((d) => d.type === "시행령").length})
                                </TabsTrigger>
                                <TabsTrigger value="rule" className="text-xs">
                                  시행규칙 ({validDelegations.filter((d) => d.type === "시행규칙").length})
                                </TabsTrigger>
                                <TabsTrigger value="admin" className="text-xs">
                                  {loadingAdminRules ? (
                                    <>
                                      행정규칙 <Loader2 className="h-3 w-3 ml-1 inline-block animate-spin" />
                                    </>
                                  ) : loadedAdminRulesCount > 0 ? (
                                    `행정규칙 (${loadedAdminRulesCount})`
                                  ) : (
                                    "행정규칙"
                                  )}
                                </TabsTrigger>
                              </TabsList>

                              {/* Decree Tab */}
                              <TabsContent value="decree" className="mt-0">
                                {isLoadingThreeTier ? (
                                  <DelegationLoadingSkeleton />
                                ) : (
                                  <>
                                    <div className="mb-2 pb-2 border-b border-border">
                                      <div className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-foreground" />
                                        <h3 className="text-base font-bold text-foreground">시행령</h3>
                                        <Badge variant="secondary" className="text-xs">
                                          {validDelegations.filter((d) => d.type === "시행령").length}개
                                        </Badge>
                                      </div>
                                    </div>
                                    <div className="space-y-3">
                                      {validDelegations
                                        .filter((d) => d.type === "시행령")
                                        .map((delegation, idx) => (
                                          <div key={idx} className="py-3 border-b border-border last:border-0">
                                            {delegation.title && (
                                              <p className="font-semibold text-sm text-foreground mb-2">
                                                {delegation.title}
                                              </p>
                                            )}
                                            {delegation.content && (
                                              <div
                                                className="text-xs text-foreground leading-relaxed break-words"
                                                style={{
                                                  fontSize: `${fontSize}px`,
                                                  lineHeight: "1.8",
                                                  overflowWrap: "break-word",
                                                  wordBreak: "break-word",
                                                }}
                                                onClick={handleContentClick}
                                                dangerouslySetInnerHTML={{ __html: formatDelegationContent(delegation.content) }}
                                              />
                                            )}
                                          </div>
                                        ))}
                                      {validDelegations.filter((d) => d.type === "시행령").length === 0 && (
                                        <p className="text-xs text-muted-foreground text-center py-4">시행령 없음</p>
                                      )}
                                    </div>
                                  </>
                                )}
                              </TabsContent>

                              {/* Rule Tab */}
                              <TabsContent value="rule" className="mt-0">
                                {isLoadingThreeTier ? (
                                  <DelegationLoadingSkeleton />
                                ) : (
                                  <>
                                    <div className="mb-2 pb-2 border-b border-border">
                                      <div className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-foreground" />
                                        <h3 className="text-base font-bold text-foreground">시행규칙</h3>
                                        <Badge variant="secondary" className="text-xs">
                                          {validDelegations.filter((d) => d.type === "시행규칙").length}개
                                        </Badge>
                                      </div>
                                    </div>
                                    <div className="space-y-3">
                                      {validDelegations
                                        .filter((d) => d.type === "시행규칙")
                                        .map((delegation, idx) => (
                                          <div key={idx} className="py-3 border-b border-border last:border-0">
                                            {delegation.title && (
                                              <p className="font-semibold text-sm text-foreground mb-2">
                                                {delegation.title}
                                              </p>
                                            )}
                                            {delegation.content && (
                                              <div
                                                className="text-xs text-foreground leading-relaxed break-words"
                                                style={{
                                                  fontSize: `${fontSize}px`,
                                                  lineHeight: "1.8",
                                                  overflowWrap: "break-word",
                                                  wordBreak: "break-word",
                                                }}
                                                onClick={handleContentClick}
                                                dangerouslySetInnerHTML={{ __html: formatDelegationContent(delegation.content) }}
                                              />
                                            )}
                                          </div>
                                        ))}
                                      {validDelegations.filter((d) => d.type === "시행규칙").length === 0 && (
                                        <p className="text-xs text-muted-foreground text-center py-4">시행규칙 없음</p>
                                      )}
                                    </div>
                                  </>
                                )}
                              </TabsContent>

                              {/* Admin Rules Tab - 항상 표시 (단계적 로딩) */}
                              <TabsContent value="admin" className="mt-0">
                                {!showAdminRules ? (
                                  // 아직 로드 안 함 (탭 클릭 대기 중)
                                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                    <FileText className="h-12 w-12 mb-4 opacity-30" />
                                    <p className="text-sm">행정규칙을 불러오려면 이 탭을 선택하세요</p>
                                    <p className="text-xs mt-2 text-muted-foreground/70">
                                      클릭 시 자동으로 로드됩니다
                                    </p>
                                  </div>
                                ) : loadingAdminRules ? (
                                  // 로딩 중
                                  <DelegationLoadingSkeleton />
                                ) : adminRuleViewMode === "detail" && adminRuleHtml ? (
                                  // 본문 뷰 (탭 내에서 표시)
                                  <>
                                    <div className="mb-2 pb-2 border-b border-border">
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                          <FileText className="h-4 w-4 text-foreground" />
                                          <h3 className="text-base font-bold text-foreground">{adminRuleTitle || "행정규칙"}</h3>
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setAdminRuleViewMode("list")}
                                          className="h-7 px-2"
                                        >
                                          ← 목록
                                        </Button>
                                      </div>
                                    </div>
                                    <div
                                      className="text-foreground leading-relaxed break-words whitespace-pre-wrap text-sm"
                                      style={{
                                        fontSize: `${fontSize}px`,
                                        lineHeight: "1.8",
                                        overflowWrap: "break-word",
                                        wordBreak: "break-word",
                                      }}
                                      onClick={handleContentClick}
                                      dangerouslySetInnerHTML={{ __html: adminRuleHtml }}
                                    />
                                  </>
                                ) : adminRules.length > 0 ? (
                                  // 목록 뷰
                                  <>
                                    <div className="mb-2 pb-2 border-b border-border">
                                      <div className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-foreground" />
                                        <h3 className="text-base font-bold text-foreground">행정규칙</h3>
                                        <Badge variant="secondary" className="text-xs">
                                          {adminRules.length}개
                                        </Badge>
                                      </div>
                                    </div>
                                    <div className="space-y-3">
                                      {adminRules.map((rule, idx) => (
                                        <button
                                          key={idx}
                                          onClick={() => handleViewAdminRuleFullContent(rule)}
                                          className="w-full text-left py-3 border-b border-border last:border-0 hover:bg-secondary/50 transition-colors rounded px-2"
                                        >
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1">
                                              <p className="font-semibold text-sm text-foreground mb-1">
                                                {rule.name}
                                              </p>
                                              {rule.articleNumber && (
                                                <p className="text-xs text-muted-foreground">
                                                  관련: {rule.articleNumber}
                                                </p>
                                              )}
                                            </div>
                                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                ) : (
                                  // 결과 없음
                                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                    <AlertCircle className="h-12 w-12 mb-4 opacity-30" />
                                    <p className="text-sm">이 조문과 관련된 행정규칙이 없습니다</p>
                                  </div>
                                )}
                              </TabsContent>
                              </Tabs>
                            </div>
                          </Panel>
                        </PanelGroup>
                      </div>
              </div>
            ) : (
              <ScrollArea className="h-full" ref={contentRef}>
                <div className="px-5 pt-0 pb-0" ref={swipeRef}>
                  {isOrdinance ? (
                    <div className="space-y-2">
                      {preambles.map((preamble, index) => (
                        <div
                          key={`preamble-${index}`}
                          className="mb-2"
                          dangerouslySetInnerHTML={{ __html: preamble.content }}
                        />
                      ))}

                      {actualArticles.map((article, index) => (
                        <div
                          key={`${article.jo}-${index}`}
                          id={`article-${article.jo}`}
                          ref={(el) => {
                            articleRefs.current[article.jo] = el
                          }}
                          className="prose prose-sm max-w-none dark:prose-invert scroll-mt-4"
                        >
                          {/* Header removed for ordinances - article number already in content */}
                          <div
                            className="whitespace-pre-wrap text-foreground leading-relaxed break-words"
                            style={{
                              fontSize: `${fontSize}px`,
                              lineHeight: "1.8",
                              overflowWrap: "break-word",
                              wordBreak: "break-word",
                            }}
                            onClick={handleContentClick}
                            dangerouslySetInnerHTML={{ __html: extractArticleText(article, isOrdinance, meta.lawTitle) }}
                          />
                          <Separator className="my-1" />
                        </div>
                      ))}
                    </div>
                  ) : loadingJo ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <p>조문을 불러오는 중...</p>
                  </div>
                ) : activeArticle ? (
                  // 행정규칙은 이제 탭 내에서만 표시 (Priority 1, 2 비활성화)
                  false ? (
                    <div className="flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 250px)' }}>
                      {/* Mobile tabs */}
                      <div className="md:hidden flex gap-1 mb-3 border-b border-border pb-2">
                        <Button
                          variant={adminRuleMobileTab === "law" ? "default" : "ghost"}
                          size="sm"
                          onClick={() => setAdminRuleMobileTab("law")}
                          className="flex-1"
                        >
                          법령 본문
                        </Button>
                        <Button
                          variant={adminRuleMobileTab === "adminRule" ? "default" : "ghost"}
                          size="sm"
                          onClick={() => setAdminRuleMobileTab("adminRule")}
                          className="flex-1"
                        >
                          {adminRuleTitle || "행정규칙"}
                        </Button>
                      </div>

                      {/* Desktop: 2-tier layout, Mobile: tab-based */}
                      <div className="hidden md:grid md:grid-cols-2 gap-4 overflow-hidden flex-1">
                        {/* Left: Main article */}
                        <div className="overflow-y-auto pr-2">
                          <div className="mb-4 pb-3 border-b border-border">
                            <h3 className="text-base font-bold text-foreground mb-2">
                              {formatSimpleJo(activeArticle.jo)}
                              {activeArticle.title && <span className="text-muted-foreground text-sm"> ({activeArticle.title})</span>}
                            </h3>
                            <Badge variant="secondary" className="text-xs">법률 본문</Badge>
                          </div>
                          <div
                            className="text-foreground leading-relaxed break-words whitespace-pre-wrap text-sm prose prose-sm max-w-none dark:prose-invert"
                            style={{
                              fontSize: `${fontSize}px`,
                              lineHeight: "1.8",
                              overflowWrap: "break-word",
                              wordBreak: "break-word",
                            }}
                            onClick={handleContentClick}
                            dangerouslySetInnerHTML={{ __html: extractArticleText(activeArticle, false, meta.lawTitle) }}
                          />
                        </div>

                        {/* Right: Admin rule full content */}
                        <div className="border-l border-border pl-4 flex flex-col overflow-hidden">
                          <div className="mb-4 pb-3 border-b border-border flex-shrink-0">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <FileText className="h-5 w-5 text-foreground" />
                                <h3 className="text-lg font-bold text-foreground">{adminRuleTitle || "행정규칙"}</h3>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setAdminRuleViewMode("list")
                                  }}
                                >
                                  ← 목록
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    const currentRule = adminRules.find(r => r.name === adminRuleTitle)
                                    if (currentRule) {
                                      const idParam = currentRule.serialNumber || currentRule.id
                                      if (idParam) {
                                        await clearAdminRuleContentCache(idParam)
                                        setAdminRuleHtml(null)
                                        await handleViewAdminRuleFullContent(currentRule)
                                      }
                                    }
                                  }}
                                  title="캐시 삭제 후 다시 로드"
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                                {adminRuleHtml && getLawGoKrLink(adminRules.find(r => r.name === adminRuleTitle)?.serialNumber) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    asChild
                                  >
                                    <a
                                      href={getLawGoKrLink(adminRules.find(r => r.name === adminRuleTitle)?.serialNumber)!}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <ExternalLink className="h-3 w-3 mr-1" />
                                      법령 사이트
                                    </a>
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="overflow-y-auto flex-1">
                            <div
                              className="text-foreground leading-relaxed break-words whitespace-pre-wrap text-sm pr-4"
                              style={{
                                fontSize: `${fontSize}px`,
                                lineHeight: "1.8",
                                overflowWrap: "break-word",
                                wordBreak: "break-word",
                              }}
                              onClick={handleContentClick}
                              dangerouslySetInnerHTML={{ __html: adminRuleHtml }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Mobile: show only active tab */}
                      <div className="md:hidden overflow-hidden flex-1">
                        {adminRuleMobileTab === "law" ? (
                          <div className="overflow-y-auto h-full">
                            <div className="mb-4 pb-3 border-b border-border">
                              <h3 className="text-base font-bold text-foreground mb-2">
                                {formatSimpleJo(activeArticle.jo)}
                                {activeArticle.title && <span className="text-muted-foreground text-sm"> ({activeArticle.title})</span>}
                              </h3>
                              <Badge variant="secondary" className="text-xs">법률 본문</Badge>
                            </div>
                            <div
                              className="text-foreground leading-relaxed break-words whitespace-pre-wrap text-sm prose prose-sm max-w-none dark:prose-invert"
                              style={{
                                fontSize: `${fontSize}px`,
                                lineHeight: "1.8",
                                overflowWrap: "break-word",
                                wordBreak: "break-word",
                              }}
                              onClick={handleContentClick}
                              dangerouslySetInnerHTML={{ __html: extractArticleText(activeArticle, false, meta.lawTitle) }}
                            />
                          </div>
                        ) : (
                          <div className="flex flex-col overflow-hidden h-full">
                            <div className="mb-4 pb-3 border-b border-border flex-shrink-0">
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2">
                                  <FileText className="h-5 w-5 text-foreground" />
                                  <h3 className="text-lg font-bold text-foreground">{adminRuleTitle || "행정규칙"}</h3>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setAdminRuleViewMode("list")
                                      setAdminRuleMobileTab("law")
                                    }}
                                  >
                                    ← 목록
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={async () => {
                                      const currentRule = adminRules.find(r => r.name === adminRuleTitle)
                                      if (currentRule) {
                                        const idParam = currentRule.serialNumber || currentRule.id
                                        if (idParam) {
                                          await clearAdminRuleContentCache(idParam)
                                          setAdminRuleHtml(null)
                                          await handleViewAdminRuleFullContent(currentRule)
                                        }
                                      }
                                    }}
                                    title="캐시 삭제 후 다시 로드"
                                  >
                                    <RefreshCw className="h-4 w-4" />
                                  </Button>
                                  {adminRuleHtml && getLawGoKrLink(adminRules.find(r => r.name === adminRuleTitle)?.serialNumber) && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      asChild
                                    >
                                      <a
                                        href={getLawGoKrLink(adminRules.find(r => r.name === adminRuleTitle)?.serialNumber)!}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        <ExternalLink className="h-3 w-3 mr-1" />
                                        법령 사이트
                                      </a>
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="overflow-y-auto flex-1">
                              <div
                                className="text-foreground leading-relaxed break-words whitespace-pre-wrap text-sm"
                                style={{
                                  fontSize: `${fontSize}px`,
                                  lineHeight: "1.8",
                                  overflowWrap: "break-word",
                                  wordBreak: "break-word",
                                }}
                                onClick={handleContentClick}
                                dangerouslySetInnerHTML={{ __html: adminRuleHtml }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    // Priority 2: Admin rules list view (비활성화 - 탭 사용)
                  ) : false ? (
                    <div className="flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 250px)' }}>
                      {/* Mobile tabs */}
                      <div className="md:hidden flex gap-1 mb-3 border-b border-border pb-2">
                        <Button
                          variant={adminRuleMobileTab === "law" ? "default" : "ghost"}
                          size="sm"
                          onClick={() => setAdminRuleMobileTab("law")}
                          className="flex-1"
                        >
                          법령 본문
                        </Button>
                        <Button
                          variant={adminRuleMobileTab === "adminRule" ? "default" : "ghost"}
                          size="sm"
                          onClick={() => setAdminRuleMobileTab("adminRule")}
                          className="flex-1"
                        >
                          행정규칙 목록
                        </Button>
                      </div>

                      {/* Desktop: 2-tier layout */}
                      <div className="hidden md:grid md:grid-cols-2 gap-4 overflow-hidden flex-1">
                        {/* Left: Main article */}
                        <div className="overflow-y-auto pr-2 flex flex-col">
                          <div className="mb-4 pb-3 border-b border-border flex-shrink-0">
                            <h3 className="text-base font-bold text-foreground mb-2">
                              {formatSimpleJo(activeArticle.jo)}
                              {activeArticle.title && <span className="text-muted-foreground text-sm"> ({activeArticle.title})</span>}
                            </h3>
                            <Badge variant="secondary" className="text-xs">법률 본문</Badge>
                          </div>
                          <div
                            className="text-foreground leading-relaxed break-words whitespace-pre-wrap text-sm prose prose-sm max-w-none dark:prose-invert"
                            style={{
                              fontSize: `${fontSize}px`,
                              lineHeight: "1.8",
                              overflowWrap: "break-word",
                              wordBreak: "break-word",
                            }}
                            onClick={handleContentClick}
                            dangerouslySetInnerHTML={{ __html: extractArticleText(activeArticle, false, meta.lawTitle) }}
                          />
                        </div>

                        {/* Right: Admin rules list */}
                        <div className="border-l border-border pl-4 flex flex-col overflow-hidden">
                          <div className="mb-4 pb-3 border-b border-border flex-shrink-0">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText className="h-4 w-4 text-foreground" />
                              <h3 className="text-base font-bold text-foreground">행정규칙</h3>
                            </div>
                            {loadingAdminRules ? (
                              <Badge variant="secondary" className="text-xs">
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                {adminRulesProgress ? `${adminRulesProgress.current}/${adminRulesProgress.total} 조회 중` : '로딩 중...'}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                {adminRules.length}개 매칭
                              </Badge>
                            )}
                          </div>
                          <div className="overflow-y-auto flex-1">
                            {loadingAdminRules ? (
                              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <Loader2 className="h-8 w-8 animate-spin mb-4" />
                                <p className="text-sm">행정규칙 검색 중...</p>
                                {adminRulesProgress && (
                                  <p className="text-xs mt-2">
                                    {adminRulesProgress.current} / {adminRulesProgress.total}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-3 pr-2">
                                {adminRules.map((rule, idx) => (
                                  <div
                                    key={idx}
                                    className="p-3 rounded-lg border border-border bg-card"
                                  >
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                      <p className="font-semibold text-sm text-foreground leading-tight">{rule.name}</p>
                                      <Badge variant={rule.matchType === "title" ? "default" : "secondary"} className="text-xs shrink-0">
                                        {rule.matchType === "title" ? "제목 매칭" : "내용 매칭"}
                                      </Badge>
                                    </div>
                                    {rule.purpose.title && (
                                      <p className="text-xs text-muted-foreground mb-2">
                                        {rule.purpose.number} ({rule.purpose.title})
                                      </p>
                                    )}
                                    <div
                                      className="text-xs text-muted-foreground leading-relaxed break-words mb-3"
                                      style={{
                                        display: "-webkit-box",
                                        WebkitLineClamp: 3,
                                        WebkitBoxOrient: "vertical",
                                        overflow: "hidden",
                                      }}
                                    >
                                      {rule.purpose.content}
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        variant="default"
                                        onClick={() => {
                                          handleViewAdminRuleFullContent(rule)
                                          setAdminRuleMobileTab("adminRule")
                                        }}
                                        className="flex-1 text-xs h-7"
                                      >
                                        <Eye className="h-3 w-3 mr-1" />
                                        본문 조회
                                      </Button>
                                      {getLawGoKrLink(rule.serialNumber) && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          asChild
                                          className="flex-1 text-xs h-7"
                                        >
                                          <a
                                            href={getLawGoKrLink(rule.serialNumber)!}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                          >
                                            <ExternalLink className="h-3 w-3 mr-1" />
                                            법령 사이트
                                          </a>
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Mobile: show only active tab */}
                      <div className="md:hidden overflow-hidden flex-1">
                        {adminRuleMobileTab === "law" ? (
                          <div className="overflow-y-auto h-full">
                            <div className="mb-4 pb-3 border-b border-border flex-shrink-0">
                              <h3 className="text-base font-bold text-foreground mb-2">
                                {formatSimpleJo(activeArticle.jo)}
                                {activeArticle.title && <span className="text-muted-foreground text-sm"> ({activeArticle.title})</span>}
                              </h3>
                              <Badge variant="secondary" className="text-xs">법률 본문</Badge>
                            </div>
                            <div
                              className="text-foreground leading-relaxed break-words whitespace-pre-wrap text-sm prose prose-sm max-w-none dark:prose-invert"
                              style={{
                                fontSize: `${fontSize}px`,
                                lineHeight: "1.8",
                                overflowWrap: "break-word",
                                wordBreak: "break-word",
                              }}
                              onClick={handleContentClick}
                              dangerouslySetInnerHTML={{ __html: extractArticleText(activeArticle, false, meta.lawTitle) }}
                            />
                          </div>
                        ) : (
                          <div className="flex flex-col overflow-hidden h-full">
                            <div className="mb-4 pb-3 border-b border-border flex-shrink-0">
                              <div className="flex items-center gap-2 mb-2">
                                <FileText className="h-4 w-4 text-foreground" />
                                <h3 className="text-base font-bold text-foreground">행정규칙</h3>
                              </div>
                              {loadingAdminRules ? (
                                <Badge variant="secondary" className="text-xs">
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  {adminRulesProgress ? `${adminRulesProgress.current}/${adminRulesProgress.total} 조회 중` : '로딩 중...'}
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">
                                  {adminRules.length}개 매칭
                                </Badge>
                              )}
                            </div>
                            <div className="overflow-y-auto flex-1">
                              {loadingAdminRules ? (
                                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                  <Loader2 className="h-8 w-8 animate-spin mb-4" />
                                  <p className="text-sm">행정규칙 검색 중...</p>
                                  {adminRulesProgress && (
                                    <p className="text-xs mt-2">
                                      {adminRulesProgress.current} / {adminRulesProgress.total}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  {adminRules.map((rule, idx) => (
                                    <div
                                      key={idx}
                                      className="p-3 rounded-lg border border-border bg-card"
                                    >
                                      <div className="flex items-start justify-between gap-2 mb-2">
                                        <p className="font-semibold text-sm text-foreground leading-tight">{rule.name}</p>
                                        <Badge variant={rule.matchType === "title" ? "default" : "secondary"} className="text-xs shrink-0">
                                          {rule.matchType === "title" ? "제목 매칭" : "내용 매칭"}
                                        </Badge>
                                      </div>
                                      {rule.purpose.title && (
                                        <p className="text-xs text-muted-foreground mb-2">
                                          {rule.purpose.number} ({rule.purpose.title})
                                        </p>
                                      )}
                                      <div
                                        className="text-xs text-muted-foreground leading-relaxed break-words mb-3"
                                        style={{
                                          display: "-webkit-box",
                                          WebkitLineClamp: 3,
                                          WebkitBoxOrient: "vertical",
                                          overflow: "hidden",
                                        }}
                                      >
                                        {rule.purpose.content}
                                      </div>
                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          variant="default"
                                          onClick={() => {
                                            handleViewAdminRuleFullContent(rule)
                                            setAdminRuleMobileTab("adminRule")
                                          }}
                                          className="flex-1 text-xs h-7"
                                        >
                                          <Eye className="h-3 w-3 mr-1" />
                                          본문 조회
                                        </Button>
                                        {getLawGoKrLink(rule.serialNumber) && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            asChild
                                            className="flex-1 text-xs h-7"
                                          >
                                            <a
                                              href={getLawGoKrLink(rule.serialNumber)!}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                            >
                                              <ExternalLink className="h-3 w-3 mr-1" />
                                              법령 사이트
                                            </a>
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    // Priority 3: 3-tier delegation view (위임조문 3단 뷰)
                  ) : tierViewMode === "3-tier" && threeTierDataType === "delegation" && validDelegations.length > 0 ? (
                    <>
                      {/* Mobile: Tab-based view */}
                      <div className="md:hidden" style={{ height: 'calc(100vh - 250px)' }}>
                        <Tabs
                          defaultValue="law"
                          className="w-full h-full flex flex-col"
                          onValueChange={(value) => {
                            // 행정규칙 탭 선택 시 로드 시작 (단계적 로딩)
                            if (value === "admin" && !showAdminRules) {
                              setShowAdminRules(true)
                            }
                          }}
                        >
                          <TabsList className="w-full mb-2 grid grid-cols-4">
                            <TabsTrigger value="law" className="text-xs">법률</TabsTrigger>
                            <TabsTrigger value="decree" className="text-xs">
                              시행령 ({validDelegations.filter((d) => d.type === "시행령").length})
                            </TabsTrigger>
                            <TabsTrigger value="rule" className="text-xs">
                              시행규칙 ({validDelegations.filter((d) => d.type === "시행규칙").length})
                            </TabsTrigger>
                            <TabsTrigger value="admin" className="text-xs">
                              {loadingAdminRules ? (
                                <>
                                  행정규칙 <Loader2 className="h-3 w-3 ml-0.5 inline-block animate-spin" />
                                </>
                              ) : showAdminRules ? (
                                `행정규칙 (${adminRules.length})`
                              ) : (
                                "행정규칙"
                              )}
                            </TabsTrigger>
                          </TabsList>

                          <TabsContent value="law" className="flex-1 overflow-y-auto mt-0">
                            <div className="prose prose-sm max-w-none dark:prose-invert">
                              <div className="mb-3 pb-2 border-b border-border">
                                <h3 className="text-sm font-bold text-foreground mb-1 leading-tight">
                                  {formatSimpleJo(activeArticle.jo)}
                                  {activeArticle.title && <span className="text-muted-foreground text-xs block mt-0.5"> {activeArticle.title}</span>}
                                </h3>
                                <Badge variant="secondary" className="text-xs">법률 본문</Badge>
                              </div>
                              <div
                                className="text-foreground leading-relaxed break-words whitespace-pre-wrap text-sm"
                                style={{
                                  fontSize: `${fontSize}px`,
                                  lineHeight: "1.8",
                                  overflowWrap: "break-word",
                                  wordBreak: "break-word",
                                }}
                                onClick={handleContentClick}
                                dangerouslySetInnerHTML={{ __html: extractArticleText(activeArticle, false, meta.lawTitle) }}
                              />
                            </div>
                          </TabsContent>

                          <TabsContent value="decree" className="flex-1 overflow-y-auto mt-0">
                            {isLoadingThreeTier ? (
                              <DelegationLoadingSkeleton />
                            ) : (
                              <>
                                <div className="mb-3 pb-2 border-b border-border">
                                  <div className="flex items-center gap-2 mb-1">
                                    <FileText className="h-4 w-4 text-foreground" />
                                    <h3 className="text-sm font-bold text-foreground">시행령</h3>
                                  </div>
                                  <Badge variant="secondary" className="text-xs">
                                    {validDelegations.filter((d) => d.type === "시행령").length}개
                                  </Badge>
                                </div>
                                <div className="space-y-3">
                              {validDelegations
                                .filter((d) => d.type === "시행령")
                                .map((delegation, idx) => (
                                  <div
                                    key={idx}
                                    className="p-3 rounded-lg border border-border"
                                  >
                                    {delegation.title && (
                                      <p className="font-semibold text-sm text-foreground mb-2">
                                        {delegation.title}
                                      </p>
                                    )}
                                    {delegation.content && (
                                      <div
                                        className="text-xs text-foreground leading-relaxed break-words"
                                        style={{
                                          fontSize: `${fontSize}px`,
                                          lineHeight: "1.8",
                                          overflowWrap: "break-word",
                                          wordBreak: "break-word",
                                        }}
                                        onClick={handleContentClick}
                                        dangerouslySetInnerHTML={{ __html: formatDelegationContent(delegation.content) }}
                                      />
                                    )}
                                  </div>
                                ))}
                              {validDelegations.filter((d) => d.type === "시행령").length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-4">시행령 없음</p>
                              )}
                                </div>
                              </>
                            )}
                          </TabsContent>

                          <TabsContent value="rule" className="flex-1 overflow-y-auto mt-0">
                            {isLoadingThreeTier ? (
                              <DelegationLoadingSkeleton />
                            ) : (
                              <>
                                <div className="mb-3 pb-2 border-b border-border">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h3 className="text-sm font-bold text-foreground">시행규칙</h3>
                                  </div>
                                  <Badge variant="secondary" className="text-xs">
                                    {validDelegations.filter((d) => d.type === "시행규칙" || d.type === "행정규칙").length}개
                                  </Badge>
                                </div>
                                <div className="space-y-3">
                              {validDelegations
                                .filter((d) => d.type === "시행규칙" || d.type === "행정규칙")
                                .map((delegation, idx) => (
                                  <div
                                    key={idx}
                                    className="p-3 rounded-lg border border-border"
                                  >
                                    {delegation.title && (
                                      <p className="font-semibold text-sm text-foreground mb-2">
                                        {delegation.title}
                                      </p>
                                    )}
                                    {delegation.content && (
                                      <div
                                        className="text-xs text-foreground leading-relaxed break-words"
                                        style={{
                                          fontSize: `${fontSize}px`,
                                          lineHeight: "1.8",
                                          overflowWrap: "break-word",
                                          wordBreak: "break-word",
                                        }}
                                        onClick={handleContentClick}
                                        dangerouslySetInnerHTML={{ __html: formatDelegationContent(delegation.content) }}
                                      />
                                    )}
                                  </div>
                                ))}
                              {validDelegations.filter((d) => d.type === "시행규칙").length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-4">시행규칙 없음</p>
                              )}
                                </div>
                              </>
                            )}
                          </TabsContent>

                          {/* Admin Rules Tab (4th tab) - 단계적 로딩 */}
                          <TabsContent value="admin" className="flex-1 overflow-y-auto mt-0">
                            {!showAdminRules ? (
                              // 아직 로드 안 함 (탭 클릭 대기 중)
                              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <FileText className="h-12 w-12 mb-4 opacity-30" />
                                <p className="text-sm">행정규칙을 불러오려면 이 탭을 선택하세요</p>
                                <p className="text-xs mt-2 text-muted-foreground/70">
                                  클릭 시 자동으로 로드됩니다
                                </p>
                              </div>
                            ) : loadingAdminRules ? (
                              // 로딩 중
                              <DelegationLoadingSkeleton />
                            ) : adminRuleViewMode === "detail" && adminRuleHtml ? (
                              // 상세 뷰
                              <>
                                <div className="mb-3 pb-2 border-b border-border">
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <div className="flex items-center gap-2">
                                      <FileText className="h-4 w-4 text-foreground" />
                                      <h3 className="text-sm font-bold text-foreground">{adminRuleTitle || "행정규칙"}</h3>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setAdminRuleViewMode("list")}
                                      className="h-7"
                                    >
                                      ← 목록
                                    </Button>
                                  </div>
                                </div>
                                <div
                                  className="text-foreground leading-relaxed break-words whitespace-pre-wrap text-sm"
                                  style={{
                                    fontSize: `${fontSize}px`,
                                    lineHeight: "1.8",
                                    overflowWrap: "break-word",
                                    wordBreak: "break-word",
                                  }}
                                  onClick={handleContentClick}
                                  dangerouslySetInnerHTML={{ __html: adminRuleHtml }}
                                />
                              </>
                            ) : adminRules.length > 0 ? (
                              // 목록 뷰
                              <>
                                <div className="mb-3 pb-2 border-b border-border">
                                  <div className="flex items-center gap-2 mb-1">
                                    <FileText className="h-4 w-4 text-foreground" />
                                    <h3 className="text-sm font-bold text-foreground">행정규칙</h3>
                                  </div>
                                  <Badge variant="secondary" className="text-xs">
                                    {adminRules.length}개
                                  </Badge>
                                </div>
                                <div className="space-y-3">
                                  {adminRules.map((rule, idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => handleViewAdminRuleFullContent(rule)}
                                      className="w-full text-left p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1">
                                          <p className="font-semibold text-sm text-foreground mb-1">
                                            {rule.name}
                                          </p>
                                          {rule.articleNumber && (
                                            <p className="text-xs text-muted-foreground">
                                              관련 조문: {rule.articleNumber}
                                            </p>
                                          )}
                                        </div>
                                        <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </>
                            ) : (
                              // 결과 없음
                              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <AlertCircle className="h-12 w-12 mb-4 opacity-30" />
                                <p className="text-sm">이 조문과 관련된 행정규칙이 없습니다</p>
                              </div>
                            )}
                          </TabsContent>
                        </Tabs>
                      </div>
                    </>
                    // Priority 3: 2-tier delegation view (위임조문 2단 뷰 + 탭)
                  ) : false && tierViewMode === "2-tier" && tierItems.length > 0 ? (
                    <>
                      {/* Mobile: Tab-based view with 4 tabs (법률, 시행령, 시행규칙, 행정규칙) */}
                      <div className="md:hidden h-full">
                        <Tabs
                          defaultValue="law"
                          className="w-full h-full flex flex-col"
                          onValueChange={(value) => {
                            // 행정규칙 탭 선택 시 로드 시작 (단계적 로딩)
                            if (value === "admin" && !showAdminRules) {
                              setShowAdminRules(true)
                            }
                          }}
                        >
                          <TabsList className="w-full mb-2 grid grid-cols-4">
                            <TabsTrigger value="law" className="text-xs">법률</TabsTrigger>
                            <TabsTrigger value="decree" className="text-xs">
                              시행령 ({validDelegations.filter((d) => d.type === "시행령").length})
                            </TabsTrigger>
                            <TabsTrigger value="rule" className="text-xs">
                              시행규칙 ({validDelegations.filter((d) => d.type === "시행규칙").length})
                            </TabsTrigger>
                            <TabsTrigger value="admin" className="text-xs">
                              {loadingAdminRules ? (
                                <>
                                  행정규칙 <Loader2 className="h-3 w-3 ml-0.5 inline-block animate-spin" />
                                </>
                              ) : showAdminRules ? (
                                `행정규칙 (${adminRules.length})`
                              ) : (
                                "행정규칙"
                              )}
                            </TabsTrigger>
                          </TabsList>

                          <TabsContent value="law" className="flex-1 overflow-y-auto mt-0">
                            <div className="prose prose-sm max-w-none dark:prose-invert">
                              <div className="mb-3 pb-2 border-b border-border">
                                <h3 className="text-sm font-bold text-foreground mb-1 leading-tight">
                                  {formatSimpleJo(activeArticle.jo)}
                                  {activeArticle.title && <span className="text-muted-foreground text-xs block mt-0.5"> {activeArticle.title}</span>}
                                </h3>
                                <Badge variant="secondary" className="text-xs">법률 본문</Badge>
                              </div>
                              <div
                                className="text-foreground leading-relaxed break-words whitespace-pre-wrap text-sm"
                                style={{
                                  fontSize: `${fontSize}px`,
                                  lineHeight: "1.8",
                                  overflowWrap: "break-word",
                                  wordBreak: "break-word",
                                }}
                                onClick={handleContentClick}
                                dangerouslySetInnerHTML={{ __html: extractArticleText(activeArticle, false, meta.lawTitle) }}
                              />
                            </div>
                          </TabsContent>

                          <TabsContent value="decree" className="flex-1 overflow-y-auto mt-0">
                            {isLoadingThreeTier ? (
                              <DelegationLoadingSkeleton />
                            ) : (
                              <>
                                <div className="mb-3 pb-2 border-b border-border">
                                  <div className="flex items-center gap-2 mb-1">
                                    <FileText className="h-4 w-4 text-foreground" />
                                    <h3 className="text-sm font-bold text-foreground">시행령</h3>
                                  </div>
                                  <Badge variant="secondary" className="text-xs">
                                    {validDelegations.filter((d) => d.type === "시행령").length}개
                                  </Badge>
                                </div>
                                <div className="space-y-3">
                                  {validDelegations
                                    .filter((d) => d.type === "시행령")
                                    .map((delegation, idx) => (
                                      <div
                                        key={idx}
                                        className="p-3 rounded-lg border border-border"
                                      >
                                        {delegation.title && (
                                          <p className="font-semibold text-sm text-foreground mb-2">
                                            {delegation.title}
                                          </p>
                                        )}
                                        {delegation.content && (
                                          <div
                                            className="text-xs text-foreground leading-relaxed break-words"
                                            style={{
                                              fontSize: `${fontSize}px`,
                                              lineHeight: "1.8",
                                              overflowWrap: "break-word",
                                              wordBreak: "break-word",
                                            }}
                                            onClick={handleContentClick}
                                            dangerouslySetInnerHTML={{ __html: formatDelegationContent(delegation.content) }}
                                          />
                                        )}
                                      </div>
                                    ))}
                                  {validDelegations.filter((d) => d.type === "시행령").length === 0 && (
                                    <p className="text-xs text-muted-foreground text-center py-4">시행령 없음</p>
                                  )}
                                </div>
                              </>
                            )}
                          </TabsContent>

                          <TabsContent value="rule" className="flex-1 overflow-y-auto mt-0">
                            {isLoadingThreeTier ? (
                              <DelegationLoadingSkeleton />
                            ) : (
                              <>
                                <div className="mb-3 pb-2 border-b border-border">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h3 className="text-sm font-bold text-foreground">시행규칙</h3>
                                  </div>
                                  <Badge variant="secondary" className="text-xs">
                                    {validDelegations.filter((d) => d.type === "시행규칙" || d.type === "행정규칙").length}개
                                  </Badge>
                                </div>
                                <div className="space-y-3">
                                  {validDelegations
                                    .filter((d) => d.type === "시행규칙" || d.type === "행정규칙")
                                    .map((delegation, idx) => (
                                      <div
                                        key={idx}
                                        className="p-3 rounded-lg border border-border"
                                      >
                                        {delegation.title && (
                                          <p className="font-semibold text-sm text-foreground mb-2">
                                            {delegation.title}
                                          </p>
                                        )}
                                        {delegation.content && (
                                          <div
                                            className="text-xs text-foreground leading-relaxed break-words"
                                            style={{
                                              fontSize: `${fontSize}px`,
                                              lineHeight: "1.8",
                                              overflowWrap: "break-word",
                                              wordBreak: "break-word",
                                            }}
                                            onClick={handleContentClick}
                                            dangerouslySetInnerHTML={{ __html: formatDelegationContent(delegation.content) }}
                                          />
                                        )}
                                      </div>
                                    ))}
                                  {validDelegations.filter((d) => d.type === "시행규칙").length === 0 && (
                                    <p className="text-xs text-muted-foreground text-center py-4">시행규칙 없음</p>
                                  )}
                                </div>
                              </>
                            )}
                          </TabsContent>

                          {/* Admin Rules Tab - 단계적 로딩 */}
                          <TabsContent value="admin" className="flex-1 overflow-y-auto mt-0">
                            {!showAdminRules ? (
                              // 아직 로드 안 함 (탭 클릭 대기 중)
                              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <FileText className="h-12 w-12 mb-4 opacity-30" />
                                <p className="text-sm">행정규칙을 불러오려면 이 탭을 선택하세요</p>
                                <p className="text-xs mt-2 text-muted-foreground/70">
                                  클릭 시 자동으로 로드됩니다
                                </p>
                              </div>
                            ) : loadingAdminRules ? (
                              // 로딩 중
                              <DelegationLoadingSkeleton />
                            ) : adminRuleViewMode === "detail" && adminRuleHtml ? (
                              // 상세 뷰
                              <>
                                <div className="mb-3 pb-2 border-b border-border">
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <div className="flex items-center gap-2">
                                      <FileText className="h-4 w-4 text-foreground" />
                                      <h3 className="text-sm font-bold text-foreground">{adminRuleTitle || "행정규칙"}</h3>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setAdminRuleViewMode("list")}
                                      className="h-7"
                                    >
                                      ← 목록
                                    </Button>
                                  </div>
                                </div>
                                <div
                                  className="text-foreground leading-relaxed break-words whitespace-pre-wrap text-sm"
                                  style={{
                                    fontSize: `${fontSize}px`,
                                    lineHeight: "1.8",
                                    overflowWrap: "break-word",
                                    wordBreak: "break-word",
                                  }}
                                  onClick={handleContentClick}
                                  dangerouslySetInnerHTML={{ __html: adminRuleHtml }}
                                />
                              </>
                            ) : adminRules.length > 0 ? (
                              // 목록 뷰
                              <>
                                <div className="mb-3 pb-2 border-b border-border">
                                  <div className="flex items-center gap-2 mb-1">
                                    <FileText className="h-4 w-4 text-foreground" />
                                    <h3 className="text-sm font-bold text-foreground">행정규칙</h3>
                                  </div>
                                  <Badge variant="secondary" className="text-xs">
                                    {adminRules.length}개
                                  </Badge>
                                </div>
                                <div className="space-y-3">
                                  {adminRules.map((rule, idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => handleViewAdminRuleFullContent(rule)}
                                      className="w-full text-left p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1">
                                          <p className="font-semibold text-sm text-foreground mb-1">
                                            {rule.name}
                                          </p>
                                          {rule.articleNumber && (
                                            <p className="text-xs text-muted-foreground">
                                              관련 조문: {rule.articleNumber}
                                            </p>
                                          )}
                                        </div>
                                        <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </>
                            ) : (
                              // 결과 없음
                              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <AlertCircle className="h-12 w-12 mb-4 opacity-30" />
                                <p className="text-sm">이 조문과 관련된 행정규칙이 없습니다</p>
                              </div>
                            )}
                          </TabsContent>
                        </Tabs>
                      </div>

                      {/* Desktop: 2-column resizable view with tabs */}
                      <div className="hidden md:block h-full">
                        <PanelGroup direction="horizontal" className="h-full">
                          {/* Left Panel: Main article */}
                          <Panel
                            defaultSize={delegationPanelSize}
                            minSize={20}
                            maxSize={70}
                            onResize={(size) => {
                              setDelegationPanelSize(size)
                              if (typeof window !== 'undefined') {
                                localStorage.setItem('lawViewerDelegationSplit', size.toString())
                              }
                            }}
                          >
                            <div style={{ height: '100%', overflow: 'auto', paddingRight: '0.5rem', paddingBottom: '1rem' }}>
                              <div className="prose prose-sm max-w-none dark:prose-invert">
                                <div className="mb-4 pb-2 border-b border-border">
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-foreground" />
                                    <h3 className="text-base font-bold text-foreground">
                                      {formatSimpleJo(activeArticle.jo)}
                                      {activeArticle.title && <span className="text-muted-foreground text-sm"> ({activeArticle.title})</span>}
                                    </h3>
                                    <Badge variant="secondary" className="text-xs">법률 본문</Badge>
                                  </div>
                                </div>
                              <div
                                className="text-foreground leading-relaxed break-words whitespace-pre-wrap text-sm"
                                style={{
                                  fontSize: `${fontSize}px`,
                                  lineHeight: "1.8",
                                  overflowWrap: "break-word",
                                  wordBreak: "break-word",
                                }}
                                onClick={handleContentClick}
                                dangerouslySetInnerHTML={{ __html: extractArticleText(activeArticle, false, meta.lawTitle) }}
                              />
                              </div>
                            </div>
                          </Panel>

                          {/* Resize Handle */}
                          <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors cursor-col-resize" />

                          {/* Right Panel: Tabs for 시행령/시행규칙/행정규칙 */}
                          <Panel>
                            <div style={{ height: '100%', overflow: 'auto', paddingLeft: '1rem', paddingBottom: '1rem' }}>
                              <Tabs
                                value={delegationActiveTab}
                                onValueChange={(value) => {
                                  setDelegationActiveTab(value as "decree" | "rule" | "admin")
                                  // 행정규칙 탭 선택 시 로드 시작 (단계적 로딩)
                                  if (value === "admin" && !showAdminRules) {
                                    setShowAdminRules(true)
                                  }
                                }}
                                className="w-full flex flex-col"
                              >
                              <TabsList className="w-full grid grid-cols-3 mb-2">
                                <TabsTrigger value="decree" className="text-xs">
                                  시행령 ({validDelegations.filter((d) => d.type === "시행령").length})
                                </TabsTrigger>
                                <TabsTrigger value="rule" className="text-xs">
                                  시행규칙 ({validDelegations.filter((d) => d.type === "시행규칙").length})
                                </TabsTrigger>
                                <TabsTrigger value="admin" className="text-xs">
                                  {loadingAdminRules ? (
                                    <>
                                      행정규칙 <Loader2 className="h-3 w-3 ml-1 inline-block animate-spin" />
                                    </>
                                  ) : loadedAdminRulesCount > 0 ? (
                                    `행정규칙 (${loadedAdminRulesCount})`
                                  ) : (
                                    "행정규칙"
                                  )}
                                </TabsTrigger>
                              </TabsList>

                              {/* Decree Tab */}
                              <TabsContent value="decree" className="mt-0">
                                {isLoadingThreeTier ? (
                                  <DelegationLoadingSkeleton />
                                ) : (
                                  <>
                                    <div className="mb-2 pb-2 border-b border-border">
                                      <div className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-foreground" />
                                        <h3 className="text-base font-bold text-foreground">시행령</h3>
                                        <Badge variant="secondary" className="text-xs">
                                          {validDelegations.filter((d) => d.type === "시행령").length}개
                                        </Badge>
                                      </div>
                                    </div>
                                    <div className="space-y-3">
                                      {validDelegations
                                        .filter((d) => d.type === "시행령")
                                        .map((delegation, idx) => (
                                          <div key={idx} className="py-3 border-b border-border last:border-0">
                                            {delegation.title && (
                                              <p className="font-semibold text-sm text-foreground mb-2">
                                                {delegation.title}
                                              </p>
                                            )}
                                            {delegation.content && (
                                              <div
                                                className="text-xs text-foreground leading-relaxed break-words"
                                                style={{
                                                  fontSize: `${fontSize}px`,
                                                  lineHeight: "1.8",
                                                  overflowWrap: "break-word",
                                                  wordBreak: "break-word",
                                                }}
                                                onClick={handleContentClick}
                                                dangerouslySetInnerHTML={{ __html: formatDelegationContent(delegation.content) }}
                                              />
                                            )}
                                          </div>
                                        ))}
                                      {validDelegations.filter((d) => d.type === "시행령").length === 0 && (
                                        <p className="text-xs text-muted-foreground text-center py-4">시행령 없음</p>
                                      )}
                                    </div>
                                  </>
                                )}
                              </TabsContent>

                              {/* Rule Tab */}
                              <TabsContent value="rule" className="mt-0">
                                {isLoadingThreeTier ? (
                                  <DelegationLoadingSkeleton />
                                ) : (
                                  <>
                                    <div className="mb-2 pb-2 border-b border-border">
                                      <div className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-foreground" />
                                        <h3 className="text-base font-bold text-foreground">시행규칙</h3>
                                        <Badge variant="secondary" className="text-xs">
                                          {validDelegations.filter((d) => d.type === "시행규칙").length}개
                                        </Badge>
                                      </div>
                                    </div>
                                    <div className="space-y-3">
                                      {validDelegations
                                        .filter((d) => d.type === "시행규칙")
                                        .map((delegation, idx) => (
                                          <div key={idx} className="py-3 border-b border-border last:border-0">
                                            {delegation.title && (
                                              <p className="font-semibold text-sm text-foreground mb-2">
                                                {delegation.title}
                                              </p>
                                            )}
                                            {delegation.content && (
                                              <div
                                                className="text-xs text-foreground leading-relaxed break-words"
                                                style={{
                                                  fontSize: `${fontSize}px`,
                                                  lineHeight: "1.8",
                                                  overflowWrap: "break-word",
                                                  wordBreak: "break-word",
                                                }}
                                                onClick={handleContentClick}
                                                dangerouslySetInnerHTML={{ __html: formatDelegationContent(delegation.content) }}
                                              />
                                            )}
                                          </div>
                                        ))}
                                      {validDelegations.filter((d) => d.type === "시행규칙").length === 0 && (
                                        <p className="text-xs text-muted-foreground text-center py-4">시행규칙 없음</p>
                                      )}
                                    </div>
                                  </>
                                )}
                              </TabsContent>

                              {/* Admin Rules Tab - 항상 표시 (단계적 로딩) */}
                              <TabsContent value="admin" className="mt-0">
                                {!showAdminRules ? (
                                  // 아직 로드 안 함 (탭 클릭 대기 중)
                                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                    <FileText className="h-12 w-12 mb-4 opacity-30" />
                                    <p className="text-sm">행정규칙을 불러오려면 이 탭을 선택하세요</p>
                                    <p className="text-xs mt-2 text-muted-foreground/70">
                                      클릭 시 자동으로 로드됩니다
                                    </p>
                                  </div>
                                ) : loadingAdminRules ? (
                                  // 로딩 중
                                  <DelegationLoadingSkeleton />
                                ) : adminRuleViewMode === "detail" && adminRuleHtml ? (
                                  // 본문 뷰 (탭 내에서 표시)
                                  <>
                                    <div className="mb-2 pb-2 border-b border-border">
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                          <FileText className="h-4 w-4 text-foreground" />
                                          <h3 className="text-base font-bold text-foreground">{adminRuleTitle || "행정규칙"}</h3>
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setAdminRuleViewMode("list")}
                                          className="h-7 px-2"
                                        >
                                          ← 목록
                                        </Button>
                                      </div>
                                    </div>
                                    <div
                                      className="text-foreground leading-relaxed break-words whitespace-pre-wrap text-sm"
                                      style={{
                                        fontSize: `${fontSize}px`,
                                        lineHeight: "1.8",
                                        overflowWrap: "break-word",
                                        wordBreak: "break-word",
                                      }}
                                      onClick={handleContentClick}
                                      dangerouslySetInnerHTML={{ __html: adminRuleHtml }}
                                    />
                                  </>
                                ) : adminRules.length > 0 ? (
                                  // 목록 뷰
                                  <>
                                    <div className="mb-2 pb-2 border-b border-border">
                                      <div className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-foreground" />
                                        <h3 className="text-base font-bold text-foreground">행정규칙</h3>
                                        <Badge variant="secondary" className="text-xs">
                                          {adminRules.length}개
                                        </Badge>
                                      </div>
                                    </div>
                                    <div className="space-y-3">
                                      {adminRules.map((rule, idx) => (
                                        <button
                                          key={idx}
                                          onClick={() => handleViewAdminRuleFullContent(rule)}
                                          className="w-full text-left py-3 border-b border-border last:border-0 hover:bg-secondary/50 transition-colors rounded px-2"
                                        >
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1">
                                              <p className="font-semibold text-sm text-foreground mb-1">
                                                {rule.name}
                                              </p>
                                              {rule.articleNumber && (
                                                <p className="text-xs text-muted-foreground">
                                                  관련: {rule.articleNumber}
                                                </p>
                                              )}
                                            </div>
                                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                ) : (
                                  // 결과 없음
                                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                    <AlertCircle className="h-12 w-12 mb-4 opacity-30" />
                                    <p className="text-sm">이 조문과 관련된 행정규칙이 없습니다</p>
                                  </div>
                                )}
                              </TabsContent>
                              </Tabs>
                            </div>
                          </Panel>
                        </PanelGroup>
                      </div>
                    </>

                    // 중복 블록 제거됨 - Admin rules 뷰는 최상위로 이동됨
                  ) : false ? (
                    // Admin rules detail view: 2-tier (law | admin rule content)
                    <div className="grid grid-cols-2 gap-4" style={{ height: "100%" }}>
                      {/* Left: Main article */}
                      <div className="prose prose-sm max-w-none dark:prose-invert overflow-y-auto pr-2">
                        <div className="mb-4 pb-3 border-b border-border">
                          <h3 className="text-base font-bold text-foreground mb-2">
                            {formatSimpleJo(activeArticle.jo)}
                            {activeArticle.title && <span className="text-muted-foreground text-sm"> ({activeArticle.title})</span>}
                          </h3>
                          <Badge variant="secondary" className="text-xs">법률 본문</Badge>
                        </div>
                        <div
                          className="text-foreground leading-relaxed break-words whitespace-pre-wrap text-sm"
                          style={{
                            fontSize: `${fontSize}px`,
                            lineHeight: "1.8",
                            overflowWrap: "break-word",
                            wordBreak: "break-word",
                          }}
                          onClick={handleContentClick}
                          dangerouslySetInnerHTML={{ __html: extractArticleText(activeArticle, false, meta.lawTitle) }}
                        />
                      </div>

                      {/* Right: Admin rule full content */}
                      <div className="border-l border-border pl-4 flex flex-col overflow-hidden">
                        <div className="mb-4 pb-3 border-b border-border flex-shrink-0">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <FileText className="h-5 w-5 text-foreground" />
                              <h3 className="text-lg font-bold text-foreground">{adminRuleTitle || "행정규칙"}</h3>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  // Go back to list view
                                  setAdminRuleViewMode("list")
                                }}
                              >
                                ← 목록
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  // Force refresh admin rule content
                                  const currentRule = adminRules.find(r => r.name === adminRuleTitle)
                                  if (currentRule) {
                                    const idParam = currentRule.serialNumber || currentRule.id
                                    if (idParam) {
                                      // Clear cache
                                      await clearAdminRuleContentCache(idParam)

                                      // Reset state
                                      setAdminRuleHtml(null)

                                      // Reload
                                      await handleViewAdminRuleFullContent(currentRule)
                                    }
                                  }
                                }}
                                title="캐시 삭제 후 다시 로드"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                              {adminRuleHtml && getLawGoKrLink(adminRules.find(r => r.name === adminRuleTitle)?.serialNumber) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  asChild
                                >
                                  <a
                                    href={getLawGoKrLink(adminRules.find(r => r.name === adminRuleTitle)?.serialNumber)!}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ExternalLink className="h-3 w-3 mr-1" />
                                    법령 사이트
                                  </a>
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="overflow-y-auto flex-1">
                          <div
                            className="text-foreground leading-relaxed break-words whitespace-pre-wrap text-sm pr-4"
                            style={{
                              fontSize: `${fontSize}px`,
                              lineHeight: "1.8",
                              overflowWrap: "break-word",
                              wordBreak: "break-word",
                            }}
                            onClick={handleContentClick}
                            dangerouslySetInnerHTML={{ __html: adminRuleHtml }}
                          />
                        </div>
                      </div>
                    </div>
                    // 중복 블록 제거됨 - Admin rules list 뷰는 최상위로 이동됨
                  ) : false ? (
                    // Admin rules list view: 2-tier (law | admin rules list)
                    <div className="grid grid-cols-2 gap-4 h-full overflow-hidden">
                      {/* Left: Main article */}
                      <div className="overflow-y-auto pr-2 flex flex-col">
                        <div className="mb-4 pb-3 border-b border-border flex-shrink-0">
                          <h3 className="text-base font-bold text-foreground mb-2">
                            {formatSimpleJo(activeArticle.jo)}
                            {activeArticle.title && <span className="text-muted-foreground text-sm"> ({activeArticle.title})</span>}
                          </h3>
                          <Badge variant="secondary" className="text-xs">법률 본문</Badge>
                        </div>
                        <div
                          className="text-foreground leading-relaxed break-words whitespace-pre-wrap text-sm prose prose-sm max-w-none dark:prose-invert"
                          style={{
                            fontSize: `${fontSize}px`,
                            lineHeight: "1.8",
                            overflowWrap: "break-word",
                            wordBreak: "break-word",
                          }}
                          onClick={handleContentClick}
                          dangerouslySetInnerHTML={{ __html: extractArticleText(activeArticle, false, meta.lawTitle) }}
                        />
                      </div>

                      {/* Right: Admin rules list */}
                      <div className="border-l border-border pl-4 flex flex-col overflow-hidden">
                        <div className="mb-4 pb-3 border-b border-border flex-shrink-0">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="h-4 w-4 text-foreground" />
                            <h3 className="text-base font-bold text-foreground">행정규칙</h3>
                          </div>
                          {loadingAdminRules ? (
                            <Badge variant="secondary" className="text-xs">
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              {adminRulesProgress ? `${adminRulesProgress.current}/${adminRulesProgress.total} 조회 중` : '로딩 중...'}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              {adminRules.length}개 매칭
                            </Badge>
                          )}
                        </div>
                        <div className="overflow-y-auto flex-1">
                          {loadingAdminRules ? (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                              <Loader2 className="h-8 w-8 animate-spin mb-4" />
                              <p className="text-sm">행정규칙 검색 중...</p>
                              {adminRulesProgress && (
                                <p className="text-xs mt-2">
                                  {adminRulesProgress.current} / {adminRulesProgress.total}
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-3 pr-2">
                              {adminRules.map((rule, idx) => (
                                <div
                                  key={idx}
                                  className="p-3 rounded-lg border border-border bg-card"
                                >
                                  <div className="flex items-start justify-between gap-2 mb-2">
                                    <p className="font-semibold text-sm text-foreground leading-tight">{rule.name}</p>
                                    <Badge variant={rule.matchType === "title" ? "default" : "secondary"} className="text-xs shrink-0">
                                      {rule.matchType === "title" ? "제목 매칭" : "내용 매칭"}
                                    </Badge>
                                  </div>
                                  {rule.purpose.title && (
                                    <p className="text-xs text-muted-foreground mb-2">
                                      {rule.purpose.number} ({rule.purpose.title})
                                    </p>
                                  )}
                                  <div
                                    className="text-xs text-muted-foreground leading-relaxed break-words mb-3"
                                    style={{
                                      fontSize: `${Math.max(fontSize - 2, 11)}px`,
                                      lineHeight: "1.6",
                                      overflowWrap: "break-word",
                                      wordBreak: "break-word",
                                    }}
                                  >
                                    {rule.purpose.content}
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleViewAdminRuleFullContent(rule)}
                                      className="flex-1 text-xs h-7"
                                    >
                                      <Eye className="h-3 w-3 mr-1" />
                                      전체 보기
                                    </Button>
                                    {getLawGoKrLink(rule.serialNumber) && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        asChild
                                        className="flex-1 text-xs h-7"
                                      >
                                        <a
                                          href={getLawGoKrLink(rule.serialNumber)!}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          <ExternalLink className="h-3 w-3 mr-1" />
                                          법령 사이트
                                        </a>
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    // 중복 블록 제거됨 - 위임조문 2단 뷰는 위로 이동됨
                  ) : false ? (
                    // 2-tier view: Split horizontally - left: main article, right: delegations/citations/admin rules
                    <div
                      className="grid gap-4 h-full"
                      style={{
                        gridTemplateColumns: adminRuleViewMode === "detail" && adminRuleHtml
                          ? "35% 65%"  // Admin rule detail: 법률 35%, 행정규칙 65%
                          : "50% 50%"  // Delegation/Citation: 50% 50%
                      }}
                    >
                      {/* Left: Main article */}
                      <div className="prose prose-sm max-w-none dark:prose-invert overflow-y-auto pr-2">
                        <div className="mb-6 pb-4 border-b border-border">
                          <h3 className="text-lg font-bold text-foreground mb-2">
                            {formatSimpleJo(activeArticle.jo)}
                            {activeArticle.title && <span className="text-muted-foreground"> ({activeArticle.title})</span>}
                          </h3>
                          <Badge variant="secondary" className="text-xs">법률 본문</Badge>
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
                      </div>

                      {/* Right: Delegations, Citations, or Admin Rules */}
                      <div className="border-l border-border pl-4 overflow-y-auto">
                        {adminRuleViewMode === "detail" && adminRuleHtml ? (
                          <>
                            <div className="mb-6 pb-4 border-b border-border">
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2">
                                  <FileText className="h-5 w-5 text-foreground" />
                                  <h3 className="text-lg font-bold text-foreground">{adminRuleTitle || "행정규칙"}</h3>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    // Go back to list view
                                    setAdminRuleViewMode("list")
                                  }}
                                >
                                  ← 목록
                                </Button>
                              </div>
                            </div>
                            <div
                              className="text-foreground"
                              dangerouslySetInnerHTML={{ __html: adminRuleHtml }}
                            />
                          </>
                        ) : (
                          <>
                            <div className="mb-6 pb-4 border-b border-border">
                              <div className="flex items-center gap-2 mb-2">
                                {threeTierDataType === "delegation" ? (
                                  <FileText className="h-5 w-5 text-foreground" />
                                ) : (
                                  <Link2 className="h-5 w-5 text-foreground" />
                                )}
                                <h3 className="text-lg font-bold text-foreground">
                                  {threeTierDataType === "delegation" ? "위임 조문" : "인용 조문"}
                                </h3>
                              </div>
                              <Badge variant="secondary" className="text-xs">
                                {tierItems.length}개 {threeTierDataType === "delegation" ? "위임" : "인용"}
                              </Badge>
                            </div>

                            <div className="space-y-0">
                              {tierItems.map((item, idx) => (
                                <div
                                  key={idx}
                                  className="p-4 rounded-lg border border-border"
                                >
                                  {threeTierDataType === "delegation" ? (
                                    <>
                                      <div className="flex items-start gap-2 mb-2">
                                        <Badge
                                          variant="secondary"
                                          className="text-xs"
                                        >
                                          {item.type}
                                        </Badge>
                                        {item.joNum && (
                                          <span className="font-semibold text-sm text-foreground">{item.joNum}</span>
                                        )}
                                      </div>
                                      {item.lawName && (
                                        <p className="text-xs text-muted-foreground mb-2 font-medium">{item.lawName}</p>
                                      )}
                                      {item.title && (
                                        <p className="text-sm font-semibold text-foreground mb-2">{item.title}</p>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      {item.joNum && (
                                        <p className="font-semibold text-sm text-foreground mb-2">{item.joNum}</p>
                                      )}
                                      {item.title && (
                                        <p className="text-sm font-semibold text-foreground mb-2">{item.title}</p>
                                      )}
                                    </>
                                  )}
                                  {item.content && (
                                    <div
                                      className="text-sm text-foreground leading-relaxed break-words"
                                      style={{
                                        fontSize: `${fontSize}px`,
                                        lineHeight: "1.8",
                                        overflowWrap: "break-word",
                                        wordBreak: "break-word",
                                      }}
                                      onClick={handleContentClick}
                                      dangerouslySetInnerHTML={{ __html: formatDelegationContent(item.content) }}
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    // 1-tier view: Normal single article view
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <div className="mb-3 pb-2 md:mb-6 md:pb-4 border-b border-border">
                        {/* Mobile: 제목과 버튼을 별도 줄로 분리 */}
                        <div className="block md:flex md:items-center md:justify-between md:gap-4">
                          <h3 className="text-sm md:text-lg font-bold text-foreground mb-1 md:mb-0 leading-tight">
                            {formatSimpleJo(activeArticle.jo)}
                            {activeArticle.title && <span className="text-muted-foreground text-xs md:text-base block md:inline mt-0.5 md:mt-0"> {activeArticle.title}</span>}
                          </h3>
                          {/* 글자 크기 조절 및 복사 */}
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={decreaseFontSize} title="글자 작게" className="h-7 md:h-9">
                              <ZoomOut className="h-3.5 w-3.5 md:h-4 md:w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={resetFontSize} title="기본 크기" className="h-7 md:h-9">
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={increaseFontSize} title="글자 크게" className="h-7 md:h-9">
                              <ZoomIn className="h-3.5 w-3.5 md:h-4 md:w-4" />
                            </Button>
                            <span className="text-xs text-muted-foreground mx-1">{fontSize}px</span>
                            <Button variant="ghost" size="sm" onClick={handleCopy} title="내용 복사" className="h-7 md:h-9">
                              {copied ? <Check className="h-3.5 w-3.5 md:h-4 md:w-4 text-green-500" /> : <Copy className="h-3.5 w-3.5 md:h-4 md:w-4" />}
                            </Button>
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
                        dangerouslySetInnerHTML={{ __html: extractArticleText(activeArticle, false, meta.lawTitle) }}
                      />

                      {activeArticle.hasChanges && (
                        <div className="mt-6 p-4 rounded-lg bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/20">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-5 w-5 text-[var(--color-warning)] shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold text-foreground">변경된 조문</p>
                              <p className="text-sm text-muted-foreground mt-1">
                                이 조문은 최근 개정되었습니다. 신·구법 비교를 통해 변경 내용을 확인하세요.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                ) : aiAnswerMode && aiAnswerContent ? (
                  // AI 모드: AI 답변 표시 - Editorial Clean Design
                  <div className="animate-fade-in-up">
                      {/* 검색 실패 경고 메시지 - 간소화 */}
                      {fileSearchFailed && (
                        <div className="mb-4 p-3 bg-destructive/5 border border-destructive/20 rounded-md">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-destructive">검색 결과 없음</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                관련 법령을 찾지 못했습니다. 검색어를 확인해주세요.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="mb-1 pb-5 border-b border-border">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4 pt-2">
                          <div className="flex flex-col gap-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Sparkles className="h-5 w-5 text-primary flex-shrink-0" />
                              <h3 className="text-lg sm:text-xl font-bold text-foreground mb-0">AI 답변</h3>
                              <Badge variant="outline" className="text-xs whitespace-nowrap">
                                File Search RAG
                              </Badge>
                            </div>
                            {userQuery && (
                              <div className="flex items-start gap-1.5 text-sm sm:text-md text-muted-foreground font-medium pl-1">
                                <MessageCircleQuestion className="h-4 w-4 text-muted-foreground/60 flex-shrink-0 mt-0.5" />
                                <span className="break-words">{userQuery}</span>
                              </div>
                            )}
                          </div>

                          {/* AI 답변 컨트롤 */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button variant="ghost" size="sm" onClick={() => setFontSize((prev) => Math.max(12, prev - 2))} title="글자 작게">
                              <ZoomOut className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setFontSize(15)} title="기본 크기">
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setFontSize((prev) => Math.min(20, prev + 2))} title="글자 크게">
                              <ZoomIn className="h-4 w-4" />
                            </Button>
                            <span className="text-xs text-muted-foreground mx-1">{fontSize}px</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(aiAnswerContent)
                                toast({ title: "복사 완료", description: "AI 답변이 클립보드에 복사되었습니다." })
                              }}
                              title="복사"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            {aiCitations && aiCitations.length > 0 && (() => {
                              // 중복 제거된 개수 계산
                              const uniqueCitations = new Map()
                              aiCitations.forEach(c => {
                                const key = `${c.lawName}|${c.articleNum}`
                                if (!uniqueCitations.has(key)) {
                                  uniqueCitations.set(key, c)
                                }
                              })
                              const verifiedCount = Array.from(uniqueCitations.values()).filter(c => c.verified).length
                              const totalUnique = uniqueCitations.size

                              return (
                                <div
                                  className={`
                                    relative flex items-center gap-1.5 ml-2 px-2 py-1 rounded-md cursor-help
                                    transition-colors duration-200
                                    ${aiConfidenceLevel === 'high'
                                      ? 'bg-blue-500/10 dark:bg-blue-400/10 border border-blue-500/30 dark:border-blue-400/30 hover:border-blue-500/50 dark:hover:border-blue-400/50'
                                      : aiConfidenceLevel === 'medium'
                                      ? 'bg-yellow-500/10 dark:bg-yellow-400/10 border border-yellow-500/30 dark:border-yellow-400/30 hover:border-yellow-500/50 dark:hover:border-yellow-400/50'
                                      : 'bg-red-500/10 dark:bg-red-400/10 border border-red-500/30 dark:border-red-400/30 hover:border-red-500/50 dark:hover:border-red-400/50'
                                    }
                                  `}
                                  title={`AI 참조 조문: ${totalUnique}개\n실제 조문 존재: ${verifiedCount}개`}
                                >
                                  <ShieldCheck className={`h-4 w-4 ${
                                    aiConfidenceLevel === 'high'
                                      ? 'text-blue-400 dark:text-blue-300'
                                      : aiConfidenceLevel === 'medium'
                                      ? 'text-yellow-500 dark:text-yellow-400'
                                      : 'text-red-500 dark:text-red-400'
                                  }`} />
                                  <div className={`flex items-baseline gap-0.5 font-bold ${
                                    aiConfidenceLevel === 'high'
                                      ? 'text-blue-400 dark:text-blue-300'
                                      : aiConfidenceLevel === 'medium'
                                      ? 'text-yellow-500 dark:text-yellow-400'
                                      : 'text-red-500 dark:text-red-400'
                                  }`}>
                                    <span className="text-base tabular-nums leading-none">{verifiedCount}</span>
                                    <span className="opacity-40 text-xs leading-none">/</span>
                                    <span className="text-base tabular-nums leading-none">{totalUnique}</span>
                                  </div>
                                </div>
                              )
                            })()}
                          </div>
                        </div>
                      </div>

                      <div
                        className="prose prose-sm max-w-none dark:prose-invert break-words overflow-x-hidden px-2 sm:px-0
                        [&_h2]:text-[clamp(18px,5vw,24px)] [&_h2]:font-bold [&_h2]:mt-[clamp(12px,3vw,20px)] [&_h2]:mb-2 [&_h2]:flex [&_h2]:items-center [&_h2]:gap-1.5 [&_h2]:flex-nowrap
                        [&_h3]:text-[clamp(14px,4vw,16px)] [&_h3]:font-semibold [&_h3]:mt-[clamp(8px,2vw,12px)] [&_h3]:mb-2 [&_h3]:flex [&_h3]:items-center [&_h3]:gap-1.5 [&_h3]:flex-nowrap
                        [&_blockquote]:border-l-2 [&_blockquote]:border-blue-500/40 [&_blockquote]:bg-blue-950/30 [&_blockquote]:pl-2 sm:[&_blockquote]:pl-4 [&_blockquote]:py-2 [&_blockquote]:my-2 [&_blockquote]:ml-2 sm:[&_blockquote]:ml-4 [&_blockquote]:break-words [&_blockquote]:overflow-wrap-anywhere [&_blockquote]:not-italic
                        [&_blockquote_p]:my-1 [&_blockquote_p]:leading-relaxed
                        [&_ul]:my-2 sm:[&_ul]:my-3 [&_li]:my-1
                        [&_ol]:my-2 sm:[&_ol]:my-3 [&_ol_li]:my-1
                        [&_p]:leading-relaxed [&_p]:my-2 [&_p]:break-words"
                        style={{ fontSize: `${fontSize}px`, overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                        onClick={handleContentClick}
                        dangerouslySetInnerHTML={{ __html: aiAnswerHTML }}
                      />

                      {/* AI 답변 주의사항 */}
                      <div className="mt-6 flex items-start gap-2 text-xs text-amber-200/80 bg-amber-950/20 border border-amber-800/30 p-3 rounded-md">
                        <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                        <p>이 답변은 AI가 생성한 것으로, 법적 자문을 대체할 수 없습니다. 정확한 정보는 원문을 확인하거나 전문가와 상담하시기 바랍니다.</p>
                      </div>
                    </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p>조문을 선택하세요</p>
                  </div>
                )}
                {!isOrdinance && revisionHistory.length > 0 && activeArticle && (
                  <div className="mt-12">
                    <RevisionHistory
                      history={revisionHistory}
                      articleTitle={`${formatSimpleJo(activeArticle.jo)}${activeArticle.title ? ` (${activeArticle.title})` : ""}`}
                    />
                  </div>
                )}
                </div>
              </ScrollArea>
            )}
          </div>
        </Card>
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
      </div>

      {/* Swipe Tutorial (첫 방문 시 표시) */}
      <SwipeTutorial onComplete={() => {}} />

      {/* Swipe Hint (스와이프 시 힌트 표시) */}
      {swipeHint && (
        <SwipeHint
          direction={swipeHint.direction}
          onDismiss={() => setSwipeHint(null)}
        />
      )}
    </>
  )
}
