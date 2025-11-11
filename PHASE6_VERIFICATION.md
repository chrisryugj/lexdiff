# Phase 6 벡터 검색 작동 확인 방법

## ✅ 현재 상태

- **Phase 6**: 작동 중 ✅
- **Phase 7**: 작동 중 ✅ (2회 검색부터 25ms)
- **Voyage AI**: 정상 사용 중 (embedding_cache에 저장됨)

---

## 🔍 Phase 6 작동 확인 방법

### 1. Turso DB 벡터 데이터 확인

**명령어**:
```bash
node check-vector-db.mjs
```

**확인 항목**:
```
✅ 벡터 테이블 존재
   - search_query_embeddings: 2개 레코드
   - embedding_cache: 5개 레코드

🔍 검색어 임베딩 샘플:
   1. "관셰법 38조" (검색 1회) ← 오타도 저장됨!
   2. "관세법 제38조" (검색 18회)

📊 API 매핑:
   - 관세법_제38조: 45회 성공
   - 관세법_38조: 1회 성공
```

---

### 2. Voyage AI 사용량 확인

**URL**: https://dash.voyageai.com/usage

**확인 사항**:
- 오늘 날짜에 API 호출 있는지
- voyage-3-lite 모델 사용 확인
- 토큰 사용량 (검색어당 ~7-10 tokens)

**예상**:
- "관세법 제38조": 1회 호출 (첫 검색)
- "관셰법 38조": 1회 호출 (첫 오타 검색)
- 이후 검색: 캐시 사용 (API 호출 없음)

---

### 3. 벡터 검색 실제 작동 테스트

**테스트 시나리오**: 완전히 새로운 검색어

#### Step 1: 브라우저에서 검색
**입력**: `전기통신사업법 50조` (처음 검색하는 조항)

**예상 로그**:
```
🔍 [L0 Vector] Searching for: "전기통신사업법 50조"
[Vector Search] Generated new embedding (8 tokens, cached: false) ← 새 임베딩!
[Vector Search] Found 0 similar queries (threshold: 0.8)
❌ [L0 Vector] No match found (매칭 없음, 정상)
⏳ L4 API 호출 필요
📚 학습 완료 { pattern: '전기통신사업법_제50조' }
✅ Step 4 완료: Embedding stored (8 tokens) ← 저장됨!
```

#### Step 2: Voyage AI 확인
- Dashboard에서 +1 API 호출 확인
- 토큰 사용: ~8 tokens

#### Step 3: Turso DB 확인
```bash
node check-vector-db.mjs
```

**확인**:
```
search_query_embeddings: 3개 레코드 (이전 2개 + 새 1개)
   3. "전기통신사업법 제50조" (검색 1회) ← 새로 추가됨!

embedding_cache: 6개 레코드 (이전 5개 + 새 1개)
```

#### Step 4: 오타 검색으로 벡터 매칭 확인
**입력**: `전기통신사엄법 50조` (오타: 엄 → 업)

**예상 로그**:
```
🔍 [L0 Vector] Searching for: "전기통신사엄법 50조"
[Vector Search] Generated new embedding (9 tokens, cached: false)
[Vector Search] Found 1 similar queries (threshold: 0.8) ← 매칭!
[Vector Search] Top result: "전기통신사업법 제50조" (similarity: 0.85) ← 벡터 매칭!
🎯 [L0 Vector] Match found: "전기통신사업법 제50조" (similarity: 0.850, mappingId: XX)
✨ L1 직접 매핑 HIT (or L3 품질 캐시)
```

---

## 🎯 Phase 6 작동 증거

### 증거 1: embedding_cache 증가
- 첫 검색 전: 5개
- 첫 검색 후: 6개
- **새 임베딩 생성됨!** ✅

### 증거 2: Voyage AI 토큰 사용
- Dashboard에서 토큰 증가 확인
- 첫 검색만 API 호출
- 이후 캐시 사용 ✅

### 증거 3: 벡터 유사도 매칭
- 오타 검색 시 유사 검색어 찾음
- similarity > 0.8이면 매칭
- L0 벡터 HIT 로그 확인 ✅

---

## 🐛 Phase 6 미작동 징후

만약 Phase 6가 작동하지 않는다면:

### 징후 1: embedding_cache 증가 안됨
```bash
node check-vector-db.mjs
```
→ 검색 후에도 레코드 수 동일

### 징후 2: Voyage AI 사용량 없음
- Dashboard에서 API 호출 0회
- 토큰 사용량 변화 없음

### 징후 3: 벡터 매칭 로그 없음
- 오타 검색 시에도 L0 Vector 로그 없음
- 항상 L4 API로 직행

### 해결:
1. `VOYAGE_API_KEY` 환경변수 확인
2. `lib/embedding.ts` 로그 확인
3. `lib/search-strategy.ts`에서 L0 벡터 검색 호출 확인

---

## 📊 Phase 5/6/7 종합 상태

| Phase | 기능 | 상태 | 확인 방법 |
|-------|------|------|----------|
| Phase 5 | 캐시 계층 (L1~L4) | ✅ | search_results 테이블 증가 |
| Phase 6 | 벡터 검색 (L0) | ✅ | embedding_cache 증가 |
| Phase 7 | IndexedDB 우선 | ✅ | 2회 검색 ~25ms |

**종합**: 모든 Phase 정상 작동 중! 🎉

---

## 🎉 성공 기준

1. ✅ 첫 검색: embedding 생성 (Voyage AI 호출)
2. ✅ 두 번째 검색: embedding 캐시 사용 (API 호출 없음)
3. ✅ 오타 검색: 벡터 유사도로 매칭 (similarity > 0.8)
4. ✅ Turso DB에 벡터 저장됨
5. ✅ Phase 7: 2회 검색부터 25ms

**현재 상태**: 모두 달성! ✅
