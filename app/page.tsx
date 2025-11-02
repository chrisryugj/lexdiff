"use client"

import { useState, useEffect } from "react"
import { Header } from "@/components/header"
import { SearchBar } from "@/components/search-bar"
import { LawViewer } from "@/components/law-viewer"
import { ComparisonModal } from "@/components/comparison-modal"
import { AISummaryDialog } from "@/components/ai-summary-dialog"
import { FavoritesPanel } from "@/components/favorites-panel"
import { FavoritesDialog } from "@/components/favorites-dialog"
import { ErrorReportDialog } from "@/components/error-report-dialog" // 에러 리포트 다이얼로그 추가
import { debugLogger } from "@/lib/debug-logger"
import { parseOldNewXML } from "@/lib/oldnew-parser"
import { parseLawSearchXML } from "@/lib/law-search-parser"
import { parseOrdinanceSearchXML } from "@/lib/ordin-search-parser"
import { parseOrdinanceXML } from "@/lib/ordin-parser"
import { parseArticleHistory } from "@/lib/law-parser"
import { favoritesStore } from "@/lib/favorites-store"
import { useErrorReportStore } from "@/lib/error-report-store" // 에러 리포트 스토어 추가
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { LawMeta, LawArticle, Favorite, LawData } from "@/lib/law-types"
import { buildJO } from "@/lib/law-parser"

function convertArticleNumberToCode(
  articleNum: string | number,
  branchNum?: string | number,
): { code: string; display: string } {
  const mainNum = typeof articleNum === "string" ? Number.parseInt(articleNum) : articleNum
  const branch = branchNum ? (typeof branchNum === "string" ? Number.parseInt(branchNum) : branchNum) : 0

  if (isNaN(mainNum)) {
    return { code: "000000", display: "제0조" }
  }

  const code = mainNum.toString().padStart(4, "0") + branch.toString().padStart(2, "0")
  const display = branch > 0 ? "제" + mainNum + "조의" + branch : "제" + mainNum + "조"

  return { code, display }
}

function extractContentFromHangHo(hangHoData: any): string {
  let content = ""

  if (!hangHoData || typeof hangHoData !== "object") {
    return content
  }

  if (hangHoData.호 && Array.isArray(hangHoData.호)) {
    for (const ho of hangHoData.호) {
      if (ho.호번호 && ho.호내용) {
        content += "\n" + ho.호번호 + " " + ho.호내용
      } else if (ho.호내용) {
        content += "\n" + ho.호내용
      }

      if (ho.목 && Array.isArray(ho.목)) {
        for (const mok of ho.목) {
          if (mok.목번호 && mok.목내용) {
            content += "\n  " + mok.목번호 + " " + mok.목내용
          } else if (mok.목내용) {
            content += "\n  " + mok.목내용
          }
        }
      }
    }
  }

  return content
}

function removeArticleHeaderFromContent(content: string, display: string, title?: string): string {
  if (!content) return content

  const pattern1 = /^제\d+조(?:의\d+)?$$[^)]+$$\s*/
  content = content.replace(pattern1, "")

  const pattern2 = /^제\d+조(?:의\d+)?\s*$$[^)]+$$\s*/
  content = content.replace(pattern2, "")

  if (title) {
    const escapedDisplay = display.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const exactPattern = new RegExp("^" + escapedDisplay + "\\s*$$" + escapedTitle + "$$\\s*", "")
    content = content.replace(exactPattern, "")
  }

  return content.trim()
}

function parseLawJSON(jsonData: any): LawData {
  debugLogger.info("JSON 파싱 시작")

  try {
    const lawData = jsonData.법령

    if (!lawData) {
      throw new Error("법령 데이터가 없습니다")
    }

    const basicInfo = lawData.기본정보 || {}
    const meta = {
      lawId: basicInfo.법령ID || "unknown",
      lawTitle: basicInfo.법령명한글 || "제목 없음",
      latestEffectiveDate: basicInfo.최종시행일자 || "",
      promulgation: {
        date: basicInfo.공포일자 || "",
        number: basicInfo.공포번호 || "",
      },
      revisionType: basicInfo.제개정구분명 || "",
      fetchedAt: new Date().toISOString(),
    }

    const articles: LawArticle[] = []
    const articleUnits = lawData.조문?.조문단위 || []

    debugLogger.info("전체 조문 단위: " + articleUnits.length + "개")

    for (let i = 0; i < articleUnits.length; i++) {
      const unit = articleUnits[i]

      if (unit.조문여부 !== "조문") {
        continue
      }

      const articleNum = unit.조문번호
      const branchNum = unit.조문가지번호
      const title = unit.조문제목 || ""

      const result = convertArticleNumberToCode(articleNum, branchNum)
      const code = result.code
      const display = result.display

      let content = ""

      if (unit.조문내용 && typeof unit.조문내용 === "string") {
        content = unit.조문내용.trim()
      }

      if (unit.항) {
        const hangContent = extractContentFromHangHo(unit.항)
        if (hangContent) {
          content += (content ? "\n" : "") + hangContent
        }
      }

      content = removeArticleHeaderFromContent(content, display, title)

      articles.push({
        jo: code,
        joNum: display,
        title: title,
        content: content.trim(),
        isPreamble: false,
      })
    }

    debugLogger.success("JSON 파싱 완료: " + articles.length + "개 조문")

    return {
      meta: meta,
      articles: articles,
      articleCount: articles.length,
    }
  } catch (error) {
    debugLogger.error("JSON 파싱 오류", error)
    throw error
  }
}

interface LawSearchResult {
  lawId?: string
  mst?: string
  lawName: string
  lawType: string
  promulgationDate?: string
  effectiveDate?: string
}

interface OrdinanceSearchResult {
  ordinSeq: string
  ordinName: string
  ordinId: string
  promulgationDate?: string
  effectiveDate?: string
  orgName?: string
  ordinKind?: string
}

export default function Home() {
  const [isSearching, setIsSearching] = useState(false)
  const [lawData, setLawData] = useState<{
    meta: LawMeta
    articles: LawArticle[]
    selectedJo?: string
    isOrdinance?: boolean
    viewMode?: "single" | "full"
  } | null>(null)
  const [lawSelectionState, setLawSelectionState] = useState<{
    results: LawSearchResult[]
    query: { lawName: string; article?: string; jo?: string }
  } | null>(null)
  const [ordinanceSelectionState, setOrdinanceSelectionState] = useState<{
    results: OrdinanceSearchResult[]
    query: { lawName: string }
  } | null>(null)
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [comparisonModal, setComparisonModal] = useState<{
    isOpen: boolean
    jo?: string
  }>({ isOpen: false })
  const [summaryDialog, setSummaryDialog] = useState<{
    isOpen: boolean
    jo?: string
    oldContent?: string
    newContent?: string
    effectiveDate?: string
  }>({ isOpen: false })

  const [mobileView, setMobileView] = useState<"list" | "content">("content")
  const [searchResults, setSearchResults] = useState<{
    laws: LawSearchResult[]
    ordinances: OrdinanceSearchResult[]
    jo?: string
  }>({ laws: [], ordinances: [] })

  const [favoritesDialogOpen, setFavoritesDialogOpen] = useState(false) // 즐겨찾기 모달 상태 추가

  const { toast } = useToast()
  const { reportError } = useErrorReportStore() // 에러 리포트 함수 가져오기

  useEffect(() => {
    const unsubscribe = favoritesStore.subscribe((favs) => {
      const joSet = new Set(favs.map((f) => f.jo))
      setFavorites(joSet)
    })

    const initialFavs = favoritesStore.getFavorites()
    const joSet = new Set(initialFavs.map((f) => f.jo))
    setFavorites(joSet)

    return unsubscribe
  }, [])

  const fetchLawContent = async (
    selectedLaw: LawSearchResult,
    query: { lawName: string; article?: string; jo?: string },
  ) => {
    console.log("[v0] ========== FETCHING LAW CONTENT ==========")
    console.log("[v0] Selected law:", selectedLaw)
    console.log("[v0] Query:", query)
    debugLogger.info("법령 ID 확인", { lawId: selectedLaw.lawId, lawName: selectedLaw.lawName })

    const apiLogs: Array<{ url: string; method: string; status?: number; response?: string }> = []

    try {
      const params = new URLSearchParams()

      if (selectedLaw.lawId) {
        params.append("lawId", selectedLaw.lawId)
      } else if (selectedLaw.mst) {
        params.append("mst", selectedLaw.mst)
      } else {
        throw new Error("선택한 법령에 대한 식별자를 찾을 수 없습니다")
      }

      if (query.jo) {
        params.append("jo", query.jo)
        console.log("[v0] ✓ Adding JO parameter to fetch specific article:", query.jo)
      } else {
        console.log("[v0] ✓ No JO parameter - fetching all articles")
      }

      const apiUrl = `/api/eflaw?${params.toString()}`
      console.log("[v0] Final API params:", params.toString())

      const response = await fetch(apiUrl)

      apiLogs.push({
        url: apiUrl,
        method: "GET",
        status: response.status,
      })

      if (!response.ok) {
        const errorText = await response.text()
        apiLogs[apiLogs.length - 1].response = errorText
        console.log("[v0] Eflaw error response:", errorText)
        throw new Error("법령 조회 실패")
      }

      const jsonText = await response.text()
      apiLogs[apiLogs.length - 1].response = jsonText.substring(0, 500) + "..."
      console.log("[v0] Eflaw JSON received, length:", jsonText.length)

      const jsonData = JSON.parse(jsonText)
      const { meta, articles } = parseLawJSON(jsonData)
      console.log("[v0] Parsed law data:", { meta, articleCount: articles.length })

      if (query.jo && (selectedLaw.lawId || selectedLaw.mst)) {
        console.log("[v0] [개정이력] 조문별 개정이력 조회 시작:", {
          lawId: selectedLaw.lawId,
          mst: selectedLaw.mst,
          jo: query.jo,
        })
        try {
          const historyParams = new URLSearchParams({ jo: query.jo })
          if (selectedLaw.lawId) {
            historyParams.append("lawId", selectedLaw.lawId)
          } else if (selectedLaw.mst) {
            historyParams.append("mst", selectedLaw.mst)
          }
          const historyUrl = `/api/article-history?${historyParams.toString()}`
          const historyResponse = await fetch(historyUrl)

          apiLogs.push({
            url: historyUrl,
            method: "GET",
            status: historyResponse.status,
          })

          if (historyResponse.ok) {
            const historyXml = await historyResponse.text()
            apiLogs[apiLogs.length - 1].response = historyXml.substring(0, 500) + "..."

            const revisionHistory = parseArticleHistory(historyXml)
            const targetArticle = articles.find((a) => a.jo === query.jo)

            if (targetArticle && revisionHistory.length > 0) {
              targetArticle.revisionHistory = revisionHistory
              console.log("[v0] [개정이력] ✓ 조문에 개정이력 병합 완료")
            }
          } else {
            const errorText = await historyResponse.text()
            apiLogs[apiLogs.length - 1].response = errorText
          }
        } catch (error) {
          console.log("[v0] [개정이력] 조회 중 오류:", error)
        }
      }

      let selectedJo: string | undefined
      const viewMode: "single" | "full" = query.jo ? "single" : "full"

      if (query.jo) {
        const targetArticle = articles.find((a) => a.jo === query.jo)
        if (targetArticle) {
          selectedJo = targetArticle.jo
        }
      } else if (articles.length > 0) {
        selectedJo = articles[0].jo
      }

      setLawData({
        meta,
        articles,
        selectedJo,
        viewMode,
      })

      debugLogger.success("검색 완료", { lawTitle: meta.lawTitle, articleCount: articles.length })
    } catch (error) {
      reportError(
        "법령 조회",
        error instanceof Error ? error : new Error(String(error)),
        {
          selectedLaw,
          query,
        },
        apiLogs,
      )
      throw error
    }
  }

  const handleSearch = async (query: { lawName: string; article?: string; jo?: string }) => {
    console.log("[v0] ========== 검색 시작 ==========")

    setIsSearching(true)
    setLawData(null)
    setLawSelectionState(null)
    setOrdinanceSelectionState(null)
    setSearchResults({ laws: [], ordinances: [] })

    const apiLogs: Array<{ url: string; method: string; status?: number; response?: string }> = []

    const isOrdinanceQuery = /조례|규칙|특별시|광역시|도|시|군|구/.test(query.lawName)
    const lawName = query.lawName
    const articleNumber = query.article
    const jo = query.jo

    debugLogger.info(isOrdinanceQuery ? "조례 검색 시작" : "법령 검색 시작", { lawName, articleNumber, jo })

    try {
      if (isOrdinanceQuery) {
        const apiUrl = `/api/ordin-search?query=${encodeURIComponent(lawName)}`
        const response = await fetch(apiUrl)

        apiLogs.push({
          url: apiUrl,
          method: "GET",
          status: response.status,
        })

        if (!response.ok) {
          const errorText = await response.text()
          apiLogs[apiLogs.length - 1].response = errorText
          throw new Error("조례 검색 실패")
        }

        const xmlText = await response.text()
        apiLogs[apiLogs.length - 1].response = xmlText.substring(0, 500) + "..."
        const results = parseOrdinanceSearchXML(xmlText)

        if (results.length === 0) {
          reportError(
            "조례 검색",
            new Error("검색 결과를 찾을 수 없습니다"),
            {
              query: query.lawName,
              searchType: "조례",
              resultCount: 0,
            },
            apiLogs,
          )
          setIsSearching(false)
          return
        }

        setOrdinanceSelectionState({
          results,
          query: { lawName },
        })
        setMobileView("list")
      } else {
        const apiUrl = `/api/law-search?query=${encodeURIComponent(lawName)}`
        const response = await fetch(apiUrl)

        apiLogs.push({
          url: apiUrl,
          method: "GET",
          status: response.status,
        })

        if (!response.ok) {
          const errorText = await response.text()
          apiLogs[apiLogs.length - 1].response = errorText
          throw new Error("법령 검색 실패")
        }

        const xmlText = await response.text()
        apiLogs[apiLogs.length - 1].response = xmlText.substring(0, 500) + "..."
        const results = parseLawSearchXML(xmlText)

        if (results.length === 0) {
          reportError(
            "법령 검색",
            new Error("검색 결과를 찾을 수 없습니다"),
            {
              query: query.lawName,
              searchType: "법령",
              resultCount: 0,
            },
            apiLogs,
          )
          setIsSearching(false)
          return
        }

        const normalizedLawName = lawName.replace(/\s+/g, "")
        let exactMatch = results.find((r) => r.lawName.replace(/\s+/g, "") === normalizedLawName)

        if (!exactMatch) {
          exactMatch = results.find(
            (r) =>
              r.lawName.replace(/\s+/g, "").startsWith(normalizedLawName) &&
              !r.lawName.includes("시행령") &&
              !r.lawName.includes("시행규칙"),
          )
        }

        if (exactMatch && !jo) {
          try {
            await fetchLawContent(exactMatch, { lawName, article: articleNumber, jo: undefined })
            setMobileView("content")
            return
          } catch (error) {
            console.error("[v0] 법령 조회 오류:", error)
            toast({
              title: "법령 조회 실패",
              description: error instanceof Error ? error.message : "법령 조회 중 오류가 발생했습니다.",
              variant: "destructive",
            })
          }
        }

        if (exactMatch && jo) {
          try {
            await fetchLawContent(exactMatch, { lawName, article: articleNumber, jo })
            setMobileView("content")
          } catch (error) {
            console.error("[v0] 법령 조회 오류:", error)
            toast({
              title: "법령 조회 실패",
              description: error instanceof Error ? error.message : "법령 조회 중 오류가 발생했습니다.",
              variant: "destructive",
            })
          } finally {
            setIsSearching(false)
          }
          return
        }

        setLawSelectionState({
          results,
          query: { lawName, article: articleNumber, jo },
        })
        setMobileView("list")
      }
    } catch (error) {
      console.error("[v0] 검색 오류:", error)

      reportError(
        isOrdinanceQuery ? "조례 검색" : "법령 검색",
        error instanceof Error ? error : new Error(String(error)),
        {
          query,
          isOrdinanceQuery,
        },
        apiLogs,
      )

      toast({
        title: "검색 실패",
        description: error instanceof Error ? error.message : "검색 중 오류가 발생했습니다.",
        variant: "destructive",
      })
      setLawData(null)
    } finally {
      setIsSearching(false)
    }
  }

  const handleLawSelect = async (law: LawSearchResult) => {
    if (!lawSelectionState) return

    setIsSearching(true)
    try {
      await fetchLawContent(law, {
        lawName: lawSelectionState.query.lawName,
        article: lawSelectionState.query.article,
        jo: undefined, // 전체 조문 보기
      })
      setLawSelectionState(null)
      setMobileView("content")
    } catch (error) {
      console.log("[v0] Law fetch error:", error)
      debugLogger.error("법령 조회 실패", error)

      toast({
        title: "법령 조회 실패",
        description: error instanceof Error ? error.message : "법령 조회 중 오류가 발생했습니다.",
        variant: "destructive",
      })
    } finally {
      setIsSearching(false)
    }
  }

  const handleOrdinanceSelect = async (ordinance: OrdinanceSearchResult) => {
    if (!ordinanceSelectionState) return

    debugLogger.info("자치법규 선택", { ordinSeq: ordinance.ordinSeq, ordinName: ordinance.ordinName })

    setIsSearching(true)

    const apiLogs: Array<{ url: string; method: string; status?: number; response?: string }> = []

    try {
      const params = new URLSearchParams()
      if (ordinance.ordinId) {
        params.append("ordinId", ordinance.ordinId)
      } else {
        params.append("ordinSeq", ordinance.ordinSeq)
      }

      const apiUrl = `/api/ordin?${params.toString()}`
      const response = await fetch(apiUrl)

      apiLogs.push({
        url: apiUrl,
        method: "GET",
        status: response.status,
      })

      if (!response.ok) {
        const errorText = await response.text()
        apiLogs[apiLogs.length - 1].response = errorText
        toast({
          title: "자치법규 조회 실패",
          description: "자치법규 본문을 불러올 수 없습니다.",
          variant: "destructive",
        })
        throw new Error("자치법규 조회 실패")
      }

      const xmlText = await response.text()
      apiLogs[apiLogs.length - 1].response = xmlText.substring(0, 500) + "..."

      const { meta, articles } = parseOrdinanceXML(xmlText)

      if (articles.length === 0) {
        toast({
          title: "조문 없음",
          description: "이 자치법규의 조문을 찾을 수 없습니다.",
          variant: "destructive",
        })
      }

      setLawData({
        meta,
        articles,
        selectedJo: undefined,
        isOrdinance: true,
        viewMode: "full",
      })

      setOrdinanceSelectionState(null)
      setMobileView("content")
      debugLogger.success("자치법규 조회 완료", { ordinName: meta.lawTitle, articleCount: articles.length })
    } catch (error) {
      console.log("[v0] Ordinance fetch error:", error)
      debugLogger.error("자치법규 조회 실패", error)

      reportError(
        "자치법규 조회",
        error instanceof Error ? error : new Error(String(error)),
        {
          ordinance,
        },
        apiLogs,
      )

      toast({
        title: "자치법규 조회 실패",
        description: error instanceof Error ? error.message : "자치법규 조회 중 오류가 발생했습니다.",
        variant: "destructive",
      })
    } finally {
      setIsSearching(false)
    }
  }

  const handleRecentSelect = (search: any) => {
    debugLogger.info("최근 검색 선택", search)

    let jo: string | undefined
    if (search.article) {
      try {
        jo = buildJO(search.article)
      } catch (error) {
        console.error("[v0] Failed to convert article to jo:", error)
      }
    }

    handleSearch({
      lawName: search.lawName,
      article: search.article,
      jo,
    })
  }

  const handleFavoriteSelect = (favorite: Favorite) => {
    debugLogger.info("즐겨찾기 선택", favorite)
    handleSearch({
      lawName: favorite.lawTitle,
      jo: favorite.jo,
    })
  }

  const handleCompare = (jo: string) => {
    debugLogger.info("신·구법 비교 요청", { jo })
    setComparisonModal({ isOpen: true, jo })
  }

  const handleSummarize = async (jo: string) => {
    if (!lawData) return

    debugLogger.info("AI 요약 요청", { jo })

    try {
      const params = new URLSearchParams()
      if (lawData.meta.lawId) {
        params.append("lawId", lawData.meta.lawId)
      } else if (lawData.meta.mst) {
        params.append("mst", lawData.meta.mst)
      }

      const response = await fetch(`/api/oldnew?${params.toString()}`)
      if (!response.ok) {
        throw new Error("신·구법 데이터 조회 실패")
      }

      const xmlText = await response.text()
      const comparison = parseOldNewXML(xmlText, jo)

      const article = lawData.articles.find((a) => a.jo === jo)
      const joNum = article ? article.joNum : jo

      setSummaryDialog({
        isOpen: true,
        jo: joNum,
        oldContent: comparison.oldVersion.content,
        newContent: comparison.newVersion.content,
        effectiveDate: lawData.meta.latestEffectiveDate,
      })
    } catch (error) {
      debugLogger.error("AI 요약 준비 실패", error)
    }
  }

  const handleToggleFavorite = (jo: string) => {
    if (!lawData) return

    const article = lawData.articles.find((a) => a.jo === jo)
    if (!article) return

    try {
      if (favorites.has(jo)) {
        const existingFavs = favoritesStore.getFavorites()
        const toRemove = existingFavs.find((f) => f.lawTitle === lawData.meta.lawTitle && f.jo === jo)
        if (toRemove) {
          favoritesStore.removeFavorite(toRemove.id)
        }
      } else {
        favoritesStore.addFavorite({
          lawId: lawData.meta.lawId,
          mst: lawData.meta.mst,
          lawTitle: lawData.meta.lawTitle,
          jo,
          effectiveDate: lawData.meta.latestEffectiveDate,
          lastSeenSignature: `${lawData.meta.latestEffectiveDate || ""}-${lawData.meta.revisionType || ""}`,
        })
      }
    } catch (error) {
      reportError("즐겨찾기 토글", error instanceof Error ? error : new Error(String(error)), {
        lawTitle: lawData.meta.lawTitle,
        jo,
        action: favorites.has(jo) ? "제거" : "추가",
      })

      toast({
        title: "즐겨찾기 실패",
        description: "즐겨찾기 처리 중 오류가 발생했습니다.",
        variant: "destructive",
      })
    }
  }

  const handleReset = () => {
    console.log("[v0] 홈으로 이동 - 모든 상태 초기화")
    setLawData(null)
    setLawSelectionState(null)
    setOrdinanceSelectionState(null)
    setSearchResults({ laws: [], ordinances: [] })
    setMobileView("content")
  }

  const handleFavoritesClick = () => {
    console.log("[v0] 즐겨찾기 버튼 클릭")
    setFavoritesDialogOpen(true) // handleFavoritesClick에서 모달 열기로 변경
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header onReset={handleReset} onFavoritesClick={handleFavoritesClick} />
      <main className="flex-1">
        <div className="container mx-auto p-6">
          {lawSelectionState ? (
            <div className="flex flex-col items-center justify-center py-4 md:py-12 gap-4 md:gap-8">
              <div className="w-full max-w-3xl space-y-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl md:text-2xl font-bold">
                    법령 검색 결과 ({lawSelectionState.results.length}건)
                  </h2>
                  <Button variant="ghost" size="sm" onClick={() => setLawSelectionState(null)}>
                    취소
                  </Button>
                </div>

                {lawSelectionState.results.map((law) => (
                  <button
                    key={law.lawId || law.mst}
                    onClick={() => handleLawSelect(law)}
                    className="w-full p-3 md:p-4 border border-border rounded-lg hover:bg-secondary transition-colors text-left"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-base md:text-lg">{String(law.lawName)}</h4>
                          <Badge variant="secondary">{String(law.lawType)}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs md:text-sm text-muted-foreground">
                          {law.promulgationDate && <span>공포: {String(law.promulgationDate)}</span>}
                          {law.effectiveDate && <span>시행: {String(law.effectiveDate)}</span>}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : ordinanceSelectionState ? (
            <div className="flex flex-col items-center justify-center py-4 md:py-12 gap-4 md:gap-8">
              <div className="w-full max-w-3xl space-y-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl md:text-2xl font-bold">
                    조례 검색 결과 ({ordinanceSelectionState.results.length}건)
                  </h2>
                  <Button variant="ghost" size="sm" onClick={() => setOrdinanceSelectionState(null)}>
                    취소
                  </Button>
                </div>

                {ordinanceSelectionState.results.map((ordinance) => (
                  <button
                    key={ordinance.ordinSeq}
                    onClick={() => handleOrdinanceSelect(ordinance)}
                    className="w-full p-3 md:p-4 border border-border rounded-lg hover:bg-secondary transition-colors text-left"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="font-semibold text-base md:text-lg mb-1">{String(ordinance.ordinName)}</h4>
                        <div className="flex flex-wrap gap-2 text-xs md:text-sm text-muted-foreground">
                          {ordinance.orgName && <span>{String(ordinance.orgName)}</span>}
                          {ordinance.ordinKind && (
                            <Badge variant="secondary" className="text-xs">
                              {String(ordinance.ordinKind)}
                            </Badge>
                          )}
                          {ordinance.effectiveDate && <span>시행: {String(ordinance.effectiveDate)}</span>}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : !lawData ? (
            <div className="flex flex-col items-center justify-center py-12 gap-8">
              <div className="w-full max-w-3xl text-center">
                <h2
                  className="text-5xl font-bold text-foreground mb-4"
                  style={{ fontFamily: "GiantsInline, sans-serif" }}
                >
                  LexDiff
                </h2>
                <p className="text-lg text-muted-foreground mb-2">See the Difference in Law.</p>
                <p className="text-muted-foreground max-w-2xl mb-8 mx-auto">
                  법령 검색부터 신·구법 대조, AI 요약까지
                  <br />한 화면에서 제공하는 전문가용 법령 분석 도구
                </p>
              </div>

              <SearchBar onSearch={handleSearch} isLoading={isSearching} />

              <div className="w-full max-w-3xl space-y-4">
                <FavoritesPanel onSelect={handleFavoriteSelect} />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="md:hidden">
                {mobileView === "content" && (
                  <Button variant="outline" size="sm" onClick={() => setMobileView("list")} className="mb-4 w-full">
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    다른 법령 검색
                  </Button>
                )}

                {mobileView === "list" ? (
                  <div className="space-y-4">
                    <SearchBar onSearch={handleSearch} isLoading={isSearching} />
                    <Button variant="outline" size="sm" onClick={() => setMobileView("content")} className="w-full">
                      현재 법령으로 돌아가기
                    </Button>
                  </div>
                ) : (
                  <LawViewer
                    meta={lawData.meta}
                    articles={lawData.articles}
                    selectedJo={lawData.selectedJo}
                    viewMode={lawData.viewMode}
                    onCompare={handleCompare}
                    onSummarize={handleSummarize}
                    onToggleFavorite={handleToggleFavorite}
                    favorites={favorites}
                    isOrdinance={lawData.isOrdinance}
                  />
                )}
              </div>

              <div className="hidden md:block space-y-4">
                <SearchBar onSearch={handleSearch} isLoading={isSearching} />
                <LawViewer
                  meta={lawData.meta}
                  articles={lawData.articles}
                  selectedJo={lawData.selectedJo}
                  viewMode={lawData.viewMode}
                  onCompare={handleCompare}
                  onSummarize={handleSummarize}
                  onToggleFavorite={handleToggleFavorite}
                  favorites={favorites}
                  isOrdinance={lawData.isOrdinance}
                />
              </div>
            </div>
          )}
        </div>
      </main>
      {lawData && (
        <>
          <ComparisonModal
            isOpen={comparisonModal.isOpen}
            onClose={() => setComparisonModal({ isOpen: false })}
            lawTitle={lawData.meta.lawTitle}
            lawId={lawData.meta.lawId}
            mst={lawData.meta.mst}
            targetJo={comparisonModal.jo}
          />

          {summaryDialog.isOpen && summaryDialog.oldContent && summaryDialog.newContent && (
            <AISummaryDialog
              isOpen={summaryDialog.isOpen}
              onClose={() => setSummaryDialog({ isOpen: false })}
              lawTitle={lawData.meta.lawTitle}
              joNum={summaryDialog.jo || ""}
              oldContent={summaryDialog.oldContent}
              newContent={summaryDialog.newContent}
              effectiveDate={summaryDialog.effectiveDate}
            />
          )}
        </>
      )}
      <FavoritesDialog
        isOpen={favoritesDialogOpen}
        onClose={() => setFavoritesDialogOpen(false)}
        onSelect={handleFavoriteSelect}
      />{" "}
      {/* 즐겨찾기 모달 추가 */}
      <ErrorReportDialog /> {/* 에러 리포트 다이얼로그 추가 */}
      {!lawData && !lawSelectionState && !ordinanceSelectionState && (
        <footer className="border-t border-border py-6">
          <div className="container mx-auto px-6">
            <p className="text-center text-sm text-muted-foreground">© 2025 Chris ryu. All rights reserved.</p>
          </div>
        </footer>
      )}
    </div>
  )
}
