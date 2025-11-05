# LexDiff 검색 피드백 학습 시스템 구현 계획

> **작성일**: 2025-11-05
> **목적**: 검색 결과 학습을 통한 성능 향상 및 자연어 검색 지원
> **예상 소요**: 2-3주 (Phase별 병렬 진행 가능)

---

## 📋 목차

1. [프로젝트 개요](#프로젝트-개요)
2. [핵심 아키텍처](#핵심-아키텍처)
3. [기술 스택](#기술-스택)
4. [데이터베이스 설계](#데이터베이스-설계)
5. [검색 전략](#검색-전략)
6. [구현 로드맵](#구현-로드맵)
7. [성능 목표](#성능-목표)
8. [비용 분석](#비용-분석)

---

## 프로젝트 개요

### 현재 문제점

1. **일시적 캐싱**: 검색 결과가 1시간 후 만료 (localStorage/HTTP cache)
2. **반복 API 호출**: 동일/유사 검색 시 매번 law.go.kr API 재호출
3. **품질 측정 불가**: 검색 정확도를 정량적으로 측정할 수 없음
4. **학습 불가능**: 사용자 피드백을 활용한 개선 메커니즘 없음
5. **자연어 미지원**: "관세법 38조"만 가능, "수입물품 관세 납부 방법은?" 불가

### 목표

#### 1차 목표 (Phase 1-5)
- ✅ 검색 결과 영구 저장 (Turso DB)
- ✅ 사용자 피드백 수집 (👍/👎)
- ✅ 검색 속도 400배 향상 (2000ms → 5ms)
- ✅ API 호출 95% 감소
- ✅ 무료 운영 가능

#### 2차 목표 (Phase 6-8)
- ✅ 벡터 DB 기반 유사 검색
- ✅ RAG 기반 자연어 검색
- ✅ LLM 기반 법령 질의응답
- ✅ 검색 품질 지속적 개선

---

## 핵심 아키텍처

### 5단계 Fallback 검색 전략

```
┌─────────────────────────────────────────────────────────────┐
│  사용자 검색 입력                                              │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  L0: 벡터 유사도 검색 (Vector Similarity)                      │
│  - 속도: ~5ms                                                 │
│  - 정확도: 95%+                                               │
│  - 조건: similarity >= 0.9                                    │
│  - API 호출: ❌                                               │
└────────────────────┬────────────────────────────────────────┘
                     ↓ MISS
┌─────────────────────────────────────────────────────────────┐
│  L1: 직접 API 매핑 (Direct Mapping)                           │
│  - 속도: ~5ms                                                 │
│  - 정확도: 90%+                                               │
│  - 조건: is_verified = true (positive >= 3)                  │
│  - API 호출: ❌                                               │
└────────────────────┬────────────────────────────────────────┘
                     ↓ MISS
┌─────────────────────────────────────────────────────────────┐
│  L2: 유사 검색어 매칭 (Variant Matching)                       │
│  - 속도: ~10ms                                                │
│  - 정확도: 85%+                                               │
│  - 조건: 자동 생성된 variant + fuzzy matching                 │
│  - API 호출: ❌                                               │
└────────────────────┬────────────────────────────────────────┘
                     ↓ MISS
┌─────────────────────────────────────────────────────────────┐
│  L3: 고품질 캐시 (Quality Cache)                              │
│  - 속도: ~30ms                                                │
│  - 정확도: 80%+                                               │
│  - 조건: quality_score >= 0.7, 최근 30일                      │
│  - API 호출: ❌                                               │
└────────────────────┬────────────────────────────────────────┘
                     ↓ MISS
┌─────────────────────────────────────────────────────────────┐
│  L4: API 호출 (API Call)                                      │
│  - 속도: 500-2000ms                                           │
│  - 정확도: 100%                                               │
│  - 조건: 모든 캐시 MISS                                        │
│  - API 호출: ✅ law.go.kr                                     │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  자동 학습 (Automatic Learning)                               │
│  1. API 파라미터 직접 매핑 저장                                │
│  2. 유사 검색어 자동 생성 (15-20개)                            │
│  3. 검색어 임베딩 생성 (Voyage AI)                             │
│  4. 법령 조문 임베딩 저장                                       │
│  5. 품질 점수 초기화 (0.5)                                     │
└─────────────────────────────────────────────────────────────┘
```

### 데이터 흐름

```
검색 입력
    ↓
정규화 (lib/search-normalizer.ts)
    ↓
파싱 (lib/law-parser.ts)
    ↓
패턴 생성 ("관세법_제38조")
    ↓
L0-L4 순차 조회
    ↓
결과 반환 + 전략 로깅
    ↓
사용자 피드백 (👍/👎)
    ↓
품질 점수 자동 업데이트
    ↓
검증 상태 갱신 (positive >= 3)
```

---

## 기술 스택

### 선정 기준

1. **무료 운영 가능**: 모든 티어에서 무료 제공
2. **충분한 용량**: 최소 5년 이상 무료 사용
3. **성능 우수**: 응답 시간 < 50ms
4. **Edge 지원**: 전 세계 동일한 품질

### 최종 스택

| 구성 요소 | 선택 | 무료 티어 | 선정 이유 |
|----------|------|----------|----------|
| **데이터베이스** | Turso (LibSQL) | 5 GB 저장<br>500M reads/월<br>10M writes/월 | - 저장공간 10배 (vs Vercel)<br>- Compute time 제약 없음<br>- 벡터 검색 내장<br>- Edge 복제 지원 |
| **벡터 임베딩** | Voyage AI (voyage-3-lite) | 200M 토큰 무료 | - 512차원 임베딩<br>- 배치 요청 지원<br>- 55년 사용 가능 |
| **LLM** | Google Gemini 2.5 Flash | 기존 사용 중 | - 이미 통합됨<br>- 빠른 응답<br>- 무료 티어 |
| **프레임워크** | Next.js 16 + React 19 | - | 현재 프로젝트 스택 |
| **UI 라이브러리** | shadcn/ui + Radix | - | 현재 프로젝트 스택 |

### 대안 비교

#### Vercel Postgres vs Turso

| 항목 | Vercel Postgres | Turso | 승자 |
|------|-----------------|-------|------|
| 저장공간 | 512 MB | 5 GB | ✅ Turso (10배) |
| Compute | 60시간/월 ⚠️ | 무제한 | ✅ Turso |
| 벡터 검색 | 확장 필요 | 네이티브 지원 | ✅ Turso |
| Edge | ❌ | ✅ | ✅ Turso |
| 사용 가능 기간 | 2-3개월 | 7년+ | ✅ Turso |

#### 임베딩 API 비교

| 제공자 | 무료 티어 | 모델 | 차원 |
|--------|----------|------|------|
| **Voyage AI** | 200M 토큰 | voyage-3-lite | 512 |
| Cohere | 100 calls/min (Trial) | embed-multilingual | 1024 |
| OpenAI | ❌ | text-embedding-3-small | 1536 |
| Google | AI Studio 무료 | text-embedding-004 | 768 |

**선택**: Voyage AI (가장 관대한 무료 티어)

---

## 데이터베이스 설계

### 스키마 개요

총 **12개 테이블** (기존 5개 + 확장 7개)

#### 기본 테이블 (검색 및 피드백)

1. **search_queries**: 모든 검색 쿼리 기록
2. **search_results**: 검색 결과 (법령 정보)
3. **delegation_connections**: 위임조문 연결 정보
4. **user_feedback**: 사용자 피드백 (👍/👎)
5. **search_quality_scores**: 품질 점수 집계

#### 확장 테이블 (매핑 및 학습)

6. **api_parameter_mappings**: API 파라미터 직접 매핑 (핵심!)
7. **similar_query_groups**: 유사 검색어 그룹
8. **query_variants**: 검색어 변형 (띄어쓰기, 오타 등)
9. **search_strategy_logs**: 전략별 성능 로그

#### 벡터 테이블 (RAG)

10. **search_query_embeddings**: 검색어 임베딩
11. **law_article_embeddings**: 법령 조문 임베딩
12. **embedding_cache**: 임베딩 재사용 캐시
13. **rag_context_logs**: RAG 사용 로그
14. **natural_language_patterns**: 자연어 패턴 학습

### 주요 설계 원칙

1. **정규화된 패턴**: "관세법_제38조" 형식으로 통일
2. **6-digit JO code**: 조문 식별자 (예: "003800")
3. **JSON 저장**: 복잡한 구조는 TEXT로 JSON 저장
4. **트리거 자동화**: 피드백 시 품질 점수 자동 업데이트
5. **인덱스 최적화**: 모든 조회 경로에 인덱스 설정

상세 스키마: [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)

---

## 검색 전략

### L0: 벡터 유사도 검색

**동작 방식**:
1. 입력 검색어 임베딩 생성 (Voyage AI)
2. libSQL의 `vector_top_k()` 함수로 유사 검색
3. Cosine similarity >= 0.9인 결과 반환
4. 매핑된 API 파라미터 즉시 사용

**장점**:
- 오타, 띄어쓰기 변형 자동 처리
- 자연어 쿼리 부분 지원
- 가장 정확한 의미 기반 매칭

**예시**:
```
입력: "관세법38조"
벡터 검색 결과:
  1. "관세법 제38조" (similarity: 0.98) ✅
  2. "관세법 제 38조" (similarity: 0.96)
  3. "관세법 38" (similarity: 0.89)
→ 1번 매핑 사용
```

### L1: 직접 API 매핑

**동작 방식**:
1. 정규화된 패턴으로 DB 조회
2. `is_verified = true` (positive >= 3) 조건 확인
3. 저장된 API 파라미터 직접 반환

**API 파라미터 구조**:
```json
{
  "lawId": "법령ID",
  "mst": "MST코드",
  "jo": "003800",
  "effectiveDate": "20240101",
  "hasDecree": true,
  "hasRule": true,
  "adminRuleIds": ["규칙ID1", "규칙ID2"]
}
```

**예시**:
```sql
SELECT api_params
FROM api_parameter_mappings
WHERE normalized_pattern = '관세법_제38조'
  AND is_verified = 1
```

### L2: 유사 검색어 매칭

**3단계 매칭**:

1. **정확 매칭**: `variant_query = '입력'`
2. **정규화 매칭**: `normalized_variant = '패턴'`
3. **퍼지 매칭**: Levenshtein distance 기반 (similarity >= 0.85)

**자동 생성 변형**:
```
원본: "관세법 제38조"

띄어쓰기 변형:
- "관세법 제38조" (confidence: 1.0)
- "관세법제38조" (confidence: 0.95)
- "관세법  제38조" (confidence: 0.9)

조문 표기 변형:
- "관세법 38조" (confidence: 1.0)
- "관세법 38" (confidence: 0.9)
- "관세법 제 38 조" (confidence: 0.8)

오타 변형:
- "광세법 제38조" (confidence: 0.7)
- "관세벚 제38조" (confidence: 0.7)
```

### L3: 고품질 캐시

**조회 조건**:
```sql
quality_score >= 0.7 AND
created_at > NOW() - 30 days
```

### L4: API 호출 + 자동 학습

**학습 프로세스**:
```typescript
async function learnFromSuccessfulSearch(result) {
  // 1. 직접 매핑 저장
  const mappingId = await saveApiMapping(result)

  // 2. 유사 검색어 그룹 생성
  const groupId = await createSimilarGroup(result)

  // 3. 변형 자동 생성 (15-20개)
  const variants = generateVariants(result.query)
  await saveVariants(groupId, variants)

  // 4. 검색어 임베딩 생성
  const embedding = await generateEmbedding(result.query)
  await saveQueryEmbedding(result.query, embedding, mappingId)

  // 5. 법령 조문 임베딩 (백그라운드)
  await saveLawArticleEmbedding(result.lawContent)
}
```

---

## 구현 로드맵

### Phase 1: Turso 설정 및 기본 스키마 (1일)

**작업 내용**:
- [ ] Turso CLI 설치 및 로그인
- [ ] DB 생성 (`lexdiff-feedback`)
- [ ] 환경변수 설정 (.env.local)
- [ ] 기본 테이블 마이그레이션 (1-5)
- [ ] 연결 테스트

**산출물**:
- `lib/db.ts`: DB 클라이언트
- `db/migrations/001_basic_schema.sql`
- 환경변수 설정 완료

**검증**:
```bash
turso db show lexdiff-feedback
turso db shell lexdiff-feedback "SELECT name FROM sqlite_master WHERE type='table';"
```

상세 가이드: [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)

---

### Phase 2: 직접 매핑 시스템 (2일)

**작업 내용**:
- [ ] `api_parameter_mappings` 테이블 생성
- [ ] `similar_query_groups` 테이블 생성
- [ ] `query_variants` 테이블 생성
- [ ] `search_strategy_logs` 테이블 생성
- [ ] 매핑 저장 함수 구현
- [ ] 유사 검색어 자동 생성 로직
- [ ] L1 검색 전략 구현

**산출물**:
- `lib/search-feedback-db.ts`: DB 쿼리 함수
- `lib/search-learning.ts`: 학습 로직
- `lib/variant-generator.ts`: 변형 생성
- `db/migrations/002_mapping_schema.sql`

**핵심 함수**:
```typescript
// 직접 매핑 저장
await recordApiMapping(pattern, apiParams)

// 유사 검색어 생성
const variants = generateVariants(query, parsed)

// 학습 실행
await learnFromSuccessfulSearch({ query, result })
```

상세 코드: [CODE_EXAMPLES.md](./CODE_EXAMPLES.md#phase-2)

---

### Phase 3: 유사 검색어 매칭 (2일)

**작업 내용**:
- [ ] 정확 매칭 구현
- [ ] 정규화 매칭 구현
- [ ] 퍼지 매칭 구현 (Levenshtein)
- [ ] L2 검색 전략 구현
- [ ] 자동 variant 등록

**산출물**:
- `lib/variant-matcher.ts`: 매칭 로직
- `lib/fuzzy-match.ts`: 편집 거리 계산

**핵심 함수**:
```typescript
await searchSimilarVariants(query, pattern)
```

---

### Phase 4: 통합 검색 전략 (1일)

**작업 내용**:
- [ ] 5단계 fallback 로직 구현
- [ ] 전략별 로깅
- [ ] 성능 측정
- [ ] 기존 검색 흐름 통합 (app/page.tsx)

**산출물**:
- `lib/search-strategy.ts`: 통합 검색
- `lib/search-metrics.ts`: 성능 측정

**핵심 함수**:
```typescript
const result = await intelligentSearch(query)
// result.source: 'L0_vector' | 'L1_mapping' | 'L2_variant' | 'L3_cache' | 'L4_api'
// result.time: 응답 시간 (ms)
```

---

### Phase 5: 피드백 UI (1일)

**작업 내용**:
- [ ] SearchFeedbackButton 컴포넌트
- [ ] /api/feedback 엔드포인트
- [ ] law-viewer.tsx 통합
- [ ] 피드백 → 품질 점수 업데이트 트리거
- [ ] 검증 상태 자동 설정

**산출물**:
- `components/search-feedback-button.tsx`
- `app/api/feedback/route.ts`

**UI 배치**:
```
┌────────────────────────────────────────┐
│  관세법 (2024-01-01)  [👍 정확함] [👎]  │
├────────────────────────────────────────┤
│  제38조 내용...                         │
└────────────────────────────────────────┘
```

---

### Phase 6: 벡터 DB 구축 (2-3일)

**작업 내용**:
- [ ] Voyage AI API 연동
- [ ] 임베딩 생성 시스템
- [ ] 임베딩 캐시 구현
- [ ] 벡터 스키마 마이그레이션
- [ ] 벡터 인덱스 생성

**산출물**:
- `lib/embedding.ts`: 임베딩 생성
- `db/migrations/003_vector_schema.sql`

**환경변수**:
```bash
VOYAGE_API_KEY=your-key-here
```

상세 가이드: [API_INTEGRATION.md](./API_INTEGRATION.md#voyage-ai)

---

### Phase 7: 벡터 검색 통합 (2일)

**작업 내용**:
- [ ] searchSimilarQueries() 구현
- [ ] L0 벡터 레이어 추가
- [ ] 검색 전략 업데이트 (L0→L1→L2→L3→L4)
- [ ] 자동 임베딩 생성 (학습 시)

**산출물**:
- `lib/vector-search.ts`: 벡터 검색
- `lib/search-strategy-v2.ts`: 업데이트

**핵심 쿼리**:
```sql
SELECT *
FROM vector_top_k('idx_search_embedding_vector', ?, 5)
JOIN search_query_embeddings ON rowid = vt.rowid
WHERE (1 - vector_distance_cos(embedding, ?)) >= 0.9
```

---

### Phase 8: 법령 조문 임베딩 (2-3일)

**작업 내용**:
- [ ] 기존 법령 데이터 수집
- [ ] 배치 임베딩 생성 (Voyage AI batch API)
- [ ] law_article_embeddings 채우기
- [ ] 위임조문 정보 JSON 저장
- [ ] 자동 업데이트 로직

**산출물**:
- `scripts/embed-existing-laws.ts`: 초기 임베딩
- `lib/law-embedding-sync.ts`: 자동 동기화

**배치 처리**:
```typescript
// 1,000개 법령 × 50개 조문 = 50,000개
// 배치 크기: 100개씩
// 예상 시간: ~30분
```

---

### Phase 9: RAG 파이프라인 (2-3일)

**작업 내용**:
- [ ] hybridSearch() 구현 (벡터 + 키워드)
- [ ] buildRAGContext() 구현
- [ ] askLawQuestion() API 엔드포인트
- [ ] RAG 로그 기록
- [ ] 토큰 예산 관리

**산출물**:
- `lib/rag-pipeline.ts`: RAG 로직
- `app/api/ask/route.ts`: 자연어 질의응답

**API 엔드포인트**:
```typescript
POST /api/ask
Body: { question: "수입물품 관세 납부 방법은?" }
Response: {
  answer: "관세법 제38조에 따르면...",
  sources: [
    { law: "관세법", article: "제38조", similarity: 0.95 }
  ],
  tokensUsed: 1234
}
```

---

### Phase 10: 자연어 검색 UI (1-2일)

**작업 내용**:
- [ ] "질문하기" 입력 모드 추가
- [ ] RAG 응답 표시 컴포넌트
- [ ] 참고 조문 하이라이트
- [ ] 피드백 수집 (was_helpful)
- [ ] 스트리밍 응답 (선택)

**산출물**:
- `components/natural-language-search.tsx`
- `components/rag-answer-display.tsx`

**UI 구조**:
```
┌────────────────────────────────────────┐
│  검색 [법령 검색] [질문하기 💬]          │
├────────────────────────────────────────┤
│  수입물품 관세 납부 방법은?              │
├────────────────────────────────────────┤
│  💡 답변:                               │
│  관세법 제38조에 따르면 수입물품에...    │
│                                         │
│  📖 참고 조문:                          │
│  - 관세법 제38조 (유사도: 95%)          │
│  - 관세법 시행령 제42조 (유사도: 87%)   │
│                                         │
│  [도움이 되었나요? 👍 👎]               │
└────────────────────────────────────────┘
```

---

### Phase 11: 대시보드 (선택, 2일)

**작업 내용**:
- [ ] /analytics 페이지 생성
- [ ] 검색 통계 차트
- [ ] 전략별 히트율
- [ ] 학습 진행 현황
- [ ] 저품질 패턴 수동 관리

**산출물**:
- `app/analytics/page.tsx`
- `components/analytics-dashboard.tsx`

---

## 성능 목표

### 검색 속도

| 지표 | 현재 | 목표 | 개선율 |
|------|------|------|--------|
| **평균 응답 시간** | 500-2000ms | 5-10ms | **99.5%** |
| **P95 응답 시간** | 2500ms | 50ms | **98%** |
| **P99 응답 시간** | 3000ms | 100ms | **96.7%** |

### 캐시 히트율

| Phase | L0 (벡터) | L1 (매핑) | L2 (변형) | L3 (캐시) | L4 (API) |
|-------|----------|----------|----------|----------|----------|
| **초기** | 0% | 0% | 0% | 30% | 70% |
| **1개월 후** | 20% | 30% | 20% | 20% | 10% |
| **3개월 후** | 30% | 40% | 20% | 8% | 2% |
| **6개월 후** | 40% | 45% | 10% | 4% | 1% |

### API 호출 감소

```
현재: 100% API 호출
목표: 5% 이하 API 호출
→ 95% 감소 달성
```

### 품질 점수

| 지표 | 목표 |
|------|------|
| **평균 품질 점수** | 0.85+ |
| **검증된 매핑 비율** | 80%+ |
| **긍정 피드백 비율** | 90%+ |

---

## 비용 분석

### 무료 티어 한계

#### Turso

```
저장공간: 5 GB
예상 사용량 (하루 500건 검색):
  - 검색 쿼리: 200 bytes × 500 = 100 KB/일
  - 검색 결과: 2 KB × 500 = 1 MB/일
  - 위임조문: 1.5 KB × 500 = 750 KB/일
  - 피드백: 100 bytes × 250 = 25 KB/일
  - 총: ~2 MB/일 = 60 MB/월 = 720 MB/년

5 GB ÷ 720 MB/년 = 7년+ 사용 가능 ✅

Row Reads: 500M/월
예상 사용량: 500건 × 6 reads/건 × 30일 = 90,000 reads/월
500M ÷ 90K = 5,555개월 (463년) ✅

Row Writes: 10M/월
예상 사용량: 500건 × 6.5 writes/건 × 30일 = 97,500 writes/월
10M ÷ 97.5K = 102개월 (8.5년) ✅
```

#### Voyage AI

```
무료 티어: 200M 토큰

검색어 임베딩:
  - 평균 길이: 15자 ≈ 20 토큰
  - 하루 500건: 10,000 토큰/일
  - 월간: 300,000 토큰/월
  - 200M ÷ 300K = 666개월 (55년) ✅

법령 조문 임베딩 (초기):
  - 1,000개 법령 × 50개 조문 × 200 토큰
  - = 10,000,000 토큰 (일회성)
  - 무료 티어로 충분 ✅

RAG 사용:
  - 하루 50건 × 600 토큰/건 = 30,000 토큰/일
  - 월간: 900,000 토큰/월
  - 200M ÷ 900K = 222개월 (18년) ✅
```

### 성장 시나리오

#### 하루 5,000건 (10배 성장)

```
Turso:
  - 저장: 600 MB/년 (5 GB 중 12%) ✅
  - Reads: 900K/월 (500M 중 0.18%) ✅
  - Writes: 975K/월 (10M 중 9.75%) ✅

Voyage AI:
  - 검색어: 3M 토큰/월 (200M 중 1.5%) ✅
  - RAG: 9M 토큰/월 (200M 중 4.5%) ✅

→ 여전히 무료 티어로 충분
```

#### 하루 50,000건 (100배 성장)

```
Turso:
  - 저장: 6 GB/년 → Pro 플랜 필요 ($29/월)
  - Reads: 9M/월 → 무료 ✅
  - Writes: 9.75M/월 → 무료 ✅

Voyage AI:
  - 검색어: 30M 토큰/월 → 무료 ✅
  - RAG: 90M 토큰/월 → 무료 ✅

→ 총 비용: $29/월 (Turso Pro만)
→ 여전히 매우 저렴
```

---

## 모니터링 및 최적화

### 성능 모니터링

**지표 수집**:
- 검색 전략별 히트율 (L0-L4)
- 평균 응답 시간
- API 호출 횟수
- 캐시 사용량

**대시보드**:
```
┌─────────────────────────────────────┐
│  검색 성능 대시보드                  │
├─────────────────────────────────────┤
│  총 검색: 15,234건                   │
│  평균 응답 시간: 8ms                 │
│  API 호출 비율: 3.2%                 │
│                                      │
│  전략별 히트율:                       │
│  L0 (벡터):  ████████░░ 35%          │
│  L1 (매핑):  █████████░ 40%          │
│  L2 (변형):  ████░░░░░░ 18%          │
│  L3 (캐시):  ██░░░░░░░░ 4.8%         │
│  L4 (API):   ░░░░░░░░░░ 2.2%         │
└─────────────────────────────────────┘
```

### 품질 최적화

**자동 개선**:
1. 피드백 기반 품질 점수 업데이트
2. 저품질 매핑 자동 삭제 (negative > positive * 2)
3. 고품질 매핑 자동 검증 (positive >= 3)

**수동 개선** (대시보드):
1. 저품질 패턴 수동 수정
2. 유사 검색어 그룹 병합
3. 자연어 패턴 확인 및 승인

---

## 위험 요소 및 대응

### 위험 1: 무료 티어 초과

**확률**: 낮음 (5년+ 여유)

**대응**:
1. 사용량 모니터링 알림 설정
2. 초과 시 오래된 데이터 자동 삭제
3. Pro 플랜 업그레이드 ($29/월, 여전히 저렴)

### 위험 2: 벡터 검색 정확도 부족

**확률**: 중간

**대응**:
1. L1-L4 fallback으로 보완
2. 임베딩 모델 업그레이드 (voyage-3-large)
3. 하이브리드 검색 강화 (벡터 + 키워드)

### 위험 3: 법령 데이터 업데이트

**확률**: 높음 (법령은 계속 개정됨)

**대응**:
1. 시행일(effectiveDate) 기반 버전 관리
2. 주기적 재임베딩 (월 1회)
3. 개정된 법령 자동 감지

### 위험 4: 스팸 피드백

**확률**: 중간

**대응**:
1. 세션 기반 중복 방지
2. 피드백 속도 제한 (rate limiting)
3. 이상 패턴 감지 및 자동 필터링

---

## 다음 단계

### 즉시 시작 가능

1. **Turso 설정** (30분)
   ```bash
   curl -sSfL https://get.tur.so/install.sh | bash
   turso auth login
   turso db create lexdiff-feedback
   ```

2. **환경변수 설정** (5분)
   ```bash
   # .env.local
   TURSO_DATABASE_URL=
   TURSO_AUTH_TOKEN=
   VOYAGE_API_KEY=
   ```

3. **Phase 1 시작**
   - [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) 참고

### 추가 문서

- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md): 전체 스키마 SQL
- [CODE_EXAMPLES.md](./CODE_EXAMPLES.md): 구현 예시 코드
- [API_INTEGRATION.md](./API_INTEGRATION.md): 외부 API 연동
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md): 배포 가이드

---

## 참고 자료

- [Turso Documentation](https://docs.turso.tech/)
- [LibSQL Vector Search](https://turso.tech/blog/turso-brings-native-vector-search-to-sqlite)
- [Voyage AI API](https://docs.voyageai.com/docs/embeddings)
- [Google Gemini API](https://ai.google.dev/gemini-api/docs)

---

**작성자**: Claude (Anthropic)
**최종 수정**: 2025-11-05
