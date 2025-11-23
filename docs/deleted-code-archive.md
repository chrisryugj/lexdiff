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

### [2025-11-23] 준비 중

Phase 1 리팩토링 시작 전 상태입니다. 아직 삭제된 코드가 없습니다.

삭제 예정:
- `components/law-viewer.tsx` 라인 1507-4566 (JSX 렌더링 부분)
  - 삭제 이유: `components/law-viewer-ui.tsx`로 분리
  - 기능: 법령 뷰어 UI 렌더링

---

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
