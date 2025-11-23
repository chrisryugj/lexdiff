# AI 뷰 코드 정리 및 최적화 계획

**최종 업데이트**: 2025-11-21 15:30 KST
**목적**: AI 검색 뷰 관련 코드 현황 파악 및 불필요한 코드 제거 가이드

---

## 📋 현황 분석 (2025-11-21 기준)

### 핵심 발견사항 ⚠️ **중요 업데이트**

1. **2단 비교 뷰 코드**: law-viewer.tsx에 존재 (라인 2919-3027) - **❌ 실제로 사용되지 않음 (데드 코드)**
2. **실제 사용 여부**:
   - ❌ **search-result-view.tsx**: `comparisonLaw` state 선언만 있고 실제 set 안됨 (데드 코드)
   - ❌ **file-search-answer-display.tsx**: 2단 비교 뷰 코드 없음 (단일 AI 답변 뷰만)
3. **file-search 컴포넌트**: file-search-answer-display.tsx로 단순화됨 (기존 file-search-rag-view.tsx 없음)
4. **코드 크기**: law-viewer.tsx (3205줄), search-result-view.tsx (2391줄)

---

## 🔍 상세 분석

### 1. law-viewer.tsx - AI 모드 Props

**파일 크기**: 3205줄

#### AI 모드 Props 정의 (라인 55-81)

```typescript
interface LawViewerProps {
  // ... 기본 props

  // AI 답변 모드 (File Search RAG)
  aiAnswerMode?: boolean                // ✅ 사용 중
  aiAnswerContent?: string              // ✅ 사용 중
  relatedArticles?: ParsedRelatedLaw[]  // ✅ 사용 중
  onRelatedArticleClick?: (lawName: string, jo: string, article: string) => void  // ⚠️ 전달되지만 미사용
  fileSearchFailed?: boolean            // ✅ 사용 중
  aiCitations?: VerifiedCitation[]      // ✅ 사용 중
  userQuery?: string                    // ✅ 사용 중
  aiConfidenceLevel?: 'high' | 'medium' | 'low'  // ✅ 사용 중

  // AI 모드 - 관련 법령 2단 비교 (⚠️ search-result-view에서만 사용)
  comparisonLawMeta?: LawMeta | null           // ⚠️ 존재하지만 제한적 사용
  comparisonLawArticles?: LawArticle[]         // ⚠️ 존재하지만 제한적 사용
  comparisonLawSelectedJo?: string             // ⚠️ 존재하지만 제한적 사용
  isLoadingComparison?: boolean                // ⚠️ 존재하지만 제한적 사용
}
```

#### 2단 비교 뷰 렌더링 코드 (라인 2917-3027)

**조건**: `aiAnswerMode && aiAnswerContent && comparisonLawMeta && comparisonLawArticles.length > 0`

```typescript
// 라인 2919: 2단 비교 뷰 조건
comparisonLawMeta && comparisonLawArticles.length > 0 ? (
  // 라인 2920-3027: 2단 비교 뷰 렌더링
  <div className="grid grid-cols-2 gap-4 overflow-hidden">
    {/* Left: AI Answer */}
    <div className="overflow-y-auto pr-2 relative">
      <div className="prose" dangerouslySetInnerHTML={{ __html: aiAnswerHTML }} />
    </div>

    {/* Right: Comparison Law Article */}
    <div className="overflow-y-auto pr-2">
      {isLoadingComparison ? (
        <Loader2 />
      ) : (
        <div dangerouslySetInnerHTML={{
          __html: extractArticleText(comparisonArticle, false, comparisonLawMeta?.lawTitle)
        }} />
      )}
    </div>
  </div>
) : (
  // 라인 3028+: 기본 AI 답변 (비교 법령 없음)
  <div>...</div>
)
```

**사용 위치**:
- `comparisonLawMeta`: 라인 77 (정의), 98 (기본값), 2919, 3014, 3021
- `comparisonLawArticles`: 라인 78 (정의), 99 (기본값), 2919, 2997
- `comparisonLawSelectedJo`: 라인 79 (정의), 100 (기본값), 2997
- `isLoadingComparison`: 라인 80 (정의), 101 (기본값), 2991

---

### 2. search-result-view.tsx - AI 모드 사용 현황

**파일 크기**: 2391줄

#### handleCitationClick 함수 (라인 1828+)

```typescript
const handleCitationClick = async (lawName: string, jo: string, article: string) => {
  // 관련 법령 클릭 시 2단 비교 뷰 표시
  // 1. 법령 검색
  // 2. 법령 전문 조회
  // 3. 상태 업데이트 (selectedLawMeta, selectedLawArticles, selectedJo)
}
```

**호출 위치**:
- 라인 2245: `onRelatedArticleClick={handleCitationClick}` (AI 답변 관련 법령 사이드바)
- 라인 2289: `onRelatedArticleClick={handleCitationClick}` (AI 답변 하단 관련 법령 목록)

**전달 경로**:
```
search-result-view.tsx (handleCitationClick)
  ↓
LawViewer (onRelatedArticleClick prop으로 전달)
  ↓
law-viewer.tsx (onRelatedArticleClick 받음, 하지만 직접 사용 안함)
  ↓
내부 링크 클릭은 openExternalLawArticleModal()로 처리 (모달 방식)
```

---

### 3. file-search-answer-display.tsx

**파일**: components/file-search-answer-display.tsx
**크기**: 약 600줄 (추정)

**주요 기능**:
- AI 답변 마크다운 렌더링
- 법령 조문 접기/펼치기
- 관련 법령 링크 클릭 처리

**현황**:
- ✅ 단순화된 독립 컴포넌트
- ✅ ReactMarkdown 기반 렌더링
- ✅ 접기/펼치기 상태 관리 (전역 Map)

---

## 📊 2단 비교 뷰 사용 현황 요약 ⚠️ **검증 완료**

| 항목 | search-result-view.tsx | file-search-answer-display.tsx | 비고 |
|------|----------------------|-------------------------------|------|
| handleCitationClick 정의 | ❌ 사용 안함 (모달 방식) | ❌ 없음 | 모달로 처리 |
| onRelatedArticleClick 전달 | ❌ 전달만 하고 사용 안함 | ❌ 전달 안함 | 데드 코드 |
| 2단 비교 뷰 렌더링 | ❌ **사용 안함** (state만 선언) | ❌ 사용 안함 | **데드 코드 확정** |
| comparisonLaw state | ❌ `setComparisonLaw(null)` 1회만 호출 | ❌ 없음 | **실제 데이터 할당 안됨** |
| 모달 방식 처리 | ✅ 사용 중 | ✅ 사용 중 | openExternalLawArticleModal |

**검증 결과**:
- **search-result-view.tsx**:
  - `comparisonLaw` state 선언 (라인 238)
  - `setComparisonLaw(null)` 초기화만 1회 호출 (라인 1000)
  - **실제 데이터를 set하는 코드 없음** → 항상 `null` 상태 유지
  - `comparisonLawMeta`, `comparisonLawArticles` props 전달하지만 의미 없음

- **file-search-answer-display.tsx**: 2단 비교 뷰 **전혀 사용 안함** (독립 컴포넌트)

- **law-viewer.tsx**:
  - 2단 비교 뷰 조건: `comparisonLawMeta && comparisonLawArticles.length > 0`
  - 항상 `false` → **절대 실행되지 않는 데드 코드**
  - 실제로는 1단 AI 답변 뷰만 실행됨

---

## 🎯 최적화 권장사항 ✅ **제거 가능 확정**

### 1. 안전하게 제거 가능한 코드 (데드 코드 확정)

**✅ 제거 가능**: 모든 2단 비교 뷰 관련 코드가 실제로 사용되지 않음!

### 2. 제거해야 할 코드 목록

#### A. search-result-view.tsx

```typescript
// 라인 238-242: comparisonLaw state 제거
const [comparisonLaw, setComparisonLaw] = useState<{
  meta: LawMeta | null
  articles: LawArticle[]
  selectedJo?: string
} | null>(null)

// 라인 243: isLoadingComparison state 제거
const [isLoadingComparison, setIsLoadingComparison] = useState(false)

// 라인 1000: 초기화 코드 제거
setComparisonLaw(null)

// 라인 1001: 초기화 코드 제거
setIsLoadingComparison(false)

// 라인 2247-2249, 2291-2293: props 전달 제거
comparisonLawMeta={comparisonLaw?.meta || null}
comparisonLawArticles={comparisonLaw?.articles || []}
comparisonLawSelectedJo={comparisonLaw?.selectedJo}
isLoadingComparison={isLoadingComparison}
```

#### B. law-viewer.tsx

```typescript
// 라인 77-80: Props 정의 제거
comparisonLawMeta?: LawMeta | null
comparisonLawArticles?: LawArticle[]
comparisonLawSelectedJo?: string
isLoadingComparison?: boolean

// 라인 98-101: 기본값 제거
comparisonLawMeta = null,
comparisonLawArticles = [],
comparisonLawSelectedJo,
isLoadingComparison = false,

// 라인 2916-3027: 2단 비교 뷰 렌더링 블록 전체 제거
// (조건문: comparisonLawMeta && comparisonLawArticles.length > 0 ? ... : ...)
// 기본 1단 AI 답변 뷰만 유지
```

#### C. 제거 후 영향

**✅ 영향 없음**:
- AI 답변 표시는 `FileSearchAnswerDisplay` 컴포넌트에서 독립적으로 처리
- 실제 사용되는 1단 뷰는 2단 뷰 조건의 `else` 분기에 있음
- 2단 뷰 조건이 항상 `false`이므로 현재도 1단 뷰만 실행 중

---

## 📁 파일별 현황 요약

### components/law-viewer.tsx (3205줄)

| 항목 | 라인 | 상태 | 비고 |
|------|------|------|------|
| AI Props 정의 | 55-81 | ✅ 유지 | 모두 사용 중 |
| AI 답변 렌더링 | 2917-3027 | ✅ 유지 | search-result-view에서 사용 |
| 2단 비교 뷰 | 2919-3027 | ✅ 유지 | 제거 불가 |
| 기본 AI 답변 | 3028+ | ✅ 유지 | file-search에서 사용 |

### components/search-result-view.tsx (2391줄)

| 항목 | 라인 | 상태 | 비고 |
|------|------|------|------|
| handleCitationClick | 1828+ | ✅ 사용 중 | 2단 비교 핸들러 |
| onRelatedArticleClick 전달 | 2245, 2289 | ✅ 사용 중 | LawViewer에 전달 |
| comparisonLaw* 상태 | - | ✅ 사용 중 | 2단 비교 상태 관리 |

### components/file-search-answer-display.tsx

| 항목 | 상태 | 비고 |
|------|------|------|
| 독립 컴포넌트 | ✅ 정상 | 단순화됨 |
| ReactMarkdown | ✅ 사용 중 | 마크다운 렌더링 |
| 2단 비교 뷰 | ❌ 미사용 | 모달 방식만 사용 |

---

## 🚨 중요 주의사항 ✅ **검증 완료**

### ✅ 제거 가능한 코드 (데드 코드)

1. **law-viewer.tsx의 2단 비교 뷰 코드** (라인 2916-3027)
   - **이유**: `comparisonLawMeta`가 항상 `null`이므로 조건문 통과 불가
   - **영향**: 제거해도 현재 기능에 영향 없음 (데드 코드)

2. **comparisonLaw* Props** (law-viewer.tsx 라인 77-80)
   - **이유**: search-result-view.tsx에서 전달하지만 실제 데이터는 항상 `null`/`[]`
   - **영향**: 제거해도 타입 에러 없음 (사용되지 않는 props)

3. **comparisonLaw State** (search-result-view.tsx 라인 238-243)
   - **이유**: `setComparisonLaw(null)` 초기화만 1회 호출, 실제 데이터 할당 코드 없음
   - **영향**: 제거해도 기능 손상 없음

### ⚠️ 주의해야 할 코드 (제거 금지)

1. **onRelatedArticleClick Prop** (law-viewer.tsx)
   - **이유**: search-result-view.tsx에서 일반 법령 뷰어에서는 사용할 수 있음
   - **권장**: AI 모드에서만 제거 고려, 일반 모드는 유지

2. **FileSearchAnswerDisplay 컴포넌트**
   - **이유**: 실제 AI 답변을 표시하는 유일한 컴포넌트
   - **영향**: 제거 시 AI 답변 기능 완전 손상

---

## 🔄 마이그레이션 가이드 (향후)

만약 2단 비교 뷰를 완전히 모달 방식으로 전환하려면:

### Step 1: search-result-view.tsx 수정

```typescript
// Before
const handleCitationClick = async (lawName: string, jo: string, article: string) => {
  // 2단 비교 뷰 상태 업데이트
  setSelectedLawMeta(...)
  setSelectedLawArticles(...)
}

// After
const handleCitationClick = async (lawName: string, jo: string, article: string) => {
  // 모달 열기
  openExternalLawArticleModal(lawName, article)
}
```

### Step 2: law-viewer.tsx 정리

```typescript
// 제거 가능한 Props
interface LawViewerProps {
  // ...
  // ❌ 제거: onRelatedArticleClick
  // ❌ 제거: comparisonLawMeta
  // ❌ 제거: comparisonLawArticles
  // ❌ 제거: comparisonLawSelectedJo
  // ❌ 제거: isLoadingComparison
}

// 제거 가능한 렌더링 코드 (라인 2919-3027)
```

### Step 3: 테스트

1. 관련 법령 클릭 → 모달 열림 확인
2. 모달 내 링크 클릭 → 새 모달 열림 확인 (히스토리 스택)
3. 뒤로가기 버튼 → 이전 모달 복원 확인

---

## 📈 성능 영향 분석

### 현재 상태 (2단 비교 뷰 유지)

- **장점**:
  - 화면 전환 없이 즉시 비교 가능
  - 좌우 스크롤 동기화 가능
  - 사용자 경험 우수

- **단점**:
  - 코드 복잡도 증가 (law-viewer.tsx 3205줄)
  - 2개 뷰 동시 렌더링 (메모리 사용 증가)
  - Props 전달 체인 복잡

### 모달 방식 전환 시

- **장점**:
  - 코드 단순화 (~100줄 감소 예상)
  - Props 전달 체인 단순화
  - 메모리 사용 감소

- **단점**:
  - 모달 열기/닫기 추가 동작 필요
  - 좌우 비교 불가 (순차 확인만 가능)
  - 사용자 경험 저하 가능성

---

## 🎨 UI/UX 개선 방향

### 현재 2단 비교 뷰 개선점

1. **반응형 디자인**
   - 모바일: 1단 뷰로 자동 전환
   - 태블릿: 2단 뷰 유지
   - 데스크톱: 2단 뷰 + 넓은 간격

2. **스크롤 동기화**
   - 좌우 스크롤 동기화 옵션 추가
   - 토글 버튼으로 on/off 제어

3. **비교 모드 선택**
   - 2단 비교 / 모달 / 탭 전환 중 선택 가능
   - 사용자 설정 저장 (localStorage)

---

## 📝 체크리스트

코드 정리 전 반드시 확인:

- [ ] search-result-view.tsx에서 handleCitationClick 사용 여부 확인
- [ ] law-viewer.tsx의 comparisonLaw* props 전달 경로 확인
- [ ] file-search-answer-display.tsx와의 독립성 확인
- [ ] 모달 방식과 2단 비교 뷰 병행 사용 확인
- [ ] 관련 법령 클릭 동작 테스트
- [ ] 모바일/태블릿/데스크톱 반응형 테스트

---

## 🔗 관련 문서

- [법령 파싱 시스템 전체 참조](../important-docs/LAW_PARSING_SYSTEM_REFERENCE.md)
- [JSON to HTML Flow](../important-docs/JSON_TO_HTML_FLOW.md)
- [RAG Architecture](../important-docs/RAG_ARCHITECTURE.md)

---

**최종 결론** ✅ **검증 완료 (2025-11-21)**:

AI 모드에서 2단 비교 뷰 코드는 **실제로 사용되지 않는 데드 코드**입니다. 제거해도 현재 기능에 영향이 없습니다.

**검증 근거**:
1. `comparisonLaw` state는 선언만 되고 실제 데이터가 할당되지 않음
2. `setComparisonLaw(null)` 초기화만 1회 호출됨
3. law-viewer.tsx의 2단 뷰 조건문이 항상 `false`
4. 실제 AI 답변은 `FileSearchAnswerDisplay` 컴포넌트에서 독립적으로 처리

**제거 권장**:
- search-result-view.tsx: `comparisonLaw`, `isLoadingComparison` state 및 관련 코드
- law-viewer.tsx: `comparisonLaw*` props 및 2단 비교 뷰 렌더링 블록 (라인 2916-3027)
- 예상 코드 감소: ~150줄

**문서 버전**: 3.0 (데드 코드 확정)
**검증 날짜**: 2025-11-21 15:45 KST
**다음 단계**: 데드 코드 제거 후 테스트
