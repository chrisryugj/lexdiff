"use client"

import { useState, useCallback, useRef, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Checkbox } from "@/components/ui/checkbox"
import { ThemeToggle } from "@/components/theme-toggle"
import { LawStatsFooter } from "@/components/shared/law-stats-footer"
import { cn } from "@/lib/utils"
import { useOrdinanceBenchmark } from "@/hooks/use-ordinance-benchmark"
import type { BenchmarkOrdinanceResult } from "@/lib/ordinance-benchmark/types"
import { REGIONS } from "@/lib/ordinance-benchmark/municipality-codes"
import { ReferenceModal } from "@/components/reference-modal"
import { parseOrdinanceXML } from "@/lib/ordin-parser"
import { extractArticleText } from "@/lib/law-xml-parser"

// ── 유틸 ──────────────────────────────────────────────────

function formatDate(raw: string): string {
  if (!raw || raw.length !== 8) return raw || '-'
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

function revisionBadgeClass(type: string): string {
  if (type.includes('제정')) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
  if (type.includes('전부개정')) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400'
  if (type.includes('일부개정')) return 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400'
  if (type.includes('폐지')) return 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
  return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
}

function markdownToHtml(md: string): string {
  if (!md) return ''
  let html = md
    .replace(/^\|(.+)\|$/gm, (_, row) => {
      const cells = row.split('|').map((c: string) => c.trim())
      return `<tr>${cells.map((c: string) => `<td>${c}</td>`).join('')}</tr>`
    })
    .replace(/(<tr>[\s\S]*?<\/tr>)/g, (match) => match)
  html = html.replace(/<tr><td>[-:]+<\/td>(?:<td>[-:]+<\/td>)*<\/tr>/g, '')
  html = html.replace(/((?:<tr>.*?<\/tr>\s*)+)/g, '<table>$1</table>')
  html = html.replace(/<table><tr>(.*?)<\/tr>/, '<table><thead><tr>$1</tr></thead><tbody>')
  html = html.replace(/<\/table>/, '</tbody></table>')
  html = html.replace(/<thead><tr>(.*?)<\/tr><\/thead>/g, (_, inner) =>
    `<thead><tr>${inner.replace(/<td>/g, '<th>').replace(/<\/td>/g, '</th>')}</tr></thead>`)
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
  html = html.replace(/((?:<li>.*?<\/li>\s*)+)/g, '<ul>$1</ul>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\n/g, '<br/>')
  html = html.replace(/<br\/><ul>/g, '<ul>').replace(/<\/ul><br\/>/g, '</ul>')
  html = html.replace(/<br\/><table>/g, '<table>').replace(/<\/table><br\/>/g, '</table>')
  return html
}

/** 세리프 폰트 스타일 (홈과 동일: RIDIBatang) */
const serifStyle = { fontFamily: "'RIDIBatang', serif" }

// ── 컴포넌트 ──────────────────────────────────────────────

interface OrdinanceBenchmarkViewProps {
  initialKeyword?: string
  onBack: () => void
  onHomeClick?: () => void
}

export function OrdinanceBenchmarkView({ initialKeyword, onBack, onHomeClick }: OrdinanceBenchmarkViewProps) {
  const [inputValue, setInputValue] = useState(initialKeyword || '')

  // 지자체 필터
  const [filterOrg, setFilterOrg] = useState<string | null>(null)

  // 체크박스: AI 분석용 선택
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set())

  // AI 비교 분석 상태
  const [aiAnalysis, setAiAnalysis] = useState<{ comparisonTable: string; highlights: string } | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  // 조례 모달
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState('')
  const [modalHtml, setModalHtml] = useState<string | undefined>()
  const [modalLoading, setModalLoading] = useState(false)

  // 헤더 스크롤
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
    isSearching, isLoadingMore, progress, flatResults, keyword, error,
    matchedCount, totalCount, loadedCount, isComplete,
    activeRegions, activeMetros,
    search, loadAll, forceRefresh, cancel,
    toggleRegion, toggleMetro, selectAllRegions,
  } = useOrdinanceBenchmark()

  const handleSearch = () => {
    if (inputValue.trim()) {
      setCheckedItems(new Set())
      setFilterOrg(null)
      setAiAnalysis(null)
      search(inputValue.trim())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  // ── 지자체별 카운트 ──
  const orgCounts = useMemo(() => {
    const map = new Map<string, { shortName: string; count: number }>()
    flatResults.forEach(r => {
      const e = map.get(r.orgCode)
      if (e) e.count++
      else map.set(r.orgCode, { shortName: r.orgShortName, count: 1 })
    })
    return map
  }, [flatResults])

  // ── 지자체 필터된 결과 ──
  const displayResults = useMemo(() => {
    if (!filterOrg) return flatResults
    return flatResults.filter(r => r.orgCode === filterOrg)
  }, [flatResults, filterOrg])

  // ── 체크박스 (최대 5개) ──
  const MAX_CHECKED = 5
  const toggleCheck = (key: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else if (next.size < MAX_CHECKED) next.add(key)
      return next
    })
  }

  // ── 조례 모달 (기존 법령뷰어와 동일한 방식) ──
  const openOrdinanceModal = useCallback(async (r: BenchmarkOrdinanceResult) => {
    if (!r.ordinanceSeq) {
      setModalTitle(r.ordinanceName)
      setModalOpen(true)
      setModalHtml('<p class="text-center py-8 text-muted-foreground">조례 일련번호가 없어 본문을 조회할 수 없습니다.</p>')
      return
    }
    setModalTitle(r.ordinanceName)
    setModalOpen(true)
    setModalLoading(true)
    setModalHtml(undefined)
    try {
      // 기존 조례 조회 파이프라인 사용: /api/ordin → XML → parseOrdinanceXML → extractArticleText
      const res = await fetch(`/api/ordin?ordinSeq=${r.ordinanceSeq}`)
      if (!res.ok) throw new Error('조회 실패')
      const xml = await res.text()
      const { articles } = parseOrdinanceXML(xml)

      if (articles.length === 0) {
        setModalHtml('<p class="text-center py-8 text-muted-foreground">조문 데이터가 없습니다.</p>')
      } else {
        const html = articles.map(article => {
          const titlePart = article.title ? ` (${article.title})` : ''
          const header = `<div class="font-semibold text-primary mb-1">${article.joNum}${titlePart}</div>`
          const content = extractArticleText(article, true, r.ordinanceName)
          return `<div class="mb-4 pb-4 border-b border-border/30 last:border-0">${header}<div class="text-sm leading-relaxed">${content}</div></div>`
        }).join('')
        setModalHtml(`<div class="space-y-2">${html}</div>`)
      }
    } catch {
      setModalHtml('<p class="text-center py-8 text-muted-foreground">조례 본문을 불러올 수 없습니다.</p>')
    } finally {
      setModalLoading(false)
    }
  }, [])

  // ── AI 비교 분석 ──
  const checkedResults = useMemo(() =>
    Array.from(checkedItems).map(k => displayResults[parseInt(k)]).filter(Boolean),
    [checkedItems, displayResults])

  const handleAiAnalysis = useCallback(async () => {
    if (checkedResults.length < 2) return
    setAiLoading(true)
    setAiError(null)
    setAiAnalysis(null)
    try {
      const items = checkedResults.filter(r => r.ordinanceSeq).slice(0, 5).map(r => ({
        orgShortName: r.orgShortName, orgName: r.orgName,
        ordinanceName: r.ordinanceName, ordinanceSeq: r.ordinanceSeq!,
      }))
      const res = await fetch('/api/benchmark-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, ordinances: items }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      setAiAnalysis(await res.json())
    } catch (err: any) {
      setAiError(err.message || 'AI 분석 실패')
    } finally {
      setAiLoading(false)
    }
  }, [checkedResults, keyword])

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 헤더 */}
      <header
        className="sticky top-0 z-50 shadow-sm border-b border-gray-200 dark:border-gray-800/60 bg-content-bg transition-transform duration-400"
        style={{ transform: isHeaderVisible ? 'translateY(0)' : 'translateY(-100%)' }}
      >
        <div className="container mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            <button onClick={() => onHomeClick?.()} className="flex items-center gap-3 group">
              <div className="flex h-10 w-10 items-center justify-center bg-brand-navy text-white dark:text-background shadow-md transition-transform duration-300 group-hover:scale-105">
                <Icon name="scale" size={22} />
              </div>
              <span className="text-xl lg:text-2xl font-medium italic text-brand-navy tracking-tight"
                style={{ fontFamily: "'Libre Bodoni', serif", fontWeight: 500, fontStyle: 'italic' }}>
                LexDiff
              </span>
            </button>
            <div className="flex items-center gap-2 lg:gap-4">
              <ThemeToggle />
              <Button variant="ghost" size="sm" onClick={onBack} title="뒤로가기">
                <Icon name="arrow-left" size={18} className="text-gray-600 dark:text-gray-400" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
          {/* 타이틀 */}
          <div className="pt-2">
            <h1 className="text-3xl lg:text-4xl font-bold text-brand-navy dark:text-foreground flex items-center gap-3" style={serifStyle}>
              <Icon name="bar-chart" size={32} className="text-brand-gold" />
              조례 벤치마킹
            </h1>
            <p className="text-base text-muted-foreground mt-3">
              전국 지자체의 동일 주제 조례를 검색하고, AI로 핵심 항목을 비교 분석합니다.
            </p>
          </div>

          {/* 검색 카드 */}
          <Card className="p-5 space-y-5">
            {/* 대상 지역 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-foreground" style={serifStyle}>대상 지역</span>
                <button onClick={selectAllRegions}
                  className="text-xs text-muted-foreground hover:text-foreground underline">
                  전국 선택
                </button>
              </div>

              {/* 권역 */}
              <div className="flex flex-wrap gap-2">
                {REGIONS.map(region => {
                  const isActive = activeRegions.has(region.name)
                  return (
                    <button key={region.name} onClick={() => toggleRegion(region.name)}
                      className={cn(
                        "inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border font-medium transition-all",
                        isActive
                          ? "bg-brand-navy text-white border-brand-navy dark:bg-brand-gold dark:text-black dark:border-brand-gold"
                          : "bg-background text-muted-foreground border-border hover:bg-muted/50 hover:text-foreground"
                      )}>
                      {region.name}
                      <span className={cn("text-[10px]", isActive ? "opacity-70" : "opacity-50")}>{region.metros.length}</span>
                    </button>
                  )
                })}
              </div>

              {/* 광역시도 칩 */}
              {activeRegions.size > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3 pl-0.5">
                  {REGIONS.filter(r => activeRegions.has(r.name)).flatMap(r => r.metros).map(metro => {
                    const isActive = activeMetros.has(metro)
                    return (
                      <button key={metro} onClick={() => toggleMetro(metro)}
                        className={cn(
                          "text-xs px-2 py-1 rounded-md border transition-all",
                          isActive
                            ? "bg-sky-600 text-white border-sky-600 dark:bg-sky-500 dark:border-sky-500"
                            : "bg-muted/30 text-muted-foreground border-border opacity-50 hover:opacity-80"
                        )}>
                        {metro}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 검색어 입력 */}
            <div>
              <span className="text-sm font-semibold text-foreground mb-2 block" style={serifStyle}>검색어</span>
              <div className="flex items-center gap-2">
                <Input placeholder="예: 출산장려금, 주차장, 재난안전"
                  value={inputValue} onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown} className="flex-1 h-10 text-sm" disabled={isSearching} />
                {isSearching ? (
                  <Button variant="outline" size="sm" onClick={cancel} className="h-10 px-4">
                    <Icon name="x" size={14} className="mr-1" /> 취소
                  </Button>
                ) : (
                  <>
                    <Button size="sm" onClick={handleSearch}
                      disabled={!inputValue.trim() || activeMetros.size === 0} className="h-10 px-5">
                      <Icon name="search" size={14} className="mr-1.5" /> 검색
                    </Button>
                    <Button variant="outline" size="sm"
                      onClick={() => { if (inputValue.trim()) { setCheckedItems(new Set()); setFilterOrg(null); setAiAnalysis(null); forceRefresh(inputValue.trim()) } }}
                      disabled={!inputValue.trim()} className="h-10 px-3" title="캐시 무시">
                      <Icon name="refresh-cw" size={14} />
                    </Button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="text-xs text-muted-foreground">추천:</span>
                {['출산장려금', '주차장 설치', '재난안전', '장애인 편의', '청년 지원'].map(kw => (
                  <Button key={kw} variant="outline" size="sm" className="h-7 px-2.5 text-xs"
                    disabled={isSearching}
                    onClick={() => { setInputValue(kw); setCheckedItems(new Set()); setFilterOrg(null); setAiAnalysis(null); search(kw) }}>
                    {kw}
                  </Button>
                ))}
              </div>
            </div>
          </Card>

          {/* 진행 상황 */}
          {(isSearching || isLoadingMore) && progress && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  <Icon name="loader" size={14} className="inline animate-spin mr-1.5" />
                  {isLoadingMore ? '추가 로드 중...' : '검색 중...'} {progress.completed}/{progress.total}
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
                <Icon name="alert-circle" size={16} /> {error}
              </div>
            </Card>
          )}

          {/* 결과 */}
          {!isSearching && flatResults.length > 0 && (
            <>
              {/* 요약 */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold" style={serifStyle}>검색 결과</span>
                  <Badge variant="secondary" className="text-xs">
                    {matchedCount}개 지자체 · {flatResults.length}건
                  </Badge>
                  {!isComplete && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      전체 {totalCount}건 중 {loadedCount}건 로드
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!isComplete && !isLoadingMore && (
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={loadAll}>
                      <Icon name="download" size={12} className="mr-1" />
                      전체 {totalCount}건 로드
                    </Button>
                  )}
                  <span className="text-sm text-muted-foreground">&ldquo;{keyword}&rdquo;</span>
                </div>
              </div>

              {/* 지자체 필터 배지 (클릭 가능) */}
              {orgCounts.size > 0 && orgCounts.size <= 80 && (
                <div className="flex flex-wrap gap-1.5">
                  {/* 전체 버튼 */}
                  <button onClick={() => { setFilterOrg(null); setCheckedItems(new Set()) }}
                    className={cn(
                      "text-xs px-2 py-1 rounded-md border font-medium transition-all cursor-pointer",
                      !filterOrg
                        ? "bg-brand-navy text-white border-brand-navy dark:bg-brand-gold dark:text-black dark:border-brand-gold"
                        : "bg-background text-foreground border-border hover:bg-muted/50"
                    )}>
                    전체 {flatResults.length}
                  </button>
                  {Array.from(orgCounts.entries()).map(([code, { shortName, count }]) => (
                    <button key={code}
                      onClick={() => { setFilterOrg(filterOrg === code ? null : code); setCheckedItems(new Set()) }}
                      className={cn(
                        "inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-all cursor-pointer",
                        filterOrg === code
                          ? "bg-sky-600 text-white border-sky-600 dark:bg-sky-500 dark:border-sky-500"
                          : "bg-background text-muted-foreground border-border hover:bg-muted/50 hover:text-foreground"
                      )}>
                      {shortName} <span className="text-[10px] opacity-70">{count}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* 테이블 */}
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-3 py-3 w-10 text-center text-xs font-medium text-muted-foreground">비교</th>
                        <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground w-32">지자체</th>
                        <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground">조례명</th>
                        <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground w-28">시행일</th>
                        <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground w-24">개정유형</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayResults.map((r, i) => {
                        const key = `${i}`
                        return (
                          <tr key={`${r.orgCode}-${r.ordinanceSeq}-${i}`}
                            className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-3 text-center">
                              <Checkbox checked={checkedItems.has(key)}
                                disabled={!checkedItems.has(key) && checkedItems.size >= MAX_CHECKED}
                                onCheckedChange={() => toggleCheck(key)} />
                            </td>
                            <td className="px-3 py-3">
                              <Badge variant="outline" className="text-[11px]">{r.orgShortName}</Badge>
                            </td>
                            <td className="px-3 py-3">
                              <button onClick={() => openOrdinanceModal(r)}
                                className="text-sm font-medium text-left hover:text-brand-navy dark:hover:text-brand-gold hover:underline underline-offset-2 transition-colors"
                                style={serifStyle}>
                                {r.ordinanceName}
                              </button>
                            </td>
                            <td className="px-3 py-3 text-muted-foreground text-xs tabular-nums">
                              {formatDate(r.effectiveDate ?? '')}
                            </td>
                            <td className="px-3 py-3">
                              {r.revisionType && (
                                <span className={cn("text-[11px] px-2 py-0.5 rounded", revisionBadgeClass(r.revisionType))}>
                                  {r.revisionType}
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* AI 비교 분석 */}
              <Card className="p-5">
                {!aiAnalysis && !aiLoading && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon name="sparkles" size={18} className="text-brand-navy dark:text-brand-gold" />
                      <span className="text-sm font-semibold" style={serifStyle}>AI 비교 분석</span>
                      {checkedItems.size > 0
                        ? <span className="text-xs text-muted-foreground">{checkedItems.size}/{MAX_CHECKED}개 선택</span>
                        : <span className="text-xs text-muted-foreground">비교할 조례를 체크하세요 (2~{MAX_CHECKED}개)</span>}
                    </div>
                    <Button size="sm" onClick={handleAiAnalysis} disabled={checkedResults.length < 2} className="h-9">
                      <Icon name="sparkles" size={14} className="mr-1.5" /> 비교 분석 요청
                    </Button>
                  </div>
                )}
                {aiLoading && (
                  <div className="flex items-center justify-center py-10">
                    <div className="text-center space-y-3">
                      <Icon name="loader" size={28} className="animate-spin text-brand-navy dark:text-brand-gold mx-auto" />
                      <p className="text-sm text-muted-foreground">AI가 조례 본문을 비교 분석하고 있습니다...</p>
                    </div>
                  </div>
                )}
                {aiError && (
                  <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                    <Icon name="alert-circle" size={16} /> {aiError}
                    <Button variant="outline" size="sm" className="h-7 px-3 text-xs ml-2" onClick={handleAiAnalysis}>다시 시도</Button>
                  </div>
                )}
                {aiAnalysis && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon name="sparkles" size={18} className="text-brand-navy dark:text-brand-gold" />
                        <span className="text-sm font-semibold" style={serifStyle}>AI 비교 분석 결과</span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 px-3 text-xs"
                        onClick={() => { setAiAnalysis(null); setAiError(null) }}>닫기</Button>
                    </div>
                    <div className="overflow-x-auto prose prose-sm dark:prose-invert max-w-none
                      [&_table]:w-full [&_table]:border-collapse
                      [&_th]:bg-muted/50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:border [&_th]:border-border
                      [&_td]:px-3 [&_td]:py-2 [&_td]:text-sm [&_td]:border [&_td]:border-border">
                      <div dangerouslySetInnerHTML={{ __html: markdownToHtml(aiAnalysis.comparisonTable) }} />
                    </div>
                    {aiAnalysis.highlights && (
                      <div className="bg-muted/30 rounded-lg p-4 prose prose-sm dark:prose-invert max-w-none">
                        <div dangerouslySetInnerHTML={{ __html: markdownToHtml(aiAnalysis.highlights) }} />
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </>
          )}

          {/* 초기 상태 */}
          {!isSearching && flatResults.length === 0 && !error && !keyword && (
            <div className="flex items-center justify-center py-24">
              <div className="text-center space-y-4 max-w-sm">
                <Icon name="bar-chart" size={56} className="mx-auto text-muted-foreground/30" />
                <p className="text-lg font-semibold" style={serifStyle}>전국 조례 비교 분석</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  대상 지역을 선택하고 검색어를 입력하세요.
                </p>
              </div>
            </div>
          )}

          {/* 결과 없음 */}
          {!isSearching && flatResults.length === 0 && keyword && !error && (
            <div className="flex items-center justify-center py-24">
              <div className="text-center space-y-3">
                <Icon name="search" size={48} className="mx-auto text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  선택된 지역에서 &ldquo;{keyword}&rdquo; 조례를 찾지 못했습니다.
                </p>
                {!isComplete && totalCount > 0 && (
                  <Button variant="outline" size="sm" onClick={loadAll} className="mt-2">
                    전체 {totalCount}건에서 검색
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <ReferenceModal isOpen={modalOpen} onClose={() => setModalOpen(false)}
        title={modalTitle} html={modalHtml} loading={modalLoading} />
      <LawStatsFooter />
    </div>
  )
}
