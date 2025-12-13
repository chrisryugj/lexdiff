/**
 * search-result-view/hooks/useSearchHandlers.ts
 *
 * 검색 핸들러 훅 - 검색/선택/비교/즐겨찾기 로직
 */

import { useCallback } from "react"
import { useToast } from "@/hooks/use-toast"
import { useErrorReportStore } from "@/lib/error-report-store"
import { debugLogger } from "@/lib/debug-logger"
import { favoritesStore } from "@/lib/favorites-store"
import { detectQueryType } from "@/lib/query-detector"
import { normalizeLawSearchText } from "@/lib/search-normalizer"
import { parseLawSearchXML } from "@/lib/law-search-parser"
import { parseOrdinanceSearchXML } from "@/lib/ordin-search-parser"
import { parseOrdinanceXML } from "@/lib/ordin-parser"
import { parseLawJSON } from "@/lib/law-json-parser"
import { parseOldNewXML } from "@/lib/oldnew-parser"
import { extractRelatedLaws, buildJO, formatJO } from "@/lib/law-parser"
import { getCachedResponse, cacheResponse } from "@/lib/rag-response-cache"
import { buildFullQuery, isOrdinanceQuery as checkIsOrdinanceQuery, hasLawKeyword, hasOrdinanceKeyword, detectSearchFailed } from "../utils"
import type { SearchState, SearchStateActions } from "./useSearchState"
import type {
  SearchQuery,
  LawSearchResult,
  OrdinanceSearchResult,
  LawDataState,
} from "../types"
import type { Favorite } from "@/lib/law-types"

export interface UseSearchHandlersProps {
  state: SearchState
  actions: SearchStateActions
  onBack: () => void
}

export interface SearchHandlers {
  handleSearch: (query: SearchQuery) => void
  handleSearchInternal: (query: SearchQuery, signal?: AbortSignal, forcedMode?: 'law' | 'ai', skipCache?: boolean) => Promise<void>
  handleSearchChoice: (mode: 'law' | 'ai') => void
  handleNoResultChoice: (choice: 'ai' | 'cancel') => void
  handleLawSelect: (law: LawSearchResult) => Promise<void>
  handleOrdinanceSelect: (ordinance: OrdinanceSearchResult) => Promise<void>
  handleRecentSelect: (search: any) => void
  handleFavoriteSelect: (favorite: Favorite) => void
  handleCompare: (jo: string) => void
  handleSummarize: (jo: string) => Promise<void>
  handleToggleFavorite: (jo: string) => void
  handleCitationClick: (lawName: string, jo: string, article: string) => void
  handleReset: () => void
  handleFavoritesClick: () => void
  handleSettingsClick: () => void
  handleAiRefresh: () => void  // ✅ AI 답변 강제 새로고침 (캐시 무시)
  fetchLawContent: (selectedLaw: LawSearchResult, query: SearchQuery) => Promise<void>
  fetchRelatedSearches: (lawName: string, currentResults: LawSearchResult[]) => Promise<void>
}

export function useSearchHandlers({
  state,
  actions,
  onBack,
}: UseSearchHandlersProps): SearchHandlers {
  const { toast } = useToast()
  const { reportError } = useErrorReportStore()

  // ============================================================
  // fetchLawContent - 법령 본문 조회
  // ============================================================
  const fetchLawContent = useCallback(async (
    selectedLaw: LawSearchResult,
    query: SearchQuery,
  ) => {
    debugLogger.info("법령 ID 확인", { lawId: selectedLaw.lawId, lawName: selectedLaw.lawName })

    const apiLogs: Array<{ url: string; method: string; status?: number; response?: string }> = []

    try {
      actions.updateProgress('parsing', 80)
      const params = new URLSearchParams()

      if (selectedLaw.lawId) {
        params.append("lawId", selectedLaw.lawId)
      } else if (selectedLaw.mst) {
        params.append("mst", selectedLaw.mst)
      } else {
        throw new Error("선택한 법령에 대한 식별자를 찾을 수 없습니다")
      }

      // IndexedDB 캐시 체크
      const { getLawContentCache, setLawContentCache } = await import('@/lib/law-content-cache')
      const lawContentCache = await getLawContentCache(selectedLaw.lawId || '', '')

      let meta
      let articles

      if (lawContentCache) {
        actions.updateProgress('parsing', 90)
        debugLogger.success('💾 법령 본문 캐시 HIT (IndexedDB)', {
          lawTitle: lawContentCache.lawTitle,
          articles: lawContentCache.articles.length,
        })

        meta = lawContentCache.meta
        articles = lawContentCache.articles
      } else {
        actions.updateProgress('parsing', 85)
        debugLogger.info('📄 법령 전문 조회 중 (eflaw API)', { lawId: selectedLaw.lawId })

        const apiUrl = "/api/eflaw?" + params.toString()
        const response = await fetch(apiUrl)

        apiLogs.push({
          url: apiUrl,
          method: "GET",
          status: response.status,
        })

        if (!response.ok) {
          const errorText = await response.text()
          apiLogs[apiLogs.length - 1].response = errorText
          throw new Error("법령 조회 실패")
        }

        const jsonText = await response.text()
        apiLogs[apiLogs.length - 1].response = jsonText.substring(0, 500) + "..."

        actions.updateProgress('parsing', 90)
        const jsonData = JSON.parse(jsonText)
        const parsedData = parseLawJSON(jsonData)
        meta = parsedData.meta
        articles = parsedData.articles
        actions.updateProgress('parsing', 95)

        // IndexedDB에 캐시 저장
        setLawContentCache(
          selectedLaw.lawId || '',
          meta.latestEffectiveDate || '',
          meta,
          articles
        ).catch((error) => {
          console.error('법령 본문 캐시 저장 실패:', error)
        })

        debugLogger.success('💾 법령 본문 캐시 저장 완료', {
          lawTitle: meta.lawTitle,
          effectiveDate: meta.latestEffectiveDate,
        })
      }

      let selectedJo: string | undefined
      const viewMode: "single" | "full" = query.jo ? "single" : "full"

      if (query.jo) {
        const targetArticle = articles.find((a) => a.jo === query.jo)

        if (targetArticle) {
          selectedJo = targetArticle.jo
        } else {
          const { findNearestArticles } = await import('@/lib/article-finder')
          const nearestArticles = findNearestArticles(query.jo, articles)

          if (nearestArticles.length > 0) {
            selectedJo = nearestArticles[0].jo
            debugLogger.warning(`조문 없음: ${query.jo} → 유사 조문 표시: ${nearestArticles[0].joNum}`)
          } else {
            debugLogger.warning(`조문 없음: ${query.jo}`)
          }

          actions.setArticleNotFound({
            requestedJo: query.jo,
            lawTitle: meta.lawTitle,
            nearestArticles,
            crossLawSuggestions: [],
          })
        }
      }

      const finalLawData: LawDataState = {
        meta,
        articles,
        selectedJo,
        viewMode,
      }

      actions.setLawData(finalLawData)

      const contentSource = lawContentCache ? "IndexedDB 캐시" : "eflaw API"
      debugLogger.success(`✅ 법령 본문 로드 완료 (${contentSource})`, {
        lawTitle: meta.lawTitle,
        articleCount: articles.length,
      })

      // lawData를 IndexedDB에 즉시 저장
      try {
        const { saveSearchResult, getSearchResult } = await import('@/lib/search-result-store')
        const currentState = window.history.state
        const currentSearchId = currentState?.searchId

        if (currentSearchId) {
          const existingCache = await getSearchResult(currentSearchId)

          if (existingCache) {
            await saveSearchResult({
              ...existingCache,
              lawData: {
                meta: {
                  lawId: selectedLaw.lawId || meta.lawId,
                  mst: selectedLaw.mst,
                  lawName: meta.lawTitle,
                },
                articles: articles.map(a => ({
                  joNumber: a.jo,
                  joLabel: a.joNum,
                  content: a.content,
                  isDeleted: false,
                })),
                selectedJo: selectedJo || null,
                isOrdinance: false,
                viewMode: viewMode,
              },
            })
            debugLogger.success('💾 lawData를 IndexedDB에 저장 완료', {
              searchId: currentSearchId,
              lawTitle: meta.lawTitle,
            })
          }
        }
      } catch (cacheError) {
        debugLogger.error('⚠️ lawData 저장 실패', cacheError)
      }

      actions.updateProgress('complete', 100)

    } catch (error) {
      reportError(
        "법령 조회",
        error instanceof Error ? error : new Error(String(error)),
        { selectedLaw, query },
        apiLogs,
      )
      throw error
    }
  }, [actions, reportError])

  // ============================================================
  // handleSearchInternal - 핵심 검색 로직
  // ============================================================
  const handleSearchInternal = useCallback(async (
    query: SearchQuery,
    signal?: AbortSignal,
    forcedMode?: 'law' | 'ai',
    skipCache?: boolean  // ✅ 캐시 건너뛰기 옵션
  ) => {
    const fullQuery = buildFullQuery(query.lawName, query.article)
    actions.setSearchQuery(fullQuery)
    actions.setUserQuery(fullQuery)
    debugLogger.info('🔍 검색 쿼리 업데이트', { fullQuery, forcedMode })

    // 검색 모드 초기화
    actions.setSearchMode('basic')

    // 자연어 검색 감지
    const hasLaw = hasLawKeyword(fullQuery)
    const hasOrdinance = hasOrdinanceKeyword(fullQuery)

    let queryDetection = detectQueryType(fullQuery)

    // 강제 모드 처리
    if (forcedMode === 'ai') {
      queryDetection = { type: 'natural', confidence: 1.0, reason: '사용자 강제 선택 (AI)' }
    } else if (forcedMode === 'law') {
      queryDetection = { type: 'structured', confidence: 1.0, reason: '사용자 강제 선택 (법령)' }
    } else {
      if (queryDetection.type !== 'natural' && (hasLaw || hasOrdinance)) {
        const isClearArticle = query.article && /^(제)?\d/.test(query.article.trim())

        if (isClearArticle) {
          queryDetection = { type: 'structured', confidence: 1.0, reason: '명확한 조문 번호 포함' }
        } else {
          const pureLawNamePattern = /^[가-힣A-Za-z0-9·\s]+(?:법률\s*시행령|법률\s*시행규칙|법\s*시행령|법\s*시행규칙|법률|법|령|규칙|조례|지침|고시|훈령|예규)$/
          const isPureLawName = pureLawNamePattern.test(fullQuery.trim())

          if (isPureLawName) {
            queryDetection = { type: 'structured', confidence: 1.0, reason: '순수 법령명' }
          } else {
            queryDetection = { type: 'structured', confidence: 0.6, reason: '법령 키워드 포함되나 조문 불분명' }
          }
        }
      }
    }

    debugLogger.info('🔍 검색 타입 감지', {
      query: fullQuery,
      type: queryDetection.type,
      confidence: queryDetection.confidence,
      reason: queryDetection.reason
    })

    // 모드 선택 다이얼로그
    if (!forcedMode && queryDetection.confidence < 0.7) {
      debugLogger.info('🤔 검색 의도 불분명 - 다이얼로그 표시')
      actions.setPendingQuery(query)
      actions.setIsSearching(false)
      actions.updateProgress('complete', 0)
      actions.setShowChoiceDialog(true)
      return
    }

    const isAiSearch = forcedMode === 'ai' || (!forcedMode && queryDetection.type === 'natural')

    // ============================================================
    // AI 검색 분기
    // ============================================================
    if (isAiSearch) {
      debugLogger.success('✨ 자연어 검색 감지 → AI 답변 모드', { query: fullQuery, skipCache })

      // RAG 캐시 확인 (skipCache가 true면 캐시 무시)
      const cached = skipCache ? null : await getCachedResponse(fullQuery)
      if (cached) {
        debugLogger.success('✅ RAG 캐시 히트 - API 호출 스킵')

        actions.setIsAiMode(true)
        actions.setSearchMode('rag')

        const relatedLaws = extractRelatedLaws(cached.response)
        actions.setAiAnswerContent(cached.response)
        actions.setAiRelatedLaws(relatedLaws)
        actions.setAiCitations(cached.citations || [])
        actions.setFileSearchFailed(false)

        const aiLawData: LawDataState = {
          meta: {
            lawId: 'ai-answer',
            lawTitle: 'AI 답변',
            promulgationDate: new Date().toISOString().split('T')[0],
            lawType: 'AI',
            isOrdinance: false,
            fetchedAt: new Date().toISOString()
          },
          articles: [],
          selectedJo: undefined,
          isOrdinance: false
        }
        actions.setLawData(aiLawData)
        actions.setMobileView("content")
        actions.setIsSearching(false)
        actions.updateProgress('complete', 100)
        return
      }

      actions.setIsSearching(true)
      actions.setIsAiMode(true)
      actions.setSearchMode('rag')
      actions.updateProgress('searching', 20)

      try {
        actions.updateProgress('parsing', 40)

        if (signal?.aborted) {
          debugLogger.info('🚫 AI 검색 취소됨')
          return
        }

        const response = await fetch('/api/file-search-rag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: fullQuery }),
          signal
        })

        if (signal?.aborted) return

        if (!response.ok) {
          throw new Error('File Search API 호출 실패')
        }

        actions.updateProgress('streaming', 60)

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()

        if (!reader) {
          throw new Error('Response body 읽기 실패')
        }

        let buffer = ''
        let fullContent = ''
        let receivedCitations: any[] = []
        let receivedConfidenceLevel: 'high' | 'medium' | 'low' = 'high'
        let receivedQueryType: 'specific' | 'general' | 'comparison' | 'procedural' = 'general'
        let progressValue = 60

        while (true) {
          if (signal?.aborted) {
            reader.cancel()
            return
          }

          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)

              if (data === '[DONE]') continue

              try {
                const parsed = JSON.parse(data)
                if (parsed.type === 'text') {
                  fullContent += parsed.text
                  progressValue = Math.min(progressValue + 1, 95)
                  actions.updateProgress('streaming', progressValue)
                } else if (parsed.type === 'citations') {
                  receivedCitations = parsed.citations || []
                  receivedConfidenceLevel = parsed.confidenceLevel || 'high'
                  receivedQueryType = parsed.queryType || 'general'
                }
              } catch (e) {
                // 파싱 에러 무시
              }
            }
          }
        }

        if (signal?.aborted) return

        const processedContent = fullContent.replace(/\^/g, ' ')
        const searchFailed = detectSearchFailed(processedContent)
        actions.setFileSearchFailed(searchFailed)

        const relatedLaws = extractRelatedLaws(processedContent)

        debugLogger.success('✅ AI 답변 완료', {
          contentLength: processedContent.length,
          relatedLaws: relatedLaws.length,
          citationsReceived: receivedCitations.length,
        })

        actions.setAiAnswerContent(processedContent)
        actions.setAiRelatedLaws(relatedLaws)
        actions.setAiCitations(receivedCitations)

        const aiLawData: LawDataState = {
          meta: {
            lawId: 'ai-answer',
            lawTitle: 'AI 답변',
            promulgationDate: new Date().toISOString().split('T')[0],
            lawType: 'AI',
            isOrdinance: false,
            fetchedAt: new Date().toISOString()
          },
          articles: [],
          selectedJo: undefined,
          isOrdinance: false
        }

        actions.setLawData(aiLawData)
        actions.setMobileView("content")

        // IndexedDB 캐시 저장
        try {
          const { saveSearchResult, getSearchResult } = await import('@/lib/search-result-store')
          const currentState = window.history.state
          const currentSearchId = currentState?.searchId

          if (currentSearchId) {
            const existingCache = await getSearchResult(currentSearchId)
            if (existingCache) {
              await saveSearchResult({
                ...existingCache,
                aiMode: {
                  aiAnswerContent: processedContent,
                  aiRelatedLaws: relatedLaws,
                  aiCitations: receivedCitations,
                  userQuery: fullQuery,
                  fileSearchFailed: searchFailed
                }
              })
            }
          }
        } catch (cacheError) {
          debugLogger.error('⚠️ AI 답변 캐시 저장 실패', cacheError)
        }

        // RAG 캐시에도 저장
        try {
          await cacheResponse(fullQuery, processedContent, receivedCitations, receivedConfidenceLevel, receivedQueryType)
        } catch (ragCacheError) {
          debugLogger.error('⚠️ RAG 캐시 저장 실패', ragCacheError)
        }

        actions.updateProgress('complete', 100)
        actions.setIsSearching(false)

      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          debugLogger.info('🚫 AI 검색이 사용자에 의해 취소되었습니다')
          actions.setIsSearching(false)
          actions.updateProgress('complete', 0)
          actions.setIsAiMode(false)
          return
        }

        debugLogger.error('❌ File Search API 오류', error)
        actions.setIsSearching(false)
        actions.updateProgress('complete', 0)
        actions.setIsAiMode(false)
        toast({
          title: "AI 검색 실패",
          description: error instanceof Error ? error.message : "AI 답변을 가져오는 데 실패했습니다.",
          variant: "destructive"
        })
      }

      return
    }

    // ============================================================
    // 기본 구조화 검색
    // ============================================================
    actions.setIsSearching(true)
    actions.updateProgress('searching', 10)
    actions.resetSearchState()

    const apiLogs: Array<{ url: string; method: string; status?: number; response?: string }> = []
    const isOrdinance = checkIsOrdinanceQuery(fullQuery)
    const lawName = query.lawName

    debugLogger.info(isOrdinance ? "조례 검색 시작" : "법령 검색 시작", { lawName })

    // Phase 7: IndexedDB 우선 체크
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
        const results = parseOrdinanceSearchXML(xmlText)
        actions.updateProgress('parsing', 80)

        if (results.length === 0) {
          reportError("조례 검색", new Error(`검색 결과를 찾을 수 없습니다: ${query.lawName}`), { query: query.lawName }, apiLogs)
          actions.updateProgress('complete', 0)
          actions.setIsSearching(false)
          return
        }

        actions.setOrdinanceSelectionState({ results, query: { lawName } })
        actions.setMobileView("list")
        actions.updateProgress('complete', 100)
        actions.setIsSearching(false)
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

  // ============================================================
  // 기타 핸들러
  // ============================================================

  const handleSearch = useCallback((query: SearchQuery) => {
    handleSearchInternal(query)
  }, [handleSearchInternal])

  const handleSearchChoice = useCallback((mode: 'law' | 'ai') => {
    actions.setShowChoiceDialog(false)
    if (state.pendingQuery) {
      handleSearchInternal(state.pendingQuery, undefined, mode)
      actions.setPendingQuery(null)
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
    }
  }, [actions, state.noResultQuery, handleSearchInternal])

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
  }, [actions, state.ordinanceSelectionState, reportError, toast])

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

  const handleCompare = useCallback((jo: string) => {
    debugLogger.info("신·구법 비교 요청", { jo })
    actions.setComparisonModal({ isOpen: true, jo })
  }, [actions])

  const handleSummarize = useCallback(async (jo: string) => {
    if (!state.lawData) return

    debugLogger.info("AI 요약 요청", { jo })

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

  const handleCitationClick = useCallback(async (lawName: string, jo: string, article: string) => {
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

  // ✅ AI 답변 강제 새로고침 (캐시 무시)
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
    handleSearchInternal,
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
    handleAiRefresh,
    fetchLawContent,
    fetchRelatedSearches,
  }
}
