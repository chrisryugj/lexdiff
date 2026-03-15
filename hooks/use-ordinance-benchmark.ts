'use client'

import { useState, useCallback, useRef, useMemo } from 'react'
import {
  searchFirstPage,
  loadRemainingPages,
  clearBenchmarkCache,
  getMetroArea,
  type SearchResult,
  type SearchProgress,
} from '@/lib/ordinance-benchmark/searcher'
import type { BenchmarkOrdinanceResult } from '@/lib/ordinance-benchmark/types'
import { REGIONS, DEFAULT_REGIONS } from '@/lib/ordinance-benchmark/municipality-codes'

export function useOrdinanceBenchmark() {
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [progress, setProgress] = useState<SearchProgress | null>(null)
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null)
  const [keyword, setKeyword] = useState('')
  const [error, setError] = useState<string | null>(null)

  // 권역/광역시도 필터
  const [activeRegions, setActiveRegions] = useState<Set<string>>(new Set(DEFAULT_REGIONS))
  const [activeMetros, setActiveMetros] = useState<Set<string>>(() => {
    const metros = new Set<string>()
    for (const r of REGIONS) {
      if (DEFAULT_REGIONS.has(r.name)) r.metros.forEach(m => metros.add(m))
    }
    return metros
  })

  const abortRef = useRef<AbortController | null>(null)

  // ── 검색 (1페이지만) ──
  const search = useCallback(async (searchKeyword: string) => {
    if (!searchKeyword.trim()) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsSearching(true)
    setKeyword(searchKeyword)
    setSearchResult(null)
    setError(null)
    setProgress(null)

    try {
      const result = await searchFirstPage(searchKeyword, { signal: controller.signal })
      if (!controller.signal.aborted) {
        setSearchResult(result)
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return
      setError(err.message || '검색 중 오류가 발생했습니다.')
    } finally {
      setIsSearching(false)
    }
  }, [])

  // ── 전체 로드 ──
  const loadAll = useCallback(async () => {
    if (!searchResult || searchResult.isComplete || !keyword) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoadingMore(true)
    setProgress(null)

    try {
      const result = await loadRemainingPages(
        keyword,
        searchResult.results,
        searchResult.totalCount,
        { signal: controller.signal, onProgress: setProgress },
      )
      if (!controller.signal.aborted) {
        setSearchResult(result)
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return
      setError(err.message || '추가 로드 중 오류가 발생했습니다.')
    } finally {
      setIsLoadingMore(false)
      setProgress(null)
    }
  }, [searchResult, keyword])

  // ── 강제 새로고침 ──
  const forceRefresh = useCallback(async (searchKeyword: string) => {
    if (!searchKeyword.trim()) return
    clearBenchmarkCache(searchKeyword)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsSearching(true)
    setKeyword(searchKeyword)
    setSearchResult(null)
    setError(null)

    try {
      const result = await searchFirstPage(searchKeyword, { signal: controller.signal })
      if (!controller.signal.aborted) setSearchResult(result)
    } catch (err: any) {
      if (err.name === 'AbortError') return
      setError(err.message || '검색 중 오류가 발생했습니다.')
    } finally {
      setIsSearching(false)
    }
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setIsSearching(false)
    setIsLoadingMore(false)
  }, [])

  // ── 권역 토글 ──
  const toggleRegion = useCallback((regionName: string) => {
    setActiveRegions(prev => {
      const next = new Set(prev)
      const region = REGIONS.find(r => r.name === regionName)
      if (!region) return prev
      if (next.has(regionName)) {
        next.delete(regionName)
        setActiveMetros(prev2 => {
          const n = new Set(prev2)
          region.metros.forEach(m => n.delete(m))
          return n
        })
      } else {
        next.add(regionName)
        setActiveMetros(prev2 => {
          const n = new Set(prev2)
          region.metros.forEach(m => n.add(m))
          return n
        })
      }
      return next
    })
  }, [])

  const toggleMetro = useCallback((metro: string) => {
    setActiveMetros(prev => {
      const next = new Set(prev)
      if (next.has(metro)) next.delete(metro)
      else next.add(metro)
      return next
    })
    // 권역 상태 동기화
    setActiveRegions(prev => {
      const next = new Set<string>()
      for (const r of REGIONS) {
        // 업데이트된 activeMetros를 반영하기 위해 현재 상태 기반
        const allIn = r.metros.every(m => {
          if (m === arguments[0]) return !prev.has(r.name) // toggle 반영
          return activeMetros.has(m)
        })
        if (allIn) next.add(r.name)
      }
      return next
    })
  }, [activeMetros])

  const selectAllRegions = useCallback(() => {
    setActiveRegions(new Set(REGIONS.map(r => r.name)))
    setActiveMetros(new Set(REGIONS.flatMap(r => r.metros)))
  }, [])

  // ── 활성 광역시도로 필터된 결과 ──
  const flatResults = useMemo(() => {
    if (!searchResult) return []
    const all: BenchmarkOrdinanceResult[] = []
    searchResult.results.forEach(items => all.push(...items))

    if (activeMetros.size === 0) return all

    return all.filter(r => {
      const metro = getMetroArea(r.orgName)
      return metro ? activeMetros.has(metro) : false
    })
  }, [searchResult, activeMetros])

  const matchedCount = useMemo(() => {
    const orgs = new Set<string>()
    flatResults.forEach(r => orgs.add(r.orgCode))
    return orgs.size
  }, [flatResults])

  return {
    isSearching,
    isLoadingMore,
    progress,
    flatResults,
    keyword,
    error,
    matchedCount,
    totalCount: searchResult?.totalCount || 0,
    loadedCount: searchResult?.loadedCount || 0,
    isComplete: searchResult?.isComplete || false,
    activeRegions,
    activeMetros,
    search,
    loadAll,
    forceRefresh,
    cancel,
    toggleRegion,
    toggleMetro,
    selectAllRegions,
  }
}
