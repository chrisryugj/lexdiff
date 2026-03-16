'use client'

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
  const config = SEVERITY_CONFIG[item.severity]
  const accent = SEVERITY_ACCENT[item.severity]

  return (
    <div className={`group relative overflow-hidden rounded-lg border ${accent.border} bg-white dark:bg-gray-900/80 transition-shadow hover:shadow-md`}>
      <div className="px-4 pt-3.5 pb-3">
        {/* 1행: 분류배지 + 우측에 개정이유|개정일 배지 */}
        <div className="flex items-start justify-between gap-1.5 sm:gap-2 mb-2 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 text-[13px] font-bold px-2.5 py-1 rounded border shrink-0 ${accent.badge}`}>
            <span className={`w-2 h-2 rounded-full ${accent.dot}`} />
            {config.label}
          </span>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] sm:text-[12px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-1.5 sm:px-2 py-0.5 rounded border border-gray-100 dark:border-gray-700">
              {item.change.revisionType}
            </span>
            <span className="text-[11px] sm:text-[12px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-1.5 sm:px-2 py-0.5 rounded border border-gray-100 dark:border-gray-700 tabular-nums">
              {formatDate(item.change.revisionDate)}
            </span>
          </div>
        </div>

        {/* 2행: 법령명 + 조문 (세리프) */}
        <div className="flex items-baseline gap-1.5 min-w-0 mb-2">
          <span
            className="font-bold text-[15px] text-gray-900 dark:text-gray-100 break-keep"
            style={{ fontFamily: "'RIDIBatang', serif" }}
          >
            {item.change.lawName}
          </span>
          <span className="text-[15px] text-brand-navy font-semibold shrink-0">
            {item.change.joDisplay}
          </span>
        </div>

        {/* 하위법령 영향 (있을 때만) */}
        {item.downstreamImpacts.length > 0 && (
          <div className="flex items-center gap-1 mb-2 text-[13px] text-brand-navy">
            <Icon name="git-compare" size={13} />
            <span>하위법령 {item.downstreamImpacts.length}건 영향</span>
          </div>
        )}

        {/* AI 분류 근거 (항상 표시, 세리프) */}
        <div className="mt-1.5 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
          <p
            className="text-[13px] text-gray-600 dark:text-gray-400 leading-relaxed"
            style={{ fontFamily: "'RIDIBatang', serif" }}
          >
            {item.severityReason}
          </p>
          {item.downstreamImpacts.length > 0 && (
            <div className="mt-1.5 text-[12px]">
              <p className="font-medium text-gray-500 dark:text-gray-400 mb-0.5">영향 하위법령:</p>
              <ul className="space-y-0.5 text-gray-400 dark:text-gray-500">
                {item.downstreamImpacts.map((d, i) => (
                  <li key={i} className="flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0" />
                    <span className="break-keep line-clamp-1">[{d.type}] {d.lawName} {d.joDisplay || ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* 액션 버튼 — 테마 일관성 */}
      <div className="flex gap-1.5 px-4 py-2 border-t border-gray-100 dark:border-gray-800/60">
        {onCompare && (
          <Button
            variant="ghost"
            size="sm"
            className="text-[13px] h-8 px-3 gap-1 text-gray-500 hover:text-brand-navy hover:bg-brand-navy/5 transition-colors"
            onClick={() => onCompare(item.change.lawName, item.change.lawId, item.change.mst)}
          >
            <Icon name="git-compare" size={13} />
            신구대비
          </Button>
        )}
        {onViewLaw && (
          <Button
            variant="ghost"
            size="sm"
            className="text-[13px] h-8 px-3 gap-1 text-gray-500 hover:text-brand-navy hover:bg-brand-navy/5 transition-colors"
            onClick={() => onViewLaw(item.change.lawName, item.change.jo, item.change.joDisplay)}
          >
            <Icon name="file-text" size={13} />
            조문 보기
          </Button>
        )}
      </div>
    </div>
  )
}
