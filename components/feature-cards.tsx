"use client"

import { useRef, useState, useEffect } from "react"
import { Icon } from "@/components/ui/icon"

const features = [
  {
    title: "AI 자연어 검색",
    description: "복잡한 법률 용어를 몰라도, 일상적인 언어로 소송, 분쟁, 규제 등의 법률 문제를 질문하면 관련 법령과 판례를 즉시 도출합니다.",
    icon: "search" as const,
  },
  {
    title: "AI 법률 분석 요약",
    description: "최첨단 AI가 법조문, 시행령, 관련 판례의 핵심 쟁점을 분석하고, 실무에 즉시 활용할 수 있도록 일목요연하게 요약 제공합니다.",
    icon: "brain" as const,
  },
  {
    title: "신구법 대비표",
    description: "입법 과정 및 개정 전후의 법령 변화를 한 치의 오차 없이 시각적으로 대조하여 실무자의 검토 시간을 단축시킵니다.",
    icon: "git-compare" as const,
  },
  {
    title: "3단 비교 아키텍처",
    description: "법률, 시행령, 시행규칙의 유기적인 위임 관계를 단일 뷰에서 파악할 수 있는 강력한 3단 비교 인터페이스를 지원합니다.",
    icon: "scale" as const,
  },
  {
    title: "실시간 법제처 연동",
    description: "법제처 API와 다이렉트로 연동하여 공포 즉시 최신 법령 정보를 제공, 실무에서의 법적 리스크를 완벽하게 차단합니다.",
    icon: "zap" as const,
  },
  {
    title: "위임법령 자동 추적",
    description: "특정 법률 조항과 연관된 하위 법령(시행령, 규칙, 고시 등)의 네트워크를 자동으로 스캐닝하여 누락 없는 검토를 보장합니다.",
    icon: "shield-check" as const,
  },
  {
    title: "법령 영향 추적기",
    description: "상위법 개정이 하위법령에 미치는 영향을 자동으로 탐지·분석하여, 긴급/검토/참고 등급으로 분류합니다.",
    icon: "shield-alert" as const,
  },
]

interface FeatureCardsProps {
  revealed?: boolean
}

export function FeatureCards({ revealed = false }: FeatureCardsProps) {
  const [itemsRevealed, setItemsRevealed] = useState<boolean[]>(new Array(features.length).fill(false))
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const observers = itemRefs.current.map((ref, index) => {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setItemsRevealed(prev => {
              const next = [...prev]
              next[index] = true
              return next
            })
            observer.disconnect()
          }
        },
        { threshold: 0.2, rootMargin: "0px" }
      )
      if (ref) observer.observe(ref)
      return observer
    })

    return () => observers.forEach(o => o.disconnect())
  }, [])

  return (
    <div className="w-full">
      {/* Header */}
      <div className={`mb-16 lg:mb-24 text-center transition-all duration-1000 ${revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
           style={{ transitionTimingFunction: 'cubic-bezier(0.25, 1, 0.5, 1)' }}>
        <h2 className="text-sm font-bold tracking-[0.2em] text-[#d4af37] dark:text-[#e2a85d] uppercase mb-4">
          Core Competence
        </h2>
        <h3 className="text-3xl lg:text-5xl font-black text-[#1a2b4c] dark:text-white mb-6" style={{ fontFamily: "'RIDIBatang', serif" }}>
          법령에서 찾고,<br/>근거로 답합니다.
        </h3>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto break-keep">
          위임법령 3단 비교 · 신구법 대조 · 판례 통합 검색 · 전국 조례까지, 지어낸 답은 없는 행정AI.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 lg:gap-12">
        {features.map((feature, index) => (
          <div
            key={index}
            ref={el => {
              itemRefs.current[index] = el
            }}
            className={`group relative bg-white dark:bg-[#1a222c] border border-gray-200 dark:border-gray-800 p-8 lg:p-10 transition-all duration-700 hover:shadow-2xl hover:-translate-y-1 ${itemsRevealed[index] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
            style={{
              transitionTimingFunction: 'cubic-bezier(0.25, 1, 0.5, 1)',
              transitionDelay: `${index * 100}ms`
            }}
          >
            {/* Top Accent Line on Hover */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-[#d4af37] dark:bg-[#e2a85d] scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />

            <div className="flex flex-col h-full">
              <div className="mb-6 inline-flex items-center justify-center w-14 h-14 bg-gray-50 dark:bg-[#0c0e14] border border-gray-100 dark:border-gray-800 text-[#1a2b4c] dark:text-[#e2a85d]">
                <Icon name={feature.icon} size={24} />
              </div>

              <h4 className="text-xl font-bold text-[#1a2b4c] dark:text-white mb-4" style={{ fontFamily: "'RIDIBatang', serif" }}>
                {feature.title}
              </h4>

              <p className="text-gray-600 dark:text-gray-400 leading-relaxed text-sm lg:text-base break-keep">
                {feature.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
