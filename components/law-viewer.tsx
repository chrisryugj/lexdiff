"use client"

import type React from "react"
import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
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
import { parseArticleHistoryXML } from "@/lib/revision-parser"
import { useAdminRules, type AdminRuleMatch } from "@/lib/use-admin-rules"
import { parseAdminRuleContent } from "@/lib/admrul-parser"
import { getAdminRuleContentCache, setAdminRuleContentCache, clearAdminRuleContentCache } from "@/lib/admin-rule-cache"
import { useToast } from "@/hooks/use-toast"
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

  // View mode: 1-tier (default) -> 2-tier (article + delegations) -> 3-tier (law + decree + rule)
  const [tierViewMode, setTierViewMode] = useState<"1-tier" | "2-tier" | "3-tier">("1-tier")

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

  // Fetch 3-tier comparison data when law is loaded
  useEffect(() => {
    const fetchThreeTierData = async () => {
      if (aiAnswerMode) {
        return
      }

      if (isOrdinance) {
        return
      }

      if (!meta.lawId && !meta.mst) {
        return
      }

      setIsLoadingThreeTier(true)

      try {
        const params = new URLSearchParams()
        if (meta.lawId) {
          params.append("lawId", meta.lawId)
        } else if (meta.mst) {
          params.append("mst", meta.mst)
        }

        const response = await fetch(`/api/three-tier?${params.toString()}`)
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          console.error("[v0] [3단비교] API 응답 오류:", response.status, errorData)
          return
        }

        const data = await response.json()
        if (data.success) {
          console.log("[3단비교] 데이터 로딩 완료", {
            citationArticles: data.citation?.articles?.length || 0,
            delegationArticles: data.delegation?.articles?.length || 0,
          })
          setThreeTierCitation(data.citation)
          setThreeTierDelegation(data.delegation)
        }
      } catch (error) {
        console.error("[v0] [3단비교] 데이터 로딩 실패:", error)
      } finally {
        setIsLoadingThreeTier(false)
      }
    }

    fetchThreeTierData()
  }, [meta.lawId, meta.mst, isOrdinance, aiAnswerMode])

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

        // Enable admin rules, set list view mode, and switch to 2-tier view
        if (!showAdminRules) {
          setShowAdminRules(true)
        }
        setAdminRuleViewMode("list")
        setTierViewMode("2-tier")
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

        // Close admin rules view and restore delegation view
        setShowAdminRules(false)
        setAdminRuleViewMode("list")
        setAdminRuleHtml(null)

        setTierViewMode("2-tier")
        // Optionally still open the modal as fallback if no delegation data
        // await openRelatedLawModal(kind as "decree" | "rule")
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
        setTierViewMode("2-tier")
        return
      }

      const contentParams = new URLSearchParams({ ID: idParam })

      // Set loading state
      setAdminRuleTitle(rule.name)
      setAdminRuleHtml('<div style="text-align: center; padding: 2rem 0; color: hsl(var(--muted-foreground));"><div style="display: inline-block; width: 2rem; height: 2rem; border: 2px solid currentColor; border-bottom-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div><p style="margin-top: 1rem;">로딩 중...</p><style>@keyframes spin { to { transform: rotate(360deg); }}</style></div>')
      setAdminRuleViewMode("detail")
      setTierViewMode("2-tier")

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

      // Articles - format EXACTLY like law text using text + \n (not HTML blocks)
      let textParts: string[] = []

      fullContent.articles.forEach((article, idx) => {
        // Article title - bold inline style
        const titleHtml = '<strong style="font-size: 1rem;">' + article.number +
          (article.title ? ' <span style="font-weight: 400; color: hsl(var(--muted-foreground));">(' + article.title + ')</span>' : '') +
          '</strong>'

        textParts.push(titleHtml)
        textParts.push('\n') // 제목 뒤 줄바꿈 1개

        // Article content - process like law text
        let content = article.content

        // Escape HTML
        content = content
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;")

        // Apply revision styling
        content = content.replace(
          /&lt;(개정|신설|전문개정|제정|삭제)\s+([0-9., ]+)&gt;/g,
          '<span class="rev-mark">＜$1 $2＞</span>'
        )
        content = content.replace(
          /＜(개정|신설|전문개정|제정|삭제)\s+([0-9., ]+)＞/g,
          '<span class="rev-mark">＜$1 $2＞</span>'
        )

        // NOTE: 법령 링크는 law-xml-parser.tsx의 linkifyRefsB()에서 처리됨

        // Check if content has paragraph markers (①②③) or numbered items (1. 2. 3.)
        const hasParagraphMarkers = /[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/.test(content)
        const hasNumberedItems = /\d+\.\s+/.test(content)

        if (hasParagraphMarkers || hasNumberedItems) {
          // Split by paragraph markers OR numbered items (1. 2. 3.)
          // Use lookbehind to avoid splitting in dates like "2024. 1. 1."
          const parts = content.split(/(?=[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])|(?<!\d\. )(?=\d+\.\s+)/)
          parts.forEach((part, pIdx) => {
            const trimmed = part.trim()
            if (trimmed) {
              if (pIdx > 0) textParts.push('\n') // 항/호 앞에 줄바꿈
              textParts.push(trimmed)
            }
          })
          textParts.push('\n') // 조문 끝 줄바꿈
        } else {
          textParts.push(content)
          textParts.push('\n') // 조문 끝 줄바꿈
        }

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

  return (
    <>
      <div className="relative grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 h-[calc(100vh-12rem)]" style={{ fontFamily: "Pretendard, sans-serif" }}>
        {/* Mobile overlay backdrop */}
        {isArticleListExpanded && (
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsArticleListExpanded(false)}
          />
        )}

        {/* Left sidebar - AI 답변 모드 or 조문 목록 */}
        <Card className={`p-4 flex-col overflow-hidden ${isArticleListExpanded
          ? 'flex fixed lg:relative top-4 left-4 right-4 bottom-4 z-50 lg:z-auto'
          : 'hidden lg:flex'
          }`}>
          {aiAnswerMode ? (
            // ========== AI 모드: 왼쪽은 관련 법령 목록 ==========
            <>
              {/* Mobile close button */}
              {isArticleListExpanded && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsArticleListExpanded(false)}
                  className="lg:hidden mb-2 w-full"
                >
                  닫기
                </Button>
              )}

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
              {/* Mobile close button - top */}
              {isArticleListExpanded && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsArticleListExpanded(false)}
                  className="lg:hidden mb-2 w-full"
                >
                  닫기
                </Button>
              )}

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

              <div className="flex-1 min-h-0">
                <ScrollArea className="h-full">
                  <div className="space-y-1 pr-4 px-4 pt-2 pb-4">
                    {actualArticles.map((article, index) => {
                      const isLoading = loadingJo === article.jo
                      const isLoaded = loadedArticles.some((a) => a.jo === article.jo)

                      return (
                        <button
                          key={`${article.jo}-${index}`}
                          onClick={() => handleArticleClick(article.jo)}
                          disabled={isLoading}
                          className={`w-full text-left px-3 py-2.5 rounded-md transition-colors ${activeJo === article.jo
                            ? "bg-primary text-primary-foreground font-bold"
                            : "hover:bg-secondary text-foreground font-medium"
                            } ${isLoading ? "opacity-50 cursor-wait" : ""}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1">
                              <div className="text-base font-bold">
                                {article.joNum || formatSimpleJo(article.jo, isOrdinance)}
                              </div>
                              {article.title && <div className="text-sm opacity-80 mt-0.5">({article.title})</div>}
                              {isLoading && <span className="text-xs opacity-60">로딩중...</span>}
                            </div>

                            {/* 아이콘 영역 */}
                            <div className="flex items-center gap-1 shrink-0">
                              {activeJo === article.jo ? (
                                <BookmarkCheck className="h-3.5 w-3.5 text-primary-foreground" />
                              ) : (
                                <Bookmark className="h-3.5 w-3.5 opacity-40" />
                              )}
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  onToggleFavorite?.(article.jo)
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    onToggleFavorite?.(article.jo)
                                  }
                                }}
                                className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${favorites.has(article.jo)
                                  ? "text-[var(--color-warning)]"
                                  : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                                  }`}
                                aria-label={favorites.has(article.jo) ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                                aria-pressed={favorites.has(article.jo)}
                                title={favorites.has(article.jo) ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                              >
                                <Star className={`h-3 w-3 ${favorites.has(article.jo) ? "fill-current" : ""}`} />
                              </span>
                              {article.hasChanges && (
                                <AlertCircle className="h-3 w-3 text-[var(--color-warning)]" title="변경된 조문" />
                              )}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </ScrollArea>
              </div>

              {/* Mobile close button - bottom */}
              {isArticleListExpanded && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsArticleListExpanded(false)}
                  className="lg:hidden mt-2 w-full"
                >
                  닫기
                </Button>
              )}
            </>
          )
          }
        </Card >

        {/* Right panel - Article content */}
        < Card className="flex flex-col" >
          {/* Mobile article list toggle */}
          < div className="lg:hidden p-3 border-b border-border bg-muted/30" >
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsArticleListExpanded(!isArticleListExpanded)}
              className="w-full"
            >
              {isArticleListExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-2" />
                  조문 목록 닫기
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-2" />
                  {aiAnswerMode
                    ? `답변 속 법령 보기 (${relatedArticles.length}개)`
                    : `조문 목록 보기 (${actualArticles.length}개)`}
                </>
              )}
            </Button>
          </div>

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
                  {/* Show 2-tier and 3-tier view buttons if valid 3-tier data exists */}
                  {hasValidThreeTierData && (
                    <>
                      <Button
                        variant={tierViewMode === "2-tier" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setTierViewMode(tierViewMode === "2-tier" ? "1-tier" : "2-tier")}
                        title={threeTierDataType === "delegation" ? "시행령 보기" : "인용조문 보기"}
                        className="h-7 px-2"
                      >
                        {threeTierDataType === "delegation" ? (
                          <FileText className="h-3.5 w-3.5 mr-1" />
                        ) : (
                          <Link2 className="h-3.5 w-3.5 mr-1" />
                        )}
                        시행령
                      </Button>
                      {threeTierDataType === "delegation" && hasValidSihyungkyuchik && (
                        <Button
                          variant={tierViewMode === "3-tier" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setTierViewMode(tierViewMode === "3-tier" ? "1-tier" : "3-tier")}
                          title="시행규칙 보기"
                          className="h-7 px-2"
                        >
                          <FileText className="h-3.5 w-3.5 mr-1" />
                          시행규칙
                        </Button>
                      )}
                    </>
                  )}
                  {/* Admin rules button */}
                  <Button
                    variant={showAdminRules ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      const newValue = !showAdminRules
                      setShowAdminRules(newValue)
                      if (newValue) {
                        // 행정규칙 활성화 시 목록 뷰로 설정
                        setAdminRuleViewMode("list")
                        setAdminRuleMobileTab("law")
                      }
                    }}
                    disabled={loadingAdminRules}
                    title="행정규칙 보기"
                    className="h-7 px-2"
                  >
                    {loadingAdminRules ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current mr-1"></div>
                        {adminRulesProgress ? `${adminRulesProgress.current}/${adminRulesProgress.total}` : "로딩 중"}
                      </>
                    ) : (
                      <>
                        <FileText className="h-3.5 w-3.5 mr-1" />
                        행정규칙 {loadedAdminRulesCount > 0 && `(${loadedAdminRulesCount})`}
                      </>
                    )}
                  </Button>
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

          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full" ref={contentRef}>
              <div className="px-5 pt-0 pb-0">
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
                ) : viewMode === "full" ? (
                  <div className="space-y-4">
                    {preambles.map((preamble, index) => (
                      <div
                        key={`preamble-${index}`}
                        className="mb-8 text-xl font-bold text-center"
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
                        className="prose prose-sm max-w-none dark:prose-invert scroll-mt-24"
                      >
                        <div className="mb-2 pb-1 border-b border-border">
                          <h3 className="text-lg font-bold text-foreground mb-1 flex items-center gap-2">
                            {formatSimpleJo(article.jo)}
                            {article.title && <span className="text-muted-foreground">({article.title})</span>}
                            {activeJo === article.jo && (
                              <BookmarkCheck className="h-5 w-5 text-primary ml-2" title="현재 선택된 조문" />
                            )}
                          </h3>
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
                          dangerouslySetInnerHTML={{ __html: extractArticleText(article, false, meta.lawTitle) }}
                        />

                        {article.hasChanges && (
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

                        {index < actualArticles.length - 1 && <Separator className="my-3" />}
                      </div>
                    ))}
                  </div>
                ) : loadingJo ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <p>조문을 불러오는 중...</p>
                  </div>
                ) : activeArticle ? (
                  // Priority 1: Admin rules detail view (행정규칙 상세 뷰 - 최우선)
                  showAdminRules && adminRuleViewMode === "detail" && adminRuleHtml ? (
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
                                        console.log("[law-viewer] Cache cleared, reloading admin rule:", idParam)
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
                                          console.log("[law-viewer] Cache cleared, reloading admin rule:", idParam)
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

                    // Priority 2: Admin rules list view (행정규칙 목록 뷰)
                  ) : showAdminRules && adminRuleViewMode === "list" && (loadingAdminRules || adminRules.length > 0) ? (
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
                    // 3-tier view: Split into three columns - law | decree (시행령) | rule (시행규칙) - only for delegations
                    <div className="grid grid-cols-3 gap-3 overflow-hidden" style={{ height: 'calc(100vh - 250px)' }}>
                      {/* Left: Main article (law) */}
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

                      {/* Middle: Decrees (시행령) */}
                      <div className="border-l border-r border-border px-3 overflow-y-auto">
                        <div className="mb-4 pb-3 border-b border-border">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="h-4 w-4 text-foreground" />
                            <h3 className="text-base font-bold text-foreground">시행령</h3>
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {validDelegations.filter((d) => d.type === "시행령").length}개
                          </Badge>
                        </div>
                        <div className="space-y-0">
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
                      </div>

                      {/* Right: Rules (시행규칙, 행정규칙) */}
                      <div className="border-l border-border pl-3 overflow-y-auto">
                        <div className="mb-4 pb-3 border-b border-border">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-base font-bold text-foreground">시행규칙</h3>
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {validDelegations.filter((d) => d.type === "시행규칙" || d.type === "행정규칙").length}개
                          </Badge>
                        </div>
                        <div className="space-y-0">
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
                          {validDelegations.filter((d) => d.type === "시행규칙" || d.type === "행정규칙").length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-4">시행규칙 없음</p>
                          )}
                        </div>
                      </div>
                    </div>
                    // Priority 4: 2-tier delegation view (위임조문 2단 뷰)
                  ) : tierViewMode === "2-tier" && tierItems.length > 0 ? (
                    // 2-tier view: Split horizontally - left: main article, right: delegations
                    <div className="grid grid-cols-2 gap-4 overflow-hidden" style={{ height: 'calc(100vh - 250px)' }}>
                      {/* Left: Main article */}
                      <div className="prose prose-sm max-w-none dark:prose-invert overflow-y-auto pr-2">
                        <div className="mb-6 pb-4 border-b border-border">
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

                      {/* Right: Delegations/Citations */}
                      <div className="border-l border-border pl-4 overflow-y-auto">
                        <div className="mb-4 pb-3 border-b border-border">
                          <div className="flex items-center gap-2 mb-2">
                            {threeTierDataType === "delegation" ? (
                              <FileText className="h-5 w-5 text-foreground" />
                            ) : (
                              <Link2 className="h-5 w-5 text-foreground" />
                            )}
                            <h3 className="text-base font-bold text-foreground">
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
                              className="py-3 border-b border-border last:border-0"
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
                                  className="text-foreground leading-relaxed break-words text-sm"
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
                      </div>
                    </div>

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
                                      console.log("[law-viewer] Cache cleared, reloading admin rule:", idParam)

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
                    <div className="grid grid-cols-2 gap-4 h-full">
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
                      <div className="mb-6 pb-4 border-b border-border">
                        <div className="flex items-center justify-between gap-4">
                          <h3 className="text-lg font-bold text-foreground mb-0">
                            {formatSimpleJo(activeArticle.jo)}
                            {activeArticle.title && <span className="text-muted-foreground"> ({activeArticle.title})</span>}
                          </h3>
                          {/* 글자 크기 조절 및 복사 */}
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={decreaseFontSize} title="글자 작게">
                              <ZoomOut className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={resetFontSize} title="기본 크기">
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={increaseFontSize} title="글자 크게">
                              <ZoomIn className="h-4 w-4" />
                            </Button>
                            <span className="text-xs text-muted-foreground mx-1">{fontSize}px</span>
                            <Button variant="ghost" size="sm" onClick={handleCopy} title="내용 복사">
                              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
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
                  // AI 모드: AI 답변 표시 (비교 법령이 있으면 2단 뷰)
                  comparisonLawMeta && comparisonLawArticles.length > 0 ? (
                    // 2단 비교 뷰: AI 답변 (좌) + 관련 법령 (우)
                    <div className="grid grid-cols-2 gap-4 overflow-hidden" style={{ height: 'calc(100vh - 250px)' }}>
                      {/* Left: AI Answer with Glassmorphism */}
                      <div className="overflow-y-auto pr-2 relative">
                        {/* 🎨 배경 그라데이션 */}
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-cyan-500/10 pointer-events-none rounded-lg" />

                        <div className="relative bg-card/50 backdrop-blur-xl border-2 border-purple-500/30 shadow-2xl shadow-purple-500/20 rounded-lg p-4">
                          <div className="mb-3 pb-2 border-b border-purple-500/20">
                            <div className="flex items-center gap-2 mb-1">
                              {/* Glowing AI Icon */}
                              <div className="relative">
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-xl opacity-50 animate-pulse" />
                                <div className="relative bg-gradient-to-br from-blue-600 to-purple-600 p-1.5 rounded-lg shadow-lg">
                                  <Sparkles className="h-4 w-4 text-white" />
                                </div>
                              </div>
                              <span className="text-sm font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent whitespace-nowrap">AI 답변</span>
                              <Badge variant="secondary" className="text-xs whitespace-nowrap">
                                File Search RAG
                              </Badge>
                            </div>
                            {userQuery && (
                              <div className="text-xs text-muted-foreground/80">
                                <span className="inline">Q. {userQuery}</span>
                              </div>
                            )}
                          </div>

                          {/* 검색 실패 경고 메시지 */}
                          {fileSearchFailed && (
                            <div className="mb-4 p-3 bg-red-950/30 border border-red-800/50 rounded-lg">
                              <div className="flex items-start gap-2">
                                <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                                <div className="flex-1">
                                  <p className="text-sm font-semibold text-red-300 mb-1 flex items-center gap-1.5">
                                    <AlertTriangle className="h-4 w-4" />
                                    검색 결과 없음
                                  </p>
                                  <p className="text-xs text-red-200/80">
                                    File Search Store에서 관련 법령 조문을 찾지 못했습니다. 검색어를 다시 확인하거나 법령명과 조문 번호를 정확히 입력해주세요.
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          <div
                            className="prose prose-sm max-w-none dark:prose-invert break-words overflow-x-hidden px-2 sm:px-0
                        [&_h2]:text-[clamp(18px,5vw,24px)] [&_h2]:font-bold [&_h2]:mt-[clamp(12px,3vw,20px)] [&_h2]:mb-2 [&_h2]:flex [&_h2]:items-center [&_h2]:gap-1.5 [&_h2]:flex-nowrap
                        [&_h3]:text-[clamp(14px,4vw,16px)] [&_h3]:font-semibold [&_h3]:mt-[clamp(8px,2vw,12px)] [&_h3]:mb-2 [&_h3]:flex [&_h3]:items-center [&_h3]:gap-1.5 [&_h3]:flex-nowrap
                        [&_blockquote]:border-l-2 [&_blockquote]:border-blue-500/40 [&_blockquote]:bg-blue-950/30 [&_blockquote]:pl-2 sm:[&_blockquote]:pl-4 [&_blockquote]:py-2 [&_blockquote]:my-2 [&_blockquote]:break-words [&_blockquote]:overflow-wrap-anywhere [&_blockquote]:not-italic
                        [&_blockquote_p]:my-1 [&_blockquote_p]:leading-relaxed
                        [&_ul]:my-2 sm:[&_ul]:my-4 [&_li]:my-1
                        [&_ol]:my-2 sm:[&_ol]:my-4 [&_ol_li]:my-1
                        [&_p]:leading-relaxed [&_p]:my-2 [&_p]:break-words"
                            style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                            onClick={handleContentClick}
                            dangerouslySetInnerHTML={{ __html: aiAnswerHTML }}
                          />

                          {/* AI 답변 주의사항 */}
                          <div className="mt-4 flex items-start gap-2 text-xs text-amber-200/80 bg-amber-950/20 border border-amber-800/30 p-3 rounded-md">
                            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                            <p>이 답변은 AI가 생성한 것으로, 법적 자문을 대체할 수 없습니다. 정확한 정보는 원문을 확인하거나 전문가와 상담하시기 바랍니다.</p>
                          </div>
                        </div>
                      </div>

                      {/* Right: Comparison Law Article */}
                      <div className="overflow-y-auto pr-2">
                        {isLoadingComparison ? (
                          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                            <p>관련 법령을 불러오는 중...</p>
                          </div>
                        ) : (() => {
                          const comparisonArticle = comparisonLawArticles.find(a => a.jo === comparisonLawSelectedJo) || comparisonLawArticles[0]
                          if (!comparisonArticle) {
                            return (
                              <div className="flex items-center justify-center h-full text-muted-foreground">
                                <p>관련 법령 조문을 찾을 수 없습니다</p>
                              </div>
                            )
                          }

                          return (
                            <div className="prose prose-sm max-w-none dark:prose-invert">
                              <div className="mb-6 pb-4 border-b border-border">
                                <h3 className="text-base font-bold text-foreground mb-2">
                                  {formatSimpleJo(comparisonArticle.jo)}
                                  {comparisonArticle.title && <span className="text-muted-foreground text-sm"> ({comparisonArticle.title})</span>}
                                </h3>
                                <Badge variant="outline" className="text-xs">
                                  {comparisonLawMeta.lawTitle}
                                </Badge>
                              </div>

                              <div
                                className="law-content text-sm text-foreground leading-relaxed"
                                style={{ fontSize: `${fontSize}px` }}
                                dangerouslySetInnerHTML={{ __html: extractArticleText(comparisonArticle, false, comparisonLawMeta?.lawTitle) }}
                              />
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  ) : (
                    // 기본 AI 답변 (비교 법령 없음) - Editorial Clean Design
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
                  )
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
          onBack={() => {
            // 히스토리에서 마지막 항목 가져오기
            const lastItem = refModalHistory[refModalHistory.length - 1]
            if (lastItem) {
              setRefModal({
                open: true,
                ...lastItem
              })
              // 히스토리에서 제거
              setRefModalHistory(prev => prev.slice(0, -1))
            }
          }}
        />
      </div >
    </>
  )
}
