/**
 * 성능 모니터링 시스템
 *
 * AI 검색 응답 시간, 캐시 히트율, API 에러율 등 핵심 지표 추적
 *
 * 사용법:
 * - performanceMonitor.startTimer('rag-search')
 * - performanceMonitor.endTimer('rag-search')
 * - performanceMonitor.recordCacheHit('rag')
 * - performanceMonitor.getStats()
 */

export interface PerformanceMetrics {
  // 응답 시간 (ms)
  responseTime: {
    ragSearch: number[]
    lawSearch: number[]
    eflaw: number[]
    summarize: number[]
  }
  // 캐시 히트율
  cache: {
    ragHits: number
    ragMisses: number
    lawContentHits: number
    lawContentMisses: number
    apiCacheHits: number
    apiCacheMisses: number
  }
  // API 에러
  errors: {
    ragErrors: number
    lawApiErrors: number
    geminiErrors: number
    networkErrors: number
  }
  // Rate Limiting
  rateLimiting: {
    blocked: number
    allowed: number
    quotaExceeded: number
  }
  // 타임스탬프
  startTime: number
  lastUpdate: number
}

// 싱글톤 인스턴스
class PerformanceMonitor {
  private metrics: PerformanceMetrics
  private activeTimers: Map<string, number>
  private maxSamples = 100  // 최대 샘플 수

  constructor() {
    this.metrics = this.createEmptyMetrics()
    this.activeTimers = new Map()
  }

  private createEmptyMetrics(): PerformanceMetrics {
    return {
      responseTime: {
        ragSearch: [],
        lawSearch: [],
        eflaw: [],
        summarize: []
      },
      cache: {
        ragHits: 0,
        ragMisses: 0,
        lawContentHits: 0,
        lawContentMisses: 0,
        apiCacheHits: 0,
        apiCacheMisses: 0
      },
      errors: {
        ragErrors: 0,
        lawApiErrors: 0,
        geminiErrors: 0,
        networkErrors: 0
      },
      rateLimiting: {
        blocked: 0,
        allowed: 0,
        quotaExceeded: 0
      },
      startTime: Date.now(),
      lastUpdate: Date.now()
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 타이머 API
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 타이머 시작
   */
  startTimer(operation: 'rag-search' | 'law-search' | 'eflaw' | 'summarize'): void {
    this.activeTimers.set(operation, performance.now())
  }

  /**
   * 타이머 종료 및 기록
   */
  endTimer(operation: 'rag-search' | 'law-search' | 'eflaw' | 'summarize'): number {
    const startTime = this.activeTimers.get(operation)
    if (!startTime) return 0

    const duration = Math.round(performance.now() - startTime)
    this.activeTimers.delete(operation)

    // 응답 시간 기록
    const key = this.operationToKey(operation)
    if (key && this.metrics.responseTime[key]) {
      this.metrics.responseTime[key].push(duration)

      // 최대 샘플 수 유지
      if (this.metrics.responseTime[key].length > this.maxSamples) {
        this.metrics.responseTime[key].shift()
      }
    }

    this.metrics.lastUpdate = Date.now()
    return duration
  }

  private operationToKey(operation: string): keyof PerformanceMetrics['responseTime'] | null {
    const mapping: Record<string, keyof PerformanceMetrics['responseTime']> = {
      'rag-search': 'ragSearch',
      'law-search': 'lawSearch',
      'eflaw': 'eflaw',
      'summarize': 'summarize'
    }
    return mapping[operation] || null
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 캐시 히트 기록
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  recordCacheHit(type: 'rag' | 'law-content' | 'api'): void {
    switch (type) {
      case 'rag':
        this.metrics.cache.ragHits++
        break
      case 'law-content':
        this.metrics.cache.lawContentHits++
        break
      case 'api':
        this.metrics.cache.apiCacheHits++
        break
    }
    this.metrics.lastUpdate = Date.now()
  }

  recordCacheMiss(type: 'rag' | 'law-content' | 'api'): void {
    switch (type) {
      case 'rag':
        this.metrics.cache.ragMisses++
        break
      case 'law-content':
        this.metrics.cache.lawContentMisses++
        break
      case 'api':
        this.metrics.cache.apiCacheMisses++
        break
    }
    this.metrics.lastUpdate = Date.now()
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 에러 기록
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  recordError(type: 'rag' | 'law-api' | 'gemini' | 'network'): void {
    switch (type) {
      case 'rag':
        this.metrics.errors.ragErrors++
        break
      case 'law-api':
        this.metrics.errors.lawApiErrors++
        break
      case 'gemini':
        this.metrics.errors.geminiErrors++
        break
      case 'network':
        this.metrics.errors.networkErrors++
        break
    }
    this.metrics.lastUpdate = Date.now()
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Rate Limiting 기록
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  recordRateLimitEvent(type: 'blocked' | 'allowed' | 'quota-exceeded'): void {
    switch (type) {
      case 'blocked':
        this.metrics.rateLimiting.blocked++
        break
      case 'allowed':
        this.metrics.rateLimiting.allowed++
        break
      case 'quota-exceeded':
        this.metrics.rateLimiting.quotaExceeded++
        break
    }
    this.metrics.lastUpdate = Date.now()
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 통계 조회
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  getStats(): {
    responseTime: {
      ragSearch: { avg: number; p50: number; p95: number; count: number }
      lawSearch: { avg: number; p50: number; p95: number; count: number }
      eflaw: { avg: number; p50: number; p95: number; count: number }
      summarize: { avg: number; p50: number; p95: number; count: number }
    }
    cacheHitRates: {
      rag: number
      lawContent: number
      api: number
    }
    errorRates: {
      total: number
      byType: PerformanceMetrics['errors']
    }
    rateLimiting: {
      blockRate: number
      quotaExceededRate: number
    }
    uptime: number
  } {
    const { cache, errors, rateLimiting, startTime } = this.metrics

    // 응답 시간 통계 계산
    const calcStats = (times: number[]) => {
      if (times.length === 0) {
        return { avg: 0, p50: 0, p95: 0, count: 0 }
      }
      const sorted = [...times].sort((a, b) => a - b)
      const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
      const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0
      const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1]
      return { avg, p50, p95, count: times.length }
    }

    // 캐시 히트율 계산
    const calcHitRate = (hits: number, misses: number) => {
      const total = hits + misses
      return total > 0 ? Math.round((hits / total) * 100) : 0
    }

    // Rate Limiting 비율 계산
    const totalRequests = rateLimiting.blocked + rateLimiting.allowed

    return {
      responseTime: {
        ragSearch: calcStats(this.metrics.responseTime.ragSearch),
        lawSearch: calcStats(this.metrics.responseTime.lawSearch),
        eflaw: calcStats(this.metrics.responseTime.eflaw),
        summarize: calcStats(this.metrics.responseTime.summarize)
      },
      cacheHitRates: {
        rag: calcHitRate(cache.ragHits, cache.ragMisses),
        lawContent: calcHitRate(cache.lawContentHits, cache.lawContentMisses),
        api: calcHitRate(cache.apiCacheHits, cache.apiCacheMisses)
      },
      errorRates: {
        total: errors.ragErrors + errors.lawApiErrors + errors.geminiErrors + errors.networkErrors,
        byType: { ...errors }
      },
      rateLimiting: {
        blockRate: totalRequests > 0 ? Math.round((rateLimiting.blocked / totalRequests) * 100) : 0,
        quotaExceededRate: totalRequests > 0 ? Math.round((rateLimiting.quotaExceeded / totalRequests) * 100) : 0
      },
      uptime: Date.now() - startTime
    }
  }

  /**
   * 요약 문자열 반환 (로깅용)
   */
  getSummary(): string {
    const stats = this.getStats()
    const uptimeMin = Math.round(stats.uptime / 1000 / 60)

    return `
📊 Performance Summary (${uptimeMin}분 uptime)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱️ Response Time (avg/p95):
   - RAG Search: ${stats.responseTime.ragSearch.avg}ms / ${stats.responseTime.ragSearch.p95}ms (${stats.responseTime.ragSearch.count} req)
   - Law Search: ${stats.responseTime.lawSearch.avg}ms / ${stats.responseTime.lawSearch.p95}ms (${stats.responseTime.lawSearch.count} req)
   - EfLaw: ${stats.responseTime.eflaw.avg}ms / ${stats.responseTime.eflaw.p95}ms (${stats.responseTime.eflaw.count} req)

💾 Cache Hit Rates:
   - RAG Cache: ${stats.cacheHitRates.rag}%
   - Law Content: ${stats.cacheHitRates.lawContent}%
   - API Cache: ${stats.cacheHitRates.api}%

❌ Errors: ${stats.errorRates.total} total
   - RAG: ${stats.errorRates.byType.ragErrors}
   - Law API: ${stats.errorRates.byType.lawApiErrors}
   - Gemini: ${stats.errorRates.byType.geminiErrors}
   - Network: ${stats.errorRates.byType.networkErrors}

🚦 Rate Limiting:
   - Block Rate: ${stats.rateLimiting.blockRate}%
   - Quota Exceeded: ${stats.rateLimiting.quotaExceededRate}%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`.trim()
  }

  /**
   * 메트릭 리셋
   */
  reset(): void {
    this.metrics = this.createEmptyMetrics()
    this.activeTimers.clear()
  }

  /**
   * 원시 메트릭 반환 (디버깅용)
   */
  getRawMetrics(): PerformanceMetrics {
    return { ...this.metrics }
  }
}

// 싱글톤 인스턴스 export
export const performanceMonitor = new PerformanceMonitor()

// 편의 함수들
export function measureAsync<T>(
  operation: 'rag-search' | 'law-search' | 'eflaw' | 'summarize',
  fn: () => Promise<T>
): Promise<T> {
  performanceMonitor.startTimer(operation)
  return fn()
    .then((result) => {
      performanceMonitor.endTimer(operation)
      return result
    })
    .catch((error) => {
      performanceMonitor.endTimer(operation)
      throw error
    })
}
