# AI 뷰 최적화 계획 (안전 버전)

**작성일**: 2025-11-19
**목적**: 에러 없는 안전한 최적화 - 과도한 분할 지양
**원칙**: Claude가 한 번에 읽을 수 있는 크기(~2000줄)의 70% = **~1400줄 수준으로 분할**

---

## 🎯 Phase 2 수정 계획: 안전한 분할 목표

### 기존 계획 (취소)
❌ **너무 잘게 쪼개는 계획 (20개 파일)**
- law-viewer/index.tsx: 250줄
- 나머지 19개 파일로 분산
- **문제**: 과도한 분할로 복잡도 증가, 추적 어려움

### 새 계획 (안전)
✅ **적정 수준의 분할 (3-4개 큰 덩어리)**
- **목표 크기**: 각 파일 1000-1400줄 수준
- **파일 개수**: 3-4개 (현재 3167줄 → 800-1000줄 × 3개)
- **원칙**: Claude가 한 번에 읽고 이해할 수 있는 크기

---

## 📊 law-viewer.tsx 분할 전략 (안전 버전)

### 현재 구조 (3167줄)

```
law-viewer.tsx (3167줄)
├── Props & State (1-150줄)           ~150줄
├── Helper Functions (150-1400줄)     ~1250줄
└── JSX Rendering (1400-3167줄)       ~1767줄
```

### 분할 후 구조 (3개 파일)

```
components/law-viewer/
├── index.tsx                          (~800줄)
│   ├── Props & State
│   ├── 핵심 Helper 함수들
│   └── 메인 JSX (조건부 렌더링 포함)
│
├── view-renderers.tsx                 (~1200줄)
│   ├── FullArticleListView 함수
│   ├── AdminRuleDetailView 함수
│   ├── AdminRuleListView 함수
│   ├── ThreeTierView 함수
│   ├── TwoTierView 함수
│   └── AISummaryView 함수
│
└── shared-components.tsx              (~800줄)
    ├── ArticleSidebar
    ├── ArticleHeader
    ├── ActionButtonBar
    ├── TwoColumnLayout
    ├── ArticleCard
    └── 기타 공통 컴포넌트
```

**총 파일 수**: 3개 (기존 1개에서)
**평균 파일 크기**: ~950줄
**최대 파일 크기**: ~1200줄 (Claude가 읽기 편한 크기)

---

## 🔧 분할 세부 계획

### Step 1: view-renderers.tsx 분리 (1일)

**목적**: 6가지 뷰 렌더링 함수를 별도 파일로 분리

**추출 대상** (~1200줄):
```typescript
// components/law-viewer/view-renderers.tsx

import type { LawArticle, LawMeta } from '@/lib/law-types'
// ... 필요한 imports

/**
 * 전체 조문 리스트 뷰
 */
export function renderFullArticleListView(props: {
  articles: LawArticle[]
  fontSize: number
  handleContentClick: (e: React.MouseEvent) => void
  // ... 필요한 props만
}) {
  return (
    // 현재 라인 ~1901-1995 내용 (95줄)
  )
}

/**
 * 행정규칙 상세 뷰 (2단)
 */
export function renderAdminRuleDetailView(props: {...}) {
  return (
    // 현재 라인 ~2002-2106 내용 (105줄)
  )
}

/**
 * 행정규칙 목록 뷰 (2단)
 */
export function renderAdminRuleListView(props: {...}) {
  return (
    // 현재 라인 ~2107-2226 내용 (120줄)
  )
}

/**
 * 3단 비교 뷰 (법-령-규)
 */
export function renderThreeTierView(props: {...}) {
  return (
    // 현재 라인 ~2227-2341 내용 (115줄)
  )
}

/**
 * 2단 비교 뷰 (법-령)
 */
export function renderTwoTierView(props: {...}) {
  return (
    // 현재 라인 ~2342-2847 내용 (505줄)
  )
}

/**
 * AI 답변 뷰 (1단/2단)
 */
export function renderAISummaryView(props: {...}) {
  return (
    // 현재 라인 ~2916-3000+ 내용 (150줄+)
  )
}
```

**law-viewer/index.tsx에서 사용**:
```typescript
import {
  renderFullArticleListView,
  renderAdminRuleDetailView,
  renderAdminRuleListView,
  renderThreeTierView,
  renderTwoTierView,
  renderAISummaryView,
} from './view-renderers'

// JSX에서 함수 호출
{isFullView && !showAdminRules ? (
  renderFullArticleListView({ articles, fontSize, handleContentClick, ... })
) : activeArticle ? (
  showAdminRules && adminRuleViewMode === "detail" ? (
    renderAdminRuleDetailView({ ... })
  ) : showAdminRules ? (
    renderAdminRuleListView({ ... })
  ) : tierViewMode === "3-tier" ? (
    renderThreeTierView({ ... })
  ) : tierViewMode === "2-tier" ? (
    renderTwoTierView({ ... })
  ) : aiAnswerMode && aiAnswerContent ? (
    renderAISummaryView({ ... })
  ) : (
    // 기본 단일 조문 뷰 (index.tsx에 유지)
  )
) : null}
```

**효과**:
- law-viewer/index.tsx: 3167줄 → ~1967줄 (1200줄 감소)
- view-renderers.tsx: 1200줄 (새 파일)
- 조건부 렌더링 로직은 index.tsx에 유지 (변경 최소화)

---

### Step 2: shared-components.tsx 분리 (1일)

**목적**: 반복되는 UI 컴포넌트를 별도 파일로 추출

**추출 대상** (~800줄):
```typescript
// components/law-viewer/shared-components.tsx

import type { LawArticle, LawMeta, ParsedRelatedLaw } from '@/lib/law-types'
// ... 필요한 imports

/**
 * 왼쪽 사이드바 (조문 목록 또는 관련 법령)
 */
export function ArticleSidebar(props: {
  aiAnswerMode: boolean
  relatedArticles?: ParsedRelatedLaw[]
  articles: LawArticle[]
  activeJo: string
  onArticleClick: (jo: string) => void
  favorites: Set<string>
  onToggleFavorite?: (jo: string) => void
  // ...
}) {
  // 현재 라인 ~1423-1688 내용 (265줄)
}

/**
 * 조문 헤더 (제목 + 개정일)
 */
export function ArticleHeader(props: {
  meta: LawMeta
  activeArticle: LawArticle
  // ...
}) {
  // 현재 라인 ~1726-1773 내용 (50줄)
}

/**
 * 액션 버튼 바 (비교, AI 요약, 즐겨찾기 등)
 */
export function ActionButtonBar(props: {
  onCompare?: () => void
  onSummarize?: () => void
  onToggleFavorite?: () => void
  isFavorited: boolean
  // ...
}) {
  // 현재 라인 ~1776-1865 내용 (90줄)
}

/**
 * 2단 레이아웃 (공통 패턴)
 */
export function TwoColumnLayout(props: {
  left: React.ReactNode
  right: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-2 gap-4 overflow-hidden" style={{ height: 'calc(100vh - 250px)' }}>
      <div className="overflow-y-auto pr-2">{props.left}</div>
      <div className="overflow-y-auto pl-2">{props.right}</div>
    </div>
  )
}

/**
 * 조문 카드 (헤더 + 본문)
 */
export function ArticleCard(props: {
  article: LawArticle
  fontSize: number
  onContentClick?: (e: React.MouseEvent) => void
  lawTitle?: string
}) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      {/* 헤더 */}
      <div className="mb-4 pb-3 border-b border-border">
        <h3>{formatSimpleJo(props.article.jo)}</h3>
        {props.lawTitle && <Badge>{props.lawTitle}</Badge>}
      </div>
      {/* 본문 */}
      <div
        style={{ fontSize: `${props.fontSize}px` }}
        onClick={props.onContentClick}
        dangerouslySetInnerHTML={{ __html: extractArticleText(props.article) }}
      />
    </div>
  )
}

// ... 기타 공통 컴포넌트들
```

**효과**:
- law-viewer/index.tsx: 1967줄 → ~1167줄 (800줄 감소)
- shared-components.tsx: 800줄 (새 파일)
- 중복 코드 일부 제거 (TwoColumnLayout, ArticleCard 재사용)

---

### Step 3: 최종 정리 (0.5일)

**law-viewer/index.tsx 최종 크기**: ~1167줄

**포함 내용**:
- Props & State (~150줄)
- Helper 함수들 (~400줄)
  - handleContentClick
  - openExternalLawArticleModal
  - Font size 관련 함수들
  - Copy 함수
  - 기타 핵심 로직
- 메인 JSX (~600줄)
  - 조건부 렌더링 로직 (유지)
  - 기본 단일 조문 뷰 (유지)
  - 모달들 (ReferenceModal, RevisionHistory)

**장점**:
- ✅ **1167줄** = Claude가 한 번에 읽기 편한 크기 (~2000줄의 60%)
- ✅ 핵심 로직은 index.tsx에 유지 (추적 용이)
- ✅ 뷰 렌더링과 공통 컴포넌트만 분리 (최소한의 변경)
- ✅ 파일 3개만 관리 (20개보다 훨씬 단순)

---

## 📊 예상 효과 (안전 버전)

### 분할 전후 비교

| 항목 | Before | After | 비고 |
|------|--------|-------|------|
| **파일 개수** | 1개 | 3개 | 관리 가능한 수준 |
| **index.tsx 크기** | 3167줄 | ~1167줄 | 63% 감소 |
| **최대 파일 크기** | 3167줄 | ~1200줄 | Claude 읽기 편함 |
| **평균 파일 크기** | 3167줄 | ~950줄 | 적정 수준 |

### 유지보수 개선

| 작업 | Before | After | 개선 |
|------|--------|-------|------|
| 뷰 로직 수정 | 3167줄 탐색 | view-renderers.tsx만 (1200줄) | 2.6배 빠름 |
| 공통 UI 수정 | 여러 곳 찾기 | shared-components.tsx만 (800줄) | 일관성 보장 |
| 핵심 로직 수정 | 3167줄 탐색 | index.tsx만 (1167줄) | 2.7배 빠름 |
| 코드 리뷰 | 전체 확인 | 변경된 파일만 | 효율적 |

### 위험도

| 항목 | 기존 계획 (20개 파일) | 안전 계획 (3개 파일) |
|------|---------------------|-------------------|
| 복잡도 | 🔴 매우 높음 | 🟢 낮음 |
| 추적 난이도 | 🔴 매우 어려움 | 🟢 쉬움 |
| 버그 발생 가능성 | 🔴 높음 | 🟡 중간 |
| 롤백 난이도 | 🔴 어려움 | 🟢 쉬움 |

---

## 🚀 실행 계획 (Phase 2 안전 버전)

### Week 1: view-renderers.tsx 분리

**Day 1 (4시간)**:
- [ ] `components/law-viewer/` 폴더 생성
- [ ] `view-renderers.tsx` 파일 생성
- [ ] 6가지 렌더 함수 추출 (복사 후 수정)
  - renderFullArticleListView (95줄)
  - renderAdminRuleDetailView (105줄)
  - renderAdminRuleListView (120줄)
  - renderThreeTierView (115줄)
  - renderTwoTierView (505줄)
  - renderAISummaryView (150줄+)
- [ ] Props 인터페이스 정의 (각 함수별)

**Day 2 (4시간)**:
- [ ] law-viewer.tsx → law-viewer/index.tsx로 이동
- [ ] index.tsx에서 view-renderers.tsx import
- [ ] 조건부 렌더링에서 함수 호출로 변경
- [ ] 빌드 에러 수정 (import 경로, 타입 등)

**Day 3 (2시간)**:
- [ ] 전체 기능 테스트
  - [ ] 전체 조문 리스트
  - [ ] 행정규칙 상세/목록
  - [ ] 3단 비교
  - [ ] 2단 비교
  - [ ] AI 답변 뷰
- [ ] 버그 수정
- [ ] 커밋: `refactor(law-viewer): extract view rendering functions (1200 lines)`

---

### Week 2: shared-components.tsx 분리

**Day 1 (4시간)**:
- [ ] `shared-components.tsx` 파일 생성
- [ ] 공통 컴포넌트 추출
  - ArticleSidebar (265줄)
  - ArticleHeader (50줄)
  - ActionButtonBar (90줄)
  - TwoColumnLayout (신규 작성, 20줄)
  - ArticleCard (신규 작성, 40줄)

**Day 2 (4시간)**:
- [ ] index.tsx와 view-renderers.tsx에서 공통 컴포넌트 사용
- [ ] 중복 코드 제거 (TwoColumnLayout 4개 위치 → 1개)
- [ ] 빌드 에러 수정

**Day 3 (2시간)**:
- [ ] 전체 기능 테스트
- [ ] 버그 수정
- [ ] 커밋: `refactor(law-viewer): extract shared components (800 lines)`

---

### Week 3: 최종 정리 및 문서화

**Day 1 (2시간)**:
- [ ] 코드 리뷰 및 리팩토링
- [ ] 불필요한 import 제거
- [ ] TypeScript 타입 오류 수정

**Day 2 (2시간)**:
- [ ] 성능 측정 (렌더링 시간, 메모리 사용량)
- [ ] 최적화 필요 시 React.memo 적용

**Day 3 (2시간)**:
- [ ] CHANGELOG.md 업데이트
- [ ] important-docs/JSON_TO_HTML_FLOW.md 경로 업데이트
- [ ] 커밋: `docs: update law-viewer refactoring changelog`

---

## ⚠️ 주의사항

### 1. 기존 계획과의 차이점

| 항목 | 기존 계획 (취소) | 안전 계획 (채택) |
|------|----------------|----------------|
| 파일 개수 | 20개 | 3개 |
| 최대 파일 크기 | ~500줄 | ~1200줄 |
| 분할 원칙 | 기능별 완전 분리 | 큰 덩어리로 분리 |
| Custom Hooks | 별도 파일 | index.tsx에 유지 |
| Context API | 도입 | 도입 안 함 |
| Props Drilling | 해결 | 유지 (변경 최소화) |

### 2. 나중에 추가 최적화 가능

**현재 계획으로 충분하지 않다면**:
- view-renderers.tsx (1200줄) → 추가 분할 (각 뷰별 파일)
- shared-components.tsx (800줄) → 추가 분할 (컴포넌트별 파일)
- index.tsx에서 Custom Hooks 분리

**하지만 지금은**:
- ✅ 3개 파일로 충분 (Claude가 읽기 편함)
- ✅ 과도한 분할 지양 (복잡도 증가 방지)
- ✅ 점진적 개선 가능

---

## 📋 Phase 2 체크리스트 (안전 버전)

### Week 1: view-renderers.tsx 분리
- [ ] view-renderers.tsx 파일 생성
- [ ] 6가지 렌더 함수 추출
- [ ] law-viewer.tsx → law-viewer/index.tsx 이동
- [ ] import 및 함수 호출 수정
- [ ] 빌드 에러 수정
- [ ] 전체 기능 테스트
- [ ] 커밋

### Week 2: shared-components.tsx 분리
- [ ] shared-components.tsx 파일 생성
- [ ] 공통 컴포넌트 추출
- [ ] 중복 코드 제거
- [ ] 빌드 에러 수정
- [ ] 전체 기능 테스트
- [ ] 커밋

### Week 3: 최종 정리
- [ ] 코드 리뷰 및 정리
- [ ] 성능 측정
- [ ] 문서 업데이트
- [ ] 커밋

---

## 🎯 최종 목표

### 분할 후 구조 (안전 버전)

```
components/law-viewer/
├── index.tsx                          (~1167줄) ✅ Claude 읽기 편함
├── view-renderers.tsx                 (~1200줄) ✅ Claude 읽기 편함
└── shared-components.tsx              (~800줄)  ✅ Claude 읽기 편함
```

**총 3개 파일, 평균 ~1056줄**

### 장점

1. ✅ **적정 크기**: 각 파일이 Claude가 한 번에 읽을 수 있는 크기
2. ✅ **단순함**: 3개 파일만 관리 (복잡도 낮음)
3. ✅ **추적 용이**: 핵심 로직은 index.tsx에 유지
4. ✅ **점진적 개선**: 필요 시 추가 분할 가능
5. ✅ **낮은 위험도**: 최소한의 변경으로 목표 달성

---

**문서 버전**: 3.0 (안전 버전)
**최종 수정**: 2025-11-19
**작성자**: Claude Code Analysis

**변경 이력**:
- v1.0: 초안 작성 (20개 파일 분할 계획)
- v2.0: 현황 분석 및 상세 계획
- **v3.0: 안전 버전 (3개 파일 분할로 수정)**
  - 파일 개수: 20개 → 3개
  - 평균 파일 크기: ~150줄 → ~1000줄
  - Claude가 읽기 편한 크기 기준 (~2000줄의 70%)
  - 과도한 분할 지양, 점진적 개선 가능
