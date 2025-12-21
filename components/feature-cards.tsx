"use client"

import { useRef, useState, useEffect } from "react"
import { Icon } from "@/components/ui/icon"
import { AuroraText } from "@/components/ui/aurora-text"
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text"
import { MagicCard } from "@/components/ui/magic-card"
import { LightRays } from "@/components/ui/light-rays"
import { cn } from "@/lib/utils"

// 행별로 그룹화된 features
const rows = [
  // Row 1: AI 자연어 검색 + AI 법률 분석
  [
    {
      title: "AI 자연어 검색",
      description: "일상 언어로 질문하면 AI가 관련 법령을 찾아 실시간으로 답변합니다.",
      icon: "search",
      colSpan: "col-span-1 md:col-span-2",
      iconColor: "text-blue-400",
    },
    {
      title: "AI 법률 분석",
      description: "법률 문맥을 이해하는 고성능 AI가 핵심 내용을 요약합니다.",
      icon: "brain",
      colSpan: "col-span-1",
      iconColor: "text-purple-400",
    },
  ],
  // Row 2: 신구법 비교 + 3단 비교 시스템
  [
    {
      title: "신구법 비교",
      description: "개정 전후의 법령 변화를 시각적으로 비교하고 분석합니다.",
      icon: "git-compare",
      colSpan: "col-span-1",
      iconColor: "text-emerald-400",
    },
    {
      title: "3단 비교 시스템",
      description: "법률-시행령-시행규칙을 한눈에 비교하고 위임관계를 파악합니다.",
      icon: "scale",
      colSpan: "col-span-1 md:col-span-2",
      iconColor: "text-amber-400",
    },
  ],
  // Row 3: 실시간 업데이트 + 행정규칙 검색
  [
    {
      title: "실시간 업데이트",
      description: "법제처 API와 실시간 연동하여 항상 최신 법령 정보를 제공합니다.",
      icon: "zap",
      colSpan: "col-span-1",
      iconColor: "text-orange-400",
    },
    {
      title: "위임법령 검색",
      description: "법률과 연관된 시행령, 시행규칙, 행정규칙(고시, 훈령, 예규)을 자동으로 찾아드립니다.",
      icon: "shield-check",
      colSpan: "col-span-1 md:col-span-2",
      iconColor: "text-cyan-400",
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

  // 각 행에 대해 Intersection Observer 설정 - 뷰포트 중앙 근처에서만 트리거
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
        { threshold: 0.5, rootMargin: "-100px 0px -100px 0px" }
      )
      if (ref.current) observer.observe(ref.current)
      return observer
    })

    return () => observers.forEach(o => o.disconnect())
  }, [])

  return (
    <div className="w-full" style={{ fontFamily: "Pretendard, sans-serif" }}>
      {/* Section Header */}
      <div className={`mb-12 transition-all duration-700 ${revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
           style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}>
        <h3 className="text-3xl md:text-5xl font-bold text-foreground mb-4 leading-tight">
          압도적인 <br className="md:hidden" />
          <AuroraText
            colors={["#c084fc", "#60a5fa", "#a78bfa", "#38bdf8"]}
            speed={0.8}
          >
            법률 인텔리전스
          </AuroraText>
        </h3>
        <p className="text-lg max-w-xl">
          <AnimatedShinyText className="text-muted-foreground/70">
            LexDiff가 제공하는 강력한 법령 검색 도구
          </AnimatedShinyText>
        </p>
      </div>

      {/* Bento Grid - Row by row scroll reveal */}
      <div className="space-y-4 md:space-y-5">
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            ref={rowRefs[rowIndex]}
            className={`grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 transition-all duration-700 ${rowRevealed[rowIndex] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
            style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            {row.map((feature, cardIndex) => {
              return (
                <MagicCard
                  key={cardIndex}
                  className={cn(
                    feature.colSpan,
                    "cursor-pointer rounded-xl overflow-hidden"
                  )}
                  gradientSize={200}
                  gradientColor="#262626"
                  gradientOpacity={0.8}
                  gradientFrom="#9E7AFF"
                  gradientTo="#FE8BBB"
                >
                  <div className="group relative flex flex-col justify-between p-5 h-full">
                    {/* Light Rays - 호버 시에만 표시 */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                      <LightRays
                        count={5}
                        color="rgba(158, 122, 255, 0.15)"
                        blur={24}
                        speed={10}
                        length="100%"
                      />
                    </div>

                    {/* Background Icon */}
                    <div className="absolute top-0 right-0 p-4 opacity-[0.05] transition-opacity duration-500 group-hover:opacity-[0.1]">
                      <Icon
                        name={feature.icon}
                        className="h-16 w-16 md:h-20 md:w-20 text-foreground"
                      />
                    </div>

                    {/* Content */}
                    <div className="relative z-10">
                      <div className="pointer-events-none flex transform-gpu flex-col gap-3 transition-all duration-300">
                        <Icon
                          name={feature.icon}
                          className={cn(
                            "h-12 w-12 origin-left transform-gpu transition-all duration-300 ease-in-out",
                            feature.iconColor
                          )}
                        />
                        <h4 className="text-lg font-bold text-foreground">
                          {feature.title}
                        </h4>
                        <p className="text-sm text-muted-foreground/70 leading-relaxed break-keep">
                          {feature.description}
                        </p>
                      </div>
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
