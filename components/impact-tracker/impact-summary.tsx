'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/icon'
import type { ImpactSummary as ImpactSummaryType } from '@/lib/impact-tracker/types'

interface ImpactSummaryProps {
  summary: ImpactSummaryType | null
  isLoading: boolean
  aiSource: 'openclaw' | 'gemini' | null
}

export function ImpactSummary({ summary, isLoading, aiSource }: ImpactSummaryProps) {
  const [expanded, setExpanded] = useState(false)

  if (!summary && !isLoading) return null

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-5 mb-6">
      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Icon name="loader" size={16} className="animate-spin" />
          <span className="text-sm">종합 요약 생성 중...</span>
        </div>
      ) : summary ? (
        <>
          {/* 기간 + 통계 */}
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <span className="text-sm text-gray-500">
              {summary.dateRange.from} ~ {summary.dateRange.to}
            </span>
            <span className="text-sm font-medium">
              총 {summary.totalChanges}건
            </span>
            {summary.bySeverity.critical > 0 && (
              <span className="text-xs font-medium text-red-600 bg-red-50 dark:bg-red-950 px-2 py-0.5 rounded">
                긴급 {summary.bySeverity.critical}
              </span>
            )}
            {summary.bySeverity.review > 0 && (
              <span className="text-xs font-medium text-yellow-600 bg-yellow-50 dark:bg-yellow-950 px-2 py-0.5 rounded">
                검토 {summary.bySeverity.review}
              </span>
            )}
            {summary.bySeverity.info > 0 && (
              <span className="text-xs font-medium text-green-600 bg-green-50 dark:bg-green-950 px-2 py-0.5 rounded">
                참고 {summary.bySeverity.info}
              </span>
            )}
            {aiSource && (
              <span className="text-xs text-gray-400 ml-auto">
                {aiSource === 'openclaw' ? 'OpenClaw' : 'Gemini'}
              </span>
            )}
          </div>

          {/* AI 요약 (접기/펼치기) */}
          {summary.aiSummary && (
            <div>
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={14} />
                AI 종합 요약
              </button>
              {expanded && (
                <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
                  {summary.aiSummary}
                </p>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
