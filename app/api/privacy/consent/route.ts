import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { TERMS_VERSION, PRIVACY_VERSION } from '@/lib/privacy/consent-versions'

/**
 * GET  /api/privacy/consent — 현재 동의 상태 + 최신 버전 반환
 * POST /api/privacy/consent — 동의 생성/갱신
 *    body: { agreeTerms: true, agreePrivacy: true, aiLoggingOptIn: boolean }
 */

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ authenticated: false }, { status: 401 })

  const svc = createSupabaseServiceClient()
  const { data } = await svc
    .from('user_consents')
    .select('terms_version, privacy_version, ai_logging_opt_in, agreed_at, updated_at')
    .eq('user_id', user.id)
    .maybeSingle()

  const upToDate =
    !!data &&
    data.terms_version === TERMS_VERSION &&
    data.privacy_version === PRIVACY_VERSION

  return NextResponse.json({
    authenticated: true,
    consent: data || null,
    upToDate,
    latestVersions: { terms: TERMS_VERSION, privacy: PRIVACY_VERSION },
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { agreeTerms?: boolean; agreePrivacy?: boolean; aiLoggingOptIn?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  if (!body.agreeTerms || !body.agreePrivacy) {
    return NextResponse.json(
      { error: 'required_consent_missing', message: '필수 약관에 동의해야 합니다.' },
      { status: 400 }
    )
  }

  const svc = createSupabaseServiceClient()
  const { error } = await svc.from('user_consents').upsert(
    {
      user_id: user.id,
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
      ai_logging_opt_in: !!body.aiLoggingOptIn,
      agreed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )

  if (error) {
    return NextResponse.json({ error: 'db_error', message: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
