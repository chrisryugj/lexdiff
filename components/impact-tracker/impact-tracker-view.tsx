'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useImpactTracker } from '@/hooks/use-impact-tracker'
import { ImpactTrackerInput } from './impact-tracker-input'
import { ImpactSummary } from './impact-summary'
import { ImpactFilterBar } from './impact-filter-bar'
import { ImpactCard } from './impact-card'
import type { ImpactTrackerRequest, ImpactSeverity } from '@/lib/impact-tracker/types'

interface ImpactTrackerViewProps {
  initialRequest?: ImpactTrackerRequest | null
  onBack: () => void
  onHomeClick: () => void
  onCompare?: (lawId: string, mst: string) => void
  onViewLaw?: (lawId: string, mst: string, jo: string) => void
}

const STEP_LABELS: Record<string, string> = {
  resolving: '법령 검색',
  comparing: '신구법 비교',
  tracing: '하위법령 추적',
  classifying: 'AI 영향도 분류',
  summarizing: 'AI 종합 요약',
  complete: '완료',
}

export function ImpactTrackerView({
  initialRequest,
  onBack,
  onHomeClick,
  onCompare,
  onViewLaw,
}: ImpactTrackerViewProps) {
  const {
    isAnalyzing,
    progress,
    step,
    statusMessage,
    items,
    summary,
    error,
    aiSource,
    startAnalysis,
    cancelAnalysis,
    clearResults,
  } = useImpactTracker()

  const [severityFilter, setSeverityFilter] = useState<ImpactSeverity | 'all'>('all')
  const [lawFilter, setLawFilter] = useState<string | 'all'>('all')
  const [hasStarted, setHasStarted] = useState(false)
  const autoStarted = useRef(false)

  // 히스토리 복원 시 자동 분석 시작
  useEffect(() => {
    if (initialRequest && initialRequest.lawNames.length > 0 && !autoStarted.current) {
      autoStarted.current = true
      setHasStarted(true)
      startAnalysis(initialRequest)
    }
  }, [initialRequest, startAnalysis])

  const handleSubmit = useCallback((request: ImpactTrackerRequest) => {
    setHasStarted(true)
    setSeverityFilter('all')
    setLawFilter('all')
    startAnalysis(request)
  }, [startAnalysis])

  const handleNewAnalysis = useCallback(() => {
    clearResults()
    setHasStarted(false)
  }, [clearResults])

  // 필터링
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (severityFilter !== 'all' && item.severity !== severityFilter) return false
      if (lawFilter !== 'all' && item.change.lawName !== lawFilter) return false
      return true
    })
  }, [items, severityFilter, lawFilter])

  const availableLaws = useMemo(() => {
    return [...new Set(items.map(i => i.change.lawName))]
  }, [items])

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-8 w-8 p-0">
            <Icon name="arrow-left" size={18} />
          </Button>
          <h2
            className="text-xl font-bold text-gray-900 dark:text-white"
            style={{ fontFamily: "'RIDIBatang', serif" }}
          >
            법령 영향 추적기
          </h2>
        </div>
        <div className="flex gap-2">
          {hasStarted && !isAnalyzing && (
            <Button variant="outline" size="sm" onClick={handleNewAnalysis}>
              새 분석
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onHomeClick}>
            <Icon name="home" size={16} />
          </Button>
        </div>
      </div>

      {/* 입력 폼 (분석 전) */}
      {!hasStarted && (
        <ImpactTrackerInput onSubmit={handleSubmit} isAnalyzing={isAnalyzing} />
      )}

      {/* 분석 중: 프로그레스 */}
      {isAnalyzing && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {STEP_LABELS[step] || step}
            </span>
            <span className="text-xs text-gray-400">{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1.5">{statusMessage}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={cancelAnalysis}
            className="mt-3"
          >
            <Icon name="x" size={14} />
            취소
          </Button>
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* 결과: 요약 + 필터 + 카드 그리드 */}
      {hasStarted && (items.length > 0 || summary) && (
        <>
          <ImpactSummary
            summary={summary}
            isLoading={isAnalyzing && step === 'summarizing'}
            aiSource={aiSource}
          />

          {items.length > 0 && (
            <>
              <ImpactFilterBar
                severityFilter={severityFilter}
                lawFilter={lawFilter}
                availableLaws={availableLaws}
                onSeverityChange={setSeverityFilter}
                onLawChange={setLawFilter}
                totalCount={items.length}
                filteredCount={filteredItems.length}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredItems.map(item => (
                  <ImpactCard
                    key={item.id}
                    item={item}
                    onCompare={onCompare}
                    onViewLaw={onViewLaw}
                  />
                ))}
              </div>

              {filteredItems.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">
                  필터 조건에 맞는 항목이 없습니다.
                </p>
              )}
            </>
          )}
        </>
      )}

      {/* 빈 결과 */}
      {hasStarted && !isAnalyzing && items.length === 0 && !error && (
        <div className="text-center py-12">
          <Icon name="check-circle" size={48} className="text-green-400 mx-auto mb-4" />
          <p className="text-gray-500">조회 기간 내 변경사항이 없습니다.</p>
        </div>
      )}
    </div>
  )
}
