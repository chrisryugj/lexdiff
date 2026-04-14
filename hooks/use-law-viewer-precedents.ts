/**
 * law-viewer용 판례 통합 훅
 * - 조문 하단에 관련 판례 표시
 * - 사이드 패널로 확장 가능
 */

import { useState, useEffect, useCallback } from 'react'
import { usePrecedents } from '@/hooks/use-precedents'
import { debugLogger } from '@/lib/debug-logger'
import type { LawMeta } from '@/lib/law-types'
import type { PrecedentSearchResult, PrecedentDetail } from '@/lib/precedent-parser'

export function useLawViewerPrecedents(articleNumber: string, meta: LawMeta) {
  // 판례 표시 상태 - 세션 단위로 유지
  const [showPrecedents, setShowPrecedents] = useState(() => {
    if (typeof window === 'undefined') return false
    const saved = sessionStorage.getItem('showPrecedents')
    return saved === 'true'
  })

  // 뷰 모드: bottom (하단 섹션) | side (사이드 패널)
  const [precedentViewMode, setPrecedentViewMode] = useState<"bottom" | "side">("bottom")

  // 선택된 판례 상세
  const [selectedPrecedent, setSelectedPrecedent] = useState<PrecedentDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // 사이드 패널 크기
  const [precedentPanelSize, setPrecedentPanelSize] = useState<number>(() => {
    if (typeof window === 'undefined') return 40
    const saved = localStorage.getItem('precedentPanelSize')
    return saved ? Number.parseInt(saved, 10) : 40
  })

  // showPrecedents 변경 시 sessionStorage에 저장
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('showPrecedents', showPrecedents.toString())
    }
  }, [showPrecedents])

  // 패널 크기 변경 시 localStorage에 저장
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('precedentPanelSize', precedentPanelSize.toString())
    }
  }, [precedentPanelSize])

  // 패널 닫힐 때 뷰 모드만 리셋 (데이터는 유지)
  useEffect(() => {
    if (!showPrecedents) {
      setPrecedentViewMode("bottom")
      setSelectedPrecedent(null)
    }
  }, [showPrecedents])

  // 판례 데이터 조회 — 버튼 숫자 배지를 위해 article 진입 시 백그라운드 prefetch
  // (IndexedDB 캐시 + lastQueryRef 중복 방지로 과호출 없음)
  const {
    precedents,
    totalCount,
    loading: loadingPrecedents,
    error: precedentsError,
    fetchPrecedentDetail
  } = usePrecedents(
    meta.lawTitle,
    articleNumber,
    true,
    20 // 기본 20건 조회 (관련 심급 필터링용)
  )

  // 판례 상세 보기
  const handleViewPrecedentDetail = useCallback(async (precedent: PrecedentSearchResult) => {
    setLoadingDetail(true)
    setSelectedPrecedent(null)

    try {
      const detail = await fetchPrecedentDetail(precedent.id)
      if (detail) {
        setSelectedPrecedent(detail)
        // 상세 보기 시 사이드 패널로 전환
        setPrecedentViewMode("side")
      }
    } catch (err) {
      debugLogger.error("[use-law-viewer-precedents] Detail fetch error:", err)
    } finally {
      setLoadingDetail(false)
    }
  }, [fetchPrecedentDetail])

  // 사이드 패널로 확장
  const expandToSidePanel = useCallback(() => {
    setPrecedentViewMode("side")
  }, [])

  // 하단 섹션으로 축소
  const collapseToBottom = useCallback(() => {
    setPrecedentViewMode("bottom")
    setSelectedPrecedent(null)
  }, [])

  // 법제처 판례 링크 생성
  const getLawGoKrPrecedentLink = useCallback((id: string) => {
    return `https://www.law.go.kr/판례/${id}`
  }, [])

  return {
    // State
    showPrecedents,
    setShowPrecedents,
    precedentViewMode,
    setPrecedentViewMode,
    selectedPrecedent,
    setSelectedPrecedent,
    precedentPanelSize,
    setPrecedentPanelSize,
    loadingDetail,

    // Data
    precedents,
    totalCount,
    loadingPrecedents,
    precedentsError,

    // Handlers
    handleViewPrecedentDetail,
    expandToSidePanel,
    collapseToBottom,
    getLawGoKrPrecedentLink,
    fetchPrecedentDetail
  }
}
