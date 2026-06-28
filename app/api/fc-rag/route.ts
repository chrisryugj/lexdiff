/**
 * FC-RAG API endpoint with SSE streaming.
 *
 * ── LLM 구성 ──
 * Primary : Hermes Agent API (GPT-5.4)
 *   로컬: localhost:8642 직접 호출
 *   Vercel: CF Worker → Quick Tunnel → Hermes API (동일 경로)
 * Fallback: Gemini Flash — Hermes 불능 시
 */

import { NextRequest } from "next/server"
import { debugLogger } from "@/lib/debug-logger"
import { verifyAllCitations, type Citation, type VerifiedCitation } from "@/lib/citation-verifier"
import { executeClaudeRAGStream, executeGeminiRAGStream, executeRelayRAGStream, type FCRAGCitation } from "@/lib/fc-rag/engine"
import { requireAiAuth, refundAiQuota } from "@/lib/api-auth"
import { generateTraceId, traceLogger } from "@/lib/trace-logger"
import { validate, ragRequestSchema, createErrorResponse } from "@/lib/api-validation"
import {
  recordTelemetry,
  bucketLength,
  classifyUa,
  sessionAnonHash,
  categorizeError,
  estimateCostUsd,
  type ErrorCategory,
} from "@/lib/ai-telemetry"
import { detectDomain } from "@/lib/fc-rag/tool-tiers"
import { AI_CONFIG } from "@/lib/ai-config"

/**
 * M5: citation 검증 블록 공통화.
 * Hermes/Gemini 양쪽 경로에서 20줄 중복이었던 로직을 한 곳에 모음.
 * - 15초 timeout
 * - 실패 시 모든 citation을 verified:false + 'skipped'로 처리
 * - 결과를 `citation_verification` 이벤트로 flush
 */
export async function streamCitationVerification(
  citations: FCRAGCitation[],
  sendAndLog: (event: unknown) => void,
): Promise<void> {
  if (citations.length === 0) return
  try {
    const { verifiable, skipped } = convertForVerification(citations)
    if (verifiable.length === 0) return
    sendAndLog({ type: "status", message: "인용 법조문 검증 중...", progress: 95 })
    const verified: VerifiedCitation[] = await Promise.race<VerifiedCitation[]>([
      verifyAllCitations(verifiable),
      new Promise<VerifiedCitation[]>((_, reject) =>
        setTimeout(() => reject(new Error('citation verification timeout')), 15_000),
      ),
    ]).catch(() =>
      verifiable.map<VerifiedCitation>((c) => ({
        ...c,
        verified: false,
        verificationMethod: 'skipped',
      })),
    )
    sendAndLog({ type: "citation_verification", citations: [...verified, ...skipped] })
  } catch (error) {
    debugLogger.error("[FC-RAG] Citation verification failed:", error)
  }
}

function convertForVerification(fcCitations: FCRAGCitation[]): {
  verifiable: Citation[]
  skipped: VerifiedCitation[]
} {
  const verifiable: Citation[] = []
  const skipped: VerifiedCitation[] = []

  for (const citation of fcCitations) {
    if (/^제?\d+조(?:의\d+)?(?:의\d+)?/.test(citation.articleNumber)) {
      verifiable.push({
        lawName: citation.lawName,
        articleNum: citation.articleNumber,
        text: citation.chunkText,
        source: citation.source,
      })
      continue
    }

    skipped.push({
      lawName: citation.lawName,
      articleNum: citation.articleNumber,
      text: citation.chunkText,
      source: citation.source,
      verified: false,
      verificationMethod: "skipped",
    })
  }

  return { verifiable, skipped }
}

/**
 * Gemini/Hermes 과부하 · 레이트리밋 에러를 사용자 친화 메시지로 변환.
 * 503/429/UNAVAILABLE/RESOURCE_EXHAUSTED/overloaded/"high demand" 패턴 감지.
 * 비매칭이면 null → 호출부에서 generic 메시지 사용.
 */
export function classifyEngineError(raw: string | undefined | null): string | null {
  if (!raw) return null
  const msg = String(raw)
  if (/\b(503|429)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overload(ed)?|rate.?limit|high demand|currently experiencing/i.test(msg)) {
    return 'AI 모델이 현재 과부하 상태입니다 (Google 측 일시적 용량 부족). 잠시 후 다시 시도해 주세요.'
  }
  if (/timeout|ETIMEDOUT|deadline/i.test(msg)) {
    return 'AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.'
  }
  return null
}

// AbortSignal.any 폴백 — Node 20.3 미만 / 일부 엣지 런타임 대비
export function combineSignals(signals: AbortSignal[]): AbortSignal {
  if (typeof (AbortSignal as unknown as { any?: unknown }).any === 'function') {
    return (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any(signals)
  }
  const controller = new AbortController()
  const onAbort = (reason: unknown) => {
    if (!controller.signal.aborted) controller.abort(reason)
  }
  for (const s of signals) {
    if (s.aborted) {
      onAbort(s.reason)
      break
    }
    s.addEventListener('abort', () => onAbort(s.reason), { once: true })
  }
  return controller.signal
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return createErrorResponse("Invalid JSON body", 400)
  }

  const validation = validate(ragRequestSchema, body)
  if (!validation.success) {
    return createErrorResponse(validation.error, 400)
  }

  const { query, conversationId, preEvidence } = validation.data

  // Supabase 사용자 인증 + 기능별 쿼터 (BYOK 시 스킵)
  // 주의: 이 시점에 이미 쿼터 1건이 사전 차감됨. 엔진이 응답을 주지 못하면
  //       finally 블록에서 refundAiQuota로 보상한다.
  const auth = await requireAiAuth(request, 'fc_rag')
  if ('error' in auth) return auth.error
  const authCtx = auth.ctx
  const authedUserId = authCtx.userId

  const traceId = generateTraceId()
  traceLogger.startTrace(traceId)

  const encoder = new TextEncoder()
  const abortController = new AbortController()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          // controller already closed (client disconnected)
        }
      }

      // ── 텔레메트리 수집기 (본문 없음, 집계 신호만) ──
      const logStartMs = Date.now()
      // 단계별 latency 계측 — SSE 이벤트 타임스탬프로 router/retrieval/generation 근사.
      // (엔진 무수정: 이벤트 루프에서 첫 도구호출·마지막 도구결과·첫 답변 시각만 기록)
      let tFirstTool: number | null = null
      let tLastToolResult: number | null = null
      let tFirstAnswer: number | null = null
      const logTools: string[] = []
      const logToolErrors: string[] = []
      let logAnswerLen = 0
      let logCitationCount = 0
      let logVerifiedCount = 0
      let logComplexity = ''
      let logQueryType = ''
      let logConfidenceLevel = ''
      let logConfidenceScore: number | null = null
      let logQualityScore: number | null = null
      let logHasGrounds: boolean | null = null
      let logIsTruncated: boolean | null = null
      let logFastPathUsed: boolean | null = null
      let logErrorCategory: ErrorCategory | null = null
      let logErrorTool: string | null = null
      let logInputTokens: number | null = null
      let logOutputTokens: number | null = null
      let logCachedTokens: number | null = null
      const logVerificationMethods: Record<string, number> = {}
      const logCitedLawIds = new Set<string>()

      // 법적 안전 면책 — 모든 answer 이벤트에 자동 주입 (변호사법/소비자 보호).
      // 주의: 엔진 내부의 cacheAnswer/storeConversation 는 원본 객체를 받으므로
      //       원본을 mutate 하지 않고 전송 단계에서 복제본에만 주입한다.
      const LEGAL_DISCLAIMER = '본 답변은 법령 정보 제공 목적이며, 법률 자문이 아닙니다. 중요한 법적 결정 전에는 반드시 변호사·법무사 등 전문가 상담이 필요합니다.'

      const sendAndLog = (data: unknown) => {
        const evt = data as Record<string, unknown>
        if (evt.type === 'tool_call' && evt.name) {
          logTools.push(evt.name as string)
        }
        if (evt.type === 'tool_result') {
          const e = evt as { name?: string; success?: boolean }
          if (e.success === false && e.name) logToolErrors.push(e.name)
        }
        if (evt.type === 'token_usage') {
          const e = evt as { inputTokens?: number; outputTokens?: number; cachedTokens?: number }
          if (typeof e.inputTokens === 'number') logInputTokens = e.inputTokens
          if (typeof e.outputTokens === 'number') logOutputTokens = e.outputTokens
          if (typeof e.cachedTokens === 'number') logCachedTokens = e.cachedTokens
        }
        if (evt.type === 'answer') {
          const d = evt.data as Record<string, unknown> | undefined
          const answerText = String(d?.answer || '')
          logAnswerLen = answerText.length
          logCitationCount = (d?.citations as unknown[] || []).length
          logComplexity = String(d?.complexity || '')
          logQueryType = String(d?.queryType || '')
          logConfidenceLevel = String(d?.confidenceLevel || '')
          logIsTruncated = Boolean(d?.isTruncated)
          const cb = d?.confidenceBreakdown as Record<string, unknown> | undefined
          if (cb) {
            if (typeof cb.score === 'number') logConfidenceScore = cb.score as number
            if (typeof cb.qualityScore === 'number') logQualityScore = cb.qualityScore as number
            if (typeof cb.hasGroundsSection === 'boolean') logHasGrounds = cb.hasGroundsSection as boolean
          }
          // citation 에서 answer-fallback 이 아닌 것 = 정상 tool 응답 → fast_path 힌트
          const cits = (d?.citations as Array<{ source?: string }> | undefined) || []
          if (cits.length > 0) {
            logFastPathUsed = cits.every((c) => c?.source && c.source !== 'answer-fallback')
          }
          // 면책 주입 (중복 방지) — 원본 보존, 전송용 복제본만 변형
          if (d) {
            const existing = (d.warnings as string[] | undefined) || []
            if (!existing.some((w) => typeof w === 'string' && w.includes('법률 자문'))) {
              send({ ...evt, data: { ...d, warnings: [LEGAL_DISCLAIMER, ...existing] } })
              return
            }
          }
        }
        if (evt.type === 'citation_verification') {
          const cits = (evt.citations as Array<{
            verified?: boolean
            verificationMethod?: string
            lawId?: string
          }> | undefined) || []
          logVerifiedCount = cits.filter((c) => c?.verified).length
          for (const c of cits) {
            if (c.verificationMethod) {
              logVerificationMethods[c.verificationMethod] =
                (logVerificationMethods[c.verificationMethod] || 0) + 1
            }
            if (c.lawId) logCitedLawIds.add(c.lawId)
          }
        }
        if (evt.type === 'error') {
          logErrorCategory = categorizeError(evt.message)
        }
        send(data)
      }

      // request.signal + cancel() 양쪽 모두 반응하는 합성 signal (E1: 폴백 적용)
      const combinedSignal = combineSignals([request.signal, abortController.signal])
      // 엔진이 실제 답변을 1회라도 전달했는지 — finally에서 쿼터 refund 판단에 사용.
      // Hermes+Gemini 모두 실패 시 fallback 더미 답변은 '실답변 아님'으로 간주 → refund 대상.
      let answerDelivered = false
      // 엔진 경로 추적 (telemetry용). try 블록 밖에서도 접근 가능하도록 여기서 선언.
      let finalSource: 'hermes' | 'gemini' | 'relay' = 'gemini'
      let fallbackTriggered = false

      // 스트림 시작 직후 쿼터 상태를 1회 emit (BYOK는 null).
      // 이로써 UI는 Supabase 기반 단일 진실 소스만 바라보면 된다.
      if (authCtx.quota) {
        sendAndLog({
          type: 'quota_status',
          feature: 'fc_rag',
          current: authCtx.quota.current,
          limit: authCtx.quota.limit,
          resetAt: authCtx.quota.reset_at,
          byok: false,
        })
      } else if (authCtx.isByok) {
        sendAndLog({ type: 'quota_status', feature: 'fc_rag', byok: true })
      }

      try {
        let handled = false
        let source: 'hermes' | 'gemini' | 'relay' = 'gemini'
        // note: finalSource/fallbackTriggered 는 바깥 스코프에서 최종값 추적

        // ── Hermes Primary ──
        // 사용자 자체 API 키 사용 시엔 Gemini로 직행 (Hermes 비용 도용 차단)
        // 🔴 HERMES 임시 비활성화 — 60s 타임아웃 이슈 해결 전까지 Gemini only
        //    살릴 때: DISABLE_HERMES 환경변수 제거 또는 'false' 로 설정 (2026-04-13)
        const HERMES_DISABLED = process.env.DISABLE_HERMES !== 'false'
        if (!HERMES_DISABLED && !authCtx.isByok) {
          try {
          traceLogger.addEvent(traceId, 'hermes_start', {})
          sendAndLog({ type: "status", message: "AI 엔진 연결 중...", progress: 3 })

          let lastAnswerCitations: FCRAGCitation[] = []

          const isTransient = (msg: string) => /타임아웃|timeout|ECONNRESET|EPIPE|ETIMEDOUT/i.test(msg)
          let cliSuccess = false

          // H-RAG2: 하이브리드 buffering.
          //  - attempt 0: 즉시 스트리밍 (사용자 체감 레이턴시 우선)
          //  - attempt 1+: buffer 후 성공 확정시에만 일괄 flush
          //  → 실패한 시도의 partial answer_token이 클라이언트에 남지 않음.
          type StreamEvent = Parameters<typeof send>[0]
          for (let attempt = 0; attempt < 2 && !cliSuccess; attempt++) {
            const isRetry = attempt > 0
            const retryBuffer: StreamEvent[] = []
            const emit = (event: StreamEvent) => {
              if (isRetry) retryBuffer.push(event)
              else sendAndLog(event)
            }

            if (isRetry) {
              // 이전 시도에서 send된 partial 데이터를 클라에서 초기화시킴
              sendAndLog({ type: "stream_reset", reason: "retry" })
              sendAndLog({ type: "status", message: "Hermes 타임아웃 — 재시도 중...", progress: 3 })
              traceLogger.addEvent(traceId, 'hermes_retry', { attempt })
            }

            let claudeHadError = false
            let errorMessage = ''

            for await (const event of executeClaudeRAGStream(query, {
              signal: combinedSignal,
              conversationId,
              preEvidence,
            })) {
              if (event.type === "error") {
                claudeHadError = true
                errorMessage = event.message
                traceLogger.addEvent(traceId, 'hermes_internal_error', { message: event.message })
                continue
              }
              if (claudeHadError && event.type === "answer") continue

              if (event.type === "answer") {
                lastAnswerCitations = event.data.citations || []
                answerDelivered = true
              }

              emit(event)
            }

            if (!claudeHadError) {
              // retry 성공 시 버퍼링된 이벤트 일괄 flush
              if (isRetry) {
                for (const bufferedEvent of retryBuffer) sendAndLog(bufferedEvent)
              }
              cliSuccess = true
            } else if (attempt === 0 && isTransient(errorMessage)) {
              continue // 1회 재시도
            } else {
              throw new Error('Hermes internal error, falling back to Gemini')
            }
          }

          if (!cliSuccess) throw new Error('Hermes API failed after retries')

          // M5: Citation 검증 (양쪽 경로 공통 헬퍼)
          await streamCitationVerification(lastAnswerCitations, sendAndLog)

          handled = true
          source = 'hermes'
          traceLogger.completeTrace(traceId, 'hermes')
          } catch (hermesError) {
            fallbackTriggered = true
            traceLogger.addEvent(traceId, 'hermes_failed', {
              message: hermesError instanceof Error ? hermesError.message : 'unknown',
              fallback: 'gemini',
            })
          }
        }

        // ── Relay Primary (맥미니 구독 Claude + korean-law MCP) ──
        // RELAY_URL 설정 시 우선 사용, 실패/타임아웃 시 아래 Gemini로 폴백.
        // BYOK 사용자는 자기 키로 Gemini 직행(구독 릴레이 비용 도용 차단).
        const RELAY_URL = process.env.RELAY_URL
        if (!handled && RELAY_URL && !authCtx.isByok) {
          try {
            traceLogger.addEvent(traceId, 'relay_start', {})
            sendAndLog({ type: "status", message: "법령 엔진 연결 중...", progress: 3 })

            let lastAnswerCitations: FCRAGCitation[] = []
            for await (const event of executeRelayRAGStream(query, {
              signal: combinedSignal,
              conversationId,
            })) {
              if (event.type === "error") throw new Error(event.message)
              if (event.type === "answer") {
                if (tFirstAnswer === null) tFirstAnswer = Date.now()
                answerDelivered = true
                lastAnswerCitations = event.data.citations || []
              }
              if (event.type === "tool_call" && tFirstTool === null) tFirstTool = Date.now()
              sendAndLog(event)
            }

            await streamCitationVerification(lastAnswerCitations, sendAndLog)
            handled = true
            source = 'relay'
            traceLogger.completeTrace(traceId, 'relay')
          } catch (relayError) {
            fallbackTriggered = true
            traceLogger.addEvent(traceId, 'relay_failed', {
              message: relayError instanceof Error ? relayError.message : 'unknown',
              fallback: 'gemini',
            })
          }
        }

        // ── Gemini Fallback ──
        if (!handled) {
          // F1: Hermes 도중에 흘려보낸 답변/툴 로그가 있다면 클라에서 비우게 함
          sendAndLog({ type: "stream_reset", reason: "fallback" })
          sendAndLog({ type: "status", message: "법령 검색 중...", progress: 3 })
          traceLogger.addEvent(traceId, 'gemini_start', {})

          let lastAnswerCitations: FCRAGCitation[] = []
          let geminiAnswerSent = false
          let lastEngineErrorMsg: string | null = null

          for await (const event of executeGeminiRAGStream(query, {
            apiKey: authCtx.byokKey ?? undefined,
            signal: combinedSignal,
            conversationId,
            preEvidence,
          })) {
            if (event.type === "error") {
              lastEngineErrorMsg = (event as { message?: string }).message || null
            }
            if (event.type === "answer") {
              if (tFirstAnswer === null) tFirstAnswer = Date.now()
              geminiAnswerSent = true
              answerDelivered = true
              lastAnswerCitations = event.data.citations || []
            }
            // 진단: tool_call(args) / tool_result(summary) 를 trace 파일에 기록해
            //       환각 원인 분석을 가능하게 한다 (P1: 여권법 시행령 제40조 환각 사건).
            if (event.type === 'tool_call') {
              if (tFirstTool === null) tFirstTool = Date.now()
              traceLogger.addEvent(traceId, 'tool_call', {
                name: (event as { name?: string }).name,
                args: (event as { args?: unknown }).args,
              })
            } else if (event.type === 'tool_result') {
              tLastToolResult = Date.now()
              const e = event as { name?: string; success?: boolean; summary?: string }
              traceLogger.addEvent(traceId, 'tool_result', {
                name: e.name,
                success: e.success,
                summary: e.summary,
              })
            }
            sendAndLog(event)
          }

          // 안전장치: Hermes+Gemini 모두 answer를 보내지 못한 경우
          if (!geminiAnswerSent) {
            const friendly = classifyEngineError(lastEngineErrorMsg)
            const isOverload = friendly?.includes('과부하')
            sendAndLog({
              type: "answer",
              data: {
                answer: friendly
                  ? `⚠️ **${isOverload ? 'AI 모델 과부하' : '일시적 오류'}**\n\n${friendly}\n\n> 이 오류는 서비스 자체 문제가 아니라 Google Gemini API 측 일시적 이슈입니다. 보통 1~2분 내 복구됩니다.`
                  : "죄송합니다. AI 엔진에 일시적 문제가 발생하여 답변을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
                citations: [],
                confidenceLevel: "low",
                complexity: "simple",
                queryType: "application",
                warnings: [friendly ?? "Hermes 및 Gemini 엔진 모두 응답 실패"],
              },
            })
          }

          // M5: Citation 검증 (헬퍼 재사용)
          await streamCitationVerification(lastAnswerCitations, sendAndLog)

          source = 'gemini'
          traceLogger.completeTrace(traceId, 'gemini')
        }

        sendAndLog({ type: 'source', source })
        finalSource = source
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'unknown'
        logErrorCategory = categorizeError(error)
        console.error('[fc-rag route] engine error:', errMsg)
        traceLogger.addEvent(traceId, 'error', {
          message: errMsg,
          stack: error instanceof Error ? error.stack : undefined,
        })
        const friendly = classifyEngineError(errMsg)
        sendAndLog({
          type: "error",
          message: friendly ?? "AI 검색 처리 중 오류가 발생했습니다. 다시 시도해 주세요.",
          retryable: Boolean(friendly),
        })
      } finally {
        // ── 텔레메트리 기록 (본문 없음, BYOK/로그인 구분 없이 전체 기록) ──
        // throw 여부와 무관하게 finally에서 단 1회만 호출.
        // Serverless에서 fire-and-forget은 응답 flush 후 잘린다 → await 필수.
        try {
          const modelIdActual = finalSource === 'hermes' ? 'gpt-5.4' : AI_CONFIG.gemini.primary
          const cost = estimateCostUsd(modelIdActual, logInputTokens, logOutputTokens)
          const ua = request.headers.get('user-agent')
          await recordTelemetry({
            endpoint: 'fc-rag',
            isByok: authCtx.isByok,
            sessionAnon: sessionAnonHash(authedUserId, authCtx.byokKey),
            uaClass: classifyUa(ua),
            lang: /[a-zA-Z]/.test(query) && !/[가-힣]/.test(query) ? 'en' : 'ko',
            complexity: logComplexity || null,
            queryType: logQueryType || null,
            domain: (() => { try { return detectDomain(query) } catch { return null } })(),
            queryLengthBucket: bucketLength(query.length),
            answerLengthBucket: bucketLength(logAnswerLen),
            latencyTotalMs: Date.now() - logStartMs,
            latencyRouterMs: tFirstTool !== null ? tFirstTool - logStartMs : null,
            latencyRetrievalMs: tFirstTool !== null && tLastToolResult !== null ? tLastToolResult - tFirstTool : null,
            latencyGenerationMs: tLastToolResult !== null && tFirstAnswer !== null ? tFirstAnswer - tLastToolResult : null,
            toolCallsCount: logTools.length,
            toolNames: logTools.length > 0 ? logTools : null,
            toolErrors: logToolErrors.length > 0 ? logToolErrors : null,
            fallbackTriggered,
            fastPathUsed: logFastPathUsed,
            confidenceLevel: logConfidenceLevel || null,
            confidenceScore: logConfidenceScore,
            qualityScore: logQualityScore,
            hasGroundsSection: logHasGrounds,
            isTruncated: logIsTruncated,
            citationCount: logCitationCount,
            verifiedCount: logVerifiedCount,
            verificationMethods: Object.keys(logVerificationMethods).length > 0 ? logVerificationMethods : null,
            citedLawIds: logCitedLawIds.size > 0 ? Array.from(logCitedLawIds) : null,
            errorCategory: logErrorCategory,
            errorTool: logErrorTool,
            modelIdActual,
            inputTokens: logInputTokens,
            outputTokens: logOutputTokens,
            cachedTokens: logCachedTokens,
            costEstimateUsd: cost,
          })
        } catch { /* telemetry failure must not affect user */ }

        // 사전 차감된 쿼터 보상: 실답변을 한 번도 전달하지 못했을 때만.
        // - 정상 응답: answerDelivered=true → no-op
        // - Hermes/Gemini 모두 실패(안전장치 더미 답변): answerDelivered=false → refund
        // - 스트림 도중 throw: answerDelivered 상태 그대로 판단
        // BYOK 경로는 refundAiQuota 내부에서 no-op.
        if (!answerDelivered) {
          // 1회 재시도 (Supabase 일시 오류 대응). 계속 실패하면 traceLogger에만 남기고
          // 응답 흐름엔 영향 주지 않음 — 사용자가 답변 못 받았는데 쿼터도 못 돌려준
          // 케이스는 운영 모니터링으로 추적 가능해야 한다.
          let refunded = false
          for (let i = 0; i < 2 && !refunded; i++) {
            try {
              await refundAiQuota(authCtx)
              refunded = true
            } catch (refundErr) {
              if (i === 1) {
                traceLogger.addEvent(traceId, 'quota_refund_failed', {
                  message: refundErr instanceof Error ? refundErr.message : 'unknown',
                  userId: authedUserId,
                })
              } else {
                await new Promise((r) => setTimeout(r, 150))
              }
            }
          }
        }
        controller.close()
      }
    },
    cancel() {
      abortController.abort()
    },
  })

  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  }

  return new Response(stream, { headers })
}
