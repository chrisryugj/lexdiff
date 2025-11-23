"use client"

import React from "react"
import { Star, Bookmark, BookmarkCheck, AlertCircle } from "lucide-react"
import type { LawArticle } from "@/lib/law-types"
import { formatJO } from "@/lib/law-parser"

interface ArticleListItemProps {
  article: LawArticle
  isActive: boolean
  isLoading: boolean
  isFavorite: boolean
  isOrdinance: boolean
  onClick: () => void
  onToggleFavorite: (e: React.MouseEvent | React.KeyboardEvent) => void
}

export const ArticleListItem = React.memo(function ArticleListItem({
  article,
  isActive,
  isLoading,
  isFavorite,
  isOrdinance,
  onClick,
  onToggleFavorite,
}: ArticleListItemProps) {
  const formatSimpleJo = (jo: string, isOrdinance: boolean) => {
    if (isOrdinance) return formatJO(jo)
    return formatJO(jo)
  }

  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className={`w-full text-left px-3 py-2.5 rounded-md transition-colors ${
        isActive
          ? "bg-primary text-primary-foreground font-bold"
          : "hover:bg-secondary text-foreground font-medium"
      } ${isLoading ? "opacity-50 cursor-wait" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold">
            {article.joNum || formatSimpleJo(article.jo, isOrdinance)}
          </div>
          {article.title && (
            <div className="text-sm opacity-80 mt-0.5 line-clamp-2">({article.title})</div>
          )}
          {isLoading && <span className="text-xs opacity-60">로딩중...</span>}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isActive ? (
            <BookmarkCheck className="h-3.5 w-3.5 text-primary-foreground" />
          ) : (
            <Bookmark className="h-3.5 w-3.5 opacity-40" />
          )}
          <span
            role="button"
            tabIndex={0}
            onClick={onToggleFavorite}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onToggleFavorite(event)
              }
            }}
            className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
              isFavorite
                ? "text-[var(--color-warning)]"
                : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
            }`}
            aria-label={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
            aria-pressed={isFavorite}
            title={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          >
            <Star className={`h-3 w-3 ${isFavorite ? "fill-current" : ""}`} />
          </span>
          {article.hasChanges && (
            <AlertCircle
              className="h-3 w-3 text-[var(--color-warning)]"
              title="변경된 조문"
            />
          )}
        </div>
      </div>
    </button>
  )
})
