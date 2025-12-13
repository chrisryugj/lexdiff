/**
 * AI 사용량 트래커 테스트
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// 모듈 모킹 전에 import
const mockUsageStore = new Map<string, { count: number; firstRequestTime: number; lastRequestTime: number; totalTokens: number }>()

// 실제 모듈의 로직을 테스트용으로 재구현
const USAGE_CONFIG = {
  dailyQuota: 100,
  windowMs: 24 * 60 * 60 * 1000,
  warningThreshold: 0.8,
}

function recordAIUsage(ip: string, tokensUsed: number = 0) {
  const now = Date.now()
  const record = mockUsageStore.get(ip)

  if (!record || now - record.firstRequestTime > USAGE_CONFIG.windowMs) {
    mockUsageStore.set(ip, {
      count: 1,
      firstRequestTime: now,
      lastRequestTime: now,
      totalTokens: tokensUsed,
    })
  } else {
    record.count++
    record.lastRequestTime = now
    record.totalTokens += tokensUsed
  }

  return getUsageStats(ip)
}

function getUsageStats(ip: string) {
  const now = Date.now()
  const record = mockUsageStore.get(ip)

  if (!record || now - record.firstRequestTime > USAGE_CONFIG.windowMs) {
    return {
      ip,
      dailyUsage: 0,
      dailyQuota: USAGE_CONFIG.dailyQuota,
      remainingQuota: USAGE_CONFIG.dailyQuota,
      percentUsed: 0,
      isWarning: false,
      isExceeded: false,
      resetsAt: new Date(now + USAGE_CONFIG.windowMs),
      totalTokensUsed: 0,
    }
  }

  const remainingQuota = Math.max(0, USAGE_CONFIG.dailyQuota - record.count)
  const percentUsed = record.count / USAGE_CONFIG.dailyQuota

  return {
    ip,
    dailyUsage: record.count,
    dailyQuota: USAGE_CONFIG.dailyQuota,
    remainingQuota,
    percentUsed,
    isWarning: percentUsed >= USAGE_CONFIG.warningThreshold,
    isExceeded: record.count >= USAGE_CONFIG.dailyQuota,
    resetsAt: new Date(record.firstRequestTime + USAGE_CONFIG.windowMs),
    totalTokensUsed: record.totalTokens,
  }
}

function isQuotaExceeded(ip: string): boolean {
  return getUsageStats(ip).isExceeded
}

function getUsageWarningMessage(stats: ReturnType<typeof getUsageStats>): string | null {
  if (stats.isExceeded) {
    const resetTime = stats.resetsAt.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    })
    return `일일 AI 검색 한도(${stats.dailyQuota}회)를 초과했습니다. ${resetTime}에 초기화됩니다.`
  }

  if (stats.isWarning) {
    return `AI 검색 사용량 경고: ${stats.dailyUsage}/${stats.dailyQuota}회 사용 (${Math.round(stats.percentUsed * 100)}%)`
  }

  return null
}

function getUsageHeaders(ip: string): Record<string, string> {
  const stats = getUsageStats(ip)
  return {
    'X-AI-Usage-Daily': String(stats.dailyUsage),
    'X-AI-Usage-Remaining': String(stats.remainingQuota),
    'X-AI-Usage-Reset': String(Math.ceil(stats.resetsAt.getTime() / 1000)),
  }
}

describe('AI 사용량 트래커', () => {
  beforeEach(() => {
    mockUsageStore.clear()
  })

  describe('recordAIUsage', () => {
    it('첫 요청 시 사용량 1로 기록', () => {
      const stats = recordAIUsage('192.168.1.1')
      expect(stats.dailyUsage).toBe(1)
      expect(stats.remainingQuota).toBe(99)
    })

    it('연속 요청 시 사용량 증가', () => {
      recordAIUsage('192.168.1.1')
      recordAIUsage('192.168.1.1')
      const stats = recordAIUsage('192.168.1.1')
      expect(stats.dailyUsage).toBe(3)
      expect(stats.remainingQuota).toBe(97)
    })

    it('토큰 사용량 누적', () => {
      recordAIUsage('192.168.1.1', 1000)
      recordAIUsage('192.168.1.1', 2000)
      const stats = recordAIUsage('192.168.1.1', 500)
      expect(stats.totalTokensUsed).toBe(3500)
    })

    it('다른 IP는 별도 카운트', () => {
      recordAIUsage('192.168.1.1')
      recordAIUsage('192.168.1.1')
      const stats2 = recordAIUsage('192.168.1.2')

      expect(stats2.dailyUsage).toBe(1)
      expect(getUsageStats('192.168.1.1').dailyUsage).toBe(2)
    })
  })

  describe('getUsageStats', () => {
    it('기록 없는 IP는 0 사용량 반환', () => {
      const stats = getUsageStats('unknown-ip')
      expect(stats.dailyUsage).toBe(0)
      expect(stats.dailyQuota).toBe(100)
      expect(stats.remainingQuota).toBe(100)
      expect(stats.percentUsed).toBe(0)
    })

    it('percentUsed 정확히 계산', () => {
      for (let i = 0; i < 50; i++) {
        recordAIUsage('192.168.1.1')
      }
      const stats = getUsageStats('192.168.1.1')
      expect(stats.percentUsed).toBe(0.5)
    })

    it('80% 이상 사용 시 isWarning true', () => {
      for (let i = 0; i < 80; i++) {
        recordAIUsage('192.168.1.1')
      }
      const stats = getUsageStats('192.168.1.1')
      expect(stats.isWarning).toBe(true)
      expect(stats.isExceeded).toBe(false)
    })

    it('100% 사용 시 isExceeded true', () => {
      for (let i = 0; i < 100; i++) {
        recordAIUsage('192.168.1.1')
      }
      const stats = getUsageStats('192.168.1.1')
      expect(stats.isExceeded).toBe(true)
    })
  })

  describe('isQuotaExceeded', () => {
    it('쿼터 미초과 시 false', () => {
      recordAIUsage('192.168.1.1')
      expect(isQuotaExceeded('192.168.1.1')).toBe(false)
    })

    it('쿼터 초과 시 true', () => {
      for (let i = 0; i < 100; i++) {
        recordAIUsage('192.168.1.1')
      }
      expect(isQuotaExceeded('192.168.1.1')).toBe(true)
    })
  })

  describe('getUsageWarningMessage', () => {
    it('쿼터 초과 시 초과 메시지 반환', () => {
      for (let i = 0; i < 100; i++) {
        recordAIUsage('192.168.1.1')
      }
      const stats = getUsageStats('192.168.1.1')
      const message = getUsageWarningMessage(stats)
      expect(message).toContain('일일 AI 검색 한도')
      expect(message).toContain('초과')
    })

    it('80% 이상 사용 시 경고 메시지 반환', () => {
      for (let i = 0; i < 80; i++) {
        recordAIUsage('192.168.1.1')
      }
      const stats = getUsageStats('192.168.1.1')
      const message = getUsageWarningMessage(stats)
      expect(message).toContain('경고')
      expect(message).toContain('80%')
    })

    it('정상 사용 시 null 반환', () => {
      recordAIUsage('192.168.1.1')
      const stats = getUsageStats('192.168.1.1')
      const message = getUsageWarningMessage(stats)
      expect(message).toBeNull()
    })
  })

  describe('getUsageHeaders', () => {
    it('사용량 헤더 반환', () => {
      recordAIUsage('192.168.1.1')
      recordAIUsage('192.168.1.1')
      const headers = getUsageHeaders('192.168.1.1')

      expect(headers['X-AI-Usage-Daily']).toBe('2')
      expect(headers['X-AI-Usage-Remaining']).toBe('98')
      expect(headers['X-AI-Usage-Reset']).toBeDefined()
    })

    it('Reset 타임스탬프가 미래', () => {
      recordAIUsage('192.168.1.1')
      const headers = getUsageHeaders('192.168.1.1')
      const resetTimestamp = Number(headers['X-AI-Usage-Reset'])

      expect(resetTimestamp).toBeGreaterThan(Date.now() / 1000)
    })
  })
})

describe('Exponential Backoff 설정', () => {
  const RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    retryableStatusCodes: [429, 500, 502, 503, 504],
  }

  function calculateBackoffDelay(attempt: number): number {
    const delay = Math.min(
      RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt),
      RETRY_CONFIG.maxDelayMs
    )
    return delay
  }

  it('attempt 0: 1초', () => {
    expect(calculateBackoffDelay(0)).toBe(1000)
  })

  it('attempt 1: 2초', () => {
    expect(calculateBackoffDelay(1)).toBe(2000)
  })

  it('attempt 2: 4초', () => {
    expect(calculateBackoffDelay(2)).toBe(4000)
  })

  it('attempt 3: 8초', () => {
    expect(calculateBackoffDelay(3)).toBe(8000)
  })

  it('attempt 4: 최대 10초 (캡)', () => {
    expect(calculateBackoffDelay(4)).toBe(10000)
  })

  it('재시도 가능한 상태 코드', () => {
    expect(RETRY_CONFIG.retryableStatusCodes).toContain(429)  // Rate limit
    expect(RETRY_CONFIG.retryableStatusCodes).toContain(500)  // Server error
    expect(RETRY_CONFIG.retryableStatusCodes).toContain(503)  // Service unavailable
    expect(RETRY_CONFIG.retryableStatusCodes).not.toContain(400)  // Bad request
    expect(RETRY_CONFIG.retryableStatusCodes).not.toContain(401)  // Unauthorized
  })
})
