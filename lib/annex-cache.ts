/**
 * 별표(附表) 캐싱 시스템
 * IndexedDB를 사용하여 별표 마크다운 변환 결과를 캐싱
 *
 * 별도의 DB를 사용하여 기존 LexDiffCache와 독립적으로 운영
 */

import type { AnnexCacheEntry } from "./law-types"
import { debugLogger } from "./debug-logger"

const DB_NAME = "LexDiffAnnexCache"
const DB_VERSION = 2  // v2: kordoc 파서 통합 후 캐시 무효화 (2026-04-02)
const ANNEX_STORE = "annexMarkdownCache"
const CACHE_EXPIRY_DAYS = 30 // 별표는 변경 빈도가 낮으므로 30일
// PERF-2: 무제한 누적 방지 (별표는 PDF/HWP 마크다운 — 수십 KB×무제한 폭증 우려)
const MAX_ANNEX_ENTRIES = 200

// IndexedDB 초기화
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // 버전 업그레이드 시 기존 캐시 삭제 (파서 개선 반영)
      if (db.objectStoreNames.contains(ANNEX_STORE)) {
        db.deleteObjectStore(ANNEX_STORE)
      }

      const store = db.createObjectStore(ANNEX_STORE, { keyPath: "key" })
      store.createIndex("timestamp", "timestamp", { unique: false })
      store.createIndex("lawName", "lawName", { unique: false })
    }
  })
}

/**
 * 별표 캐시 키 생성
 */
export function getAnnexCacheKey(lawId: string, annexNumber: string): string {
  // annexNumber에서 숫자만 추출 (예: "[별표 2의3]" → "2의3")
  const normalized = annexNumber.replace(/[\[\]별표\s]/g, "")
  return `${lawId}_${normalized}`
}

/**
 * 별표 마크다운 캐시 조회
 */
export async function getAnnexCache(
  lawId: string,
  annexNumber: string
): Promise<AnnexCacheEntry | null> {
  try {
    const db = await openDB()

    if (!db.objectStoreNames.contains(ANNEX_STORE)) {
      db.close()
      return null
    }

    const key = getAnnexCacheKey(lawId, annexNumber)
    const tx = db.transaction(ANNEX_STORE, "readonly")
    const store = tx.objectStore(ANNEX_STORE)
    const request = store.get(key)

    const entry = await new Promise<AnnexCacheEntry | undefined>((resolve, reject) => {
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
      clearAnnexCache(lawId, annexNumber).catch((e) => debugLogger.warning("[annex-cache] clearAnnex", e))
      return null
    }

    return entry
  } catch (error) {
    debugLogger.error("❌ 별표 캐시 조회 실패:", error)
    return null
  }
}

/**
 * 별표 마크다운 캐시 저장
 */
export async function setAnnexCache(
  lawId: string,
  annexNumber: string,
  markdown: string,
  pdfFlSeq: string,
  lawName: string,
  annexName?: string
): Promise<void> {
  try {
    const db = await openDB()

    if (!db.objectStoreNames.contains(ANNEX_STORE)) {
      db.close()
      return
    }

    const key = getAnnexCacheKey(lawId, annexNumber)

    const entry: AnnexCacheEntry = {
      key,
      timestamp: Date.now(),
      lawName,
      annexNumber,
      markdown,
      pdfFlSeq,
      annexName,
    }

    const tx = db.transaction(ANNEX_STORE, "readwrite")
    const store = tx.objectStore(ANNEX_STORE)
    const putRequest = store.put(entry)

    await new Promise<void>((resolve, reject) => {
      putRequest.onsuccess = () => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }
      putRequest.onerror = () => reject(putRequest.error)
    })

    db.close()

    // 백그라운드로 만료된 캐시 정리 + LRU eviction
    cleanExpiredAnnexCache().catch((e) => debugLogger.warning("[annex-cache] cleanExpired error", e))
    evictOldestAnnexEntries().catch((e) => debugLogger.warning("[annex-cache] evict error", e))
  } catch (error) {
    debugLogger.error("❌ 별표 캐시 저장 실패:", error)
  }
}

// PERF-2: MAX_ANNEX_ENTRIES 초과 시 오래된 항목 제거
async function evictOldestAnnexEntries(): Promise<void> {
  try {
    const db = await openDB()
    if (!db.objectStoreNames.contains(ANNEX_STORE)) { db.close(); return }
    const tx = db.transaction(ANNEX_STORE, "readwrite")
    const store = tx.objectStore(ANNEX_STORE)
    const countReq = store.count()
    countReq.onsuccess = () => {
      const total = countReq.result
      if (total <= MAX_ANNEX_ENTRIES) return
      const removeCount = total - MAX_ANNEX_ENTRIES
      const index = store.index("timestamp")
      const cursorReq = index.openCursor()
      let removed = 0
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (cursor && removed < removeCount) {
          cursor.delete()
          removed++
          cursor.continue()
        }
      }
    }
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); tx.onerror = () => resolve() })
    db.close()
  } catch (error) {
    debugLogger.warning("[annex-cache] evictOldest error", error)
  }
}

/**
 * 특정 별표 캐시 삭제
 */
export async function clearAnnexCache(
  lawId: string,
  annexNumber: string
): Promise<void> {
  try {
    const db = await openDB()

    if (!db.objectStoreNames.contains(ANNEX_STORE)) {
      db.close()
      return
    }

    const key = getAnnexCacheKey(lawId, annexNumber)
    const tx = db.transaction(ANNEX_STORE, "readwrite")
    const store = tx.objectStore(ANNEX_STORE)
    store.delete(key)

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    db.close()
  } catch (error) {
    debugLogger.error("❌ 별표 캐시 삭제 실패:", error)
  }
}

/**
 * 만료된 별표 캐시 정리
 */
async function cleanExpiredAnnexCache(): Promise<void> {
  try {
    const db = await openDB()

    if (!db.objectStoreNames.contains(ANNEX_STORE)) {
      db.close()
      return
    }

    const expiryTime = Date.now() - CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    const tx = db.transaction(ANNEX_STORE, "readwrite")
    const store = tx.objectStore(ANNEX_STORE)
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
      }
    }

    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve()
    })

    db.close()
  } catch (error) {
    debugLogger.error("❌ 만료된 별표 캐시 정리 실패:", error)
  }
}

/**
 * 모든 별표 캐시 삭제
 */
export async function clearAllAnnexCache(): Promise<void> {
  try {
    const db = await openDB()

    if (!db.objectStoreNames.contains(ANNEX_STORE)) {
      db.close()
      return
    }

    const tx = db.transaction(ANNEX_STORE, "readwrite")
    const store = tx.objectStore(ANNEX_STORE)
    store.clear()

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    db.close()
  } catch (error) {
    debugLogger.error("❌ 별표 캐시 전체 삭제 실패:", error)
  }
}
