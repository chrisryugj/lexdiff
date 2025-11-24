"use client"

import { FileText, Search, Zap, Award } from "lucide-react"
import { useEffect, useRef } from "react"

const stats = [
  {
    icon: FileText,
    value: "30,000+",
    label: "법령 데이터베이스",
    color: "text-blue-600",
  },
  {
    icon: Search,
    value: "AI 검색",
    label: "Gemini 2.5 Flash",
    color: "text-emerald-600",
  },
  {
    icon: Zap,
    value: "실시간",
    label: "법제처 API 연동",
    color: "text-amber-600",
  },
  {
    icon: Award,
    value: "무료",
    label: "개인/상업적 이용",
    color: "text-purple-600",
  },
]

export function StatsSection() {
  const statRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    // Intersection Observer for scroll-based fade-in (Apple style)
    const isMobile = window.innerWidth < 768
    const observerOptions = {
      root: null,
      rootMargin: isMobile ? '-50px 0px' : '-100px 0px',
      threshold: 0.3
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
        }
      })
    }, observerOptions)

    statRefs.current.forEach((stat) => {
      if (stat) observer.observe(stat)
    })

    return () => observer.disconnect()
  }, [])

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon
          return (
            <div
              key={index}
              ref={(el) => { statRefs.current[index] = el }}
              className="text-center stat-item"
            >
              <div className="flex justify-center mb-3">
                <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-full p-3">
                  <Icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
              <div className="font-bold text-xl text-foreground mb-1" style={{ fontFamily: "Pretendard, sans-serif" }}>{stat.value}</div>
              <div className="text-sm text-muted-foreground" style={{ fontFamily: "Pretendard, sans-serif" }}>{stat.label}</div>
            </div>
          )
        })}
      </div>

      <style jsx>{`
        /* Stat Items - Apple-style scroll fade-in */
        :global(.stat-item) {
          opacity: 0;
          transform: translateY(20px) scale(0.95);
          transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 1s cubic-bezier(0.16, 1, 0.3, 1);
        }

        :global(.stat-item.is-visible) {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      `}</style>
    </div>
  )
}
