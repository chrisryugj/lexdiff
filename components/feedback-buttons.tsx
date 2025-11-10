"use client"

import { useState } from "react"
import { ThumbsUp, ThumbsDown } from "lucide-react"
import { Button } from "@/components/ui/button"
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
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">이 검색 결과가 도움이 되었나요?</span>
      <Button
        variant={userFeedback === "positive" ? "default" : "outline"}
        size="sm"
        onClick={() => handleFeedback("positive")}
        disabled={isSubmitting || userFeedback === "positive"}
        className="gap-1"
      >
        <ThumbsUp className={`h-4 w-4 ${userFeedback === "positive" ? "fill-current" : ""}`} />
        <span>도움됨</span>
      </Button>
      <Button
        variant={userFeedback === "negative" ? "destructive" : "outline"}
        size="sm"
        onClick={() => handleFeedback("negative")}
        disabled={isSubmitting || userFeedback === "negative"}
        className="gap-1"
      >
        <ThumbsDown className={`h-4 w-4 ${userFeedback === "negative" ? "fill-current" : ""}`} />
        <span>도움 안됨</span>
      </Button>
    </div>
  )
}
