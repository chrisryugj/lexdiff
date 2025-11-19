"use client"

import { useState, useEffect } from "react"
import { Copy, Check } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useErrorReportStore } from "@/lib/error-report-store"

export function ErrorReportDialog({ onDismiss }: { onDismiss?: () => void }) {
  const { currentError, showErrorDialog, clearCurrentError, getErrorReportText } = useErrorReportStore()
  const [copied, setCopied] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  if (!currentError) {
    return null
  }

  const handleCopy = async () => {
    const reportText = getErrorReportText(currentError)
    await navigator.clipboard.writeText(reportText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClose = () => {
    clearCurrentError()
    onDismiss?.()
  }

  return (
    <Dialog open={showErrorDialog} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg bg-white text-black">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">{currentError.operation} 실패</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded border p-3">
            <p className="text-sm text-muted-foreground">{currentError.errorMessage}</p>
          </div>

          <div className="rounded border bg-muted/30 p-3">
            <p className="mb-2 text-xs font-medium">상세 로그</p>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>시간: {new Date(currentError.timestamp).toLocaleString("ko-KR")}</p>
              {currentError.context?.query && <p>검색어: {currentError.context.query}</p>}
              {currentError.context?.resultCount !== undefined && <p>결과 수: {currentError.context.resultCount}개</p>}
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleCopy} variant="outline" className="flex-1 bg-transparent" size="sm">
              {copied ? (
                <>
                  <Check className="mr-1 h-3 w-3" />
                  복사됨
                </>
              ) : (
                <>
                  <Copy className="mr-1 h-3 w-3" />
                  로그 복사
                </>
              )}
            </Button>
            <Button onClick={handleClose} className="flex-1" size="sm">
              확인
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
