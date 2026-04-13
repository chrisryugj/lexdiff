import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { QUOTA_LIMITS, type QuotaFeature } from '@/lib/quota'

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }

  const svc = createSupabaseServiceClient()
  const { data } = await svc
    .from('user_quota')
    .select('tier, counts, reset_at')
    .eq('user_id', user.id)
    .single()

  const tier: 'free' | 'pro' | 'admin' = (data?.tier as 'free' | 'pro' | 'admin') || 'free'
  const counts = (data?.counts || {}) as Record<QuotaFeature, number>
  const limits = tier === 'admin' ? null : QUOTA_LIMITS[tier === 'pro' ? 'pro' : 'free']

  return NextResponse.json({
    authenticated: true,
    tier,
    counts: {
      fc_rag: counts.fc_rag || 0,
      summarize: counts.summarize || 0,
      benchmark: counts.benchmark || 0,
      impact: counts.impact || 0,
    },
    limits,
    reset_at: data?.reset_at || null,
  })
}
