"use client"

import { useRef, useEffect } from "react"

interface SwipeHandlers {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
}

interface SwipeConfig {
  threshold?: number // Minimum distance to be considered a swipe (in pixels)
  timeThreshold?: number // Maximum time for a swipe (in ms)
}

export function useSwipe<T extends HTMLElement = HTMLElement>(
  handlers: SwipeHandlers,
  config: SwipeConfig = {}
) {
  const { threshold = 50, timeThreshold = 300 } = config
  const elementRef = useRef<T>(null)
  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)
  const touchStartTime = useRef<number>(0)
  // 방향 락: 'pending' → touchmove에서 horizontal/vertical/invalid로 확정
  const directionLock = useRef<"pending" | "horizontal" | "vertical" | "invalid">("pending")

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    // 방향 판정 시작 임계 (px). 이 거리까지는 'pending'.
    const LOCK_THRESHOLD = 10

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX
      touchStartY.current = e.touches[0].clientY
      touchStartTime.current = Date.now()
      directionLock.current = "pending"
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (directionLock.current !== "pending") return
      const dx = e.touches[0].clientX - touchStartX.current
      const dy = e.touches[0].clientY - touchStartY.current
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)
      if (absDx < LOCK_THRESHOLD && absDy < LOCK_THRESHOLD) return
      // 수직이 수평보다 우세하면 이 제스처는 스크롤로 간주하고 스와이프 무시
      if (absDy > absDx) {
        directionLock.current = "vertical"
      } else {
        directionLock.current = "horizontal"
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      const lock = directionLock.current
      directionLock.current = "pending"
      // 수직 스크롤로 락되면 스와이프 취소
      if (lock === "vertical" || lock === "invalid") return

      const touchEndX = e.changedTouches[0].clientX
      const touchEndY = e.changedTouches[0].clientY
      const touchEndTime = Date.now()

      const deltaX = touchEndX - touchStartX.current
      const deltaY = touchEndY - touchStartY.current
      const deltaTime = touchEndTime - touchStartTime.current

      if (deltaTime > timeThreshold) return

      const absDeltaX = Math.abs(deltaX)
      const absDeltaY = Math.abs(deltaY)

      // Horizontal 락 또는 pending(짧은 탭 제외)인 경우에만 가로 스와이프 처리
      if (lock === "horizontal" && absDeltaX > threshold && absDeltaX > absDeltaY) {
        if (deltaX > 0) {
          handlers.onSwipeRight?.()
        } else {
          handlers.onSwipeLeft?.()
        }
        return
      }
      // 상하 스와이프는 명시적으로 사용하는 곳 없을 때는 생략 (세로 스크롤과 충돌)
      if (handlers.onSwipeUp || handlers.onSwipeDown) {
        if (absDeltaY > absDeltaX && absDeltaY > threshold) {
          if (deltaY > 0) handlers.onSwipeDown?.()
          else handlers.onSwipeUp?.()
        }
      }
    }

    const handleTouchCancel = () => {
      directionLock.current = "invalid"
    }

    element.addEventListener("touchstart", handleTouchStart, { passive: true })
    element.addEventListener("touchmove", handleTouchMove, { passive: true })
    element.addEventListener("touchend", handleTouchEnd, { passive: true })
    element.addEventListener("touchcancel", handleTouchCancel, { passive: true })

    return () => {
      element.removeEventListener("touchstart", handleTouchStart)
      element.removeEventListener("touchmove", handleTouchMove)
      element.removeEventListener("touchend", handleTouchEnd)
      element.removeEventListener("touchcancel", handleTouchCancel)
    }
  }, [handlers, threshold, timeThreshold])

  return elementRef
}
