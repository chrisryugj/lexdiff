/**
 * useSearchHandlers/useAiSearch.ts
 *
 * AI 검색 (FC-RAG SSE 스트리밍) 로직
 * 도구 호출 과정을 실시간으로 수신하여 UI에 표시
 */

import { useCallback, useRef } from "react"
import { debugLogger } from "@/lib/debug-logger"
import { extractRelatedLaws } from "@/lib/law-parser"
import { getCachedResponse, cacheResponse, updateCachedResponseCitations } from "@/lib/rag-response-cache"
import type { HandlerDeps, LawDataState } from "./types"
import type { ToolCallLogEntry } from "../../types"

let logIdCounter = 0

export function useAiSearch(deps: HandlerDeps) {
  const { state, actions, toast } = deps
  const abortRef = useRef<AbortController | null>(null)
  const streamBufferRef = useRef<string>('')  // 스트리밍 토큰 누적 버퍼

  /** 현재 답변을 대화 히스토리에 저장 */
  const saveCurrentToHistory = useCallback(() => {
    if (state.aiAnswerContent && state.userQuery) {
      actions.addConversationEntry({
        id: `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        query: state.userQuery,
        answer: state.aiAnswerContent,
        citations: state.aiCitations,
        queryType: state.aiQueryType,
        confidenceLevel: state.aiConfidenceLevel,
        timestamp: Date.now(),
      })
    }
  }, [state.aiAnswerContent, state.userQuery, state.aiCitations, state.aiQueryType, state.aiConfidenceLevel, actions])

  const persistVerifiedCitations = useCallback(async (query: string, citations: any[]) => {
    try {
      const { saveSearchResult, getSearchResult } = await import('@/lib/search-result-store')
      const currentState = window.history.state
      const currentSearchId = currentState?.searchId

      if (currentSearchId) {
        const existingCache = await getSearchResult(currentSearchId)
        if (existingCache?.aiMode) {
          await saveSearchResult({
            ...existingCache,
            aiMode: {
              ...existingCache.aiMode,
              aiCitations: citations,
            }
          })
        }
      }
    } catch (e) {
      debugLogger.error('검증 citation 캐시 갱신 실패', e)
    }

    try {
      await updateCachedResponseCitations(query, citations)
    } catch (e) {
      debugLogger.error('RAG citation 캐시 갱신 실패', e)
    }
  }, [])

  const handleAiSearch = useCallback(async (
    fullQuery: string,
    signal?: AbortSignal,
    skipCache?: boolean,
    conversationId?: string | null
  ) => {
    debugLogger.success('SSE FC-RAG 검색 시작', { query: fullQuery, skipCache, conversationId })

    // 이전 검색 진행 중이면 abort
    if (abortRef.current) {
      abortRef.current.abort()
    }
    const controller = new AbortController()
    abortRef.current = controller
    // 외부 signal과 내부 controller 병합
    const mergedSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal

    // RAG 캐시 확인
    const cached = skipCache ? null : await getCachedResponse(fullQuery)
    if (cached) {
      debugLogger.success('RAG 캐시 히트 - API 호출 스킵')
      actions.setIsSearching(true)
      actions.setIsAiMode(true)
      actions.setSearchMode('rag')
      actions.updateProgress('analyzing', 50)

      // 캐시 로딩 피드백 (너무 즉시 표시되면 UX 어색)
      await new Promise(r => setTimeout(r, 250))

      const relatedLaws = extractRelatedLaws(cached.response)
      actions.setAiAnswerContent(cached.response)
      actions.setAiRelatedLaws(relatedLaws)
      actions.setAiCitations(cached.citations || [])
      actions.setAiQueryType((cached.queryType || 'application') as any)
      actions.setFileSearchFailed(false)
      const aiLawData: LawDataState = {
        meta: {
          lawId: 'ai-answer', lawTitle: 'AI 답변',
          promulgationDate: new Date().toISOString().split('T')[0],
          lawType: 'AI', isOrdinance: false, fetchedAt: new Date().toISOString()
        },
        articles: [], selectedJo: undefined, isOrdinance: false
      }
      actions.setLawData(aiLawData)
      actions.setMobileView("content")
      actions.setIsSearching(false)
      actions.updateProgress('complete', 100)
      return
    }

    // ── 검색 시작 ──
    actions.setIsSearching(true)
    actions.setIsAiMode(true)
    actions.setSearchMode('rag')
    actions.setAiAnswerContent('')
    actions.setAiRelatedLaws([])
    actions.setAiCitations([])
    actions.setFileSearchFailed(false)
    // userQuery는 handleSearchInternal에서 rawQuery로 이미 설정됨
    actions.clearToolCallLogs()
    actions.updateProgress('analyzing', 5)
    streamBufferRef.current = '' // 스트리밍 버퍼 초기화

    // AI 뷰 즉시 표시
    const aiLawData: LawDataState = {
      meta: {
        lawId: 'ai-answer', lawTitle: 'AI 법률 어시스턴트',
        promulgationDate: new Date().toISOString().split('T')[0],
        lawType: 'AI', isOrdinance: false, fetchedAt: new Date().toISOString()
      },
      articles: [], selectedJo: undefined, isOrdinance: false
    }
    actions.setLawData(aiLawData)
    actions.setMobileView("content")

    try {
      // BYO-Key
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      try {
        const userKey = sessionStorage.getItem('lexdiff-gemini-api-key')
        if (userKey) headers['X-User-API-Key'] = userKey
      } catch { /* SSR or private browsing */ }

      // conversationId 확정 및 state 저장 (follow-up에서 재사용)
      const actualConvId = conversationId || `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      if (!conversationId) {
        actions.setConversationId(actualConvId)
      }

      const response = await fetch('/api/fc-rag', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: fullQuery,
          conversationId: actualConvId,
        }),
        signal: mergedSignal
      })

      if (mergedSignal.aborted) return

      if (!response.ok) {
        throw new Error(`API 오류: ${response.status}`)
      }

      // ── SSE 스트림 읽기 ──
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        if (mergedSignal.aborted) break
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || '' // 마지막 미완성 라인 보존

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            handleSSEEvent(event, fullQuery)
          } catch {
            debugLogger.error('SSE 파싱 오류', line)
          }
        }
      }

      // 잔여 버퍼 처리
      if (buffer.startsWith('data: ')) {
        try {
          const event = JSON.parse(buffer.slice(6))
          handleSSEEvent(event, fullQuery)
        } catch { /* ignore */ }
      }

      // 안전장치: answer 이벤트 없이 스트림 종료된 경우 isSearching 해제
      if (state.isSearching) {
        actions.setIsSearching(false)
        actions.updateProgress('complete', 100)
      }

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        debugLogger.info('AI 검색 취소됨')
        actions.setIsSearching(false)
        actions.updateProgress('complete', 0)
        actions.setIsAiMode(false)
        return
      }

      debugLogger.error('FC-RAG SSE 오류', error)
      actions.setIsSearching(false)
      actions.updateProgress('complete', 0)
      actions.setIsAiMode(false)
      toast({
        title: "AI 검색 실패",
        description: error instanceof Error ? error.message : "AI 답변을 가져오는 데 실패했습니다.",
        variant: "destructive"
      })
    }

    // ── SSE 이벤트 핸들러 ──
    function handleSSEEvent(event: any, query: string) {
      switch (event.type) {
        case 'status': {
          // Bridge는 phase/message만 보내고 progress 숫자를 포함하지 않으므로 phase → progress 매핑
          const PHASE_PROGRESS: Record<string, number> = {
            cached:     50,
            fetching:   20,
            analyzing:  15,
            tools:      35,
            reasoning:  60,
            finalizing: 80,
          }
          const resolvedProgress = typeof event.progress === 'number'
            ? event.progress
            : (PHASE_PROGRESS[event.phase] ?? 30)
          actions.updateProgress('streaming', resolvedProgress)
          actions.addToolCallLog({
            id: `log-${++logIdCounter}`,
            type: 'status',
            displayName: event.message,
            message: event.message,
            timestamp: Date.now(),
          })
          break
        }
        case 'tool_call': {
          actions.addToolCallLog({
            id: `log-${++logIdCounter}`,
            type: 'call',
            name: event.name,
            displayName: event.displayName,
            query: event.query,
            timestamp: Date.now(),
          })
          break
        }
        case 'tool_result': {
          actions.addToolCallLog({
            id: `log-${++logIdCounter}`,
            type: 'result',
            name: event.name,
            displayName: event.displayName,
            success: event.success,
            summary: event.summary,
            timestamp: Date.now(),
          })
          break
        }
        case 'token_usage': {
          actions.addToolCallLog({
            id: `log-${++logIdCounter}`,
            type: 'token_usage',
            displayName: `토큰(누적): ${event.inputTokens?.toLocaleString()} in / ${event.outputTokens?.toLocaleString()} out`,
            timestamp: Date.now(),
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            totalTokens: event.totalTokens,
          })
          break
        }
        case 'answer_token': {
          // 스트리밍 토큰: 답변을 실시간으로 누적 표시
          const tokenText = event.data?.text || ''
          if (tokenText) {
            streamBufferRef.current += tokenText
            actions.setAiAnswerContent(streamBufferRef.current)
            actions.updateProgress('streaming', 75)
          }
          break
        }
        case 'answer': {
          const data = event.data
          // Bridge에서 이미 extractAnswerFromJson 처리됨 — 중복 추출 불필요
          const processedContent = (data.answer || '').replace(/\^/g, ' ')
          const searchFailed = false // Gemini RAG에서는 별도 실패 감지 불필요
          const relatedLaws = extractRelatedLaws(processedContent)

          actions.setFileSearchFailed(searchFailed)
          // 스트리밍 완료 후 최종 답변으로 교체 (JSON 추출 등 방어 로직 적용된 버전)
          actions.setAiAnswerContent(processedContent)
          actions.setAiRelatedLaws(relatedLaws)
          actions.setAiCitations(data.citations || [])
          actions.setAiQueryType((data.queryType || 'application') as any)
          actions.setAiConfidenceLevel(data.confidenceLevel || 'high')
          actions.setAiIsTruncated(data.isTruncated || false)
          actions.updateProgress('complete', 100)

          debugLogger.success('AI 답변 완료', {
            contentLength: processedContent.length,
            citations: (data.citations || []).length,
            complexity: data.complexity,
            confidenceLevel: data.confidenceLevel,
          })

          // lawData 업데이트
          actions.setLawData({
            meta: {
              lawId: 'ai-answer', lawTitle: 'AI 답변',
              promulgationDate: new Date().toISOString().split('T')[0],
              lawType: 'AI', isOrdinance: false, fetchedAt: new Date().toISOString()
            },
            articles: [], selectedJo: undefined, isOrdinance: false
          })

          // 검색 완료 즉시 (isStreaming=false → 깜빡임 커서 즉시 제거)
          actions.setIsSearching(false)

          // 캐시 저장 (백그라운드)
          saveCaches(query, processedContent, data, relatedLaws, searchFailed)
          break
        }
        case 'citation_verification': {
          // 검증된 citation으로 교체
          if (event.citations && event.citations.length > 0) {
            actions.setAiCitations(event.citations)
            persistVerifiedCitations(query, event.citations)
            debugLogger.success('인용 검증 완료', {
              total: event.citations.length,
              verified: event.citations.filter((c: any) => c.verified).length,
            })
          }
          break
        }
        case 'error': {
          debugLogger.error('FC-RAG 서버 오류', event.message)
          actions.addToolCallLog({
            id: `log-${++logIdCounter}`,
            type: 'status',
            displayName: `오류: ${event.message}`,
            message: event.message,
            timestamp: Date.now(),
          })
          break
        }
      }
    }

    async function saveCaches(
      query: string,
      processedContent: string,
      data: any,
      relatedLaws: any[],
      searchFailed: boolean
    ) {
      try {
        const { saveSearchResult, getSearchResult } = await import('@/lib/search-result-store')
        const currentState = window.history.state
        const currentSearchId = currentState?.searchId
        if (currentSearchId) {
          const existingCache = await getSearchResult(currentSearchId)
          if (existingCache) {
            await saveSearchResult({
              ...existingCache,
              aiMode: {
                aiAnswerContent: processedContent,
                aiRelatedLaws: relatedLaws,
                aiCitations: data.citations || [],
                userQuery: query,
                fileSearchFailed: searchFailed,
                aiQueryType: data.queryType || 'application'
              }
            })
          }
        }
      } catch (e) { debugLogger.error('캐시 저장 실패', e) }

      try {
        await cacheResponse(query, processedContent, data.citations, data.confidenceLevel, data.queryType)
      } catch (e) { debugLogger.error('RAG 캐시 저장 실패', e) }
    }

  }, [actions, toast, state.isSearching, persistVerifiedCitations])

  /** 연속 대화 추가 질문 */
  const handleFollowUp = useCallback((followUpQuery: string) => {
    // 현재 답변을 히스토리에 저장
    saveCurrentToHistory()

    // conversationId 생성 (첫 follow-up 시)
    let convId = state.conversationId
    if (!convId) {
      convId = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      actions.setConversationId(convId)
    }

    // userQuery 업데이트 + AI 검색 실행
    actions.setUserQuery(followUpQuery)
    handleAiSearch(followUpQuery, undefined, true, convId)
  }, [saveCurrentToHistory, state.conversationId, actions, handleAiSearch])

  /** 새 대화 시작 */
  const handleNewConversation = useCallback(() => {
    if (abortRef.current) abortRef.current.abort()
    actions.clearConversation()
    actions.setConversationId(null)
    actions.setAiAnswerContent('')
    actions.setAiCitations([])
    actions.setAiRelatedLaws([])
    actions.setUserQuery('')
    actions.setIsSearching(false)
    actions.updateProgress('complete', 0)
    actions.clearToolCallLogs()
    actions.setFileSearchFailed(false)
  }, [actions])

  return { handleAiSearch, handleFollowUp, handleNewConversation }
}
