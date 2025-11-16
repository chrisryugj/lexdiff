"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import type React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { ZoomIn, ZoomOut, Copy, Check, ExternalLink } from "lucide-react"

interface ReferenceModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  html?: string
  originalUrl?: string
  onContentClick?: (e: React.MouseEvent<HTMLDivElement>) => void
  forceWhiteTheme?: boolean
  lawName?: string
  articleNumber?: string
}

export function ReferenceModal({ isOpen, onClose, title, html, originalUrl, onContentClick, forceWhiteTheme = false, lawName, articleNumber }: ReferenceModalProps) {
  const [showOriginal, setShowOriginal] = useState(false)
  const [fontSize, setFontSize] = useState(14) // 기본 폰트 크기
  const [copied, setCopied] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const canShowOriginal = !!originalUrl

  // 법제처 링크 생성 (법령뷰와 동일한 방식)
  const molegUrl = lawName && articleNumber
    ? `https://www.law.go.kr/법령/${encodeURIComponent(lawName)}/${articleNumber}`
    : lawName
    ? `https://www.law.go.kr/법령/${encodeURIComponent(lawName)}`
    : null

  // 폰트 크기 조절
  const increaseFontSize = () => setFontSize(prev => Math.min(prev + 1, 18))
  const decreaseFontSize = () => setFontSize(prev => Math.max(prev - 1, 11))

  // 복사 기능
  const handleCopy = async () => {
    if (!contentRef.current) return
    const textContent = contentRef.current.innerText
    await navigator.clipboard.writeText(`${title}\n\n${textContent}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // HTML은 그대로 사용 (CSS로 간격 처리)
  const processedHtml = useMemo(() => {
    if (!html) return "연결된 본문을 불러올 수 없습니다."
    return html
  }, [html])

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
      <DialogContent className="sm:max-w-3xl max-w-[95vw] max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <DialogTitle className="text-base font-semibold truncate flex-1 pr-2">{title}</DialogTitle>
            <div className="flex items-center gap-2 flex-wrap" style={{ marginRight: '16px' }}>
              {/* 폰트 크기 조절 */}
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={decreaseFontSize}
                  disabled={fontSize <= 11}
                  className="p-1 h-7 w-7"
                  title="글자 작게"
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <span className="text-xs text-muted-foreground min-w-[25px] text-center">{fontSize}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={increaseFontSize}
                  disabled={fontSize >= 18}
                  className="p-1 h-7 w-7"
                  title="글자 크게"
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
              </div>

              {/* 복사 버튼 */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="p-1 h-7 w-7"
                title="내용 복사"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>

              {/* 법제처 원문 링크 */}
              {molegUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="h-7 gap-1"
                >
                  <a href={molegUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3 h-3" />
                    <span className="text-xs">법제처 원문</span>
                  </a>
                </Button>
              )}

              {/* 기존 원문 열기 버튼 */}
              {canShowOriginal && (
                <Button size="sm" variant={showOriginal ? "secondary" : "default"} onClick={() => setShowOriginal((v) => !v)}>
                  {showOriginal ? "미리보기" : "원문 열기"}
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>
        {showOriginal && canShowOriginal ? (
          <div className="w-full">
            <iframe src={originalUrl} className="w-full h-[65vh] rounded-md border border-border" />
          </div>
        ) : (
          <ScrollArea className="max-h-[65vh]">
            <style>{`
              /* 항 사이 간격 (whitespace-pre-wrap에서 \n\n을 공백으로 표시) */
              .law-article-content {
                white-space: pre-wrap !important;
              }

              /* <개정> 태그와 [ ] 태그 크기 조정 - rev-mark 클래스 사용 */
              .law-article-content .rev-mark {
                font-size: 0.8em !important;
                color: #64748b !important;
              }

              /* 추가로 inline span 태그도 처리 */
              .law-article-content span[style*="color"] {
                font-size: inherit !important;
              }
              .law-article-content span[style*="color"][class="rev-mark"] {
                font-size: 0.8em !important;
              }
            `}</style>
            <div
              ref={contentRef}
              className={`law-article-content prose prose-sm max-w-none break-words overflow-wrap-anywhere ${
                forceWhiteTheme
                  ? "bg-white text-gray-900 [&_a]:text-blue-600 [&_a:hover]:text-blue-800"
                  : "dark:prose-invert"
              }`}
              style={
                forceWhiteTheme
                  ? { backgroundColor: '#ffffff', color: '#111827', padding: '1rem', overflowWrap: 'anywhere', wordBreak: 'break-word', fontSize: `${fontSize}px`, lineHeight: '1.8', whiteSpace: 'pre-wrap' }
                  : { overflowWrap: 'anywhere', wordBreak: 'break-word', fontSize: `${fontSize}px`, lineHeight: '1.8', whiteSpace: 'pre-wrap' }
              }
              dangerouslySetInnerHTML={{ __html: processedHtml }}
            />
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
