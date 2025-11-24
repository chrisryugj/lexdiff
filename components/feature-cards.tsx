"use client"

import { Sparkles, GitCompare, Star, Scale, Zap, Shield } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { useEffect, useRef } from "react"

const features = [
  {
    icon: Sparkles,
    title: "AI 자연어 검색",
    description: "일상 언어로 질문하면 AI가 관련 법령을 찾아 실시간으로 답변합니다",
    color: "text-blue-600",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
  },
  {
    icon: GitCompare,
    title: "법령 비교 분석",
    description: "구법과 신법을 나란히 비교하고 AI가 변경 내용을 요약해드립니다",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
  },
  {
    icon: Star,
    title: "스마트 즐겨찾기",
    description: "자주 찾는 법령을 저장하고 빠르게 접근할 수 있습니다",
    color: "text-amber-600",
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
  },
  {
    icon: Scale,
    title: "3단 비교 시스템",
    description: "법률-시행령-시행규칙을 한눈에 비교하고 위임관계를 파악합니다",
    color: "text-purple-600",
    bgColor: "bg-purple-50 dark:bg-purple-950/30",
  },
  {
    icon: Zap,
    title: "실시간 업데이트",
    description: "법제처 API와 연동하여 항상 최신 법령 정보를 제공합니다",
    color: "text-orange-600",
    bgColor: "bg-orange-50 dark:bg-orange-950/30",
  },
  {
    icon: Shield,
    title: "행정규칙 검색",
    description: "법령과 연관된 훈령, 예규, 고시 등을 자동으로 찾아드립니다",
    color: "text-cyan-600",
    bgColor: "bg-cyan-50 dark:bg-cyan-950/30",
  },
]

export function FeatureCards() {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    // Intersection Observer for scroll-based fade-in (Apple style)
    const isMobile = window.innerWidth < 768
    const observerOptions = {
      root: null,
      rootMargin: isMobile ? '-50px 0px' : '-100px 0px',
      threshold: 0.2
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
        }
      })
    }, observerOptions)

    cardRefs.current.forEach((card) => {
      if (card) observer.observe(card)
    })

    return () => observer.disconnect()
  }, [])

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="text-center mb-8">
        <h3 className="text-7xl font-bold text-foreground mb-2" style={{ fontFamily: "Pretendard, sans-serif" }}>주요 기능</h3>
        <p className="text-muted-foreground mb-20" style={{ fontFamily: "Pretendard, sans-serif" }}>LexDiff가 제공하는 강력한 법령 검색 도구</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature, index) => {
          const Icon = feature.icon
          return (
            <Card
              key={index}
              ref={(el) => { cardRefs.current[index] = el }}
              className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border-border/50 feature-card"
            >
              <CardContent className="p-4 md:p-6">
                <div className={`${feature.bgColor} w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className={`h-6 w-6 ${feature.color}`} />
                </div>
                <h4 className="text-lg font-semibold text-foreground mb-2" style={{ fontFamily: "Pretendard, sans-serif" }}>{feature.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed" style={{ fontFamily: "Pretendard, sans-serif" }}>{feature.description}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <style jsx>{`
        /* Feature Cards - Apple-style scroll fade-in */
        :global(.feature-card) {
          opacity: 0;
          transform: translateY(30px);
          transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 1.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        :global(.feature-card.is-visible) {
          opacity: 1;
          transform: translateY(0);
        }
      `}</style>
    </div>
  )
}
