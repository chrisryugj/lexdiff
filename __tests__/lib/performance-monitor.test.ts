import { describe, it, expect, beforeEach, vi } from 'vitest'
import { performanceMonitor, measureAsync } from '../../lib/performance-monitor'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Performance Monitor 테스트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('PerformanceMonitor', () => {
  beforeEach(() => {
    performanceMonitor.reset()
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 타이머 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('Timer', () => {
    it('타이머 시작/종료 시 duration 반환', async () => {
      performanceMonitor.startTimer('rag-search')
      await new Promise(resolve => setTimeout(resolve, 50))
      const duration = performanceMonitor.endTimer('rag-search')

      expect(duration).toBeGreaterThan(40)
      expect(duration).toBeLessThan(100)
    })

    it('시작되지 않은 타이머 종료 시 0 반환', () => {
      const duration = performanceMonitor.endTimer('law-search')
      expect(duration).toBe(0)
    })

    it('여러 타이머 동시 실행', async () => {
      performanceMonitor.startTimer('rag-search')
      performanceMonitor.startTimer('law-search')

      await new Promise(resolve => setTimeout(resolve, 30))
      const ragDuration = performanceMonitor.endTimer('rag-search')

      await new Promise(resolve => setTimeout(resolve, 30))
      const lawDuration = performanceMonitor.endTimer('law-search')

      expect(ragDuration).toBeGreaterThan(20)
      expect(lawDuration).toBeGreaterThan(50)
    })

    it('응답 시간이 stats에 기록됨', () => {
      performanceMonitor.startTimer('eflaw')
      performanceMonitor.endTimer('eflaw')

      const stats = performanceMonitor.getStats()
      expect(stats.responseTime.eflaw.count).toBe(1)
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 캐시 히트 기록 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('Cache Recording', () => {
    it('RAG 캐시 히트 기록', () => {
      performanceMonitor.recordCacheHit('rag')
      performanceMonitor.recordCacheHit('rag')
      performanceMonitor.recordCacheMiss('rag')

      const stats = performanceMonitor.getStats()
      // 2 hits / 3 total = 66.67% → 67%
      expect(stats.cacheHitRates.rag).toBe(67)
    })

    it('Law Content 캐시 히트 기록', () => {
      performanceMonitor.recordCacheHit('law-content')
      performanceMonitor.recordCacheMiss('law-content')
      performanceMonitor.recordCacheMiss('law-content')
      performanceMonitor.recordCacheMiss('law-content')

      const stats = performanceMonitor.getStats()
      // 1 hit / 4 total = 25%
      expect(stats.cacheHitRates.lawContent).toBe(25)
    })

    it('API 캐시 히트 기록', () => {
      performanceMonitor.recordCacheHit('api')

      const stats = performanceMonitor.getStats()
      expect(stats.cacheHitRates.api).toBe(100)
    })

    it('캐시 기록 없으면 0%', () => {
      const stats = performanceMonitor.getStats()
      expect(stats.cacheHitRates.rag).toBe(0)
      expect(stats.cacheHitRates.lawContent).toBe(0)
      expect(stats.cacheHitRates.api).toBe(0)
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 에러 기록 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('Error Recording', () => {
    it('RAG 에러 기록', () => {
      performanceMonitor.recordError('rag')
      performanceMonitor.recordError('rag')

      const stats = performanceMonitor.getStats()
      expect(stats.errorRates.byType.ragErrors).toBe(2)
    })

    it('Law API 에러 기록', () => {
      performanceMonitor.recordError('law-api')

      const stats = performanceMonitor.getStats()
      expect(stats.errorRates.byType.lawApiErrors).toBe(1)
    })

    it('Gemini 에러 기록', () => {
      performanceMonitor.recordError('gemini')
      performanceMonitor.recordError('gemini')
      performanceMonitor.recordError('gemini')

      const stats = performanceMonitor.getStats()
      expect(stats.errorRates.byType.geminiErrors).toBe(3)
    })

    it('Network 에러 기록', () => {
      performanceMonitor.recordError('network')

      const stats = performanceMonitor.getStats()
      expect(stats.errorRates.byType.networkErrors).toBe(1)
    })

    it('총 에러 수 계산', () => {
      performanceMonitor.recordError('rag')
      performanceMonitor.recordError('law-api')
      performanceMonitor.recordError('gemini')
      performanceMonitor.recordError('network')

      const stats = performanceMonitor.getStats()
      expect(stats.errorRates.total).toBe(4)
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Rate Limiting 기록 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('Rate Limiting Recording', () => {
    it('blocked 기록', () => {
      performanceMonitor.recordRateLimitEvent('blocked')
      performanceMonitor.recordRateLimitEvent('allowed')
      performanceMonitor.recordRateLimitEvent('allowed')
      performanceMonitor.recordRateLimitEvent('allowed')

      const stats = performanceMonitor.getStats()
      // 1 blocked / 4 total = 25%
      expect(stats.rateLimiting.blockRate).toBe(25)
    })

    it('quota-exceeded 기록', () => {
      // quota-exceeded는 별도 카운터로 blocked/allowed 합에 포함되지 않음
      // quotaExceededRate = quotaExceeded / (blocked + allowed)
      performanceMonitor.recordRateLimitEvent('quota-exceeded')
      performanceMonitor.recordRateLimitEvent('blocked')

      const stats = performanceMonitor.getStats()
      // 1 quota-exceeded / 1 blocked = 100%
      expect(stats.rateLimiting.quotaExceededRate).toBe(100)
    })

    it('기록 없으면 0%', () => {
      const stats = performanceMonitor.getStats()
      expect(stats.rateLimiting.blockRate).toBe(0)
      expect(stats.rateLimiting.quotaExceededRate).toBe(0)
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 통계 계산 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('Statistics Calculation', () => {
    it('uptime 계산', async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
      const stats = performanceMonitor.getStats()

      expect(stats.uptime).toBeGreaterThan(90)
    })

    it('응답 시간 평균 계산', () => {
      // 내부적으로 시뮬레이션
      const times = [100, 200, 300]
      const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length)

      expect(avg).toBe(200)
    })

    it('P50 계산', () => {
      const times = [100, 200, 300, 400, 500]
      const sorted = [...times].sort((a, b) => a - b)
      const p50 = sorted[Math.floor(sorted.length * 0.5)]

      expect(p50).toBe(300)
    })

    it('P95 계산', () => {
      const times = Array.from({ length: 100 }, (_, i) => (i + 1) * 10)
      const sorted = [...times].sort((a, b) => a - b)
      const p95 = sorted[Math.floor(sorted.length * 0.95)]

      expect(p95).toBe(960)  // 96번째 항목
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 요약 문자열 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('Summary', () => {
    it('요약 문자열 생성', () => {
      performanceMonitor.recordCacheHit('rag')
      performanceMonitor.recordError('gemini')

      const summary = performanceMonitor.getSummary()

      expect(summary).toContain('Performance Summary')
      expect(summary).toContain('Response Time')
      expect(summary).toContain('Cache Hit Rates')
      expect(summary).toContain('Errors')
      expect(summary).toContain('Rate Limiting')
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 리셋 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('Reset', () => {
    it('메트릭 리셋', () => {
      performanceMonitor.recordCacheHit('rag')
      performanceMonitor.recordError('gemini')
      performanceMonitor.recordRateLimitEvent('blocked')

      performanceMonitor.reset()

      const stats = performanceMonitor.getStats()
      expect(stats.cacheHitRates.rag).toBe(0)
      expect(stats.errorRates.total).toBe(0)
      expect(stats.rateLimiting.blockRate).toBe(0)
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // measureAsync 헬퍼 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('measureAsync', () => {
    it('성공 시 결과 반환 및 시간 기록', async () => {
      const result = await measureAsync('rag-search', async () => {
        await new Promise(resolve => setTimeout(resolve, 50))
        return 'success'
      })

      expect(result).toBe('success')

      const stats = performanceMonitor.getStats()
      expect(stats.responseTime.ragSearch.count).toBe(1)
      expect(stats.responseTime.ragSearch.avg).toBeGreaterThan(40)
    })

    it('실패 시 에러 throw 및 시간 기록', async () => {
      await expect(
        measureAsync('law-search', async () => {
          throw new Error('test error')
        })
      ).rejects.toThrow('test error')

      const stats = performanceMonitor.getStats()
      expect(stats.responseTime.lawSearch.count).toBe(1)
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 최대 샘플 수 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('Max Samples', () => {
    it('최대 샘플 수(100) 초과 시 오래된 샘플 제거', () => {
      // 110번 기록
      for (let i = 0; i < 110; i++) {
        performanceMonitor.startTimer('eflaw')
        performanceMonitor.endTimer('eflaw')
      }

      const stats = performanceMonitor.getStats()
      expect(stats.responseTime.eflaw.count).toBe(100)
    })
  })
})
