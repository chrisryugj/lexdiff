"use client"

import React from "react"
import { Icon } from "@/components/ui/icon"
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

/**
 * 삭제된 조문인지 판별
 * - "삭제 ＜2008.12.26＞" 형식
 * - "삭제" 단독
 * - content와 title 모두 비어있는 경우
 */
function isDeletedArticle(article: LawArticle): boolean {
  const content = article.content?.trim() || ""
  const title = article.title?.trim() || ""

  // "삭제 ＜날짜＞" 또는 "삭제" 패턴 감지 (전각/반각 괄호 모두 지원)
  // 예: "삭제 ＜2008.12.26＞", "삭제 <2008.12.26>", "삭제"
  const deletedPattern = /^삭제\s*[＜<]?\s*[\d.,-]*\s*[＞>]?\s*$/
  if (deletedPattern.test(content)) return true

  // content와 title 모두 비어있는 경우
  if (!content && !title) return true

  return false
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

  const isDeleted = isDeletedArticle(article)

  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className={`w-full text-left px-2 py-2 rounded-md transition-colors ${
        isActive
          ? "bg-primary text-primary-foreground font-bold"
          : "hover:bg-secondary text-foreground font-medium"
      } ${isLoading ? "opacity-50 cursor-wait" : ""} ${isDeleted ? "opacity-40 text-muted-foreground" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-base font-bold">
            {article.joNum || formatSimpleJo(article.jo, isOrdinance)}
            {isDeleted && (
              <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-muted/50 text-muted-foreground rounded">
                삭제된 조문
              </span>
            )}
          </div>
          {article.title && !isDeleted && (
            <div
              className="text-sm opacity-75 mt-0.5 truncate"
              title={article.title}
            >
              ({article.title})
            </div>
          )}
          {isLoading && <span className="text-xs opacity-60">로딩중...</span>}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isFavorite && (
            <Icon name="star" className="h-3 w-3 fill-yellow-400 text-yellow-400" />
          )}
          {article.hasChanges && (
            <Icon
              name="alert-circle"
              className="h-3 w-3 text-[var(--color-warning)]"
              title="변경된 조문"
            />
          )}
        </div>
      </div>
    </button>
  )
})
