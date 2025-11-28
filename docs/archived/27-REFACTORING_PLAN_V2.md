# 대형 파일 리팩토링 계획서 V2 (수정본)

**작성일**: 2025-11-23
**목표**: law-viewer.tsx 파일 크기 최적화
**전략**: 파일을 직접 읽지 않고도 분리 가능한 방법

---

## 📊 Phase 1 실패 원인 분석

### 실패 이유
1. **파일이 너무 커서 전체를 읽을 수 없음** (42,466 tokens > 25,000 limit)
2. **JSX에서 사용하는 모든 변수를 수동으로 Props 매핑** → 누락 발생
3. **inline 함수명 불일치** (handleCopy vs copyArticleUrl)
4. **70개 이상의 state/handler를 추적하기 어려움**

### 잘못된 접근
- JSX 부분만 추출하여 새 파일로 분리
- Props 인터페이스를 수동으로 작성
- 변수명을 추측하여 매핑

---

## 🎯 수정된 전략: 점진적 분리

### 핵심 원칙
1. **파일을 읽지 않고 분리 가능한 단위부터 시작**
2. **작은 단위씩 분리 → 테스트 → 다음 단계**
3. **Props 최소화** (상태는 그대로, 렌더링 함수만 분리)

---

## 📋 Phase 1 (수정): 독립 함수 분리 (가장 안전)

### 목표
- **law-viewer.tsx**: 4,566 → 4,000줄 (12% 감소)
- **소요 시간**: 1-2시간
- **리스크**: 5% 미만

### 작업 내용

#### 1. Modal 함수 4개 → `lib/law-viewer-modals.ts`

**분리 대상** (grep으로 정확히 추출 가능):
```bash
# 함수 시작/끝 라인 찾기
grep -n "const openExternalLawArticleModal" law-viewer.tsx
grep -n "const openRelatedLawModal" law-viewer.tsx
grep -n "const openLawHierarchyModal" law-viewer.tsx
grep -n "const openAdminRuleDetailModal" law-viewer.tsx
```

**새 파일 구조**:
```typescript
// lib/law-viewer-modals.ts
export async function openExternalLawArticleModal(
  lawName: string,
  joLabel: string,
  meta: LawMeta
): Promise<ModalData> {
  // 기존 로직 복사
}

export async function openRelatedLawModal(...): Promise<ModalData> { ... }
export async function openLawHierarchyModal(...): Promise<ModalData> { ... }
export async function openAdminRuleDetailModal(...): Promise<ModalData> { ... }
```

**law-viewer.tsx 수정**:
```typescript
import * as LawModals from '@/lib/law-viewer-modals'

// 기존 함수 제거
// 사용처에서 호출
const handleExternalRef = async (lawName: string, joLabel: string) => {
  const modalData = await LawModals.openExternalLawArticleModal(lawName, joLabel, meta)
  setRefModal({ open: true, ...modalData })
}
```

**예상 효과**: 약 550줄 감소

---

#### 2. Helper 함수 → `lib/law-viewer-helpers.ts`

**분리 대상**:
- `increaseFontSize`, `decreaseFontSize`, `resetFontSize` (3줄 x 3 = 9줄)
- `handleCopy` (10줄)
- `openLawCenter` (20줄)

**새 파일**:
```typescript
// lib/law-viewer-helpers.ts
export function increaseFontSize(currentSize: number): number {
  return Math.min(currentSize + 2, 24)
}

export function decreaseFontSize(currentSize: number): number {
  return Math.max(currentSize - 2, 10)
}

export function resetFontSize(): number {
  return 14
}

export async function copyArticleToClipboard(
  contentRef: React.RefObject<HTMLDivElement>,
  meta: LawMeta,
  activeArticle: LawArticle | undefined
): Promise<void> {
  // 기존 handleCopy 로직
}

export function openLawInBrowser(
  meta: LawMeta,
  isOrdinance: boolean,
  isFullView: boolean,
  activeArticle: LawArticle | undefined
): void {
  // 기존 openLawCenter 로직
}
```

**law-viewer.tsx 수정**:
```typescript
import * as LawHelpers from '@/lib/law-viewer-helpers'

// 기존 함수 제거
// 사용처 수정
const handleIncrease = () => setFontSize(LawHelpers.increaseFontSize(fontSize))
const handleCopy = () => LawHelpers.copyArticleToClipboard(contentRef, meta, activeArticle).then(...)
```

**예상 효과**: 약 40줄 감소

---

### Phase 1 최종 목표

| 항목 | 현재 | 목표 | 감소 |
|-----|------|------|------|
| law-viewer.tsx | 4,566줄 | 3,976줄 | -590줄 (13%↓) |
| lib/law-viewer-modals.ts | - | 550줄 | 신규 |
| lib/law-viewer-helpers.ts | - | 40줄 | 신규 |

**리스크**: 매우 낮음 (순수 함수 분리, Props 전달 없음)

---

## 📋 Phase 2: 렌더링 블록 분리 (중간 난이도)

### 전제조건
Phase 1 완료 후 진행

### 목표
- **law-viewer.tsx**: 3,976 → 2,500줄 (37% 추가 감소)
- **소요 시간**: 2-3시간
- **리스크**: 15%

### 작업 내용

**핵심 아이디어**: JSX 전체를 분리하지 말고, **조건부 렌더링 블록만 분리**

#### 1. 관련 법령 목록 컴포넌트
```typescript
// components/law-viewer/related-articles-sidebar.tsx
export function RelatedArticlesSidebar({
  relatedArticles,
  onArticleClick
}: {
  relatedArticles: ParsedRelatedLaw[]
  onArticleClick: (lawName: string, jo: string, article: string) => void
}) {
  // JSX에서 "관련 법령 목록" 블록만 복사
}
```

#### 2. 조문 목록 사이드바
```typescript
// components/law-viewer/article-list-sidebar.tsx
export function ArticleListSidebar({
  articles,
  activeJo,
  favorites,
  isOrdinance,
  onArticleClick,
  onToggleFavorite
}: ArticleListSidebarProps) {
  // JSX에서 조문 목록 블록만 복사
}
```

#### 3. 조문 내용 패널
```typescript
// components/law-viewer/article-content-panel.tsx
export function ArticleContentPanel({
  article,
  fontSize,
  copied,
  onContentClick,
  onFontSizeChange,
  onCopy
}: ArticleContentPanelProps) {
  // JSX에서 조문 내용 블록만 복사
}
```

**law-viewer.tsx 수정**:
```typescript
return (
  <>
    <div className="...">
      {/* 기존 복잡한 JSX 대신 */}
      {aiAnswerMode ? (
        <RelatedArticlesSidebar
          relatedArticles={relatedArticles}
          onArticleClick={onRelatedArticleClick}
        />
      ) : (
        <ArticleListSidebar
          articles={loadedArticles}
          activeJo={activeJo}
          // ...
        />
      )}

      <ArticleContentPanel
        article={activeArticle}
        fontSize={fontSize}
        // ...
      />
    </div>
  </>
)
```

**예상 효과**: 약 1,500줄 감소

---

## 📋 Phase 3: Custom Hooks 분리 (선택사항)

Phase 2까지 완료 후 필요시 진행

### 분리 가능 Hooks
1. `useArticleNavigation` - handleArticleClick, swipe 로직
2. `useRevisionHistory` - 개정이력 관리
3. `useThreeTierComparison` - 3단 비교
4. `useAdminRulesManager` - 행정규칙 관리

---

## 🚀 실행 계획 (수정)

### Step 1: Modal 함수 분리 (30분)
```bash
# 1. 함수 라인 찾기
grep -n "openExternalLawArticleModal\|openRelatedLawModal\|openLawHierarchyModal\|openAdminRuleDetailModal" components/law-viewer.tsx

# 2. sed로 해당 라인 추출
sed -n 'START,ENDp' components/law-viewer.tsx > lib/law-viewer-modals.ts

# 3. export 추가 및 타입 정의
# 4. law-viewer.tsx에서 함수 제거 및 import 추가
# 5. 빌드 테스트
```

### Step 2: Helper 함수 분리 (15분)
```bash
# 동일한 방식으로 추출
```

### Step 3: 빌드 & 테스트 (15분)
```bash
npm run build
# 동작 확인
```

---

## ✅ 검증 체크리스트

### Phase 1 완료 후
- [ ] 빌드 성공 (npm run build)
- [ ] 타입 오류 없음
- [ ] 외부 법령 모달 열기
- [ ] 관련 법령 모달 열기
- [ ] 법령 체계도 모달 열기
- [ ] 행정규칙 상세 모달 열기
- [ ] 글씨 크기 조절
- [ ] 내용 복사
- [ ] 법제처에서 보기

---

## 📊 최종 목표

| Phase | law-viewer.tsx | 감소 | 리스크 |
|-------|----------------|------|--------|
| 현재 | 4,566줄 | - | - |
| Phase 1 | 3,976줄 | 13%↓ | 5% |
| Phase 2 | 2,500줄 | 45%↓ | 15% |
| Phase 3 | 1,800줄 | 61%↓ | 20% |

---

## 🔑 핵심 차이점 (V1 vs V2)

| 항목 | V1 (실패) | V2 (수정) |
|-----|----------|----------|
| 접근 | JSX 전체 분리 | 독립 함수부터 분리 |
| Props | 70개 수동 매핑 | 함수 파라미터만 (5-10개) |
| 파일 읽기 | 필요 (실패) | 불필요 (grep/sed 사용) |
| 테스트 | 마지막에 한번 | 각 단계마다 |
| 리스크 | 높음 (Props 누락) | 낮음 (순수 함수) |

---

**최종 업데이트**: 2025-11-23 16:00 KST
**상태**: Phase 1 준비 완료 (수정된 계획)
**다음 작업**: Modal 함수 분리
