# Phase 7 수정 계획

## 🐛 발견된 문제들

### 1. 벡터 검색 클라이언트 에러 ❌
**증상**:
```
Error: ❌ lib/db.ts는 클라이언트에서 사용할 수 없습니다.
at vector-search.ts import
```

**원인**:
- `app/page.tsx` 756, 827번 줄에서 `vector-search.ts`를 직접 import
- 조례 검색 실패 시 유사 검색어 제안용
- 클라이언트에서 실행되므로 `db.ts` import 불가

**해결**:
- ❌ 벡터 검색 부분 제거 (조례는 벡터 검색 불필요)
- 또는 API 라우트로 이동 (나중에)

---

### 2. Phase 7 캐시 HIT 실패 ❌❌ (핵심!)

**증상**:
```
1회: 관세법 제38조 → 저장 (searchKey: query:관세법 제38조)
2회: 관세법 38조   → MISS  (searchKey: query:관세법 38조)
```

**원인**:
- 저장: API 응답 "관세법 **제**38조" → `query:관세법 제38조`
- 조회: 사용자 입력 "관세법 38조" → `query:관세법 38조`
- **searchKey 불일치!**

**근본 원인**:
`normalizeSearchQuery()`가 조문 번호를 통일하지 않음

**해결**:
1. `normalizeSearchQuery()`에 조문 번호 정규화 추가
   - "38조" → "제38조"
   - "제38조" → "제38조" (유지)
   - "10조의2" → "제10조의2"

2. 또는 저장 시 `rawQuery`를 정규화해서 저장
   - 현재: API 응답 그대로 저장
   - 수정: 사용자 입력 기준으로 저장

---

## ✅ 수정 계획

### Step 1: 벡터 검색 에러 제거 (5분)

**파일**: `app/page.tsx`

**변경**:
```typescript
// 756, 827번 줄 - 벡터 검색 부분 제거 또는 주석 처리
// 조례는 벡터 검색 불필요 (Phase 5/6는 법령만)
try {
  // const { searchSimilarQueries } = await import('@/lib/vector-search')
  // ... 제거
} catch (vectorError) {
  debugLogger.warning('벡터 검색 실패, 일반 에러 표시', vectorError)
}

// 간단하게 에러만 표시
reportError(
  "조례 검색",
  new Error(`검색 결과를 찾을 수 없습니다: ${query.lawName}`),
  { query: query.lawName, searchType: "조례", resultCount: 0 },
  apiLogs,
)
```

---

### Step 2: 조문 번호 정규화 추가 (15분) ⭐

**옵션 A: normalizeSearchQuery() 수정 (권장)**

**파일**: `lib/search-normalizer.ts`

**추가**:
```typescript
/**
 * 조문 번호를 표준 형식으로 정규화
 * "38조" → "제38조"
 * "10조의2" → "제10조의2"
 */
function normalizeArticleNumber(text: string): string {
  // "숫자+조" 패턴을 "제+숫자+조"로 변환
  return text.replace(/(\s)(\d+조(?:의\d+)?)/g, '$1제$2')
}

export function normalizeSearchQuery(value: string): string {
  // 기존 정규화
  let result = normalizeWhitespace(value)
  result = normalizeBasicTypos(result)
  result = normalizePunctuation(result)

  // 조문 번호 정규화 추가!
  result = normalizeArticleNumber(result)

  return result
}
```

**테스트**:
```
입력: "관세법 38조"
출력: "관세법 제38조" ✅

입력: "관세법 제38조"
출력: "관세법 제38조" ✅ (이미 정규화됨)

입력: "관세법 10조의2"
출력: "관세법 제10조의2" ✅
```

---

**옵션 B: 저장 시 rawQuery 정규화 (대안)**

**파일**: `app/page.tsx`

**변경**:
```typescript
// 651번 줄
setLawContentCache(
  cachedData.lawId,
  effectiveDate,
  parsedData.meta,
  parsedData.articles,
  rawQuery  // ← 이미 사용자 입력 (정규화 필요 없음)
)

// 문제: API 응답에는 "제38조"로 오므로 여전히 불일치
// → 옵션 A가 더 나음!
```

---

### Step 3: IndexedDB 캐시 테스트 (10분)

**테스트 순서**:
1. 브라우저 DevTools > Application > IndexedDB > LexDiffCache 삭제
2. 페이지 새로고침 (DB_VERSION 3 재생성)
3. "관세법 38조" 검색 (첫 검색)
   - 확인: searchKey = `query:관세법 제38조`
4. "관세법 38조" 다시 검색 (두 번째)
   - 예상: `💾 [Phase 7] IndexedDB 캐시 HIT`
   - 예상 시간: ~25ms

---

## 🎯 최종 확인 사항

### 정규화 테스트:
```javascript
// 브라우저 콘솔
import { normalizeSearchQuery } from '@/lib/search-normalizer'

console.log(normalizeSearchQuery('관세법 38조'))
// 기대: "관세법 제38조"

console.log(normalizeSearchQuery('관셰법 10조의2'))
// 기대: "관세법 제10조의2"
```

### IndexedDB 확인:
```
DevTools > Application > IndexedDB > LexDiffCache > lawContentCache

Entry:
  key: "001556_"
  searchKey: "query:관세법 제38조"  ← 중요!
  normalizedQuery: "관세법 제38조"
  lawTitle: "관세법"
  articles: [...]
```

### 성능 확인:
```
1회: "관세법 38조" → ~2000ms (API)
2회: "관세법 38조" → ~25ms (캐시) ✅
3회: "관셰법 38조" → ~30ms (정규화 + 캐시) ✅
```

---

## 📝 구현 순서

1. ✅ 벡터 검색 에러 제거 (app/page.tsx)
2. ✅ 조문 번호 정규화 추가 (search-normalizer.ts)
3. ✅ 테스트 및 검증

**예상 시간**: ~30분
