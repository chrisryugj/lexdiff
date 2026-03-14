'use client'

import { useState } from 'react'
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
    dot: 'bg-red-500',
    badge: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/60',
    border: 'border-red-200 dark:border-red-900/50',
  },
  review: {
    dot: 'bg-amber-500',
    badge: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60',
    border: 'border-amber-200 dark:border-amber-900/50',
  },
  info: {
    dot: 'bg-emerald-500',
    badge: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60',
    border: 'border-emerald-200 dark:border-emerald-900/50',
  },
}

/** 날짜 포맷 정규화: 20241231 → 2024-12-31 */
function formatDate(raw: string): string {
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
  }
  return raw
}

export function ImpactCard({ item, onCompare, onViewLaw }: ImpactCardProps) {
  const [expanded, setExpanded] = useState(false)
  const config = SEVERITY_CONFIG[item.severity]
  const accent = SEVERITY_ACCENT[item.severity]

  return (
    <div className={`group relative overflow-hidden rounded-lg border ${accent.border} bg-white dark:bg-gray-900/80 transition-shadow hover:shadow-md`}>
      {/* 헤더 행: 등급 + 법령명 조문 + 개정유형 + 날짜 */}
      <div className="px-3.5 pt-3 pb-2.5">
        {/* 1행: 등급배지 + 개정유형 + 날짜 */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border ${accent.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${accent.dot}`} />
            {config.label}
          </span>
          <span className="text-[11px] text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 px-1.5 py-0.5 rounded">
            {item.change.revisionType}
          </span>
          <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums ml-auto">
            {formatDate(item.change.revisionDate)}
          </span>
        </div>

        {/* 2행: 법령명 + 조문 */}
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate" style={{ fontFamily: "'Pretendard', sans-serif" }}>
            {item.change.lawName}
          </span>
          <span className="text-sm text-[#1a2b4c] dark:text-[#e2a85d] font-medium shrink-0">
            {item.change.joDisplay}
          </span>
        </div>

        {/* 하위법령 영향 (있을 때만, 인라인) */}
        {item.downstreamImpacts.length > 0 && (
          <div className="flex items-center gap-1 mt-1.5 text-[12px] text-[#1a2b4c] dark:text-[#e2a85d]">
            <Icon name="git-compare" size={11} />
            <span>하위법령 {item.downstreamImpacts.length}건 영향</span>
          </div>
        )}
      </div>

      {/* AI 분류 근거 (접기/펼치기) */}
      <div className="px-3.5 pb-2.5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[12px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 transition-colors"
        >
          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={12} />
          AI 분류 근거
        </button>
        {expanded && (
          <div className="mt-2 pl-3 border-l-2 border-gray-100 dark:border-gray-800 space-y-1.5">
            <p className="text-[12px] text-gray-600 dark:text-gray-400 leading-relaxed">
              {item.severityReason}
            </p>
            {item.downstreamImpacts.length > 0 && (
              <div className="text-[11px]">
                <p className="font-medium text-gray-500 dark:text-gray-400 mb-0.5">영향 하위법령:</p>
                <ul className="space-y-0.5 text-gray-400 dark:text-gray-500">
                  {item.downstreamImpacts.map((d, i) => (
                    <li key={i} className="flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0" />
                      <span className="truncate">[{d.type}] {d.lawName} {d.joDisplay || ''}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 액션 버튼 - 하단 밀착 */}
      <div className="flex gap-1.5 px-3.5 py-2 border-t border-gray-50 dark:border-gray-800/60 bg-gray-50/50 dark:bg-gray-800/20">
        {onCompare && (
          <Button
            variant="ghost"
            size="sm"
            className="text-[12px] h-7 px-2.5 gap-1 text-gray-500 hover:text-[#1a2b4c] dark:hover:text-[#e2a85d] transition-colors"
            onClick={() => onCompare(item.change.lawName, item.change.lawId, item.change.mst)}
          >
            <Icon name="git-compare" size={11} />
            신구대비
          </Button>
        )}
        {onViewLaw && (
          <Button
            variant="ghost"
            size="sm"
            className="text-[12px] h-7 px-2.5 gap-1 text-gray-500 hover:text-[#1a2b4c] dark:hover:text-[#e2a85d] transition-colors"
            onClick={() => onViewLaw(item.change.lawName, item.change.jo, item.change.joDisplay)}
          >
            <Icon name="file-text" size={11} />
            조문 보기
          </Button>
        )}
      </div>
    </div>
  )
}
