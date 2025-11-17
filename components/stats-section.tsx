"use client"

import { FileText, Search, Zap, Award } from "lucide-react"

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
  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon
          return (
            <div
              key={index}
              className="text-center animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
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
    </div>
  )
}
