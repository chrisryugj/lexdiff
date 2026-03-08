/**
 * search-result-view/PrecedentResultList.tsx
 *
 * 판례 검색 결과 리스트 컴포넌트 (조례와 유사한 카드 형태)
 */

"use client"

import React, { memo, useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { PrecedentSearchResult } from "@/lib/precedent-parser"

// ============================================================
// 판례 검색 결과 리스트
// ============================================================

interface PrecedentResultListProps {
  results: PrecedentSearchResult[]
  totalCount: number
  currentPage: number
  pageSize: number
  isLoading?: boolean
  yearFilter?: string
  courtFilter?: string
  onSelect: (precedent: PrecedentSearchResult) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onBack: () => void
}

export const PrecedentResultList = memo(function PrecedentResultList({
  results,
  totalCount,
  currentPage,
  pageSize,
  isLoading,
  yearFilter,
  courtFilter,
  onSelect,
  onPageChange,
  onPageSizeChange,
  onBack,
}: PrecedentResultListProps) {
  const [filterKeyword, setFilterKeyword] = useState("")

  // 키워드 필터링 (클라이언트 사이드)
  const filteredResults = filterKeyword
    ? results.filter(p =>
        p.name?.toLowerCase().includes(filterKeyword.toLowerCase()) ||
        p.caseNumber?.toLowerCase().includes(filterKeyword.toLowerCase())
      )
    : results

  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <div className="py-4 md:py-8">
      {/* 헤더 섹션 - Glassmorphism */}
      <div className="sticky top-0 z-10 -mx-6 px-6 py-4 mb-6 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground" style={{ fontFamily: "Pretendard, sans-serif" }}>
                판례 검색 결과
              </h2>
              <Badge
                variant="secondary"
                className="h-7 px-3 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 text-foreground/80 border border-blue-500/20 font-semibold"
                style={{ fontFamily: "Pretendard, sans-serif" }}
              >
                {totalCount.toLocaleString()}건
              </Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
              <Icon name="arrow-left" className="h-4 w-4" />
              돌아가기
            </Button>
          </div>

          {/* 필터 배지 + 키워드 검색 + 표시개수 */}
          <div className="flex flex-wrap items-center gap-3">
            {courtFilter && (
              <Badge variant="outline" className="text-sm px-3 py-1 bg-[#1a2b4c]/10 text-[#1a2b4c] dark:bg-muted dark:text-muted-foreground border-border">
                <Icon name="gavel" className="h-3.5 w-3.5 mr-1.5" />
                {courtFilter}
              </Badge>
            )}
            {yearFilter && (
              <Badge variant="outline" className="text-sm px-3 py-1 bg-muted text-muted-foreground border-border">
                <Icon name="calendar" className="h-3.5 w-3.5 mr-1.5" />
                {yearFilter}년
              </Badge>
            )}
            <div className="flex-1 min-w-[200px] max-w-xs">
              <div className="relative">
                <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="결과 내 검색..."
                  value={filterKeyword}
                  onChange={(e) => setFilterKeyword(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
            </div>
            {/* 표시 개수 선택 */}
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
              <SelectTrigger className="w-24 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20개</SelectItem>
                <SelectItem value="50">50개</SelectItem>
                <SelectItem value="100">100개</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* 결과 리스트 - 데스크탑 2열 그리드 */}
      <div className="max-w-6xl mx-auto px-4 md:px-6">
        {isLoading ? (
          // 로딩 스켈레톤 - 2열 그리드
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="p-5 bg-card/50 border-2 border-border/50 rounded-2xl animate-pulse">
                <div className="h-5 bg-muted rounded w-3/4 mb-3" />
                <div className="h-4 bg-muted rounded w-1/2 mb-3" />
                <div className="flex gap-2">
                  <div className="h-6 bg-muted rounded w-16" />
                  <div className="h-6 bg-muted rounded w-20" />
                  <div className="h-6 bg-muted rounded w-14" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Icon name="file-search" className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">검색 결과가 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredResults.map((precedent, idx) => (
              <PrecedentResultCard
                key={precedent.id}
                precedent={precedent}
                index={idx}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && !isLoading && (
        <div className="flex justify-center items-center gap-2 mt-8 px-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="gap-1"
          >
            <Icon name="arrow-left" className="h-4 w-4" />
            이전
          </Button>

          <div className="flex items-center gap-1">
            {generatePageNumbers(currentPage, totalPages).map((page, idx) => (
              page === '...' ? (
                <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">...</span>
              ) : (
                <Button
                  key={page}
                  variant={currentPage === page ? "default" : "ghost"}
                  size="sm"
                  onClick={() => onPageChange(page as number)}
                  className="w-9 h-9"
                >
                  {page}
                </Button>
              )
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="gap-1"
          >
            다음
            <Icon name="arrow-right" className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
})

// ============================================================
// 판례 결과 카드
// ============================================================

interface PrecedentResultCardProps {
  precedent: PrecedentSearchResult
  index: number
  onSelect: (precedent: PrecedentSearchResult) => void
}

const PrecedentResultCard = memo(function PrecedentResultCard({
  precedent,
  index,
  onSelect,
}: PrecedentResultCardProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [isTruncated, setIsTruncated] = useState(false)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const titleRef = useRef<HTMLHeadingElement>(null)

  // ResizeObserver로 truncated 상태 동적 감지 + 폰트 로딩 대기
  useEffect(() => {
    const element = titleRef.current
    if (!element) return

    let mounted = true

    const checkTruncated = () => {
      if (!mounted || !element) return
      // scrollWidth가 clientWidth보다 크면 잘림
      // fallback: 문자열이 충분히 길면 잘렸을 가능성 높음 (20자 이상)
      const isTrunc = element.scrollWidth > element.clientWidth ||
                      (precedent.name?.length || 0) > 25
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

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY })
  }, [])

  // 법원 배지 색상
  const getCourtBadgeClass = (court: string) => {
    if (court?.includes('대법원')) return 'bg-[#d4af37]/10 text-[#b5952f] dark:bg-[#e2a85d]/10 dark:text-[#e2a85d] border-[#d4af37]/20 dark:border-[#e2a85d]/30'
    if (court?.includes('고등') || court?.includes('고법')) return 'bg-[#1a2b4c]/10 text-[#1a2b4c] dark:bg-muted dark:text-muted-foreground border-border'
    if (court?.includes('지방') || court?.includes('지법')) return 'bg-muted text-muted-foreground border-border'
    return 'bg-muted text-muted-foreground border-border'
  }

  // 판결유형 배지 색상
  const getTypeBadgeClass = (type: string) => {
    if (type?.includes('전원합의체')) return 'bg-[#1a2b4c]/10 text-[#1a2b4c] dark:bg-muted dark:text-muted-foreground border-border'
    if (type?.includes('파기')) return 'bg-destructive/10 text-destructive border-destructive/20'
    if (type?.includes('승')) return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
    if (type?.includes('패')) return 'bg-destructive/10 text-destructive border-destructive/20'
    return 'bg-muted text-muted-foreground border-border'
  }

  // 선고일자 포맷
  const formatDate = (date: string) => {
    if (!date) return ''
    // "2025.10.30" -> "2025.10.30"
    // "20251030" -> "2025.10.30"
    if (date.includes('.') || date.includes('-')) return date
    if (date.length === 8) {
      return `${date.slice(0,4)}.${date.slice(4,6)}.${date.slice(6,8)}`
    }
    return date
  }

  return (
    <button
      onClick={() => onSelect(precedent)}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onMouseMove={handleMouseMove}
      className="group relative w-full p-4 md:p-5 bg-card/50 backdrop-blur-sm border-2 border-border/50 rounded-xl hover:border-blue-500/40 hover:bg-card/70 transition-all duration-200 text-left overflow-hidden animate-fade-in"
      style={{
        animationDelay: `${index * 30}ms`,
        fontFamily: "Pretendard, sans-serif"
      }}
    >
      {/* 사건명 - 한 줄 말줄임 */}
      <div className="relative mb-2.5">
        <h4
          ref={titleRef}
          title={precedent.name || '사건명 없음'}
          className="font-bold text-sm md:text-base leading-tight truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
        >
          {precedent.name || '사건명 없음'}
        </h4>

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

      {/* 배지들 - 1열 컴팩트 배치 */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {/* 사건번호 배지 */}
        {precedent.caseNumber && (
          <Badge
            variant="outline"
            className="text-xs font-mono px-2 py-0.5 bg-muted text-muted-foreground border-border"
          >
            {precedent.caseNumber}
          </Badge>
        )}
        {/* 법원명 배지 */}
        {precedent.court && (
          <Badge
            variant="outline"
            className={`text-xs px-2 py-0.5 ${getCourtBadgeClass(precedent.court)}`}
          >
            {precedent.court}
          </Badge>
        )}
        {/* 선고일 배지 */}
        {precedent.date && (
          <Badge
            variant="outline"
            className="text-xs px-2 py-0.5 bg-muted text-muted-foreground border-border"
          >
            {formatDate(precedent.date)}
          </Badge>
        )}
        {/* 판결유형 배지 */}
        {precedent.type && (
          <Badge
            variant="outline"
            className={`text-xs px-2 py-0.5 ${getTypeBadgeClass(precedent.type)}`}
          >
            {precedent.type}
          </Badge>
        )}
      </div>
    </button>
  )
})

// 페이지 번호 생성 헬퍼
function generatePageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages: (number | string)[] = []

  if (current <= 4) {
    pages.push(1, 2, 3, 4, 5, '...', total)
  } else if (current >= total - 3) {
    pages.push(1, '...', total - 4, total - 3, total - 2, total - 1, total)
  } else {
    pages.push(1, '...', current - 1, current, current + 1, '...', total)
  }

  return pages
}
