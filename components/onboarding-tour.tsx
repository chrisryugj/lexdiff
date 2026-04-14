"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"

export interface TourStep {
  /** 대상 요소 CSS selector. null이면 화면 중앙 안내(스포트라이트 없음) */
  selector: string | null
  title: string
  body: React.ReactNode
  /** 툴팁 배치 선호 방향. 화면 경계 넘으면 자동 flip */
  placement?: "top" | "bottom" | "left" | "right" | "auto"
  /** 스포트라이트 여백(px) */
  padding?: number
}

interface OnboardingTourProps {
  steps: TourStep[]
  storageKey: string
  /** 첫 방문 시 자동 시작 여부 */
  autoStart?: boolean
  /** 외부에서 강제로 시작할 때 사용. 0보다 큰 값으로 증가시킬 것 */
  runKey?: number
  onComplete?: () => void
}

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

const FALLBACK_RECT: Rect = { top: -9999, left: -9999, width: 0, height: 0 }

function rectsEqual(a: Rect, b: Rect) {
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
}

export function OnboardingTour({
  steps,
  storageKey,
  autoStart = true,
  runKey = 0,
  onComplete,
}: OnboardingTourProps) {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect>(FALLBACK_RECT)
  const [hasTarget, setHasTarget] = useState(false)
  const [tipSize, setTipSize] = useState<{ w: number; h: number }>({ w: 360, h: 200 })
  const tipRef = useRef<HTMLDivElement | null>(null)
  const finishedRef = useRef(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // 첫 방문 자동 시작
  useEffect(() => {
    if (!mounted || !autoStart) return
    try {
      if (localStorage.getItem(storageKey) === "done") return
    } catch {}
    // 홈 hero stagger 애니메이션(약 1s) 이후 시작 → 측정 rect 안정
    const t = setTimeout(() => {
      finishedRef.current = false
      setIndex(0)
      setOpen(true)
    }, 1200)
    return () => clearTimeout(t)
  }, [mounted, autoStart, storageKey])

  // 외부 강제 재시작 (runKey > 0일 때만)
  useEffect(() => {
    if (!mounted || runKey <= 0) return
    finishedRef.current = false
    setIndex(0)
    setOpen(true)
  }, [runKey, mounted])

  const current = steps[index]

  // selector만 메모로 잡아 deps 안정화
  const currentSelector = current?.selector ?? null
  const currentPadding = current?.padding ?? 8

  const measureTarget = useCallback(() => {
    if (!currentSelector) {
      setHasTarget((prev) => (prev ? false : prev))
      setRect((prev) => (rectsEqual(prev, FALLBACK_RECT) ? prev : FALLBACK_RECT))
      return
    }
    const el = document.querySelector(currentSelector) as HTMLElement | null
    if (!el) {
      setHasTarget((prev) => (prev ? false : prev))
      setRect((prev) => (rectsEqual(prev, FALLBACK_RECT) ? prev : FALLBACK_RECT))
      return
    }
    const r = el.getBoundingClientRect()
    const next: Rect = { top: r.top, left: r.left, width: r.width, height: r.height }
    setHasTarget((prev) => (prev ? prev : true))
    setRect((prev) => (rectsEqual(prev, next) ? prev : next))
  }, [currentSelector])

  // 단계 전환 시 타겟 스크롤 + 재측정 (deps는 open/index/selector만)
  useLayoutEffect(() => {
    if (!open) return
    if (currentSelector) {
      const el = document.querySelector(currentSelector) as HTMLElement | null
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" })
      }
    }
    // 여러 타이밍에 재측정 (scrollIntoView smooth + framer-motion 애니메이션 대응)
    measureTarget()
    const timers = [80, 250, 500, 800].map((d) => setTimeout(measureTarget, d))
    return () => timers.forEach(clearTimeout)
  }, [open, index, currentSelector, measureTarget])

  // resize/scroll 재측정
  useEffect(() => {
    if (!open) return
    let raf = 0
    const onUpdate = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measureTarget)
    }
    window.addEventListener("resize", onUpdate)
    window.addEventListener("scroll", onUpdate, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", onUpdate)
      window.removeEventListener("scroll", onUpdate, true)
    }
  }, [open, measureTarget])

  const finish = useCallback(
    (completed: boolean) => {
      if (finishedRef.current) return
      finishedRef.current = true
      setOpen(false)
      setIndex(0)
      try {
        localStorage.setItem(storageKey, "done")
      } catch {}
      if (completed) onComplete?.()
    },
    [storageKey, onComplete]
  )

  const goNext = useCallback(() => {
    setIndex((i) => {
      if (i < steps.length - 1) return i + 1
      finish(true)
      return i
    })
  }, [steps.length, finish])

  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : i))
  }, [])

  // ESC/←/→
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        finish(false)
      } else if (e.key === "ArrowRight") {
        goNext()
      } else if (e.key === "ArrowLeft") {
        goPrev()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, finish, goNext, goPrev])

  // 툴팁 크기 측정 (한 번만, ResizeObserver)
  useEffect(() => {
    if (!open || !tipRef.current) return
    const el = tipRef.current
    const update = () => {
      const r = el.getBoundingClientRect()
      setTipSize((prev) =>
        Math.abs(prev.w - r.width) > 1 || Math.abs(prev.h - r.height) > 1
          ? { w: r.width, h: r.height }
          : prev
      )
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open, index])

  // 스포트라이트 패딩 포함 rect
  const spot = useMemo(() => {
    if (!hasTarget) return FALLBACK_RECT
    return {
      top: Math.max(0, rect.top - currentPadding),
      left: Math.max(0, rect.left - currentPadding),
      width: rect.width + currentPadding * 2,
      height: rect.height + currentPadding * 2,
    }
  }, [hasTarget, rect, currentPadding])

  // 툴팁 위치 계산
  const tooltipPos = useMemo(() => {
    if (typeof window === "undefined") return { top: 0, left: 0 }
    const vw = window.innerWidth
    const vh = window.innerHeight
    const margin = 16
    const tipW = tipSize.w
    const tipH = tipSize.h

    if (!hasTarget) {
      return {
        top: Math.max(margin, (vh - tipH) / 2),
        left: Math.max(margin, (vw - tipW) / 2),
      }
    }

    const placement = current?.placement ?? "auto"
    const below = spot.top + spot.height + margin + tipH <= vh - margin
    const above = spot.top - margin - tipH >= margin

    let vertical: "top" | "bottom" = "bottom"
    if (placement === "top" && above) vertical = "top"
    else if (placement === "bottom" && below) vertical = "bottom"
    else if (placement === "auto") vertical = below ? "bottom" : above ? "top" : "bottom"
    else vertical = below ? "bottom" : "top"

    const top =
      vertical === "bottom"
        ? spot.top + spot.height + margin
        : Math.max(margin, spot.top - margin - tipH)

    const centered = spot.left + spot.width / 2 - tipW / 2
    const left = Math.min(Math.max(margin, centered), vw - tipW - margin)

    return { top, left }
  }, [hasTarget, spot, current, tipSize])

  if (!mounted || !open || !current) return null

  const overlayBase =
    "fixed bg-slate-950/60 backdrop-blur-[2px] transition-[top,left,width,height,right,bottom] duration-250 ease-[cubic-bezier(0.25,1,0.5,1)]"

  const overlays = hasTarget ? (
    <>
      <div className={overlayBase} style={{ top: 0, left: 0, right: 0, height: spot.top }} />
      <div
        className={overlayBase}
        style={{ top: spot.top + spot.height, left: 0, right: 0, bottom: 0 }}
      />
      <div
        className={overlayBase}
        style={{ top: spot.top, left: 0, width: spot.left, height: spot.height }}
      />
      <div
        className={overlayBase}
        style={{
          top: spot.top,
          left: spot.left + spot.width,
          right: 0,
          height: spot.height,
        }}
      />
      {/* 스포트라이트 글로우 + 링 (클릭 통과) */}
      <div
        className="fixed pointer-events-none rounded-lg transition-[top,left,width,height] duration-250 ease-[cubic-bezier(0.25,1,0.5,1)]"
        style={{
          top: spot.top,
          left: spot.left,
          width: spot.width,
          height: spot.height,
          boxShadow:
            "0 0 0 1.5px rgba(212,175,55,0.9), 0 0 0 6px rgba(255,255,255,0.08), 0 0 40px 8px rgba(212,175,55,0.25)",
        }}
      />
    </>
  ) : (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-[2px]" />
  )

  const isLast = index === steps.length - 1
  const isFirst = index === 0
  const total = steps.length

  return createPortal(
    <div
      className="fixed inset-0 z-[100]"
      aria-live="polite"
      role="dialog"
      aria-modal="true"
      aria-label="사용 가이드 투어"
    >
      {overlays}

      {/* 툴팁 카드 */}
      <div
        ref={tipRef}
        className={cn(
          "fixed z-[101] w-[calc(100vw-32px)] sm:w-[380px] max-w-[380px]",
          "bg-white dark:bg-[#141a24] rounded-xl overflow-hidden",
          "border border-slate-200/80 dark:border-white/10",
          "shadow-[0_20px_60px_-15px_rgba(15,23,42,0.4),0_8px_20px_-8px_rgba(15,23,42,0.2)]",
          "animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-300"
        )}
        style={{ top: tooltipPos.top, left: tooltipPos.left }}
      >
        {/* 상단 골드 악센트 라인 */}
        <div className="h-[2px] bg-gradient-to-r from-transparent via-brand-gold to-transparent" />

        {/* 헤더 */}
        <div className="px-5 pt-4 pb-1 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-brand-gold/90">
                Step {index + 1} / {total}
              </span>
            </div>
            <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-50 leading-tight tracking-tight break-keep">
              {current.title}
            </h3>
          </div>
          <button
            onClick={() => finish(false)}
            className="p-1.5 -m-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 rounded-md transition-colors shrink-0"
            aria-label="투어 닫기"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* 본문 */}
        <div className="px-5 pb-4 pt-2 text-[13.5px] text-slate-600 dark:text-slate-300 leading-relaxed break-keep">
          {current.body}
        </div>

        {/* 진행 바 */}
        <div className="px-5">
          <div className="h-[3px] bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-navy to-brand-gold transition-[width] duration-400 ease-out"
              style={{ width: `${((index + 1) / total) * 100}%` }}
            />
          </div>
        </div>

        {/* 액션 */}
        <div className="px-5 py-3.5 mt-2 flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/5">
          <button
            onClick={() => finish(false)}
            className="text-[12px] font-medium text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors px-1"
          >
            건너뛰기
          </button>

          <div className="flex items-center gap-1.5">
            {!isFirst && (
              <button
                onClick={goPrev}
                className="h-8 px-3.5 text-[12px] font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-md transition-colors"
              >
                이전
              </button>
            )}
            <button
              onClick={goNext}
              className={cn(
                "h-8 px-4 text-[12px] font-semibold rounded-md transition-all",
                "bg-brand-navy hover:bg-brand-navy/90 text-white dark:text-background",
                "shadow-sm hover:shadow-md flex items-center gap-1.5"
              )}
            >
              {isLast ? (
                <>
                  시작하기
                  <Icon name="check" size={13} />
                </>
              ) : (
                <>
                  다음
                  <Icon name="arrow-right" size={13} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

/** 투어 완료 상태 초기화 */
export function resetOnboardingTour(storageKey: string) {
  try {
    localStorage.removeItem(storageKey)
  } catch {}
}
