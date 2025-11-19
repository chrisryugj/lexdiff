# AI 뷰 최적화 계획 (현행화 버전)

**작성일**: 2025-11-19
**목적**: AI 검색 뷰 관련 코드 정리 및 실전 최적화 세부계획
**기준**: 현재 코드 상태 면밀 분석 및 에러 없는 안전한 최적화

---

## 📊 현황 분석 (2025-11-19 기준)

### 1. 현재 코드 상태 요약

| 항목 | 상태 | 비고 |
|------|------|------|
| **file-search-rag-view.tsx** | 313줄 | ✅ **최적화 완료** (progressStage 제거됨) |
| **law-viewer.tsx** | 3167줄 | 🔴 **매우 큰 파일** (권장: 300줄 이하) |
| **search-result-view.tsx** | ~2800줄 | 🔴 **대형 파일** |
| **RAG 카드 컴포넌트** | 6개 파일 | ⚠️ **일부 미사용 확인 필요** |

### 2. file-search-rag-view.tsx 현황 ✅

**이미 적용된 최적화**:
- ❌ `progressStage` 상태 제거됨 (문서에서 언급된 미사용 상태)
- ❌ `dummyMeta`, `dummyArticles` **존재** (라인 297-298) → **제거 가능**
- ❌ `handleRelatedArticleClick` 함수 **없음** (이미 제거됨)
- ✅ SSE 버퍼 처리 정상 구현 (라인 153-187)
- ✅ ModernProgressBar 사용 중 (최신 프로그레스 UI)
- ✅ 신뢰도 배지 구현 완료 (라인 265-284)

**남은 최적화 대상**:
```typescript
// 라인 297-298 (제거 가능)
<LawViewer
  meta={{ lawId: '', lawTitle: 'AI 답변', promulgationDate: '', lawType: '' }}
  articles={[]}
  // ... AI 모드에서는 meta/articles가 의미 없음
/>
```

### 3. law-viewer.tsx 현황 🔴 **최대 우선순위**

**파일 크기**: 3167줄 (권장 대비 10배 초과)

**Props 개수**: 20개 이상

**주요 섹션**:
| 섹션 | 라인 범위 (추정) | 크기 | 상태 |
|------|-----------------|------|------|
| Props 및 State | 1-150 | ~150줄 | 18개 상태 변수 (과다) |
| Helper 함수들 | 150-1400 | ~1250줄 | 분리 가능 |
| JSX 렌더링 | 1400-3167 | ~1767줄 | 6가지 뷰 모드 중첩 |

**조건부 렌더링 우선순위** (라인 ~1900-3000):
1. `isFullView && !showAdminRules` → 전체 조문 리스트
2. `showAdminRules && adminRuleViewMode === "detail"` → 행정규칙 상세 (2단)
3. `showAdminRules && adminRuleViewMode === "list"` → 행정규칙 목록 (2단)
4. `tierViewMode === "3-tier"` → 3단 비교
5. `tierViewMode === "2-tier"` → 2단 비교
6. `aiAnswerMode && aiAnswerContent` → AI 답변 (1단/2단) - **라인 2916-3000+**

**AI 모드 2단 비교 코드** (라인 2918-2939):
- `comparisonLawMeta && comparisonLawArticles.length > 0` 조건
- **search-result-view.tsx에서 사용 중** (handleCitationClick)
- file-search-rag-view.tsx에서는 **미사용**

### 4. RAG 카드 컴포넌트 현황 ⚠️

| 컴포넌트 | 파일 | 사용 여부 | 비고 |
|---------|------|----------|------|
| `RagResultCard` | rag-result-card.tsx | ❌ **미사용** | search-result-view.tsx에서 import만 (주석 처리됨) |
| `RagAnswerCard` | rag-answer-card.tsx | ❌ **미사용** | search-result-view.tsx에서 import만 (주석 처리됨) |
| `RagSearchPanel` | rag-search-panel.tsx | ❌ **미사용** | search-result-view.tsx에서 import만 (주석 처리됨) |
| `RagAnalysisView` | rag-analysis-view.tsx | ✅ **사용 중** | `/rag-test` 페이지 (Manual RAG 모드) |
| `RAGCollectionProgress` | rag-collection-progress.tsx | ✅ **사용 중** | RAGAnalysisView 내부에서 사용 |
| `RagSearchInput` | rag-search-input.tsx | ⚠️ **확인 필요** | - |
| `FileSearchRAGView` | file-search-rag-view.tsx | ✅ **사용 중** | `/rag-test` 페이지 (File Search 모드) |

**search-result-view.tsx 라인 21-24 확인**:
```typescript
// import { RagSearchPanel, type SearchOptions } from "@/components/rag-search-panel" // 미사용으로 제거
// import { RagResultCard } from "@/components/rag-result-card" // 미사용으로 제거
// import { RagAnswerCard } from "@/components/rag-answer-card" // 미사용으로 제거
```

**결론**: 3개 컴포넌트(RagSearchPanel, RagResultCard, RagAnswerCard)는 **주석 처리된 import만 존재** → **삭제 가능**

---

## 🎯 최적화 목표 및 범위

### Phase 1: 즉시 적용 가능 (1-2일)

**목표**: 안전하게 제거 가능한 dead code 정리 + 토큰 낭비 최소화

**범위**:
1. file-search-rag-view.tsx 더미 데이터 제거 (10분)
2. 미사용 RAG 카드 컴포넌트 삭제 (30분)
3. law-viewer.tsx Props 선택사항 변경 (20분)

**예상 효과**:
- 파일 3개 삭제 (~300줄)
- Props 체인 단순화
- 토큰 사용량 ~10% 감소

### Phase 2: law-viewer.tsx 분할 (1-2주)

**목표**: 3167줄 → 300줄 이하로 분할 (10개 이상 컴포넌트)

**범위**:
1. ViewModeRenderer 분리 (뷰 모드 라우팅)
2. ArticleSidebar 분리 (사이드바)
3. 공통 컴포넌트 추출 (TwoColumnLayout, ArticleCard 등)
4. Custom Hooks 분리 (조문 네비게이션, 3단 비교)

**예상 효과**:
- 가독성 10배 향상
- 유지보수 비용 50% 감소
- 중복 코드 ~500줄 제거

**위험도**: 중간 (기능 손실 가능성 있음 → 단계별 테스트 필수)

### Phase 3: 구조 개선 (미래 작업)

**목표**: 컴포넌트 간 의존성 최소화

**범위**:
- Context API 도입
- Props Drilling 해결
- 불필요한 useEffect 제거

**예상 효과**:
- Props 깊이 3단계 → 1단계
- 상태 업데이트 로직 단순화

---

## 🚀 Phase 1: 즉시 적용 가능한 최적화 (실전 계획)

### 1.1 file-search-rag-view.tsx 더미 데이터 제거

**현재 코드** (라인 296-308):
```typescript
<LawViewer
  meta={{ lawId: '', lawTitle: 'AI 답변', promulgationDate: '', lawType: '' }}
  articles={[]}
  selectedJo={undefined}
  favorites={new Set()}
  isOrdinance={false}
  viewMode="single"
  aiAnswerMode={true}
  aiAnswerContent={analysis}
  relatedArticles={relatedLaws}
  aiConfidenceLevel={confidenceLevel}
/>
```

**수정 후**:
```typescript
<LawViewer
  // AI 모드에서 meta/articles는 선택사항으로 변경 예정
  aiAnswerMode={true}
  aiAnswerContent={analysis}
  relatedArticles={relatedLaws}
  aiConfidenceLevel={confidenceLevel}
  favorites={new Set()}
  isOrdinance={false}
  viewMode="single"
/>
```

**law-viewer.tsx Props 수정 필요**:
```typescript
interface LawViewerProps {
  meta?: LawMeta  // 선택사항으로 변경
  articles?: LawArticle[]  // 선택사항으로 변경
  selectedJo?: string
  // ... 기타 props
}

export function LawViewer({
  meta = { lawId: '', lawTitle: '', promulgationDate: '', lawType: '' },  // 기본값
  articles = [],  // 기본값
  // ...
}: LawViewerProps) {
```

**예상 시간**: 10분
**위험도**: 낮음
**테스트**: `/rag-test` 페이지에서 File Search 모드 정상 작동 확인

---

### 1.2 미사용 RAG 카드 컴포넌트 삭제

**삭제 대상** (3개 파일):
1. `components/rag-search-panel.tsx` (~80줄)
2. `components/rag-result-card.tsx` (~70줄)
3. `components/rag-answer-card.tsx` (~90줄)
4. `components/rag-search-input.tsx` (사용 여부 재확인 후)

**삭제 전 확인**:
```bash
# 각 컴포넌트의 실제 사용 위치 확인
grep -r "RagSearchPanel" components/ app/
grep -r "RagResultCard" components/ app/
grep -r "RagAnswerCard" components/ app/
grep -r "RagSearchInput" components/ app/
```

**예상 결과**:
- RagSearchPanel: search-result-view.tsx 라인 22 (주석 처리)
- RagResultCard: search-result-view.tsx 라인 23 (주석 처리)
- RagAnswerCard: search-result-view.tsx 라인 24 (주석 처리)

**삭제 후 정리**:
```typescript
// search-result-view.tsx 라인 21-24 제거
// import { RagSearchPanel, type SearchOptions } from "@/components/rag-search-panel" // 미사용으로 제거
// import { RagResultCard } from "@/components/rag-result-card" // 미사용으로 제거
// import { RagAnswerCard } from "@/components/rag-answer-card" // 미사용으로 제거
```

**예상 시간**: 30분
**위험도**: 낮음 (주석 처리된 import만 존재)
**테스트**: 메인 페이지 검색 정상 작동 확인

---

### 1.3 주석 처리된 import 정리

**search-result-view.tsx 정리 대상**:
```typescript
// 라인 19: import { FeedbackButtons } from "@/components/feedback-buttons" // 미사용으로 제거
// 라인 21-24: RAG 카드 컴포넌트 import (위에서 삭제)
```

**예상 시간**: 5분
**위험도**: 없음

---

## 📋 Phase 1 체크리스트

### 1.1 더미 데이터 제거
- [ ] law-viewer.tsx Props 인터페이스 수정 (meta?, articles? 선택사항)
- [ ] law-viewer.tsx destructuring 기본값 추가
- [ ] file-search-rag-view.tsx LawViewer 호출 수정
- [ ] 테스트: `/rag-test` File Search 모드 정상 작동
- [ ] 커밋: `refactor(file-search-rag): remove dummy meta/articles props`

### 1.2 미사용 컴포넌트 삭제
- [ ] 사용 여부 최종 확인 (grep 검색)
- [ ] RagSearchPanel 삭제 (`components/rag-search-panel.tsx`)
- [ ] RagResultCard 삭제 (`components/rag-result-card.tsx`)
- [ ] RagAnswerCard 삭제 (`components/rag-answer-card.tsx`)
- [ ] RagSearchInput 삭제 여부 확인 (RAGAnalysisView에서 사용 가능성)
- [ ] search-result-view.tsx 주석 처리된 import 제거 (라인 21-24)
- [ ] 테스트: 메인 페이지 검색 정상 작동
- [ ] 커밋: `chore: remove unused RAG card components`

### 1.3 문서 업데이트
- [ ] CHANGELOG.md에 변경 이력 추가
- [ ] 이 문서를 `docs/` 폴더에 보관
- [ ] 커밋: `docs: update ai-view optimization plan (2025-11-19)`

---

## 🔧 Phase 2: law-viewer.tsx 분할 계획 (상세)

### 2.1 현황 재확인 (3167줄)

**복잡도 지표**:
| 지표 | 값 | 평가 |
|------|-----|------|
| 파일 크기 | 3167줄 | 🔴 권장(300줄)의 10배 |
| 상태 변수 | 18개 (추정) | 🔴 권장(5개)의 3배 |
| Props 개수 | 20개 이상 | 🔴 권장(7개)의 3배 |
| 조건부 렌더링 | 6단계 중첩 | 🔴 권장(2단계)의 3배 |

**18개 상태 변수 분류** (추정):
- 조문 네비게이션: `activeJo`, `loadedArticles`, `loadingJo` (3개)
- UI 상태: `fontSize`, `copied`, `isArticleListExpanded` (3개)
- 모달: `refModal`, `lastExternalRef` (2개)
- 개정 이력: `revisionHistory`, `isLoadingHistory` (2개)
- 3단 비교: `threeTierCitation`, `threeTierDelegation`, `isLoadingThreeTier`, `tierViewMode` (4개)
- 행정규칙: `showAdminRules`, `adminRuleViewMode`, `adminRuleHtml`, `adminRuleTitle`, `adminRuleCache` (5개)

**문제점**:
1. 3단 비교, 행정규칙 기능이 law-viewer에 혼재 → 분리 필요
2. 6가지 뷰 모드가 중첩된 조건문으로 렌더링 → ViewModeRenderer로 분리
3. 중복 패턴 (2단 레이아웃, ArticleCard) 반복 → 공통 컴포넌트 추출

### 2.2 분할 우선순위

**Tier 1: ViewModeRenderer 분리** (가장 효과적)
- **목표**: 1767줄의 JSX → 명확한 라우터로 변환
- **효과**: 조건문 중첩 6단계 → 0단계
- **예상 시간**: 3-4일
- **위험도**: 중간

**Tier 2: 공통 컴포넌트 추출** (중복 제거 핵심)
- **목표**: ~500줄 중복 코드 → ~80줄로 축소 (84% 감소)
- **대상**: TwoColumnLayout, ArticleCard, ArticleContent
- **예상 시간**: 1일
- **위험도**: 낮음

**Tier 3: Custom Hooks 분리**
- **목표**: 상태 18개 → 5개로 감소
- **대상**: useArticleNavigation, useThreeTierData
- **예상 시간**: 1일
- **위험도**: 중간

### 2.3 Step-by-Step 계획

#### Step 1: ViewModeRenderer 분리 (3-4일)

**Day 1-2: 뷰 컴포넌트 추출**
```
components/law-viewer/
├── views/
│   ├── ViewModeRenderer.tsx        (라우터 역할, ~50줄)
│   ├── FullArticleListView.tsx     (전체 조문 리스트, ~95줄)
│   ├── AdminRuleDetailView.tsx     (행정규칙 상세, ~105줄)
│   └── AdminRuleListView.tsx       (행정규칙 목록, ~120줄)
```

**작업 순서**:
1. `ViewModeRenderer.tsx` 생성 (조건문 → 명확한 if 문)
2. `FullArticleListView.tsx` 추출 (라인 ~1901-1995)
3. `AdminRuleDetailView.tsx` 추출 (라인 ~2002-2106)
4. `AdminRuleListView.tsx` 추출 (라인 ~2107-2226)
5. law-viewer/index.tsx에서 ViewModeRenderer 사용
6. 테스트: 모든 뷰 모드 정상 작동

**Day 3-4: 대형 뷰 컴포넌트 추출**
```
components/law-viewer/
└── views/
    ├── ThreeTierView.tsx           (3단 비교, ~115줄)
    ├── TwoTierView.tsx             (2단 비교, ~505줄)
    └── AISummaryView.tsx           (AI 답변, ~150줄)
```

**작업 순서**:
1. `ThreeTierView.tsx` 추출 (라인 ~2227-2341)
2. `TwoTierView.tsx` 추출 (라인 ~2342-2847)
3. `AISummaryView.tsx` 추출 (라인 ~2916-3000+)
4. 테스트: 3단/2단 비교, AI 답변 정상 작동

**예상 효과**: law-viewer/index.tsx 1767줄 감소 → ~1400줄 남음

---

#### Step 2: 공통 컴포넌트 추출 (1일) ⭐ **중복 제거 핵심**

**추출 대상**:
```
components/law-viewer/
└── shared/
    ├── TwoColumnLayout.tsx         (2단 레이아웃, 4회 중복 → 1개)
    ├── ArticleCard.tsx             (조문 카드, 12회 중복 → 1개)
    ├── ArticleContent.tsx          (조문 본문, 11회 중복 → 1개)
    ├── LoadingSpinner.tsx          (로딩 상태, 3회 중복 → 1개)
    └── EmptyState.tsx              (빈 상태, 여러 곳 → 1개)
```

**중복 제거 효과**:
| 컴포넌트 | 현재 중복 | 제거 효과 |
|---------|----------|----------|
| TwoColumnLayout | 4회 (120줄) | 100줄 감소 |
| ArticleCard | 12회 (120줄) | 105줄 감소 |
| ArticleContent | 11회 (165줄) | 145줄 감소 |
| LoadingSpinner | 3회 (30줄) | 20줄 감소 |
| EmptyState | 여러 곳 (40줄) | 40줄 감소 |
| **합계** | **~475줄** | **~410줄 감소** (86% ↓) |

**작업 순서**:
1. `TwoColumnLayout.tsx` 생성 및 4개 위치 교체
2. `ArticleCard.tsx` 생성 및 12개 위치 교체
3. `ArticleContent.tsx` 생성 및 11개 위치 교체
4. `LoadingSpinner.tsx` 생성 및 3개 위치 교체
5. `EmptyState.tsx` 생성 및 여러 위치 교체
6. 테스트: 레이아웃, 카드 정상 렌더링

**예상 효과**: ~410줄 중복 제거 → law-viewer/index.tsx ~990줄 남음

---

#### Step 3: Custom Hooks 분리 (1일)

**추출 대상**:
```
components/law-viewer/
└── hooks/
    ├── use-article-navigation.ts   (조문 네비게이션)
    └── use-three-tier-data.ts      (3단 비교 데이터)
```

**use-article-navigation.ts**:
```typescript
export function useArticleNavigation(articles: LawArticle[], selectedJo?: string) {
  const [activeJo, setActiveJo] = useState(...)
  const [loadedArticles, setLoadedArticles] = useState(...)
  const [loadingJo, setLoadingJo] = useState(...)
  // 조문 네비게이션 로직 (3개 상태 + 핸들러)
  return { activeJo, activeArticle, loadedArticles, loadingJo, handleArticleClick }
}
```

**use-three-tier-data.ts**:
```typescript
export function useThreeTierData(lawId: string, activeJo: string, enabled: boolean) {
  const [threeTierCitation, setThreeTierCitation] = useState(...)
  const [threeTierDelegation, setThreeTierDelegation] = useState(...)
  const [isLoading, setIsLoading] = useState(...)
  const [tierViewMode, setTierViewMode] = useState(...)
  // 3단 비교 데이터 로딩 로직 (4개 상태 + 메모화)
  return { tierViewMode, setTierViewMode, validDelegations, hasValidSihyungkyuchik, isLoading }
}
```

**예상 효과**: 상태 18개 → 11개 (7개 감소)

---

#### Step 4: 사이드바 및 헤더 분리 (1일)

**추출 대상**:
```
components/law-viewer/
├── sidebar/
│   ├── ArticleSidebar.tsx          (265줄)
│   ├── ArticleList.tsx             (조문 목록)
│   └── RelatedLawsList.tsx         (관련 법령)
└── header/
    ├── ArticleHeader.tsx           (50줄)
    └── ActionButtonBar.tsx         (90줄)
```

**예상 효과**: ~405줄 분리 → law-viewer/index.tsx ~585줄 남음

---

### 2.4 최종 목표 달성

**분할 후 구조**:
```
components/law-viewer/
├── index.tsx                       (~250줄) ✅ 목표 달성 (300줄 이하)
├── types.ts                        (타입 정의)
├── hooks/
│   ├── use-article-navigation.ts
│   └── use-three-tier-data.ts
├── sidebar/
│   ├── ArticleSidebar.tsx
│   ├── ArticleList.tsx
│   └── RelatedLawsList.tsx
├── header/
│   ├── ArticleHeader.tsx
│   └── ActionButtonBar.tsx
├── views/
│   ├── ViewModeRenderer.tsx
│   ├── FullArticleListView.tsx
│   ├── AdminRuleDetailView.tsx
│   ├── AdminRuleListView.tsx
│   ├── ThreeTierView.tsx
│   ├── TwoTierView.tsx
│   └── AISummaryView.tsx
└── shared/
    ├── TwoColumnLayout.tsx
    ├── ArticleCard.tsx
    ├── ArticleContent.tsx
    ├── LoadingSpinner.tsx
    └── EmptyState.tsx
```

**총 파일 수**: 20개
**평균 파일 크기**: ~150줄
**law-viewer/index.tsx**: ~250줄 (목표 300줄 이하 달성 ✅)

---

## ⚠️ 주의사항 및 위험 관리

### 1. 기능 손실 방지

**Phase 1 (즉시 적용)**:
- ✅ 안전함 (미사용 코드만 제거)
- 테스트 범위: 메인 페이지 검색, `/rag-test` 페이지

**Phase 2 (law-viewer 분할)**:
- ⚠️ 위험도 중간 (대규모 리팩토링)
- 단계별 커밋 필수
- 각 단계 완료 후 전체 기능 테스트

**테스트 체크리스트**:
- [ ] 법령 검색 (일반법, 조례)
- [ ] 조문 클릭 및 네비게이션
- [ ] 3단 비교 (법-령-규)
- [ ] 2단 비교 (법-령)
- [ ] 행정규칙 검색 및 표시
- [ ] AI 답변 모드 (`/rag-test`)
- [ ] 관련 법령 클릭 (모달)
- [ ] 즐겨찾기 추가/제거
- [ ] 폰트 크기 조절
- [ ] 복사 기능
- [ ] 개정 이력 표시
- [ ] 모바일 사이드바 토글

### 2. 단계별 커밋 전략

**Phase 1**:
```
1. refactor(file-search-rag): remove dummy meta/articles props
2. chore: remove unused RAG card components
3. docs: update ai-view optimization plan (2025-11-19)
```

**Phase 2 (각 Step 완료 후)**:
```
1. refactor(law-viewer): extract ViewModeRenderer and view components
2. refactor(law-viewer): extract shared components (reduce 410 lines)
3. refactor(law-viewer): extract custom hooks
4. refactor(law-viewer): extract sidebar and header
5. docs: update CHANGELOG.md (law-viewer refactoring)
```

### 3. 롤백 계획

**브랜치 전략**:
- Phase 1: `feature/ai-view-cleanup-phase1`
- Phase 2: `feature/law-viewer-refactoring`

**롤백 시나리오**:
- 각 커밋 후 빌드 에러 발생 시 이전 커밋으로 롤백
- 기능 테스트 실패 시 해당 Step 재작업

### 4. 성능 모니터링

**Phase 2 분할 후 확인 사항**:
- 초기 렌더링 시간: < 500ms (현재 기준 유지)
- 조문 전환 시간: < 100ms
- 메모리 사용량: 현재 대비 +10% 이내

**최적화 방안**:
- React.memo() 적용 (뷰 컴포넌트)
- useMemo/useCallback 활용
- 불필요한 re-render 방지

---

## 📊 예상 효과 요약

### Phase 1 (즉시 적용)

| 항목 | Before | After | 효과 |
|------|--------|-------|------|
| file-search-rag-view.tsx | 313줄 | ~305줄 | 더미 데이터 제거 |
| RAG 카드 컴포넌트 | 3개 파일 (~240줄) | 0개 | 완전 삭제 |
| 토큰 사용량 | 100% | ~90% | 10% 감소 |

### Phase 2 (law-viewer 분할)

| 항목 | Before | After | 효과 |
|------|--------|-------|------|
| law-viewer.tsx | 3167줄 | ~250줄 | 92% 감소 |
| 중복 코드 | ~500줄 | ~80줄 | 84% 감소 |
| 상태 변수 | 18개 | 11개 | 39% 감소 |
| Props 깊이 | 3단계 | 1단계 | 67% 감소 |
| JSX 중첩 깊이 | 6단계 | 1단계 | 83% 감소 |
| 파일 수 | 1개 | 20개 | 모듈화 |
| 평균 파일 크기 | 3167줄 | ~150줄 | 유지보수 용이 |

### 유지보수 개선

| 작업 | Before | After | 개선 |
|------|--------|-------|------|
| 새 뷰 모드 추가 | 3167줄 파일 수정 | 새 파일 생성 (150줄) | 안전 |
| 버그 수정 | 3167줄 탐색 | 해당 컴포넌트만 (150줄) | 20배 빠름 |
| 코드 리뷰 | 전체 파일 확인 | 변경된 파일만 | 10배 빠름 |
| 테스트 작성 | 복잡한 mocking | 독립 컴포넌트 테스트 | 쉬움 |

---

## 🚀 실행 일정

### Week 1: Phase 1 (즉시 적용)

**Day 1 (2시간)**:
- [ ] 더미 데이터 제거 (10분)
- [ ] 미사용 RAG 컴포넌트 삭제 (30분)
- [ ] 테스트 (30분)
- [ ] 커밋 (10분)
- [ ] 문서 업데이트 (40분)

### Week 2-3: Phase 2 (law-viewer 분할) - **선택사항**

**⚠️ 주의**: Phase 2는 대규모 리팩토링이므로 **사용자 승인 후** 진행

**Week 2, Day 1-4: ViewModeRenderer 분리**
- Day 1-2: 작은 뷰 컴포넌트 (FullArticleListView 등)
- Day 3-4: 큰 뷰 컴포넌트 (TwoTierView 등)

**Week 3, Day 1-5: 공통 컴포넌트 및 Hooks**
- Day 1: 공통 컴포넌트 추출 (중복 제거)
- Day 2: Custom Hooks 분리
- Day 3: 사이드바 및 헤더 분리
- Day 4: 통합 테스트
- Day 5: 문서화 및 최종 리뷰

---

## 📝 다음 단계

### 즉시 작업 (Phase 1)

1. **사용자 확인 요청**:
   - "Phase 1 최적화를 진행할까요? (더미 데이터 제거 + 미사용 컴포넌트 삭제)"
   - 예상 시간: 2시간
   - 위험도: 낮음

2. **작업 시작**:
   - file-search-rag-view.tsx 수정
   - RAG 카드 컴포넌트 3개 삭제
   - 테스트 및 커밋

### 미래 작업 (Phase 2) - **사용자 승인 필요**

1. **law-viewer.tsx 분할 계획 검토**:
   - 사용자에게 상세 계획 공유
   - 우선순위 및 일정 협의
   - 위험도 및 롤백 계획 확인

2. **단계별 실행**:
   - 브랜치 생성
   - Step-by-Step 진행
   - 각 단계별 테스트 및 커밋

---

## 📚 참고 자료

### 관련 문서
- `important-docs/JSON_TO_HTML_FLOW.md` - 파싱 플로우
- `important-docs/RAG_ARCHITECTURE.md` - RAG 시스템 구조
- `important-docs/DEBUGGING_GUIDE.md` - 디버깅 가이드
- `important-docs/CHANGELOG.md` - 변경 이력

### 관련 파일
- `components/file-search-rag-view.tsx` (313줄)
- `components/law-viewer.tsx` (3167줄)
- `components/search-result-view.tsx` (~2800줄)
- `app/rag-test/page.tsx` - RAG 테스트 페이지

---

**문서 버전**: 2.0 (2025-11-19 현행화)
**최종 수정**: 2025-11-19
**작성자**: Claude Code Analysis

**변경 이력**:
- v1.0: 초안 작성 (2025-11-18)
- v1.1: search-result-view.tsx 의존성 발견으로 law-viewer.tsx 제거 계획 취소
- v1.2: law-viewer.tsx 분할 최적화 계획 추가 (3060줄 → 컴포넌트화)
- **v2.0: 현재 코드 상태 면밀 분석 및 실전 최적화 세부계획 수립 (2025-11-19)**
  - file-search-rag-view.tsx 현황 재확인 (progressStage 이미 제거됨)
  - law-viewer.tsx 크기 확인 (3167줄로 증가)
  - RAG 카드 컴포넌트 사용 여부 최종 확인 (3개 미사용)
  - Phase 1 즉시 적용 가능 작업 구체화
  - Phase 2 분할 계획 상세화 (Step-by-Step)
  - 예상 효과 및 위험도 재평가
