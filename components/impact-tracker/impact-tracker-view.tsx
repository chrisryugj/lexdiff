'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import type { ImpactStep } from '@/lib/impact-tracker/types'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { ThemeToggle } from '@/components/theme-toggle'
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

/** 0에서 target까지 카운트업 애니메이션 */
function AnimatedNumber({ value, duration = 600, delay = 0 }: { value: number; duration?: number; delay?: number }) {
  const [display, setDisplay] = useState(0)
  const [started, setStarted] = useState(false)
  const spanRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = spanRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setStarted(true); observer.disconnect() } },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!started || value <= 0) return
    const timer = setTimeout(() => {
      let start: number | null = null
      let raf: number
      const step = (ts: number) => {
        if (!start) start = ts
        const progress = Math.min((ts - start) / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        setDisplay(Math.round(eased * value))
        if (progress < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
      return () => cancelAnimationFrame(raf)
    }, delay)
    return () => clearTimeout(timer)
  }, [started, value, duration, delay])

  return <span ref={spanRef}>{display.toLocaleString()}</span>
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
  const [isHeaderVisible, setIsHeaderVisible] = useState(true)
  const lastScrollY = useRef(0)
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 법령 통계 (푸터용)
  const [lawStats, setLawStats] = useState<{
    constitution: number; statutes: number; delegated: number;
    adminRules: number; laws: number; ordinances: number; precedents: number; asOf?: string
  } | null>(null)

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

  // 스크롤 핸들러 (헤더 표시/숨김)
  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY
      if (y < 30) {
        setIsHeaderVisible(true)
        lastScrollY.current = y
        return
      }
      const delta = y - lastScrollY.current
      if (Math.abs(delta) > 8) {
        setIsHeaderVisible(delta <= 0)
        lastScrollY.current = y
      }
      if (scrollTimer.current) clearTimeout(scrollTimer.current)
      scrollTimer.current = setTimeout(() => setIsHeaderVisible(true), 200)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (scrollTimer.current) clearTimeout(scrollTimer.current)
    }
  }, [])

  // 법령 통계 fetch (푸터)
  useEffect(() => {
    fetch('/api/law-stats')
      .then(r => r.json())
      .then(data => {
        if (data.laws || data.ordinances) setLawStats(data)
      })
      .catch(() => {})
  }, [])

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
      const res = await fetch(`/api/law-article?lawName=${encodeURIComponent(lawName)}&jo=${encodeURIComponent(jo)}&joDisplay=${encodeURIComponent(joDisplay)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      setRefModal(prev => ({
        ...prev,
        html: data.html || '<p>조문을 불러올 수 없습니다.</p>',
        loading: false,
      }))
    } catch {
      const isOrdinance = /조례/.test(lawName) || (/(특별시|광역시|[가-힣]+도|[가-힣]+(시|군|구))\s+[가-힣]/.test(lawName) && !/시행규칙|시행령/.test(lawName))
      const lawGoKrUrl = `https://www.law.go.kr/${isOrdinance ? '자치법규' : '법령'}/${encodeURIComponent(lawName)}`
      setRefModal(prev => ({
        ...prev,
        html: `<div class="space-y-3"><p>조문을 직접 불러올 수 없습니다.</p><div class="pt-3 border-t"><a href="${lawGoKrUrl}" target="_blank" rel="noopener" class="text-blue-600 hover:underline inline-flex items-center gap-1">법제처에서 ${lawName} ${joDisplay} 보기 →</a></div></div>`,
        loading: false,
      }))
    }
  }, [])

  // 필터링 + 정렬 (긴급→검토→참고, 같은 등급 내 조문번호순)
  const SEVERITY_ORDER: Record<string, number> = { critical: 0, review: 1, info: 2 }

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
    <div className="min-h-screen bg-[#faf9f7] dark:bg-[#0c0e14] flex flex-col">
      {/* 헤더 — SearchView와 동일 스타일 */}
      <header
        className="sticky top-0 z-50 shadow-sm border-b border-gray-200 dark:border-gray-800/60 bg-[#faf9f7] dark:bg-[#0c0e14] transition-transform duration-400"
        style={{ transform: isHeaderVisible ? 'translateY(0)' : 'translateY(-100%)' }}
      >
        <div className="container mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo */}
            <button onClick={handleLogoClick} className="flex items-center gap-3 group">
              <div className="flex h-10 w-10 items-center justify-center bg-[#1a2b4c] dark:bg-[#e2a85d] text-white dark:text-[#0c0e14] shadow-md transition-transform duration-300 group-hover:scale-105">
                <Icon name="scale" size={22} />
              </div>
              <span
                className="text-xl lg:text-2xl font-medium italic text-[#1a2b4c] dark:text-[#e2a85d] tracking-tight"
                style={{ fontFamily: "'Libre Bodoni', serif", fontWeight: 500, fontStyle: 'italic', fontVariationSettings: "'wght' 500" }}
              >
                LexDiff
              </span>
            </button>

            {/* Actions */}
            <div className="flex items-center gap-2 lg:gap-4">
              {hasStarted && !isAnalyzing && (
                <Button variant="outline" size="sm" onClick={handleNewAnalysis} className="h-8 text-xs border-gray-200 dark:border-gray-700">
                  새 분석
                </Button>
              )}
              <ThemeToggle />
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
              <Icon name="file-search" size={20} className="text-[#d4af37] dark:text-[#e2a85d]" />
              <h2
                className="text-lg sm:text-xl font-bold text-[#1a2b4c] dark:text-white"
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
                    <span className="text-sm font-bold text-[#1a2b4c] dark:text-[#e2a85d] tabular-nums">{Math.round(progress)}%</span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2 mb-4">
                    <div
                      className="bg-gradient-to-r from-[#1a2b4c] to-[#d4af37] dark:from-[#e2a85d] dark:to-[#d4af37] h-2 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${progress}%` }}
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
                      <Icon name="loader" size={15} className="text-[#d4af37] animate-spin shrink-0" />
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

      {/* 푸터 — SearchView와 동일 스타일 */}
      <footer className="bg-[#f8f9fa] dark:bg-[#080b0f] text-gray-600 dark:text-gray-400 py-12 border-t border-gray-200 dark:border-gray-800">
        <div className="container mx-auto max-w-7xl px-6 lg:px-8">
          <div className="pb-8 border-b border-gray-200 dark:border-gray-700/50 space-y-5">
            <div className="flex items-center justify-center gap-2">
              <Icon name="scale" size={24} className="text-[#1a2b4c] dark:text-[#e2a85d]" />
              <span
                className="text-xl font-medium italic text-[#1a2b4c] dark:text-white tracking-tight"
                style={{ fontFamily: "'Libre Bodoni', serif", fontWeight: 500, fontStyle: 'italic', fontVariationSettings: "'wght' 500" }}
              >
                LexDiff
              </span>
            </div>
            {lawStats && (
              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] font-medium">
                {lawStats.constitution > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Icon name="shield" size={13} className="text-[#d4af37] dark:text-[#e2a85d]" />
                    <span className="text-gray-600 dark:text-gray-400">헌법 <span className="tabular-nums"><AnimatedNumber value={lawStats.constitution} delay={0} /></span></span>
                  </span>
                )}
                {lawStats.statutes > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Icon name="scale" size={13} className="text-[#d4af37] dark:text-[#e2a85d]" />
                    <span className="text-gray-600 dark:text-gray-400">법률 <span className="tabular-nums"><AnimatedNumber value={lawStats.statutes} delay={100} /></span></span>
                  </span>
                )}
                {lawStats.delegated > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Icon name="file-text" size={13} className="text-[#d4af37] dark:text-[#e2a85d]" />
                    <span className="text-gray-600 dark:text-gray-400">위임법령 <span className="tabular-nums"><AnimatedNumber value={lawStats.delegated} delay={200} /></span></span>
                  </span>
                )}
                {lawStats.adminRules > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Icon name="clipboard-check" size={13} className="text-[#d4af37] dark:text-[#e2a85d]" />
                    <span className="text-gray-600 dark:text-gray-400">행정규칙 <span className="tabular-nums"><AnimatedNumber value={lawStats.adminRules} delay={300} /></span></span>
                  </span>
                )}
                {lawStats.ordinances > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Icon name="landmark" size={13} className="text-[#d4af37] dark:text-[#e2a85d]" />
                    <span className="text-gray-600 dark:text-gray-400">자치법규 <span className="tabular-nums"><AnimatedNumber value={lawStats.ordinances} delay={400} /></span></span>
                  </span>
                )}
                {lawStats.precedents > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Icon name="gavel" size={13} className="text-[#d4af37] dark:text-[#e2a85d]" />
                    <span className="text-gray-600 dark:text-gray-400">판례 <span className="tabular-nums"><AnimatedNumber value={lawStats.precedents} delay={500} /></span></span>
                  </span>
                )}
              </div>
            )}
            {lawStats?.asOf && (
              <p className="text-center text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">{lawStats.asOf} 기준 · 법제처</p>
            )}
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 mt-8 text-xs text-gray-500">
            <div className="flex gap-4">
              <span>Built with 법제처 Open API</span>
            </div>
            <p>
              © 2025–2026 Chris ryu. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

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
    <span className="text-xs text-[#d4af37] dark:text-[#e2a85d] tabular-nums shrink-0">
      {elapsed.toFixed(1)}초
    </span>
  )
}
