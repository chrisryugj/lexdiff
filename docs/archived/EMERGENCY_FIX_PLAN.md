# 긴급 수정 계획 (2025-11-11)

## 🔴 현재 문제 상황

### 증상
1. **모든 법령에서 최초 검색 시 "검색결과 없음" + 1조 표시**
2. **형법 → 군에서의 형의 집행... 법령으로 잘못 연결**
3. **세법 → 목록 제안 없이 개별소비세법으로 바로 연결**
4. **관세법 38조 → "없다는 메시지" + 관세법 1조 연결**

### 근본 원인

#### 원인 1: Phase 7 조문 검증 버그
**파일**: [app/page.tsx:576-593](app/page.tsx#L576-L593)

```typescript
// BEFORE (버그):
const parsedData = {
  selectedJo: query.jo,  // ← 무조건 설정 (조문 존재 확인 안 함)
}

if (query.jo && parsedData.selectedJo === undefined) {
  // ← 절대 실행 안됨! selectedJo가 이미 설정되어 있음
  setArticleNotFound({...})
}
```

**문제**:
- 조문이 있든 없든 `selectedJo` 설정
- 실제 조문 없어도 에러 없이 진행
- LawViewer가 조문 못 찾으면 **1조 표시**

#### 원인 2: Phase 5 잘못된 법령 반환
**파일**: Phase 5 intelligent-search API

**문제**:
- 학습 데이터 기반 검색이 잘못된 법령 반환
- "형법" → "군에서의 형의 집행..." (lawId: 000912)
- 학습 데이터가 오염되어 있음

#### 원인 3: 기본 검색 매칭 로직
**파일**: [app/page.tsx:860-891](app/page.tsx#L860-L891)

**문제**:
- 유사도 임계값이 너무 낮음
- startsWith 로직이 너무 넓음
- 잘못된 법령이 자동 선택됨

---

## ✅ 해결 방법

### 방법 1: Phase 5/6/7 완전 비활성화 (즉시 적용) ⭐ **추천**

**개념**:
- Phase 적용 **전** 상태로 복귀
- 기본 law-search만 사용
- 학습 시스템 완전 제거

**장점**:
- 즉시 적용 가능
- 문제 완전 해결
- 안정적인 검색

**단점**:
- Phase 5/6/7의 성능 개선 포기
- 캐시 없음 (매번 API 호출)

**적용 방법**:
```typescript
// app/page.tsx에서 Phase 7/5 로직 주석 처리
// 기본 검색만 사용
```

---

### 방법 2: Phase 7만 수정, Phase 5/6 비활성화 (권장) ⭐

**개념**:
- Phase 7 (IndexedDB 캐시)만 유지 (버그 수정)
- Phase 5 (Intelligent Search) 비활성화
- Phase 6 (벡터 검색) 비활성화

**장점**:
- Phase 7 캐시 성능 개선 유지 (~25ms)
- 학습 시스템 문제 제거
- 안정적인 검색

**단점**:
- Phase 5/6의 오타 교정 기능 포기

**적용 방법**:
1. Phase 7 조문 검증 버그 수정
2. Phase 5 intelligent-search 비활성화
3. 기본 검색 매칭 로직 강화

---

### 방법 3: 모든 Phase 유지 + 전면 수정 (장기)

**개념**:
- Phase 5/6/7 모두 유지
- 버그 전부 수정
- 학습 시스템 개선

**장점**:
- 모든 성능 개선 유지
- 오타 교정, 캐시, 학습 모두 작동

**단점**:
- 수정 시간 오래 걸림 (2-3시간)
- 복잡도 증가
- 새로운 버그 가능성

**적용 방법**:
1. Phase 7 조문 검증 버그 수정
2. Phase 5 신뢰도 점수 시스템 도입
3. Phase 6 벡터 검색 개선
4. 전체 테스트

---

## 🚀 즉시 적용: 방법 2 (Phase 7만 유지)

### Step 1: Phase 5/6 비활성화

**파일**: [app/page.tsx](app/page.tsx)

```typescript
// Line 617-800: Phase 5 intelligent-search 주석 처리
// ⬇️ 이 부분 전체 주석:
/*
try {
  const intelligentResponse = await fetch('/api/intelligent-search', {...})
  ...
} catch (error) {
  ...
}
*/

// ⬇️ 바로 기본 검색으로 진행:
// 조례 검색과 법령 검색 분기
if (isOrdinanceQuery) {
  // 조례 검색 (기존 로직)
} else {
  // 법령 검색 (기존 로직)
  const apiUrl = "/api/law-search?query=" + encodeURIComponent(lawName)
  const response = await fetch(apiUrl)
  ...
}
```

### Step 2: Phase 7 조문 검증 버그 수정

**파일**: [app/page.tsx:572-593](app/page.tsx#L572-L593)

```typescript
// BEFORE:
const parsedData = {
  meta: cachedContent.meta,
  articles: cachedContent.articles,
  selectedJo: query.jo,  // ← 버그!
}

// AFTER:
let selectedJo: string | undefined = undefined

if (query.jo) {
  // 실제로 조문이 있는지 확인
  const targetArticle = cachedContent.articles.find(a => a.jo === query.jo)
  if (targetArticle) {
    selectedJo = targetArticle.jo
  } else {
    // 조문 없음 처리
    const { findNearestArticles } = await import('@/lib/article-finder')
    const nearestArticles = findNearestArticles(query.jo, cachedContent.articles)

    setArticleNotFound({
      requestedJo: query.jo,
      lawTitle: cachedContent.meta.lawTitle,
      nearestArticles,
      crossLawSuggestions: [],
    })

    debugLogger.warning(`조문 없음: ${query.jo}`)
  }
}

const parsedData = {
  meta: cachedContent.meta,
  articles: cachedContent.articles,
  selectedJo,  // ← 수정: 조문이 있을 때만 설정
}
```

### Step 3: 기본 검색 매칭 로직 확인

**파일**: [app/page.tsx:860-891](app/page.tsx#L860-L891)

**이미 수정됨**:
- 유사도 기반 매칭 ✅
- 짧은 검색어 임계값 85% ✅
- 매칭 실패 시 사용자 선택 UI ✅

---

## 📊 예상 결과

### 수정 전:
```
형법 22조 검색:
→ Phase 5가 "군에서의 형의 집행..." 반환
→ 22조 없음 → 1조 표시 ❌
```

### 수정 후:
```
형법 22조 검색:
→ Phase 5 비활성화
→ 기본 law-search API 호출
→ 유사도 매칭: "형법" (100%) ✅
→ 제22조 (살인) 내용 표시 ✅
```

---

## 🧪 테스트 시나리오

### 1. 형법 22조
```
예상:
🔍 [법령 검색] 검색어: "형법", 결과: N개
   정확 매칭: 형법 ✅
→ 제22조 (살인) 내용 표시
```

### 2. 세법
```
예상:
🔍 [법령 검색] 검색어: "세법", 결과: N개
   정확 매칭: 없음
   유사도 매칭: 없음 (최소 85% 필요)
⚠️ 사용자 선택 필요
→ 법령 선택 UI 표시 (개별소비세법, 부가가치세법, 법인세법, ...)
```

### 3. 관세법 38조
```
예상:
🔍 [법령 검색] 검색어: "관세법", 결과: N개
   정확 매칭: 관세법 ✅
🔍 [조문 검색] 요청: jo=003800
   조문 검색 결과: ✅ 발견
→ 제38조 내용 표시
```

### 4. 전기통신사업법 35조의2
```
예상:
🔍 [법령 검색] 검색어: "전기통신사업법", 결과: N개
   정확 매칭: 전기통신사업법 ✅
📄 [파싱 완료] 전기통신사업법: N개 조문
   조의 조문 X개: 003502(제35조의2), ...
🔍 [조문 검색] 요청: jo=003502
   조문 검색 결과: ✅ 발견
→ 제35조의2 내용 표시
```

---

## 📝 작업 순서

1. ✅ **모든 학습 데이터 초기화** (완료)
   ```bash
   node reset-all-learning.mjs
   ```

2. **Phase 5/6 비활성화** (코드 수정)
   - `app/page.tsx`: intelligent-search 주석 처리

3. **Phase 7 조문 검증 버그 수정** (코드 수정)
   - `app/page.tsx`: selectedJo 로직 수정

4. **서버 재시작**
   ```cmd
   restart-server.cmd
   ```

5. **브라우저 캐시 초기화**
   - IndexedDB 삭제
   - Ctrl + Shift + R

6. **테스트**
   - 형법 22조
   - 세법
   - 관세법 38조
   - 전기통신사업법 35조의2

---

## 💡 향후 계획

### 단기 (1주일)
- 기본 검색 안정화
- Phase 7만 사용 (캐시)
- 사용자 피드백 수집

### 중기 (1개월)
- Phase 5 재설계
  - 신뢰도 점수 시스템
  - 자동 검증
- Phase 6 개선
  - 벡터 검색 정확도 향상

### 장기 (3개월)
- 전체 시스템 안정화
- 학습 데이터 품질 관리
- 모니터링 대시보드
