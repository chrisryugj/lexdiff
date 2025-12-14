/**
 * search-result-view/index.tsx
 *
 * 검색 결과 화면 메인 컨테이너
 * - 분리된 훅과 컴포넌트를 조합
 * - 기존 @/components/search-result-view 경로 유지
 */

"use client"

import { useEffect } from "react"
import dynamic from "next/dynamic"
import { FloatingCompactHeader } from "@/components/floating-compact-header"
import { CommandSearchModal } from "@/components/command-search-modal"
import { SearchBar } from "@/components/search-bar"
import { LawViewer } from "@/components/law-viewer"
import { ErrorReportDialog } from "@/components/error-report-dialog"
import { ArticleNotFoundBanner } from "@/components/article-not-found-banner"
import { ModernProgressBar } from "@/components/ui/modern-progress-bar"
import { formatJO } from "@/lib/law-parser"
import { debugLogger } from "@/lib/debug-logger"

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

// Local imports
import { useSearchState } from "./hooks/useSearchState"
import { useSearchHandlers } from "./hooks/useSearchHandlers"
import { LawSearchResultList, OrdinanceSearchResultList } from "./SearchResultList"
import { SearchChoiceDialog, NoResultDialog } from "./SearchDialogs"
import type { SearchResultViewProps } from "./types"

// Re-export types
export type { SearchResultViewProps } from "./types"

export function SearchResultView({
  searchId,
  onBack,
  onProgressUpdate,
  onModeChange,
  initialSearchMode
}: SearchResultViewProps) {
  // ============================================================
  // 상태 관리 훅
  // ============================================================
  const [state, actions] = useSearchState({
    initialSearchMode,
    onProgressUpdate,
    onModeChange,
  })

  // ============================================================
  // 핸들러 훅
  // ============================================================
  const handlers = useSearchHandlers({
    state,
    actions,
    onBack,
  })

  // ============================================================
  // searchId로부터 데이터 복원
  // ============================================================
  useEffect(() => {
    let isSubscribed = true
    let abortController: AbortController | null = null

    const loadSearchResult = async () => {
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
          hasLawData: !!cached.lawData
        })

        actions.setSearchQuery(cached.query.lawName || '')

        // AI 모드 캐시 복원
        if (cached.aiMode) {
          debugLogger.success('✅ AI 답변 캐시 HIT - API 호출 없음')

          actions.setIsCacheHit(true)
          actions.setIsSearching(true)
          actions.updateProgress('parsing', 95)

          actions.setIsAiMode(true)
          actions.setAiAnswerContent(cached.aiMode.aiAnswerContent)
          actions.setAiRelatedLaws(cached.aiMode.aiRelatedLaws)
          actions.setAiCitations(cached.aiMode.aiCitations || [])
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
          await handlers.handleSearchInternal(cached.query, abortController.signal)
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
  }, [searchId])

  // ============================================================
  // 렌더링
  // ============================================================
  return (
    <div className="flex min-h-screen flex-col">
      {/* 검색 모달 (Cmd+K) */}
      <CommandSearchModal
        isOpen={state.showSearchModal}
        onClose={() => actions.setShowSearchModal(false)}
        onSearch={handlers.handleSearch}
        isAiMode={state.isAiMode}
      />

      {/* 프로그레스 오버레이 */}
      {state.isSearching && (
        <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-[100] flex items-center justify-center">
          <div className="w-full max-w-md px-6">
            <ModernProgressBar
              progress={state.searchProgress}
              label={state.searchMode === 'rag' ? 'AI 검색' : '법령 검색'}
              statusMessage={
                state.searchStage === 'searching'
                  ? (state.searchMode === 'rag' ? 'Gemini 2.5 Flash로 검색 중...' : '국가법령정보 API 검색중...')
                  : state.searchStage === 'parsing' ? '법령 데이터 파싱 중...' :
                    state.searchStage === 'streaming' ? 'AI 답변 생성 중...' :
                      '검색 완료!'
              }
              variant={state.searchMode === 'rag' ? 'lavender' : 'ocean'}
              size="lg"
              animationDuration={800}
            />
            <div className="mt-4 text-center">
              <p className="text-sm text-muted-foreground">
                {state.searchQuery && `"${state.searchQuery}" 검색 중...`}
              </p>
              {state.isCacheHit && (
                <p className="text-xs text-muted-foreground mt-1">
                  캐시에서 불러오는 중...
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <FloatingCompactHeader
        onBack={handlers.handleReset}
        onFavoritesClick={handlers.handleFavoritesClick}
        onSettingsClick={handlers.handleSettingsClick}
        onSearchClick={() => actions.setShowSearchModal(true)}
        onFocusModeToggle={() => actions.setIsFocusMode(!state.isFocusMode)}
        currentLawName={state.lawData?.meta?.lawTitle || state.searchQuery || undefined}
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
              query={state.ordinanceSelectionState.query}
              onSelect={handlers.handleOrdinanceSelect}
              onCancel={() => {
                actions.setOrdinanceSelectionState(null)
                actions.setIsSearching(false)
                actions.updateProgress('complete', 0)
              }}
            />
          ) : !state.lawData ? (
            // 로딩 중 - ModernProgressBar만 표시
            null
          ) : (
            /* 법령 뷰어 */
            <div className="space-y-2 sm:space-y-4">
              {/* 모바일 뷰 */}
              <div className="md:hidden">
                {state.mobileView === "list" ? (
                  <div className="space-y-2 sm:space-y-4">
                    <SearchBar onSearch={handlers.handleSearch} isLoading={state.isSearching} />
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
                      viewMode={state.lawData.viewMode}
                      onCompare={handlers.handleCompare}
                      onSummarize={handlers.handleSummarize}
                      onToggleFavorite={handlers.handleToggleFavorite}
                      favorites={state.favorites}
                      isOrdinance={state.lawData.isOrdinance}
                      aiAnswerMode={state.isAiMode}
                      aiAnswerContent={state.aiAnswerContent}
                      relatedArticles={state.aiRelatedLaws}
                      onRelatedArticleClick={handlers.handleCitationClick}
                      fileSearchFailed={state.fileSearchFailed}
                      aiCitations={state.aiCitations}
                      userQuery={state.userQuery}
                      aiQueryType={state.aiQueryType}
                      onAiRefresh={handlers.handleAiRefresh}
                    />
                  </div>
                )}
              </div>

              {/* 데스크톱 뷰 */}
              <div className="hidden md:block space-y-4">
                <SearchBar onSearch={handlers.handleSearch} isLoading={state.isSearching} />
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
                  viewMode={state.lawData.viewMode}
                  onCompare={handlers.handleCompare}
                  onSummarize={handlers.handleSummarize}
                  onToggleFavorite={handlers.handleToggleFavorite}
                  favorites={state.favorites}
                  isOrdinance={state.lawData.isOrdinance}
                  aiAnswerMode={state.isAiMode}
                  aiAnswerContent={state.aiAnswerContent}
                  relatedArticles={state.aiRelatedLaws}
                  onRelatedArticleClick={handlers.handleCitationClick}
                  fileSearchFailed={state.fileSearchFailed}
                  aiCitations={state.aiCitations}
                  userQuery={state.userQuery}
                  aiQueryType={state.aiQueryType}
                  onAiRefresh={handlers.handleAiRefresh}
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

          {state.summaryDialog.isOpen && state.summaryDialog.oldContent && state.summaryDialog.newContent && (
            <AISummaryDialog
              isOpen={state.summaryDialog.isOpen}
              onClose={() => actions.setSummaryDialog({ isOpen: false })}
              lawTitle={state.lawData.meta.lawTitle}
              joNum={state.summaryDialog.jo || ""}
              oldContent={state.summaryDialog.oldContent}
              newContent={state.summaryDialog.newContent}
              effectiveDate={state.summaryDialog.effectiveDate}
            />
          )}
        </>
      )}

      <FavoritesDialog
        isOpen={state.favoritesDialogOpen}
        onClose={() => actions.setFavoritesDialogOpen(false)}
        onSelect={handlers.handleFavoriteSelect}
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
