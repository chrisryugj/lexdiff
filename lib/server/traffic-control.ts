type RedisAtom = string | number
type RedisCommand = [string, ...RedisAtom[]]

interface WindowCounterSnapshot {
  count: number
  resetTime: number
}

interface UsageCounterSnapshot {
  count: number
  totalTokens: number
  resetTime: number
}

interface RedisPipelineResult<T = unknown> {
  result?: T
  error?: string
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const memoryWindowCounters = new Map<string, WindowCounterSnapshot>()
const memoryUsageCounters = new Map<string, UsageCounterSnapshot>()

function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "")
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    return null
  }

  return { url, token }
}

async function runRedisPipeline(commands: RedisCommand[]): Promise<RedisPipelineResult[]> {
  const config = getRedisConfig()
  if (!config) {
    throw new Error("Distributed store is not configured")
  }

  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Upstash pipeline failed: ${response.status}`)
  }

  const results = (await response.json()) as RedisPipelineResult[]
  const failed = results.find((item) => item?.error)
  if (failed?.error) {
    throw new Error(failed.error)
  }

  return results
}

function getKstDayWindow(now = Date.now()) {
  const shifted = new Date(now + KST_OFFSET_MS)
  const year = shifted.getUTCFullYear()
  const month = shifted.getUTCMonth()
  const date = shifted.getUTCDate()

  return {
    bucket: `${year}-${String(month + 1).padStart(2, "0")}-${String(date).padStart(2, "0")}`,
    resetTime: Date.UTC(year, month, date + 1) - KST_OFFSET_MS,
  }
}

function cleanupWindowCounters(now = Date.now()) {
  for (const [key, value] of memoryWindowCounters.entries()) {
    if (value.resetTime <= now) {
      memoryWindowCounters.delete(key)
    }
  }
}

function cleanupUsageCounters(now = Date.now()) {
  for (const [key, value] of memoryUsageCounters.entries()) {
    if (value.resetTime <= now) {
      memoryUsageCounters.delete(key)
    }
  }
}

export async function checkDistributedRateLimit(options: {
  namespace: string
  identifier: string
  limit: number
  windowMs: number
}) {
  const now = Date.now()
  const bucket = Math.floor(now / options.windowMs)
  const resetTime = (bucket + 1) * options.windowMs
  const ttlMs = Math.max(resetTime - now, 1000)
  const key = `${options.namespace}:${options.identifier}:${bucket}`

  try {
    if (getRedisConfig()) {
      const [incrementResult] = await runRedisPipeline([
        ["INCR", key],
        ["PEXPIRE", key, ttlMs],
      ])

      const count = Number(incrementResult?.result ?? 0)
      return {
        allowed: count <= options.limit,
        count,
        remaining: Math.max(options.limit - count, 0),
        resetTime,
      }
    }
  } catch {
    // Fall back to the in-memory store when the shared backend is unavailable.
  }

  const existing = memoryWindowCounters.get(key)
  const nextCount = existing && existing.resetTime > now ? existing.count + 1 : 1
  memoryWindowCounters.set(key, { count: nextCount, resetTime })

  if (Math.random() < 0.01) {
    cleanupWindowCounters(now)
  }

  return {
    allowed: nextCount <= options.limit,
    count: nextCount,
    remaining: Math.max(options.limit - nextCount, 0),
    resetTime,
  }
}

export async function reserveDailyUsage(namespace: string, identifier: string): Promise<UsageCounterSnapshot> {
  const now = Date.now()
  const { bucket, resetTime } = getKstDayWindow(now)
  const ttlSeconds = Math.max(Math.ceil((resetTime - now) / 1000), 1)
  const countKey = `${namespace}:${identifier}:${bucket}:count`
  const tokensKey = `${namespace}:${identifier}:${bucket}:tokens`

  try {
    if (getRedisConfig()) {
      const [countResult, , tokensResult] = await runRedisPipeline([
        ["INCRBY", countKey, 1],
        ["EXPIRE", countKey, ttlSeconds],
        ["GET", tokensKey],
        ["EXPIRE", tokensKey, ttlSeconds],
      ])

      return {
        count: Number(countResult?.result ?? 0),
        totalTokens: Number(tokensResult?.result ?? 0),
        resetTime,
      }
    }
  } catch {
    // Fall back to the in-memory store when the shared backend is unavailable.
  }

  const key = `${namespace}:${identifier}:${bucket}`
  const current = memoryUsageCounters.get(key)
  const next: UsageCounterSnapshot =
    current && current.resetTime > now
      ? {
          count: current.count + 1,
          totalTokens: current.totalTokens,
          resetTime: current.resetTime,
        }
      : {
          count: 1,
          totalTokens: 0,
          resetTime,
        }

  memoryUsageCounters.set(key, next)

  if (Math.random() < 0.01) {
    cleanupUsageCounters(now)
  }

  return next
}

export async function recordDailyUsageTokens(
  namespace: string,
  identifier: string,
  tokensUsed: number
): Promise<UsageCounterSnapshot> {
  const now = Date.now()
  const { bucket, resetTime } = getKstDayWindow(now)
  const ttlSeconds = Math.max(Math.ceil((resetTime - now) / 1000), 1)
  const countKey = `${namespace}:${identifier}:${bucket}:count`
  const tokensKey = `${namespace}:${identifier}:${bucket}:tokens`

  try {
    if (getRedisConfig()) {
      const [countResult, tokensResult] = await runRedisPipeline([
        ["GET", countKey],
        ["INCRBY", tokensKey, tokensUsed],
        ["EXPIRE", countKey, ttlSeconds],
        ["EXPIRE", tokensKey, ttlSeconds],
      ])

      return {
        count: Number(countResult?.result ?? 0),
        totalTokens: Number(tokensResult?.result ?? 0),
        resetTime,
      }
    }
  } catch {
    // Fall back to the in-memory store when the shared backend is unavailable.
  }

  const key = `${namespace}:${identifier}:${bucket}`
  const current = memoryUsageCounters.get(key)
  const next: UsageCounterSnapshot =
    current && current.resetTime > now
      ? {
          count: current.count,
          totalTokens: current.totalTokens + tokensUsed,
          resetTime: current.resetTime,
        }
      : {
          count: 0,
          totalTokens: tokensUsed,
          resetTime,
        }

  memoryUsageCounters.set(key, next)

  if (Math.random() < 0.01) {
    cleanupUsageCounters(now)
  }

  return next
}

export async function getDailyUsageSnapshot(namespace: string, identifier: string): Promise<UsageCounterSnapshot> {
  const now = Date.now()
  const { bucket, resetTime } = getKstDayWindow(now)
  const countKey = `${namespace}:${identifier}:${bucket}:count`
  const tokensKey = `${namespace}:${identifier}:${bucket}:tokens`

  try {
    if (getRedisConfig()) {
      const [countResult, tokensResult] = await runRedisPipeline([
        ["GET", countKey],
        ["GET", tokensKey],
      ])

      return {
        count: Number(countResult?.result ?? 0),
        totalTokens: Number(tokensResult?.result ?? 0),
        resetTime,
      }
    }
  } catch {
    // Fall back to the in-memory store when the shared backend is unavailable.
  }

  const key = `${namespace}:${identifier}:${bucket}`
  const current = memoryUsageCounters.get(key)
  if (current && current.resetTime > now) {
    return current
  }

  return {
    count: 0,
    totalTokens: 0,
    resetTime,
  }
}

export async function getMemoryUsageSummary(namespace: string) {
  if (getRedisConfig()) {
    return {
      totalIdentifiers: 0,
      totalRequests: 0,
      totalTokens: 0,
    }
  }

  const now = Date.now()
  cleanupUsageCounters(now)

  let totalRequests = 0
  let totalTokens = 0
  const identifiers = new Set<string>()

  for (const [key, value] of memoryUsageCounters.entries()) {
    if (!key.startsWith(`${namespace}:`)) continue

    totalRequests += value.count
    totalTokens += value.totalTokens

    const [, identifier] = key.split(":")
    if (identifier) {
      identifiers.add(identifier)
    }
  }

  return {
    totalIdentifiers: identifiers.size,
    totalRequests,
    totalTokens,
  }
}
