"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Icon } from "@/components/ui/icon"
import { debugLogger } from "@/lib/debug-logger"
import { CopyButton } from "@/components/ui/copy-button"
import { formatDate } from "@/lib/revision-parser"

interface AISummaryDialogProps {
  isOpen: boolean
  onClose: () => void
  lawTitle: string
  joNum: string
  oldContent: string
  newContent: string
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
}: AISummaryDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fontSize, setFontSize] = useState<"small" | "medium" | "large">("small")

  const generateSummary = async () => {
    setIsLoading(true)
    setError(null)
    setSummary(null)

    try {
      debugLogger.info("AI 요약 요청", { lawTitle, joNum })

      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lawTitle,
          joNum,
          oldContent,
          newContent,
          effectiveDate,
        }),
      })

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

  const fontSizeClasses = {
    small: "text-sm",
    medium: "text-base",
    large: "text-lg",
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                <Icon name="sparkles" className="h-5 w-5 text-primary" />
                AI 변경 요약
              </DialogTitle>
              <DialogDescription className="mt-2 flex items-center gap-2 flex-wrap">
                <span>{lawTitle} {joNum}</span>
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

        <div className="flex-1 min-h-0 flex flex-col">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Icon name="loader" className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">AI가 변경 내용을 분석하고 있습니다...</p>
              <p className="text-xs text-muted-foreground mt-2">최대 30초 정도 소요될 수 있습니다</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-sm text-destructive mb-4">{error}</p>
              <Button onClick={generateSummary} variant="outline" size="sm">
                다시 시도
              </Button>
            </div>
          ) : summary ? (
            <>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-border flex-shrink-0">
                <div className="flex items-center gap-3">
                  <Icon name="type" className="h-4 w-4 text-muted-foreground" />
                  <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
                    <Button
                      variant={fontSize === "small" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setFontSize("small")}
                      className="h-8 px-3 text-xs"
                    >
                      작게
                    </Button>
                    <Button
                      variant={fontSize === "medium" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setFontSize("medium")}
                      className="h-8 px-3 text-xs"
                    >
                      기본
                    </Button>
                    <Button
                      variant={fontSize === "large" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setFontSize("large")}
                      className="h-8 px-3 text-xs"
                    >
                      크게
                    </Button>
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

              <div className="flex-1 min-h-0 overflow-hidden">
                <ScrollArea className="h-full pr-4">
                  <div className={`${fontSizeClasses[fontSize]} leading-relaxed whitespace-pre-wrap text-foreground`}>
                    {summary}
                  </div>
                </ScrollArea>
              </div>

              <div className="mt-4 p-4 rounded-lg bg-muted/50 border border-border flex-shrink-0">
                <p className="text-xs text-muted-foreground">
                  ⚠️ 이 요약은 AI가 생성한 것으로, 참고용으로만 사용하시고 반드시 원문을 확인하세요.
                </p>
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <Button onClick={generateSummary} variant="default">
                <Icon name="sparkles" className="h-4 w-4 mr-2" />
                요약 생성
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
