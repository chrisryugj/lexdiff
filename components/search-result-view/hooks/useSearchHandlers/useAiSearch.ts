/**
 * useSearchHandlers/useAiSearch.ts
 *
 * AI 검색 (FC-RAG SSE 스트리밍) 로직
 * 도구 호출 과정을 실시간으로 수신하여 UI에 표시
 */

import { useCallback, useRef } from "react"
import { debugLogger } from "@/lib/debug-logger"
import { extractRelatedLaws, type ParsedRelatedLaw } from "@/lib/law-parser"
import { getCachedResponse, cacheResponse, updateCachedResponseCitations } from "@/lib/rag-response-cache"
import type { VerifiedCitation } from "@/lib/citation-verifier"
import type { HandlerDeps, LawDataState } from "./types"
import type { ToolCallLogEntry } from "../../types"

type AiQueryType = 'definition' | 'requirement' | 'procedure' | 'comparison' | 'application' | 'consequence' | 'scope' | 'exemption'

export function useAiSearch(deps: HandlerDeps) {
  const { state, actions, toast } = deps
  const abortRef = useRef<AbortController | null>(null)
  const streamBufferRef = useRef<string>('')  // 스트리밍 토큰 누적 버퍼
  const answerReceivedRef = useRef(false)  // answer 이벤트 수신 여부
  const answerTokenStartedRef = useRef(false)  // 첫 answer_token 수신 여부
  const logIdCounterRef = useRef(0)  // React concurrent/StrictMode 안전한 카운터

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

  const persistVerifiedCitations = useCallback(async (query: string, citations: VerifiedCitation[]) => {
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
    conversationId?: string | null,
    preEvidence?: string,
  ) => {
    // Auth는 서버에서 처리 (Supabase 세션 또는 BYOK 헤더).
    // 401 응답은 아래 fetch 후 status 체크로 잡아서 게이트 이벤트 발송.
    const t0 = performance.now()
    const elapsed = () => `${((performance.now() - t0) / 1000).toFixed(1)}s`
    let lastEventAt = t0
    let eventCount = 0
    let chunkCount = 0
    let lastEventType = ''
    debugLogger.success('[AI] SSE FC-RAG 검색 시작', { query: fullQuery, skipCache, conversationId })

    // ★ 새 AI 검색 진입 즉시 이전 답변 화면을 와이프 + SSE 로딩 UI로 전환
    // - 모든 진입 경로 커버: handleSearchInternal / handleAiQuery / handleFollowUp / handleAiRefresh
    // - isSearching/isAiMode 를 같은 tick에 set → 본문은 비우고 SSE 로그만 뜨는 상태 유지
    //   (이게 없으면 aiAnswerContent='' && !isStreaming 의 짧은 gap 동안 "결과 없음" 배너가 번쩍임)
    actions.setIsSearching(true)
    actions.setIsAiMode(true)
    actions.setSearchMode('rag')
    actions.setAiAnswerContent('')
    actions.setAiRelatedLaws([])
    actions.setAiCitations([])
    actions.clearToolCallLogs()
    actions.setFileSearchFailed(false)
    actions.setAiAuthRequired(false)
    actions.updateProgress('analyzing', 5)
    streamBufferRef.current = ''
    answerReceivedRef.current = false
    answerTokenStartedRef.current = false

    // 이전 검색 진행 중이면 abort
    if (abortRef.current) {
      abortRef.current.abort()
    }
    const controller = new AbortController()
    abortRef.current = controller
    // 외부 signal과 내부 controller 병합 (AbortSignal.any 미지원 브라우저 대응)
    let mergedSignal: AbortSignal
    if (signal) {
      if (typeof AbortSignal.any === 'function') {
        mergedSignal = AbortSignal.any([signal, controller.signal])
      } else {
        // 폴백: 외부 signal abort 시 내부 controller도 abort
        const onExternalAbort = () => controller.abort()
        signal.addEventListener('abort', onExternalAbort, { once: true })
        controller.signal.addEventListener('abort', () => {
          signal.removeEventListener('abort', onExternalAbort)
        }, { once: true })
        mergedSignal = controller.signal
      }
    } else {
      mergedSignal = controller.signal
    }

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
      actions.setAiQueryType((cached.queryType || 'application') as AiQueryType)
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
    actions.setAiAuthRequired(false)
    actions.setFileSearchFailed(false)
    // userQuery는 handleSearchInternal에서 rawQuery로 이미 설정됨
    actions.clearToolCallLogs()
    actions.updateProgress('analyzing', 5)
    streamBufferRef.current = '' // 스트리밍 버퍼 초기화
    answerReceivedRef.current = false
    answerTokenStartedRef.current = false

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

      // H-SEC2: 높은 엔트로피가 필요한 conversationId는 crypto.randomUUID()로 생성.
      // 기존 q-{timestamp}-{5자} 포맷은 열거 공격에 취약.
      const actualConvId = conversationId || (
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
      )
      if (!conversationId) {
        actions.setConversationId(actualConvId)
      }

      debugLogger.info(`[AI ${elapsed()}] POST /api/fc-rag`, { convId: actualConvId, preEvidence: !!preEvidence })
      const response = await fetch('/api/fc-rag', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: fullQuery,
          conversationId: actualConvId,
          ...(preEvidence ? { preEvidence } : {}),
        }),
        signal: mergedSignal
      })
      debugLogger.info(`[AI ${elapsed()}] 응답 헤더 수신`, { status: response.status })

      if (mergedSignal.aborted) {
        actions.setIsSearching(false)
        actions.updateProgress('complete', 0)
        return
      }

      // 401: 로그인 필요 → 폴백 화면 + 게이트 다이얼로그 트리거
      if (response.status === 401) {
        actions.setAiAnswerContent('')
        actions.setAiAuthRequired(true)
        actions.setIsSearching(false)
        actions.updateProgress('complete', 0)
        window.dispatchEvent(new CustomEvent('lexdiff:ai-gate-required', {
          detail: { query: fullQuery }
        }))
        return
      }

      // 429: 쿼터 초과
      if (response.status === 429) {
        const body = await response.json().catch(() => ({}))
        actions.setAiAnswerContent(body.message || '오늘 AI 검색 한도를 초과했습니다. 본인 API 키를 등록하면 무제한으로 사용할 수 있습니다.')
        actions.setAiConfidenceLevel('low')
        actions.setIsSearching(false)
        actions.updateProgress('complete', 0)
        return
      }

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
        if (done) {
          debugLogger.info(`[AI ${elapsed()}] 스트림 종료 (reader done)`, { events: eventCount, chunks: chunkCount, lastType: lastEventType })
          break
        }

        chunkCount++
        const sinceLast = ((performance.now() - lastEventAt) / 1000).toFixed(1)
        if (Number(sinceLast) > 5) {
          debugLogger.warning(`[AI ${elapsed()}] 긴 대기 후 청크 수신 (+${sinceLast}s, last=${lastEventType || 'none'})`)
        }
        lastEventAt = performance.now()

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || '' // 마지막 미완성 라인 보존

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            eventCount++
            lastEventType = event.type || 'unknown'
            if (lastEventType !== 'answer_token') {
              debugLogger.info(`[AI ${elapsed()}] SSE ${lastEventType}`, event.name || event.phase || event.message || '')
            }
            handleSSEEvent(event, fullQuery)
          } catch {
            debugLogger.error('[AI] SSE 파싱 오류', line)
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

      // 안전장치: 스트림 종료 시 answer 미수신 → 에러 상태 표시
      if (!answerReceivedRef.current) {
        debugLogger.error(`[AI ${elapsed()}] SSE 스트림 종료 - answer 이벤트 미수신`, { events: eventCount, chunks: chunkCount, lastType: lastEventType })
        actions.setAiAnswerContent('죄송합니다. AI 엔진 응답을 받지 못했습니다. 다시 시도해 주세요.')
        actions.setAiConfidenceLevel('low')
      }

      // 안전장치: 스트림 종료 시 isSearching 무조건 해제
      // (state.isSearching은 stale closure 문제로 현재 값이 아닐 수 있음)
      actions.setIsSearching(false)
      actions.updateProgress('complete', 100)

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        debugLogger.info(`[AI ${elapsed()}] 검색 취소됨`, { events: eventCount, lastType: lastEventType })
        actions.setIsSearching(false)
        actions.updateProgress('complete', 0)
        actions.setIsAiMode(false)
        return
      }

      debugLogger.error(`[AI ${elapsed()}] FC-RAG SSE 오류`, { error, events: eventCount, chunks: chunkCount, lastType: lastEventType })
      actions.setIsSearching(false)
      actions.updateProgress('complete', 0)
      // isAiMode 유지하고 에러 메시지 표시 (isAiMode=false로 하면 빈 lawData 상태의 깨진 UI 노출)
      actions.setAiAnswerContent('죄송합니다. AI 검색 중 오류가 발생했습니다. 다시 시도해 주세요.')
      actions.setAiConfidenceLevel('low')
      toast({
        title: "AI 검색 실패",
        description: error instanceof Error ? error.message : "AI 답변을 가져오는 데 실패했습니다.",
        variant: "destructive"
      })
    }

    // ── SSE 이벤트 핸들러 ──
    // FCRAG 이벤트는 type별 union이지만 외부 소스이므로 unknown으로 받고 내부 cast
    function handleSSEEvent(rawEvent: unknown, query: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const event = rawEvent as Record<string, any>

      // F1: 서버가 retry/fallback 시 송출하는 stream_reset — 누적 버퍼/로그를 비워 답변 중복 표시 방지
      if (event.type === 'stream_reset') {
        streamBufferRef.current = ''
        answerTokenStartedRef.current = false
        answerReceivedRef.current = false
        actions.setAiAnswerContent('')
        actions.clearToolCallLogs()
        return
      }

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
          // answer 이후 progress 역행 방지 (100% → 95% 역행 차단)
          if (!answerReceivedRef.current) {
            actions.updateProgress('streaming', resolvedProgress)
          }
          // status는 타임라인 단독 단계로는 안 쓰이지만,
          // 진행 중인 도구 단계 아래 하위 텍스트로 표시됨 (lastStatusMessage)
          actions.addToolCallLog({
            id: `log-${++logIdCounterRef.current}`,
            type: 'status',
            displayName: event.message,
            message: event.message,
            timestamp: Date.now(),
          })
          break
        }
        case 'tool_call': {
          actions.addToolCallLog({
            id: `log-${++logIdCounterRef.current}`,
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
            id: `log-${++logIdCounterRef.current}`,
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
            id: `log-${++logIdCounterRef.current}`,
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
            // 첫 토큰 수신 시 "답변 생성 중" 단계 추가 (타임라인에 표시)
            if (!answerTokenStartedRef.current) {
              answerTokenStartedRef.current = true
              actions.addToolCallLog({
                id: `log-${++logIdCounterRef.current}`,
                type: 'call',
                name: 'generate_answer',
                displayName: '답변 생성',
                timestamp: Date.now(),
              })
            }
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
          actions.setAiQueryType((data.queryType || 'application') as AiQueryType)
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

          // "답변 생성" 단계 완료 마킹
          if (answerTokenStartedRef.current) {
            actions.addToolCallLog({
              id: `log-${++logIdCounterRef.current}`,
              type: 'result',
              name: 'generate_answer',
              displayName: '답변 생성',
              success: true,
              timestamp: Date.now(),
            })
          }

          // 검색 완료 즉시 (isStreaming=false → 깜빡임 커서 즉시 제거)
          answerReceivedRef.current = true
          actions.setIsSearching(false)

          // 캐시 저장 (백그라운드)
          saveCaches(query, processedContent, data, relatedLaws, searchFailed)
          break
        }
        case 'citation_verification': {
          // 검증된 citation으로 교체
          if (event.citations && event.citations.length > 0) {
            const verifiedCount = (event.citations as VerifiedCitation[]).filter((c) => c.verified).length
            actions.setAiCitations(event.citations)
            persistVerifiedCitations(query, event.citations)
            // 검증 완료 로그 추가
            actions.addToolCallLog({
              id: `log-${++logIdCounterRef.current}`,
              type: 'result',
              name: 'citation_verification',
              displayName: `인용 검증 완료 (${verifiedCount}/${event.citations.length})`,
              success: true,
              timestamp: Date.now(),
            })
            debugLogger.success('인용 검증 완료', {
              total: event.citations.length,
              verified: verifiedCount,
            })
          }
          break
        }
        case 'source': {
          actions.addToolCallLog({
            id: `log-${++logIdCounterRef.current}`,
            type: 'source',
            displayName: event.source === 'claude' ? 'Claude' : event.source === 'openclaw' ? 'Claude (Bridge)' : 'Gemini',
            message: event.source,
            timestamp: Date.now(),
          })
          break
        }
        case 'error': {
          debugLogger.error('FC-RAG 서버 오류', event.message)
          actions.addToolCallLog({
            id: `log-${++logIdCounterRef.current}`,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: any,
      relatedLaws: ParsedRelatedLaw[],
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
        // 실질적으로 빈 답변이나 실패 답변은 캐싱하지 않음 (다음 시도 시 재검색)
        const isEmptyAnswer = !processedContent || processedContent.length < 50 ||
          /검색 결과.*없|찾을 수 없|조회.*실패|확인.*어렵/.test(processedContent)
        if (!isEmptyAnswer) {
          await cacheResponse(query, processedContent, data.citations, data.confidenceLevel, data.queryType)
        } else {
          debugLogger.warning('빈/실패 AI 답변 - RAG 캐시 저장 스킵', { contentLength: processedContent?.length })
        }
      } catch (e) { debugLogger.error('RAG 캐시 저장 실패', e) }
    }

    // P1-AI-6: state.isSearching은 본문에서 사용되지 않으므로 deps에서 제거 (불필요한 재생성 방지)
  }, [actions, toast, persistVerifiedCitations])

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

  /** 진행 중인 AI 스트리밍 중지 (UI 버튼용) */
  const stopAiSearch = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { handleAiSearch, handleFollowUp, handleNewConversation, stopAiSearch }
}
