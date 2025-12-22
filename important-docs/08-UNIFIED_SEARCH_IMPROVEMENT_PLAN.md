# 통합검색 개선 - 쿼리 분류 시스템 진일보 + 3곳 진입점 통합

## 🎯 목표

1. **쿼리 분류 시스템 진일보**: 현재 시스템의 치명적 문제 5개 해결 + 100개 테스트 100% 통과
2. **3곳 검색 진입점 통합**: 홈화면 SearchBar + 법령뷰/AI뷰 CommandSearchModal 모두 지원

## 📊 현재 시스템 분석 결과

### 강점 (유지)
1. ✅ 조문 번호 감지 정확
2. ✅ 종결어미 확정 패턴 144개
3. ✅ 도메인 감지 (관세/행정/공무원/세법) 120+ 엔티티
4. ✅ 복합 질문 감지
5. ✅ 긴 법령명 처리 (60자)

### 치명적 문제 (반드시 해결)
1. ❌ **세 파일 중복**: query-detector + legal-query-analyzer + query-preprocessor
2. ❌ **confidence 불일치**: searchMode 0.6 + queryType 0.95 → max(0.95) 선택 (모순)
3. ❌ **판례/해석례 감지 부재**: "대법원 2020도1234" → AI 검색 (오분류)
4. ❌ **키워드 충돌**: "면제 요건은?" → exemption (오답, 정답: requirement)
5. ❌ **조례 판별 약함**: "서울특별시 주차장 조례" 못 잡음

### 개선 가능
1. ⚠️ 도메인 감지 과잉 (엔티티 +0.1 → +0.05)
2. ⚠️ 법령명 추출 ("관세법시행령" 띄어쓰기 없음)
3. ⚠️ 자동완성 (판례/해석례 제안 없음, "관세법38조" 못 잡음)

---

## 📐 핵심 타입 정의

### UnifiedQueryClassification 인터페이스

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

### 통합 구조 (5개 함수)

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

---

## 🚀 Step 1: 쿼리 분류 시스템 통합 (`unified-query-classifier.ts`)

### 핵심 개선사항 (7가지)

**1. 통합 구조 (3개 → 1개)**
```typescript
export function classifySearchQuery(query: string): UnifiedQueryClassification {
  // 1. 패턴 감지 (우선순위: 판례 → 재결례 → 해석례 → 법령 → AI)
  const patterns = detectPatterns(query);

  // 2. 질문 유형 분석 (8가지: definition/requirement/...)
  const questionType = analyzeLegalQuestion(query);

  // 3. 도메인 감지 (4가지: customs/administrative/...)
  const domain = detectDomain(query);

  // 4. 신뢰도 계산 (조화평균)
  const confidence = calculateConfidence(patterns, questionType);

  // 5. 엔티티 추출
  const entities = extractEntities(query, patterns);

  // 6. 전처리 (RAG용)
  const preprocessed = preprocessForRAG(query, entities);

  return { patterns, questionType, domain, confidence, entities, preprocessed };
}
```

**2. Confidence 계산 개선 (조화평균)**
```typescript
// ❌ 기존: max(0.6, 0.95) = 0.95 (모순)
// ✅ 개선: 2 / (1/0.6 + 1/0.95) = 0.73 (조화평균)

interface ConfidenceScore {
  searchMode: number;
  queryType: number;
  overall: number;  // 조화평균
}
```

**3. 판례/해석례/재결례 패턴 추가**
```typescript
PRECEDENT_PATTERNS = [
  /((대법원|서울고법|...)\s*\d{4}(도|나|가|...)\d+)/,
  /\d{4}(도|나|가|마|...)\d+/,
  /(판례|판결|결정).*\d{4}년/
];

RULING_PATTERNS = [/(조심|국심)\s*\d{4}[서동중경인광대부전]\d+/];
INTERPRETATION_PATTERNS = [/(행정해석|법제처\s*해석|예규|고시|훈령)/];
```

**4. 키워드 충돌 해결 (우선순위)**
```typescript
// "면제 요건은?" → requirement (정답)
PRIORITY_KEYWORDS = {
  requirement: { priority: 1, patterns: [/(요건|조건)[은는]?\s*(무엇|뭐)/] },
  exemption: { priority: 2, patterns: [/(면제|면세)[은는]?\s*(대상|범위)/] }
};
```

**5. 조례 판별 강화 (양방향)**
```typescript
function isOrdinanceQuery(query: string): boolean {
  if (/조례|자치법규/.test(query)) return true;

  const regionPattern = /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(특별시|광역시|도)?/;
  if (regionPattern.test(query) && /(조례|규칙)/.test(query)) return true;

  return /((특별|광역)?시|도|군|구)\s*[가-힣]+\s*(조례|규칙)/.test(query) ||
         /(조례|규칙)\s*((특별|광역)?시|도|군|구)/.test(query);  // 역순 지원
}
```

**6. 법령명 추출 개선 (띄어쓰기 자동 삽입)**
```typescript
function extractLawNames(query: string): string[] {
  // "관세법시행령" → "관세법 시행령"
  return lawName
    .replace(/(법)(시행령)/, '$1 $2')
    .replace(/(법)(시행규칙)/, '$1 $2');
}
```

**7. 도메인 감지 조정 (가중치 절반)**
```typescript
// ❌ 기존: 엔티티 +0.1 → "관세법"만 있어도 0.6
// ✅ 개선: 법령명 +0.5, 엔티티 +0.05
```

### 테스트 케이스 (100개, 100% 통과 목표)

**법령 (30개)**: 짧은 법령 10 + 긴 법령 10 + 약어 5 + 조문 5
**조례 (10개)**: 지역명 앞 5 + 지역명 뒤 5
**판례 (15개)**: 법원+사건번호 5 + 사건번호만 5 + 키워드+연도 5
**해석례 (10개)**: 명시적 5 + 예규/고시 5
**재결례 (5개)**: 조심/국심 패턴
**AI 질문 (20개)**: definition 5 + requirement 5 + procedure 5 + application 5
**복합 (10개)**: 법령+판례 5 + 법령+해석례 5

### 우선순위 로직

**1. 명확한 패턴 매칭** (confidence 0.95+)
- 판례번호 → `precedent` (0.99)
- 재결번호 → `ruling` (0.98)
- 해석례 키워드 → `interpretation` (0.95)
- 법령명 + 조문 → `law` (0.95)

**2. 복합 쿼리 감지** (confidence 0.7-0.95)
- "민법 제38조 관련 판례" → `multi: ['law', 'precedent']` (0.85)
- "관세법 집행기준 고시" → `multi: ['law', 'interpretation']` (0.85)

**3. AI 질문** (confidence 0.7+)
- "38조 위반 시 어떻게 되나요?" → `ai` (법령 컨텍스트 자동 추출)
- 자연어 질문 패턴 (종결어미 144개)

### 파일 구조 (1500 라인)
```
lib/unified-query-classifier.ts
├─ 타입 정의 (100 라인)
├─ 패턴 정의 (200 라인)
├─ 핵심 함수 (600 라인)
│  ├─ detectPatterns
│  ├─ analyzeLegalQuestion
│  ├─ detectDomain
│  ├─ calculateConfidence
│  └─ extractEntities
├─ 유틸리티 (300 라인)
├─ 메인 export (100 라인)
└─ 테스트 (200 라인)
```

### 작업
1. `lib/unified-query-classifier.ts` 신규 생성 (1500 라인)
2. 기존 3개 파일 병합 + 7가지 개선사항 적용
3. 100개 테스트 케이스 100% 통과 검증
4. 기존 파일 삭제 (`query-detector`, `legal-query-analyzer`, `query-preprocessor`)
5. import 경로 변경 (Grep으로 전수 검색)

### 상세 작업 항목

**1. `lib/unified-query-classifier.ts` 신규 생성**
- 기존 파일 내용 복사 및 병합:
  - `query-detector.ts` → `detectQueryType`, `isNaturalLanguageQuery` 포함
  - `legal-query-analyzer.ts` → `analyzeLegalQuery`, 도메인 감지, 8가지 질문 유형 포함
  - `query-preprocessor.ts` → `preprocessQuery` 포함

**2. 신규 패턴 추가**
- `PRECEDENT_PATTERNS` (판례번호 감지)
- `RULING_PATTERNS` (재결례번호 감지)
- `INTERPRETATION_PATTERNS` (해석례 키워드 감지)

**3. 통합 함수 구현**
- `classifySearchQuery(query)` - 모든 분류 로직 통합
- 우선순위: 판례/재결례/해석례 → 법령 → AI

**4. 엔티티 추출 로직 추가**
- `caseNumber`, `court`, `rulingNumber`, `interpretationType` 추출

**5. 기존 export 함수 모두 유지** (하위 호환성)

**6. 테스트 케이스 작성** (10가지 쿼리 패턴)

### 검증 예시
```typescript
classifySearchQuery("대법원 2023도1234")
// → { searchType: 'precedent', caseNumber: '2023도1234', court: '대법원' }

classifySearchQuery("관세법 예규")
// → { searchType: 'interpretation', lawName: '관세법', ruleType: '예규' }

classifySearchQuery("민법 제38조")
// → { searchType: 'law', lawName: '민법', articleNumber: '제38조' }
```

### 완료 조건
- [ ] 기존 3개 파일 삭제 후 npm run build 성공
- [ ] 모든 import 경로 변경 완료 (Grep 전수 검색)
- [ ] 10가지 테스트 케이스 통과
- [ ] 100개 테스트 100% 통과

---

## 🚀 Step 2: CommandSearchModal 통합검색 적용

### 작업

**1. `handleSearch` 수정** (`components/command-search-modal.tsx:164-182`)
```typescript
const handleSearch = (query: string) => {
  if (!query.trim()) return;

  const classification = classifySearchQuery(query);  // ✅ unified-query-classifier

  onSearch({
    lawName: classification.entities.lawName || query,
    article: classification.entities.articleNumber,
    jo: classification.entities.articleNumber,
    searchType: classification.searchType,  // ✅ 신규
    caseNumber: classification.entities.caseNumber,  // ✅ 신규
    classification: classification  // ✅ 신규
  });

  onClose();
};
```

**2. onSearch prop 타입 확장**
```typescript
interface CommandSearchModalProps {
  onSearch: (query: {
    lawName: string;
    article?: string;
    jo?: string;
    searchType?: 'law' | 'ordinance' | 'precedent' | 'interpretation' | 'ruling' | 'ai' | 'multi';  // ✅ 신규
    caseNumber?: string;  // ✅ 신규
    classification?: UnifiedQueryClassification;  // ✅ 신규
  }) => void;
}
```

---

## 🚀 Step 3: SearchResultView 핸들러 연결

### 작업

**`search-result-view/index.tsx` 수정** (217-223줄)
```typescript
<CommandSearchModal
  onSearch={(query) => {
    if (query.classification) {
      switch (query.classification.searchType) {
        case 'precedent': handlers.handlePrecedentSearch(query); break;
        case 'interpretation': handlers.handleInterpretationSearch(query); break;
        case 'ruling': handlers.handleRulingSearch(query); break;
        case 'ai': handlers.handleAiSearch(query); break;
        case 'multi': handlers.handleMultiSearch(query); break;
        default: handlers.handleSearch(query);
      }
    } else {
      handlers.handleSearch(query);  // Fallback
    }
  }}
/>
```

---

## 🚀 Step 4: useSearchHandlers 훅 확장

### 작업

**타입별 핸들러 추가** (`components/search-result-view/hooks/useSearchHandlers.ts`)
```typescript
const handlePrecedentSearch = async (query) => {
  const res = await fetch(`/api/precedent-search?query=${query.caseNumber || query.classification?.preprocessedQuery}`);
  const data = await res.json();
  actions.setPrecedentResults(data.precedents);
  actions.setSearchType('precedent');
};

const handleInterpretationSearch = async (query) => { ... };
const handleRulingSearch = async (query) => { ... };
const handleMultiSearch = async (query) => { ... };

return {
  handleSearch,
  handlePrecedentSearch,  // ✅ 신규
  handleInterpretationSearch,  // ✅ 신규
  handleRulingSearch,  // ✅ 신규
  handleMultiSearch,  // ✅ 신규
  ...
};
```

### 상세 구현

**1. Precedent Search Handler**
```typescript
const handlePrecedentSearch = async (query) => {
  try {
    const caseNumber = query.caseNumber || query.classification?.entities.caseNumber;
    const court = query.classification?.entities.court;

    const params = new URLSearchParams({
      query: caseNumber || query.classification?.preprocessedQuery,
      ...(court && { court })
    });

    const res = await fetch(`/api/precedent-search?${params}`);
    const data = await res.json();

    actions.setPrecedentResults(data.precedents);
    actions.setSearchType('precedent');
  } catch (error) {
    console.error('Precedent search failed:', error);
    actions.setError('판례 검색 실패');
  }
};
```

**2. Interpretation Search Handler**
```typescript
const handleInterpretationSearch = async (query) => {
  const ruleType = query.classification?.entities.ruleType;
  const lawName = query.classification?.entities.lawName;

  const params = new URLSearchParams({
    query: query.classification?.preprocessedQuery,
    ...(ruleType && { ruleType }),
    ...(lawName && { lawName })
  });

  const res = await fetch(`/api/interpretation-search?${params}`);
  const data = await res.json();

  actions.setInterpretationResults(data.interpretations);
  actions.setSearchType('interpretation');
};
```

**3. Ruling Search Handler**
```typescript
const handleRulingSearch = async (query) => {
  const rulingNumber = query.classification?.entities.rulingNumber;

  const res = await fetch(`/api/ruling-search?query=${rulingNumber || query.classification?.preprocessedQuery}`);
  const data = await res.json();

  actions.setRulingResults(data.rulings);
  actions.setSearchType('ruling');
};
```

**4. Multi Search Handler** (병렬 검색)
```typescript
const handleMultiSearch = async (query) => {
  const { secondaryTypes } = query.classification;

  const promises = secondaryTypes.map(type => {
    switch (type) {
      case 'law': return handleLawSearch(query);
      case 'precedent': return handlePrecedentSearch(query);
      case 'interpretation': return handleInterpretationSearch(query);
      case 'ruling': return handleRulingSearch(query);
    }
  });

  await Promise.all(promises);
  actions.setSearchType('multi');
};
```

### 완료 조건
- [ ] 4개 핸들러 구현 완료
- [ ] 에러 처리 추가
- [ ] Fallback 로직 구현
- [ ] useSearchHandlers에서 export

---

## 🚀 Step 5: 홈화면 SearchBar 통합

### 작업

**`components/search-bar.tsx` 수정**
```typescript
import { classifySearchQuery } from '@/lib/unified-query-classifier';

const handleSubmit = () => {
  const classification = classifySearchQuery(query);

  onSearch?.({
    lawName: classification.entities.lawName || query,
    article: classification.entities.articleNumber,
    searchType: classification.searchType,
    classification: classification
  });
};

// ✅ 실시간 아이콘 표시
const icon = SEARCH_TYPE_ICONS[classifySearchQuery(query).searchType];
```

---

## 🚀 Step 6: 결과 렌더링 확장 (선택)

### 신규 컴포넌트
- `components/precedent-result-view.tsx`
- `components/interpretation-result-view.tsx`
- `components/ruling-result-view.tsx`
- `components/multi-source-result-view.tsx`

### SearchResultView 렌더링 분기
```typescript
{searchType === 'precedent' && <PrecedentResultView />}
{searchType === 'interpretation' && <InterpretationResultView />}
{searchType === 'ruling' && <RulingResultView />}
{searchType === 'multi' && <MultiSourceResultView />}
```

---

## 🚀 Step 7: 자동완성 API 확장 (선택)

### 작업

**`app/api/search-suggest/route.ts` 수정**
```typescript
// ✅ 판례 제안
if (/판례|판결|사건번호/.test(query)) {
  suggestions.push({ text: `${lawName} 판례`, type: 'precedent' });
}

// ✅ 해석례 제안
if (/(해석례|예규|고시)/.test(query)) {
  suggestions.push({ text: `${lawName} 행정해석`, type: 'interpretation' });
}

// ✅ 띄어쓰기 없는 조문 ("관세법38조" → "관세법 제38조")
const match = query.match(/^(.+?)(\d+)조$/);
if (match) {
  suggestions.push({ text: `${match[1]} 제${match[2]}조`, type: 'law' });
}
```

---

## 🔧 상세 구현 가이드

### Phase 2: 검색 실행 플로우 재설계 (P0)

**목표**: 타입별 최적화된 검색 실행 + 병렬 검색 지원

**구현 파일**: `components/search-result-view/hooks/useUnifiedSearch.ts` (신규)

**타입별 검색 로직**:

**1. `searchType: 'law'` - 법령 검색**
```
1. GET /api/law-search?query={lawName}
2. 사용자 법령 선택 (LawSearchResultList)
3. GET /api/eflaw?lawId={lawId}&mst={mst}
4. 조문 하이라이트 (entities.articleNumber 있으면)
```

**2. `searchType: 'precedent'` - 판례 검색**
```
1. GET /api/precedent-search?query={query}&court={court}
2. 메인 영역에 판례 리스트 표시 (신규 컴포넌트)
3. 사용자 판례 선택 → 모달에서 전문 표시
```

**3. `searchType: 'interpretation'` - 해석례 검색**
```
1. GET /api/interpretation-search?query={query}&ruleType={ruleType}
2. 메인 영역에 해석례 리스트 표시 (신규 컴포넌트)
3. 사용자 해석례 선택 → 모달에서 전문 표시
```

**4. `searchType: 'ruling'` - 재결례 검색**
```
1. GET /api/ruling-search?query={query}
2. 메인 영역에 재결례 리스트 표시 (신규 컴포넌트)
3. 사용자 재결례 선택 → 모달에서 전문 표시
```

**5. `searchType: 'ai'` - AI RAG 검색**
```
1. POST /api/file-search-rag { query, metadataFilter }
2. SSE 스트리밍 답변 표시
3. 관련 법령 카드 표시 (aiCitations)
```

**6. `searchType: 'multi'` - 병렬 검색**
```typescript
Promise.all([
  fetchLawSearch(),
  fetchPrecedentSearch(),
  fetchInterpretationSearch()
])

// 탭 UI로 결과 분리 표시
- Tab 1: 법령 (N건)
- Tab 2: 판례 (N건)
- Tab 3: 해석례 (N건)
```

**Fallback 전략**:
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

**목표**: 모든 검색 타입을 메인 영역에서 일관되게 표시

**신규 컴포넌트**:

**1. `PrecedentResultView`** (`components/precedent-result-view.tsx`)
- 판례 리스트 카드 (법원, 사건번호, 선고일, 제목)
- 클릭 시 `PrecedentDetailModal` 호출 (전문 표시)
- 페이지네이션 (20건씩)
- 관련 법령 링크 하이라이트 (`unified-link-generator.ts` 사용)

**2. `InterpretationResultView`** (`components/interpretation-result-view.tsx`)
- 해석례 리스트 카드 (발행기관, 문서번호, 제목, 날짜)
- 클릭 시 `InterpretationDetailModal` 호출
- 페이지네이션

**3. `RulingResultView`** (`components/ruling-result-view.tsx`)
- 재결례 리스트 카드 (심판청구번호, 결정일, 제목, 결정유형)
- 클릭 시 `RulingDetailModal` 호출
- 페이지네이션

**4. `MultiSourceResultView`** (`components/multi-source-result-view.tsx`)
- Tabs 컴포넌트 사용 (shadcn/ui)
- Tab 레이블에 결과 건수 표시 ("법령 (3)", "판례 (12)")
- 결과 없는 탭은 비활성화
- 각 탭에 기존 뷰 컴포넌트 렌더링

**렌더링 로직**:
```typescript
{classification.searchType === 'law' && (
  <LawViewer meta={lawData.meta} articles={lawData.articles} />
)}

{classification.searchType === 'precedent' && (
  <PrecedentResultView results={precedentResults} />
)}

{classification.searchType === 'interpretation' && (
  <InterpretationResultView results={interpretationResults} />
)}

{classification.searchType === 'ruling' && (
  <RulingResultView results={rulingResults} />
)}

{classification.searchType === 'ai' && (
  <LawViewer aiAnswerMode={true} aiAnswerContent={aiContent} />
)}

{classification.searchType === 'multi' && (
  <MultiSourceResultView />
)}
```

---

### Phase 4: 프로그레스 상태 통합 (P1)

**목표**: 검색 진행 상태를 단일 Context로 통합 관리

**구현 파일**: `lib/search-progress-context.tsx` (신규)

**Context 구조**:
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

---

### Phase 5: IndexedDB 캐싱 전략 통합 (P2)

**목표**: 모든 검색 결과를 일관된 TTL로 캐싱

**구현 파일**: `lib/unified-cache-manager.ts` (신규)

**캐시 정책**:
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

**캐시 키 전략**:
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

## 📋 구현 순서

- [ ] Step 1: `unified-query-classifier.ts` (1500 라인) + 100개 테스트 100% 통과
- [ ] Step 2: `CommandSearchModal` 통합검색 적용
- [ ] Step 3: `SearchResultView` 핸들러 연결
- [ ] Step 4: `useSearchHandlers` 훅 확장
- [ ] Step 5: 홈화면 `SearchBar` 통합
- [ ] Step 6: 결과 뷰 컴포넌트 (선택)
- [ ] Step 7: 자동완성 API 확장 (선택)

---

## 🎯 핵심 변경 파일

### 신규 생성 파일 (8개)

| 파일 | 설명 | 라인 수 |
|------|------|---------|
| `lib/unified-query-classifier.ts` | 통합 쿼리 분류기 (P0 ⭐⭐⭐) | 1500 |
| `components/search-result-view/hooks/useUnifiedSearch.ts` | 통합 검색 훅 (P0) | 400 |
| `lib/search-progress-context.tsx` | 프로그레스 Context (P1) | 150 |
| `components/precedent-result-view.tsx` | 판례 결과 뷰 (P2) | 200 |
| `components/interpretation-result-view.tsx` | 해석례 결과 뷰 (P2) | 200 |
| `components/ruling-result-view.tsx` | 재결례 결과 뷰 (P2) | 200 |
| `components/multi-source-result-view.tsx` | 멀티 소스 탭 뷰 (P2) | 250 |
| `lib/unified-cache-manager.ts` | 통합 캐시 매니저 (P2) | 300 |

### 수정 필요 파일 (5개)

| 파일 | 작업 | 우선순위 |
|------|------|----------|
| `components/command-search-modal.tsx` | handleSearch 수정 | P0 ⭐⭐ |
| `components/search-result-view/index.tsx` | CommandSearchModal onSearch 분기 | P0 ⭐⭐ |
| `components/search-result-view/hooks/useSearchHandlers.ts` | 타입별 핸들러 4개 추가 | P0 ⭐ |
| `components/search-bar.tsx` | classification 사용 | P1 |
| `app/api/search-suggest/route.ts` | 판례/해석례 제안 | P1 |

### 삭제 대상 파일 (3개)

- `lib/query-detector.ts` → `unified-query-classifier.ts`로 통합
- `lib/legal-query-analyzer.ts` → `unified-query-classifier.ts`로 통합
- `lib/query-preprocessor.ts` → `unified-query-classifier.ts`로 통합

**삭제 절차**:
1. 기존 3개 파일의 모든 export 함수를 `unified-query-classifier.ts`에 복사
2. 내부 상수/타입도 모두 이동
3. 사용처 전체 검색 (Grep) 후 import 경로 변경
4. 테스트 통과 확인 후 기존 파일 삭제

---

## 📊 테스트 시나리오

### 홈화면 (SearchBar)
1. "민법" → 법령
2. "대법원 2020도1234" → 판례
3. "관세법 예규" → 해석례

### 법령뷰/AI뷰 헤더 (CommandSearchModal) ⭐
4. 법령뷰 → 헤더 검색 → "관련 판례" → 판례 결과
5. 법령뷰 → "다른 법령" → 법령 결과
6. AI뷰 → "해석례" → 해석례 결과

---

## ⚠️ 주의사항

### 1. CommandSearchModal 우선
- **가장 중요**: Step 2-4 우선 완료
- 홈화면 SearchBar는 Step 5에서 추가 (선택)

### 2. 하위 호환성
- 기존 `query-detector.ts` 사용 코드 → `unified-query-classifier.ts`로 점진적 마이그레이션
- 호환성 alias 유지: `export { classifySearchQuery as getSearchMode }`
- 기존 `parseSearchQuery` Fallback 유지

### 3. 성능
- **병렬 검색 시 Promise.all 사용** (순차 호출 금지)
- **자동완성 API debounce 증가**: 200ms → 300ms
- **IndexedDB 쓰기 경합 방지**: Write-through 캐시 전략

### 4. UX
- **프로그레스 바 필수 표시** (1초 이상 걸리는 작업)
- **에러 발생 시 Fallback 옵션 제공**
- **"검색 결과 없음" 시 관련 검색어 제안**

### 5. 코드 품질
- **500+ 라인 함수 금지** (useSearchHandlers.ts 분리 필수)
- **타입 정의 중앙화** (`lib/types/index.ts`)
- **테스트 필수**: 100개 테스트 케이스 100% 통과 검증

---

## 📋 최종 요약

### 핵심 변경 사항

**1. 쿼리 분류 시스템 통합**
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

**5. 프로그레스 통합** (선택)
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
- [ ] Step 2: `CommandSearchModal` 통합검색 적용
- [ ] Step 3: `SearchResultView` 핸들러 연결
- [ ] Step 4: `useSearchHandlers` 훅 확장
- [ ] Step 5: `SearchBar` 통합 (선택)
- [ ] Step 6: 결과 뷰 컴포넌트 구현 (선택)
- [ ] Step 7: 자동완성 API 확장 (선택)

### 예상 작업 시간

- **Step 1-2**: 핵심 로직 (2-3시간)
- **Step 3-4**: UI 연결 (1-2시간)
- **Step 5-7**: 통합 및 테스트 (2-3시간)
- **총**: 5-8시간

---

**버전**: 1.1 | **작성일**: 2025-12-22 | **최종 수정**: 2025-12-22
