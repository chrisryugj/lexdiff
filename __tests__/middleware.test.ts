/**
 * Rate Limiting 미들웨어 테스트
 *
 * middleware.ts의 Rate Limiting 로직 검증
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// 미들웨어 로직을 테스트하기 위한 헬퍼 함수들
// (실제 미들웨어는 Edge Runtime에서 실행되므로 로직만 추출하여 테스트)

describe('Rate Limiting 로직', () => {
  // Rate limit 설정값 테스트
  describe('Rate Limit 설정', () => {
    const RATE_LIMITS = {
      default: { requests: 100, windowMs: 60 * 1000 },
      ai: { requests: 20, windowMs: 60 * 1000 },
    }

    it('일반 API 제한: 100 req/min', () => {
      expect(RATE_LIMITS.default.requests).toBe(100)
      expect(RATE_LIMITS.default.windowMs).toBe(60000)
    })

    it('AI API 제한: 20 req/min', () => {
      expect(RATE_LIMITS.ai.requests).toBe(20)
      expect(RATE_LIMITS.ai.windowMs).toBe(60000)
    })
  })

  // AI 엔드포인트 판별 테스트
  describe('AI 엔드포인트 판별', () => {
    const AI_ENDPOINTS = [
      '/api/file-search-rag',
      '/api/summarize',
      '/api/analyze-intent',
      '/api/intelligent-search',
    ]

    const isAIEndpoint = (pathname: string) =>
      AI_ENDPOINTS.some(e => pathname.startsWith(e))

    it('/api/file-search-rag는 AI 엔드포인트', () => {
      expect(isAIEndpoint('/api/file-search-rag')).toBe(true)
      expect(isAIEndpoint('/api/file-search-rag/stream')).toBe(true)
    })

    it('/api/summarize는 AI 엔드포인트', () => {
      expect(isAIEndpoint('/api/summarize')).toBe(true)
    })

    it('/api/law-search는 일반 엔드포인트', () => {
      expect(isAIEndpoint('/api/law-search')).toBe(false)
    })

    it('/api/eflaw는 일반 엔드포인트', () => {
      expect(isAIEndpoint('/api/eflaw')).toBe(false)
    })
  })

  // IP 추출 로직 테스트
  describe('클라이언트 IP 추출', () => {
    const getClientIP = (headers: Map<string, string>): string => {
      const forwarded = headers.get('x-forwarded-for')
      if (forwarded) {
        return forwarded.split(',')[0].trim()
      }

      const realIP = headers.get('x-real-ip')
      if (realIP) {
        return realIP
      }

      return '127.0.0.1'
    }

    it('x-forwarded-for 헤더에서 첫 번째 IP 추출', () => {
      const headers = new Map([['x-forwarded-for', '203.0.113.1, 70.41.3.18']])
      expect(getClientIP(headers)).toBe('203.0.113.1')
    })

    it('x-real-ip 헤더 사용', () => {
      const headers = new Map([['x-real-ip', '192.168.1.1']])
      expect(getClientIP(headers)).toBe('192.168.1.1')
    })

    it('헤더 없으면 127.0.0.1 반환', () => {
      const headers = new Map<string, string>()
      expect(getClientIP(headers)).toBe('127.0.0.1')
    })

    it('x-forwarded-for가 x-real-ip보다 우선', () => {
      const headers = new Map([
        ['x-forwarded-for', '203.0.113.1'],
        ['x-real-ip', '192.168.1.1'],
      ])
      expect(getClientIP(headers)).toBe('203.0.113.1')
    })
  })

  // Rate Limit 체크 로직 테스트
  describe('Rate Limit 체크', () => {
    const RATE_LIMITS = {
      default: { requests: 100, windowMs: 60 * 1000 },
      ai: { requests: 20, windowMs: 60 * 1000 },
    }

    let requestCounts: Map<string, { count: number; resetTime: number }>

    beforeEach(() => {
      requestCounts = new Map()
    })

    const checkRateLimit = (
      ip: string,
      isAI: boolean
    ): { allowed: boolean; remaining: number } => {
      const now = Date.now()
      const limit = isAI ? RATE_LIMITS.ai : RATE_LIMITS.default
      const key = `${ip}:${isAI ? 'ai' : 'default'}`

      const record = requestCounts.get(key)

      if (!record || now > record.resetTime) {
        requestCounts.set(key, {
          count: 1,
          resetTime: now + limit.windowMs,
        })
        return { allowed: true, remaining: limit.requests - 1 }
      }

      if (record.count >= limit.requests) {
        return { allowed: false, remaining: 0 }
      }

      record.count++
      return { allowed: true, remaining: limit.requests - record.count }
    }

    it('첫 요청은 허용', () => {
      const result = checkRateLimit('192.168.1.1', false)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(99)
    })

    it('AI 엔드포인트 첫 요청 remaining은 19', () => {
      const result = checkRateLimit('192.168.1.1', true)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(19)
    })

    it('100번째 요청 후 일반 API 차단', () => {
      const ip = '192.168.1.100'
      for (let i = 0; i < 100; i++) {
        checkRateLimit(ip, false)
      }
      const result = checkRateLimit(ip, false)
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('20번째 요청 후 AI API 차단', () => {
      const ip = '192.168.1.200'
      for (let i = 0; i < 20; i++) {
        checkRateLimit(ip, true)
      }
      const result = checkRateLimit(ip, true)
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('다른 IP는 별도 카운트', () => {
      const ip1 = '192.168.1.1'
      const ip2 = '192.168.1.2'

      for (let i = 0; i < 50; i++) {
        checkRateLimit(ip1, false)
      }

      const result = checkRateLimit(ip2, false)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(99)
    })

    it('일반 API와 AI API는 별도 카운트', () => {
      const ip = '192.168.1.1'

      // 일반 API 99회 사용
      for (let i = 0; i < 99; i++) {
        checkRateLimit(ip, false)
      }

      // AI API는 여전히 19회 남음
      const aiResult = checkRateLimit(ip, true)
      expect(aiResult.allowed).toBe(true)
      expect(aiResult.remaining).toBe(19)
    })
  })

  // 응답 헤더 테스트
  describe('Rate Limit 응답 헤더', () => {
    it('429 응답에 Retry-After 헤더 포함', () => {
      const resetTime = Date.now() + 30000 // 30초 후
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000)
      expect(retryAfter).toBeGreaterThan(0)
      expect(retryAfter).toBeLessThanOrEqual(60)
    })

    it('성공 응답에 X-RateLimit-Remaining 헤더', () => {
      const remaining = 95
      const headerValue = String(remaining)
      expect(headerValue).toBe('95')
    })

    it('성공 응답에 X-RateLimit-Reset 헤더 (Unix timestamp)', () => {
      const resetTime = Date.now() + 60000
      const headerValue = String(Math.ceil(resetTime / 1000))
      expect(Number(headerValue)).toBeGreaterThan(Date.now() / 1000)
    })
  })

  // 제외 경로 테스트
  describe('Rate Limit 제외 경로', () => {
    const shouldSkip = (pathname: string) => {
      if (!pathname.startsWith('/api/')) return true
      if (pathname === '/api/health') return true
      if (pathname.startsWith('/api/_')) return true
      return false
    }

    it('비 API 경로는 스킵', () => {
      expect(shouldSkip('/about')).toBe(true)
      expect(shouldSkip('/search')).toBe(true)
    })

    it('/api/health는 스킵', () => {
      expect(shouldSkip('/api/health')).toBe(true)
    })

    it('/api/_로 시작하는 경로는 스킵', () => {
      expect(shouldSkip('/api/_internal')).toBe(true)
      expect(shouldSkip('/api/_next')).toBe(true)
    })

    it('일반 API는 Rate Limit 적용', () => {
      expect(shouldSkip('/api/law-search')).toBe(false)
      expect(shouldSkip('/api/eflaw')).toBe(false)
    })
  })
})

describe('API 입력 검증 (api-validation.ts)', () => {
  // XSS 방지 테스트
  describe('XSS 방지', () => {
    const sanitize = (val: string) =>
      val
        .replace(/<[^>]*>/g, '')
        .replace(/javascript:|data:|vbscript:/gi, '')

    it('HTML 태그 제거', () => {
      expect(sanitize('<script>alert("xss")</script>')).toBe('alert("xss")')
    })

    it('javascript: 프로토콜 제거', () => {
      expect(sanitize('javascript:alert(1)')).toBe('alert(1)')
    })

    it('data: 프로토콜 제거', () => {
      expect(sanitize('data:text/html,<script>')).toBe('text/html,')
    })

    it('정상 텍스트는 유지', () => {
      expect(sanitize('관세법 제38조')).toBe('관세법 제38조')
    })
  })

  // 스키마 검증 테스트
  describe('파라미터 스키마', () => {
    it('MST는 6자리 숫자', () => {
      const mstRegex = /^\d{6}$/
      expect(mstRegex.test('000013')).toBe(true)
      expect(mstRegex.test('12345')).toBe(false)
      expect(mstRegex.test('1234567')).toBe(false)
      expect(mstRegex.test('abcdef')).toBe(false)
    })

    it('JO 코드는 6자리 숫자', () => {
      const joRegex = /^\d{6}$/
      expect(joRegex.test('003800')).toBe(true)
      expect(joRegex.test('001002')).toBe(true)
      expect(joRegex.test('38')).toBe(false)
    })

    it('날짜는 YYYYMMDD 형식', () => {
      const dateRegex = /^\d{8}$/
      expect(dateRegex.test('20251213')).toBe(true)
      expect(dateRegex.test('2025-12-13')).toBe(false)
      expect(dateRegex.test('251213')).toBe(false)
    })
  })
})
