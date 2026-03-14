'use client'

import type { ImpactSeverity } from '@/lib/impact-tracker/types'

interface ImpactFilterBarProps {
  severityFilter: ImpactSeverity | 'all'
  lawFilter: string | 'all'
  availableLaws: string[]
  onSeverityChange: (v: ImpactSeverity | 'all') => void
  onLawChange: (v: string | 'all') => void
  totalCount: number
  filteredCount: number
}

const SEVERITY_OPTIONS: Array<{
  value: ImpactSeverity | 'all'
  label: string
  activeClass: string
}> = [
  {
    value: 'all',
    label: '전체',
    activeClass: 'bg-[#1a2b4c] text-white dark:bg-[#e2a85d] dark:text-[#0c0e14]',
  },
  {
    value: 'critical',
    label: '긴급',
    activeClass: 'bg-red-500 text-white',
  },
  {
    value: 'review',
    label: '검토',
    activeClass: 'bg-amber-500 text-white',
  },
  {
    value: 'info',
    label: '참고',
    activeClass: 'bg-emerald-500 text-white',
  },
]

export function ImpactFilterBar({
  severityFilter,
  lawFilter,
  availableLaws,
  onSeverityChange,
  onLawChange,
  totalCount,
  filteredCount,
}: ImpactFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-5">
      {/* 등급 필터 - 필(pill) 스타일 */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
        {SEVERITY_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => onSeverityChange(opt.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
              severityFilter === opt.value
                ? `${opt.activeClass} shadow-sm`
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 법령 필터 */}
      {availableLaws.length > 1 && (
        <select
          value={lawFilter}
          onChange={e => onLawChange(e.target.value)}
          className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
        >
          <option value="all">전체 법령</option>
          {availableLaws.map(law => (
            <option key={law} value={law}>{law}</option>
          ))}
        </select>
      )}

      {/* 카운트 */}
      <span className="text-sm text-gray-400 dark:text-gray-500 ml-auto font-medium tabular-nums">
        {filteredCount === totalCount
          ? `${totalCount}건`
          : `${filteredCount}/${totalCount}건`}
      </span>
    </div>
  )
}
