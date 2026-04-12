"use client"

import React, { useCallback, useEffect } from "react"
import { motion, useMotionTemplate, useMotionValue } from "motion/react"

import { cn } from "@/lib/utils"

// PERF-8: 단일 전역 리스너 + 구독 패턴 — 카드 수만큼 곱셈 방지
// 이전: 각 카드가 pointerout/blur/visibilitychange 3개 글로벌 리스너 등록
const resetSubscribers = new Set<() => void>()
let listenersRegistered = false

function ensureGlobalListeners() {
  if (listenersRegistered || typeof window === "undefined") return
  listenersRegistered = true
  const fanout = () => resetSubscribers.forEach((fn) => fn())
  const handleGlobalPointerOut = (e: PointerEvent) => {
    if (!e.relatedTarget) fanout()
  }
  const handleVisibility = () => {
    if (document.visibilityState !== "visible") fanout()
  }
  window.addEventListener("pointerout", handleGlobalPointerOut)
  window.addEventListener("blur", fanout)
  document.addEventListener("visibilitychange", handleVisibility)
}

interface MagicCardProps {
  children?: React.ReactNode
  className?: string
  gradientSize?: number
  gradientColor?: string
  gradientOpacity?: number
  gradientFrom?: string
  gradientTo?: string
}

export function MagicCard({
  children,
  className,
  gradientSize = 200,
  gradientColor = "#262626",
  gradientOpacity = 0.8,
  gradientFrom = "#9E7AFF",
  gradientTo = "#FE8BBB",
}: MagicCardProps) {
  const mouseX = useMotionValue(-gradientSize)
  const mouseY = useMotionValue(-gradientSize)
  const reset = useCallback(() => {
    mouseX.set(-gradientSize)
    mouseY.set(-gradientSize)
  }, [gradientSize, mouseX, mouseY])

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      mouseX.set(e.clientX - rect.left)
      mouseY.set(e.clientY - rect.top)
    },
    [mouseX, mouseY]
  )

  useEffect(() => {
    reset()
  }, [reset])

  useEffect(() => {
    // PERF-8: 단일 전역 리스너 + 구독 등록
    ensureGlobalListeners()
    resetSubscribers.add(reset)
    return () => {
      resetSubscribers.delete(reset)
    }
  }, [reset])

  return (
    <div
      className={cn("group relative rounded-[inherit]", className)}
      onPointerMove={handlePointerMove}
      onPointerLeave={reset}
      onPointerEnter={reset}
    >
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`
          radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px,
          ${gradientFrom},
          ${gradientTo},
          var(--border) 100%
          )
          `,
        }}
      />
      <div className="bg-background absolute inset-px rounded-[inherit]" />
      <motion.div
        className="pointer-events-none absolute inset-px rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px, ${gradientColor}, transparent 100%)
          `,
          opacity: gradientOpacity,
        }}
      />
      <div className="relative">{children}</div>
    </div>
  )
}
