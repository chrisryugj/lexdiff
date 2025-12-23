/**
 * 판례 섹션 컴포넌트
 * - 하단 미니 목록 (기본)
 * - 사이드 패널 상세 (확장 시)
 */

"use client"

import * as React from "react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { formatPrecedentDate } from "@/lib/precedent-parser"
import { generateLinks } from "@/lib/unified-link-generator"
import type { PrecedentSearchResult, PrecedentDetail } from "@/lib/precedent-parser"

interface PrecedentSectionProps {
  precedents: PrecedentSearchResult[]
  totalCount: number
  loading: boolean
  error: string | null
  selectedPrecedent: PrecedentDetail | null
  loadingDetail: boolean
  viewMode: "bottom" | "side"
  onViewDetail: (precedent: PrecedentSearchResult) => void
  onExpand: () => void
  onCollapse: () => void
}

export function PrecedentSection({
  precedents,
  totalCount,
  loading,
  error,
  selectedPrecedent,
  loadingDetail,
  viewMode,
  onViewDetail,
  onExpand,
  onCollapse
}: PrecedentSectionProps) {
  const [isOpen, setIsOpen] = React.useState(true)

  // 로딩 중
  if (loading) {
    return (
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon name="loader" className="h-4 w-4 animate-spin" />
          <span className="text-sm">관련 판례 검색 중...</span>
        </div>
      </div>
    )
  }

  // 에러
  if (error) {
    return (
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-2 text-destructive">
          <Icon name="alert-circle" className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
      </div>
    )
  }

  // 결과 없음
  if (precedents.length === 0) {
    return (
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon name="scale" className="h-4 w-4" />
          <span className="text-sm">관련 판례가 없습니다</span>
        </div>
      </div>
    )
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border-t border-border">
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between p-3 hover:bg-muted/50 cursor-pointer transition-colors">
          <div className="flex items-center gap-2">
            <Icon name="scale" className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">관련 판례</span>
            <span className="text-xs text-muted-foreground">({totalCount}건)</span>
          </div>
          <div className="flex items-center gap-1">
            {viewMode === "bottom" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                onClick={(e) => {
                  e.stopPropagation()
                  onExpand()
                }}
              >
                <Icon name="maximize" className="h-3 w-3 mr-1" />
                <span className="text-xs">확장</span>
              </Button>
            )}
            {viewMode === "side" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                onClick={(e) => {
                  e.stopPropagation()
                  onCollapse()
                }}
              >
                <Icon name="maximize" className="h-3 w-3 mr-1" />
                <span className="text-xs">축소</span>
              </Button>
            )}
            {isOpen ? (
              <Icon name="chevron-up" className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Icon name="chevron-down" className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="px-3 pb-3">
          <div className="space-y-2">
            {precedents.map((prec) => (
              <PrecedentListItem
                key={prec.id}
                precedent={prec}
                isSelected={selectedPrecedent?.caseNumber === prec.caseNumber}
                onClick={() => onViewDetail(prec)}
              />
            ))}
          </div>

          {totalCount > 5 && (
            <div className="mt-3 text-center">
              <Button variant="outline" size="sm" className="text-xs">
                더 보기 ({totalCount - 5}건 더)
              </Button>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// 판례 목록 아이템
function PrecedentListItem({
  precedent,
  isSelected,
  onClick
}: {
  precedent: PrecedentSearchResult
  isSelected: boolean
  onClick: () => void
}) {
  const [showTooltip, setShowTooltip] = React.useState(false)
  const [isTruncated, setIsTruncated] = React.useState(false)
  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 })
  const titleRef = React.useRef<HTMLDivElement>(null)

  // ResizeObserver로 truncated 상태 동적 감지 + 폰트 로딩 대기
  React.useEffect(() => {
    const element = titleRef.current
    if (!element) return

    let mounted = true

    const checkTruncated = () => {
      if (!mounted || !element) return
      // scrollHeight가 clientHeight보다 크면 잘림 (line-clamp-2)
      const isTrunc = element.scrollHeight > element.clientHeight ||
                      (precedent.name?.length || 0) > 30
      setIsTruncated(isTrunc)
    }

    // 폰트 로딩 후 체크 (Pretendard 로딩 대기)
    const init = async () => {
      try {
        if (document.fonts?.ready) {
          await document.fonts.ready
        }
      } catch {
        // fonts API 실패 시 무시
      }
      // 렌더링 안정화를 위해 여러 프레임 대기
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          checkTruncated()
        })
      })
    }
    init()

    const observer = new ResizeObserver(checkTruncated)
    observer.observe(element)

    return () => {
      mounted = false
      observer.disconnect()
    }
  }, [precedent.name])

  const handleMouseMove = React.useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY })
  }, [])

  return (
    <button
      className={cn(
        "group relative p-4 bg-card/50 backdrop-blur-sm border-2 border-border/50 rounded-2xl hover:border-primary/40 hover:bg-card/70 transition-all duration-200 text-left overflow-hidden w-full",
        isSelected && "border-primary bg-primary/5"
      )}
      onClick={onClick}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onMouseMove={handleMouseMove}
      style={{ fontFamily: "Pretendard, sans-serif" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="relative">
            <div
              ref={titleRef}
              className="font-bold text-sm md:text-base leading-snug mb-2 group-hover:text-primary transition-colors line-clamp-2"
            >
              {precedent.name}
            </div>

            {/* 툴팁 - 실제로 잘렸을 때만 표시, 2줄까지 */}
            {showTooltip && isTruncated && (
              <div
                className="fixed z-[9999] max-w-xs p-2 bg-popover/95 backdrop-blur border border-border rounded-lg shadow-2xl pointer-events-none"
                style={{
                  fontFamily: "Pretendard, sans-serif",
                  left: `${mousePos.x + 12}px`,
                  top: `${mousePos.y + 16}px`,
                }}
              >
                <p className="text-xs text-popover-foreground line-clamp-2 break-words">
                  {precedent.name}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs md:text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              {precedent.court}
            </span>
            <span className="flex items-center gap-1.5 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              {precedent.caseNumber}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              {formatPrecedentDate(precedent.date)}
            </span>
            {precedent.type && (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {precedent.type}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {precedent.link && (
            <a
              href={precedent.link}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <Icon name="external-link" className="h-4 w-4" />
            </a>
          )}
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors duration-200">
            <Icon name="scale" className="w-4 h-4 text-primary transition-colors" />
          </div>
        </div>
      </div>
    </button>
  )
}

// 판례 상세 패널 (사이드 패널용)
export function PrecedentDetailPanel({
  detail,
  loading,
  onClose,
  onContentClick,
  onViewPrecedent
}: {
  detail: PrecedentDetail | null
  loading: boolean
  onClose: () => void
  onContentClick?: (e: React.MouseEvent) => void
  onViewPrecedent?: (precedent: PrecedentSearchResult) => void
}) {
  // 관련 심급 판례 상태
  const [relatedPrecedents, setRelatedPrecedents] = React.useState<PrecedentSearchResult[]>([])
  const [loadingRelated, setLoadingRelated] = React.useState(false)
  const [showRelated, setShowRelated] = React.useState(false)

  // 관련 심급 판례 검색 (이미 로드된 목록에서 제목 유사도로 필터링)
  React.useEffect(() => {
    if (!detail || !showRelated) {
      setRelatedPrecedents([])
      setLoadingRelated(false)
      return
    }

    setLoadingRelated(true)

    // 비동기 처리를 위해 setTimeout 사용 (UI 블로킹 방지)
    const timeoutId = setTimeout(() => {
      try {
        const currentName = detail.name || ''

        // 현재 판례는 제외
        const filtered = precedents.filter(p => p.caseNumber !== detail.caseNumber)

        // 제목 유사도 계산 (간단한 단어 매칭)
        const scored = filtered.map(p => {
          const targetName = p.name || ''

          // 제목이 비어있으면 점수 0
          if (!currentName || !targetName) return { precedent: p, score: 0 }

          // 단어 단위로 분리 (공백 기준)
          const currentWords = currentName.split(/\s+/).filter(w => w.length > 1)
          const targetWords = targetName.split(/\s+/).filter(w => w.length > 1)

          // 공통 단어 개수 계산
          const commonWords = currentWords.filter(w => targetWords.includes(w)).length

          // 점수: 공통 단어 개수 / 현재 판례 단어 개수 (0~1)
          const score = currentWords.length > 0 ? commonWords / currentWords.length : 0

          return { precedent: p, score }
        })

        // 점수가 0.3 이상인 것만 필터링 (30% 이상 유사)
        const related = scored
          .filter(s => s.score >= 0.3)
          .sort((a, b) => {
            // 점수 내림차순
            if (b.score !== a.score) return b.score - a.score
            // 점수 같으면 날짜 오름차순 (오래된 것 먼저)
            const dateA = a.precedent.date?.replace(/[.\-]/g, '') || ''
            const dateB = b.precedent.date?.replace(/[.\-]/g, '') || ''
            return dateA.localeCompare(dateB)
          })
          .map(s => s.precedent)

        setRelatedPrecedents(related)
      } catch (e) {
        console.error('관련 심급 검색 실패:', e)
        setRelatedPrecedents([])
      } finally {
        setLoadingRelated(false)
      }
    }, 0)

    return () => clearTimeout(timeoutId)
  }, [detail?.caseNumber, showRelated, precedents])

  // HTML 정리 + 링크 생성
  const processHtml = React.useCallback((html: string) => {
    if (!html) return ''
    const cleaned = html
      .replace(/<br\\>/g, '<br>')
      .replace(/<br\s*\/?>/gi, '<br>')
      .replace(/&nbsp;/g, ' ')
      // 【】 뒤의 연속 공백을 탭 하나로 정리
      .replace(/【([^】]*)】\s{2,}/g, '【$1】\t')
      // 연속된 빈줄 제거 (br 사이 공백 포함)
      .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
      // 시작 빈줄 제거
      .replace(/^(\s*<br\s*\/?>\s*)+/gi, '')
      // 끝 빈줄 제거
      .replace(/(\s*<br\s*\/?>\s*)+$/gi, '')
      // 연속된 일반 공백/줄바꿈도 정리 (3개 이상 → 2개로)
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s{3,}/g, '  ')
      .trim()

    let result = generateLinks(cleaned, {
      mode: 'aggressive',
      enablePrecedents: true,
    })

    // 원심판결 섹션 내 판례 링크 제거 (판결문 번호는 링크 불필요)
    // 【원심판결】 ~ 다음 【 사이의 precedent-ref 링크를 일반 텍스트로 변환
    result = result.replace(
      /【\s*원심\s*판결\s*】[\s\S]*?(?=【|$)/gi,
      (section) => {
        // 원심판결 섹션 내의 모든 precedent-ref 링크를 텍스트로 변환
        return section.replace(
          /<a[^>]*class="[^"]*precedent-ref[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
          '$1'
        )
      }
    )

    return result
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Icon name="loader" className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">판례를 선택하세요</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-3">
        {/* 헤더 */}
        <div className="space-y-2">
          <h3 className="font-bold text-lg">{detail.name}</h3>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="px-2 py-1 bg-muted rounded">{detail.court}</span>
            <span className="px-2 py-1 bg-muted rounded">{detail.caseNumber}</span>
            <span className="px-2 py-1 bg-muted rounded">{formatPrecedentDate(detail.date)}</span>
            {detail.judgmentType && (
              <span className="px-2 py-1 bg-muted rounded">{detail.judgmentType}</span>
            )}
          </div>
        </div>

        {/* 관련 심급 (1심/2심/3심) */}
        <div>
          <button
            onClick={() => setShowRelated(!showRelated)}
            className="flex items-center gap-1.5 font-semibold text-foreground text-[15px] mb-1 hover:text-primary transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            관련 심급
            <Icon
              name={showRelated ? "chevron-up" : "chevron-down"}
              className="h-4 w-4 text-muted-foreground"
            />
            {relatedPrecedents.length > 0 && (
              <span className="text-xs text-muted-foreground">({relatedPrecedents.length})</span>
            )}
          </button>
          {showRelated && (
            <div className="bg-muted/30 p-3 rounded-lg space-y-2">
              {loadingRelated ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon name="loader" className="h-4 w-4 animate-spin" />
                  관련 심급 검색 중...
                </div>
              ) : relatedPrecedents.length === 0 ? (
                <p className="text-sm text-muted-foreground">관련 심급 판례가 없습니다</p>
              ) : (
                relatedPrecedents.map((prec) => (
                  <button
                    key={prec.id}
                    onClick={() => onViewPrecedent?.(prec)}
                    className="w-full text-left p-2 bg-background/50 rounded hover:bg-background transition-colors"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-xs font-medium",
                        prec.court.includes("대법원") ? "bg-purple-500/20 text-purple-400" :
                        prec.court.includes("고등") ? "bg-blue-500/20 text-blue-400" :
                        "bg-green-500/20 text-green-400"
                      )}>
                        {prec.court.includes("대법원") ? "3심" :
                         prec.court.includes("고등") ? "2심" : "1심"}
                      </span>
                      <span className="font-medium truncate">{prec.caseNumber}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                      <span>{prec.court}</span>
                      <span>•</span>
                      <span>{formatPrecedentDate(prec.date)}</span>
                      {prec.type && (
                        <>
                          <span>•</span>
                          <span>{prec.type}</span>
                        </>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* 판시사항 */}
        {detail.holdings && (
          <div>
            <h4 className="flex items-center gap-1.5 font-semibold text-foreground text-[15px] mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-foreground" />판시사항
            </h4>
            <div
              className="text-sm leading-relaxed text-foreground/80 bg-muted/30 p-3 rounded-lg"
              onClick={onContentClick}
              dangerouslySetInnerHTML={{ __html: processHtml(detail.holdings) }}
            />
          </div>
        )}

        {/* 판결요지 */}
        {detail.summary && (
          <div>
            <h4 className="flex items-center gap-1.5 font-semibold text-foreground text-[15px] mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-foreground" />판결요지
            </h4>
            <div
              className="text-sm leading-relaxed text-foreground/80 bg-muted/30 p-3 rounded-lg"
              onClick={onContentClick}
              dangerouslySetInnerHTML={{ __html: processHtml(detail.summary) }}
            />
          </div>
        )}

        {/* 참조조문 */}
        {detail.refStatutes && (
          <div>
            <h4 className="flex items-center gap-1.5 font-semibold text-foreground text-[15px] mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-foreground" />참조조문
            </h4>
            <div
              className="text-sm leading-relaxed text-foreground/80 bg-muted/30 p-3 rounded-lg"
              onClick={onContentClick}
              dangerouslySetInnerHTML={{ __html: processHtml(detail.refStatutes) }}
            />
          </div>
        )}

        {/* 참조판례 */}
        {detail.refPrecedents && (
          <div>
            <h4 className="flex items-center gap-1.5 font-semibold text-foreground text-[15px] mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-foreground" />참조판례
            </h4>
            <div
              className="text-sm leading-relaxed text-foreground/80 bg-muted/30 p-3 rounded-lg"
              onClick={onContentClick}
              dangerouslySetInnerHTML={{ __html: processHtml(detail.refPrecedents) }}
            />
          </div>
        )}

        {/* 전문 */}
        {detail.fullText && (
          <div>
            <h4 className="flex items-center gap-1.5 font-semibold text-foreground text-[15px] mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-foreground" />판결 전문
            </h4>
            <div
              className="text-sm leading-relaxed text-foreground/80 bg-muted/30 p-3 rounded-lg whitespace-pre-wrap"
              onClick={onContentClick}
              dangerouslySetInnerHTML={{ __html: processHtml(detail.fullText) }}
            />
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
