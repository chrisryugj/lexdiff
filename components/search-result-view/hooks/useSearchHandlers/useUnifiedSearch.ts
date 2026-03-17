/**
 * useSearchHandlers/useUnifiedSearch.ts
 *
 * Unified search handlers for precedent, interpretation, and ruling flows.
 */

import { useCallback } from "react"
import { debugLogger } from "@/lib/debug-logger"
import { parseOrdinanceSearchXML } from "@/lib/ordin-search-parser"
import { formatPrecedentDate, type PrecedentDetail, type PrecedentSearchResult } from "@/lib/precedent-parser"
import type { SearchResultCache } from "@/lib/search-result-store"
import type { InterpretationSearchResult, LawDataState, RulingSearchResult } from "../../types"
import type { HandlerDeps, SearchQuery } from "./types"

interface UseUnifiedSearchDeps extends HandlerDeps {
  handleSearch: (query: SearchQuery) => void
  handleSearchInternal: (
    query: SearchQuery,
    signal?: AbortSignal,
    forcedMode?: "law" | "ai",
    skipCache?: boolean
  ) => Promise<void>
}

interface PrecedentSearchResponse {
  precedents: PrecedentSearchResult[]
  totalCount?: number
  yearFilter?: string
  courtFilter?: string
}

interface InterpretationSearchResponse {
  interpretations: InterpretationSearchResult[]
}

interface RulingSearchResponse {
  rulings: RulingSearchResult[]
}

function cleanPrecedentHtml(text: string): string {
  if (!text) return ""

  return text
    .replace(/<br\\>/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

async function buildPrecedentLawData(precedentId: string, precedent: PrecedentDetail): Promise<LawDataState> {
  const { generateLinks } = await import("@/lib/unified-link-generator")

  const toSection = (jo: string, title: string, content: string) => ({
    jo,
    joNum: title,
    title,
    content: generateLinks(cleanPrecedentHtml(content), {
      mode: "aggressive",
      enableSameRef: true,
      enableAdminRules: false,
      enablePrecedents: true,
    }),
  })

  const articles = [
    precedent.holdings ? toSection("000001", "판시사항", precedent.holdings) : null,
    precedent.summary ? toSection("000002", "판결요지", precedent.summary) : null,
    precedent.refStatutes ? toSection("000003", "참조조문", precedent.refStatutes) : null,
    precedent.refPrecedents ? toSection("000004", "참조판례", precedent.refPrecedents) : null,
    precedent.fullText ? toSection("000005", "판결문", precedent.fullText) : null,
  ].filter(Boolean) as LawDataState["articles"]

  return {
    meta: {
      lawId: `prec-${precedentId}`,
      lawTitle: precedent.name,
      promulgationDate: formatPrecedentDate(precedent.date),
      lawType: `${precedent.court} ${precedent.judgmentType}`.trim(),
      isOrdinance: false,
      fetchedAt: new Date().toISOString(),
      caseNumber: precedent.caseNumber,
    },
    articles,
    selectedJo: undefined,
    viewMode: "full",
    isPrecedent: true,
  }
}

export function useUnifiedSearch(deps: UseUnifiedSearchDeps) {
  const { state, actions, toast, searchId, onPrecedentSelect, handleSearchInternal } = deps

  const clearSecondaryResults = useCallback(() => {
    actions.setLawSelectionState(null)
    actions.setOrdinanceSelectionState(null)
    actions.setSearchResults({ laws: [], ordinances: [] })
    actions.setLawData(null)
    actions.setArticleNotFound(null)
    actions.setRelatedSearches([])
    actions.setPrecedentResults(null)
    actions.setPrecedentTotalCount(0)
    actions.setPrecedentPage(1)
    actions.setPrecedentYearFilter(undefined)
    actions.setPrecedentCourtFilter(undefined)
    actions.setInterpretationResults(null)
    actions.setRulingResults(null)
    actions.setOrdinancePage(1)
    actions.setOrdinanceTotalCount(0)
  }, [actions])

  const persistSearchCache = useCallback(
    async (updates: Partial<SearchResultCache>) => {
      if (!searchId) return

      const { getSearchResult, saveSearchResult } = await import("@/lib/search-result-store")
      const existingCache = await getSearchResult(searchId)
      const baseCache: SearchResultCache = existingCache ?? {
        searchId,
        query: { lawName: "" },
        timestamp: Date.now(),
        expiresAt: Date.now(),
      }

      await saveSearchResult({
        ...baseCache,
        ...updates,
        searchId,
      })
    },
    [searchId]
  )

  const handlePrecedentSearch = useCallback(
    async (query: SearchQuery) => {
      debugLogger.info("[unified-search] precedent search", { query })

      try {
        const classification = (query as SearchQuery & { classification?: any }).classification
        const caseNumber = classification?.entities?.caseNumber
        const court = classification?.entities?.court
        const searchQuery = caseNumber || query.lawName || query.article || ""

        if (!searchQuery) {
          toast({
            title: "검색어 오류",
            description: "판례 검색어를 입력해 주세요.",
            variant: "destructive",
          })
          return false
        }

        actions.setIsAiMode(false)
        actions.setSearchMode("basic")
        clearSecondaryResults()
        actions.setSearchQuery(searchQuery)
        actions.setUserQuery(searchQuery)
        actions.setIsSearching(true)
        actions.setMobileView("list")

        const params = new URLSearchParams({
          query: searchQuery,
          display: String(state.precedentPageSize),
        })
        if (court) params.append("court", court)
        if (caseNumber) params.append("caseNumber", caseNumber)

        const response = await fetch(`/api/precedent-search?${params.toString()}`)
        if (!response.ok) {
          throw new Error(`판례 검색 실패: ${response.status}`)
        }

        const data = (await response.json()) as PrecedentSearchResponse

        actions.setPrecedentResults(data.precedents ?? [])
        actions.setPrecedentTotalCount(data.totalCount ?? data.precedents?.length ?? 0)
        actions.setPrecedentPage(1)
        actions.setPrecedentYearFilter(data.yearFilter)
        actions.setPrecedentCourtFilter(data.courtFilter)

        if ((data.precedents?.length ?? 0) === 0) {
          toast({
            title: "검색 결과 없음",
            description: "판례를 찾을 수 없습니다.",
            variant: "default",
          })
          return false
        }

        await persistSearchCache({
          query: { lawName: searchQuery },
          lawData: undefined,
          aiMode: undefined,
          interpretationResults: undefined,
          rulingResults: undefined,
          precedentResults: data.precedents.map((item) => ({
            id: item.id,
            name: item.name,
            caseNumber: item.caseNumber,
            court: item.court,
            date: item.date,
            judgmentType: item.type,
          })),
          precedentDetail: undefined,
        })

        toast({
          title: "판례 검색 완료",
          description: `${data.precedents.length}건의 판례를 찾았습니다.`,
          variant: "default",
        })
        return true
      } catch (error) {
        debugLogger.error("[unified-search] precedent search failed", error)
        toast({
          title: "판례 검색 실패",
          description: error instanceof Error ? error.message : "알 수 없는 오류",
          variant: "destructive",
        })
        return false
      } finally {
        actions.setIsSearching(false)
      }
    },
    [actions, clearSecondaryResults, persistSearchCache, state.precedentPageSize, toast]
  )

  const handlePrecedentSelect = useCallback(
    async (precedentId: string) => {
      debugLogger.info("[unified-search] precedent detail", { precedentId })

      try {
        actions.setIsSearching(true)
        actions.updateProgress("parsing", 50)

        const response = await fetch(`/api/precedent-detail?id=${encodeURIComponent(precedentId)}`)
        if (!response.ok) {
          throw new Error(`판례 조회 실패: ${response.status}`)
        }

        const precedent = (await response.json()) as PrecedentDetail
        const lawData = await buildPrecedentLawData(precedentId, precedent)

        actions.setLawData(lawData)
        actions.setPrecedentResults(null)
        actions.setInterpretationResults(null)
        actions.setRulingResults(null)
        actions.setMobileView("content")
        actions.updateProgress("complete", 100)

        if (searchId) {
          const [{ pushPrecedentHistory }, { getSearchResult, saveSearchResult }] = await Promise.all([
            import("@/lib/history-manager"),
            import("@/lib/search-result-store"),
          ])

          pushPrecedentHistory(searchId, precedentId, state.searchMode)

          const cached = await getSearchResult(searchId)
          if (cached) {
            await saveSearchResult({
              ...cached,
              precedentDetail: {
                id: precedentId,
                lawData,
              },
            })
          }
        }

        const { addRecentPrecedent } = await import("@/lib/recent-precedent-store")
        await addRecentPrecedent({
          id: precedentId,
          caseNumber: precedent.caseNumber || "",
          caseName: precedent.name || "",
          court: precedent.court || "",
          date: precedent.date || "",
        })

        onPrecedentSelect?.(precedentId)
      } catch (error) {
        debugLogger.error("[unified-search] precedent detail failed", error)
        toast({
          title: "판례 조회 실패",
          description: error instanceof Error ? error.message : "알 수 없는 오류",
          variant: "destructive",
        })
      } finally {
        actions.setIsSearching(false)
      }
    },
    [actions, onPrecedentSelect, searchId, state.searchMode, toast]
  )

  const handleRefresh = useCallback(() => {
    if (!state.lawData) {
      toast({
        title: "새로고침 실패",
        description: "현재 표시 중인 데이터가 없습니다.",
        variant: "destructive",
      })
      return
    }

    if (state.lawData.isPrecedent && state.lawData.meta.lawId?.startsWith("prec-")) {
      void handlePrecedentSelect(state.lawData.meta.lawId.replace("prec-", ""))
      return
    }

    // 현재 selectedJo를 유지하여 새로고침 후에도 조문 위치 보존
    void handleSearchInternal(
      {
        lawName: state.lawData.meta.lawTitle,
        jo: state.lawData.selectedJo || undefined,
      },
      undefined,
      "law",
      true
    )
  }, [handlePrecedentSelect, handleSearchInternal, state.lawData, toast])

  const handleInterpretationSearch = useCallback(
    async (query: SearchQuery) => {
      debugLogger.info("[unified-search] interpretation search", { query })

      try {
        const classification = (query as SearchQuery & { classification?: any }).classification
        const ruleType = classification?.entities?.ruleType
        const lawName = classification?.entities?.lawName || query.lawName
        const searchQuery = lawName || query.article || ""

        if (!searchQuery) {
          toast({
            title: "검색어 오류",
            description: "해석례 검색어를 입력해 주세요.",
            variant: "destructive",
          })
          return false
        }

        actions.setIsAiMode(false)
        actions.setSearchMode("basic")
        clearSecondaryResults()
        actions.setSearchQuery(searchQuery)
        actions.setUserQuery(searchQuery)
        actions.setIsSearching(true)
        actions.setMobileView("list")

        const params = new URLSearchParams({ query: searchQuery })
        if (ruleType) params.append("ruleType", ruleType)

        const response = await fetch(`/api/interpretation-search?${params.toString()}`)
        if (!response.ok) {
          throw new Error(`해석례 검색 실패: ${response.status}`)
        }

        const data = (await response.json()) as InterpretationSearchResponse
        actions.setInterpretationResults(data.interpretations ?? [])

        if ((data.interpretations?.length ?? 0) === 0) {
          toast({
            title: "검색 결과 없음",
            description: "해석례를 찾을 수 없습니다.",
            variant: "default",
          })
          return false
        }

        await persistSearchCache({
          query: { lawName: searchQuery },
          lawData: undefined,
          aiMode: undefined,
          precedentResults: undefined,
          precedentDetail: undefined,
          rulingResults: undefined,
          interpretationResults: data.interpretations.map((item) => ({
            id: item.id,
            name: item.name,
            number: item.number,
            date: item.date,
            agency: item.agency,
            link: item.link,
          })),
        })

        toast({
          title: "해석례 검색 완료",
          description: `${data.interpretations.length}건의 해석례를 찾았습니다.`,
          variant: "default",
        })
        return true
      } catch (error) {
        debugLogger.error("[unified-search] interpretation search failed", error)
        toast({
          title: "해석례 검색 실패",
          description: error instanceof Error ? error.message : "알 수 없는 오류",
          variant: "destructive",
        })
        return false
      } finally {
        actions.setIsSearching(false)
      }
    },
    [actions, clearSecondaryResults, persistSearchCache, toast]
  )

  const handleRulingSearch = useCallback(
    async (query: SearchQuery) => {
      debugLogger.info("[unified-search] ruling search", { query })

      try {
        const classification = (query as SearchQuery & { classification?: any }).classification
        const rulingNumber = classification?.entities?.rulingNumber
        const searchQuery = rulingNumber || query.lawName || ""

        if (!searchQuery) {
          toast({
            title: "검색어 오류",
            description: "재결례 검색어를 입력해 주세요.",
            variant: "destructive",
          })
          return false
        }

        actions.setIsAiMode(false)
        actions.setSearchMode("basic")
        clearSecondaryResults()
        actions.setSearchQuery(searchQuery)
        actions.setUserQuery(searchQuery)
        actions.setIsSearching(true)
        actions.setMobileView("list")

        const response = await fetch(`/api/ruling-search?query=${encodeURIComponent(searchQuery)}`)
        if (!response.ok) {
          throw new Error(`재결례 검색 실패: ${response.status}`)
        }

        const data = (await response.json()) as RulingSearchResponse
        actions.setRulingResults(data.rulings ?? [])

        if ((data.rulings?.length ?? 0) === 0) {
          toast({
            title: "검색 결과 없음",
            description: "재결례를 찾을 수 없습니다.",
            variant: "default",
          })
          return false
        }

        await persistSearchCache({
          query: { lawName: searchQuery },
          lawData: undefined,
          aiMode: undefined,
          precedentResults: undefined,
          precedentDetail: undefined,
          interpretationResults: undefined,
          rulingResults: data.rulings.map((item) => ({
            id: item.id,
            name: item.name,
            claimNumber: item.claimNumber,
            decisionDate: item.decisionDate,
            tribunal: item.tribunal,
            decisionType: item.decisionType,
            link: item.link,
          })),
        })

        toast({
          title: "재결례 검색 완료",
          description: `${data.rulings.length}건의 재결례를 찾았습니다.`,
          variant: "default",
        })
        return true
      } catch (error) {
        debugLogger.error("[unified-search] ruling search failed", error)
        toast({
          title: "재결례 검색 실패",
          description: error instanceof Error ? error.message : "알 수 없는 오류",
          variant: "destructive",
        })
        return false
      } finally {
        actions.setIsSearching(false)
      }
    },
    [actions, clearSecondaryResults, persistSearchCache, toast]
  )

  const handleMultiSearch = useCallback(
    async (query: SearchQuery) => {
      debugLogger.info("[unified-search] multi search", { query })

      const classification = (query as SearchQuery & { classification?: any }).classification
      const secondaryTypes = Array.from(new Set<string>(classification?.secondaryTypes || []))

      if (secondaryTypes.length === 0) {
        toast({
          title: "통합 검색 오류",
          description: "검색 경로를 확인할 수 없습니다.",
          variant: "destructive",
        })
        return
      }

      actions.setIsSearching(true)

      try {
        for (const type of secondaryTypes) {
          switch (type) {
            case "precedent":
              if (await handlePrecedentSearch(query)) return
              break
            case "interpretation":
              if (await handleInterpretationSearch(query)) return
              break
            case "ruling":
              if (await handleRulingSearch(query)) return
              break
            case "law":
              await handleSearchInternal(query, undefined, "law")
              return
            default:
              break
          }
        }

        toast({
          title: "검색 결과 없음",
          description: "통합 검색 경로에서 결과를 찾지 못했습니다.",
          variant: "default",
        })
      } catch (error) {
        debugLogger.error("[unified-search] multi search failed", error)
        toast({
          title: "통합 검색 실패",
          description: error instanceof Error ? error.message : "알 수 없는 오류",
          variant: "destructive",
        })
      } finally {
        actions.setIsSearching(false)
      }
    },
    [actions, handleInterpretationSearch, handlePrecedentSearch, handleRulingSearch, handleSearchInternal, toast]
  )

  const handlePrecedentPageChange = useCallback(
    async (page: number) => {
      try {
        actions.setIsSearching(true)
        actions.setPrecedentPage(page)

        const params = new URLSearchParams({
          query: state.userQuery || "",
          page: page.toString(),
          display: String(state.precedentPageSize),
        })

        const response = await fetch(`/api/precedent-search?${params.toString()}`)
        if (!response.ok) {
          throw new Error(`판례 검색 실패: ${response.status}`)
        }

        const data = (await response.json()) as PrecedentSearchResponse
        actions.setPrecedentResults(data.precedents ?? [])
        actions.setPrecedentTotalCount(data.totalCount ?? 0)
        actions.setPrecedentYearFilter(data.yearFilter)
        actions.setPrecedentCourtFilter(data.courtFilter)
      } catch (error) {
        debugLogger.error("[unified-search] precedent page failed", error)
        toast({
          title: "페이지 로드 실패",
          description: error instanceof Error ? error.message : "알 수 없는 오류",
          variant: "destructive",
        })
      } finally {
        actions.setIsSearching(false)
      }
    },
    [actions, state.precedentPageSize, state.userQuery, toast]
  )

  const handlePrecedentPageSizeChange = useCallback(
    async (size: number) => {
      try {
        actions.setIsSearching(true)
        actions.setPrecedentPageSize(size)
        actions.setPrecedentPage(1)

        const params = new URLSearchParams({
          query: state.userQuery || "",
          page: "1",
          display: size.toString(),
        })

        const response = await fetch(`/api/precedent-search?${params.toString()}`)
        if (!response.ok) {
          throw new Error(`판례 검색 실패: ${response.status}`)
        }

        const data = (await response.json()) as PrecedentSearchResponse
        actions.setPrecedentResults(data.precedents ?? [])
        actions.setPrecedentTotalCount(data.totalCount ?? 0)
        actions.setPrecedentYearFilter(data.yearFilter)
        actions.setPrecedentCourtFilter(data.courtFilter)
      } catch (error) {
        debugLogger.error("[unified-search] precedent page size failed", error)
        toast({
          title: "로드 실패",
          description: error instanceof Error ? error.message : "알 수 없는 오류",
          variant: "destructive",
        })
      } finally {
        actions.setIsSearching(false)
      }
    },
    [actions, state.userQuery, toast]
  )

  const handleOrdinancePageChange = useCallback(
    async (newPage: number) => {
      if (!state.ordinanceSelectionState) return

      try {
        actions.setIsSearching(true)
        actions.setOrdinancePage(newPage)

        const { lawName } = state.ordinanceSelectionState.query
        const apiUrl = `/api/ordin-search?query=${encodeURIComponent(lawName)}&display=${state.ordinancePageSize}&page=${newPage}`

        const response = await fetch(apiUrl)
        if (!response.ok) {
          throw new Error("조례 검색 실패")
        }

        const xmlText = await response.text()
        const { totalCount, ordinances } = parseOrdinanceSearchXML(xmlText)

        actions.setOrdinanceSelectionState({
          results: ordinances,
          totalCount,
          query: { lawName },
        })
      } catch (error) {
        debugLogger.error("[unified-search] ordinance page failed", error)
        toast({
          title: "페이지 로드 실패",
          description: error instanceof Error ? error.message : "알 수 없는 오류",
          variant: "destructive",
        })
      } finally {
        actions.setIsSearching(false)
      }
    },
    [actions, state.ordinancePageSize, state.ordinanceSelectionState, toast]
  )

  const handleOrdinancePageSizeChange = useCallback(
    async (newSize: number) => {
      if (!state.ordinanceSelectionState) return

      try {
        actions.setIsSearching(true)
        actions.setOrdinancePageSize(newSize)
        actions.setOrdinancePage(1)

        const { lawName } = state.ordinanceSelectionState.query
        const apiUrl = `/api/ordin-search?query=${encodeURIComponent(lawName)}&display=${newSize}&page=1`

        const response = await fetch(apiUrl)
        if (!response.ok) {
          throw new Error("조례 검색 실패")
        }

        const xmlText = await response.text()
        const { totalCount, ordinances } = parseOrdinanceSearchXML(xmlText)

        actions.setOrdinanceSelectionState({
          results: ordinances,
          totalCount,
          query: { lawName },
        })
      } catch (error) {
        debugLogger.error("[unified-search] ordinance page size failed", error)
        toast({
          title: "로드 실패",
          description: error instanceof Error ? error.message : "알 수 없는 오류",
          variant: "destructive",
        })
      } finally {
        actions.setIsSearching(false)
      }
    },
    [actions, state.ordinanceSelectionState, toast]
  )

  return {
    handlePrecedentSearch,
    handlePrecedentSelect,
    handleRefresh,
    handleInterpretationSearch,
    handleRulingSearch,
    handleMultiSearch,
    handlePrecedentPageChange,
    handlePrecedentPageSizeChange,
    handleOrdinancePageChange,
    handleOrdinancePageSizeChange,
  }
}
