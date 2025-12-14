/**
 * search-result-store.ts
 *
 * IndexedDB를 사용한 검색 결과 영구 캐싱
 * - 7일간 검색 결과 보관
 * - F5 새로고침 시에도 데이터 유지
 * - 브라우저 종료 후에도 유지
 */

const DB_NAME = 'LexDiffSearchCache'
const STORE_NAME = 'searchResults'
const DB_VERSION = 1
const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7일

/**
 * 검색 결과 캐시 데이터 구조
 */
export interface SearchResultCache {
  searchId: string
  query: {
    lawName: string
    article?: string
    jo?: string
  }
  lawData?: {
    meta: {
      lawId?: string
      mst?: string
      lawName: string
      ordinSeq?: string
      ordinId?: string
    }
    articles: Array<{
      joNumber: string
      joLabel: string
      content: string
      isDeleted?: boolean
      revisionInfo?: string
    }>
    selectedJo: string | null
    isOrdinance: boolean
    viewMode: '1-tier' | '2-tier' | '3-tier'
    searchQueryId?: string
    searchResultId?: string
  }
  lawSelectionState?: {
    results: Array<{
      법령ID: string
      법령명_한글: string
      공포일자: string
      시행일자: string
    }>
    query: string
  }
  ordinanceSelectionState?: {
    results: Array<{
      자치법규ID: string
      자치법규명: string
      공포일자: string
    }>
    query: string
  }
  aiMode?: {
    aiAnswerContent: string
    aiRelatedLaws: Array<{
      lawName: string
      article?: string
      confidence?: number
    }>
    aiCitations?: Array<{
      lawName: string
      articleNum: string
      verified?: boolean
    }>
    userQuery?: string
    fileSearchFailed?: boolean
    aiQueryType?: 'definition' | 'requirement' | 'procedure' | 'comparison' | 'application' | 'consequence' | 'scope'
    comparisonLaw?: {
      lawName: string
      article?: string
    }
  }
  timestamp: number
  expiresAt: number
}

/**
 * IndexedDB 초기화
 */
async function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // 기존 스토어가 있으면 삭제
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME)
      }

      // 새 스토어 생성
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'searchId' })
      store.createIndex('timestamp', 'timestamp', { unique: false })
      store.createIndex('expiresAt', 'expiresAt', { unique: false })
    }
  })
}

/**
 * 검색 결과 저장
 */
export async function saveSearchResult(cache: SearchResultCache): Promise<void> {
  try {
    const db = await initDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    // 만료 시간 설정
    cache.timestamp = Date.now()
    cache.expiresAt = cache.timestamp + CACHE_DURATION_MS

    await new Promise<void>((resolve, reject) => {
      const request = store.put(cache)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })

    db.close()
  } catch (error) {
    console.error('Failed to save search result:', error)
    throw error
  }
}

/**
 * 검색 결과 조회
 */
export async function getSearchResult(
  searchId: string
): Promise<SearchResultCache | null> {
  try {
    const db = await initDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)

    const cache = await new Promise<SearchResultCache | undefined>((resolve, reject) => {
      const request = store.get(searchId)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    db.close()

    if (!cache) {
      return null
    }

    // 만료 확인
    if (cache.expiresAt < Date.now()) {
      await deleteSearchResult(searchId)
      return null
    }

    return cache
  } catch (error) {
    console.error('Failed to get search result:', error)
    return null
  }
}

/**
 * 검색 결과 삭제
 */
export async function deleteSearchResult(searchId: string): Promise<void> {
  try {
    const db = await initDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(searchId)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })

    db.close()
  } catch (error) {
    console.error('Failed to delete search result:', error)
    throw error
  }
}

/**
 * 만료된 검색 결과 일괄 삭제
 */
export async function deleteExpiredResults(): Promise<void> {
  try {
    const db = await initDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('expiresAt')

    const now = Date.now()
    const range = IDBKeyRange.upperBound(now)

    await new Promise<void>((resolve, reject) => {
      const request = index.openCursor(range)
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        } else {
          resolve()
        }
      }
      request.onerror = () => reject(request.error)
    })

    db.close()
  } catch (error) {
    console.error('Failed to delete expired results:', error)
  }
}

/**
 * 모든 검색 결과 조회 (디버그용)
 */
export async function getAllSearchResults(): Promise<SearchResultCache[]> {
  try {
    const db = await initDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)

    const results = await new Promise<SearchResultCache[]>((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    db.close()
    return results
  } catch (error) {
    console.error('Failed to get all search results:', error)
    return []
  }
}

/**
 * 모든 검색 결과 삭제 (디버그용)
 */
export async function clearAllSearchResults(): Promise<void> {
  try {
    const db = await initDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    await new Promise<void>((resolve, reject) => {
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })

    db.close()
  } catch (error) {
    console.error('Failed to clear all search results:', error)
    throw error
  }
}
