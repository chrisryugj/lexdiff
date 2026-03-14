'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useImpactTracker } from '@/hooks/use-impact-tracker'
import { ImpactTrackerInput } from './impact-tracker-input'
import { ImpactSummary } from './impact-summary'
import { ImpactFilterBar } from './impact-filter-bar'
import { ImpactCard } from './impact-card'
import type { ImpactTrackerRequest, ImpactSeverity } from '@/lib/impact-tracker/types'

const ReferenceModal = dynamic(
  () => import('@/components/reference-modal').then(m => m.ReferenceModal),
  { ssr: false }
)

interface ImpactTrackerViewProps {
  initialRequest?: ImpactTrackerRequest | null
  onBack: () => void
  onHomeClick: () => void
  onCompare?: (lawName: string, lawId: string, mst: string) => void
}

const STEP_LABELS: Record<string, string> = {
  resolving: '법령 검색',
  extracting: '상위법령 참조 추출',
  comparing: '신구법 비교',
  tracing: '하위법령 추적',
  classifying: 'AI 영향도 분류',
  summarizing: 'AI 종합 요약',
  complete: '완료',
}

const STEP_ICONS: Record<string, string> = {
  resolving: 'search',
  extracting: 'link',
  comparing: 'git-compare',
  tracing: 'git-compare',
  classifying: 'brain',
  summarizing: 'file-text',
  complete: 'check-circle',
}

export function ImpactTrackerView({
  initialRequest,
  onBack,
  onHomeClick,
  onCompare,
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
    ordinanceRefs,
    parentLawChanges,
    startAnalysis,
    cancelAnalysis,
    clearResults,
  } = useImpactTracker()

  const [severityFilter, setSeverityFilter] = useState<ImpactSeverity | 'all'>('all')
  const [lawFilter, setLawFilter] = useState<string | 'all'>('all')
  const [hasStarted, setHasStarted] = useState(false)
  const autoStarted = useRef(false)

  // 레퍼런스 모달 상태
  const [refModal, setRefModal] = useState<{
    open: boolean
    title: string
    html: string
    lawName: string
    articleNumber: string
    loading: boolean
  }>({ open: false, title: '', html: '', lawName: '', articleNumber: '', loading: false })

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

  // 조문보기 → 레퍼런스 모달 열기
  const handleViewArticle = useCallback(async (lawName: string, jo: string, joDisplay: string) => {
    setRefModal({
      open: true,
      title: `${lawName} ${joDisplay}`,
      html: '',
      lawName,
      articleNumber: joDisplay,
      loading: true,
    })

    try {
      // MCP get_law_text API를 통해 조문 가져오기
      const res = await fetch(`/api/law-article?lawName=${encodeURIComponent(lawName)}&jo=${encodeURIComponent(jo)}&joDisplay=${encodeURIComponent(joDisplay)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      setRefModal(prev => ({
        ...prev,
        html: data.html || '<p>조문을 불러올 수 없습니다.</p>',
        loading: false,
      }))
    } catch {
      // 폴백: 법제처 링크 제공
      const isOrdinance = /조례/.test(lawName) || (/(특별시|광역시|[가-힣]+도|[가-힣]+(시|군|구))\s+[가-힣]/.test(lawName) && !/시행규칙|시행령/.test(lawName))
      const lawGoKrUrl = `https://www.law.go.kr/${isOrdinance ? '자치법규' : '법령'}/${encodeURIComponent(lawName)}`
      setRefModal(prev => ({
        ...prev,
        html: `<div class="space-y-3"><p>조문을 직접 불러올 수 없습니다.</p><div class="pt-3 border-t"><a href="${lawGoKrUrl}" target="_blank" rel="noopener" class="text-blue-600 hover:underline inline-flex items-center gap-1">법제처에서 ${lawName} ${joDisplay} 보기 →</a></div></div>`,
        loading: false,
      }))
    }
  }, [])

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
    <div className="min-h-screen bg-[#faf9f7] dark:bg-[#0c0e14]">
      {/* 헤더 */}
      <header className="sticky top-0 z-40 bg-[#faf9f7]/95 dark:bg-[#0c0e14]/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800/60">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack} className="h-8 w-8 p-0 hover:bg-gray-200 dark:hover:bg-gray-800">
              <Icon name="arrow-left" size={18} />
            </Button>
            <div className="flex items-center gap-2">
              <Icon name="file-search" size={18} className="text-[#d4af37] dark:text-[#e2a85d]" />
              <h2
                className="text-base sm:text-lg font-bold text-[#1a2b4c] dark:text-white"
                style={{ fontFamily: "'RIDIBatang', serif" }}
              >
                법령 변경 영향 분석
              </h2>
            </div>
          </div>
          <div className="flex gap-2">
            {hasStarted && !isAnalyzing && (
              <Button variant="outline" size="sm" onClick={handleNewAnalysis} className="h-8 text-xs border-gray-200 dark:border-gray-700">
                새 분석
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onHomeClick} className="h-8 w-8 p-0 hover:bg-gray-200 dark:hover:bg-gray-800">
              <Icon name="home" size={16} />
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {/* 입력 폼 (분석 전) */}
        {!hasStarted && (
          <ImpactTrackerInput onSubmit={handleSubmit} isAnalyzing={isAnalyzing} />
        )}

        {/* 분석 중: 프로그레스 */}
        {isAnalyzing && (
          <div className="mb-6 bg-white dark:bg-gray-900/80 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-[#1a2b4c]/10 dark:bg-[#e2a85d]/10 flex items-center justify-center">
                <Icon name={(STEP_ICONS[step] || 'loader') as import('@/components/ui/icon').IconName} size={16} className="text-[#1a2b4c] dark:text-[#e2a85d] animate-pulse" />
              </div>
              <div className="flex-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {STEP_LABELS[step] || step}
                  </span>
                  <span className="text-xs text-gray-400 tabular-nums">{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 mt-1.5">
                  <div
                    className="bg-gradient-to-r from-[#1a2b4c] to-[#d4af37] dark:from-[#e2a85d] dark:to-[#d4af37] h-1.5 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 pl-11">{statusMessage}</p>
            <div className="pl-11 mt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={cancelAnalysis}
                className="text-xs h-7 text-gray-400 hover:text-red-500"
              >
                <Icon name="x" size={14} />
                취소
              </Button>
            </div>
          </div>
        )}

        {/* 에러 */}
        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-2">
              <Icon name="alert-circle" size={16} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        )}

        {/* 결과: 요약 + 필터 + 카드 그리드 */}
        {hasStarted && (items.length > 0 || summary) && (
          <>
            <ImpactSummary
              summary={summary}
              isLoading={isAnalyzing && step === 'summarizing'}
              aiSource={aiSource}
              ordinanceRefs={ordinanceRefs}
              parentLawChanges={parentLawChanges}
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
                      onViewLaw={handleViewArticle}
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
          <div className="text-center py-16">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
              <Icon name="check-circle" size={24} className="text-emerald-500" />
            </div>
            <p className="text-gray-500 dark:text-gray-400">조회 기간 내 변경사항이 없습니다.</p>
          </div>
        )}
      </div>

      {/* 조문 보기 레퍼런스 모달 */}
      <ReferenceModal
        isOpen={refModal.open}
        onClose={() => setRefModal(prev => ({ ...prev, open: false }))}
        title={refModal.title}
        html={refModal.html}
        lawName={refModal.lawName}
        articleNumber={refModal.articleNumber}
        loading={refModal.loading}
      />
    </div>
  )
}
