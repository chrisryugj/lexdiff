"use client"

import * as React from "react"
import { useState, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@/components/ui/icon"
import { Button, buttonVariants } from "./button"
import { cn } from "@/lib/utils"
import type { VariantProps } from "class-variance-authority"

interface CopyButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>,
    VariantProps<typeof buttonVariants> {
  /** 복사할 텍스트 또는 텍스트를 반환하는 함수 */
  getText: string | (() => string | Promise<string>)
  /** 알림 메시지 (기본: "복사됨") */
  message?: string
  /** 알림 표시 시간 (기본: 1500ms) */
  duration?: number
  /** 아이콘만 표시할지 여부 */
  iconOnly?: boolean
  /** 버튼 레이블 (iconOnly=false일 때) */
  label?: string
  /** 복사 성공 시 콜백 */
  onCopySuccess?: () => void
  /** 복사 실패 시 콜백 */
  onCopyError?: (error: Error) => void
}

export function CopyButton({
  getText,
  message = "복사됨",
  duration = 1500,
  iconOnly = true,
  label = "복사",
  variant = "ghost",
  size = "sm",
  className,
  onCopySuccess,
  onCopyError,
  ...props
}: CopyButtonProps) {
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedbackPosition, setFeedbackPosition] = useState({ x: 0, y: 0, showBelow: false })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleCopy = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation()

      // 버튼 위치 계산 - 버튼 위 또는 아래에 표시
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect()
        // 버튼이 화면 상단에 가까우면 아래에 표시, 아니면 위에 표시
        const showBelow = rect.top < 50
        setFeedbackPosition({
          x: rect.left + rect.width / 2,
          y: showBelow ? rect.bottom + 8 : rect.top - 8,
          showBelow,
        })
      }

      try {
        // 텍스트 가져오기
        const text = typeof getText === "function" ? await getText() : getText

        // 클립보드에 복사
        await navigator.clipboard.writeText(text)

        // 피드백 표시
        setShowFeedback(true)
        onCopySuccess?.()

        // 이전 타이머 정리
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }

        // 자동 숨김
        timeoutRef.current = setTimeout(() => {
          setShowFeedback(false)
        }, duration)
      } catch (error) {
        console.error("복사 실패:", error)
        onCopyError?.(error as Error)
      }
    },
    [getText, duration, onCopySuccess, onCopyError]
  )

  // 컴포넌트 언마운트 시 타이머 정리
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <>
      <Button
        ref={buttonRef}
        variant={variant}
        size={size}
        className={cn(iconOnly && "h-8 w-8 p-0", className)}
        onClick={handleCopy}
        title={label}
        {...props}
      >
        {showFeedback ? (
          <Icon name="check" className="w-4 h-4 text-green-500" />
        ) : (
          <Icon name="copy" className="w-4 h-4" />
        )}
        {!iconOnly && <span className="ml-1">{label}</span>}
      </Button>

      {/* 위치 기반 알림 - Portal로 body에 렌더링 */}
      {showFeedback && typeof document !== "undefined" && (
        <CopyFeedbackPortal position={feedbackPosition} message={message} />
      )}
    </>
  )
}

/** 알림 포탈 컴포넌트 - 실제 React Portal로 body에 렌더링 */
function CopyFeedbackPortal({
  position,
  message,
}: {
  position: { x: number; y: number; showBelow: boolean }
  message: string
}) {
  // 클라이언트 사이드에서만 렌더링
  if (typeof window === "undefined") return null

  return createPortal(
    <div
      className={cn(
        "fixed z-[9999] pointer-events-none animate-in fade-in-0 zoom-in-95",
        position.showBelow ? "slide-in-from-top-2" : "slide-in-from-bottom-2"
      )}
      style={{
        left: position.x,
        top: position.y,
        transform: position.showBelow ? "translate(-50%, 0)" : "translate(-50%, -100%)",
      }}
    >
      <div className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm font-medium shadow-lg">
        {message}
      </div>
    </div>,
    document.body
  )
}

export { CopyButton as default }
