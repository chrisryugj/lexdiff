import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { checkDistributedRateLimit } from "@/lib/server/traffic-control"
import { getClientIP } from "@/lib/get-client-ip"

const RATE_LIMITS = {
  default: { requests: Number(process.env.API_RATE_LIMIT_PER_MINUTE ?? 100), windowMs: 60 * 1000 },
  ai: { requests: Number(process.env.AI_RATE_LIMIT_PER_MINUTE ?? 20), windowMs: 60 * 1000 },
}

const AI_ENDPOINTS = ["/api/fc-rag", "/api/summarize", "/api/annex-to-markdown"]

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!pathname.startsWith("/api/")) {
    return NextResponse.next()
  }

  if (pathname === "/api/health" || pathname.startsWith("/api/_")) {
    return NextResponse.next()
  }

  const isAIEndpoint = AI_ENDPOINTS.some((endpoint) => pathname.startsWith(endpoint))
  const limit = isAIEndpoint ? RATE_LIMITS.ai : RATE_LIMITS.default
  const ip = getClientIP(request)

  const { allowed, remaining, resetTime } = await checkDistributedRateLimit({
    namespace: "api-rate-limit",
    identifier: `${isAIEndpoint ? "ai" : "default"}:${ip}`,
    limit: limit.requests,
    windowMs: limit.windowMs,
  })

  if (!allowed) {
    const retryAfter = Math.max(Math.ceil((resetTime - Date.now()) / 1000), 1)

    return NextResponse.json(
      {
        error: "Too Many Requests",
        message: "요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.",
        retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(limit.requests),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(resetTime / 1000)),
        },
      }
    )
  }

  const response = NextResponse.next()
  response.headers.set("X-RateLimit-Limit", String(limit.requests))
  response.headers.set("X-RateLimit-Remaining", String(remaining))
  response.headers.set("X-RateLimit-Reset", String(Math.ceil(resetTime / 1000)))
  return response
}

export const config = {
  matcher: "/api/:path*",
}
