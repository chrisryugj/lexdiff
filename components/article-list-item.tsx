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
      className={`w-full text-left px-2 py-2 rounded-md transition-colors ${
        isActive
          ? "bg-primary text-primary-foreground font-bold"
          : "hover:bg-secondary text-foreground font-medium"
      } ${isLoading ? "opacity-50 cursor-wait" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold">
            {article.joNum || formatSimpleJo(article.jo, isOrdinance)}
          </div>
          {article.title && (
            <div
              className="text-xs opacity-75 mt-0.5 truncate"
              title={article.title}
            >
              ({article.title})
            </div>
          )}
          {isLoading && <span className="text-xs opacity-60">로딩중...</span>}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isFavorite && (
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
          )}
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
