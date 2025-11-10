/**
 * IndexedDB를 사용한 법령 본문 캐싱 시스템
 *
 * 캐시 구조:
 * - lawContentCache: 법령 전문 캐시 (lawId + 시행일자 기준)
 *
 * 성능 향상:
 * - 첫 검색: law.go.kr API 호출 (~500-2000ms)
 * - 재검색: IndexedDB에서 즉시 로드 (~5ms)
 */

import type { LawMeta, LawArticle } from "./law-types"

const DB_NAME = "LexDiffCache"
const DB_VERSION = 2 // admin-rule-cache와 공유, 버전 증가
const CONTENT_STORE = "lawContentCache"
const CACHE_EXPIRY_DAYS = 7 // 7일 후 자동 삭제 (법령은 자주 변경될 수 있음)

export interface LawContentCacheEntry {
  key: string // "${lawId}_${effectiveDate}"
  timestamp: number
  lawId: string
  lawTitle: string
  effectiveDate: string
  meta: LawMeta
  articles: LawArticle[]
}

// IndexedDB 초기화
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // 법령 본문 캐시 스토어
      if (!db.objectStoreNames.contains(CONTENT_STORE)) {
        const contentStore = db.createObjectStore(CONTENT_STORE, { keyPath: "key" })
        contentStore.createIndex("timestamp", "timestamp", { unique: false })
        contentStore.createIndex("lawId", "lawId", { unique: false })
        contentStore.createIndex("lawTitle", "lawTitle", { unique: false })
        console.log(`✅ Created ${CONTENT_STORE} object store`)
      }
    }
  })
}

// 만료된 캐시 정리
async function cleanExpiredCache(): Promise<void> {
  try {
    const db = await openDB()
    const expiryTime = Date.now() - CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000

    const tx = db.transaction(CONTENT_STORE, "readwrite")
    const store = tx.objectStore(CONTENT_STORE)
    const index = store.index("timestamp")
    const range = IDBKeyRange.upperBound(expiryTime)
    const request = index.openCursor(range)

    let deletedCount = 0
    request.onsuccess = () => {
      const cursor = request.result
      if (cursor) {
        cursor.delete()
        deletedCount++
        cursor.continue()
      } else if (deletedCount > 0) {
        console.log(`🗑️ Cleaned ${deletedCount} expired law content cache entries`)
      }
    }

    await new Promise((resolve) => {
      tx.oncomplete = resolve
    })

    db.close()
  } catch (error) {
    console.error("Failed to clean expired law content cache:", error)
  }
}

// 캐시 저장
export async function setLawContentCache(
  lawId: string,
  effectiveDate: string,
  meta: LawMeta,
  articles: LawArticle[]
): Promise<void> {
  try {
    const db = await openDB()
    const key = `${lawId}_${effectiveDate}`

    const entry: LawContentCacheEntry = {
      key,
      timestamp: Date.now(),
      lawId,
      lawTitle: meta.lawTitle,
      effectiveDate,
      meta,
      articles,
    }

    const tx = db.transaction(CONTENT_STORE, "readwrite")
    const store = tx.objectStore(CONTENT_STORE)
    await store.put(entry)

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })

    db.close()

    console.log(`💾 Cached law content: ${meta.lawTitle} (${articles.length} articles)`)

    // 백그라운드로 만료된 캐시 정리
    cleanExpiredCache().catch(console.error)
  } catch (error) {
    console.error("Failed to cache law content:", error)
  }
}

// 캐시 조회
export async function getLawContentCache(
  lawId: string,
  effectiveDate: string
): Promise<LawContentCacheEntry | null> {
  try {
    const db = await openDB()
    const key = `${lawId}_${effectiveDate}`

    const tx = db.transaction(CONTENT_STORE, "readonly")
    const store = tx.objectStore(CONTENT_STORE)
    const request = store.get(key)

    const entry = await new Promise<LawContentCacheEntry | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    db.close()

    if (!entry) {
      return null
    }

    // 만료 체크
    const expiryTime = Date.now() - CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    if (entry.timestamp < expiryTime) {
      console.log(`⏰ Cache expired for ${entry.lawTitle}`)
      // 만료된 캐시는 비동기로 삭제
      clearLawContentCache(lawId, effectiveDate).catch(console.error)
      return null
    }

    console.log(`💾 Cache HIT: ${entry.lawTitle} (${entry.articles.length} articles)`)
    return entry
  } catch (error) {
    console.error("Failed to get law content cache:", error)
    return null
  }
}

// 캐시 삭제 (특정 법령)
export async function clearLawContentCache(
  lawId: string,
  effectiveDate: string
): Promise<void> {
  try {
    const db = await openDB()
    const key = `${lawId}_${effectiveDate}`

    const tx = db.transaction(CONTENT_STORE, "readwrite")
    const store = tx.objectStore(CONTENT_STORE)
    await store.delete(key)

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })

    db.close()
  } catch (error) {
    console.error("Failed to clear law content cache:", error)
  }
}

// 모든 캐시 삭제
export async function clearAllLawContentCache(): Promise<void> {
  try {
    const db = await openDB()

    const tx = db.transaction(CONTENT_STORE, "readwrite")
    const store = tx.objectStore(CONTENT_STORE)
    await store.clear()

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })

    db.close()

    console.log("🗑️ Cleared all law content cache")
  } catch (error) {
    console.error("Failed to clear all law content cache:", error)
  }
}

// 캐시 통계
export async function getLawContentCacheStats(): Promise<{
  totalEntries: number
  totalSize: number
  oldestEntry: number | null
  newestEntry: number | null
}> {
  try {
    const db = await openDB()

    const tx = db.transaction(CONTENT_STORE, "readonly")
    const store = tx.objectStore(CONTENT_STORE)
    const countRequest = store.count()
    const allRequest = store.getAll()

    const totalEntries = await new Promise<number>((resolve, reject) => {
      countRequest.onsuccess = () => resolve(countRequest.result)
      countRequest.onerror = () => reject(countRequest.error)
    })

    const entries = await new Promise<LawContentCacheEntry[]>((resolve, reject) => {
      allRequest.onsuccess = () => resolve(allRequest.result)
      allRequest.onerror = () => reject(allRequest.error)
    })

    db.close()

    const timestamps = entries.map((e) => e.timestamp)
    const totalSize = entries.reduce((sum, e) => {
      const size = JSON.stringify({ meta: e.meta, articles: e.articles }).length
      return sum + size
    }, 0)

    return {
      totalEntries,
      totalSize,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : null,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : null,
    }
  } catch (error) {
    console.error("Failed to get cache stats:", error)
    return {
      totalEntries: 0,
      totalSize: 0,
      oldestEntry: null,
      newestEntry: null,
    }
  }
}
