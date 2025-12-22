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
import { formatDate } from "@/lib/revision-parser"
import { getLawTypeBadgeClass } from "./utils"
import type { LawSearchResult, OrdinanceSearchResult, RelatedSearch, SearchQuery } from "./types"

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
  return (
    <button
      onClick={() => onSelect(law)}
      className="group relative p-5 md:p-6 bg-card/50 backdrop-blur-sm border-2 border-border/50 rounded-2xl hover:border-primary/40 hover:bg-card/70 transition-all duration-200 text-left overflow-hidden animate-fade-in"
      style={{
        animationDelay: `${index * 50}ms`,
        fontFamily: "Pretendard, sans-serif"
      }}
    >
      {/* 콘텐츠 */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-base md:text-lg leading-snug mb-2 group-hover:text-primary transition-colors">
                {String(law.lawName)}
              </h4>
              <Badge
                variant="secondary"
                className={`text-xs font-semibold px-3 py-1 ${getLawTypeBadgeClass(String(law.lawType))}`}
              >
                {String(law.lawType)}
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs md:text-sm text-muted-foreground">
            {law.promulgationDate && (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                공포: {formatDate(String(law.promulgationDate))}
              </span>
            )}
            {law.effectiveDate && (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                시행: {formatDate(String(law.effectiveDate))}
              </span>
            )}
          </div>
        </div>

        {/* 화살표 아이콘 */}
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors duration-200">
          <Icon name="chevron-left" className="w-5 h-5 rotate-180 text-primary transition-colors" />
        </div>
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
        <Icon name="sparkles" className="w-5 h-5 text-amber-500" />
        <h3 className="text-lg font-semibold text-foreground" style={{ fontFamily: "Pretendard, sans-serif" }}>
          관련 검색어
        </h3>
      </div>
      <div className="space-y-4">
        {relatedSearches.map(({ keyword, results }) => (
          <div key={keyword}>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                {keyword}
              </Badge>
              <span className="text-xs text-muted-foreground">{results.length}건</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {results.slice(0, 4).map((law) => (
                <button
                  key={law.lawId || law.mst}
                  onClick={() => onSelect(law)}
                  className="group relative p-4 bg-card/50 border border-border/50 rounded-xl hover:border-amber-500/50 hover:shadow-lg transition-all duration-200 text-left"
                  style={{ fontFamily: "Pretendard, sans-serif" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm leading-snug mb-1 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                        {String(law.lawName)}
                      </h4>
                      <Badge variant="secondary" className={`text-xs ${getLawTypeBadgeClass(String(law.lawType))}`}>
                        {String(law.lawType)}
                      </Badge>
                    </div>
                    <Icon name="chevron-left" className="w-4 h-4 rotate-180 text-muted-foreground group-hover:text-amber-500 transition-colors flex-shrink-0" />
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
  query: { lawName: string }
  onSelect: (ordinance: OrdinanceSearchResult) => void
  onCancel: () => void
}

export const OrdinanceSearchResultList = memo(function OrdinanceSearchResultList({
  results,
  query,
  onSelect,
  onCancel,
}: OrdinanceSearchResultListProps) {
  const [filterKeyword, setFilterKeyword] = React.useState("")
  const [itemsPerPage, setItemsPerPage] = React.useState(20)
  const [currentPage, setCurrentPage] = React.useState(1)

  // 실시간 필터링
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

  // 페이지네이션
  const totalPages = Math.ceil(filteredResults.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedResults = filteredResults.slice(startIndex, startIndex + itemsPerPage)

  // 페이지 변경 시 스크롤 최상단으로
  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [currentPage])

  // 필터링 시 1페이지로 리셋
  React.useEffect(() => {
    setCurrentPage(1)
  }, [filterKeyword, itemsPerPage])

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
                {filteredResults.length}건
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

          {/* 필터링 및 페이지네이션 컨트롤 */}
          <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
            {/* 검색 필터 */}
            <div className="relative flex-1 max-w-md">
              <Icon name="search-01" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="조례명, 지자체, 종류로 필터링..."
                value={filterKeyword}
                onChange={(e) => setFilterKeyword(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-muted/30 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                style={{ fontFamily: "Pretendard, sans-serif" }}
              />
            </div>

            {/* 페이지당 개수 선택 */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">표시 개수:</span>
              <div className="flex gap-1">
                {[20, 50, 100].map((count) => (
                  <button
                    key={count}
                    onClick={() => setItemsPerPage(count)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      itemsPerPage === count
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/30 hover:bg-muted/50 text-foreground/80"
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 검색 결과 그리드 */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {paginatedResults.map((ordinance, index) => (
          <OrdinanceResultCard
            key={ordinance.ordinSeq}
            ordinance={ordinance}
            index={index}
            onSelect={onSelect}
          />
        ))}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="max-w-6xl mx-auto mt-8 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="disabled:opacity-50"
          >
            이전
          </Button>

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number
              if (totalPages <= 5) {
                pageNum = i + 1
              } else if (currentPage <= 3) {
                pageNum = i + 1
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i
              } else {
                pageNum = currentPage - 2 + i
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-8 h-8 rounded-md text-sm font-medium transition-colors ${
                    currentPage === pageNum
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/30 hover:bg-muted/50 text-foreground/80"
                  }`}
                >
                  {pageNum}
                </button>
              )
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="disabled:opacity-50"
          >
            다음
          </Button>

          <span className="ml-4 text-sm text-muted-foreground">
            {currentPage} / {totalPages} 페이지
          </span>
        </div>
      )}

      {/* 결과 없음 */}
      {filteredResults.length === 0 && (
        <div className="max-w-6xl mx-auto text-center py-12">
          <p className="text-muted-foreground">필터 조건에 맞는 조례가 없습니다.</p>
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
  return (
    <button
      onClick={() => onSelect(ordinance)}
      className="group relative p-5 md:p-6 bg-card/50 backdrop-blur-sm border-2 border-border/50 rounded-2xl hover:border-primary/40 hover:bg-card/70 transition-all duration-200 text-left overflow-hidden animate-fade-in"
      style={{
        animationDelay: `${index * 50}ms`,
        fontFamily: "Pretendard, sans-serif"
      }}
    >
      {/* 콘텐츠 */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-base md:text-lg leading-snug mb-2 group-hover:text-primary transition-colors">
                {String(ordinance.ordinName)}
              </h4>
              {ordinance.ordinKind && (
                <Badge
                  variant="secondary"
                  className="text-xs font-semibold px-3 py-1 bg-blue-500/10 text-blue-600 border border-blue-500/20"
                >
                  {String(ordinance.ordinKind)}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs md:text-sm text-muted-foreground">
            {ordinance.orgName && (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                {String(ordinance.orgName)}
              </span>
            )}
            {ordinance.effectiveDate && (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                시행: {formatDate(String(ordinance.effectiveDate))}
              </span>
            )}
          </div>
        </div>

        {/* 화살표 아이콘 */}
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors duration-200">
          <Icon name="chevron-left" className="w-5 h-5 rotate-180 text-primary transition-colors" />
        </div>
      </div>
    </button>
  )
})
