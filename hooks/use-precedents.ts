/**
 * 판례 조회 Hook
 * - 법령명 + 조문번호로 관련 판례 검색
 * - IndexedDB 캐시 지원
 */

import { useState, useEffect, useRef, useCallback } from "react"
import type { PrecedentSearchResult, PrecedentDetail } from "@/lib/precedent-parser"
import {
  getPrecedentSearchCache,
  setPrecedentSearchCache,
  getPrecedentDetailCache,
  setPrecedentDetailCache
} from "@/lib/precedent-cache"

interface UsePrecedentsResult {
  precedents: PrecedentSearchResult[]
  totalCount: number
  loading: boolean
  error: string | null
  fetchPrecedentDetail: (id: string) => Promise<PrecedentDetail | null>
}

/**
 * 특정 법령 조문에 대한 판례 조회
 */
export function usePrecedents(
  lawName: string | null,
  articleNumber: string | null,
  enabled: boolean = true,
  display: number = 5
): UsePrecedentsResult {
  const [precedents, setPrecedents] = useState<PrecedentSearchResult[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 중복 요청 방지
  const lastQueryRef = useRef<string>("")
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!enabled || !lawName || !articleNumber) {
      setPrecedents([])
      setTotalCount(0)
      setLoading(false)
      setError(null)
      return
    }

    // 검색 쿼리 구성: "법령명 제N조"
    const query = `${lawName} ${articleNumber}`

    // 동일 쿼리면 스킵
    if (query === lastQueryRef.current) {
      return
    }
    lastQueryRef.current = query

    // 이전 요청 취소
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    const fetchPrecedents = async () => {
      setLoading(true)
      setError(null)

      try {
        // 1. 캐시 확인
        const cached = await getPrecedentSearchCache(query)
        if (cached) {
          setPrecedents(cached.precedents)
          setTotalCount(cached.totalCount)
          setLoading(false)
          return
        }

        // 2. API 호출
        const params = new URLSearchParams({
          query,
          display: display.toString()
        })

        const response = await fetch(`/api/precedent-search?${params}`, {
          signal: abortControllerRef.current?.signal
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const data = await response.json()

        if (data.error) {
          throw new Error(data.error)
        }

        // 3. 결과 저장
        setPrecedents(data.precedents || [])
        setTotalCount(data.totalCount || 0)

        // 4. 캐시에 저장
        await setPrecedentSearchCache(query, data.totalCount || 0, data.precedents || [])

      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return // 취소된 요청은 무시
        }
        console.error("[use-precedents] Error:", err)
        setError(err instanceof Error ? err.message : "판례 검색 실패")
        setPrecedents([])
        setTotalCount(0)
      } finally {
        setLoading(false)
      }
    }

    fetchPrecedents()

    return () => {
      abortControllerRef.current?.abort()
    }
  }, [enabled, lawName, articleNumber, display])

  // 판례 상세 조회 함수
  const fetchPrecedentDetail = useCallback(async (id: string): Promise<PrecedentDetail | null> => {
    try {
      // 1. 캐시 확인
      const cached = await getPrecedentDetailCache(id)
      if (cached) {
        return cached
      }

      // 2. API 호출
      const response = await fetch(`/api/precedent-text?id=${encodeURIComponent(id)}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      if (data.error) {
        throw new Error(data.error)
      }

      // 3. 캐시에 저장
      await setPrecedentDetailCache(id, data)

      return data as PrecedentDetail
    } catch (err) {
      console.error("[use-precedents] fetchDetail error:", err)
      return null
    }
  }, [])

  return {
    precedents,
    totalCount,
    loading,
    error,
    fetchPrecedentDetail
  }
}
