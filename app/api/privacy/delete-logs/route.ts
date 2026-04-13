import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { anonHash } from '@/lib/privacy/anon-hash'

/**
 * POST /api/privacy/delete-logs — 본인의 AI 질의 로그 전체 삭제.
 * 개인정보보호법 제36조(개인정보의 정정·삭제) 이행.
 */
export async function POST() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const svc = createSupabaseServiceClient()
  const hash = anonHash(user.id)
  const { data, error } = await svc.rpc('delete_my_ai_logs', { p_anon_hash: hash })
  if (error) {
    return NextResponse.json({ error: 'db_error', message: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, deleted: data })
}
