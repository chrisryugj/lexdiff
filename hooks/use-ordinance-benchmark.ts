'use client'

import { useState, useCallback, useRef } from 'react'
import { searchAllMunicipalities, type SearchProgress } from '@/lib/ordinance-benchmark/searcher'
import type { BenchmarkOrdinanceResult } from '@/lib/ordinance-benchmark/types'
import { METRO_MUNICIPALITIES } from '@/lib/ordinance-benchmark/municipality-codes'

export function useOrdinanceBenchmark() {
  const [isSearching, setIsSearching] = useState(false)
  const [progress, setProgress] = useState<SearchProgress | null>(null)
  const [results, setResults] = useState<Map<string, BenchmarkOrdinanceResult[]> | null>(null)
  const [keyword, setKeyword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const search = useCallback(async (searchKeyword: string) => {
    if (!searchKeyword.trim()) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsSearching(true)
    setKeyword(searchKeyword)
    setResults(null)
    setError(null)
    setProgress(null)

    try {
      const map = await searchAllMunicipalities(searchKeyword, {
        signal: controller.signal,
        onProgress: setProgress,
      })
      if (!controller.signal.aborted) {
        setResults(map)
      }
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
  }, [])

  const matchedCount = results?.size || 0
  const totalMunicipalities = METRO_MUNICIPALITIES.length

  // 결과를 플랫 배열로 변환 (테이블용)
  const flatResults: BenchmarkOrdinanceResult[] = []
  results?.forEach((items) => {
    flatResults.push(...items)
  })

  return {
    isSearching,
    progress,
    results,
    flatResults,
    keyword,
    error,
    matchedCount,
    totalMunicipalities,
    search,
    cancel,
  }
}
