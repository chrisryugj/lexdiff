/**
 * search-result-view/SearchDialogs.tsx
 *
 * 검색 모드 선택 및 결과 없음 다이얼로그
 */

"use client"

import React, { memo } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import type { SearchQuery } from "./types"

// ============================================================
// 검색 모드 선택 다이얼로그
// ============================================================

interface SearchChoiceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pendingQuery: SearchQuery | null
  onChoice: (mode: 'law' | 'ai') => void
}

export const SearchChoiceDialog = memo(function SearchChoiceDialog({
  open,
  onOpenChange,
  pendingQuery,
  onChoice,
}: SearchChoiceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="help-circle" className="h-5 w-5 text-blue-500" />
            검색 방법을 선택하세요
          </DialogTitle>
          <DialogDescription className="pt-2">
            <span className="block text-sm text-muted-foreground mb-3">
              입력하신 "<span className="font-medium text-foreground">{pendingQuery?.lawName} {pendingQuery?.article}</span>"를 어떻게 검색할까요?
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button
            onClick={() => onChoice('law')}
            variant="outline"
            className="h-auto p-4 flex flex-col items-center gap-2 hover:bg-amber-500/10 hover:border-amber-500/50 transition-all"
          >
            <Icon name="scale" className="h-8 w-8 text-amber-500" />
            <div className="text-center">
              <div className="font-semibold text-foreground">법령 검색</div>
              <div className="text-xs text-muted-foreground mt-1">
                조문 직접 확인
              </div>
            </div>
          </Button>
          <Button
            onClick={() => onChoice('ai')}
            variant="outline"
            className="h-auto p-4 flex flex-col items-center gap-2 hover:bg-primary/10 hover:border-primary/50 transition-all"
          >
            <Icon name="brain" className="h-8 w-8 text-primary" />
            <div className="text-center">
              <div className="font-semibold text-foreground">AI 검색</div>
              <div className="text-xs text-muted-foreground mt-1">
                자연어로 설명
              </div>
            </div>
          </Button>
        </div>
        <div className="text-xs text-muted-foreground text-center mt-3">
          💡 Tip: 왼쪽 AI 버튼으로 AI 모드를 고정할 수 있습니다
        </div>
      </DialogContent>
    </Dialog>
  )
})

// ============================================================
// 법령 검색 결과 없음 다이얼로그
// ============================================================

interface NoResultDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  noResultQuery: SearchQuery | null
  onChoice: (choice: 'ai' | 'cancel') => void
}

export const NoResultDialog = memo(function NoResultDialog({
  open,
  onOpenChange,
  noResultQuery,
  onChoice,
}: NoResultDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="alert-circle" className="h-5 w-5 text-amber-500" />
            법령을 찾을 수 없습니다
          </DialogTitle>
          <DialogDescription className="pt-2">
            <span className="block text-sm text-muted-foreground mb-3">
              "<span className="font-medium text-foreground">{noResultQuery?.lawName}</span>"에 대한 검색 결과가 없습니다.
            </span>
            <span className="block text-xs text-muted-foreground">
              오타가 있거나 존재하지 않는 법령일 수 있습니다.<br />
              AI 검색을 시도하시겠습니까?
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button
            onClick={() => onChoice('cancel')}
            variant="outline"
            className="h-auto p-4 flex flex-col items-center gap-2 hover:bg-gray-500/10 hover:border-gray-500/50 transition-all"
          >
            <Icon name="x" className="h-8 w-8 text-gray-500" />
            <div className="text-center">
              <div className="font-semibold text-foreground">취소</div>
              <div className="text-xs text-muted-foreground mt-1">
                검색 중단
              </div>
            </div>
          </Button>
          <Button
            onClick={() => onChoice('ai')}
            variant="outline"
            className="h-auto p-4 flex flex-col items-center gap-2 hover:bg-primary/10 hover:border-primary/50 transition-all"
          >
            <Icon name="brain" className="h-8 w-8 text-primary" />
            <div className="text-center">
              <div className="font-semibold text-foreground">AI 검색</div>
              <div className="text-xs text-muted-foreground mt-1">
                자연어로 검색
              </div>
            </div>
          </Button>
        </div>
        <div className="text-xs text-muted-foreground text-center mt-3">
          💡 Tip: AI 검색은 오타를 자동으로 교정하여 검색합니다
        </div>
      </DialogContent>
    </Dialog>
  )
})
