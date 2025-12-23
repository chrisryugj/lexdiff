/**
 * 법령 연혁 목록 캐싱 시스템
 *
 * 캐시 구조:
 * - lawHistoryCache: 법령 연혁 목록 캐시 (법령명 기준)
 * - oldLawContentCache: 구법령 조문 캐시 (MST + JO 기준, 영구)
 *
 * 성능 향상:
 * - 첫 조회: law.go.kr lsHistory API 호출 (~500-1000ms)
 * - 재조회: IndexedDB에서 즉시 로드 (~5ms)
 */

const DB_NAME = "LexDiffHistoryCache"
const DB_VERSION = 1
const HISTORY_STORE = "lawHistoryCache"
const OLD_LAW_STORE = "oldLawContentCache"
const HISTORY_CACHE_EXPIRY_DAYS = 7 // 연혁 목록은 7일 캐싱
// 구법령 조문은 영구 캐싱 (연혁법은 변경 불가)

export interface LawHistoryEntry {
  mst: string           // 법령 MST (연혁별로 다름)
  efYd: string          // 시행일자 YYYYMMDD
  ancNo: string         // 공포번호
  ancYd: string         // 공포일자 YYYYMMDD
  lawNm: string         // 법령명
  rrCls: string         // 제개정구분 (일부개정, 전부개정 등)
}

export interface LawHistoryCacheEntry {
  key: string           // "history:${lawName}"
  lawName: string       // 정규화된 법령명
  timestamp: number
  histories: LawHistoryEntry[]
}

export interface OldLawContentCacheEntry {
  key: string           // "old-law:${mst}"
  mst: string
  timestamp: number
  lawData: unknown      // 법령 전체 JSON
  historyInfo: {
    lawNm: string
    efYd: string
    ancNo: string
    rrCls: string
  }
}

// IndexedDB 초기화
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      console.log(`📦 LawHistoryCache DB upgrade needed: v${event.oldVersion} → v${DB_VERSION}`)

      // 연혁 목록 캐시 스토어
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        const historyStore = db.createObjectStore(HISTORY_STORE, { keyPath: "key" })
        historyStore.createIndex("timestamp", "timestamp", { unique: false })
        historyStore.createIndex("lawName", "lawName", { unique: false })
        console.log(`✅ Created ${HISTORY_STORE}`)
      }

      // 구법령 조문 캐시 스토어
      if (!db.objectStoreNames.contains(OLD_LAW_STORE)) {
        const oldLawStore = db.createObjectStore(OLD_LAW_STORE, { keyPath: "key" })
        oldLawStore.createIndex("timestamp", "timestamp", { unique: false })
        oldLawStore.createIndex("mst", "mst", { unique: false })
        console.log(`✅ Created ${OLD_LAW_STORE}`)
      }
    }
  })
}

// 만료된 연혁 캐시 정리 (구법령은 영구이므로 제외)
async function cleanExpiredHistoryCache(): Promise<void> {
  try {
    const db = await openDB()

    if (!db.objectStoreNames.contains(HISTORY_STORE)) {
      db.close()
      return
    }

    const expiryTime = Date.now() - HISTORY_CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000

    const tx = db.transaction(HISTORY_STORE, "readwrite")
    const store = tx.objectStore(HISTORY_STORE)
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
        console.log(`🗑️ Cleaned ${deletedCount} expired law history cache entries`)
      }
    }

    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve()
    })

    db.close()
  } catch (error) {
    console.error("Failed to clean expired law history cache:", error)
  }
}

/**
 * 법령 연혁 목록 캐시 저장
 */
export async function setLawHistoryCache(
  lawName: string,
  histories: LawHistoryEntry[]
): Promise<void> {
  try {
    const db = await openDB()

    if (!db.objectStoreNames.contains(HISTORY_STORE)) {
      console.warn(`⚠️ Object store "${HISTORY_STORE}" not found.`)
      db.close()
      return
    }

    const key = `history:${lawName}`

    const entry: LawHistoryCacheEntry = {
      key,
      lawName,
      timestamp: Date.now(),
      histories,
    }

    const tx = db.transaction(HISTORY_STORE, "readwrite")
    const store = tx.objectStore(HISTORY_STORE)
    store.put(entry)

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    db.close()

    console.log(`✅ 연혁 캐시 저장: ${lawName} (${histories.length}개 버전)`)

    // 백그라운드로 만료된 캐시 정리
    cleanExpiredHistoryCache().catch(console.error)
  } catch (error) {
    console.error("❌ 연혁 캐시 저장 실패:", error)
  }
}

/**
 * 법령 연혁 목록 캐시 조회
 */
export async function getLawHistoryCache(
  lawName: string
): Promise<LawHistoryCacheEntry | null> {
  try {
    const db = await openDB()

    if (!db.objectStoreNames.contains(HISTORY_STORE)) {
      db.close()
      return null
    }

    const key = `history:${lawName}`
    const tx = db.transaction(HISTORY_STORE, "readonly")
    const store = tx.objectStore(HISTORY_STORE)
    const request = store.get(key)

    const entry = await new Promise<LawHistoryCacheEntry | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    db.close()

    if (!entry) {
      console.log(`❌ 연혁 캐시 MISS: ${lawName}`)
      return null
    }

    // 만료 체크
    const expiryTime = Date.now() - HISTORY_CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    if (entry.timestamp < expiryTime) {
      console.log(`⏰ 연혁 캐시 만료: ${lawName}`)
      return null
    }

    console.log(`✅ 연혁 캐시 HIT: ${lawName} (${entry.histories.length}개 버전)`)
    return entry
  } catch (error) {
    console.error("❌ 연혁 캐시 조회 실패:", error)
    return null
  }
}

/**
 * 구법령 조문 캐시 저장 (영구 캐싱)
 */
export async function setOldLawContentCache(
  mst: string,
  lawData: unknown,
  historyInfo: OldLawContentCacheEntry['historyInfo']
): Promise<void> {
  try {
    const db = await openDB()

    if (!db.objectStoreNames.contains(OLD_LAW_STORE)) {
      console.warn(`⚠️ Object store "${OLD_LAW_STORE}" not found.`)
      db.close()
      return
    }

    const key = `old-law:${mst}`

    const entry: OldLawContentCacheEntry = {
      key,
      mst,
      timestamp: Date.now(),
      lawData,
      historyInfo,
    }

    const tx = db.transaction(OLD_LAW_STORE, "readwrite")
    const store = tx.objectStore(OLD_LAW_STORE)
    store.put(entry)

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    db.close()

    console.log(`✅ 구법령 캐시 저장: MST=${mst} (${historyInfo.lawNm})`)
  } catch (error) {
    console.error("❌ 구법령 캐시 저장 실패:", error)
  }
}

/**
 * 구법령 조문 캐시 조회 (영구 캐싱이므로 만료 없음)
 */
export async function getOldLawContentCache(
  mst: string
): Promise<OldLawContentCacheEntry | null> {
  try {
    const db = await openDB()

    if (!db.objectStoreNames.contains(OLD_LAW_STORE)) {
      db.close()
      return null
    }

    const key = `old-law:${mst}`
    const tx = db.transaction(OLD_LAW_STORE, "readonly")
    const store = tx.objectStore(OLD_LAW_STORE)
    const request = store.get(key)

    const entry = await new Promise<OldLawContentCacheEntry | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    db.close()

    if (!entry) {
      console.log(`❌ 구법령 캐시 MISS: MST=${mst}`)
      return null
    }

    console.log(`✅ 구법령 캐시 HIT: MST=${mst} (${entry.historyInfo.lawNm})`)
    return entry
  } catch (error) {
    console.error("❌ 구법령 캐시 조회 실패:", error)
    return null
  }
}

/**
 * 특정 시점에 유효한 연혁 MST 찾기
 * @param histories 연혁 목록 (최신순 정렬 가정)
 * @param targetEfYd 목표 시행일자 (YYYYMMDD)
 * @returns 해당 시점에 유효한 연혁 정보
 */
export function findValidHistoryAtDate(
  histories: LawHistoryEntry[],
  targetEfYd: string
): LawHistoryEntry | null {
  if (!histories || histories.length === 0) return null

  // 시행일자 <= targetEfYd인 것 중 가장 최신 것
  // histories가 시행일자 내림차순으로 정렬되어 있다고 가정
  const target = parseInt(targetEfYd, 10)

  // 정렬 보장 (시행일자 내림차순)
  const sorted = [...histories].sort((a, b) =>
    parseInt(b.efYd, 10) - parseInt(a.efYd, 10)
  )

  for (const h of sorted) {
    const efYd = parseInt(h.efYd, 10)
    if (efYd <= target) {
      return h
    }
  }

  // 모든 연혁의 시행일자가 target보다 크면 가장 오래된 것 반환
  return sorted[sorted.length - 1]
}
