"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useErrorReportStore } from "@/lib/error-report-store"
import { CopyButton } from "@/components/ui/copy-button"

export function ErrorReportDialog({ onDismiss }: { onDismiss?: () => void }) {
  const { currentError, showErrorDialog, clearCurrentError, getErrorReportText } = useErrorReportStore()

  if (!currentError) {
    return null
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
            <CopyButton
              getText={() => getErrorReportText(currentError)}
              message="복사됨"
              iconOnly={false}
              label="로그 복사"
              variant="outline"
              size="sm"
              className="flex-1 bg-transparent"
            />
            <Button onClick={handleClose} className="flex-1" size="sm">
              확인
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
