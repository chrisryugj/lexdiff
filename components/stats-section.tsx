"use client"

import { FileText, Search, Zap, Award } from "lucide-react"

const stats = [
  {
    icon: FileText,
    value: "30,000+",
    label: "법령 데이터베이스",
    color: "text-blue-400",
    iconBg: "bg-blue-500/10",
  },
  {
    icon: Search,
    value: "AI 검색",
    label: "Gemini 2.5 Flash",
    color: "text-emerald-400",
    iconBg: "bg-emerald-500/10",
  },
  {
    icon: Zap,
    value: "실시간",
    label: "법제처 API 연동",
    color: "text-amber-400",
    iconBg: "bg-amber-500/10",
  },
  {
    icon: Award,
    value: "무료",
    label: "개인/상업적 이용",
    color: "text-purple-400",
    iconBg: "bg-purple-500/10",
  },
]

export function StatsSection() {
  return (
    <div className="w-full">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 reveal-stagger revealed">
        {stats.map((stat, index) => {
          const Icon = stat.icon
          return (
            <div
              key={index}
              className="stat-card text-center"
            >
              {/* Icon */}
              <div className="flex justify-center mb-4">
                <div className={`${stat.iconBg} w-12 h-12 rounded-xl flex items-center justify-center`}>
                  <Icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>

              {/* Value */}
              <div
                className="font-bold text-xl md:text-2xl text-foreground mb-1"
                style={{ fontFamily: "Pretendard, sans-serif" }}
              >
                {stat.value}
              </div>

              {/* Label */}
              <div
                className="text-sm text-muted-foreground/60"
                style={{ fontFamily: "Pretendard, sans-serif" }}
              >
                {stat.label}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
