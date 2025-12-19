/**
 * ai-search-loading/typing-text.tsx
 *
 * 타이핑 효과 컴포넌트
 * - SSE 청크가 도착하면 text prop이 업데이트됨
 * - 커서가 이전 위치에서 계속 진행 (자연스러운 타이핑)
 */

"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"

interface TypingTextProps {
  /** SSE로 누적된 전체 텍스트 */
  text: string
  /** 타이핑 속도 (ms/char), 기본 10ms */
  speed?: number
  /** 추가 클래스명 */
  className?: string
  /** 마크다운 렌더링 여부 */
  renderMarkdown?: boolean
  /** 타이핑 완료 시 콜백 */
  onComplete?: () => void
}

export function TypingText({
  text,
  speed = 10,
  className,
  renderMarkdown = true,
  onComplete,
}: TypingTextProps) {
  const [displayedLength, setDisplayedLength] = useState(0)
  const prevTextLengthRef = useRef(0)
  const isCompleteRef = useRef(false)

  // 텍스트가 변경되면 타이핑 계속
  useEffect(() => {
    if (displayedLength >= text.length) {
      // 타이핑 완료
      if (!isCompleteRef.current && text.length > 0) {
        isCompleteRef.current = true
        onComplete?.()
      }
      return
    }

    // 새 텍스트가 추가된 경우, 이전 위치에서 계속 타이핑
    const timeout = setTimeout(() => {
      setDisplayedLength((prev) => Math.min(prev + 1, text.length))
    }, speed)

    return () => clearTimeout(timeout)
  }, [displayedLength, text.length, speed, onComplete])

  // 텍스트가 업데이트되면 isComplete 리셋
  useEffect(() => {
    if (text.length > prevTextLengthRef.current) {
      isCompleteRef.current = false
    }
    prevTextLengthRef.current = text.length
  }, [text.length])

  // 표시할 텍스트
  const displayedText = useMemo(() => {
    return text.slice(0, displayedLength)
  }, [text, displayedLength])

  // 타이핑 중인지 여부
  const isTyping = displayedLength < text.length

  if (!text) {
    return null
  }

  return (
    <div className={cn("relative", className)}>
      {renderMarkdown ? (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {displayedText}
          </ReactMarkdown>
        </div>
      ) : (
        <span className="whitespace-pre-wrap">{displayedText}</span>
      )}
      {/* 타이핑 커서 */}
      {isTyping && (
        <span className="inline-block w-0.5 h-5 bg-primary animate-pulse ml-0.5 align-middle" />
      )}
    </div>
  )
}
