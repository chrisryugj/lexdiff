'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Icon } from '@/components/ui/icon'
import type { ImpactSummary as ImpactSummaryType } from '@/lib/impact-tracker/types'
import type { OrdinanceRefInfo, ParentLawChangeInfo } from '@/hooks/use-impact-tracker'

interface ImpactSummaryProps {
  summary: ImpactSummaryType | null
  isLoading: boolean
  aiSource: 'openclaw' | 'gemini' | null
  ordinanceRefs?: OrdinanceRefInfo[]
  parentLawChanges?: ParentLawChangeInfo[]
}

export function ImpactSummary({ summary, isLoading, aiSource, ordinanceRefs, parentLawChanges }: ImpactSummaryProps) {
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
          {/* 기간 + 통계 (1줄, 모바일 스크롤) */}
          <div className="flex items-center gap-2 sm:gap-3 mb-3 overflow-x-auto scrollbar-none">
            <span className="text-sm text-gray-500 shrink-0">
              {summary.dateRange.from} ~ {summary.dateRange.to}
            </span>
            <span className="text-sm font-medium shrink-0">
              총 {summary.totalChanges}건
            </span>
            {summary.bySeverity.critical > 0 && (
              <span className="text-xs font-medium text-red-600 bg-red-50 dark:bg-red-950 px-2 py-0.5 rounded shrink-0">
                긴급 {summary.bySeverity.critical}
              </span>
            )}
            {summary.bySeverity.review > 0 && (
              <span className="text-xs font-medium text-yellow-600 bg-yellow-50 dark:bg-yellow-950 px-2 py-0.5 rounded shrink-0">
                검토 {summary.bySeverity.review}
              </span>
            )}
            {summary.bySeverity.info > 0 && (
              <span className="text-xs font-medium text-green-600 bg-green-50 dark:bg-green-950 px-2 py-0.5 rounded shrink-0">
                참고 {summary.bySeverity.info}
              </span>
            )}
            {aiSource && (
              <span className="text-xs text-gray-400 ml-auto shrink-0">
                {aiSource === 'openclaw' ? 'OpenClaw' : 'Gemini'}
              </span>
            )}
          </div>

          {/* B방향: 조례→상위법령 참조 통계 */}
          {ordinanceRefs && ordinanceRefs.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3 text-xs text-gray-600 dark:text-gray-400">
              <Icon name="link" size={12} />
              {ordinanceRefs.map((ref, i) => (
                <span key={i}>
                  {ref.ordinanceName}: 상위법령 {ref.refs.length}건 참조
                </span>
              ))}
              {parentLawChanges && parentLawChanges.length > 0 && (
                <span className="text-orange-600 dark:text-orange-400 font-medium">
                  → {parentLawChanges.length}건 변경 감지
                </span>
              )}
            </div>
          )}

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
                <div className="mt-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-headings:text-base prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-li:my-0.5">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {summary.aiSummary}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
