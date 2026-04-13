import { createHmac } from 'node:crypto'

/**
 * user_id → 익명 해시.
 *
 * HMAC-SHA256(user_id, SUPABASE_LOG_SALT).
 * salt를 환경변수로 분리해 DB 덤프만으로 역추적 불가.
 * salt 미설정 시 빈 문자열 — 프로덕션에선 반드시 설정할 것 (경고 출력).
 */
export function anonHash(userId: string): string {
  const salt = process.env.SUPABASE_LOG_SALT
  if (!salt) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[privacy] SUPABASE_LOG_SALT is not set — logs will be weakly anonymized')
    }
  }
  return createHmac('sha256', salt || 'dev-salt').update(userId).digest('hex')
}
