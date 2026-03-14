'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { SEVERITY_CONFIG, type ImpactItem } from '@/lib/impact-tracker/types'

interface ImpactCardProps {
  item: ImpactItem
  onCompare?: (lawName: string, lawId: string, mst: string) => void
  onViewLaw?: (lawName: string, jo: string, joDisplay: string) => void
}

const SEVERITY_ACCENT = {
  critical: {
    bar: 'bg-red-500',
    badge: 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-200 dark:border-red-800',
    glow: 'hover:shadow-red-100 dark:hover:shadow-red-950/30',
  },
  review: {
    bar: 'bg-amber-500',
    badge: 'bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    glow: 'hover:shadow-amber-100 dark:hover:shadow-amber-950/30',
  },
  info: {
    bar: 'bg-emerald-500',
    badge: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    glow: 'hover:shadow-emerald-100 dark:hover:shadow-emerald-950/30',
  },
}

export function ImpactCard({ item, onCompare, onViewLaw }: ImpactCardProps) {
  const [expanded, setExpanded] = useState(false)
  const config = SEVERITY_CONFIG[item.severity]
  const accent = SEVERITY_ACCENT[item.severity]

  return (
    <div className={`
      group relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800
      bg-white dark:bg-gray-900/80 transition-all duration-200
      hover:shadow-lg ${accent.glow}
    `}>
      {/* 좌측 등급 컬러바 */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${accent.bar}`} />

      <div className="pl-4 pr-4 py-4">
        {/* 헤더: 등급 + 법령명 + 조문 */}
        <div className="flex items-start gap-2 mb-2.5">
          <Badge
            variant="outline"
            className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 ${accent.badge}`}
          >
            {config.label}
          </Badge>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 leading-tight">
                {item.change.lawName}
              </span>
              <span className="text-sm text-[#1a2b4c] dark:text-[#e2a85d] font-medium">
                {item.change.joDisplay}
              </span>
            </div>
          </div>
          <span className="text-[11px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded shrink-0">
            {item.change.revisionType}
          </span>
        </div>

        {/* 메타: 날짜 + 하위법령 영향 */}
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-3">
          <span className="flex items-center gap-1">
            <Icon name="calendar" size={11} />
            {item.change.revisionDate}
          </span>
          {item.downstreamImpacts.length > 0 && (
            <span className="flex items-center gap-1 text-[#1a2b4c] dark:text-[#e2a85d]">
              <Icon name="git-compare" size={11} />
              하위법령 {item.downstreamImpacts.length}건
            </span>
          )}
        </div>

        {/* AI 분류 근거 (접기) */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 mb-3 transition-colors"
        >
          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={12} />
          AI 분류 근거
        </button>
        {expanded && (
          <div className="mb-3 pl-4 border-l-2 border-gray-100 dark:border-gray-800 space-y-2">
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              {item.severityReason}
            </p>
            {item.downstreamImpacts.length > 0 && (
              <div className="text-xs">
                <p className="font-medium text-gray-600 dark:text-gray-300 mb-1">영향 받는 하위법령:</p>
                <ul className="space-y-0.5 text-gray-500 dark:text-gray-400">
                  {item.downstreamImpacts.map((d, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0" />
                      <span>[{d.type}] {d.lawName} {d.joDisplay || ''}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* 액션 버튼 */}
        <div className="flex gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
          {onCompare && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 gap-1.5 border-gray-200 dark:border-gray-700 hover:border-[#1a2b4c] hover:text-[#1a2b4c] dark:hover:border-[#e2a85d] dark:hover:text-[#e2a85d] transition-colors"
              onClick={() => onCompare(item.change.lawName, item.change.lawId, item.change.mst)}
            >
              <Icon name="git-compare" size={12} />
              신구대비
            </Button>
          )}
          {onViewLaw && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 gap-1.5 border-gray-200 dark:border-gray-700 hover:border-[#1a2b4c] hover:text-[#1a2b4c] dark:hover:border-[#e2a85d] dark:hover:text-[#e2a85d] transition-colors"
              onClick={() => onViewLaw(item.change.lawName, item.change.jo, item.change.joDisplay)}
            >
              <Icon name="file-text" size={12} />
              조문 보기
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
