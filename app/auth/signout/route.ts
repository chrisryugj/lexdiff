import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()

  const response = NextResponse.redirect(new URL('/', request.url), { status: 303 })

  // Supabase SSR 쿠키를 응답에서 명시적으로 제거 (proxy.ts 리프레시 충돌 방지)
  // 쿠키명 예: sb-<ref>-auth-token, sb-<ref>-auth-token.0, sb-<ref>-auth-token.1
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith('sb-')) {
      response.cookies.set(cookie.name, '', { maxAge: 0, path: '/' })
    }
  }

  return response
}
