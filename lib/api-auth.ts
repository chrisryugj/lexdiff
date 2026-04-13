import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { checkAndIncrementQuota, type QuotaFeature, type QuotaResult } from '@/lib/quota'

export interface AiAuthContext {
  userId: string | null
  byokKey: string | null
  isByok: boolean
  quota?: QuotaResult
}

/**
 * AI 엔드포인트 진입 게이트.
 *
 * 1. BYOK 키(헤더 `x-user-api-key`)가 있으면 → 쿼터 스킵, 그 키 사용
 * 2. 아니면 Supabase 세션에서 user 추출 → 쿼터 체크/증가
 * 3. 미로그인 + BYOK 없음 → 401
 * 4. 쿼터 초과 → 429
 *
 * 통과 시 컨텍스트 반환, 실패 시 NextResponse 반환.
 */
export async function requireAiAuth(
  request: NextRequest,
  feature: QuotaFeature
): Promise<{ ctx: AiAuthContext } | { error: NextResponse }> {
  const byokKey = request.headers.get('x-user-api-key')?.trim() || null

  if (byokKey) {
    return { ctx: { userId: null, byokKey, isByok: true } }
  }

  const supabase = await createSupabaseServerClient()
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

  return { ctx: { userId: user.id, byokKey: null, isByok: false, quota } }
}

/**
 * BYOK 키가 있으면 그것을, 없으면 환경변수 키를 반환.
 */
export function resolveGeminiKey(ctx: AiAuthContext): string | null {
  if (ctx.byokKey) return ctx.byokKey
  return process.env.GEMINI_API_KEY || null
}
