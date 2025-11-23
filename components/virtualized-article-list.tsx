"use client"

import React, { useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { LawArticle } from "@/lib/law-types"
import { ArticleListItem } from "@/components/article-list-item"

interface VirtualizedArticleListProps {
  articles: LawArticle[]
  activeJo: string
  loadingJo: string | null
  favorites: Set<string>
  isOrdinance: boolean
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
    onArticleClick,
    onToggleFavorite,
  }: VirtualizedArticleListProps) {
    const parentRef = useRef<HTMLDivElement>(null)

    const virtualizer = useVirtualizer({
      count: articles.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => 60, // Estimated item height in pixels
      overscan: 5, // Render 5 extra items above/below viewport
    })

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
            const isFavorite = favorites.has(article.jo)

            return (
              <div
                key={article.jo}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <ArticleListItem
                  article={article}
                  isActive={isActive}
                  isLoading={isLoading}
                  isFavorite={isFavorite}
                  isOrdinance={isOrdinance}
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
