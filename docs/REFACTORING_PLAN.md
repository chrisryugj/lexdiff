# 대형 파일 리팩토링 계획서

**작성일**: 2025-11-23
**목표**: law-viewer.tsx, search-result-view.tsx 파일 크기 최적화
**전략**: 최소 영향 원칙 (기존 동작 100% 보존)

---

## 📊 현황 분석

### 대상 파일
| 파일 | 현재 줄 수 | 목표 줄 수 | 감소율 |
|-----|-----------|-----------|--------|
| `components/law-viewer.tsx` | 4,566줄 | 1,000줄 | 78%↓ |
| `components/search-result-view.tsx` | 2,391줄 | 1,800줄 | 25%↓ |
| **합계** | **6,957줄** | **2,800줄** | **60%↓** |

### 주요 문제점
- **law-viewer.tsx**: 70개 이상의 hooks/state, 3,059줄의 JSX, 복잡한 이벤트 핸들러
- **search-result-view.tsx**: 21개의 상태, API 로직과 UI가 혼재

---

## 🎯 리팩토링 전략

### 핵심 원칙
1. **로직 분리 없이 파일만 분리** (동작 변경 0%)
2. **Props 전달만으로 해결** (상태 공유 방식 동일)
3. **JSX만 추출** (비즈니스 로직은 그대로)
4. **단계별 검증** (각 단계 후 테스트)

### 리스크 레벨 정의
- 🟢 **안전 (0-5%)**: JSX 분리, Helper 함수 분리
- 🟡 **중간 (10-15%)**: 독립 함수 분리, API 함수 분리
- 🔴 **높음 (20%+)**: 상태 관리 재구조화 (Phase 2로 연기)

---

## 📋 Phase 1: JSX 분리 (안전)

### 목표
- **law-viewer.tsx**: 4,566 → 1,600줄 (65%↓)
- **소요 시간**: 2-3시간
- **리스크**: 5% 미만

### 작업 내용

#### 1. law-viewer-ui.tsx 생성
**파일**: `components/law-viewer-ui.tsx` (새 파일, 약 3,100줄)

**책임**:
- 순수 UI 렌더링만 담당
- 모든 state와 handler를 props로 받음
- 비즈니스 로직 없음

**구조**:
```typescript
// components/law-viewer-ui.tsx
import type { LawMeta, LawArticle, ThreeTierData } from "@/lib/law-types"
import type { AdminRuleMatch } from "@/lib/use-admin-rules"
import type { ParsedRelatedLaw } from "@/lib/law-parser"
import type { VerifiedCitation } from "@/lib/citation-verifier"

export interface LawViewerUIProps {
  // Meta & Data
  meta: LawMeta
  articles: LawArticle[]
  loadedArticles: LawArticle[]
  preambles: LawArticle[]
  activeJo: string
  activeArticle: LawArticle | undefined

  // View State
  isOrdinance: boolean
  viewMode: "single" | "full"
  isFullView: boolean
  fontSize: number
  copied: boolean
  isArticleListExpanded: boolean

  // AI Answer Mode
  aiAnswerMode: boolean
  aiAnswerHTML: string
  relatedArticles: ParsedRelatedLaw[]
  aiCitations: VerifiedCitation[]
  userQuery: string
  aiConfidenceLevel: 'high' | 'medium' | 'low'
  fileSearchFailed: boolean

  // 3-Tier Data
  threeTierCitation: ThreeTierData | null
  threeTierDelegation: ThreeTierData | null
  tierViewMode: "1-tier" | "2-tier" | "3-tier"
  isLoadingThreeTier: boolean
  delegationActiveTab: "decree" | "rule" | "admin"

  // Admin Rules
  showAdminRules: boolean
  adminRuleViewMode: "list" | "detail"
  adminRuleHtml: string
  adminRuleTitle: string
  adminRules: AdminRuleMatch[]
  loadingAdminRules: boolean
  adminRulesError: Error | null
  adminRulesProgress: number
  adminRuleMobileTab: "law" | "adminRule"

  // Comparison
  comparisonLawMeta: LawMeta | null
  comparisonLawArticles: LawArticle[]
  comparisonLawSelectedJo: string | undefined
  isLoadingComparison: boolean

  // Modal State
  refModal: { open: boolean; title?: string; html?: string; forceWhiteTheme?: boolean; lawName?: string; articleNumber?: string }
  refModalHistory: Array<{ title: string; html?: string; forceWhiteTheme?: boolean; lawName?: string; articleNumber?: string }>

  // Revision History
  revisionHistory: any[]
  isLoadingHistory: boolean

  // Panel Sizes
  delegationPanelSize: number
  adminRulePanelSize: number

  // Swipe
  swipeHint: { direction: "left" | "right" } | null

  // Refs
  contentRef: React.RefObject<HTMLDivElement>
  articleRefs: React.MutableRefObject<{ [key: string]: HTMLDivElement | null }>

  // Handlers
  onArticleClick: (jo: string) => void
  onContentClick: (e: React.MouseEvent<HTMLDivElement>) => void
  onFontSizeChange: (size: number) => void
  onCopyArticleUrl: () => void
  onOpenExternalLink: () => void
  onToggleArticleList: () => void
  onCloseRefModal: () => void
  onRefModalBack: () => void
  onTierViewModeChange: (mode: "1-tier" | "2-tier" | "3-tier") => void
  onToggleAdminRules: () => void
  onViewAdminRuleDetail: (rule: AdminRuleMatch) => void
  onAdminRuleBackToList: () => void
  onAdminRuleMobileTabChange: (tab: "law" | "adminRule") => void
  onDelegationActiveTabChange: (tab: "decree" | "rule" | "admin") => void
  onDelegationPanelResize: (sizes: number[]) => void
  onAdminRulePanelResize: (sizes: number[]) => void
  onSwipeHintDismiss: () => void
  onRelatedArticleClick?: (lawName: string, jo: string, article: string) => void

  // Callbacks
  onCompare?: (jo: string) => void
  onSummarize?: (jo: string) => void
  onToggleFavorite?: (jo: string) => void
  favorites: Set<string>
}

export function LawViewerUI(props: LawViewerUIProps) {
  // 기존 JSX 그대로 복사 (라인 1507-4566)
  return (
    <div className="...">
      {/* 기존 JSX */}
    </div>
  )
}
```

#### 2. law-viewer.tsx 수정
**변경 사항**:
- JSX 렌더링 부분 제거 (라인 1507-4566 삭제)
- `<LawViewerUI />` 컴포넌트 호출로 대체
- 모든 state와 handler를 props로 전달

**수정 후 구조** (약 1,600줄):
```typescript
export function LawViewer({ ... }: LawViewerProps) {
  // 모든 state & hooks (그대로 유지, 라인 115-223)
  const [activeJo, setActiveJo] = useState(...)
  const [fontSize, setFontSize] = useState(15)
  // ... 70개 hooks

  // 모든 useEffect (그대로 유지, 라인 224-423)
  useEffect(() => { ... }, [...])

  // 모든 handlers (그대로 유지, 라인 425-1496)
  const handleArticleClick = async (jo: string) => { ... }
  const handleContentClick = async (e) => { ... }
  const openExternalLawArticleModal = async (...) => { ... }
  // ...

  // JSX 대신 LawViewerUI 호출
  return (
    <LawViewerUI
      meta={meta}
      articles={articles}
      loadedArticles={loadedArticles}
      preambles={preambles}
      activeJo={activeJo}
      activeArticle={activeArticle}
      isOrdinance={isOrdinance}
      viewMode={viewMode}
      isFullView={isFullView}
      fontSize={fontSize}
      copied={copied}
      isArticleListExpanded={isArticleListExpanded}
      aiAnswerMode={aiAnswerMode}
      aiAnswerHTML={aiAnswerHTML}
      relatedArticles={relatedArticles}
      aiCitations={aiCitations}
      userQuery={userQuery}
      aiConfidenceLevel={aiConfidenceLevel}
      fileSearchFailed={fileSearchFailed}
      threeTierCitation={threeTierCitation}
      threeTierDelegation={threeTierDelegation}
      tierViewMode={tierViewMode}
      isLoadingThreeTier={isLoadingThreeTier}
      delegationActiveTab={delegationActiveTab}
      showAdminRules={showAdminRules}
      adminRuleViewMode={adminRuleViewMode}
      adminRuleHtml={adminRuleHtml}
      adminRuleTitle={adminRuleTitle}
      adminRules={adminRules}
      loadingAdminRules={loadingAdminRules}
      adminRulesError={adminRulesError}
      adminRulesProgress={adminRulesProgress}
      adminRuleMobileTab={adminRuleMobileTab}
      comparisonLawMeta={comparisonLawMeta}
      comparisonLawArticles={comparisonLawArticles}
      comparisonLawSelectedJo={comparisonLawSelectedJo}
      isLoadingComparison={isLoadingComparison}
      refModal={refModal}
      refModalHistory={refModalHistory}
      revisionHistory={revisionHistory}
      isLoadingHistory={isLoadingHistory}
      delegationPanelSize={delegationPanelSize}
      adminRulePanelSize={adminRulePanelSize}
      swipeHint={swipeHint}
      contentRef={contentRef}
      articleRefs={articleRefs}
      onArticleClick={handleArticleClick}
      onContentClick={handleContentClick}
      onFontSizeChange={setFontSize}
      onCopyArticleUrl={copyArticleUrl}
      onOpenExternalLink={openExternalLink}
      onToggleArticleList={() => setIsArticleListExpanded(!isArticleListExpanded)}
      onCloseRefModal={() => setRefModal({ open: false })}
      onRefModalBack={handleRefModalBack}
      onTierViewModeChange={setTierViewMode}
      onToggleAdminRules={() => setShowAdminRules(!showAdminRules)}
      onViewAdminRuleDetail={handleViewAdminRuleFullContent}
      onAdminRuleBackToList={() => setAdminRuleViewMode("list")}
      onAdminRuleMobileTabChange={setAdminRuleMobileTab}
      onDelegationActiveTabChange={setDelegationActiveTab}
      onDelegationPanelResize={(sizes) => {
        setDelegationPanelSize(sizes[0])
        localStorage.setItem('lawViewerDelegationSplit', sizes[0].toString())
      }}
      onAdminRulePanelResize={(sizes) => {
        setAdminRulePanelSize(sizes[0])
        localStorage.setItem('lawViewerAdminRuleSplit', sizes[0].toString())
      }}
      onSwipeHintDismiss={() => setSwipeHint(null)}
      onRelatedArticleClick={onRelatedArticleClick}
      onCompare={onCompare}
      onSummarize={onSummarize}
      onToggleFavorite={onToggleFavorite}
      favorites={favorites}
    />
  )
}
```

### 검증 체크리스트
- [ ] 조문 클릭 시 activeJo 변경 및 스크롤
- [ ] 좌우 스와이프 네비게이션
- [ ] 링크 클릭 → 모달 열기 (내부 조문)
- [ ] 링크 클릭 → 모달 열기 (외부 법령)
- [ ] 모달 히스토리 뒤로가기
- [ ] 개정이력 표시
- [ ] 3단 비교 데이터 조회 및 표시
- [ ] 행정규칙 로드 및 표시
- [ ] AI 답변 모드 (관련 법령 표시)
- [ ] 모바일 탭 전환 (법령 본문 ↔ 행정규칙)
- [ ] 패널 드래그 리사이즈 (2단/3단 비교)
- [ ] 글씨 크기 조절
- [ ] 조문 URL 복사
- [ ] 즐겨찾기 추가/제거

---

## 📋 Phase 2: 함수 분리 (중간) - 연기

### 목표
- **law-viewer.tsx**: 1,600 → 1,000줄 (추가 600줄 감소)
- **search-result-view.tsx**: 2,391 → 2,133줄 (258줄 감소)
- **소요 시간**: 2-3시간
- **리스크**: 10-15%

### 작업 내용 (나중에)
1. `lib/law-viewer-modals.ts` - Modal 열기 함수 4개
2. `lib/law-viewer-helpers.ts` - 유틸리티 함수
3. `lib/search-result-helpers.ts` - Helper 함수
4. `lib/search-api.ts` - fetchLawContent 함수

---

## 📋 Phase 3: 조건부 렌더링 분리 (안전) - 연기

### 목표
- **search-result-view.tsx**: 2,133 → 1,800줄 (추가 333줄 감소)
- **소요 시간**: 1-2시간
- **리스크**: 5%

### 작업 내용 (나중에)
1. `components/search-result-loading.tsx`
2. `components/search-result-content.tsx`

---

## 📁 파일 구조 (Phase 1 완료 후)

```
components/
  law-viewer.tsx (1,600줄) - 상태 관리 + 핸들러
  law-viewer-ui.tsx (3,100줄) - 순수 UI 렌더링 (NEW)
  search-result-view.tsx (2,391줄) - 그대로 유지

lib/
  law-types.ts
  law-parser.ts
  law-xml-parser.tsx
  unified-link-generator.ts
  ... (기존 파일들)
```

---

## ⚠️ 주의 사항

### 절대 변경 금지
1. **linkifyRefsB 패턴**: [JSON_TO_HTML_FLOW.md](../important-docs/JSON_TO_HTML_FLOW.md) 참조
2. **7단계 HTML 파이프라인**: 순서 변경 금지
3. **JO Code 변환 로직**: buildJO(), formatJO() 시그니처 유지

### 테스트 필수
1. 모바일/데스크톱 반응형 레이아웃
2. 다크/라이트 테마 전환
3. 조례 vs 법령 렌더링 차이
4. AI 답변 모드 vs 일반 모드

---

## 📊 성과 지표

### Phase 1 완료 시
- law-viewer.tsx: **65% 감소** (4,566 → 1,600줄)
- 코드 가독성: **대폭 향상** (로직과 UI 분리)
- 유지보수성: **향상** (UI 수정 시 law-viewer-ui.tsx만 변경)
- 빌드 시간: **동일** (총 줄 수는 동일)

### 전체 Phase 완료 시 (예상)
- 총 줄 수: **60% 감소** (6,957 → 2,800줄)
- 파일 개수: **7개 증가** (모듈화)
- 코드 재사용성: **향상**

---

## 🔄 롤백 계획

만약 Phase 1 실행 후 문제 발생 시:
1. `docs/deleted-code-archive.md` 참조
2. law-viewer-ui.tsx 삭제
3. law-viewer.tsx의 JSX 부분 복원
4. git revert 또는 백업 브랜치에서 복구

---

**최종 업데이트**: 2025-11-23
**상태**: Phase 1 준비 완료
