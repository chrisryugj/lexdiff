"use client"

import type React from "react"
import { useState, useEffect, useRef, useMemo } from "react"
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
} from "lucide-react"
import type { LawArticle, LawMeta, ThreeTierData } from "@/lib/law-types"
import { extractArticleText, formatDelegationContent } from "@/lib/law-xml-parser"
import { buildJO, formatJO } from "@/lib/law-parser"
import { ReferenceModal } from "@/components/reference-modal"
import { RevisionHistory } from "@/components/revision-history"
import { parseArticleHistoryXML } from "@/lib/revision-parser"
import { useAdminRules, type AdminRuleMatch } from "@/lib/use-admin-rules"
import { parseAdminRuleContent } from "@/lib/admrul-parser"
import { getAdminRuleContentCache, setAdminRuleContentCache, clearAdminRuleContentCache } from "@/lib/admin-rule-cache"

interface LawViewerProps {
  meta: LawMeta
  articles: LawArticle[]
  selectedJo?: string
  onCompare?: (jo: string) => void
  onSummarize?: (jo: string) => void
  onToggleFavorite?: (jo: string) => void
  favorites: Set<string>
  isOrdinance: boolean
  viewMode: "single" | "full"
}

export function LawViewer({
  meta,
  articles,
  selectedJo,
  onCompare,
  onSummarize,
  onToggleFavorite,
  favorites = new Set(),
  isOrdinance = false,
  viewMode = "single",
}: LawViewerProps) {
  const isFullView = isOrdinance || viewMode === "full"

  console.log("[v0] LawViewer 렌더링:", {
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
  const [fontSize, setFontSize] = useState<number>(14)
  const [isArticleListExpanded, setIsArticleListExpanded] = useState(false)
  const articleRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})
  const contentRef = useRef<HTMLDivElement>(null)
  const [refModal, setRefModal] = useState<{ open: boolean; title?: string; html?: string; forceWhiteTheme?: boolean }>({ open: false })
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

  // Update loadedArticles when props.articles changes
  useEffect(() => {
    console.log("[v0] Updating loadedArticles from props.articles:", actualArticles.length)
    setLoadedArticles(actualArticles)
  }, [articles])

  // Log when loadedArticles changes
  useEffect(() => {
    console.log("[v0] loadedArticles updated:", loadedArticles.length, "articles")
    console.log("[v0] Current activeJo:", activeJo)
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
    console.log("[v0] activeArticle changed:", activeArticle?.jo, activeArticle?.title)
  }, [activeArticle])

  useEffect(() => {
    console.log("[v0] [개정이력] Active article revision history:", {
      jo: activeArticle?.jo,
      title: activeArticle?.title,
      hasRevisionHistory: !!activeArticle?.revisionHistory,
      revisionCount: activeArticle?.revisionHistory?.length || 0,
      revisions: activeArticle?.revisionHistory,
    })
  }, [activeArticle])

  useEffect(() => {
    console.log("[v0] LawViewer useEffect 실행:", { selectedJo, activeJo, isOrdinance, viewMode, isFullView })

    // Only update activeJo if selectedJo is different from current activeJo
    // This prevents overriding user clicks from the sidebar
    if (selectedJo && selectedJo !== activeJo) {
      console.log("[v0] selectedJo 변경 감지 - activeJo 업데이트:", selectedJo)
      setActiveJo(selectedJo)

      // Reset admin rules when changing articles to prevent unnecessary searches
      setShowAdminRules(false)
      setAdminRuleViewMode("list")
      setAdminRuleHtml(null)

      // Reset tier view mode to 1-tier when changing articles
      setTierViewMode("1-tier")

      if (!isFullView && contentRef.current) {
        console.log("[v0] 단일 조문 모드 - 스크롤 최상단 이동")
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

      console.log("[v0] Fetching revision history for article:", { lawId: meta.lawId, jo })
      const response = await fetch(`/api/article-history?${params.toString()}`)

      if (!response.ok) {
        console.error("[v0] Failed to fetch revision history:", response.status)
        setRevisionHistory([])
        return
      }

      const xmlText = await response.text()
      console.log("[v0] Received revision history XML, length:", xmlText.length)

      const history = parseArticleHistoryXML(xmlText)
      console.log("[v0] Parsed revision history:", history.length, "items")

      setRevisionHistory(history)
    } catch (error) {
      console.error("[v0] Error fetching revision history:", error)
      setRevisionHistory([])
    } finally {
      setIsLoadingHistory(false)
    }
  }

  useEffect(() => {
    console.log("[v0] [개정이력 useEffect] 실행", {
      hasLawId: !!meta.lawId,
      lawId: meta.lawId,
      isOrdinance,
      hasActiveJo: !!activeJo,
      activeJo,
    })

    if (!meta.lawId) {
      console.log("[v0] [개정이력 useEffect] lawId 없음 - 종료")
      return
    }
    if (isOrdinance) {
      console.log("[v0] [개정이력 useEffect] 조례 - 종료")
      return
    }
    if (!activeJo) {
      console.log("[v0] [개정이력 useEffect] activeJo 없음 - 종료")
      return
    }

    console.log("[v0] [개정이력 useEffect] 개정이력 조회 시작:", activeJo)
    fetchRevisionHistory(activeJo)
  }, [meta.lawId, activeJo, isOrdinance])

  // Fetch 3-tier comparison data when law is loaded
  useEffect(() => {
    const fetchThreeTierData = async () => {
      if (isOrdinance) {
        console.log("[v0] [3단비교] 조례는 3단비교 미지원 - 종료")
        return
      }

      if (!meta.lawId && !meta.mst) {
        console.log("[v0] [3단비교] lawId/mst 없음 - 종료")
        return
      }

      console.log("[v0] [3단비교] 3단비교 데이터 로딩 시작", { lawId: meta.lawId, mst: meta.mst })
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
          console.error("[v0] [3단비교] API 응답 오류:", response.status)
          return
        }

        const data = await response.json()
        if (data.success) {
          console.log("[v0] [3단비교] 데이터 로딩 완료", {
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
  }, [meta.lawId, meta.mst, isOrdinance])

  // Auto-reset tier view mode if the current article doesn't support it
  useEffect(() => {
    if (tierViewMode === "3-tier" && !hasValidSihyungkyuchik) {
      console.log("[v0] [3단비교] 시행규칙 없음 - 2단 또는 1단으로 전환")
      setTierViewMode(hasValidThreeTierData ? "2-tier" : "1-tier")
    } else if (tierViewMode === "2-tier" && !hasValidThreeTierData) {
      console.log("[v0] [3단비교] 위임조문 없음 - 1단으로 전환")
      setTierViewMode("1-tier")
    }
  }, [tierViewMode, hasValidSihyungkyuchik, hasValidThreeTierData, activeJo])

  const handleArticleClick = async (jo: string) => {
    console.log("[v0] 조문 클릭:", { jo, isOrdinance, viewMode, isFullView })

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
      console.log("[v0] 조문이 로드되지 않음 - 동적으로 로드:", jo)
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
              console.log("[v0] Article already exists, skipping")
              return prev
            }
            console.log("[v0] Adding article to loadedArticles:", newArticle.jo)
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
      console.log("[v0] 전체 조문 뷰 - 스크롤 이동")
      const element = articleRefs.current[jo]
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    } else {
      console.log("[v0] 단일 조문 뷰 - activeJo 설정 완료")
    }
  }

  const increaseFontSize = () => setFontSize((prev) => Math.min(prev + 2, 24))
  const decreaseFontSize = () => setFontSize((prev) => Math.max(prev - 2, 10))
  const resetFontSize = () => setFontSize(14)

  const openLawCenter = () => {
    const lawTitle = meta.lawTitle

    if (isFullView || !activeArticle) {
      const url = `https://www.law.go.kr/법령/${encodeURIComponent(lawTitle)}`
      window.open(url, "_blank", "noopener,noreferrer")
    } else {
      const articleNum = formatJO(activeArticle.jo)
      const url = `https://www.law.go.kr/법령/${encodeURIComponent(lawTitle)}/${articleNum}`
      window.open(url, "_blank", "noopener,noreferrer")
    }
  }

  const formatSimpleJo = useMemo(() => {
    return (jo: string): string => {
      if (jo.length === 6) {
        const articleNum = Number.parseInt(jo.substring(0, 4), 10)
        const branchNum = Number.parseInt(jo.substring(4, 6), 10)
        return branchNum === 0 ? `제${articleNum}조` : `제${articleNum}조의${branchNum}`
      }

      if (jo.length === 8) {
        const articleNum = Number.parseInt(jo.substring(0, 4), 10)
        return `제${articleNum}조`
      }

      if (jo.startsWith("제") && jo.includes("조")) {
        return jo
      }

      return jo
    }
  }, [])

  // Handle clicks on linkified references inside article content
  const handleContentClick: React.MouseEventHandler<HTMLDivElement> = async (e) => {
    const target = e.target as HTMLElement
    if (target && target.tagName === "A") {
      e.preventDefault()
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
        try {
          const joCode = buildJO(articleLabel)
          const found = articles.find((a) => a.jo === joCode || formatJO(a.jo) === formatJO(joCode))
          if (found) {
            setRefModal({
              open: true,
              title: `${meta.lawTitle} ${formatJO(found.jo)}${found.title ? ` (${found.title})` : ""}`,
              html: extractArticleText(found),
            })
            return
          }
        } catch {}
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
          window.open(`https://www.law.go.kr/법령/${encodeURIComponent(lawName)}`, "_blank", "noopener")
          setLastExternalRef({ lawName })
        }
      } else if (refType === "regulation") {
        const clickedText = target.textContent || ""
        console.log("[v0] [행정규칙] 링크 클릭 - 행정규칙 버튼 활성화 및 2단 뷰 전환", { clickedText })

        // Enable admin rules, set list view mode, and switch to 2-tier view
        if (!showAdminRules) {
          setShowAdminRules(true)
        }
        setAdminRuleViewMode("list")
        setTierViewMode("2-tier")
      } else if (refType === "law-article") {
        const lawName = target.getAttribute("data-law") || ""
        const articleLabel = target.getAttribute("data-article") || ""
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
        if (!activeArticle) return
        const kind = target.getAttribute("data-kind") || "decree"
        // Expand to 2-tier view to show delegations
        console.log("[v0] [3단비교] 위임조문 클릭 - 2단뷰로 전환", { kind, activeJo: activeArticle.jo })

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

        // Linkify law references - IMPORTANT: Order matters! Longer patterns first.

        // 1. 「법령명」 제X조 pattern (긴 패턴 먼저)
        content = content.replace(/「\s*([^」]+)\s*」\s*제\s*(\d+)\s*조(의\s*(\d+))?(제\s*(\d+)\s*항)?(제\s*(\d+)\s*호)?/g, (_m, lawName, art, _p1, branch, _p2, para, _p3, item) => {
          const joLabel = "제" + art + "조" + (branch ? "의" + branch : "") + (para ? "제" + para + "항" : "") + (item ? "제" + item + "호" : "")
          const label = "「" + lawName + "」 " + joLabel
          return '<a href="#" class="law-ref" data-ref="law-article" data-law="' + lawName + '" data-article="' + joLabel + '">' + label + '</a>'
        })

        // 2. 법 제X조 pattern (without 「」)
        content = content.replace(/([가-힣]+법)\s*제\s*(\d+)\s*조(의\s*(\d+))?(제\s*(\d+)\s*항)?(제\s*(\d+)\s*호)?/g, (match, lawName, art, _p1, branch, _p2, para, _p3, item) => {
          const joLabel = "제" + art + "조" + (branch ? "의" + branch : "") + (para ? "제" + para + "항" : "") + (item ? "제" + item + "호" : "")
          return '<a href="#" class="law-ref" data-ref="law-article" data-law="' + lawName + '" data-article="' + joLabel + '">' + lawName + ' ' + joLabel + '</a>'
        })

        // 3. 「법령명」 pattern only (짧은 패턴 마지막)
        content = content.replace(/「\s*([^」]+)\s*」/g, (match, lawName) => {
          return '<a href="#" class="law-ref" data-ref="law" data-law="' + lawName + '">' + match + '</a>'
        })

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
      const qs = new URLSearchParams({ query: lawName })
      const searchRes = await fetch(`/api/law-search?${qs.toString()}`)
      const searchXml = await searchRes.text()

      const parser = new DOMParser()
      const searchDoc = parser.parseFromString(searchXml, "text/xml")
      const lawNode = searchDoc.querySelector("law")

      const lawId = lawNode?.querySelector("법령ID")?.textContent || undefined
      const mst = lawNode?.querySelector("법령일련번호")?.textContent || undefined
      const effectiveDate = lawNode?.querySelector("시행일자")?.textContent || undefined
      if (!lawId && !mst) {
        setRefModal({
          open: true,
          title: lawName,
          html: `<p>법령을 찾지 못했습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/법령/${encodeURIComponent(lawName)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 검색하기</a></p>`,
        })
        return
      }

      // Extract just the article number (제X조 or 제X조의Y) from articleLabel
      // articleLabel might be "제5조제2항" but buildJO only handles "제5조"
      let joCode = ""
      try {
        const articleOnly = articleLabel.match(/(제\d+조(?:의\d+)?)/)?.[1] || articleLabel
        joCode = buildJO(articleOnly)
      } catch (err) {
        console.error("Failed to build JO code:", err)
      }

      const identifierParams = new URLSearchParams()
      if (lawId) {
        identifierParams.append("lawId", lawId)
      } else if (mst) {
        identifierParams.append("mst", mst)
      }
      if (joCode) {
        identifierParams.append("jo", joCode)
        console.log("[citation] Fetching specific article:", { lawName, articleLabel, joCode })
      }
      if (effectiveDate) {
        identifierParams.append("efYd", effectiveDate)
      }

      try {
        const eflawRes = await fetch(`/api/eflaw?${identifierParams.toString()}`)

        if (!eflawRes.ok) {
          throw new Error(`HTTP ${eflawRes.status}`)
        }

        const eflawJson = await eflawRes.json()
        const lawData = eflawJson?.법령
        const rawArticleUnits = lawData?.조문?.조문단위
        const articleUnits = Array.isArray(rawArticleUnits)
          ? rawArticleUnits
          : rawArticleUnits
          ? [rawArticleUnits]
          : []
        const normalizedJo = joCode || ((articleUnits[0]?.조문키 || "").slice(0, 6))

        const targetUnit =
          articleUnits.find((unit: any) => typeof unit?.조문키 === "string" && unit.조문키.startsWith(normalizedJo)) ||
          articleUnits.find((unit: any) => {
            const num = typeof unit?.조문번호 === "string" ? unit.조문번호.replace(/\D/g, "") : ""
            const targetNum = articleLabel.replace(/\D/g, "")
            return num !== "" && targetNum !== "" && num === targetNum
          })

        if (!targetUnit) {
          console.warn("[citation] Article not found in JSON response", { lawName, articleLabel, joCode })
          setRefModal({
            open: true,
            title: `${lawName} ${articleLabel}`,
            html: `<p>해당 조문을 찾지 못했습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/법령/${encodeURIComponent(lawName)}/${encodeURIComponent(articleLabel)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 보기</a></p>`,
          })
          return
        }

        const lawArticle: LawArticle = {
          jo: normalizedJo,
          joNum: articleLabel,
          title: targetUnit.조문제목 || "",
          content: targetUnit.조문내용 || "",
          paragraphs: Array.isArray(targetUnit.항)
            ? targetUnit.항.map((hang: any) => ({
                num: typeof hang?.항번호 === "string" ? hang.항번호.trim() : "",
                content: typeof hang?.항내용 === "string" ? hang.항내용 : "",
                items: Array.isArray(hang?.호)
                  ? hang.호.map((item: any) => ({
                      num: typeof item?.호번호 === "string" ? item.호번호.trim() : "",
                      content: typeof item?.호내용 === "string" ? item.호내용 : "",
                    }))
                  : undefined,
              }))
            : undefined,
        }

        const articleTitle = `${lawName} ${formatJO(lawArticle.jo)}${lawArticle.title ? ` (${lawArticle.title})` : ""}`

        setRefModal({
          open: true,
          title: articleTitle,
          html: extractArticleText(lawArticle),
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

  console.log("[v0] LawViewer 렌더링 완료:", {
    activeJo,
    activeArticle: activeArticle ? { jo: activeArticle.jo, title: activeArticle.title } : null,
    viewMode,
    displayMode: isOrdinance ? "조례 (전체 조문)" : viewMode === "full" ? "법령 (전체 조문)" : "법령 (선택 조문)",
    preambleCount: preambles.length,
    actualArticleCount: actualArticles.length,
  })

  return (
    <div className="relative grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 h-[calc(100vh-12rem)]">
      {/* Mobile overlay backdrop */}
      {isArticleListExpanded && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsArticleListExpanded(false)}
        />
      )}

      {/* Left sidebar - Article navigation */}
      <Card className={`p-4 flex-col overflow-hidden ${
        isArticleListExpanded
          ? 'flex fixed lg:relative top-4 left-4 right-4 bottom-4 z-50 lg:z-auto'
          : 'hidden lg:flex'
      }`}>
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

        <div className="mb-4 flex-shrink-0">
          <h3 className="text-sm font-semibold text-foreground mb-2">조문 목록</h3>
          <Badge variant="secondary" className="text-xs">
            {actualArticles.length}개 조문
          </Badge>
        </div>
        <Separator className="mb-4 flex-shrink-0" />
        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <div className="space-y-1 pr-4">
            {actualArticles.map((article, index) => {
              const isLoading = loadingJo === article.jo
              const isLoaded = loadedArticles.some((a) => a.jo === article.jo)

              return (
                <button
                  key={`${article.jo}-${index}`}
                  onClick={() => handleArticleClick(article.jo)}
                  disabled={isLoading}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    activeJo === article.jo
                      ? "bg-primary text-primary-foreground font-medium"
                      : "hover:bg-secondary text-foreground"
                  } ${isLoading ? "opacity-50 cursor-wait" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex-1">
                      {formatSimpleJo(article.jo)}
                      {article.title && <span className="text-xs ml-1 block mt-0.5 opacity-80">({article.title})</span>}
                      {isLoading && <span className="text-xs ml-1 opacity-60">로딩중...</span>}
                    </span>
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
                      className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
                        favorites.has(article.jo)
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
      </Card>

      {/* Right panel - Article content */}
      <Card className="flex flex-col">
        {/* Mobile article list toggle */}
        <div className="lg:hidden p-3 border-b border-border bg-muted/30">
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
                조문 목록 보기 ({actualArticles.length}개)
              </>
            )}
          </Button>
        </div>

        {/* Header */}
        <div className="border-b border-border p-4">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <BookOpen className="h-5 w-5 text-primary" />
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-foreground">{meta.lawTitle}</h2>
                  {!isOrdinance && viewMode === "full" && (
                    <Badge variant="outline" className="text-xs">
                      전체 조문
                    </Badge>
                  )}
                </div>
              </div>

              {!isOrdinance && viewMode === "full" && activeArticle && (
                <p className="text-sm text-muted-foreground">
                  현재 선택: {formatSimpleJo(activeArticle.jo)}
                  {activeArticle.title && <span> ({activeArticle.title})</span>}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {meta.latestEffectiveDate && (
                <Badge variant="outline" className="text-xs">
                  시행: {meta.latestEffectiveDate}
                </Badge>
              )}
              {meta.revisionType && (
                <Badge variant="secondary" className="text-xs">
                  {meta.revisionType}
                </Badge>
              )}
            </div>
          </div>

          {!isOrdinance && activeArticle && (
            <div className="flex flex-wrap gap-2">
              <Button variant="default" size="sm" onClick={() => onCompare?.(activeArticle.jo)}>
                <GitCompare className="h-4 w-4 mr-2" />
                신·구법 비교
              </Button>
              <Button variant="outline" size="sm" onClick={() => onSummarize?.(activeArticle.jo)}>
                <Sparkles className="h-4 w-4 mr-2" />
                AI 요약
              </Button>
              <Button
                variant={favorites.has(activeArticle.jo) ? "default" : "outline"}
                size="sm"
                onClick={() => onToggleFavorite?.(activeArticle.jo)}
              >
                <Star className={`h-4 w-4 mr-2 ${favorites.has(activeArticle.jo) ? "fill-current" : ""}`} />
                즐겨찾기
              </Button>
              <Button variant="outline" size="sm" onClick={openLawCenter}>
                <ExternalLink className="h-4 w-4 mr-2" />
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
                  >
                    {threeTierDataType === "delegation" ? (
                      <FileText className="h-4 w-4 mr-2" />
                    ) : (
                      <Link2 className="h-4 w-4 mr-2" />
                    )}
                    시행령
                  </Button>
                  {threeTierDataType === "delegation" && hasValidSihyungkyuchik && (
                    <Button
                      variant={tierViewMode === "3-tier" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTierViewMode(tierViewMode === "3-tier" ? "1-tier" : "3-tier")}
                      title="시행규칙 보기"
                    >
                      <FileText className="h-4 w-4 mr-2" />
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
                  }
                }}
                disabled={loadingAdminRules}
                title="행정규칙 보기"
              >
                {loadingAdminRules ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current mr-2"></div>
                    {adminRulesProgress ? `${adminRulesProgress.current}/${adminRulesProgress.total}` : "로딩 중"}
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    행정규칙 {adminRules.length > 0 && `(${adminRules.length})`}
                  </>
                )}
              </Button>
            </div>
          )}

          {isOrdinance && (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={openLawCenter} className="mr-2 bg-transparent">
                <ExternalLink className="h-4 w-4 mr-2" />
                원문 보기
              </Button>
              <Button variant="ghost" size="sm" onClick={decreaseFontSize} title="글자 작게">
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={resetFontSize} title="기본 크기">
                <RotateCcw className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" onClick={increaseFontSize} title="글자 크게">
                <ZoomIn className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground ml-1">{fontSize}px</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full" ref={contentRef}>
            <div className="p-6">
              {isOrdinance ? (
                <div className="space-y-8">
                  {preambles.map((preamble, index) => (
                    <div
                      key={`preamble-${index}`}
                      className="mb-6"
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
                      <div className="mb-4 pb-3 border-b border-border">
                        <h3 className="text-lg font-bold text-foreground mb-1 flex items-center gap-2">
                          {formatSimpleJo(article.jo)}
                          {article.title && <span className="text-muted-foreground"> ({article.title})</span>}
                          {activeJo === article.jo && (
                            <BookmarkCheck className="h-5 w-5 text-primary ml-2" title="현재 선택된 조문" />
                          )}
                        </h3>
                      </div>

                      <div
                        className="whitespace-pre-wrap text-foreground leading-relaxed break-words"
                        style={{
                          fontSize: `${fontSize}px`,
                          lineHeight: "1.8",
                          overflowWrap: "break-word",
                          wordBreak: "break-word",
                        }}
                        onClick={handleContentClick}
                        dangerouslySetInnerHTML={{ __html: extractArticleText(article) }}
                      />
                      <Separator className="my-6" />
                    </div>
                  ))}
                </div>
              ) : viewMode === "full" ? (
                <div className="space-y-10">
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
                      <div className="mb-6 pb-4 border-b border-border">
                        <h3 className="text-lg font-bold text-foreground mb-2 flex items-center gap-2">
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
                        dangerouslySetInnerHTML={{ __html: extractArticleText(article) }}
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

                      {index < actualArticles.length - 1 && <Separator className="my-8" />}
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
                  // Admin rules detail view: 2-tier (law | admin rule content)
                  <div className="grid grid-cols-2 gap-4 overflow-hidden" style={{ height: 'calc(100vh - 250px)' }}>
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
                        dangerouslySetInnerHTML={{ __html: extractArticleText(activeArticle) }}
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

                // Priority 2: Admin rules list view (행정규칙 목록 뷰)
                ) : showAdminRules && adminRuleViewMode === "list" && (loadingAdminRules || adminRules.length > 0) ? (
                  // Admin rules list view: 2-tier (law | admin rules list)
                  <div className="grid grid-cols-2 gap-4 overflow-hidden" style={{ height: 'calc(100vh - 250px)' }}>
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
                        dangerouslySetInnerHTML={{ __html: extractArticleText(activeArticle) }}
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
                                onClick={() => handleViewAdminRuleFullContent(rule)}
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
                        dangerouslySetInnerHTML={{ __html: extractArticleText(activeArticle) }}
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
                        dangerouslySetInnerHTML={{ __html: extractArticleText(activeArticle) }}
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
                        dangerouslySetInnerHTML={{ __html: extractArticleText(activeArticle) }}
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
                        dangerouslySetInnerHTML={{ __html: extractArticleText(activeArticle) }}
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
                        dangerouslySetInnerHTML={{ __html: extractArticleText(activeArticle) }}
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
                      <h3 className="text-lg font-bold text-foreground mb-2">
                        {formatSimpleJo(activeArticle.jo)}
                        {activeArticle.title && <span className="text-muted-foreground"> ({activeArticle.title})</span>}
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
                      dangerouslySetInnerHTML={{ __html: extractArticleText(activeArticle) }}
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
      </Card>
      <ReferenceModal
        isOpen={refModal.open}
        onClose={() => setRefModal({ open: false })}
        title={refModal.title || "연결된 본문"}
        html={refModal.html}
        onContentClick={handleContentClick}
        forceWhiteTheme={refModal.forceWhiteTheme}
      />
    </div>
  )
}
