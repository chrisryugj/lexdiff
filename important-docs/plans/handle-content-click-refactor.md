# P1: handleContentClick 함수 분리 계획

## 현황
- **파일**: `components/law-viewer.tsx` (라인 613-848, 236줄)
- **문제**: 6개 링크 타입 처리 로직이 한 함수에 집중
- **링크 타입**: article(91줄), law(17줄), regulation(15줄), law-article(39줄), same(9줄), related(55줄)

## 리팩토링 접근법: 하이브리드

점진적 전환으로 위험 최소화:
1. 타입 정의 → 간단한 핸들러 → 복잡한 핸들러 순서

## 파일 구조

```
lib/content-click-handlers/
├── types.ts              (~60줄) - 공통 타입 정의
├── index.ts              (~20줄) - export 통합
├── same-handler.ts       (~25줄) - "same" 타입
├── law-handler.ts        (~30줄) - "law" 타입
├── regulation-handler.ts (~40줄) - "regulation" 타입
├── law-article-handler.ts(~60줄) - "law-article" 타입
├── related-handler.ts    (~70줄) - "related" 타입
└── article-handler.ts    (~100줄) - "article" 타입

hooks/
└── use-content-click-handlers.ts (~50줄) - 메인 훅
```

## 핵심 인터페이스

```typescript
// types.ts
interface ContentClickContext {
  meta, articles, activeArticle,
  aiAnswerMode, userQuery, aiCitations, relatedArticles,
  tierViewMode, validDelegations, showAdminRules,
  lastExternalRef, refModal
}

interface ContentClickActions {
  openExternalLawArticleModal, setRefModal, setRefModalHistory,
  setLastExternalRef, fetchThreeTierData, setTierViewMode,
  setDelegationActiveTab, setShowAdminRules, toast
}

type RefHandler = (target, context, actions) => Promise<void>
```

## 구현 순서

| Phase | 작업 | 파일 |
|-------|------|------|
| 1 | 타입 정의 | types.ts |
| 2 | 간단한 핸들러 | same-handler.ts, law-handler.ts |
| 3 | 중간 핸들러 | regulation-handler.ts, law-article-handler.ts |
| 4 | 복잡한 핸들러 | related-handler.ts, article-handler.ts |
| 5 | 훅 통합 | use-content-click-handlers.ts, index.ts |
| 6 | law-viewer 적용 | law-viewer.tsx 수정 |

## 예상 효과
- law-viewer.tsx: 236줄 → ~10줄 (훅 호출만)
- 각 핸들러 독립 테스트 가능
- 새 링크 타입 추가 시 확장 용이

## 수정 파일

| 파일 | 변경 |
|------|------|
| `lib/content-click-handlers/*` | 신규 생성 (7개 파일) |
| `hooks/use-content-click-handlers.ts` | 신규 생성 |
| `components/law-viewer.tsx` | handleContentClick 제거, 훅 import |
