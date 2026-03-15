"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { ThemeToggle } from "@/components/theme-toggle"
import { LawStatsFooter } from "@/components/shared/law-stats-footer"
import { cn } from "@/lib/utils"
import { useOrdinanceBenchmark } from "@/hooks/use-ordinance-benchmark"
import type { BenchmarkOrdinanceResult } from "@/lib/ordinance-benchmark/types"
import { METRO_MUNICIPALITIES } from "@/lib/ordinance-benchmark/municipality-codes"

/** 간단한 Markdown → HTML (테이블 + 리스트 + 볼드) */
function markdownToHtml(md: string): string {
  if (!md) return ''
  let html = md
    // 테이블
    .replace(/^\|(.+)\|$/gm, (_, row) => {
      const cells = row.split('|').map((c: string) => c.trim())
      return `<tr>${cells.map((c: string) => `<td>${c}</td>`).join('')}</tr>`
    })
    .replace(/(<tr>[\s\S]*?<\/tr>)/g, (match) => {
      if (!match.includes('<table>')) return match
      return match
    })
  // 구분선 행 제거
  html = html.replace(/<tr><td>[-:]+<\/td>(?:<td>[-:]+<\/td>)*<\/tr>/g, '')
  // 연속 tr을 table로 감싸기
  html = html.replace(/((?:<tr>.*?<\/tr>\s*)+)/g, '<table>$1</table>')
  // 첫 tr을 thead로
  html = html.replace(/<table><tr>(.*?)<\/tr>/, '<table><thead><tr>$1</tr></thead><tbody>')
  html = html.replace(/<\/table>/, '</tbody></table>')
  // td → th (thead 내)
  html = html.replace(/<thead><tr>(.*?)<\/tr><\/thead>/g, (_, inner) => {
    return `<thead><tr>${inner.replace(/<td>/g, '<th>').replace(/<\/td>/g, '</th>')}</tr></thead>`
  })
  // 리스트
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
  html = html.replace(/((?:<li>.*?<\/li>\s*)+)/g, '<ul>$1</ul>')
  // 볼드
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // 줄바꿈
  html = html.replace(/\n/g, '<br/>')
  // 정리
  html = html.replace(/<br\/><ul>/g, '<ul>').replace(/<\/ul><br\/>/g, '</ul>')
  html = html.replace(/<br\/><table>/g, '<table>').replace(/<\/table><br\/>/g, '</table>')
  return html
}

interface OrdinanceBenchmarkViewProps {
  initialKeyword?: string
  onBack: () => void
  onHomeClick?: () => void
}

export function OrdinanceBenchmarkView({ initialKeyword, onBack, onHomeClick }: OrdinanceBenchmarkViewProps) {
  const [inputValue, setInputValue] = useState(initialKeyword || '')
  // AI 비교 분석 상태
  const [aiAnalysis, setAiAnalysis] = useState<{ comparisonTable: string; highlights: string } | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  // 헤더 스크롤 표시/숨김
  const [isHeaderVisible, setIsHeaderVisible] = useState(true)
  const lastScrollY = useRef(0)
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY
      if (y < 30) { setIsHeaderVisible(true); lastScrollY.current = y; return }
      const delta = y - lastScrollY.current
      if (Math.abs(delta) > 8) { setIsHeaderVisible(delta <= 0); lastScrollY.current = y }
      if (scrollTimer.current) clearTimeout(scrollTimer.current)
      scrollTimer.current = setTimeout(() => setIsHeaderVisible(true), 200)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])
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

  // AI 비교 분석 실행
  const handleAiAnalysis = useCallback(async () => {
    if (flatResults.length < 2) return
    setAiLoading(true)
    setAiError(null)
    setAiAnalysis(null)

    try {
      const ordinancesForAnalysis = flatResults
        .filter(r => r.ordinanceSeq)
        .slice(0, 8)
        .map(r => ({
          orgShortName: r.orgShortName,
          ordinanceName: r.ordinanceName,
          ordinanceSeq: r.ordinanceSeq!,
        }))

      const res = await fetch('/api/benchmark-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, ordinances: ordinancesForAnalysis }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(data.error)
      }

      const data = await res.json()
      setAiAnalysis(data)
    } catch (err: any) {
      setAiError(err.message || 'AI 분석 실패')
    } finally {
      setAiLoading(false)
    }
  }, [flatResults, keyword])

  // 지자체별 매칭 여부 맵
  const matchedSet = new Set<string>()
  flatResults.forEach(r => matchedSet.add(r.orgCode))

  const handleLogoClick = () => { onHomeClick?.() }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 헤더 — 영향 추적기와 동일한 패턴 */}
      <header
        className="sticky top-0 z-50 shadow-sm border-b border-gray-200 dark:border-gray-800/60 bg-content-bg transition-transform duration-400"
        style={{ transform: isHeaderVisible ? 'translateY(0)' : 'translateY(-100%)' }}
      >
        <div className="container mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            <button onClick={handleLogoClick} className="flex items-center gap-3 group">
              <div className="flex h-10 w-10 items-center justify-center bg-brand-navy text-white dark:text-background shadow-md transition-transform duration-300 group-hover:scale-105">
                <Icon name="scale" size={22} />
              </div>
              <span
                className="text-xl lg:text-2xl font-medium italic text-brand-navy tracking-tight"
                style={{ fontFamily: "'Libre Bodoni', serif", fontWeight: 500, fontStyle: 'italic', fontVariationSettings: "'wght' 500" }}
              >
                LexDiff
              </span>
            </button>
            <div className="flex items-center gap-2 lg:gap-4">
              <ThemeToggle />
              <Button variant="ghost" size="sm" onClick={onBack} title="뒤로가기" className="hover:bg-gray-200 dark:hover:bg-gray-800">
                <Icon name="arrow-left" size={18} className="text-gray-600 dark:text-gray-400" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* 페이지 타이틀 */}
        <div className="pt-2">
          <h1 className="text-2xl lg:text-3xl font-bold text-brand-navy dark:text-foreground flex items-center gap-3">
            <Icon name="bar-chart" size={28} className="text-brand-gold" />
            조례 벤치마킹
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            전국 17개 광역시도의 동일 주제 조례를 검색하고, AI로 핵심 항목을 비교 분석합니다.
          </p>
        </div>

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

            {/* AI 비교 분석 */}
            <Card className="p-4">
              {!aiAnalysis && !aiLoading && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon name="sparkles" size={16} className="text-brand-navy dark:text-brand-gold" />
                    <span className="text-sm font-medium">AI 비교 분석</span>
                    <span className="text-xs text-muted-foreground">상위 조례의 핵심 항목을 비교합니다</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleAiAnalysis}
                    disabled={flatResults.length < 2}
                    className="h-8"
                  >
                    <Icon name="sparkles" size={14} className="mr-1" />
                    비교 분석 요청
                  </Button>
                </div>
              )}

              {aiLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center space-y-2">
                    <Icon name="loader" size={24} className="animate-spin text-brand-navy dark:text-brand-gold mx-auto" />
                    <p className="text-sm text-muted-foreground">AI가 조례 본문을 비교 분석하고 있습니다...</p>
                  </div>
                </div>
              )}

              {aiError && (
                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                  <Icon name="alert-circle" size={16} />
                  {aiError}
                  <Button variant="outline" size="sm" className="h-6 px-2 text-xs ml-2" onClick={handleAiAnalysis}>
                    다시 시도
                  </Button>
                </div>
              )}

              {aiAnalysis && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name="sparkles" size={16} className="text-brand-navy dark:text-brand-gold" />
                    <span className="text-sm font-medium">AI 비교 분석 결과</span>
                  </div>
                  {/* 비교표 (Markdown 렌더링) */}
                  <div className="overflow-x-auto text-sm prose prose-sm dark:prose-invert max-w-none
                    [&_table]:w-full [&_table]:border-collapse
                    [&_th]:bg-muted/50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:border [&_th]:border-border
                    [&_td]:px-3 [&_td]:py-2 [&_td]:text-xs [&_td]:border [&_td]:border-border">
                    <div dangerouslySetInnerHTML={{ __html: markdownToHtml(aiAnalysis.comparisonTable) }} />
                  </div>
                  {/* 주요 차이점 */}
                  {aiAnalysis.highlights && (
                    <div className="bg-muted/30 rounded-lg p-4 text-sm prose prose-sm dark:prose-invert max-w-none">
                      <div dangerouslySetInnerHTML={{ __html: markdownToHtml(aiAnalysis.highlights) }} />
                    </div>
                  )}
                </div>
              )}
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

      {/* 푸터 */}
      <LawStatsFooter />
    </div>
  )
}
