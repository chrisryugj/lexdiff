"use client"

import { Search, GitCompare, Brain, Shield, Zap, BookOpen } from "lucide-react"
import { useEffect, useRef, useState } from "react"

const features = [
  {
    icon: Search,
    title: "스마트 검색",
    description: "법령명, 조문번호, 자연어 질문까지. 원하는 방식으로 검색하세요.",
    color: "from-amber-400 to-orange-500",
    delay: 0,
  },
  {
    icon: Brain,
    title: "AI 분석",
    description: "Gemini AI가 법령의 핵심을 분석하고 이해하기 쉽게 요약합니다.",
    color: "from-lime-400 to-green-500",
    delay: 100,
  },
  {
    icon: GitCompare,
    title: "신구법 비교",
    description: "개정 전후의 변화를 한눈에. 무엇이 바뀌었는지 즉시 파악하세요.",
    color: "from-orange-400 to-red-500",
    delay: 200,
  },
  {
    icon: Shield,
    title: "공신력 있는 데이터",
    description: "국가법령정보센터 API와 실시간 연동. 항상 최신 법령을 제공합니다.",
    color: "from-cyan-400 to-blue-500",
    delay: 300,
  },
  {
    icon: Zap,
    title: "빠른 응답",
    description: "최적화된 캐싱과 인프라로 법령 검색 결과를 순식간에 제공합니다.",
    color: "from-yellow-400 to-amber-500",
    delay: 400,
  },
  {
    icon: BookOpen,
    title: "연관 법령 탐색",
    description: "시행령, 시행규칙, 행정규칙까지 관련 법령을 자동으로 찾아드립니다.",
    color: "from-pink-400 to-rose-500",
    delay: 500,
  },
]

export function OrganicFeatures() {
  const [visibleCards, setVisibleCards] = useState<Set<number>>(new Set())
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = cardRefs.current.indexOf(entry.target as HTMLDivElement)
          if (entry.isIntersecting && index !== -1) {
            setVisibleCards((prev) => new Set([...prev, index]))
          }
        })
      },
      { threshold: 0.2, rootMargin: '-50px' }
    )

    cardRefs.current.forEach((card) => {
      if (card) observer.observe(card)
    })

    return () => observer.disconnect()
  }, [])

  return (
    <section
      id="features"
      className="py-32 px-6 bg-gradient-to-b from-[#faf9f7] to-white"
      style={{ fontFamily: "Pretendard, sans-serif" }}
    >
      <div className="container mx-auto max-w-6xl">
        {/* Section Header */}
        <div className="text-center mb-20">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#1a1a1a] mb-6">
            왜{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)',
              }}
            >
              LexDiff
            </span>
            인가요?
          </h2>
          <p className="text-lg md:text-xl text-[#1a1a1a]/60 max-w-2xl mx-auto">
            법률 전문가부터 일반 시민까지,
            <br className="hidden md:block" />
            모두를 위한 법령 검색 경험을 제공합니다.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon
            const isVisible = visibleCards.has(index)

            return (
              <div
                key={index}
                ref={(el) => { cardRefs.current[index] = el }}
                className={`group relative p-8 rounded-3xl bg-white border border-[#1a1a1a]/5 shadow-sm hover:shadow-xl transition-all duration-700 ease-out cursor-default ${
                  isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                }`}
                style={{ transitionDelay: `${feature.delay}ms` }}
              >
                {/* Hover gradient overlay */}
                <div
                  className={`absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-5 transition-opacity duration-500 bg-gradient-to-br ${feature.color}`}
                />

                {/* Icon */}
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-gradient-to-br ${feature.color} shadow-lg group-hover:scale-110 transition-transform duration-500`}
                >
                  <Icon className="w-7 h-7 text-white" />
                </div>

                {/* Content */}
                <h3 className="text-xl font-bold text-[#1a1a1a] mb-3 group-hover:translate-x-1 transition-transform duration-300">
                  {feature.title}
                </h3>
                <p className="text-[#1a1a1a]/60 leading-relaxed break-keep">
                  {feature.description}
                </p>

                {/* Corner decoration */}
                <div
                  className={`absolute top-4 right-4 w-20 h-20 rounded-full opacity-0 group-hover:opacity-10 transition-opacity duration-500 blur-2xl bg-gradient-to-br ${feature.color}`}
                />
              </div>
            )
          })}
        </div>

        {/* Bottom CTA */}
        <div className="mt-24 text-center">
          <div className="inline-flex flex-col items-center gap-4 p-8 rounded-3xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100">
            <p className="text-lg md:text-xl font-medium text-[#1a1a1a]">
              지금 바로 시작해보세요
            </p>
            <p className="text-[#1a1a1a]/60 max-w-md">
              별도의 가입 없이 누구나 무료로 이용할 수 있습니다.
              <br />
              검색창에 궁금한 법령을 입력해보세요.
            </p>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="mt-2 px-6 py-3 rounded-full font-medium text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
              style={{
                backgroundImage: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)',
              }}
            >
              검색하러 가기
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
