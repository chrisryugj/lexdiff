/**
 * Supabase AI 질의 로그 기록기.
 *
 * 원칙:
 *  1. opt-in 사용자만 — consent.ai_logging_opt_in=true
 *  2. user_id 직접 저장 X — anon_user_hash(HMAC)만
 *  3. query는 PII 스크러빙 후 저장
 *  4. fire-and-forget — 응답 지연 금지
 *  5. 실패해도 서비스엔 영향 없음
 */

import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { scrubPII } from '@/lib/privacy/scrubber'
import { anonHash } from '@/lib/privacy/anon-hash'

export interface AIQueryLogInput {
  userId: string | null
  query: string
  answer: string
  source: 'hermes' | 'gemini'
  model: string
  queryType?: string
  domain?: string
  toolCalls?: unknown
  latencyMs: number
  citationCount: number
  verifiedCount: number
}

export async function logAIQueryIfConsented(input: AIQueryLogInput): Promise<void> {
  // 미로그인(BYOK) 사용자는 로그 기록하지 않음 — 동의 주체가 없음
  if (!input.userId) return

  try {
    const svc = createSupabaseServiceClient()

    const { data: consent } = await svc
      .from('user_consents')
      .select('ai_logging_opt_in')
      .eq('user_id', input.userId)
      .maybeSingle()

    if (!consent?.ai_logging_opt_in) return

    const { scrubbed } = scrubPII(input.query)
    const { scrubbed: scrubbedAnswer } = scrubPII(input.answer)

    await svc.from('ai_query_logs').insert({
      anon_user_hash: anonHash(input.userId),
      query_scrubbed: scrubbed,
      query_type: input.queryType || null,
      domain: input.domain || null,
      source: input.source,
      model: input.model,
      tool_calls: input.toolCalls ?? null,
      answer: scrubbedAnswer,
      latency_ms: input.latencyMs,
      citation_count: input.citationCount,
      verified_count: input.verifiedCount,
      feedback: null,
    })
  } catch (err) {
    console.warn('[ai-query-logger] logging failed:', err)
  }
}
