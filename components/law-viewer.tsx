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
} from "lucide-react"
import type { LawArticle, LawMeta } from "@/lib/law-types"
import { extractArticleText } from "@/lib/law-xml-parser"
import { buildJO, formatJO } from "@/lib/law-parser"
import { ReferenceModal } from "@/components/reference-modal"
import { RevisionHistory } from "@/components/revision-history"
import { parseArticleHistoryXML } from "@/lib/revision-parser"

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

  const handleArticleClick = async (jo: string) => {
    console.log("[v0] 조문 클릭:", { jo, isOrdinance, viewMode, isFullView })

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
          // 법령만 참조 - 체계도 조회
          await openLawHierarchyModal(lawName)
          setLastExternalRef({ lawName })
        }
      } else if (refType === "regulation") {
        const kind = target.getAttribute("data-kind") || "administrative"
        const clickedText = target.textContent || ""
        // "관세청장이 정하는" 등의 행정 규제는 안내 메시지 표시
        setRefModal({
          open: true,
          title: "행정 규제 참조",
          html: `<div class="space-y-3">
            <p><strong>"${clickedText}"</strong> 부분은 행정청이 정하는 고시, 훈령, 예규, 규정 등을 참조합니다.</p>
            <p class="text-sm text-muted-foreground">이러한 행정 규칙은 법령이 아니므로 법제처 국가법령정보센터에서 직접 확인하기 어려울 수 있습니다.</p>
            <div class="pt-3 border-t space-y-2">
              <p class="text-sm font-semibold">확인 방법:</p>
              <ul class="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                <li>해당 행정청(예: 관세청, 국세청 등)의 공식 홈페이지</li>
                <li><a href="https://www.law.go.kr/" target="_blank" rel="noopener" class="text-primary hover:underline">법제처 국가법령정보센터</a> - 고시/훈령/예규 검색</li>
                <li><a href="https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=0&ancYd=&ancNo=&efYd=&nwJoYnInfo=N&efGubun=Y&chrClsCd=&lsId=&lsiSeq=0&joNo=#searchId" target="_blank" rel="noopener" class="text-primary hover:underline">법령 검색 페이지</a></li>
              </ul>
            </div>
          </div>`,
        })
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
        await openRelatedLawModal(kind as "decree" | "rule")
      }
    }
  }

  // Helper: fetch external law article and show in modal
  async function openExternalLawArticleModal(lawName: string, articleLabel: string) {
    try {
      const qs = new URLSearchParams({ query: lawName })
      const searchRes = await fetch(`/api/law-search?${qs.toString()}`)
      const searchXml = await searchRes.text()
      const lawIdMatch = searchXml.match(/<법령ID>([^<]+)<\/법령ID>/)
      const mstMatch = searchXml.match(/<법령일련번호>([^<]+)<\/법령일련번호>/)
      const lawId = lawIdMatch?.[1]
      const mst = mstMatch?.[1]
      if (!lawId && !mst) {
        setRefModal({
          open: true,
          title: lawName,
          html: `<p>법령을 찾지 못했습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/법령/${encodeURIComponent(lawName)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 검색하기 →</a></p>`,
        })
        return
      }

      // Build JO code for the specific article
      let joCode = ""
      try {
        joCode = buildJO(articleLabel)
      } catch (err) {
        console.error("Failed to build JO code:", err)
      }

      // Fetch only the specific article using JO parameter (not the entire law!)
      const identifierParams = new URLSearchParams()
      if (lawId) {
        identifierParams.append("lawId", lawId)
      } else if (mst) {
        identifierParams.append("mst", mst)
      }

      // Add JO parameter to fetch only the specific article
      if (joCode) {
        identifierParams.append("jo", joCode)
        console.log("[citation] Fetching specific article:", { lawName, articleLabel, joCode })
      }

      try {
        const eflawRes = await fetch(`/api/eflaw?${identifierParams.toString()}`)

        if (!eflawRes.ok) {
          throw new Error(`HTTP ${eflawRes.status}`)
        }

        const eflawXml = await eflawRes.text()

        // Parse the response (should only contain the requested article)
        const { parseLawXML } = await import("@/lib/law-xml-parser")
        const parsed = parseLawXML(eflawXml)

        const found = parsed.articles.find((a) => a.jo === joCode || formatJO(a.jo) === formatJO(joCode))
        if (found) {
          setRefModal({
            open: true,
            title: `${lawName} ${formatJO(found.jo)}${found.title ? ` (${found.title})` : ""}`,
            html: extractArticleText(found),
          })
        } else {
          // Article not found - show link to law.go.kr
          setRefModal({
            open: true,
            title: `${lawName} ${articleLabel}`,
            html: `<p>해당 조문을 찾지 못했습니다.</p><p class="text-sm text-muted-foreground mt-2"><a href="https://www.law.go.kr/법령/${encodeURIComponent(lawName)}/${encodeURIComponent(articleLabel)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 보기 →</a></p>`,
          })
        }
      } catch (fetchErr: any) {
        console.error("Failed to fetch article:", fetchErr)
        setRefModal({
          open: true,
          title: `${lawName} ${articleLabel}`,
          html: `<div class="space-y-3"><p>조문을 불러오는 중 오류가 발생했습니다.</p><div class="pt-3 border-t"><a href="https://www.law.go.kr/법령/${encodeURIComponent(lawName)}/${encodeURIComponent(articleLabel)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 ${lawName} ${articleLabel} 보기 →</a></div></div>`,
        })
      }
    } catch (err) {
      console.error("openExternalLawArticleModal error", err)
      setRefModal({
        open: true,
        title: `${lawName} ${articleLabel}`,
        html: `<div class="space-y-3"><p>조문을 불러오는 중 오류가 발생했습니다.</p><div class="pt-3 border-t"><a href="https://www.law.go.kr/법령/${encodeURIComponent(lawName)}/${encodeURIComponent(articleLabel)}" target="_blank" rel="noopener" class="text-primary hover:underline">법제처에서 ${lawName} ${articleLabel} 보기 →</a></div></div>`,
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
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 h-[calc(100vh-12rem)]">
      {/* Left sidebar - Article navigation */}
      <Card className="p-4 flex flex-col">
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">조문 목록</h3>
              <Badge variant="secondary" className="text-xs">
                {actualArticles.length}개 조문
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsArticleListExpanded(!isArticleListExpanded)}
              className="md:hidden"
            >
              {isArticleListExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  접기
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  펼치기
                </>
              )}
            </Button>
          </div>
        </div>
        <Separator className="mb-4" />
        <ScrollArea className={`flex-1 ${isArticleListExpanded ? "" : "max-h-[100px] md:max-h-none"}`}>
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
      </Card>

      {/* Right panel - Article content */}
      <Card className="flex flex-col">
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
