"use client"

import { useState, useEffect, useRef, useMemo, useCallback, memo } from "react"
import type React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { CopyButton } from "@/components/ui/copy-button"

interface PrecedentMeta {
  court?: string
  caseNumber?: string
  date?: string
  judgmentType?: string
}

// 스타일을 컴포넌트 외부로 이동 (매 렌더링마다 파싱 방지)
const LAW_CONTENT_STYLES = `
  .law-article-content {
    white-space: pre-wrap !important;
  }
  .law-article-content .whitespace-normal {
    white-space: normal !important;
  }
  .law-article-content .rev-mark {
    font-size: 0.8em !important;
    color: #64748b !important;
  }
  .law-article-content span[style*="color"] {
    font-size: inherit !important;
  }
  .law-article-content span[style*="color"][class="rev-mark"] {
    font-size: 0.8em !important;
  }
`

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
  loading?: boolean
  /** 판례용 메타 정보 (헤더에 배지로 표시) */
  precedentMeta?: PrecedentMeta
  /** 법령 전체보기 콜백 (제1조인 경우 모달 내에서 전체 조문 로딩) */
  onViewFullLaw?: () => void
}

export function ReferenceModal({ isOpen, onClose, title, html, originalUrl, onContentClick, forceWhiteTheme = false, lawName, articleNumber, hasHistory = false, onBack, loading = false, precedentMeta, onViewFullLaw }: ReferenceModalProps) {
  const [showOriginal, setShowOriginal] = useState(false)
  const [fontSize, setFontSize] = useState(14) // 기본 폰트 크기
  const contentRef = useRef<HTMLDivElement>(null)
  const savedScrollRef = useRef<number>(0) // 스크롤 위치 저장
  const onContentClickRef = useRef(onContentClick) // 콜백 ref로 저장 (의존성 제거용)
  onContentClickRef.current = onContentClick

  // 모달 열릴 때 스크롤 위치 저장, 닫힐 때 복원
  useEffect(() => {
    if (isOpen) {
      // 모달 열릴 때 현재 스크롤 위치 저장
      savedScrollRef.current = window.scrollY
    } else {
      // 모달 닫힐 때 스크롤 위치 복원
      if (savedScrollRef.current > 0) {
        // requestAnimationFrame으로 DOM 업데이트 후 스크롤 복원
        requestAnimationFrame(() => {
          window.scrollTo(0, savedScrollRef.current)
        })
      }
    }
  }, [isOpen])

  const canShowOriginal = !!originalUrl

  // 법령 이름으로 조례 여부 판단
  // "시행규칙", "시행령"은 국가법령이므로 제외
  const isOrdinanceLaw = lawName && (
    /조례/.test(lawName) ||
    (/(특별시|광역시|[가-힣]+도|[가-힣]+(시|군|구))\s+[가-힣]/.test(lawName) && !/시행규칙|시행령/.test(lawName))
  )

  // 제1조 여부 판단 (제1조, 제1조의2 등)
  // 하위법령 제1조는 주로 "목적" 조항으로 내용이 단순하므로 전체보기 버튼 제공
  const isFirstArticle = articleNumber && /^제1조(의\d+)?$/.test(articleNumber)

  // 법제처 링크 생성 (조례와 법령 자동 구분)
  const molegUrl = lawName && articleNumber
    ? `https://www.law.go.kr/${isOrdinanceLaw ? '자치법규' : '법령'}/${encodeURIComponent(lawName)}/${articleNumber}`
    : lawName
      ? `https://www.law.go.kr/${isOrdinanceLaw ? '자치법규' : '법령'}/${encodeURIComponent(lawName)}`
      : null

  // 판례 원문 링크 생성 (사건번호 기반)
  const precedentUrl = precedentMeta?.caseNumber
    ? `https://www.law.go.kr/precSc.do?menuId=7&subMenuId=47&tabMenuId=213&query=${encodeURIComponent(precedentMeta.caseNumber)}`
    : null

  // 폰트 크기 조절
  const increaseFontSize = () => setFontSize(prev => Math.min(prev + 1, 28))
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

  // 제목 파싱 (매 렌더링마다 regex 방지)
  const parsedTitle = useMemo(() => {
    const match = title.match(/^(.*)(\s\(.*\))$/)
    if (match) {
      return { main: match[1], suffix: match[2] }
    }
    return null
  }, [title])

  // 접근성: 모달 열릴 때 첫 번째 포커스 가능 요소로 포커스 이동
  useEffect(() => {
    if (!isOpen) return

    const timer = setTimeout(() => {
      // 뒤로가기 버튼이 있으면 그걸 포커스, 아니면 첫 번째 버튼
      const dialog = document.querySelector('[role="dialog"]')
      if (dialog) {
        const firstFocusable = dialog.querySelector<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        firstFocusable?.focus()
      }
    }, 150) // Dialog 애니메이션 완료 후

    return () => clearTimeout(timer)
  }, [isOpen])

  // Attach event listener to the content div
  useEffect(() => {
    // ⚠️ CRITICAL: isOpen이 false거나 loading 중이면 스킵
    if (!isOpen || loading) return

    // 🔥 CRITICAL FIX: DOM 렌더링 완료 대기
    const timer = setTimeout(() => {
      const contentEl = contentRef.current
      if (!contentEl) return

      const handleClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement

        // ✅ CRITICAL: 링크인 경우에만 처리
        if (target && target.tagName === "A") {
          e.preventDefault()
          e.stopPropagation()

          // onContentClick이 있으면 호출 (ref 사용으로 의존성 제거)
          if (onContentClickRef.current) {
            const reactEvent = e as any as React.MouseEvent<HTMLDivElement>
            onContentClickRef.current(reactEvent)
          }
        }
      }

      contentEl.addEventListener("click", handleClick, true) // useCapture = true

      // Cleanup function
      return () => {
        contentEl.removeEventListener("click", handleClick, true)
      }
    }, 100) // 100ms 대기 (Dialog 애니메이션 완료 대기)

    return () => {
      clearTimeout(timer)
    }
  }, [isOpen, loading, html]) // onContentClick은 ref로 관리

  return (
    <Dialog open={isOpen} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="sm:max-w-3xl w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] max-h-[90vh] border-primary/20 shadow-2xl shadow-primary/10 p-0 gap-0 overflow-hidden" style={{ fontFamily: 'Pretendard, sans-serif' }}>
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
                  <Icon name="arrow-left" className="w-4 h-4" />
                </Button>
              )}
              {/* 판례인 경우 아이콘 표시 */}
              {precedentMeta && (
                <Icon name="gavel" className="w-5 h-5 shrink-0 text-orange-400" />
              )}
              <DialogTitle className="text-base font-bold truncate text-primary max-w-[calc(100%-100px)] sm:max-w-[600px]" title={title}>
                {parsedTitle ? (
                  <>
                    {parsedTitle.main}
                    <span className="text-muted-foreground font-normal">{parsedTitle.suffix}</span>
                  </>
                ) : title}
              </DialogTitle>
              {/* 심급 배지 (법원명 기반) */}
              {precedentMeta?.court && (
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${
                  precedentMeta.court.includes("대법원") ? "bg-purple-500/20 text-purple-400" :
                  precedentMeta.court.includes("고등") ? "bg-blue-500/20 text-blue-400" :
                  "bg-green-500/20 text-green-400"
                }`}>
                  {precedentMeta.court.includes("대법원") ? "3심" :
                   precedentMeta.court.includes("고등") ? "2심" : "1심"}
                </span>
              )}
              <DialogDescription className="sr-only">
                {lawName ? `${lawName} ${articleNumber || ''}`.trim() : title} 조문 내용
              </DialogDescription>
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
                  <Icon name="zoom-out" className="w-3.5 h-3.5" />
                </Button>
                <span className="text-xs text-muted-foreground min-w-[20px] text-center tabular-nums hidden sm:inline">{fontSize}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={increaseFontSize}
                  disabled={fontSize >= 28}
                  className="p-1 h-6 w-6"
                  title="글자 크게"
                >
                  <Icon name="zoom-in" className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* 복사 버튼 */}
              <CopyButton
                getText={getCopyText}
                message="복사됨"
                className="p-1 h-7 w-7"
              />

              {/* 법제처 원문 링크 (법령 또는 판례) */}
              {(molegUrl || precedentUrl) && (
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="h-7 gap-1 px-2"
                >
                  <a href={molegUrl || precedentUrl || ''} target="_blank" rel="noopener noreferrer">
                    <Icon name="external-link" className="w-3 h-3" />
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
          {/* 판례 메타 정보 배지 (헤더 내 제목 아래) */}
          {precedentMeta && (
            <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
              {precedentMeta.court && <span className="px-1.5 py-0.5 bg-muted rounded">{precedentMeta.court}</span>}
              {precedentMeta.caseNumber && <span className="px-1.5 py-0.5 bg-muted rounded">{precedentMeta.caseNumber}</span>}
              {precedentMeta.date && <span className="px-1.5 py-0.5 bg-muted rounded">{precedentMeta.date}</span>}
              {precedentMeta.judgmentType && <span className="px-1.5 py-0.5 bg-muted rounded">{precedentMeta.judgmentType}</span>}
            </div>
          )}
        </DialogHeader>
        {loading ? (
          <div className="flex flex-col items-center justify-center h-[40vh] gap-3">
            <Icon name="loader" className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">법령 조문을 불러오는 중...</p>
          </div>
        ) : showOriginal && canShowOriginal ? (
          <div className="w-full">
            <iframe src={originalUrl} className="w-full h-[65vh] border-0" />
          </div>
        ) : (
          <ScrollArea className="max-h-[65vh] overflow-x-hidden">
            <style>{LAW_CONTENT_STYLES}</style>
            <div
              ref={contentRef}
              className={`law-article-content prose prose-sm max-w-none break-words px-4 sm:px-6 pt-2 pb-4 sm:pb-6 overflow-x-hidden ${forceWhiteTheme
                ? "bg-white text-gray-900 [&_a]:text-blue-600 [&_a:hover]:text-blue-800"
                : "dark:prose-invert"
                }`}
              style={
                forceWhiteTheme
                  ? { backgroundColor: '#ffffff', color: '#111827', overflowWrap: 'anywhere', wordBreak: 'break-word', fontSize: `${fontSize}px`, lineHeight: '1.8', whiteSpace: 'pre-wrap', maxWidth: '100%' }
                  : { overflowWrap: 'anywhere', wordBreak: 'break-word', fontSize: `${fontSize}px`, lineHeight: '1.8', whiteSpace: 'pre-wrap', maxWidth: '100%' }
              }
              dangerouslySetInnerHTML={{ __html: processedHtml }}
            />
            {/* 법령 전체보기 버튼 (제1조인 경우 - 목적 조항은 내용이 단순하므로) */}
            {isFirstArticle && onViewFullLaw && (
              <div className="px-4 sm:px-6 pb-4 pt-2 border-t border-border/50 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onViewFullLaw}
                  className="w-full gap-2 h-9 text-sm hover:bg-primary/10"
                >
                  <Icon name="book-open" className="w-4 h-4" />
                  <span>{lawName} 전체 조문 보기</span>
                </Button>
              </div>
            )}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
