/**
 * AI 텔레메트리 — 본문 없는 관찰성 로거.
 *
 * 원칙:
 *  - 쿼리/답변 원문, user_id, IP, UA 원본, 도구 인자 → 저장 금지.
 *  - 분류기 출력, 단계별 latency, 도구 이름, 품질 지표, 법령 ID → 저장 허용.
 *  - fire-and-forget. 실패해도 서비스 영향 0.
 *  - BYOK/로그인 구분 없이 전체 기록 (본문이 없으므로 동의 불필요).
 */

import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { createHash, createHmac } from 'crypto'

export type TelemetryEndpoint =
  | 'fc-rag'
  | 'summarize'
  | 'impact-tracker'
  | 'benchmark-analyze'
  | 'impact-analysis'

export type ErrorCategory =
  | 'timeout'
  | 'model_503'
  | 'model_429'
  | 'tool_fail'
  | 'validation'
  | 'quota'
  | 'auth'
  | 'unknown'

export interface TelemetryInput {
  endpoint: TelemetryEndpoint
  isByok: boolean

  // 요청 맥락
  sessionAnon?: string | null
  isFollowup?: boolean | null
  uaClass?: 'mobile' | 'desktop' | 'tablet' | null
  lang?: 'ko' | 'en' | null

  // 분류기
  complexity?: string | null
  queryType?: string | null
  domain?: string | null
  queryLengthBucket?: string | null
  answerLengthBucket?: string | null

  // 성능
  latencyTotalMs?: number | null
  latencyRouterMs?: number | null
  latencyRetrievalMs?: number | null
  latencyGenerationMs?: number | null
  latencyVerificationMs?: number | null

  // 도구
  toolCallsCount?: number | null
  toolNames?: string[] | null
  toolErrors?: string[] | null
  retryCount?: number | null
  fallbackTriggered?: boolean | null
  fastPathUsed?: boolean | null

  // 품질
  confidenceLevel?: string | null
  confidenceScore?: number | null
  qualityScore?: number | null
  hasGroundsSection?: boolean | null
  isTruncated?: boolean | null
  citationCount?: number | null
  verifiedCount?: number | null
  verificationMethods?: Record<string, number> | null
  citedLawIds?: string[] | null

  // 에러
  errorCategory?: ErrorCategory | null
  errorTool?: string | null

  // 모델
  modelIdActual?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  cachedTokens?: number | null
  costEstimateUsd?: number | null
}

/** 질의 길이를 버킷으로 변환 (원 길이 저장 회피). */
export function bucketLength(len: number | null | undefined): string | null {
  if (len == null) return null
  if (len < 50) return '<50'
  if (len < 200) return '50-200'
  if (len < 500) return '200-500'
  return '500+'
}

/** Gemini 토큰 단가(USD / 1M tokens) — 근사치. 실제 단가 변경 시 갱신. */
const GEMINI_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-3-flash-preview':      { input: 0.15, output: 0.60 },
  'gemini-3.1-flash-lite-preview': { input: 0.075, output: 0.30 },
  'gemini-flash':                { input: 0.15, output: 0.60 },
}

export function estimateCostUsd(
  modelId: string | null | undefined,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
): number | null {
  if (!modelId || inputTokens == null || outputTokens == null) return null
  const p = GEMINI_PRICING[modelId]
  if (!p) return null
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000
}

/**
 * 세션 익명 해시 — 30분 윈도우. 동일 유저라도 윈도우 경계 넘으면 다른 해시.
 * salt: SUPABASE_LOG_SALT (기존 004 마이그레이션과 공유)
 */
export function sessionAnonHash(
  userId: string | null,
  byokKeyOrIp: string | null,
): string | null {
  const salt = process.env.SUPABASE_LOG_SALT
  if (!salt) return null
  const seed = userId || byokKeyOrIp
  if (!seed) return null
  const windowMs = 30 * 60 * 1000
  const bucket = Math.floor(Date.now() / windowMs)
  return createHmac('sha256', salt)
    .update(`${seed}:${bucket}`)
    .digest('hex')
    .slice(0, 32)
}

/** UA 문자열 → 클래스 (원본 저장 금지). */
export function classifyUa(ua: string | null | undefined): 'mobile' | 'desktop' | 'tablet' | null {
  if (!ua) return null
  const s = ua.toLowerCase()
  if (/ipad|tablet/.test(s)) return 'tablet'
  if (/mobile|iphone|android/.test(s)) return 'mobile'
  return 'desktop'
}

/** 에러 객체 → 카테고리. 원본 메시지 노출 금지. */
export function categorizeError(err: unknown): ErrorCategory {
  const msg = err instanceof Error ? err.message : String(err || '')
  const lower = msg.toLowerCase()
  if (/timeout|timed out|abort/.test(lower)) return 'timeout'
  if (/503|unavailable|overload/.test(lower)) return 'model_503'
  if (/429|rate.?limit|quota/.test(lower)) return 'model_429'
  if (/tool|mcp|handler/.test(lower)) return 'tool_fail'
  if (/invalid|validation|schema/.test(lower)) return 'validation'
  if (/auth|unauthorized|forbidden/.test(lower)) return 'auth'
  return 'unknown'
}

/**
 * 텔레메트리 기록. fire-and-forget.
 * 호출부는 await 불필요 (단, unhandled rejection 방지를 위해 .catch 붙일 것).
 */
export async function recordTelemetry(input: TelemetryInput): Promise<void> {
  try {
    const svc = createSupabaseServiceClient()
    await svc.from('ai_telemetry').insert({
      endpoint: input.endpoint,
      is_byok: input.isByok,
      session_anon: input.sessionAnon ?? null,
      is_followup: input.isFollowup ?? null,
      ua_class: input.uaClass ?? null,
      lang: input.lang ?? null,
      complexity: input.complexity ?? null,
      query_type: input.queryType ?? null,
      domain: input.domain ?? null,
      query_length_bucket: input.queryLengthBucket ?? null,
      answer_length_bucket: input.answerLengthBucket ?? null,
      latency_total_ms: input.latencyTotalMs ?? null,
      latency_router_ms: input.latencyRouterMs ?? null,
      latency_retrieval_ms: input.latencyRetrievalMs ?? null,
      latency_generation_ms: input.latencyGenerationMs ?? null,
      latency_verification_ms: input.latencyVerificationMs ?? null,
      tool_calls_count: input.toolCallsCount ?? null,
      tool_names: input.toolNames ?? null,
      tool_errors: input.toolErrors ?? null,
      retry_count: input.retryCount ?? null,
      fallback_triggered: input.fallbackTriggered ?? null,
      fast_path_used: input.fastPathUsed ?? null,
      confidence_level: input.confidenceLevel ?? null,
      confidence_score: input.confidenceScore ?? null,
      quality_score: input.qualityScore ?? null,
      has_grounds_section: input.hasGroundsSection ?? null,
      is_truncated: input.isTruncated ?? null,
      citation_count: input.citationCount ?? null,
      verified_count: input.verifiedCount ?? null,
      verification_methods: input.verificationMethods ?? null,
      cited_law_ids: input.citedLawIds ?? null,
      error_category: input.errorCategory ?? null,
      error_tool: input.errorTool ?? null,
      model_id_actual: input.modelIdActual ?? null,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      cached_tokens: input.cachedTokens ?? null,
      cost_estimate_usd: input.costEstimateUsd ?? null,
    })
  } catch (err) {
    // Do not crash caller.
    console.warn('[ai-telemetry] insert failed:', err instanceof Error ? err.message : err)
  }
}

// Suppress unused import warning while keeping createHash available for future use.
void createHash
