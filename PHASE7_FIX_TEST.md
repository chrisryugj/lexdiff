# Phase 7 수정 완료 - 테스트 가이드

## ✅ 수정 완료 항목

### 1. 벡터 검색 클라이언트 에러 제거 ✅
- **파일**: `app/page.tsx` (756, 797번 줄)
- **변경**: 클라이언트에서 `vector-search.ts` import 제거
- **결과**: 벡터 검색 에러 없음

### 2. 조문 번호 정규화 추가 ✅
- **파일**: `lib/search-normalizer.ts`
- **기능**: `normalizeArticleNumber()` 함수 추가
- **효과**: "38조" → "제38조" 자동 변환

### 3. 디버그 로그 강화 ✅
- **파일**: `lib/law-content-cache.ts`
- **추가**: `rawQuery`, `normalizedQuery`, `searchKey` 로그
- **목적**: rawQuery가 전달되는지 확인

---

## 🧪 테스트 순서

### Step 1: 브라우저 준비
1. Chrome DevTools 열기 (F12)
2. Console 탭 열기
3. Application > IndexedDB > LexDiffCache 우클릭 > Delete database
4. 페이지 새로고침 (Ctrl+R)

---

### Step 2: 첫 검색 (캐시 저장)
**입력**: `관세법 38조`

**확인할 로그**:
```
🔍 [Phase 7] 캐시 조회 (검색어): "관세법 제38조"  ← 정규화 확인!
❌ 캐시 MISS (검색어): "관세법 제38조"
⏳ L4 API 호출 필요
📄 법령 전문 조회 중
📄 법령 전문 조회 완료 (~2000ms)
💾 [Phase 7] 캐시 저장 중: 관세법
   {
     lawId: "001556",
     articles: 495,
     rawQuery: "관세법 38조",           ← 확인!
     normalizedQuery: "관세법 제38조",  ← 확인!
     searchKey: "query:관세법 제38조",  ← 확인!
   }
✅ 캐시 저장 완료
```

**중요**:
- ✅ rawQuery가 "❌ 없음"이 아니어야 함!
- ✅ normalizedQuery가 "관세법 **제**38조"여야 함 (제 포함)
- ✅ searchKey가 `query:관세법 제38조`여야 함

---

### Step 3: IndexedDB 확인
1. Application > IndexedDB > LexDiffCache > lawContentCache
2. 저장된 Entry 클릭

**확인 항목**:
```json
{
  "key": "001556_",
  "searchKey": "query:관세법 제38조",  ← 중요!
  "normalizedQuery": "관세법 제38조",
  "lawTitle": "관세법",
  "articles": [...495개],
  "timestamp": 1699999999999
}
```

---

### Step 4: 두 번째 검색 (캐시 HIT) ⭐ 핵심!
**입력**: `관세법 38조` (동일한 검색어)

**예상 로그**:
```
🔍 [Phase 7] 캐시 조회 (검색어): "관세법 제38조"  ← 정규화됨
✅ 캐시 HIT (검색어): "관세법" (495개 조문)
💾 [Phase 7] IndexedDB 캐시 HIT (25ms) - API 호출 없음!
```

**확인**:
- ✅ "API 호출 없음!" 메시지가 나타남
- ✅ 로딩이 즉시 완료 (~25ms)
- ✅ Network 탭에 API 호출 없음

---

### Step 5: 오타 테스트
**입력**: `관셰법 38조`

**예상**:
```
정규화: "관셰법 38조" → "관세법 제38조"
🔍 [Phase 7] 캐시 조회 (검색어): "관세법 제38조"
✅ 캐시 HIT (검색어): "관세법" (495개 조문)
💾 [Phase 7] IndexedDB 캐시 HIT (30ms) - API 호출 없음!
```

---

## 🐛 문제 해결

### 문제 1: rawQuery가 "❌ 없음"
**증상**: 캐시 저장 시 `rawQuery: "❌ 없음"`

**원인**: `app/page.tsx`에서 `setLawContentCache()`에 rawQuery 전달 안됨

**확인**:
```typescript
// app/page.tsx 651번 줄
setLawContentCache(
  cachedData.lawId,
  effectiveDate,
  parsedData.meta,
  parsedData.articles,
  rawQuery  // ← 이게 있는지 확인!
)
```

---

### 문제 2: searchKey가 여전히 다름
**증상**: 첫 검색 `query:관세법 38조`, 두 번째 `query:관세법 제38조`

**원인**: `normalizeArticleNumber()` 정규식 오류

**확인**:
```javascript
// 브라우저 콘솔에서 테스트
const text = "관세법 38조";
const result = text.replace(/(\s)(\d+조(?:의\d+)?)/g, '$1제$2');
console.log(result);  // "관세법 제38조" 나와야 함
```

---

### 문제 3: 두 번째 검색도 MISS
**증상**: IndexedDB에 저장되었는데도 MISS

**확인 1**: IndexedDB에 searchKey 인덱스가 있는지
```
Application > IndexedDB > LexDiffCache > lawContentCache
우클릭 > Show indexes
→ searchKey 인덱스가 있어야 함
```

**확인 2**: 실제 저장된 searchKey 값
```
IndexedDB > lawContentCache > 첫 entry 클릭
→ searchKey 필드 확인
```

---

## ✅ 성공 기준

1. ✅ 벡터 검색 에러 없음
2. ✅ 첫 검색: rawQuery 전달됨
3. ✅ 정규화: "38조" → "제38조"
4. ✅ IndexedDB: searchKey 저장됨
5. ✅ 두 번째 검색: **~25ms 이내** ⭐
6. ✅ API 호출 없음
7. ✅ 오타도 작동: "관셰법" → "관세법 제38조"

---

## 📊 예상 결과

**Before (Phase 7 적용 전)**:
- 1회: 2000ms (API)
- 2회: 2000ms (API) ❌
- 3회: 2000ms (API) ❌

**After (Phase 7 적용 후)**:
- 1회: 2000ms (API)
- 2회: **25ms** (IndexedDB) ✅ 80배 개선!
- 3회: **25ms** (IndexedDB) ✅
