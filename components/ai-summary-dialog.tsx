"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { debugLogger } from "@/lib/debug-logger"
import { CopyButton } from "@/components/ui/copy-button"
import { LegalMarkdownRenderer } from "@/components/legal-markdown-renderer"
import { RevisionLineDiff } from "@/components/legal/revision-line-diff"
import { formatDate } from "@/lib/revision-parser"
import { useApiKey } from "@/hooks/use-api-key"

interface AISummaryDialogProps {
  isOpen: boolean
  onClose: () => void
  lawTitle: string
  joNum: string
  oldContent: string
  newContent: string
  effectiveDate?: string
  isPrecedent?: boolean  // 판례 요약 모드
}

export function AISummaryDialog({
  isOpen,
  onClose,
  lawTitle,
  joNum,
  oldContent,
  newContent,
  effectiveDate,
  isPrecedent = false,
}: AISummaryDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fontSize, setFontSize] = useState<"small" | "medium" | "large">("small")
  const { apiKey } = useApiKey()

  const generateSummary = async () => {
    setIsLoading(true)
    setError(null)
    setSummary(null)

    try {
      debugLogger.info("AI 요약 요청", { lawTitle, joNum })

      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (apiKey) headers["x-user-api-key"] = apiKey

      const response = await fetch("/api/summarize", {
        method: "POST",
        headers,
        body: JSON.stringify({
          lawTitle,
          joNum,
          oldContent,
          newContent,
          effectiveDate,
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

      if (!response.ok) {
        throw new Error("AI 요약 생성 실패")
      }

      const data = await response.json()
      setSummary(data.summary)
      debugLogger.success("AI 요약 생성 완료")
    } catch (err) {
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
          {/* 비교 기준 배지 — 무엇과 무엇을 비교하는지 명시 (변경요약 모드) */}
          {!isPrecedent && (
            <div className="flex items-center gap-1.5 flex-wrap text-xs">
              <span className="text-muted-foreground mr-0.5">비교 기준</span>
              <Badge variant="outline" className="px-2 py-0.5 font-normal">직전 시행본</Badge>
              <Icon name="arrow-right" className="h-3 w-3 text-muted-foreground" />
              <Badge variant="outline" className="px-2 py-0.5 font-normal border-primary/40 text-foreground">
                {effectiveDate ? formatDate(effectiveDate) : "선택"} 시행본
              </Badge>
            </div>
          )}

          {/* 결정론 신·구 diff — 원문에서 자동 추출, AI 무관 (사실 레이어) */}
          {!isPrecedent && oldContent && newContent && (
            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-foreground">
                <Icon name="file-text" className="h-4 w-4 text-muted-foreground" />
                신·구 조문 비교
                <span className="text-[11px] font-normal text-muted-foreground">자동 추출 · 원문 기준</span>
              </h3>
              <RevisionLineDiff oldContent={oldContent} newContent={newContent} />
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
