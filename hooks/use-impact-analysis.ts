"use client"

import { useState, useCallback } from "react"
import type { ImpactResult } from "@/lib/relation-graph/impact-analysis"

interface UseImpactAnalysisReturn {
  data: ImpactResult | null
  isLoading: boolean
  error: string | null
  fetch: () => void
  reset: () => void
}

/**
 * 영향 분석 데이터를 가져오는 훅.
 * 자동 fetch 하지 않고, fetch() 호출 시에만 실행.
 */
export function useImpactAnalysis(
  lawId: string | undefined,
  jo?: string,
): UseImpactAnalysisReturn {
  const [data, setData] = useState<ImpactResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchImpact = useCallback(() => {
    if (!lawId) return

    setIsLoading(true)
    setError(null)

    const params = new URLSearchParams({ lawId })
    if (jo) params.append("jo", jo)

    fetch(`/api/impact-analysis?${params}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(json => {
        if (json.success) {
          setData(json.impact)
        } else {
          setError(json.error || "영향 분석 실패")
        }
      })
      .catch(e => {
        setError(e.message || "영향 분석 중 오류 발생")
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [lawId, jo])

  const reset = useCallback(() => {
    setData(null)
    setError(null)
    setIsLoading(false)
  }, [])

  return { data, isLoading, error, fetch: fetchImpact, reset }
}
