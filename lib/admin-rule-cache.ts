/**
 * IndexedDB를 사용한 행정규칙 캐싱 시스템
 *
 * 2단계 캐시 구조:
 * - lawAdminRulesPurposeCache: 법령별 전체 행정규칙 제1조 캐시 (법령명 기준)
 * - articleMatchIndexCache: 조문별 매칭 결과 인덱스 (법령명 + 조문번호 기준)
 * - adminRulesContentCache: 행정규칙 전체 내용 캐시 (규칙ID 기준)
 */

import type { AdminRuleMatch } from "./use-admin-rules"
import type { AdminRuleArticle } from "./admrul-parser"

const DB_NAME = "LexDiffCache"
const DB_VERSION = 10 // 2단계 캐시 구조 도입
const PURPOSE_STORE = "lawAdminRulesPurposeCache" // 법령별 제1조 캐시
const MATCH_INDEX_STORE = "articleMatchIndexCache" // 조문별 매칭 인덱스
const CONTENT_STORE = "adminRulesContentCache"
const CACHE_EXPIRY_DAYS = 7 // 30일 → 7일로 단축

// 법령별 전체 행정규칙의 제1조 캐시
interface LawAdminRulesPurposeCache {
  key: string // "${lawName}"
  lawName: string
  mst: string // 법령 버전
  timestamp: number
  rules: Array<{
    id: string
    name: string
    serialNumber?: string
    purpose: AdminRuleArticle | null // 제1조(목적)
  }>
}

// 조문별 매칭 결과 인덱스 (가벼움)
interface ArticleMatchIndex {
  key: string // "${lawName}_${articleNumber}"
  lawName: string
  articleNumber: string
  mst: string // 법령 버전
  timestamp: number
  matchedRuleIds: string[] // 매칭된 규칙 ID 배열 (참조)
}

interface ContentCacheEntry {
  key: string // "${ruleId}"
  timestamp: number
  title: string
  html: string
  effectiveDate?: string
}

// IndexedDB 초기화
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = (event) => {
      const error = (event.target as IDBOpenDBRequest).error

      // VersionError 발생 시 DB 삭제 후 재시도
      if (error?.name === 'VersionError') {
        console.warn('[admin-rule-cache] VersionError detected, deleting database and retrying...')
        indexedDB.deleteDatabase(DB_NAME)
      }

      reject(error)
    }

    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      const oldVersion = event.oldVersion

      console.log(`[admin-rule-cache] Upgrade v${oldVersion} → v${DB_VERSION}`)

      // 기존 스토어 모두 삭제 (스키마 충돌 방지)
      Array.from(db.objectStoreNames).forEach((storeName) => {
        console.log(`[admin-rule-cache] Deleting old store: ${storeName}`)
        db.deleteObjectStore(storeName)
      })

      // 법령별 제1조 캐시 스토어
      const purposeStore = db.createObjectStore(PURPOSE_STORE, { keyPath: "key" })
      purposeStore.createIndex("timestamp", "timestamp", { unique: false })
      purposeStore.createIndex("lawName", "lawName", { unique: false })
      console.log(`[admin-rule-cache] Created store: ${PURPOSE_STORE}`)

      // 조문별 매칭 인덱스 스토어
      const matchIndexStore = db.createObjectStore(MATCH_INDEX_STORE, { keyPath: "key" })
      matchIndexStore.createIndex("timestamp", "timestamp", { unique: false })
      matchIndexStore.createIndex("lawName", "lawName", { unique: false })
      console.log(`[admin-rule-cache] Created store: ${MATCH_INDEX_STORE}`)

      // 행정규칙 내용 캐시 스토어
      const contentStore = db.createObjectStore(CONTENT_STORE, { keyPath: "key" })
      contentStore.createIndex("timestamp", "timestamp", { unique: false })
      console.log(`[admin-rule-cache] Created store: ${CONTENT_STORE}`)
    }
  })
}

// 만료된 캐시 정리
async function cleanExpiredCache(): Promise<void> {
  try {
    const db = await openDB()
    const expiryTime = Date.now() - CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000

    // 제1조 캐시 정리
    const purposeTx = db.transaction(PURPOSE_STORE, "readwrite")
    const purposeStore = purposeTx.objectStore(PURPOSE_STORE)
    const purposeIndex = purposeStore.index("timestamp")
    const purposeRange = IDBKeyRange.upperBound(expiryTime)
    const purposeRequest = purposeIndex.openCursor(purposeRange)

    purposeRequest.onsuccess = () => {
      const cursor = purposeRequest.result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      }
    }

    // 매칭 인덱스 정리
    const matchIndexTx = db.transaction(MATCH_INDEX_STORE, "readwrite")
    const matchIndexStore = matchIndexTx.objectStore(MATCH_INDEX_STORE)
    const matchIndexIndex = matchIndexStore.index("timestamp")
    const matchIndexRange = IDBKeyRange.upperBound(expiryTime)
    const matchIndexRequest = matchIndexIndex.openCursor(matchIndexRange)

    matchIndexRequest.onsuccess = () => {
      const cursor = matchIndexRequest.result
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

// ========================================
// 법령별 제1조 캐시 (새로운 1단계 캐시)
// ========================================

/**
 * 법령별 전체 행정규칙의 제1조 캐시 조회
 */
export async function getLawAdminRulesPurposeCache(
  lawName: string,
  currentMst: string
): Promise<LawAdminRulesPurposeCache["rules"] | null> {
  try {
    const db = await openDB()
    const key = lawName

    return new Promise((resolve, reject) => {
      const tx = db.transaction(PURPOSE_STORE, "readonly")
      const store = tx.objectStore(PURPOSE_STORE)
      const request = store.get(key)

      request.onsuccess = () => {
        const entry = request.result as LawAdminRulesPurposeCache | undefined
        db.close()

        if (entry) {
          // MST 버전 확인
          if (entry.mst !== currentMst) {
            console.log("[admin-rule-cache] Purpose cache MST mismatch, invalidating")
            resolve(null)
            return
          }

          console.log("[admin-rule-cache] Purpose cache HIT:", key, entry.rules.length, "rules")
          resolve(entry.rules)
        } else {
          console.log("[admin-rule-cache] Purpose cache MISS:", key)
          resolve(null)
        }
      }

      request.onerror = () => {
        db.close()
        reject(request.error)
      }
    })
  } catch (error: any) {
    console.error("[admin-rule-cache] Error reading purpose cache:", error)

    if (error?.name === 'NotFoundError') {
      console.warn('[admin-rule-cache] Object store not found, deleting database...')
      try {
        indexedDB.deleteDatabase(DB_NAME)
        console.log('[admin-rule-cache] Database deleted, please refresh the page')
      } catch (deleteError) {
        console.error('[admin-rule-cache] Failed to delete database:', deleteError)
      }
    }

    return null
  }
}

/**
 * 법령별 전체 행정규칙의 제1조 캐시 저장
 */
export async function setLawAdminRulesPurposeCache(
  lawName: string,
  mst: string,
  rules: LawAdminRulesPurposeCache["rules"]
): Promise<void> {
  try {
    const db = await openDB()
    const key = lawName

    const entry: LawAdminRulesPurposeCache = {
      key,
      lawName,
      mst,
      timestamp: Date.now(),
      rules,
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(PURPOSE_STORE, "readwrite")
      const store = tx.objectStore(PURPOSE_STORE)
      const request = store.put(entry)

      request.onsuccess = () => {
        db.close()
        console.log("[admin-rule-cache] Purpose cache saved:", key, rules.length, "rules")
        resolve()
      }

      request.onerror = () => {
        db.close()
        reject(request.error)
      }
    })
  } catch (error) {
    console.error("[admin-rule-cache] Error saving purpose cache:", error)
  }
}

// ========================================
// 조문별 매칭 인덱스 (새로운 2단계 캐시)
// ========================================

/**
 * 조문별 매칭 결과 인덱스 조회
 */
export async function getArticleMatchIndex(
  lawName: string,
  articleNumber: string,
  currentMst: string
): Promise<string[] | null> {
  try {
    const db = await openDB()
    const key = `${lawName}_${articleNumber}`

    return new Promise((resolve, reject) => {
      const tx = db.transaction(MATCH_INDEX_STORE, "readonly")
      const store = tx.objectStore(MATCH_INDEX_STORE)
      const request = store.get(key)

      request.onsuccess = () => {
        const entry = request.result as ArticleMatchIndex | undefined
        db.close()

        if (entry) {
          // MST 버전 확인
          if (entry.mst !== currentMst) {
            console.log("[admin-rule-cache] Match index MST mismatch, invalidating")
            resolve(null)
            return
          }

          console.log("[admin-rule-cache] Match index HIT:", key, entry.matchedRuleIds.length, "matches")
          resolve(entry.matchedRuleIds)
        } else {
          console.log("[admin-rule-cache] Match index MISS:", key)
          resolve(null)
        }
      }

      request.onerror = () => {
        db.close()
        reject(request.error)
      }
    })
  } catch (error: any) {
    console.error("[admin-rule-cache] Error reading match index:", error)

    if (error?.name === 'NotFoundError') {
      console.warn('[admin-rule-cache] Object store not found, deleting database...')
      try {
        indexedDB.deleteDatabase(DB_NAME)
        console.log('[admin-rule-cache] Database deleted, please refresh the page')
      } catch (deleteError) {
        console.error('[admin-rule-cache] Failed to delete database:', deleteError)
      }
    }

    return null
  }
}

/**
 * 조문별 매칭 결과 인덱스 저장
 */
export async function setArticleMatchIndex(
  lawName: string,
  articleNumber: string,
  mst: string,
  matchedRuleIds: string[]
): Promise<void> {
  try {
    const db = await openDB()
    const key = `${lawName}_${articleNumber}`

    const entry: ArticleMatchIndex = {
      key,
      lawName,
      articleNumber,
      mst,
      timestamp: Date.now(),
      matchedRuleIds,
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(MATCH_INDEX_STORE, "readwrite")
      const store = tx.objectStore(MATCH_INDEX_STORE)
      const request = store.put(entry)

      request.onsuccess = () => {
        db.close()
        console.log("[admin-rule-cache] Match index saved:", key, matchedRuleIds.length, "matches")
        resolve()
      }

      request.onerror = () => {
        db.close()
        reject(request.error)
      }
    })
  } catch (error) {
    console.error("[admin-rule-cache] Error saving match index:", error)
  }
}

// ========================================
// 행정규칙 내용 캐시 (기존 유지)
// ========================================

/**
 * 행정규칙 내용 캐시 조회
 */
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
  } catch (error: any) {
    console.error("[admin-rule-cache] Error reading content cache:", error)

    if (error?.name === 'NotFoundError') {
      console.warn('[admin-rule-cache] Object store not found, deleting database...')
      try {
        indexedDB.deleteDatabase(DB_NAME)
        console.log('[admin-rule-cache] Database deleted, please refresh the page')
      } catch (deleteError) {
        console.error('[admin-rule-cache] Failed to delete database:', deleteError)
      }
    }

    return null
  }
}

/**
 * 행정규칙 내용 캐시 저장
 */
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

/**
 * 개별 행정규칙 내용 캐시 삭제
 */
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

/**
 * 전체 캐시 삭제 (디버깅용)
 */
export async function clearAllAdminRuleCache(): Promise<void> {
  try {
    const db = await openDB()

    const purposeTx = db.transaction(PURPOSE_STORE, "readwrite")
    purposeTx.objectStore(PURPOSE_STORE).clear()

    const matchIndexTx = db.transaction(MATCH_INDEX_STORE, "readwrite")
    matchIndexTx.objectStore(MATCH_INDEX_STORE).clear()

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
