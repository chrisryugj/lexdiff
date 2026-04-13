"use client"

import { useState, useEffect } from "react"
import { Icon } from "@/components/ui/icon"
import { AnimatedNumber } from "./animated-number"

export interface LawStats {
  constitution: number
  statutes: number
  delegated: number
  adminRules: number
  ordinances: number
  precedents: number
  asOf?: string
}

const STAT_ITEMS = [
  { key: "constitution" as const, icon: "shield" as const, label: "헌법" },
  { key: "statutes" as const, icon: "scale" as const, label: "법률" },
  { key: "delegated" as const, icon: "file-text" as const, label: "위임법령" },
  { key: "adminRules" as const, icon: "clipboard-check" as const, label: "행정규칙" },
  { key: "ordinances" as const, icon: "landmark" as const, label: "자치법규" },
  { key: "precedents" as const, icon: "gavel" as const, label: "판례" },
] as const

interface LawStatsFooterProps {
  extraLinks?: React.ReactNode
}

export function LawStatsFooter({ extraLinks }: LawStatsFooterProps) {
  const [lawStats, setLawStats] = useState<LawStats | null>(null)

  useEffect(() => {
    fetch("/api/law-stats")
      .then(r => r.json())
      .then((data: LawStats) => {
        if (data.statutes > 0 || data.ordinances > 0) setLawStats(data)
      })
      .catch(() => {})
  }, [])

  return (
    <footer className="bg-footer-bg text-gray-600 dark:text-gray-400 py-12 border-t border-gray-200 dark:border-gray-800">
      <div className="container mx-auto max-w-7xl px-6 lg:px-8">
        <div className="pb-8 border-b border-gray-200 dark:border-gray-700/50 space-y-5">
          <div className="flex items-center justify-center gap-2">
            <Icon name="scale" size={24} className="text-brand-navy" />
            <span
              className="text-xl font-medium italic text-brand-navy tracking-tight"
              style={{ fontFamily: "'Libre Bodoni', serif", fontWeight: 500, fontStyle: 'italic', fontVariationSettings: "'wght' 500" }}
            >
              LexDiff
            </span>
          </div>
          {lawStats && (
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] font-medium">
              {STAT_ITEMS.map((item, i) => {
                const value = lawStats[item.key]
                if (value <= 0) return null
                return (
                  <span key={item.key} className="flex items-center gap-1.5">
                    <Icon name={item.icon} size={13} className="text-brand-gold" />
                    <span className="text-gray-600 dark:text-gray-400">
                      {item.label} <span className="tabular-nums"><AnimatedNumber value={value} delay={i * 100} /></span>
                    </span>
                  </span>
                )
              })}
            </div>
          )}
          {lawStats?.asOf && (
            <p className="text-center text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">{lawStats.asOf} 기준 · 법제처</p>
          )}
        </div>
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mt-8 text-xs text-gray-500">
          <div className="flex gap-4">
            {extraLinks}
            <span>Built with 법제처 Open API</span>
          </div>
          <p>© 2025–2026 딴짓하는 류주임 @chris_gomdori. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
