# RAG 검색 품질 개선 계획

**작성일**: 2025-11-26
**상태**: 대기 (승인 후 구현 예정)

---

## 📊 현재 상태 분석

### 현재 구현 스택
| 항목 | 값 |
|------|-----|
| RAG 방식 | Google File Search (완전 관리형) |
| AI 모델 | Gemini 2.5 Flash |
| 청킹 설정 | 384 tokens/chunk, 50 overlap |
| 출력 제한 | 4,096 tokens |
| 스트리밍 | SSE (Server-Sent Events) |

### 핵심 파일
- `lib/file-search-client.ts` - Gemini File Search 클라이언트
- `app/api/file-search-rag/route.ts` - SSE API 엔드포인트
- `components/file-search-answer-display.tsx` - 답변 UI
- `lib/ai-answer-processor.ts` - 마크다운→HTML 변환

### 잘 되어 있는 것
- ✅ Google File Search 기반 완전 관리형 RAG (운영 부담 최소)
- ✅ SSE 실시간 스트리밍 (UX 향상)
- ✅ 5단계 법령명 추출 폴백 로직 (강건한 Citation 처리)
- ✅ 신뢰도 계산 및 경고 메시지 (citations 개수 기반)
- ✅ MAX_TOKENS 경고 처리

### 개선이 필요한 것

| 문제 | 영향도 | 복잡도 | 설명 |
|------|--------|--------|------|
| 답변 잘림 (MAX_TOKENS) | 🔴 높음 | 🟢 낮음 | 4096 토큰 제한으로 긴 답변 중단 |
| Citation 0개 시 환각 | 🔴 높음 | 🟡 중간 | Store에서 못 찾으면 일반 지식 사용 |
| 신뢰도 계산 단순 | 🟡 중간 | 🟢 낮음 | relevanceScore 미활용 |
| 시스템 프롬프트 고정 | 🟡 중간 | 🟢 낮음 | 질문 유형별 최적화 불가 |
| 쿼리 최적화 없음 | 🟡 중간 | 🟡 중간 | 오타/형식 불일치 시 검색 실패 |
| 답변 캐싱 없음 | 🟢 낮음 | 🟡 중간 | 동일 질문 반복 시 API 비용 낭비 |
| Metadata Filter 미활용 | 🟢 낮음 | 🟢 낮음 | 법령 유형별 필터링 안 함 |

---

## 🎯 개선 계획

### Phase A: Quick Wins (1-2일)

즉시 적용 가능한 빠른 개선 사항.

#### A1. maxOutputTokens 증가

**파일**: `lib/file-search-client.ts`
**위치**: L241 (generationConfig)

```typescript
// 현재
generationConfig: {
  maxOutputTokens: 4096
}

// 변경
generationConfig: {
  maxOutputTokens: 8192  // 2배 증가
}
```

**효과**: 긴 답변 중단 문제 90% 해결
**비용 영향**: 출력 토큰당 과금이므로 최대 2배 증가 가능 (실제로는 필요한 만큼만 사용)

---

#### A2. relevanceScore 기반 신뢰도 계산

**파일**: `app/api/file-search-rag/route.ts`
**위치**: L35-36

```typescript
// 현재: citations 개수만으로 판단
const confidenceLevel = citations.length >= 3 ? 'high' : citations.length >= 1 ? 'medium' : 'low'

// 변경: relevanceScore 평균값 + 개수 복합 판단
const avgScore = citations.length > 0
  ? citations.reduce((sum, c) => sum + (c.relevanceScore || 0), 0) / citations.length
  : 0

const confidenceLevel =
  citations.length >= 3 && avgScore > 0.7 ? 'high' :
  citations.length >= 1 && avgScore > 0.4 ? 'medium' : 'low'
```

**효과**: 품질 판단 정확도 향상, 낮은 relevanceScore인데 high로 표시되는 문제 해결

---

#### A3. Citation 0개 시 쿼리 재구성 재시도

**파일**: `lib/file-search-client.ts`
**위치**: queryFileSearchStream 함수 끝부분

```typescript
// 새로 추가할 로직
export async function* queryFileSearchStream(
  query: string,
  options?: {
    metadataFilter?: string
    isRetry?: boolean  // 새 옵션
  }
): AsyncGenerator<...> {

  // ... 기존 로직 ...

  // Citation 0개이고 첫 시도인 경우 재시도
  if (groundingChunks.length === 0 && !options?.isRetry) {
    console.log('[File Search] ⚠️ No citations found, attempting query reformulation...')

    // 쿼리 재구성 (간단한 정규화)
    const reformulatedQuery = reformulateQuery(query)

    if (reformulatedQuery !== query) {
      console.log('[File Search] Reformulated query:', reformulatedQuery)

      // 재귀 호출 (1회만)
      yield* queryFileSearchStream(reformulatedQuery, {
        ...options,
        isRetry: true
      })
      return  // 원래 결과 대신 재시도 결과 반환
    }
  }

  // 기존 yield 로직...
}

// 쿼리 정규화 헬퍼 함수
function reformulateQuery(query: string): string {
  let reformulated = query

  // 1. "N조" → "제N조" 정규화
  reformulated = reformulated.replace(/(\d+)조/g, '제$1조')

  // 2. "법시행령" → "법 시행령" 띄어쓰기
  reformulated = reformulated.replace(/(법)(시행령|시행규칙)/g, '$1 $2')

  // 3. 불필요한 조사 제거 (검색 노이즈)
  reformulated = reformulated.replace(/[은는이가을를의에서]/g, ' ').replace(/\s+/g, ' ').trim()

  return reformulated
}
```

**효과**: 검색 실패율 약 30% 감소 예상

---

### Phase B: 검색 품질 핵심 개선 (3-5일)

#### B4. 쿼리 전처리 파이프라인

**새 파일**: `lib/query-preprocessor.ts`

```typescript
/**
 * RAG 쿼리 전처리 파이프라인
 *
 * 사용자 입력을 File Search에 최적화된 형태로 변환
 */

export interface ProcessedQuery {
  originalQuery: string
  processedQuery: string
  extractedLaws: string[]      // 쿼리에서 추출된 법령명
  extractedArticles: string[]  // 쿼리에서 추출된 조문 번호
  queryType: 'specific' | 'general' | 'comparison' | 'procedural'
  confidence: number           // 전처리 신뢰도 (0-1)
}

export async function preprocessQuery(query: string): Promise<ProcessedQuery> {
  const originalQuery = query
  let processedQuery = query

  // 1. 법령명 추출 및 정규화
  const extractedLaws = extractLawNames(query)

  // 2. 조문 번호 추출 및 정규화
  const extractedArticles = extractArticleNumbers(query)
  processedQuery = normalizeArticleFormat(processedQuery)

  // 3. 띄어쓰기 정규화
  processedQuery = normalizeLawSpacing(processedQuery)

  // 4. 질문 유형 분류
  const queryType = classifyQueryType(query, extractedLaws, extractedArticles)

  // 5. 불필요한 조사/어미 제거 (검색 최적화)
  processedQuery = removeSearchNoise(processedQuery)

  return {
    originalQuery,
    processedQuery,
    extractedLaws,
    extractedArticles,
    queryType,
    confidence: calculateConfidence(extractedLaws, extractedArticles)
  }
}

// 법령명 추출
function extractLawNames(query: string): string[] {
  const laws: string[] = []

  // 「법령명」 패턴
  const bracketMatches = query.matchAll(/「([^」]+)」/g)
  for (const match of bracketMatches) {
    laws.push(match[1])
  }

  // 일반 법령명 패턴 (법, 령, 규칙, 조례로 끝나는 단어)
  const generalMatches = query.matchAll(/([가-힣]+(?:법|령|규칙|조례))/g)
  for (const match of generalMatches) {
    if (!laws.includes(match[1])) {
      laws.push(match[1])
    }
  }

  return laws
}

// 조문 번호 추출
function extractArticleNumbers(query: string): string[] {
  const articles: string[] = []

  // "제N조", "제N조의M", "N조" 패턴
  const matches = query.matchAll(/제?(\d+)조(?:의(\d+))?/g)
  for (const match of matches) {
    const articleNum = match[2]
      ? `제${match[1]}조의${match[2]}`
      : `제${match[1]}조`
    if (!articles.includes(articleNum)) {
      articles.push(articleNum)
    }
  }

  return articles
}

// 조문 형식 정규화
function normalizeArticleFormat(query: string): string {
  // "38조" → "제38조"
  return query.replace(/(?<!제)(\d+)조/g, '제$1조')
}

// 법령명 띄어쓰기 정규화
function normalizeLawSpacing(query: string): string {
  // "관세법시행령" → "관세법 시행령"
  return query
    .replace(/(법)(시행령)/g, '$1 $2')
    .replace(/(법)(시행규칙)/g, '$1 $2')
    .replace(/(령)(시행규칙)/g, '$1 $2')
}

// 질문 유형 분류
function classifyQueryType(
  query: string,
  laws: string[],
  articles: string[]
): 'specific' | 'general' | 'comparison' | 'procedural' {
  // 비교 질문
  if (query.includes('차이') || query.includes('비교') || query.includes('다른')) {
    return 'comparison'
  }

  // 절차 질문
  if (query.includes('절차') || query.includes('방법') || query.includes('어떻게')) {
    return 'procedural'
  }

  // 특정 조문 질문
  if (articles.length > 0) {
    return 'specific'
  }

  // 일반 질문
  return 'general'
}

// 검색 노이즈 제거
function removeSearchNoise(query: string): string {
  // 질문 어미 제거
  return query
    .replace(/\?$/, '')
    .replace(/(인가요|인지요|할까요|일까요|나요|는지|은지)$/, '')
    .trim()
}

// 전처리 신뢰도 계산
function calculateConfidence(laws: string[], articles: string[]): number {
  if (laws.length > 0 && articles.length > 0) return 1.0
  if (laws.length > 0) return 0.8
  if (articles.length > 0) return 0.6
  return 0.4
}
```

**적용 위치**: `lib/file-search-client.ts`의 queryFileSearchStream 시작 부분

```typescript
export async function* queryFileSearchStream(query: string, options?: {...}) {
  // 쿼리 전처리
  const processed = await preprocessQuery(query)
  const effectiveQuery = processed.processedQuery

  console.log('[File Search] Query preprocessing:', {
    original: query,
    processed: effectiveQuery,
    type: processed.queryType,
    laws: processed.extractedLaws,
    articles: processed.extractedArticles
  })

  // 이후 effectiveQuery 사용
  // ...
}
```

**효과**: 검색 적중률 +15% 예상

---

#### B5. 질문 유형별 시스템 프롬프트 최적화

**파일**: `lib/file-search-client.ts`
**위치**: L228-362 (PROMPT_TEMPLATES 정의)
**상태**: ✅ **구현 완료**

> ⚠️ **중요**: 프롬프트는 `lib/ai-answer-processor.ts`의 HTML 변환 로직과 완전히 호환됩니다.
> 기존 로직이 인식하는 패턴만 사용:
> - 주요 섹션: `📋 핵심 요약`, `📄 상세 내용`, `💡 추가 참고`, `🔗 관련 법령`
> - 핵심 요약 하위: `✅`, `📌`, `🔔` 이모지
> - 상세 내용 하위: `⚖️ 조문 발췌`, `📖 핵심 해석`, `📝 실무 적용`, `🔴 조건·예외`

**구현된 프롬프트 유형**:

| 유형 | 트리거 조건 | 특징 |
|------|-------------|------|
| `specific` | 질문에 조문 번호 포함 (제N조) | 조문 전문 인용, 항·호 상세 |
| `general` | 기본값 | 간결한 종합 답변, 핵심만 전달 |
| `comparison` | "차이", "비교", "다른" 포함 | A/B 대비 구조 |
| `procedural` | "절차", "방법", "어떻게" 포함 | 단계별 설명 |

**프롬프트 설계 원칙**:
1. 섹션 제목은 이모지 포함 정확히 일치
2. 법령명은 「」 괄호 사용
3. 항·호 번호는 ①②③, 1. 2. 3. 형식
4. 조문 찾지 못하면 "(조문 내용 없음)" 표시
5. general 유형은 간결함 강조 (장황한 설명 금지)

**호환성 체크리스트**:
| 패턴 | ai-answer-processor.ts 지원 | 비고 |
|------|---------------------------|------|
| `📋 핵심 요약` | ✅ | 주요 섹션 헤더 |
| `📄 상세 내용` | ✅ | 주요 섹션 헤더 |
| `💡 추가 참고` | ✅ | 주요 섹션 헤더 |
| `🔗 관련 법령` | ✅ | 주요 섹션 헤더 |
| `✅ 📌 🔔` | ✅ | 핵심 요약 하위 (hanging indent) |
| `⚖️ 조문 발췌` | ✅ | 상세 내용 하위 (blockquote 트리거) |
| `📖 핵심 해석` | ✅ | 상세 내용 하위 |
| `📝 실무 적용` | ✅ | 상세 내용 하위 |
| `🔴 조건·예외` | ✅ | 상세 내용 하위 |
| `📜` | ✅ | 조문 제목 (blockquote 내) |

**효과**: 질문 유형에 맞는 답변 구조 + 기존 CSS 스타일링 완전 호환

---

#### B6. 동일 질문 응답 캐싱 (IndexedDB)

**새 파일**: `lib/rag-response-cache.ts`

```typescript
/**
 * RAG 응답 캐시
 *
 * 동일한 질문에 대한 응답을 IndexedDB에 캐싱하여
 * API 비용 절감 및 응답 속도 향상
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb'

interface RAGCacheSchema extends DBSchema {
  responses: {
    key: string  // 쿼리 해시
    value: {
      query: string
      response: string
      citations: any[]
      confidenceLevel: string
      timestamp: number
      hitCount: number
    }
    indexes: { 'by-timestamp': number }
  }
}

const DB_NAME = 'lexdiff-rag-cache'
const DB_VERSION = 1
const CACHE_TTL = 24 * 60 * 60 * 1000  // 24시간
const MAX_ENTRIES = 500

let db: IDBPDatabase<RAGCacheSchema> | null = null

async function getDB(): Promise<IDBPDatabase<RAGCacheSchema>> {
  if (db) return db

  db = await openDB<RAGCacheSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore('responses', { keyPath: undefined })
      store.createIndex('by-timestamp', 'timestamp')
    }
  })

  return db
}

// 쿼리 해시 생성 (정규화 후)
function hashQuery(query: string): string {
  const normalized = query
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

  // 간단한 해시 (실제로는 더 강력한 해시 사용 권장)
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash.toString(36)
}

// 캐시에서 조회
export async function getCachedResponse(query: string): Promise<{
  response: string
  citations: any[]
  confidenceLevel: string
} | null> {
  try {
    const db = await getDB()
    const key = hashQuery(query)
    const cached = await db.get('responses', key)

    if (!cached) return null

    // TTL 체크
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      await db.delete('responses', key)
      return null
    }

    // 히트 카운트 증가
    cached.hitCount++
    await db.put('responses', cached, key)

    console.log('[RAG Cache] ✅ Cache hit for query:', query.substring(0, 50))

    return {
      response: cached.response,
      citations: cached.citations,
      confidenceLevel: cached.confidenceLevel
    }
  } catch (error) {
    console.error('[RAG Cache] Error:', error)
    return null
  }
}

// 캐시에 저장
export async function cacheResponse(
  query: string,
  response: string,
  citations: any[],
  confidenceLevel: string
): Promise<void> {
  try {
    const db = await getDB()
    const key = hashQuery(query)

    await db.put('responses', {
      query,
      response,
      citations,
      confidenceLevel,
      timestamp: Date.now(),
      hitCount: 0
    }, key)

    // 오래된 항목 정리 (MAX_ENTRIES 초과 시)
    const count = await db.count('responses')
    if (count > MAX_ENTRIES) {
      const oldestEntries = await db.getAllFromIndex(
        'responses',
        'by-timestamp',
        IDBKeyRange.lowerBound(0),
        count - MAX_ENTRIES
      )
      for (const entry of oldestEntries) {
        await db.delete('responses', hashQuery(entry.query))
      }
    }

    console.log('[RAG Cache] ✅ Cached response for query:', query.substring(0, 50))
  } catch (error) {
    console.error('[RAG Cache] Cache write error:', error)
  }
}

// 캐시 통계
export async function getCacheStats(): Promise<{
  totalEntries: number
  totalHits: number
  oldestEntry: number | null
}> {
  const db = await getDB()
  const all = await db.getAll('responses')

  return {
    totalEntries: all.length,
    totalHits: all.reduce((sum, e) => sum + e.hitCount, 0),
    oldestEntry: all.length > 0
      ? Math.min(...all.map(e => e.timestamp))
      : null
  }
}

// 캐시 전체 삭제
export async function clearCache(): Promise<void> {
  const db = await getDB()
  await db.clear('responses')
  console.log('[RAG Cache] ✅ Cache cleared')
}
```

**적용 위치**: `components/file-search-answer-display.tsx`의 쿼리 시작 부분

```typescript
// 캐시 확인
const cached = await getCachedResponse(query)
if (cached) {
  // 캐시된 응답 즉시 표시
  setAnswer(cached.response)
  setCitations(cached.citations)
  setConfidenceLevel(cached.confidenceLevel)
  setIsFromCache(true)
  return
}

// 캐시 미스 시 API 호출 후 저장
// ... 기존 SSE 로직 ...

// 완료 후 캐시 저장
await cacheResponse(query, fullAnswer, citations, confidenceLevel)
```

**효과**:
- 동일 질문 API 비용 100% 절감
- 캐시 히트 시 응답 시간 ~50ms (vs API ~2-5초)
- 예상 캐시 히트율: 20-30% (법령 질문 패턴 반복성)

---

### Phase C: 고급 기능 (1주+)

#### C7. Metadata Filter 활용

**파일**: `lib/file-search-client.ts`

```typescript
// 쿼리에서 법령 유형 추출하여 자동 필터 적용
function buildMetadataFilter(processed: ProcessedQuery): string | undefined {
  // 시행령 명시적 언급
  if (processed.processedQuery.includes('시행령')) {
    return 'law_type="시행령"'
  }

  // 시행규칙 명시적 언급
  if (processed.processedQuery.includes('시행규칙')) {
    return 'law_type="시행규칙"'
  }

  // 조례 언급
  if (processed.processedQuery.includes('조례')) {
    return 'law_type="조례"'
  }

  // 특정 법령명이 있으면 해당 법령군 필터
  if (processed.extractedLaws.length === 1) {
    const lawName = processed.extractedLaws[0]
    // 예: "관세법" → law_name LIKE "관세법%"
    return `law_name CONTAINS "${lawName.replace(/\s*(시행령|시행규칙)$/, '')}"`
  }

  return undefined  // 필터 없음 (전체 검색)
}
```

**효과**: 검색 정확도 향상, 무관한 법령 노이즈 감소

---

#### C8. 관련 법령 자동 확장 검색

**새 파일**: `lib/related-laws.ts`

```typescript
/**
 * 법령 계층 관계 매핑
 *
 * 모법 → 시행령 → 시행규칙 관계 정의
 */

// 주요 법령 계층 구조 (수동 매핑 또는 API 조회)
const LAW_HIERARCHY: Record<string, string[]> = {
  '관세법': ['관세법 시행령', '관세법 시행규칙'],
  '소득세법': ['소득세법 시행령', '소득세법 시행규칙'],
  '부가가치세법': ['부가가치세법 시행령', '부가가치세법 시행규칙'],
  // ... 추가
}

export function findRelatedLaws(lawName: string): string[] {
  // 정확히 일치하는 경우
  if (LAW_HIERARCHY[lawName]) {
    return LAW_HIERARCHY[lawName]
  }

  // 시행령/시행규칙인 경우 모법 찾기
  const baseLaw = lawName.replace(/\s*(시행령|시행규칙)$/, '')
  if (LAW_HIERARCHY[baseLaw]) {
    return [baseLaw, ...LAW_HIERARCHY[baseLaw].filter(l => l !== lawName)]
  }

  return []
}

// 쿼리 확장
export function expandQueryWithRelatedLaws(
  query: string,
  extractedLaws: string[]
): string {
  if (extractedLaws.length !== 1) return query

  const mainLaw = extractedLaws[0]
  const related = findRelatedLaws(mainLaw)

  if (related.length === 0) return query

  // 관련 법령 힌트 추가
  return `${query} (관련: ${related.join(', ')})`
}
```

**효과**: "관세법 제38조" 질문 시 시행령/시행규칙 관련 조문도 함께 검색

---

#### C9. 사용자 피드백 수집 및 학습

**새 파일**: `lib/rag-feedback.ts`

```typescript
/**
 * RAG 답변 품질 피드백 수집
 */

export interface RAGFeedback {
  query: string
  queryHash: string
  responsePreview: string
  rating: 'good' | 'bad'
  reason?: 'inaccurate' | 'incomplete' | 'irrelevant' | 'other'
  comment?: string
  timestamp: number
}

// IndexedDB에 피드백 저장
export async function saveFeedback(feedback: RAGFeedback): Promise<void> {
  // ... IndexedDB 저장 로직
}

// 피드백 통계 조회 (Admin용)
export async function getFeedbackStats(): Promise<{
  total: number
  goodRatio: number
  commonIssues: Array<{ reason: string; count: number }>
}> {
  // ... 통계 계산
}

// 품질 낮은 쿼리 패턴 추출 (프롬프트 개선용)
export async function getLowQualityPatterns(): Promise<string[]> {
  // 'bad' 피드백이 많은 쿼리 패턴 분석
}
```

**UI 컴포넌트 추가**: `components/rag-feedback-buttons.tsx`

```tsx
// 답변 하단에 👍/👎 버튼 추가
<div className="flex gap-2 mt-4">
  <Button variant="ghost" size="sm" onClick={() => handleFeedback('good')}>
    👍 도움이 됐어요
  </Button>
  <Button variant="ghost" size="sm" onClick={() => handleFeedback('bad')}>
    👎 개선이 필요해요
  </Button>
</div>
```

**효과**: 품질 낮은 패턴 식별 → 프롬프트/전처리 개선 반복

---

## 📈 예상 효과 요약

| Phase | 작업 | 예상 효과 | 비용 영향 |
|-------|------|----------|----------|
| A1 | maxOutputTokens 8192 | 답변 완성도 +90% | +50% (최대) |
| A2 | relevanceScore 신뢰도 | 품질 판단 정확도↑ | 없음 |
| A3 | Citation 0 재시도 | 검색 실패율 -30% | +30% (재시도 시) |
| B4 | 쿼리 전처리 | 검색 적중률 +15% | 없음 |
| B5 | 동적 프롬프트 | 답변 관련성↑ | 없음 |
| B6 | 응답 캐싱 | API 비용 -20~30% | -20~30% |
| C7 | Metadata Filter | 정확도↑, 노이즈↓ | 없음 |
| C8 | 관련 법령 확장 | 포괄성↑ | 없음 |
| C9 | 피드백 루프 | 지속적 개선 | 없음 |

---

## 🚀 구현 로드맵

### 권장 순서

```
Week 1 (Day 1-2): Phase A 전체
├── A1: maxOutputTokens 증가 (30분)
├── A2: relevanceScore 신뢰도 (1시간)
└── A3: Citation 0 재시도 (2시간)

Week 1 (Day 3-5): Phase B 시작
├── B4: 쿼리 전처리 파이프라인 (4시간)
└── B5: 동적 프롬프트 (2시간)

Week 2: Phase B 완료 + 테스트
├── B6: 응답 캐싱 (4시간)
└── 통합 테스트 및 버그 수정

Week 3+: Phase C (선택적)
├── C7: Metadata Filter (2시간)
├── C8: 관련 법령 확장 (3시간)
└── C9: 피드백 시스템 (1일)
```

---

## ⚠️ 리스크 및 고려사항

### 기술적 리스크
1. **maxOutputTokens 증가**: 비용 증가 가능 → 모니터링 필요
2. **쿼리 재시도**: 응답 시간 2배 가능 → 타임아웃 설정
3. **캐싱**: 법령 개정 시 stale 데이터 → TTL 24시간으로 제한

### 운영 고려사항
1. **캐시 무효화**: 법령 업데이트 시 관련 캐시 삭제 필요
2. **피드백 데이터**: 개인정보 없이 쿼리만 저장 (익명화)

---

## 🔗 관련 문서

- [RAG_ARCHITECTURE.md](../important-docs/RAG_ARCHITECTURE.md) - 현재 RAG 시스템 아키텍처
- [FUTURE_ROADMAP.md](./FUTURE_ROADMAP.md) - 전체 로드맵
- [GEMINI_FILE_SEARCH_GUIDE.md](../GEMINI_FILE_SEARCH_GUIDE.md) - Gemini API 가이드

---

**문서 버전**: 1.0
**작성자**: Claude Code
**승인 대기**: 사용자 검토 후 구현 시작
