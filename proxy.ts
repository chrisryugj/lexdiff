/**
 * H-SEC3: CORS origin 화이트리스트 echo
 * M2: CSP nonce (플래그 `LEXDIFF_CSP_NONCE=true` 시 활성)
 *
 * ── CORS ──
 * next.config.mjs의 정적 Access-Control-Allow-Origin 헤더는 단일 origin만 허용해
 * 프리뷰 배포 / 커스텀 도메인을 동적으로 다루지 못함. 이를 대체해 middleware에서
 * 요청 Origin을 화이트리스트와 매칭 후 반사(echo)한다.
 *
 * ── CSP nonce ──
 * next.config.mjs의 정적 `script-src 'self' 'unsafe-inline'`은 XSS 방어가 약하다.
 * 요청별 base64 nonce를 생성해 `'nonce-...'` 지시어로 교체한다. 플래그가 off이면
 * 기존 정적 CSP(next.config.mjs) 경로를 그대로 사용 — 회귀 위험 0.
 *
 * Next 15/16 App Router는 middleware가 request header에 `x-nonce`를 세팅하면
 * RSC가 `headers()` API로 읽어 자동으로 inline script에 nonce를 주입한다.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// ─── CSP nonce ───

const CSP_NONCE_FLAG = process.env.LEXDIFF_CSP_NONCE === 'true'

function generateNonce(): string {
  // Edge runtime은 crypto.getRandomValues를 제공. Node.js에도 globalThis.crypto 존재.
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  // base64url (padding 제거) — CSP에 그대로 사용 가능
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * 요청별 CSP 헤더 빌드. next.config.mjs의 정적 CSP와 동일한 도메인 허용 목록 유지하되
 * `'unsafe-inline'`을 nonce로 교체. strict-dynamic을 함께 두어 번들 스크립트가
 * 파생한 script에도 신뢰를 전파한다.
 */
export function buildCspWithNonce(nonce: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const supabaseHost = supabaseUrl.replace(/\/+$/, '')

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://va.vercel-scripts.com https://vercel.live`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' https://www.law.go.kr https://lh3.googleusercontent.com https://*.googleusercontent.com data: blob:",
    `connect-src 'self' https://www.law.go.kr https://generativelanguage.googleapis.com https://vitals.vercel-insights.com https://vercel.live${supabaseHost ? ` ${supabaseHost}` : ''}`,
    "frame-ancestors 'self'",
    "font-src 'self' https://cdn.jsdelivr.net https://hangeul.pstatic.net data:",
    // CSP violation 수집은 별도 endpoint 미구현 — 프로덕션 배포 시 추가 검토
  ].join('; ')
}

// 정적 허용 목록 + 정규식(프리뷰) 결합.
const ALLOWED_ORIGINS: Array<string | RegExp> = [
  'https://lexdiff.gomdori.app',
  'https://lexdiff.vercel.app',
  // Vercel 프리뷰 URL: https://lexdiff-<hash>-<team>.vercel.app
  /^https:\/\/lexdiff-[a-z0-9-]+\.vercel\.app$/,
  // 로컬 개발
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]

// NEXT_PUBLIC_SITE_URL이 설정된 커스텀 프로덕션 도메인도 동적 허용
const extraOrigin = process.env.NEXT_PUBLIC_SITE_URL
if (extraOrigin && /^https?:\/\//.test(extraOrigin)) {
  ALLOWED_ORIGINS.push(extraOrigin.replace(/\/$/, ''))
}

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false
  for (const entry of ALLOWED_ORIGINS) {
    if (typeof entry === 'string') {
      if (entry === origin) return true
    } else if (entry.test(origin)) {
      return true
    }
  }
  return false
}

function buildCorsHeaders(origin: string): Headers {
  const h = new Headers()
  h.set('Access-Control-Allow-Origin', origin)
  h.set('Vary', 'Origin')
  h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  h.set('Access-Control-Allow-Headers', 'Content-Type, X-User-API-Key')
  h.set('Access-Control-Max-Age', '600')
  return h
}

/**
 * CSP nonce 경로 — /api/* 외 모든 페이지 요청에 적용.
 * 플래그 off일 때는 NextResponse.next() 그대로 (next.config.mjs CSP 유지).
 */
function applyCspNonce(request: NextRequest): NextResponse {
  if (!CSP_NONCE_FLAG) return NextResponse.next()

  const nonce = generateNonce()
  const csp = buildCspWithNonce(nonce)

  // RSC가 읽을 수 있도록 request header에 nonce를 주입 (NextResponse.next 옵션)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)

  const res = NextResponse.next({ request: { headers: requestHeaders } })
  // 응답 헤더에 동적 CSP 설정 (next.config.mjs의 정적 CSP를 덮어씀)
  res.headers.set('Content-Security-Policy', csp)
  return res
}

/**
 * Supabase 세션 리프레시 — Supabase 공식 SSR 패턴.
 *
 * setAll에서 request.cookies와 새 NextResponse 양쪽에 토큰을 반영해야
 * 동일 요청 내에서 갱신된 액세스 토큰이 누락되지 않는다. (세션 풀림 방지)
 *
 * 호출자는 반환된 NextResponse를 그대로 반환해야 한다. CORS/CSP 헤더는
 * 그 위에 머지한다.
 */
async function refreshSupabaseSession(
  request: NextRequest,
  baseResponse: NextResponse
): Promise<NextResponse> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return baseResponse

  let response = baseResponse
  try {
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          // 새 응답 객체 생성 — 기존 헤더 복사
          const refreshed = NextResponse.next({ request })
          baseResponse.headers.forEach((v, k) => refreshed.headers.set(k, v))
          baseResponse.cookies.getAll().forEach(c => refreshed.cookies.set(c))
          cookiesToSet.forEach(({ name, value, options }) =>
            refreshed.cookies.set(name, value, options)
          )
          response = refreshed
        },
      },
    })
    // 중요: createServerClient와 getUser() 사이에 다른 코드를 넣으면 안 됨
    await supabase.auth.getUser()
  } catch {
    // 세션 리프레시 실패는 페이지 렌더링을 막지 않는다.
  }
  return response
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname

  // /api/* 는 CORS 처리, 그 외는 CSP nonce 경로
  if (!pathname.startsWith('/api/')) {
    const res = applyCspNonce(request)
    return await refreshSupabaseSession(request, res)
  }

  const origin = request.headers.get('origin')

  // Preflight
  if (request.method === 'OPTIONS') {
    if (origin && isAllowedOrigin(origin)) {
      return new NextResponse(null, { status: 204, headers: buildCorsHeaders(origin) })
    }
    // 허용 안 된 origin의 preflight는 헤더 없이 204 → 브라우저가 차단
    return new NextResponse(null, { status: 204 })
  }

  const res = NextResponse.next()
  if (origin && isAllowedOrigin(origin)) {
    const h = buildCorsHeaders(origin)
    h.forEach((v, k) => res.headers.set(k, v))
  }
  return await refreshSupabaseSession(request, res)
}

// CSP nonce 경로 때문에 matcher 확장: /api/* + 그 외 페이지 요청 (static 자원 제외)
// Next.js 권장 패턴: /_next/static, /_next/image, favicon, 기타 정적 파일 제외
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?)$).*)',
  ],
}
