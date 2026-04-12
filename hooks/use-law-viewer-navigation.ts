"use client"

import { useState, useEffect, useCallback } from "react"
import { useSwipe } from "@/hooks/use-swipe"
import type { LawArticle } from "@/lib/law-types"

interface UseLawViewerNavigationOptions {
  activeJo: string
  actualArticles: LawArticle[]
  isModalOpen: boolean
  onNavigate: (jo: string) => void
}

/**
 * 법령 뷰어 키보드/스와이프 조문 네비게이션 훅.
 * ArrowUp/Down/Left/Right 키보드 + 모바일 스와이프 제스처를 처리.
 */
export function useLawViewerNavigation({
  activeJo,
  actualArticles,
  isModalOpen,
  onNavigate,
}: UseLawViewerNavigationOptions) {
  const [swipeHint, setSwipeHint] = useState<{ direction: "left" | "right" } | null>(null)

  // Swipe handlers
  const handleSwipeLeft = useCallback(() => {
    const currentIndex = actualArticles.findIndex(a => a.jo === activeJo)
    if (currentIndex < actualArticles.length - 1) {
      const nextArticle = actualArticles[currentIndex + 1]
      setSwipeHint({ direction: "left" })
      onNavigate(nextArticle.jo)
    }
  }, [activeJo, actualArticles, onNavigate])

  const handleSwipeRight = useCallback(() => {
    const currentIndex = actualArticles.findIndex(a => a.jo === activeJo)
    if (currentIndex > 0) {
      const prevArticle = actualArticles[currentIndex - 1]
      setSwipeHint({ direction: "right" })
      onNavigate(prevArticle.jo)
    }
  }, [activeJo, actualArticles, onNavigate])

  const swipeRef = useSwipe<HTMLDivElement>({
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
  }, {
    threshold: 80,
    timeThreshold: 400,
  })

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      if (activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA') return
      if (isModalOpen) return
      // P2-LV-3: 다른 Radix Dialog가 열려 있으면 키보드 네비 차단
      if (typeof document !== 'undefined' &&
          document.querySelector('[role="dialog"][data-state="open"]')) return

      const currentIndex = actualArticles.findIndex(a => a.jo === activeJo)
      if (currentIndex === -1) return

      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        if (currentIndex > 0) {
          e.preventDefault()
          onNavigate(actualArticles[currentIndex - 1].jo)
        }
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        if (currentIndex < actualArticles.length - 1) {
          e.preventDefault()
          onNavigate(actualArticles[currentIndex + 1].jo)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeJo, actualArticles, isModalOpen, onNavigate])

  const dismissSwipeHint = useCallback(() => setSwipeHint(null), [])

  return { swipeRef, swipeHint, dismissSwipeHint }
}
