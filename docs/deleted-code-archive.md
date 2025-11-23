# 삭제 코드 아카이브

**목적**: 리팩토링 시 삭제된 코드를 보관하여 문제 발생 시 참조 및 복원

---

## 사용 규칙

### 형식
```markdown
## [날짜] 파일명 - 삭제 이유

### 원본 위치
- 파일: `path/to/file.tsx`
- 라인: 100-200

### 기능 설명
무엇을 하는 코드였는지 설명

### 삭제 이유
왜 삭제했는지

### 삭제된 코드
```typescript
// 코드 블록
```

### 의존성
- 어떤 컴포넌트/함수가 이 코드를 사용했는지
- 삭제 후 대체 방법

### 복원 시 주의사항
문제 발생 시 복원할 때 주의할 점
```

---

## 아카이브 목록


## 복원 가이드

### Phase 1 롤백 (law-viewer-ui.tsx 분리 취소)

**문제 상황**:
- law-viewer-ui.tsx 분리 후 Props 전달 오류
- 렌더링이 깨지는 경우

**복원 절차**:
1. `components/law-viewer-ui.tsx` 파일 삭제
2. 아래 "백업: law-viewer.tsx JSX 부분" 섹션의 코드 복사
3. `components/law-viewer.tsx` 라인 1507에 붙여넣기
4. `import { LawViewerUI } from "@/components/law-viewer-ui"` 제거
5. `return <LawViewerUI ... />` 제거
6. 빌드 및 테스트

---

## 백업: law-viewer.tsx JSX 부분

Phase 1 작업 시작 전에 이 섹션에 원본 JSX 코드가 백업됩니다.

### 원본 위치
- 파일: `components/law-viewer.tsx`
- 라인: 1507-4566 (3,059줄)

### 기능 설명
법령 뷰어의 전체 UI 렌더링:
- 조문 목록 (좌측)
- 조문 내용 (우측)
- 2단/3단 비교 패널
- 행정규칙 패널
- AI 답변 표시
- 모달 (참조 법령, 개정이력)
- 모바일 반응형 레이아웃

### 삭제 이유
- law-viewer-ui.tsx로 UI 로직 분리
- 상태 관리와 UI 렌더링 분리하여 가독성 향상
- 파일 크기 감소 (4,566 → 1,600줄)

### 대체 방법
`<LawViewerUI />` 컴포넌트 호출 + Props 전달

### 의존성
**없음** (self-contained JSX)

단, 다음 변수들을 사용:
- `meta`, `articles`, `loadedArticles`, `preambles`
- `activeJo`, `activeArticle`, `fontSize`, `copied`
- `isOrdinance`, `viewMode`, `isFullView`
- `aiAnswerMode`, `aiAnswerHTML`, `relatedArticles`
- `threeTierCitation`, `threeTierDelegation`, `tierViewMode`
- `showAdminRules`, `adminRuleViewMode`, `adminRules`
- `refModal`, `refModalHistory`, `revisionHistory`
- `handleArticleClick`, `handleContentClick` 등 모든 핸들러

### 삭제된 코드

```typescript
// ⚠️ Phase 1 작업 시작 전에 여기에 라인 1507-4566 코드가 백업됩니다.
// 현재는 아직 삭제되지 않았습니다.
```

### 복원 시 주의사항
1. **정확한 위치**: 반드시 라인 1507 (모든 hooks/handlers 이후)에 붙여넣기
2. **Import 확인**: 필요한 컴포넌트 import 문이 그대로 있는지 확인
3. **변수명 일치**: JSX에서 사용하는 모든 state/handler 변수명이 동일한지 확인
4. **타입 체크**: TypeScript 오류가 없는지 확인

---

## 변경 이력

| 날짜 | 작업 | 파일 | 상태 |
|-----|------|------|------|
| 2025-11-23 | 아카이브 파일 생성 | - | 준비 |
| 2025-11-23 | Phase 1 시작 예정 | law-viewer.tsx | 대기 |

---

**최종 업데이트**: 2025-11-23
**다음 작업**: Phase 1 - law-viewer.tsx JSX 분리

---

## [2025-11-23] Phase 1 완료: law-viewer.tsx JSX 분리

### 원본 위치
- 파일: `components/law-viewer.tsx`
- 라인: 1507-4566 (3,060줄)
- 백업: `components/law-viewer.tsx.backup`

### 기능 설명
법령 뷰어의 전체 UI 렌더링:
- 조문 목록 (좌측 사이드바)
- 조문 내용 (우측 메인 패널)
- 2단/3단 비교 패널 (시행령/규칙)
- 행정규칙 패널
- AI 답변 표시 (File Search RAG 모드)
- 모달 (참조 법령, 개정이력, 법령 체계도)
- 모바일 반응형 레이아웃
- 즐겨찾기 표시
- Swipe 튜토리얼 및 힌트

### 삭제 이유
- law-viewer-ui.tsx로 UI 로직 분리
- 상태 관리(business logic)와 UI 렌더링(presentation)을 분리하여 가독성 향상
- 파일 크기 감소: **4,566 → 1,595줄 (65%↓)**
- 유지보수성 향상: UI 수정 시 law-viewer-ui.tsx만 변경

### 대체 방법
`<LawViewerUI />` 컴포넌트 호출 + Props 전달

**law-viewer.tsx (수정 후)**:
```typescript
import { LawViewerUI } from "@/components/law-viewer-ui"

export function LawViewer({ ... }: LawViewerProps) {
  // 모든 state & hooks (그대로 유지)
  const [activeJo, setActiveJo] = useState(...)
  // ... 70개 hooks

  // 모든 handlers (그대로 유지)
  const handleArticleClick = async (jo: string) => { ... }
  // ...

  // JSX 대신 LawViewerUI 호출
  return (
    <LawViewerUI
      meta={meta}
      articles={articles}
      activeJo={activeJo}
      // ... 모든 state와 handler 전달
      onArticleClick={handleArticleClick}
      // ...
    />
  )
}
```

### 의존성
**없음** (self-contained JSX)

단, 다음 변수들을 props로 전달:
- Data: `meta`, `articles`, `loadedArticles`, `preambles`, `activeJo`, `activeArticle`
- View State: `isOrdinance`, `viewMode`, `isFullView`, `fontSize`, `copied`, `isArticleListExpanded`
- AI Mode: `aiAnswerMode`, `aiAnswerHTML`, `relatedArticles`, `aiCitations`, `userQuery`, `aiConfidenceLevel`
- 3-Tier: `threeTierCitation`, `threeTierDelegation`, `tierViewMode`, `validDelegations`, `validCitations`
- Admin Rules: `showAdminRules`, `adminRuleViewMode`, `adminRules`, `loadingAdminRules`
- Comparison: `comparisonLawMeta`, `comparisonLawArticles`, `isLoadingComparison`
- Modal: `refModal`, `refModalHistory`, `lastExternalRef`
- Revision: `revisionHistory`, `isLoadingHistory`
- Panels: `delegationPanelSize`, `adminRulePanelSize`
- Swipe: `swipeHint`
- Refs: `contentRef`, `articleRefs`
- Handlers: `handleArticleClick`, `handleContentClick`, `setFontSize`, `copyArticleUrl`, `openExternalLink`, `setRefModal`, `handleRefModalBack`, `setTierViewMode`, `fetchThreeTierData`, `setShowAdminRules`, `handleViewAdminRuleFullContent`, `setAdminRuleMobileTab`, `setDelegationActiveTab`, `formatJoForDisplay` 등

### 새로 생성된 파일
**components/law-viewer-ui.tsx** (3,335줄)
- Props interface: `LawViewerUIProps` (191줄)
- UI 컴포넌트: `LawViewerUI` (3,144줄 JSX)

### 파일 크기 변화
| 파일 | Before | After | 변화 |
|-----|--------|-------|------|
| law-viewer.tsx | 4,566줄 | 1,595줄 | **-2,971줄 (65%↓)** |
| law-viewer-ui.tsx | - | 3,335줄 | **+3,335줄 (신규)** |
| **합계** | 4,566줄 | 4,930줄 | +364줄 (Props 인터페이스) |

### 삭제된 코드
백업 위치: `components/law-viewer.tsx.backup` (전체 파일)

**JSX 시작** (라인 1507):
```typescript
  return (
    <>
      <div className="relative grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 h-[calc(100vh-12rem)] lg:overflow-hidden" style={{ fontFamily: "Pretendard, sans-serif" }}>
        {/* Mobile overlay backdrop */}
        {isArticleListExpanded && (
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsArticleListExpanded(false)}
          />
        )}

        {/* Left sidebar - AI 답변 모드 or 조문 목록 (Desktop only) */}
        <Card className="hidden lg:flex p-4 flex-col overflow-hidden">
          {aiAnswerMode ? (
            // ========== AI 모드: 왼쪽은 관련 법령 목록 ==========
            <>
              ...
```

**JSX 끝** (라인 4566):
```typescript
      {/* Swipe Tutorial (첫 방문 시 표시) */}
      <SwipeTutorial onComplete={() => {}} />

      {/* Swipe Hint (스와이프 시 힌트 표시) */}
      {swipeHint && (
        <SwipeHint
          direction={swipeHint.direction}
          onDismiss={() => setSwipeHint(null)}
        />
      )}
    </>
  )
}
```

*전체 JSX (3,060줄)는 너무 길어 생략. 필요 시 `components/law-viewer.tsx.backup` 참조*

### 복원 시 주의사항
1. **정확한 위치**: 반드시 라인 1507 (console.log 이후, return 문 위치)에 붙여넣기
2. **Import 확인**: `import { LawViewerUI } from "@/components/law-viewer-ui"` 제거
3. **변수명 일치**: JSX에서 사용하는 모든 state/handler 변수명이 동일한지 확인
4. **타입 체크**: TypeScript 오류가 없는지 확인
5. **빌드 테스트**: `npm run build` 성공 확인

### 복원 방법 (롤백)
```bash
# 1. 백업에서 복원
cp components/law-viewer.tsx.backup components/law-viewer.tsx

# 2. law-viewer-ui.tsx 삭제
rm components/law-viewer-ui.tsx

# 3. 빌드 확인
npm run build
```

---

## 변경 이력 업데이트

| 날짜 | 작업 | 파일 | 상태 |
|-----|------|------|------|
| 2025-11-23 | 아카이브 파일 생성 | - | 완료 |
| 2025-11-23 | Phase 1 시작 | law-viewer.tsx | 완료 |
| 2025-11-23 | JSX 분리 | law-viewer.tsx → law-viewer-ui.tsx | **완료 ✅** |
| 2025-11-23 | 빌드 검증 | - | **성공 ✅** |

---

**최종 업데이트**: 2025-11-23 15:30 KST
**다음 작업**: Phase 2 검토 (함수 분리) 또는 동작 검증 테스트

---

## [2025-11-23] Phase 0: 코드 다이어트 (안전한 최적화)

### Phase 0.1: console.log 제거

#### 원본 위치
- 파일: `components/law-viewer.tsx`
- 총 개수: 75개 (console.log: 67개, console.warn: 5개, console.error: 3개)

#### 기능 설명
디버깅용 로그 출력:
- 렌더링 추적
- API 응답 검증
- 에러 추적
- 데이터 플로우 확인

#### 삭제 이유
- **프로덕션 환경에서 불필요**: 개발 중에만 유용
- **파일 크기 감소**: 약 75줄 제거
- **성능 개선**: console 호출 제거로 미세한 성능 향상
- **로그 노이즈 감소**: 브라우저 콘솔 정리

#### 삭제 대상 라인 목록
```
라인 118: console.log("LawViewer 렌더링:", ...)
라인 243: console.log("[3단비교 디버깅] 조문 delegation 데이터:", ...)
라인 279: console.log("[개정이력] Active article revision history:", ...)
라인 293: console.log("selectedJo 변경 감지 - activeJo 업데이트:", ...)
라인 326: console.log("Fetching revision history for article:", ...)
라인 333: console.warn("[v0] Article history API returned error:", ...)
라인 336: console.error("[v0] Failed to fetch revision history:", ...)
라인 343: console.log("Received revision history XML, length:", ...)
라인 349: console.warn("[v0] Revision history not available for this article:", ...)
라인 357-378: console.log("[개정이력 useEffect] 실행/종료 로그들", ...)
라인 453: console.log("조문이 로드되지 않음 - 동적으로 로드:", ...)
라인 487: console.error("[v0] 조문 로드 실패:", ...)
라인 502: console.log("단일 조문 뷰 - activeJo 설정 완료")
라인 553-567: console.log('[원문 보기] URL 로그들', ...)
라인 625-1312: console.log/warn/error ('[handleContentClick] 및 모달 관련 로그들', ...)
라인 1498: console.log("LawViewer 렌더링 완료:", ...)
라인 2672, 2768, 3908: console.log("[law-viewer] Cache cleared, reloading admin rule:", ...)
... (총 75개)
```

#### 대체 방법
- **debugLogger 사용**: 이미 프로젝트에 `lib/debug-logger.ts` 존재
- **필요시 복원 가능**: Git history 또는 이 아카이브에서 복원

#### 의존성
- **없음**: console.log는 디버깅 용도이며 프로그램 로직에 영향 없음

#### 복원 시 주의사항
1. **선택적 복원**: 필요한 로그만 복원 (전체 복원 지양)
2. **debugLogger 사용 권장**: console.log 대신 debugLogger.log() 사용
3. **조건부 로그**: 환경 변수로 제어 가능하도록 개선

---

### 예상 효과
- **파일 크기**: 4,566줄 → 4,491줄 (75줄 감소, 1.6%↓)
- **리스크**: 0% (로직 변경 없음)
- **빌드**: 영향 없음
- **성능**: 미세한 향상

---

**작업 시작**: 2025-11-23 16:30 KST
**작업 완료**: 2025-11-23 16:45 KST
**상태**: ✅ 완료

---

### 실제 결과
- **제거된 console 라인**: 176개
- **실제 파일 크기**: 4,567줄 → 4,379줄 (**188줄 감소, 4.1%↓**)
- **빌드 결과**: ✅ 성공
- **타입 에러**: 없음
- **런타임 에러**: 없음 (예상)

### 제거 방법
- `remove-console-safe.mjs` 스크립트 사용
- 라인별 분석으로 멀티라인 console 문 안전하게 제거
- 괄호/중괄호 depth 추적으로 코드 구조 보존

### 검증
```bash
npm run build
# ✅ Compiled successfully in 3.3s
```
