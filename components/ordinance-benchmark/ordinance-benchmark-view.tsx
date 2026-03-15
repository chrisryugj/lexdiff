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
import { getMetroArea } from "@/lib/ordinance-benchmark/searcher"
import { ReferenceModal } from "@/components/reference-modal"

// ── 유틸 ──────────────────────────────────────────────────

/** YYYYMMDD → YYYY-MM-DD */
function formatDate(raw: string): string {
  if (!raw || raw.length !== 8) return raw || '-'
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

/** 개정유형 → 배지 색상 클래스 */
function revisionBadgeClass(type: string): string {
  if (type.includes('제정')) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
  if (type.includes('전부개정')) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400'
  if (type.includes('일부개정')) return 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400'
  if (type.includes('폐지')) return 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
  return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
}

/** Markdown → HTML (테이블 + 리스트 + 볼드) */
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

// ── 컴포넌트 ──────────────────────────────────────────────

interface OrdinanceBenchmarkViewProps {
  initialKeyword?: string
  onBack: () => void
  onHomeClick?: () => void
}

export function OrdinanceBenchmarkView({ initialKeyword, onBack, onHomeClick }: OrdinanceBenchmarkViewProps) {
  const [inputValue, setInputValue] = useState(initialKeyword || '')

  // 필터링: 광역시도 1차 필터 + 지자체 2차 필터
  const [selectedMetro, setSelectedMetro] = useState<string | null>(null)
  const [selectedOrgs, setSelectedOrgs] = useState<Set<string>>(new Set())

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
    search,
    forceRefresh,
    cancel,
  } = useOrdinanceBenchmark()

  // 검색 후 필터/체크 초기화
  const handleSearch = () => {
    if (inputValue.trim()) {
      setSelectedMetro(null)
      setSelectedOrgs(new Set())
      setCheckedItems(new Set())
      setAiAnalysis(null)
      search(inputValue.trim())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  // ── 광역시도 그룹 ──
  const metroGroups = useMemo(() => {
    const map = new Map<string, number>()
    flatResults.forEach(r => {
      const metro = getMetroArea(r.orgName) || '기타'
      map.set(metro, (map.get(metro) || 0) + 1)
    })
    return map
  }, [flatResults])

  // ── 고유 지자체 목록 (현재 필터 기준) ──
  const uniqueOrgs = useMemo(() => {
    const base = selectedMetro
      ? flatResults.filter(r => (getMetroArea(r.orgName) || '기타') === selectedMetro)
      : flatResults
    const map = new Map<string, { shortName: string; count: number }>()
    base.forEach(r => {
      const existing = map.get(r.orgCode)
      if (existing) existing.count++
      else map.set(r.orgCode, { shortName: r.orgShortName, count: 1 })
    })
    return map
  }, [flatResults, selectedMetro])

  // ── 필터링된 결과 ──
  const filteredResults = useMemo(() => {
    let list = flatResults
    if (selectedMetro) {
      list = list.filter(r => (getMetroArea(r.orgName) || '기타') === selectedMetro)
    }
    if (selectedOrgs.size > 0) {
      list = list.filter(r => selectedOrgs.has(r.orgCode))
    }
    return list
  }, [flatResults, selectedMetro, selectedOrgs])

  // ── 광역시도 필터 토글 ──
  const toggleMetro = (metro: string) => {
    setSelectedMetro(prev => prev === metro ? null : metro)
    setSelectedOrgs(new Set())
    setCheckedItems(new Set())
  }

  // ── 지자체 필터 토글 ──
  const toggleOrg = (orgCode: string) => {
    setSelectedOrgs(prev => {
      const next = new Set(prev)
      if (next.has(orgCode)) next.delete(orgCode)
      else next.add(orgCode)
      return next
    })
    setCheckedItems(new Set())
  }

  // ── 체크박스 토글 (최대 5개) ──
  const MAX_CHECKED = 5

  const toggleCheck = (key: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else if (next.size < MAX_CHECKED) {
        next.add(key)
      }
      return next
    })
  }

  // ── 조례 모달 열기 ──
  const openOrdinanceModal = useCallback(async (r: BenchmarkOrdinanceResult) => {
    setModalTitle(`${r.orgName} — ${r.ordinanceName}`)
    setModalOpen(true)
    setModalLoading(true)
    setModalHtml(undefined)

    try {
      const OC = '' // 서버에서 처리
      const res = await fetch(`/api/ordin-detail?seq=${r.ordinanceSeq}`)
      if (!res.ok) throw new Error('조회 실패')
      const html = await res.text()
      setModalHtml(html)
    } catch {
      setModalHtml('<p class="text-center text-muted-foreground py-8">조례 본문을 불러올 수 없습니다.</p>')
    } finally {
      setModalLoading(false)
    }
  }, [])

  // ── AI 비교 분석 (체크된 항목만) ──
  const checkedResults = useMemo(() => {
    return Array.from(checkedItems)
      .map(key => filteredResults[parseInt(key)])
      .filter(Boolean)
  }, [checkedItems, filteredResults])

  const handleAiAnalysis = useCallback(async () => {
    if (checkedResults.length < 2) return
    setAiLoading(true)
    setAiError(null)
    setAiAnalysis(null)

    try {
      const ordinancesForAnalysis = checkedResults
        .filter(r => r.ordinanceSeq)
        .slice(0, 8)
        .map(r => ({
          orgShortName: r.orgShortName,
          orgName: r.orgName,
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
  }, [checkedResults, keyword])

  const handleLogoClick = () => { onHomeClick?.() }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 헤더 */}
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
              전국 지자체의 동일 주제 조례를 검색하고, AI로 핵심 항목을 비교 분석합니다.
            </p>
          </div>

          {/* 검색 입력 */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Icon name="search" size={16} className="text-muted-foreground" />
              <span className="text-sm font-medium">주제 검색</span>
              <span className="text-xs text-muted-foreground">전국 조례를 검색합니다</span>
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
                <>
                  <Button size="sm" onClick={handleSearch} disabled={!inputValue.trim()} className="h-9 px-4">
                    <Icon name="search" size={14} className="mr-1" />
                    검색
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (inputValue.trim()) {
                        setSelectedMetro(null)
                        setSelectedOrgs(new Set())
                        setCheckedItems(new Set())
                        setAiAnalysis(null)
                        forceRefresh(inputValue.trim())
                      }
                    }}
                    disabled={!inputValue.trim()}
                    className="h-9 px-2"
                    title="캐시 무시하고 강제 재검색"
                  >
                    <Icon name="refresh-cw" size={14} />
                  </Button>
                </>
              )}
            </div>

            {/* 추천 키워드 */}
            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              <span className="text-xs text-muted-foreground">추천:</span>
              {['출산장려금', '주차장 설치', '재난안전', '장애인 편의', '청년 지원'].map(kw => (
                <Button
                  key={kw}
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  disabled={isSearching}
                  onClick={() => { setInputValue(kw); setSelectedOrgs(new Set()); setCheckedItems(new Set()); setAiAnalysis(null); search(kw) }}
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
                    {matchedCount}개 지자체 · {flatResults.length}건
                  </Badge>
                  {(selectedMetro || selectedOrgs.size > 0) && (
                    <Badge variant="outline" className="text-xs">
                      {selectedMetro || ''}{selectedOrgs.size > 0 ? ` ${selectedOrgs.size}개` : ''} 필터 · {filteredResults.length}건
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {(selectedMetro || selectedOrgs.size > 0) && (
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => { setSelectedMetro(null); setSelectedOrgs(new Set()); setCheckedItems(new Set()) }}>
                      필터 초기화
                    </Button>
                  )}
                  <span className="text-xs text-muted-foreground">
                    &ldquo;{keyword}&rdquo;
                  </span>
                </div>
              </div>

              {/* 광역시도 1차 필터 */}
              <div className="flex flex-wrap gap-1">
                {Array.from(metroGroups.entries()).map(([metro, count]) => {
                  const isActive = selectedMetro === metro
                  return (
                    <button
                      key={metro}
                      onClick={() => toggleMetro(metro)}
                      className={cn(
                        "inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border font-medium transition-all cursor-pointer",
                        isActive
                          ? "bg-brand-navy text-white border-brand-navy dark:bg-brand-gold dark:text-black dark:border-brand-gold"
                          : "bg-background text-foreground border-border hover:bg-muted/50"
                      )}
                    >
                      {metro}
                      <span className={cn("text-[9px]", isActive ? "opacity-70" : "text-muted-foreground")}>
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* 지자체 2차 필터 (광역시도 선택 시 하위 지자체 표시) */}
              {selectedMetro && uniqueOrgs.size > 1 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-[10px] text-muted-foreground self-center mr-1">{selectedMetro} 내:</span>
                  {Array.from(uniqueOrgs.entries()).map(([code, { shortName, count }]) => {
                    const isSelected = selectedOrgs.has(code)
                    const isActive = selectedOrgs.size === 0 || isSelected
                    return (
                      <button
                        key={code}
                        onClick={() => toggleOrg(code)}
                        className={cn(
                          "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-all cursor-pointer",
                          isActive
                            ? "bg-sky-600 text-white border-sky-600 dark:bg-sky-500 dark:border-sky-500"
                            : "bg-muted/30 text-muted-foreground border-border opacity-50 hover:opacity-80"
                        )}
                      >
                        {shortName}
                        <span className="text-[9px] opacity-70">{count}</span>
                      </button>
                    )
                  })}
                  {selectedOrgs.size > 0 && (
                    <button
                      onClick={() => { setSelectedOrgs(new Set()); setCheckedItems(new Set()) }}
                      className="text-[10px] text-muted-foreground hover:text-foreground underline ml-1"
                    >
                      초기화
                    </button>
                  )}
                </div>
              )}

              {/* 결과 테이블 */}
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-3 py-2.5 w-10 text-center font-medium text-xs text-muted-foreground">
                          비교
                        </th>
                        <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground w-28">지자체</th>
                        <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">조례명</th>
                        <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground w-28">시행일</th>
                        <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground w-24">개정유형</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResults.map((r, i) => {
                        const key = `${i}`
                        return (
                          <tr
                            key={`${r.orgCode}-${r.ordinanceSeq}-${i}`}
                            className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                          >
                            <td className="px-3 py-2.5">
                              <Checkbox
                                checked={checkedItems.has(key)}
                                disabled={!checkedItems.has(key) && checkedItems.size >= MAX_CHECKED}
                                onCheckedChange={() => toggleCheck(key)}
                                aria-label={`${r.ordinanceName} 선택`}
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <Badge variant="outline" className="text-[10px]">
                                {r.orgShortName}
                              </Badge>
                            </td>
                            <td className="px-3 py-2.5">
                              <button
                                onClick={() => openOrdinanceModal(r)}
                                className="font-medium text-left hover:text-brand-navy dark:hover:text-brand-gold hover:underline underline-offset-2 transition-colors"
                              >
                                {r.ordinanceName}
                              </button>
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground text-xs tabular-nums">
                              {formatDate(r.effectiveDate ?? '')}
                            </td>
                            <td className="px-3 py-2.5">
                              {r.revisionType && (
                                <span className={cn("text-[10px] px-1.5 py-0.5 rounded", revisionBadgeClass(r.revisionType))}>
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
              <Card className="p-4">
                {!aiAnalysis && !aiLoading && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon name="sparkles" size={16} className="text-brand-navy dark:text-brand-gold" />
                      <span className="text-sm font-medium">AI 비교 분석</span>
                      {checkedItems.size > 0 ? (
                        <span className="text-xs text-muted-foreground">{checkedItems.size}/{MAX_CHECKED}개 선택</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">비교할 조례를 체크하세요 (2~{MAX_CHECKED}개)</span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={handleAiAnalysis}
                      disabled={checkedResults.length < 2}
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
                      <p className="text-xs text-muted-foreground/60">미니PC 파이프라인 사용 중</p>
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
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon name="sparkles" size={16} className="text-brand-navy dark:text-brand-gold" />
                        <span className="text-sm font-medium">AI 비교 분석 결과</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => { setAiAnalysis(null); setAiError(null) }}
                      >
                        닫기
                      </Button>
                    </div>
                    <div className="overflow-x-auto text-sm prose prose-sm dark:prose-invert max-w-none
                      [&_table]:w-full [&_table]:border-collapse
                      [&_th]:bg-muted/50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:border [&_th]:border-border
                      [&_td]:px-3 [&_td]:py-2 [&_td]:text-xs [&_td]:border [&_td]:border-border">
                      <div dangerouslySetInnerHTML={{ __html: markdownToHtml(aiAnalysis.comparisonTable) }} />
                    </div>
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
                    동일 주제의 조례를 전국 지자체에서 검색하여 비교합니다.
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

      {/* 조례 상세 모달 */}
      <ReferenceModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        html={modalHtml}
        loading={modalLoading}
      />

      {/* 푸터 */}
      <LawStatsFooter />
    </div>
  )
}
