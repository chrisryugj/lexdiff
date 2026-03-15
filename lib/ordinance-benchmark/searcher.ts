/**
 * 조례 벤치마킹 — 전국 병렬 검색
 *
 * 17개 광역시도를 배치(6개씩)로 병렬 검색하여
 * 동일 주제 조례를 수집한다.
 */

import { METRO_MUNICIPALITIES, type Municipality } from './municipality-codes'
import type { BenchmarkOrdinanceResult } from './types'
import { getBenchmarkCacheKey, BENCHMARK_CACHE_TTL } from './types'

// ── 캐시 ────────────────────────────────────────────────────
interface CachedSearch {
  results: Record<string, BenchmarkOrdinanceResult[]>  // JSON-safe (Map 대신 Record)
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
    return new Map(Object.entries(cached.results))
  } catch { return null }
}

function setCacheSearch(keyword: string, results: Map<string, BenchmarkOrdinanceResult[]>): void {
  try {
    const record: Record<string, BenchmarkOrdinanceResult[]> = {}
    results.forEach((v, k) => { record[k] = v })
    const cached: CachedSearch = { results: record, cachedAt: Date.now() }
    localStorage.setItem(getBenchmarkCacheKey(keyword), JSON.stringify(cached))
  } catch { /* full */ }
}

// ── 단일 지자체 검색 ────────────────────────────────────────
async function searchOrdinanceForMunicipality(
  keyword: string,
  muni: Municipality,
  signal?: AbortSignal,
): Promise<BenchmarkOrdinanceResult[]> {
  const params = new URLSearchParams({
    query: keyword,
    org: muni.code,
    knd: '30001',   // 조례
    display: '5',
  })

  const res = await fetch(`/api/ordin-search?${params}`, { signal })
  if (!res.ok) return []

  const data = await res.json()
  const items = data.results || data.ordinances || []

  return items.map((item: any) => ({
    orgCode: muni.code,
    orgName: muni.name,
    orgShortName: muni.shortName,
    ordinanceName: item.ordinanceName || item.title || item.lawNm || '',
    ordinanceSeq: item.ordinanceSeq || item.seq || '',
    effectiveDate: item.effectiveDate || item.efYd || '',
    revisionType: item.revisionType || item.rrCls || '',
  }))
}

// ── 전국 병렬 검색 ──────────────────────────────────────────
export interface SearchProgress {
  completed: number
  total: number
  current: string
}

export async function searchAllMunicipalities(
  keyword: string,
  options: {
    batchSize?: number
    delayMs?: number
    signal?: AbortSignal
    onProgress?: (progress: SearchProgress) => void
  } = {},
): Promise<Map<string, BenchmarkOrdinanceResult[]>> {
  // 캐시 체크
  const cached = getCachedSearch(keyword)
  if (cached) return cached

  const { batchSize = 6, delayMs = 200, signal, onProgress } = options
  const results = new Map<string, BenchmarkOrdinanceResult[]>()
  const munis = METRO_MUNICIPALITIES

  for (let i = 0; i < munis.length; i += batchSize) {
    if (signal?.aborted) break

    const batch = munis.slice(i, i + batchSize)

    onProgress?.({
      completed: i,
      total: munis.length,
      current: batch.map(m => m.shortName).join(', '),
    })

    const batchResults = await Promise.allSettled(
      batch.map(muni => searchOrdinanceForMunicipality(keyword, muni, signal))
    )

    batch.forEach((muni, idx) => {
      const result = batchResults[idx]
      if (result.status === 'fulfilled' && result.value.length > 0) {
        results.set(muni.code, result.value)
      }
    })

    // Rate limiting: 다음 배치 전 대기 (마지막 배치 제외)
    if (i + batchSize < munis.length && !signal?.aborted) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }

  onProgress?.({ completed: munis.length, total: munis.length, current: '완료' })

  // 캐싱
  setCacheSearch(keyword, results)

  return results
}
