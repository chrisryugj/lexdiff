/**
 * search-result-view/index.tsx
 *
 * 검색 결과 화면 메인 컨테이너
 * - 분리된 훅과 컴포넌트를 조합
 * - 기존 @/components/search-result-view 경로 유지
 */

"use client"

import { useEffect, useState, useRef, memo } from "react"
import dynamic from "next/dynamic"
import { FloatingCompactHeader } from "@/components/floating-compact-header"
import { CommandSearchModal } from "@/components/command-search-modal"
import { SearchBar } from "@/components/search-bar"
import { LawViewer } from "@/components/law-viewer"
import { ErrorReportDialog } from "@/components/error-report-dialog"
import { ArticleNotFoundBanner } from "@/components/article-not-found-banner"
import { LawViewerSkeleton } from "@/components/law-viewer-skeleton"
import { Icon } from "@/components/ui/icon"
import { formatJO } from "@/lib/law-parser"
import { debugLogger } from "@/lib/debug-logger"
import type { VerifiedCitation } from "@/lib/citation-verifier"

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

// Local imports
import { useSearchState } from "./hooks/useSearchState"
import { useSearchHandlers } from "./hooks/useSearchHandlers"
import { LawSearchResultList, OrdinanceSearchResultList } from "./SearchResultList"
import { PrecedentResultList } from "./PrecedentResultList"
import { SearchChoiceDialog, NoResultDialog } from "./SearchDialogs"
import type { SearchResultViewProps } from "./types"

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
  initialPrecedentId
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

        // ✅ 판례 상세 복원 (새로고침 시)
        if (initialPrecedentId && cached.precedentDetail && cached.precedentDetail.id === initialPrecedentId) {
          debugLogger.success('✅ 판례 상세 캐시 HIT - API 호출 없음')

          actions.setIsCacheHit(true)
          actions.setIsSearching(true)
          actions.updateProgress('parsing', 95)

          actions.setLawData(cached.precedentDetail.lawData)
          actions.setPrecedentResults(null)
          actions.setMobileView("content")

          actions.updateProgress('complete', 100)
          setTimeout(() => {
            actions.setIsCacheHit(false)
            actions.setIsSearching(false)
          }, 300)
          return
        }

        // ✅ 판례 검색 결과 복원 (뒤로가기 시)
        if (cached.precedentResults && cached.precedentResults.length > 0 && !initialPrecedentId) {
          debugLogger.success('✅ 판례 검색 결과 캐시 HIT')

          actions.setIsCacheHit(true)
          actions.setIsSearching(true)
          actions.updateProgress('parsing', 95)

          actions.setPrecedentResults(cached.precedentResults)
          actions.setLawData(null)  // 판례 상세 초기화
          actions.setMobileView("list")

          actions.updateProgress('complete', 100)
          setTimeout(() => {
            actions.setIsCacheHit(false)
            actions.setIsSearching(false)
          }, 300)
          return
        }

        // ✅ 조례 검색 결과 복원 (뒤로가기 시)
        // hasOrdinanceDetail이 false/undefined면 목록으로 복원
        const historyState = window.history.state
        if (cached.ordinanceSelectionState && !historyState?.hasOrdinanceDetail) {
          debugLogger.success('✅ 조례 검색 결과 캐시 HIT')

          actions.setIsCacheHit(true)
          actions.setIsSearching(true)
          actions.updateProgress('parsing', 95)

          // IndexedDB 스키마 → React state 변환
          const ordinanceResults = cached.ordinanceSelectionState.results.map(o => ({
            ordinSeq: o.자치법규ID,
            ordinName: o.자치법규명,
            ordinId: o.자치법규ID,
            promulgationDate: o.공포일자,
          }))

          actions.setOrdinanceSelectionState({
            results: ordinanceResults,
            totalCount: ordinanceResults.length,
            query: { lawName: cached.ordinanceSelectionState.query }
          })
          actions.setLawData(null)  // 조례 상세 초기화
          actions.setMobileView("list")

          actions.updateProgress('complete', 100)
          setTimeout(() => {
            actions.setIsCacheHit(false)
            actions.setIsSearching(false)
          }, 300)
          return
        }

        // AI 모드 캐시 복원
        if (cached.aiMode) {
          debugLogger.success('✅ AI 답변 캐시 HIT - API 호출 없음')

          actions.setIsCacheHit(true)
          actions.setIsSearching(true)
          actions.updateProgress('parsing', 95)

          actions.setIsAiMode(true)
          actions.setAiAnswerContent(cached.aiMode.aiAnswerContent)
          actions.setAiRelatedLaws(cached.aiMode.aiRelatedLaws)
          actions.setAiCitations((cached.aiMode.aiCitations || []) as VerifiedCitation[])
          actions.setUserQuery(cached.aiMode.userQuery || cached.query.lawName)
          actions.setFileSearchFailed(cached.aiMode.fileSearchFailed || false)
          actions.setAiQueryType(cached.aiMode.aiQueryType || 'application')  // ✅ aiQueryType 복원

          const aiLawData = {
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

          actions.updateProgress('complete', 100)
          setTimeout(() => {
            actions.setIsCacheHit(false)
            actions.setIsSearching(false)
          }, 300)
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
              title: '',
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
          const classification = (cached.query as any).classification
          if (classification && ['precedent', 'interpretation', 'ruling'].includes(classification.searchType)) {
            // 판례/해석례/재결례는 handleSearchInternal 스킵하고 전용 핸들러 사용
            debugLogger.info('📡 캐시 복원: 전용 핸들러 실행', { searchType: classification.searchType })
            // 핸들러가 자체적으로 setIsSearching(false) 처리함
            switch (classification.searchType) {
              case 'precedent': handlers.handlePrecedentSearch(cached.query); break
              case 'interpretation': handlers.handleInterpretationSearch(cached.query); break
              case 'ruling': handlers.handleRulingSearch(cached.query); break
            }
          } else {
            await handlers.handleSearchInternal(cached.query, abortController.signal)
          }
        }
      } catch (error) {
        if (!isSubscribed) return
        debugLogger.error('❌ 검색 결과 로드 실패', error)
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
          actions.setPrecedentResults(cached.precedentResults)
          actions.setLawData(null)
          actions.setMobileView("list")
        }
      }

      restorePrecedentResults()
    }
  }, [initialPrecedentId, searchId, state.lawData?.isPrecedent, actions])

  // ============================================================
  // 렌더링
  // ============================================================
  return (
    <div className="flex min-h-screen flex-col">
      {/* 검색 모달 (Cmd+K) */}
      <CommandSearchModal
        isOpen={state.showSearchModal}
        onClose={() => actions.setShowSearchModal(false)}
        onSearch={(query) => {
          // ✅ 통합검색: searchType에 따라 분기
          if (query.classification) {
            console.log('[통합검색 분기] searchType:', query.classification.searchType, 'query:', query)

            switch (query.classification.searchType) {
              case 'precedent':
                console.log('[통합검색] → handlePrecedentSearch')
                handlers.handlePrecedentSearch(query)
                break
              case 'interpretation':
                console.log('[통합검색] → handleInterpretationSearch')
                handlers.handleInterpretationSearch(query)
                break
              case 'ruling':
                console.log('[통합검색] → handleRulingSearch')
                handlers.handleRulingSearch(query)
                break
              case 'ai':
                console.log('[통합검색] → handleSearch (AI 모드)')
                // AI 검색은 기존 handleSearch로 처리
                handlers.handleSearch(query)
                break
              case 'multi':
                console.log('[통합검색] → handleMultiSearch')
                handlers.handleMultiSearch(query)
                break
              default:
                console.log('[통합검색] → handleSearch (법령/조례)')
                // law, ordinance는 기존 handleSearch로 처리
                handlers.handleSearch(query)
            }
          } else {
            console.log('[통합검색] classification 없음 → handleSearch (Fallback)')
            // Fallback: classification 없으면 기존 로직
            handlers.handleSearch(query)
          }
        }}
        isAiMode={state.isAiMode}
      />

      {/* 풀스크린 오버레이 제거 - 인라인 로딩으로 대체 */}

      <FloatingCompactHeader
        onBack={handlers.handleReset}
        onHomeClick={onHomeClick}
        onFavoritesClick={handlers.handleFavoritesClick}
        onSettingsClick={handlers.handleSettingsClick}
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
              aiAnswerContent={state.aiAnswerContent}
              relatedArticles={state.aiRelatedLaws}
              onRelatedArticleClick={handlers.handleCitationClick}
              fileSearchFailed={state.fileSearchFailed}
              aiCitations={state.aiCitations}
              userQuery={state.userQuery || state.searchQuery}
              aiQueryType={state.aiQueryType}
              onAiRefresh={handlers.handleAiRefresh}
              isStreaming={state.isSearching}
              searchProgress={state.searchProgress}
            />
          ) : state.isSearching && !state.isAiMode ? (
            /* 법령 검색 로딩 - 스켈레톤 + 중앙 스피너 */
            <LawViewerSkeleton stage={state.searchStage} />
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
            /* 데이터 없음 */
            null
          ) : (
            /* 법령 뷰어 */
            <div className="space-y-2 sm:space-y-4">
              {/* 모바일 뷰 */}
              <div className="md:hidden">
                {state.mobileView === "list" ? (
                  <div className="space-y-2 sm:space-y-4">
                    <SearchBar onSearch={(query) => {
                      if (query.classification) {
                        switch (query.classification.searchType) {
                          case 'precedent': handlers.handlePrecedentSearch(query); break
                          case 'interpretation': handlers.handleInterpretationSearch(query); break
                          case 'ruling': handlers.handleRulingSearch(query); break
                          case 'multi': handlers.handleMultiSearch(query); break
                          default: handlers.handleSearch(query)
                        }
                      } else {
                        handlers.handleSearch(query)
                      }
                    }} isLoading={state.isSearching} />
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
                          handlers.handleSearch({ lawName: lawTitle, article: formatJO(state.articleNotFound!.requestedJo) })
                        }}
                        onDismiss={() => actions.setArticleNotFound(null)}
                      />
                    )}
                    <LawViewer
                      meta={state.lawData.meta}
                      articles={state.lawData.articles}
                      selectedJo={state.lawData.selectedJo}
                      viewMode={state.lawData.viewMode || 'full'}
                      onCompare={handlers.handleCompare}
                      onSummarize={handlers.handleSummarize}
                      onToggleFavorite={handlers.handleToggleFavorite}
                      favorites={state.favorites}
                      isOrdinance={state.lawData.isOrdinance ?? false}
                      aiAnswerMode={state.isAiMode}
                      aiAnswerContent={state.aiAnswerContent}
                      relatedArticles={state.aiRelatedLaws}
                      onRelatedArticleClick={handlers.handleCitationClick}
                      fileSearchFailed={state.fileSearchFailed}
                      aiCitations={state.aiCitations}
                      userQuery={state.userQuery}
                      aiQueryType={state.aiQueryType}
                      onAiRefresh={handlers.handleAiRefresh}
                      isPrecedent={state.lawData.isPrecedent}
                      onRefresh={handlers.handleRefresh}
                    />
                  </div>
                )}
              </div>

              {/* 데스크톱 뷰 */}
              <div className="hidden md:block space-y-4">
                <SearchBar onSearch={(query) => {
                  if (query.classification) {
                    switch (query.classification.searchType) {
                      case 'precedent': handlers.handlePrecedentSearch(query); break
                      case 'interpretation': handlers.handleInterpretationSearch(query); break
                      case 'ruling': handlers.handleRulingSearch(query); break
                      case 'multi': handlers.handleMultiSearch(query); break
                      default: handlers.handleSearch(query)
                    }
                  } else {
                    handlers.handleSearch(query)
                  }
                }} isLoading={state.isSearching} />
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
                <LawViewer
                  meta={state.lawData.meta}
                  articles={state.lawData.articles}
                  selectedJo={state.lawData.selectedJo}
                  viewMode={state.lawData.viewMode || 'full'}
                  onCompare={handlers.handleCompare}
                  onSummarize={handlers.handleSummarize}
                  onToggleFavorite={handlers.handleToggleFavorite}
                  favorites={state.favorites}
                  isOrdinance={state.lawData.isOrdinance ?? false}
                  aiAnswerMode={state.isAiMode}
                  aiAnswerContent={state.aiAnswerContent}
                  relatedArticles={state.aiRelatedLaws}
                  onRelatedArticleClick={handlers.handleCitationClick}
                  fileSearchFailed={state.fileSearchFailed}
                  aiCitations={state.aiCitations}
                  userQuery={state.userQuery}
                  aiQueryType={state.aiQueryType}
                  onAiRefresh={handlers.handleAiRefresh}
                  isPrecedent={state.lawData.isPrecedent}
                  onRefresh={handlers.handleRefresh}
                />
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
        onOpenChange={actions.setShowChoiceDialog}
        pendingQuery={state.pendingQuery}
        onChoice={handlers.handleSearchChoice}
      />

      {/* 법령 검색 결과 없음 다이얼로그 */}
      <NoResultDialog
        open={state.showNoResultDialog}
        onOpenChange={actions.setShowNoResultDialog}
        noResultQuery={state.noResultQuery}
        onChoice={handlers.handleNoResultChoice}
      />

      {/* 푸터 */}
      {!state.lawData && !state.lawSelectionState && !state.ordinanceSelectionState && (
        <footer className="border-t border-border py-6">
          <div className="container mx-auto px-6">
            <p className="text-center text-sm text-muted-foreground">© 2025 Chris ryu. All rights reserved.</p>
          </div>
        </footer>
      )}
    </div>
  )
}

// React.memo로 불필요한 리렌더링 방지
export const SearchResultView = memo(SearchResultViewComponent)
