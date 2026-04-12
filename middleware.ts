/**
 * H-SEC3: CORS origin 화이트리스트 echo
 *
 * next.config.mjs의 정적 Access-Control-Allow-Origin 헤더는 단일 origin만 허용해
 * 프리뷰 배포 / 커스텀 도메인을 동적으로 다루지 못함. 이를 대체해 middleware에서
 * 요청 Origin을 화이트리스트와 매칭 후 반사(echo)한다.
 *
 * 매칭 실패 → CORS 헤더를 설정하지 않음 (브라우저가 요청 차단).
 * Preflight OPTIONS → 204 응답 + 헤더만 반환.
 */

import { NextResponse, type NextRequest } from 'next/server'

// 정적 허용 목록 + 정규식(프리뷰) 결합.
const ALLOWED_ORIGINS: Array<string | RegExp> = [
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

export function middleware(request: NextRequest): NextResponse {
  // /api/* 경로에 한정해 CORS 처리
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next()
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
  return res
}

export const config = {
  matcher: ['/api/:path*'],
}
