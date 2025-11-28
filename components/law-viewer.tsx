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
  ChevronDown,
  Landmark,
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
import { parseArticleHistoryXML, formatDate } from "@/lib/revision-parser"
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
  aiQueryType?: 'specific' | 'general' | 'comparison' | 'procedural'  // ✅ 쿼리 타입
  aiIsTruncated?: boolean  // ✅ Phase 7: 답변 잘림 여부
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
  aiQueryType = 'general',
  aiIsTruncated = false,
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
  const [isArticleListCollapsed, setIsArticleListCollapsed] = useState(false) // 조문목록 접기 상태
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

  const increaseFontSize = () => setFontSize((prev) => Math.min(prev + 2, 24))
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
        const lawType = target.getAttribute("data-law-type") as 'law' | 'decree' | 'rule' | null

        // 모바일 위임법령 탭뷰에서 링크 클릭 시 탭 전환 (tierViewMode === "2-tier"일 때만)
        if (tierViewMode === "2-tier" && lawType) {
          // 3-tier 데이터가 로드되지 않았다면 먼저 로드
          if (!threeTierDelegation && !threeTierCitation) {
            await fetchThreeTierData()
          }

          // 법령 타입에 따라 적절한 탭으로 전환
          let tabSwitched = false
          if (lawType === 'decree' && validDelegations.some(d => d.type === '시행령')) {
            setDelegationActiveTab('decree')
            tabSwitched = true
            debugLogger.info('탭 전환: 시행령', { lawName, articleLabel })
          } else if (lawType === 'rule' && validDelegations.some(d => d.type === '시행규칙')) {
            setDelegationActiveTab('rule')
            tabSwitched = true
            debugLogger.info('탭 전환: 시행규칙', { lawName, articleLabel })
          } else if (lawType === 'law') {
            // 시행령/시행규칙 본문에서 법률 링크 클릭 시 → 1-tier로 전환
            setTierViewMode("1-tier")
            tabSwitched = true
            debugLogger.info('탭 전환: 법률 본문', { lawName, articleLabel })
          }

          // 탭 전환에 성공했으면 모달 열지 않고 리턴 (모바일 UX)
          if (tabSwitched) {
            setLastExternalRef({ lawName, joLabel: articleLabel })
            return
          }
        }

        // 탭 전환 실패 또는 2-tier 모드가 아닐 때만 모달 열기
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
          debugLogger.info('탭 전환 (related): 시행령')
        } else if (kind === "rule") {
          setDelegationActiveTab("rule") // 시행규칙 탭
          debugLogger.info('탭 전환 (related): 시행규칙')
        }

        // 탭 전환 성공 - 모달 열지 않고 리턴
        return
      }
    }
  }



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
                  <Link2 className="h-5 w-5" />
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
                            <Bookmark className="h-3.5 w-3.5 text-purple-400" />
                          ) : (
                            <Link2 className="h-3.5 w-3.5 text-blue-400" />
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
              />
            ) : isArticleListCollapsed ? (
              // ========== 슬림 모드 (접힌 상태) ==========
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsArticleListCollapsed(false)}
                  className="mx-auto mt-2 mb-2"
                  title="조문 목록 펼치기"
                >
                  <ListOrdered className="h-5 w-5" />
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
                            <Star className="h-2.5 w-2.5 absolute top-0.5 right-0.5 fill-yellow-400 text-yellow-400" />
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
                      <ListOrdered className="h-5 w-5 text-primary" />
                      <h3 className="text-xl font-bold text-foreground">조문 목록</h3>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsArticleListCollapsed(true)}
                      className="h-7 w-7"
                      title="조문 목록 접기"
                    >
                      <ChevronDown className="h-4 w-4 rotate-90" />
                    </Button>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    <FileText className="h-3 w-3 mr-1" />
                    {actualArticles.length}개 조문
                  </Badge>
                </div>

                <div className="flex-1 min-h-0 px-2 pt-2 pb-4">
                  <VirtualizedArticleList
                    articles={actualArticles}
                    activeJo={activeJo}
                    loadingJo={loadingJo}
                    favorites={favorites}
                    isOrdinance={isOrdinance}
                    lawTitle={meta.lawTitle}
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
                relatedArticles={mergedRelatedArticles}
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
            icon={<ListOrdered className="h-5 w-5" />}
            count={aiAnswerMode ? relatedArticles.length : actualArticles.length}
            label={aiAnswerMode ? "관련 법령 목록 열기" : "조문 목록 열기"}
          />

          {/* Right panel - Article content */}
          <Card className="flex flex-col overflow-hidden h-auto lg:h-full p-0 gap-0">
            {/* Header - Hidden in AI Answer Mode */}
            {!aiAnswerMode && (
              <div className="border-b border-border px-3 sm:px-4 pt-4 sm:pt-6 pb-2 sm:pb-3.5">
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-bold text-foreground">{meta.lawTitle}</h2>
                  {!isOrdinance && viewMode === "full" && (
                    <Badge variant="outline" className="text-xs">
                      전체 조문
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {meta.latestEffectiveDate && (
                    <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                      <Calendar className="h-3 w-3 mr-1" />
                      {formatDate(meta.latestEffectiveDate)}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                    <FileText className="h-3 w-3 mr-1" />
                    {articles.length}개
                  </Badge>

                  {isOrdinance && (
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs px-1.5 py-0.5">
                      <Building2 className="h-3 w-3 mr-1" />
                      자치법규
                    </Badge>
                  )}
                  {meta.revisionType && (
                    <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                      {meta.revisionType}
                    </Badge>
                  )}

                  {/* 법령 전체 즐겨찾기 개수 */}
                  {favoriteCount > 0 && (
                    <Badge
                      key={`header-fav-count-${favoriteCount}`}
                      variant="outline"
                      className="text-xs px-1.5 py-0.5"
                    >
                      <Star className="h-3 w-3 mr-1 fill-yellow-400 text-yellow-500" />
                      {favoriteCount}
                    </Badge>
                  )}
                  {!isOrdinance && viewMode === "full" && activeArticle && (
                    <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                      현재: {formatSimpleJo(activeArticle.jo)}
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {
              !aiAnswerMode && !isOrdinance && activeArticle && (
                <div className="border-b border-border px-3 sm:px-4 pt-1.5 sm:pt-3 pb-1.5 sm:pb-3">
                  <div className="flex flex-nowrap gap-1 sm:gap-1.5 overflow-x-auto">
                    <Button variant="default" size="sm" onClick={() => onCompare?.(activeArticle.jo)} className="h-7 px-1.5 sm:px-2 shrink-0">
                      <GitCompare className="h-3.5 w-3.5 sm:mr-1" />
                      <span className="hidden sm:inline">신·구법 비교</span>
                      <span className="sm:hidden">비교</span>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => onSummarize?.(activeArticle.jo)} className="h-7 px-1.5 sm:px-2 shrink-0">
                      <Sparkles className="h-3.5 w-3.5 sm:mr-1" />
                      <span className="hidden sm:inline">AI 요약</span>
                      <span className="sm:hidden">요약</span>
                    </Button>
                    <Button variant="outline" size="sm" onClick={openLawCenter} className="h-7 px-1.5 sm:px-2 shrink-0">
                      <ExternalLink className="h-3.5 w-3.5 sm:mr-1" />
                      <span className="hidden sm:inline">원문 보기</span>
                      <span className="sm:hidden">원문</span>
                    </Button>
                    {/* 위임법령 보기 버튼 (2단 뷰 + 탭 구조) */}
                    {!isOrdinance && !aiAnswerMode && (
                      <Button
                        variant={tierViewMode === "2-tier" ? "default" : "outline"}
                        size="sm"
                        disabled={isLoadingThreeTier || shouldDisableDelegationButton}
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
                          <Loader2 className="h-3.5 w-3.5 sm:mr-1 animate-spin" />
                        ) : (
                          <FileText className="h-3.5 w-3.5 sm:mr-1" />
                        )}
                        <span className="hidden sm:inline">{tierViewMode === "2-tier" ? "위임법령 닫기" : `위임법령${delegationButtonCount > 0 ? ` (${delegationButtonCount})` : ""}`}</span>
                        <span className="sm:hidden">{tierViewMode === "2-tier" ? "닫기" : `위임${delegationButtonCount > 0 ? `(${delegationButtonCount})` : ""}`}</span>
                      </Button>
                    )}
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
                      <Star className={`h-3.5 w-3.5 mr-1 transition-all ${isFavorite(activeArticle.jo) ? "fill-yellow-300 text-yellow-300" : ""}`} />
                      즐겨찾기
                    </Button>
                  </div>
                </div>
              )
            }

            {
              isOrdinance && (
                <div className="border-b border-border px-3 sm:px-4 py-0.5 pt-2 sm:pt-3 pb-2 sm:pb-3">
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
                        onContentClick={handleContentClick}
                        articleRefs={articleRefs}
                        scrollParentRef={contentRef}
                      />
                    </div>
                  </ScrollArea>
                )
              ) : aiAnswerMode ? (
                // ✅ Phase 7: AI 모드 - 헤더 유지하면서 AIAnswerContent 표시 (답변 없을 때도)
                <ScrollArea className="h-full" ref={contentRef}>
                  <div className="pb-20">
                    <AIAnswerContent
                      aiAnswerHTML={aiAnswerHTML}
                      userQuery={userQuery}
                      aiConfidenceLevel={aiConfidenceLevel}
                      fileSearchFailed={fileSearchFailed}
                      aiCitations={aiCitations}
                      fontSize={fontSize}
                      setFontSize={setFontSize}
                      handleContentClick={handleContentClick}
                      aiQueryType={aiQueryType}
                      isTruncated={aiIsTruncated}
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
                    <div ref={swipeRef} className="px-3 sm:px-4 lg:px-6 pt-2 sm:pt-3 pb-3">
                      <div className="mb-2 sm:mb-3 pb-1.5 sm:pb-2 border-b border-border">
                        {/* PC: 제목+배지+버튼 1줄 / 모바일: 제목+배지+즐겨찾기 1줄, 버튼 2줄 */}
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-0.5 lg:gap-2">
                          {/* 제목 + 배지 + 즐겨찾기(모바일) */}
                          <div className="flex items-center gap-2 min-w-0">
                            <h2 className="text-lg lg:text-xl font-bold text-foreground truncate">
                              {formatSimpleJo(activeArticle.jo, isOrdinance)}
                              {activeArticle.title && (
                                <span className="text-muted-foreground text-base lg:text-lg ml-2">({activeArticle.title})</span>
                              )}
                            </h2>
                            {meta.lawTitle === "대한민국헌법" ? (
                              <Badge variant="outline" className="text-xs shrink-0 bg-amber-500/20 text-amber-300 border-amber-500/50">
                                <Landmark className="h-3 w-3 mr-1" />
                                헌법
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs shrink-0">
                                {isOrdinance ? "자치법규" : "법률"}
                              </Badge>
                            )}
                            {/* 즐겨찾기 버튼 - 모바일에서 제목줄 우측 */}
                            <Button
                              key={`fav-btn-title-${activeArticle.jo}-${isFavorite(activeArticle.jo)}`}
                              variant="ghost"
                              size="sm"
                              onClick={() => onToggleFavorite?.(activeArticle.jo)}
                              className="lg:hidden ml-auto h-7 w-7 p-0 shrink-0"
                              title={isFavorite(activeArticle.jo) ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                            >
                              <Star className={`h-4 w-4 transition-all ${isFavorite(activeArticle.jo) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
                            </Button>
                          </div>

                          {/* 글씨크기 버튼 */}
                          <div className="flex items-center justify-end gap-1 shrink-0">
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
