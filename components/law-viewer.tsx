"use client"

import type React from "react"
import { useState, useEffect, useRef, useMemo, useCallback } from "react"
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
  ChevronDown,
  ChevronUp,
  Bookmark,
  BookmarkCheck,
  FileText,
  Link2,
  Eye,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Copy,
  CheckCircle2,
  AlertTriangle,
  FileSearch,
  Check,
  Calendar,
  ListOrdered,
  Building2,
  GitMerge,
  MessageCircleQuestion,
} from "lucide-react"
import type { LawArticle, LawMeta, ThreeTierData } from "@/lib/law-types"
import { extractArticleText, formatDelegationContent } from "@/lib/law-xml-parser"
import { buildJO, formatJO, type ParsedRelatedLaw, parseRelatedLawTitle } from "@/lib/law-parser"
import { ReferenceModal } from "@/components/reference-modal"
import { RevisionHistory } from "@/components/revision-history"
import { ArticleBottomSheet } from "@/components/article-bottom-sheet"
import { FloatingActionButton } from "@/components/ui/floating-action-button"
import { VirtualizedArticleList } from "@/components/virtualized-article-list"
import { VirtualizedFullArticleView } from "@/components/virtualized-full-article-view"
import { DelegationLoadingSkeleton } from "@/components/delegation-loading-skeleton"
import { SwipeTutorial, SwipeHint } from "@/components/swipe-tutorial"
import { parseArticleHistoryXML } from "@/lib/revision-parser"
import { useAdminRules, type AdminRuleMatch } from "@/lib/use-admin-rules"
import { parseAdminRuleContent, formatAdminRuleHTML } from "@/lib/admrul-parser"
import { getAdminRuleContentCache, setAdminRuleContentCache, clearAdminRuleContentCache } from "@/lib/admin-rule-cache"
import { useToast } from "@/hooks/use-toast"
import { useSwipe } from "@/hooks/use-swipe"
import { convertAIAnswerToHTML } from '@/lib/ai-answer-processor'
import { debugLogger } from '@/lib/debug-logger'
import type { VerifiedCitation } from '@/lib/citation-verifier'
import { LawViewerUI } from "@/components/law-viewer-ui"

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

  // AI 모드 - 관련 법령 2단 비교
  comparisonLawMeta?: LawMeta | null
  comparisonLawArticles?: LawArticle[]
  comparisonLawSelectedJo?: string
  isLoadingComparison?: boolean
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
  comparisonLawMeta = null,
  comparisonLawArticles = [],
  comparisonLawSelectedJo,
  isLoadingComparison = false,
  aiCitations = [],
  userQuery = '',
  aiConfidenceLevel = 'high',
}: LawViewerProps) {
  const isFullView = isOrdinance || viewMode === "full"
  const { toast } = useToast()

  console.log("LawViewer 렌더링:", {
    lawTitle: meta.lawTitle,
    articleCount: articles.length,
    selectedJo,
    isOrdinance,
    viewMode,
    isFullView,
    firstArticle: articles[0] ? { jo: articles[0].jo, title: articles[0].title } : null,
  })

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
  const [refModal, setRefModal] = useState<{ open: boolean; title?: string; html?: string; forceWhiteTheme?: boolean; lawName?: string; articleNumber?: string }>({ open: false })
  const [refModalHistory, setRefModalHistory] = useState<Array<{ title: string; html?: string; forceWhiteTheme?: boolean; lawName?: string; articleNumber?: string }>>([])
  const [lastExternalRef, setLastExternalRef] = useState<{ lawName: string; joLabel?: string } | null>(null)
  const [revisionHistory, setRevisionHistory] = useState<any[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // 3-tier comparison data
  const [threeTierCitation, setThreeTierCitation] = useState<ThreeTierData | null>(null)
  const [threeTierDelegation, setThreeTierDelegation] = useState<ThreeTierData | null>(null)
  const [isLoadingThreeTier, setIsLoadingThreeTier] = useState(false)

  // View mode: 1-tier (default) -> 2-tier (article + delegations with tabs)
  const [tierViewMode, setTierViewMode] = useState<"1-tier" | "2-tier">("1-tier")

  // Admin rules state
  const [showAdminRules, setShowAdminRules] = useState(false)
  const [adminRuleViewMode, setAdminRuleViewMode] = useState<"list" | "detail">("list")
  const [adminRuleHtml, setAdminRuleHtml] = useState<string>("")
  const [adminRuleTitle, setAdminRuleTitle] = useState<string>("")
  // Admin rule cache - key: id or serialNumber, value: { title, html }
  const [adminRuleCache, setAdminRuleCache] = useState<Map<string, { title: string; html: string }>>(new Map())
  // Mobile tab state for admin rules (모바일에서 법령 본문 vs 행정규칙)
  const [adminRuleMobileTab, setAdminRuleMobileTab] = useState<"law" | "adminRule">("law")
  // Loaded admin rules count (행정규칙 한번 로드 후 개수 저장)
  const [loadedAdminRulesCount, setLoadedAdminRulesCount] = useState<number>(0)
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
  const [adminRulePanelSize, setAdminRulePanelSize] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('lawViewerAdminRuleSplit')
      return saved ? parseInt(saved) : 35
    }
    return 35
  })

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

  // Fetch admin rules for current article
  const { adminRules, loading: loadingAdminRules, error: adminRulesError, progress: adminRulesProgress } = useAdminRules(
    meta.lawTitle,
    activeArticleNumber,
    showAdminRules // Only fetch when enabled
  )

  // Store admin rules count when loaded (행정규칙 로드 후 개수 저장)
  useEffect(() => {
    if (!loadingAdminRules && adminRules.length > 0) {
      setLoadedAdminRulesCount(adminRules.length)
    }
  }, [adminRules, loadingAdminRules])

  // Update loadedArticles when props.articles changes
  useEffect(() => {
    setLoadedArticles(actualArticles)
  }, [articles])

  // Log when loadedArticles changes
  useEffect(() => {
  }, [loadedArticles, activeJo])

  const activeArticle = loadedArticles.find((a) => a.jo === activeJo)

  // Get delegation and citation data for current article
  const currentArticleDelegations = threeTierDelegation?.articles.find((a) => a.jo === activeJo)?.delegations || []
  const currentArticleCitations = threeTierCitation?.articles.find((a) => a.jo === activeJo)?.citations || []

  // Filter to only include items with actual content
  // content가 비어있으면 실제로 내용이 없는 것이므로 필터링
  const validDelegations = currentArticleDelegations.filter((d) => d.content && d.content.trim().length > 0)
  const validCitations = currentArticleCitations.filter((c) => c.content && c.content.trim().length > 0)

  // Total delegation count (시행령 + 시행규칙 + 행정규칙)
  // 행정규칙은 lazy loading이므로 loadedAdminRulesCount 사용
  const totalDelegationCount = validDelegations.length + (showAdminRules ? adminRules.length : loadedAdminRulesCount)

  // 디버깅: 현재 조문의 delegation 데이터 확인
  useEffect(() => {
    if (activeJo && currentArticleDelegations.length > 0) {
      console.log(`[3단비교 디버깅] 조문 ${formatJO(activeJo)} delegation 데이터:`, {
        전체개수: currentArticleDelegations.length,
        유효개수: validDelegations.length,
        시행령개수: currentArticleDelegations.filter(d => d.type === "시행령").length,
        시행규칙개수: currentArticleDelegations.filter(d => d.type === "시행규칙").length,
        시행령유효: validDelegations.filter(d => d.type === "시행령").length,
        시행규칙유효: validDelegations.filter(d => d.type === "시행규칙").length,
        상세: currentArticleDelegations.map(d => ({
          type: d.type,
          lawName: d.lawName,
          joNum: d.joNum,
          hasContent: !!d.content,
          contentLength: d.content?.length || 0,
          contentPreview: d.content ? d.content.substring(0, 50) + "..." : "(empty)"
        }))
      })
    }
  }, [activeJo, currentArticleDelegations])

  // Check if there are valid 시행규칙 items (for 3-tier view)
  const hasValidSihyungkyuchik = validDelegations.some((d) => d.type === "시행규칙")

  // Check if there's any valid 3-tier data
  const hasValidThreeTierData = validDelegations.length > 0 || validCitations.length > 0

  // Determine which type of 3-tier data to show (prioritize delegation over citation)
  const threeTierDataType: "delegation" | "citation" | null =
    validDelegations.length > 0 ? "delegation" : validCitations.length > 0 ? "citation" : null

  // Get the items to display based on tier view mode
  const tierItems = threeTierDataType === "delegation" ? validDelegations : validCitations

  useEffect(() => {
  }, [activeArticle])

  useEffect(() => {
    console.log("[개정이력] Active article revision history:", {
      jo: activeArticle?.jo,
      title: activeArticle?.title,
      hasRevisionHistory: !!activeArticle?.revisionHistory,
      revisionCount: activeArticle?.revisionHistory?.length || 0,
      revisions: activeArticle?.revisionHistory,
    })
  }, [activeArticle])

  useEffect(() => {

    // Only update activeJo if selectedJo is different from current activeJo
    // This prevents overriding user clicks from the sidebar
    if (selectedJo && selectedJo !== activeJo) {
      console.log("selectedJo 변경 감지 - activeJo 업데이트:", selectedJo)
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

  const fetchRevisionHistory = async (jo: string) => {
    if (!meta.lawId || !jo) return

    setIsLoadingHistory(true)
    try {
      const params = new URLSearchParams({
        lawId: meta.lawId,
        jo: jo,
      })

      console.log("Fetching revision history for article:", { lawId: meta.lawId, jo })
      const response = await fetch(`/api/article-history?${params.toString()}`)

      if (!response.ok) {
        const contentType = response.headers.get("content-type")
        if (contentType?.includes("application/json")) {
          const errorData = await response.json()
          console.warn("[v0] Article history API returned error:", errorData)
          // Silently fail - this is expected for some laws
        } else {
          console.error("[v0] Failed to fetch revision history:", response.status)
        }
        setRevisionHistory([])
        return
      }

      const xmlText = await response.text()
      console.log("Received revision history XML, length:", xmlText.length)

      const history = parseArticleHistoryXML(xmlText)

      setRevisionHistory(history)
    } catch (error) {
      console.warn("[v0] Revision history not available for this article:", error)
      setRevisionHistory([])
    } finally {
      setIsLoadingHistory(false)
    }
  }

  useEffect(() => {
    console.log("[개정이력 useEffect] 실행", {
      hasLawId: !!meta.lawId,
      lawId: meta.lawId,
      isOrdinance,
      hasActiveJo: !!activeJo,
      activeJo,
    })

    if (!meta.lawId) {
      console.log("[개정이력 useEffect] lawId 없음 - 종료")
      return
    }
    if (isOrdinance) {
      console.log("[개정이력 useEffect] 조례 - 종료")
      return
    }
    if (!activeJo) {
      console.log("[개정이력 useEffect] activeJo 없음 - 종료")
      return
    }

    console.log("[개정이력 useEffect] 개정이력 조회 시작:", activeJo)
    fetchRevisionHistory(activeJo)
  }, [meta.lawId, activeJo, isOrdinance])

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

  // Auto-reset tier view mode if the current article doesn't support it
  useEffect(() => {
    if (tierViewMode === "3-tier" && !hasValidSihyungkyuchik) {
      setTierViewMode(hasValidThreeTierData ? "2-tier" : "1-tier")
    } else if (tierViewMode === "2-tier" && !hasValidThreeTierData) {
      setTierViewMode("1-tier")
    }
  }, [tierViewMode, hasValidSihyungkyuchik, hasValidThreeTierData, activeJo])

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
      console.log("조문이 로드되지 않음 - 동적으로 로드:", jo)
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
        console.error("[v0] 조문 로드 실패:", error)
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
      console.log("단일 조문 뷰 - activeJo 설정 완료")
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
    console.log('[원문 보기] isOrdinance:', isOrdinance, 'lawTitle:', lawTitle)

    if (isOrdinance) {
      // 조례는 다른 URL 형식 사용
      const url = `https://www.law.go.kr/자치법규/${encodeURIComponent(lawTitle)}`
      console.log('[원문 보기] 조례 URL:', url)
      window.open(url, "_blank", "noopener,noreferrer")
    } else if (isFullView || !activeArticle) {
      const url = `https://www.law.go.kr/법령/${encodeURIComponent(lawTitle)}`
      console.log('[원문 보기] 법령 URL (전체):', url)
      window.open(url, "_blank", "noopener,noreferrer")
    } else {
      const articleNum = formatJO(activeArticle.jo)
      const url = `https://www.law.go.kr/법령/${encodeURIComponent(lawTitle)}/${articleNum}`
      console.log('[원문 보기] 법령 URL (조문):', url)
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

      console.log('[handleContentClick] Link clicked:', {
        tagName: target.tagName,
        refType: target.getAttribute("data-ref"),
        article: target.getAttribute("data-article"),
        law: target.getAttribute("data-law")
      })

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
            console.log('[AI 법령 추론] 조문:', articleLabel, '→ 법령:', inferred.lawName, '(신뢰도:', inferred.confidence, ', 근거:', inferred.reason, ')')
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
            console.log('[AI 법령 추론] 실패 → lastExternalRef 사용:', lastExternalRef.lawName)
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

            console.log('[Related] Opening modal for:', { kind, baseLaw: baseLawName, relatedLaw: relatedLawName })
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

  // Admin rule handlers
  const handleViewAdminRuleFullContent = async (rule: AdminRuleMatch) => {
    try {
      // Use serialNumber first, fallback to id (same as test page)
      const idParam = rule.serialNumber || rule.id

      // Check IndexedDB cache first
      const cached = await getAdminRuleContentCache(idParam)
      if (cached) {
        console.log("[law-viewer] Using IndexedDB cached admin rule content:", idParam)
        setAdminRuleTitle(cached.title)
        setAdminRuleHtml(cached.html)
        setAdminRuleViewMode("detail")
        // Don't change tierViewMode - stay in tab view
        return
      }

      const contentParams = new URLSearchParams({ ID: idParam })

      // Set loading state
      setAdminRuleTitle(rule.name)
      setAdminRuleHtml('<div style="text-align: center; padding: 2rem 0; color: hsl(var(--muted-foreground));"><div style="display: inline-block; width: 2rem; height: 2rem; border: 2px solid currentColor; border-bottom-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div><p style="margin-top: 1rem;">로딩 중...</p><style>@keyframes spin { to { transform: rotate(360deg); }}</style></div>')
      setAdminRuleViewMode("detail")
      // Don't change tierViewMode - stay in tab view

      console.log("[law-viewer] Fetching admin rule content:", idParam)

      const contentResponse = await fetch(`/api/admrul?${contentParams.toString()}`, { cache: 'no-store' })
      if (!contentResponse.ok) {
        const errorText = await contentResponse.text()
        console.error("[law-viewer] Admin rule API error:", contentResponse.status, errorText)
        throw new Error(`행정규칙 조회 실패: ${contentResponse.status}`)
      }

      const contentXml = await contentResponse.text()
      console.log("[law-viewer] Admin rule XML received, length:", contentXml.length)

      const fullContent = parseAdminRuleContent(contentXml)

      if (!fullContent) {
        throw new Error("행정규칙 파싱 실패")
      }

      console.log("[law-viewer] Admin rule parsed:", {
        name: fullContent.name,
        articles: fullContent.articles.length,
      })

      // Convert admin rule content to HTML - format like law text
      const htmlParts: string[] = []

      // Header with metadata
      if (fullContent.department || fullContent.publishDate || fullContent.effectiveDate) {
        htmlParts.push('<div style="padding: 12px; background: hsl(var(--secondary)); border-radius: 8px; margin-bottom: 24px; color: hsl(var(--foreground));">')
        const metadata: string[] = []
        if (fullContent.department) metadata.push(`<span style="font-size: 0.875rem;"><strong>소관부처:</strong> ${fullContent.department}</span>`)
        if (fullContent.publishDate) metadata.push(`<span style="font-size: 0.875rem;"><strong>발령일자:</strong> ${fullContent.publishDate}</span>`)
        if (fullContent.effectiveDate) metadata.push(`<span style="font-size: 0.875rem;"><strong>시행일자:</strong> ${fullContent.effectiveDate}</span>`)
        htmlParts.push(metadata.join(' | '))
        htmlParts.push('</div>')
      }

      // Articles - format using formatAdminRuleHTML (includes links + styling)
      let textParts: string[] = []

      fullContent.articles.forEach((article, idx) => {
        // Article title - bold inline style
        const titleHtml = '<strong style="font-size: 1rem;">' + article.number +
          (article.title ? ' <span style="font-weight: 400; color: hsl(var(--muted-foreground));">(' + article.title + ')</span>' : '') +
          '</strong>'

        textParts.push(titleHtml)
        textParts.push('\n') // 제목 뒤 줄바꿈 1개

        // Article content - format with links + styling + revision marks
        const formattedContent = formatAdminRuleHTML(article.content, meta.lawTitle)
        textParts.push(formattedContent)
        textParts.push('\n') // 조문 끝 줄바꿈

        // Add spacing between articles (Separator)
        if (idx < fullContent.articles.length - 1) {
          textParts.push('<hr style="margin: 0.5rem 0; border: 0; border-top: 1px solid hsl(var(--border));" />')
        }
      })

      const articlesHtml = textParts.join('')
      htmlParts.push(articlesHtml)
      const finalHtml = htmlParts.join('')
      const finalTitle = fullContent.name

      setAdminRuleTitle(finalTitle)
      setAdminRuleHtml(finalHtml)

      // Cache the result to IndexedDB
      await setAdminRuleContentCache(idParam, finalTitle, finalHtml, fullContent.effectiveDate)
      console.log("[law-viewer] Cached admin rule content to IndexedDB:", idParam)
    } catch (error: any) {
      console.error("[law-viewer] Error loading admin rule full content:", error)
      setAdminRuleHtml(`<div style="text-align: center; padding: 2rem 0;"><p style="color: hsl(var(--destructive)); font-weight: 600; margin-bottom: 0.5rem;">전체 내용 조회 실패</p><p style="font-size: 0.875rem; color: hsl(var(--muted-foreground));">${error.message}</p></div>`)
    }
  }

  const getLawGoKrLink = (serialNumber?: string) => {
    // Use serialNumber if available (same as test page)
    if (!serialNumber) return null
    return `https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=${serialNumber}`
  }

  // Helper: fetch external law article and show in modal
  async function openExternalLawArticleModal(lawName: string, articleLabel: string) {
    try {
      // ✅ 법령명 정규화: 따옴표 제거 (「도로법」 → 도로법)
      const cleanedLawName = lawName.replace(/[「」『』]/g, '').trim()
      console.log('[Citation] Opening modal for:', { originalLawName: lawName, cleanedLawName, articleLabel })

      // 자치법규 여부 감지
      // "시행규칙", "시행령"은 국가법령이므로 제외
      const isOrdinance = (/조례/.test(cleanedLawName) ||
        (/(특별시|광역시|[가-힣]+도|[가-힣]+(시|군|구))\s+[가-힣]/.test(cleanedLawName) && !/시행규칙|시행령/.test(cleanedLawName))) &&
        !/시행규칙|시행령/.test(cleanedLawName)
      console.log('[Citation] Is ordinance:', isOrdinance, 'for law:', cleanedLawName)

      // 자치법규는 법제처 자치법규 페이지로 리다이렉트
      if (isOrdinance) {
        const lawGoKrUrl = `https://www.law.go.kr/자치법규/${encodeURIComponent(cleanedLawName)}/${encodeURIComponent(articleLabel)}`
        setRefModal({
          open: true,
          title: `${cleanedLawName} ${articleLabel}`,
          html: `<div class="space-y-3"><p>자치법규는 법제처 자치법규 페이지에서 확인하실 수 있습니다.</p><div class="pt-3 border-t"><a href="${lawGoKrUrl}" target="_blank" rel="noopener" class="text-primary hover:underline inline-flex items-center gap-1">법제처에서 ${cleanedLawName} ${articleLabel} 보기 →</a></div></div>`,
          lawName: cleanedLawName,
          articleNumber: articleLabel,
        })
        return
      }

      const qs = new URLSearchParams({ query: cleanedLawName })
      const searchRes = await fetch(`/api/law-search?${qs.toString()}`)
      const searchXml = await searchRes.text()

      console.log('[Citation] Law search response length:', searchXml.length)

      const parser = new DOMParser()
      const searchDoc = parser.parseFromString(searchXml, "text/xml")

      // ✅ 모든 법령 검색하고 가장 짧은 이름 선택 (정확 매칭 우선)
      const allLaws = Array.from(searchDoc.querySelectorAll("law"))
      const normalizedSearchName = cleanedLawName.replace(/\s+/g, "")

      const exactMatches = allLaws.filter(lawNode => {
        const nodeLawName = lawNode.querySelector("법령명한글")?.textContent || ""
        return nodeLawName.replace(/\s+/g, "") === normalizedSearchName
      })

      const lawNode = exactMatches.length > 0
        ? exactMatches.reduce((shortest, current) => {
            const shortestName = shortest.querySelector("법령명한글")?.textContent || ""
            const currentName = current.querySelector("법령명한글")?.textContent || ""
            return currentName.length < shortestName.length ? current : shortest
          })
        : allLaws[0]

      console.log('[Citation] Law matching:', {
        searched: cleanedLawName,
        found: lawNode?.querySelector("법령명한글")?.textContent,
        exactMatches: exactMatches.length,
        totalResults: allLaws.length
      })

      const lawId = lawNode?.querySelector("법령ID")?.textContent || undefined
      const mst = lawNode?.querySelector("법령일련번호")?.textContent || undefined
      const effectiveDate = lawNode?.querySelector("시행일자")?.textContent || undefined

      console.log('[Citation] Law identifiers:', { lawId, mst, effectiveDate })

      if (!lawId && !mst) {
        console.log('[Citation] No law ID found')
        setRefModal({
          open: true,
          title: cleanedLawName,
          html: `<p>법령을 찾지 못했습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/법령/${encodeURIComponent(cleanedLawName)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 검색하기</a></p>`,
        })
        return
      }

      // Extract just the article number (제X조 or 제X조의Y) from articleLabel
      // articleLabel might be "제5조제2항" or "제55조제12호" but buildJO only handles "제5조"
      // Remove 항(paragraph) and 호(item) parts: 제N항, 제N호
      let joCode = ""
      try {
        const articleOnly = articleLabel.match(/(제\d+조(?:의\d+)?)/)?.[1] || articleLabel
        joCode = buildJO(articleOnly)
        console.log('[Citation] JO code built:', { original: articleLabel, articleOnly, joCode })
      } catch (err) {
        console.error("[Citation] Failed to build JO code:", err)
      }

      const identifierParams = new URLSearchParams()
      if (lawId) {
        identifierParams.append("lawId", lawId)
      } else if (mst) {
        identifierParams.append("mst", mst)
      }
      // ⚠️ jo 파라미터 제거 - API가 잘못된 조문을 반환하는 버그 방지
      // 전체 법령을 가져온 후 클라이언트에서 필터링
      console.log("[citation] Fetching full law, will filter on client:", { cleanedLawName, articleLabel, joCode })
      // ⚠️ efYd를 사용하지 않음 - 최신 시행 버전 조회
      // 타법개정으로 인한 조문 누락 방지

      try {
        console.log('[Citation] Fetching eflaw API:', identifierParams.toString())
        const eflawRes = await fetch(`/api/eflaw?${identifierParams.toString()}`)

        if (!eflawRes.ok) {
          console.error('[Citation] Eflaw API error:', eflawRes.status)
          throw new Error(`HTTP ${eflawRes.status}`)
        }

        const eflawJson = await eflawRes.json()
        console.log('[Citation] Eflaw JSON keys:', Object.keys(eflawJson))

        const lawData = eflawJson?.법령
        console.log('[Citation] Law data exists:', !!lawData)

        const rawArticleUnits = lawData?.조문?.조문단위
        console.log('[Citation] Raw article units type:', Array.isArray(rawArticleUnits) ? 'array' : typeof rawArticleUnits)

        const articleUnits = Array.isArray(rawArticleUnits)
          ? rawArticleUnits
          : rawArticleUnits
            ? [rawArticleUnits]
            : []

        console.log('[Citation] Article units count:', articleUnits.length)

        const normalizedJo = joCode || ((articleUnits[0]?.조문키 || "").slice(0, 6))
        console.log('[Citation] Normalized JO:', normalizedJo)

        // 🔍 디버깅: 조문 검색 상세 로그
        debugLogger.info('[citation] Article search details', {
          lawName: cleanedLawName,
          articleLabel,
          joCode,
          normalizedJo,
          totalArticles: articleUnits.length,
          firstArticle: articleUnits[0] ? {
            조문키: articleUnits[0]?.조문키,
            조문번호: articleUnits[0]?.조문번호
          } : null
        })

        console.log('[Citation] Searching for article with normalizedJo:', normalizedJo)
        console.log('[Citation] All articles:', articleUnits.map((u: any) => ({
          조문키: u?.조문키,
          조문번호: u?.조문번호,
          조문제목: u?.조문제목?.substring(0, 30)
        })))

        // ⚠️ 조문여부가 "조문"인 것만 찾기 (전문 제외)
        console.log('[Citation] Searching with normalizedJo:', normalizedJo, 'articleLabel:', articleLabel)

        const targetUnit =
          articleUnits.find((unit: any) => {
            const isArticle = unit?.조문여부 === "조문"
            const hasKey = typeof unit?.조문키 === "string"
            const matches = hasKey && unit.조문키.startsWith(normalizedJo)
            console.log('[Citation] Check unit:', {
              조문키: unit?.조문키,
              조문번호: unit?.조문번호,
              조문여부: unit?.조문여부,
              isArticle,
              hasKey,
              matches
            })
            return isArticle && hasKey && matches
          }) ||
          articleUnits.find((unit: any) => {
            const num = typeof unit?.조문번호 === "string" ? unit.조문번호.replace(/\D/g, "") : ""
            const targetNum = articleLabel.replace(/\D/g, "")
            console.log('[Citation] Fallback check:', {
              조문번호: unit?.조문번호,
              num,
              targetNum,
              matches: num === targetNum
            })
            return unit?.조문여부 === "조문" && num !== "" && targetNum !== "" && num === targetNum
          })

        console.log('[Citation] Target unit found:', !!targetUnit)
        if (targetUnit) {
          console.log('[Citation] Found unit:', {
            조문키: targetUnit.조문키,
            조문번호: targetUnit.조문번호,
            조문제목: targetUnit.조문제목?.substring(0, 50)
          })
        }

        if (!targetUnit) {
          console.warn("[citation] Article not found in JSON response", {
            lawName: cleanedLawName,
            articleLabel,
            joCode,
            normalizedJo,
            availableArticles: articleUnits.slice(0, 5).map((u: any) => ({
              조문키: u?.조문키,
              조문번호: u?.조문번호
            }))
          })
          setRefModal({
            open: true,
            title: `${cleanedLawName} ${articleLabel}`,
            html: `<p>해당 조문을 찾지 못했습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/법령/${encodeURIComponent(cleanedLawName)}/${encodeURIComponent(articleLabel)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 보기</a></p>`,
          })
          return
        }

        // ⚠️ 조문내용이 제목만 있는 경우가 많으므로 항 배열을 텍스트로 변환
        let rawContent = targetUnit.조문내용 || ""
        const title = targetUnit.조문제목 || ""

        console.log('[Citation] Raw unit data:', {
          조문내용_length: rawContent.length,
          조문내용_preview: rawContent.substring(0, 200),
          조문제목: title,
          항_exists: !!targetUnit.항,
          항_isArray: Array.isArray(targetUnit.항),
          항_length: Array.isArray(targetUnit.항) ? targetUnit.항.length : 0,
          항_sample: Array.isArray(targetUnit.항) && targetUnit.항.length > 0 ? targetUnit.항[0] : null,
          호_exists: !!targetUnit.호,
          호_isArray: Array.isArray(targetUnit.호),
          호_length: Array.isArray(targetUnit.호) ? targetUnit.호.length : 0
        })

        // 먼저 조문내용에서 제목 부분 제거 (항/호 처리 전에)
        if (rawContent && title) {
          // 제1조(목적) 이 법은... → 이 법은...
          const titlePattern = new RegExp(`^제${targetUnit.조문번호}조(?:의\\d+)?\\s*\\(${title}\\)\\s*`, 'i')
          if (titlePattern.test(rawContent)) {
            rawContent = rawContent.replace(titlePattern, '')
            console.log('[Citation] After title pattern removal:', rawContent.length)
          }
        }

        // 항 처리: 배열 또는 단일 객체일 수 있음
        const hangArray = Array.isArray(targetUnit.항)
          ? targetUnit.항
          : targetUnit.항
            ? [targetUnit.항]
            : []

        if (hangArray.length > 0) {
          // ✅ 먼저 항내용이 있는지 확인
          const hasHangContent = hangArray.some((hang: any) => (hang?.항내용 || "").trim())

          // 호 내용 추출
          const allHo = hangArray.flatMap((hang: any) => {
            const hoInHang = Array.isArray(hang?.호) ? hang.호 : hang?.호 ? [hang.호] : []
            return hoInHang
          })

          if (hasHangContent) {
            // 항내용이 있는 경우 → 기존 로직 (항내용 + 호)
            const paragraphsText = hangArray.map((hang: any) => {
              const hangContent = hang?.항내용 || ""
              const hoInHang = Array.isArray(hang?.호) ? hang.호 : hang?.호 ? [hang.호] : []

              if (hoInHang.length > 0) {
                const itemsText = hoInHang.map((ho: any) => ho?.호내용 || "").join('\n')
                return hangContent ? `${hangContent}\n${itemsText}` : itemsText
              }

              return hangContent
            }).join('\n\n')

            console.log('[Citation] Converted from 항 with 항내용:', paragraphsText.length, 'chars')
            rawContent = paragraphsText
          } else if (allHo.length > 0) {
            // 항내용 없고 호만 있는 경우 → paragraphs 구조로 전달 (extractArticleText가 처리)
            // rawContent는 본문만 유지, 호는 별도로 처리
            console.log('[Citation] Will pass 호 as paragraphs (no 항내용):', allHo.length, 'items')
            // rawContent는 본문만 유지 (호 합치지 않음)
          } else {
            // 항내용도 없고 호도 없음 → rawContent 그대로
            console.log('[Citation] 항 exists but no 항내용 and no 호')
          }
        }
        // 항 없이 최상위 호만 있는 경우 처리
        else if (Array.isArray(targetUnit.호) && targetUnit.호.length > 0) {
          console.log('[Citation] Will pass top-level 호 as paragraphs (no 항):', targetUnit.호.length, 'items')
          // rawContent는 본문만 유지 (호 합치지 않음)
        } else {
          console.log('[Citation] Using 조문내용 directly (no 항/호 arrays)')
        }

        // paragraphs 구조 생성 (항내용 없고 호만 있는 경우)
        let paragraphs: any[] | undefined
        if (hangArray.length > 0) {
          const hasHangContent = hangArray.some((hang: any) => (hang?.항내용 || "").trim())
          const allHo = hangArray.flatMap((hang: any) => {
            const hoInHang = Array.isArray(hang?.호) ? hang.호 : hang?.호 ? [hang.호] : []
            return hoInHang
          })

          if (!hasHangContent && allHo.length > 0) {
            // 항내용 없고 호만 있는 경우 → paragraphs 구조로 전달
            paragraphs = [{
              num: "",
              content: "",
              items: allHo.map((ho: any, idx: number) => ({
                num: `${idx + 1}`,
                content: ho?.호내용 || ""
              }))
            }]
          }
        } else if (Array.isArray(targetUnit.호) && targetUnit.호.length > 0) {
          // 최상위 호만 있는 경우
          paragraphs = [{
            num: "",
            content: "",
            items: targetUnit.호.map((ho: any, idx: number) => ({
              num: `${idx + 1}`,
              content: ho?.호내용 || ""
            }))
          }]
        }

        const lawArticle: LawArticle = {
          jo: normalizedJo,
          joNum: articleLabel,
          title,
          content: rawContent,
          isPreamble: false,
          paragraphs
        }

        const articleTitle = `${lawName} ${formatJO(lawArticle.jo)}${lawArticle.title ? ` (${lawArticle.title})` : ""}`

        console.log('[Citation] Creating modal with article:', {
          jo: lawArticle.jo,
          joNum: lawArticle.joNum,
          title: lawArticle.title,
          rawContentLength: (targetUnit.조문내용 || "").length,
          processedContentLength: lawArticle.content?.length || 0
        })

        const htmlContent = extractArticleText(lawArticle, false, meta.lawTitle)
        console.log('[Citation] Extracted HTML length:', htmlContent.length)
        console.log('[Citation] HTML preview:', htmlContent.substring(0, 200))

        // ⚠️ 조문 내용이 비어있는 경우 에러 메시지 표시
        if (!htmlContent || htmlContent.trim().length === 0) {
          console.warn('[Citation] Empty article content - possibly deleted or not yet effective')
          setRefModal({
            open: true,
            title: articleTitle,
            html: `<div class="space-y-3"><p>⚠️ 조문 내용을 불러올 수 없습니다.</p><p class="text-sm text-muted-foreground">이 조문은 최근 개정으로 인해 내용이 변경되었거나 삭제되었을 수 있습니다.</p><div class="pt-3 border-t"><a href="https://www.law.go.kr/법령/${encodeURIComponent(lawName)}/${encodeURIComponent(articleLabel)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 ${lawName} ${articleLabel} 보기</a></div></div>`,
          })
          return
        }

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
          title: articleTitle,
          html: htmlContent,
          lawName: lawName,
          articleNumber: articleLabel,
        })
      } catch (fetchErr: any) {
        console.error("[citation] Failed to fetch/parse article:", { lawName, articleLabel, joCode, error: fetchErr.message })
        setRefModal({
          open: true,
          title: `${lawName} ${articleLabel}`,
          html: `<div class="space-y-3"><p>조문을 불러오는 중 오류가 발생했습니다.</p><div class="pt-3 border-t"><a href="https://www.law.go.kr/법령/${encodeURIComponent(lawName)}/${encodeURIComponent(articleLabel)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 ${lawName} ${articleLabel} 보기</a></div></div>`,
        })
      }
    } catch (err) {
      console.error("openExternalLawArticleModal error", err)
      setRefModal({
        open: true,
        title: `${lawName} ${articleLabel}`,
        html: `<div class="space-y-3"><p>조문을 불러오는 중 오류가 발생했습니다.</p><div class="pt-3 border-t"><a href="https://www.law.go.kr/법령/${encodeURIComponent(lawName)}/${encodeURIComponent(articleLabel)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 ${lawName} ${articleLabel} 보기</a></div></div>`,
      })
    }
  }
  // Helper: open related law (decree or rule) modal
  async function openRelatedLawModal(kind: "decree" | "rule") {
    const kindLabel = kind === "decree" ? "시행령" : "시행규칙"

    try {
      // First, get the hierarchy to find the related law name
      if (!meta.lawId && !meta.mst) {
        setRefModal({
          open: true,
          title: `${meta.lawTitle} ${kindLabel}`,
          html: `<p>관련 법령 정보를 찾을 수 없습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/" target="_blank" rel="noopener">법제처에서 검색하기</a></p>`,
        })
        return
      }

      const hierarchyParams = new URLSearchParams()
      if (meta.lawId) hierarchyParams.append("lawId", meta.lawId)
      else if (meta.mst) hierarchyParams.append("mst", meta.mst)

      const hierarchyRes = await fetch(`/api/hierarchy?${hierarchyParams.toString()}`)
      const hierarchyXml = await hierarchyRes.text()

      const { parseHierarchyXML } = await import("@/lib/hierarchy-parser")
      const hierarchy = parseHierarchyXML(hierarchyXml)

      if (!hierarchy || !hierarchy.lowerLaws || hierarchy.lowerLaws.length === 0) {
        setRefModal({
          open: true,
          title: `${meta.lawTitle} ${kindLabel}`,
          html: `<p>${kindLabel}을 찾을 수 없습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/법령/${encodeURIComponent(meta.lawTitle + " " + kindLabel)}" target="_blank" rel="noopener">법제처에서 검색하기</a></p>`,
        })
        return
      }

      // Find the matching decree or rule
      const relatedLaw = hierarchy.lowerLaws.find((l) => l.type === kind)

      if (!relatedLaw) {
        setRefModal({
          open: true,
          title: `${meta.lawTitle} ${kindLabel}`,
          html: `<p>${kindLabel}을 찾을 수 없습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/법령/${encodeURIComponent(meta.lawTitle + " " + kindLabel)}" target="_blank" rel="noopener">법제처에서 검색하기</a></p>`,
        })
        return
      }

      // Try to find the same article in the related law
      if (activeArticle) {
        try {
          const joLabel = formatJO(activeArticle.jo)
          await openExternalLawArticleModal(relatedLaw.lawName, joLabel)
          return
        } catch {
          // If finding the same article fails, show the related law info
        }
      }

      // Fallback: show related law info with link
      setRefModal({
        open: true,
        title: relatedLaw.lawName,
        html: `<div class="space-y-3"><p>해당 ${kindLabel}을 찾았습니다.</p><p class="text-sm"><strong>${relatedLaw.lawName}</strong></p><div class="flex gap-2 mt-4"><a href="https://www.law.go.kr/법령/${encodeURIComponent(relatedLaw.lawName)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 전문 보기</a></div></div>`,
      })
    } catch (err) {
      console.error("openRelatedLawModal error", err)
      setRefModal({
        open: true,
        title: `${meta.lawTitle} ${kindLabel}`,
        html: `<p>${kindLabel} 조회 중 오류가 발생했습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/" target="_blank" rel="noopener">법제처에서 검색하기</a></p>`,
      })
    }
  }

  // Helper: fetch law hierarchy and show in modal
  async function openLawHierarchyModal(lawName: string) {
    try {
      // First search for the law to get its ID
      const searchRes = await fetch(`/api/law-search?${new URLSearchParams({ query: lawName })}`)
      const searchXml = await searchRes.text()
      const lawIdMatch = searchXml.match(/<법령ID>([^<]+)<\/법령ID>/)
      const mstMatch = searchXml.match(/<법령일련번호>([^<]+)<\/법령일련번호>/)

      if (!lawIdMatch && !mstMatch) {
        setRefModal({
          open: true,
          title: lawName,
          html: `<p>법령을 찾지 못했습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/법령/${encodeURIComponent(lawName)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 검색하기 →</a></p>`,
          forceWhiteTheme: true,
        })
        return
      }

      const lawId = lawIdMatch?.[1]
      const mst = mstMatch?.[1]

      // Fetch hierarchy information
      const hierarchyParams = new URLSearchParams()
      if (lawId) hierarchyParams.append("lawId", lawId)
      else if (mst) hierarchyParams.append("mst", mst)

      const hierarchyRes = await fetch(`/api/hierarchy?${hierarchyParams.toString()}`)
      const hierarchyXml = await hierarchyRes.text()

      const { parseHierarchyXML } = await import("@/lib/hierarchy-parser")
      const hierarchy = parseHierarchyXML(hierarchyXml)

      if (!hierarchy) {
        // Fallback to basic law page
        setRefModal({
          open: true,
          title: lawName,
          html: `<p>법령 체계도를 불러올 수 없습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/법령/${encodeURIComponent(lawName)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 보기 →</a></p>`,
          forceWhiteTheme: true,
        })
        return
      }

      // Build hierarchy display HTML
      let html = `<div class="space-y-4">`

      // Upper laws
      if (hierarchy.upperLaws && hierarchy.upperLaws.length > 0) {
        html += `<div><h4 class="font-semibold mb-2">상위 법령</h4><ul class="list-disc list-inside space-y-1">`
        for (const upper of hierarchy.upperLaws) {
          html += `<li><a href="#" class="law-ref text-primary hover:underline" data-ref="law" data-law="${upper.lawName}">${upper.lawName}</a></li>`
        }
        html += `</ul></div>`
      }

      // Current law
      html += `<div><h4 class="font-semibold mb-2">현재 법령</h4><p>${hierarchy.lawName}</p>`
      if (hierarchy.effectiveDate) {
        html += `<p class="text-sm text-muted-foreground">시행일: ${hierarchy.effectiveDate}</p>`
      }
      html += `</div>`

      // Lower laws (decree and rule)
      if (hierarchy.lowerLaws && hierarchy.lowerLaws.length > 0) {
        const decrees = hierarchy.lowerLaws.filter((l) => l.type === "decree")
        const rules = hierarchy.lowerLaws.filter((l) => l.type === "rule")

        if (decrees.length > 0) {
          html += `<div><h4 class="font-semibold mb-2">시행령</h4><ul class="list-disc list-inside space-y-1">`
          for (const decree of decrees) {
            html += `<li><a href="#" class="law-ref text-primary hover:underline" data-ref="law" data-law="${decree.lawName}">${decree.lawName}</a></li>`
          }
          html += `</ul></div>`
        }

        if (rules.length > 0) {
          html += `<div><h4 class="font-semibold mb-2">시행규칙</h4><ul class="list-disc list-inside space-y-1">`
          for (const rule of rules) {
            html += `<li><a href="#" class="law-ref text-primary hover:underline" data-ref="law" data-law="${rule.lawName}">${rule.lawName}</a></li>`
          }
          html += `</ul></div>`
        }
      }

      html += `<div class="pt-2 border-t"><a href="https://www.law.go.kr/법령/${encodeURIComponent(lawName)}" target="_blank" rel="noopener" class="text-sm text-primary hover:underline">법제처에서 전문 보기 →</a></div>`
      html += `</div>`

      setRefModal({
        open: true,
        title: `${lawName} 체계도`,
        html,
        forceWhiteTheme: true,
      })
    } catch (err) {
      console.error("openLawHierarchyModal error", err)
      setRefModal({
        open: true,
        title: lawName,
        html: `<p>법령 체계도를 불러오는 중 오류가 발생했습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/법령/${encodeURIComponent(lawName)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 보기 →</a></p>`,
        forceWhiteTheme: true,
      })
    }
  }

  console.log("LawViewer 렌더링 완료:", {
    activeJo,
    activeArticle: activeArticle ? { jo: activeArticle.jo, title: activeArticle.title } : null,
    viewMode,
    displayMode: isOrdinance ? "조례 (전체 조문)" : viewMode === "full" ? "법령 (전체 조문)" : "법령 (선택 조문)",
    preambleCount: preambles.length,
    actualArticleCount: actualArticles.length,
  })


  // ========== UI 렌더링 ==========
  // law-viewer-ui.tsx로 분리된 UI 컴포넌트 호출
  return (
    <LawViewerUI
      meta={meta}
      articles={articles}
      loadedArticles={loadedArticles}
      preambles={preambles}
      activeJo={activeJo}
      activeArticle={activeArticle}
      isOrdinance={isOrdinance}
      viewMode={viewMode}
      isFullView={isFullView}
      fontSize={fontSize}
      copied={copied}
      isArticleListExpanded={isArticleListExpanded}
      aiAnswerMode={aiAnswerMode}
      aiAnswerHTML={aiAnswerHTML}
      relatedArticles={relatedArticles}
      aiCitations={aiCitations}
      userQuery={userQuery}
      aiConfidenceLevel={aiConfidenceLevel}
      fileSearchFailed={fileSearchFailed}
      threeTierCitation={threeTierCitation}
      threeTierDelegation={threeTierDelegation}
      tierViewMode={tierViewMode}
      isLoadingThreeTier={isLoadingThreeTier}
      delegationActiveTab={delegationActiveTab}
      validDelegations={validDelegations}
      validCitations={validCitations}
      hasValidThreeTierData={hasValidThreeTierData}
      threeTierDataType={threeTierDataType}
      tierItems={tierItems}
      hasValidSihyungkyuchik={hasValidSihyungkyuchik}
      totalDelegationCount={totalDelegationCount}
      showAdminRules={showAdminRules}
      adminRuleViewMode={adminRuleViewMode}
      adminRuleHtml={adminRuleHtml}
      adminRuleTitle={adminRuleTitle}
      adminRules={adminRules}
      loadingAdminRules={loadingAdminRules}
      adminRulesError={adminRulesError}
      adminRulesProgress={adminRulesProgress}
      adminRuleMobileTab={adminRuleMobileTab}
      loadedAdminRulesCount={loadedAdminRulesCount}
      comparisonLawMeta={comparisonLawMeta}
      comparisonLawArticles={comparisonLawArticles}
      comparisonLawSelectedJo={comparisonLawSelectedJo}
      isLoadingComparison={isLoadingComparison}
      refModal={refModal}
      refModalHistory={refModalHistory}
      lastExternalRef={lastExternalRef}
      revisionHistory={revisionHistory}
      isLoadingHistory={isLoadingHistory}
      delegationPanelSize={delegationPanelSize}
      adminRulePanelSize={adminRulePanelSize}
      swipeHint={swipeHint}
      contentRef={contentRef}
      articleRefs={articleRefs}
      onArticleClick={handleArticleClick}
      onContentClick={handleContentClick}
      setIsArticleListExpanded={setIsArticleListExpanded}
      setFontSize={setFontSize}
      setCopied={setCopied}
      copyArticleUrl={copyArticleUrl}
      openExternalLink={openExternalLink}
      setRefModal={setRefModal}
      handleRefModalBack={handleRefModalBack}
      setTierViewMode={setTierViewMode}
      fetchThreeTierData={fetchThreeTierData}
      setShowAdminRules={setShowAdminRules}
      setAdminRuleViewMode={setAdminRuleViewMode}
      handleViewAdminRuleFullContent={handleViewAdminRuleFullContent}
      setAdminRuleMobileTab={setAdminRuleMobileTab}
      setDelegationActiveTab={setDelegationActiveTab}
      setDelegationPanelSize={setDelegationPanelSize}
      setAdminRulePanelSize={setAdminRulePanelSize}
      setSwipeHint={setSwipeHint}
      formatJoForDisplay={formatJoForDisplay}
      onCompare={onCompare}
      onSummarize={onSummarize}
      onToggleFavorite={onToggleFavorite}
      onRelatedArticleClick={onRelatedArticleClick}
      favorites={favorites}
    />
  )
}
