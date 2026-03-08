"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Icon } from "@/components/ui/icon"
import { VirtualizedArticleList } from "@/components/virtualized-article-list"
import { ArticleBottomSheet } from "@/components/article-bottom-sheet"
import { FloatingActionButton } from "@/components/ui/floating-action-button"
import { AIAnswerSidebar } from "@/components/law-viewer-ai-answer"
import type { LawArticle, LawMeta } from "@/lib/law-types"
import type { ParsedRelatedLaw } from "@/lib/law-parser"

interface LawViewerSidebarProps {
  // 모드
  aiAnswerMode: boolean
  isPrecedent: boolean
  isOrdinance: boolean

  // 상태
  isArticleListCollapsed: boolean
  setIsArticleListCollapsed: (v: boolean) => void
  isArticleListExpanded: boolean
  setIsArticleListExpanded: (v: boolean) => void

  // 데이터
  meta: LawMeta
  actualArticles: LawArticle[]
  relatedArticles: ParsedRelatedLaw[]
  mergedRelatedArticles: ParsedRelatedLaw[]
  activeJo: string
  loadingJo: string | null
  favorites: Set<string>
  isStreaming?: boolean

  // 콜백
  handleArticleClick: (jo: string) => void
  openExternalLawArticleModal: (lawName: string, article: string) => void
  onToggleFavorite?: (jo: string) => void

  // 유틸
  formatSimpleJo: (jo: string, forceOrdinance?: boolean) => string
  isFavorite: (jo: string) => boolean
}

export function LawViewerSidebar({
  aiAnswerMode,
  isPrecedent,
  isOrdinance,
  isArticleListCollapsed,
  setIsArticleListCollapsed,
  isArticleListExpanded,
  setIsArticleListExpanded,
  meta,
  actualArticles,
  relatedArticles,
  mergedRelatedArticles,
  activeJo,
  loadingJo,
  favorites,
  isStreaming,
  handleArticleClick,
  openExternalLawArticleModal,
  onToggleFavorite,
  formatSimpleJo,
  isFavorite,
}: LawViewerSidebarProps) {
  // FAB 카운트: AIAnswerSidebar와 동일한 필터링+중복제거 적용
  const aiRelatedCount = (() => {
    const seen = new Set<string>()
    for (const law of mergedRelatedArticles) {
      if (law.lawName && law.lawName !== '알 수 없음' && law.lawName.length <= 50) {
        seen.add(`${law.lawName}|${law.jo || 'all'}`)
      }
    }
    return seen.size
  })()

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isArticleListExpanded && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsArticleListExpanded(false)}
        />
      )}

      {/* Left sidebar - AI 답변 모드 or 조문 목록 (Desktop only) */}
      <Card className={`hidden lg:flex flex-col overflow-hidden h-full lg:sticky lg:top-4 transition-all duration-300 p-0 gap-0 ${isArticleListCollapsed ? 'lg:w-16' : ''}`}>
        {aiAnswerMode && isArticleListCollapsed ? (
          // ========== AI 슬림 모드 (접힌 상태) ==========
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsArticleListCollapsed(false)}
              className="mx-auto mt-2 mb-2"
              title="관련 법령 목록 펼치기"
            >
              <Icon name="link" size={20} />
            </Button>
            <Separator />
            <ScrollArea className="flex-1">
              <div className="flex flex-col items-center gap-1 py-2">
                {relatedArticles.slice(0, 20).map((article, idx) => {
                  const isExcerpt = article.source === 'excerpt'
                  return (
                    <Button
                      key={`${article.lawName}-${article.jo}-${idx}`}
                      variant="ghost"
                      size="sm"
                      onClick={() => openExternalLawArticleModal(article.lawName, article.article)}
                      className="w-12 h-12 p-0 text-xs flex flex-col items-center justify-center relative"
                      title={`${article.lawName} ${article.article}`}
                    >
                      {isExcerpt ? (
                        <Icon name="bookmark" size={14} className="text-purple-400" />
                      ) : (
                        <Icon name="link" size={14} className="text-blue-400" />
                      )}
                    </Button>
                  )
                })}
              </div>
            </ScrollArea>
          </>
        ) : aiAnswerMode ? (
          // ========== AI 펼친 상태 ==========
          <AIAnswerSidebar
            relatedArticles={mergedRelatedArticles}
            onRelatedArticleClick={openExternalLawArticleModal}
            showHeader={true}
            onCollapseClick={() => setIsArticleListCollapsed(true)}
            isStreaming={isStreaming}
          />
        ) : isArticleListCollapsed ? (
          // ========== 슬림 모드 (접힌 상태) ==========
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsArticleListCollapsed(false)}
              className="mx-auto mt-2 mb-2"
              title={isPrecedent ? "목차 펼치기" : "조문 목록 펼치기"}
            >
              <Icon name="list-ordered" size={20} />
            </Button>
            <Separator />
            <ScrollArea className="flex-1">
              <div className="flex flex-col items-center gap-1 py-2">
                {actualArticles.map((article) => {
                  const joNum = formatSimpleJo(article.jo).replace('제', '').replace('조', '').replace('의', '-')
                  const isActive = article.jo === activeJo
                  const isArticleFavorite = isFavorite(article.jo)

                  return (
                    <Button
                      key={article.jo}
                      variant={isActive ? "default" : "ghost"}
                      size="sm"
                      onClick={() => handleArticleClick(article.jo)}
                      className={`w-12 h-12 p-0 text-xs flex flex-col items-center justify-center relative ${isActive ? 'ring-2 ring-[#1a2b4c] dark:ring-[#e2a85d] ring-offset-1' : ''
                        }`}
                      title={`${formatSimpleJo(article.jo)}${article.title ? ` ${article.title}` : ''}`}
                    >
                      <span className="font-bold font-ridi">{joNum}</span>
                      {isArticleFavorite && (
                        <Icon name="star" size={10} className="absolute top-0.5 right-0.5 fill-yellow-400 text-yellow-400" />
                      )}
                    </Button>
                  )
                })}
              </div>
            </ScrollArea>
          </>
        ) : (
          // ========== 기존 조문 목록 (펼친 상태) ==========
          <>
            {/* 헤더 - 본문 헤더와 동일한 디자인 */}
            <div className="border-b border-border px-4 pt-6 pb-3 flex-shrink-0">
              <div className="flex items-center gap-2 mb-1 justify-between">
                <div className="flex items-center gap-2">
                  <Icon name={isPrecedent ? "list-checks" : "list-ordered"} size={20} className="text-[#1a2b4c] dark:text-[#e2a85d]" />
                  <h3 className="text-xl font-bold text-foreground">{isPrecedent ? "목차" : "조문 목록"}</h3>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsArticleListCollapsed(true)}
                  className="h-7 w-7"
                  title={isPrecedent ? "목차 접기" : "조문 목록 접기"}
                >
                  <Icon name="chevron-down" size={16} className="rotate-90" />
                </Button>
              </div>
              <Badge variant="outline" className="text-xs">
                <Icon name="file-text" size={12} className="mr-1" />
                {actualArticles.length}개 {isPrecedent ? "항목" : "조문"}
              </Badge>
            </div>

            <div className="flex-1 min-h-0 px-2 pt-2 pb-4">
              <VirtualizedArticleList
                articles={actualArticles}
                activeJo={activeJo}
                loadingJo={loadingJo}
                favorites={favorites}
                isOrdinance={isOrdinance}
                isPrecedent={isPrecedent}
                lawTitle={meta.lawTitle}
                onArticleClick={handleArticleClick}
                onToggleFavorite={(jo) => onToggleFavorite?.(jo)}
              />
            </div>
          </>
        )
        }
      </Card>

      {/* Mobile Bottom Sheet for Article List */}
      <ArticleBottomSheet
        isOpen={isArticleListExpanded}
        onClose={() => setIsArticleListExpanded(false)}
        title={aiAnswerMode ? "관련 법령 목록" : isPrecedent ? "목차" : "조문 목록"}
        snapPoints={[40, 70, 90]}
      >
        {aiAnswerMode ? (
          <AIAnswerSidebar
            relatedArticles={mergedRelatedArticles}
            onRelatedArticleClick={openExternalLawArticleModal}
            onCloseSidebar={() => setIsArticleListExpanded(false)}
            showHeader={false}
            isStreaming={isStreaming}
          />
        ) : (
          // 일반 모드: 조문 목록
          <>
            <div className="mb-4">
              <Badge variant="outline" className="text-xs">
                <Icon name="file-text" size={12} className="mr-1" />
                {actualArticles.length}개 조문
              </Badge>
            </div>

            <div className="h-[60vh]">
              <VirtualizedArticleList
                articles={actualArticles}
                activeJo={activeJo}
                loadingJo={loadingJo}
                favorites={favorites}
                isOrdinance={isOrdinance}
                lawTitle={meta.lawTitle}
                onArticleClick={(jo) => {
                  handleArticleClick(jo)
                  setIsArticleListExpanded(false)
                }}
                onToggleFavorite={(jo) => onToggleFavorite?.(jo)}
              />
            </div>
          </>
        )}
      </ArticleBottomSheet>

      {/* Floating Action Button (Mobile only) */}
      <FloatingActionButton
        onClick={() => setIsArticleListExpanded(true)}
        icon={<Icon name="list-ordered" size={20} />}
        count={aiAnswerMode ? aiRelatedCount : actualArticles.length}
        label={aiAnswerMode ? "관련 법령 목록 열기" : isPrecedent ? "목차 열기" : "조문 목록 열기"}
      />
    </>
  )
}
