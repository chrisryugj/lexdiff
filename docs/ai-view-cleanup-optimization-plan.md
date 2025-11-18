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
