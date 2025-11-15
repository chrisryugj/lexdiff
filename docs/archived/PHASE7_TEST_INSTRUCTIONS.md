# Phase 7 (옵션 C) 테스트 방법

## 🎯 구현 완료

- ✅ IndexedDB 스키마 확장 (DB_VERSION 3)
- ✅ `getLawContentCacheByQuery()` 함수 추가
- ✅ `setLawContentCache()` rawQuery 파라미터 추가
- ✅ app/page.tsx 검색 흐름 변경

## 📝 테스트 시나리오

### 1️⃣ 첫 검색 (IndexedDB 비어있음)

**입력**: `관세법 38조`

**예상 동작**:
```
[Phase 7] 캐시 조회 (검색어): "관세법 38조"
❌ 캐시 MISS (검색어)
❌ [Phase 7] IndexedDB 캐시 MISS (~5ms) - L0~L4 검색 진행
🔍 [L0 Vector] Searching...
⏳ L4 API 호출 필요
📄 법령 전문 조회 중 (eflaw API)
📄 법령 전문 조회 완료 (~2000ms)
💾 [Phase 7] 캐시 저장 중 (searchKey: query:관세법 38조)
✅ 캐시 저장 완료
```

**예상 시간**: ~2000ms (API 호출)

---

### 2️⃣ 두 번째 검색 (동일 검색어) ⭐ 핵심 테스트!

**입력**: `관세법 38조`

**예상 동작**:
```
[Phase 7] 캐시 조회 (검색어): "관세법 38조"
✅ 캐시 HIT (검색어): "관세법" (495개 조문)
💾 [Phase 7] IndexedDB 캐시 HIT (25ms) - API 호출 없음!
```

**예상 시간**: ~25ms (80배 개선!)

**확인 사항**:
- ✅ 로딩 속도가 매우 빠름
- ✅ API 호출 없음 (Network 탭에서 확인)
- ✅ 법령 내용 정확히 표시

---

### 3️⃣ 오타 검색 (정규화 후 매칭)

**입력**: `관셰법 38조`

**예상 동작**:
```
검색어 정규화: "관셰법 38조" → "관세법 38조"
[Phase 7] 캐시 조회 (검색어): "관세법 38조"
✅ 캐시 HIT (검색어): "관세법" (495개 조문)
💾 [Phase 7] IndexedDB 캐시 HIT (30ms) - API 호출 없음!
```

**예상 시간**: ~30ms (정규화 + 캐시)

---

### 4️⃣ 다른 조항 (같은 법령)

**입력**: `관세법 322조`

**예상 동작**:
```
[Phase 7] 캐시 조회 (검색어): "관세법 322조"
❌ 캐시 MISS (검색어): "관세법 322조"  ← 다른 검색어
❌ [Phase 7] IndexedDB 캐시 MISS (~5ms) - L0~L4 검색 진행
✨ L1 직접 매핑 HIT  ← lawId 캐시
💾 법령 본문 캐시 HIT (lawId 기반)  ← 같은 법령
```

**예상 시간**: ~30ms (L1 + IndexedDB lawId 캐시)

---

### 5️⃣ 브라우저 DevTools 확인

**Chrome DevTools > Application > IndexedDB > LexDiffCache > lawContentCache**

확인 항목:
- ✅ `key`: `001556_` (lawId 기반)
- ✅ `searchKey`: `query:관세법 38조` (NEW!)
- ✅ `normalizedQuery`: `관세법 38조` (NEW!)
- ✅ `lawTitle`: `관세법`
- ✅ `articles`: [...] (495개)
- ✅ `timestamp`: 최근 시간

---

## 🐛 문제 해결

### IndexedDB 마이그레이션 안됨
**증상**: searchKey 인덱스가 없음

**해결**:
1. Chrome DevTools > Application > IndexedDB
2. LexDiffCache 우클릭 > Delete database
3. 페이지 새로고침 (DB_VERSION 3으로 재생성)

---

### 캐시 HIT 안됨
**증상**: 두 번째 검색도 API 호출

**확인**:
1. Console에 `[Phase 7]` 로그가 있는지
2. IndexedDB에 데이터가 저장되었는지
3. searchKey가 `query:관세법 38조` 형식인지

---

### 정규화 안됨
**증상**: "관셰법" 검색 시 캐시 MISS

**확인**:
1. `search-normalizer.ts`에 "셰" → "세" 매핑 있는지
2. Console에 정규화 로그 확인

---

## 📊 성능 측정

### Chrome DevTools > Performance
1. 녹화 시작
2. "관세법 38조" 검색 (첫 검색)
3. 녹화 정지 → API 호출 시간 확인 (~2000ms)
4. 녹화 시작
5. "관세법 38조" 다시 검색 (두 번째)
6. 녹화 정지 → IndexedDB 시간 확인 (~25ms)

---

## ✅ 성공 기준

1. ✅ 첫 검색: ~2000ms (변화 없음)
2. ✅ 두 번째 검색: **< 50ms** (80배 개선!)
3. ✅ API 호출 없음 (Network 탭 확인)
4. ✅ 법령 내용 정확히 표시
5. ✅ 오타 검색도 작동

---

## 🎉 예상 결과

**Before**:
- 1회 검색: 2000ms
- 2회 검색: 2000ms ❌

**After**:
- 1회 검색: 2000ms
- 2회 검색: **25ms** ✅ (80배 개선!)
