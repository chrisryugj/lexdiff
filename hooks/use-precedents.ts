/**
 * 판례 조회 Hook
 * - 법령명 + 조문번호로 관련 판례 검색
 * - IndexedDB 캐시 지원
 */

import { useState, useEffect, useRef, useCallback } from "react"
import { debugLogger } from "@/lib/debug-logger"
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
    // enabled가 false일 때는 데이터 유지 (UI만 숨김)
    if (!enabled) {
      return
    }

    if (!lawName || !articleNumber) {
      setPrecedents([])
      setTotalCount(0)
      setLoading(false)
      setError(null)
      return
    }

    // 검색 쿼리 구성: "법령명 제N조" (예: "관세법 제38조")
    // 이 문자열을 판례 "본문"에서 검색(bodySearch=1 → search=2)해 해당 조문을 인용한 판례를 찾는다.
    // (기본 판례명검색은 "제N조" 토큰이 안 걸려 항상 0건)
    const query = `${lawName} ${articleNumber}`
    // 본문검색 전용 캐시키 — 과거 판례명검색(search=1) 시절 캐시된 0건 항목과 충돌 방지
    const cacheKey = `${query}::ref`

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
        const cached = await getPrecedentSearchCache(cacheKey)
        if (cached) {
          setPrecedents(cached.precedents)
          setTotalCount(cached.totalCount)
          setLoading(false)
          return
        }

        // 2. API 호출
        const params = new URLSearchParams({
          query,
          display: display.toString(),
          exact: "1", // 법령명 기반 조회 — 서버측 검색어 정제 스킵(법령명 손상 방지)
          bodySearch: "1" // 본문검색(search=2) — "제N조" 토큰을 판례 본문에서 매칭
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
        await setPrecedentSearchCache(cacheKey, data.totalCount || 0, data.precedents || [])

      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return // 취소된 요청은 무시
        }
        debugLogger.error("[use-precedents] Error:", err)
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
      debugLogger.error("[use-precedents] fetchDetail error:", err)
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
