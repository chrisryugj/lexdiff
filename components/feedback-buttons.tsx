"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { debugLogger } from "@/lib/debug-logger"

interface FeedbackButtonsProps {
  searchQueryId?: number
  searchResultId?: number
  lawId?: string
  lawTitle?: string
  articleNumber?: string
  onFeedbackSubmit?: (feedback: "positive" | "negative") => void
}

export function FeedbackButtons({
  searchQueryId,
  searchResultId,
  lawId,
  lawTitle,
  articleNumber,
  onFeedbackSubmit,
}: FeedbackButtonsProps) {
  const [userFeedback, setUserFeedback] = useState<"positive" | "negative" | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleFeedback = async (feedback: "positive" | "negative") => {
    if (isSubmitting || userFeedback === feedback) return

    setIsSubmitting(true)

    try {
      debugLogger.info('피드백 제출 시도', { feedback, searchQueryId, searchResultId })

      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchQueryId,
          searchResultId,
          lawId,
          lawTitle,
          articleNumber,
          feedback,
        }),
      })

      if (!response.ok) {
        throw new Error('피드백 제출 실패')
      }

      const result = await response.json()
      debugLogger.success('피드백 제출 완료', result)

      setUserFeedback(feedback)
      onFeedbackSubmit?.(feedback)
    } catch (error) {
      debugLogger.error('피드백 제출 실패', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-muted-foreground">
        <span className="hidden sm:inline">이 검색 결과가 도움이 되었나요?</span>
        <span className="sm:hidden">도움이 되었나요?</span>
      </span>
      <div className="flex gap-2">
        <Button
          variant={userFeedback === "positive" ? "default" : "outline"}
          size="sm"
          onClick={() => handleFeedback("positive")}
          disabled={isSubmitting || userFeedback === "positive"}
          className="gap-1"
        >
          <Icon name="thumbs-up" className={`h-4 w-4 ${userFeedback === "positive" ? "fill-current" : ""}`} />
          <span className="hidden xs:inline">도움됨</span>
        </Button>
        <Button
          variant={userFeedback === "negative" ? "destructive" : "outline"}
          size="sm"
          onClick={() => handleFeedback("negative")}
          disabled={isSubmitting || userFeedback === "negative"}
          className="gap-1"
        >
          <Icon name="thumbs-down" className={`h-4 w-4 ${userFeedback === "negative" ? "fill-current" : ""}`} />
          <span className="hidden xs:inline">도움 안됨</span>
        </Button>
      </div>
    </div>
  )
}
