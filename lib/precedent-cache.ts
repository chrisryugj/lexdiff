/**
 * IndexedDB를 사용한 판례 캐싱 시스템
 *
 * 캐시 구조:
 * - precedentSearchCache: 검색 결과 캐시 (query 기준)
 * - precedentDetailCache: 판례 전문 캐시 (id 기준)
 */

import type { PrecedentSearchResult, PrecedentDetail } from "./precedent-parser"

const DB_NAME = "LexDiffPrecedentCache"
const DB_VERSION = 1
const SEARCH_STORE = "precedentSearchCache"
const DETAIL_STORE = "precedentDetailCache"
const CACHE_EXPIRY_DAYS = 7

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

// IndexedDB 초기화
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = (event) => {
      const error = (event.target as IDBOpenDBRequest).error
      if (error?.name === "VersionError") {
        console.warn("[precedent-cache] VersionError, deleting and retrying...")
        indexedDB.deleteDatabase(DB_NAME)
      }
      reject(error)
    }

    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // 검색 결과 캐시 스토어
      if (!db.objectStoreNames.contains(SEARCH_STORE)) {
        db.createObjectStore(SEARCH_STORE, { keyPath: "key" })
      }

      // 판례 전문 캐시 스토어
      if (!db.objectStoreNames.contains(DETAIL_STORE)) {
        db.createObjectStore(DETAIL_STORE, { keyPath: "key" })
      }
    }
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
    console.error("[precedent-cache] getSearchCache error:", error)
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
    return new Promise((resolve, reject) => {
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
  } catch (error) {
    console.error("[precedent-cache] setSearchCache error:", error)
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
    console.error("[precedent-cache] getDetailCache error:", error)
    return null
  }
}

export async function setPrecedentDetailCache(
  id: string,
  detail: PrecedentDetail
): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
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
  } catch (error) {
    console.error("[precedent-cache] setDetailCache error:", error)
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

    console.log("[precedent-cache] Expired cache cleared")
  } catch (error) {
    console.error("[precedent-cache] clearExpired error:", error)
  }
}
