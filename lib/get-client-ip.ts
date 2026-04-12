/**
 * H-SEC1: Extract the client IP address from a request.
 *
 * Vercel 외 환경에서 x-forwarded-for를 무조건 신뢰하면 공격자가
 * 헤더 스푸핑으로 일일 quota를 무한 우회 가능.
 *
 * Trust hierarchy:
 *  - Vercel 배포 (VERCEL=1): x-vercel-forwarded-for만 신뢰.
 *                            없으면 "anonymous" → 동일 quota bucket으로 묶임.
 *  - NEXT_PUBLIC_TRUST_PROXY=true: x-forwarded-for/x-real-ip 허용 (명시적 opt-in).
 *  - 그 외 (로컬 dev 포함): 127.0.0.1 고정.
 */
export function getClientIP(request: Request): string {
  // Vercel platform header — injected by the edge, cannot be set by clients
  if (process.env.VERCEL === '1') {
    const vercelIP = request.headers.get("x-vercel-forwarded-for")
    if (vercelIP) return vercelIP.split(",")[0].trim()
    // Vercel에서 헤더가 없으면 스푸핑 가능 헤더로 fallback하지 않음
    return "anonymous"
  }

  // 명시적 trusted proxy 환경에서만 표준 헤더 사용
  if (process.env.NEXT_PUBLIC_TRUST_PROXY === 'true') {
    const forwarded = request.headers.get("x-forwarded-for")
    if (forwarded) return forwarded.split(",")[0].trim()

    const realIP = request.headers.get("x-real-ip")
    if (realIP) return realIP
  }

  return "127.0.0.1"
}
