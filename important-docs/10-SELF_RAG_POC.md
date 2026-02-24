# 자체 벡터 RAG POC (Gemini File Search 대체)

## 배경

**문제**: 현재 Gemini File Search Store 기반 RAG는 API 종속(데이터 잠금), 비용 통제 불가, 청크 기반 정확도 한계가 있어 상용화에 부적합.

**목표**: 자체 벡터 검색(Turso) + LLM 생성(Gemini Flash)으로 교체하여 비용 통제와 데이터 소유권 확보.

---

## 비용 구조 변화

| 항목 | 현재 (File Search) | 전환 후 (자체 RAG) |
|------|-------------------|-------------------|
| 검색(Retrieval) | Gemini File Search 종량제 | Turso 벡터 검색 (이미 과금 중, 추가비용 0) |
| 임베딩 | - | Gemini embedding-001 (무료 1500 RPM) |
| 생성(Generation) | File Search에 포함 | Gemini Flash API (생성만, 더 저렴) |
| 데이터 통제 | Google에 종속 | 자체 DB에 보유 |

---

## POC 현재 상태

### 완료된 것

1. **임베딩 스크립트** — `scripts/build-embeddings-gemini.mts`
   - Gemini `gemini-embedding-001` 모델, 512차원, `outputDimensionality: 512` 지원 확인
   - 법제처 API → 조문 파싱 → Gemini 임베딩 → Turso F32_BLOB(512) 저장
   - 같은 조문번호의 하위 항 합침 (Map 기반 dedup)
   - 법령별 재인덱싱 (기존 데이터 삭제 후 INSERT)
   - 캐시 비활성화 (libSQL blob 읽기 변환 이슈 — 후속 과제)

2. **POC 엔드포인트** — `app/api/rag-search-poc/route.ts`
   - GET: DB 상태 확인 (인덱싱된 법령/조문 수)
   - POST: Gemini 임베딩으로 쿼리 벡터화 → LibSQL `vector_distance_cos` 검색 → Gemini Flash 생성
   - 기존 `analyzeLegalQuery` + `getSpecialistPrompt` 재사용
   - Voyage AI 의존성 제거 (Gemini 임베딩으로 독립)

3. **DB 데이터** (현재)
   - 관세법: 158개 조문 (부분 — 재인덱싱 필요, 전체 330개)
   - 소득세법: 177개 조문 (완료)
   - 총 335개 조문, 에러 0개

### 아직 안 된 것

1. **관세법 재인덱싱** — 중단된 상태, `npx tsx scripts/build-embeddings-gemini.mts --law 관세법` 실행 필요 (~7분)
2. **POC 테스트** — POST `/api/rag-search-poc`로 실제 질의 테스트 미수행
3. **A/B 비교** — 기존 File Search RAG vs 자체 RAG 품질 비교 미수행
4. **embedding_cache blob 변환 이슈** — libSQL에서 blob 읽을 때 Float32Array 변환이 깨짐, 캐시 비활성화로 우회 중

---

## 파이프라인 구조

```
사용자 쿼리
  ↓
1. 쿼리 전처리 (lib/query-preprocessor.ts) ← 기존 코드
  ↓
2. 질문 유형 분류 (lib/legal-query-analyzer.ts) ← 기존 코드
  ↓
3. Gemini 임베딩 생성 (gemini-embedding-001, 512차원)
  ↓
4. 벡터 검색 (Turso LibSQL, vector_distance_cos)
  → law_article_embeddings 테이블, topK=7, threshold=0.3
  ↓
5. 컨텍스트 구성 (법령명 + 조문번호 + 유사도 + 전문)
  ↓
6. LLM 생성 (Gemini 2.5 Flash, temperature=0)
  → specialist prompt (queryType 기반)
  ↓
7. Citation 매핑 (벡터 검색 결과에서 직접 매핑)
```

---

## 관련 파일

### 신규 생성
| 파일 | 역할 |
|------|------|
| `app/api/rag-search-poc/route.ts` | POC RAG 엔드포인트 |
| `scripts/build-embeddings-gemini.mts` | Gemini 임베딩 인덱싱 스크립트 |

### 기존 재사용 (수정 없음)
| 파일 | 역할 |
|------|------|
| `lib/query-preprocessor.ts` | 쿼리 전처리 (법령명 추출, 조문 정규화) |
| `lib/legal-query-analyzer.ts` | 8가지 질문 유형 분류 |
| `lib/ai-agents/specialist-agents.ts` | 유형별 specialist prompt |
| `lib/db.ts` | Turso/LibSQL 클라이언트 |
| `db/migrations/003_vector_schema.sql` | 벡터 테이블 스키마 (F32_BLOB(512)) |

### 기존 코드 (현재 미사용, 참고용)
| 파일 | 역할 | 비고 |
|------|------|------|
| `lib/vector-search.ts` | Voyage AI 기반 벡터 검색 | Gemini 임베딩과 비호환 |
| `lib/embedding.ts` | Voyage AI 임베딩 + 캐시 | POC에서 미사용 |
| `app/api/file-search-rag/route.ts` | 현재 메인 RAG (Gemini File Search) | 대체 대상 |

---

## 인덱싱 실행 방법

```bash
# dev 서버 필요 (법제처 API 프록시)
npm run dev

# 특정 법령
npx tsx scripts/build-embeddings-gemini.mts --law 관세법

# 상위 N개 법령 (PRIORITY_LAWS 순서)
npx tsx scripts/build-embeddings-gemini.mts --limit 5

# 전체 (10개 법령)
npx tsx scripts/build-embeddings-gemini.mts
```

PRIORITY_LAWS: 관세법, 소득세법, 법인세법, 부가가치세법, 국세기본법, 민법, 형법, 근로기준법, 행정절차법, 상법

---

## 알려진 이슈

### 1. libSQL blob 캐시 변환 버그
- **증상**: `embedding_cache` 테이블에서 blob을 읽어 `Float32Array`로 변환 시 0차원 벡터가 됨
- **원인**: libSQL 클라이언트가 반환하는 blob 타입이 `Uint8Array`와 다른 형태일 가능성
- **우회**: 캐시 비활성화 (Gemini 1500 RPM이므로 실용적 문제 없음)
- **향후**: `@libsql/client` blob 반환 형식 조사 후 적절한 변환 코드 적용

### 2. 벡터 인덱스 UPSERT 충돌
- **증상**: `ON CONFLICT DO UPDATE` 시 `vector index(insert): dimensions are different: 0 != 512`
- **원인**: UPSERT 경로에서 `title_embedding` NULL이 벡터 인덱스와 충돌 추정
- **해결**: `INSERT OR IGNORE` + 법령별 DELETE 후 재삽입 방식으로 변경

---

## 후속 계획 (POC 통과 후)

### Phase 1: 본 전환 (2-3주)
- `lib/rag-context-builder.ts` — 벡터 검색 결과 → 구조화된 프롬프트
- `lib/llm-generator.ts` — LLM API 추상화 (Gemini/Claude 교체 가능)
- `app/api/rag-search/route.ts` — 새 RAG 엔드포인트 (기존 file-search-rag 대체)
- SSE 스트리밍 지원

### Phase 2: 법령 포인터 추적 (3-4주)
- 조문 내 참조 관계 자동 추출 ("시행령으로 정한다" → 위임법령)
- 벡터 검색 결과 + 관계 확장 → 확장된 컨텍스트
- `db/migrations/005_law_relations.sql`
- `lib/law-relation-expander.ts`

### Phase 3: 고도화 (선택적)
- BM25 하이브리드 검색
- Adaptive RAG (단순 질문은 LLM 스킵)
- 판례 인덱싱
