"use client"

import { useState, useEffect, useRef } from "react"
import type React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"

interface ReferenceModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  html?: string
  originalUrl?: string
  onContentClick?: (e: React.MouseEvent<HTMLDivElement>) => void
}

export function ReferenceModal({ isOpen, onClose, title, html, originalUrl, onContentClick }: ReferenceModalProps) {
  const [showOriginal, setShowOriginal] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const canShowOriginal = !!originalUrl

  // Attach event listener to the content div
  useEffect(() => {
    const contentEl = contentRef.current
    if (!contentEl || !onContentClick) return

    const handleClick = (e: MouseEvent) => {
      // Convert MouseEvent to React.MouseEvent-like object
      const reactEvent = e as any as React.MouseEvent<HTMLDivElement>
      onContentClick(reactEvent)
    }

    contentEl.addEventListener("click", handleClick)
    return () => contentEl.removeEventListener("click", handleClick)
  }, [onContentClick, html])

  return (
    <Dialog open={isOpen} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-base font-semibold truncate">{title}</DialogTitle>
            {canShowOriginal && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant={showOriginal ? "secondary" : "default"} onClick={() => setShowOriginal((v) => !v)}>
                  {showOriginal ? "미리보기" : "원문 열기"}
                </Button>
                <a href={originalUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline opacity-80">
                  새 탭으로 열기
                </a>
              </div>
            )}
          </div>
        </DialogHeader>
        {showOriginal && canShowOriginal ? (
          <div className="w-full">
            <iframe src={originalUrl} className="w-full h-[65vh] rounded-md border border-border" />
          </div>
        ) : (
          <ScrollArea className="max-h-[65vh]">
            <div
              ref={contentRef}
              className="prose prose-sm dark:prose-invert whitespace-pre-wrap leading-relaxed"
              dangerouslySetInnerHTML={{ __html: html || "연결된 본문을 불러올 수 없습니다." }}
            />
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
