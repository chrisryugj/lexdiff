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
import { detectQueryType } from "@/lib/unified-query-classifier"
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
  // ✅ 통합검색 핸들러 (신규)
  handlePrecedentSearch: (query: SearchQuery) => void
  handlePrecedentSelect: (precedentId: string) => void
  handleInterpretationSearch: (query: SearchQuery) => void
  handleRulingSearch: (query: SearchQuery) => void
  handleMultiSearch: (query: SearchQuery) => void
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
            // ✅ 법령 선택 시 query 정보도 함께 업데이트 (새로고침 시 올바른 쿼리 복원)
            const updatedQuery: SearchQuery = {
              lawName: meta.lawTitle,
              article: query.article,
              jo: query.jo,
            }

            await saveSearchResult({
              ...existingCache,
              query: updatedQuery,  // ✅ query 정보 업데이트
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
            debugLogger.success('💾 lawData + query를 IndexedDB에 저장 완료', {
              searchId: currentSearchId,
              lawTitle: meta.lawTitle,
              query: updatedQuery,
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

    // ✅ 통합검색: classification이 있으면 재감지 스킵
    const classification = (query as any).classification
    if (classification) {
      debugLogger.info('✅ 통합검색: 사전 분류 결과 사용', {
        searchType: classification.searchType,
        confidence: classification.confidence
      })

      // 판례/해석례/재결례는 handleSearchInternal이 아니라 전용 핸들러에서 처리
      // 여기 도달하면 안 되지만, 방어 코드
      if (['precedent', 'interpretation', 'ruling'].includes(classification.searchType)) {
        debugLogger.warning('⚠️  판례/해석례/재결례는 전용 핸들러를 사용해야 함')
        return
      }
    }

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
          const pureLawNamePattern = /^[가-힣A-Za-z0-9·\s]+(?:법률\s*시행령|법률\s*시행규칙|법\s*시행령|법\s*시행규칙|법률|법|령|규칙|규정|조례|지침|고시|훈령|예규)$/
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
        actions.setAiQueryType((cached.queryType || 'application') as any)  // ✅ 캐시에서 queryType 복원
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

      // ✅ AI 검색 시작 - 4단계 프로그레스 UI용
      actions.setIsSearching(true)
      actions.setIsAiMode(true)
      actions.setSearchMode('rag')
      actions.setAiAnswerContent('')  // ✅ 스트리밍 텍스트 초기화 (중복 방지)
      actions.setAiRelatedLaws([])  // ✅ 관련 법령 초기화
      actions.setAiCitations([])  // ✅ 인용 초기화
      actions.setFileSearchFailed(false)  // ✅ 검색 실패 플래그 초기화
      actions.setUserQuery(fullQuery)  // 사용자 쿼리 설정
      actions.updateProgress('analyzing', 5)  // 1단계: 질문 분석 (0-25%)

      // ✅ AI 뷰를 즉시 표시하기 위해 빈 lawData 설정
      const aiLawData: LawDataState = {
        meta: {
          lawId: 'ai-answer',
          lawTitle: 'AI 법률 어시스턴트',
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

      try {
        // ✅ 1단계: 질문 분석 (0-25%) - 1.5초 유지
        actions.updateProgress('analyzing', 5)
        if (signal?.aborted) {
          debugLogger.info('🚫 AI 검색 취소됨')
          return
        }
        await new Promise(resolve => setTimeout(resolve, 1500)) // 1.5초 대기
        if (signal?.aborted) return

        // ✅ 2단계: 법령 검색 (25-40%) - 1.5초 유지
        actions.updateProgress('searching', 25)
        if (signal?.aborted) return
        await new Promise(resolve => setTimeout(resolve, 1500)) // 1.5초 대기
        if (signal?.aborted) return

        try {
          // ✅ 3단계: 답변 생성 시작 (40%)
          actions.updateProgress('streaming', 40)
          if (signal?.aborted) return

          // ✅ 3단계 진행 중 프로그레스 시뮬레이션 (40% → 70%, API 응답 대기 중)
          let waitProgress = 40
          const waitProgressInterval = setInterval(() => {
            if (waitProgress < 70) {
              waitProgress += 1
              actions.updateProgress('streaming', waitProgress)
            }
          }, 200) // 200ms마다 1%씩 증가 (천천히, 최대 6초)

          try {
            // ✅ JSON 응답 받기 (이 부분이 오래 걸림!)
            const response = await fetch('/api/file-search-rag', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: fullQuery }),
              signal
            })

            if (signal?.aborted) {
              clearInterval(waitProgressInterval)
              return
            }

            if (!response.ok) {
              clearInterval(waitProgressInterval)
              throw new Error('File Search API 호출 실패')
            }

            // ✅ 전체 응답 파싱
            const data = await response.json()
            clearInterval(waitProgressInterval) // API 응답 받으면 인터벌 정리
            if (signal?.aborted) return

            const fullContent = data.answer || ''
            const receivedCitations = data.citations || []
            const receivedConfidenceLevel = data.confidenceLevel || 'high'
            const receivedQueryType = data.queryType || 'application'

            // ✅ 프로그레스 70% → 100% 점진적 증가
            let typingProgress = 70
            const typingProgressInterval = setInterval(() => {
              if (typingProgress < 100) {
                typingProgress += 1
                actions.updateProgress('streaming', typingProgress)
              }
            }, 100) // 100ms마다 1%씩 증가 (약 3초)

            // ✅ 즉시 전체 내용 설정 (UI에서 어절 단위 타이핑 효과 적용)
            const processedContent = fullContent.replace(/\^/g, ' ')
            actions.setAiAnswerContent(processedContent)

            // 프로그레스가 100%까지 도달할 때까지 대기
            await new Promise(resolve => setTimeout(resolve, 3000))
            clearInterval(typingProgressInterval)
            if (signal?.aborted) return

            // ✅ 4단계: 최종 검토 (100%)
            actions.updateProgress('extracting', 100)

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
            actions.setAiQueryType(receivedQueryType as any)

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

            // IndexedDB 캐시 저장 (백그라운드)
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
                      fileSearchFailed: searchFailed,
                      aiQueryType: receivedQueryType  // ✅ aiQueryType 저장
                    }
                  })
                }
              }
            } catch (cacheError) {
              debugLogger.error('⚠️ AI 답변 캐시 저장 실패', cacheError)
            }

            // RAG 캐시에도 저장 (백그라운드)
            try {
              await cacheResponse(fullQuery, processedContent, receivedCitations, receivedConfidenceLevel, receivedQueryType)
            } catch (ragCacheError) {
              debugLogger.error('⚠️ RAG 캐시 저장 실패', ragCacheError)
            }

            // ✅ 100% 완료 상태 1.5초 대기 → 로딩 UI 숨김
            await new Promise(resolve => setTimeout(resolve, 1500))  // 100% 완료 메시지 표시
            actions.setIsSearching(false)

          } catch (parseError) {
            clearInterval(waitProgressInterval) // JSON 파싱 에러 시 인터벌 정리
            throw parseError // 외부 catch로 전달
          }

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
      } catch (outerError) {
        // 외부 try-catch (최상위 에러 핸들링)
        debugLogger.error('❌ AI 검색 최상위 오류', outerError)
        actions.setIsSearching(false)
        actions.updateProgress('complete', 0)
        actions.setIsAiMode(false)
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

      // ✅ 조례 선택 시 IndexedDB에 query + lawData 저장 (새로고침 시 복원용)
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
              query: updatedQuery,  // ✅ query 정보 업데이트
              lawData: {
                meta: {
                  ordinSeq: ordinance.ordinSeq,
                  ordinId: ordinance.ordinId,
                  lawName: meta.lawTitle,
                },
                articles: articles.map(a => ({
                  joNumber: a.jo,
                  joLabel: a.joNum,
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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ✅ 통합검색 핸들러 (신규)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const handlePrecedentSearch = useCallback(async (query: SearchQuery) => {
    debugLogger.info('[통합검색] 판례 검색 실행', { query })

    try {
      // classification에서 추출한 정보 사용
      const classification = (query as any).classification
      const caseNumber = classification?.entities?.caseNumber
      const court = classification?.entities?.court
      const searchQuery = caseNumber || query.lawName || query.article || ''

      if (!searchQuery) {
        toast({
          title: "검색어 오류",
          description: "판례 검색어를 입력해주세요.",
          variant: "destructive"
        })
        return
      }

      // ✅ 판례 검색 모드로 명시적 설정 (AI 모드 비활성화)
      actions.setIsAiMode(false)
      actions.setSearchMode('law')

      // 로딩 상태로 전환
      actions.setIsSearching(true)

      // API 호출
      const params = new URLSearchParams({ query: searchQuery })
      if (court) params.append('court', court)
      if (caseNumber) params.append('caseNumber', caseNumber)

      const apiUrl = `/api/precedent-search?${params.toString()}`
      debugLogger.info('[통합검색] 판례 API 호출', { url: apiUrl })

      const res = await fetch(apiUrl)

      if (!res.ok) {
        const errorText = await res.text()
        debugLogger.error('[통합검색] 판례 API 에러', { status: res.status, error: errorText })
        throw new Error(`판례 검색 실패: ${res.status}`)
      }

      const data = await res.json()
      debugLogger.info('[통합검색] 판례 API 응답', { data })

      // 결과 표시
      if (data.precedents && data.precedents.length > 0) {
        // ✅ 상태 저장
        actions.setPrecedentResults(data.precedents)

        toast({
          title: "판례 검색 완료",
          description: `${data.precedents.length}건의 판례를 찾았습니다.`,
          variant: "default"
        })

        debugLogger.info('[통합검색] 판례 검색 결과', { count: data.precedents.length, results: data.precedents })
      } else {
        actions.setPrecedentResults([])

        toast({
          title: "검색 결과 없음",
          description: "판례를 찾을 수 없습니다.",
          variant: "default"
        })
      }
    } catch (error) {
      debugLogger.error('[통합검색] 판례 검색 실패', error)
      toast({
        title: "판례 검색 실패",
        description: error instanceof Error ? error.message : '알 수 없는 오류',
        variant: "destructive"
      })
    } finally {
      actions.setIsSearching(false)
    }
  }, [toast, actions])

  const handlePrecedentSelect = useCallback(async (precedentId: string) => {
    debugLogger.info('[통합검색] 판례 선택', { id: precedentId })

    try {
      actions.setIsSearching(true)
      actions.updateProgress('parsing', 50)

      const res = await fetch(`/api/precedent-detail?id=${precedentId}`)

      if (!res.ok) {
        throw new Error(`판례 조회 실패: ${res.status}`)
      }

      const precedent = await res.json()
      debugLogger.info('[통합검색] 판례 상세 조회 완료', { precedent })

      actions.updateProgress('parsing', 80)

      // ✅ 판례 내용을 법령 뷰어 형식으로 변환
      const { formatPrecedentDate } = await import('@/lib/precedent-parser')

      const articles = []

      // HTML 태그 정리 함수
      const cleanHtml = (text: string) => {
        return text
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/&nbsp;/g, ' ')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .trim()
      }

      // 전문에서 섹션 추출
      let sectionCounter = 1

      // 1. 판결요지 먼저 추가 (있으면)
      if (precedent.summary) {
        articles.push({
          jo: String(sectionCounter).padStart(6, '0'),
          joNum: '판결요지',
          content: cleanHtml(precedent.summary),
          title: '판결요지'
        })
        sectionCounter++
      }

      // 2. 전문 처리
      if (precedent.fullText) {
        const fullText = cleanHtml(precedent.fullText)

        // 섹션별 정규식 (【심급】, 【세목】, 【주문】, 【이유】 등)
        const sectionPattern = /【([^】]+)】/g
        const sectionTitles: string[] = []
        let match

        // 모든 섹션 제목 찾기
        while ((match = sectionPattern.exec(fullText)) !== null) {
          sectionTitles.push(match[1].trim())
        }

        if (sectionTitles.length > 0) {
          // 섹션별로 분리
          sectionTitles.forEach((title, idx) => {
            const startMarker = `【${title}】`
            const endMarker = idx < sectionTitles.length - 1 ? `【${sectionTitles[idx + 1]}】` : null

            const startIdx = fullText.indexOf(startMarker)
            if (startIdx === -1) return

            let content = endMarker
              ? fullText.substring(startIdx + startMarker.length, fullText.indexOf(endMarker))
              : fullText.substring(startIdx + startMarker.length)

            content = content.trim()
            if (content) {
              articles.push({
                jo: String(sectionCounter).padStart(6, '0'),
                joNum: title,
                content: content,
                title: title
              })
              sectionCounter++
            }
          })
        } else {
          // 섹션 구분이 없는 경우 - 전문 전체
          articles.push({
            jo: String(sectionCounter).padStart(6, '0'),
            joNum: '판결문',
            content: fullText,
            title: '판결문'
          })
        }
      }

      const lawData = {
        meta: {
          lawId: `prec-${precedentId}`,
          lawTitle: precedent.name,
          promulgationDate: formatPrecedentDate(precedent.date),
          lawType: `${precedent.court} ${precedent.judgmentType}`,
          isOrdinance: false,
          fetchedAt: new Date().toISOString(),
          caseNumber: precedent.caseNumber
        },
        articles,
        selectedJo: undefined,
        viewMode: 'full' as const,
        isPrecedent: true
      }

      actions.setLawData(lawData)
      actions.setPrecedentResults(null)  // 검색 결과 숨기기
      actions.setMobileView("content")
      actions.updateProgress('complete', 100)

      debugLogger.success('[통합검색] 판례 뷰어 표시 완료')
    } catch (error) {
      debugLogger.error('[통합검색] 판례 조회 실패', error)
      toast({
        title: "판례 조회 실패",
        description: error instanceof Error ? error.message : '알 수 없는 오류',
        variant: "destructive"
      })
    } finally {
      actions.setIsSearching(false)
    }
  }, [toast, actions])

  const handleInterpretationSearch = useCallback(async (query: SearchQuery) => {
    debugLogger.info('[통합검색] 해석례 검색 실행', { query })

    try {
      const classification = (query as any).classification
      const ruleType = classification?.entities?.ruleType
      const lawName = classification?.entities?.lawName || query.lawName
      const searchQuery = lawName || query.article || ''

      if (!searchQuery) {
        toast({
          title: "검색어 오류",
          description: "해석례 검색어를 입력해주세요.",
          variant: "destructive"
        })
        return
      }

      // ✅ 해석례 검색 모드로 명시적 설정
      actions.setIsAiMode(false)
      actions.setSearchMode('law')

      actions.setIsSearching(true)

      const params = new URLSearchParams({ query: searchQuery })
      if (ruleType) params.append('ruleType', ruleType)

      const res = await fetch(`/api/interpretation-search?${params.toString()}`)

      if (!res.ok) {
        throw new Error(`해석례 검색 실패: ${res.status}`)
      }

      const data = await res.json()

      if (data.interpretations && data.interpretations.length > 0) {
        toast({
          title: "⚠️ 해석례 검색 기능 준비 중",
          description: `${data.interpretations.length}건의 해석례를 찾았지만, 표시 화면이 아직 구현되지 않았습니다.`,
          variant: "default"
        })
        debugLogger.info('[통합검색] 해석례 검색 결과', { count: data.interpretations.length })
      } else {
        toast({
          title: "검색 결과 없음",
          description: "해석례를 찾을 수 없습니다.",
          variant: "default"
        })
      }

      actions.resetToHome()
    } catch (error) {
      debugLogger.error('[통합검색] 해석례 검색 실패', error)
      toast({
        title: "해석례 검색 실패",
        description: error instanceof Error ? error.message : '알 수 없는 오류',
        variant: "destructive"
      })
    } finally {
      actions.setIsSearching(false)
    }
  }, [toast, actions])

  const handleRulingSearch = useCallback(async (query: SearchQuery) => {
    debugLogger.info('[통합검색] 재결례 검색 실행', { query })

    try {
      const classification = (query as any).classification
      const rulingNumber = classification?.entities?.rulingNumber
      const searchQuery = rulingNumber || query.lawName || ''

      if (!searchQuery) {
        toast({
          title: "검색어 오류",
          description: "재결례 검색어를 입력해주세요.",
          variant: "destructive"
        })
        return
      }

      // ✅ 재결례 검색 모드로 명시적 설정
      actions.setIsAiMode(false)
      actions.setSearchMode('law')

      actions.setIsSearching(true)

      const res = await fetch(`/api/ruling-search?query=${encodeURIComponent(searchQuery)}`)

      if (!res.ok) {
        throw new Error(`재결례 검색 실패: ${res.status}`)
      }

      const data = await res.json()

      if (data.rulings && data.rulings.length > 0) {
        toast({
          title: "재결례 검색 완료",
          description: `${data.rulings.length}건의 재결례를 찾았습니다.`,
          variant: "default"
        })
        debugLogger.info('[통합검색] 재결례 검색 결과', { count: data.rulings.length })
      } else {
        toast({
          title: "검색 결과 없음",
          description: "재결례를 찾을 수 없습니다.",
          variant: "default"
        })
      }
    } catch (error) {
      debugLogger.error('[통합검색] 재결례 검색 실패', error)
      toast({
        title: "재결례 검색 실패",
        description: error instanceof Error ? error.message : '알 수 없는 오류',
        variant: "destructive"
      })
    } finally {
      actions.setIsSearching(false)
    }
  }, [toast, actions])

  const handleMultiSearch = useCallback(async (query: SearchQuery) => {
    debugLogger.info('[통합검색] 복합 검색 실행', { query })

    try {
      const classification = (query as any).classification
      const secondaryTypes = classification?.secondaryTypes || []

      if (secondaryTypes.length === 0) {
        toast({
          title: "복합 검색 오류",
          description: "검색 타입을 확인할 수 없습니다.",
          variant: "destructive"
        })
        return
      }

      actions.setIsSearching(true)

      toast({
        title: "복합 검색 시작",
        description: `${secondaryTypes.length}개 소스에서 검색 중...`,
        variant: "default"
      })

      // 병렬 검색 실행
      const promises = secondaryTypes.map(async (type: string) => {
        switch (type) {
          case 'law':
            return handleSearch(query)
          case 'precedent':
            return handlePrecedentSearch(query)
          case 'interpretation':
            return handleInterpretationSearch(query)
          case 'ruling':
            return handleRulingSearch(query)
          default:
            return Promise.resolve()
        }
      })

      await Promise.all(promises)

      debugLogger.info('[통합검색] 복합 검색 완료', { types: secondaryTypes })
    } catch (error) {
      debugLogger.error('[통합검색] 복합 검색 실패', error)
      toast({
        title: "복합 검색 실패",
        description: error instanceof Error ? error.message : '알 수 없는 오류',
        variant: "destructive"
      })
    } finally {
      actions.setIsSearching(false)
    }
  }, [toast, actions, handleSearch, handlePrecedentSearch, handleInterpretationSearch, handleRulingSearch])

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
    // ✅ 통합검색 핸들러
    handlePrecedentSearch,
    handlePrecedentSelect,
    handleInterpretationSearch,
    handleRulingSearch,
    handleMultiSearch,
  }
}
