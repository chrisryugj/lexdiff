/**
 * search-result-view/index.tsx
 *
 * 검색 결과 화면 메인 컨테이너
 * - 분리된 훅과 컴포넌트를 조합
 * - 기존 @/components/search-result-view 경로 유지
 */

"use client"

import { useEffect, useState, useRef, useMemo, useCallback, memo, useDeferredValue } from "react"
import dynamic from "next/dynamic"
import { FloatingCompactHeader } from "@/components/floating-compact-header"
import { CommandSearchModal } from "@/components/command-search-modal"
import { SearchBar } from "@/components/search-bar"
import { LawViewer } from "@/components/law-viewer"
import { ErrorReportDialog } from "@/components/error-report-dialog"
import { ArticleNotFoundBanner } from "@/components/article-not-found-banner"
import { LawViewerSkeleton } from "@/components/law-viewer-skeleton"
import { AiAuthFallback } from "@/components/ai-auth-fallback"
import { Icon } from "@/components/ui/icon"
import { formatJO } from "@/lib/law-parser"
import { debugLogger } from "@/lib/debug-logger"
import { toast } from "@/hooks/use-toast"
import type { VerifiedCitation } from "@/lib/citation-verifier"
import type { LawMeta } from "@/lib/law-types"
import type { PrecedentSearchResult } from "@/lib/precedent-parser"
import type { ParsedRelatedLaw } from "@/lib/law-parser"

// Dynamic imports for modals
const ComparisonModal = dynamic(
  () => import("@/components/comparison-modal").then(m => m.ComparisonModal),
  { ssr: false }
)
const AISummaryDialog = dynamic(
  () => import("@/components/ai-summary-dialog").then(m => m.AISummaryDialog),
  { ssr: false }
)
const FavoritesDialog = dynamic(
  () => import("@/components/favorites-dialog").then(m => m.FavoritesDialog),
  { ssr: false }
)
const HelpGuideSheet = dynamic(
  () => import("@/components/help-guide-sheet").then(m => m.HelpGuideSheet),
  { ssr: false }
)
const DelegationGapModal = dynamic(
  () => import("@/components/delegation-gap-modal").then(m => m.DelegationGapModal),
  { ssr: false }
)
const TimeMachineModal = dynamic(
  () => import("@/components/time-machine-modal").then(m => m.TimeMachineModal),
  { ssr: false }
)

// Local imports
import { useSearchState } from "./hooks/useSearchState"
import { useSearchHandlers } from "./hooks/useSearchHandlers"
import { LawSearchResultList, OrdinanceSearchResultList, InterpretationResultList, RulingResultList } from "./SearchResultList"
import { PrecedentResultList } from "./PrecedentResultList"
import { SearchChoiceDialog, NoResultDialog } from "./SearchDialogs"
import type { SearchResultViewProps, InterpretationSearchResult, RulingSearchResult } from "./types"

// Re-export types
export type { SearchResultViewProps } from "./types"

function SearchResultViewComponent({
  searchId,
  onBack,
  onHomeClick,
  onProgressUpdate,
  onModeChange,
  onPrecedentSelect,
  initialSearchMode,
  initialPrecedentId,
  onImpactTracker,
  onOrdinanceBenchmark,
}: SearchResultViewProps) {
  // ============================================================
  // 상태 관리 훅
  // ============================================================
  const [state, actions] = useSearchState({
    initialSearchMode,
    onProgressUpdate,
    onModeChange,
  })

  // 도움말 Sheet 상태
  const [helpSheetOpen, setHelpSheetOpen] = useState(false)
  // AI 게이트는 전역 AiGateProvider가 관리 — 이벤트 발송으로 다이얼로그 오픈
  const openLoginDialog = useCallback(() => {
    window.dispatchEvent(new CustomEvent('lexdiff:ai-gate-required', { detail: {} }))
  }, [])

  // 📊 분석 도구 모달 상태
  const [delegationGapModal, setDelegationGapModal] = useState<{ isOpen: boolean; meta: LawMeta | null }>({
    isOpen: false, meta: null,
  })
  const [timeMachineModal, setTimeMachineModal] = useState<{ isOpen: boolean; meta: LawMeta | null }>({
    isOpen: false, meta: null,
  })

  // ============================================================
  // 스트리밍 핫패스 최적화: 고빈도 업데이트를 낮은 우선순위로 분리
  // → 나머지 UI(헤더, 검색바, 사이드바)는 즉시 반응 유지
  // ============================================================
  const deferredAiContent = useDeferredValue(state.aiAnswerContent)
  const deferredToolCallLogs = useDeferredValue(state.toolCallLogs)

  // ============================================================
  // 핸들러 훅
  // ============================================================
  const handlers = useSearchHandlers({
    state,
    actions,
    onBack,
    searchId,
    onPrecedentSelect,
  })

  // ============================================================
  // searchId로부터 데이터 복원
  // ============================================================
  useEffect(() => {
    let isSubscribed = true
    let abortController: AbortController | null = null

    const loadSearchResult = async () => {
      // ✅ 이미 판례 상세가 로드된 상태면 복원 스킵 (handlePrecedentSelect에서 직접 로드한 경우)
      if (state.lawData?.isPrecedent) {
        debugLogger.info('⏭️ 판례 상세 이미 로드됨 - 복원 스킵')
        return
      }

      try {
        const { getSearchResult } = await import('@/lib/search-result-store')
        const cached = await getSearchResult(searchId)

        if (!isSubscribed) return

        if (!cached) {
          debugLogger.warning('❌ 검색 결과 없음', { searchId })
          return
        }

        debugLogger.info('📦 IndexedDB에서 데이터 복원', {
          query: cached.query,
          hasLawData: !!cached.lawData,
          hasPrecedentDetail: !!cached.precedentDetail,
          initialPrecedentId
        })

        actions.setSearchQuery(cached.query.lawName || '')

        // 캐시 복원 공통 헬퍼 (setIsCacheHit → progress → data restore → cleanup)
        const restoreFromCache = (label: string, restoreData: () => void, delayMs = 300) => {
          debugLogger.success(`✅ ${label} 캐시 HIT`)
          actions.setIsCacheHit(true)
          actions.setIsSearching(true)
          actions.updateProgress('parsing', 95)
          restoreData()
          actions.updateProgress('complete', 100)
          // M9: 캐시 히트 토스트로 사용자에게 명시적 피드백 제공
          toast({
            title: '캐시에서 불러옴',
            description: `${label} — 즉시 복원됨`,
            duration: 2000,
          })
          setTimeout(() => {
            actions.setIsCacheHit(false)
            actions.setIsSearching(false)
          }, delayMs)
        }

        // 판례 상세 복원 (새로고침 시)
        if (initialPrecedentId && cached.precedentDetail && cached.precedentDetail.id === initialPrecedentId) {
          const detail = cached.precedentDetail
          restoreFromCache('판례 상세', () => {
            actions.setLawData(detail.lawData)
            actions.setPrecedentResults(null)
            actions.setMobileView("content")
          })
          return
        }

        // 판례 검색 결과 복원
        if (cached.precedentResults && cached.precedentResults.length > 0 && !initialPrecedentId) {
          const results = cached.precedentResults
          restoreFromCache('판례 검색 결과', () => {
            actions.setPrecedentResults(results as unknown as PrecedentSearchResult[])
            actions.setLawData(null)
            actions.setMobileView("list")
          })
          return
        }

        // 해석례 검색 결과 복원
        if (cached.interpretationResults && cached.interpretationResults.length > 0 && !initialPrecedentId) {
          const results = cached.interpretationResults
          restoreFromCache('해석례 검색결과', () => {
            actions.setInterpretationResults(results as InterpretationSearchResult[])
            actions.setLawData(null)
            actions.setMobileView("list")
          })
          return
        }

        // 재결례 검색 결과 복원
        if (cached.rulingResults && cached.rulingResults.length > 0 && !initialPrecedentId) {
          const results = cached.rulingResults
          restoreFromCache('재결례 검색결과', () => {
            actions.setRulingResults(results as RulingSearchResult[])
            actions.setLawData(null)
            actions.setMobileView("list")
          })
          return
        }

        // 조례 검색 결과 복원
        const historyState = window.history.state
        if (cached.ordinanceSelectionState && !historyState?.hasOrdinanceDetail) {
          const ordState = cached.ordinanceSelectionState
          restoreFromCache('조례 검색 결과', () => {
            const ordinanceResults = ordState.results.map(o => ({
              ordinSeq: o.자치법규ID,
              ordinName: o.자치법규명,
              ordinId: o.자치법규ID,
              promulgationDate: o.공포일자,
            }))
            actions.setOrdinanceSelectionState({
              results: ordinanceResults,
              totalCount: ordinanceResults.length,
              query: { lawName: ordState.query }
            })
            actions.setLawData(null)
            actions.setMobileView("list")
          })
          return
        }

        // AI 모드 캐시 복원
        if (cached.aiMode) {
          const ai = cached.aiMode
          restoreFromCache('AI 답변', () => {
            actions.setIsAiMode(true)
            actions.setAiAnswerContent(ai.aiAnswerContent)
            actions.setAiRelatedLaws(ai.aiRelatedLaws as ParsedRelatedLaw[])
            actions.setAiCitations((ai.aiCitations || []) as VerifiedCitation[])
            actions.setUserQuery(ai.userQuery || cached.query.lawName)
            actions.setFileSearchFailed(ai.fileSearchFailed || false)
            actions.setAiQueryType(ai.aiQueryType || 'application')

            actions.setLawData({
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
            })
            actions.setMobileView("content")
          })
          return
        }

        // lawData 캐시 복원
        if (cached.lawData) {
          debugLogger.success('✅ lawData 캐시 HIT - API 호출 없음')

          actions.setIsCacheHit(true)
          actions.setIsSearching(true)
          actions.updateProgress('parsing', 95)

          actions.setLawData({
            meta: {
              lawId: cached.lawData.meta.lawId || '',
              lawTitle: cached.lawData.meta.lawName,
              latestEffectiveDate: '',
              promulgation: { date: '', number: '' },
              revisionType: '',
              fetchedAt: new Date().toISOString(),
              mst: cached.lawData.meta.mst,
            },
            articles: cached.lawData.articles.map(a => ({
              jo: a.joNumber,
              joNum: a.joLabel,
              title: a.title || '',
              content: a.content,
              isPreamble: false,
            })),
            selectedJo: cached.lawData.selectedJo || undefined,
            isOrdinance: cached.lawData.isOrdinance,
            viewMode: cached.lawData.viewMode || 'full',
            searchQueryId: cached.lawData.searchQueryId,
            searchResultId: cached.lawData.searchResultId,
          })

          actions.updateProgress('complete', 100)
          setTimeout(() => {
            actions.setIsCacheHit(false)
            actions.setIsSearching(false)
          }, 500)
        } else {
          // lawData가 없으면 검색 실행
          debugLogger.info('📡 lawData 없음 - 검색 시작', cached.query)

          abortController = new AbortController()

          actions.setIsSearching(true)
          actions.updateProgress('searching', 20)

          // ✅ 통합검색 분기
          const classification = cached.query.classification
          if (classification && ['precedent', 'interpretation', 'ruling', 'multi'].includes(classification.searchType)) {
            // 판례/해석례/재결례/복합은 handleSearchInternal 스킵하고 전용 핸들러 사용
            debugLogger.info('📡 캐시 복원: 전용 핸들러 실행', { searchType: classification.searchType })
            // 핸들러가 자체적으로 setIsSearching(false) 처리함
            switch (classification.searchType) {
              case 'precedent': handlers.handlePrecedentSearch(cached.query); break
              case 'interpretation': handlers.handleInterpretationSearch(cached.query); break
              case 'ruling': handlers.handleRulingSearch(cached.query); break
              case 'multi': handlers.handleMultiSearch(cached.query); break
            }
          } else {
            await handlers.handleSearchInternal(cached.query, abortController.signal)
          }
        }
      } catch (error) {
        if (!isSubscribed) return
        debugLogger.error('❌ 검색 결과 로드 실패', error)
        actions.setIsSearching(false)
        actions.updateProgress('complete', 0)
      }
    }

    if (searchId) {
      loadSearchResult()
    }

    return () => {
      isSubscribed = false
      if (abortController) {
        debugLogger.info('🚫 검색 취소 (페이지 이동)', { searchId })
        abortController.abort()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchId, initialPrecedentId])

  // ============================================================
  // 뒤로가기로 판례 상세 → 검색 결과 복원
  // ============================================================
  const prevInitialPrecedentIdRef = useRef<string | null | undefined>(initialPrecedentId)
  useEffect(() => {
    // initialPrecedentId가 값→null로 "변경"된 경우만 복원 (뒤로가기)
    // 처음부터 null인 경우나, 방금 설정된 경우는 무시
    const wasSet = prevInitialPrecedentIdRef.current !== null && prevInitialPrecedentIdRef.current !== undefined
    const isNowNull = initialPrecedentId === null
    prevInitialPrecedentIdRef.current = initialPrecedentId

    if (wasSet && isNowNull && state.lawData?.isPrecedent) {
      debugLogger.info('⬅️ 판례 상세 → 검색 결과 복원 시도')

      const restorePrecedentResults = async () => {
        const { getSearchResult } = await import('@/lib/search-result-store')
        const cached = await getSearchResult(searchId)

        if (cached?.precedentResults && cached.precedentResults.length > 0) {
          debugLogger.success('✅ 판례 검색 결과 복원')
          actions.setPrecedentResults(cached.precedentResults as unknown as PrecedentSearchResult[])
          actions.setLawData(null)
          actions.setMobileView("list")
        }
      }

      restorePrecedentResults()
    }
  }, [initialPrecedentId, searchId, state.lawData?.isPrecedent, actions])

  // ============================================================
  // 공유 헬퍼: 검색 타입별 분기
  // ============================================================
  const handleSearchDispatch = useCallback((query: Parameters<typeof handlers.handleSearch>[0] & { classification?: { searchType?: string } }) => {
    if (query.classification) {
      switch (query.classification.searchType) {
        case 'precedent': handlers.handlePrecedentSearch(query); break
        case 'interpretation': handlers.handleInterpretationSearch(query); break
        case 'ruling': handlers.handleRulingSearch(query); break
        case 'ai': handlers.handleSearch(query); break
        case 'multi': handlers.handleMultiSearch(query); break
        default: handlers.handleSearch(query)
      }
    } else {
      handlers.handleSearch(query)
    }
  }, [handlers])

  // ============================================================
  // 공유 LawViewer props (모바일/데스크톱 중복 제거)
  // ============================================================
  const lawViewerProps = useMemo(() => state.lawData ? {
    meta: state.lawData.meta,
    articles: state.lawData.articles,
    selectedJo: state.lawData.selectedJo,
    viewMode: (state.lawData.viewMode || 'full') as 'full' | 'single',
    onCompare: handlers.handleCompare,
    onSummarize: handlers.handleSummarize,
    onToggleFavorite: handlers.handleToggleFavorite,
    favorites: state.favorites,
    isOrdinance: state.lawData.isOrdinance ?? false,
    aiAnswerMode: state.isAiMode,
    aiAnswerContent: state.aiAnswerContent,
    relatedArticles: state.aiRelatedLaws,
    onRelatedArticleClick: handlers.handleCitationClick,
    fileSearchFailed: state.fileSearchFailed,
    aiCitations: state.aiCitations,
    userQuery: state.userQuery,
    aiQueryType: state.aiQueryType,
    aiConfidenceLevel: state.aiConfidenceLevel,
    aiIsTruncated: state.aiIsTruncated,
    onAiRefresh: handlers.handleAiRefresh,
    isPrecedent: state.lawData.isPrecedent,
    onRefresh: handlers.handleRefresh,
    onDelegationGap: (meta: LawMeta) => {
      console.log('[search-result-view] onDelegationGap 호출', { mst: meta?.mst, lawId: meta?.lawId, lawTitle: meta?.lawTitle })
      setDelegationGapModal({ isOpen: true, meta })
    },
    onTimeMachine: (meta: LawMeta) => setTimeMachineModal({ isOpen: true, meta }),
    onImpactTracker: (lawName: string) => onImpactTracker?.(lawName, 'impact'),
    onOrdinanceSync: (lawName: string) => onImpactTracker?.(lawName, 'ordinance-sync'),
    onOrdinanceBenchmark: (lawName: string) => onOrdinanceBenchmark?.(lawName),
    onAiQuery: handlers.handleAiQuery,
  } : null, [
    state.lawData, state.favorites, state.isAiMode, state.aiAnswerContent,
    state.aiRelatedLaws, state.fileSearchFailed, state.aiCitations,
    state.userQuery, state.aiQueryType, state.aiConfidenceLevel, state.aiIsTruncated,
    handlers, onImpactTracker, onOrdinanceBenchmark,
  ])

  // ============================================================
  // 렌더링
  // ============================================================
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-footer-bg">
      {/* 검색 모달 (Cmd+K) */}
      <CommandSearchModal
        isOpen={state.showSearchModal}
        onClose={() => actions.setShowSearchModal(false)}
        onSearch={handleSearchDispatch}
        isAiMode={state.isAiMode}
      />

      {/* 풀스크린 오버레이 제거 - 인라인 로딩으로 대체 */}

      <FloatingCompactHeader
        onBack={handlers.handleReset}
        onHomeClick={onHomeClick}
        onFavoritesClick={handlers.handleFavoritesClick}
        onLoginClick={openLoginDialog}
        onFavoriteSelect={handlers.handleFavoriteSelect}
        onSearchClick={() => actions.setShowSearchModal(true)}
        onFocusModeToggle={() => actions.setIsFocusMode(!state.isFocusMode)}
        onHelpClick={() => setHelpSheetOpen(true)}
        currentLawName={
          state.isAiMode
            ? (state.userQuery || state.searchQuery || "AI 답변")
            : (state.lawData?.meta?.lawTitle || state.searchQuery || undefined)
        }
        currentArticle={
          !state.isAiMode && state.lawData?.selectedJo
            ? formatJO(state.lawData.selectedJo)
            : undefined
        }
        showBackButton={true}
        isFocusMode={state.isFocusMode}
        guideType={state.aiAnswerContent ? 'ai-search' : 'law-search'}
      />

      <main className="flex-1">
        <div className="container mx-auto max-w-[1280px] px-2 pt-3 pb-2 sm:p-6">
          {/* 법령 검색 결과 선택 */}
          {state.lawSelectionState ? (
            <LawSearchResultList
              results={state.lawSelectionState.results}
              query={state.lawSelectionState.query}
              relatedSearches={state.relatedSearches}
              onSelect={handlers.handleLawSelect}
              onCancel={() => {
                actions.setLawSelectionState(null)
                actions.setRelatedSearches([])
                actions.setIsSearching(false)
                actions.updateProgress('complete', 0)
              }}
            />
          ) : state.ordinanceSelectionState ? (
            /* 조례 검색 결과 선택 */
            <OrdinanceSearchResultList
              results={state.ordinanceSelectionState.results}
              totalCount={state.ordinanceSelectionState.totalCount}
              currentPage={state.ordinancePage}
              pageSize={state.ordinancePageSize}
              isLoading={state.isSearching}
              query={state.ordinanceSelectionState.query}
              onSelect={handlers.handleOrdinanceSelect}
              onPageChange={handlers.handleOrdinancePageChange}
              onPageSizeChange={handlers.handleOrdinancePageSizeChange}
              onCancel={() => {
                actions.setOrdinanceSelectionState(null)
                actions.setIsSearching(false)
                actions.updateProgress('complete', 0)
              }}
            />
          ) : state.isAiMode && state.aiAuthRequired ? (
            /* AI 인증 필요 — 로그인/BYOK 폴백 화면 */
            <AiAuthFallback
              userQuery={state.userQuery || state.searchQuery}
              onOpenGate={() => {
                window.dispatchEvent(new CustomEvent('lexdiff:ai-gate-required', {
                  detail: { query: state.userQuery || state.searchQuery }
                }))
              }}
              onBack={handlers.handleReset}
            />
          ) : state.isAiMode ? (
            /* AI 모드: isSearching과 관계없이 LawViewer 표시 (ChatGPT 스타일 스트리밍) */
            <LawViewer
              meta={{ lawId: 'ai-answer', lawTitle: 'AI 법률 어시스턴트', fetchedAt: new Date().toISOString() }}
              articles={[]}
              selectedJo={undefined}
              viewMode="full"
              onCompare={() => { }}
              onSummarize={async () => { }}
              onToggleFavorite={() => { }}
              favorites={state.favorites}
              isOrdinance={false}
              aiAnswerMode={true}
              aiAnswerContent={deferredAiContent}
              relatedArticles={state.aiRelatedLaws}
              onRelatedArticleClick={handlers.handleCitationClick}
              fileSearchFailed={state.fileSearchFailed}
              aiCitations={state.aiCitations}
              userQuery={state.userQuery || state.searchQuery}
              aiQueryType={state.aiQueryType}
              aiConfidenceLevel={state.aiConfidenceLevel}
              aiIsTruncated={state.aiIsTruncated}
              onAiRefresh={handlers.handleAiRefresh}
              isStreaming={state.isSearching}
              searchProgress={state.searchProgress}
              toolCallLogs={deferredToolCallLogs}
              conversationHistory={state.conversationHistory}
              onFollowUp={handlers.handleAiFollowUp}
              onNewConversation={handlers.handleNewConversation}
            />
          ) : state.isSearching && !state.isAiMode ? (
            /* 법령 검색 로딩 - 스켈레톤 + 중앙 스피너 */
            <LawViewerSkeleton stage={state.searchStage} />
          ) : state.interpretationResults !== null && state.interpretationResults.length > 0 ? (
            /* 해석례 검색 결과 */
            <InterpretationResultList
              results={state.interpretationResults}
              onBack={handlers.handleReset}
            />
          ) : state.rulingResults !== null && state.rulingResults.length > 0 ? (
            <RulingResultList
              results={state.rulingResults}
              onBack={handlers.handleReset}
            />
          ) : state.precedentResults !== null ? (
            /* 판례 검색 결과 */
            <PrecedentResultList
              results={state.precedentResults}
              totalCount={state.precedentTotalCount}
              currentPage={state.precedentPage}
              pageSize={state.precedentPageSize}
              isLoading={state.isSearching}
              yearFilter={state.precedentYearFilter}
              courtFilter={state.precedentCourtFilter}
              onSelect={(precedent) => handlers.handlePrecedentSelect(precedent.id)}
              onPageChange={handlers.handlePrecedentPageChange}
              onPageSizeChange={handlers.handlePrecedentPageSizeChange}
              onBack={handlers.handleReset}
            />
          ) : !state.lawData ? (
            /* 검색 결과 없음 - 홈으로 복귀 안내 */
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
              <Icon name="search" className="h-16 w-16 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">검색 결과를 표시할 수 없습니다</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                검색 중 문제가 발생했거나 결과가 없습니다.<br />
                다른 검색어로 다시 시도해보세요.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => actions.setShowSearchModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Icon name="search" className="h-4 w-4" />
                  다시 검색
                </button>
                <button
                  onClick={handlers.handleReset}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors"
                >
                  <Icon name="home" className="h-4 w-4" />
                  홈으로
                </button>
              </div>
            </div>
          ) : (
            /* 법령 뷰어 — 단일 인스턴스 (이중 마운트 제거: API 호출/useEffect 2배→1배) */
            <div className="space-y-2 sm:space-y-4">
              {/* 모바일 뷰 */}
              <div className="md:hidden">
                {state.mobileView === "list" ? (
                  <div className="space-y-2 sm:space-y-4">
                    <SearchBar onSearch={handleSearchDispatch} isLoading={state.isSearching} />
                  </div>
                ) : (
                  <div className="space-y-2 sm:space-y-4">
                    {state.articleNotFound && (
                      <ArticleNotFoundBanner
                        requestedJo={state.articleNotFound.requestedJo}
                        lawTitle={state.articleNotFound.lawTitle}
                        nearestArticles={state.articleNotFound.nearestArticles}
                        crossLawSuggestions={state.articleNotFound.crossLawSuggestions}
                        onSelectArticle={(jo) => {
                          actions.setLawData(prev => prev ? { ...prev, selectedJo: jo } : null)
                        }}
                        onSelectCrossLaw={(lawTitle) => {
                          // UX-6: stale articleNotFound 가드 (콜백 시점 null 방어)
                          const jo = state.articleNotFound?.requestedJo
                          if (jo) handlers.handleSearch({ lawName: lawTitle, article: formatJO(jo) })
                        }}
                        onDismiss={() => actions.setArticleNotFound(null)}
                      />
                    )}
                    {lawViewerProps && <LawViewer {...lawViewerProps} />}
                  </div>
                )}
              </div>

              {/* 데스크톱 뷰 */}
              <div className="hidden md:block space-y-4">
                <SearchBar onSearch={handleSearchDispatch} isLoading={state.isSearching} />
                {state.articleNotFound && (
                  <ArticleNotFoundBanner
                    requestedJo={state.articleNotFound.requestedJo}
                    lawTitle={state.articleNotFound.lawTitle}
                    nearestArticles={state.articleNotFound.nearestArticles}
                    crossLawSuggestions={state.articleNotFound.crossLawSuggestions}
                    onSelectArticle={(jo) => {
                      actions.setLawData(prev => prev ? { ...prev, selectedJo: jo } : null)
                    }}
                    onSelectCrossLaw={(lawTitle) => {
                      handlers.handleSearch({ lawName: lawTitle, article: formatJO(state.articleNotFound!.requestedJo) })
                    }}
                    onDismiss={() => actions.setArticleNotFound(null)}
                  />
                )}
                {lawViewerProps && <LawViewer {...lawViewerProps} />}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 모달들 */}
      {state.lawData && (
        <>
          <ComparisonModal
            isOpen={state.comparisonModal.isOpen}
            onClose={() => actions.setComparisonModal({ isOpen: false })}
            lawTitle={state.lawData.meta.lawTitle}
            lawId={state.lawData.meta.lawId}
            mst={state.lawData.meta.mst}
            targetJo={state.comparisonModal.jo}
          />

          {state.summaryDialog.isOpen && state.summaryDialog.newContent && (
            <AISummaryDialog
              isOpen={state.summaryDialog.isOpen}
              onClose={() => actions.setSummaryDialog({ isOpen: false })}
              lawTitle={state.lawData.meta.lawTitle}
              joNum={state.summaryDialog.jo || ""}
              oldContent={state.summaryDialog.oldContent || ""}
              newContent={state.summaryDialog.newContent}
              effectiveDate={state.summaryDialog.effectiveDate}
              isPrecedent={state.summaryDialog.isPrecedent}
            />
          )}

          {/* 위임 미비 탐지 모달 */}
          {delegationGapModal.isOpen && delegationGapModal.meta && (
            <DelegationGapModal
              isOpen={delegationGapModal.isOpen}
              onClose={() => setDelegationGapModal({ isOpen: false, meta: null })}
              meta={delegationGapModal.meta}
            />
          )}

          {/* 법령 타임머신 모달 */}
          {timeMachineModal.isOpen && timeMachineModal.meta && (
            <TimeMachineModal
              isOpen={timeMachineModal.isOpen}
              onClose={() => setTimeMachineModal({ isOpen: false, meta: null })}
              meta={timeMachineModal.meta}
            />
          )}
        </>
      )}

      <FavoritesDialog
        isOpen={state.favoritesDialogOpen}
        onClose={() => actions.setFavoritesDialogOpen(false)}
        onSelect={handlers.handleFavoriteSelect}
      />

      <HelpGuideSheet
        open={helpSheetOpen}
        onOpenChange={setHelpSheetOpen}
        defaultTab={state.aiAnswerContent ? 'ai' : 'law'}
      />

      <ErrorReportDialog onDismiss={onBack} />

      {/* 검색 모드 선택 다이얼로그 */}
      <SearchChoiceDialog
        open={state.showChoiceDialog}
        onOpenChange={(open) => {
          if (!open) {
            // onChoice 핸들러가 이미 pendingQuery를 클리어한 경우: 정상 검색 진행 중 → 무시
            // pendingQuery가 남아있으면: X 버튼 또는 Escape로 닫힌 것 → 홈으로 복귀
            if (state.pendingQuery) {
              actions.setShowChoiceDialog(false)
              actions.setPendingQuery(null)
              actions.resetToHome()
              onBack()
            }
          } else {
            actions.setShowChoiceDialog(open)
          }
        }}
        pendingQuery={state.pendingQuery}
        onChoice={handlers.handleSearchChoice}
      />

      {/* 법령 검색 결과 없음 다이얼로그 */}
      <NoResultDialog
        open={state.showNoResultDialog}
        onOpenChange={(open) => {
          actions.setShowNoResultDialog(open)
          // X 버튼으로 닫힐 때 홈으로 복귀 (빈화면 방지)
          if (!open && state.noResultQuery) {
            actions.setNoResultQuery(null)
            actions.resetToHome()
            onBack()
          }
        }}
        noResultQuery={state.noResultQuery}
        onChoice={handlers.handleNoResultChoice}
      />

      {/* 푸터 */}
      {!state.lawData && !state.lawSelectionState && !state.ordinanceSelectionState && (
        <footer className="border-t border-border py-6">
          <div className="container mx-auto px-6">
            <p className="text-center text-xs text-muted-foreground/40">© 2025–2026 딴짓하는 류주임 @chris_gomdori. All rights reserved.</p>
          </div>
        </footer>
      )}
    </div>
  )
}

// React.memo로 불필요한 리렌더링 방지
export const SearchResultView = memo(SearchResultViewComponent)
