"use client"

import { useState, useEffect } from "react"
import { Icon } from "@/components/ui/icon"

interface LawStats {
  laws: number
  adminRules: number
  ordinances: number
  precedents: number
}

const FALLBACK: LawStats = { laws: 30000, adminRules: 15000, ordinances: 130000, precedents: 250000 }

function formatCount(n: number): string {
  if (n >= 10000) return `${Math.floor(n / 10000)}만+`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}천+`
  return `${n}+`
}

export function StatsSection() {
  const [stats, setStats] = useState<LawStats | null>(null)

  useEffect(() => {
    fetch("/api/law-stats")
      .then((r) => r.json())
      .then((data: LawStats) => {
        if (data.laws > 0) setStats(data)
      })
      .catch(() => {})
  }, [])

  const s = stats || FALLBACK

  const items = [
    {
      icon: "scale" as const,
      value: formatCount(s.laws),
      label: "법령",
      color: "text-blue-400",
      iconBg: "bg-blue-500/10",
    },
    {
      icon: "file-text" as const,
      value: formatCount(s.adminRules),
      label: "행정규칙",
      color: "text-emerald-400",
      iconBg: "bg-emerald-500/10",
    },
    {
      icon: "landmark" as const,
      value: formatCount(s.ordinances),
      label: "자치법규",
      color: "text-amber-400",
      iconBg: "bg-amber-500/10",
    },
    {
      icon: "gavel" as const,
      value: formatCount(s.precedents),
      label: "판례",
      color: "text-purple-400",
      iconBg: "bg-purple-500/10",
    },
  ]

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 reveal-stagger revealed">
        {items.map((stat, index) => (
          <div key={index} className="stat-card text-center">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className={`${stat.iconBg} w-12 h-12 rounded-xl flex items-center justify-center`}>
                <Icon name={stat.icon} className={`h-6 w-6 ${stat.color}`} />
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
        ))}
      </div>
    </div>
  )
}
