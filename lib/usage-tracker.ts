/**
 * AI API 사용량 트래커
 *
 * IP 기반 AI API 호출량 모니터링 및 제한
 * - 일일 쿼터: 100회/일
 * - 분당 제한: 20회/분 (middleware.ts와 연동)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 설정
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const USAGE_CONFIG = {
  dailyQuota: 100,        // 일일 최대 AI 호출 수
  windowMs: 24 * 60 * 60 * 1000,  // 24시간
  warningThreshold: 0.8,  // 80% 사용 시 경고
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 타입 정의
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface UsageRecord {
  count: number
  firstRequestTime: number
  lastRequestTime: number
  totalTokens: number
}

interface UsageStats {
  ip: string
  dailyUsage: number
  dailyQuota: number
  remainingQuota: number
  percentUsed: number
  isWarning: boolean
  isExceeded: boolean
  resetsAt: Date
  totalTokensUsed: number
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 메모리 저장소 (Edge Runtime 호환)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const usageStore = new Map<string, UsageRecord>()

/**
 * 만료된 레코드 정리 (메모리 누수 방지)
 */
function cleanupExpiredRecords(): void {
  const now = Date.now()
  for (const [ip, record] of usageStore.entries()) {
    if (now - record.firstRequestTime > USAGE_CONFIG.windowMs) {
      usageStore.delete(ip)
    }
  }
}

// 5분마다 정리 (서버 재시작 시 리셋됨)
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredRecords, 5 * 60 * 1000)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 공개 API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * AI API 호출 기록
 */
export function recordAIUsage(ip: string, tokensUsed: number = 0): UsageStats {
  const now = Date.now()
  const record = usageStore.get(ip)

  if (!record || now - record.firstRequestTime > USAGE_CONFIG.windowMs) {
    // 새 윈도우 시작
    usageStore.set(ip, {
      count: 1,
      firstRequestTime: now,
      lastRequestTime: now,
      totalTokens: tokensUsed,
    })
  } else {
    // 기존 윈도우에 추가
    record.count++
    record.lastRequestTime = now
    record.totalTokens += tokensUsed
  }

  return getUsageStats(ip)
}

/**
 * 사용량 통계 조회
 */
export function getUsageStats(ip: string): UsageStats {
  const now = Date.now()
  const record = usageStore.get(ip)

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

/**
 * 쿼터 초과 여부 확인
 */
export function isQuotaExceeded(ip: string): boolean {
  return getUsageStats(ip).isExceeded
}

/**
 * 사용량 경고 메시지 생성
 */
export function getUsageWarningMessage(stats: UsageStats): string | null {
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

/**
 * 응답 헤더용 사용량 정보
 */
export function getUsageHeaders(ip: string): Record<string, string> {
  const stats = getUsageStats(ip)
  return {
    'X-AI-Usage-Daily': String(stats.dailyUsage),
    'X-AI-Usage-Remaining': String(stats.remainingQuota),
    'X-AI-Usage-Reset': String(Math.ceil(stats.resetsAt.getTime() / 1000)),
  }
}

/**
 * 전체 사용량 요약 (관리자용)
 */
export function getGlobalUsageSummary(): {
  totalIPs: number
  totalRequests: number
  totalTokens: number
  activeIPs: string[]
} {
  cleanupExpiredRecords()

  let totalRequests = 0
  let totalTokens = 0
  const activeIPs: string[] = []

  for (const [ip, record] of usageStore.entries()) {
    totalRequests += record.count
    totalTokens += record.totalTokens
    activeIPs.push(ip)
  }

  return {
    totalIPs: usageStore.size,
    totalRequests,
    totalTokens,
    activeIPs,
  }
}
