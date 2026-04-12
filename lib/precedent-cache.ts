/**
 * IndexedDB를 사용한 판례 캐싱 시스템
 *
 * 캐시 구조:
 * - precedentSearchCache: 검색 결과 캐시 (query 기준)
 * - precedentDetailCache: 판례 전문 캐시 (id 기준)
 */

import type { PrecedentSearchResult, PrecedentDetail } from "./precedent-parser"
import { debugLogger } from "./debug-logger"

const DB_NAME = "LexDiffPrecedentCache"
const DB_VERSION = 1
const SEARCH_STORE = "precedentSearchCache"
const DETAIL_STORE = "precedentDetailCache"
const CACHE_EXPIRY_DAYS = 7
// PERF-1: 무제한 누적 방지
const MAX_SEARCH_ENTRIES = 200
const MAX_DETAIL_ENTRIES = 300

interface SearchCacheEntry {
  key: string // query
  timestamp: number
  totalCount: number
  precedents: PrecedentSearchResult[]
}

interface DetailCacheEntry {
  key: string // id
  timestamp: number
  detail: PrecedentDetail
}

// IndexedDB 초기화 (singleton)
let dbPromise: Promise<IDBDatabase> | null = null

async function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('indexedDB unavailable'))
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = (event) => {
      const error = (event.target as IDBOpenDBRequest).error
      if (error?.name === "VersionError") {
        debugLogger.warning("[precedent-cache] VersionError, deleting and retrying...")
        indexedDB.deleteDatabase(DB_NAME)
      }
      dbPromise = null
      reject(error)
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => { try { db.close() } catch { /* ignore */ }; dbPromise = null }
      resolve(db)
    }
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(SEARCH_STORE)) {
        db.createObjectStore(SEARCH_STORE, { keyPath: "key" })
      }
      if (!db.objectStoreNames.contains(DETAIL_STORE)) {
        db.createObjectStore(DETAIL_STORE, { keyPath: "key" })
      }
    }
  })
  return dbPromise
}

// LRU eviction: timestamp 오름차순으로 오래된 항목 제거
async function evictOldest(db: IDBDatabase, storeName: string, max: number): Promise<void> {
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, "readwrite")
    const store = tx.objectStore(storeName)
    const countReq = store.count()
    countReq.onsuccess = () => {
      const total = countReq.result
      if (total <= max) { resolve(); return }
      const removeCount = total - max
      const entries: Array<{ key: string; ts: number }> = []
      const cursorReq = store.openCursor()
      cursorReq.onsuccess = (ev) => {
        const cursor = (ev.target as IDBRequest).result as IDBCursorWithValue | null
        if (cursor) {
          const v = cursor.value as { key: string; timestamp: number }
          entries.push({ key: v.key, ts: v.timestamp })
          cursor.continue()
        } else {
          entries.sort((a, b) => a.ts - b.ts)
          for (const e of entries.slice(0, removeCount)) store.delete(e.key)
        }
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

// 캐시 만료 확인
function isExpired(timestamp: number): boolean {
  const expiryMs = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  return Date.now() - timestamp > expiryMs
}

// === 검색 결과 캐시 ===

export async function getPrecedentSearchCache(
  query: string
): Promise<{ totalCount: number; precedents: PrecedentSearchResult[] } | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SEARCH_STORE, "readonly")
      const store = tx.objectStore(SEARCH_STORE)
      const request = store.get(query)

      request.onsuccess = () => {
        const entry = request.result as SearchCacheEntry | undefined
        if (entry && !isExpired(entry.timestamp)) {
          resolve({ totalCount: entry.totalCount, precedents: entry.precedents })
        } else {
          resolve(null)
        }
      }

      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    debugLogger.error("[precedent-cache] getSearchCache error:", error)
    return null
  }
}

export async function setPrecedentSearchCache(
  query: string,
  totalCount: number,
  precedents: PrecedentSearchResult[]
): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SEARCH_STORE, "readwrite")
      const store = tx.objectStore(SEARCH_STORE)

      const entry: SearchCacheEntry = {
        key: query,
        timestamp: Date.now(),
        totalCount,
        precedents
      }

      const request = store.put(entry)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
    // PERF-1: 별도 tx로 LRU 정리 (await 후 실행되도록 fix)
    evictOldest(db, SEARCH_STORE, MAX_SEARCH_ENTRIES).catch(() => {})
  } catch (error) {
    debugLogger.error("[precedent-cache] setSearchCache error:", error)
  }
}

// === 판례 전문 캐시 ===

export async function getPrecedentDetailCache(
  id: string
): Promise<PrecedentDetail | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DETAIL_STORE, "readonly")
      const store = tx.objectStore(DETAIL_STORE)
      const request = store.get(id)

      request.onsuccess = () => {
        const entry = request.result as DetailCacheEntry | undefined
        if (entry && !isExpired(entry.timestamp)) {
          resolve(entry.detail)
        } else {
          resolve(null)
        }
      }

      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    debugLogger.error("[precedent-cache] getDetailCache error:", error)
    return null
  }
}

export async function setPrecedentDetailCache(
  id: string,
  detail: PrecedentDetail
): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DETAIL_STORE, "readwrite")
      const store = tx.objectStore(DETAIL_STORE)

      const entry: DetailCacheEntry = {
        key: id,
        timestamp: Date.now(),
        detail
      }

      const request = store.put(entry)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
    evictOldest(db, DETAIL_STORE, MAX_DETAIL_ENTRIES).catch(() => {})
  } catch (error) {
    debugLogger.error("[precedent-cache] setDetailCache error:", error)
  }
}

// === 캐시 정리 ===

export async function clearExpiredPrecedentCache(): Promise<void> {
  try {
    const db = await openDB()

    // 검색 캐시 정리
    const searchTx = db.transaction(SEARCH_STORE, "readwrite")
    const searchStore = searchTx.objectStore(SEARCH_STORE)
    const searchCursor = searchStore.openCursor()

    searchCursor.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result as IDBCursorWithValue
      if (cursor) {
        const entry = cursor.value as SearchCacheEntry
        if (isExpired(entry.timestamp)) {
          cursor.delete()
        }
        cursor.continue()
      }
    }

    // 상세 캐시 정리
    const detailTx = db.transaction(DETAIL_STORE, "readwrite")
    const detailStore = detailTx.objectStore(DETAIL_STORE)
    const detailCursor = detailStore.openCursor()

    detailCursor.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result as IDBCursorWithValue
      if (cursor) {
        const entry = cursor.value as DetailCacheEntry
        if (isExpired(entry.timestamp)) {
          cursor.delete()
        }
        cursor.continue()
      }
    }

    debugLogger.debug("[precedent-cache] Expired cache cleared")
  } catch (error) {
    debugLogger.error("[precedent-cache] clearExpired error:", error)
  }
}

// PERF-1: 모듈 로드 시 자동 만료 정리 (브라우저 환경에서만)
if (typeof window !== 'undefined') {
  // 첫 호출은 idle 시점에 (메인 thread 차단 방지)
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => { clearExpiredPrecedentCache().catch(() => {}) })
  } else {
    setTimeout(() => { clearExpiredPrecedentCache().catch(() => {}) }, 2000)
  }
}
