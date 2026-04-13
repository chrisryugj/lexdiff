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

import { useState, useCallback, useRef, useEffect } from 'react'
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

// ── 결과 캐싱 (24h TTL) ────────────────────────────────────
const CACHE_TTL = 24 * 60 * 60 * 1000

function buildCacheKey(req: ImpactTrackerRequest): string {
  const names = [...req.lawNames].sort().join(',')
  return `impact-cache:${names}:${req.dateFrom}:${req.dateTo}:${req.region || ''}`
}

interface ImpactCacheEntry {
  items: ImpactItem[]
  summary: ImpactSummary | null
  cachedAt: number
}

function getCachedResult(req: ImpactTrackerRequest): ImpactCacheEntry | null {
  try {
    const raw = localStorage.getItem(buildCacheKey(req))
    if (!raw) return null
    const entry: ImpactCacheEntry = JSON.parse(raw)
    if (Date.now() - entry.cachedAt > CACHE_TTL) {
      localStorage.removeItem(buildCacheKey(req))
      return null
    }
    return entry
  } catch { return null }
}

function setCacheResult(req: ImpactTrackerRequest, items: ImpactItem[], summary: ImpactSummary | null): void {
  try {
    const entry: ImpactCacheEntry = { items, summary, cachedAt: Date.now() }
    localStorage.setItem(buildCacheKey(req), JSON.stringify(entry))
  } catch { /* localStorage full */ }
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
  // 완료된 단계 기록 (스택형 UI용)
  const [completedSteps, setCompletedSteps] = useState<Array<{ step: ImpactStep; message: string; durationMs: number }>>([])
  const stepStartRef = useRef<number>(Date.now())

  const abortRef = useRef<AbortController | null>(null)

  // F7: 언마운트 시 진행 중 SSE 강제 중단
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const prevStepRef = useRef<ImpactStep>('resolving')
  const prevMessageRef = useRef<string>('')

  const handleSSEEvent = useCallback((event: ImpactSSEEvent) => {
    switch (event.type) {
      case 'status':
        // 단계 전환 시 이전 단계를 completedSteps에 기록
        if (event.step !== prevStepRef.current) {
          const elapsed = Date.now() - stepStartRef.current
          setCompletedSteps(prev => [...prev, {
            step: prevStepRef.current,
            message: prevMessageRef.current || event.message,
            durationMs: elapsed,
          }])
          stepStartRef.current = Date.now()
          prevStepRef.current = event.step
        }
        prevMessageRef.current = event.message
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
        collectedItemsRef.current = [...collectedItemsRef.current, event.item]
        setItems(prev => [...prev, event.item])
        break
      case 'summary':
        collectedSummaryRef.current = event.summary
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
        // 결과 캐싱
        if (currentRequestRef.current && collectedItemsRef.current.length > 0) {
          setCacheResult(currentRequestRef.current, collectedItemsRef.current, collectedSummaryRef.current)
        }
        break
      case 'error':
        if (!event.recoverable) {
          setError(event.message)
          setIsAnalyzing(false)
        }
        break
    }
  }, [])

  // 캐시 저장용 ref (complete 이벤트에서 사용)
  const currentRequestRef = useRef<ImpactTrackerRequest | null>(null)
  const collectedItemsRef = useRef<ImpactItem[]>([])
  const collectedSummaryRef = useRef<ImpactSummary | null>(null)

  const startAnalysis = useCallback((request: ImpactTrackerRequest, skipCache = false) => {
    // 캐시 체크
    const cached = !skipCache ? getCachedResult(request) : null
    if (cached) {
      setIsAnalyzing(false)
      setProgress(100)
      setStep('complete')
      setStatusMessage('캐시된 결과 로드')
      setItems(cached.items)
      setSummary(cached.summary)
      setError(null)
      setAiSource(null)
      setOrdinanceRefs([])
      setParentLawChanges([])
      setCompletedSteps([{ step: 'complete', message: '캐시 결과 (24h)', durationMs: 0 }])
      return
    }

    // 이전 분석 취소
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    currentRequestRef.current = request
    collectedItemsRef.current = []
    collectedSummaryRef.current = null

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
    setCompletedSteps([])
    stepStartRef.current = Date.now()
    prevStepRef.current = 'resolving'
    prevMessageRef.current = ''

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

        // 401: 로그인 필요 → 전역 게이트 다이얼로그 트리거 + request 스냅샷 저장
        if (response.status === 401) {
          try {
            if (currentRequestRef.current) {
              sessionStorage.setItem(
                'lexdiff:impact-tracker-restore',
                JSON.stringify(currentRequestRef.current)
              )
            }
          } catch { /* ignore */ }
          window.dispatchEvent(new CustomEvent('lexdiff:ai-gate-required', {
            detail: { returnView: { mode: 'impact-tracker' } }
          }))
          setError('영향 추적기는 로그인 또는 본인 API 키 등록이 필요합니다.')
          setIsAnalyzing(false)
          return
        }

        // 429: 쿼터 초과
        if (response.status === 429) {
          const body = await response.json().catch(() => ({}))
          setError(body.message || '오늘 영향 추적기 한도를 초과했습니다.')
          setIsAnalyzing(false)
          return
        }

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
    setCompletedSteps([])
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
    completedSteps,
    startAnalysis,
    cancelAnalysis,
    clearResults,
  }
}
