# 통합검색 개선 계획 - 판례/해석례/재결례 자동 감지 및 멀티 소스 검색

## 🎯 목표

현재 법령/AI 중심의 검색 구조를 **판례/해석례/재결례까지 자동 감지**하여 사용자가 의도한 검색을 정확히 실행하도록 개선.

## 🧭 사용자 승인사항

1. **개선 범위**: Full 자동화 - 모든 타입 자동 감지 + 병렬 검색 지원
2. **판례 표시**: 신규 `PrecedentResultView` 컴포넌트 (메인 영역에 리스트 표시)
3. **마이그레이션**: 즉시 통합 - 기존 3개 파일을 `unified-query-classifier.ts`로 병합

## 📊 현재 문제점

### 1. 쿼리 분류 시스템 중복 + 판례/해석례 감지 부재
- **3개 파일이 독립적으로 분류 로직 보유**:
  - `query-detector.ts` (structured vs natural)
  - `legal-query-analyzer.ts` (8가지 질문 유형 + 도메인 감지)
  - `query-preprocessor.ts` (RAG 전처리)
- **판례/해석례/재결례 패턴 감지 없음**: 법령/AI만 구분
- **결과**: "대법원 2023도1234 판결" → 법령 검색으로 오분류

### 2. 검색 모드 결정 로직 분산
- **SearchBar** (line 71-101): `isAiMode` 계산
- **SearchResultView** (`useSearchHandlers`): `handleSearchInternal` 분기
- **page.tsx**: `searchMode` 상태 관리
- **결과**: 판례 검색 모드 추가 시 3곳 모두 수정 필요

### 3. 검색 실행 플로우 경직성
- **현재**: 법령 → AI (Fallback)
- **필요**: 법령/판례/해석례/재결례 자동 병렬 검색 or 타입별 분기

### 4. 결과 렌더링 통합 부족
- **법령**: `LawViewer`
- **AI**: `LawViewer aiAnswerMode`
- **판례**: 사이드 패널만 (`PrecedentSection`)
- **문제**: 판례 단독 검색 시 메인 영역이 비어있음

### 5. 기존 API는 구현 완료
- **판례 검색 API**: `/api/precedent-search` (구현됨)
- **해석례 검색 API**: `/api/interpretation-search` (구현됨)
- **재결례 검색 API**: `/api/tax-tribunal-search` (조세심판원)
- **관세청 해석**: `/api/customs-search` (구현됨)
- **문제**: UI에서 자동 감지 및 호출 로직만 없음

---

## 🚀 개선 전략

### Phase 1: 쿼리 분류 시스템 통합 (P0)

#### 목표
단일 진실의 소스(SSOT)로 모든 검색 타입 감지

#### 구현 파일
`lib/unified-query-classifier.ts` (신규 생성)

#### 감지 로직 (우선순위 순)

**1. 판례 패턴 감지** (최우선)
```typescript
// 대법원 2023도1234, 서울고법 2022나12345, 헌재 2020헌마123
const PRECEDENT_PATTERNS = [
  /((대법원|서울고법|광주고법|대전고법|부산고법|인천고법|수원고법|춘천고법|헌재|헌법재판소)\s*\d{4}(도|나|가|마|바|사|아|자|카|타|파|하|고|라)\d+)/,
  /판례번호|사건번호.*\d{4}(도|나|가)/,
  /(판례|판결|결정).*\d{4}년/
];
// confidence: 0.99 (명확한 패턴 매칭 시)
```

**2. 재결례 패턴 감지**
```typescript
// 조심 2023-0001, 조심2023서0001, 심판청구, 이의신청
const RULING_PATTERNS = [
  /(조심|국심)\s*\d{4}[서동중경인광대부전]\d+/,
  /(심판청구|이의신청)번호.*\d{4}/,
  /재결(례)?.*\d{4}/
];
// confidence: 0.98
```

**3. 해석례 패턴 감지**
```typescript
// 행정해석, 법제처 해석, 예규, 고시, 훈령
const INTERPRETATION_PATTERNS = [
  /(행정해석|법제처\s*해석|유권해석)/,
  /(예규|고시|훈령|지침|규칙)/,
  /법령해석.*제\d+호/
];
// confidence: 0.95
```

**4. 법령 패턴 감지** (기존 유지)
```typescript
// 「민법」, 민법 제38조, 제38조
const LAW_PATTERNS = [
  /「([^」]+)」/,
  /^제\d+조(?:의\d+)?$/,
  /^[가-힣A-Za-z0-9·\s]+(?:법|령|규칙|규정|조례)$/
];
// confidence: 0.95 (순수 법령명) / 0.6 (애매한 경우)
```

**5. 복합 쿼리 감지** (신규)
```typescript
// "민법 제38조 관련 판례", "관세법 집행기준 고시"
const MULTI_PATTERNS = [
  /(법령명|조문).*(판례|판결|결정)/,
  /(법령명|조문).*(예규|고시|해석례)/
];
// → secondaryTypes: ['law', 'precedent'] or ['law', 'interpretation']
// confidence: 0.85
```

**6. AI 질문 감지** (기존 유지, 최하위 우선순위)
```typescript
// "~인가요?", "어떻게?", "무엇?", 긴 질문 (15자+)
// confidence ≥ 0.7
```

#### 반환 타입
```typescript
interface UnifiedQueryClassification {
  // Primary search type
  searchType: 'law' | 'ordinance' | 'ai' | 'precedent' | 'interpretation' | 'ruling' | 'multi';

  // Secondary types (multi인 경우)
  secondaryTypes?: Array<'law' | 'precedent' | 'interpretation' | 'ruling'>;

  // Confidence level
  confidence: number; // 0.0 ~ 1.0

  // Legal query type (기존 legal-query-analyzer.ts에서 통합)
  legalQueryType: 'definition' | 'requirement' | 'procedure' | 'comparison' |
                  'application' | 'consequence' | 'scope' | 'exemption';

  // Domain (기존 legal-query-analyzer.ts에서 통합)
  domain: 'customs' | 'administrative' | 'civil-service' | 'tax' | 'general';

  // Extracted entities
  entities: {
    lawName?: string;          // "민법"
    articleNumber?: string;    // "제38조"
    caseNumber?: string;       // "2023도1234"
    court?: string;            // "대법원"
    ruleType?: string;         // "예규", "고시"
    interpretationType?: string; // "행정해석", "유권해석"
    rulingNumber?: string;     // "조심2023서0001"
  };

  // Preprocessed query for RAG (기존 query-preprocessor.ts에서 통합)
  preprocessedQuery: string;

  // Additional metadata
  reason: string;              // 분류 이유
  isCompound: boolean;         // 복합 질문 여부 (기존 legal-query-analyzer)
  matchedPatterns: string[];   // 매칭된 패턴 이름
}
```

#### 통합 구조
```typescript
// lib/unified-query-classifier.ts 내부 구조

// 1. query-detector.ts 통합
export function detectQueryType(query: string): QueryDetectionResult { ... }
export function isNaturalLanguageQuery(query: string): boolean { ... }

// 2. legal-query-analyzer.ts 통합
export function analyzeLegalQuery(query: string): LegalQueryAnalysis { ... }
export function detectDomain(query: string): LegalDomain { ... }

// 3. query-preprocessor.ts 통합
export function preprocessQuery(query: string): string { ... }

// 4. 신규 통합 함수 (핵심)
export function classifySearchQuery(query: string): UnifiedQueryClassification {
  // 1. 판례/재결례/해석례 패턴 감지 (최우선)
  // 2. 법령 패턴 감지
  // 3. AI 질문 감지
  // 4. 복합 쿼리 감지
  // 5. 법률 질문 유형 분석
  // 6. 도메인 감지
  // 7. 엔티티 추출
  // 8. 쿼리 전처리
  // 9. 최종 결과 반환
}

// 5. 호환성 유지 (기존 코드용)
export { classifySearchQuery as getSearchMode } // query-detector.ts 호환
```

#### 우선순위 로직
1. **명확한 패턴 매칭** (confidence 0.95+)
   - 판례번호 → `precedent`
   - 재결번호 → `ruling`
   - 해석례 키워드 → `interpretation`
   - 법령명 + 조문 → `law`

2. **복합 쿼리 감지** (confidence 0.7-0.95)
   - "민법 제38조 관련 판례" → `multi: ['law', 'precedent']`
   - "관세법 집행기준 고시" → `multi: ['law', 'interpretation']`

3. **AI 질문** (confidence 0.7+)
   - "38조 위반 시 어떻게 되나요?" → `ai` (법령 컨텍스트 자동 추출)

---

### Phase 2: 검색 실행 플로우 재설계 (P0)

#### 목표
타입별 최적화된 검색 실행 + 병렬 검색 지원

#### 구현 파일
`components/search-result-view/hooks/useUnifiedSearch.ts` (신규)

#### 핵심 함수
```typescript
async function executeUnifiedSearch(
  classification: UnifiedQueryClassification
): Promise<UnifiedSearchResult>
```

#### 타입별 검색 로직

**1. `searchType: 'law'` - 법령 검색**
```typescript
1. GET /api/law-search?query={lawName}
2. 사용자 법령 선택 (LawSearchResultList)
3. GET /api/eflaw?lawId={lawId}&mst={mst}
4. 조문 하이라이트 (entities.articleNumber 있으면)
```

**2. `searchType: 'precedent'` - 판례 검색**
```typescript
1. GET /api/precedent-search?query={query}&court={court}
2. 메인 영역에 판례 리스트 표시 (신규 컴포넌트)
3. 사용자 판례 선택 → 모달에서 전문 표시
```

**3. `searchType: 'interpretation'` - 해석례 검색**
```typescript
1. GET /api/interpretation-search?query={query}&ruleType={ruleType}
2. 메인 영역에 해석례 리스트 표시 (신규 컴포넌트)
3. 사용자 해석례 선택 → 모달에서 전문 표시
```

**4. `searchType: 'ruling'` - 재결례 검색**
```typescript
1. GET /api/ruling-search?query={query}
2. 메인 영역에 재결례 리스트 표시 (신규 컴포넌트)
3. 사용자 재결례 선택 → 모달에서 전문 표시
```

**5. `searchType: 'ai'` - AI RAG 검색**
```typescript
1. POST /api/file-search-rag { query, metadataFilter }
2. SSE 스트리밍 답변 표시
3. 관련 법령 카드 표시 (aiCitations)
```

**6. `searchType: 'multi'` - 병렬 검색**
```typescript
1. Promise.all([
     fetchLawSearch(),
     fetchPrecedentSearch(),
     fetchInterpretationSearch()
   ])
2. 탭 UI로 결과 분리 표시 (신규)
   - Tab 1: 법령 (N건)
   - Tab 2: 판례 (N건)
   - Tab 3: 해석례 (N건)
```

#### Fallback 전략
```typescript
// 법령 검색 실패 시
if (lawSearchResults.length === 0 && confidence < 0.95) {
  // "법령을 찾을 수 없습니다. AI 검색을 시도할까요?" 다이얼로그
  if (userConfirm) {
    executeAiSearch(query);
  }
}
```

---

### Phase 3: 결과 렌더링 통합 (P1)

#### 목표
모든 검색 타입을 메인 영역에서 일관되게 표시

#### 구현 파일
`components/search-result-view/index.tsx` (수정)

#### 렌더링 로직
```typescript
{classification.searchType === 'law' && (
  <LawViewer meta={lawData.meta} articles={lawData.articles} />
)}

{classification.searchType === 'precedent' && (
  <PrecedentResultView results={precedentResults} />  // 신규
)}

{classification.searchType === 'interpretation' && (
  <InterpretationResultView results={interpretationResults} />  // 신규
)}

{classification.searchType === 'ruling' && (
  <RulingResultView results={rulingResults} />  // 신규
)}

{classification.searchType === 'ai' && (
  <LawViewer aiAnswerMode={true} aiAnswerContent={aiContent} />
)}

{classification.searchType === 'multi' && (
  <MultiSourceResultView>  // 신규
    <Tabs>
      <Tab label="법령 ({lawResults.length})">
        <LawSearchResultList />
      </Tab>
      <Tab label="판례 ({precedentResults.length})">
        <PrecedentResultView />
      </Tab>
      <Tab label="해석례 ({interpretationResults.length})">
        <InterpretationResultView />
      </Tab>
    </Tabs>
  </MultiSourceResultView>
)}
```

#### 신규 컴포넌트

**1. `PrecedentResultView`**
- 판례 리스트 카드 (법원, 사건번호, 선고일, 제목)
- 클릭 시 모달로 전문 표시
- 관련 법령 링크 하이라이트

**2. `InterpretationResultView`**
- 해석례 리스트 카드 (발행기관, 문서번호, 제목)
- 클릭 시 모달로 전문 표시

**3. `RulingResultView`**
- 재결례 리스트 카드 (심판청구번호, 결정일, 제목)
- 클릭 시 모달로 전문 표시

**4. `MultiSourceResultView`**
- 탭 기반 멀티 소스 결과 표시
- 각 탭에 결과 건수 표시
- 결과 없는 탭은 비활성화

---

### Phase 4: 프로그레스 상태 통합 (P1)

#### 목표
검색 진행 상태를 단일 Context로 통합 관리

#### 구현 파일
`lib/search-progress-context.tsx` (신규)

#### Context 구조
```typescript
interface SearchProgressState {
  // Current stage
  stage: 'idle' | 'classifying' | 'searching' | 'parsing' | 'rendering' | 'complete' | 'error';

  // Progress percentage (0-100)
  progress: number;

  // Stage-specific message
  message: string;

  // Multi-source progress
  multiSourceProgress?: {
    law: { stage: string; progress: number };
    precedent: { stage: string; progress: number };
    interpretation: { stage: string; progress: number };
  };
}

const SearchProgressContext = createContext<{
  state: SearchProgressState;
  updateProgress: (stage: string, progress: number, message: string) => void;
}>(null);
```

#### 사용 예시
```typescript
// SearchBar
const { updateProgress } = useSearchProgress();

async function handleSubmit() {
  updateProgress('classifying', 10, '쿼리 분석 중...');
  const classification = await classifyQuery(query);

  updateProgress('searching', 30, '법령 검색 중...');
  const results = await executeSearch(classification);

  updateProgress('parsing', 80, '결과 파싱 중...');
  const parsed = parseResults(results);

  updateProgress('complete', 100, '검색 완료');
}
```

---

### Phase 5: IndexedDB 캐싱 전략 통합 (P2)

#### 목표
모든 검색 결과를 일관된 TTL로 캐싱

#### 구현 파일
`lib/unified-cache-manager.ts` (신규)

#### 캐시 정책
```typescript
const CACHE_TTL = {
  lawContent: 7 * 24 * 60 * 60 * 1000,      // 7일 (법령 본문)
  precedent: 3 * 24 * 60 * 60 * 1000,       // 3일 (판례)
  interpretation: 3 * 24 * 60 * 60 * 1000,  // 3일 (해석례)
  ruling: 3 * 24 * 60 * 60 * 1000,          // 3일 (재결례)
  aiAnswer: 1 * 24 * 60 * 60 * 1000,        // 1일 (AI 답변)
  searchResult: 7 * 24 * 60 * 60 * 1000,    // 7일 (검색 결과)
};
```

#### 캐시 키 전략
```typescript
// 법령: lawId + mst + articleNumber (optional)
const cacheKey = `law:${lawId}:${mst}:${articleNumber || 'all'}`;

// 판례: caseNumber + court
const cacheKey = `precedent:${caseNumber}:${court}`;

// 해석례: documentNumber
const cacheKey = `interpretation:${documentNumber}`;

// AI: query hash + timestamp (hourly)
const cacheKey = `ai:${hashQuery(query)}:${Math.floor(Date.now() / 3600000)}`;
```

---

## 📁 수정 대상 파일

### 신규 생성 (6개)
1. `lib/unified-query-classifier.ts` - 통합 쿼리 분류기
2. `components/search-result-view/hooks/useUnifiedSearch.ts` - 통합 검색 훅
3. `lib/search-progress-context.tsx` - 프로그레스 Context
4. `components/precedent-result-view.tsx` - 판례 결과 뷰
5. `components/interpretation-result-view.tsx` - 해석례 결과 뷰
6. `components/ruling-result-view.tsx` - 재결례 결과 뷰
7. `components/multi-source-result-view.tsx` - 멀티 소스 탭 뷰
8. `lib/unified-cache-manager.ts` - 통합 캐시 매니저

### 수정 필요 (7개)
1. `components/search-bar.tsx` - `unified-query-classifier` 사용
2. `components/search-result-view/index.tsx` - 렌더링 로직 분기 추가
3. `components/search-result-view/hooks/useSearchHandlers.ts` - `useUnifiedSearch` 위임
4. `app/page.tsx` - `SearchProgressContext` Provider 추가
5. `lib/query-detector.ts` - Deprecated 표시 (backward compatibility)
6. `lib/legal-query-analyzer.ts` - `unified-query-classifier`에 통합
7. `lib/query-preprocessor.ts` - `unified-query-classifier`에 통합

### 삭제 대상 (즉시 병합)
- `lib/query-detector.ts` → `unified-query-classifier.ts`로 완전 통합
- `lib/legal-query-analyzer.ts` → `unified-query-classifier.ts`로 완전 통합
- `lib/query-preprocessor.ts` → `unified-query-classifier.ts`로 완전 통합

**삭제 방법**:
1. 기존 3개 파일의 모든 export 함수를 `unified-query-classifier.ts`에 복사
2. 내부 상수/타입도 모두 이동
3. 사용처 전체 검색 (Grep) 후 import 경로 변경
4. 테스트 통과 확인 후 기존 파일 삭제

---

## 🎯 구현 순서

### Step 1: `unified-query-classifier.ts` 구현 및 기존 파일 병합
**핵심**: 기존 3개 파일을 완전 통합 + 판례/해석례/재결례 패턴 추가

**작업**:
1. `lib/unified-query-classifier.ts` 신규 생성
2. 기존 파일 내용 복사 및 병합:
   - `query-detector.ts` → `detectQueryType`, `isNaturalLanguageQuery` 포함
   - `legal-query-analyzer.ts` → `analyzeLegalQuery`, 도메인 감지, 8가지 질문 유형 포함
   - `query-preprocessor.ts` → `preprocessQuery` 포함
3. 신규 패턴 추가:
   - `PRECEDENT_PATTERNS` (판례번호 감지)
   - `RULING_PATTERNS` (재결례번호 감지)
   - `INTERPRETATION_PATTERNS` (해석례 키워드 감지)
4. 통합 함수 구현:
   - `classifySearchQuery(query)` - 모든 분류 로직 통합
   - 우선순위: 판례/재결례/해석례 → 법령 → AI
5. 엔티티 추출 로직 추가:
   - `caseNumber`, `court`, `rulingNumber`, `interpretationType` 추출
6. 기존 export 함수 모두 유지 (하위 호환성)
7. 테스트 케이스 작성 (10가지 쿼리 패턴)

**검증**:
- `classifySearchQuery("대법원 2023도1234")` → `{ searchType: 'precedent', caseNumber: '2023도1234', court: '대법원' }`
- `classifySearchQuery("관세법 예규")` → `{ searchType: 'interpretation', lawName: '관세법', ruleType: '예규' }`
- `classifySearchQuery("민법 제38조")` → `{ searchType: 'law', lawName: '민법', articleNumber: '제38조' }`

**완료 조건**:
- 기존 3개 파일 삭제 후 npm run build 성공
- 모든 import 경로 변경 완료
- 10가지 테스트 케이스 통과

---

### Step 2: 검색 실행 훅 재설계 - `useUnifiedSearch.ts`
**핵심**: `useSearchHandlers.ts`의 500+ 라인 `handleSearchInternal` 함수 분리

**작업**:
1. `components/search-result-view/hooks/useUnifiedSearch.ts` 신규 생성
2. 타입별 검색 함수 분리:
   ```typescript
   async function handleLawSearch(classification: UnifiedQueryClassification): Promise<LawSearchResult>
   async function handlePrecedentSearch(classification: UnifiedQueryClassification): Promise<PrecedentSearchResult>
   async function handleInterpretationSearch(classification: UnifiedQueryClassification): Promise<InterpretationSearchResult>
   async function handleRulingSearch(classification: UnifiedQueryClassification): Promise<RulingSearchResult>
   async function handleAiSearch(classification: UnifiedQueryClassification): Promise<AiSearchResult>
   async function handleMultiSearch(classification: UnifiedQueryClassification): Promise<MultiSearchResult>
   ```
3. 메인 함수:
   ```typescript
   export function useUnifiedSearch() {
     const executeSearch = async (query: string) => {
       const classification = classifySearchQuery(query);

       switch (classification.searchType) {
         case 'law': return handleLawSearch(classification);
         case 'precedent': return handlePrecedentSearch(classification);
         case 'interpretation': return handleInterpretationSearch(classification);
         case 'ruling': return handleRulingSearch(classification);
         case 'ai': return handleAiSearch(classification);
         case 'multi': return handleMultiSearch(classification);
       }
     };

     return { executeSearch };
   }
   ```
4. Fallback 전략 구현:
   - 법령 검색 실패 (결과 0건) → AI 검색 제안 다이얼로그
   - 판례 검색 실패 → 법령 검색 시도 (법령명이 있는 경우)

**완료 조건**:
- `useSearchHandlers.ts`에서 `useUnifiedSearch` 사용
- 각 검색 함수 200 라인 이하
- Fallback 동작 확인

---

### Step 3: 결과 뷰 컴포넌트 구현
**핵심**: 판례/해석례/재결례 메인 영역 표시 + 멀티 소스 탭 UI

**3-1. `PrecedentResultView`** (`components/precedent-result-view.tsx`)
- 판례 리스트 카드 (법원, 사건번호, 선고일, 제목)
- 클릭 시 `PrecedentDetailModal` 호출 (전문 표시)
- 페이지네이션 (20건씩)
- 관련 법령 링크 하이라이트 (`unified-link-generator.ts` 사용)

**3-2. `InterpretationResultView`** (`components/interpretation-result-view.tsx`)
- 해석례 리스트 카드 (발행기관, 문서번호, 제목, 날짜)
- 클릭 시 `InterpretationDetailModal` 호출
- 페이지네이션

**3-3. `RulingResultView`** (`components/ruling-result-view.tsx`)
- 재결례 리스트 카드 (심판청구번호, 결정일, 제목, 결정유형)
- 클릭 시 `RulingDetailModal` 호출
- 페이지네이션

**3-4. `MultiSourceResultView`** (`components/multi-source-result-view.tsx`)
- Tabs 컴포넌트 사용 (shadcn/ui)
- Tab 레이블에 결과 건수 표시 ("법령 (3)", "판례 (12)")
- 결과 없는 탭은 비활성화
- 각 탭에 기존 뷰 컴포넌트 렌더링

**3-5. 상세 모달 컴포넌트**
- `components/modals/precedent-detail-modal.tsx`
- `components/modals/interpretation-detail-modal.tsx`
- `components/modals/ruling-detail-modal.tsx`
- 전문 표시, 관련 법령 링크, 히스토리 뒤로가기 지원

**완료 조건**:
- 각 뷰 컴포넌트 단독 테스트 성공
- 모달 내 법령 링크 클릭 시 히스토리 스택 동작 확인
- 페이지네이션 동작 확인

---

### Step 4: `SearchResultView` 렌더링 로직 통합
**핵심**: 모든 검색 타입을 메인 영역에서 일관되게 표시

**작업**:
1. `components/search-result-view/index.tsx` 수정
2. 렌더링 분기 추가:
   ```typescript
   {classification?.searchType === 'law' && <LawViewer />}
   {classification?.searchType === 'precedent' && <PrecedentResultView />}
   {classification?.searchType === 'interpretation' && <InterpretationResultView />}
   {classification?.searchType === 'ruling' && <RulingResultView />}
   {classification?.searchType === 'ai' && <LawViewer aiAnswerMode={true} />}
   {classification?.searchType === 'multi' && <MultiSourceResultView />}
   ```
3. `useSearchState` 훅에 상태 추가:
   - `precedentResults`, `interpretationResults`, `rulingResults`
   - `multiSourceResults`

**완료 조건**:
- 모든 검색 타입 렌더링 정상 동작
- 타입 전환 시 깔끔한 UI 전환

---

### Step 5: `SearchBar` 통합 및 아이콘 표시
**핵심**: `classifySearchQuery` 사용 + 실시간 타입 표시

**작업**:
1. `components/search-bar.tsx` 수정
2. `unified-query-classifier` import
3. 실시간 분류 (line 71-101 수정):
   ```typescript
   const classification = classifySearchQuery(query);
   const icon = getSearchTypeIcon(classification.searchType);
   ```
4. 아이콘 표시 (검색창 우측):
   - `law`: Gavel (기존)
   - `precedent`: Scale (저울)
   - `interpretation`: FileText (문서)
   - `ruling`: Hammer (망치)
   - `ai`: Brain (기존)
   - `multi`: Grid (그리드)

**완료 조건**:
- 타이핑 시 실시간 아이콘 변경
- 자동완성 제안에 타입별 아이콘 표시

---

### Step 6: 프로그레스 Context 통합 (선택적)
**핵심**: 검색 진행 상태를 단일 Context로 통합 관리

**작업**:
1. `lib/search-progress-context.tsx` 신규 생성
2. Context 구조:
   ```typescript
   interface SearchProgressState {
     stage: 'idle' | 'classifying' | 'searching' | 'parsing' | 'rendering' | 'complete';
     progress: number; // 0-100
     message: string;
     multiSourceProgress?: { law: ..., precedent: ..., interpretation: ... };
   }
   ```
3. `app/page.tsx`에 Provider 추가
4. SearchBar, SearchResultView에서 사용

**완료 조건**:
- 프로그레스 바 표시 정상 동작
- 멀티 소스 검색 시 개별 진행률 표시

---

### Step 7: 통합 테스트 및 디버깅
**핵심**: 10가지 쿼리 시나리오 End-to-End 테스트

**테스트 시나리오**:
1. "민법 제38조" → 법령 검색 → 조문 표시
2. "대법원 2023도1234" → 판례 검색 → 판례 리스트 → 전문 모달
3. "관세법 집행기준" → 해석례 검색 → 해석례 리스트
4. "조심2023서0001" → 재결례 검색 → 재결례 리스트
5. "38조 위반 시 어떻게 되나요?" → AI 검색 → 스트리밍 답변
6. "민법 제38조 관련 판례" → 멀티 검색 → 탭 UI (법령 + 판례)
7. "관세법 예규" → 멀티 검색 → 탭 UI (법령 + 해석례)
8. "비영리법인" → confidence 0.6 → 다이얼로그 (법령 or AI)
9. "없는 법령명" → 법령 검색 실패 → AI Fallback 제안
10. "서울특별시 주차장 조례" → 조례 검색 → 조례 검색 결과

**검증 항목**:
- 쿼리 분류 정확도 (10/10 정답)
- 검색 결과 표시 정상 여부
- 캐싱 동작 확인 (두 번째 검색 시 캐시 사용)
- 프로그레스 표시 정상 여부
- 에러 처리 (네트워크 오류, API 오류)

**완료 조건**:
- 모든 시나리오 통과
- 사용자 승인

---

## 📊 테스트 시나리오 (10가지)

1. **법령 단독**: "민법 제38조" → `law`
2. **판례 단독**: "대법원 2023도1234" → `precedent`
3. **해석례 단독**: "관세법 집행기준" → `interpretation`
4. **재결례 단독**: "조심 2023-0001" → `ruling`
5. **AI 질문**: "38조 위반 시 어떻게 되나요?" → `ai`
6. **법령 + 판례**: "민법 제38조 관련 판례" → `multi: ['law', 'precedent']`
7. **법령 + 해석례**: "관세법 예규" → `multi: ['law', 'interpretation']`
8. **애매한 쿼리**: "비영리법인" → confidence 0.6-0.7 → 다이얼로그
9. **법령 검색 실패**: "없는 법령명" → Fallback to AI
10. **조례 검색**: "서울특별시 주차장 설치 및 관리 조례" → `law` (isOrdinance: true)

---

## ⚠️ 주의사항

### 1. 하위 호환성
- 기존 `query-detector.ts` 사용 코드 → `unified-query-classifier.ts`로 점진적 마이그레이션
- Deprecated 경고 추가, 3개월 후 삭제

### 2. 성능
- 병렬 검색 시 Promise.all 사용 (순차 호출 금지)
- 자동완성 API debounce 증가 (200ms → 300ms)
- IndexedDB 쓰기 경합 방지 (Write-through 전략)

### 3. UX
- 프로그레스 바 필수 표시 (1초 이상 걸리는 작업)
- 에러 발생 시 Fallback 옵션 제공
- "검색 결과 없음" 시 관련 검색어 제안

### 4. 코드 품질
- 500+ 라인 함수 금지 (useSearchHandlers.ts 분리 필수)
- 타입 정의 중앙화 (`lib/types/index.ts`)
- 단위 테스트 작성 (Jest + React Testing Library)

---

## 🔄 PDCA 사이클

### Plan (이 문서)
- 문제점 분석 ✅
- 개선 전략 수립 ✅
- 구현 순서 정의 ✅

### Do
- Step 1~7 순서대로 구현
- 각 Step 완료 후 Todo 업데이트

### Check
- 각 Step 완료 후 사용자 확인 요청
- 10가지 테스트 시나리오 검증

### Act
- 피드백 반영
- 다음 Step 진행

---

## 📋 최종 요약

### 핵심 변경 사항

**1. 쿼리 분류 시스템 통합 (즉시 병합)**
- 기존 3개 파일 → `lib/unified-query-classifier.ts` 1개로 통합
- 판례/해석례/재결례 자동 감지 추가
- 복합 쿼리 감지 및 멀티 소스 검색 지원

**2. 검색 실행 로직 재설계**
- `useSearchHandlers.ts` 500+ 라인 함수 → 타입별 함수 6개로 분리
- `useUnifiedSearch` 훅 신규 생성
- Fallback 전략 구현 (법령 실패 → AI 제안)

**3. 결과 렌더링 확장**
- 판례/해석례/재결례 메인 영역 표시 (신규 컴포넌트 4개)
- 멀티 소스 탭 UI (shadcn/ui Tabs)
- 상세 모달 3개 (전문 표시 + 히스토리 지원)

**4. SearchBar 개선**
- 실시간 검색 타입 아이콘 표시 (6가지 타입)
- 자동완성 제안에 타입별 아이콘 추가

**5. 프로그레스 통합 (선택적)**
- 단일 Context로 검색 진행 상태 관리
- 멀티 소스 검색 시 개별 진행률 표시

### 예상 효과

**UX 개선**:
- 사용자가 의도한 검색을 자동으로 정확히 실행
- 판례/해석례/재결례 검색 시 메인 영역 활용
- 복합 쿼리 시 탭으로 모든 결과 한눈에 확인

**코드 품질**:
- 쿼리 분류 로직 단일화 (DRY 원칙)
- 500+ 라인 함수 제거 (유지보수성 향상)
- 타입별 검색 함수 분리 (단일 책임 원칙)

**확장성**:
- 새로운 검색 타입 추가 시 1개 함수만 추가
- 패턴 추가 시 1개 파일만 수정

### 구현 체크리스트

- [ ] Step 1: `unified-query-classifier.ts` 구현 및 기존 파일 병합
- [ ] Step 2: `useUnifiedSearch.ts` 훅 구현
- [ ] Step 3: 결과 뷰 컴포넌트 구현 (4개)
- [ ] Step 4: `SearchResultView` 렌더링 로직 통합
- [ ] Step 5: `SearchBar` 통합 및 아이콘 표시
- [ ] Step 6: 프로그레스 Context 통합 (선택적)
- [ ] Step 7: 통합 테스트 (10가지 시나리오)

### 예상 작업 시간

- Step 1-2: 핵심 로직 (2-3시간)
- Step 3-4: UI 컴포넌트 (3-4시간)
- Step 5-7: 통합 및 테스트 (2-3시간)
- **총**: 7-10시간

---

**버전**: 1.0 | **작성일**: 2025-12-21
