"use client"

import { useEffect, useState, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, ArrowLeftRight, Calendar, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, History, X, ArrowRight } from "lucide-react"
import type { OldNewComparison } from "@/lib/law-types"
import { parseOldNewXML, highlightDifferences } from "@/lib/oldnew-parser"
import { parseRevisionHistoryXML, formatDate, type RevisionInfo } from "@/lib/revision-parser"
import { debugLogger } from "@/lib/debug-logger"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface ComparisonModalRedesignedProps {
  isOpen: boolean
  onClose: () => void
  lawTitle: string
  lawId?: string
  mst?: string
  targetJo?: string
}

export function ComparisonModalRedesigned({ isOpen, onClose, lawTitle, lawId, mst, targetJo }: ComparisonModalRedesignedProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [comparison, setComparison] = useState<OldNewComparison | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncScroll, setSyncScroll] = useState(true)
  const [fontSize, setFontSize] = useState<"xs" | "sm" | "base">("xs")
  const [revisionHistory, setRevisionHistory] = useState<RevisionInfo[]>([])
  const [revisionStack, setRevisionStack] = useState<Array<{ date?: string; number?: string }>>([])
  const [currentRevisionIndex, setCurrentRevisionIndex] = useState(0)
  const [showRevisionHistory, setShowRevisionHistory] = useState(false)

  const oldScrollRef = useRef<HTMLDivElement>(null)
  const newScrollRef = useRef<HTMLDivElement>(null)
  const isScrollingRef = useRef(false)

  useEffect(() => {
    if (isOpen && (lawId || mst)) {
      setRevisionStack([{ date: undefined, number: undefined }])
      setCurrentRevisionIndex(0)
      loadRevisionHistory()
      loadComparison()
    }
  }, [isOpen, lawId, mst])

  useEffect(() => {
    if (comparison && targetJo && oldScrollRef.current && newScrollRef.current) {
      setTimeout(() => {
        const targetArticleNum = Number.parseInt(targetJo.substring(0, 4), 10)
        const targetText = `제${targetArticleNum}조`

        const oldDiv = oldScrollRef.current
        const newDiv = newScrollRef.current

        if (oldDiv && newDiv) {
          const oldHtml = oldDiv.innerHTML
          const index = oldHtml.indexOf(targetText)

          if (index !== -1) {
            const totalHeight = oldDiv.scrollHeight
            const scrollRatio = index / oldHtml.length
            const scrollPosition = scrollRatio * totalHeight

            oldDiv.scrollTo({ top: scrollPosition, behavior: "smooth" })
            newDiv.scrollTo({ top: scrollPosition, behavior: "smooth" })
          }
        }
      }, 300)
    }
  }, [comparison, targetJo])

  const loadRevisionHistory = async () => {
    try {
      const params = new URLSearchParams()
      if (lawId) {
        params.append("lawId", lawId)
      } else if (mst) {
        params.append("mst", mst)
      }

      debugLogger.info("개정이력 조회 시작", { lawTitle, lawId, mst })

      const response = await fetch(`/api/revision-history?${params.toString()}`)

      if (!response.ok) {
        throw new Error("개정이력 조회 실패")
      }

      const xmlText = await response.text()
      const revisions = parseRevisionHistoryXML(xmlText)

      setRevisionHistory(revisions)
      debugLogger.success("개정이력 조회 완료", { count: revisions.length })
    } catch (err) {
      debugLogger.error("개정이력 조회 실패", err)
    }
  }

  const loadComparison = async (revisionDate?: string, revisionNumber?: string) => {
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

      const response = await fetch(`/api/oldnew?${params.toString()}`)

      if (!response.ok) {
        throw new Error("신·구법 대조 조회 실패")
      }

      const xmlText = await response.text()
      const comparisonData = parseOldNewXML(xmlText)

      const today = new Date()
      const todayStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`

      if (comparisonData.newVersion.effectiveDate && comparisonData.newVersion.effectiveDate > todayStr) {
        await loadComparison(comparisonData.oldVersion.promulgationDate, comparisonData.oldVersion.promulgationNumber)
        return
      }

      if (
        comparisonData.oldVersion.promulgationDate &&
        comparisonData.newVersion.promulgationDate &&
        comparisonData.oldVersion.promulgationDate === comparisonData.newVersion.promulgationDate
      ) {
        await loadComparison(comparisonData.oldVersion.promulgationDate, comparisonData.oldVersion.promulgationNumber)
        return
      }

      if (
        comparisonData.oldVersion.effectiveDate &&
        comparisonData.newVersion.effectiveDate &&
        comparisonData.oldVersion.effectiveDate > comparisonData.newVersion.effectiveDate
      ) {
        await loadComparison(comparisonData.oldVersion.promulgationDate, comparisonData.oldVersion.promulgationNumber)
        return
      }

      setComparison(comparisonData)
      debugLogger.success("신·구법 비교 로드 완료", { changeCount: comparisonData.changes.length })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "알 수 없는 오류"
      setError(errorMsg)
      debugLogger.error("신·구법 비교 로드 실패", err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleScroll = (source: "old" | "new") => {
    if (!syncScroll || isScrollingRef.current) return

    isScrollingRef.current = true

    const sourceRef = source === "old" ? oldScrollRef : newScrollRef
    const targetRef = source === "old" ? newScrollRef : oldScrollRef

    if (sourceRef.current && targetRef.current) {
      targetRef.current.scrollTop = sourceRef.current.scrollTop
    }

    setTimeout(() => {
      isScrollingRef.current = false
    }, 50)
  }

  const increaseFontSize = () => {
    if (fontSize === "xs") setFontSize("sm")
    else if (fontSize === "sm") setFontSize("base")
  }

  const decreaseFontSize = () => {
    if (fontSize === "base") setFontSize("sm")
    else if (fontSize === "sm") setFontSize("xs")
  }

  const getTextSizeClass = () => {
    switch (fontSize) {
      case "xs":
        return "text-xs leading-relaxed"
      case "sm":
        return "text-sm leading-relaxed"
      case "base":
        return "text-base leading-relaxed"
      default:
        return "text-xs leading-relaxed"
    }
  }

  const goToPreviousRevision = () => {
    if (!comparison?.oldVersion.promulgationDate) return
    if (comparison.oldVersion.promulgationDate === comparison.newVersion.promulgationDate) return

    const oldDate = comparison.oldVersion.promulgationDate
    const oldNumber = comparison.oldVersion.promulgationNumber

    if (currentRevisionIndex === revisionStack.length - 1) {
      setRevisionStack([...revisionStack, { date: oldDate, number: oldNumber }])
      setCurrentRevisionIndex(currentRevisionIndex + 1)
    } else {
      setCurrentRevisionIndex(currentRevisionIndex + 1)
    }

    loadComparison(oldDate, oldNumber)
  }

  const goToNextRevision = () => {
    if (currentRevisionIndex <= 0) return

    const newIndex = currentRevisionIndex - 1
    setCurrentRevisionIndex(newIndex)

    const revision = revisionStack[newIndex]
    loadComparison(revision.date, revision.number)
  }

  const handleRevisionSelect = (revision: RevisionInfo) => {
    loadComparison(revision.promulgationDate, revision.promulgationNumber)
    setShowRevisionHistory(false)
  }

  const canGoToPrevious =
    comparison?.oldVersion.promulgationDate !== undefined &&
    comparison?.oldVersion.promulgationDate !== comparison?.newVersion.promulgationDate
  const canGoToNext = currentRevisionIndex > 0

  const { oldHighlighted, newHighlighted } = comparison
    ? highlightDifferences(comparison.oldVersion.content, comparison.newVersion.content)
    : { oldHighlighted: "", newHighlighted: "" }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-[100vw] sm:max-w-[1200px] h-[95vh] p-0 flex flex-col border-none shadow-2xl">
        {/* 타임라인 컨셉 헤더 */}
        <div className="relative bg-gradient-to-r from-card via-background to-card border-b-2 border-primary/30">
          <DialogHeader className="px-3 sm:px-6 pt-3 sm:pt-6 pb-2 sm:pb-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-base sm:text-2xl font-bold text-foreground mb-1">
                  {lawTitle}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground hidden sm:block">
                  변화의 타임라인 - 과거와 현재의 대화
                </DialogDescription>
              </div>
            </div>

            {comparison && (
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <Badge variant="outline" className="text-[10px] sm:text-xs px-2 py-1 border-primary/40 bg-primary/5">
                  <Calendar className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1" />
                  {formatDate(comparison.meta.promulgation?.date || "")}
                </Badge>
                {comparison.meta.revisionType && (
                  <Badge variant="secondary" className="text-[10px] sm:text-xs px-2 py-1">
                    {comparison.meta.revisionType}
                  </Badge>
                )}
                <Badge className="text-[10px] sm:text-xs px-2 py-1 bg-accent/20 text-accent-foreground border-accent/40">
                  {comparison.changes.length}개 변경
                </Badge>
              </div>
            )}

            {/* 컨트롤 바 */}
            <div className="flex flex-wrap items-center gap-1 sm:gap-2 mt-3">
              {/* 개정이력 네비게이션 */}
              <div className="flex items-center gap-0 border border-border rounded-lg overflow-hidden bg-card/50">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToPreviousRevision}
                  disabled={!canGoToPrevious || isLoading}
                  className="text-[10px] sm:text-xs h-7 sm:h-8 px-2 rounded-none hover:bg-secondary"
                >
                  <ChevronLeft className="h-3 w-3" />
                  <span className="hidden sm:inline ml-1">이전</span>
                </Button>
                <div className="w-px h-6 bg-border" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToNextRevision}
                  disabled={!canGoToNext || isLoading}
                  className="text-[10px] sm:text-xs h-7 sm:h-8 px-2 rounded-none hover:bg-secondary"
                >
                  <span className="hidden sm:inline mr-1">다음</span>
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>

              {/* 개정이력 버튼 (Desktop) */}
              <div className="hidden sm:block">
                <Button
                  variant={showRevisionHistory ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowRevisionHistory(!showRevisionHistory)}
                  className="text-xs h-8 gap-1"
                >
                  <History className="h-3 w-3" />
                  개정이력 ({revisionHistory.length})
                </Button>
              </div>

              {/* 개정이력 셀렉트 (Mobile) */}
              <div className="sm:hidden flex-1 min-w-[120px]">
                <Select
                  value=""
                  onValueChange={(value) => {
                    const revision = revisionHistory[Number.parseInt(value)]
                    if (revision) handleRevisionSelect(revision)
                  }}
                >
                  <SelectTrigger className="h-7 text-[10px] w-full">
                    <SelectValue placeholder={`개정이력 (${revisionHistory.length})`} />
                  </SelectTrigger>
                  <SelectContent>
                    {revisionHistory.map((revision, index) => (
                      <SelectItem
                        key={`${revision.promulgationDate}-${revision.promulgationNumber}`}
                        value={String(index)}
                        className="text-xs"
                      >
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{formatDate(revision.promulgationDate)}</span>
                            <span className="text-[10px] text-muted-foreground">{revision.revisionType}</span>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 스크롤 동기화 */}
              <Button
                variant={syncScroll ? "default" : "outline"}
                size="sm"
                onClick={() => setSyncScroll(!syncScroll)}
                className="text-[10px] sm:text-xs h-7 sm:h-8 px-2 gap-1"
              >
                <ArrowLeftRight className="h-3 w-3" />
                <span className="hidden sm:inline">{syncScroll ? "동기" : "비동기"}</span>
              </Button>

              {/* 폰트 크기 조절 */}
              <div className="flex items-center gap-0 border border-border rounded-lg overflow-hidden bg-card/50">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={decreaseFontSize}
                  disabled={fontSize === "xs"}
                  className="text-[10px] sm:text-xs h-7 sm:h-8 px-2 rounded-none hover:bg-secondary"
                >
                  <ZoomOut className="h-3 w-3" />
                </Button>
                <div className="w-px h-6 bg-border" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={increaseFontSize}
                  disabled={fontSize === "base"}
                  className="text-[10px] sm:text-xs h-7 sm:h-8 px-2 rounded-none hover:bg-secondary"
                >
                  <ZoomIn className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden flex">
          {/* 개정이력 사이드바 (Desktop) */}
          {showRevisionHistory && (
            <div className="hidden sm:flex w-80 border-r border-border flex-col bg-card/30">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm text-foreground mb-1">개정 이력</h3>
                  <p className="text-xs text-muted-foreground">타임라인을 탐색하세요</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowRevisionHistory(false)} className="h-6 w-6 p-0 hover:bg-secondary">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-2">
                  {revisionHistory.map((revision, index) => (
                    <button
                      key={`${revision.promulgationDate}-${revision.promulgationNumber}`}
                      onClick={() => handleRevisionSelect(revision)}
                      className="w-full text-left p-3 rounded-lg border transition-all bg-card hover:bg-secondary hover:border-primary/50 border-border group"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <Badge variant="outline" className="text-xs group-hover:border-primary/50">
                          {revision.revisionType}
                        </Badge>
                        <span className="text-xs text-muted-foreground">#{revisionHistory.length - index}</span>
                      </div>
                      <div className="text-xs space-y-1">
                        <div className="font-semibold text-foreground">공포: {formatDate(revision.promulgationDate)}</div>
                        <div className="text-muted-foreground text-[11px]">{revision.promulgationNumber}</div>
                        {revision.effectiveDate && (
                          <div className="text-muted-foreground text-[11px]">시행: {formatDate(revision.effectiveDate)}</div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground">타임라인을 불러오는 중...</p>
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
              <div className="flex flex-col sm:grid sm:grid-cols-2 h-full relative">
                {/* 타임라인 구분선 - Desktop only */}
                <div className="hidden sm:block absolute left-1/2 top-0 bottom-0 -translate-x-1/2 z-10 pointer-events-none">
                  <div className="relative h-full">
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-primary to-transparent" />
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                      <div className="bg-card border-2 border-primary rounded-full p-2 shadow-lg">
                        <ArrowRight className="w-5 h-5 text-primary" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 구법 (Old Version) */}
                <div className="border-b sm:border-b-0 sm:border-r border-border flex flex-col min-h-0 h-1/2 sm:h-full bg-destructive/5">
                  <div className="bg-gradient-to-r from-destructive/20 to-destructive/10 px-2 sm:px-4 py-2 sm:py-3 border-b border-destructive/30 shrink-0">
                    <h3 className="font-semibold text-[11px] sm:text-sm text-foreground flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-destructive animate-pulse" />
                      구법
                      <span className="text-[10px] sm:text-xs text-muted-foreground font-normal">
                        ({comparison.oldVersion.effectiveDate ? formatDate(comparison.oldVersion.effectiveDate) : "이전"})
                      </span>
                    </h3>
                  </div>
                  <div
                    ref={oldScrollRef}
                    onScroll={() => handleScroll("old")}
                    className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-6"
                  >
                    <div
                      className={`${getTextSizeClass()} max-w-none text-foreground font-pretendard`}
                      style={{ fontFamily: 'Pretendard, sans-serif' }}
                      dangerouslySetInnerHTML={{ __html: oldHighlighted || "구법 내용이 없습니다." }}
                    />
                  </div>
                </div>

                {/* 신법 (New Version) */}
                <div className="flex flex-col min-h-0 h-1/2 sm:h-full bg-success/5">
                  <div className="bg-gradient-to-r from-success/20 to-success/10 px-2 sm:px-4 py-2 sm:py-3 border-b border-success/30 shrink-0">
                    <h3 className="font-semibold text-[11px] sm:text-sm text-foreground flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-success animate-pulse" />
                      신법
                      <span className="text-[10px] sm:text-xs text-muted-foreground font-normal">
                        ({comparison.newVersion.effectiveDate ? formatDate(comparison.newVersion.effectiveDate) : "현행"})
                      </span>
                    </h3>
                  </div>
                  <div
                    ref={newScrollRef}
                    onScroll={() => handleScroll("new")}
                    className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-6"
                  >
                    <div
                      className={`${getTextSizeClass()} max-w-none text-foreground font-pretendard`}
                      style={{ fontFamily: 'Pretendard, sans-serif' }}
                      dangerouslySetInnerHTML={{ __html: newHighlighted || "신법 내용이 없습니다." }}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* 범례 푸터 */}
        {comparison && (
          <div className="px-2 sm:px-6 py-2 sm:py-3 border-t border-border bg-card/50 shrink-0">
            <div className="flex items-center justify-center gap-6 text-[10px] sm:text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-success/30 border border-success/50" />
                <span className="text-muted-foreground">신법 추가</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-destructive/30 border border-destructive/50" />
                <span className="text-muted-foreground">구법 삭제</span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
