"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import type React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { ZoomIn, ZoomOut, ExternalLink, ArrowLeft } from "lucide-react"
import { CopyButton } from "@/components/ui/copy-button"

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
  hasHistory?: boolean
  onBack?: () => void
}

export function ReferenceModal({ isOpen, onClose, title, html, originalUrl, onContentClick, forceWhiteTheme = false, lawName, articleNumber, hasHistory = false, onBack }: ReferenceModalProps) {
  const [showOriginal, setShowOriginal] = useState(false)
  const [fontSize, setFontSize] = useState(14) // 기본 폰트 크기
  const contentRef = useRef<HTMLDivElement>(null)

  const canShowOriginal = !!originalUrl

  // 법령 이름으로 조례 여부 판단
  // "시행규칙", "시행령"은 국가법령이므로 제외
  const isOrdinanceLaw = lawName && (
    /조례/.test(lawName) ||
    (/(특별시|광역시|[가-힣]+도|[가-힣]+(시|군|구))\s+[가-힣]/.test(lawName) && !/시행규칙|시행령/.test(lawName))
  )

  // 법제처 링크 생성 (조례와 법령 자동 구분)
  const molegUrl = lawName && articleNumber
    ? `https://www.law.go.kr/${isOrdinanceLaw ? '자치법규' : '법령'}/${encodeURIComponent(lawName)}/${articleNumber}`
    : lawName
      ? `https://www.law.go.kr/${isOrdinanceLaw ? '자치법규' : '법령'}/${encodeURIComponent(lawName)}`
      : null

  // 폰트 크기 조절
  const increaseFontSize = () => setFontSize(prev => Math.min(prev + 1, 18))
  const decreaseFontSize = () => setFontSize(prev => Math.max(prev - 1, 11))

  // 복사 텍스트 가져오기
  const getCopyText = () => {
    if (!contentRef.current) return title
    return `${title}\n\n${contentRef.current.innerText}`
  }

  // HTML은 그대로 사용 (CSS로 간격 처리)
  const processedHtml = useMemo(() => {
    if (!html) return "연결된 본문을 불러올 수 없습니다."
    return html
  }, [html])

  // Attach event listener to the content div
  useEffect(() => {
    // ⚠️ CRITICAL: isOpen이 false면 DOM이 렌더링되지 않음
    if (!isOpen) return

    // 🔥 CRITICAL FIX: DOM 렌더링 완료 대기
    const timer = setTimeout(() => {
      const contentEl = contentRef.current
      if (!contentEl) {
        console.log('[ReferenceModal] contentRef.current is null after timeout, skipping event listener')
        return
      }

      const handleClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement

        console.log('[ReferenceModal] Click detected:', {
          tagName: target.tagName,
          className: target.className,
          href: target.getAttribute('href')
        })

        // ✅ CRITICAL: 링크인 경우에만 처리
        if (target && target.tagName === "A") {
          e.preventDefault()
          e.stopPropagation()

          console.log('[ReferenceModal] Link clicked:', {
            href: target.getAttribute('href'),
            dataRef: target.getAttribute('data-ref'),
            dataArticle: target.getAttribute('data-article'),
            dataLaw: target.getAttribute('data-law')
          })

          // onContentClick이 있으면 호출
          if (onContentClick) {
            const reactEvent = e as any as React.MouseEvent<HTMLDivElement>
            onContentClick(reactEvent)
          }
        }
      }

      console.log('[ReferenceModal] Attaching event listener to:', contentEl, 'HTML length:', contentEl.innerHTML.length)
      contentEl.addEventListener("click", handleClick, true) // useCapture = true

      // Cleanup function
      return () => {
        console.log('[ReferenceModal] Removing event listener')
        contentEl.removeEventListener("click", handleClick, true)
      }
    }, 100) // 100ms 대기 (Dialog 애니메이션 완료 대기)

    return () => {
      clearTimeout(timer)
    }
  }, [isOpen, onContentClick, html])

  return (
    <Dialog open={isOpen} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="sm:max-w-3xl max-w-[95vw] max-h-[90vh] border-primary/20 shadow-2xl shadow-primary/10 p-0 gap-0 overflow-hidden" style={{ fontFamily: 'Pretendard, sans-serif' }}>
        <DialogHeader className="px-4 py-3 border-b border-border bg-muted/30 flex-shrink-0">
          <div className="flex items-center justify-between gap-2 flex-wrap pr-6">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* 뒤로가기 버튼 (히스토리가 있을 때만 표시) */}
              {hasHistory && onBack && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onBack}
                  className="p-1 h-7 w-7 flex-shrink-0"
                  title="이전 법령으로"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              )}
              <DialogTitle className="text-base font-bold truncate text-primary">
                {(() => {
                  const match = title.match(/^(.*)(\s\(.*\))$/)
                  if (match) {
                    return (
                      <>
                        {match[1]}
                        <span className="text-muted-foreground font-normal">{match[2]}</span>
                      </>
                    )
                  }
                  return title
                })()}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* 폰트 크기 조절 */}
              <div className="flex items-center gap-1 bg-background/50 rounded-md border border-border/50 px-1 py-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={decreaseFontSize}
                  disabled={fontSize <= 11}
                  className="p-1 h-6 w-6"
                  title="글자 작게"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </Button>
                <span className="text-xs text-muted-foreground min-w-[20px] text-center tabular-nums hidden sm:inline">{fontSize}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={increaseFontSize}
                  disabled={fontSize >= 18}
                  className="p-1 h-6 w-6"
                  title="글자 크게"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* 복사 버튼 */}
              <CopyButton
                getText={getCopyText}
                message="복사됨"
                className="p-1 h-7 w-7"
              />

              {/* 법제처 원문 링크 */}
              {molegUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="h-7 gap-1 px-2"
                >
                  <a href={molegUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3 h-3" />
                    <span className="text-xs hidden sm:inline">원문</span>
                  </a>
                </Button>
              )}

              {/* 기존 원문 열기 버튼 */}
              {canShowOriginal && (
                <Button size="sm" variant={showOriginal ? "secondary" : "default"} onClick={() => setShowOriginal((v) => !v)} className="h-7 px-2 text-xs">
                  {showOriginal ? "미리보기" : "원문 열기"}
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>
        {showOriginal && canShowOriginal ? (
          <div className="w-full">
            <iframe src={originalUrl} className="w-full h-[65vh] border-0" />
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
              className={`law-article-content prose prose-sm max-w-none break-words overflow-wrap-anywhere p-4 sm:p-6 ${forceWhiteTheme
                ? "bg-white text-gray-900 [&_a]:text-blue-600 [&_a:hover]:text-blue-800"
                : "dark:prose-invert"
                }`}
              style={
                forceWhiteTheme
                  ? { backgroundColor: '#ffffff', color: '#111827', overflowWrap: 'anywhere', wordBreak: 'break-word', fontSize: `${fontSize}px`, lineHeight: '1.8', whiteSpace: 'pre-wrap' }
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
