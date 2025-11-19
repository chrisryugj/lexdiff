"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import type React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { ZoomIn, ZoomOut, Copy, Check, ExternalLink, ArrowLeft } from "lucide-react"

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
  const [copied, setCopied] = useState(false)
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
      <DialogContent className="sm:max-w-3xl max-w-[95vw] max-h-[90vh] border-primary/20 shadow-2xl shadow-primary/10" style={{ fontFamily: 'Pretendard, sans-serif' }}>
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
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
              <DialogTitle className="text-base font-semibold truncate">{title}</DialogTitle>
            </div>
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
              className={`law-article-content prose prose-sm max-w-none break-words overflow-wrap-anywhere ${forceWhiteTheme
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
