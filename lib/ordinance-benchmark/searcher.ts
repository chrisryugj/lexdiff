/**
 * 조례 벤치마킹 — 전국 일괄 검색
 *
 * org 파라미터 없이 전국 조례를 한 번에 검색하고,
 * 지자체기관명 기준으로 개별 표시한다.
 */

import type { BenchmarkOrdinanceResult } from './types'
import { getBenchmarkCacheKey, BENCHMARK_CACHE_TTL } from './types'
import { parseOrdinanceSearchXML } from '../ordin-search-parser'

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

// ── 전국 일괄 검색 ──────────────────────────────────────────
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

  onProgress?.({ completed: 0, total: 3, current: '전국 조례 검색 중...' })

  // org 없이 전국 검색, display=100
  const params = new URLSearchParams({
    query: normalizedKeyword,
    knd: '30001',
    display: '100',
  })

  const res = await fetch(`/api/ordin-search?${params}`, { signal })
  if (!res.ok) return results

  onProgress?.({ completed: 1, total: 3, current: '결과 분석 중...' })

  const xmlText = await res.text()
  const { ordinances } = parseOrdinanceSearchXML(xmlText)

  onProgress?.({ completed: 2, total: 3, current: '지역별 분류 중...' })

  // 지자체기관명 기준 그룹핑 (개별 지자체 모두 표시)
  for (const item of ordinances) {
    const orgName = item.orgName || '기타'
    // 교육청 제외
    if (orgName.includes('교육청')) continue

    const entry: BenchmarkOrdinanceResult = {
      orgCode: orgName,  // orgName을 키로 사용
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

  onProgress?.({ completed: 3, total: 3, current: '완료' })

  if (results.size > 0) {
    setCacheSearch(normalizedKeyword, results)
  }

  return results
}
