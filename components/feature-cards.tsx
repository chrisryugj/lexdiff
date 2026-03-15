"use client"

import { useRef, useState, useEffect } from "react"
import { Icon } from "@/components/ui/icon"
import { Badge } from "@/components/ui/badge"
import type { IconName } from "@/lib/icons"

// ── 브랜딩 카드 (Core Competence) ──────────────────────────
// 기존 7개 → 3개로 통합:
// AI 자연어 검색 + AI 법률 분석 요약 → AI 법률 분석
// 신구법 대비표 + 3단 비교 아키텍처 + 위임법령 자동 추적 → 법령 비교·추적
// 실시간 법제처 연동 + 법령 영향 추적기 → 실시간 법제처 데이터
const brandingCards = [
  {
    title: "AI 법률 분석",
    description: "복잡한 법률 용어를 몰라도 일상 언어로 질문하면 관련 법령과 판례를 즉시 도출합니다. 최첨단 AI가 법조문·시행령·관련 판례의 핵심 쟁점을 분석하고, 실무에 즉시 활용할 수 있도록 일목요연하게 요약합니다.",
    icon: "brain" as IconName,
  },
  {
    title: "법령 비교·추적",
    description: "개정 전후의 법령 변화를 시각적으로 대조하는 신구법 대비표, 법률·시행령·시행규칙의 유기적 위임 관계를 파악하는 3단 비교, 하위법령 네트워크를 자동 스캐닝하는 위임법령 추적까지 단일 뷰에서 지원합니다.",
    icon: "git-compare" as IconName,
  },
  {
    title: "실시간 법제처 데이터",
    description: "법제처 API 다이렉트 연동으로 공포 즉시 최신 법령·조례·판례·해석례를 제공하여 법적 리스크를 차단합니다. 상위법 개정이 하위법령에 미치는 영향을 자동 탐지·분석하여 긴급/검토/참고로 분류합니다.",
    icon: "zap" as IconName,
  },
]

// ── 도구 카드 (Analysis Toolkit) ────────────────────────────
export type ToolCardId = 'impact-tracker' | 'delegation-gap' | 'time-machine' | 'ordinance-sync' | 'ordinance-benchmark'

const toolCards: Array<{
  id: ToolCardId
  title: string
  description: string
  icon: IconName
}> = [
  {
    id: 'impact-tracker',
    title: '변경 영향 분석',
    description: '법령·조례 개정이 하위법령에 미치는 영향을 자동 추적합니다.',
    icon: 'chart-line',
  },
  {
    id: 'delegation-gap',
    title: '위임 미비 탐지',
    description: '법률이 위임했으나 하위법령이 미제정된 조항을 찾습니다.',
    icon: 'file-search',
  },
  {
    id: 'time-machine',
    title: '법령 타임머신',
    description: '특정 시점의 법령 상태를 복원하고 현행법과 비교합니다.',
    icon: 'clock',
  },
  {
    id: 'ordinance-sync',
    title: '조례 미반영 탐지',
    description: '상위법 개정 후 조례가 미반영된 조항을 식별합니다.',
    icon: 'alert-triangle',
  },
  {
    id: 'ordinance-benchmark',
    title: '조례 벤치마킹',
    description: '동일 주제 조례를 전국 지자체별로 비교 분석합니다.',
    icon: 'bar-chart',
  },
]

// ── Props ───────────────────────────────────────────────────
interface FeatureCardsProps {
  revealed?: boolean
  onToolClick?: (toolId: ToolCardId) => void
}

export function FeatureCards({ revealed = false, onToolClick }: FeatureCardsProps) {
  const [itemsRevealed, setItemsRevealed] = useState<boolean[]>(new Array(brandingCards.length + toolCards.length + 1).fill(false))
  const itemRefs = useRef<(HTMLElement | null)[]>([])

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

  let refIdx = 0

  return (
    <div className="w-full space-y-0">
      {/* ━━ Core Competence ━━ */}
      <div>
        <div className={`mb-6 lg:mb-8 text-center transition-all duration-1000 ${revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
             style={{ transitionTimingFunction: 'cubic-bezier(0.25, 1, 0.5, 1)' }}>
          <h2 className="text-sm font-bold tracking-[0.2em] text-brand-gold uppercase mb-4">
            Core Competence
          </h2>
          <h3 className="text-3xl lg:text-5xl font-black text-brand-navy dark:text-foreground mb-6" style={{ fontFamily: "'RIDIBatang', serif" }}>
            법령에서 찾고,<br/>근거로 답합니다.
          </h3>
          <p className="text-lg text-gray-500 dark:text-gray-400 max-w-3xl mx-auto">
            <span className="hidden sm:inline whitespace-nowrap">위임법령 3단 비교 · 신구법 대조 · 판례 통합 검색 · 전국 조례까지, 지어낸 답은 없는 행정AI.</span>
            <span className="sm:hidden">위임법령 3단 비교 · 신구법 대조 · 판례 통합 검색 · 전국 조례까지,<br/>지어낸 답은 없는 행정AI.</span>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
          {brandingCards.map((card, index) => {
            const idx = refIdx++
            return (
              <div
                key={card.title}
                ref={el => { itemRefs.current[idx] = el }}
                className={`group relative bg-white dark:bg-[#1a222c] border border-gray-200 dark:border-gray-800 p-8 lg:p-10 transition-all duration-700 hover:shadow-2xl hover:-translate-y-1 ${itemsRevealed[idx] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
                style={{
                  transitionTimingFunction: 'cubic-bezier(0.25, 1, 0.5, 1)',
                  transitionDelay: `${index * 100}ms`
                }}
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-brand-gold scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />
                <div className="flex flex-col h-full">
                  <div className="mb-6 inline-flex items-center justify-center w-14 h-14 bg-gray-50 dark:bg-background border border-gray-100 dark:border-gray-800 text-brand-navy dark:text-brand-gold">
                    <Icon name={card.icon} size={24} />
                  </div>
                  <h4 className="text-xl font-bold text-brand-navy dark:text-foreground mb-4" style={{ fontFamily: "'RIDIBatang', serif" }}>
                    {card.title}
                  </h4>
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed text-sm lg:text-base break-keep">
                    {card.description}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ━━ 법령 분석 도구 ━━ */}
      <div>
        <div
          ref={el => { itemRefs.current[refIdx] = el }}
          className={`mt-6 lg:mt-8 mb-3 lg:mb-4 text-center transition-all duration-1000 ${itemsRevealed[refIdx] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
          style={{ transitionTimingFunction: 'cubic-bezier(0.25, 1, 0.5, 1)' }}
        >
          {(() => { refIdx++; return null })()}
          <h2 className="text-sm font-bold tracking-[0.2em] text-brand-navy dark:text-brand-gold uppercase mb-4">
            Analysis Toolkit
          </h2>
          <h3 className="text-lg lg:text-2xl font-black text-brand-navy dark:text-foreground mb-2" style={{ fontFamily: "'RIDIBatang', serif" }}>
            법령 분석 도구
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            도구를 선택하여 바로 분석을 시작하세요.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 lg:gap-6">
          {toolCards.map((tool, index) => {
            const idx = refIdx++
            return (
              <button
                key={tool.id}
                ref={el => { itemRefs.current[idx] = el }}
                onClick={() => onToolClick?.(tool.id)}
                className={`group relative text-left bg-white dark:bg-[#1a222c] border border-gray-200 dark:border-gray-800 p-6 transition-all duration-700 hover:shadow-2xl hover:-translate-y-1 cursor-pointer
                  ${itemsRevealed[idx] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
                style={{
                  transitionTimingFunction: 'cubic-bezier(0.25, 1, 0.5, 1)',
                  transitionDelay: `${index * 100}ms`
                }}
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-brand-gold scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className="inline-flex items-center justify-center w-10 h-10 bg-gray-50 dark:bg-background border border-gray-100 dark:border-gray-800 text-brand-navy dark:text-brand-gold">
                      <Icon name={tool.icon} size={20} />
                    </div>
                    <Badge className="bg-brand-gold/20 text-brand-navy dark:text-brand-gold border-brand-gold/30 text-[10px] px-1.5 py-0">
                      New
                    </Badge>
                  </div>
                  <h4 className="text-base font-bold text-brand-navy dark:text-foreground mb-2" style={{ fontFamily: "'RIDIBatang', serif" }}>
                    {tool.title}
                  </h4>
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed text-xs break-keep mb-3">
                    {tool.description}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-brand-navy/60 dark:text-brand-gold/60 group-hover:text-brand-navy dark:group-hover:text-brand-gold transition-colors mt-auto">
                    <span>시작하기</span>
                    <Icon name="arrow-right" size={14} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
