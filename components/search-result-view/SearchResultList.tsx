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
            <h2 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent" style={{ fontFamily: "Pretendard, sans-serif" }}>
              법령 검색 결과
            </h2>
            <Badge
              variant="secondary"
              className="h-7 px-3 bg-primary/10 text-primary border border-primary/20 font-bold"
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
      className="group relative p-5 md:p-6 bg-card/50 backdrop-blur-sm border-2 border-border/50 rounded-2xl hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1 transition-all duration-300 text-left overflow-hidden animate-fade-in"
      style={{
        animationDelay: `${index * 50}ms`,
        fontFamily: "Pretendard, sans-serif"
      }}
    >
      {/* 그라데이션 배경 */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* 콘텐츠 */}
      <div className="relative flex items-start justify-between gap-4">
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
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:scale-110 transition-all duration-300">
          <Icon name="chevron-left" className="w-5 h-5 rotate-180 text-primary group-hover:text-primary-foreground transition-colors" />
        </div>
      </div>

      {/* 하단 글로우 효과 */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-accent to-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
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
  return (
    <div className="py-4 md:py-8">
      {/* 헤더 섹션 */}
      <div className="sticky top-0 z-10 -mx-6 px-6 py-4 mb-8 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent" style={{ fontFamily: "Pretendard, sans-serif" }}>
              조례 검색 결과
            </h2>
            <Badge
              variant="secondary"
              className="h-7 px-3 bg-blue-500/10 text-blue-600 border border-blue-500/20 font-bold"
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
        {results.map((ordinance, index) => (
          <OrdinanceResultCard
            key={ordinance.ordinSeq}
            ordinance={ordinance}
            index={index}
            onSelect={onSelect}
          />
        ))}
      </div>
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
      className="group relative p-5 md:p-6 bg-card/50 backdrop-blur-sm border-2 border-border/50 rounded-2xl hover:border-blue-500/50 hover:shadow-2xl hover:shadow-blue-500/10 hover:-translate-y-1 transition-all duration-300 text-left overflow-hidden animate-fade-in"
      style={{
        animationDelay: `${index * 50}ms`,
        fontFamily: "Pretendard, sans-serif"
      }}
    >
      {/* 그라데이션 배경 */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* 콘텐츠 */}
      <div className="relative flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-base md:text-lg leading-snug mb-2 group-hover:text-blue-600 transition-colors">
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
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500 group-hover:scale-110 transition-all duration-300">
          <Icon name="chevron-left" className="w-5 h-5 rotate-180 text-blue-600 group-hover:text-white transition-colors" />
        </div>
      </div>

      {/* 하단 글로우 효과 */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </button>
  )
})
