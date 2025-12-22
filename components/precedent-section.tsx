/**
 * 판례 섹션 컴포넌트
 * - 하단 미니 목록 (기본)
 * - 사이드 패널 상세 (확장 시)
 */

"use client"

import * as React from "react"
import { Scale, ChevronDown, ChevronUp, ExternalLink, Loader2, AlertCircle, Maximize2, Minimize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { formatPrecedentDate } from "@/lib/precedent-parser"
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
          <Loader2 className="h-4 w-4 animate-spin" />
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
          <AlertCircle className="h-4 w-4" />
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
          <Scale className="h-4 w-4" />
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
            <Scale className="h-4 w-4 text-primary" />
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
                <Maximize2 className="h-3 w-3 mr-1" />
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
                <Minimize2 className="h-3 w-3 mr-1" />
                <span className="text-xs">축소</span>
              </Button>
            )}
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
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
  return (
    <button
      className={cn(
        "group relative p-4 bg-card/50 backdrop-blur-sm border-2 border-border/50 rounded-2xl hover:border-primary/40 hover:bg-card/70 transition-all duration-200 text-left overflow-hidden w-full",
        isSelected && "border-primary bg-primary/5"
      )}
      onClick={onClick}
      style={{ fontFamily: "Pretendard, sans-serif" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm md:text-base leading-snug mb-2 group-hover:text-primary transition-colors line-clamp-2">
            {precedent.name}
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
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors duration-200">
            <Scale className="w-4 h-4 text-primary transition-colors" />
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
  onClose
}: {
  detail: PrecedentDetail | null
  loading: boolean
  onClose: () => void
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
      <div className="p-4 space-y-4">
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

        {/* 판시사항 */}
        {detail.holdings && (
          <div>
            <h4 className="font-semibold text-sm mb-2 text-primary">판시사항</h4>
            <div
              className="text-sm leading-relaxed bg-muted/30 p-3 rounded-lg"
              dangerouslySetInnerHTML={{ __html: detail.holdings }}
            />
          </div>
        )}

        {/* 판결요지 */}
        {detail.summary && (
          <div>
            <h4 className="font-semibold text-sm mb-2 text-primary">판결요지</h4>
            <div
              className="text-sm leading-relaxed bg-muted/30 p-3 rounded-lg"
              dangerouslySetInnerHTML={{ __html: detail.summary }}
            />
          </div>
        )}

        {/* 참조조문 */}
        {detail.refStatutes && (
          <div>
            <h4 className="font-semibold text-sm mb-2 text-muted-foreground">참조조문</h4>
            <div
              className="text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: detail.refStatutes }}
            />
          </div>
        )}

        {/* 참조판례 */}
        {detail.refPrecedents && (
          <div>
            <h4 className="font-semibold text-sm mb-2 text-muted-foreground">참조판례</h4>
            <div
              className="text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: detail.refPrecedents }}
            />
          </div>
        )}

        {/* 전문 */}
        {detail.fullText && (
          <div>
            <h4 className="font-semibold text-sm mb-2 text-muted-foreground">판결 전문</h4>
            <div
              className="text-sm leading-relaxed bg-muted/20 p-3 rounded-lg max-h-[400px] overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: detail.fullText }}
            />
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
