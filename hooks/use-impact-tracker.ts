/**
 * 법령 영향 추적기 SSE 소비 훅
 *
 * useAiSearch.ts의 SSE 패턴을 따름:
 * - fetch + getReader + TextDecoder 루프
 * - 잔여 버퍼 처리 (CLAUDE.md 규칙)
 * - AbortController 취소 지원
 * - impact_item 이벤트 시 즉시 items 배열 추가 (점진적 렌더링)
 */

'use client'

import { useState, useCallback, useRef } from 'react'
import type {
  ImpactTrackerRequest,
  ImpactStep,
  ImpactItem,
  ImpactSummary,
  ImpactSSEEvent,
} from '@/lib/impact-tracker/types'

// B방향: 조례가 참조하는 상위법령 목록
export interface OrdinanceRefInfo {
  ordinanceName: string
  refs: Array<{ lawName: string; refCount: number; articles: string[] }>
}

// B방향: 상위법령 변경 → 영향받는 조례 조문 매핑
export interface ParentLawChangeInfo {
  parentLaw: string
  changedArticles: string[]
  affectedOrdinanceArticles: string[]
}

export function useImpactTracker() {
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [step, setStep] = useState<ImpactStep>('resolving')
  const [statusMessage, setStatusMessage] = useState('')
  const [items, setItems] = useState<ImpactItem[]>([])
  const [summary, setSummary] = useState<ImpactSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aiSource, setAiSource] = useState<'openclaw' | 'gemini' | null>(null)
  const [ordinanceRefs, setOrdinanceRefs] = useState<OrdinanceRefInfo[]>([])
  const [parentLawChanges, setParentLawChanges] = useState<ParentLawChangeInfo[]>([])

  const abortRef = useRef<AbortController | null>(null)

  const handleSSEEvent = useCallback((event: ImpactSSEEvent) => {
    switch (event.type) {
      case 'status':
        setStatusMessage(event.message)
        setProgress(event.progress)
        setStep(event.step)
        break
      case 'law_resolved':
        setStatusMessage(`${event.lawName} 검색 완료`)
        break
      case 'changes_found':
        setStatusMessage(`${event.lawName}: ${event.changes.length}건 변경 발견`)
        break
      case 'impact_item':
        setItems(prev => [...prev, event.item])
        break
      case 'summary':
        setSummary(event.summary)
        break
      case 'ordinance_refs':
        setOrdinanceRefs(prev => [...prev, {
          ordinanceName: event.ordinanceName,
          refs: event.refs,
        }])
        setStatusMessage(`${event.ordinanceName}: 상위법령 ${event.refs.length}건 참조`)
        break
      case 'parent_law_change':
        setParentLawChanges(prev => [...prev, {
          parentLaw: event.parentLaw,
          changedArticles: event.changedArticles,
          affectedOrdinanceArticles: event.affectedOrdinanceArticles,
        }])
        setStatusMessage(`${event.parentLaw}: ${event.changedArticles.length}건 변경 → 조례 ${event.affectedOrdinanceArticles.length}개 조문 영향`)
        break
      case 'ai_source':
        setAiSource(event.source)
        break
      case 'complete':
        setProgress(100)
        setStep('complete')
        setIsAnalyzing(false)
        break
      case 'error':
        if (!event.recoverable) {
          setError(event.message)
          setIsAnalyzing(false)
        }
        break
    }
  }, [])

  const startAnalysis = useCallback((request: ImpactTrackerRequest) => {
    // 이전 분석 취소
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    // 상태 초기화
    setIsAnalyzing(true)
    setProgress(0)
    setStep('resolving')
    setStatusMessage('분석 준비 중...')
    setItems([])
    setSummary(null)
    setError(null)
    setAiSource(null)
    setOrdinanceRefs([])
    setParentLawChanges([])

    // SSE 스트리밍 시작
    const fetchSSE = async () => {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        try {
          const userKey = sessionStorage.getItem('lexdiff-gemini-api-key')
          if (userKey) headers['X-User-API-Key'] = userKey
        } catch { /* SSR or private browsing */ }

        const response = await fetch('/api/impact-tracker', {
          method: 'POST',
          headers,
          body: JSON.stringify(request),
          signal: controller.signal,
        })

        if (controller.signal.aborted) return

        if (!response.ok) {
          const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
          setError(body.error || `오류: ${response.status}`)
          setIsAnalyzing(false)
          return
        }

        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          if (controller.signal.aborted) break

          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n\n')
          buffer = lines.pop() || '' // 마지막 불완전한 청크 보관

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const event = JSON.parse(line.slice(6)) as ImpactSSEEvent
              handleSSEEvent(event)
            } catch {
              // malformed SSE data
            }
          }
        }

        // 잔여 버퍼 처리 (CLAUDE.md 규칙: 루프 후 반드시)
        if (buffer.trim()) {
          for (const line of buffer.split('\n\n')) {
            if (!line.startsWith('data: ')) continue
            try {
              const event = JSON.parse(line.slice(6)) as ImpactSSEEvent
              handleSSEEvent(event)
            } catch {
              // malformed
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setError('네트워크 오류가 발생했습니다.')
        setIsAnalyzing(false)
      }
    }

    fetchSSE()
  }, [handleSSEEvent])

  const cancelAnalysis = useCallback(() => {
    abortRef.current?.abort()
    setIsAnalyzing(false)
    setStatusMessage('분석이 취소되었습니다.')
  }, [])

  const clearResults = useCallback(() => {
    setItems([])
    setSummary(null)
    setError(null)
    setProgress(0)
    setStep('resolving')
    setStatusMessage('')
    setAiSource(null)
    setOrdinanceRefs([])
    setParentLawChanges([])
  }, [])

  return {
    isAnalyzing,
    progress,
    step,
    statusMessage,
    items,
    summary,
    error,
    aiSource,
    ordinanceRefs,
    parentLawChanges,
    startAnalysis,
    cancelAnalysis,
    clearResults,
  }
}
