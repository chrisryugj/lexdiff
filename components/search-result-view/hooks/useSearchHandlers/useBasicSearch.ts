/**
 * useSearchHandlers/useBasicSearch.ts
 *
 * 기본 구조화 검색 (법령/조례)
 */

import { useCallback } from "react"
import { debugLogger } from "@/lib/debug-logger"
import { normalizeLawSearchText } from "@/lib/search-normalizer"
import { parseLawSearchXML } from "@/lib/law-search-parser"
import { parseOrdinanceSearchXML } from "@/lib/ordin-search-parser"
import { buildFullQuery, isOrdinanceQuery as checkIsOrdinanceQuery } from "../../utils"
import type { HandlerDeps, SearchQuery, LawSearchResult } from "./types"

interface UseBasicSearchDeps extends HandlerDeps {
  fetchLawContent: (selectedLaw: LawSearchResult, query: SearchQuery) => Promise<void>
}

export function useBasicSearch(deps: UseBasicSearchDeps) {
  const { actions, toast, reportError, fetchLawContent } = deps

  const handleBasicSearch = useCallback(async (
    query: SearchQuery,
    fullQuery: string
  ) => {
    actions.setIsSearching(true)
    actions.updateProgress('searching', 10)
    actions.resetSearchState()

    const apiLogs: Array<{ url: string; method: string; status?: number; response?: string }> = []
    const isOrdinance = checkIsOrdinanceQuery(fullQuery)
    const lawName = query.lawName

    debugLogger.info(isOrdinance ? "조례 검색 시작" : "법령 검색 시작", { lawName })

    // IndexedDB 우선 체크 (법령만)
    if (!isOrdinance) {
      const rawQuery = buildFullQuery(query.lawName, query.article)

      try {
        actions.updateProgress('searching', 30)
        const { getLawContentCacheByQuery } = await import('@/lib/law-content-cache')
        const cachedContent = await getLawContentCacheByQuery(rawQuery)

        if (cachedContent) {
          const normalizedSearchName = query.lawName.replace(/\s+/g, "")
          const normalizedCachedName = cachedContent.lawTitle.replace(/\s+/g, "")

          if (normalizedCachedName === normalizedSearchName) {
            actions.updateProgress('parsing', 70)
            debugLogger.success(`💾 [Phase 7] IndexedDB 캐시 HIT - API 호출 없음!`)

            let selectedJo: string | undefined = undefined

            if (query.jo) {
              const targetArticle = cachedContent.articles.find(a => a.jo === query.jo)
              if (targetArticle) {
                selectedJo = targetArticle.jo
              } else {
                const { findNearestArticles } = await import('@/lib/article-finder')
                const nearestArticles = findNearestArticles(query.jo, cachedContent.articles)

                if (nearestArticles.length > 0) {
                  selectedJo = nearestArticles[0].jo
                }

                actions.setArticleNotFound({
                  requestedJo: query.jo,
                  lawTitle: cachedContent.meta.lawTitle,
                  nearestArticles,
                  crossLawSuggestions: [],
                })
              }
            }

            const queryId = -Date.now()
            const resultId = -(Date.now() + 1)

            actions.setLawData({
              meta: cachedContent.meta,
              articles: cachedContent.articles,
              selectedJo,
              viewMode: 'full',
              searchQueryId: queryId,
              searchResultId: resultId,
            })

            actions.setIsSearching(false)
            actions.updateProgress('complete', 100)
            return
          }
        }
      } catch (error) {
        debugLogger.warning('[Phase 7] IndexedDB 캐시 조회 실패', error)
      }
    }

    // 기본 검색 시작
    try {
      actions.setIsSearching(true)
      actions.updateProgress('searching', 40)

      if (isOrdinance) {
        const apiUrl = "/api/ordin-search?query=" + encodeURIComponent(lawName)
        const response = await fetch(apiUrl)

        apiLogs.push({ url: apiUrl, method: "GET", status: response.status })

        if (!response.ok) {
          throw new Error("조례 검색 실패")
        }

        actions.updateProgress('parsing', 60)
        const xmlText = await response.text()
        const { totalCount, ordinances } = parseOrdinanceSearchXML(xmlText)
        actions.updateProgress('parsing', 80)

        console.log(`[ordin-search] API 응답: totalCount=${totalCount}, ordinances.length=${ordinances.length}`)

        if (ordinances.length === 0) {
          reportError("조례 검색", new Error(`검색 결과를 찾을 수 없습니다: ${query.lawName}`), { query: query.lawName }, apiLogs)
          actions.updateProgress('complete', 0)
          actions.setIsSearching(false)
          return
        }

        actions.setOrdinanceSelectionState({ results: ordinances, totalCount, query: { lawName } })
        actions.setMobileView("list")
        actions.updateProgress('complete', 100)
        actions.setIsSearching(false)

        // 조례 검색 결과 IndexedDB 저장 (뒤로가기 복원용)
        try {
          const { saveSearchResult, getSearchResult } = await import('@/lib/search-result-store')
          const currentState = window.history.state
          const currentSearchId = currentState?.searchId

          if (currentSearchId) {
            const existingCache = await getSearchResult(currentSearchId)
            await saveSearchResult({
              ...existingCache,
              searchId: currentSearchId,
              query: { lawName },
              ordinanceSelectionState: {
                results: ordinances.map(o => ({
                  자치법규ID: o.ordinId || o.ordinSeq,
                  자치법규명: o.ordinName,
                  공포일자: o.promulgationDate || '',
                })),
                query: lawName,
              },
              timestamp: Date.now(),
              expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
            })
            debugLogger.success('💾 조례 검색 결과 IndexedDB 저장', { searchId: currentSearchId, count: ordinances.length })
          }
        } catch (cacheError) {
          debugLogger.error('⚠️ 조례 검색 결과 저장 실패', cacheError)
        }
      } else {
        const apiUrl = "/api/law-search?query=" + encodeURIComponent(lawName)

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)

        let response
        try {
          response = await fetch(apiUrl, { signal: controller.signal })
        } catch (err: any) {
          if (err.name === 'AbortError') {
            throw new Error("검색 시간이 초과되었습니다. 다시 시도해주세요.")
          }
          throw err
        } finally {
          clearTimeout(timeoutId)
        }

        apiLogs.push({ url: apiUrl, method: "GET", status: response.status })

        if (!response.ok) {
          throw new Error("법령 검색 실패")
        }

        actions.updateProgress('parsing', 60)
        const xmlText = await response.text()
        const results = parseLawSearchXML(xmlText)
        actions.updateProgress('parsing', 70)

        if (results.length === 0) {
          debugLogger.warning(`⚠️ [법령 검색] "${lawName}" 검색 결과 없음 -> AI 검색 제안`)
          actions.setPendingQuery(query)
          actions.setIsSearching(false)
          actions.updateProgress('complete', 0)
          actions.setShowChoiceDialog(true)
          toast({ title: "검색 결과 없음", description: "정확한 법령을 찾을 수 없어 AI 검색을 제안합니다." })
          return
        }

        const normalizedLawName = normalizeLawSearchText(lawName).replace(/\s+/g, "")
        const exactMatches = results.filter((r) => r.lawName.replace(/\s+/g, "") === normalizedLawName)

        let exactMatch = exactMatches.length > 0
          ? exactMatches.reduce((shortest, current) => current.lawName.length < shortest.lawName.length ? current : shortest)
          : undefined

        if (!exactMatch) {
          const { findMostSimilar } = await import('@/lib/text-similarity')
          const mainLawResults = results.filter((r) => !r.lawName.includes("시행령") && !r.lawName.includes("시행규칙"))
          const minSimilarity = normalizedLawName.length <= 2 ? 0.85 : 0.6
          const bestMatch = findMostSimilar(normalizedLawName, mainLawResults, (r) => r.lawName.replace(/\s+/g, ""), minSimilarity)

          if (bestMatch) {
            exactMatch = bestMatch.item
          }
        }

        if (!exactMatch) {
          if (results.length > 0) {
            actions.setLawSelectionState({ results, query })
            actions.updateProgress('complete', 100)
            actions.setIsSearching(false)
            return
          } else {
            actions.setNoResultQuery(query)
            actions.setShowNoResultDialog(true)
            actions.updateProgress('complete', 100)
            actions.setIsSearching(false)
            return
          }
        }

        if (exactMatch && !query.jo) {
          try {
            await fetchLawContent(exactMatch, { lawName, article: query.article, jo: undefined })
            actions.setMobileView("content")
            return
          } catch (error) {
            toast({ title: "법령 조회 실패", description: error instanceof Error ? error.message : "법령 조회 중 오류가 발생했습니다.", variant: "destructive" })
          }
        }

        if (exactMatch && query.jo) {
          try {
            await fetchLawContent(exactMatch, { lawName, article: query.article, jo: query.jo })
            actions.setMobileView("content")
          } catch (error) {
            toast({ title: "법령 조회 실패", description: error instanceof Error ? error.message : "법령 조회 중 오류가 발생했습니다.", variant: "destructive" })
          } finally {
            actions.setIsSearching(false)
          }
          return
        }

        actions.setLawSelectionState({ results, query: { lawName, article: query.article, jo: query.jo } })
        actions.setMobileView("list")
        actions.updateProgress('complete', 100)
        actions.setIsSearching(false)
      }
    } catch (error) {
      debugLogger.error("[v0] 검색 오류:", error)
      reportError(isOrdinance ? "조례 검색" : "법령 검색", error instanceof Error ? error : new Error(String(error)), { query, isOrdinance }, apiLogs)
      toast({ title: "검색 실패", description: error instanceof Error ? error.message : "검색 중 오류가 발생했습니다.", variant: "destructive" })
      actions.setLawData(null)
    } finally {
      actions.setIsSearching(false)
      actions.updateProgress('complete', 100)
    }
  }, [actions, fetchLawContent, reportError, toast])

  return { handleBasicSearch }
}
