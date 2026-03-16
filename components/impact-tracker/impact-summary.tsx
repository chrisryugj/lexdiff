'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/icon'
import { LegalMarkdownRenderer } from '@/components/legal-markdown-renderer'
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

  // 조례 참조 + 변경감지 통합 텍스트
  const hasOrdinanceInfo = ordinanceRefs && ordinanceRefs.length > 0
  const hasParentChanges = parentLawChanges && parentLawChanges.length > 0

  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/80 mb-6">
      {/* 상단 골드 라인 */}
      <div className="h-0.5 bg-gradient-to-r from-brand-gold via-brand-gold-light to-brand-gold" />

      <div className="p-4 sm:p-5">
        {isLoading ? (
          <div className="flex items-center gap-3 text-gray-500">
            <div className="relative">
              <Icon name="loader" size={18} className="animate-spin text-brand-gold" />
            </div>
            <span className="text-sm">종합 요약 생성 중...</span>
          </div>
        ) : summary ? (
          <>
            {/* 핵심 통계 블록: 기간 + 건수 + 등급 배지 통합 */}
            <div className="flex flex-col gap-3 mb-4">
              {/* 첫 줄: 기간 + 총건수 */}
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-2xl font-bold text-brand-navy tabular-nums">
                  {summary.totalChanges}건
                </span>
                <span className="text-sm text-gray-400 dark:text-gray-500">
                  {summary.dateRange.from} ~ {summary.dateRange.to}
                </span>
              </div>

              {/* 둘째 줄: 등급 배지 바 */}
              <div className="flex flex-wrap items-center gap-2">
                {summary.bySeverity.critical > 0 && (
                  <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-lg px-3 py-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-sm font-semibold text-red-700 dark:text-red-400">긴급 {summary.bySeverity.critical}</span>
                  </div>
                )}
                {summary.bySeverity.review > 0 && (
                  <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg px-3 py-1.5">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">검토 {summary.bySeverity.review}</span>
                  </div>
                )}
                {summary.bySeverity.info > 0 && (
                  <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-lg px-3 py-1.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">참고 {summary.bySeverity.info}</span>
                  </div>
                )}
              </div>

              {/* 셋째 줄: 조례→상위법령 참조 통계 (있을 때만, 배지와 통합) */}
              {hasOrdinanceInfo && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-800 pt-3">
                  <Icon name="link" size={14} className="text-brand-gold shrink-0" />
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {ordinanceRefs!.map((ref, i) => (
                      <span key={i} className="whitespace-nowrap sm:whitespace-normal">
                        <span className="font-medium text-gray-700 dark:text-gray-300">{ref.ordinanceName}</span>
                        <span className="text-gray-400 dark:text-gray-500"> · 상위법령 {ref.refs.length}건 참조</span>
                      </span>
                    ))}
                    {hasParentChanges && (
                      <span className="inline-flex items-center gap-1 bg-brand-gold/10 text-brand-gold font-semibold px-2 py-0.5 rounded text-xs">
                        <Icon name="alert-triangle" size={12} />
                        {parentLawChanges!.length}건 변경 감지
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* AI 요약 (접기/펼치기) */}
            {summary.aiSummary && (
              <div>
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-[15px] text-brand-navy hover:opacity-80 flex items-center gap-1.5 font-medium transition-opacity"
                >
                  <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={14} />
                  AI 종합 요약
                </button>
                {expanded && (
                  <div className="mt-3 bg-content-bg rounded-lg p-3 sm:p-5 border border-gray-100 dark:border-gray-800">
                    <LegalMarkdownRenderer
                      content={summary.aiSummary}
                      disabledLink
                    />
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
