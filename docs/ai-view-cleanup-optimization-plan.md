# AI 뷰 코드 정리 및 최적화 계획

**작성일**: 2025-11-18
**목적**: AI 검색 뷰 관련 불필요한 코드 제거 및 중복 컴포넌트 정리

---

## 📋 현황 분석

### 문제점
1. **2단 비교 뷰 관련 미사용 코드**: 관련 법령 클릭 시 2단 비교 기능이 구현되어 있으나 실제로는 모달로 처리됨
2. **프로그레스 상태 중복**: `progressStage`와 `searchStage` 혼재, progressStage는 실제로 렌더링 안됨
3. **더미 데이터 전달**: AI 모드에서 의미 없는 `dummyMeta`, `dummyArticles` 전달
4. **RAG 카드 컴포넌트 중복**: 유사한 기능의 카드 컴포넌트 여러 개 존재
5. **코드 이중 수정 발생**: 같은 기능이 여러 곳에 분산되어 유지보수 비효율

---

## 🔍 상세 분석

### 1. file-search-rag-view.tsx (443줄)

#### 1.1 미사용 상태 변수

| 변수명 | 라인 | 문제 | 영향 범위 |
|--------|------|------|----------|
| `progressStage` | 30, 72, 93 | 정의/업데이트되지만 렌더링 미사용 | 메모리 누수 미미 |
| `dummyMeta` | 46-51 | AI 모드에서 의미 없는 더미값 | LawViewer에 전달 |
| `dummyArticles` | 52 | AI 모드에서 빈 배열 전달 | LawViewer에 전달 |

**progressStage 상세**:
```typescript
// 라인 30: 정의
const [progressStage, setProgressStage] = useState(0)

// 라인 72: 주기적 업데이트 (사용 안 함)
setProgressStage((prev) => (prev + 1) % 4)

// 라인 93: 초기화 (사용 안 함)
setProgressStage(0)

// 실제 사용: SearchProgressDialog는 stage={searchStage} 전달 (progressStage 아님!)
```

#### 1.2 2단 비교 뷰 관련 미사용 코드 (107줄)

**영향 범위**: 237-344줄

| 항목 | 라인 | 설명 |
|------|------|------|
| `handleRelatedArticleClick` | 237-344 | 관련 법령 클릭 핸들러 (전체 함수) |
| `selectedLawMeta` | 40, 330, 431 | 선택된 관련 법령 메타데이터 |
| `selectedLawArticles` | 41, 331, 432 | 선택된 관련 법령 조문 배열 |
| `selectedJo` | 42, 332, 433 | 선택된 조문 번호 |
| `isLoadingLaw` | 43, 239, 333, 341, 434 | 로딩 상태 |

**기능 설명**:
- 관련 법령 클릭 시 2단 비교 뷰를 표시하기 위한 로직
- API 호출: `/api/law-search` (XML) → `/api/eflaw` (JSON)
- 조문 파싱 후 `LawViewer`에 `comparisonLaw*` props로 전달

**문제**:
- ⚠️ **file-search-rag-view.tsx에서만 미사용**: handleRelatedArticleClick 함수가 정의되어 있으나 onRelatedArticleClick props로 전달 안됨
- ✅ **search-result-view.tsx에서는 사용 중**: handleCitationClick이 정의되고 전달됨 (라인 1759, 2214, 2258)
- **file-search-rag-view.tsx의 관련 법령 클릭은 모달로 처리**: law-viewer.tsx 내부 `openExternalLawArticleModal` 사용

#### 1.3 사용 중인 핵심 기능

| 항목 | 설명 | 유지 여부 |
|------|------|----------|
| `analysis` | AI 답변 텍스트 | ✅ 유지 |
| `relatedLaws` | 추출된 관련 법령 | ✅ 유지 |
| `isAnalyzing` | 분석 진행 상태 | ✅ 유지 |
| `error` / `warning` | 에러/경고 메시지 | ✅ 유지 |
| `confidenceLevel` | AI 신뢰도 배지 | ✅ 유지 |
| `searchStage` / `searchProgress` | 프로그레스 표시 | ✅ 유지 |
| `handleFileSearchQuery` | AI 검색 실행 | ✅ 유지 |

---

### 2. law-viewer.tsx (AI 모드 관련)

#### 2.1 AI 모드 Props (미사용 포함)

| Props | 라인 | 사용 여부 | 비고 |
|-------|------|----------|------|
| `aiAnswerMode` | 57, 82, 2847 | ✅ 사용 | AI 답변 모드 전환 |
| `aiAnswerContent` | 58, 83, 429, 2847 | ✅ 사용 | AI 답변 HTML |
| `relatedArticles` | 59, 84, 430 | ✅ 사용 | 관련 법령 사이드바 |
| `onRelatedArticleClick` | 60, 85 | ❌ **전달 안됨** | 2단 비교 핸들러 |
| `comparisonLawMeta` | 67, 88, 431, 2849 | ❌ **렌더링 안됨** | 2단 비교 메타 |
| `comparisonLawArticles` | 68, 89, 432, 2849, 2917 | ❌ **렌더링 안됨** | 2단 비교 조문 |
| `comparisonLawSelectedJo` | 69, 90, 433, 2917 | ❌ **렌더링 안됨** | 2단 비교 선택 조문 |
| `isLoadingComparison` | 70, 90, 434, 2911 | ❌ **렌더링 안됨** | 2단 비교 로딩 |

#### 2.2 AI 모드 2단 비교 뷰 코드 (미사용)

**위치**: law-viewer.tsx 라인 2849-2947 (99줄)

**조건문**:
```typescript
comparisonLawMeta && comparisonLawArticles.length > 0 ? (
  // 2단 비교 뷰: AI 답변 (좌) + 관련 법령 (우)
  <div className="grid grid-cols-2 gap-4 overflow-hidden">
    {/* Left: AI Answer with Glassmorphism */}
    {/* Right: Comparison Law Article */}
  </div>
) : (
  // 기본 AI 답변 (비교 법령 없음)
  ...
)
```

**문제**:
- `comparisonLawMeta`는 항상 `null`이므로 **else 블록만 실행됨**
- file-search-rag-view.tsx에서 `selectedLawMeta`는 `handleRelatedArticleClick` 호출 시에만 설정되는데, 이 핸들러는 **연결되지 않음**

**관련 법령 클릭 실제 처리**:
- law-viewer.tsx 라인 564-570: `openExternalLawArticleModal` 함수 사용
- ReferenceModal로 법령 전문 표시 (2단 비교 아님)

---

### 3. RAG 카드 컴포넌트 중복 분석

#### 3.1 컴포넌트 목록

| 컴포넌트 | 파일 | 용도 | 사용 위치 |
|---------|------|------|----------|
| `RagResultCard` | rag-result-card.tsx | 검색 결과 카드 (유사도) | search-result-view.tsx (import만) |
| `RagAnswerCard` | rag-answer-card.tsx | AI 답변 카드 (신뢰도) | search-result-view.tsx (import만) |
| `RagSearchPanel` | rag-search-panel.tsx | RAG 검색 패널 | search-result-view.tsx (import만) |
| `RagCollectionProgress` | rag-collection-progress.tsx | 컬렉션 진행률? | 미확인 |
| `RagAnalysisView` | rag-analysis-view.tsx | 분석 뷰? | 미확인 |
| `RagSearchInput` | rag-search-input.tsx | 검색 입력? | 미확인 |

#### 3.2 실제 사용 여부

**search-result-view.tsx**:
```typescript
// 라인 22-24: import
import { RagSearchPanel, type SearchOptions } from "@/components/rag-search-panel"
import { RagResultCard } from "@/components/rag-result-card"
import { RagAnswerCard } from "@/components/rag-answer-card"

// 라인 1656: RagAnswerCard 관련 주석
// RagAnswerCard 형식으로 변환
```

**의심 사항**:
- import는 되지만 실제 JSX에서 렌더링되는지 불명확
- search-result-view.tsx는 기본적으로 `LawViewer` 컴포넌트를 사용하므로, 별도 카드 컴포넌트는 불필요할 가능성

#### 3.3 FileSearchRAGView와의 관계

**FileSearchRAGView 사용처**:
- `/app/rag-test/page.tsx`: 테스트 페이지에서만 사용
- **메인 search-result-view.tsx에서는 사용 안 함**

**메인 플로우**:
```
search-result-view.tsx
  → LawViewer (aiAnswerMode=true 지원)
     → AI 답변 표시 (law-viewer.tsx 내부)
```

**테스트 플로우**:
```
rag-test/page.tsx
  → FileSearchRAGView
     → LawViewer (aiAnswerMode=true)
```

---

## 🎯 최적화 계획

### Phase 1: 안전한 Dead Code 제거 (우선순위: 높음)

#### 1.1 file-search-rag-view.tsx

**제거 대상**:
```typescript
// ❌ 제거 (라인 30)
const [progressStage, setProgressStage] = useState(0)

// ❌ 제거 (라인 68-76) - useEffect progressStage 자동 전환
useEffect(() => {
  if (!isAnalyzing) return
  const timer = setInterval(() => {
    setProgressStage((prev) => (prev + 1) % 4)
  }, 1500)
  return () => clearInterval(timer)
}, [isAnalyzing])

// ❌ 제거 (라인 93) - setProgressStage(0) 호출
```

**영향 범위**: 없음 (렌더링 미사용)

---

#### 1.2 file-search-rag-view.tsx - 2단 비교 뷰 관련 전체 제거

**제거 대상 (라인 237-344)**:
```typescript
// ❌ 전체 함수 제거
async function handleRelatedArticleClick(lawName: string, jo: string, article: string) {
  // 107줄 (API 호출, 파싱, 상태 업데이트)
}

// ❌ 상태 제거 (라인 40-43)
const [selectedLawMeta, setSelectedLawMeta] = useState<LawMeta | null>(null)
const [selectedLawArticles, setSelectedLawArticles] = useState<LawArticle[]>([])
const [selectedJo, setSelectedJo] = useState<string | undefined>(undefined)
const [isLoadingLaw, setIsLoadingLaw] = useState(false)

// ❌ LawViewer props 제거 (라인 431-434)
comparisonLawMeta={selectedLawMeta || undefined}
comparisonLawArticles={selectedLawArticles}
comparisonLawSelectedJo={selectedJo}
isLoadingComparison={isLoadingLaw}

// ❌ 주석 제거 (라인 437-438)
{/* Loading Law Indicator - 프로그레스 다이얼로그와 겹치지 않도록 제거 */}
{/* isLoadingLaw는 LawViewer의 isLoadingComparison으로 전달되어 내부에서 처리됨 */}
```

**대체 방안**:
- 관련 법령 클릭은 이미 law-viewer.tsx 내부에서 `openExternalLawArticleModal`로 처리됨
- `relatedArticles` props만 전달하면 사이드바에서 클릭 가능

**수정 후 LawViewer 호출**:
```typescript
<LawViewer
  meta={dummyMeta}
  articles={dummyArticles}
  selectedJo={undefined}
  favorites={new Set()}
  isOrdinance={false}
  viewMode="single"
  aiAnswerMode={true}
  aiAnswerContent={analysis}
  relatedArticles={relatedLaws}
  // ✅ 2단 비교 관련 props 완전 제거
/>
```

**영향 범위**: file-search-rag-view.tsx만 (테스트 페이지 전용)

**search-result-view.tsx 영향**: 없음 (handleCitationClick은 별도 구현)

---

**중요**: 이 코드는 **search-result-view.tsx에서 실제로 사용 중**입니다!

**사용 경로**:
```
search-result-view.tsx (라인 1759-1826)
  → handleCitationClick 함수
     → setComparisonLaw({ meta, articles, selectedJo })
        → LawViewer에 props 전달 (라인 2216-2219)
           → law-viewer.tsx 라인 2849 조건문 true
              → 2단 비교 뷰 렌더링
```

**제거하지 말 것** (라인 2849-2947, 99줄):
```typescript
// ❌ 전체 조건문 제거
comparisonLawMeta && comparisonLawArticles.length > 0 ? (
  // 2단 비교 뷰: AI 답변 (좌) + 관련 법령 (우)
  <div className="grid grid-cols-2 gap-4 overflow-hidden">
    {/* 99줄의 2단 비교 UI */}
  </div>
) : (
  // 기본 AI 답변 (비교 법령 없음)
  ...
)
```

**수정 사항**: 없음 - **코드 유지**

**이유**:
- search-result-view.tsx에서 AI 모드 + 2단 비교 기능 사용 중
- comparisonLaw 상태가 설정되면 2단 뷰 활성화
- 메인 페이지의 핵심 기능이므로 제거 불가

**Props 유지**:
```typescript
// ✅ 유지 (search-result-view에서 사용)
comparisonLawMeta?: LawMeta | null
comparisonLawArticles?: LawArticle[]
comparisonLawSelectedJo?: string
isLoadingComparison?: boolean
onRelatedArticleClick?: (lawName: string, jo: string, article: string) => void
```

**file-search-rag-view.tsx만 수정 대상**:
- handleRelatedArticleClick 함수 제거 (미사용)
- selectedLaw* 상태 제거 (미사용)
- LawViewer에 comparisonLaw* props 전달 안 함

---

#### 1.4 더미 데이터 제거

**file-search-rag-view.tsx**:
```typescript
// ❌ 제거 (라인 45-52)
const dummyMeta: LawMeta = {
  lawId: '',
  lawTitle: 'AI 답변',
  promulgationDate: '',
  lawType: ''
}
const dummyArticles: LawArticle[] = []

// ✅ 수정 후: LawViewer props 간소화
<LawViewer
  // AI 모드에서 meta/articles는 선택사항으로 변경
  aiAnswerMode={true}
  aiAnswerContent={analysis}
  relatedArticles={relatedLaws}
  favorites={new Set()}
  isOrdinance={false}
  viewMode="single"
/>
```

**law-viewer.tsx Props 수정**:
```typescript
// Props 인터페이스 수정
interface LawViewerProps {
  meta?: LawMeta  // AI 모드에서는 선택사항
  articles?: LawArticle[]  // AI 모드에서는 선택사항
  selectedJo?: string
  // ... 기타 props
  aiAnswerMode?: boolean
  aiAnswerContent?: string
  relatedArticles?: ParsedRelatedLaw[]
}

// Destructuring 수정 (기본값 설정)
export function LawViewer({
  meta = {} as LawMeta,  // 기본값
  articles = [],  // 기본값
  selectedJo,
  // ...
  aiAnswerMode = false,
  // ...
}: LawViewerProps) {
```

---

### Phase 2: 중복 컴포넌트 정리 (우선순위: 중간)

#### 2.1 RAG 카드 컴포넌트 사용 여부 확인 필요

**확인 작업**:
1. search-result-view.tsx에서 실제 렌더링 여부 grep
2. RagSearchPanel, RagResultCard, RagAnswerCard 사용 위치 확인
3. FileSearchRAGView vs 메인 LawViewer AI 모드 관계 명확화

**예상 결과**:
- FileSearchRAGView는 `/rag-test` 페이지 전용
- 메인 페이지는 LawViewer AI 모드 사용
- RAG 카드 컴포넌트는 미사용 가능성 높음

**조치 방안**:
- **미사용 시**: 파일 삭제 또는 `/archive` 폴더로 이동
- **사용 중**: 통합 가능성 검토 (LawViewer AI 모드와 기능 중복)

---

#### 2.2 프로그레스 컴포넌트 통합

**현재 상황**:
- `SearchProgressModern`: 공통 프로그레스 다이얼로그 (법령/AI 모두 지원)
- `RagCollectionProgress`: RAG 전용? (사용 여부 미확인)

**조치**:
- RagCollectionProgress 사용 여부 확인 후 미사용 시 삭제
- SearchProgressModern으로 통일

---

### Phase 3: 코드 구조 개선 (우선순위: 낮음)

#### 3.1 AI 답변 관련 로직 분리

**현재**:
- file-search-rag-view.tsx: AI 검색 + 프로그레스 관리
- law-viewer.tsx: AI 답변 렌더링 (2847-3050줄)

**개선안**:
```
lib/ai-answer-processor.ts  (이미 존재)
  ├─ convertAIAnswerToHTML()
  └─ (추가) AI 답변 관련 유틸리티

components/ai-answer-display.tsx  (신규)
  └─ AI 답변 표시 전용 컴포넌트 (law-viewer에서 분리)

components/file-search-rag-view.tsx
  ├─ AI 검색 로직
  └─ AI Answer Display 사용
```

**장점**:
- law-viewer.tsx 복잡도 감소
- AI 답변 관련 로직 재사용 가능

---

#### 3.2 Props Drilling 최소화

**현재 문제**:
- file-search-rag-view → LawViewer → AI 답변 섹션 (다단계 props 전달)

**개선안**:
- AI 답변 컴포넌트 분리 후 직접 사용
- Context API 도입 (필요 시)

---

## 📊 예상 효과

### 제거 예정 코드량

| 파일 | 현재 줄 수 | 제거 줄 수 | 감소율 | 비고 |
|------|-----------|----------|--------|------|
| file-search-rag-view.tsx | 443 | ~120 | 27% | 2단 비교 미사용 로직 |
| law-viewer.tsx | ~3000+ | 0 | 0% | ⚠️ 코드 유지 (메인 페이지 사용 중) |
| **합계** | - | **~120줄** | - | - |

### 유지보수 개선 효과

| 항목 | 개선 전 | 개선 후 |
|------|---------|---------|
| AI 답변 수정 시 파일 수 | 2개 | 1개 |
| Props 체인 깊이 | 3단계 | 2단계 |
| 미사용 상태 변수 | 8개 | 0개 |
| 렌더링 안 되는 코드 | 270줄 | 0줄 |

---

## ⚠️ 주의사항

### 1. 기능 손실 없음 보장

**삭제 전 확인** ✅:
- [x] `handleRelatedArticleClick`: file-search-rag-view.tsx에서만 미사용 확인
- [x] `comparisonLaw*` props: search-result-view.tsx에서 **사용 중** 확인 → law-viewer.tsx 코드 유지
- [x] `handleCitationClick`: search-result-view.tsx 라인 1759에 구현됨
- [ ] RAG 카드 컴포넌트가 실제로 렌더링되는지 확인 (남은 작업)
- [ ] 테스트 페이지 (`/rag-test`) 동작 확인 (남은 작업)

### 2. 단계별 커밋

**권장 커밋 순서**:
1. `progressStage` 제거 (영향 없음)
2. 2단 비교 뷰 관련 코드 제거 (file-search-rag-view만)
3. 더미 데이터 제거 + LawViewer Props 선택사항 변경
4. ~~2단 비교 뷰 관련 코드 제거 (law-viewer)~~ → **취소** (메인 페이지 사용 중)
5. RAG 카드 컴포넌트 정리 (확인 후)

### 3. 테스트 필수

**테스트 시나리오**:
- [ ] 메인 페이지 법령 검색
- [ ] AI 검색 (자연어 질의)
- [ ] 관련 법령 클릭 (모달 열림 확인)
- [ ] 신뢰도 배지 표시
- [ ] 프로그레스 다이얼로그 표시
- [ ] `/rag-test` 페이지 동작

---

## 🚀 실행 계획

### Step 1: 분석 완료 ✅
- 불필요한 코드 식별 완료
- 의존성 관계 파악 완료

### Step 2: 코드 제거 (Phase 1)
1. **progressStage 제거** (5분)
   - file-search-rag-view.tsx 라인 30, 68-76, 93
   - 테스트: AI 검색 프로그레스 정상 작동

2. **2단 비교 뷰 제거 - file-search-rag-view만** (15분)
   - 라인 40-43 (상태)
   - 라인 237-344 (함수)
   - 라인 431-434 (props 전달 제거)
   - 테스트: 관련 법령 클릭 시 모달 열림 (law-viewer 내부 로직)

3. ~~**2단 비교 뷰 제거 - law-viewer**~~ → **취소** (메인 페이지 사용 중)
   - ⚠️ search-result-view.tsx에서 사용하므로 **코드 유지**
   - Props도 모두 유지

4. **더미 데이터 제거** (10분)
   - dummyMeta, dummyArticles 제거
   - LawViewer Props 선택사항 변경
   - 테스트: AI 모드 정상 작동

### Step 3: RAG 컴포넌트 정리 (Phase 2)
1. **사용 여부 확인** (10분)
   - search-result-view.tsx 코드 분석
   - 실제 렌더링 확인

2. **미사용 컴포넌트 처리** (5분)
   - 삭제 또는 archive 폴더 이동
   - import 제거

### Step 4: 커밋 및 문서화
- 각 단계별 커밋 메시지 작성
- CLAUDE.md 업데이트 (변경 이력 추가)

---

## 📝 체크리스트

### 제거 전 확인
- [ ] `progressStage` 참조 위치 전체 검색
- [ ] `handleRelatedArticleClick` 호출 위치 전체 검색
- [ ] `comparisonLaw*` props 사용 위치 전체 검색
- [ ] RAG 카드 컴포넌트 렌더링 위치 전체 검색

### 제거 후 테스트
- [ ] **메인 페이지** (search-result-view):
  - [ ] 법령 검색 정상 작동
  - [ ] AI 검색 정상 작동
  - [ ] 관련 법령 클릭 시 2단 비교 뷰 정상 표시
  - [ ] 프로그레스 다이얼로그 정상 표시
- [ ] **테스트 페이지** (/rag-test):
  - [ ] FileSearchRAGView 정상 작동
  - [ ] 관련 법령 클릭 시 모달 정상 표시
  - [ ] 신뢰도 배지 정상 표시

### 문서화
- [ ] 커밋 메시지 작성
- [ ] CLAUDE.md 변경 이력 추가
- [ ] 이 문서를 `/docs` 폴더에 보관

---

## 📎 참고 자료

### 관련 파일
- `/components/file-search-rag-view.tsx` (443줄)
- `/components/law-viewer.tsx` (~3000줄)
- `/components/search-progress-modern.tsx` (500줄)
- `/components/rag-result-card.tsx`
- `/components/rag-answer-card.tsx`
- `/lib/ai-answer-processor.ts`

### 관련 이슈
- 2025-11-15 변경 이력: AI 검색 시스템 3대 핵심 수정
- 2025-11-11 변경 이력: Phase 5/6 비활성화 및 Phase 7 버그 수정

---

---

## 📌 핵심 요약 (Executive Summary)

### 제거 대상 (file-search-rag-view.tsx만)
1. ✅ **progressStage 상태** (3개 위치) - 정의되지만 렌더링 안됨
2. ✅ **2단 비교 뷰 로직** (107줄) - handleRelatedArticleClick 함수 + 관련 상태 4개
3. ✅ **더미 데이터** (dummyMeta, dummyArticles) - AI 모드에서 의미 없음

### 유지 대상 (law-viewer.tsx)
- ❌ **2단 비교 뷰 코드 제거 취소**: search-result-view.tsx에서 **실제 사용 중** 확인
- ❌ **comparisonLaw* Props 제거 취소**: 메인 페이지 핵심 기능

### 결론
- **제거 예정**: ~120줄 (file-search-rag-view.tsx의 27%)
- **유지**: law-viewer.tsx 2단 비교 뷰 코드 (메인 페이지 의존성 발견)
- **기능 손실**: 없음 (테스트 페이지만 영향)

---

**문서 버전**: 1.1 (2025-11-18 업데이트)
**최종 수정**: 2025-11-18
**작성자**: Claude Code Analysis

**변경 이력**:
- v1.0: 초안 작성
- v1.1: search-result-view.tsx 의존성 발견으로 law-viewer.tsx 제거 계획 취소
- v1.2: law-viewer.tsx 분할 최적화 계획 추가 (3060줄 → 컴포넌트화)

---

---

# Part 2: law-viewer.tsx 분할 최적화 계획

## 📊 현황 분석

### 기본 통계
- **총 줄 수**: 3060줄
- **상태 변수**: 18개 (useState)
- **React Hooks**: 41개 사용
- **주요 핸들러**: 5개
- **JSX 렌더링**: ~1650줄 (전체의 54%)

### 복잡도 지표
| 지표 | 값 | 평가 |
|------|-----|------|
| 파일 크기 | 3060줄 | 🔴 매우 큰 파일 (권장: 300줄 이하) |
| 상태 변수 | 18개 | 🔴 과다 (권장: 5개 이하) |
| 조건부 렌더링 | 6단계 중첩 | 🔴 복잡함 (권장: 2단계 이하) |
| Props 수 | 20개+ | 🔴 과다 (권장: 7개 이하) |
| 책임 범위 | 9개 기능 | 🔴 SRP 위반 (권장: 1개) |

---

## 🏗️ 구조 분석

### 1. 주요 섹션 분포

```
law-viewer.tsx (3060줄)
├── 상태(State) 선언      : 73-410줄   (~340줄, 11%)
├── 헬퍼 함수             : 482-1410줄 (~930줄, 30%)
└── 메인 JSX 렌더링       : 1412-3060줄 (~1650줄, 54%)
```

### 2. JSX 구조 상세

| 영역 | 라인 | 크기 | 설명 |
|------|------|------|------|
| **왼쪽 사이드바** | 1412-1690 | 280줄 | AI/일반 모드 조문 목록 |
| **헤더 + 액션 버튼** | 1700-1900 | 200줄 | 법령명, 버튼바 |
| **메인 콘텐츠 영역** | 1899-2950+ | 1050줄+ | 6가지 뷰 모드 조건부 렌더링 |
| **모달 및 다이얼로그** | 2950+ | 110줄 | ReferenceModal, RevisionHistory |

### 3. 뷰 모드 우선순위 (조건부 렌더링)

컴포넌트는 다음 우선순위로 6가지 뷰 모드를 조건부 렌더링:

| 우선순위 | 조건 | 뷰 | 라인 | 크기 |
|---------|------|-----|------|------|
| 1 | `isFullView && !showAdminRules` | 전체 조문 리스트 | 1901-1995 | 95줄 |
| 2 | `showAdminRules && adminRuleViewMode === "detail"` | 행정규칙 상세 (2단) | 2002-2106 | 105줄 |
| 3 | `showAdminRules && adminRuleViewMode === "list"` | 행정규칙 목록 (2단) | 2107-2226 | 120줄 |
| 4 | `tierViewMode === "3-tier"` | 3단 비교 (법-령-규) | 2227-2341 | 115줄 |
| 5 | `tierViewMode === "2-tier"` | 2단 비교 (법-령) | 2342-2847 | 505줄 |
| 6 | `aiAnswerMode && aiAnswerContent` | AI 답변 (1단/2단) | 2847-3000+ | 150줄+ |

---

## 🔍 문제점 식별

### 1. 단일 책임 원칙(SRP) 위반

**현재 law-viewer.tsx가 담당하는 책임**:
1. ✅ 조문 표시 및 네비게이션
2. ❌ 3단 비교 뷰 렌더링
3. ❌ 행정규칙 검색 및 표시
4. ❌ 개정 이력 관리
5. ❌ 참조 모달 처리
6. ❌ AI 답변 표시
7. ❌ 즐겨찾기 관리
8. ❌ 폰트 크기 조절
9. ❌ 사이드바 관리

**권장**: 컴포넌트는 하나의 책임만 가져야 함

### 2. 코드 중복 패턴 ⚠️ **심각**

**실제 코드 분석 결과** (문서 작성 후 재검증):

#### 패턴 A: 2단/3단 레이아웃 (**4회** 반복, ~30줄 × 4 = **120줄**)
```typescript
<div className="grid grid-cols-2 gap-4 overflow-hidden" style={{ height: 'calc(100vh - 250px)' }}>
  <div className="overflow-y-auto pr-2">{/* Left */}</div>
  <div className="overflow-y-auto pl-2">{/* Right */}</div>
</div>
```
- 라인 2005 (행정규칙 상세)
- 라인 2110 (행정규칙 목록)
- 라인 2345 (2단 비교 - 추가 발견!)
- 라인 2851 (AI 답변 비교)

**중복 코드량**: ~120줄 (컴포넌트화 시 ~20줄로 축소 가능)

#### 패턴 B: 조문 헤더 (**12회** 반복, ~10줄 × 12 = **120줄**)
```typescript
<div className="mb-4 pb-3 border-b border-border">
  <h3>{formatSimpleJo(article.jo)}</h3>
  <Badge>{lawTitle}</Badge>
</div>
```
- 라인 2008, 2030, 2113, 2135, 2233, 2255, 2300, 2370, 2447, 2469, 2551, 2573

**중복 코드량**: ~120줄 (컴포넌트화 시 ~15줄로 축소 가능)

#### 패턴 C: 조문 콘텐츠 렌더링 (**11회** 반복, ~15줄 × 11 = **165줄**)
```typescript
<div
  className="text-foreground leading-relaxed break-words whitespace-pre-wrap"
  style={{
    fontSize: `${fontSize}px`,
    lineHeight: "1.8",
    overflowWrap: "break-word",
    wordBreak: "break-word",
  }}
  onClick={handleContentClick}
  dangerouslySetInnerHTML={{ __html: extractArticleText(article) }}
/>
```

**중복 코드량**: ~165줄 (컴포넌트화 시 ~20줄로 축소 가능)

#### 패턴 D: 스크롤 영역 (**17회** 반복)
```typescript
<div className="overflow-y-auto pr-2">
  {/* 콘텐츠 */}
</div>
```

#### 패턴 E: 로딩 스피너 (여러 곳에서 중복)
```typescript
<div className="flex items-center justify-center">
  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  <p>로딩중...</p>
</div>
```

#### 패턴 F: formatSimpleJo/formatJO 사용 (**25회**)
- 조문 번호 포맷팅 로직 반복

**총 중복 코드량 추정**: **~500줄 이상** (컴포넌트화 시 ~80줄로 축소 → **84% 감소**)

### 3. Props Drilling 문제

**현재 Props 전달 깊이**:
```
search-result-view.tsx
  → LawViewer (20+ props)
     → (내부 JSX에서 props 직접 사용)
```

**문제가 되는 Props 체인**:
- `meta`, `articles`, `selectedJo` → 사이드바, 헤더, 콘텐츠 모두에서 사용
- `fontSize`, `copied` → UI 관련 상태가 최상위 컴포넌트에 존재
- `showAdminRules`, `adminRuleViewMode` → 행정규칙 관련 상태가 전역 상태처럼 사용됨

### 4. 상태 관리 복잡도

**18개 상태 변수 분류**:

| 카테고리 | 상태 변수 | 개수 | 문제 |
|---------|----------|------|------|
| 조문 네비게이션 | `activeJo`, `loadedArticles`, `loadingJo` | 3 | ✅ 적절 |
| UI 상태 | `fontSize`, `copied`, `isArticleListExpanded` | 3 | ⚠️ 분리 가능 |
| 모달 | `refModal`, `lastExternalRef` | 2 | ⚠️ 분리 가능 |
| 개정 이력 | `revisionHistory`, `isLoadingHistory` | 2 | ⚠️ 분리 가능 |
| 3단 비교 | `threeTierCitation`, `threeTierDelegation`, `isLoadingThreeTier`, `tierViewMode` | 4 | 🔴 **분리 필수** |
| 행정규칙 | `showAdminRules`, `adminRuleViewMode`, `adminRuleHtml`, `adminRuleTitle`, `adminRuleCache` | 5 | 🔴 **분리 필수** |

**문제**:
- 3단 비교, 행정규칙 기능은 완전히 독립적인데 상태가 law-viewer에 혼재
- 상태 업데이트 로직이 복잡하고 추적 어려움

### 5. useEffect 과다 사용

**useEffect 개수**: 10개 이상

**문제가 되는 useEffect**:
- 라인 164-167: props.articles 동기화
- 라인 170-173: 디버깅 로그 (불필요)
- 라인 187-206: 3단 비교 디버깅 (불필요)
- 라인 235-256: selectedJo 동기화 + 행정규칙 초기화 (책임 혼재)

---

## 🎯 최적화 목표

### Phase 1: 컴포넌트 분할 (우선순위: 높음)
- **목표**: 3060줄 → 300줄 이하 (10개 이상 컴포넌트로 분할)
- **기대 효과**: 가독성 10배 향상, 유지보수 비용 50% 감소

### Phase 2: 상태 관리 개선 (우선순위: 중간)
- **목표**: 18개 상태 → 5개 이하 (코어 상태만 유지)
- **기대 효과**: 상태 업데이트 로직 단순화, 버그 감소

### Phase 3: Props Drilling 해결 (우선순위: 낮음)
- **목표**: Props 깊이 3단계 → 1단계
- **기대 효과**: Props 변경 시 영향 범위 최소화

---

## 📐 컴포넌트 분할 설계

### 1. 추출 가능한 컴포넌트 목록

#### Tier 1: 즉시 추출 가능 (의존성 낮음)

| 컴포넌트 | 현재 라인 | 크기 | Props | 상태 |
|---------|---------|------|-------|------|
| **ArticleSidebar** | 1423-1688 | 265줄 | 7개 | 1개 |
| **ArticleHeader** | 1726-1773 | 50줄 | 5개 | 0개 |
| **ActionButtonBar** | 1776-1865 | 90줄 | 10개 | 0개 |

#### Tier 2: 뷰 모드 컴포넌트 (독립적)

| 컴포넌트 | 현재 라인 | 크기 | Props | 상태 |
|---------|---------|------|-------|------|
| **FullArticleListView** | 1901-1995 | 95줄 | 5개 | 0개 |
| **AdminRuleDetailView** | 2002-2106 | 105줄 | 8개 | 0개 |
| **AdminRuleListView** | 2107-2226 | 120줄 | 8개 | 0개 |
| **ThreeTierView** | 2227-2341 | 115줄 | 10개 | 0개 |
| **TwoTierView** | 2342-2847 | 505줄 | 12개 | 0개 |
| **AISummaryView** | 2847-3000+ | 150줄+ | 8개 | 0개 |

#### Tier 3: 재사용 가능 UI 컴포넌트 (**중복 제거 핵심**)

| 컴포넌트 | 현재 중복 | 제거 효과 | 설명 |
|---------|----------|----------|------|
| **TwoColumnLayout** | 4회 (120줄) | 100줄 감소 | 2단 레이아웃 래퍼 |
| **ThreeColumnLayout** | 1회 | - | 3단 레이아웃 래퍼 |
| **ArticleCard** | 12회 (120줄) | 105줄 감소 | 조문 헤더 + 콘텐츠 |
| **ArticleContent** | 11회 (165줄) | 145줄 감소 | 조문 본문 렌더링 |
| **DelegationCard** | 여러 곳 | 50줄 감소 | 위임조문 카드 |
| **LoadingSpinner** | 3회 이상 | 30줄 감소 | 로딩 상태 표시 |
| **EmptyState** | 여러 곳 | 40줄 감소 | 빈 상태 메시지 |

**총 중복 제거 효과**: ~470줄 감소

### 2. 새로운 파일 구조

```
components/law-viewer/
├── index.tsx                    (메인 컨테이너, ~200줄)
├── types.ts                     (타입 정의)
├── hooks/
│   ├── use-article-navigation.ts   (조문 네비게이션 로직)
│   ├── use-three-tier-data.ts      (3단 비교 데이터 관리)
│   └── use-admin-rules.ts          (이미 존재 - 그대로 사용)
├── sidebar/
│   ├── ArticleSidebar.tsx          (265줄 → 독립 파일)
│   ├── ArticleList.tsx             (조문 목록)
│   └── RelatedLawsList.tsx         (관련 법령 목록, AI 모드)
├── header/
│   ├── ArticleHeader.tsx           (50줄)
│   └── ActionButtonBar.tsx         (90줄)
├── views/
│   ├── ViewModeRenderer.tsx        (라우터 역할, ~50줄)
│   ├── FullArticleListView.tsx     (95줄)
│   ├── AdminRuleDetailView.tsx     (105줄)
│   ├── AdminRuleListView.tsx       (120줄)
│   ├── ThreeTierView.tsx           (115줄)
│   ├── TwoTierView.tsx             (505줄 → 추가 분할 필요)
│   └── AISummaryView.tsx           (150줄)
├── shared/
│   ├── TwoColumnLayout.tsx         (레이아웃 래퍼)
│   ├── ThreeColumnLayout.tsx       (레이아웃 래퍼)
│   ├── ArticleCard.tsx             (조문 카드)
│   ├── ArticleContent.tsx          (조문 본문)
│   └── DelegationCard.tsx          (위임조문 카드)
└── modals/
    ├── ReferenceModal.tsx          (이미 존재 - 그대로 사용)
    └── RevisionHistory.tsx         (이미 존재 - 그대로 사용)
```

**예상 파일 개수**: 20개
**평균 파일 크기**: ~150줄

---

## 🔨 상세 리팩토링 계획

### Step 1: ViewModeRenderer 분리 (가장 효과적)

**목표**: 1050줄의 조건부 렌더링 로직을 명확한 라우터로 변환

**Before** (현재, 라인 1899-2950):
```typescript
<ScrollArea className="h-full">
  {isFullView && !showAdminRules ? (
    // 전체 조문 리스트 (95줄)
  ) : activeArticle ? (
    showAdminRules && adminRuleViewMode === "detail" ? (
      // 행정규칙 상세 (105줄)
    ) : showAdminRules ? (
      // 행정규칙 목록 (120줄)
    ) : tierViewMode === "3-tier" && hasValidSihyungkyuchik ? (
      // 3단 비교 (115줄)
    ) : tierViewMode === "2-tier" && validDelegations.length > 0 ? (
      // 2단 비교 (505줄)
    ) : aiAnswerMode && aiAnswerContent ? (
      // AI 답변 (150줄)
    ) : (
      // 기본 단일 조문 (200줄)
    )
  ) : null}
</ScrollArea>
```

**After** (개선안):
```typescript
// components/law-viewer/views/ViewModeRenderer.tsx
export function ViewModeRenderer({ viewMode, ...props }: ViewModeRendererProps) {
  // 우선순위 기반 렌더링 (명확한 조건문)
  if (viewMode === 'full-list' && !props.showAdminRules) {
    return <FullArticleListView {...props} />
  }

  if (props.showAdminRules) {
    return props.adminRuleViewMode === 'detail'
      ? <AdminRuleDetailView {...props} />
      : <AdminRuleListView {...props} />
  }

  if (props.tierViewMode === '3-tier' && props.hasValidSihyungkyuchik) {
    return <ThreeTierView {...props} />
  }

  if (props.tierViewMode === '2-tier' && props.validDelegations.length > 0) {
    return <TwoTierView {...props} />
  }

  if (props.aiAnswerMode && props.aiAnswerContent) {
    return <AISummaryView {...props} />
  }

  return <SingleArticleView {...props} />
}
```

**영향**:
- law-viewer/index.tsx: 1050줄 감소 → ~150줄 남음
- 6개 독립 컴포넌트 생성 (~1100줄 총합)

**장점**:
- 조건문 중첩 6단계 → 0단계 (flat structure)
- 각 뷰 모드 독립적으로 테스트 가능
- 새로운 뷰 모드 추가 시 기존 코드 수정 불필요

---

### Step 2: ArticleSidebar 분리

**파일**: `components/law-viewer/sidebar/ArticleSidebar.tsx`

**Props 인터페이스**:
```typescript
interface ArticleSidebarProps {
  // 모드
  aiAnswerMode: boolean

  // AI 모드
  relatedArticles?: ParsedRelatedLaw[]
  onRelatedArticleClick?: (lawName: string, jo: string, article: string) => void

  // 일반 모드
  articles: LawArticle[]
  activeJo: string
  onArticleClick: (jo: string) => void
  favorites: Set<string>
  onToggleFavorite: (jo: string) => void

  // 모바일
  isExpanded: boolean
  onToggle: () => void
}
```

**내부 분할**:
```typescript
// ArticleSidebar.tsx (컨테이너)
export function ArticleSidebar(props: ArticleSidebarProps) {
  return (
    <Card>
      {props.aiAnswerMode ? (
        <RelatedLawsList
          relatedArticles={props.relatedArticles}
          onClick={props.onRelatedArticleClick}
        />
      ) : (
        <ArticleList
          articles={props.articles}
          activeJo={props.activeJo}
          favorites={props.favorites}
          onArticleClick={props.onArticleClick}
          onToggleFavorite={props.onToggleFavorite}
        />
      )}
    </Card>
  )
}
```

**장점**:
- 265줄 분리
- AI/일반 모드 로직 명확히 분리
- 모바일 오버레이 로직 독립적으로 관리

---

### Step 3: 상태 관리 개선 - Custom Hooks 활용

#### 3.1 조문 네비게이션 Hook

**파일**: `components/law-viewer/hooks/use-article-navigation.ts`

```typescript
export function useArticleNavigation(
  articles: LawArticle[],
  selectedJo?: string
) {
  const [activeJo, setActiveJo] = useState<string>(
    selectedJo || articles[0]?.jo || ""
  )
  const [loadedArticles, setLoadedArticles] = useState<LawArticle[]>(articles)
  const [loadingJo, setLoadingJo] = useState<string | null>(null)

  const activeArticle = useMemo(
    () => loadedArticles.find((a) => a.jo === activeJo),
    [loadedArticles, activeJo]
  )

  const handleArticleClick = useCallback(async (jo: string) => {
    // 조문 클릭 로직 (동적 로딩 포함)
  }, [])

  useEffect(() => {
    if (selectedJo && selectedJo !== activeJo) {
      setActiveJo(selectedJo)
    }
  }, [selectedJo])

  return {
    activeJo,
    activeArticle,
    loadedArticles,
    loadingJo,
    handleArticleClick,
  }
}
```

**사용**:
```typescript
// law-viewer/index.tsx
const {
  activeJo,
  activeArticle,
  loadedArticles,
  handleArticleClick,
} = useArticleNavigation(articles, selectedJo)
```

**장점**:
- 조문 네비게이션 로직 격리
- 테스트 용이
- 재사용 가능

#### 3.2 3단 비교 데이터 Hook

**파일**: `components/law-viewer/hooks/use-three-tier-data.ts`

```typescript
export function useThreeTierData(
  lawId: string,
  activeJo: string,
  enabled: boolean
) {
  const [threeTierCitation, setThreeTierCitation] = useState<ThreeTierData | null>(null)
  const [threeTierDelegation, setThreeTierDelegation] = useState<ThreeTierData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [tierViewMode, setTierViewMode] = useState<"1-tier" | "2-tier" | "3-tier">("1-tier")

  useEffect(() => {
    if (!enabled) return
    // 3단 비교 데이터 로드 로직
  }, [lawId, activeJo, enabled])

  const currentArticleDelegations = useMemo(() => {
    return threeTierDelegation?.articles.find((a) => a.jo === activeJo)?.delegations || []
  }, [threeTierDelegation, activeJo])

  const validDelegations = useMemo(() => {
    return currentArticleDelegations.filter((d) => d.content && d.content.trim().length > 0)
  }, [currentArticleDelegations])

  const hasValidSihyungkyuchik = useMemo(() => {
    return validDelegations.some((d) => d.type === "시행규칙")
  }, [validDelegations])

  return {
    tierViewMode,
    setTierViewMode,
    validDelegations,
    hasValidSihyungkyuchik,
    isLoading,
  }
}
```

**장점**:
- 3단 비교 관련 상태 4개 + 로직 완전 격리
- law-viewer에서 제거 가능

---

### Step 4: 중복 패턴 컴포넌트화 ⭐ **핵심 최적화**

**목표**: 500줄 이상의 중복 코드를 80줄의 재사용 컴포넌트로 축소 (84% 감소)

#### 4.1 TwoColumnLayout (120줄 → 20줄)

**파일**: `components/law-viewer/shared/TwoColumnLayout.tsx`

```typescript
interface TwoColumnLayoutProps {
  left: React.ReactNode
  right: React.ReactNode
  leftClassName?: string
  rightClassName?: string
}

export function TwoColumnLayout({
  left,
  right,
  leftClassName = '',
  rightClassName = ''
}: TwoColumnLayoutProps) {
  return (
    <div
      className="grid grid-cols-2 gap-4 overflow-hidden"
      style={{ height: 'calc(100vh - 250px)' }}
    >
      <div className={`overflow-y-auto pr-2 ${leftClassName}`}>
        {left}
      </div>
      <div className={`overflow-y-auto pl-2 ${rightClassName}`}>
        {right}
      </div>
    </div>
  )
}
```

**사용 예시**:
```typescript
// AdminRuleDetailView.tsx
<TwoColumnLayout
  left={<ArticleCard article={activeArticle} />}
  right={<AdminRuleContent html={adminRuleHtml} />}
/>
```

**제거 가능한 중복 코드**: 4개 위치 (라인 2005, 2110, 2345, 2851)
**중복 감소**: 120줄 → 20줄 (100줄 감소, 83% ↓)

#### 4.2 ArticleCard (120줄 → 15줄)

**파일**: `components/law-viewer/shared/ArticleCard.tsx`

```typescript
interface ArticleCardProps {
  article: LawArticle
  fontSize?: number
  onContentClick?: React.MouseEventHandler<HTMLDivElement>
  showTitle?: boolean
  lawTitle?: string
}

export function ArticleCard({
  article,
  fontSize = 15,
  onContentClick,
  showTitle = true,
  lawTitle
}: ArticleCardProps) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      {showTitle && (
        <div className="mb-4 pb-3 border-b border-border">
          <h3 className="text-base font-bold">
            {formatSimpleJo(article.jo)}
            {article.title && <span> ({article.title})</span>}
          </h3>
          {lawTitle && <Badge variant="secondary">{lawTitle}</Badge>}
        </div>
      )}

      <ArticleContent
        article={article}
        fontSize={fontSize}
        onClick={onContentClick}
      />
    </div>
  )
}
```

**제거 가능한 중복 코드**: 12개 위치
**중복 감소**: 120줄 → 15줄 (105줄 감소, 88% ↓)

#### 4.3 ArticleContent (165줄 → 20줄)

**파일**: `components/law-viewer/shared/ArticleContent.tsx`

```typescript
interface ArticleContentProps {
  article: LawArticle
  fontSize: number
  onClick?: React.MouseEventHandler<HTMLDivElement>
}

export function ArticleContent({ article, fontSize, onClick }: ArticleContentProps) {
  return (
    <div
      className="text-foreground leading-relaxed break-words whitespace-pre-wrap"
      style={{
        fontSize: `${fontSize}px`,
        lineHeight: "1.8",
        overflowWrap: "break-word",
        wordBreak: "break-word",
      }}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: extractArticleText(article) }}
    />
  )
}
```

**제거 가능한 중복 코드**: 11개 위치
**중복 감소**: 165줄 → 20줄 (145줄 감소, 88% ↓)

#### 4.4 LoadingSpinner (공통 컴포넌트)

**파일**: `components/law-viewer/shared/LoadingSpinner.tsx`

```typescript
interface LoadingSpinnerProps {
  message?: string
  size?: 'sm' | 'md' | 'lg'
}

export function LoadingSpinner({ message = '로딩중...', size = 'md' }: LoadingSpinnerProps) {
  const sizeClass = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  }[size]

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className={`animate-spin rounded-full ${sizeClass} border-b-2 border-primary`}></div>
      {message && <p className="text-muted-foreground">{message}</p>}
    </div>
  )
}
```

**제거 가능한 중복 코드**: 3개 위치 (라인 1850, 1998, 2913)
**중복 감소**: ~30줄 → 10줄 (20줄 감소)

#### 4.5 EmptyState (공통 컴포넌트)

**파일**: `components/law-viewer/shared/EmptyState.tsx`

```typescript
interface EmptyStateProps {
  icon?: React.ReactNode
  message: string
  description?: string
}

export function EmptyState({ icon, message, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
      {icon}
      <p className="font-medium">{message}</p>
      {description && <p className="text-sm">{description}</p>}
    </div>
  )
}
```

**제거 가능한 중복 코드**: 여러 위치 (빈 상태 메시지)
**중복 감소**: ~40줄 감소

---

**Step 4 총 중복 제거 효과**: ~470줄 감소 (84% ↓)

---

### Step 5: Props Drilling 해결 - Context API

**문제**: fontSize, copied, handleContentClick 등이 모든 하위 컴포넌트에 전달됨

**해결안**: LawViewerContext 도입

```typescript
// components/law-viewer/context/LawViewerContext.tsx
interface LawViewerContextValue {
  // UI 상태
  fontSize: number
  setFontSize: (size: number) => void

  // 핸들러
  handleContentClick: React.MouseEventHandler<HTMLDivElement>
  openExternalLawArticleModal: (lawName: string, joLabel: string) => Promise<void>

  // 메타 정보
  meta: LawMeta
  isOrdinance: boolean
}

const LawViewerContext = createContext<LawViewerContextValue | null>(null)

export function useLawViewer() {
  const context = useContext(LawViewerContext)
  if (!context) throw new Error('useLawViewer must be used within LawViewerProvider')
  return context
}

// 사용
export function LawViewer(props: LawViewerProps) {
  const [fontSize, setFontSize] = useState(15)

  const contextValue: LawViewerContextValue = {
    fontSize,
    setFontSize,
    handleContentClick,
    openExternalLawArticleModal,
    meta: props.meta,
    isOrdinance: props.isOrdinance,
  }

  return (
    <LawViewerContext.Provider value={contextValue}>
      {/* 하위 컴포넌트들 */}
    </LawViewerContext.Provider>
  )
}

// 하위 컴포넌트에서 사용
function ArticleContent() {
  const { fontSize, handleContentClick } = useLawViewer()
  // Props drilling 없이 직접 사용
}
```

**장점**:
- Props 깊이 3단계 → 1단계
- Props 변경 시 중간 컴포넌트 수정 불필요
- 타입 안전성 유지

---

## 📊 예상 효과

### 파일 크기 감소

| 컴포넌트 | Before | After | 감소율 | 비고 |
|---------|--------|-------|--------|------|
| law-viewer/index.tsx | 3060줄 | ~250줄 | 92% ↓ | 분할 후 |
| **중복 코드 제거** | **~500줄** | **~80줄** | **84% ↓** | **핵심 효과** |
| 새로 생성된 컴포넌트 | - | ~2500줄 (20개 파일) | - | 순수 코드 |
| **평균 파일 크기** | 3060줄 | **~125줄** | - | 유지보수 용이 |

**순수 코드 감소**: 3060줄 - 500줄(중복) = 2560줄 실제 로직
**리팩토링 후**: 250줄(index) + 2500줄(컴포넌트) - 420줄(중복 제거) = **2330줄**
**실제 코드 감소량**: **230줄** (중복 제거 효과)

### 상태 복잡도 감소

| 지표 | Before | After | 개선 |
|------|--------|-------|------|
| law-viewer 상태 변수 | 18개 | 5개 | 72% ↓ |
| Props 깊이 | 3단계 | 1단계 | 67% ↓ |
| JSX 중첩 깊이 | 6단계 | 1단계 | 83% ↓ |
| useEffect 개수 | 10개+ | 3개 | 70% ↓ |

### 유지보수 개선

| 작업 | Before | After | 개선 |
|------|--------|-------|------|
| 새 뷰 모드 추가 | 3060줄 파일 수정 | 새 파일 생성 (150줄) | 안전 |
| 버그 수정 | 3000줄 탐색 | 해당 컴포넌트만 (150줄) | 20배 빠름 |
| 코드 리뷰 | 전체 파일 확인 | 변경된 파일만 | 10배 빠름 |
| 테스트 작성 | 복잡한 mocking | 독립 컴포넌트 테스트 | 쉬움 |

---

## 🚀 실행 계획

### Phase 1: 뷰 모드 분리 (3-4일)

**Week 1, Day 1-2: ViewModeRenderer 추출**
- [ ] `ViewModeRenderer.tsx` 생성
- [ ] `FullArticleListView.tsx` 추출 (95줄)
- [ ] `AdminRuleDetailView.tsx` 추출 (105줄)
- [ ] `AdminRuleListView.tsx` 추출 (120줄)
- [ ] law-viewer/index.tsx에서 조건부 렌더링 제거
- [ ] 테스트: 모든 뷰 모드 정상 작동

**Week 1, Day 3-4: 대형 뷰 컴포넌트 추출**
- [ ] `ThreeTierView.tsx` 추출 (115줄)
- [ ] `TwoTierView.tsx` 추출 (505줄) + 내부 분할
- [ ] `AISummaryView.tsx` 추출 (150줄)
- [ ] 테스트: 3단/2단 비교, AI 답변 정상 작동

### Phase 2: 사이드바 및 헤더 분리 (1-2일)

**Week 2, Day 1-2:**
- [ ] `ArticleSidebar.tsx` 추출 (265줄)
- [ ] `RelatedLawsList.tsx` 분리
- [ ] `ArticleList.tsx` 분리
- [ ] `ArticleHeader.tsx` 추출 (50줄)
- [ ] `ActionButtonBar.tsx` 추출 (90줄)
- [ ] 테스트: 사이드바, 헤더, 버튼 바 정상 작동

### Phase 3: 공통 컴포넌트 추출 ⭐ **중복 제거** (1일)

**Week 2, Day 3:**
- [ ] `TwoColumnLayout.tsx` 생성 (4개 위치 중복 제거)
- [ ] `ThreeColumnLayout.tsx` 생성
- [ ] `ArticleCard.tsx` 생성 (12개 위치 중복 제거)
- [ ] `ArticleContent.tsx` 생성 (11개 위치 중복 제거)
- [ ] `DelegationCard.tsx` 생성
- [ ] `LoadingSpinner.tsx` 생성 (3개 위치 중복 제거)
- [ ] `EmptyState.tsx` 생성 (여러 위치 중복 제거)
- [ ] 기존 중복 코드 제거 (30개 이상 위치)
- [ ] 테스트: 레이아웃, 카드 정상 렌더링

**예상 효과**: ~470줄 중복 코드 제거

### Phase 4: Custom Hooks 분리 (1일)

**Week 2, Day 4:**
- [ ] `use-article-navigation.ts` 생성
- [ ] `use-three-tier-data.ts` 생성
- [ ] law-viewer/index.tsx에서 상태 이동
- [ ] 테스트: 조문 네비게이션, 3단 비교 정상 작동

### Phase 5: Context API 도입 (1일)

**Week 2, Day 5:**
- [ ] `LawViewerContext.tsx` 생성
- [ ] `useLawViewer()` hook 구현
- [ ] Props drilling 제거 (하위 컴포넌트 수정)
- [ ] 테스트: Context 데이터 정상 전달

### Phase 6: 통합 테스트 및 최적화 (1일)

**Week 3, Day 1:**
- [ ] 전체 기능 통합 테스트
- [ ] 성능 측정 (렌더링 시간, 메모리 사용량)
- [ ] TypeScript 타입 오류 수정
- [ ] 불필요한 useEffect 제거
- [ ] 코드 리뷰 및 문서화

---

## ⚠️ 주의사항 및 위험 관리

### 1. 기능 손실 방지

**체크리스트**:
- [ ] 모든 뷰 모드 정상 작동 확인
- [ ] 조문 클릭 시 스크롤 동작 확인
- [ ] 모달 열기/닫기 확인
- [ ] 즐겨찾기 추가/제거 확인
- [ ] 복사 기능 확인
- [ ] 폰트 크기 조절 확인
- [ ] 3단 비교 데이터 로딩 확인
- [ ] 행정규칙 검색 확인
- [ ] AI 답변 표시 확인
- [ ] 모바일 사이드바 토글 확인

### 2. 성능 저하 방지

**모니터링 지표**:
- 초기 렌더링 시간: < 500ms (현재 기준 유지)
- 조문 전환 시간: < 100ms
- 메모리 사용량: 현재 대비 +10% 이내

**최적화 방안**:
- React.memo() 적용 (뷰 컴포넌트)
- useMemo/useCallback 활용
- 불필요한 re-render 방지

### 3. TypeScript 타입 안전성

**원칙**:
- 모든 Props 인터페이스 명확히 정의
- `any` 타입 사용 금지
- 옵셔널 Props 명확히 표시

### 4. 단계별 커밋

**커밋 전략**:
- 각 컴포넌트 추출 후 즉시 커밋
- 커밋 메시지: `refactor(law-viewer): extract [ComponentName]`
- 각 Phase 완료 후 통합 테스트 커밋

### 5. 롤백 계획

**롤백 시나리오**:
- 각 Phase 시작 전 브랜치 생성
- 문제 발생 시 이전 Phase로 롤백 가능
- 기능 플래그(Feature Flag) 고려 (점진적 배포)

---

## 📝 체크리스트

### 리팩토링 전 확인
- [ ] 현재 law-viewer 기능 전체 테스트 통과 확인
- [ ] 기존 버그 리스트 작성 (리팩토링 후 재현 방지)
- [ ] 성능 벤치마크 측정 (기준선 설정)
- [ ] 팀원과 리팩토링 계획 공유 및 승인

### Phase별 완료 체크
- [ ] Phase 1: 뷰 모드 분리
- [ ] Phase 2: 사이드바 및 헤더 분리
- [ ] Phase 3: 공통 컴포넌트 추출
- [ ] Phase 4: Custom Hooks 분리
- [ ] Phase 5: Context API 도입
- [ ] Phase 6: 통합 테스트 및 최적화

### 리팩토링 후 확인
- [ ] 모든 기능 테스트 통과
- [ ] 성능 벤치마크 유지 또는 개선
- [ ] TypeScript 타입 오류 0개
- [ ] 코드 리뷰 완료
- [ ] 문서 업데이트 (CLAUDE.md, README.md)

---

## 📚 참고 자료

### React 패턴
- [Compound Components Pattern](https://kentcdodds.com/blog/compound-components-with-react-hooks)
- [Custom Hooks Best Practices](https://react.dev/learn/reusing-logic-with-custom-hooks)
- [Context API Performance](https://react.dev/reference/react/useContext#optimizing-re-renders)

### 코드 분할 가이드
- [Component Composition](https://react.dev/learn/passing-props-to-a-component#forwarding-props-with-the-jsx-spread-syntax)
- [Managing State](https://react.dev/learn/managing-state)
- [Extracting State Logic](https://react.dev/learn/extracting-state-logic-into-a-reducer)

---

**문서 버전**: 1.2 (2025-11-18 업데이트)
**Part 2 작성자**: Claude Code Analysis (law-viewer.tsx 리팩토링 계획)
**예상 작업 기간**: 2-3주
**예상 효과**: 가독성 10배 향상, 유지보수 비용 50% 감소
