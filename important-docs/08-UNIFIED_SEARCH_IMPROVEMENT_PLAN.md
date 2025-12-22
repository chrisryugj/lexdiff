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

### 완료 조건
- [ ] 100개 테스트 100% 통과
- [ ] npm run build 성공
- [ ] 기존 3개 파일 삭제 완료

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

| 파일 | 작업 | 우선순위 |
|------|------|----------|
| `lib/unified-query-classifier.ts` | 신규 생성 (1500 라인) | P0 ⭐⭐⭐ |
| `components/command-search-modal.tsx` | handleSearch 수정 | P0 ⭐⭐ |
| `components/search-result-view/index.tsx` | CommandSearchModal onSearch 분기 | P0 ⭐⭐ |
| `components/search-result-view/hooks/useSearchHandlers.ts` | 타입별 핸들러 4개 추가 | P0 ⭐ |
| `components/search-bar.tsx` | classification 사용 | P1 |
| `app/api/search-suggest/route.ts` | 판례/해석례 제안 | P1 |
| 결과 뷰 컴포넌트 4개 | 신규 생성 | P2 |

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

### CommandSearchModal 우선
- **가장 중요**: Step 2-4 우선 완료

### 하위 호환성
- 기존 `parseSearchQuery` Fallback 유지

### 테스트 필수
- 100개 테스트 케이스 100% 통과 검증

---

**버전**: 1.0 | **작성일**: 2025-12-21
