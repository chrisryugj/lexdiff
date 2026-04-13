'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useScrollDirection } from '@/hooks/use-scroll-direction'
import type { ImpactStep } from '@/lib/impact-tracker/types'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { ThemeToggle } from '@/components/theme-toggle'
import { UserMenu } from '@/components/user-menu'
import { useImpactTracker } from '@/hooks/use-impact-tracker'
import { useLawViewerModals } from '@/hooks/use-law-viewer-modals'
import { LawStatsFooter } from '@/components/shared/law-stats-footer'
import { ImpactTrackerInput } from './impact-tracker-input'
import { ImpactSummary } from './impact-summary'
import { ImpactFilterBar } from './impact-filter-bar'
import { ImpactCard } from './impact-card'
import type { ImpactTrackerRequest, ImpactSeverity } from '@/lib/impact-tracker/types'

const ReferenceModal = dynamic(
  () => import('@/components/reference-modal').then(m => m.ReferenceModal),
  { ssr: false }
)
const AnnexModal = dynamic(
  () => import('@/components/annex-modal').then(m => m.AnnexModal),
  { ssr: false }
)

interface ImpactTrackerViewProps {
  initialRequest?: ImpactTrackerRequest | null
  onBack: () => void
  onHomeClick: () => void
  onCompare?: (lawName: string, lawId: string, mst: string) => void
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, review: 1, info: 2 }

const STEP_LABELS: Record<string, string> = {
  resolving: '법령 검색',
  extracting: '상위법령 참조 추출',
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
    completedSteps,
    startAnalysis,
    cancelAnalysis,
    clearResults,
  } = useImpactTracker()

  const [severityFilter, setSeverityFilter] = useState<ImpactSeverity | 'all'>('all')
  const [lawFilter, setLawFilter] = useState<string | 'all'>('all')
  const [hasStarted, setHasStarted] = useState(false)
  const autoStarted = useRef(false)

  // 헤더 스크롤 표시/숨김
  const isHeaderVisible = useScrollDirection()  // PERF-3

  // 레퍼런스 모달 (법령뷰어와 동일한 훅 사용)
  const emptyMeta = useRef({ lawTitle: '', fetchedAt: '' }).current
  const {
    refModal, setRefModal,
    refModalHistory, setRefModalHistory,
    openExternalLawArticleModal,
    handleRefModalBack,
    handleViewFullLaw,
    annexModal,
    openAnnexModal,
    closeAnnexModal,
  } = useLawViewerModals(emptyMeta, undefined)

  // 히스토리 복원 시 자동 분석 시작
  useEffect(() => {
    if (initialRequest && initialRequest.lawNames.length > 0 && !autoStarted.current) {
      autoStarted.current = true
      setHasStarted(true)
      startAnalysis(initialRequest)
    }
  }, [initialRequest, startAnalysis])

  // PERF-3: 스크롤 헤더 로직은 useScrollDirection으로 이전


  const lastRequestRef = useRef<ImpactTrackerRequest | null>(null)

  const handleSubmit = useCallback((request: ImpactTrackerRequest) => {
    lastRequestRef.current = request
    setHasStarted(true)
    setSeverityFilter('all')
    setLawFilter('all')
    startAnalysis(request)
  }, [startAnalysis])

  const handleForceRefresh = useCallback(() => {
    const req = lastRequestRef.current || initialRequest
    if (!req) return
    setSeverityFilter('all')
    setLawFilter('all')
    startAnalysis(req, true)
  }, [startAnalysis, initialRequest])

  const handleNewAnalysis = useCallback(() => {
    clearResults()
    setHasStarted(false)
  }, [clearResults])

  // 조문보기 → 법령뷰어와 동일한 레퍼런스 모달 열기
  const handleViewArticle = useCallback((_lawName: string, _jo: string, joDisplay: string) => {
    openExternalLawArticleModal(_lawName, joDisplay)
  }, [openExternalLawArticleModal])

  const filteredItems = useMemo(() => {
    return items
      .filter(item => {
        if (severityFilter !== 'all' && item.severity !== severityFilter) return false
        if (lawFilter !== 'all' && item.change.lawName !== lawFilter) return false
        return true
      })
      .sort((a, b) => {
        const sevDiff = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
        if (sevDiff !== 0) return sevDiff
        return (a.change.jo || '').localeCompare(b.change.jo || '', undefined, { numeric: true })
      })
  }, [items, severityFilter, lawFilter])

  const availableLaws = useMemo(() => {
    return [...new Set(items.map(i => i.change.lawName))]
  }, [items])

  const handleLogoClick = () => {
    onHomeClick()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-content-bg flex flex-col">
      {/* 헤더 — SearchView와 동일 스타일 */}
      <header
        className="sticky top-0 z-50 shadow-sm border-b border-gray-200 dark:border-gray-800/60 bg-content-bg transition-transform duration-400"
        style={{ transform: isHeaderVisible ? 'translateY(0)' : 'translateY(-100%)' }}
      >
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo */}
            <button onClick={handleLogoClick} className="flex items-center gap-3 group">
              <div className="flex h-10 w-10 items-center justify-center bg-brand-navy text-white dark:text-background shadow-md transition-transform duration-300 group-hover:scale-105">
                <Icon name="scale" size={22} />
              </div>
              <span
                className="text-xl lg:text-2xl font-medium italic text-brand-navy tracking-tight"
                style={{ fontFamily: "'Libre Bodoni', serif", fontWeight: 500, fontStyle: 'italic', fontVariationSettings: "'wght' 500" }}
              >
                LexDiff
              </span>
            </button>

            {/* Actions */}
            <div className="flex items-center gap-2 lg:gap-4">
              {hasStarted && !isAnalyzing && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleForceRefresh}
                    className="h-8 w-8 p-0 text-orange-500 hover:text-orange-600 hover:bg-orange-500/10"
                    title="캐시 무시 새로고침"
                  >
                    <Icon name="refresh-cw" size={14} />
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleNewAnalysis} className="h-8 text-xs border-gray-200 dark:border-gray-700">
                    새 분석
                  </Button>
                </>
              )}
              <ThemeToggle />
              <UserMenu
                onLoginClick={() => window.dispatchEvent(new CustomEvent('lexdiff:ai-gate-required', {
                  detail: { returnView: { mode: 'impact-tracker' } }
                }))}
                onFavoriteSelect={() => {}}
                onAllFavoritesClick={() => {}}
              />
              <Button variant="ghost" size="sm" onClick={onBack} title="뒤로가기" className="hover:bg-gray-200 dark:hover:bg-gray-800">
                <Icon name="arrow-left" size={18} className="text-gray-600 dark:text-gray-400" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          {/* 페이지 타이틀 (입력폼 위에) */}
          {!hasStarted && (
            <div className="flex items-center gap-2 mb-6">
              <Icon name="file-search" size={20} className="text-brand-gold" />
              <h2
                className="text-lg sm:text-xl font-bold text-brand-navy"
                style={{ fontFamily: "'RIDIBatang', serif" }}
              >
                법령 변경 영향 분석
              </h2>
            </div>
          )}

          {/* 입력 폼 (분석 전) */}
          {!hasStarted && (
            <ImpactTrackerInput onSubmit={handleSubmit} isAnalyzing={isAnalyzing} />
          )}

          {/* 분석 진행/완료 스택형 프로그레스 */}
          {(isAnalyzing || (!isAnalyzing && completedSteps.length > 0 && hasStarted)) && (
            <div className="mb-6 bg-white dark:bg-gray-900/80 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              {isAnalyzing && (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">영향 분석 진행 중</span>
                    <span className="text-sm font-bold text-brand-navy tabular-nums">{Math.min(100, Math.round(progress))}%</span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2 mb-4">
                    <div
                      className="bg-gradient-to-r from-brand-navy to-brand-gold h-2 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${Math.min(100, progress)}%` }}
                    />
                  </div>
                </>
              )}

              {!isAnalyzing && completedSteps.length > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="check-circle" size={16} className="text-emerald-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">분석 완료</span>
                  <span className="text-xs text-gray-400 tabular-nums ml-auto">
                    총 {(completedSteps.reduce((s, cs) => s + cs.durationMs, 0) / 1000).toFixed(1)}초
                  </span>
                </div>
              )}

              <div className="space-y-1.5">
                {completedSteps.map((cs, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-sm">
                    <Icon name="check-circle" size={15} className="text-emerald-500 shrink-0" />
                    <span className="text-gray-600 dark:text-gray-400 flex-1">{STEP_LABELS[cs.step] || cs.step}</span>
                    <span className="text-xs text-gray-400 tabular-nums shrink-0">{(cs.durationMs / 1000).toFixed(1)}초</span>
                  </div>
                ))}

                {isAnalyzing && (
                  <>
                    <div className="flex items-center gap-2.5 text-sm">
                      <Icon name="loader" size={15} className="text-brand-gold animate-spin shrink-0" />
                      <span className="font-medium text-gray-800 dark:text-gray-200 flex-1">
                        {STEP_LABELS[step] || step}
                      </span>
                      <ImpactStepTimer step={step} />
                    </div>

                    {statusMessage && (
                      <div className="ml-[27px] text-xs text-gray-500 dark:text-gray-400">
                        {statusMessage}
                      </div>
                    )}
                  </>
                )}
              </div>

              {isAnalyzing && (
                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
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
              )}
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
      </div>

      {/* 푸터 — 공통 컴포넌트 */}
      <LawStatsFooter />

      {/* 조문 보기 레퍼런스 모달 */}
      <ReferenceModal
        isOpen={refModal.open}
        onClose={() => {
          setRefModal({ open: false })
          setRefModalHistory([])
        }}
        title={refModal.title || '연결된 본문'}
        html={refModal.html}
        lawName={refModal.lawName}
        articleNumber={refModal.articleNumber}
        loading={refModal.loading}
        hasHistory={refModalHistory.length > 0}
        onBack={handleRefModalBack}
        onViewFullLaw={handleViewFullLaw}
      />
      <AnnexModal
        isOpen={annexModal.open}
        onClose={closeAnnexModal}
        annexNumber={annexModal.annexNumber}
        lawName={annexModal.lawName}
        lawId={annexModal.lawId}
        onLawClick={(lawName, article) => {
          closeAnnexModal()
          if (article) openExternalLawArticleModal(lawName, article)
        }}
      />
    </div>
  )
}

/** 현재 단계 경과 시간 타이머 */
function ImpactStepTimer({ step }: { step: ImpactStep }) {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())
  const prevStep = useRef(step)

  useEffect(() => {
    if (step !== prevStep.current) {
      startRef.current = Date.now()
      setElapsed(0)
      prevStep.current = step
    }
    const id = setInterval(() => setElapsed((Date.now() - startRef.current) / 1000), 100)
    return () => clearInterval(id)
  }, [step])

  return (
    <span className="text-xs text-brand-gold tabular-nums shrink-0">
      {elapsed.toFixed(1)}초
    </span>
  )
}
