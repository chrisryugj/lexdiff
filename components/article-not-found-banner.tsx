"use client"

import { AlertCircle, ChevronRight } from "lucide-react"
import { Button } from "./ui/button"
import { Card } from "./ui/card"
import type { LawArticle } from "@/lib/law-types"
import { formatJO } from "@/lib/law-parser"

interface ArticleNotFoundBannerProps {
  requestedJo: string
  lawTitle: string
  nearestArticles: LawArticle[]
  crossLawSuggestions?: Array<{
    lawTitle: string
    lawId: string | null
    articleJo: string
  }>
  onSelectArticle: (jo: string) => void
  onSelectCrossLaw?: (lawTitle: string) => void
  onDismiss: () => void
}

export function ArticleNotFoundBanner({
  requestedJo,
  lawTitle,
  nearestArticles,
  crossLawSuggestions = [],
  onSelectArticle,
  onSelectCrossLaw,
  onDismiss,
}: ArticleNotFoundBannerProps) {
  const requestedDisplay = formatJO(requestedJo)

  return (
    <Card className="p-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20 mb-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-3">
          <div>
            <h3 className="font-semibold text-yellow-900 dark:text-yellow-100">
              요청하신 조문을 찾을 수 없습니다
            </h3>
            <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-1">
              {lawTitle}에 <strong>{requestedDisplay}</strong>가(이) 없습니다.
            </p>
          </div>

          {nearestArticles.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                이 법령의 유사 조문:
              </p>
              <div className="flex flex-wrap gap-2">
                {nearestArticles.map((article) => (
                  <Button
                    key={article.jo}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onSelectArticle(article.jo)
                      onDismiss()
                    }}
                    className="bg-white dark:bg-gray-800"
                  >
                    {formatJO(article.jo)}
                    {article.title && (
                      <span className="ml-1 text-xs opacity-70">
                        ({article.title.substring(0, 15)}{article.title.length > 15 ? '...' : ''})
                      </span>
                    )}
                    <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                ))}
              </div>
            </div>
          )}

          {crossLawSuggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                다른 법령에서 많이 검색된 {requestedDisplay}:
              </p>
              <div className="space-y-1">
                {crossLawSuggestions.map((suggestion, idx) => (
                  <Button
                    key={idx}
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      onSelectCrossLaw?.(suggestion.lawTitle)
                      onDismiss()
                    }}
                    className="w-full justify-start text-left h-auto py-2 px-3 bg-white dark:bg-gray-800"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{suggestion.lawTitle} {requestedDisplay}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 ml-2 flex-shrink-0" />
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onDismiss}
              className="text-xs"
            >
              닫기
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
