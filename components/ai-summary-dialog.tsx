"use client"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { debugLogger } from "@/lib/debug-logger"
import { CopyButton } from "@/components/ui/copy-button"
import { LegalMarkdownRenderer } from "@/components/legal-markdown-renderer"
import { RevisionLineDiff } from "@/components/legal/revision-line-diff"
import { formatDate } from "@/lib/revision-parser"
import { parseOldNewXML } from "@/lib/oldnew-parser"
import { useApiKey } from "@/hooks/use-api-key"
import { useDialogBackGuard } from "@/hooks/use-dialog-back-guard"

interface AISummaryDialogProps {
  isOpen: boolean
  onClose: () => void
  lawTitle: string
  joNum: string
  oldContent: string
  newContent: string
  effectiveDate?: string
  prevEffectiveDate?: string  // 직전(구법) 시행일 — 비교 기준 표시
  isPrecedent?: boolean  // 판례 요약 모드
  lawId?: string  // 개정 연혁 조회용 — 있으면 비교 시점 선택 가능
}

interface RevisionEntry {
  mst: string
  efYd: string   // 시행일자 YYYYMMDD
  ancYd: string  // 공포일자
  rrCls: string  // 제개정 구분 (일부개정/전부개정/타법개정 …)
}

// 선택한 개정 시점의 신·구 대조 데이터
interface RevisionComparison {
  oldContent: string
  newContent: string
  prevEffectiveDate?: string
  effectiveDate?: string
}

export function AISummaryDialog({
  isOpen,
  onClose,
  lawTitle,
  joNum,
  oldContent,
  newContent,
  effectiveDate,
  prevEffectiveDate,
  isPrecedent = false,
  lawId,
}: AISummaryDialogProps) {
  // 브라우저 뒤로가기 시 뷰어 이탈 대신 다이얼로그만 닫기
  useDialogBackGuard(isOpen, onClose)
  const [isLoading, setIsLoading] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fontSize, setFontSize] = useState<"small" | "medium" | "large">("small")
  const { apiKey } = useApiKey()

  // ── 비교 시점 선택 (개정 연혁 기반) ──
  const [revisions, setRevisions] = useState<RevisionEntry[]>([])
  const [selectedMst, setSelectedMst] = useState<string>("latest")
  const [revisionOverride, setRevisionOverride] = useState<RevisionComparison | null>(null)
  const [loadingRevision, setLoadingRevision] = useState(false)

  // 요약 스트림 중단용 — 다이얼로그 닫힘·시점 변경 시 진행 중 스트림을 끊는다
  const summaryAbortRef = useRef<AbortController | null>(null)
  useEffect(() => () => { summaryAbortRef.current?.abort() }, [])

  useEffect(() => {
    if (!isOpen || isPrecedent) return
    const ac = new AbortController()
    const params = lawId ? `lawId=${encodeURIComponent(lawId)}` : `lawName=${encodeURIComponent(lawTitle)}`
    fetch(`/api/law-history?${params}`, { signal: ac.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.histories?.length) setRevisions(data.histories)
      })
      .catch(() => { /* 연혁 조회 실패 시 기본(최신) 비교만 제공 */ })
    return () => ac.abort()
  }, [isOpen, isPrecedent, lawId, lawTitle])

  const handleRevisionChange = async (mst: string) => {
    // 진행 중 요약 스트림 중단 — 미중단 시 이전 비교 기준 해설이 클로저 누적본으로 되살아나
    // 새 diff와 다른 개정을 설명하는 화면이 된다
    summaryAbortRef.current?.abort()
    setIsLoading(false)
    setSelectedMst(mst)
    setSummary(null)
    setError(null)
    if (mst === "latest") {
      setRevisionOverride(null)
      return
    }
    setLoadingRevision(true)
    try {
      const res = await fetch(`/api/oldnew?mst=${encodeURIComponent(mst)}`)
      if (!res.ok) throw new Error("해당 개정 시점의 신·구 대조 데이터를 불러오지 못했습니다.")
      const comparison = parseOldNewXML(await res.text())
      if (!comparison.oldVersion.content && !comparison.newVersion.content) {
        throw new Error("해당 개정에는 신·구 대조표가 제공되지 않습니다.")
      }
      setRevisionOverride({
        oldContent: comparison.oldVersion.content,
        newContent: comparison.newVersion.content,
        prevEffectiveDate: comparison.oldVersion.effectiveDate,
        effectiveDate: comparison.newVersion.effectiveDate,
      })
    } catch (err) {
      setRevisionOverride(null)
      setSelectedMst("latest")
      setError(err instanceof Error ? err.message : "개정 비교 데이터 조회 실패")
    } finally {
      setLoadingRevision(false)
    }
  }

  // 실제 비교/요약에 쓰이는 값 — 개정 시점을 고르면 그 시점의 신·구 쌍으로 대체
  const effOldContent = revisionOverride?.oldContent ?? oldContent
  const effNewContent = revisionOverride?.newContent ?? newContent
  const effPrevDate = revisionOverride?.prevEffectiveDate ?? prevEffectiveDate
  const effDate = revisionOverride?.effectiveDate ?? effectiveDate

  const generateSummary = async () => {
    setIsLoading(true)
    setError(null)
    setSummary(null)

    // 다이얼로그 닫힘(언마운트) 시 스트림 중단 — 미연결 시 닫아도 서버 생성이 계속 소모됨
    summaryAbortRef.current?.abort()
    const ac = new AbortController()
    summaryAbortRef.current = ac

    try {
      debugLogger.info("AI 요약 요청", { lawTitle, joNum })

      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (apiKey) headers["x-user-api-key"] = apiKey

      const response = await fetch("/api/summarize", {
        method: "POST",
        headers,
        signal: ac.signal,
        body: JSON.stringify({
          lawTitle,
          joNum,
          oldContent: effOldContent,
          newContent: effNewContent,
          effectiveDate: effDate,
          isPrecedent,
        }),
      })

      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent('lexdiff:ai-gate-required', { detail: {} }))
        setError("AI 요약은 로그인 또는 본인 API 키 등록이 필요합니다.")
        return
      }

      if (response.status === 429) {
        const body = await response.json().catch(() => ({}))
        setError(body.message || "오늘 AI 요약 한도를 초과했습니다.")
        return
      }

      if (!response.ok || !response.body) {
        throw new Error("AI 요약 생성 실패")
      }

      // SSE 토큰 스트리밍 — 첫 토큰에서 로딩 해제하고 점진 렌더.
      const reader = response.body.getReader()
      const dec = new TextDecoder()
      let buf = ""
      let acc = ""
      let gotToken = false

      let streamDone = false
      while (!streamDone) {
        const { done, value } = await reader.read()
        if (done) {
          streamDone = true
          // 잔여 버퍼 처리 — 종단 \n\n 없이 닫히면 마지막 토큰 블록이 유실돼 요약 끝이 잘림
          buf += dec.decode()
          if (buf.trim()) buf += "\n\n"
        } else {
          buf += dec.decode(value, { stream: true })
        }
        let idx: number
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          const line = block.split("\n").find((l) => l.startsWith("data: "))
          if (!line) continue
          let ev: { type?: string; text?: string; message?: string }
          try {
            ev = JSON.parse(line.slice(6))
          } catch {
            continue
          }
          if (ev.type === "token" && ev.text) {
            acc += ev.text
            if (!gotToken) {
              gotToken = true
              setIsLoading(false)
            }
            setSummary(acc)
          } else if (ev.type === "error") {
            throw new Error(ev.message || "AI 요약 생성 실패")
          }
          // done: 루프 자연 종료
        }
      }

      if (!acc) throw new Error("AI 요약 생성 실패")
      debugLogger.success("AI 요약 생성 완료")
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return // 닫힘으로 인한 중단은 무시
      const errorMsg = err instanceof Error ? err.message : "알 수 없는 오류"
      setError(errorMsg)
      debugLogger.error("AI 요약 생성 실패", err)
    } finally {
      setIsLoading(false)
    }
  }

  const fontSizePx = {
    small: "14px",
    medium: "16px",
    large: "18px",
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                <Icon name="sparkles" className="h-5 w-5 text-primary" />
                {isPrecedent ? "AI 판례 요약" : "AI 변경 요약"}
              </DialogTitle>
              <DialogDescription className="mt-2 flex items-center gap-2 flex-wrap">
                <span>{isPrecedent ? lawTitle : `${lawTitle} ${joNum}`}</span>
                {effectiveDate && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                    <Icon name="calendar" className="h-3 w-3 mr-1" />
                    {formatDate(effectiveDate)}
                  </Badge>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
          {/* 비교 기준 배지 + 개정 시점 선택 (변경요약 모드) */}
          {!isPrecedent && (
            <div className="flex items-center gap-1.5 flex-wrap text-xs">
              <span className="text-muted-foreground mr-0.5">비교 기준</span>
              <Badge variant="outline" className="px-2 py-0.5 font-normal">
                {effPrevDate ? formatDate(effPrevDate) : "직전"} 시행본
              </Badge>
              <Icon name="arrow-right" className="h-3 w-3 text-muted-foreground" />
              <Badge variant="outline" className="px-2 py-0.5 font-normal border-primary/40 text-foreground">
                {effDate ? formatDate(effDate) : "선택"} 시행본
              </Badge>
              {revisions.length > 0 && (
                <span className="ml-auto flex items-center gap-1.5">
                  <Icon name="history" className="h-3.5 w-3.5 text-muted-foreground" />
                  <select
                    className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                    value={selectedMst}
                    onChange={(e) => handleRevisionChange(e.target.value)}
                    disabled={loadingRevision}
                    aria-label="비교할 개정 시점 선택"
                  >
                    <option value="latest">최신 개정 (기본)</option>
                    {revisions.map((rev) => (
                      <option key={rev.mst} value={rev.mst}>
                        {formatDate(rev.efYd)} 시행 · {rev.rrCls}
                      </option>
                    ))}
                  </select>
                  {loadingRevision && <Icon name="loader" className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </span>
              )}
            </div>
          )}

          {/* 결정론 신·구 diff — 원문에서 자동 추출, AI 무관 (사실 레이어) */}
          {!isPrecedent && effOldContent && effNewContent && (
            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-foreground">
                <Icon name="file-text" className="h-4 w-4 text-muted-foreground" />
                신·구 조문 비교
                <span className="text-[11px] font-normal text-muted-foreground">자동 추출 · 원문 기준</span>
              </h3>
              {joNum && !`${effOldContent}\n${effNewContent}`.includes(joNum.replace(/\s+/g, "")) && (
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <Icon name="info" className="h-3 w-3 shrink-0" />
                  {joNum}은(는) 이 개정에서 직접 변경되지 않았습니다 — 아래는 같은 개정에서 변경된 조문입니다.
                </p>
              )}
              <RevisionLineDiff oldContent={effOldContent} newContent={effNewContent} />
            </section>
          )}

          {/* AI 해설 — 사실(diff) 위에 얹는 해석 레이어 */}
          <section className={!isPrecedent ? "border-t border-border pt-4" : undefined}>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5 text-foreground">
              <Icon name="sparkles" className="h-4 w-4 text-primary" />
              {isPrecedent ? "AI 판례 요약" : "AI 해설"}
            </h3>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-10">
                <Icon name="loader" className="h-7 w-7 animate-spin text-primary mb-3" />
                <p className="text-sm text-muted-foreground">{isPrecedent ? "AI가 판례를 요약하고 있습니다..." : "AI가 변경 맥락을 해설하고 있습니다..."}</p>
                <p className="text-xs text-muted-foreground mt-1.5">최대 30초 정도 소요될 수 있습니다</p>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <p className="text-sm text-destructive mb-3">{error}</p>
                <Button onClick={generateSummary} variant="outline" size="sm">
                  다시 시도
                </Button>
              </div>
            ) : summary ? (
              <>
                <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Icon name="type" className="h-4 w-4 text-muted-foreground" />
                    <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
                      {(["small", "medium", "large"] as const).map((sz) => (
                        <Button
                          key={sz}
                          variant={fontSize === sz ? "default" : "ghost"}
                          size="sm"
                          onClick={() => setFontSize(sz)}
                          className="h-7 px-2.5 text-xs"
                        >
                          {sz === "small" ? "작게" : sz === "medium" ? "기본" : "크게"}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <CopyButton
                    getText={() => summary || ""}
                    message="복사됨"
                    iconOnly={false}
                    label="복사"
                    variant="outline"
                    size="sm"
                    onCopySuccess={() => debugLogger.info("요약 복사 완료")}
                  />
                </div>

                <div style={{ fontSize: fontSizePx[fontSize] }} className="leading-relaxed text-foreground">
                  <LegalMarkdownRenderer content={summary} disabledLink />
                </div>

                <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-border">
                  <p className="text-xs text-muted-foreground">
                    ⚠️ {isPrecedent ? "이 요약은" : "위 ‘신·구 조문 비교’는 원문에서 자동 추출한 것이며, ‘AI 해설’은"} AI가 생성한 참고 의견입니다. 반드시 원문을 확인하세요.
                  </p>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-xs text-muted-foreground mb-3">
                  {isPrecedent ? "판례 핵심 쟁점·판시 요지를 AI가 정리합니다." : "위 변경 내용의 실무적 의미를 AI가 해설합니다."}
                </p>
                <Button onClick={generateSummary} variant="default">
                  <Icon name="sparkles" className="h-4 w-4 mr-2" />
                  {isPrecedent ? "AI 판례 요약 생성" : "AI 해설 생성"}
                </Button>
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
