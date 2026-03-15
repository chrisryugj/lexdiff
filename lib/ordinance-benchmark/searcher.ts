/**
 * 조례 벤치마킹 — 점진적 로딩
 *
 * 1) searchFirstPage: 1페이지만 fetch → 빠른 초기 렌더 + totalCount
 * 2) loadRemainingPages: 나머지 페이지 병렬 fetch → 전체 데이터
 */

import { METRO_MUNICIPALITIES } from './municipality-codes'
import type { BenchmarkOrdinanceResult } from './types'
import { getBenchmarkCacheKey, BENCHMARK_CACHE_TTL } from './types'
import { parseOrdinanceSearchXML, type OrdinanceSearchResult } from '../ordin-search-parser'

const PAGE_SIZE = 100

// ── 광역시도 매핑 ────────────────────────────────────────────
export function getMetroArea(orgName: string): string | null {
  for (const m of METRO_MUNICIPALITIES) {
    if (orgName.startsWith(m.name)) return m.shortName
  }
  return null
}

// ── 캐시 ────────────────────────────────────────────────────
interface CachedSearch {
  results: Record<string, BenchmarkOrdinanceResult[]>
  totalCount: number
  isComplete: boolean
  cachedAt: number
}

export function getCachedSearch(keyword: string): { results: Map<string, BenchmarkOrdinanceResult[]>; totalCount: number; isComplete: boolean } | null {
  try {
    const raw = localStorage.getItem(getBenchmarkCacheKey(keyword))
    if (!raw) return null
    const cached: CachedSearch = JSON.parse(raw)
    if (Date.now() - cached.cachedAt > BENCHMARK_CACHE_TTL) {
      localStorage.removeItem(getBenchmarkCacheKey(keyword))
      return null
    }
    const map = new Map(Object.entries(cached.results))
    if (map.size === 0) {
      localStorage.removeItem(getBenchmarkCacheKey(keyword))
      return null
    }
    return { results: map, totalCount: cached.totalCount, isComplete: cached.isComplete }
  } catch { return null }
}

export function clearBenchmarkCache(keyword?: string): void {
  try {
    if (keyword) {
      const normalized = keyword.replace(/\s+/g, '')
      localStorage.removeItem(getBenchmarkCacheKey(normalized))
      localStorage.removeItem(getBenchmarkCacheKey(keyword))
    } else {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('benchmark:'))
      keys.forEach(k => localStorage.removeItem(k))
    }
  } catch { /* ignore */ }
}

function setCacheSearch(keyword: string, results: Map<string, BenchmarkOrdinanceResult[]>, totalCount: number, isComplete: boolean): void {
  try {
    const record: Record<string, BenchmarkOrdinanceResult[]> = {}
    results.forEach((v, k) => { record[k] = v })
    const cached: CachedSearch = { results: record, totalCount, isComplete, cachedAt: Date.now() }
    localStorage.setItem(getBenchmarkCacheKey(keyword), JSON.stringify(cached))
  } catch { /* full */ }
}

// ── 단일 페이지 fetch ─────────────────────────────────────
async function fetchPage(
  keyword: string,
  page: number,
  signal?: AbortSignal,
): Promise<{ totalCount: number; ordinances: OrdinanceSearchResult[] }> {
  const params = new URLSearchParams({
    query: keyword,
    knd: '30001',
    display: String(PAGE_SIZE),
    page: String(page),
  })
  const res = await fetch(`/api/ordin-search?${params}`, { signal })
  if (!res.ok) return { totalCount: 0, ordinances: [] }
  const xml = await res.text()
  return parseOrdinanceSearchXML(xml)
}

// ── 결과를 Map으로 그룹핑 ──────────────────────────────────
function groupOrdinances(
  items: OrdinanceSearchResult[],
  results: Map<string, BenchmarkOrdinanceResult[]>,
): void {
  for (const item of items) {
    const orgName = item.orgName || '기타'
    if (orgName.includes('교육청')) continue

    const entry: BenchmarkOrdinanceResult = {
      orgCode: orgName,
      orgName,
      orgShortName: orgName.replace(/특별자치|특별|광역/g, '').replace(/시$|도$/, ''),
      ordinanceName: item.ordinName,
      ordinanceSeq: item.ordinSeq,
      effectiveDate: item.effectiveDate || '',
      revisionType: item.revisionType || '',
    }

    const existing = results.get(orgName) || []
    existing.push(entry)
    results.set(orgName, existing)
  }
}

// ── 검색 결과 ──────────────────────────────────────────────
export interface SearchResult {
  results: Map<string, BenchmarkOrdinanceResult[]>
  totalCount: number
  loadedCount: number
  isComplete: boolean
}

export interface SearchProgress {
  completed: number
  total: number
  current: string
}

// ── 1) 첫 페이지만 검색 (빠른 초기 렌더) ────────────────────
export async function searchFirstPage(
  keyword: string,
  options: { signal?: AbortSignal } = {},
): Promise<SearchResult> {
  const normalizedKeyword = keyword.replace(/\s+/g, '')

  // 캐시 체크
  const cached = getCachedSearch(normalizedKeyword)
  if (cached) {
    let loadedCount = 0
    cached.results.forEach(v => loadedCount += v.length)
    return { results: cached.results, totalCount: cached.totalCount, loadedCount, isComplete: cached.isComplete }
  }

  const results = new Map<string, BenchmarkOrdinanceResult[]>()
  const first = await fetchPage(normalizedKeyword, 1, options.signal)

  if (first.ordinances.length === 0) {
    return { results, totalCount: 0, loadedCount: 0, isComplete: true }
  }

  groupOrdinances(first.ordinances, results)

  let loadedCount = 0
  results.forEach(v => loadedCount += v.length)
  const isComplete = first.totalCount <= PAGE_SIZE

  // 1페이지로 완결되면 캐싱
  if (isComplete && results.size > 0) {
    setCacheSearch(normalizedKeyword, results, first.totalCount, true)
  }

  return { results, totalCount: first.totalCount, loadedCount, isComplete }
}

// ── 2) 나머지 페이지 로드 ────────────────────────────────────
export async function loadRemainingPages(
  keyword: string,
  existingResults: Map<string, BenchmarkOrdinanceResult[]>,
  totalCount: number,
  options: {
    signal?: AbortSignal
    onProgress?: (progress: SearchProgress) => void
  } = {},
): Promise<SearchResult> {
  const normalizedKeyword = keyword.replace(/\s+/g, '')
  const { signal, onProgress } = options

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const maxPages = Math.min(totalPages, 10) // 최대 1000건

  if (maxPages <= 1) {
    let loadedCount = 0
    existingResults.forEach(v => loadedCount += v.length)
    return { results: existingResults, totalCount, loadedCount, isComplete: true }
  }

  // 기존 결과 복사
  const results = new Map(existingResults)

  onProgress?.({ completed: 0, total: maxPages - 1, current: `나머지 ${maxPages - 1}페이지 로드 중...` })

  const remainingPages = Array.from({ length: maxPages - 1 }, (_, i) => i + 2)
  const pageResults = await Promise.allSettled(
    remainingPages.map(p => fetchPage(normalizedKeyword, p, signal))
  )

  let completedPages = 0
  for (const pr of pageResults) {
    if (pr.status === 'fulfilled') {
      groupOrdinances(pr.value.ordinances, results)
    }
    completedPages++
    onProgress?.({ completed: completedPages, total: maxPages - 1, current: `${completedPages}/${maxPages - 1} 페이지 완료` })
  }

  let loadedCount = 0
  results.forEach(v => loadedCount += v.length)

  // 전체 캐싱
  if (results.size > 0) {
    setCacheSearch(normalizedKeyword, results, totalCount, true)
  }

  return { results, totalCount, loadedCount, isComplete: true }
}
