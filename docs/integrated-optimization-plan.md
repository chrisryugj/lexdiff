# LexDiff 통합 최적화 실행 계획

**작성 일시**: 2025-11-20
**기반 문서**:
- `ai-view-cleanup-optimization-plan.md` (기존)
- `bmad-architect-full-project-analysis.md` (BMAD)
- `.bmad/stories/` (실행 스토리)

**목적**: 에러 위험을 최소화하면서 단계적으로 최적화 진행

---

## 🎯 핵심 원칙

### 1. 안전 우선 (Safety First)
- **낮은 리스크 작업부터 시작**
- 각 단계 후 빌드 확인 및 테스트
- 롤백 전략 사전 준비

### 2. 점진적 개선 (Incremental Improvement)
- 단번에 모든 것을 바꾸지 않음
- 각 Phase 완료 후 프로덕션 배포 가능 상태 유지
- 빠른 피드백 루프

### 3. 우선순위 기반 (Priority-Driven)
- **P0 (긴급)**: 즉시 효과 + 최소 리스크
- **P1 (높음)**: 큰 효과 + 중간 리스크
- **P2 (중간)**: 최대 효과 + 높은 리스크
- **P3 (낮음)**: 병렬 진행 + 장기 목표

---

## 📊 전체 로드맵 (12주)

```
Week 1: P0 Quick Wins (즉시 효과)
  ├─ Day 1-2: Dead Code 제거 (Story 001-004)
  └─ Day 3-5: API Layer 통합 (Story 005)

Week 2-3: P1 law-viewer 분할 (핵심 리팩토링)
  ├─ Phase 1-2: Hooks + UI 컴포넌트
  ├─ Phase 3: 복잡한 뷰 모드
  └─ Phase 4-6: 최적화 + 테스트

Week 1-12: P3 품질 개선 (병렬 진행)
  ├─ Week 4-5: TypeScript 오류 수정
  ├─ Week 6-7: 성능 최적화
  └─ Week 8-12: React + 접근성 + 테스트
```

---

## 🔴 P0: Quick Wins (Week 1, Day 1-2)

**목표**: 즉시 개선 가능한 부분 제거 → **최소 리스크, 즉시 효과**

### 작업 목록

| Story | 제목 | 시간 | 효과 | 리스크 |
|-------|------|------|------|--------|
| **001** | search-progress 파일 3개 삭제 | 1h | -942줄 | ⬜ 최소 |
| **002** | search-view.tsx 리네임 | 0.5h | -102줄 | ⬜ 최소 |
| **003** | Phase 5/6 코드 아카이브 | 1h | lib 정리 | ⬜ 최소 |
| **004** | Dependencies 정리 | 2h | -400KB | 🟨 낮음 |

**총 시간**: 4.5시간 (반나절)

### 실행 순서

```bash
# 1. Story 001: search-progress 파일 3개 삭제
cat .bmad/stories/001-delete-search-progress-files.md
# → 실행 후 빌드 확인

# 2. Story 002: search-view.tsx 리네임
cat .bmad/stories/002-delete-search-view-old.md
# → 실행 후 빌드 확인

# 3. Story 003: Phase 5/6 아카이브
cat .bmad/stories/003-archive-phase5-6-code.md
# → 실행 후 빌드 확인

# 4. Story 004: Dependencies 정리
cat .bmad/stories/004-cleanup-dependencies.md
# → 실행 후 빌드 + 기능 테스트
```

### 완료 조건

- [ ] `npm run build` 성공
- [ ] 검색 기능 정상 작동 (기본 검색 + File Search RAG)
- [ ] law-viewer 렌더링 정상
- [ ] 브라우저 콘솔 에러 없음
- [ ] 번들 크기 감소 확인

### 예상 효과

| 지표 | Before | After | 개선 |
|------|--------|-------|------|
| 코드 라인 | 33,348 | 31,908 | **-1,440줄** |
| 번들 크기 | 측정 필요 | -400KB | **-15%** (예상) |
| lib 파일 수 | 48개 | 43개 | -5개 |
| Dead Code | 4개 파일 | 0개 | **-100%** |

### 롤백 계획

```bash
# Git에서 복구
git checkout HEAD -- components/search-progress*.tsx
git checkout HEAD -- components/search-view*.tsx
git checkout HEAD -- lib/
git checkout HEAD -- package.json
```

---

## 🟡 P0: API Layer 통합 (Week 1, Day 3-5)

**목표**: 44개 API 라우트 정리 → **중간 리스크, 큰 효과**

### Story 005: LawAPIClient 생성 (8시간)

**참고**: `.bmad/stories/005-create-law-api-client.md`

#### Phase 1: LawAPIClient 클래스 생성 (4h)

```typescript
// lib/api/law-api-client.ts
export class LawAPIClient {
  async searchLaw(params: LawSearchParams): Promise<string>
  async getEflaw<T>(params: EflawParams): Promise<T>
  async getOldNew(params: OldNewParams): Promise<string>
  async getThreeTier<T>(params: ThreeTierParams): Promise<T>
  // ... 나머지 메서드
}
```

#### Phase 2: 2개 라우트에서 검증 (2h)

```typescript
// app/api/law-search/route.ts (Before: 40줄 → After: 25줄)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get("query")

  if (!query) {
    return NextResponse.json({ error: "검색어가 필요합니다" }, { status: 400 })
  }

  const client = getLawAPIClient()
  const xml = await client.searchLaw({ query })

  return new NextResponse(xml, { headers: { ... } })
}
```

**검증 API**:
- `/api/law-search` (XML)
- `/api/eflaw` (JSON)

#### Phase 3: 나머지 42개 라우트 마이그레이션 (2h)

**우선순위 순서**:
1. 자주 사용하는 API 우선 (law-search, eflaw, three-tier)
2. 중복 코드 많은 API (oldnew, hierarchy)
3. 나머지 API (ordin-search, admrul 등)

### 완료 조건

- [ ] LawAPIClient 클래스 생성
- [ ] lib/api/types.ts, errors.ts 생성
- [ ] 최소 2개 API 라우트 마이그레이션 및 테스트
- [ ] 빌드 성공
- [ ] 기존 기능 정상 작동

### 예상 효과

| 지표 | Before | After | 개선 |
|------|--------|-------|------|
| 중복 코드 | ~500줄 | 0줄 | **-100%** |
| API 라우트 평균 | 40줄 | 25줄 | **-38%** |
| 타입 안전성 | 낮음 | 높음 | - |
| 에러 처리 | 불일치 | 일관됨 | - |

### 롤백 계획

```bash
# LawAPIClient 제거
rm -rf lib/api

# 기존 API 라우트 복구
git checkout HEAD -- app/api/
```

### ⚠️ 주의사항

1. **환경변수 확인**: `LAW_OC` 필수
2. **XML vs JSON 응답**: 각 API의 응답 형식 정확히 파악
3. **점진적 마이그레이션**: 한 번에 2-3개 API만 변경
4. **기능 테스트**: 각 API 변경 후 실제 사용 시나리오 테스트

---

## 🟠 P1: law-viewer.tsx 분할 (Week 2-3)

**목표**: 3,060줄 → 9개 모듈 → **높은 리스크, 최대 효과**

### 통합 계획 (architect-report + ai-view 공유 컴포넌트)

| Phase | 작업 내용 | 시간 | 리스크 | 효과 |
|-------|---------|------|--------|------|
| **Phase 1** | Custom Hooks 추출 | 8h | 🟨 낮음 | State 분리 |
| **Phase 2** | UI + 공유 컴포넌트 | 16h | 🟧 중간 | 중복 -470줄 |
| **Phase 3** | 복잡한 뷰 모드 분리 | 16h | 🟥 높음 | Props -12개 |
| **Phase 4** | 성능 최적화 | 8h | 🟨 낮음 | 렌더링 개선 |
| **Phase 5** | 접근성 개선 | 6h | 🟨 낮음 | WCAG 준수 |
| **Phase 6** | 테스트 및 문서화 | 10h | 🟨 낮음 | 커버리지 80% |

**총 시간**: 64시간 (8일)

### ⚠️ 중요: 안전 장치

#### 1. 브랜치 전략

```bash
# Phase 시작 전 브랜치 생성
git checkout -b refactor/law-viewer-phase-1

# Phase 완료 후 PR 생성
gh pr create --title "refactor: law-viewer Phase 1 - Custom Hooks"

# 승인 후 main 병합
# 문제 발생 시 브랜치 삭제 및 롤백
```

#### 2. Feature Flag (선택)

```typescript
// lib/feature-flags.ts
export const FEATURE_FLAGS = {
  useLawViewerRefactored: process.env.NEXT_PUBLIC_LAW_VIEWER_REFACTORED === 'true'
}

// app/page.tsx
{FEATURE_FLAGS.useLawViewerRefactored ? (
  <LawViewerContainer {...props} />
) : (
  <LawViewer {...props} />  // 기존 버전
)}
```

#### 3. 각 Phase 후 체크리스트

- [ ] TypeScript 오류 0개
- [ ] 빌드 성공
- [ ] 기존 기능 100% 작동 (회귀 테스트)
- [ ] 성능 저하 없음 (Lighthouse)
- [ ] 코드 리뷰 승인

### Phase 1: Custom Hooks 추출 (8h) - 🟨 낮은 리스크

**목표**: 상태 관리 로직을 Hook으로 분리

#### 작업 상세

```typescript
// lib/hooks/use-article-navigation.ts
export function useArticleNavigation(options: Options) {
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

// lib/hooks/use-three-tier.ts
export function useThreeTier(options: Options) {
  const [delegationData, setDelegationData] = useState<ThreeTierData>()
  const [citationData, setCitationData] = useState<ThreeTierData>()
  const [isLoading, setIsLoading] = useState(false)

  // Fetch logic
  useEffect(() => {
    if (!options.enabled) return
    fetchThreeTierData()
  }, [options.lawId, options.activeJo])

  return { delegationData, citationData, isLoading, error }
}
```

**파일**:
- `lib/hooks/use-article-navigation.ts` (100줄)
- `lib/hooks/use-three-tier.ts` (150줄)

**테스트**:
```typescript
// lib/hooks/__tests__/use-article-navigation.test.ts
describe('useArticleNavigation', () => {
  it('should select article and scroll to it', () => {
    const { result } = renderHook(() => useArticleNavigation({ ... }))
    act(() => { result.current.handleSelectJo('003800') })
    expect(result.current.activeJo).toBe('003800')
  })
})
```

**롤백**: Hook 파일 삭제, law-viewer.tsx 복구

---

### Phase 2: UI + 공유 컴포넌트 추출 (16h) - 🟧 중간 리스크

**목표**: 뷰 관련 컴포넌트 + 중복 코드 제거

#### 2-1. 기본 UI 컴포넌트 (architect-report)

```typescript
// components/law-viewer/ArticleToolbar.tsx (200줄)
// components/law-viewer/ArticleTreeNav.tsx (280줄)
// components/law-viewer/ArticleContentView.tsx (300줄)
```

#### 2-2. 공유 컴포넌트 추출 (ai-view-cleanup)

**중복 코드 위치**:

| 컴포넌트 | 중복 위치 | 절감 |
|---------|---------|------|
| `TwoColumnLayout` | 4개 위치 | -180줄 |
| `ArticleCard` | 12개 위치 | -240줄 |
| `ArticleContent` | 11개 위치 | -50줄 |
| **합계** | | **-470줄 (84% ↓)** |

**구현**:

```typescript
// components/law-viewer/shared/TwoColumnLayout.tsx
export function TwoColumnLayout({ left, right, ratio = '1:1' }) {
  const gridCols = ratio === '1:1' ? 'grid-cols-2' :
                   ratio === '1:2' ? 'grid-cols-[1fr_2fr]' :
                   'grid-cols-[2fr_1fr]'

  return (
    <div className={`grid ${gridCols} gap-4`}>
      <div>{left}</div>
      <div>{right}</div>
    </div>
  )
}
```

**롤백**: 공유 컴포넌트 제거, 기존 중복 코드 복구

---

### Phase 3: 복잡한 뷰 모드 분리 (16h) - 🟥 높은 리스크

**목표**: AI 답변, 3-Tier 뷰 분리

#### 작업 상세

```typescript
// components/law-viewer/AIAnswerView.tsx (280줄)
interface AIAnswerViewProps {
  aiAnswer: AIAnswerData  // 7개 props → 1개 interface로 통합
  fontSize: number
  onCitationClick: (citation: Citation) => void
}

// components/law-viewer/ThreeTierView.tsx (300줄)
interface ThreeTierViewProps {
  activeJo: string
  meta: LawMeta
  onArticleClick: (tier: 'decree' | 'rule', jo: string) => void
}
```

**Props 정리 효과**:
- Before: 19개 props
- After: 7개 props
- **-63% 감소**

**롤백**: 새 컴포넌트 제거, LawViewer 원상 복구

### ⚠️ Phase 3 특별 주의사항

1. **기능 플래그 필수**: 새/구 버전 전환 가능하게
2. **단계별 검증**: AI 모드, 3-Tier 모드 각각 테스트
3. **프로덕션 배포 전 충분한 테스트**: 최소 2일 개발 환경 검증

---

### Phase 4-6: 최적화 + 테스트 (24h) - 🟨 낮은 리스크

**Phase 4: 성능 최적화** (8h)
- Code Splitting (React.lazy)
- React.memo 적용
- Virtual Scrolling (react-window)

**Phase 5: 접근성 개선** (6h)
- 키보드 네비게이션
- ARIA 속성 추가
- 포커스 관리

**Phase 6: 테스트 및 문서화** (10h)
- 단위 테스트 (Hook, 유틸리티)
- 통합 테스트 (시나리오)
- Component Specification 문서

---

## 🟢 P2: file-search-rag-view 정리 (독립 트랙, 1일)

**출처**: `ai-view-cleanup-optimization-plan.md` Part 1

### 작업 목록

| 항목 | 위치 | 제거 줄 수 |
|------|------|----------|
| progressStage 상태 | 30, 72, 93 | 3줄 |
| handleRelatedArticleClick | 237-344 | 107줄 |
| dummyMeta, dummyArticles | 46-52 | 7줄 |
| **합계** | | **~120줄** |

### 실행 시점

- **Week 1 (P0 완료 후)** 또는 **Week 2 (병렬)**
- 리스크: ⬜ 최소 (테스트 페이지만 영향)
- 독립적으로 진행 가능

---

## 🔵 P3: 프론트엔드 품질 개선 (병렬 트랙, 8주)

**출처**: `ai-view-cleanup-optimization-plan.md` Part 3

### Week 4-5: TypeScript 오류 수정 (P0)

**목표**: `ignoreBuildErrors: false` + 모든 오류 수정

#### Step 1: 오류 활성화 (1h)

```typescript
// next.config.mjs
typescript: {
  ignoreBuildErrors: false,  // ✅ 활성화
}
```

#### Step 2: 오류 분류 (2h)

```bash
npm run build 2>&1 | tee typescript-errors.log
```

**예상 오류 유형**:
- Type 1: `any` 사용 (50개)
- Type 2: null/undefined 체크 누락 (30개)
- Type 3: 타입 불일치 (20개)
- **총 100-200개**

#### Step 3: 오류 수정 (40h = 1주)

**우선순위**:
1. 빌드 블로킹 오류 (P0)
2. 타입 안전성 오류 (P1)
3. 스타일 오류 (P2)

**완료 조건**:
- [ ] `npm run build` 성공
- [ ] TypeScript 오류 0개
- [ ] `any` 사용 0개 (또는 명시적 주석)

---

### Week 6-7: 성능 최적화 (P1)

**목표**: Lighthouse 점수 > 90

#### 작업 목록

1. **Code Splitting** (8h)
   ```typescript
   const LawViewer = lazy(() => import('@/components/law-viewer'))
   const ComparisonModal = lazy(() => import('@/components/comparison-modal'))
   ```

2. **Image Optimization** (4h)
   ```typescript
   // next.config.mjs
   images: {
     unoptimized: false,  // ✅ 활성화
   }
   ```

3. **Bundle Analyzer** (2h)
   ```bash
   npm run build
   npx @next/bundle-analyzer
   ```

4. **Virtual Scrolling** (6h)
   - ArticleTreeNav에 react-window 적용
   - 조문 1000개 이상 시 성능 개선

**목표 지표**:
- 초기 로드: < 2초
- FCP: < 1.5초
- LCP: < 2.5초
- Lighthouse Performance: > 90

---

### Week 8-12: React + 접근성 + 테스트 (P2-P3)

**Week 8-9: React 최적화**
- React.memo 적용
- useMemo, useCallback 최적화
- 불필요한 리렌더링 제거

**Week 10: 접근성 개선**
- WCAG 2.1 AA 준수
- 키보드 네비게이션
- ARIA 레이블

**Week 11-12: 테스트 및 문서화**
- Vitest 설정
- 유틸리티 함수 테스트 (80% 커버리지)
- Component Specification 문서

---

## 📊 예상 총 효과 (12주 완료 시)

### 코드 품질

| 지표 | Before | After Quick Wins | After Full | 개선율 |
|------|--------|-----------------|------------|--------|
| 총 코드 라인 | 33,348 | 31,908 (-4%) | ~28,000 | **-16%** |
| 평균 파일 크기 | 300줄 | 280줄 | 150줄 | **-50%** |
| law-viewer.tsx | 3,060줄 | 3,060줄 | ~340줄 | **-89%** |
| 중복 코드 | ~1,000줄 | ~60줄 | ~60줄 | **-94%** |
| Dead Code | 4개 파일 | 0개 | 0개 | **-100%** |

### 성능

| 지표 | Before | After | 개선 |
|------|--------|-------|------|
| 번들 크기 | 측정 필요 | < 900KB | **-64%** (예상) |
| 초기 로딩 | 측정 필요 | < 2초 | **-60%** (예상) |
| Lighthouse 성능 | 측정 필요 | > 90 | - |
| TypeScript 오류 | 100-200개 | 0개 | **-100%** |

### 유지보수성

| 지표 | Before | After |
|------|--------|-------|
| 컴포넌트 책임 | 불명확 (13개 혼재) | 명확 (1개/컴포넌트) |
| Props 수 (law-viewer) | 19개 | 7개 (-63%) |
| State 수 (law-viewer) | 14개 | 5개 (-64%) |
| Props Drilling | 3단계 | 1단계 (Context) |
| 테스트 커버리지 | 0% | > 60% |
| 접근성 | 체크 없음 | WCAG 2.1 AA |

---

## ✅ 실행 체크리스트

### Week 1: Quick Wins

- [ ] **Day 1**: Story 001-002 실행 (Dead Code 제거)
  - [ ] search-progress 3개 파일 삭제
  - [ ] search-view.tsx 리네임
  - [ ] 빌드 성공 확인
  - [ ] 기능 테스트 (검색, law-viewer)

- [ ] **Day 2**: Story 003-004 실행
  - [ ] Phase 5/6 코드 아카이브
  - [ ] Dependencies 정리
  - [ ] 빌드 성공 확인
  - [ ] 번들 크기 측정

- [ ] **Day 3-5**: Story 005 실행 (API Layer)
  - [ ] LawAPIClient 클래스 생성
  - [ ] 2개 API 검증
  - [ ] 나머지 API 마이그레이션
  - [ ] 통합 테스트

- [ ] **Week 1 완료 후**:
  - [ ] 프로덕션 배포
  - [ ] 성능 측정 (기준선)
  - [ ] 사용자 피드백 수집

### Week 2-3: law-viewer 분할

- [ ] **Phase 1**: Custom Hooks (2일)
  - [ ] use-article-navigation.ts
  - [ ] use-three-tier.ts
  - [ ] 테스트 작성
  - [ ] law-viewer에서 사용

- [ ] **Phase 2**: UI + 공유 컴포넌트 (4일)
  - [ ] ArticleToolbar, ArticleTreeNav
  - [ ] TwoColumnLayout, ArticleCard (중복 제거)
  - [ ] 통합 테스트

- [ ] **Phase 3**: 복잡한 뷰 모드 (4일)
  - [ ] AIAnswerView
  - [ ] ThreeTierView
  - [ ] Feature Flag 설정
  - [ ] A/B 테스트

- [ ] **Phase 4-6**: 최적화 (4일)
  - [ ] 성능, 접근성, 테스트
  - [ ] 문서화
  - [ ] 프로덕션 배포

### Week 4-12: 품질 개선 (병렬)

- [ ] **Week 4-5**: TypeScript 오류 수정
- [ ] **Week 6-7**: 성능 최적화
- [ ] **Week 8-9**: React 최적화
- [ ] **Week 10**: 접근성 개선
- [ ] **Week 11-12**: 테스트 및 문서화

---

## 🚨 리스크 관리

### 높은 리스크 작업

| 작업 | 리스크 수준 | 완화 전략 |
|------|-----------|----------|
| law-viewer Phase 3 | 🟥 높음 | Feature Flag + A/B 테스트 |
| TypeScript 오류 수정 | 🟧 중간 | 점진적 수정 + 빌드 모니터링 |
| API Layer 통합 | 🟧 중간 | 2개 API 검증 후 확장 |
| Dependencies 정리 | 🟨 낮음 | 사용 여부 확인 필수 |
| Dead Code 제거 | 🟨 최소 | import 검색으로 확인 |

### 롤백 트리거

**즉시 롤백 조건**:
1. 빌드 실패가 30분 이상 해결 안됨
2. 핵심 기능 (검색, law-viewer) 작동 안됨
3. 성능 10% 이상 저하
4. 프로덕션 에러율 5% 이상 증가

**롤백 절차**:
```bash
# 1. 이전 커밋으로 복구
git revert HEAD

# 2. 또는 브랜치 삭제
git checkout main
git branch -D refactor/law-viewer-phase-3

# 3. Feature Flag로 비활성화
NEXT_PUBLIC_LAW_VIEWER_REFACTORED=false
```

---

## 📝 다음 단계

1. **Week 1 시작**: Story 001 실행
   ```
   "Story 001을 실행해줘. 완료 조건을 체크하면서 진행해줘."
   ```

2. **성공 후 진행**: Story 002 → 003 → 004 → 005

3. **Week 2 준비**: law-viewer Phase 1 계획 상세화

---

**문서 버전**: 1.0 (통합 최종)
**작성자**: Claude Code (BMAD Integration Specialist)
**최종 업데이트**: 2025-11-20
**승인 필요**: ✅ 팀 리뷰 후 실행
