"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"

interface SearchBarChoiceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pendingQuery: string
  onChoice: (choice: 'law' | 'ai') => void
}

export function SearchBarChoiceDialog({
  open,
  onOpenChange,
  pendingQuery,
  onChoice
}: SearchBarChoiceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="help-circle" className="h-5 w-5 text-blue-500" />
            검색 방법을 선택하세요
          </DialogTitle>
          <DialogDescription className="pt-2">
            <div className="text-sm text-muted-foreground mb-3">
              입력하신 "<span className="font-medium text-foreground">{pendingQuery}</span>"를 어떻게 검색할까요?
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button
            onClick={() => onChoice('law')}
            variant="outline"
            className="h-auto p-4 flex flex-col items-center gap-2 hover:bg-amber-50 dark:hover:bg-amber-950/20"
          >
            <Icon name="scale" className="h-8 w-8 text-amber-500" />
            <div className="text-center">
              <div className="font-semibold">법령 검색</div>
              <div className="text-xs text-muted-foreground mt-1">
                조문 직접 확인
              </div>
            </div>
          </Button>
          <Button
            onClick={() => onChoice('ai')}
            variant="outline"
            className="h-auto p-4 flex flex-col items-center gap-2 hover:bg-primary/5 dark:hover:bg-primary/10"
          >
            <Icon name="brain" className="h-8 w-8 text-primary" />
            <div className="text-center">
              <div className="font-semibold">AI 검색</div>
              <div className="text-xs text-muted-foreground mt-1">
                자연어로 설명
              </div>
            </div>
          </Button>
        </div>
        <div className="text-xs text-muted-foreground text-center mt-3">
          Tip: 왼쪽 AI 버튼으로 AI 모드를 고정할 수 있습니다
        </div>
      </DialogContent>
    </Dialog>
  )
}
