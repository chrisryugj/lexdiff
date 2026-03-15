"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { useOrdinanceBenchmark } from "@/hooks/use-ordinance-benchmark"
import type { BenchmarkOrdinanceResult } from "@/lib/ordinance-benchmark/types"
import { METRO_MUNICIPALITIES } from "@/lib/ordinance-benchmark/municipality-codes"

interface OrdinanceBenchmarkViewProps {
  initialKeyword?: string
  onBack: () => void
  onHomeClick?: () => void
}

export function OrdinanceBenchmarkView({ initialKeyword, onBack, onHomeClick }: OrdinanceBenchmarkViewProps) {
  const [inputValue, setInputValue] = useState(initialKeyword || '')
  const {
    isSearching,
    progress,
    flatResults,
    keyword,
    error,
    matchedCount,
    totalMunicipalities,
    search,
    cancel,
  } = useOrdinanceBenchmark()

  const handleSearch = () => {
    if (inputValue.trim()) {
      search(inputValue.trim())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  // 지자체별 매칭 여부 맵
  const matchedSet = new Set<string>()
  flatResults.forEach(r => matchedSet.add(r.orgCode))

  return (
    <div className="min-h-screen bg-background">
      {/* 헤더 */}
      <div className="border-b border-border bg-card/50 sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onBack} className="h-8 px-2">
              <Icon name="arrow-left" size={16} className="mr-1" />
              뒤로
            </Button>
            <div className="flex items-center gap-2">
              <Icon name="bar-chart" size={18} className="text-brand-navy dark:text-brand-gold" />
              <h1 className="font-semibold text-sm sm:text-base">조례 벤치마킹</h1>
            </div>
          </div>
          {onHomeClick && (
            <Button variant="ghost" size="sm" onClick={onHomeClick} className="h-8 px-2">
              <Icon name="home" size={16} />
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* 검색 입력 */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="search" size={16} className="text-muted-foreground" />
            <span className="text-sm font-medium">주제 검색</span>
            <span className="text-xs text-muted-foreground">전국 17개 광역시도 조례를 동시 검색합니다</span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="예: 출산장려금, 주차장, 재난안전"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1"
              disabled={isSearching}
            />
            {isSearching ? (
              <Button variant="outline" size="sm" onClick={cancel} className="h-9 px-4">
                <Icon name="x" size={14} className="mr-1" />
                취소
              </Button>
            ) : (
              <Button size="sm" onClick={handleSearch} disabled={!inputValue.trim()} className="h-9 px-4">
                <Icon name="search" size={14} className="mr-1" />
                검색
              </Button>
            )}
          </div>

          {/* 인기 키워드 */}
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            <span className="text-xs text-muted-foreground">추천:</span>
            {['출산장려금', '주차장 설치', '재난안전', '장애인 편의', '청년 지원'].map(kw => (
              <Button
                key={kw}
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[11px]"
                disabled={isSearching}
                onClick={() => { setInputValue(kw); search(kw) }}
              >
                {kw}
              </Button>
            ))}
          </div>
        </Card>

        {/* 진행 상황 */}
        {isSearching && progress && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">
                <Icon name="loader" size={14} className="inline animate-spin mr-1.5" />
                검색 중... {progress.completed}/{progress.total}
              </span>
              <span className="text-xs text-muted-foreground">{progress.current}</span>
            </div>
            <Progress value={(progress.completed / progress.total) * 100} className="h-2" />
          </Card>
        )}

        {/* 에러 */}
        {error && (
          <Card className="p-4 border-red-500/30 bg-red-500/5">
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <Icon name="alert-circle" size={16} />
              {error}
            </div>
          </Card>
        )}

        {/* 결과 */}
        {!isSearching && flatResults.length > 0 && (
          <>
            {/* 요약 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">검색 결과</span>
                <Badge variant="secondary" className="text-xs">
                  {totalMunicipalities}개 시도 중 {matchedCount}개 매칭
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                &ldquo;{keyword}&rdquo; 검색 · 총 {flatResults.length}건
              </span>
            </div>

            {/* 지자체 매칭 히트맵 */}
            <div className="flex flex-wrap gap-1">
              {METRO_MUNICIPALITIES.map(m => (
                <Badge
                  key={m.code}
                  variant={matchedSet.has(m.code) ? "default" : "outline"}
                  className={cn(
                    "text-[10px] px-1.5 py-0.5",
                    matchedSet.has(m.code)
                      ? "bg-brand-navy text-white dark:bg-brand-gold dark:text-black"
                      : "text-muted-foreground opacity-50"
                  )}
                >
                  {m.shortName}
                </Badge>
              ))}
            </div>

            {/* 결과 테이블 */}
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground w-20">지자체</th>
                      <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">조례명</th>
                      <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground w-28">시행일</th>
                      <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground w-24">개정유형</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flatResults.map((r, i) => (
                      <tr
                        key={`${r.orgCode}-${r.ordinanceSeq}-${i}`}
                        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className="text-[10px]">
                            {r.orgShortName}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 font-medium">{r.ordinanceName}</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">
                          {r.effectiveDate || '-'}
                        </td>
                        <td className="px-4 py-2.5">
                          {r.revisionType && (
                            <Badge variant="secondary" className="text-[10px]">{r.revisionType}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {/* 검색 전 초기 상태 */}
        {!isSearching && flatResults.length === 0 && !error && !keyword && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center space-y-3 max-w-sm">
              <Icon name="bar-chart" size={48} className="mx-auto text-muted-foreground/30" />
              <div>
                <p className="text-sm font-medium mb-1">전국 조례 비교 분석</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  동일 주제의 조례를 전국 17개 광역시도에서 검색하여 비교합니다.
                  검색어를 입력하거나 추천 키워드를 선택하세요.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 검색 완료 but 결과 없음 */}
        {!isSearching && flatResults.length === 0 && keyword && !error && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center space-y-2">
              <Icon name="search" size={40} className="mx-auto text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                &ldquo;{keyword}&rdquo;에 해당하는 조례를 찾지 못했습니다.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
