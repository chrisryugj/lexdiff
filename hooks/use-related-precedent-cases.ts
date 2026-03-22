"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import type { PrecedentSearchResult } from "@/lib/precedent-parser"
import { formatPrecedentDate } from "@/lib/precedent-parser"
import { buildPrecedentHtml } from "@/lib/content-click-handlers"
import type { LawArticle, LawMeta } from "@/lib/law-types"

interface RefModalState {
  open: boolean
  title: string
  html: string
  precedentMeta?: {
    court: string
    caseNumber: string
    date: string
    judgmentType?: string
  }
}

interface UseRelatedPrecedentCasesProps {
  isPrecedent: boolean
  meta: LawMeta
  actualArticles: LawArticle[]
  setRefModal: (state: RefModalState) => void
}

interface UseRelatedPrecedentCasesResult {
  // 상태
  showRelatedCases: boolean
  setShowRelatedCases: (v: boolean) => void
  relatedCases: PrecedentSearchResult[]
  loadingRelatedCases: boolean
  hasRelatedCases: boolean

  // 심급 정보
  hasLevelSection: boolean
  currentCourtLevel: 1 | 2 | 3 | null

  // 핸들러
  handleRelatedPrecedentClick: (prec: PrecedentSearchResult) => Promise<void>
}

export function useRelatedPrecedentCases({
  isPrecedent,
  meta,
  actualArticles,
  setRefModal,
}: UseRelatedPrecedentCasesProps): UseRelatedPrecedentCasesResult {
  // 상태
  const [showRelatedCases, setShowRelatedCases] = useState(false)
  const [relatedCases, setRelatedCases] = useState<PrecedentSearchResult[]>([])
  const [loadingRelatedCases, setLoadingRelatedCases] = useState(false)

  // 관련 심급이 존재하는지 (로딩 완료 후)
  const hasRelatedCases = relatedCases.length > 0

  // 판례 전문에서 심급 정보 추출 (배지 표시 + 버튼 활성화용)
  const { hasLevelSection, currentCourtLevel } = useMemo(() => {
    if (!isPrecedent) return { hasLevelSection: false, currentCourtLevel: null as (1 | 2 | 3 | null) }
    // actualArticles 전체 내용 합치기
    const allContent = actualArticles.map(a => a.content || '').join('')
    // "3심", "2심", "1심" 텍스트에서 숫자 추출
    const match = allContent.match(/([123])심/)
    if (match) {
      return { hasLevelSection: true, currentCourtLevel: parseInt(match[1]) as 1 | 2 | 3 }
    }
    return { hasLevelSection: false, currentCourtLevel: null }
  }, [isPrecedent, actualArticles])

  // 의존성 안정화를 위한 값 추출
  const currentCaseNumber = meta.caseNumber
  const currentCaseName = meta.lawTitle

  // 관련 심급 검색 AbortController
  const relatedCasesAbortRef = useRef<AbortController | null>(null)
  // 이미 검색한 사건명 캐시 (중복 API 호출 방지)
  const lastSearchedNameRef = useRef<string | null>(null)

  // 판례 관련 심급 검색 (사건명 기반 API 검색) - 버튼 클릭 시에만 검색
  useEffect(() => {
    if (!isPrecedent || !showRelatedCases) {
      setRelatedCases([])
      setLoadingRelatedCases(false)
      return
    }

    // 사건명이 없으면 검색 불가
    if (!currentCaseName) {
      setRelatedCases([])
      setLoadingRelatedCases(false)
      return
    }

    // 이미 같은 사건명으로 검색했으면 스킵 (무한 루프 방지)
    if (lastSearchedNameRef.current === currentCaseName) {
      return
    }

    // 이전 요청 취소
    relatedCasesAbortRef.current?.abort()
    relatedCasesAbortRef.current = new AbortController()
    const signal = relatedCasesAbortRef.current.signal

    const fetchRelatedCases = async () => {
      setLoadingRelatedCases(true)
      lastSearchedNameRef.current = currentCaseName

      try {
        // 사건명으로 검색 (같은 사건의 1~3심 찾기)
        const params = new URLSearchParams({
          query: currentCaseName,
          display: '20'
        })
        const res = await fetch(`/api/precedent-search?${params}`, { signal })

        if (!res.ok) {
          setRelatedCases([])
          return
        }

        const data = await res.json()
        const results: PrecedentSearchResult[] = data.precedents || []

        // 사건명 100% 일치 필터링 + 현재 판례 제외
        const related = results.filter(p =>
          p.name === currentCaseName &&
          p.caseNumber !== currentCaseNumber
        )
        // 선고일자 순 정렬 (오래된 것 먼저 = 1심부터)
        related.sort((a, b) => {
          const dateA = a.date?.replace(/[.\-]/g, '') || ''
          const dateB = b.date?.replace(/[.\-]/g, '') || ''
          return dateA.localeCompare(dateB)
        })

        setRelatedCases(related)
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        console.error('관련 심급 검색 실패:', e)
        setRelatedCases([])
      } finally {
        if (!signal.aborted) {
          setLoadingRelatedCases(false)
        }
      }
    }

    fetchRelatedCases()

    return () => {
      relatedCasesAbortRef.current?.abort()
    }
  }, [isPrecedent, showRelatedCases, currentCaseName, currentCaseNumber])

  // 관련 심급 판례 클릭 → ReferenceModal로 상세 표시 (기존 판례 모달과 동일 스타일)
  const handleRelatedPrecedentClick = async (prec: PrecedentSearchResult) => {
    // 로딩 표시
    setRefModal({
      open: true,
      title: `판례 조회 중...`,
      html: '<div class="flex items-center justify-center py-8"><div class="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div></div>',
    })

    try {
      const res = await fetch(`/api/precedent-detail?id=${prec.id}`)
      if (res.ok) {
        const detail = await res.json()
        const html = buildPrecedentHtml(detail)
        setRefModal({
          open: true,
          title: detail.name || prec.name,
          html,
          precedentMeta: {
            court: detail.court,
            caseNumber: detail.caseNumber,
            date: formatPrecedentDate(detail.date),
            judgmentType: detail.judgmentType,
          },
        })
      } else {
        setRefModal({
          open: true,
          title: '판례 조회 실패',
          html: `<div class="text-destructive p-4"><p>판례를 불러올 수 없습니다.</p></div>`,
        })
      }
    } catch (e) {
      console.error('판례 상세 조회 실패:', e)
      setRefModal({
        open: true,
        title: '판례 조회 실패',
        html: `<div class="text-destructive p-4"><p>판례를 불러올 수 없습니다.</p></div>`,
      })
    }
  }

  return {
    showRelatedCases,
    setShowRelatedCases,
    relatedCases,
    loadingRelatedCases,
    hasRelatedCases,
    hasLevelSection,
    currentCourtLevel,
    handleRelatedPrecedentClick,
  }
}
