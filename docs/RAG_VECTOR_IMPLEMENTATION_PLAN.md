# 법령 비교 RAG 시스템 - 벡터 검색 구현 계획

## 📊 현재 상태 분석

### ✅ 이미 구축된 것들

1. **Voyage AI 3 Lite 임베딩 인프라** (`lib/embedding.ts`)
   - 512차원 벡터 생성
   - 캐싱 시스템 (embedding_cache 테이블)
   - 배치 처리 지원

2. **Turso DB 벡터 스키마** (`db/migrations/003_vector_schema.sql`)
   - `law_article_embeddings`: 법령 조문 임베딩 저장
   - `search_query_embeddings`: 검색어 임베딩 저장
   - LibSQL vector_distance_cos() 지원

3. **벡터 검색 라이브러리** (`lib/vector-search.ts`)
   - `searchSimilarArticles()`: 조문 유사도 검색
   - `searchSimilarQueries()`: 검색어 유사도 검색
   - Cosine similarity 계산

4. **RAG 시스템 (키워드 기반)** (`lib/rag-*.ts`)
   - 의도 분석 (analyze-intent API)
   - 데이터 수집 (rag-data-collector)
   - **키워드 필터링** (rag-content-filter) ← 현재 방식
   - Gemini 분석 (rag-analyze API)

5. **Gemini API 통합** (`app/api/summarize/route.ts`)
   - gemini-2.5-flash 모델 사용
   - 스트리밍 응답 지원

### ❌ 아직 구현되지 않은 것들

1. **법령 조문 임베딩 DB 구축**
   - `law_article_embeddings` 테이블이 비어있음
   - 조문을 임베딩하여 저장하는 프로세스 없음

2. **벡터 기반 조문 검색 통합**
   - RAG 시스템이 벡터 검색을 사용하지 않음
   - 키워드 필터링만 사용 중

3. **임베딩 관리 도구**
   - 임베딩 생성 스크립트
   - 임베딩 업데이트/삭제 관리

---

## 🎯 구현 목표

**벡터 유사도 기반 RAG 시스템 구축**
- 사용자 질문을 임베딩하여 의미론적으로 가장 유사한 조문들을 찾기
- 키워드 기반과 병행하여 더 정확한 검색 결과 제공

---

## 📐 시스템 아키텍처 비교

### 현재: 키워드 기반 RAG

```
사용자 질문
  ↓
의도 분석 (AI)
  ↓
키워드 추출 ["청년", "창업", "지원"]
  ↓
데이터 수집 (law/ordinance API)
  ↓
키워드 필터링 (문자열 매칭)
  - "청년" 포함 조문: 10개
  - "창업" 포함 조문: 8개
  - "지원" 포함 조문: 15개
  - 교집합: 5개 조문 선택
  ↓
Gemini 분석 (5개 조문 + 질문)
  ↓
답변 생성
```

### 제안: 벡터 유사도 기반 RAG

```
사용자 질문: "청년 창업 지원 내용이 뭐야?"
  ↓
질문 임베딩 (Voyage AI)
  - 512차원 벡터 생성
  ↓
벡터 유사도 검색 (Turso DB)
  - SELECT * FROM law_article_embeddings
    WHERE vector_distance_cos(content_embedding, ?) < threshold
    ORDER BY similarity DESC
    LIMIT 10
  ↓
가장 유사한 조문 10개 반환
  - 제5조 (지원내용) - 유사도 0.92
  - 제3조 (지원대상) - 유사도 0.88
  - 제7조 (창업자금) - 유사도 0.85
  - ...
  ↓
Gemini 분석 (10개 조문 + 질문)
  ↓
답변 생성
```

### 하이브리드: 키워드 + 벡터 (추천)

```
사용자 질문
  ↓
[병렬 실행]
  ├─ 키워드 필터링 (빠름)
  └─ 벡터 유사도 검색 (정확함)
  ↓
결과 병합 (중복 제거)
  - 키워드: 5개 조문
  - 벡터: 10개 조문
  - 합집합: 12개 조문
  ↓
재순위화 (벡터 유사도 기준)
  ↓
상위 10개 조문 선택
  ↓
Gemini 분석
  ↓
답변 생성
```

---

## 🔧 구현 계획

### Phase 1: 임베딩 DB 구축 (핵심 우선순위)

**목표**: 주요 법령의 모든 조문을 임베딩하여 DB에 저장

#### 1.1 임베딩 생성 스크립트 작성

**파일**: `scripts/build-article-embeddings.mjs`

```javascript
// 주요 법령 목록 (우선순위)
const priorityLaws = [
  { lawId: '관세법', name: '관세법' },
  { lawId: '소득세법', name: '소득세법' },
  { lawId: '법인세법', name: '법인세법' },
  // ... 주요 법령 20~30개
]

// 각 법령에 대해:
//   1. /api/eflaw 호출하여 전문 가져오기
//   2. 조문 파싱
//   3. 각 조문 임베딩 생성 (Voyage AI)
//   4. law_article_embeddings 테이블에 저장
//   5. 진행상황 로깅
```

**예상 비용**:
- 법령당 평균 100개 조문
- 30개 법령 = 3,000개 조문
- Voyage AI 3 Lite: $0.05 / 1M tokens
- 조문당 평균 200 tokens = 600,000 tokens
- **예상 비용: $0.03 (약 40원)**

**예상 시간**:
- API 호출 제한: 분당 300 requests (Voyage AI)
- 3,000개 조문 = 약 10분

#### 1.2 증분 업데이트 지원

```sql
-- 이미 임베딩된 조문 확인
SELECT law_id, article_jo FROM law_article_embeddings
WHERE law_id = ? AND article_jo = ?

-- 없으면 INSERT, 있으면 SKIP (내용 변경 감지 로직 추가 가능)
```

#### 1.3 임베딩 관리 API

**파일**: `app/api/admin/embeddings/route.ts`

```typescript
POST /api/admin/embeddings/build
  - Body: { lawIds: string[], force?: boolean }
  - 지정된 법령들의 임베딩 생성/업데이트

GET /api/admin/embeddings/stats
  - 임베딩 통계 조회
  - 법령별 조문 수, 마지막 업데이트 시각

DELETE /api/admin/embeddings/:lawId
  - 특정 법령의 임베딩 삭제
```

---

### Phase 2: 벡터 검색 통합

**목표**: RAG 시스템에 벡터 검색 추가

#### 2.1 벡터 기반 조문 검색 함수

**파일**: `lib/rag-vector-search.ts` (신규)

```typescript
export async function searchArticlesByQuery(
  userQuery: string,
  options?: {
    topK?: number
    threshold?: number
    lawIds?: string[] // 특정 법령으로 제한
  }
): Promise<SimilarArticle[]> {
  // 1. 사용자 질문 임베딩
  const { embedding } = await generateEmbedding(userQuery)

  // 2. 벡터 유사도 검색
  return await searchSimilarArticles(userQuery, {
    topK: options?.topK || 10,
    threshold: options?.threshold || 0.75,
    lawId: options?.lawIds?.[0], // 일단 단일 법령 지원
  })
}
```

#### 2.2 RAG 필터에 벡터 검색 추가

**파일**: `lib/rag-content-filter.ts` (수정)

```typescript
export async function filterSourceWithVector(
  source: CollectedSource,
  userQuery: string,
  keywords: string[],
  config: FilterConfig = {}
): Promise<FilteredSource> {
  // 1. 벡터 검색으로 유사 조문 찾기
  const vectorResults = await searchArticlesByQuery(userQuery, {
    topK: 20,
    lawIds: [source.metadata.lawId!],
  })

  // 2. 키워드 필터링
  const keywordResults = filterByKeywords(source.articles, keywords, 20)

  // 3. 결과 병합 (벡터 우선, 키워드 보완)
  const combinedArticles = mergeResults(vectorResults, keywordResults, {
    maxArticles: config.maxArticles || 30,
  })

  // 4. 콘텐츠 구성
  return {
    source,
    filteredContent: buildFilteredContent(source, combinedArticles, true),
    includedArticles: combinedArticles,
    excludedCount: source.articles.length - combinedArticles.length,
    filterMethod: 'vector+keyword',
  }
}
```

#### 2.3 RAG 분석 API 업데이트

**파일**: `app/api/rag-analyze/route.ts` (수정)

```typescript
// buildRAGPrompt 함수 수정
function buildRAGPrompt(session: RAGSession, userQuery: string): string {
  // BEFORE: 키워드만 사용
  // const filteredSources = filterMultipleSources(session.sources, keywords, {...})

  // AFTER: 벡터 + 키워드 하이브리드
  const filteredSources = await filterMultipleSourcesWithVector(
    session.sources,
    userQuery,
    keywords,
    { maxArticles: 30, maxContentLength: 15000 }
  )

  // 나머지 동일...
}
```

---

### Phase 3: 하이브리드 검색 최적화

**목표**: 키워드와 벡터 검색의 장점을 결합

#### 3.1 스코어 기반 재순위화

```typescript
interface ScoredArticle {
  article: LawArticle
  vectorScore: number // 0~1
  keywordScore: number // 0~1
  finalScore: number // 가중 평균
}

function rerank(
  vectorResults: SimilarArticle[],
  keywordResults: LawArticle[],
  weights = { vector: 0.7, keyword: 0.3 }
): ScoredArticle[] {
  // 1. 모든 조문 수집
  const allArticles = new Map<string, ScoredArticle>()

  // 2. 벡터 스코어 적용
  vectorResults.forEach((result, index) => {
    allArticles.set(result.articleJo, {
      article: result,
      vectorScore: result.similarityScore,
      keywordScore: 0,
      finalScore: 0,
    })
  })

  // 3. 키워드 스코어 적용
  keywordResults.forEach((article, index) => {
    const existing = allArticles.get(article.jo)
    const keywordScore = 1 - (index / keywordResults.length) // 순위 역수

    if (existing) {
      existing.keywordScore = keywordScore
    } else {
      allArticles.set(article.jo, {
        article,
        vectorScore: 0,
        keywordScore,
        finalScore: 0,
      })
    }
  })

  // 4. 최종 스코어 계산
  allArticles.forEach((scored) => {
    scored.finalScore =
      scored.vectorScore * weights.vector +
      scored.keywordScore * weights.keyword
  })

  // 5. 정렬
  return Array.from(allArticles.values())
    .sort((a, b) => b.finalScore - a.finalScore)
}
```

#### 3.2 설정 가능한 검색 모드

```typescript
type SearchMode = 'keyword' | 'vector' | 'hybrid'

interface RAGSearchConfig {
  mode: SearchMode
  vectorWeight?: number // hybrid 모드일 때
  keywordWeight?: number
}

// 사용자가 선택 가능하도록 UI 제공
```

---

### Phase 4: 성능 모니터링 및 비교

**목표**: 키워드 vs 벡터 vs 하이브리드 성능 비교

#### 4.1 검색 결과 로깅

**테이블**: `rag_context_logs` (이미 있음)

```sql
-- 검색 방법별 로그 추가
ALTER TABLE rag_context_logs ADD COLUMN search_method TEXT; -- 'keyword', 'vector', 'hybrid'
ALTER TABLE rag_context_logs ADD COLUMN search_time_ms INTEGER;
```

#### 4.2 비교 대시보드

**파일**: `app/admin/rag-stats/page.tsx` (신규)

- 검색 방법별 사용량
- 평균 검색 시간
- 사용자 피드백 (was_helpful)
- 검색 방법별 만족도 비교

---

## 📊 키워드 vs 벡터 상세 비교

| 항목 | 키워드 기반 | 벡터 유사도 기반 | 하이브리드 |
|------|------------|-----------------|-----------|
| **정확도** | 중 (단어 매칭만) | 상 (의미 이해) | 최상 |
| **속도** | 빠름 (100ms) | 중간 (200-300ms) | 중간 (250-350ms) |
| **초기 비용** | 없음 | 임베딩 DB 구축 ($0.03) | 임베딩 DB 구축 |
| **운영 비용** | 없음 | 쿼리당 ~$0.0001 | 쿼리당 ~$0.0001 |
| **구현 복잡도** | 낮음 | 중간 | 높음 |
| **유지보수** | 쉬움 | 임베딩 업데이트 필요 | 임베딩 업데이트 필요 |
| **장점** | - 빠름<br>- 비용 없음<br>- 정확한 단어 매칭 | - 의미 이해<br>- 유연한 표현<br>- 유사 조문 발견 | - 두 방식의 장점<br>- 최고 정확도 |
| **단점** | - 의미 놓침<br>- 동의어 미지원<br>- 경직됨 | - 초기 구축 필요<br>- 비용 발생<br>- 느림 | - 복잡함<br>- 비용 발생 |

### 예시 시나리오

#### 시나리오 1: 정확한 용어 검색

**질문**: "관세법 제38조의2에서 FTA 특례세율이 뭐야?"

- **키워드**: ✅ "FTA", "특례세율" 정확히 매칭 → 성공
- **벡터**: ✅ 의미적으로 유사한 조문 찾음 → 성공
- **결과**: 둘 다 성공 (키워드가 더 빠름)

#### 시나리오 2: 의미 기반 검색

**질문**: "수입 물품에 대한 세금 감면 혜택은 어떤 게 있어?"

- **키워드**: ❌ "수입", "감면" 등 일반적 단어만 매칭 → 부정확
- **벡터**: ✅ "수입 물품 세금 감면" ≈ "관세 경감/면제" 의미 이해 → 성공
- **결과**: 벡터가 우수

#### 시나리오 3: 동의어/유사어

**질문**: "청년 창업자를 위한 지원 제도"

- **키워드**: ❌ "청년 창업자" 정확히 없으면 실패
  - 조문: "만 39세 이하 사업자" (동일 의미지만 다른 표현)
- **벡터**: ✅ 의미가 유사하면 매칭
- **결과**: 벡터가 우수

#### 시나리오 4: 복합 조건

**질문**: "서울시 청년 창업 지원금 신청 자격과 절차"

- **키워드**: △ "서울시", "청년", "창업", "신청" 모두 포함된 조문만 → 누락 가능
- **벡터**: ✅ 관련된 여러 조문 찾음 (자격 조항, 절차 조항 분리되어 있어도)
- **하이브리드**: ✅✅ 정확한 매칭 + 의미적 관련성 → 최상
- **결과**: 하이브리드 최고

---

## 🚀 구현 우선순위

### 즉시 시작 (1-2일)

1. ✅ **임베딩 생성 스크립트** (`scripts/build-article-embeddings.mjs`)
   - 주요 법령 20개 임베딩
   - 진행상황 로깅
   - 에러 처리

2. ✅ **벡터 검색 함수** (`lib/rag-vector-search.ts`)
   - `searchArticlesByQuery()` 구현
   - 기존 `lib/vector-search.ts` 활용

### 단기 (3-5일)

3. ✅ **RAG 통합** (키워드 + 벡터 하이브리드)
   - `lib/rag-content-filter.ts` 수정
   - `app/api/rag-analyze/route.ts` 업데이트

4. ✅ **테스트 및 디버깅**
   - 샘플 질문으로 테스트
   - 성능 측정 (응답 시간, 정확도)

### 중기 (1-2주)

5. ⏳ **관리 도구**
   - 임베딩 관리 API
   - 통계 대시보드

6. ⏳ **최적화**
   - 재순위화 알고리즘
   - 가중치 튜닝

### 장기 (1개월+)

7. 🔮 **확장**
   - 모든 법령 임베딩 (200+ 법령)
   - 조례 임베딩 (1000+ 조례)
   - 실시간 업데이트 시스템

---

## 💰 비용 분석

### 초기 구축 비용

**Voyage AI 3 Lite 임베딩**
- 단가: $0.05 / 1M tokens
- 주요 법령 30개: 3,000 조문 × 200 tokens = 600K tokens
- **비용: $0.03 (약 40원)**

**모든 법령 (200개)**
- 20,000 조문 × 200 tokens = 4M tokens
- **비용: $0.20 (약 270원)**

### 운영 비용

**사용자 질문 임베딩**
- 평균 질문 길이: 30 tokens
- 하루 100 질문: 3,000 tokens
- 한 달: 90,000 tokens
- **비용: $0.0045/월 (약 6원)**

**Gemini API 비용 (기존)**
- gemini-2.5-flash: $0.075 / 1M input tokens
- 질문당 평균 3,000 tokens (조문 포함)
- 하루 100 질문: 300K tokens
- 한 달: 9M tokens
- **비용: $0.675/월 (약 900원)**

**총 운영 비용**: **$0.68/월 (약 900원)** - Voyage 비용 무시할 수준

### Turso DB 비용

- 월 500MB: 무료
- 임베딩 크기: 512 float32 = 2KB/조문
- 20,000 조문 = 40MB
- **비용: 무료 (프리 티어 내)**

---

## 🔍 구현 세부 사항

### 임베딩 생성 스크립트 상세

```javascript
// scripts/build-article-embeddings.mjs

import { db } from '../lib/db.js'
import { generateEmbedding, storeLawArticleEmbedding } from '../lib/embedding.js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const priorityLaws = [
  '관세법', '소득세법', '법인세법', '부가가치세법',
  '국세기본법', '국세징수법', '조세특례제한법',
  // ... 주요 법령 20-30개
]

async function buildEmbeddings() {
  console.log('🚀 Starting embedding generation...')

  let totalArticles = 0
  let totalTokens = 0
  let totalCost = 0

  for (const lawName of priorityLaws) {
    console.log(`\n📖 Processing: ${lawName}`)

    try {
      // 1. 법령 검색
      const searchRes = await fetch(
        `http://localhost:3000/api/law-search?query=${encodeURIComponent(lawName)}`
      )
      const searchData = await searchRes.json()

      if (!searchData.list?.[0]) {
        console.warn(`⚠️  Not found: ${lawName}`)
        continue
      }

      const lawId = searchData.list[0].lawId
      const lawTitle = searchData.list[0].lawName

      // 2. 전문 가져오기
      const contentRes = await fetch(
        `http://localhost:3000/api/eflaw?MST=${lawId}`
      )
      const content = await contentRes.json()

      if (!content.articles) {
        console.warn(`⚠️  No articles: ${lawName}`)
        continue
      }

      console.log(`   Articles: ${content.articles.length}`)

      // 3. 각 조문 임베딩 생성
      for (const article of content.articles) {
        // 이미 있는지 확인
        const existing = await db.execute({
          sql: 'SELECT id FROM law_article_embeddings WHERE law_id = ? AND article_jo = ?',
          args: [lawId, article.jo]
        })

        if (existing.rows.length > 0) {
          process.stdout.write('.')
          continue
        }

        // 임베딩 생성
        const text = `${article.joNum}\n${article.content}`
        const result = await generateEmbedding(text)

        // 저장
        await storeLawArticleEmbedding(
          lawId,
          lawTitle,
          article.jo,
          article.content,
          result.embedding,
          {
            articleDisplay: article.joNum,
            articleTitle: article.joNum,
            effectiveDate: content.meta?.effectiveDate,
          }
        )

        totalArticles++
        totalTokens += result.tokens
        totalCost += result.tokens * 0.05 / 1000000

        process.stdout.write('+')

        // Rate limiting: 300 req/min
        await new Promise(resolve => setTimeout(resolve, 200))
      }

      console.log(`\n   ✅ ${content.articles.length} articles embedded`)

    } catch (error) {
      console.error(`❌ Error processing ${lawName}:`, error.message)
    }
  }

  console.log(`\n\n🎉 Completed!`)
  console.log(`   Total articles: ${totalArticles}`)
  console.log(`   Total tokens: ${totalTokens.toLocaleString()}`)
  console.log(`   Total cost: $${totalCost.toFixed(4)}`)
}

buildEmbeddings()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
```

---

## 🧪 테스트 계획

### 단위 테스트

1. **임베딩 생성 테스트**
   ```typescript
   test('should generate 512-dim embedding', async () => {
     const result = await generateEmbedding('제1조 (목적) 이 법은...')
     expect(result.embedding).toHaveLength(512)
   })
   ```

2. **벡터 검색 테스트**
   ```typescript
   test('should find similar articles', async () => {
     const results = await searchArticlesByQuery('수입 물품 세금 감면')
     expect(results.length).toBeGreaterThan(0)
     expect(results[0].similarityScore).toBeGreaterThan(0.7)
   })
   ```

### 통합 테스트

1. **RAG 전체 플로우**
   - 질문 입력
   - 벡터 검색 실행
   - 관련 조문 반환
   - Gemini 분석
   - 답변 생성

2. **성능 벤치마크**
   - 키워드: 평균 100ms
   - 벡터: 평균 250ms
   - 하이브리드: 평균 300ms

### 품질 테스트

**샘플 질문 20개**
- "청년 창업 지원 내용"
- "수입 물품 관세 감면"
- "소득세 공제 항목"
- ...

**평가 지표**
- 관련 조문 포함률 (Precision)
- 모든 관련 조문 찾기 (Recall)
- 사용자 만족도 (설문)

---

## 📝 다음 단계

### 즉시 실행 가능한 작업

1. **환경 변수 확인**
   ```bash
   # .env.local 파일 확인
   VOYAGE_API_KEY=pa-...
   TURSO_DATABASE_URL=libsql://...
   TURSO_AUTH_TOKEN=...
   GEMINI_API_KEY=...
   ```

2. **임베딩 스크립트 실행**
   ```bash
   node scripts/build-article-embeddings.mjs
   ```

3. **벡터 검색 테스트**
   ```bash
   node scripts/test-vector-search.mjs
   ```

4. **RAG 통합 테스트**
   - RAG 테스트 페이지에서 벡터 모드 추가
   - 키워드 vs 벡터 비교

---

## 💡 추가 아이디어

### 1. 증분 임베딩 업데이트

법령 개정 시 자동으로 임베딩 업데이트

```typescript
// app/api/webhooks/law-updated/route.ts
export async function POST(request: Request) {
  const { lawId, updatedArticles } = await request.json()

  // 변경된 조문만 재임베딩
  for (const article of updatedArticles) {
    await updateArticleEmbedding(lawId, article)
  }
}
```

### 2. 사용자 피드백 학습

사용자가 "도움됨/안됨" 피드백 → 가중치 조정

```typescript
// was_helpful = 1 → 해당 조문의 가중치 증가
// was_helpful = 0 → 해당 조문의 가중치 감소
```

### 3. 다국어 지원

Voyage AI는 100+ 언어 지원
- 한국어 법령 + 영어 질문 → 검색 가능
- 번역 없이 의미 기반 검색

### 4. 시맨틱 캐싱

유사한 질문은 캐시된 결과 재사용

```typescript
// "청년 창업 지원" ≈ "청년 사업자 지원금" (유사도 0.95)
// → 같은 검색 결과 재사용 (비용 절감)
```

---

## 🎓 참고 자료

- [Voyage AI Documentation](https://docs.voyageai.com/)
- [LibSQL Vector Search](https://docs.turso.tech/features/vector-search)
- [RAG Best Practices](https://www.pinecone.io/learn/retrieval-augmented-generation/)
- [Gemini API Reference](https://ai.google.dev/gemini-api/docs)

---

## 📞 문의 사항

구현 중 이슈가 생기면:
1. Voyage AI Rate Limit: 300 req/min → 200ms delay 추가
2. Turso DB 용량 초과: 프리 티어 500MB → 쿼리 최적화
3. 비용 초과: 캐싱 강화 + 배치 처리

---

**작성일**: 2025-11-11
**버전**: 1.0
**상태**: 구현 준비 완료 ✅
