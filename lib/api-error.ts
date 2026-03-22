import { NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"

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
  const internalMessage = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined

  debugLogger.error(context || userMessage, { message: internalMessage, stack })

  return NextResponse.json({ error: userMessage }, { status })
}
