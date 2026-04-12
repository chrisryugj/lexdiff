"use client"

import { useEffect, useRef, useState } from "react"

interface UseScrollDirectionOptions {
  /** 이 값 이하의 scrollY에서는 항상 visible (헤더 영역) */
  topThreshold?: number
  /** 방향 변화 감지에 필요한 최소 delta px */
  deltaThreshold?: number
  /** 마지막 스크롤 후 자동 visible 복원 ms */
  idleRestoreMs?: number
  /** 사용자 정의 scroll 컨테이너 (기본: window) */
  target?: HTMLElement | null
}

/**
 * 스크롤 방향에 따라 visible 상태를 반환.
 * - rAF throttle로 매 프레임 setState 폭주 방지
 * - delta threshold + topThreshold + idle restore 일관 처리
 *
 * 4개 컴포넌트에서 중복되던 로직을 단일 훅으로 통합.
 */
export function useScrollDirection({
  topThreshold = 30,
  deltaThreshold = 8,
  idleRestoreMs = 200,
  target,
}: UseScrollDirectionOptions = {}) {
  const [isVisible, setIsVisible] = useState(true)
  const lastScrollYRef = useRef(0)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafIdRef = useRef<number | null>(null)

  useEffect(() => {
    const el: Window | HTMLElement = target ?? window
    const getY = (): number =>
      el === window
        ? window.scrollY
        : (el as HTMLElement).scrollTop

    const tick = () => {
      rafIdRef.current = null
      const y = getY()
      if (y < topThreshold) {
        setIsVisible(true)
        lastScrollYRef.current = y
        return
      }
      const delta = y - lastScrollYRef.current
      if (Math.abs(delta) > deltaThreshold) {
        setIsVisible(delta <= 0)
        lastScrollYRef.current = y
      }
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(() => setIsVisible(true), idleRestoreMs)
    }

    const handleScroll = () => {
      if (rafIdRef.current != null) return
      rafIdRef.current = requestAnimationFrame(tick)
    }

    el.addEventListener("scroll", handleScroll, { passive: true })
    return () => {
      el.removeEventListener("scroll", handleScroll)
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current)
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, [target, topThreshold, deltaThreshold, idleRestoreMs])

  return isVisible
}
