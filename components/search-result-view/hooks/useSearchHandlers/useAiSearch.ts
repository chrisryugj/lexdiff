/**
 * useSearchHandlers/useAiSearch.ts
 *
 * AI 검색 (RAG) 로직
 */

import { useCallback } from "react"
import { debugLogger } from "@/lib/debug-logger"
import { extractRelatedLaws } from "@/lib/law-parser"
import { getCachedResponse, cacheResponse } from "@/lib/rag-response-cache"
import { detectSearchFailed } from "../../utils"
import type { HandlerDeps, SearchQuery, LawDataState } from "./types"

export function useAiSearch(deps: HandlerDeps) {
  const { actions, toast } = deps

  const handleAiSearch = useCallback(async (
    fullQuery: string,
    signal?: AbortSignal,
    skipCache?: boolean
  ) => {
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
      actions.setAiQueryType((cached.queryType || 'application') as any)
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

    // AI 검색 시작 - 4단계 프로그레스 UI용
    actions.setIsSearching(true)
    actions.setIsAiMode(true)
    actions.setSearchMode('rag')
    actions.setAiAnswerContent('')
    actions.setAiRelatedLaws([])
    actions.setAiCitations([])
    actions.setFileSearchFailed(false)
    actions.setUserQuery(fullQuery)
    actions.updateProgress('analyzing', 5)

    // AI 뷰를 즉시 표시하기 위해 빈 lawData 설정
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
      // 1단계: 질문 분석 (0-25%) - 1.5초 유지
      actions.updateProgress('analyzing', 5)
      if (signal?.aborted) {
        debugLogger.info('🚫 AI 검색 취소됨')
        return
      }
      await new Promise(resolve => setTimeout(resolve, 1500))
      if (signal?.aborted) return

      // 2단계: 법령 검색 (25-40%) - 1.5초 유지
      actions.updateProgress('searching', 25)
      if (signal?.aborted) return
      await new Promise(resolve => setTimeout(resolve, 1500))
      if (signal?.aborted) return

      try {
        // 3단계: 답변 생성 시작 (40%)
        actions.updateProgress('streaming', 40)
        if (signal?.aborted) return

        // 3단계 진행 중 프로그레스 시뮬레이션 (40% → 70%, API 응답 대기 중)
        // 복합 질문(위임/개정/해석 등)은 멀티턴으로 더 오래 걸리므로 타이머 느리게
        const isLikelyComplex = /(?:하고|와\s*함께|판례도|전후\s*비교|비교해|변경.{0,5}판례|개정.{0,5}판례)/.test(fullQuery)
          || fullQuery.length > 100
          || (fullQuery.match(/「([^」]+)」/g) || []).length > 1
        const isLikelyModerate = /(?:위임|시행령|시행규칙|해석례|유권해석|이력|변경|개정|바뀐|신구|대조)/.test(fullQuery)
          || fullQuery.length > 50
        const progressInterval = isLikelyComplex ? 400 : isLikelyModerate ? 300 : 200

        let waitProgress = 40
        const waitProgressInterval = setInterval(() => {
          if (waitProgress < 70) {
            waitProgress += 1
            actions.updateProgress('streaming', waitProgress)
          }
        }, progressInterval)

        try {
          // BYO-Key: sessionStorage에서 읽기 (있으면 헤더에 포함)
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          try {
            const userKey = sessionStorage.getItem('lexdiff-gemini-api-key')
            if (userKey) headers['X-User-API-Key'] = userKey
          } catch { /* SSR or private browsing */ }

          const response = await fetch('/api/fc-rag', {
            method: 'POST',
            headers,
            body: JSON.stringify({ query: fullQuery }),
            signal
          })

          if (signal?.aborted) {
            clearInterval(waitProgressInterval)
            return
          }

          if (!response.ok) {
            clearInterval(waitProgressInterval)
            throw new Error('AI 검색 API 호출 실패')
          }

          // 전체 응답 파싱
          const data = await response.json()
          clearInterval(waitProgressInterval)
          if (signal?.aborted) return

          const fullContent = data.answer || ''
          const receivedCitations = data.citations || []
          const receivedConfidenceLevel = data.confidenceLevel || 'high'
          const receivedQueryType = data.queryType || 'application'

          // 프로그레스 70% → 100% 점진적 증가
          let typingProgress = 70
          const typingProgressInterval = setInterval(() => {
            if (typingProgress < 100) {
              typingProgress += 1
              actions.updateProgress('streaming', typingProgress)
            }
          }, 100)

          // 즉시 전체 내용 설정 (UI에서 어절 단위 타이핑 효과 적용)
          const processedContent = fullContent.replace(/\^/g, ' ')

          // 프로그레스가 100%까지 도달할 때까지 대기
          await new Promise(resolve => setTimeout(resolve, 3000))
          clearInterval(typingProgressInterval)
          if (signal?.aborted) return

          // 4단계: 최종 검토 (100%)
          actions.updateProgress('extracting', 100)

          const searchFailed = detectSearchFailed(processedContent)
          actions.setFileSearchFailed(searchFailed)

          const relatedLaws = extractRelatedLaws(processedContent)

          debugLogger.success('✅ AI 답변 완료', {
            contentLength: processedContent.length,
            relatedLaws: relatedLaws.length,
            citationsReceived: receivedCitations.length,
          })

          // ✅ 최종 상태 설정 (한 번만 호출)
          actions.setAiAnswerContent(processedContent)
          actions.setAiRelatedLaws(relatedLaws)
          actions.setAiCitations(receivedCitations)
          actions.setAiQueryType(receivedQueryType as any)

          const finalAiLawData: LawDataState = {
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

          actions.setLawData(finalAiLawData)
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
                    aiQueryType: receivedQueryType
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

          // 100% 완료 상태 1.5초 대기 → 로딩 UI 숨김
          await new Promise(resolve => setTimeout(resolve, 1500))
          actions.setIsSearching(false)

        } catch (parseError) {
          clearInterval(waitProgressInterval)
          throw parseError
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
      debugLogger.error('❌ AI 검색 최상위 오류', outerError)
      actions.setIsSearching(false)
      actions.updateProgress('complete', 0)
      actions.setIsAiMode(false)
    }
  }, [actions, toast])

  return { handleAiSearch }
}
