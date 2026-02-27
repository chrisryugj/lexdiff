/**
 * useSearchHandlers/useAiSearch.ts
 *
 * AI 검색 (FC-RAG SSE 스트리밍) 로직
 * 도구 호출 과정을 실시간으로 수신하여 UI에 표시
 */

import { useCallback } from "react"
import { debugLogger } from "@/lib/debug-logger"
import { extractRelatedLaws } from "@/lib/law-parser"
import { getCachedResponse, cacheResponse } from "@/lib/rag-response-cache"
import { detectSearchFailed } from "../../utils"
import type { HandlerDeps, LawDataState } from "./types"
import type { ToolCallLogEntry } from "../../types"

let logIdCounter = 0

export function useAiSearch(deps: HandlerDeps) {
  const { state, actions, toast } = deps

  /** 현재 답변을 대화 히스토리에 저장 */
  const saveCurrentToHistory = useCallback(() => {
    if (state.aiAnswerContent && state.userQuery) {
      actions.addConversationEntry({
        id: `conv-${Date.now()}`,
        query: state.userQuery,
        answer: state.aiAnswerContent,
        citations: state.aiCitations,
        queryType: state.aiQueryType,
        confidenceLevel: state.aiConfidenceLevel,
        timestamp: Date.now(),
      })
    }
  }, [state.aiAnswerContent, state.userQuery, state.aiCitations, state.aiQueryType, state.aiConfidenceLevel, actions])

  const handleAiSearch = useCallback(async (
    fullQuery: string,
    signal?: AbortSignal,
    skipCache?: boolean,
    conversationId?: string | null
  ) => {
    debugLogger.success('SSE FC-RAG 검색 시작', { query: fullQuery, skipCache, conversationId })

    // RAG 캐시 확인
    const cached = skipCache ? null : await getCachedResponse(fullQuery)
    if (cached) {
      debugLogger.success('RAG 캐시 히트 - API 호출 스킵')
      actions.setIsAiMode(true)
      actions.setSearchMode('rag')
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
        signal
      })

      if (signal?.aborted) return

      if (!response.ok) {
        throw new Error(`API 오류: ${response.status}`)
      }

      // ── SSE 스트림 읽기 ──
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        if (signal?.aborted) break
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
          actions.updateProgress('streaming', event.progress)
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
        case 'answer': {
          const data = event.data
          let processedContent = (data.answer || '').replace(/\^/g, ' ')

          // 방어: LLM이 JSON 래퍼로 출력한 경우 answer 필드만 추출
          if (processedContent.startsWith('{') && processedContent.includes('"answer"')) {
            try {
              const sanitized = processedContent.replace(/\n/g, '\\n').replace(/\r/g, '\\r')
              const parsed = JSON.parse(sanitized)
              if (parsed?.answer) processedContent = String(parsed.answer)
            } catch {
              const m = processedContent.match(/"answer"\s*:\s*"([\s\S]+?)"\s*,\s*"(?:citations|confidenceLevel|complexity|queryType|toolsUsed)"/)
              if (m) {
                processedContent = m[1]
                  .replace(/\\n/g, '\n').replace(/\\t/g, '\t')
                  .replace(/\\"/g, '"').replace(/\\\\/g, '\\')
              }
            }
          }
          const searchFailed = detectSearchFailed(processedContent)
          const relatedLaws = extractRelatedLaws(processedContent)

          actions.setFileSearchFailed(searchFailed)
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

  }, [actions, toast])

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
    actions.clearConversation()
    actions.setAiAnswerContent('')
    actions.setAiCitations([])
    actions.setAiRelatedLaws([])
    actions.setUserQuery('')
  }, [actions])

  return { handleAiSearch, handleFollowUp, handleNewConversation }
}
