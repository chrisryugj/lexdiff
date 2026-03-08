/**
 * search-result-view/SearchResultList.tsx
 *
 * 검색 결과 리스트 컴포넌트 (법령/조례 선택)
 */

"use client"

import React, { memo } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatDate } from "@/lib/revision-parser"
import { getLawTypeBadgeClass } from "./utils"
import type { LawSearchResult, OrdinanceSearchResult, RelatedSearch, SearchQuery, InterpretationSearchResult, RulingSearchResult } from "./types"

// ============================================================
// 헬퍼 함수
// ============================================================

/** 페이지네이션 번호 생성 (판례 리스트와 동일) */
function generatePageNumbers(currentPage: number, totalPages: number): (number | string)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages: (number | string)[] = [1]

  if (currentPage > 3) pages.push('...')

  const start = Math.max(2, currentPage - 1)
  const end = Math.min(totalPages - 1, currentPage + 1)

  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  if (currentPage < totalPages - 2) pages.push('...')

  pages.push(totalPages)

  return pages
}

// ============================================================
// 법령 검색 결과 리스트
// ============================================================

interface LawSearchResultListProps {
  results: LawSearchResult[]
  query: SearchQuery
  relatedSearches: RelatedSearch[]
  onSelect: (law: LawSearchResult) => void
  onCancel: () => void
}

export const LawSearchResultList = memo(function LawSearchResultList({
  results,
  query,
  relatedSearches,
  onSelect,
  onCancel,
}: LawSearchResultListProps) {
  return (
    <div className="py-4 md:py-8">
      {/* 헤더 섹션 - Glassmorphism */}
      <div className="sticky top-0 z-10 -mx-6 px-6 py-4 mb-8 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground" style={{ fontFamily: "Pretendard, sans-serif" }}>
              법령 검색 결과
            </h2>
            <Badge
              variant="secondary"
              className="h-7 px-3 bg-gradient-to-r from-primary/5 to-accent/5 text-foreground/80 border border-border font-semibold"
              style={{ fontFamily: "Pretendard, sans-serif" }}
            >
              {results.length}건
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <Icon name="chevron-left" className="w-4 h-4 mr-2" />
            취소
          </Button>
        </div>
      </div>

      {/* 검색 결과 그리드 */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {results.map((law, index) => (
          <LawResultCard
            key={law.lawId || law.mst}
            law={law}
            index={index}
            onSelect={onSelect}
          />
        ))}
      </div>

      {/* 관련 검색어 제안 */}
      {relatedSearches.length > 0 && (
        <RelatedSearchesSection
          relatedSearches={relatedSearches}
          onSelect={onSelect}
        />
      )}
    </div>
  )
})

// ============================================================
// 법령 결과 카드
// ============================================================

interface LawResultCardProps {
  law: LawSearchResult
  index: number
  onSelect: (law: LawSearchResult) => void
}

const LawResultCard = memo(function LawResultCard({
  law,
  index,
  onSelect,
}: LawResultCardProps) {
  const [showTooltip, setShowTooltip] = React.useState(false)
  const [isTruncated, setIsTruncated] = React.useState(false)
  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 })
  const titleRef = React.useRef<HTMLHeadingElement>(null)
  const lawName = String(law.lawName)

  // ResizeObserver로 truncated 상태 동적 감지
  React.useEffect(() => {
    const element = titleRef.current
    if (!element) return

    const checkTruncated = () => {
      setIsTruncated(element.scrollWidth > element.clientWidth)
    }

    checkTruncated()

    const observer = new ResizeObserver(checkTruncated)
    observer.observe(element)

    return () => observer.disconnect()
  }, [lawName])

  const handleMouseMove = React.useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY })
  }, [])

  return (
    <button
      onClick={() => onSelect(law)}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onMouseMove={handleMouseMove}
      className="group relative p-4 md:p-5 bg-card/50 backdrop-blur-sm border-2 border-border/50 rounded-xl hover:border-primary/40 hover:bg-card/70 transition-all duration-200 text-left overflow-hidden animate-fade-in"
      style={{
        animationDelay: `${index * 50}ms`,
        fontFamily: "Pretendard, sans-serif"
      }}
    >
      {/* 법령명 - 한 줄 말줄임 */}
      <div className="relative mb-2.5">
        <h4
          ref={titleRef}
          title={lawName}
          className="font-bold text-sm md:text-base leading-tight truncate group-hover:text-primary transition-colors"
        >
          {lawName}
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
              {lawName}
            </p>
          </div>
        )}
      </div>

      {/* 배지들 - 1열 컴팩트 배치 */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <Badge
          variant="outline"
          className={`text-xs px-2 py-0.5 ${getLawTypeBadgeClass(String(law.lawType))}`}
        >
          {String(law.lawType)}
        </Badge>
        {law.promulgationDate && (
          <Badge variant="outline" className="text-xs px-2 py-0.5 bg-muted text-muted-foreground border-border">
            공포 {formatDate(String(law.promulgationDate))}
          </Badge>
        )}
        {law.effectiveDate && (
          <Badge variant="outline" className="text-xs px-2 py-0.5 bg-muted text-muted-foreground border-border">
            시행 {formatDate(String(law.effectiveDate))}
          </Badge>
        )}
      </div>
    </button>
  )
})

// ============================================================
// 관련 검색어 섹션
// ============================================================

interface RelatedSearchesSectionProps {
  relatedSearches: RelatedSearch[]
  onSelect: (law: LawSearchResult) => void
}

const RelatedSearchesSection = memo(function RelatedSearchesSection({
  relatedSearches,
  onSelect,
}: RelatedSearchesSectionProps) {
  return (
    <div className="max-w-6xl mx-auto mt-8 p-4 md:p-6 bg-card/30 backdrop-blur-sm border border-border/50 rounded-2xl">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="sparkles" className="w-5 h-5 text-[#b5952f] dark:text-[#e2a85d]" />
        <h3 className="text-lg font-semibold text-foreground" style={{ fontFamily: "Pretendard, sans-serif" }}>
          관련 검색어
        </h3>
      </div>
      <div className="space-y-4">
        {relatedSearches.map(({ keyword, results }) => (
          <div key={keyword}>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-xs bg-[#d4af37]/10 text-[#b5952f] dark:bg-[#e2a85d]/10 dark:text-[#e2a85d] border-[#d4af37]/20 dark:border-[#e2a85d]/30">
                {keyword}
              </Badge>
              <span className="text-xs text-muted-foreground">{results.length}건</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {results.slice(0, 4).map((law) => (
                <button
                  key={law.lawId || law.mst}
                  onClick={() => onSelect(law)}
                  className="group relative p-4 bg-card/50 border border-border/50 rounded-xl hover:border-[#d4af37]/50 hover:shadow-lg transition-all duration-200 text-left"
                  style={{ fontFamily: "Pretendard, sans-serif" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm leading-snug mb-1 group-hover:text-[#b5952f] dark:group-hover:text-[#e2a85d] transition-colors">
                        {String(law.lawName)}
                      </h4>
                      <Badge variant="secondary" className={`text-xs ${getLawTypeBadgeClass(String(law.lawType))}`}>
                        {String(law.lawType)}
                      </Badge>
                    </div>
                    <Icon name="chevron-left" className="w-4 h-4 rotate-180 text-muted-foreground group-hover:text-[#b5952f] dark:group-hover:text-[#e2a85d] transition-colors flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
            {results.length > 4 && (
              <p className="text-xs text-muted-foreground mt-2">
                외 {results.length - 4}건 더 있음
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
})

// ============================================================
// 조례 검색 결과 리스트
// ============================================================

interface OrdinanceSearchResultListProps {
  results: OrdinanceSearchResult[]
  totalCount?: number  // ✅ 전체 개수 (API에서 받은 totalCnt)
  currentPage?: number  // 현재 페이지 (서버 사이드 페이지네이션)
  pageSize?: number  // 페이지당 개수
  isLoading?: boolean  // 로딩 상태
  query: { lawName: string }
  onSelect: (ordinance: OrdinanceSearchResult) => void
  onPageChange?: (page: number) => void  // 페이지 변경 핸들러
  onPageSizeChange?: (size: number) => void  // 페이지 크기 변경 핸들러
  onCancel: () => void
}

export const OrdinanceSearchResultList = memo(function OrdinanceSearchResultList({
  results,
  totalCount = 0,
  currentPage = 1,
  pageSize = 20,
  isLoading = false,
  query,
  onSelect,
  onPageChange,
  onPageSizeChange,
  onCancel,
}: OrdinanceSearchResultListProps) {
  const [filterKeyword, setFilterKeyword] = React.useState("")

  // 키워드 필터링 (클라이언트 사이드 - 현재 페이지 내에서만)
  const filteredResults = React.useMemo(() => {
    if (!filterKeyword.trim()) return results
    const keyword = filterKeyword.toLowerCase()
    return results.filter(
      (ord) =>
        ord.ordinName.toLowerCase().includes(keyword) ||
        ord.orgName?.toLowerCase().includes(keyword) ||
        ord.ordinKind?.toLowerCase().includes(keyword)
    )
  }, [results, filterKeyword])

  // 서버 사이드 페이지네이션
  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <div className="py-4 md:py-8">
      {/* 헤더 섹션 */}
      <div className="sticky top-0 z-10 -mx-6 px-6 py-4 mb-8 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground" style={{ fontFamily: "Pretendard, sans-serif" }}>
                조례 검색 결과
              </h2>
              <Badge
                variant="secondary"
                className="h-7 px-3 bg-gradient-to-r from-blue-500/5 to-cyan-500/5 text-foreground/80 border border-border font-semibold"
                style={{ fontFamily: "Pretendard, sans-serif" }}
              >
                {totalCount ? `${totalCount.toLocaleString()}건` : `${filteredResults.length}건`}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <Icon name="chevron-left" className="w-4 h-4 mr-2" />
              취소
            </Button>
          </div>

          {/* 필터 + 키워드 검색 + 표시개수 (판례 UI와 동일) */}
          <div className="flex flex-wrap items-center gap-3">
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
            {onPageSizeChange && (
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
            )}
          </div>
        </div>
      </div>

      {/* 검색 결과 그리드 */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {isLoading ? (
          // 로딩 스켈레톤
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-5 bg-card/50 border-2 border-border/50 rounded-2xl animate-pulse">
              <div className="h-5 bg-muted rounded w-3/4 mb-3" />
              <div className="h-4 bg-muted rounded w-1/2 mb-3" />
              <div className="flex gap-2">
                <div className="h-6 bg-muted rounded w-16" />
                <div className="h-6 bg-muted rounded w-20" />
              </div>
            </div>
          ))
        ) : filteredResults.length === 0 ? (
          <div className="col-span-2 text-center py-12 text-muted-foreground">
            <Icon name="file-search" className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">검색 결과가 없습니다.</p>
          </div>
        ) : (
          filteredResults.map((ordinance, index) => (
            <OrdinanceResultCard
              key={ordinance.ordinSeq}
              ordinance={ordinance}
              index={index}
              onSelect={onSelect}
            />
          ))
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && !isLoading && onPageChange && (
        <div className="max-w-6xl mx-auto mt-8 flex items-center justify-center gap-2">
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
// 조례 결과 카드
// ============================================================

interface OrdinanceResultCardProps {
  ordinance: OrdinanceSearchResult
  index: number
  onSelect: (ordinance: OrdinanceSearchResult) => void
}

const OrdinanceResultCard = memo(function OrdinanceResultCard({
  ordinance,
  index,
  onSelect,
}: OrdinanceResultCardProps) {
  const [showTooltip, setShowTooltip] = React.useState(false)
  const [isTruncated, setIsTruncated] = React.useState(false)
  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 })
  const titleRef = React.useRef<HTMLHeadingElement>(null)
  const ordinName = String(ordinance.ordinName)

  // ResizeObserver로 truncated 상태 동적 감지
  React.useEffect(() => {
    const element = titleRef.current
    if (!element) return

    const checkTruncated = () => {
      setIsTruncated(element.scrollWidth > element.clientWidth)
    }

    checkTruncated()

    const observer = new ResizeObserver(checkTruncated)
    observer.observe(element)

    return () => observer.disconnect()
  }, [ordinName])

  const handleMouseMove = React.useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY })
  }, [])

  return (
    <button
      onClick={() => onSelect(ordinance)}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onMouseMove={handleMouseMove}
      className="group relative p-4 md:p-5 bg-card/50 backdrop-blur-sm border-2 border-border/50 rounded-xl hover:border-primary/40 hover:bg-card/70 transition-all duration-200 text-left overflow-hidden animate-fade-in"
      style={{
        animationDelay: `${index * 50}ms`,
        fontFamily: "Pretendard, sans-serif"
      }}
    >
      {/* 조례명 - 한 줄 말줄임 */}
      <div className="relative mb-2.5">
        <h4
          ref={titleRef}
          title={ordinName}
          className="font-bold text-sm md:text-base leading-tight truncate group-hover:text-primary transition-colors"
        >
          {ordinName}
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
              {ordinName}
            </p>
          </div>
        )}
      </div>

      {/* 배지들 - 1열 컴팩트 배치 */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {ordinance.ordinKind && (
          <Badge
            variant="outline"
            className="text-xs px-2 py-0.5 bg-[#1a2b4c]/10 text-[#1a2b4c] dark:bg-muted dark:text-muted-foreground border-border"
          >
            {String(ordinance.ordinKind)}
          </Badge>
        )}
        {ordinance.orgName && (
          <Badge variant="outline" className="text-xs px-2 py-0.5 bg-muted text-muted-foreground border-border">
            {String(ordinance.orgName)}
          </Badge>
        )}
        {ordinance.effectiveDate && (
          <Badge variant="outline" className="text-xs px-2 py-0.5 bg-muted text-muted-foreground border-border">
            시행 {formatDate(String(ordinance.effectiveDate))}
          </Badge>
        )}
      </div>
    </button>
  )
})

// ============================================================
// 해석례 검색 결과 리스트
// ============================================================

interface InterpretationResultListProps {
  results: InterpretationSearchResult[]
  onBack: () => void
}

export const InterpretationResultList = memo(function InterpretationResultList({
  results,
  onBack,
}: InterpretationResultListProps) {
  return (
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 px-2">
            <Icon name="arrow-left" className="h-4 w-4" />
            돌아가기
          </Button>
          <h3 className="text-base font-semibold text-foreground">
            해석례 검색 결과
          </h3>
          <Badge variant="secondary" className="text-xs">
            {results.length}건
          </Badge>
        </div>
      </div>

      {/* 결과 리스트 */}
      <div className="space-y-2">
        {results.map((item, index) => (
          <a
            key={item.id || index}
            href={item.link || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-4 bg-card/50 border-2 border-border/50 rounded-xl hover:border-primary/40 hover:bg-card/70 transition-all duration-200 animate-fade-in"
            style={{ animationDelay: `${index * 50}ms`, fontFamily: "Pretendard, sans-serif" }}
          >
            <h4 className="font-bold text-sm md:text-base leading-tight mb-2 text-foreground">
              {item.name || '(안건명 없음)'}
            </h4>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {item.number && (
                <Badge variant="outline" className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-300/50">
                  {item.number}
                </Badge>
              )}
              {item.agency && (
                <Badge variant="outline" className="text-xs px-2 py-0.5 bg-muted text-muted-foreground border-border">
                  {item.agency}
                </Badge>
              )}
              {item.date && (
                <Badge variant="outline" className="text-xs px-2 py-0.5 bg-muted text-muted-foreground border-border">
                  회신 {item.date}
                </Badge>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  )
})

interface RulingResultListProps {
  results: RulingSearchResult[]
  onBack: () => void
}

export const RulingResultList = memo(function RulingResultList({
  results,
  onBack,
}: RulingResultListProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 px-2">
            <Icon name="arrow-left" className="h-4 w-4" />
            돌아가기
          </Button>
          <h3 className="text-base font-semibold text-foreground">
            재결례 검색결과
          </h3>
          <Badge variant="secondary" className="text-xs">
            {results.length}건
          </Badge>
        </div>
      </div>

      <div className="space-y-2">
        {results.map((item, index) => (
          <a
            key={item.id || index}
            href={item.link || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-4 bg-card/50 border-2 border-border/50 rounded-xl hover:border-primary/40 hover:bg-card/70 transition-all duration-200 animate-fade-in"
            style={{ animationDelay: `${index * 50}ms`, fontFamily: "Pretendard, sans-serif" }}
          >
            <h4 className="font-bold text-sm md:text-base leading-tight mb-2 text-foreground">
              {item.name || '(사건명 없음)'}
            </h4>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {item.claimNumber && (
                <Badge variant="outline" className="text-xs px-2 py-0.5 bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300/50">
                  {item.claimNumber}
                </Badge>
              )}
              {item.tribunal && (
                <Badge variant="outline" className="text-xs px-2 py-0.5 bg-muted text-muted-foreground border-border">
                  {item.tribunal}
                </Badge>
              )}
              {item.decisionType && (
                <Badge variant="outline" className="text-xs px-2 py-0.5 bg-muted text-muted-foreground border-border">
                  {item.decisionType}
                </Badge>
              )}
              {item.decisionDate && (
                <Badge variant="outline" className="text-xs px-2 py-0.5 bg-muted text-muted-foreground border-border">
                  재결 {item.decisionDate}
                </Badge>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  )
})
