# 옵션 C 구현 계획: IndexedDB 우선 검색

## 📊 IndexedDB 용량 분석 결과

### 실제 법령 데이터 크기:
- **평균**: 320 KB/법령
- **최소**: 0.09 KB (빈 법령)
- **최대**: 1,120 KB (관세법 495조)

### 브라우저 용량 한계:
- **Soft limit**: ~50MB (권장)
- **Hard limit**: ~1GB (Chrome/Edge)

### 예상 저장 가능량:
- **50MB 기준**: ~159개 법령
- **사용자 평균 사용**: 10-20개 법령 → **6.25MB**

### ✅ 결론: 용량 문제 없음
- 7일 자동 삭제로 관리
- 평균 사용량 << 브라우저 한계
- 압축 불필요

---

## 🎯 옵션 C 상세 설계

### 핵심 아이디어:
1. **검색어 기반 IndexedDB 키** 추가
2. **L0~L4보다 먼저** IndexedDB 체크
3. **HIT 시 즉시 반환** (API 호출 없음)
4. **MISS 시 기존 흐름** (L0~L4 → API → 저장)

---

## 🔧 구현 단계

### Phase 1: IndexedDB 키 구조 확장 (30분)

#### 현재 키:
```typescript
key: `${lawId}_${effectiveDate}`  // lawId 기반
```

#### 새 키 추가:
```typescript
// 1. 기존 키 유지 (호환성)
key: `${lawId}_${effectiveDate}`

// 2. 검색어 키 추가 (새로운 인덱스)
searchKey: `query:${normalizedQuery}`  // "query:관세법_제38조"
```

#### 구현 파일: `lib/law-content-cache.ts`

**변경 사항**:
```typescript
export interface LawContentCacheEntry {
  key: string                    // "${lawId}_${effectiveDate}" (기존)
  searchKey: string              // "query:${normalizedQuery}" (신규)
  normalizedQuery: string        // "관세법 제38조" (신규)
  timestamp: number
  lawId: string
  lawTitle: string
  effectiveDate: string
  meta: LawMeta
  articles: LawArticle[]
}

// 새 인덱스 추가
request.onupgradeneeded = (event) => {
  const db = (event.target as IDBOpenDBRequest).result

  if (!db.objectStoreNames.contains(CONTENT_STORE)) {
    const contentStore = db.createObjectStore(CONTENT_STORE, { keyPath: "key" })
    contentStore.createIndex("timestamp", "timestamp", { unique: false })
    contentStore.createIndex("lawId", "lawId", { unique: false })
    contentStore.createIndex("lawTitle", "lawTitle", { unique: false })
    contentStore.createIndex("searchKey", "searchKey", { unique: false }) // 신규!
    contentStore.createIndex("normalizedQuery", "normalizedQuery", { unique: false }) // 신규!
  }
}
```

**DB_VERSION 증가**: `2 → 3`

---

### Phase 2: 검색어 기반 캐시 조회 함수 추가 (20분)

#### 새 함수: `getLawContentCacheByQuery()`

**구현 파일**: `lib/law-content-cache.ts`

```typescript
/**
 * 검색어로 캐시 조회 (가장 빠른 경로)
 */
export async function getLawContentCacheByQuery(
  rawQuery: string
): Promise<LawContentCacheEntry | null> {
  try {
    // 정규화
    const { normalizeSearchQuery } = await import('./search-normalizer')
    const normalized = normalizeSearchQuery(rawQuery)
    const searchKey = `query:${normalized}`

    console.log(`🔍 캐시 조회 (검색어): "${normalized}"`)

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
    console.error("❌ 캐시 조회 실패:", error)
    return null
  }
}
```

---

### Phase 3: 캐시 저장 시 searchKey 포함 (10분)

#### 수정 함수: `setLawContentCache()`

**구현 파일**: `lib/law-content-cache.ts`

```typescript
export async function setLawContentCache(
  lawId: string,
  effectiveDate: string,
  meta: LawMeta,
  articles: LawArticle[],
  rawQuery?: string  // 신규 파라미터 (선택)
): Promise<void> {
  try {
    if (!lawId) {
      console.warn('⚠️ lawId가 없어 캐시 저장 건너뜀')
      return
    }

    const db = await openDB()
    const key = `${lawId}_${effectiveDate}`

    // 검색어 키 생성
    let searchKey = ''
    let normalizedQuery = ''
    if (rawQuery) {
      const { normalizeSearchQuery } = await import('./search-normalizer')
      normalizedQuery = normalizeSearchQuery(rawQuery)
      searchKey = `query:${normalizedQuery}`
    }

    console.log(`💾 캐시 저장 중: ${meta.lawTitle}`, {
      lawId,
      effectiveDate: effectiveDate || '(없음)',
      articles: articles.length,
      key,
      searchKey: searchKey || '(없음)',
    })

    const entry: LawContentCacheEntry = {
      key,
      searchKey,           // 신규!
      normalizedQuery,     // 신규!
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

    console.log(`✅ 캐시 저장 완료: ${meta.lawTitle}`)
    cleanExpiredCache().catch(console.error)
  } catch (error) {
    console.error("❌ 캐시 저장 실패:", error)
  }
}
```

---

### Phase 4: 검색 흐름 변경 (app/page.tsx) (40분)

#### 현재 흐름:
```
검색 시작
  ↓
/api/intelligent-search (L0~L4)
  ↓
lawId 획득
  ↓
IndexedDB 체크 (lawId 기반)
  ├─ HIT: 반환
  └─ MISS: eflaw API 호출
```

#### 새 흐름:
```
검색 시작
  ↓
IndexedDB 체크 (검색어 기반) ← 우선!
  ├─ HIT: 즉시 반환 (20-30ms) ✅
  └─ MISS
      ↓
      /api/intelligent-search (L0~L4)
        ↓
        lawId 획득
        ↓
        eflaw API 호출
        ↓
        IndexedDB 저장 (검색어 키 포함)
```

#### 구현:

**파일**: `app/page.tsx`

```typescript
const handleSearch = async (query: { lawName: string; article?: string; jo?: string }) => {
  setIsSearching(true)
  setLawData(null)
  // ... 기존 초기화 코드

  const isOrdinanceQuery = /조례|규칙|특별시|광역시|도|시|군|구/.test(query.lawName)
  const rawQuery = `${query.lawName}${query.article ? ` ${query.article}` : ''}`

  debugLogger.info(isOrdinanceQuery ? "조례 검색 시작" : "법령 검색 시작", { rawQuery })

  // 🚀 Phase 7: IndexedDB 우선 체크 (법령만)
  if (!isOrdinanceQuery) {
    try {
      const t0 = performance.now()
      const { getLawContentCacheByQuery } = await import('@/lib/law-content-cache')
      const cachedContent = await getLawContentCacheByQuery(rawQuery)
      const t1 = performance.now()

      if (cachedContent) {
        debugLogger.success(`💾 IndexedDB 캐시 HIT (${Math.round(t1 - t0)}ms) - API 호출 없음!`, {
          lawTitle: cachedContent.lawTitle,
          articles: cachedContent.articles.length,
        })

        // 파싱된 데이터 생성
        const parsedData = {
          meta: cachedContent.meta,
          articles: cachedContent.articles,
          selectedJo: query.jo,
        }

        // 조문 존재 확인
        let finalData = { ...parsedData }
        if (query.jo && parsedData.selectedJo === undefined) {
          // 조문 없음 처리 (기존 코드 재사용)
          const { findNearestArticles, findCrossLawSuggestions } = await import('@/lib/article-finder')
          const nearestArticles = findNearestArticles(query.jo, parsedData.articles)
          const crossLawSuggestions = await findCrossLawSuggestions(query.jo, parsedData.meta.lawTitle)

          setArticleNotFound({
            requestedJo: query.jo,
            lawTitle: parsedData.meta.lawTitle,
            nearestArticles,
            crossLawSuggestions: crossLawSuggestions.slice(0, 3),
          })

          debugLogger.warning(`조문 없음: ${query.jo}`)
        }

        // 임시 ID 생성 (피드백 버튼용)
        const queryId = -Date.now()
        const resultId = -(Date.now() + 1)

        setLawData({
          ...finalData,
          meta: {
            ...finalData.meta,
            searchResultId: resultId,
            searchQueryId: queryId,
          },
        })

        setIsSearching(false)
        return // ← 여기서 종료! API 호출 없음!
      } else {
        debugLogger.info(`❌ IndexedDB 캐시 MISS (${Math.round(t1 - t0)}ms) - L0~L4 검색 진행`)
      }
    } catch (error) {
      debugLogger.warning('IndexedDB 캐시 조회 실패, L0~L4로 진행', error)
    }
  }

  // 기존 L0~L4 검색 로직 (IndexedDB MISS 시에만 실행)
  if (!isOrdinanceQuery) {
    try {
      const intelligentResponse = await fetch('/api/intelligent-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawQuery }),
      })

      if (intelligentResponse.ok) {
        const intelligentResult = await intelligentResponse.json()

        if (intelligentResult.success && intelligentResult.data) {
          const sourceLayer = intelligentResult.source.replace(/_/g, ' ').toUpperCase()
          debugLogger.success(`✅ ${sourceLayer} 캐시 HIT (${intelligentResult.time}ms)`, {
            queryId: intelligentResult.searchQueryId,
            resultId: intelligentResult.searchResultId,
          })

          const cachedData = intelligentResult.data

          if (cachedData.lawId) {
            // IndexedDB 체크 (lawId 기반, 기존 로직)
            const t1 = performance.now()
            const { getLawContentCache, setLawContentCache } = await import('@/lib/law-content-cache')
            const effectiveDate = cachedData.effectiveDate || ''

            const lawContentCache = await getLawContentCache(cachedData.lawId, effectiveDate)
            const t2 = performance.now()

            let parsedData
            if (lawContentCache) {
              debugLogger.success(`💾 법령 본문 캐시 HIT (IndexedDB, ${Math.round(t2 - t1)}ms)`, {
                lawTitle: lawContentCache.lawTitle,
                articles: lawContentCache.articles.length,
              })

              parsedData = {
                meta: lawContentCache.meta,
                articles: lawContentCache.articles,
                selectedJo: query.jo,
              }
            } else {
              const t3 = performance.now()
              debugLogger.info('📄 법령 전문 조회 중 (eflaw API)', { lawId: cachedData.lawId })

              const apiUrl = `/api/eflaw?lawId=${cachedData.lawId}${cachedData.mst ? `&MST=${cachedData.mst}` : ''}`
              const response = await fetch(apiUrl)

              if (!response.ok) {
                throw new Error('법령 전문 조회 실패')
              }

              const jsonText = await response.text()
              const jsonData = JSON.parse(jsonText)
              parsedData = parseLawJSON(jsonData)
              const t4 = performance.now()
              debugLogger.info(`📄 법령 전문 조회 완료 (${Math.round(t4 - t3)}ms)`)

              // IndexedDB에 캐시 저장 (검색어 키 포함!) ← 중요!
              setLawContentCache(
                cachedData.lawId,
                effectiveDate,
                parsedData.meta,
                parsedData.articles,
                rawQuery  // ← 검색어 전달!
              ).then(() => {
                debugLogger.info('💾 법령 본문 캐시 저장 완료 (검색어 키 포함)', {
                  lawTitle: parsedData.meta.lawTitle,
                  searchKey: `query:${rawQuery}`,
                })
              }).catch((error) => {
                console.error('법령 본문 캐시 저장 실패:', error)
              })
            }

            // ... 나머지 기존 코드 (조문 확인, LawData 설정 등)
          }
        }
      }
    } catch (error) {
      // ... 기존 에러 처리
    }
  }

  // 조례 검색은 기존 로직 유지
  // ...
}
```

---

## 🧪 테스트 계획

### 테스트 케이스:

#### 1. 첫 검색 (IndexedDB 비어있음)
```
입력: "관세법 38조"
예상:
  - IndexedDB MISS (~5ms)
  - L0~L4 검색 실행
  - eflaw API 호출 (~2000ms)
  - IndexedDB 저장 (searchKey 포함)
총 시간: ~2000ms
```

#### 2. 두 번째 검색 (동일 검색어)
```
입력: "관세법 38조"
예상:
  - IndexedDB HIT (~25ms)
  - API 호출 없음!
총 시간: ~25ms (80배 개선!)
```

#### 3. 오타 검색 (정규화 후 매칭)
```
입력: "관셰법 38조"
예상:
  - 정규화: "관세법 38조"
  - IndexedDB HIT (정규화된 키로 검색)
  - API 호출 없음!
총 시간: ~30ms
```

#### 4. 다른 조항 검색 (같은 법령)
```
입력: "관세법 322조"
예상:
  - IndexedDB MISS (다른 검색어)
  - L1 HIT (같은 lawId)
  - eflaw API 호출 (법령 전문)
  - IndexedDB 저장
총 시간: ~2000ms
```

#### 5. 7일 후 재검색
```
입력: "관세법 38조"
예상:
  - IndexedDB 만료 삭제
  - L1 HIT (Turso DB는 영구)
  - eflaw API 호출
  - IndexedDB 재저장
총 시간: ~2000ms
```

---

## ⚠️ 엣지 케이스 처리

### 1. 대형 법령 (>2MB)
**문제**: 일부 법령이 매우 클 수 있음
**해결**:
- 현재 최대: 1.1MB (관세법) → 문제 없음
- IndexedDB 한계: 1GB → 충분함
- **조치 불필요**

### 2. IndexedDB 용량 초과
**문제**: 사용자가 수백 개 법령 검색 시
**해결**:
- 7일 자동 삭제 (이미 구현됨)
- 예상 사용: 10-20개 (6MB) << 50MB (soft limit)
- **조치 불필요**

### 3. 브라우저 호환성
**문제**: IndexedDB 미지원 브라우저
**해결**:
- try-catch로 감싸서 fallback
- 실패 시 기존 L0~L4 흐름
- **이미 구현됨**

### 4. 검색어 변형 (띄어쓰기, 대소문자)
**문제**: "관세법38조" vs "관세법 38조"
**해결**:
- `normalizeSearchQuery()` 사용 (이미 구현)
- 정규화 후 저장/검색
- **조치 불필요**

### 5. 동시 저장 경쟁 상태
**문제**: 같은 법령을 여러 탭에서 동시 저장
**해결**:
- IndexedDB는 ACID 보장
- `put()` 연산은 atomic
- **조치 불필요**

---

## 📊 예상 성능 개선

### 시나리오별 성능:

| 시나리오 | 현재 | 옵션 C | 개선율 |
|---------|------|--------|--------|
| 첫 검색 | 2000ms | 2000ms | - |
| 2회 검색 (같은 검색어) | 2000ms | **25ms** | **80배** ⭐ |
| 2회 검색 (다른 조항, 같은 법령) | 2000ms | 2000ms | - |
| 오타 검색 (정규화 후 매칭) | 2000ms | **30ms** | **66배** ⭐ |
| 새 브라우저 | 2000ms | 2000ms | - |

### 사용자 경험 개선:
- **반복 검색 시 즉시 표시** (2초 → 0.03초)
- **API 호출 50% 감소** (서버 부하 절감)
- **오프라인 지원** (IndexedDB는 오프라인에서도 작동)

---

## 🚀 구현 순서 (총 ~2시간)

1. ✅ IndexedDB 스키마 확장 (30분)
   - `LawContentCacheEntry` 인터페이스 수정
   - `searchKey`, `normalizedQuery` 필드 추가
   - 인덱스 추가
   - DB_VERSION 증가 (2 → 3)

2. ✅ 캐시 함수 추가/수정 (30분)
   - `getLawContentCacheByQuery()` 함수 추가
   - `setLawContentCache()` 함수에 `rawQuery` 파라미터 추가

3. ✅ 검색 흐름 변경 (40분)
   - `app/page.tsx`의 `handleSearch()` 수정
   - IndexedDB 우선 체크 로직 추가
   - 저장 시 검색어 전달

4. ✅ 테스트 및 검증 (20분)
   - 5가지 테스트 케이스 실행
   - 성능 측정
   - 엣지 케이스 확인

---

## ✅ 성공 기준

1. **성능**: 2회 검색부터 **50ms 이하**
2. **정확도**: 기존과 동일한 검색 결과
3. **안정성**: 에러율 증가 없음
4. **용량**: 브라우저 스토리지 50MB 이하 유지
5. **사용자 경험**: 반복 검색 시 "즉시" 표시

---

## 📝 다음 단계 (선택)

옵션 C 성공 후 추가 최적화 고려:

1. **옵션 A 마이그레이션**: Turso DB에 법령 전문 저장
   - 장점: 브라우저 간 캐시 공유, 새 브라우저도 빠름
   - 단점: Turso 스토리지 비용 증가
   - 시기: 사용자 피드백 수집 후 결정

2. **압축 적용**: gzip/deflate로 저장 크기 50% 감소
   - 현재 불필요 (용량 충분)
   - 필요 시 적용

3. **Service Worker 캐싱**: 오프라인 지원 강화
   - 현재 IndexedDB로 충분
   - PWA 전환 시 고려
