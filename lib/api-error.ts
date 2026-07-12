import { NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"

/**
 * 에러 문자열에서 크리덴셜 흔적 제거 — BYOK(사용자 API 키)가 외부 SDK 에러 메시지에
 * echo되어 운영 로그로 새는 것 차단 (gemini-engine의 REDACTED 규칙과 동일 철학)
 */
export function sanitizeCredentials(text: string): string {
  return text
    .replace(/key=\S+/gi, 'key=[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/AIzaSy[\w-]+/g, '[REDACTED_GKEY]')
}

/**
 * API 라우트용 안전한 에러 응답 생성
 * error.message를 클라이언트에 노출하지 않고 서버 로그에만 기록
 */
export function safeErrorResponse(
  error: unknown,
  userMessage: string,
  context?: string,
  status = 500,
) {
  const internalMessage = sanitizeCredentials(error instanceof Error ? error.message : String(error))
  const stack = error instanceof Error && error.stack ? sanitizeCredentials(error.stack) : undefined

  debugLogger.error(context || userMessage, { message: internalMessage, stack })

  return NextResponse.json({ error: userMessage }, { status })
}
