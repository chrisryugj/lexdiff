"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

interface ReferenceModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  html?: string
}

export function ReferenceModal({ isOpen, onClose, title, html }: ReferenceModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div
            className="prose prose-sm dark:prose-invert whitespace-pre-wrap leading-relaxed"
            dangerouslySetInnerHTML={{ __html: html || "연결된 본문을 불러올 수 없습니다." }}
          />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

