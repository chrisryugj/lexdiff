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

const VALID_TYPES = new Set(["good", "bad", "improve"])
const MAX_BODY_LEN = 8000

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const feedbackType = String(body?.feedbackType || "")

    if (!VALID_TYPES.has(feedbackType)) {
      return NextResponse.json({ error: "invalid feedbackType" }, { status: 400 })
    }

    // 부정(bad/improve)만 본문 보관. good 은 메타만.
    const keepBody = feedbackType === "bad" || feedbackType === "improve"
    const clip = (v: unknown): string | null =>
      keepBody && typeof v === "string" && v.trim() ? v.slice(0, MAX_BODY_LEN) : null

    const ua = request.headers.get("user-agent")
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null

    const svc = createSupabaseServiceClient()
    await svc.from("ai_answer_feedback").insert({
      feedback_type: feedbackType,
      engine: typeof body?.engine === "string" ? body.engine.slice(0, 32) : null,
      query_type: typeof body?.queryType === "string" ? body.queryType.slice(0, 32) : null,
      answer_id: typeof body?.answerId === "string" ? body.answerId.slice(0, 64) : null,
      conversation_id: typeof body?.conversationId === "string" ? body.conversationId.slice(0, 64) : null,
      session_anon: sessionAnonHash(null, ip),
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
