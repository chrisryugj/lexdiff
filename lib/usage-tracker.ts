import {
  getDailyUsageSnapshot,
  getMemoryUsageSummary,
  recordDailyUsageTokens,
  reserveDailyUsage,
} from "@/lib/server/traffic-control"

const USAGE_NAMESPACE = "ai-usage"
const USAGE_CONFIG = {
  dailyQuota: Number(process.env.AI_DAILY_QUOTA ?? 100),
  warningThreshold: Number(process.env.AI_USAGE_WARNING_THRESHOLD ?? 0.8),
}

export interface UsageStats {
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

function toUsageStats(
  ip: string,
  snapshot: { count: number; totalTokens: number; resetTime: number }
): UsageStats {
  const remainingQuota = Math.max(0, USAGE_CONFIG.dailyQuota - snapshot.count)
  const percentUsed = USAGE_CONFIG.dailyQuota === 0 ? 1 : snapshot.count / USAGE_CONFIG.dailyQuota

  return {
    ip,
    dailyUsage: snapshot.count,
    dailyQuota: USAGE_CONFIG.dailyQuota,
    remainingQuota,
    percentUsed,
    isWarning: percentUsed >= USAGE_CONFIG.warningThreshold,
    isExceeded: snapshot.count >= USAGE_CONFIG.dailyQuota,
    resetsAt: new Date(snapshot.resetTime),
    totalTokensUsed: snapshot.totalTokens,
  }
}

export async function recordAIUsage(ip: string, tokensUsed: number = 0): Promise<UsageStats> {
  const reserved = await reserveDailyUsage(USAGE_NAMESPACE, ip)

  if (tokensUsed <= 0) {
    return toUsageStats(ip, reserved)
  }

  const withTokens = await recordDailyUsageTokens(USAGE_NAMESPACE, ip, tokensUsed)
  return toUsageStats(ip, withTokens)
}

export async function recordAITokens(ip: string, tokensUsed: number = 0): Promise<UsageStats> {
  if (tokensUsed <= 0) {
    return getUsageStats(ip)
  }

  const snapshot = await recordDailyUsageTokens(USAGE_NAMESPACE, ip, tokensUsed)
  return toUsageStats(ip, snapshot)
}

export async function getUsageStats(ip: string): Promise<UsageStats> {
  const snapshot = await getDailyUsageSnapshot(USAGE_NAMESPACE, ip)
  return toUsageStats(ip, snapshot)
}

export async function isQuotaExceeded(ip: string): Promise<boolean> {
  return (await getUsageStats(ip)).isExceeded
}

export function getUsageWarningMessage(stats: UsageStats): string | null {
  if (stats.isExceeded) {
    const resetTime = stats.resetsAt.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    })
    return `일일 AI 검색 시도(${stats.dailyQuota}회)를 초과했습니다. ${resetTime}에 초기화됩니다.`
  }

  if (stats.isWarning) {
    return `AI 검색 사용량 경고: ${stats.dailyUsage}/${stats.dailyQuota}회 사용 (${Math.round(
      stats.percentUsed * 100
    )}%)`
  }

  return null
}

export async function getUsageHeaders(ip: string): Promise<Record<string, string>> {
  const stats = await getUsageStats(ip)
  return {
    "X-AI-Usage-Daily": String(stats.dailyUsage),
    "X-AI-Usage-Remaining": String(stats.remainingQuota),
    "X-AI-Usage-Reset": String(Math.ceil(stats.resetsAt.getTime() / 1000)),
  }
}

export async function getGlobalUsageSummary() {
  const summary = await getMemoryUsageSummary(USAGE_NAMESPACE)
  return {
    totalIPs: summary.totalIdentifiers,
    totalRequests: summary.totalRequests,
    totalTokens: summary.totalTokens,
  }
}
