# 발견된 문제와 해결

## ✅ 해결 완료

### 1. "엄" → "업" 오타 매핑 추가
**문제**: "전기통신사엄법" 검색 시 정규화 안됨

**해결**: `search-normalizer.ts`에 추가
```typescript
["엄", "업"],
["얼", "업"],
```

---

## 🔍 조사 필요

### 2. "35조의2" 첫 검색 시 조문 없음
**증상**:
- 첫 검색: "35조의2 없음, 35조 제안"
- 두 번째 검색: "35조의2 정상 표시" (Phase 7 캐시)

**분석**:
- JO 파싱: 정상 (003502)
- Phase 7 정규화: 정상 (제35조의2)
- 캐시된 데이터: 정상 (두 번째 검색 성공)

**가능성 1**: API 응답 파싱 오류
- `parseLawJSON()` 함수에서 조문 누락 가능성
- 특정 조문 형식 (예: "의2") 파싱 실패

**가능성 2**: 일시적 API 오류
- 첫 요청 시 불완전한 응답
- 재시도 시 정상

**가능성 3**: 비동기 타이밍 이슈
- articles 배열 로딩 전에 selectedJo 검색
- 캐시 저장은 성공했지만 화면 표시 실패

**확인 방법**:
1. 브라우저에서 "전기통신사업법 35조의2" 검색
2. DevTools > Console 에서 로그 확인:
   ```
   parseLawJSON 완료
   articles: [...] ← 여기서 jo="003502" 있는지 확인
   selectedJo: undefined or 003502
   ```

---

## ✅ Phase 6 작동 확인

**사용자 진단**: "벡터 쪽이 제대로 작동 안함"

**실제 상태**:
```bash
node check-vector-db.mjs
```
결과:
- ✅ embedding_cache: 5개
- ✅ search_query_embeddings: 2개
- ✅ "관셰법 38조" 임베딩 저장됨

**결론**: Phase 6는 정상 작동 중!

**오해의 원인**:
- Voyage AI 사용량이 적어서 작동 안하는 것처럼 보임
- 하지만 embedding_cache 덕분에 API 호출 최소화됨 (의도된 동작)

---

## 🎯 Phase 6 실제 작동 테스트

**방법**: 완전히 새로운 검색어 사용

### Step 1: 새 검색어 입력
**입력**: `형법 250조`

**예상**:
```
[Vector Search] Generated new embedding (6 tokens, cached: false) ← 새 임베딩!
✅ Step 4 완료: Embedding stored (6 tokens)
```

### Step 2: Voyage AI 확인
- Dashboard: https://dash.voyageai.com/usage
- 오늘 날짜에 +1 API 호출 확인

### Step 3: Turso DB 확인
```bash
node check-vector-db.mjs
```
- embedding_cache: 6개 (이전 5개 + 새 1개)

### Step 4: 오타로 벡터 매칭 확인
**입력**: `형뻡 250조` (오타)

**예상**:
```
정규화: "형법 250조"
[Vector Search] Found 1 similar queries ← 벡터 매칭!
[Vector Search] Top result: "형법 제250조" (similarity: 0.95)
🎯 [L0 Vector] Match found
```

---

## 📊 현재 상태 요약

| 기능 | 상태 | 증거 |
|------|------|------|
| Phase 5 (캐시) | ✅ | search_results 테이블 증가 |
| Phase 6 (벡터) | ✅ | embedding_cache 5개 |
| Phase 7 (IndexedDB) | ✅ | 2회 검색 ~25ms |
| 오타 정규화 | ✅ | "셰"→"세", "엄"→"업" 추가 |
| 35조의2 문제 | 🔍 | 조사 필요 (재현 확인) |

---

## 🐛 재현 테스트

### 테스트 1: "전기통신사업법 35조의2"
1. IndexedDB 삭제
2. "전기통신사업법 35조의2" 검색
3. 조문 표시 확인
4. 다시 검색 → Phase 7 캐시 HIT 확인

### 테스트 2: "전기통신사엄법 35조의2" (오타)
1. 검색
2. 정규화 로그 확인: "전기통신사업법"으로 변환되는지
3. 벡터 검색 또는 API 호출 성공 확인

---

## 💡 추가 개선 사항

### 1. 조문 파싱 로깅 강화
**목적**: "35조의2" 문제 디버깅

**추가**:
```typescript
// parseLawJSON() 완료 시
console.log(`📄 파싱 완료: ${articles.length}개 조문`);
console.log(`   JO 코드 범위: ${articles[0]?.jo} ~ ${articles[articles.length-1]?.jo}`);

// selectedJo 검색 시
console.log(`🔍 조문 검색: jo=${query.jo}`);
const found = articles.find(a => a.jo === query.jo);
console.log(`   결과: ${found ? '발견' : '없음'}`);
```

### 2. 벡터 검색 활동 로그
**목적**: 사용자가 Phase 6 작동 여부를 쉽게 확인

**추가**:
```typescript
// 새 임베딩 생성 시
debugLogger.info(`🚀 [Voyage AI] 새 임베딩 생성: "${query}" (${tokens} tokens)`);

// 캐시 사용 시
debugLogger.success(`💾 [Voyage AI] 캐시 사용: "${query}" (API 호출 없음)`);
```

---

## ✅ 다음 단계

1. ✅ "엄" → "업" 오타 매핑 추가 (완료)
2. 🔍 "35조의2" 문제 재현 테스트
3. 📊 Phase 6 작동 명확히 확인 (새 검색어 테스트)
4. 💡 로깅 강화 (선택사항)
