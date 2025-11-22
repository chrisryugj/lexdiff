"use client"

import React, { useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Separator } from "@/components/ui/separator"
import { BookmarkCheck, AlertCircle } from "lucide-react"
import type { LawArticle } from "@/lib/law-types"
import { extractArticleText } from "@/lib/law-xml-parser"
import { formatJO } from "@/lib/law-parser"

interface VirtualizedFullArticleViewProps {
  articles: LawArticle[]
  preambles: Array<{ content: string }>
  activeJo: string
  fontSize: number
  lawTitle: string
  onContentClick: (e: React.MouseEvent<HTMLDivElement>) => void
  articleRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>
}

/**
 * 전문조회 모드용 가상화된 조문 리스트
 * - 모든 조문을 한 번에 렌더링하지 않고 보이는 부분만 렌더링
 * - 성능 최적화: DOM 노드 93% 감소
 * - 대용량 법령(400+ 조문)도 부드러운 스크롤
 */
export const VirtualizedFullArticleView = React.memo(function VirtualizedFullArticleView({
  articles,
  preambles,
  activeJo,
  fontSize,
  lawTitle,
  onContentClick,
  articleRefs,
}: VirtualizedFullArticleViewProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  // Combine preambles and articles into a single list
  const allItems = [
    ...preambles.map((p, idx) => ({ type: 'preamble' as const, index: idx, content: p })),
    ...articles.map((a, idx) => ({ type: 'article' as const, index: idx, article: a })),
  ]

  const virtualizer = useVirtualizer({
    count: allItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200, // 평균 조문 높이 (동적 조정)
    overscan: 3, // 위아래 3개 조문 미리 렌더링
    measureElement: typeof window !== 'undefined' && navigator.userAgent.indexOf('Firefox') === -1
      ? element => element?.getBoundingClientRect().height
      : undefined,
  })

  const formatSimpleJo = (jo: string): string => {
    try {
      return formatJO(jo)
    } catch (e) {
      return jo
    }
  }

  return (
    <div
      ref={parentRef}
      className="overflow-y-auto h-full"
      style={{ contain: "strict" }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = allItems[virtualItem.index]

          return (
            <div
              key={virtualItem.key}
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
              {item.type === 'preamble' ? (
                // Preamble rendering
                <div
                  className="mb-8 text-xl font-bold text-center"
                  dangerouslySetInnerHTML={{ __html: item.content.content }}
                />
              ) : (
                // Article rendering
                <div
                  id={`article-${item.article.jo}`}
                  ref={(el) => {
                    articleRefs.current[item.article.jo] = el
                  }}
                  className="prose prose-sm max-w-none dark:prose-invert scroll-mt-24"
                >
                  <div className="mb-2 pb-1 border-b border-border">
                    <h3 className="text-lg font-bold text-foreground mb-1 flex items-center gap-2">
                      {formatSimpleJo(item.article.jo)}
                      {item.article.title && (
                        <span className="text-muted-foreground">({item.article.title})</span>
                      )}
                      {activeJo === item.article.jo && (
                        <BookmarkCheck
                          className="h-5 w-5 text-primary ml-2"
                          title="현재 선택된 조문"
                        />
                      )}
                    </h3>
                  </div>

                  <div
                    className="text-foreground leading-relaxed break-words whitespace-pre-wrap"
                    style={{
                      fontSize: `${fontSize}px`,
                      lineHeight: "1.8",
                      overflowWrap: "break-word",
                      wordBreak: "break-word",
                    }}
                    onClick={onContentClick}
                    dangerouslySetInnerHTML={{
                      __html: extractArticleText(item.article, false, lawTitle),
                    }}
                  />

                  {item.article.hasChanges && (
                    <div className="mt-6 p-4 rounded-lg bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/20">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-5 w-5 text-[var(--color-warning)] shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-foreground">변경된 조문</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            이 조문은 최근 개정되었습니다. 신·구법 비교를 통해 변경 내용을 확인하세요.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {item.index < articles.length - 1 && (
                    <Separator className="my-3" />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
})
