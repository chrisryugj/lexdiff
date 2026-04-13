'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
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

  // Unmount 시 in-flight 요청 취소
  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  // ── 검색 (1페이지만, 선택 광역 매칭 0건이면 자동 전체 로드) ──
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
      const first = await searchFirstPage(searchKeyword, { signal: controller.signal })
      if (controller.signal.aborted) return
      setSearchResult(first)

      // 선택된 광역에 매칭된 결과가 1페이지에 없으면 자동 전체 로드
      // (가나다순 페이징 특성상 서울/제주 등 후순위 지역이 1페이지에 안 들어올 수 있음)
      if (!first.isComplete && activeMetros.size > 0) {
        const hasMatch = Array.from(first.results.values()).flat().some(r => {
          const m = getMetroArea(r.orgName)
          return m !== null && activeMetros.has(m)
        })
        if (!hasMatch) {
          setIsSearching(false)
          setIsLoadingMore(true)
          const full = await loadRemainingPages(
            searchKeyword,
            first.results,
            first.totalCount,
            { signal: controller.signal, onProgress: setProgress },
          )
          if (!controller.signal.aborted) setSearchResult(full)
          setIsLoadingMore(false)
          setProgress(null)
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSearching(false)
    }
  }, [activeMetros])

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
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : String(err))
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
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : String(err))
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

      // 권역 상태 동기화 (업데이트된 next 기준)
      setActiveRegions(() => {
        const regionSet = new Set<string>()
        for (const r of REGIONS) {
          if (r.metros.every(m => next.has(m))) regionSet.add(r.name)
        }
        return regionSet
      })

      return next
    })
  }, [])

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
