"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import type React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { ZoomIn, ZoomOut, Copy, Check, ExternalLink, ArrowLeft, BookOpen } from "lucide-react"

interface ReferenceModalRedesignedProps {
  isOpen: boolean
  onClose: () => void
  title: string
  html?: string
  originalUrl?: string
  onContentClick?: (e: React.MouseEvent<HTMLDivElement>) => void
  forceWhiteTheme?: boolean
  lawName?: string
  articleNumber?: string
  hasHistory?: boolean
  onBack?: () => void
}

export function ReferenceModalRedesigned({
  isOpen,
  onClose,
  title,
  html,
  originalUrl,
  onContentClick,
  forceWhiteTheme = false,
  lawName,
  articleNumber,
  hasHistory = false,
  onBack,
}: ReferenceModalRedesignedProps) {
  const [showOriginal, setShowOriginal] = useState(false)
  const [fontSize, setFontSize] = useState(15) // Slightly larger for readability
  const [copied, setCopied] = useState(false)
  const [showToolbar, setShowToolbar] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const canShowOriginal = !!originalUrl

  const isOrdinanceLaw =
    lawName &&
    (/조례/.test(lawName) || (/(특별시|광역시|[가-힣]+도|[가-힣]+(시|군|구))\s+[가-힣]/.test(lawName) && !/시행규칙|시행령/.test(lawName)))

  const molegUrl =
    lawName && articleNumber
      ? `https://www.law.go.kr/${isOrdinanceLaw ? "자치법규" : "법령"}/${encodeURIComponent(lawName)}/${articleNumber}`
      : lawName
        ? `https://www.law.go.kr/${isOrdinanceLaw ? "자치법규" : "법령"}/${encodeURIComponent(lawName)}`
        : null

  const increaseFontSize = () => setFontSize((prev) => Math.min(prev + 1, 20))
  const decreaseFontSize = () => setFontSize((prev) => Math.max(prev - 1, 12))

  const handleCopy = async () => {
    if (!contentRef.current) return
    const textContent = contentRef.current.innerText
    await navigator.clipboard.writeText(`${title}\n\n${textContent}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const processedHtml = useMemo(() => {
    if (!html) return "연결된 본문을 불러올 수 없습니다."
    return html
  }, [html])

  useEffect(() => {
    const contentEl = contentRef.current
    if (!contentEl || !onContentClick) return

    const handleClick = (e: MouseEvent) => {
      const reactEvent = e as any as React.MouseEvent<HTMLDivElement>
      onContentClick(reactEvent)
    }

    contentEl.addEventListener("click", handleClick)
    return () => contentEl.removeEventListener("click", handleClick)
  }, [onContentClick, html])

  return (
    <Dialog open={isOpen} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent
        className="sm:max-w-4xl max-w-[95vw] max-h-[92vh] p-0 overflow-hidden border-none shadow-2xl"
        onMouseEnter={() => setShowToolbar(true)}
        onMouseLeave={() => setShowToolbar(false)}
      >
        {/* Editorial Header - 전역 테마 기반 */}
        <div className="relative bg-gradient-to-r from-card via-background to-card border-b-2 border-primary/30">
          {/* Decorative corner ornaments */}
          <div className="absolute top-0 left-0 w-16 h-16 border-l-2 border-t-2 border-primary/20 opacity-60" />
          <div className="absolute top-0 right-0 w-16 h-16 border-r-2 border-t-2 border-primary/20 opacity-60" />

          <DialogHeader className="p-6 sm:p-8">
            <div className="flex items-center gap-4">
              {hasHistory && onBack && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onBack}
                  className="p-2 h-9 w-9 text-foreground hover:text-primary hover:bg-secondary transition-all"
                  title="이전 법령으로"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              )}

              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-3">
                  <BookOpen className="w-6 h-6 text-primary" />
                  <DialogTitle className="text-2xl sm:text-3xl font-serif font-bold text-foreground tracking-tight">
                    {title}
                  </DialogTitle>
                </div>
                {lawName && (
                  <p className="text-sm text-muted-foreground font-light tracking-wide pl-9">
                    {lawName}
                  </p>
                )}
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Floating Toolbar - 전역 테마 기반 */}
        <div
          className={`absolute top-24 right-4 z-50 flex flex-col gap-2 transition-all duration-300 ${
            showToolbar ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4 pointer-events-none"
          }`}
        >
          <div className="bg-card/95 backdrop-blur-md rounded-lg border border-primary/20 shadow-xl p-2 space-y-1">
            {/* Font size controls */}
            <div className="flex flex-col items-center gap-1 pb-2 border-b border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={increaseFontSize}
                disabled={fontSize >= 20}
                className="h-8 w-8 p-0 text-foreground hover:text-primary hover:bg-secondary disabled:opacity-30"
                title="글자 크게"
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
              <span className="text-xs text-primary font-mono">{fontSize}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={decreaseFontSize}
                disabled={fontSize <= 12}
                className="h-8 w-8 p-0 text-foreground hover:text-primary hover:bg-secondary disabled:opacity-30"
                title="글자 작게"
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
            </div>

            {/* Copy button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-8 w-8 p-0 text-foreground hover:text-primary hover:bg-secondary"
              title="내용 복사"
            >
              {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
            </Button>

            {/* External link */}
            {molegUrl && (
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="h-8 w-8 p-0 text-foreground hover:text-primary hover:bg-secondary"
                title="법제처 원문"
              >
                <a href={molegUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </Button>
            )}

            {/* Original view toggle */}
            {canShowOriginal && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowOriginal((v) => !v)}
                className={`h-8 w-8 p-0 ${
                  showOriginal ? "text-primary bg-secondary" : "text-foreground hover:text-primary hover:bg-secondary"
                }`}
                title={showOriginal ? "미리보기" : "원문 열기"}
              >
                <BookOpen className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Content Area - Paper Document Style */}
        {showOriginal && canShowOriginal ? (
          <div className="w-full h-[calc(92vh-120px)]">
            <iframe src={originalUrl} className="w-full h-full" />
          </div>
        ) : (
          <ScrollArea className="h-[calc(92vh-120px)]">
            {/* Paper background with texture */}
            <div className="relative">
              {/* Subtle paper texture overlay */}
              <div
                className="absolute inset-0 opacity-[0.015] pointer-events-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' /%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.5'/%3E%3C/svg%3E")`,
                }}
              />

              {/* Document container */}
              <div className="relative max-w-3xl mx-auto px-8 sm:px-12 py-10 sm:py-16">
                {/* Decorative initial cap line */}
                <div className="w-16 h-1 bg-gradient-to-r from-primary to-transparent mb-8" />

                <style>{`
                  /* Enhanced law article styling - 전역 테마 기반 */
                  .law-article-redesigned {
                    font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    line-height: 2;
                    color: var(--color-foreground);
                  }

                  .law-article-redesigned h3 {
                    font-size: 1.5em;
                    font-weight: 700;
                    margin-bottom: 1.5em;
                    color: var(--color-foreground);
                    border-bottom: 2px solid var(--color-primary);
                    padding-bottom: 0.5em;
                    font-family: 'Pretendard', sans-serif;
                    letter-spacing: -0.02em;
                  }

                  .law-article-redesigned p {
                    margin: 1.2em 0;
                  }

                  .law-article-redesigned .para-marker {
                    display: block;
                    margin-top: 1em;
                    padding-left: 1.8em;
                    position: relative;
                  }

                  .law-article-redesigned .para-marker::before {
                    content: '•';
                    position: absolute;
                    left: 0.5em;
                    color: var(--color-primary);
                    font-weight: bold;
                    font-size: 1.2em;
                    line-height: 1.5;
                  }

                  /* Editorial revision marks - 전역 테마 */
                  .law-article-redesigned .rev-mark {
                    font-family: 'Pretendard', sans-serif;
                    font-size: 0.75em;
                    color: var(--color-info) !important;
                    font-weight: 600;
                    letter-spacing: -0.01em;
                    background: var(--color-secondary);
                    padding: 0.25em 0.6em;
                    border-radius: 4px;
                    margin: 0 0.3em;
                    display: inline-block;
                    vertical-align: baseline;
                    border: 1px solid var(--color-border);
                  }

                  /* Legal citation links - 전역 테마 */
                  .law-article-redesigned a.law-ref {
                    color: var(--color-primary);
                    text-decoration: none;
                    border-bottom: 2px solid transparent;
                    background: linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) 100%);
                    background-size: 0% 2px;
                    background-position: left bottom;
                    background-repeat: no-repeat;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    font-weight: 600;
                    padding: 2px 4px;
                    border-radius: 3px;
                  }

                  .law-article-redesigned a.law-ref:hover {
                    color: var(--color-accent);
                    background-size: 100% 2px;
                    background-color: var(--color-primary-foreground);
                    box-shadow: 0 2px 8px var(--color-primary);
                  }

                  /* First paragraph initial emphasis */
                  .law-article-redesigned > p:first-of-type {
                    font-weight: 500;
                  }
                `}</style>

                <div
                  ref={contentRef}
                  className="law-article-redesigned prose prose-lg max-w-none"
                  style={{
                    fontSize: `${fontSize}px`,
                  }}
                  dangerouslySetInnerHTML={{ __html: processedHtml }}
                />

                {/* Decorative end mark */}
                <div className="flex items-center justify-center mt-12 gap-2">
                  <div className="w-1 h-1 bg-primary/40 rounded-full" />
                  <div className="w-2 h-2 bg-primary/60 rounded-full" />
                  <div className="w-1 h-1 bg-primary/40 rounded-full" />
                </div>
              </div>
            </div>
          </ScrollArea>
        )}

        {/* Bottom document shadow */}
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black/10 to-transparent pointer-events-none" />
      </DialogContent>
    </Dialog>
  )
}
