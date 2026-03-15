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
import { buildOrdinanceSearchStrategies, scoreRelevance, expandForLawSearch } from "@/lib/query-expansion"
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
        // 다단계 검색 전략 생성 (동의어 확장 + 필살기 포함)
        const strategies = buildOrdinanceSearchStrategies(lawName)

        type OrdinResult = import("@/lib/ordin-search-parser").OrdinanceSearchResult
        let allOrdinances: OrdinResult[] = []
        let totalCount = 0
        let matchedStrategy = ''

        // 전략을 우선도순으로 정렬, 상위 전략 우선 실행 + 결과 머징
        const sortedStrategies = [...strategies].sort((a, b) => b.priority - a.priority)
        const originalKeywords = lawName.split(/\s+/).filter((w: string) => w.length >= 2)
        const expandedKeywords = strategies.flatMap(s => s.filterKeywords || [])
        const seenNames = new Set<string>()

        // Phase 1: 상위 3개 전략 병렬 실행 (빠른 응답)
        const topStrategies = sortedStrategies.filter(s => !s.filterKeywords).slice(0, 3)
        const topResults = await Promise.all(
          topStrategies.map(async (strategy) => {
            const apiUrl = `/api/ordin-search?query=${encodeURIComponent(strategy.query)}&display=${strategy.display}`
            const response = await fetch(apiUrl)
            apiLogs.push({ url: apiUrl, method: "GET", status: response.status })
            if (!response.ok) return { strategy, ordinances: [] as OrdinResult[], totalCount: 0 }
            const xmlText = await response.text()
            const result = parseOrdinanceSearchXML(xmlText)
            console.log(`[ordin-search] ${strategy.description} → ${result.totalCount}건`)
            return { strategy, ordinances: result.ordinances, totalCount: result.totalCount }
          })
        )

        actions.updateProgress('searching', 60)

        // 머징: 중복 제거 + 관련도 리랭킹
        const merged: Array<OrdinResult & { _relevance: number }> = []
        for (const res of topResults) {
          for (const o of res.ordinances) {
            if (!seenNames.has(o.ordinName)) {
              seenNames.add(o.ordinName)
              const relevance = scoreRelevance(o.ordinName, originalKeywords, expandedKeywords)
              merged.push({ ...o, _relevance: relevance })
            }
          }
          if (!matchedStrategy && res.ordinances.length > 0) {
            matchedStrategy = res.strategy.description
          }
        }

        // Phase 2: 상위 전략으로 충분하지 않으면 나머지 순차 실행
        if (merged.length === 0) {
          const remainingStrategies = sortedStrategies.slice(topStrategies.length)
          for (let i = 0; i < remainingStrategies.length; i++) {
            const strategy = remainingStrategies[i]
            const progress = 60 + Math.round((i / remainingStrategies.length) * 15)
            actions.updateProgress('searching', Math.min(progress, 75))

            const apiUrl = `/api/ordin-search?query=${encodeURIComponent(strategy.query)}&display=${strategy.display}`
            const response = await fetch(apiUrl)
            apiLogs.push({ url: apiUrl, method: "GET", status: response.status })
            if (!response.ok) continue

            const xmlText = await response.text()
            const result = parseOrdinanceSearchXML(xmlText)
            console.log(`[ordin-search] ${strategy.description} → ${result.totalCount}건`)

            if (result.ordinances.length > 0) {
              let ordinances = result.ordinances
              if (strategy.filterKeywords && strategy.filterKeywords.length > 0) {
                ordinances = ordinances.filter(o =>
                  strategy.filterKeywords!.some(kw => o.ordinName.includes(kw))
                )
                if (ordinances.length === 0) continue
              }

              for (const o of ordinances) {
                if (!seenNames.has(o.ordinName)) {
                  seenNames.add(o.ordinName)
                  const relevance = scoreRelevance(o.ordinName, originalKeywords, expandedKeywords)
                  merged.push({ ...o, _relevance: relevance })
                }
              }
              matchedStrategy = strategy.description
              break
            }
          }
        }

        // 관련도 내림차순 정렬
        merged.sort((a, b) => b._relevance - a._relevance)
        allOrdinances = merged
        totalCount = merged.length > 0 ? Math.max(merged.length, topResults.reduce((max, r) => Math.max(max, r.totalCount), 0)) : 0

        actions.updateProgress('parsing', 80)

        if (allOrdinances.length === 0) {
          toast({
            title: "조례 검색 결과 없음",
            description: `"${lawName}"에 해당하는 조례를 찾을 수 없습니다. AI 검색을 시도해보세요.`,
          })
          actions.setPendingQuery(query)
          actions.setShowChoiceDialog(true)
          actions.updateProgress('complete', 0)
          actions.setIsSearching(false)
          return
        }

        // 원본 검색어와 다른 전략으로 찾은 경우 알림
        if (matchedStrategy && !matchedStrategy.startsWith('원본')) {
          toast({
            title: "관련 조례 검색 결과",
            description: `"${lawName}" 관련 조례 ${totalCount}건을 찾았습니다.`,
          })
        }

        actions.setOrdinanceSelectionState({ results: allOrdinances, totalCount, query: { lawName } })
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
                results: allOrdinances.map((o: import("@/lib/ordin-search-parser").OrdinanceSearchResult) => ({
                  자치법규ID: o.ordinId || o.ordinSeq,
                  자치법규명: o.ordinName,
                  공포일자: o.promulgationDate || '',
                })),
                query: lawName,
              },
              timestamp: Date.now(),
              expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
            })
            debugLogger.success('💾 조례 검색 결과 IndexedDB 저장', { searchId: currentSearchId, count: allOrdinances.length })
          }
        } catch (cacheError) {
          debugLogger.error('⚠️ 조례 검색 결과 저장 실패', cacheError)
        }
      } else {
        // ── 법령 검색: 원본 + 동의어 확장 병렬 검색 → 머징 ──
        const expandedQueries = expandForLawSearch(lawName)
        // 원본 + 상위 2개 확장 쿼리
        const lawQueries = [lawName, ...expandedQueries.filter(e => e !== lawName).slice(0, 2)]

        actions.updateProgress('searching', 50)

        const lawResults = await Promise.all(
          lawQueries.map(async (q) => {
            const apiUrl = "/api/law-search?query=" + encodeURIComponent(q)
            try {
              const controller = new AbortController()
              const timeoutId = setTimeout(() => controller.abort(), 10000)
              const response = await fetch(apiUrl, { signal: controller.signal })
              clearTimeout(timeoutId)
              apiLogs.push({ url: apiUrl, method: "GET", status: response.status })
              if (!response.ok) return { query: q, results: [] as LawSearchResult[], xml: '' }
              const xmlText = await response.text()
              const results = parseLawSearchXML(xmlText)
              console.log(`[law-search] "${q}" → ${results.length}건`)
              return { query: q, results, xml: xmlText }
            } catch (err: any) {
              if (err.name === 'AbortError') {
                console.log(`[law-search] "${q}" 타임아웃`)
              }
              return { query: q, results: [] as LawSearchResult[], xml: '' }
            }
          })
        )

        actions.updateProgress('parsing', 60)

        // 원본 결과 우선, 확장 결과 머징 (중복 제거)
        const seenLawNames = new Set<string>()
        let results: LawSearchResult[] = []
        let primaryXml = ''

        for (const lr of lawResults) {
          for (const r of lr.results) {
            if (!seenLawNames.has(r.lawName)) {
              seenLawNames.add(r.lawName)
              results.push(r)
            }
          }
          if (!primaryXml && lr.xml) primaryXml = lr.xml
        }

        // 원본 쿼리 매칭 결과를 상위에 배치
        const originalKeywords = lawName.split(/\s+/).filter((w: string) => w.length >= 2)
        results.sort((a, b) => {
          const aMatch = originalKeywords.some(kw => a.lawName.includes(kw)) ? 1 : 0
          const bMatch = originalKeywords.some(kw => b.lawName.includes(kw)) ? 1 : 0
          return bMatch - aMatch
        })

        const xmlText = primaryXml
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

        if (lawQueries.length > 1 && lawResults[0].results.length === 0 && results.length > 0) {
          toast({
            title: "관련 법령 검색 결과",
            description: `"${lawName}" 관련 법령 ${results.length}건을 찾았습니다.`,
          })
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
