"use client"

import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import * as VisuallyHidden from "@radix-ui/react-visually-hidden"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { sanitizeForRender } from "@/lib/sanitize-html-render"
import type { LawMeta } from "@/lib/law-types"
import { parseOldNewXML, highlightDifferences } from "@/lib/oldnew-parser"
import {
  findVersionByDate,
  formatDateDisplay,
  type HistoryItem,
  type VersionMatch,
  TIME_MACHINE_CACHE_TTL,
} from "@/lib/time-machine/version-finder"

// ── 리비전별 신구대조 캐시 (revision mst 기준) ──────────────
interface CachedDiff {
  oldContent: string
  newContent: string
  expiresAt: number
}

function getDiffCached(revMst: string): CachedDiff | null {
  try {
    const raw = localStorage.getItem(`time-machine-diff:${revMst}`)
    if (!raw) return null
    const cached: CachedDiff = JSON.parse(raw)
    if (Date.now() > cached.expiresAt) {
      localStorage.removeItem(`time-machine-diff:${revMst}`)
      return null
    }
    return cached
  } catch { return null }
}

function setDiffCache(revMst: string, data: Omit<CachedDiff, 'expiresAt'>): void {
  try {
    localStorage.setItem(`time-machine-diff:${revMst}`, JSON.stringify({
      ...data,
      expiresAt: Date.now() + TIME_MACHINE_CACHE_TTL,
    }))
  } catch { /* ignore */ }
}

// ── Props ───────────────────────────────────────────────────
interface TimeMachineModalProps {
  isOpen: boolean
  onClose: () => void
  meta: LawMeta
}


// ── 컴포넌트 ────────────────────────────────────────────────
export const TimeMachineModal = memo(function TimeMachineModal({
  isOpen,
  onClose,
  meta,
}: TimeMachineModalProps) {
  // 날짜 입력
  const [targetDate, setTargetDate] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 결과
  const [versionMatch, setVersionMatch] = useState<VersionMatch | null>(null)
  const [oldContent, setOldContent] = useState('')
  const [newContent, setNewContent] = useState('')
  const [selectedRevision, setSelectedRevision] = useState<HistoryItem | null>(null)
  const [noRevisions, setNoRevisions] = useState(false)

  // UI 상태
  const [syncScroll, setSyncScroll] = useState(true)
  const [fontSize, setFontSize] = useState(15)
  const [showHistory, setShowHistory] = useState(false)

  // Scroll refs
  const oldScrollRef = useRef<HTMLDivElement>(null)
  const newScrollRef = useRef<HTMLDivElement>(null)
  const isScrollingRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  // 초기화
  useEffect(() => {
    if (isOpen) {
      // 기본 날짜: 1년 전
      const d = new Date()
      d.setFullYear(d.getFullYear() - 1)
      setTargetDate(d.toISOString().slice(0, 10))
      setVersionMatch(null)
      setOldContent('')
      setNewContent('')
      setSelectedRevision(null)
      setNoRevisions(false)
      setError(null)
      setShowHistory(false)
    }
    return () => { abortRef.current?.abort() }
  }, [isOpen])

  // 특정 개정의 신구대조 XML 조회
  const fetchRevisionDiff = useCallback(async (rev: HistoryItem, signal: AbortSignal) => {
    const cached = getDiffCached(rev.mst)
    if (cached) {
      setOldContent(cached.oldContent)
      setNewContent(cached.newContent)
      setSelectedRevision(rev)
      if (!cached.oldContent && !cached.newContent) {
        throw new Error(`이 개정(${rev.rrCls})은 신구대조표가 제공되지 않습니다.`)
      }
      return
    }

    const res = await fetch(`/api/oldnew?mst=${encodeURIComponent(rev.mst)}`, { signal })
    if (signal.aborted) return
    if (!res.ok) throw new Error('신·구법 대조 조회 실패')

    const xmlText = await res.text()
    if (signal.aborted) return

    const parsed = parseOldNewXML(xmlText)
    setOldContent(parsed.oldVersion.content)
    setNewContent(parsed.newVersion.content)
    setSelectedRevision(rev)
    setDiffCache(rev.mst, { oldContent: parsed.oldVersion.content, newContent: parsed.newVersion.content })

    if (!parsed.oldVersion.content && !parsed.newVersion.content) {
      throw new Error(`이 개정(${rev.rrCls})은 신구대조표가 제공되지 않습니다.`)
    }
  }, [])

  // 조회 실행
  const handleSearch = useCallback(async (overrideDate?: string) => {
    const searchDate = overrideDate || targetDate
    if (!searchDate || (!meta.mst && !meta.lawId)) return

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal

    setIsLoading(true)
    setError(null)
    setOldContent('')
    setNewContent('')
    setSelectedRevision(null)
    setNoRevisions(false)

    try {
      // Step 1: 연혁 조회 (lawId 우선 — ID 경로만 진짜 단일 법령 연혁 반환)
      const historyParam = meta.lawId
        ? `lawId=${encodeURIComponent(meta.lawId)}`
        : `lawName=${encodeURIComponent(meta.lawTitle)}`
      const historyRes = await fetch(
        `/api/law-history?${historyParam}&display=100`,
        { signal }
      )
      if (!historyRes.ok) throw new Error('연혁 조회 실패')
      const historyData = await historyRes.json()
      const histories: HistoryItem[] = historyData.histories || []

      if (signal.aborted) return
      if (histories.length === 0) {
        setError('이 법령의 연혁 정보를 찾을 수 없습니다.')
        return
      }

      // Step 2: 해당 날짜 버전 찾기
      const match = findVersionByDate(histories, searchDate, meta.mst || '')
      if (!match) {
        setError(`${searchDate} 이전에 유효한 법령 버전이 없습니다.`)
        return
      }

      setVersionMatch(match)
      setShowHistory(true)

      // Step 3: 기간 내 개정이 없으면 안내만
      if (match.betweenRevisions.length === 0) {
        setNoRevisions(true)
        return
      }

      // Step 4: 가장 최근 개정의 신구대조 기본 표시
      const latestRev = match.betweenRevisions[match.betweenRevisions.length - 1]
      await fetchRevisionDiff(latestRev, signal)
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [targetDate, meta, fetchRevisionDiff])

  // 사이드바에서 특정 개정 선택
  const handleRevisionSelect = useCallback(async (rev: HistoryItem) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal

    setIsLoading(true)
    setError(null)
    try {
      await fetchRevisionDiff(rev, signal)
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [fetchRevisionDiff])

  // Diff 하이라이트 (메모이제이션)
  const { oldHighlighted, newHighlighted } = useMemo(() => {
    if (!oldContent || !newContent) return { oldHighlighted: '', newHighlighted: '' }
    return highlightDifferences(oldContent, newContent)
  }, [oldContent, newContent])

  // Sync scroll
  const handleScroll = useCallback((source: "old" | "new") => {
    if (!syncScroll || isScrollingRef.current) return
    isScrollingRef.current = true

    const sourceRef = source === "old" ? oldScrollRef : newScrollRef
    const targetRef = source === "old" ? newScrollRef : oldScrollRef

    if (sourceRef.current && targetRef.current) {
      const srcEl = sourceRef.current
      const tgtEl = targetRef.current
      const srcMax = srcEl.scrollHeight - srcEl.clientHeight
      const tgtMax = tgtEl.scrollHeight - tgtEl.clientHeight

      if (srcMax > 0 && tgtMax > 0) {
        tgtEl.scrollTop = (srcEl.scrollTop / srcMax) * tgtMax
      } else {
        tgtEl.scrollTop = srcEl.scrollTop
      }
    }

    setTimeout(() => { isScrollingRef.current = false }, 50)
  }, [syncScroll])

  const hasResult = versionMatch && oldContent && newContent && selectedRevision

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="w-full max-w-[100vw] sm:max-w-[950px] h-[75vh] p-0 flex flex-col border-primary/20 shadow-2xl shadow-primary/10"
      >
        <VisuallyHidden.Root>
          <DialogTitle>법령 타임머신</DialogTitle>
          <DialogDescription>과거 특정 날짜의 법령 본문을 조회하고 현행과 비교합니다.</DialogDescription>
        </VisuallyHidden.Root>
        {/* ── Header ── */}
        <div className="border-b border-border bg-muted/30 px-4 py-3 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <Icon name="clock" size={18} className="text-brand-navy dark:text-brand-gold shrink-0" />
              <div className="min-w-0">
                <h3 className="font-semibold text-sm truncate">법령 타임머신</h3>
                <p className="text-xs text-muted-foreground truncate">{meta.lawTitle}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
              <Icon name="x" size={16} />
            </Button>
          </div>

          {/* 날짜 입력 + 조회 */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1 max-w-xs">
              <Icon name="calendar" size={14} className="text-muted-foreground shrink-0" />
              <Input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="h-8 text-sm"
                max={new Date().toISOString().slice(0, 10)}
              />
            </div>
            <Button
              size="sm"
              className="h-8 px-4"
              onClick={() => handleSearch()}
              disabled={isLoading || !targetDate}
            >
              {isLoading ? (
                <Icon name="loader" size={14} className="animate-spin mr-1" />
              ) : (
                <Icon name="search" size={14} className="mr-1" />
              )}
              조회
            </Button>

            {hasResult && (
              <>
                <Button
                  variant={syncScroll ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSyncScroll(!syncScroll)}
                  className="text-xs h-8 px-2 hidden sm:flex"
                >
                  <Icon name="arrow-left-right" size={12} />
                  <span className="ml-1">{syncScroll ? "동기" : "비동기"}</span>
                </Button>

                <div className="hidden sm:flex items-center gap-0 border border-border rounded-md">
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => setFontSize(v => Math.max(v - 1, 12))}
                    className="h-8 px-2 rounded-r-none border-r border-border"
                  >
                    <Icon name="zoom-out" size={12} />
                  </Button>
                  <span className="text-xs text-muted-foreground px-2 min-w-[30px] text-center">{fontSize}</span>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => setFontSize(v => Math.min(v + 1, 28))}
                    className="h-8 px-2 rounded-l-none border-l border-border"
                  >
                    <Icon name="zoom-in" size={12} />
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* 빠른 선택 템플릿 */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className="text-xs text-muted-foreground shrink-0">빠른 선택:</span>
            {[
              { label: '6개월 전', months: 6 },
              { label: '1년 전', months: 12 },
              { label: '3년 전', months: 36 },
              { label: '5년 전', months: 60 },
              { label: '10년 전', months: 120 },
            ].map(({ label, months }) => {
              const d = new Date()
              d.setMonth(d.getMonth() - months)
              const dateStr = d.toISOString().slice(0, 10)
              return (
                <Button
                  key={months}
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  disabled={isLoading}
                  onClick={() => {
                    setTargetDate(dateStr)
                    handleSearch(dateStr)
                  }}
                >
                  {label}
                </Button>
              )
            })}
          </div>

          {/* 표시 중인 개정 정보 */}
          {selectedRevision && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs">
              <Icon name="info" size={12} className="text-muted-foreground" />
              <span className="text-muted-foreground">표시 중:</span>
              <Badge variant="outline" className="text-xs h-5">
                {selectedRevision.ancNo}
              </Badge>
              <span className="text-muted-foreground">
                ({formatDateDisplay(selectedRevision.ancYd)} 공포,
                {' '}{formatDateDisplay(selectedRevision.efYd)} 시행 · {selectedRevision.rrCls})
              </span>
            </div>
          )}
        </div>

        {/* ── Content ── */}
        <div className="flex-1 min-h-0 overflow-hidden flex">
          {/* 개정 이력 사이드바 */}
          {showHistory && versionMatch && versionMatch.betweenRevisions.length > 0 && (
            <div className="hidden sm:flex w-64 border-r border-border flex-col overflow-hidden">
              <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
                <h4 className="font-semibold text-xs">
                  이 기간 개정 이력 ({versionMatch.betweenRevisions.length}건)
                </h4>
                <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)} className="h-5 w-5 p-0">
                  <Icon name="x" size={14} />
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {versionMatch.betweenRevisions.map((rev, i) => (
                    <button
                      key={`${rev.mst}-${i}`}
                      onClick={() => handleRevisionSelect(rev)}
                      className={cn(
                        "w-full text-left p-2.5 rounded-md border transition-colors cursor-pointer",
                        selectedRevision?.mst === rev.mst
                          ? "bg-primary/10 border-primary/50"
                          : "bg-card border-border hover:bg-muted/50 hover:border-primary/30"
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <Badge variant="outline" className="text-[10px] h-4">{rev.rrCls}</Badge>
                      </div>
                      <div className="text-xs">
                        <div className="font-medium">{formatDateDisplay(rev.efYd)} 시행</div>
                        <div className="text-muted-foreground text-[10px]">{rev.ancNo}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Diff 뷰 */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-2">
                  <Icon name="loader" size={32} className="animate-spin text-brand-navy dark:text-brand-gold mx-auto" />
                  <p className="text-sm text-muted-foreground">법령 텍스트 비교 중...</p>
                </div>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-3 max-w-md px-4">
                  <Icon name="alert-circle" size={40} className="mx-auto text-amber-500" />
                  <p className="text-sm text-muted-foreground">{error}</p>
                  <Button variant="outline" size="sm" onClick={() => handleSearch()}>
                    <Icon name="refresh" size={14} className="mr-1" />
                    다시 시도
                  </Button>
                </div>
              </div>
            ) : noRevisions ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-3 max-w-md px-4">
                  <Icon name="check-circle" size={40} className="mx-auto text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    {targetDate} 이후 이 법령의 개정이 없습니다.
                  </p>
                </div>
              </div>
            ) : hasResult ? (
              <div className="flex flex-col sm:grid sm:grid-cols-2 gap-0 h-full">
                {/* 구조문 (좌측) */}
                <div className="border-b sm:border-b-0 sm:border-r border-border flex flex-col min-h-0 h-1/2 sm:h-full bg-gradient-to-b from-rose-500/5 to-transparent">
                  <div className="bg-gradient-to-r from-rose-500/15 via-rose-500/10 to-rose-500/5 px-3 sm:px-4 py-2 sm:py-3 border-b-2 border-rose-500/20 shrink-0">
                    <h3 className="font-bold text-xs sm:text-base text-foreground flex items-center gap-2">
                      <Icon name="history" size={18} className="text-rose-500" />
                      <span>구조문</span>
                      <span className="text-[10px] sm:text-xs text-muted-foreground font-normal">
                        개정 전
                      </span>
                    </h3>
                  </div>
                  <div
                    ref={oldScrollRef}
                    onScroll={() => handleScroll("old")}
                    className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-6"
                  >
                    <div
                      className="leading-relaxed max-w-none text-foreground whitespace-pre-wrap"
                      style={{ fontSize: `${fontSize}px`, fontFamily: 'Pretendard, sans-serif' }}
                      dangerouslySetInnerHTML={{ __html: sanitizeForRender(oldHighlighted || "내용 없음") }}
                    />
                  </div>
                </div>

                {/* 신조문 (우측) */}
                <div className="flex flex-col min-h-0 h-1/2 sm:h-full bg-gradient-to-b from-emerald-500/5 to-transparent">
                  <div className="bg-gradient-to-r from-emerald-500/15 via-emerald-500/10 to-emerald-500/5 px-3 sm:px-4 py-2 sm:py-3 border-b-2 border-emerald-500/20 shrink-0">
                    <h3 className="font-bold text-xs sm:text-base text-foreground flex items-center gap-2">
                      <Icon name="sparkles" size={18} className="text-emerald-500" />
                      <span>신조문</span>
                      <span className="text-[10px] sm:text-xs text-muted-foreground font-normal">
                        {selectedRevision && formatDateDisplay(selectedRevision.efYd)} 시행
                      </span>
                    </h3>
                  </div>
                  <div
                    ref={newScrollRef}
                    onScroll={() => handleScroll("new")}
                    className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-6"
                  >
                    <div
                      className="leading-relaxed max-w-none text-foreground whitespace-pre-wrap"
                      style={{ fontSize: `${fontSize}px`, fontFamily: 'Pretendard, sans-serif' }}
                      dangerouslySetInnerHTML={{ __html: sanitizeForRender(newHighlighted || "내용 없음") }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* 초기 상태 — 날짜 선택 안내 */
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-3 max-w-sm px-4">
                  <Icon name="clock" size={48} className="mx-auto text-muted-foreground/40" />
                  <div>
                    <p className="text-sm font-medium mb-1">기준일을 선택하고 조회하세요</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      해당 날짜에 유효했던 법령과 현행법의 차이를 diff 하이라이트로 비교합니다.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer (diff 범례) ── */}
        {hasResult && (
          <div className="px-2 sm:px-6 py-2 border-t border-border bg-card/30 shrink-0">
            <div className="flex items-center justify-center gap-4 sm:gap-8 text-[10px] sm:text-xs">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 sm:w-5 sm:h-5 rounded"
                  style={{
                    background: "linear-gradient(to right, rgba(52, 211, 153, 0.15), rgba(52, 211, 153, 0.08))",
                    borderLeft: "2px solid rgba(16, 185, 129, 0.4)"
                  }}
                />
                <span className="text-muted-foreground font-medium">신조문 (개정 후)</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 sm:w-5 sm:h-5 rounded"
                  style={{
                    background: "linear-gradient(to right, rgba(251, 113, 133, 0.15), rgba(251, 113, 133, 0.08))",
                    borderLeft: "2px solid rgba(244, 63, 94, 0.4)"
                  }}
                />
                <span className="text-muted-foreground font-medium">구조문 (개정 전)</span>
              </div>
              {versionMatch && versionMatch.betweenRevisions.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowHistory(!showHistory)}
                  className="text-xs h-6 px-2 sm:hidden"
                >
                  <Icon name="history" size={12} className="mr-1" />
                  이력 {versionMatch.betweenRevisions.length}건
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
})

TimeMachineModal.displayName = 'TimeMachineModal'
