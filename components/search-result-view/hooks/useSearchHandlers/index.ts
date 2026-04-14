/**
 * useSearchHandlers/index.ts
 *
 * 검색 핸들러 훅 - 메인 오케스트레이터
 * 분리된 모듈들을 조합하여 SearchHandlers 인터페이스 제공
 */

import { useCallback } from "react"
import { useToast } from "@/hooks/use-toast"
import { useErrorReportStore } from "@/lib/error-report-store"
import { debugLogger } from "@/lib/debug-logger"
import { detectQueryType } from "@/lib/unified-query-classifier"
import { buildFullQuery, hasLawKeyword, hasOrdinanceKeyword } from "../../utils"

import { useFetchLawContent } from "./useFetchLawContent"
import { useAiSearch } from "./useAiSearch"
import { useBasicSearch } from "./useBasicSearch"
import { useUnifiedSearch } from "./useUnifiedSearch"
import { useBasicHandlers } from "./useBasicHandlers"
import { isPureLawName, isAdminRuleName } from "@/src/domain/patterns/LawPattern"

import type { UseSearchHandlersProps, SearchHandlers, HandlerDeps, SearchQuery } from "./types"

// Re-export types
export type { UseSearchHandlersProps, SearchHandlers }

export function useSearchHandlers({
  state,
  actions,
  onBack,
  searchId,
  onPrecedentSelect,
}: UseSearchHandlersProps): SearchHandlers {
  const { toast } = useToast()
  const { reportError } = useErrorReportStore()

  // 공통 의존성 객체
  const deps: HandlerDeps = {
    state,
    actions,
    toast,
    reportError,
    searchId,
    onBack,
    onPrecedentSelect,
  }

  // 1. 법령 본문 조회
  const { fetchLawContent } = useFetchLawContent(deps)

  // 2. AI 검색 + 연속 대화
  const { handleAiSearch, handleFollowUp, handleNewConversation, stopAiSearch } = useAiSearch(deps)

  // 3. 기본 구조화 검색
  const { handleBasicSearch } = useBasicSearch({ ...deps, fetchLawContent })

  // ============================================================
  // handleSearchInternal - 핵심 검색 로직 (AI vs 구조화 분기)
  // ============================================================
  const handleSearchInternal = useCallback(async (
    query: SearchQuery,
    signal?: AbortSignal,
    forcedMode?: 'law' | 'ai',
    skipCache?: boolean
  ) => {
    // query 객체에 forcedMode가 있으면 사용 (search-result-view에서 직접 호출 시)
    const effectiveForcedMode = forcedMode || query.forcedMode
    const fullQuery = buildFullQuery(query.lawName, query.article)
    actions.setSearchQuery(fullQuery)
    actions.setUserQuery(query.rawQuery || fullQuery)
    debugLogger.info('🔍 검색 쿼리 업데이트', { fullQuery, forcedMode: effectiveForcedMode })

    // 새 검색 시작 시 이전 AI 답변/도구 로그 즉시 클리어
    // (in-flight 응답을 기다리는 동안 이전 결과가 화면에 남는 UX 혼란 방지)
    actions.setAiAnswerContent('')
    actions.setAiRelatedLaws([])
    actions.setAiCitations([])
    actions.clearToolCallLogs()
    actions.setFileSearchFailed(false)
    actions.clearConversation()

    // 통합검색: classification이 있으면 재감지 스킵
    const classification = query.classification
    if (classification) {
      debugLogger.info('✅ 통합검색: 사전 분류 결과 사용', {
        searchType: classification.searchType,
        confidence: classification.confidence
      })

      if (['precedent', 'interpretation', 'ruling'].includes(classification.searchType)) {
        debugLogger.warning('⚠️ 판례/해석례/재결례는 전용 핸들러를 사용해야 함')
        return
      }

      // AI 분류는 바로 AI 경로로 (재감지로 떨어뜨리지 말 것 — 자연어 질문 오파싱 위험)
      if (classification.searchType === 'ai') {
        debugLogger.info('✅ 사전 분류 AI → 재감지 스킵', { confidence: classification.confidence })
        const aiQuery = query.rawQuery || fullQuery
        await handleAiSearch(aiQuery, signal, skipCache)
        return
      }

      // 행정규칙/법령/조례는 classification을 신뢰 → 재감지 스킵
      if (['admrul', 'law', 'ordinance'].includes(classification.searchType) && classification.confidence >= 0.9) {
        debugLogger.info('✅ 사전 분류 고신뢰 → 재감지 스킵', { searchType: classification.searchType })
        const isAiSearch = effectiveForcedMode === 'ai'
        if (isAiSearch) {
          const aiQuery = query.rawQuery || fullQuery
          await handleAiSearch(aiQuery, signal, skipCache)
        } else {
          await handleBasicSearch(query, fullQuery, skipCache)
        }
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
    if (effectiveForcedMode === 'ai') {
      queryDetection = { type: 'natural', confidence: 1.0, reason: '사용자 강제 선택 (AI)' }
    } else if (effectiveForcedMode === 'law') {
      queryDetection = { type: 'structured', confidence: 1.0, reason: '사용자 강제 선택 (법령)' }
    } else {
      if (queryDetection.type !== 'natural' && (hasLaw || hasOrdinance)) {
        const isClearArticle = query.article && /^(제)?\d/.test(query.article.trim())

        if (isClearArticle) {
          queryDetection = { type: 'structured', confidence: 1.0, reason: '명확한 조문 번호 포함' }
        } else {
          const isPure = isPureLawName(fullQuery.trim()) || isAdminRuleName(fullQuery.trim())

          if (isPure) {
            queryDetection = { type: 'structured', confidence: 1.0, reason: '순수 법령명/행정규칙명' }
          } else if (hasOrdinance && /휴가|수당|근무|복무|급여|연차|보수|징계|임용|승진|전보|파견|겸직/.test(fullQuery)) {
            // 조례 + 주제 키워드 → 기본 조례 검색(키워드 매칭)으로는 내용 검색 불가 → AI 검색 필요
            queryDetection = { type: 'natural', confidence: 0.9, reason: '조례 + 주제 키워드 (AI 검색 필요)' }
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
    // ✅ 수정: classification이 'ai'이거나 queryDetection이 'natural'이면 다이얼로그 안 띄움
    const effectiveConfidence = classification ? classification.confidence : queryDetection.confidence
    const isAiClassified = classification?.searchType === 'ai' || query.searchType === 'ai' || queryDetection.type === 'natural'

    if (!effectiveForcedMode && !isAiClassified && effectiveConfidence < 0.7) {
      debugLogger.info('🤔 검색 의도 불분명 - 다이얼로그 표시', {
        effectiveConfidence,
        hasClassification: !!classification,
        isAiClassified
      })
      actions.setPendingQuery(query)
      actions.setIsSearching(false)
      actions.updateProgress('complete', 0)
      actions.setShowChoiceDialog(true)
      return
    }

    // ✅ 수정: classification.searchType도 고려 (기존에는 queryDetection만 체크)
    const isAiSearch = effectiveForcedMode === 'ai' || (!effectiveForcedMode && isAiClassified)

    debugLogger.info('🔍 최종 검색 모드 결정', {
      isAiSearch,
      effectiveForcedMode,
      isAiClassified,
      classificationSearchType: classification?.searchType,
      queryDetectionType: queryDetection.type
    })

    // AI 검색 vs 기본 검색 분기
    if (isAiSearch) {
      // AI 검색에는 원본 쿼리 전달 (파싱으로 자연어 부분 잘리지 않도록)
      const aiQuery = query.rawQuery || fullQuery
      await handleAiSearch(aiQuery, signal, skipCache)
    } else {
      await handleBasicSearch(query, fullQuery, skipCache)
    }
  }, [actions, handleAiSearch, handleBasicSearch])

  // 4. 기본 핸들러들
  const basicHandlers = useBasicHandlers({
    ...deps,
    fetchLawContent,
    handleSearchInternal,
  })

  // 5. 통합검색 핸들러 (판례/해석례/재결례)
  const unifiedHandlers = useUnifiedSearch({
    ...deps,
    handleSearch: basicHandlers.handleSearch,
    handleSearchInternal,
  })

  return {
    // 검색 핸들러
    handleSearch: basicHandlers.handleSearch,
    handleSearchInternal,
    handleSearchChoice: basicHandlers.handleSearchChoice,
    handleNoResultChoice: basicHandlers.handleNoResultChoice,

    // 선택 핸들러
    handleLawSelect: basicHandlers.handleLawSelect,
    handleOrdinanceSelect: basicHandlers.handleOrdinanceSelect,
    handleRecentSelect: basicHandlers.handleRecentSelect,
    handleFavoriteSelect: basicHandlers.handleFavoriteSelect,

    // 액션 핸들러
    handleCompare: basicHandlers.handleCompare,
    handleSummarize: basicHandlers.handleSummarize,
    handleToggleFavorite: basicHandlers.handleToggleFavorite,
    handleCitationClick: basicHandlers.handleCitationClick,
    handleReset: basicHandlers.handleReset,
    handleFavoritesClick: basicHandlers.handleFavoritesClick,

    // AI 연속 대화
    handleAiFollowUp: handleFollowUp,
    handleNewConversation,
    stopAiSearch,

    // 조문 화면에서 AI 질의 시작 (추천 질의 칩 / 직접 입력)
    // preEvidence: 이미 가진 조문 데이터 → FC-RAG에 전달 → 도구 호출 0회 즉답
    handleAiQuery: useCallback((query: string, preEvidence?: string) => {
      handleAiSearch(query, undefined, true, null, preEvidence)
    }, [handleAiSearch]),

    // 새로고침 핸들러
    handleAiRefresh: basicHandlers.handleAiRefresh,
    handleRefresh: unifiedHandlers.handleRefresh,

    // 데이터 조회
    fetchLawContent,
    fetchRelatedSearches: basicHandlers.fetchRelatedSearches,

    // 통합검색 핸들러
    handlePrecedentSearch: unifiedHandlers.handlePrecedentSearch,
    handlePrecedentSelect: unifiedHandlers.handlePrecedentSelect,
    handlePrecedentPageChange: unifiedHandlers.handlePrecedentPageChange,
    handlePrecedentPageSizeChange: unifiedHandlers.handlePrecedentPageSizeChange,
    handleInterpretationSearch: unifiedHandlers.handleInterpretationSearch,
    handleRulingSearch: unifiedHandlers.handleRulingSearch,
    handleMultiSearch: unifiedHandlers.handleMultiSearch,

    // 조례 페이지네이션
    handleOrdinancePageChange: unifiedHandlers.handleOrdinancePageChange,
    handleOrdinancePageSizeChange: unifiedHandlers.handleOrdinancePageSizeChange,
  }
}
