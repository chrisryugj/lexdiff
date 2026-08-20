/**
 * AI 답변 피드백 수집 엔드포인트.
 *
 * 상시 자동수집 아님 — 사용자가 답변 하단 피드백 버튼을 누른 경우에만 1건 기록.
 * good        : 메타만 (query/answer null).
 * bad/improve : 질문·답변 본문 포함 (품질 개선용).
 *
 * 저장: ai_answer_feedback (RLS 전면 차단, service_role write only).
 */
import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { sessionAnonHash, classifyUa } from "@/lib/ai-telemetry"
import { debugLogger } from "@/lib/debug-logger"
import { getClientIP } from "@/lib/get-client-ip"
import { scrubPII } from "@/lib/privacy/scrubber"

const VALID_TYPES = new Set(["good", "bad", "improve"])
const MAX_BODY_LEN = 8000

// 무인증 쓰기 엔드포인트 남용 방지: IP 기준 분당 5회 (search-suggest 패턴)
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 5
const rateLimitMap = new Map<string, number[]>()
function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const recent = (rateLimitMap.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX) {
    rateLimitMap.set(ip, recent)
    return false
  }
  recent.push(now)
  rateLimitMap.set(ip, recent)
  if (rateLimitMap.size > 1000) {
    const entries = Array.from(rateLimitMap.entries())
    entries.sort((a, b) => Math.max(...a[1]) - Math.max(...b[1]))
    for (const [k] of entries.slice(0, 500)) rateLimitMap.delete(k)
  }
  return true
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request)
    if (!checkRateLimit(ip || "unknown")) {
      return NextResponse.json({ error: "rate limit exceeded" }, { status: 429 })
    }

    const body = await request.json().catch(() => ({}))
    const feedbackType = String(body?.feedbackType || "")

    if (!VALID_TYPES.has(feedbackType)) {
      return NextResponse.json({ error: "invalid feedbackType" }, { status: 400 })
    }

    // 부정(bad/improve)만 본문 보관. good 은 메타만.
    // 보관하는 경우에도 저장 직전 PII 를 마스킹한다 — 법률 상담 특성상 사용자가
    // 주민등록번호·연락처를 질문 본문에 그대로 적어 넣는 경우가 있다.
    // (개인정보처리방침 제4항 "PII 스크러빙" 고지의 이행 지점)
    const keepBody = feedbackType === "bad" || feedbackType === "improve"
    const clip = (v: unknown): string | null =>
      keepBody && typeof v === "string" && v.trim()
        ? scrubPII(v).scrubbed.slice(0, MAX_BODY_LEN)
        : null

    const ua = request.headers.get("user-agent")

    const svc = createSupabaseServiceClient()
    await svc.from("ai_answer_feedback").insert({
      feedback_type: feedbackType,
      engine: typeof body?.engine === "string" ? body.engine.slice(0, 32) : null,
      query_type: typeof body?.queryType === "string" ? body.queryType.slice(0, 32) : null,
      answer_id: typeof body?.answerId === "string" ? body.answerId.slice(0, 64) : null,
      conversation_id: typeof body?.conversationId === "string" ? body.conversationId.slice(0, 64) : null,
      session_anon: sessionAnonHash(null, ip === "127.0.0.1" || ip === "anonymous" ? null : ip),
      is_byok: Boolean(body?.isByok),
      ua_class: classifyUa(ua),
      query: clip(body?.query),
      answer: clip(body?.answer),
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    debugLogger.error("ai-feedback insert failed", error)
    // 피드백 실패가 사용자 흐름을 막지 않도록 200으로 swallow.
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
