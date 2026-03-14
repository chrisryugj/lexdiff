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
  const [expanded, setExpanded] = useState(true)

  if (!summary && !isLoading) return null

  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/80 mb-6">
      {/* 상단 골드 라인 */}
      <div className="h-0.5 bg-gradient-to-r from-[#d4af37] via-[#e2a85d] to-[#d4af37]" />

      <div className="p-5">
        {isLoading ? (
          <div className="flex items-center gap-3 text-gray-500">
            <div className="relative">
              <Icon name="loader" size={18} className="animate-spin text-[#d4af37]" />
            </div>
            <span className="text-sm">종합 요약 생성 중...</span>
          </div>
        ) : summary ? (
          <>
            {/* 통계 행 */}
            <div className="flex items-center gap-2 sm:gap-3 mb-4 flex-wrap">
              <span className="text-[15px] text-gray-500 dark:text-gray-400">
                {summary.dateRange.from} ~ {summary.dateRange.to}
              </span>
              <span className="text-[15px] font-semibold text-[#1a2b4c] dark:text-white">
                총 {summary.totalChanges}건
              </span>

              <div className="flex gap-1.5 ml-auto">
                {summary.bySeverity.critical > 0 && (
                  <span className="text-xs font-semibold text-red-600 bg-red-500/10 dark:bg-red-500/20 dark:text-red-400 px-2 py-0.5 rounded-full">
                    긴급 {summary.bySeverity.critical}
                  </span>
                )}
                {summary.bySeverity.review > 0 && (
                  <span className="text-xs font-semibold text-amber-700 bg-amber-500/10 dark:bg-amber-500/20 dark:text-amber-400 px-2 py-0.5 rounded-full">
                    검토 {summary.bySeverity.review}
                  </span>
                )}
                {summary.bySeverity.info > 0 && (
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-500/10 dark:bg-emerald-500/20 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                    참고 {summary.bySeverity.info}
                  </span>
                )}
              </div>
            </div>

            {/* B방향: 조례→상위법령 참조 통계 */}
            {ordinanceRefs && ordinanceRefs.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-4 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
                <Icon name="link" size={12} className="text-[#d4af37]" />
                {ordinanceRefs.map((ref, i) => (
                  <span key={i}>
                    {ref.ordinanceName}: 상위법령 {ref.refs.length}건 참조
                  </span>
                ))}
                {parentLawChanges && parentLawChanges.length > 0 && (
                  <span className="text-[#d4af37] dark:text-[#e2a85d] font-medium">
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
                  className="text-[15px] text-[#1a2b4c] dark:text-[#e2a85d] hover:opacity-80 flex items-center gap-1.5 font-medium transition-opacity"
                >
                  <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={14} />
                  AI 종합 요약
                </button>
                {expanded && (
                  <div className="mt-3 text-[15px] text-gray-700 dark:text-gray-300 leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-headings:text-base prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-li:my-0.5 prose-strong:text-gray-900 dark:prose-strong:text-white prose-table:border-collapse prose-table:w-full prose-th:bg-gray-100 dark:prose-th:bg-gray-800 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:text-xs prose-th:font-semibold prose-th:border prose-th:border-gray-200 dark:prose-th:border-gray-700 prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-gray-200 dark:prose-td:border-gray-700 prose-td:text-sm bg-[#faf9f7] dark:bg-gray-800/30 rounded-lg p-5 border border-gray-100 dark:border-gray-800">
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
    </div>
  )
}
