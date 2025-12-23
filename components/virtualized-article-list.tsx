"use client"

import React, { useRef, useEffect } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { LawArticle } from "@/lib/law-types"
import { ArticleListItem } from "@/components/article-list-item"

interface VirtualizedArticleListProps {
  articles: LawArticle[]
  activeJo: string
  loadingJo: string | null
  favorites: Set<string>
  isOrdinance: boolean
  isPrecedent?: boolean  // 판례 모드
  lawTitle?: string // ✅ 법령명 추가
  onArticleClick: (jo: string) => void
  onToggleFavorite: (jo: string) => void
}

export const VirtualizedArticleList = React.memo(
  function VirtualizedArticleList({
    articles,
    activeJo,
    loadingJo,
    favorites,
    isOrdinance,
    isPrecedent = false,
    lawTitle = '',
    onArticleClick,
    onToggleFavorite,
  }: VirtualizedArticleListProps) {
    const parentRef = useRef<HTMLDivElement>(null)

    const virtualizer = useVirtualizer({
      count: articles.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => isPrecedent ? 28 : 60, // 판례: 컴팩트 / 법령: 일반
      overscan: 5, // Render 5 extra items above/below viewport
      measureElement: typeof window !== 'undefined' ? element => element?.getBoundingClientRect().height : undefined,
    })

    // activeJo가 변경되면 해당 위치로 스크롤
    useEffect(() => {
      if (!activeJo || articles.length === 0 || !parentRef.current) return

      const activeIndex = articles.findIndex(a => a.jo === activeJo)
      if (activeIndex !== -1) {
        // 컨테이너 높이가 설정될 때까지 대기 후 스크롤
        const timer = setTimeout(() => {
          const container = parentRef.current
          if (container && container.clientHeight > 0) {
            // 직접 스크롤 위치 계산 (virtualizer.scrollToIndex 대신)
            const scrollTop = Math.max(0, activeIndex * 60 - container.clientHeight / 2 + 30)
            container.scrollTop = scrollTop
          }
        }, 150)
        return () => clearTimeout(timer)
      }
    }, [activeJo, articles])

    return (
      <div
        ref={parentRef}
        className="h-full overflow-y-auto"
        style={{ contain: "strict" }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const article = articles[virtualItem.index]
            const isActive = activeJo === article.jo
            const isLoading = loadingJo === article.jo
            // ✅ 법령명+조문 조합으로 확인
            const isFavorite = favorites.has(`${lawTitle}-${article.jo}`)

            return (
              <div
                key={article.jo}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <ArticleListItem
                  article={article}
                  isActive={isActive}
                  isLoading={isLoading}
                  isFavorite={isFavorite}
                  isOrdinance={isOrdinance}
                  isPrecedent={isPrecedent}
                  onClick={() => onArticleClick(article.jo)}
                  onToggleFavorite={(e) => {
                    e.stopPropagation()
                    onToggleFavorite(article.jo)
                  }}
                />
              </div>
            )
          })}
        </div>
      </div>
    )
  }
)
