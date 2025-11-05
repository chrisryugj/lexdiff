/**
 * API 응답 브라우저 캐시 시스템
 * localStorage를 사용하여 API 호출 결과를 캐싱
 */

interface CacheEntry<T> {
  data: T
  timestamp: number
  expiresAt: number
}

const DEFAULT_TTL = 1000 * 60 * 60 // 1시간

/**
 * 캐시 키 생성
 */
function getCacheKey(url: string): string {
  return `api_cache_${url}`
}

/**
 * 캐시에서 데이터 가져오기
 */
export function getCachedData<T>(url: string): T | null {
  if (typeof window === "undefined") return null

  try {
    const key = getCacheKey(url)
    const cached = localStorage.getItem(key)

    if (!cached) return null

    const entry: CacheEntry<T> = JSON.parse(cached)

    // 만료 확인
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(key)
      return null
    }

    return entry.data
  } catch (error) {
    console.error("[api-cache] Error reading cache:", error)
    return null
  }
}

/**
 * 캐시에 데이터 저장
 */
export function setCachedData<T>(url: string, data: T, ttl: number = DEFAULT_TTL): void {
  if (typeof window === "undefined") return

  try {
    const key = getCacheKey(url)
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl,
    }

    localStorage.setItem(key, JSON.stringify(entry))
  } catch (error) {
    console.error("[api-cache] Error writing cache:", error)
    // localStorage가 가득 찬 경우 오래된 캐시 정리
    if (error instanceof Error && error.name === "QuotaExceededError") {
      clearOldCache()
      // 재시도
      try {
        const key = getCacheKey(url)
        const entry: CacheEntry<T> = {
          data,
          timestamp: Date.now(),
          expiresAt: Date.now() + ttl,
        }
        localStorage.setItem(key, JSON.stringify(entry))
      } catch (retryError) {
        console.error("[api-cache] Error writing cache after cleanup:", retryError)
      }
    }
  }
}

/**
 * 캐시된 fetch (자동 캐싱)
 */
export async function cachedFetch(url: string, options?: RequestInit): Promise<Response> {
  // GET 요청만 캐싱
  if (options?.method && options.method !== "GET") {
    return fetch(url, options)
  }

  // 캐시 확인
  const cached = getCachedData<{ text: string; status: number; headers: Record<string, string> }>(url)

  if (cached) {
    // 캐시된 응답 반환
    return new Response(cached.text, {
      status: cached.status,
      headers: cached.headers,
    })
  }

  // 캐시 미스 - 실제 fetch
  const response = await fetch(url, options)

  // 성공한 응답만 캐싱
  if (response.ok) {
    const text = await response.text()
    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      headers[key] = value
    })

    setCachedData(url, { text, status: response.status, headers })

    // 복제된 응답 반환 (이미 읽은 body를 재사용)
    return new Response(text, {
      status: response.status,
      headers: response.headers,
    })
  }

  return response
}

/**
 * 오래된 캐시 정리
 */
function clearOldCache(): void {
  if (typeof window === "undefined") return

  const keys = Object.keys(localStorage)
  const cacheKeys = keys.filter((k) => k.startsWith("api_cache_"))

  // 타임스탬프 기준 정렬
  const entries = cacheKeys
    .map((key) => {
      try {
        const data = localStorage.getItem(key)
        if (!data) return null
        const entry = JSON.parse(data)
        return { key, timestamp: entry.timestamp }
      } catch {
        return null
      }
    })
    .filter((e) => e !== null) as { key: string; timestamp: number }[]

  entries.sort((a, b) => a.timestamp - b.timestamp)

  // 가장 오래된 50% 삭제
  const toRemove = entries.slice(0, Math.ceil(entries.length / 2))
  toRemove.forEach((entry) => {
    localStorage.removeItem(entry.key)
  })

  console.log(`[api-cache] Cleared ${toRemove.length} old cache entries`)
}

/**
 * 특정 URL 캐시 삭제
 */
export function clearCache(url: string): void {
  if (typeof window === "undefined") return
  const key = getCacheKey(url)
  localStorage.removeItem(key)
}

/**
 * 모든 API 캐시 삭제
 */
export function clearAllCache(): void {
  if (typeof window === "undefined") return

  const keys = Object.keys(localStorage)
  const cacheKeys = keys.filter((k) => k.startsWith("api_cache_"))

  cacheKeys.forEach((key) => {
    localStorage.removeItem(key)
  })

  console.log(`[api-cache] Cleared all ${cacheKeys.length} cache entries`)
}
