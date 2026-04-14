import { createSupabaseServiceClient } from '@/lib/supabase/server'

export type QuotaFeature = 'fc_rag' | 'summarize' | 'benchmark' | 'impact'

export const QUOTA_LIMITS: Record<'free' | 'pro', Record<QuotaFeature, number>> = {
  free: { fc_rag: 10, summarize: 30, benchmark: 3, impact: 5 },
  pro: { fc_rag: 100, summarize: 300, benchmark: 30, impact: 50 },
}

export interface QuotaResult {
  allowed: boolean
  current: number
  limit: number
  reset_at: string
}

/**
 * 원자적 카운트 증가 + 한도 체크. 차단 시 allowed=false 반환.
 * tier 조회는 RPC 내부에서 처리하지만, limit는 호출자가 free 기준으로 넘긴다.
 * (admin은 RPC가 limit 무시하고 통과시킴)
 */
export async function checkAndIncrementQuota(
  userId: string,
  feature: QuotaFeature
): Promise<QuotaResult> {
  const supabase = createSupabaseServiceClient()
  const limit = QUOTA_LIMITS.free[feature]

  const { data, error } = await supabase.rpc('increment_quota', {
    p_user_id: userId,
    p_feature: feature,
    p_limit: limit,
  })

  if (error || !data) {
    throw new Error(`Quota check failed: ${error?.message || 'no data'}`)
  }
  return data as QuotaResult
}

/**
 * 사전 차감한 쿼터 카운트를 1 되돌린다. 요청이 실패했을 때 보상용.
 * Supabase RPC `decrement_quota` 가 없으면 조용히 실패하도록 caller 가 try/catch 로 감싼다.
 */
export async function decrementQuota(
  userId: string,
  feature: QuotaFeature
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase.rpc('decrement_quota', {
    p_user_id: userId,
    p_feature: feature,
  })
  if (error) {
    throw new Error(`Quota decrement failed: ${error.message}`)
  }
}
