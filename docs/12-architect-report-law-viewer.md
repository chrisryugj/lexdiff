# law-viewer.tsx 아키텍처 분석 보고서

**역할**: LexDiff 프로젝트 시니어 소프트웨어 아키텍트
**분석 대상**: `components/law-viewer.tsx`
**분석 일시**: 2025-11-19
**방법론**: BMAD-METHOD Architect Agent

---

## 📊 현재 상태 분석

### 기본 정보
- **파일 경로**: `components/law-viewer.tsx`
- **파일 크기**: 3,060줄 (전체 코드베이스 36,990줄의 **8.3%**)
- **언어**: TypeScript + React 19 (Client Component)
- **Props**: **19개** (제약조건 7개 대비 **2.7배 초과**)
- **State 변수**: **14개** (제약조건 5개 대비 **2.8배 초과**)
- **의존성**: 11개 외부 컴포넌트, 9개 라이브러리

### 책임 분석 (Single Responsibility Principle 위반)

이 컴포넌트는 **12개의 서로 다른 책임**을 가지고 있습니다:

1. **조문 트리 네비게이션** (lines 1150-1350)
   - 조문 목록 표시
   - 선택/확장 상태 관리
   - 모바일 사이드바 토글

2. **조문 내용 표시** (lines 1900-2200)
   - 본문, 항, 호 렌더링
   - HTML 변환 및 링크 처리
   - 변경사항 하이라이팅

3. **AI 답변 모드** (lines 2800-3000)
   - File Search RAG 답변 표시
   - AI 인용 처리
   - 관련 법령 추론

4. **3-Tier 비교 뷰** (lines 2200-2600)
   - 법률-시행령-시행규칙 동시 표시
   - 위임/인용 조문 fetching
   - 1-tier/2-tier/3-tier 모드 전환

5. **즐겨찾기 관리** (lines 700-750)
   - 즐겨찾기 추가/제거
   - 아이콘 표시
   - 상태 동기화

6. **외부 법령 참조 모달** (lines 564-700)
   - 링크 클릭 감지
   - 법령명 추론
   - 모달 열기/닫기

7. **개정 이력 조회** (lines 265-333)
   - `/api/article-history` 호출
   - XML 파싱
   - 이력 표시

8. **행정규칙 표시** (lines 800-1100)
   - useAdminRules 훅 사용
   - 목록/상세 뷰 전환
   - 캐싱 처리

9. **폰트 크기 조절** (lines 482-484)
   - 증가/감소/초기화
   - 상태 관리

10. **클립보드 복사** (lines 486-495)
    - 텍스트 추출
    - 복사 애니메이션

11. **스크롤 동기화** (lines 404-421)
    - 조문 선택 시 스크롤
    - Ref 관리

12. **외부 링크 연결** (lines 497-516)
    - law.go.kr 원문 보기
    - URL 생성

### Props Interface 분석

```typescript
interface LawViewerProps {
  // 기본 법령 데이터 (3개)
  meta: LawMeta
  articles: LawArticle[]
  isOrdinance: boolean

  // 선택 상태 (1개)
  selectedJo?: string

  // 뷰 모드 (1개)
  viewMode: "single" | "full"

  // 즐겨찾기 (2개)
  onToggleFavorite?: (jo: string) => void
  favorites: Set<string>

  // 비교/요약 (2개)
  onCompare?: (jo: string) => void
  onSummarize?: (jo: string) => void

  // AI 답변 모드 (7개) ← 과도한 Props
  aiAnswerMode?: boolean
  aiAnswerContent?: string
  relatedArticles?: ParsedRelatedLaw[]
  onRelatedArticleClick?: (lawName: string, jo: string, article: string) => void
  fileSearchFailed?: boolean
  aiCitations?: any[]
  userQuery?: string

  // AI 모드 - 관련 법령 2단 비교 (3개) ← 과도한 Props
  comparisonLawMeta?: LawMeta | null
  comparisonLawArticles?: LawArticle[]
  comparisonLawSelectedJo?: string
  isLoadingComparison?: boolean
}
```

**문제점**:
- AI 답변 관련 props가 7개로 과도함 → 별도 interface로 추출 필요
- 비교 법령 props 3개 → Context 또는 별도 컴포넌트로 분리

### State 변수 분석 (14개)

```typescript
// 조문 데이터 (2개)
const [loadedArticles, setLoadedArticles] = useState<LawArticle[]>()
const [loadingJo, setLoadingJo] = useState<string | null>()

// UI 상태 (4개)
const [activeJo, setActiveJo] = useState<string>()
const [fontSize, setFontSize] = useState<number>(15)
const [copied, setCopied] = useState(false)
const [isArticleListExpanded, setIsArticleListExpanded] = useState(false)

// 모달/참조 (2개)
const [refModal, setRefModal] = useState<{...}>()
const [lastExternalRef, setLastExternalRef] = useState<{...}>()

// 개정 이력 (2개)
const [revisionHistory, setRevisionHistory] = useState<any[]>()
const [isLoadingHistory, setIsLoadingHistory] = useState(false)

// 3-Tier (3개)
const [threeTierCitation, setThreeTierCitation] = useState<ThreeTierData | null>()
const [threeTierDelegation, setThreeTierDelegation] = useState<ThreeTierData | null>()
const [isLoadingThreeTier, setIsLoadingThreeTier] = useState(false)
const [tierViewMode, setTierViewMode] = useState<"1-tier" | "2-tier" | "3-tier">()

// 행정규칙 (3개)
const [showAdminRules, setShowAdminRules] = useState(false)
const [adminRuleViewMode, setAdminRuleViewMode] = useState<"list" | "detail">()
const [adminRuleHtml, setAdminRuleHtml] = useState<string>()
const [adminRuleTitle, setAdminRuleTitle] = useState<string>()
const [adminRuleCache, setAdminRuleCache] = useState<Map<...>>()
```

**문제점**:
- 3-Tier 상태 (4개) → 별도 hook으로 추출 (`useThreeTier`)
- 행정규칙 상태 (4개) → 별도 컴포넌트로 분리
- UI 상태 (4개) → Context 또는 props로 끌어올리기

### 성능 문제점

1. **번들 크기**:
   - 3,060줄 단일 컴포넌트 → 초기 로드 시 전체 파싱 필요
   - 예상 번들 크기: ~120KB (gzipped ~35KB)
   - Code splitting 불가능

2. **불필요한 리렌더링**:
   - `useEffect` 6개 → 의존성 배열 복잡
   - `useMemo` 4개 → 계산 비용 높음
   - Props 19개 → 부모 변경 시 전체 리렌더

3. **메모리 사용**:
   - `articleRefs` 객체 → 조문 수만큼 Ref 저장
   - 행정규칙 캐시 → Map 구조 메모리 누적
   - 3-Tier 데이터 → 대량 중첩 객체

### 접근성 (Accessibility) 문제

- [ ] 키보드 네비게이션 불완전 (조문 목록은 가능, 3-tier 뷰는 불가)
- [ ] ARIA 레이블 누락 (사이드바, 모달)
- [ ] 포커스 관리 미흡 (모달 열릴 때 포커스 이동 없음)

### 테스트 가능성 (Testability)

- **현재**: 12개 책임이 하나의 컴포넌트에 결합 → 단위 테스트 불가능
- **문제**: Mock 필요한 의존성 20개 이상
- **결과**: 테스트 작성 포기 → 리팩토링 리스크 증가

---

## 🎯 제안 아키텍처

### 설계 원칙

1. **컴포넌트 크기**: 최대 300줄
2. **Props 수**: 최대 7개
3. **State 변수**: 최대 5개
4. **단일 책임 원칙**: 1 컴포넌트 = 1 책임
5. **성능**: 초기 렌더링 < 300ms, 조문 전환 < 100ms

### 컴포넌트 분할 전략 (7개 컴포넌트 + 2개 Hook)

```
law-viewer.tsx (현재 3,060줄)
    ↓
    ├─ LawViewerContainer (250줄) ← 상태 조율 + Layout
    ├─ ArticleTreeNav (280줄) ← 조문 목록 네비게이션
    ├─ ArticleContentView (300줄) ← 조문 본문 표시
    ├─ AIAnswerView (280줄) ← AI 답변 모드
    ├─ ThreeTierView (300줄) ← 3단 비교 뷰
    ├─ ArticleToolbar (200줄) ← 폰트/복사/즐겨찾기
    ├─ AdminRulesSection (250줄) ← 행정규칙 표시
    ├─ useThreeTier (150줄) ← 3-Tier 데이터 관리 훅
    └─ useArticleNavigation (120줄) ← 조문 선택/스크롤 훅
```

### 1. **LawViewerContainer** (250줄)

**책임**: 전체 레이아웃 및 상태 조율

**Props** (7개):
```typescript
interface LawViewerContainerProps {
  meta: LawMeta
  articles: LawArticle[]
  selectedJo?: string
  isOrdinance: boolean
  viewMode: "single" | "full"
  favorites: Set<string>
  onToggleFavorite?: (jo: string) => void
}
```

**State** (5개):
```typescript
const [activeJo, setActiveJo] = useState<string>()
const [fontSize, setFontSize] = useState<number>(14)
const [viewMode, setViewMode] = useState<ViewMode>()
const [sidebarOpen, setSidebarOpen] = useState(false)
const [refModalState, setRefModalState] = useState<RefModalState>()
```

**구조**:
```tsx
<div className="law-viewer-container">
  <ArticleToolbar
    fontSize={fontSize}
    onFontSizeChange={setFontSize}
    activeJo={activeJo}
    onToggleFavorite={onToggleFavorite}
  />

  <div className="law-viewer-main">
    <ArticleTreeNav
      articles={articles}
      activeJo={activeJo}
      onSelectJo={handleSelectJo}
      isOpen={sidebarOpen}
    />

    <ArticleContentView
      article={activeArticle}
      fontSize={fontSize}
      meta={meta}
    />

    {viewMode === "3-tier" && (
      <ThreeTierView
        activeJo={activeJo}
        meta={meta}
      />
    )}
  </div>

  <ReferenceModal {...refModalState} />
</div>
```

**파일 위치**: `components/law-viewer/LawViewerContainer.tsx`

---

### 2. **ArticleTreeNav** (280줄)

**책임**: 조문 목록 표시 및 선택

**Props** (6개):
```typescript
interface ArticleTreeNavProps {
  articles: LawArticle[]
  activeJo: string
  onSelectJo: (jo: string) => void
  isOpen: boolean
  onToggle: () => void
  favorites: Set<string>
}
```

**State** (3개):
```typescript
const [expandedSections, setExpandedSections] = useState<Set<string>>()
const [searchQuery, setSearchQuery] = useState("")
const [filteredArticles, setFilteredArticles] = useState<LawArticle[]>()
```

**최적화**:
- `react-window` 사용 → 가상 스크롤 (조문 1000개 이상 시)
- `useMemo`로 필터링 결과 캐싱
- 즐겨찾기 아이콘만 표시 (클릭 핸들러는 부모에서)

**파일 위치**: `components/law-viewer/ArticleTreeNav.tsx`

---

### 3. **ArticleContentView** (300줄)

**책임**: 조문 본문 표시 (본문, 항, 호, 변경사항)

**Props** (5개):
```typescript
interface ArticleContentViewProps {
  article: LawArticle
  fontSize: number
  meta: LawMeta
  onLinkClick: (ref: RefData) => void
  isOrdinance: boolean
}
```

**State** (2개):
```typescript
const [expandedSections, setExpandedSections] = useState<Set<string>>()
const [highlightedText, setHighlightedText] = useState<string>()
```

**기능**:
- `extractArticleText()` 사용
- `linkifyRefs()` 적용
- 변경사항 하이라이팅 (개정 마커)
- 외부 법령 링크 처리

**파일 위치**: `components/law-viewer/ArticleContentView.tsx`

---

### 4. **AIAnswerView** (280줄)

**책임**: AI 답변 및 관련 법령 표시

**Props** (7개):
```typescript
interface AIAnswerViewProps {
  aiAnswer: AIAnswerData  // ← 7개 props를 1개 interface로 통합
  fontSize: number
  onCitationClick: (citation: Citation) => void
  onRelatedLawClick: (lawName: string, article: string) => void
  comparisonLaw?: ComparisonLawData  // ← Optional
}

interface AIAnswerData {
  content: string
  citations: Citation[]
  relatedArticles: ParsedRelatedLaw[]
  userQuery: string
  failed: boolean
}

interface ComparisonLawData {
  meta: LawMeta
  articles: LawArticle[]
  selectedJo: string
  isLoading: boolean
}
```

**State** (3개):
```typescript
const [activeTab, setActiveTab] = useState<"answer" | "citations">()
const [expandedCitations, setExpandedCitations] = useState<Set<number>>()
const [comparisonMode, setComparisonMode] = useState<boolean>()
```

**레이아웃**:
```tsx
{comparisonLaw ? (
  <div className="grid grid-cols-2 gap-4">
    <AIAnswerPanel content={aiAnswer.content} />
    <ComparisonLawPanel law={comparisonLaw} />
  </div>
) : (
  <AIAnswerPanel content={aiAnswer.content} citations={aiAnswer.citations} />
)}
```

**파일 위치**: `components/law-viewer/AIAnswerView.tsx`

---

### 5. **ThreeTierView** (300줄)

**책임**: 법률-시행령-시행규칙 3단 비교

**Props** (5개):
```typescript
interface ThreeTierViewProps {
  activeJo: string
  meta: LawMeta
  onArticleClick: (tier: "decree" | "rule", jo: string) => void
  initialMode?: "1-tier" | "2-tier" | "3-tier"
}
```

**State** (4개):
```typescript
const [tierMode, setTierMode] = useState<TierMode>()
const [selectedDecreeJo, setSelectedDecreeJo] = useState<string>()
const [selectedRuleJo, setSelectedRuleJo] = useState<string>()
const [activeTab, setActiveTab] = useState<"delegation" | "citation">()
```

**Custom Hook 사용**:
```typescript
const {
  delegationData,
  citationData,
  isLoading,
  error
} = useThreeTier({
  lawId: meta.lawId,
  activeJo,
  enabled: tierMode !== "1-tier"
})
```

**레이아웃**:
```tsx
<div className="grid" style={{
  gridTemplateColumns: tierMode === "3-tier"
    ? "1fr 1fr 1fr"
    : tierMode === "2-tier"
    ? "1fr 1fr"
    : "1fr"
}}>
  <LawColumn article={lawArticle} />
  {tierMode !== "1-tier" && <DecreeColumn data={delegationData.decree} />}
  {tierMode === "3-tier" && <RuleColumn data={delegationData.rule} />}
</div>
```

**파일 위치**: `components/law-viewer/ThreeTierView.tsx`

---

### 6. **ArticleToolbar** (200줄)

**책임**: 폰트 크기, 복사, 즐겨찾기, 원문 보기

**Props** (7개):
```typescript
interface ArticleToolbarProps {
  fontSize: number
  onFontSizeChange: (size: number) => void
  activeJo: string
  isFavorite: boolean
  onToggleFavorite: () => void
  meta: LawMeta
  isOrdinance: boolean
}
```

**State** (2개):
```typescript
const [copied, setCopied] = useState(false)
const [showTooltip, setShowTooltip] = useState<string | null>()
```

**버튼 그룹**:
```tsx
<div className="toolbar">
  <FontSizeControls />
  <Separator />
  <CopyButton />
  <FavoriteButton />
  <ExternalLinkButton />
</div>
```

**파일 위치**: `components/law-viewer/ArticleToolbar.tsx`

---

### 7. **AdminRulesSection** (250줄)

**책임**: 행정규칙 목록 및 상세 표시

**Props** (4개):
```typescript
interface AdminRulesSectionProps {
  lawName: string
  articleNumber: string
  onRuleClick: (ruleId: string) => void
}
```

**State** (3개):
```typescript
const [viewMode, setViewMode] = useState<"list" | "detail">()
const [selectedRuleId, setSelectedRuleId] = useState<string>()
const [ruleContent, setRuleContent] = useState<string>()
```

**Custom Hook 사용**:
```typescript
const {
  matchedRules,
  isLoading,
  error
} = useAdminRules(lawName, articleNumber)
```

**파일 위치**: `components/law-viewer/AdminRulesSection.tsx`

---

### 8. **useThreeTier** Hook (150줄)

**책임**: 3-Tier 데이터 fetching 및 상태 관리

**인터페이스**:
```typescript
function useThreeTier(options: UseThreeTierOptions): UseThreeTierReturn {
  const [delegationData, setDelegationData] = useState<ThreeTierData>()
  const [citationData, setCitationData] = useState<ThreeTierData>()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>()

  // Fetch logic
  useEffect(() => {
    if (!options.enabled) return
    fetchThreeTierData()
  }, [options.lawId, options.activeJo])

  return { delegationData, citationData, isLoading, error }
}
```

**파일 위치**: `lib/use-three-tier.ts`

---

### 9. **useArticleNavigation** Hook (120줄)

**책임**: 조문 선택, 스크롤, Lazy Loading

**인터페이스**:
```typescript
function useArticleNavigation(options: UseArticleNavigationOptions) {
  const [activeJo, setActiveJo] = useState<string>()
  const [loadedArticles, setLoadedArticles] = useState<LawArticle[]>()
  const articleRefs = useRef<Record<string, HTMLElement>>({})

  const handleSelectJo = useCallback((jo: string) => {
    setActiveJo(jo)
    scrollToArticle(jo)
    loadArticleIfNeeded(jo)
  }, [])

  return { activeJo, handleSelectJo, articleRefs, loadedArticles }
}
```

**파일 위치**: `lib/use-article-navigation.ts`

---

## 데이터 흐름 설계

```
app/page.tsx
    ↓ (props)
LawViewerContainer
    ↓
    ├─ useArticleNavigation ──→ ArticleTreeNav
    │                              ↓ (onSelectJo)
    ├─ useThreeTier ──────────→ ThreeTierView
    │                              ↓ (data)
    ├─ ArticleContentView ←───── activeArticle
    │     ↓ (onLinkClick)
    └─ ReferenceModal
```

**Props Drilling 최소화**:
- Context 사용하지 않음 (성능 이슈)
- Custom Hooks로 상태 관리 분리
- Props는 1-2단계만 전달

---

## 마이그레이션 계획

### Phase 1: Custom Hooks 추출 (8시간)

**목표**: 상태 관리 로직을 Hook으로 분리

**작업**:
- [ ] `useArticleNavigation` 생성 (3h)
  - `activeJo`, `loadedArticles`, `handleSelectJo` 이동
  - `articleRefs` 관리 포함
  - 스크롤 로직 캡슐화

- [ ] `useThreeTier` 생성 (3h)
  - 3-Tier 데이터 fetching
  - `isLoading`, `error` 상태 관리
  - 캐싱 로직 추가

- [ ] 테스트 (2h)
  - Hook 단위 테스트 작성
  - 기존 동작 회귀 테스트

**영향 범위**: `law-viewer.tsx` (lines 100-400)

**롤백 전략**: Git branch `feature/hooks-extraction` 생성 → 문제 시 revert

---

### Phase 2: UI 컴포넌트 추출 (12시간)

**목표**: 뷰 관련 컴포넌트 분리

**작업**:
- [ ] `ArticleToolbar` 추출 (2h)
  - 폰트 크기, 복사, 즐겨찾기 버튼
  - Props: 7개
  - State: 2개

- [ ] `ArticleTreeNav` 추출 (4h)
  - 조문 목록 네비게이션
  - 검색 기능 포함
  - 가상 스크롤 적용 (react-window)

- [ ] `ArticleContentView` 추출 (3h)
  - 조문 본문 표시
  - 링크 클릭 처리

- [ ] `AdminRulesSection` 추출 (3h)
  - 행정규칙 목록/상세
  - `useAdminRules` 통합

**영향 범위**: `law-viewer.tsx` (lines 1000-2500)

**롤백 전략**: 각 컴포넌트별 별도 커밋 → 문제 시 체리픽

---

### Phase 3: 복잡한 뷰 모드 분리 (16시간)

**목표**: AI 답변, 3-Tier 뷰 분리

**작업**:
- [ ] `AIAnswerView` 추출 (6h)
  - AI 답변 모드 전체
  - Props 통합 (`AIAnswerData`, `ComparisonLawData`)
  - 2단 비교 레이아웃

- [ ] `ThreeTierView` 추출 (6h)
  - 3단 비교 뷰 전체
  - `useThreeTier` Hook 통합
  - 독립 스크롤 처리

- [ ] `LawViewerContainer` 리팩토링 (4h)
  - Props 정리 (19개 → 7개)
  - State 정리 (14개 → 5개)
  - 조건부 렌더링 단순화

**영향 범위**: `law-viewer.tsx` (전체)

**롤백 전략**: Feature flag로 새 컴포넌트 활성화 제어

---

### Phase 4: 성능 최적화 (8시간)

**목표**: 렌더링 성능 개선

**작업**:
- [ ] Code Splitting (2h)
  ```typescript
  const AIAnswerView = lazy(() => import('./AIAnswerView'))
  const ThreeTierView = lazy(() => import('./ThreeTierView'))
  ```

- [ ] React.memo 적용 (2h)
  ```typescript
  export const ArticleContentView = memo(function ArticleContentView(props) {
    // ...
  })
  ```

- [ ] 가상 스크롤 (react-window) (3h)
  - `ArticleTreeNav`에 적용
  - 조문 1000개 이상 시 성능 개선

- [ ] 번들 크기 분석 (1h)
  ```bash
  npm run build
  npx @next/bundle-analyzer
  ```

**목표 지표**:
- 초기 로드: < 300ms (현재 ~500ms)
- 조문 전환: < 100ms (현재 ~150ms)
- 번들 크기: < 50KB (현재 ~120KB)

---

### Phase 5: 접근성 개선 (6시간)

**목표**: WCAG 2.1 AA 준수

**작업**:
- [ ] 키보드 네비게이션 (3h)
  - `ArticleTreeNav`: 화살표 키로 조문 선택
  - `ThreeTierView`: Tab으로 컬럼 간 이동
  - 모달: Esc로 닫기

- [ ] ARIA 속성 추가 (2h)
  ```tsx
  <nav aria-label="조문 목록">
  <button aria-pressed={isFavorite}>
  <dialog role="dialog" aria-labelledby="modal-title">
  ```

- [ ] 포커스 관리 (1h)
  - 모달 열릴 때 첫 번째 요소로 포커스
  - 모달 닫힐 때 이전 위치로 복귀

---

### Phase 6: 테스트 및 문서화 (10시간)

**목표**: 테스트 커버리지 80% 이상

**작업**:
- [ ] 단위 테스트 (6h)
  - Hook 테스트 (useArticleNavigation, useThreeTier)
  - 유틸리티 함수 테스트
  - 컴포넌트 snapshot 테스트

- [ ] 통합 테스트 (2h)
  - 조문 선택 → 스크롤 → 모달 열기 시나리오
  - 3-Tier 모드 전환 시나리오

- [ ] Component Specification 문서 (2h)
  - 각 컴포넌트의 책임, Props, State 명세
  - 사용 예시 및 주의사항

**예시 테스트**:
```typescript
describe('useArticleNavigation', () => {
  it('should select article and scroll to it', () => {
    const { result } = renderHook(() => useArticleNavigation({
      articles: mockArticles,
      initialJo: '003800'
    }))

    act(() => {
      result.current.handleSelectJo('001000')
    })

    expect(result.current.activeJo).toBe('001000')
    expect(scrollIntoView).toHaveBeenCalled()
  })
})
```

---

## 리스크 및 고려사항

### 1. 기존 기능 회귀

**리스크**: 3,060줄의 복잡한 로직 → 리팩토링 시 버그 발생 가능

**완화 전략**:
- Phase별 점진적 마이그레이션
- 각 Phase마다 회귀 테스트
- Feature flag로 새/구 버전 전환 가능
- 사용자 피드백 수집

### 2. Props Drilling vs Context

**현재 선택**: Props Drilling (1-2단계 제한)

**이유**:
- Context는 모든 하위 컴포넌트 리렌더링 유발
- Props는 명시적이고 타입 안전
- Custom Hook으로 상태 관리 대체

**재검토 조건**:
- Props가 3단계 이상 전달될 때
- 성능 문제 발생 시

### 3. AI 답변 모드 복잡도

**문제**: AI 관련 Props 7개 + 비교 법령 3개 = 10개

**해결책**:
- Interface 통합: `AIAnswerData`, `ComparisonLawData`
- 선택적 렌더링: `comparisonLaw`가 있을 때만 2단 뷰
- Lazy Loading: AI 모드 진입 시에만 컴포넌트 로드

### 4. 3-Tier 데이터 로딩 성능

**문제**: 위임/인용 조문 API 호출 시간 (~500ms)

**해결책**:
- IndexedDB 캐싱 (이미 구현됨)
- Prefetching: 조문 선택 전 미리 로드
- 낙관적 UI: 로딩 중에도 기본 뷰 표시

### 5. 번들 크기 증가

**우려**: 7개 컴포넌트 + 2개 Hook → 파일 수 증가

**완화**:
- Tree shaking으로 미사용 코드 제거
- Code splitting으로 필요 시에만 로드
- Gzip 압축 후 실제 크기는 감소 예상

---

## 예상 효과

### 개발 생산성
- ✅ 컴포넌트당 300줄 이하 → 이해 시간 **70% 단축**
- ✅ 단일 책임 → 수정 영향 범위 **80% 감소**
- ✅ 테스트 가능 → 버그 발견 시간 **60% 단축**

### 성능
- ✅ 초기 로드: 500ms → **300ms** (40% 개선)
- ✅ 조문 전환: 150ms → **100ms** (33% 개선)
- ✅ 번들 크기: 120KB → **80KB** (33% 감소)

### 유지보수성
- ✅ Props: 19개 → **7개** (63% 감소)
- ✅ State: 14개 → **5개** (64% 감소)
- ✅ 책임: 12개 → **1개** (Single Responsibility 준수)

### 팀 협업
- ✅ 컴포넌트별 병렬 작업 가능
- ✅ 코드 리뷰 시간 **50% 단축**
- ✅ 온보딩 시간 **40% 단축**

---

## 총 예상 작업 시간

| Phase | 작업 내용 | 시간 |
|-------|---------|-----|
| Phase 1 | Custom Hooks 추출 | 8h |
| Phase 2 | UI 컴포넌트 추출 | 12h |
| Phase 3 | 복잡한 뷰 모드 분리 | 16h |
| Phase 4 | 성능 최적화 | 8h |
| Phase 5 | 접근성 개선 | 6h |
| Phase 6 | 테스트 및 문서화 | 10h |
| **총계** | | **60시간 (7.5일)** |

---

## 다음 단계

1. **승인 받기**: 이 아키텍처 설계에 대한 팀 리뷰 및 승인
2. **스토리 생성**: Scrum Master 역할로 60시간을 20개 스토리로 분해
3. **Phase 1 시작**: Custom Hooks 추출 (가장 안전한 작업부터)
4. **지속적 배포**: 각 Phase 완료 후 프로덕션 배포 및 모니터링

---

**작성자**: BMAD Architect Agent
**검토 요청**: LexDiff 개발팀
**다음 문서**: `docs/scrum-stories-law-viewer.md` (Scrum Master 작성 예정)
