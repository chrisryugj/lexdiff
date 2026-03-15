/**
 * 조례 벤치마킹 — 전국 일괄 검색 (페이지네이션 + 광역시도 그룹)
 *
 * 1) 1페이지 fetch → totalCnt 파악
 * 2) 나머지 페이지 병렬 fetch
 * 3) 지자체기관명 → 광역시도 매핑 + 개별 지자체 표시
 */

import { METRO_MUNICIPALITIES } from './municipality-codes'
import type { BenchmarkOrdinanceResult } from './types'
import { getBenchmarkCacheKey, BENCHMARK_CACHE_TTL } from './types'
import { parseOrdinanceSearchXML, type OrdinanceSearchResult } from '../ordin-search-parser'

const PAGE_SIZE = 100

// ── 광역시도 매핑 ────────────────────────────────────────────
/** "경기도 가평군" → "경기", "서울특별시 강남구" → "서울" */
export function getMetroArea(orgName: string): string | null {
  for (const m of METRO_MUNICIPALITIES) {
    if (orgName.startsWith(m.name)) return m.shortName
  }
  return null
}

// ── 캐시 ────────────────────────────────────────────────────
interface CachedSearch {
  results: Record<string, BenchmarkOrdinanceResult[]>
  cachedAt: number
}

export function getCachedSearch(keyword: string): Map<string, BenchmarkOrdinanceResult[]> | null {
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
    return map
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

function setCacheSearch(keyword: string, results: Map<string, BenchmarkOrdinanceResult[]>): void {
  try {
    const record: Record<string, BenchmarkOrdinanceResult[]> = {}
    results.forEach((v, k) => { record[k] = v })
    const cached: CachedSearch = { results: record, cachedAt: Date.now() }
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

// ── 전국 일괄 검색 (페이지네이션) ────────────────────────────
export interface SearchProgress {
  completed: number
  total: number
  current: string
}

export async function searchAllMunicipalities(
  keyword: string,
  options: {
    signal?: AbortSignal
    onProgress?: (progress: SearchProgress) => void
  } = {},
): Promise<Map<string, BenchmarkOrdinanceResult[]>> {
  const normalizedKeyword = keyword.replace(/\s+/g, '')

  const cached = getCachedSearch(normalizedKeyword)
  if (cached) return cached

  const { signal, onProgress } = options
  const results = new Map<string, BenchmarkOrdinanceResult[]>()

  // 1) 첫 페이지 → totalCount 확인
  onProgress?.({ completed: 0, total: 1, current: '전국 조례 검색 중...' })
  const first = await fetchPage(normalizedKeyword, 1, signal)
  if (first.ordinances.length === 0) return results

  groupOrdinances(first.ordinances, results)

  const totalPages = Math.ceil(first.totalCount / PAGE_SIZE)
  const maxPages = Math.min(totalPages, 10) // 최대 1000건 (10페이지)

  if (maxPages <= 1) {
    onProgress?.({ completed: 1, total: 1, current: '완료' })
    if (results.size > 0) setCacheSearch(normalizedKeyword, results)
    return results
  }

  // 2) 나머지 페이지 병렬 fetch
  onProgress?.({ completed: 1, total: maxPages, current: `${first.totalCount}건 수집 중 (${maxPages}페이지)...` })

  const remainingPages = Array.from({ length: maxPages - 1 }, (_, i) => i + 2)
  const pageResults = await Promise.allSettled(
    remainingPages.map(p => fetchPage(normalizedKeyword, p, signal))
  )

  for (const pr of pageResults) {
    if (pr.status === 'fulfilled') {
      groupOrdinances(pr.value.ordinances, results)
    }
  }

  onProgress?.({ completed: maxPages, total: maxPages, current: '완료' })

  if (results.size > 0) {
    setCacheSearch(normalizedKeyword, results)
  }

  return results
}
