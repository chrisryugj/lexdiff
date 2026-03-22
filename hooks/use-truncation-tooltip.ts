/**
 * hooks/use-truncation-tooltip.ts
 *
 * 텍스트 잘림(truncation) 감지 + 마우스 추적 툴팁을 위한 공통 훅.
 * LawResultCard, OrdinanceResultCard, PrecedentResultCard,
 * PrecedentListItem 등에서 동일하게 반복되던 로직을 통합.
 */

import { useState, useRef, useCallback, useEffect } from 'react'

interface UseTruncationTooltipOptions {
  /** truncation 재검사를 트리거할 의존값 (예: 표시 텍스트) */
  watchValue?: string
  /**
   * scrollHeight vs clientHeight 비교 (line-clamp 다중 줄용).
   * false(기본)이면 scrollWidth vs clientWidth (단일 줄 truncate).
   */
  multiLine?: boolean
  /** 문자열 길이 기반 폴백 임계값. 0이면 폴백 없음. */
  lengthFallback?: number
}

interface TruncationTooltipResult<E extends HTMLElement> {
  ref: React.RefObject<E | null>
  isTruncated: boolean
  showTooltip: boolean
  tooltipPosition: { x: number; y: number }
  onMouseEnter: () => void
  onMouseMove: (e: React.MouseEvent) => void
  onMouseLeave: () => void
}

export function useTruncationTooltip<E extends HTMLElement = HTMLElement>(
  options: UseTruncationTooltipOptions = {}
): TruncationTooltipResult<E> {
  const { watchValue, multiLine = false, lengthFallback = 0 } = options

  const ref = useRef<E | null>(null)
  const [isTruncated, setIsTruncated] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const element = ref.current
    if (!element) return

    let mounted = true

    const checkTruncated = () => {
      if (!mounted || !element) return
      const isTrunc = multiLine
        ? element.scrollHeight > element.clientHeight
        : element.scrollWidth > element.clientWidth
      // 문자열 길이 폴백 (폰트 미로딩 등 edge case 대비)
      const fallback = lengthFallback > 0 && (watchValue?.length || 0) > lengthFallback
      setIsTruncated(isTrunc || !!fallback)
    }

    // 폰트 로딩 후 체크 (Pretendard 등 웹폰트 대기)
    const init = async () => {
      try {
        if (document.fonts?.ready) {
          await document.fonts.ready
        }
      } catch {
        // fonts API 미지원 시 무시
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          checkTruncated()
        })
      })
    }
    init()

    const observer = new ResizeObserver(checkTruncated)
    observer.observe(element)

    return () => {
      mounted = false
      observer.disconnect()
    }
  }, [watchValue, multiLine, lengthFallback])

  const onMouseEnter = useCallback(() => {
    setShowTooltip(true)
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltipPosition({ x: e.clientX, y: e.clientY })
  }, [])

  const onMouseLeave = useCallback(() => {
    setShowTooltip(false)
  }, [])

  return {
    ref,
    isTruncated,
    showTooltip,
    tooltipPosition,
    onMouseEnter,
    onMouseMove,
    onMouseLeave,
  }
}
