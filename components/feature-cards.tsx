"use client"

import { useRef, useState, useEffect } from "react"
import { Icon } from "@/components/ui/icon"
import { MagicCard } from "@/components/ui/magic-card"
import { cn } from "@/lib/utils"

// 행별로 그룹화된 features
const rows = [
  // Row 1: AI 자연어 검색 + AI 법률 분석
  [
    {
      title: "AI 자연어 검색",
      description: "일상 언어로 질문하면 AI가 관련 법령을 찾아 실시간으로 답변합니다.",
      icon: "search" as const,
      iconColor: "text-blue-500 dark:text-blue-400",
      iconBg: "bg-blue-500/10",
      colSpan: "col-span-1 md:col-span-2",
    },
    {
      title: "AI 법률 분석",
      description: "법률 문맥을 이해하는 고성능 AI가 핵심 내용을 요약합니다.",
      icon: "brain" as const,
      iconColor: "text-violet-500 dark:text-violet-400",
      iconBg: "bg-violet-500/10",
      colSpan: "col-span-1",
    },
  ],
  // Row 2: 신구법 비교 + 3단 비교 시스템
  [
    {
      title: "신구법 비교",
      description: "개정 전후의 법령 변화를 시각적으로 비교하고 분석합니다.",
      icon: "git-compare" as const,
      iconColor: "text-emerald-500 dark:text-emerald-400",
      iconBg: "bg-emerald-500/10",
      colSpan: "col-span-1",
    },
    {
      title: "3단 비교 시스템",
      description: "법률-시행령-시행규칙을 한눈에 비교하고 위임관계를 파악합니다.",
      icon: "scale" as const,
      iconColor: "text-amber-500 dark:text-amber-400",
      iconBg: "bg-amber-500/10",
      colSpan: "col-span-1 md:col-span-2",
    },
  ],
  // Row 3: 실시간 업데이트 + 위임법령 검색
  [
    {
      title: "실시간 업데이트",
      description: "법제처 API와 실시간 연동하여 항상 최신 법령 정보를 제공합니다.",
      icon: "zap" as const,
      iconColor: "text-yellow-500 dark:text-yellow-400",
      iconBg: "bg-yellow-500/10",
      colSpan: "col-span-1",
    },
    {
      title: "위임법령 검색",
      description: "법률과 연관된 시행령, 시행규칙, 행정규칙(고시, 훈령, 예규)을 자동으로 찾아드립니다.",
      icon: "shield-check" as const,
      iconColor: "text-sky-500 dark:text-sky-400",
      iconBg: "bg-sky-500/10",
      colSpan: "col-span-1 md:col-span-2",
    },
  ],
]

interface FeatureCardsProps {
  revealed?: boolean
}

export function FeatureCards({ revealed = false }: FeatureCardsProps) {
  // 각 행별 reveal 상태
  const [rowRevealed, setRowRevealed] = useState([false, false, false])
  const rowRefs = [
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
  ]

  // 각 행에 대해 Intersection Observer 설정
  useEffect(() => {
    const observers = rowRefs.map((ref, index) => {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setRowRevealed(prev => {
              const next = [...prev]
              next[index] = true
              return next
            })
            observer.disconnect()
          }
        },
        { threshold: 0.3, rootMargin: "-50px 0px -50px 0px" }
      )
      if (ref.current) observer.observe(ref.current)
      return observer
    })

    return () => observers.forEach(o => o.disconnect())
  }, [])

  return (
    <div className="w-full">
      {/* Section Header */}
      <div className={`mb-10 md:mb-12 transition-all duration-700 ${revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
           style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}>
        <h3 className="text-2xl md:text-4xl font-bold text-foreground mb-3 leading-tight">
          강력한 법률 인텔리전스
        </h3>
        <p className="text-base max-w-xl text-muted-foreground">
          LexDiff가 제공하는 법령 검색 도구
        </p>
      </div>

      {/* Bento Grid - Row by row scroll reveal */}
      <div className="space-y-4 md:space-y-5">
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            ref={rowRefs[rowIndex]}
            className={`grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 transition-all duration-600 ${rowRevealed[rowIndex] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            {row.map((feature, cardIndex) => {
              return (
                <MagicCard
                  key={cardIndex}
                  className={cn(
                    feature.colSpan,
                    "rounded-xl overflow-hidden"
                  )}
                  gradientSize={200}
                  gradientColor="oklch(from var(--primary) l c h / 0.15)"
                  gradientOpacity={0.2}
                  gradientFrom="oklch(from var(--primary) l c h)"
                  gradientTo="oklch(from var(--accent) l c h)"
                >
                  <div className="relative flex flex-col justify-between p-5 md:p-6 h-full">
                    {/* Content */}
                    <div className="flex flex-col gap-3">
                      <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", feature.iconBg)}>
                        <Icon
                          name={feature.icon}
                          className={cn("h-5 w-5", feature.iconColor)}
                        />
                      </div>
                      <h4 className="text-base font-semibold text-foreground">
                        {feature.title}
                      </h4>
                      <p className="text-sm text-muted-foreground leading-relaxed break-keep">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </MagicCard>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
