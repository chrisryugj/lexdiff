"use client"

import { useState, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { generateSuggestions, type ArticleSuggestion } from "@/lib/article-suggestions"

interface ArticleSuggestionsProps {
  /** 조문 본문 텍스트 (HTML 포함 가능 — 내부에서 strip) */
  articleText: string
  /** 법령명 */
  lawName: string
  /** 조문번호 (예: "제56조") */
  articleNo: string
  /** AI 질의 실행 */
  onAiQuery: (query: string, preEvidence?: string) => void
  /** 법령 액션 실행 (시행령 보기, 별표 보기 등) */
  onLawAction: (action: string) => void
  /** 조문 원문 (AI에 preEvidence로 전달) */
  preEvidence?: string
}

export function ArticleSuggestions({
  articleText,
  lawName,
  articleNo,
  onAiQuery,
  onLawAction,
  preEvidence,
}: ArticleSuggestionsProps) {
  const [customQuery, setCustomQuery] = useState("")
  const [isExpanded, setIsExpanded] = useState(false)

  const suggestions = useMemo(
    () => generateSuggestions(articleText, lawName, articleNo),
    [articleText, lawName, articleNo]
  )

  const handleChipClick = (s: ArticleSuggestion) => {
    if (s.type === 'ai' && s.query) {
      onAiQuery(s.query, preEvidence)
    } else if (s.type === 'law' && s.action) {
      onLawAction(s.action)
    }
  }

  const handleCustomSubmit = () => {
    const q = customQuery.trim()
    if (!q) return
    // 사용자 직접 입력 질의 — 조문 컨텍스트를 함께 전달
    const fullQuery = `「${lawName}」 ${articleNo}에 대해: ${q}`
    onAiQuery(fullQuery, preEvidence)
    setCustomQuery("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleCustomSubmit()
    }
  }

  if (!isExpanded) {
    return (
      <div className="mt-4 mb-2">
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon name="sparkles" size={14} className="text-blue-400" />
          <span>AI에게 이 조문에 대해 물어보기</span>
          <Icon name="chevron-down" size={12} />
        </button>
      </div>
    )
  }

  return (
    <div className="mt-4 mb-2 rounded-lg border border-border bg-muted/30 p-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon name="sparkles" size={14} className="text-blue-400" />
          <span>AI에게 물어보기</span>
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          className="text-muted-foreground hover:text-foreground"
        >
          <Icon name="chevron-up" size={14} />
        </button>
      </div>

      {/* 추천 칩 */}
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {suggestions.map((s) => (
          <Badge
            key={s.label}
            variant="secondary"
            className="cursor-pointer text-xs px-2.5 py-1 hover:bg-secondary/80 transition-colors select-none"
            onClick={() => handleChipClick(s)}
          >
            {s.type === 'ai' && <Icon name="sparkles" size={10} className="mr-1 text-blue-400" />}
            {s.type === 'law' && <Icon name="book-open" size={10} className="mr-1 text-emerald-400" />}
            {s.label}
          </Badge>
        ))}
      </div>

      {/* 직접 입력 */}
      <div className="flex gap-1.5">
        <input
          type="text"
          value={customQuery}
          onChange={(e) => setCustomQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="궁금한 점을 직접 입력하세요..."
          className="flex-1 h-8 rounded-md border border-border bg-background px-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button
          variant="secondary"
          size="sm"
          className="h-8 px-2.5"
          onClick={handleCustomSubmit}
          disabled={!customQuery.trim()}
        >
          <Icon name="send" size={14} />
        </Button>
      </div>
    </div>
  )
}
