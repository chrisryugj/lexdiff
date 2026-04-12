"use client"

import { useEffect, useState, useRef, useCallback, useMemo, memo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import type { OldNewComparison } from "@/lib/law-types"
import { parseOldNewXML, highlightDifferences } from "@/lib/oldnew-parser"
import { parseArticleHistoryXML, formatDate } from "@/lib/revision-parser"
import type { RevisionHistoryItem } from "@/lib/law-types"
import { debugLogger } from "@/lib/debug-logger"
import { sanitizeForRender } from "@/lib/sanitize-html-render"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface ComparisonModalProps {
  isOpen: boolean
  onClose: () => void
  lawTitle: string
  lawId?: string
  mst?: string
  targetJo?: string
}

export const ComparisonModal = memo(function ComparisonModal({ isOpen, onClose, lawTitle, lawId, mst, targetJo }: ComparisonModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [comparison, setComparison] = useState<OldNewComparison | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncScroll, setSyncScroll] = useState(true)
  const [fontSize, setFontSize] = useState(15)
  const [articleHistory, setArticleHistory] = useState<RevisionHistoryItem[]>([])
  const [revisionStack, setRevisionStack] = useState<Array<{ date?: string; number?: string }>>([])
  const [currentRevisionIndex, setCurrentRevisionIndex] = useState(0)
  const [showRevisionHistory, setShowRevisionHistory] = useState(true)

  const oldScrollRef = useRef<HTMLDivElement>(null)
  const newScrollRef = useRef<HTMLDivElement>(null)
  const isScrollingRef = useRef(false)

  const loadRevisionHistory = useCallback(async () => {
    // targetJo가 없으면 조문별 개정이력을 불러올 수 없음
    if (!targetJo) {
      setArticleHistory([])
      return
    }

    try {
      const params = new URLSearchParams()
      if (lawId) {
        params.append("lawId", lawId)
      } else if (mst) {
        params.append("mst", mst)
      }
      params.append("jo", targetJo)

      debugLogger.info("조문별 개정이력 조회 시작", { lawTitle, lawId, mst, targetJo })

      const response = await fetch(`/api/article-history?${params.toString()}`)

      if (!response.ok) {
        debugLogger.error('[ComparisonModal] 조문별 개정이력 조회 실패:', response.status)
        setArticleHistory([])
        return
      }

      const xmlText = await response.text()
      const history = parseArticleHistoryXML(xmlText)

      setArticleHistory(history)
      debugLogger.success("조문별 개정이력 조회 완료", { count: history.length, history })
    } catch (err) {
      debugLogger.error('[ComparisonModal] 조문별 개정이력 조회 오류:', err)
      setArticleHistory([])
    }
  }, [lawId, mst, targetJo, lawTitle])

  const abortRef = useRef<AbortController | null>(null)

  const loadComparison = useCallback(async (revisionDate?: string, revisionNumber?: string, depth = 0, signal?: AbortSignal) => {
    if (depth >= 5) {
      setError("비교 데이터를 찾을 수 없습니다. 적절한 개정 버전이 없습니다.")
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (lawId) {
        params.append("lawId", lawId)
      } else if (mst) {
        params.append("mst", mst)
      }

      if (revisionDate) {
        params.append("ld", revisionDate)
      }
      if (revisionNumber) {
        params.append("ln", revisionNumber)
      }

      debugLogger.info("신·구법 비교 로드 시작", { lawTitle, lawId, mst, targetJo, revisionDate, revisionNumber })

      const response = await fetch(`/api/oldnew?${params.toString()}`, { signal })

      if (!response.ok) {
        throw new Error("신·구법 대조 조회 실패")
      }

      const xmlText = await response.text()
      if (signal?.aborted) return
      const comparisonData = parseOldNewXML(xmlText)

      const today = new Date()
      const todayStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`

      if (comparisonData.newVersion.effectiveDate && comparisonData.newVersion.effectiveDate > todayStr) {
        await loadComparison(comparisonData.oldVersion.promulgationDate, comparisonData.oldVersion.promulgationNumber, depth + 1, signal)
        return
      }

      if (
        comparisonData.oldVersion.promulgationDate &&
        comparisonData.newVersion.promulgationDate &&
        comparisonData.oldVersion.promulgationDate === comparisonData.newVersion.promulgationDate
      ) {
        await loadComparison(comparisonData.oldVersion.promulgationDate, comparisonData.oldVersion.promulgationNumber, depth + 1, signal)
        return
      }

      if (
        comparisonData.oldVersion.effectiveDate &&
        comparisonData.newVersion.effectiveDate &&
        comparisonData.oldVersion.effectiveDate > comparisonData.newVersion.effectiveDate
      ) {
        await loadComparison(comparisonData.oldVersion.promulgationDate, comparisonData.oldVersion.promulgationNumber, depth + 1, signal)
        return
      }

      if (signal?.aborted) return
      setComparison(comparisonData)
      debugLogger.success("신·구법 비교 로드 완료", { changeCount: comparisonData.changes.length })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const errorMsg = err instanceof Error ? err.message : "알 수 없는 오류"
      setError(errorMsg)
      debugLogger.error("신·구법 비교 로드 실패", err)
    } finally {
      if (!signal?.aborted) setIsLoading(false)
    }
  }, [lawId, mst, lawTitle, targetJo])

  useEffect(() => {
    if (isOpen && (lawId || mst)) {
      // 이전 요청 취소 + 상태 초기화
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setComparison(null)
      setError(null)
      setArticleHistory([])
      setRevisionStack([{ date: undefined, number: undefined }])
      setCurrentRevisionIndex(0)
      loadRevisionHistory()
      loadComparison(undefined, undefined, 0, controller.signal)

      return () => { controller.abort() }
    }
  }, [isOpen, lawId, mst, loadRevisionHistory, loadComparison])

  // 접근성: 모달 열릴 때 첫 번째 포커스 가능 요소로 포커스 이동
  useEffect(() => {
    if (!isOpen) return

    const timer = setTimeout(() => {
      // F6: open 상태 + topmost 다이얼로그 선택
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"]')
      const dialog = dialogs[dialogs.length - 1]
      if (dialog) {
        const firstFocusable = dialog.querySelector<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        firstFocusable?.focus()
      }
    }, 150)

    return () => clearTimeout(timer)
  }, [isOpen])


  useEffect(() => {
    if (comparison && targetJo && oldScrollRef.current && newScrollRef.current) {
      // P2-LV-7: setTimeout cleanup 추가, P1-LV-12: scrollIntoView → scrollTop 직접 조작
      const t = setTimeout(() => {
        const targetArticleNum = Number.parseInt(targetJo.substring(0, 4), 10)
        const targetText = `제${targetArticleNum}조`

        const oldDiv = oldScrollRef.current
        const newDiv = newScrollRef.current

        if (oldDiv && newDiv) {
          const findArticleElement = (container: HTMLElement): HTMLElement | null => {
            const byDataJo = container.querySelector(`[data-jo="${targetJo}"]`) as HTMLElement | null
            if (byDataJo) return byDataJo
            const headings = container.querySelectorAll('h3, h4, strong, b, .article-title')
            for (const el of headings) {
              if (el.textContent?.includes(targetText)) return el as HTMLElement
            }
            return null
          }

          // scrollIntoView는 모든 스크롤 조상에 영향 → iOS body 점프 발생.
          // getBoundingClientRect 기반 좌표 — offsetParent 차이를 우회.
          const scrollContainerToElement = (container: HTMLElement, target: HTMLElement) => {
            const containerRect = container.getBoundingClientRect()
            const targetRect = target.getBoundingClientRect()
            const top = targetRect.top - containerRect.top + container.scrollTop
            container.scrollTo({ top, behavior: 'smooth' })
          }

          const oldTarget = findArticleElement(oldDiv)
          if (oldTarget) {
            scrollContainerToElement(oldDiv, oldTarget)
            const newTarget = findArticleElement(newDiv)
            if (newTarget) scrollContainerToElement(newDiv, newTarget)
          }
        }
      }, 300)
      return () => clearTimeout(t)
    }
  }, [comparison, targetJo])

  const handleScroll = useCallback((source: "old" | "new") => {
    if (!syncScroll || isScrollingRef.current) return

    isScrollingRef.current = true

    const sourceRef = source === "old" ? oldScrollRef : newScrollRef
    const targetRef = source === "old" ? newScrollRef : oldScrollRef

    if (sourceRef.current && targetRef.current) {
      // 비율 기반 동기 스크롤 (두 패널 높이가 달라도 정확히 동기화)
      const sourceEl = sourceRef.current
      const targetEl = targetRef.current
      const sourceMaxScroll = sourceEl.scrollHeight - sourceEl.clientHeight
      const targetMaxScroll = targetEl.scrollHeight - targetEl.clientHeight

      if (sourceMaxScroll > 0 && targetMaxScroll > 0) {
        const scrollRatio = sourceEl.scrollTop / sourceMaxScroll
        targetEl.scrollTop = scrollRatio * targetMaxScroll
      } else {
        targetEl.scrollTop = sourceEl.scrollTop
      }
    }

    setTimeout(() => {
      isScrollingRef.current = false
    }, 50)
  }, [syncScroll])

  const increaseFontSize = useCallback(() => setFontSize(prev => Math.min(prev + 1, 28)), [])
  const decreaseFontSize = useCallback(() => setFontSize(prev => Math.max(prev - 1, 12)), [])

  const goToPreviousRevision = () => {
    if (!comparison?.oldVersion.promulgationDate) return
    if (comparison.oldVersion.promulgationDate === comparison.newVersion.promulgationDate) return

    const oldDate = comparison.oldVersion.promulgationDate
    const oldNumber = comparison.oldVersion.promulgationNumber

    // P2-LV-11: 표준 history stack 패턴 — 현재 위치 이후를 잘라내고 새 항목 push
    const next = { date: oldDate, number: oldNumber }
    const newStack = revisionStack.slice(0, currentRevisionIndex + 1).concat(next)
    setRevisionStack(newStack)
    setCurrentRevisionIndex(currentRevisionIndex + 1)

    loadComparison(oldDate, oldNumber)
  }

  const goToNextRevision = () => {
    if (currentRevisionIndex <= 0) return

    const newIndex = currentRevisionIndex - 1
    setCurrentRevisionIndex(newIndex)

    const revision = revisionStack[newIndex]
    loadComparison(revision.date, revision.number)
  }

  const handleRevisionSelect = (revision: RevisionHistoryItem) => {
    // 조문별 개정이력은 날짜 정보만 있으므로 해당 날짜의 버전을 로드
    const revisionDate = revision.date.replace(/-/g, '')
    // P2-LV-11: revisionStack/currentRevisionIndex를 새 선택 위치로 갱신
    const next = { date: revisionDate, number: undefined }
    setRevisionStack([{ date: undefined, number: undefined }, next])
    setCurrentRevisionIndex(1)
    loadComparison(revisionDate, undefined)
    // 사이드바 열린 상태 유지 (닫지 않음)
  }

  const canGoToPrevious =
    comparison?.oldVersion.promulgationDate !== undefined &&
    comparison?.oldVersion.promulgationDate !== comparison?.newVersion.promulgationDate
  const canGoToNext = currentRevisionIndex > 0

  // 차이 강조 처리 메모이제이션 (비용이 높은 연산)
  const { oldHighlighted, newHighlighted } = useMemo(() => {
    if (!comparison) {
      return { oldHighlighted: "", newHighlighted: "" }
    }
    return highlightDifferences(comparison.oldVersion.content, comparison.newVersion.content)
  }, [comparison])

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-[100vw] sm:max-w-[950px] h-[65vh] p-0 flex flex-col border-primary/20 shadow-2xl shadow-primary/10">
        <DialogHeader className="px-3 sm:px-6 pt-3 sm:pt-6 pb-0 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <DialogTitle className="flex items-center gap-2 text-lg sm:text-2xl font-bold text-foreground mb-2">
                <Icon name="git-compare" size={24} className="text-primary flex-shrink-0" />
                신·구법 대조표
              </DialogTitle>
              <DialogDescription className="text-sm sm:text-base font-semibold text-muted-foreground truncate pl-[5px]">
                {lawTitle}
              </DialogDescription>
            </div>
          </div>

          {comparison && (
            <div className="flex flex-wrap items-center gap-1 mt-1">
              {comparison.meta.promulgation?.date && (
                <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 py-0">
                  <Icon name="calendar" size={12} className="mr-0.5 sm:mr-1" />
                  {formatDate(comparison.meta.promulgation.date)}
                </Badge>
              )}
              {comparison.meta.revisionType && (
                <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5 py-0">
                  {comparison.meta.revisionType}
                </Badge>
              )}
              <Badge variant="default" className="text-[10px] sm:text-xs px-1.5 py-0">
                {comparison.changes.length}개 변경
              </Badge>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1 sm:gap-2 mt-2">
            <div className="flex items-center gap-0 border border-border rounded-md">
              <Button
                variant="ghost"
                size="sm"
                onClick={goToPreviousRevision}
                disabled={!canGoToPrevious || isLoading}
                className="text-[10px] sm:text-xs h-7 sm:h-8 px-2 rounded-r-none border-r border-border"
              >
                <Icon name="chevron-left" size={12} />
                <span className="hidden sm:inline ml-1">이전</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={goToNextRevision}
                disabled={!canGoToNext || isLoading}
                className="text-[10px] sm:text-xs h-7 sm:h-8 px-2 rounded-l-none"
              >
                <span className="hidden sm:inline mr-1">다음</span>
                <Icon name="chevron-right" size={12} />
              </Button>
            </div>

            <div className="hidden sm:block">
              <Button
                variant={showRevisionHistory ? "default" : "outline"}
                size="sm"
                onClick={() => setShowRevisionHistory(!showRevisionHistory)}
                className="text-xs h-8"
                disabled={articleHistory.length === 0}
              >
                <Icon name="history" size={12} className="mr-1" />
                개정이력 ({articleHistory.length})
              </Button>
            </div>

            <div className="sm:hidden flex-1 min-w-[120px]">
              <Select
                value=""
                onValueChange={(value) => {
                  const revision = articleHistory[Number.parseInt(value)]
                  if (revision) handleRevisionSelect(revision)
                }}
                disabled={articleHistory.length === 0}
              >
                <SelectTrigger className="h-7 text-[10px] w-full">
                  <SelectValue placeholder={`개정이력 (${articleHistory.length})`} />
                </SelectTrigger>
                <SelectContent>
                  {articleHistory.map((revision, index) => (
                    <SelectItem
                      key={`${revision.date}-${index}`}
                      value={String(index)}
                      className="text-xs"
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{revision.date}</span>
                          <span className="text-[10px] text-muted-foreground">{revision.type}</span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant={syncScroll ? "default" : "outline"}
              size="sm"
              onClick={() => setSyncScroll(!syncScroll)}
              className="text-[10px] sm:text-xs h-7 sm:h-8 px-2"
            >
              <Icon name="arrow-left-right" size={12} />
              <span className="hidden sm:inline ml-1">{syncScroll ? "동기" : "비동기"}</span>
            </Button>

            <div className="flex items-center gap-0 border border-border rounded-md">
              <Button
                variant="ghost"
                size="sm"
                onClick={decreaseFontSize}
                disabled={fontSize <= 12}
                className="text-[10px] sm:text-xs h-7 sm:h-8 px-2 rounded-r-none border-r border-border"
              >
                <Icon name="zoom-out" size={12} />
              </Button>
              <span className="text-xs text-muted-foreground px-2 min-w-[30px] text-center">{fontSize}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={increaseFontSize}
                disabled={fontSize >= 28}
                className="text-[10px] sm:text-xs h-7 sm:h-8 px-2 rounded-l-none border-l border-border"
              >
                <Icon name="zoom-in" size={12} />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden flex">
          {showRevisionHistory && (
            <div className="hidden sm:flex w-80 border-r border-border flex-col overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between flex-shrink-0">
                <div>
                  <h3 className="font-semibold text-sm text-foreground mb-1">개정 이력</h3>
                  <p className="text-xs text-muted-foreground">개정 버전을 선택하여 비교하세요</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowRevisionHistory(false)} className="h-6 w-6 p-0">
                  <Icon name="x" size={16} />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="p-2 space-y-1">
                  {articleHistory.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <p>개정 이력이 없습니다</p>
                      <p className="text-xs mt-2">이 조문은 제정 이후 개정되지 않았습니다</p>
                    </div>
                  ) : (
                    // 최근 목록이 위로 오도록 reverse
                    [...articleHistory].reverse().map((revision, index) => {
                      // 현재 비교 중인 버전과 일치하는지 확인
                      const revisionDateFormatted = revision.date.replace(/-/g, '')
                      const isCurrentNew = comparison?.newVersion.promulgationDate === revisionDateFormatted
                      const isCurrentOld = comparison?.oldVersion.promulgationDate === revisionDateFormatted
                      const isCurrent = isCurrentNew || isCurrentOld

                      return (
                        <button
                          key={`${revision.date}-${index}`}
                          onClick={() => handleRevisionSelect(revision)}
                          className={`w-full text-left p-3 rounded-md border transition-all ${
                            isCurrent
                              ? 'bg-primary/10 border-primary/40 shadow-md'
                              : 'bg-card hover:bg-secondary border-border hover:border-primary/20'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={isCurrent ? "default" : "outline"}
                                className="text-xs"
                              >
                                {revision.type}
                              </Badge>
                              {isCurrentNew && (
                                <span className="text-[10px] font-semibold text-success">신법</span>
                              )}
                              {isCurrentOld && (
                                <span className="text-[10px] font-semibold text-destructive">구법</span>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">#{index + 1}</span>
                          </div>
                          <div className="text-xs space-y-1">
                            <div className={`font-medium ${isCurrent ? 'text-foreground' : ''}`}>
                              {revision.date}
                            </div>
                            {revision.description && (
                              <div className="text-muted-foreground text-[11px]">{revision.description}</div>
                            )}
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Icon name="loader" size={32} className="animate-spin text-primary mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground">신·구법 대조표를 불러오는 중...</p>
                </div>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md px-4">
                  <p className="text-sm text-destructive mb-4">{error}</p>
                  <Button onClick={() => loadComparison()} variant="outline" size="sm">
                    다시 시도
                  </Button>
                </div>
              </div>
            ) : comparison ? (
              <div className="flex flex-col sm:grid sm:grid-cols-2 gap-0 h-full">
                <div className="border-b sm:border-b-0 sm:border-r border-border flex flex-col min-h-0 h-1/2 sm:h-full bg-gradient-to-b from-rose-500/5 to-transparent">
                  <div className="bg-gradient-to-r from-rose-500/15 via-rose-500/10 to-rose-500/5 px-3 sm:px-4 py-2 sm:py-3 border-b-2 border-rose-500/20 shrink-0">
                    <h3 className="font-bold text-xs sm:text-base text-foreground flex items-center gap-2 sm:gap-3">
                      <Icon name="scroll-text" size={20} className="text-rose-500" />
                      <span className="tracking-tight">구법</span>
                      <span className="text-[10px] sm:text-xs text-muted-foreground font-normal">
                        {comparison.oldVersion.effectiveDate ? formatDate(comparison.oldVersion.effectiveDate) : "이전 버전"}
                      </span>
                    </h3>
                  </div>
                  <div
                    ref={oldScrollRef}
                    onScroll={() => handleScroll("old")}
                    className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-6"
                  >
                    <div
                      className="leading-relaxed max-w-none text-foreground"
                      style={{ fontSize: `${fontSize}px`, fontFamily: 'Pretendard, sans-serif' }}
                      dangerouslySetInnerHTML={{ __html: sanitizeForRender(oldHighlighted || "구법 내용이 없습니다.") }}
                    />
                  </div>
                </div>

                <div className="flex flex-col min-h-0 h-1/2 sm:h-full bg-gradient-to-b from-emerald-500/5 to-transparent">
                  <div className="bg-gradient-to-r from-emerald-500/15 via-emerald-500/10 to-emerald-500/5 px-3 sm:px-4 py-2 sm:py-3 border-b-2 border-emerald-500/20 shrink-0">
                    <h3 className="font-bold text-xs sm:text-base text-foreground flex items-center gap-2 sm:gap-3">
                      <Icon name="sparkles" size={20} className="text-emerald-500" />
                      <span className="tracking-tight">신법</span>
                      <span className="text-[10px] sm:text-xs text-muted-foreground font-normal">
                        {comparison.newVersion.effectiveDate ? formatDate(comparison.newVersion.effectiveDate) : "현행 버전"}
                      </span>
                    </h3>
                  </div>
                  <div
                    ref={newScrollRef}
                    onScroll={() => handleScroll("new")}
                    className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-6"
                  >
                    <div
                      className="leading-relaxed max-w-none text-foreground"
                      style={{ fontSize: `${fontSize}px`, fontFamily: 'Pretendard, sans-serif' }}
                      dangerouslySetInnerHTML={{ __html: sanitizeForRender(newHighlighted || "신법 내용이 없습니다.") }}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {comparison && (
          <div className="px-2 sm:px-6 py-2 sm:py-3 border-t border-border bg-card/30 shrink-0">
            <div className="flex items-center justify-center gap-4 sm:gap-8 text-[10px] sm:text-xs">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 sm:w-5 sm:h-5 rounded"
                  style={{
                    background: "linear-gradient(to right, rgba(52, 211, 153, 0.15), rgba(52, 211, 153, 0.08))",
                    borderLeft: "2px solid rgba(16, 185, 129, 0.4)"
                  }}
                />
                <span className="text-muted-foreground font-medium">신법 추가</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 sm:w-5 sm:h-5 rounded"
                  style={{
                    background: "linear-gradient(to right, rgba(251, 113, 133, 0.15), rgba(251, 113, 133, 0.08))",
                    borderLeft: "2px solid rgba(244, 63, 94, 0.4)"
                  }}
                />
                <span className="text-muted-foreground font-medium">구법 삭제</span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
})

ComparisonModal.displayName = 'ComparisonModal'
