/**
 * IndexedDB를 사용한 법령 본문 캐싱 시스템
 *
 * 캐시 구조:
 * - lawContentCache: 법령 전문 캐시 (lawId + 시행일자 기준)
 *
 * 성능 향상:
 * - 첫 검색: law.go.kr API 호출 (~500-2000ms)
 * - 재검색: IndexedDB에서 즉시 로드 (~5ms)
 *
 * Phase 7 (옵션 C): 검색어 기반 캐시
 * - 검색어로 직접 조회 가능 (API 호출 없이 즉시 반환)
 * - 2회 검색: ~25ms (80배 개선!)
 */

import type { LawMeta, LawArticle } from "./law-types"

const DB_NAME = "LexDiffCache"
const DB_VERSION = 3 // Phase 7: searchKey 인덱스 추가
const CONTENT_STORE = "lawContentCache"
const CACHE_EXPIRY_DAYS = 7 // 7일 후 자동 삭제 (법령은 자주 변경될 수 있음)

export interface LawContentCacheEntry {
  key: string // "${lawId}_${effectiveDate}"
  searchKey: string // "query:${normalizedQuery}" (Phase 7)
  normalizedQuery: string // "관세법 제38조" (Phase 7)
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
      const oldVersion = event.oldVersion

      // 법령 본문 캐시 스토어
      if (!db.objectStoreNames.contains(CONTENT_STORE)) {
        const contentStore = db.createObjectStore(CONTENT_STORE, { keyPath: "key" })
        contentStore.createIndex("timestamp", "timestamp", { unique: false })
        contentStore.createIndex("lawId", "lawId", { unique: false })
        contentStore.createIndex("lawTitle", "lawTitle", { unique: false })
        contentStore.createIndex("searchKey", "searchKey", { unique: false })
        contentStore.createIndex("normalizedQuery", "normalizedQuery", { unique: false })
        console.log(`✅ Created ${CONTENT_STORE} object store with searchKey index`)
      } else if (oldVersion < 3) {
        // Phase 7: 기존 스토어에 searchKey 인덱스 추가
        const tx = (event.target as IDBOpenDBRequest).transaction
        if (tx) {
          const contentStore = tx.objectStore(CONTENT_STORE)
          if (!contentStore.indexNames.contains("searchKey")) {
            contentStore.createIndex("searchKey", "searchKey", { unique: false })
            console.log(`✅ Added searchKey index to ${CONTENT_STORE}`)
          }
          if (!contentStore.indexNames.contains("normalizedQuery")) {
            contentStore.createIndex("normalizedQuery", "normalizedQuery", { unique: false })
            console.log(`✅ Added normalizedQuery index to ${CONTENT_STORE}`)
          }
        }
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

// 캐시 저장 (Phase 7: 검색어 키 추가)
export async function setLawContentCache(
  lawId: string,
  effectiveDate: string,
  meta: LawMeta,
  articles: LawArticle[],
  rawQuery?: string // Phase 7: 검색어 추가 (선택)
): Promise<void> {
  try {
    if (!lawId) {
      console.warn('⚠️ lawId가 없어 캐시 저장 건너뜀')
      return
    }

    const db = await openDB()
    const key = `${lawId}_${effectiveDate}`

    // Phase 7: 검색어 키 생성
    let searchKey = ''
    let normalizedQuery = ''
    if (rawQuery) {
      const { normalizeSearchQuery } = await import('./search-normalizer')
      normalizedQuery = normalizeSearchQuery(rawQuery)
      searchKey = `query:${normalizedQuery}`
    }

    console.log(`💾 [Phase 7] 캐시 저장 중: ${meta.lawTitle}`, {
      lawId,
      effectiveDate: effectiveDate || '(없음)',
      articles: articles.length,
      key,
      rawQuery: rawQuery || '❌ 없음',
      normalizedQuery: normalizedQuery || '❌ 없음',
      searchKey: searchKey || '❌ 없음',
    })

    const entry: LawContentCacheEntry = {
      key,
      searchKey,           // Phase 7
      normalizedQuery,     // Phase 7
      timestamp: Date.now(),
      lawId,
      lawTitle: meta.lawTitle,
      effectiveDate: effectiveDate || '',
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

    console.log(`✅ 캐시 저장 완료: ${meta.lawTitle} (${articles.length}개 조문, key: ${key}${searchKey ? `, searchKey: ${searchKey}` : ''})`)

    // 백그라운드로 만료된 캐시 정리
    cleanExpiredCache().catch(console.error)
  } catch (error) {
    console.error("❌ 캐시 저장 실패:", error)
  }
}

/**
 * Phase 7: 검색어로 캐시 조회 (가장 빠른 경로!)
 * IndexedDB 우선 체크로 API 호출 없이 즉시 반환
 */
export async function getLawContentCacheByQuery(
  rawQuery: string
): Promise<LawContentCacheEntry | null> {
  try {
    // 정규화
    const { normalizeSearchQuery } = await import('./search-normalizer')
    const normalized = normalizeSearchQuery(rawQuery)
    const searchKey = `query:${normalized}`

    console.log(`🔍 [Phase 7] 캐시 조회 (검색어): "${normalized}"`)

    const db = await openDB()
    const tx = db.transaction(CONTENT_STORE, "readonly")
    const store = tx.objectStore(CONTENT_STORE)
    const index = store.index("searchKey")

    const request = index.get(searchKey)
    const entry = await new Promise<LawContentCacheEntry | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    db.close()

    if (!entry) {
      console.log(`❌ 캐시 MISS (검색어): "${normalized}"`)
      return null
    }

    // 만료 체크
    const expiryTime = Date.now() - CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    if (entry.timestamp < expiryTime) {
      console.log(`⏰ Cache expired: "${normalized}"`)
      clearLawContentCache(entry.lawId, entry.effectiveDate).catch(console.error)
      return null
    }

    console.log(`✅ 캐시 HIT (검색어): "${entry.lawTitle}" (${entry.articles.length}개 조문)`)
    return entry
  } catch (error) {
    console.error("❌ 캐시 조회 실패 (검색어):", error)
    return null
  }
}

// 캐시 조회 (lawId 기반, 기존 함수)
export async function getLawContentCache(
  lawId: string,
  effectiveDate: string
): Promise<LawContentCacheEntry | null> {
  try {
    const db = await openDB()
    const tx = db.transaction(CONTENT_STORE, "readonly")
    const store = tx.objectStore(CONTENT_STORE)

    let entry: LawContentCacheEntry | undefined

    // effectiveDate가 있으면 정확히 매칭
    if (effectiveDate) {
      const key = `${lawId}_${effectiveDate}`
      console.log(`🔍 캐시 조회 (정확한 키): ${key}`)
      const request = store.get(key)
      entry = await new Promise<LawContentCacheEntry | undefined>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    } else {
      // effectiveDate가 없으면 lawId로 모든 항목 조회 후 가장 최신 것 선택
      console.log(`🔍 캐시 조회 (lawId만): ${lawId}`)
      const index = store.index("lawId")
      const request = index.getAll(lawId)

      const entries = await new Promise<LawContentCacheEntry[]>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result || [])
        request.onerror = () => reject(request.error)
      })

      // 가장 최신 캐시 선택 (timestamp 기준)
      if (entries.length > 0) {
        entry = entries.sort((a, b) => b.timestamp - a.timestamp)[0]
        console.log(`📋 Found ${entries.length} cache entries, using most recent`)
      }
    }

    db.close()

    if (!entry) {
      console.log(`❌ 캐시 MISS: ${lawId}`)
      return null
    }

    // 만료 체크
    const expiryTime = Date.now() - CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    if (entry.timestamp < expiryTime) {
      console.log(`⏰ Cache expired for ${entry.lawTitle}`)
      // 만료된 캐시는 비동기로 삭제
      clearLawContentCache(lawId, entry.effectiveDate).catch(console.error)
      return null
    }

    console.log(`✅ 캐시 HIT: ${entry.lawTitle} (${entry.articles.length}개 조문, key: ${entry.key})`)
    return entry
  } catch (error) {
    console.error("❌ 캐시 조회 실패:", error)
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
