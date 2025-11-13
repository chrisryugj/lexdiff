/**
 * IndexedDB를 사용한 행정규칙 캐싱 시스템
 *
 * 캐시 구조:
 * - adminRulesListCache: 행정규칙 목록 캐시 (법령명 + 조문번호 기준)
 * - adminRulesContentCache: 행정규칙 전체 내용 캐시 (규칙ID + 시행일자 기준)
 */

import type { AdminRuleMatch } from "./use-admin-rules"

const DB_NAME = "LexDiffCache"
const DB_VERSION = 3
const LIST_STORE = "adminRulesListCache"
const CONTENT_STORE = "adminRulesContentCache"
const CACHE_EXPIRY_DAYS = 30 // 30일 후 자동 삭제

interface ListCacheEntry {
  key: string // "${lawName}_${articleNumber}"
  timestamp: number
  rules: AdminRuleMatch[]
  hierarchyVersion: string // 체계도 MST 또는 날짜
}

interface ContentCacheEntry {
  key: string // "${ruleId}"
  timestamp: number
  title: string
  html: string
  effectiveDate?: string // 시행일자
}

// IndexedDB 초기화
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // 행정규칙 목록 캐시 스토어
      if (!db.objectStoreNames.contains(LIST_STORE)) {
        const listStore = db.createObjectStore(LIST_STORE, { keyPath: "key" })
        listStore.createIndex("timestamp", "timestamp", { unique: false })
      }

      // 행정규칙 내용 캐시 스토어
      if (!db.objectStoreNames.contains(CONTENT_STORE)) {
        const contentStore = db.createObjectStore(CONTENT_STORE, { keyPath: "key" })
        contentStore.createIndex("timestamp", "timestamp", { unique: false })
      }
    }
  })
}

// 만료된 캐시 정리
async function cleanExpiredCache(): Promise<void> {
  try {
    const db = await openDB()
    const expiryTime = Date.now() - CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000

    // 목록 캐시 정리
    const listTx = db.transaction(LIST_STORE, "readwrite")
    const listStore = listTx.objectStore(LIST_STORE)
    const listIndex = listStore.index("timestamp")
    const listRange = IDBKeyRange.upperBound(expiryTime)
    const listRequest = listIndex.openCursor(listRange)

    listRequest.onsuccess = () => {
      const cursor = listRequest.result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      }
    }

    // 내용 캐시 정리
    const contentTx = db.transaction(CONTENT_STORE, "readwrite")
    const contentStore = contentTx.objectStore(CONTENT_STORE)
    const contentIndex = contentStore.index("timestamp")
    const contentRange = IDBKeyRange.upperBound(expiryTime)
    const contentRequest = contentIndex.openCursor(contentRange)

    contentRequest.onsuccess = () => {
      const cursor = contentRequest.result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      }
    }

    db.close()
  } catch (error) {
    console.warn("[admin-rule-cache] Failed to clean expired cache:", error)
  }
}

// 행정규칙 목록 캐시 조회
export async function getAdminRulesListCache(
  lawName: string,
  articleNumber: string
): Promise<AdminRuleMatch[] | null> {
  try {
    const db = await openDB()
    const key = `${lawName}_${articleNumber}`

    return new Promise((resolve, reject) => {
      const tx = db.transaction(LIST_STORE, "readonly")
      const store = tx.objectStore(LIST_STORE)
      const request = store.get(key)

      request.onsuccess = () => {
        const entry = request.result as ListCacheEntry | undefined
        db.close()

        if (entry) {
          console.log("[admin-rule-cache] List cache HIT:", key)
          resolve(entry.rules)
        } else {
          console.log("[admin-rule-cache] List cache MISS:", key)
          resolve(null)
        }
      }

      request.onerror = () => {
        db.close()
        reject(request.error)
      }
    })
  } catch (error) {
    console.error("[admin-rule-cache] Error reading list cache:", error)
    return null
  }
}

// 행정규칙 목록 캐시 저장
export async function setAdminRulesListCache(
  lawName: string,
  articleNumber: string,
  rules: AdminRuleMatch[],
  hierarchyVersion: string = ""
): Promise<void> {
  try {
    const db = await openDB()
    const key = `${lawName}_${articleNumber}`

    const entry: ListCacheEntry = {
      key,
      timestamp: Date.now(),
      rules,
      hierarchyVersion,
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(LIST_STORE, "readwrite")
      const store = tx.objectStore(LIST_STORE)
      const request = store.put(entry)

      request.onsuccess = () => {
        db.close()
        console.log("[admin-rule-cache] List cache saved:", key, rules.length, "rules")
        resolve()
      }

      request.onerror = () => {
        db.close()
        reject(request.error)
      }
    })
  } catch (error) {
    console.error("[admin-rule-cache] Error saving list cache:", error)
  }
}

// 행정규칙 내용 캐시 조회
export async function getAdminRuleContentCache(
  ruleId: string
): Promise<{ title: string; html: string } | null> {
  try {
    const db = await openDB()
    const key = ruleId

    return new Promise((resolve, reject) => {
      const tx = db.transaction(CONTENT_STORE, "readonly")
      const store = tx.objectStore(CONTENT_STORE)
      const request = store.get(key)

      request.onsuccess = () => {
        const entry = request.result as ContentCacheEntry | undefined
        db.close()

        if (entry) {
          console.log("[admin-rule-cache] Content cache HIT:", key)
          resolve({ title: entry.title, html: entry.html })
        } else {
          console.log("[admin-rule-cache] Content cache MISS:", key)
          resolve(null)
        }
      }

      request.onerror = () => {
        db.close()
        reject(request.error)
      }
    })
  } catch (error) {
    console.error("[admin-rule-cache] Error reading content cache:", error)
    return null
  }
}

// 행정규칙 내용 캐시 저장
export async function setAdminRuleContentCache(
  ruleId: string,
  title: string,
  html: string,
  effectiveDate?: string
): Promise<void> {
  try {
    const db = await openDB()
    const key = ruleId

    const entry: ContentCacheEntry = {
      key,
      timestamp: Date.now(),
      title,
      html,
      effectiveDate,
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(CONTENT_STORE, "readwrite")
      const store = tx.objectStore(CONTENT_STORE)
      const request = store.put(entry)

      request.onsuccess = () => {
        db.close()
        console.log("[admin-rule-cache] Content cache saved:", key)
        resolve()
      }

      request.onerror = () => {
        db.close()
        reject(request.error)
      }
    })
  } catch (error) {
    console.error("[admin-rule-cache] Error saving content cache:", error)
  }
}

// 개별 행정규칙 내용 캐시 삭제
export async function clearAdminRuleContentCache(ruleId: string): Promise<void> {
  try {
    const db = await openDB()
    const key = ruleId

    return new Promise((resolve, reject) => {
      const tx = db.transaction(CONTENT_STORE, "readwrite")
      const store = tx.objectStore(CONTENT_STORE)
      const request = store.delete(key)

      request.onsuccess = () => {
        db.close()
        console.log("[admin-rule-cache] Content cache cleared for:", key)
        resolve()
      }

      request.onerror = () => {
        db.close()
        reject(request.error)
      }
    })
  } catch (error) {
    console.error("[admin-rule-cache] Error clearing content cache:", error)
  }
}

// 전체 캐시 삭제 (디버깅용)
export async function clearAllAdminRuleCache(): Promise<void> {
  try {
    const db = await openDB()

    const listTx = db.transaction(LIST_STORE, "readwrite")
    listTx.objectStore(LIST_STORE).clear()

    const contentTx = db.transaction(CONTENT_STORE, "readwrite")
    contentTx.objectStore(CONTENT_STORE).clear()

    db.close()
    console.log("[admin-rule-cache] All cache cleared")
  } catch (error) {
    console.error("[admin-rule-cache] Error clearing cache:", error)
  }
}

// 앱 시작 시 만료된 캐시 정리
if (typeof window !== "undefined") {
  cleanExpiredCache()
}
