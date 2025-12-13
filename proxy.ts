import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Rate Limiting Proxy (Next.js 16)
 *
 * - 일반 API: 100 req/min
 * - AI 관련 API (/api/file-search-rag, /api/summarize): 20 req/min
 *
 * Node.js 런타임에서 동작 (메모리 기반 저장소)
 * 실제 프로덕션에서는 Redis/Upstash 등 외부 저장소 권장
 */

// Rate limit 설정
const RATE_LIMITS = {
  default: { requests: 100, windowMs: 60 * 1000 }, // 100 req/min
  ai: { requests: 20, windowMs: 60 * 1000 },       // 20 req/min
}

// AI 관련 엔드포인트
const AI_ENDPOINTS = [
  '/api/file-search-rag',
  '/api/summarize',
  '/api/analyze-intent',
  '/api/intelligent-search',
]

// IP별 요청 카운트 저장소 (Node.js 런타임 메모리)
const requestCounts = new Map<string, { count: number; resetTime: number }>()

// 주기적으로 만료된 엔트리 정리 (메모리 누수 방지)
function cleanupExpiredEntries() {
  const now = Date.now()
  for (const [key, value] of requestCounts.entries()) {
    if (now > value.resetTime) {
      requestCounts.delete(key)
    }
  }
}

/**
 * 클라이언트 IP 추출
 */
function getClientIP(request: NextRequest): string {
  // Vercel/Cloudflare 프록시 헤더 확인
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  const realIP = request.headers.get('x-real-ip')
  if (realIP) {
    return realIP
  }

  // 로컬 개발 환경
  return '127.0.0.1'
}

/**
 * Rate Limit 체크
 */
function checkRateLimit(
  ip: string,
  endpoint: string
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now()
  const isAIEndpoint = AI_ENDPOINTS.some(e => endpoint.startsWith(e))
  const limit = isAIEndpoint ? RATE_LIMITS.ai : RATE_LIMITS.default

  // IP + 엔드포인트 타입별로 키 생성
  const key = `${ip}:${isAIEndpoint ? 'ai' : 'default'}`

  const record = requestCounts.get(key)

  if (!record || now > record.resetTime) {
    // 새 윈도우 시작
    requestCounts.set(key, {
      count: 1,
      resetTime: now + limit.windowMs,
    })
    return {
      allowed: true,
      remaining: limit.requests - 1,
      resetTime: now + limit.windowMs,
    }
  }

  if (record.count >= limit.requests) {
    // 제한 초과
    return {
      allowed: false,
      remaining: 0,
      resetTime: record.resetTime,
    }
  }

  // 요청 카운트 증가
  record.count++
  return {
    allowed: true,
    remaining: limit.requests - record.count,
    resetTime: record.resetTime,
  }
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // API 라우트만 처리
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // 정적 파일, 헬스체크 제외
  if (pathname === '/api/health' || pathname.startsWith('/api/_')) {
    return NextResponse.next()
  }

  const ip = getClientIP(request)
  const { allowed, remaining, resetTime } = checkRateLimit(ip, pathname)

  // 주기적 정리 (1% 확률로 실행)
  if (Math.random() < 0.01) {
    cleanupExpiredEntries()
  }

  if (!allowed) {
    const retryAfter = Math.ceil((resetTime - Date.now()) / 1000)

    return new NextResponse(
      JSON.stringify({
        error: 'Too Many Requests',
        message: '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
        retryAfter,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfter),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(resetTime / 1000)),
        },
      }
    )
  }

  // 성공 응답에 Rate Limit 헤더 추가
  const response = NextResponse.next()
  response.headers.set('X-RateLimit-Remaining', String(remaining))
  response.headers.set('X-RateLimit-Reset', String(Math.ceil(resetTime / 1000)))

  return response
}

export const config = {
  matcher: '/api/:path*',
}
