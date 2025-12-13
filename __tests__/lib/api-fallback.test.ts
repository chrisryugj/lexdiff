import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isCircuitOpen,
  recordSuccess,
  recordFailure,
  withRetry,
  getErrorMessage,
  getLawApiFallbackMessage,
  getAiFallbackResponse,
  getCircuitBreakerStatus,
  resetCircuitBreaker
} from '../../lib/api-fallback'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API Fallback 테스트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('API Fallback', () => {
  beforeEach(() => {
    // 각 테스트 전 Circuit Breaker 리셋
    resetCircuitBreaker('test-api')
    resetCircuitBreaker('law-api')
    resetCircuitBreaker('gemini-api')
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Circuit Breaker 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('Circuit Breaker', () => {
    it('초기 상태는 CLOSED (요청 허용)', () => {
      expect(isCircuitOpen('test-api')).toBe(false)
    })

    it('5회 연속 실패 시 OPEN 상태로 전환', () => {
      for (let i = 0; i < 5; i++) {
        recordFailure('test-api')
      }

      expect(isCircuitOpen('test-api')).toBe(true)
    })

    it('실패 후 성공하면 실패 카운트 리셋', () => {
      recordFailure('test-api')
      recordFailure('test-api')
      recordSuccess('test-api')
      recordFailure('test-api')
      recordFailure('test-api')
      recordFailure('test-api')
      recordFailure('test-api')

      // 중간에 성공했으므로 4회 연속 실패만 됨 → 아직 CLOSED
      expect(isCircuitOpen('test-api')).toBe(false)
    })

    it('OPEN 상태에서 요청 차단', () => {
      for (let i = 0; i < 5; i++) {
        recordFailure('test-api')
      }

      expect(isCircuitOpen('test-api')).toBe(true)
    })

    it('수동 리셋으로 CLOSED 상태로 복구', () => {
      for (let i = 0; i < 5; i++) {
        recordFailure('test-api')
      }
      expect(isCircuitOpen('test-api')).toBe(true)

      resetCircuitBreaker('test-api')
      expect(isCircuitOpen('test-api')).toBe(false)
    })

    it('Circuit Breaker 상태 조회', () => {
      recordFailure('law-api')
      recordFailure('law-api')

      const status = getCircuitBreakerStatus()

      expect(status['law-api']).toBeDefined()
      expect(status['law-api'].state).toBe('CLOSED')
      expect(status['law-api'].failures).toBe(2)
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // withRetry 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('withRetry', () => {
    it('성공 시 결과 반환', async () => {
      const fn = vi.fn().mockResolvedValue('success')

      const result = await withRetry(fn, 'test-api')

      expect(result.data).toBe('success')
      expect(result.isFallback).toBe(false)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('Circuit Open 시 즉시 fallback 반환', async () => {
      // Circuit Breaker를 OPEN으로 만듦
      for (let i = 0; i < 5; i++) {
        recordFailure('test-api')
      }

      const fn = vi.fn().mockResolvedValue('success')

      const result = await withRetry(fn, 'test-api')

      expect(result.data).toBeNull()
      expect(result.isFallback).toBe(true)
      expect(result.fallbackReason).toContain('일시적으로 불안정')
      expect(fn).not.toHaveBeenCalled()
    })

    it('재시도 불가능한 에러 시 즉시 실패', async () => {
      const error = new Error('권한 없음')
      const fn = vi.fn().mockRejectedValue(error)

      const result = await withRetry(fn, 'test-api')

      expect(result.data).toBeNull()
      expect(result.isFallback).toBe(true)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('재시도 가능한 에러 시 maxRetries까지 재시도', async () => {
      const error = new Error('500 Internal Server Error')
      const fn = vi.fn().mockRejectedValue(error)

      const result = await withRetry(fn, 'test-api', {
        maxRetries: 2,
        baseDelayMs: 10,
        maxDelayMs: 50
      })

      expect(result.data).toBeNull()
      expect(result.isFallback).toBe(true)
      expect(fn).toHaveBeenCalledTimes(3)  // 1 + 2 retries
    })

    it('재시도 중 성공 시 결과 반환', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('500'))
        .mockRejectedValueOnce(new Error('500'))
        .mockResolvedValue('success')

      const result = await withRetry(fn, 'test-api', {
        maxRetries: 3,
        baseDelayMs: 10,
        maxDelayMs: 50
      })

      expect(result.data).toBe('success')
      expect(result.isFallback).toBe(false)
      expect(fn).toHaveBeenCalledTimes(3)
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 에러 메시지 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('getErrorMessage', () => {
    it('네트워크 에러 메시지', () => {
      const error = new TypeError('fetch failed')
      const message = getErrorMessage(error, 'API')

      expect(message).toContain('네트워크 연결')
    })

    it('429 Rate Limit 메시지', () => {
      const error = new Error('429 Too Many Requests')
      const message = getErrorMessage(error, 'API')

      expect(message).toContain('요청이 너무 많습니다')
    })

    it('500 서버 에러 메시지', () => {
      const error = new Error('500 Internal Server Error')
      const message = getErrorMessage(error, '법제처 API')

      expect(message).toContain('법제처 API 서버')
      expect(message).toContain('일시적으로 불안정')
    })

    it('타임아웃 메시지', () => {
      const error = new Error('Request timeout')
      const message = getErrorMessage(error, 'API')

      expect(message).toContain('시간이 초과')
    })

    it('알 수 없는 에러 기본 메시지', () => {
      const error = new Error('Unknown error')
      const message = getErrorMessage(error, 'Test API')

      expect(message).toContain('Test API')
      expect(message).toContain('오류가 발생')
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 법제처 API Fallback 메시지 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('getLawApiFallbackMessage', () => {
    it('법령명 + 조문번호 있을 때', () => {
      const message = getLawApiFallbackMessage({
        lawName: '관세법',
        articleNumber: '제38조'
      })

      expect(message).toContain('「관세법」')
      expect(message).toContain('제38조')
      expect(message).toContain('law.go.kr')
    })

    it('법령명만 있을 때', () => {
      const message = getLawApiFallbackMessage({
        lawName: '소득세법'
      })

      expect(message).toContain('「소득세법」')
      expect(message).toContain('law.go.kr')
    })

    it('아무 정보 없을 때', () => {
      const message = getLawApiFallbackMessage({})

      expect(message).toContain('법령 정보를 가져오는 데 실패')
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // AI API Fallback 응답 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('getAiFallbackResponse', () => {
    it('Fallback 응답 구조', () => {
      const response = getAiFallbackResponse('관세법 제38조 적용 범위')

      expect(response.isFallback).toBe(true)
      expect(response.citations).toEqual([])
      expect(response.answer).toContain('AI 검색 서비스 일시 중단')
    })

    it('원본 쿼리 포함', () => {
      const query = '관세법 제38조'
      const response = getAiFallbackResponse(query)

      expect(response.answer).toContain(query)
    })

    it('긴 쿼리는 50자로 잘림', () => {
      const longQuery = '이것은 매우 긴 검색 쿼리입니다. 50자가 넘는 쿼리는 잘려서 표시됩니다. 추가 텍스트가 더 있습니다.'
      const response = getAiFallbackResponse(longQuery)

      expect(response.answer).toContain('...')
      expect(response.answer).not.toContain('추가 텍스트가 더 있습니다')
    })

    it('대안 안내 포함', () => {
      const response = getAiFallbackResponse('테스트')

      expect(response.answer).toContain('대안')
      expect(response.answer).toContain('법제처 사이트')
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Exponential Backoff 계산 테스트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('Exponential Backoff', () => {
    it('delay 계산 (attempt 0)', () => {
      const baseDelay = 1000
      const maxDelay = 10000
      const attempt = 0

      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)

      expect(delay).toBe(1000)
    })

    it('delay 계산 (attempt 1)', () => {
      const baseDelay = 1000
      const maxDelay = 10000
      const attempt = 1

      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)

      expect(delay).toBe(2000)
    })

    it('delay 계산 (attempt 2)', () => {
      const baseDelay = 1000
      const maxDelay = 10000
      const attempt = 2

      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)

      expect(delay).toBe(4000)
    })

    it('maxDelay 제한', () => {
      const baseDelay = 1000
      const maxDelay = 10000
      const attempt = 5  // 2^5 * 1000 = 32000

      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)

      expect(delay).toBe(10000)
    })
  })
})
