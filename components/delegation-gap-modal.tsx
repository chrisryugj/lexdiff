"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import * as VisuallyHidden from "@radix-ui/react-visually-hidden"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { LawMeta, LawArticle, ThreeTierArticle } from "@/lib/law-types"
import { parseLawJSON } from "@/lib/law-json-parser"
import { extractClauses, crossCheck, buildAnalysis, getCachedAnalysis } from "@/lib/delegation-gap/analyzer"
import type { DelegationGapAnalysis, DelegationGapStep, DelegationGapResult } from "@/lib/delegation-gap/types"
import { debugLogger } from "@/lib/debug-logger"

// ── Props ───────────────────────────────────────────────────
interface DelegationGapModalProps {
  isOpen: boolean
  onClose: () => void
  meta: LawMeta
}

// ── 진행 단계 라벨 ──────────────────────────────────────────
const STEP_LABELS: Record<DelegationGapStep, string> = {
  scanning: '조문 스캔',
  extracting: '위임 추출',
  crosschecking: '크로스체크',
  done: '완료',
  error: '오류',
}

// ── 상태 배지 ───────────────────────────────────────────────
function StatusBadge({ status }: { status: DelegationGapResult['status'] }) {
  switch (status) {
    case 'missing':
      return (
        <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30 hover:bg-red-500/15 text-xs">
          <Icon name="alert-triangle" size={12} className="mr-1" />
          미비
        </Badge>
      )
    case 'partial':
      return (
        <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/15 text-xs">
          <Icon name="alert-circle" size={12} className="mr-1" />
          부분 미비
        </Badge>
      )
    case 'fulfilled':
      return (
        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/15 text-xs">
          <Icon name="check-circle" size={12} className="mr-1" />
          정상
        </Badge>
      )
  }
}

// ── 컴포넌트 ────────────────────────────────────────────────
export function DelegationGapModal({ isOpen, onClose, meta }: DelegationGapModalProps) {
  const [step, setStep] = useState<DelegationGapStep>('scanning')
  const [analysis, setAnalysis] = useState<DelegationGapAnalysis | null>(null)
  const [showOnlyGaps, setShowOnlyGaps] = useState(true)
  const [extractedCount, setExtractedCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const runAnalysis = useCallback(async (skipCache = false) => {
    debugLogger.info('[DelegationGap] runAnalysis 시작', { mst: meta.mst, lawId: meta.lawId, lawTitle: meta.lawTitle, skipCache })
    if (!meta.mst && !meta.lawId) {
      debugLogger.error('[DelegationGap] 법령 식별자 없음', { meta })
      setError('법령 식별자(mst/lawId)가 없어 분석할 수 없습니다. 법령을 다시 선택해 주세요.')
      setStep('error')
      return
    }

    // 캐시 체크
    const cached = !skipCache && meta.mst ? getCachedAnalysis(meta.mst) : null
    if (cached) {
      debugLogger.info('[DelegationGap] 캐시 HIT', { totalClauses: cached.totalClauses })
      setAnalysis(cached)
      setExtractedCount(cached.totalClauses)
      setStep('done')
      return
    }

    // P1-LV-11: 이전 컨트롤러 abort 후 새로 생성
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal

    try {
      // Step 1: 법률 전문 조회
      setStep('scanning')
      const eflawParams = new URLSearchParams()
      if (meta.lawId) eflawParams.set('lawId', meta.lawId)
      if (meta.mst) eflawParams.set('mst', meta.mst)

      debugLogger.info('[DelegationGap] /api/eflaw 호출', { params: eflawParams.toString() })
      const eflawRes = await fetch(`/api/eflaw?${eflawParams}`, { signal })
      if (!eflawRes.ok) throw new Error('법률 전문 조회 실패')
      const eflawData = await eflawRes.json()
      const lawData = parseLawJSON(eflawData)
      const articles: LawArticle[] = lawData.articles
      debugLogger.info('[DelegationGap] eflaw 결과', { articleCount: articles.length })

      if (signal.aborted) {
        debugLogger.warning('[DelegationGap] aborted after eflaw')
        return
      }

      // Step 2: 위임 패턴 추출
      setStep('extracting')
      const clauses = extractClauses(articles)
      setExtractedCount(clauses.length)
      debugLogger.info('[DelegationGap] extractClauses 완료', { clauseCount: clauses.length })

      if (clauses.length === 0) {
        setAnalysis(buildAnalysis(
          meta.lawTitle,
          meta.lawId || '',
          meta.mst || '',
          [],
        ))
        setStep('done')
        return
      }

      if (signal.aborted) return

      // Step 3: 3단 비교 데이터 조회 + 크로스체크
      setStep('crosschecking')
      const ttParams = new URLSearchParams()
      if (meta.mst) ttParams.set('mst', meta.mst)
      else if (meta.lawId) ttParams.set('lawId', meta.lawId)

      debugLogger.info('[DelegationGap] /api/three-tier 호출', { params: ttParams.toString() })
      const ttRes = await fetch(`/api/three-tier?${ttParams}`, { signal })
      if (!ttRes.ok) throw new Error('위임법령 데이터 조회 실패')
      const ttData = await ttRes.json()
      const threeTierArticles: ThreeTierArticle[] = ttData.delegation?.articles || []
      debugLogger.info('[DelegationGap] three-tier 결과', { articleCount: threeTierArticles.length })

      if (signal.aborted) {
        debugLogger.warning('[DelegationGap] aborted after three-tier')
        return
      }

      // Step 4: 크로스체크 + 결과 생성
      const results = crossCheck(clauses, threeTierArticles)
      const analysisResult = buildAnalysis(
        meta.lawTitle,
        meta.lawId || '',
        meta.mst || '',
        results,
      )

      debugLogger.success('[DelegationGap] 분석 완료', { totalClauses: analysisResult.totalClauses, missing: analysisResult.missingCount, partial: analysisResult.partialCount })
      setAnalysis(analysisResult)
      setStep('done')
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        debugLogger.warning('[DelegationGap] AbortError (fetch 취소됨)')
        return
      }
      debugLogger.error('[DelegationGap] 분석 실패', err)
      setError(err instanceof Error ? err.message : String(err))
      setStep('error')
    }
    // P1-LV-10: meta 객체 전체가 아니라 안정적인 식별자만 deps로
  }, [meta.lawId, meta.mst, meta.lawTitle])

  useEffect(() => {
    debugLogger.info('[DelegationGap] useEffect', { isOpen, mst: meta.mst, lawId: meta.lawId })
    if (!isOpen) {
      abortRef.current?.abort()
      return
    }
    setStep('scanning')
    setAnalysis(null)
    setError(null)
    setExtractedCount(0)
    setShowOnlyGaps(true)
    runAnalysis()
  }, [isOpen, runAnalysis, meta.mst, meta.lawId])

  const filteredResults = analysis?.results.filter(
    r => !showOnlyGaps || r.status !== 'fulfilled'
  ) || []

  const handleExportCsv = () => {
    if (!analysis) return
    const rows = [
      ['조문', '항', '위임 문구', '위임 대상', '하위법령', '상태', '비고'],
      ...analysis.results.map(r => [
        r.clause.joDisplay,
        r.clause.paragraph || '',
        r.clause.rawText,
        r.clause.targetType,
        r.matchedDelegations.map(d => `${d.joNum || ''} ${d.title || ''}`).join('; ') || '없음',
        r.status === 'fulfilled' ? '정상' : r.status === 'missing' ? '미비' : '부분 미비',
        r.note || '',
      ]),
    ]
    const csv = rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const bom = '\uFEFF'
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `위임미비_${meta.lawTitle}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="w-full max-w-[100vw] sm:max-w-[750px] h-[85vh] sm:h-[720px] max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden border-primary/20 shadow-2xl shadow-primary/10"
      >
        <VisuallyHidden.Root>
          <DialogTitle>위임입법 미비 탐지</DialogTitle>
          <DialogDescription>법령 본문에서 위임 조항을 추출하고 시행령·시행규칙·행정규칙과의 매칭을 분석합니다.</DialogDescription>
        </VisuallyHidden.Root>
        {/* ── Header ── */}
        <div className="border-b border-border bg-muted/30 px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Icon name="file-search" size={18} className="text-brand-navy dark:text-brand-gold shrink-0" />
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">위임입법 미비 탐지 <span className="text-[10px] font-normal text-muted-foreground">· 법령 전체 분석</span></h3>
              <p className="text-xs text-muted-foreground truncate">
                {meta.lawTitle}
                {meta.promulgation?.number && ` (${meta.promulgation.number})`}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
            <Icon name="x" size={16} />
          </Button>
        </div>

        {/* ── Progress Bar ── */}
        {step !== 'done' && step !== 'error' && (
          <div className="px-4 py-2.5 border-b border-border bg-muted/10 shrink-0">
            <div className="flex items-center gap-3 text-xs">
              {(['scanning', 'extracting', 'crosschecking'] as DelegationGapStep[]).map((s, i) => {
                const isActive = s === step
                const isDone = ['scanning', 'extracting', 'crosschecking'].indexOf(step) > i
                return (
                  <div key={s} className="flex items-center gap-1.5">
                    <span className={cn(
                      "text-xs font-medium",
                      isDone && "text-emerald-600 dark:text-emerald-400",
                      isActive && "text-brand-navy dark:text-brand-gold",
                      !isDone && !isActive && "text-muted-foreground",
                    )}>
                      [{i + 1}] {STEP_LABELS[s]}
                    </span>
                    {isDone && <Icon name="check" size={12} className="text-emerald-600 dark:text-emerald-400" />}
                    {isActive && <Icon name="loader" size={12} className="animate-spin text-brand-navy dark:text-brand-gold" />}
                    {s === 'extracting' && (isDone || isActive) && extractedCount > 0 && (
                      <span className="text-muted-foreground">({extractedCount}건)</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {step === 'error' && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center space-y-3">
              <Icon name="alert-circle" size={40} className="mx-auto text-red-500" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={() => runAnalysis()}>
                <Icon name="refresh" size={14} className="mr-1" />
                다시 시도
              </Button>
            </div>
          </div>
        )}

        {/* ── Loading ── */}
        {step !== 'done' && step !== 'error' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-2">
              <Icon name="loader" size={32} className="mx-auto animate-spin text-brand-navy dark:text-brand-gold" />
              <p className="text-sm text-muted-foreground">{STEP_LABELS[step]} 중...</p>
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {step === 'done' && analysis && (
          <>
            {/* Summary Bar */}
            <div className="px-4 py-2.5 border-b border-border bg-muted/10 shrink-0">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">결과:</span>
                  <span>위임 <strong>{analysis.totalClauses}</strong>건 중</span>
                  {analysis.missingCount > 0 && (
                    <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30 hover:bg-red-500/15 text-xs">
                      미비 {analysis.missingCount}
                    </Badge>
                  )}
                  {analysis.partialCount > 0 && (
                    <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/15 text-xs">
                      부분 {analysis.partialCount}
                    </Badge>
                  )}
                  {analysis.missingCount === 0 && analysis.partialCount === 0 && (
                    <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/15 text-xs">
                      모두 정상
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant={showOnlyGaps ? "default" : "outline"}
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setShowOnlyGaps(true)}
                  >
                    미비만
                  </Button>
                  <Button
                    variant={!showOnlyGaps ? "default" : "outline"}
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setShowOnlyGaps(false)}
                  >
                    전체
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-orange-500 hover:text-orange-600 hover:bg-orange-500/10"
                    onClick={() => runAnalysis(true)}
                    title="캐시 무시 재분석"
                  >
                    <Icon name="refresh-cw" size={12} />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={handleExportCsv}
                  >
                    <Icon name="download" size={12} className="mr-1" />
                    CSV
                  </Button>
                </div>
              </div>
            </div>

            {/* Result Table */}
            <ScrollArea className="flex-1 min-h-0">
              {filteredResults.length === 0 ? (
                <div className="flex items-center justify-center h-full p-8">
                  <div className="text-center space-y-2">
                    <Icon name="check-circle" size={40} className="mx-auto text-emerald-500" />
                    <p className="text-sm font-medium">
                      {showOnlyGaps ? '미비 항목이 없습니다' : '위임 조항이 없습니다'}
                    </p>
                    {showOnlyGaps && analysis.totalClauses > 0 && (
                      <p className="text-xs text-muted-foreground">
                        전체 {analysis.totalClauses}건 모두 하위법령이 정상 제정되어 있습니다.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredResults.map((result, i) => (
                    <div
                      key={`${result.clause.jo}-${result.clause.targetType}-${i}`}
                      className={cn(
                        "px-4 py-3 hover:bg-muted/30 transition-colors",
                        result.status === 'missing' && "bg-red-500/5",
                        result.status === 'partial' && "bg-amber-500/5",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0 space-y-1.5">
                          {/* 조문 + 항 + 상태 */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm text-brand-navy dark:text-brand-gold">
                              {result.clause.joDisplay}
                              {result.clause.paragraph && <span className="ml-0.5">{result.clause.paragraph}</span>}
                            </span>
                            <Badge variant="outline" className="text-xs h-5">
                              {result.clause.targetType}
                            </Badge>
                            <StatusBadge status={result.status} />
                          </div>
                          {/* 위임 문구 */}
                          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                            {result.clause.rawText}
                          </p>
                          {/* 매칭된 하위법령 (정상인 경우) */}
                          {result.matchedDelegations.length > 0 && (
                            <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                              <Icon name="arrow-right" size={10} />
                              {result.matchedDelegations.map(d =>
                                [d.joNum, d.title].filter(Boolean).join(' ')
                              ).join(', ')}
                            </div>
                          )}
                          {/* 비고 (부분 미비 사유) */}
                          {result.note && (
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                              {result.note}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </>
        )}

        {/* ── Footer ── */}
        <div className="border-t border-border px-4 py-2.5 flex items-center justify-between shrink-0 bg-muted/10">
          <p className="text-xs text-muted-foreground">
            {step === 'done' && analysis
              ? `분석 완료: ${new Date(analysis.analyzedAt).toLocaleString('ko-KR')}`
              : '법제처 3단 비교 데이터 기반 분석'}
          </p>
          <Button variant="outline" size="sm" className="h-7" onClick={onClose}>
            닫기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
