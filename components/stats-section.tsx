"use client"

import { useState, useEffect } from "react"
import { Icon } from "@/components/ui/icon"

interface LawStats {
  constitution: number
  laws: number
  adminRules: number
  ordinances: number
  precedents: number
  asOf?: string
}

const FALLBACK: LawStats = {
  constitution: 1,
  laws: 5561,
  adminRules: 15000,
  ordinances: 158711,
  precedents: 250000,
}

function formatCount(n: number): string {
  if (n >= 100000) return `${(n / 10000).toFixed(1)}만`
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`
  if (n >= 1000) return n.toLocaleString()
  return `${n}`
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
      icon: "shield" as const,
      value: s.constitution,
      formatted: `${s.constitution}`,
      label: "헌법",
      color: "text-rose-400",
      iconBg: "bg-rose-500/10",
    },
    {
      icon: "scale" as const,
      value: s.laws,
      formatted: formatCount(s.laws),
      label: "법령",
      color: "text-blue-400",
      iconBg: "bg-blue-500/10",
    },
    {
      icon: "file-text" as const,
      value: s.adminRules,
      formatted: formatCount(s.adminRules),
      label: "위임법령",
      color: "text-emerald-400",
      iconBg: "bg-emerald-500/10",
    },
    {
      icon: "landmark" as const,
      value: s.ordinances,
      formatted: formatCount(s.ordinances),
      label: "자치법규",
      color: "text-amber-400",
      iconBg: "bg-amber-500/10",
    },
    {
      icon: "gavel" as const,
      value: s.precedents,
      formatted: formatCount(s.precedents),
      label: "판례",
      color: "text-purple-400",
      iconBg: "bg-purple-500/10",
    },
  ]

  return (
    <div className="w-full">
      <div className="grid grid-cols-3 md:grid-cols-5 gap-3 md:gap-5 reveal-stagger revealed">
        {items.map((stat, index) => (
          <div key={index} className="stat-card text-center">
            {/* Icon */}
            <div className="flex justify-center mb-3">
              <div className={`${stat.iconBg} w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center`}>
                <Icon name={stat.icon} className={`h-5 w-5 md:h-6 md:w-6 ${stat.color}`} />
              </div>
            </div>

            {/* Value */}
            <div
              className="font-bold text-lg md:text-2xl text-foreground mb-0.5 tabular-nums"
              style={{ fontFamily: "Pretendard, sans-serif" }}
            >
              {stat.formatted}
            </div>

            {/* Label */}
            <div
              className="text-xs md:text-sm text-muted-foreground/60"
              style={{ fontFamily: "Pretendard, sans-serif" }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>
      {s.asOf && (
        <p className="text-center text-[11px] text-muted-foreground/40 mt-3 tabular-nums">
          {s.asOf} 기준 · 법제처
        </p>
      )}
    </div>
  )
}
