import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { checkAndIncrementQuota, decrementQuota, type QuotaFeature, type QuotaResult } from '@/lib/quota'

export interface AiAuthContext {
  userId: string | null
  byokKey: string | null
  isByok: boolean
  /** Supabase 사용자일 때만 존재. BYOK 경로는 null. */
  quota: QuotaResult | null
  feature: QuotaFeature
}

/**
 * BYOK 키(Gemini) 포맷 — 다른 문자열이 오면 우회 악용 차단 차원에서 거부.
 * 참고: 실제 키 유효성은 Gemini 호출 단계에서 검증된다 (여기선 shape만).
 */
const GEMINI_KEY_RE = /^AIzaSy[A-Za-z0-9_-]{33}$/

function readByokHeader(request: NextRequest): string | null {
  // HTTP 헤더는 case-insensitive이지만 명시적으로 한 번만 읽어 단일 진실 소스 유지.
  const raw = request.headers.get('x-user-api-key')
  if (!raw) return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * AI 엔드포인트 진입 게이트.
 *
 * 1. BYOK 헤더(`x-user-api-key`)가 있으면 → 포맷 검증 → 쿼터 스킵, 그 키 사용
 *    (Gemini 형식이 아니면 400으로 거부. 빈 문자열/임의 토큰으로 쿼터 우회 차단.)
 * 2. 아니면 Supabase 세션에서 user 추출 → 기능별 쿼터 원자 증가
 * 3. 미로그인 + BYOK 없음 → 401
 * 4. 쿼터 초과 → 429
 *
 * 반환 컨텍스트에는 userId | byokKey | quota가 명시적으로 들어간다.
 * 개인정보: BYOK 키는 이 함수 밖으로 나가면 ctx.byokKey에만 존재하며
 * 어떤 영속 저장소에도 기록되지 않는다 (query-logger, ai-query-logger, trace-logger 모두 비저장).
 */
export async function requireAiAuth(
  request: NextRequest,
  feature: QuotaFeature
): Promise<{ ctx: AiAuthContext } | { error: NextResponse }> {
  const byokKey = readByokHeader(request)

  if (byokKey) {
    if (!GEMINI_KEY_RE.test(byokKey)) {
      return {
        error: NextResponse.json(
          { error: 'invalid_api_key', message: '본인 API 키 형식이 올바르지 않습니다.' },
          { status: 400 }
        ),
      }
    }
    return { ctx: { userId: null, byokKey, isByok: true, quota: null, feature } }
  }

  // Supabase 미설정 (로컬 dev 등) → 401로 graceful downgrade.
  // env 없을 때 createServerClient 가 throw 해서 500 으로 새는 것 방지.
  let supabase
  try {
    supabase = await createSupabaseServerClient()
  } catch {
    return {
      error: NextResponse.json(
        { error: 'unauthorized', message: '로그인이 필요합니다. (또는 본인 API 키 등록)' },
        { status: 401 }
      ),
    }
  }
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return {
      error: NextResponse.json(
        { error: 'unauthorized', message: '로그인이 필요합니다. (또는 본인 API 키 등록)' },
        { status: 401 }
      ),
    }
  }

  let quota: QuotaResult
  try {
    quota = await checkAndIncrementQuota(user.id, feature)
  } catch (e) {
    return {
      error: NextResponse.json(
        { error: 'quota_error', message: (e as Error).message },
        { status: 500 }
      ),
    }
  }

  if (!quota.allowed) {
    return {
      error: NextResponse.json(
        {
          error: 'quota_exceeded',
          message: `오늘 ${feature} 사용 한도(${quota.limit})를 초과했습니다. 본인 API 키를 등록하면 무제한입니다.`,
          quota,
        },
        { status: 429 }
      ),
    }
  }

  return { ctx: { userId: user.id, byokKey: null, isByok: false, quota, feature } }
}

/**
 * BYOK 키가 있으면 그것을, 없으면 환경변수 키를 반환.
 */
export function resolveGeminiKey(ctx: AiAuthContext): string | null {
  if (ctx.byokKey) return ctx.byokKey
  return process.env.GEMINI_API_KEY || null
}

/**
 * 요청이 완전히 실패했을 때 사전차감된 쿼터를 되돌린다.
 * - BYOK 경로는 차감이 없으므로 no-op.
 * - Supabase 호출 실패는 조용히 삼킨다 (보상 실패가 원 에러를 가리지 않도록).
 */
export async function refundAiQuota(ctx: AiAuthContext): Promise<void> {
  if (!ctx.userId || ctx.isByok) return
  try {
    await decrementQuota(ctx.userId, ctx.feature)
  } catch {
    /* 보상 실패는 무시 */
  }
}
