/**
 * API 에러 처리 및 Fallback 전략
 *
 * 법제처 API, Gemini API 등 외부 API 호출 시
 * 에러 발생 시 Graceful Degradation을 위한 유틸리티
 *
 * 전략:
 * 1. Circuit Breaker: 연속 실패 시 일시적으로 API 호출 중단
 * 2. Fallback Response: 캐시된 데이터 또는 기본 메시지 반환
 * 3. Retry with Exponential Backoff: 재시도 간격 점진적 증가
 */

import { performanceMonitor } from './performance-monitor'
import { debugLogger } from './debug-logger'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Circuit Breaker 설정
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface CircuitBreakerConfig {
  failureThreshold: number      // 연속 실패 횟수 임계값
  resetTimeoutMs: number        // 회로 리셋까지 대기 시간
  halfOpenRequests: number      // Half-Open 상태에서 허용할 요청 수
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,          // 5회 연속 실패
  resetTimeoutMs: 60000,        // 1분 후 재시도
  halfOpenRequests: 2           // 2개 요청으로 테스트
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

interface CircuitBreakerState {
  state: CircuitState
  failures: number
  lastFailureTime: number
  halfOpenSuccesses: number
}

// API별 Circuit Breaker 상태
const circuitStates = new Map<string, CircuitBreakerState>()

/**
 * Circuit Breaker 상태 초기화 또는 조회
 */
function getCircuitState(apiName: string): CircuitBreakerState {
  if (!circuitStates.has(apiName)) {
    circuitStates.set(apiName, {
      state: 'CLOSED',
      failures: 0,
      lastFailureTime: 0,
      halfOpenSuccesses: 0
    })
  }
  return circuitStates.get(apiName)!
}

/**
 * Circuit Breaker 상태 업데이트
 */
function updateCircuitState(apiName: string, success: boolean, config = DEFAULT_CONFIG): void {
  const state = getCircuitState(apiName)

  if (success) {
    if (state.state === 'HALF_OPEN') {
      state.halfOpenSuccesses++
      if (state.halfOpenSuccesses >= config.halfOpenRequests) {
        // Half-Open에서 성공 → Closed로 전환
        state.state = 'CLOSED'
        state.failures = 0
        state.halfOpenSuccesses = 0
        debugLogger.info(`[Circuit Breaker] ${apiName}: HALF_OPEN → CLOSED (복구됨)`)
      }
    } else {
      state.failures = 0
    }
  } else {
    state.failures++
    state.lastFailureTime = Date.now()

    if (state.failures >= config.failureThreshold) {
      state.state = 'OPEN'
      debugLogger.warning(`[Circuit Breaker] ${apiName}: CLOSED → OPEN (${state.failures}회 연속 실패)`)
    }
  }
}

/**
 * Circuit Breaker 요청 허용 여부 확인
 */
export function isCircuitOpen(apiName: string, config = DEFAULT_CONFIG): boolean {
  const state = getCircuitState(apiName)

  if (state.state === 'CLOSED') {
    return false
  }

  if (state.state === 'OPEN') {
    // Reset timeout 경과 시 Half-Open으로 전환
    if (Date.now() - state.lastFailureTime >= config.resetTimeoutMs) {
      state.state = 'HALF_OPEN'
      state.halfOpenSuccesses = 0
      debugLogger.info(`[Circuit Breaker] ${apiName}: OPEN → HALF_OPEN (재시도 허용)`)
      return false
    }
    return true
  }

  // HALF_OPEN: 제한된 요청 허용
  return false
}

/**
 * Circuit Breaker 성공 기록
 */
export function recordSuccess(apiName: string): void {
  updateCircuitState(apiName, true)
}

/**
 * Circuit Breaker 실패 기록
 */
export function recordFailure(apiName: string): void {
  updateCircuitState(apiName, false)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fallback Response 생성
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface FallbackResponse<T> {
  data: T | null
  isFallback: boolean
  fallbackReason?: string
  originalError?: Error
}

/**
 * 에러 타입에 따른 사용자 메시지 생성
 */
export function getErrorMessage(error: unknown, apiName: string): string {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return `네트워크 연결에 문제가 있습니다. 인터넷 연결을 확인해주세요.`
  }

  if (error instanceof Error) {
    if (error.message.includes('429')) {
      return `요청이 너무 많습니다. 잠시 후 다시 시도해주세요.`
    }
    if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503')) {
      return `${apiName} 서버가 일시적으로 불안정합니다. 잠시 후 다시 시도해주세요.`
    }
    if (error.message.includes('timeout')) {
      return `요청 시간이 초과되었습니다. 다시 시도해주세요.`
    }
  }

  return `${apiName} 요청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.`
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Retry with Exponential Backoff
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface RetryConfig {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  retryableErrors?: (error: unknown) => boolean
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableErrors: (error) => {
    if (error instanceof Error) {
      // 네트워크 에러, 5xx 에러, 429 Rate Limit
      return (
        error.message.includes('fetch') ||
        error.message.includes('network') ||
        error.message.includes('429') ||
        error.message.includes('500') ||
        error.message.includes('502') ||
        error.message.includes('503') ||
        error.message.includes('504')
      )
    }
    return false
  }
}

/**
 * Exponential Backoff delay 계산
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const delay = Math.min(config.baseDelayMs * Math.pow(2, attempt), config.maxDelayMs)
  // Jitter ±20%
  const jitter = delay * 0.2 * (Math.random() - 0.5)
  return Math.round(delay + jitter)
}

/**
 * 재시도 가능한 함수 실행
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  apiName: string,
  config: Partial<RetryConfig> = {}
): Promise<FallbackResponse<T>> {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config }

  // Circuit Breaker 확인
  if (isCircuitOpen(apiName)) {
    debugLogger.warning(`[Fallback] ${apiName}: Circuit Open - 요청 차단됨`)
    return {
      data: null,
      isFallback: true,
      fallbackReason: `${apiName} 서비스가 일시적으로 불안정합니다. 잠시 후 다시 시도해주세요.`
    }
  }

  let lastError: unknown = null

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = calculateDelay(attempt - 1, retryConfig)
        debugLogger.debug(`[Retry] ${apiName}: 재시도 ${attempt}/${retryConfig.maxRetries} (${delay}ms 대기)`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      const result = await fn()
      recordSuccess(apiName)

      return {
        data: result,
        isFallback: false
      }
    } catch (error) {
      lastError = error
      debugLogger.error(`❌ [Error] ${apiName}: 시도 ${attempt + 1} 실패`, error)

      // 재시도 가능한 에러인지 확인
      if (!retryConfig.retryableErrors?.(error) || attempt === retryConfig.maxRetries) {
        break
      }
    }
  }

  // 모든 재시도 실패
  recordFailure(apiName)

  // 에러 타입에 따른 모니터링 기록
  if (apiName.includes('gemini') || apiName.includes('rag')) {
    performanceMonitor.recordError('gemini')
  } else if (apiName.includes('law')) {
    performanceMonitor.recordError('law-api')
  } else {
    performanceMonitor.recordError('network')
  }

  return {
    data: null,
    isFallback: true,
    fallbackReason: getErrorMessage(lastError, apiName),
    originalError: lastError instanceof Error ? lastError : new Error(String(lastError))
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 법제처 API 전용 Fallback
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface LawApiFallbackOptions {
  lawId?: string
  lawName?: string
  articleNumber?: string
}

/**
 * 법제처 API 에러 시 Fallback 메시지 생성
 */
export function getLawApiFallbackMessage(options: LawApiFallbackOptions): string {
  const { lawName, articleNumber } = options

  if (lawName && articleNumber) {
    return `「${lawName}」 ${articleNumber}의 정보를 가져오는 데 실패했습니다. 잠시 후 다시 시도하거나 법제처 사이트(law.go.kr)에서 직접 확인해주세요.`
  }

  if (lawName) {
    return `「${lawName}」 정보를 가져오는 데 실패했습니다. 잠시 후 다시 시도하거나 법제처 사이트(law.go.kr)에서 직접 확인해주세요.`
  }

  return `법령 정보를 가져오는 데 실패했습니다. 잠시 후 다시 시도해주세요.`
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AI API 전용 Fallback
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * AI API 에러 시 Fallback 응답 생성
 */
export function getAiFallbackResponse(query: string): {
  answer: string
  citations: any[]
  isFallback: true
} {
  return {
    answer: `
📋 **AI 검색 서비스 일시 중단**

죄송합니다. 현재 AI 검색 서비스가 일시적으로 불안정합니다.

**대안:**
1. 잠시 후 다시 시도해주세요
2. 일반 법령 검색을 이용해주세요
3. 법제처 사이트(law.go.kr)에서 직접 검색하세요

**검색하려던 내용:** ${query.length > 50 ? query.substring(0, 50) + '...' : query}
    `.trim(),
    citations: [],
    isFallback: true
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Circuit Breaker 상태 조회 (디버깅용)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function getCircuitBreakerStatus(): Record<string, {
  state: CircuitState
  failures: number
  timeSinceLastFailure: number | null
}> {
  const status: Record<string, any> = {}

  circuitStates.forEach((state, apiName) => {
    status[apiName] = {
      state: state.state,
      failures: state.failures,
      timeSinceLastFailure: state.lastFailureTime > 0
        ? Date.now() - state.lastFailureTime
        : null
    }
  })

  return status
}

/**
 * 특정 API의 Circuit Breaker 리셋 (수동 복구)
 */
export function resetCircuitBreaker(apiName: string): void {
  const state = getCircuitState(apiName)
  state.state = 'CLOSED'
  state.failures = 0
  state.halfOpenSuccesses = 0
  debugLogger.info(`[Circuit Breaker] ${apiName}: 수동 리셋 완료`)
}
