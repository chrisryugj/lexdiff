"use client"

import { useState, useEffect, useRef } from "react"

interface AnimatedNumberProps {
  value: number
  duration?: number
  delay?: number
}

/** 0에서 target까지 카운트업 애니메이션 (뷰포트 진입 시 시작) */
export function AnimatedNumber({ value, duration = 600, delay = 0 }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(0)
  const [started, setStarted] = useState(false)
  const spanRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = spanRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setStarted(true); observer.disconnect() } },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!started || value <= 0) return
    const timer = setTimeout(() => {
      let start: number | null = null
      let raf: number
      const step = (ts: number) => {
        if (!start) start = ts
        const progress = Math.min((ts - start) / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        setDisplay(Math.round(eased * value))
        if (progress < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
      return () => cancelAnimationFrame(raf)
    }, delay)
    return () => clearTimeout(timer)
  }, [started, value, duration, delay])

  return <span ref={spanRef}>{display.toLocaleString()}</span>
}
