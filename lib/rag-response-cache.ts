/**
 * RAG 응답 캐시 시스템 (IndexedDB)
 *
 * Phase 3 P3: 동일한 질문에 대한 응답을 캐싱하여
 * API 비용 절감 및 응답 속도 향상
 *
 * 캐시 구조:
 * - ragResponseCache: RAG 응답 캐시 (쿼리 해시 기준)
 *
 * 성능 향상:
 * - 첫 검색: Gemini API 호출 (~2-5초)
 * - 재검색: IndexedDB에서 즉시 로드 (~50ms)
 * - 예상 캐시 히트율: 20-30%
 */

const DB_NAME = 'LexDiffRAGCache'
const DB_VERSION = 1
const CACHE_STORE = 'ragResponseCache'
const CACHE_TTL = 24 * 60 * 60 * 1000  // 24시간 (법령 정확성 우선)
const MAX_ENTRIES = 500  // 최대 캐시 항목 수

export interface RAGCacheEntry {
  key: string  // 쿼리 해시
  query: string  // 원본 쿼리
  response: string  // AI 응답
  citations: any[]  // Citation 목록
  confidenceLevel: string  // 신뢰도
  queryType?: string  // 쿼리 타입 (specific/general/comparison/procedural)
  timestamp: number  // 생성 시간
  hitCount: number  // 캐시 히트 횟수
}

// IndexedDB 초기화
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // 기존 스토어 삭제 (버전 업그레이드 시)
      if (db.objectStoreNames.contains(CACHE_STORE)) {
        db.deleteObjectStore(CACHE_STORE)
      }

      // RAG 응답 캐시 스토어 생성
      const store = db.createObjectStore(CACHE_STORE, { keyPath: 'key' })
      store.createIndex('timestamp', 'timestamp', { unique: false })
      store.createIndex('hitCount', 'hitCount', { unique: false })
    }
  })
}

/**
 * 쿼리 해시 생성 (정규화 후)
 */
function hashQuery(query: string): string {
  // 쿼리 정규화 (대소문자, 공백)
  return query
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 만료된 캐시 정리
 */
async function cleanExpiredCache(): Promise<void> {
  try {
    const db = await openDB()
    const expiryTime = Date.now() - CACHE_TTL

    const tx = db.transaction(CACHE_STORE, 'readwrite')
    const store = tx.objectStore(CACHE_STORE)
    const index = store.index('timestamp')
    const range = IDBKeyRange.upperBound(expiryTime)

    let deletedCount = 0

    return new Promise((resolve, reject) => {
      const request = index.openCursor(range)

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          cursor.delete()
          deletedCount++
          cursor.continue()
        } else {
          resolve()
        }
      }

      request.onerror = () => reject(request.error)
    })
  } catch {
    // Failed to clean expired cache - silently ignore
  }
}

/**
 * 오래된 항목 정리 (MAX_ENTRIES 초과 시)
 */
async function cleanOldestEntries(db: IDBDatabase, targetCount: number): Promise<void> {
  const tx = db.transaction(CACHE_STORE, 'readwrite')
  const store = tx.objectStore(CACHE_STORE)
  const index = store.index('timestamp')

  const entries: RAGCacheEntry[] = []

  return new Promise((resolve, reject) => {
    const request = index.openCursor()

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result
      if (cursor) {
        entries.push(cursor.value)
        cursor.continue()
      } else {
        // 오래된 항목부터 삭제
        entries.sort((a, b) => a.timestamp - b.timestamp)
        const toDelete = entries.slice(0, targetCount)

        const deleteTx = db.transaction(CACHE_STORE, 'readwrite')
        const deleteStore = deleteTx.objectStore(CACHE_STORE)

        toDelete.forEach((entry) => {
          deleteStore.delete(entry.key)
        })

        deleteTx.oncomplete = () => {
          resolve()
        }
        deleteTx.onerror = () => reject(deleteTx.error)
      }
    }

    request.onerror = () => reject(request.error)
  })
}

/**
 * 캐시에서 응답 조회
 */
export async function getCachedResponse(query: string): Promise<{
  response: string
  citations: any[]
  confidenceLevel: string
  queryType?: string
} | null> {
  try {
    const db = await openDB()
    const key = hashQuery(query)

    const tx = db.transaction(CACHE_STORE, 'readonly')
    const store = tx.objectStore(CACHE_STORE)

    return new Promise((resolve, reject) => {
      const request = store.get(key)

      request.onsuccess = () => {
        const cached = request.result as RAGCacheEntry | undefined

        if (!cached) {
          resolve(null)
          return
        }

        // TTL 체크
        if (Date.now() - cached.timestamp > CACHE_TTL) {
          const deleteTx = db.transaction(CACHE_STORE, 'readwrite')
          deleteTx.objectStore(CACHE_STORE).delete(key)
          resolve(null)
          return
        }

        // 히트 카운트 증가
        const updateTx = db.transaction(CACHE_STORE, 'readwrite')
        const updateStore = updateTx.objectStore(CACHE_STORE)
        cached.hitCount++
        updateStore.put(cached)

        resolve({
          response: cached.response,
          citations: cached.citations,
          confidenceLevel: cached.confidenceLevel,
          queryType: cached.queryType
        })
      }

      request.onerror = () => reject(request.error)
    })
  } catch {
    return null
  }
}

/**
 * 캐시에 응답 저장
 */
export async function cacheResponse(
  query: string,
  response: string,
  citations: any[],
  confidenceLevel: string,
  queryType?: string
): Promise<void> {
  try {
    const db = await openDB()
    const key = hashQuery(query)

    // 캐시 항목 생성
    const entry: RAGCacheEntry = {
      key,
      query,
      response,
      citations,
      confidenceLevel,
      queryType,
      timestamp: Date.now(),
      hitCount: 0
    }

    const tx = db.transaction(CACHE_STORE, 'readwrite')
    const store = tx.objectStore(CACHE_STORE)

    await new Promise<void>((resolve, reject) => {
      const request = store.put(entry)

      request.onsuccess = () => {
        resolve()
      }

      request.onerror = () => reject(request.error)
    })

    // 만료된 캐시 정리
    await cleanExpiredCache()

    // 최대 항목 수 초과 시 오래된 항목 삭제
    const count = await getCount(db)
    if (count > MAX_ENTRIES) {
      await cleanOldestEntries(db, count - MAX_ENTRIES)
    }
  } catch {
    // Failed to write cache - silently ignore
  }
}

export async function updateCachedResponseCitations(
  query: string,
  citations: any[]
): Promise<void> {
  try {
    const db = await openDB()
    const key = hashQuery(query)

    const tx = db.transaction(CACHE_STORE, 'readwrite')
    const store = tx.objectStore(CACHE_STORE)

    const cached = await new Promise<RAGCacheEntry | undefined>((resolve, reject) => {
      const request = store.get(key)
      request.onsuccess = () => resolve(request.result as RAGCacheEntry | undefined)
      request.onerror = () => reject(request.error)
    })

    if (!cached) {
      return
    }

    cached.citations = citations

    await new Promise<void>((resolve, reject) => {
      const request = store.put(cached)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch {
    // Failed to update cached citations - silently ignore
  }
}

/**
 * 캐시 항목 수 조회
 */
async function getCount(db: IDBDatabase): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, 'readonly')
    const store = tx.objectStore(CACHE_STORE)
    const request = store.count()

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * 캐시 통계 조회
 */
export async function getCacheStats(): Promise<{
  totalEntries: number
  totalHits: number
  oldestEntry: number | null
  newestEntry: number | null
  avgAge: number
}> {
  try {
    const db = await openDB()
    const tx = db.transaction(CACHE_STORE, 'readonly')
    const store = tx.objectStore(CACHE_STORE)

    const entries: RAGCacheEntry[] = []

    await new Promise<void>((resolve, reject) => {
      const request = store.openCursor()

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          entries.push(cursor.value)
          cursor.continue()
        } else {
          resolve()
        }
      }

      request.onerror = () => reject(request.error)
    })

    const totalHits = entries.reduce((sum, e) => sum + e.hitCount, 0)
    const timestamps = entries.map(e => e.timestamp)
    const now = Date.now()

    return {
      totalEntries: entries.length,
      totalHits,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : null,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : null,
      avgAge: timestamps.length > 0
        ? timestamps.reduce((sum, t) => sum + (now - t), 0) / timestamps.length / 1000 / 60  // minutes
        : 0
    }
  } catch {
    return {
      totalEntries: 0,
      totalHits: 0,
      oldestEntry: null,
      newestEntry: null,
      avgAge: 0
    }
  }
}

/**
 * 캐시 전체 삭제
 */
export async function clearCache(): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(CACHE_STORE, 'readwrite')
    const store = tx.objectStore(CACHE_STORE)

    await new Promise<void>((resolve, reject) => {
      const request = store.clear()

      request.onsuccess = () => {
        resolve()
      }

      request.onerror = () => reject(request.error)
    })
  } catch {
    // Failed to clear cache - silently ignore
  }
}
