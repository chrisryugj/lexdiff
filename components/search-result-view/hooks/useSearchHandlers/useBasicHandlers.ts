/**
 * useSearchHandlers/useBasicHandlers.ts
 *
 * 기본 핸들러들 (선택/비교/즐겨찾기/요약 등)
 */

import { useCallback } from "react"
import { debugLogger } from "@/lib/debug-logger"
import { favoritesStore } from "@/lib/favorites-store"
import { parseOrdinanceXML } from "@/lib/ordin-parser"
import { parseLawSearchXML } from "@/lib/law-search-parser"
import { parseOldNewXML } from "@/lib/oldnew-parser"
import { buildJO } from "@/lib/law-parser"
import type { HandlerDeps, SearchQuery, LawSearchResult, OrdinanceSearchResult, Favorite } from "./types"

interface UseBasicHandlersDeps extends HandlerDeps {
  fetchLawContent: (selectedLaw: LawSearchResult, query: SearchQuery, skipCache?: boolean) => Promise<void>
  handleSearchInternal: (query: SearchQuery, signal?: AbortSignal, forcedMode?: 'law' | 'ai', skipCache?: boolean) => Promise<void>
}

export function useBasicHandlers(deps: UseBasicHandlersDeps) {
  const { state, actions, toast, reportError, onBack, fetchLawContent, handleSearchInternal } = deps

  // ============================================================
  // 검색 핸들러
  // ============================================================
  const handleSearch = useCallback((query: SearchQuery) => {
    const passedForcedMode = query.forcedMode
    handleSearchInternal(query, undefined, passedForcedMode)
  }, [handleSearchInternal])

  const handleSearchChoice = useCallback((mode: 'law' | 'ai') => {
    const query = state.pendingQuery
    actions.setPendingQuery(null)
    actions.setShowChoiceDialog(false)
    if (query) {
      handleSearchInternal(query, undefined, mode)
    }
  }, [actions, state.pendingQuery, handleSearchInternal])

  const handleNoResultChoice = useCallback((choice: 'ai' | 'cancel') => {
    actions.setShowNoResultDialog(false)
    if (choice === 'ai' && state.noResultQuery) {
      handleSearchInternal(state.noResultQuery, undefined, 'ai')
      actions.setNoResultQuery(null)
    } else {
      actions.setNoResultQuery(null)
      actions.setIsSearching(false)
      // 취소 시 홈으로 복귀 (빈화면 방지)
      actions.resetToHome()
      onBack()
    }
  }, [actions, state.noResultQuery, handleSearchInternal, onBack])

  // ============================================================
  // 법령/조례 선택
  // ============================================================
  const handleLawSelect = useCallback(async (law: LawSearchResult) => {
    if (!state.lawSelectionState) return

    actions.setIsSearching(true)
    try {
      await fetchLawContent(law, {
        lawName: state.lawSelectionState.query.lawName,
        article: state.lawSelectionState.query.article,
        jo: undefined,
      })
      actions.setLawSelectionState(null)
      actions.setRelatedSearches([])
      actions.setMobileView("content")
    } catch (error) {
      debugLogger.error("법령 조회 실패", error)
      toast({ title: "법령 조회 실패", description: error instanceof Error ? error.message : "법령 조회 중 오류가 발생했습니다.", variant: "destructive" })
      // 에러 시 선택 목록으로 복귀 (lawSelectionState 유지하되 isSearching 해제)
      // → 사용자가 다른 법령을 선택하거나 취소할 수 있음
    } finally {
      actions.setIsSearching(false)
    }
  }, [actions, state.lawSelectionState, fetchLawContent, toast])

  const handleOrdinanceSelect = useCallback(async (ordinance: OrdinanceSearchResult) => {
    if (!state.ordinanceSelectionState) return

    debugLogger.info("자치법규 선택", { ordinSeq: ordinance.ordinSeq, ordinName: ordinance.ordinName })
    actions.setIsSearching(true)

    const apiLogs: Array<{ url: string; method: string; status?: number; response?: string }> = []

    try {
      const params = new URLSearchParams()
      if (ordinance.ordinId) {
        params.append("ordinId", ordinance.ordinId)
      } else {
        params.append("ordinSeq", ordinance.ordinSeq)
      }

      const apiUrl = "/api/ordin?" + params.toString()
      const response = await fetch(apiUrl)

      apiLogs.push({ url: apiUrl, method: "GET", status: response.status })

      if (!response.ok) {
        toast({ title: "자치법규 조회 실패", description: "자치법규 본문을 불러올 수 없습니다.", variant: "destructive" })
        throw new Error("자치법규 조회 실패")
      }

      const xmlText = await response.text()
      const parsedData = parseOrdinanceXML(xmlText)
      const meta = parsedData.meta
      const articles = parsedData.articles

      if (articles.length === 0) {
        toast({ title: "조문 없음", description: "이 자치법규의 조문을 찾을 수 없습니다.", variant: "destructive" })
      }

      actions.setLawData({
        meta,
        articles,
        selectedJo: undefined,
        isOrdinance: true,
        viewMode: "full",
      })

      // IndexedDB에 query + lawData 저장
      try {
        const { saveSearchResult, getSearchResult } = await import('@/lib/search-result-store')
        const currentState = window.history.state
        const currentSearchId = currentState?.searchId

        if (currentSearchId) {
          const existingCache = await getSearchResult(currentSearchId)

          if (existingCache) {
            const updatedQuery: SearchQuery = {
              lawName: meta.lawTitle,
              article: undefined,
              jo: undefined,
            }

            await saveSearchResult({
              ...existingCache,
              query: updatedQuery,
              lawData: {
                meta: {
                  ordinSeq: ordinance.ordinSeq,
                  ordinId: ordinance.ordinId,
                  lawName: meta.lawTitle,
                },
                articles: articles.map(a => ({
                  joNumber: a.jo,
                  joLabel: a.joNum,
                  title: a.title || '',
                  content: a.content,
                  isDeleted: false,
                })),
                selectedJo: null,
                isOrdinance: true,
                viewMode: "full",
              },
            })
            debugLogger.success('💾 조례 lawData + query를 IndexedDB에 저장 완료', {
              searchId: currentSearchId,
              lawTitle: meta.lawTitle,
              query: updatedQuery,
            })
          }
        }
      } catch (cacheError) {
        debugLogger.error('⚠️ 조례 lawData 저장 실패', cacheError)
      }

      // 조례 상세 History entry 추가
      const currentSearchId = window.history.state?.searchId
      if (currentSearchId) {
        const { pushSearchHistory } = await import('@/lib/history-manager')
        pushSearchHistory(currentSearchId, state.searchMode || 'basic', { hasOrdinanceDetail: true })
        debugLogger.info('[통합검색] 조례 상세 히스토리 추가', { searchId: currentSearchId })
      }

      actions.setOrdinanceSelectionState(null)
      actions.setMobileView("content")
      debugLogger.success("자치법규 조회 완료", { ordinName: meta.lawTitle, articleCount: articles.length })
    } catch (error) {
      debugLogger.error("자치법규 조회 실패", error)
      reportError("자치법규 조회", error instanceof Error ? error : new Error(String(error)), { ordinance }, apiLogs)
      toast({ title: "자치법규 조회 실패", description: error instanceof Error ? error.message : "자치법규 조회 중 오류가 발생했습니다.", variant: "destructive" })
    } finally {
      actions.setIsSearching(false)
    }
  }, [actions, state.ordinanceSelectionState, state.searchMode, reportError, toast])

  // ============================================================
  // 최근/즐겨찾기 선택
  // ============================================================
  const handleRecentSelect = useCallback((search: any) => {
    debugLogger.info("최근 검색 선택", search)

    let jo: string | undefined
    if (search.article) {
      try {
        jo = buildJO(search.article)
      } catch (error) {
        console.error("[v0] Failed to convert article to jo:", error)
      }
    }

    handleSearch({ lawName: search.lawName, article: search.article, jo })
  }, [handleSearch])

  const handleFavoriteSelect = useCallback((favorite: Favorite) => {
    debugLogger.info("즐겨찾기 선택", favorite)
    handleSearch({ lawName: favorite.lawTitle, jo: favorite.jo })
  }, [handleSearch])

  // ============================================================
  // 비교/요약/즐겨찾기 토글
  // ============================================================
  const handleCompare = useCallback((jo: string) => {
    debugLogger.info("신·구법 비교 요청", { jo })
    actions.setComparisonModal({ isOpen: true, jo })
  }, [actions])

  const handleSummarize = useCallback(async (jo: string) => {
    if (!state.lawData) return

    debugLogger.info("AI 요약 요청", { jo, isPrecedent: state.lawData.isPrecedent })

    // 판례 모드: 판례 전문 요약
    if (state.lawData.isPrecedent) {
      try {
        const allContent = state.lawData.articles
          .map(a => `【${a.joNum || a.title}】\n${a.content}`)
          .join('\n\n')

        if (!allContent.trim()) {
          toast({ title: "요약할 내용 없음", description: "판례 내용이 비어있습니다.", variant: "destructive" })
          return
        }

        actions.setSummaryDialog({
          isOpen: true,
          jo: state.lawData.meta.lawTitle,
          oldContent: '',
          newContent: allContent,
          effectiveDate: state.lawData.meta.promulgationDate,
          isPrecedent: true,
        })
      } catch (error) {
        debugLogger.error("❌ 판례 요약 준비 실패", error)
        toast({ title: "판례 요약 실패", description: error instanceof Error ? error.message : "판례 요약 준비 중 오류가 발생했습니다.", variant: "destructive" })
      }
      return
    }

    // 일반 법령 모드: 신·구법 비교 요약
    try {
      const params = new URLSearchParams()
      if (state.lawData.meta.lawId) {
        params.append("lawId", state.lawData.meta.lawId)
      } else if (state.lawData.meta.mst) {
        params.append("mst", state.lawData.meta.mst)
      }

      const response = await fetch("/api/oldnew?" + params.toString())
      if (!response.ok) {
        throw new Error("신·구법 데이터 조회 실패")
      }

      const xmlText = await response.text()
      const comparison = parseOldNewXML(xmlText)

      const article = state.lawData.articles.find((a) => a.jo === jo)
      const joNum = article ? article.joNum : jo

      if (!comparison.oldVersion.content && !comparison.newVersion.content) {
        toast({ title: "신·구법 데이터 없음", description: "해당 조문의 신·구법 비교 데이터를 찾을 수 없습니다.", variant: "destructive" })
        return
      }

      actions.setSummaryDialog({
        isOpen: true,
        jo: joNum,
        oldContent: comparison.oldVersion.content,
        newContent: comparison.newVersion.content,
        effectiveDate: state.lawData.meta.latestEffectiveDate,
      })

    } catch (error) {
      debugLogger.error("❌ AI 요약 준비 실패", error)
      toast({ title: "AI 요약 실패", description: error instanceof Error ? error.message : "AI 요약 준비 중 오류가 발생했습니다.", variant: "destructive" })
    }
  }, [state.lawData, actions, toast])

  const handleToggleFavorite = useCallback((jo: string) => {
    if (!state.lawData) return

    const article = state.lawData.articles.find((a) => a.jo === jo)
    if (!article) return

    try {
      const isFav = favoritesStore.isFavorite(state.lawData.meta.lawTitle, jo)

      if (isFav) {
        const existingFavs = favoritesStore.getFavorites()
        const toRemove = existingFavs.find((f) => f.lawTitle === state.lawData!.meta.lawTitle && f.jo === jo)
        if (toRemove) {
          favoritesStore.removeFavorite(toRemove.id)
        }
      } else {
        favoritesStore.addFavorite({
          lawId: state.lawData.meta.lawId,
          mst: state.lawData.meta.mst,
          lawTitle: state.lawData.meta.lawTitle,
          jo,
          effectiveDate: state.lawData.meta.latestEffectiveDate,
          lastSeenSignature: (state.lawData.meta.latestEffectiveDate || "") + "-" + (state.lawData.meta.revisionType || ""),
        })
      }
    } catch (error) {
      reportError("즐겨찾기 토글", error instanceof Error ? error : new Error(String(error)), { lawTitle: state.lawData.meta.lawTitle, jo })
      toast({ title: "즐겨찾기 실패", description: "즐겨찾기 처리 중 오류가 발생했습니다.", variant: "destructive" })
    }
  }, [state.lawData, reportError, toast])

  // ============================================================
  // 기타 핸들러
  // ============================================================
  // H-UX2: async 불필요 (await 없음). 동기 핸들러로 변환해 onClick에
  //        전달해도 Promise rejection이 삼켜지는 리스크 제거.
  const handleCitationClick = useCallback((lawName: string, jo: string, article: string) => {
    // parameter jo는 외부 계약 유지용. 현재는 로그만 남김.
    void jo
    debugLogger.info('인용된 조문 클릭', { lawName, article })
  }, [])

  const handleReset = useCallback(() => {
    actions.resetToHome()
    onBack()
  }, [actions, onBack])

  const handleFavoritesClick = useCallback(() => {
    actions.setFavoritesDialogOpen(true)
  }, [actions])

  const handleSettingsClick = useCallback(() => {
    window.location.href = '/admin/settings'
  }, [])

  const fetchRelatedSearches = useCallback(async (lawName: string, currentResults: LawSearchResult[]) => {
    const { expandSearchSynonyms } = await import('@/lib/search-normalizer')
    const expansion = expandSearchSynonyms(lawName)
    if (expansion.expanded.length === 0) {
      actions.setRelatedSearches([])
      return
    }

    const relatedResults: { keyword: string; results: LawSearchResult[] }[] = []
    const currentLawIds = new Set(currentResults.map(r => r.lawId || r.mst))

    for (const expandedQuery of expansion.expanded) {
      try {
        const response = await fetch(`/api/law-search?query=${encodeURIComponent(expandedQuery)}`)
        if (!response.ok) continue

        const xmlText = await response.text()
        const results = parseLawSearchXML(xmlText)
        const newResults = results.filter(r => !currentLawIds.has(r.lawId || r.mst))

        if (newResults.length > 0) {
          relatedResults.push({ keyword: expandedQuery, results: newResults })
        }
      } catch (error) {
        debugLogger.warning('유사어 확장 검색 실패', { query: expandedQuery, error })
      }
    }

    actions.setRelatedSearches(relatedResults)
  }, [actions])

  // AI 답변 강제 새로고침 (캐시 무시)
  const handleAiRefresh = useCallback(() => {
    if (!state.userQuery) {
      toast({ title: "새로고침 실패", description: "검색어가 없습니다.", variant: "destructive" })
      return
    }
    debugLogger.info('🔄 AI 답변 강제 새로고침 (캐시 무시)', { query: state.userQuery })
    handleSearchInternal({ lawName: state.userQuery }, undefined, 'ai', true)
  }, [state.userQuery, handleSearchInternal, toast])

  return {
    handleSearch,
    handleSearchChoice,
    handleNoResultChoice,
    handleLawSelect,
    handleOrdinanceSelect,
    handleRecentSelect,
    handleFavoriteSelect,
    handleCompare,
    handleSummarize,
    handleToggleFavorite,
    handleCitationClick,
    handleReset,
    handleFavoritesClick,
    handleSettingsClick,
    fetchRelatedSearches,
    handleAiRefresh,
  }
}
