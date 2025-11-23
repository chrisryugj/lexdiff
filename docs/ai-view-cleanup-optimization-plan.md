# AI 뷰 코드 정리 및 최적화 계획

**최종 업데이트**: 2025-11-21 15:30 KST
**목적**: AI 검색 뷰 관련 코드 현황 파악 및 불필요한 코드 제거 가이드

---

## 📋 현황 분석 (2025-11-21 기준)

### 핵심 발견사항

1. **2단 비교 뷰 코드**: law-viewer.tsx에 여전히 존재 (라인 2919-3027)
2. **실제 사용 여부**: search-result-view.tsx에서만 `handleCitationClick`으로 연결 사용 중
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

## 📊 2단 비교 뷰 사용 현황 요약

| 항목 | search-result-view.tsx | file-search-answer-display.tsx | 비고 |
|------|----------------------|-------------------------------|------|
| handleCitationClick 정의 | ✅ 있음 (라인 1828) | ❌ 없음 | 2단 비교 핸들러 |
| onRelatedArticleClick 전달 | ✅ 전달 (라인 2245, 2289) | ❌ 전달 안함 | LawViewer에 전달 |
| 2단 비교 뷰 렌더링 | ✅ 사용 중 | ❌ 사용 안함 | comparisonLaw* props 사용 |
| 모달 방식 처리 | ✅ 병행 사용 | ✅ 주로 사용 | openExternalLawArticleModal |

**결론**:
- **search-result-view.tsx**: 2단 비교 뷰 **사용 중** (관련 법령 클릭 시 우측에 표시)
- **file-search-answer-display.tsx**: 2단 비교 뷰 **미사용** (모달 방식만 사용)
- **law-viewer.tsx**: 2단 비교 뷰 코드 **유지 필요** (search-result-view.tsx에서 사용)

---

## 🎯 최적화 권장사항

### 1. ~~제거 가능한 코드~~ (주의: 제거하면 안됨!)

~~law-viewer.tsx의 2단 비교 뷰 코드 (라인 2919-3027)~~

**❌ 제거 불가**: search-result-view.tsx에서 실제로 사용 중!

### 2. 개선 가능한 부분

#### A. Props 명확화

```typescript
// law-viewer.tsx에서 명확히 주석 추가
interface LawViewerProps {
  // ...

  // ⚠️ search-result-view.tsx에서만 사용 (file-search에서는 미사용)
  onRelatedArticleClick?: (lawName: string, jo: string, article: string) => void
  comparisonLawMeta?: LawMeta | null
  comparisonLawArticles?: LawArticle[]
  comparisonLawSelectedJo?: string
  isLoadingComparison?: boolean
}
```

#### B. 컴포넌트 분리

2단 비교 뷰를 별도 컴포넌트로 분리:

```typescript
// components/ai-comparison-view.tsx (새 파일)
export function AIComparisonView({
  aiAnswerHTML,
  comparisonLawMeta,
  comparisonLawArticles,
  comparisonLawSelectedJo,
  isLoadingComparison,
  fontSize,
  handleContentClick
}: AIComparisonViewProps) {
  // 라인 2919-3027 코드 이동
}

// law-viewer.tsx에서 사용
{aiAnswerMode && comparisonLawMeta ? (
  <AIComparisonView {...props} />
) : (
  <div>기본 AI 답변</div>
)}
```

#### C. 사용처 문서화

```typescript
// law-viewer.tsx 파일 상단 주석
/**
 * LawViewer 컴포넌트
 *
 * AI 모드 2단 비교 뷰 사용처:
 * - search-result-view.tsx: ✅ 사용 중 (관련 법령 클릭 → 2단 비교)
 * - file-search-answer-display.tsx: ❌ 미사용 (모달 방식만 사용)
 *
 * ⚠️ 제거 금지: search-result-view.tsx 의존성 확인 필수
 */
```

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

## 🚨 중요 주의사항

### 제거하면 안되는 코드

1. **law-viewer.tsx의 2단 비교 뷰 코드** (라인 2919-3027)
   - **이유**: search-result-view.tsx에서 실제로 사용 중
   - **영향**: 제거 시 관련 법령 클릭 기능 손상

2. **comparisonLaw* Props** (라인 77-80)
   - **이유**: search-result-view.tsx에서 전달
   - **영향**: 제거 시 타입 에러 발생

3. **onRelatedArticleClick Prop** (라인 70)
   - **이유**: search-result-view.tsx에서 handleCitationClick 전달
   - **영향**: 제거 시 관련 법령 클릭 이벤트 손실

### 안전하게 제거 가능한 코드

현재 상태에서는 **안전하게 제거 가능한 코드가 없음**.

모든 AI 관련 코드가 실제로 사용되고 있음.

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

**최종 결론**:

현재 2단 비교 뷰 코드는 **search-result-view.tsx에서 실제로 사용 중**이므로 제거하면 안됩니다. file-search-answer-display.tsx에서는 모달 방식만 사용하지만, 두 컴포넌트가 동일한 law-viewer.tsx를 공유하므로 코드 유지가 필요합니다.

향후 최적화를 원한다면 **별도 컴포넌트 분리** 또는 **조건부 임포트** 방식을 고려하세요.

**문서 버전**: 2.0 (현행화 완료)
**다음 업데이트**: 2단 비교 뷰 제거 또는 개선 시
