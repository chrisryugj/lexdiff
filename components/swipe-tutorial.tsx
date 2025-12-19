"use client"

import { useState, useEffect } from "react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface SwipeTutorialProps {
  onComplete: () => void
}

/**
 * 스와이프 튜토리얼 오버레이
 * - 첫 방문 시 표시
 * - 좌우 스와이프 안내
 * - 애니메이션 화살표
 * - "다시 보지 않기" 옵션
 */
export function SwipeTutorial({ onComplete }: SwipeTutorialProps) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    // 튜토리얼 표시 여부 확인 (localStorage)
    const hasSeenTutorial = localStorage.getItem("swipeTutorialSeen")
    if (!hasSeenTutorial) {
      // 1초 후 표시 (페이지 로드 후)
      const timer = setTimeout(() => {
        setShow(true)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleDismiss = (dontShowAgain: boolean) => {
    if (dontShowAgain) {
      localStorage.setItem("swipeTutorialSeen", "true")
    }
    setShow(false)
    onComplete()
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 md:hidden">
      <div className="bg-background border border-border rounded-lg p-6 max-w-sm w-full shadow-xl">
        {/* Close button */}
        <button
          onClick={() => handleDismiss(false)}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <Icon name="x" className="h-5 w-5" />
        </button>

        {/* Title */}
        <h3 className="text-lg font-bold text-foreground mb-4 text-center">
          조문 간 이동 방법
        </h3>

        {/* Animation area */}
        <div className="relative h-32 bg-secondary/30 rounded-lg mb-6 overflow-hidden">
          {/* Left arrow animation */}
          <div className="absolute inset-y-0 left-0 flex items-center animate-swipe-left">
            <Icon name="chevron-left" className="h-12 w-12 text-primary" strokeWidth={3} />
          </div>

          {/* Right arrow animation */}
          <div className="absolute inset-y-0 right-0 flex items-center animate-swipe-right">
            <Icon name="chevron-right" className="h-12 w-12 text-primary" strokeWidth={3} />
          </div>

          {/* Center text */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">좌우로 스와이프</p>
              <p className="text-xs text-muted-foreground mt-1">이전/다음 조문</p>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="space-y-2 mb-6">
          <div className="flex items-center gap-2 text-sm">
            <Icon name="chevron-left" className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="text-foreground">왼쪽 스와이프: 다음 조문</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Icon name="chevron-right" className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="text-foreground">오른쪽 스와이프: 이전 조문</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => handleDismiss(true)}
            variant="default"
            className="w-full"
          >
            확인 (다시 보지 않기)
          </Button>
          <Button
            onClick={() => handleDismiss(false)}
            variant="ghost"
            className="w-full"
          >
            닫기
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * 스와이프 힌트 (화면 하단)
 * - 스와이프 시작 시 표시
 * - 3초 후 자동 사라짐
 * - 반투명 배경 + 화살표
 */
interface SwipeHintProps {
  direction: "left" | "right"
  onDismiss: () => void
}

export function SwipeHint({ direction, onDismiss }: SwipeHintProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss()
    }, 3000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div className="fixed bottom-20 left-0 right-0 z-40 flex justify-center pointer-events-none md:hidden">
      <div
        className={cn(
          "bg-primary text-primary-foreground px-4 py-2 rounded-full shadow-lg flex items-center gap-2",
          "animate-fade-in"
        )}
      >
        {direction === "right" ? (
          <>
            <Icon name="chevron-right" className="h-4 w-4" />
            <span className="text-sm font-medium">이전 조문</span>
          </>
        ) : (
          <>
            <Icon name="chevron-left" className="h-4 w-4" />
            <span className="text-sm font-medium">다음 조문</span>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * 스와이프 피드백 (화면 양쪽 가장자리)
 * - 스와이프 진행 중 표시
 * - 화살표 + 진행 상태
 */
interface SwipeFeedbackProps {
  direction: "left" | "right"
  progress: number // 0-1
}

export function SwipeFeedback({ direction, progress }: SwipeFeedbackProps) {
  const isLeft = direction === "left"

  return (
    <div
      className={cn(
        "fixed inset-y-0 flex items-center z-30 pointer-events-none md:hidden",
        isLeft ? "left-0" : "right-0"
      )}
    >
      <div
        className={cn(
          "p-4 bg-primary/20 backdrop-blur-sm transition-opacity",
          progress > 0.3 ? "opacity-100" : "opacity-0"
        )}
        style={{
          [isLeft ? "paddingRight" : "paddingLeft"]: `${progress * 50}px`,
        }}
      >
        {isLeft ? (
          <Icon
            name="chevron-left"
            className="h-8 w-8 text-primary"
            strokeWidth={3}
          />
        ) : (
          <Icon
            name="chevron-right"
            className="h-8 w-8 text-primary"
            strokeWidth={3}
          />
        )}
      </div>
    </div>
  )
}
