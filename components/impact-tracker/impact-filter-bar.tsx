'use client'

import { Badge } from '@/components/ui/badge'
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

const SEVERITY_OPTIONS: Array<{ value: ImpactSeverity | 'all'; label: string; className: string }> = [
  { value: 'all', label: '전체', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  { value: 'critical', label: '긴급', className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400' },
  { value: 'review', label: '검토', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400' },
  { value: 'info', label: '참고', className: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400' },
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
    <div className="flex flex-wrap items-center gap-3 mb-4">
      {/* 등급 필터 */}
      <div className="flex gap-1.5">
        {SEVERITY_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => onSeverityChange(opt.value)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
              severityFilter === opt.value
                ? `${opt.className} ring-2 ring-offset-1 ring-gray-400 dark:ring-gray-600`
                : 'bg-gray-50 text-gray-400 dark:bg-gray-900 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
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
          className="text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300"
        >
          <option value="all">전체 법령</option>
          {availableLaws.map(law => (
            <option key={law} value={law}>{law}</option>
          ))}
        </select>
      )}

      {/* 카운트 */}
      <span className="text-xs text-gray-400 ml-auto">
        {filteredCount === totalCount
          ? `${totalCount}건`
          : `${filteredCount}/${totalCount}건`}
      </span>
    </div>
  )
}
