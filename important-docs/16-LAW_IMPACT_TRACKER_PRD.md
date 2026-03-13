# 법령 영향 추적기 (Law Impact Tracker) — PRD급 구현 계획

## Context

강동구의 "자치법규↔상위법령 영향관계 추적 시스템"과 유사하되, lexdiff의 기존 인프라(3단비교, 신구대비, AI요약, SSE스트리밍)를 최대한 재활용하여 **더 고도화된 버전**을 구현한다. 강동구가 규칙 기반 분류인 반면, lexdiff는 **Gemini 의미분석 기반** 영향도 분류를 수행하여 차별화한다.

**핵심 가치**: "이 법률이 바뀌면 → 어떤 하위법령이 영향받는가?" 를 자동 탐지·분류·요약

---

## Phase 1: 타입 정의 + 백엔드 엔진 (핵심 파이프라인)

### 1-1. 타입 정의

**신규 파일**: `lib/impact-tracker-types.ts`

```typescript
// ── 입력 ──
export interface ImpactTrackerRequest {
  lawNames: string[]         // ["국토계획법", "건축법"]
  dateFrom: string           // "2025-01-01"
  dateTo: string             // "2026-03-13"
}

// ── 영향도 등급 ──
export type ImpactSeverity = 'critical' | 'review' | 'info'

export const SEVERITY_CONFIG: Record<ImpactSeverity, {
  label: string; emoji: string; color: string; bgClass: string
}> = {
  critical: { label: '긴급', emoji: '🔴', color: 'text-red-600', bgClass: 'bg-red-50 border-red-200' },
  review:   { label: '검토', emoji: '🟡', color: 'text-yellow-600', bgClass: 'bg-yellow-50 border-yellow-200' },
  info:     { label: '참고', emoji: '🟢', color: 'text-green-600', bgClass: 'bg-green-50 border-green-200' },
}

// ── 조문별 변경 기록 ──
export interface ArticleChange {
  lawId: string
  lawName: string
  mst: string
  jo: string                 // 6자리 JO 코드 ("003800")
  joDisplay: string          // "제38조"
  articleTitle?: string
  revisionType: string       // "개정", "전부개정", "삭제", "신설"
  revisionDate: string       // "2025-06-15"
  effectiveDate?: string
}

// ── 하위법령 영향 ──
export interface DownstreamImpact {
  type: '시행령' | '시행규칙' | '행정규칙' | '자치법규'
  lawName: string
  lawId?: string
  jo?: string
  joDisplay?: string
  content?: string           // 조문 발췌
}

// ── 영향 카드 단위 ──
export interface ImpactItem {
  id: string                 // React key용 UUID
  change: ArticleChange
  downstreamImpacts: DownstreamImpact[]
  severity: ImpactSeverity
  severityReason: string     // AI 분류 근거
  oldText?: string
  newText?: string
}

// ── 종합 요약 ──
export interface ImpactSummary {
  totalChanges: number
  bySeverity: Record<ImpactSeverity, number>
  byLaw: Record<string, number>
  aiSummary: string          // Gemini 생성 내러티브
  dateRange: { from: string; to: string }
}

// ── 최종 결과 ──
export interface ImpactTrackerResult {
  items: ImpactItem[]
  summary: ImpactSummary
  analyzedAt: string
}

// ── SSE 이벤트 ──
export type ImpactSSEEvent =
  | { type: 'status'; message: string; progress: number; step: ImpactStep }
  | { type: 'law_resolved'; lawName: string; lawId: string; mst: string; articleCount: number }
  | { type: 'changes_found'; lawName: string; changes: ArticleChange[] }
  | { type: 'impact_item'; item: ImpactItem }
  | { type: 'summary'; summary: ImpactSummary }
  | { type: 'complete'; result: ImpactTrackerResult }
  | { type: 'error'; message: string; recoverable: boolean }

export type ImpactStep =
  | 'resolving'    // 법령 검색
  | 'scanning'     // 조문 이력 스캔
  | 'comparing'    // 신구문 비교
  | 'tracing'      // 하위법령 추적
  | 'classifying'  // AI 영향도 분류
  | 'summarizing'  // AI 종합 요약
  | 'complete'
```

### 1-2. 서버측 XML 유틸리티

**신규 파일**: `lib/impact-tracker/server-xml-utils.ts`

서버(Node.js)에서 DOMParser 없이 XML을 파싱하는 경량 유틸리티.
기존 `lib/law-parser.ts`의 `parseArticleHistory()`는 클라이언트용(DOMParser)이므로, 서버용 regex 기반 파서를 별도 작성.

```typescript
// 법령 구조 XML에서 조문 JO 코드 목록 추출
export function extractArticleJOCodes(hierarchyXml: string): Array<{ jo: string; joDisplay: string; title?: string }>

// 조문 이력 XML에서 날짜 범위 필터링
export function filterHistoryByDateRange(
  historyXml: string,
  dateFrom: string,
  dateTo: string
): RevisionHistoryItem[]

// 신구대비 XML에서 조문별 구법/신법 텍스트 추출
export function extractOldNewTexts(oldnewXml: string): Array<{
  jo: string; joDisplay: string; oldText: string; newText: string
}>
```

**재사용**: `RevisionHistoryItem` 타입은 기존 `lib/law-types.ts:108-119`에서 import

### 1-3. 핵심 엔진 (AsyncGenerator + SSE)

**신규 파일**: `lib/impact-tracker/engine.ts`

기존 `lib/fc-rag/engine.ts`의 `executeRAGStream()` 패턴을 그대로 따름.

```typescript
export async function* executeImpactAnalysis(
  request: ImpactTrackerRequest,
  options?: { signal?: AbortSignal; baseUrl: string }
): AsyncGenerator<ImpactSSEEvent>
```

**7단계 파이프라인**:

| Step | Progress | 동작 | 호출하는 기존 API |
|------|----------|------|-------------------|
| 1. resolving | 0-5% | 법령명으로 lawId/mst 조회 | `/api/law-search?query=${lawName}` |
| 2. scanning | 5-25% | 법령 구조 조회 → 모든 조문의 이력 확인 | `/api/hierarchy?lawId=` → `/api/article-history?lawId=&jo=` (병렬 10개씩) |
| 3. comparing | 25-45% | 변경된 조문의 신구문 가져오기 | `/api/oldnew?lawId=` (법령 단위 1회) |
| 4. tracing | 45-65% | 변경 조문의 하위법령 의존성 추적 | `/api/three-tier?lawId=` (법령 단위 1회) |
| 5. classifying | 65-85% | Gemini로 영향도 분류 (5-10개씩 배치) | Gemini 2.5 Flash Lite 직접 호출 |
| 6. summarizing | 85-95% | Gemini로 종합 리포트 생성 | Gemini 2.5 Flash Lite 직접 호출 |
| 7. complete | 95-100% | 최종 결과 조립 | - |

**핵심 설계 결정**:
- 내부 `fetch()`로 기존 API 라우트 호출 → 이미 구현된 캐싱(1h), 에러처리, 파라미터 검증 무료 재활용
- article-history는 조문 수가 많을 수 있으므로 **10개씩 병렬 배치**
- 각 단계에서 중간 결과를 yield하여 **점진적 렌더링** 가능
- `AbortSignal` 지원으로 사용자 취소 가능

### 1-4. AI 영향도 분류기

**신규 파일**: `lib/impact-tracker/classifier.ts`

```typescript
export async function classifyImpactBatch(
  changes: Array<{
    change: ArticleChange
    oldText?: string
    newText?: string
    downstreamCount: number
  }>,
  options?: { apiKey?: string }
): Promise<Array<{ jo: string; severity: ImpactSeverity; reason: string }>>
```

**재사용**:
- `GoogleGenAI` 패턴 → 기존 `app/api/summarize/route.ts:111-124`
- `sanitizePromptInput()` → 기존 `app/api/summarize/route.ts:6-8`
- 모델: `gemini-2.5-flash-lite` (summarize와 동일)

### 1-5. 프롬프트 빌더

**신규 파일**: `lib/impact-tracker/prompts.ts`

```typescript
// 영향도 분류 프롬프트 (배치)
export function buildClassificationPrompt(changes: Array<{
  lawName: string; joDisplay: string; revisionType: string
  oldText?: string; newText?: string; downstreamCount: number
}>): string

// 종합 요약 프롬프트
export function buildSummaryPrompt(
  items: ImpactItem[],
  dateRange: { from: string; to: string }
): string
```

**분류 프롬프트 핵심 로직**:
```
🔴 긴급(critical): 위임 근거 삭제/변경, 벌칙 신설/강화, 전부개정,
                    하위법령 3개 이상 영향
🟡 검토(review): 용어 변경, 기준 수정, 일부개정으로 실질적 내용 변경
🟢 참고(info): 단순 자구 정비, 조번호 이동, 부칙 변경
```

**출력 형식**: JSON 배열 (structured output)
```json
[
  { "jo": "003800", "severity": "critical", "reason": "위임 근거인 '대통령령으로 정하는' 문구가 삭제되어..." }
]
```

### 1-6. SSE API 엔드포인트

**신규 파일**: `app/api/impact-tracker/route.ts`

기존 `app/api/fc-rag/route.ts:62-201`의 패턴을 **거의 그대로** 복제:
- `getClientIP()` → 기존 패턴 재사용
- `isQuotaExceeded()` + `recordAIUsage()` → 기존 `lib/usage-tracker.ts` 재사용
- SSE ReadableStream 패턴 → 기존 fc-rag와 동일
- `request.signal` 전달 → AbortController 지원

```typescript
export async function POST(request: NextRequest): Promise<Response> {
  // 1. IP 추출, 쿼터 확인 (fc-rag 패턴)
  // 2. body 파싱: { lawNames, dateFrom, dateTo }
  // 3. baseUrl 생성: new URL(request.url).origin
  // 4. ReadableStream + executeImpactAnalysis() 호출
  // 5. SSE 응답 반환
}
```

---

## Phase 2: 클라이언트 훅 + 기본 UI

### 2-1. 클라이언트 훅

**신규 파일**: `hooks/use-impact-tracker.ts`

```typescript
export function useImpactTracker(): {
  // 상태
  isAnalyzing: boolean
  progress: number
  step: ImpactStep
  statusMessage: string
  items: ImpactItem[]
  summary: ImpactSummary | null
  error: string | null

  // 액션
  startAnalysis: (request: ImpactTrackerRequest) => void
  cancelAnalysis: () => void
  clearResults: () => void
}
```

**SSE 소비 패턴**: 기존 search-result-view의 RAG SSE 소비 로직 참고
- `fetch()` + `getReader()` + `TextDecoder` 루프
- **CLAUDE.md 규칙**: 루프 후 잔여 버퍼 처리 필수
- `AbortController`로 취소 지원
- `impact_item` 이벤트 도착 시 즉시 `items` 배열에 추가 (점진적 렌더링)

### 2-2. 영향 카드 컴포넌트

**신규 파일**: `components/impact-tracker/impact-card.tsx`

기존 `SearchResultList.tsx`의 카드 패턴 참고:
- 2열 그리드 (모바일 1열)
- 상단: 영향도 뱃지 (shadcn Badge) + 법령명 + 조문번호
- 중단: 개정유형 + 날짜 + 하위법령 영향 수
- 하단: AI 분류 근거 (Collapsible) + 액션 버튼

```typescript
interface ImpactCardProps {
  item: ImpactItem
  onCompare: (lawId: string, mst: string, jo: string) => void  // ComparisonModal 열기
  onViewLaw: (lawId: string, mst: string, jo: string) => void  // LawViewer 열기
  onAiAnalysis: (item: ImpactItem) => void                     // AI 요약 다이얼로그
}
```

**CLAUDE.md 규칙 준수**: 모바일 onClick에 async 금지 → `.then().catch()` 패턴

**재사용 UI**: `Badge` (`components/ui/badge.tsx`), `Card` (`components/ui/card.tsx`), `Collapsible` (`components/ui/collapsible.tsx`), `Button` (`components/ui/button.tsx`)

### 2-3. 영향 요약 헤더

**신규 파일**: `components/impact-tracker/impact-summary.tsx`

```typescript
interface ImpactSummaryProps {
  summary: ImpactSummary | null
  isLoading: boolean
}
```

렌더링:
```
┌──────────────────────────────────────────────┐
│ 분석 기간: 2025.01.01 ~ 2026.03.13          │
│ 총 변경 12건  🔴 긴급 2건  🟡 검토 5건  🟢 참고 5건 │
│                                              │
│ [AI 요약 펼치기 ▼]                             │
│ "국토계획법 전부개정으로 시행령 제28조..."       │
└──────────────────────────────────────────────┘
```

### 2-4. 필터 바

**신규 파일**: `components/impact-tracker/impact-filter-bar.tsx`

```typescript
interface ImpactFilterBarProps {
  severityFilter: ImpactSeverity | 'all'
  lawFilter: string | 'all'
  availableLaws: string[]
  onSeverityChange: (v: ImpactSeverity | 'all') => void
  onLawChange: (v: string | 'all') => void
  totalCount: number
  filteredCount: number
}
```

**재사용 UI**: `Select` (`components/ui/select.tsx`), `Badge`

### 2-5. 메인 대시보드 뷰

**신규 파일**: `components/impact-tracker/impact-tracker-view.tsx`

전체 오케스트레이터 컴포넌트. `useImpactTracker()` 훅 사용.

```typescript
interface ImpactTrackerViewProps {
  initialRequest?: ImpactTrackerRequest  // URL에서 복원된 요청
  onBack: () => void
  onHomeClick: () => void
}
```

**레이아웃**:
1. 분석 중: 프로그레스 바 + 단계별 상태 메시지 + 점진적 카드 등장
2. 분석 완료: 요약 헤더 → 필터 바 → 카드 그리드
3. 카드 클릭 → 기존 `ComparisonModal` 또는 `LawViewer` 열기

**재사용**: `ModernProgressBar` (`components/ui/modern-progress-bar.tsx`)

---

## Phase 3: SPA 통합 + 진입점

### 3-1. ViewMode 확장

**수정 파일**: `app/page.tsx` (line 30)

```typescript
// Before:
type ViewMode = 'home' | 'search-result' | 'precedent-detail'

// After:
type ViewMode = 'home' | 'search-result' | 'precedent-detail' | 'impact-tracker'
```

추가 상태:
```typescript
const [impactRequest, setImpactRequest] = useState<ImpactTrackerRequest | null>(null)
```

조건부 렌더링 추가 (기존 패턴 따름):
```typescript
{viewMode === 'impact-tracker' && impactRequest && (
  <ImpactTrackerView
    initialRequest={impactRequest}
    onBack={() => window.history.back()}
    onHomeClick={handleHomeClick}
  />
)}
```

### 3-2. History 확장

**수정 파일**: `lib/history-manager.ts` (line 13-20)

```typescript
// HistoryState에 추가:
export interface HistoryState {
  viewMode: 'home' | 'search-result' | 'precedent-detail' | 'impact-tracker'
  // ... 기존 필드
  impactRequest?: ImpactTrackerRequest  // 영향 추적기 요청 데이터
}

// 새 함수 추가:
export function pushImpactTrackerHistory(request: ImpactTrackerRequest): void
```

### 3-3. 입력 폼 컴포넌트

**신규 파일**: `components/impact-tracker/impact-tracker-input.tsx`

```typescript
interface ImpactTrackerInputProps {
  onSubmit: (request: ImpactTrackerRequest) => void
  isAnalyzing: boolean
}
```

- 법령명 입력 (멀티 태그 형식, 자동완성은 Phase 4에서)
- 기간 선택: 프리셋 버튼 (1개월/3개월/6개월) + 직접 입력
- "분석 시작" 버튼

### 3-4. 홈 화면 진입점

**수정 파일**: `components/search-view.tsx`

검색바 하단에 "법령 영향 추적기" 버튼 추가. 클릭 시 `impact-tracker-input` 모달/시트 열기.

```typescript
// SearchViewProps에 추가:
onImpactTracker?: (request: ImpactTrackerRequest) => void
```

**수정 파일**: `components/feature-cards.tsx` (line 6-37)

7번째 피처 카드 추가:
```typescript
{
  title: "법령 영향 추적기",
  description: "상위법 개정이 하위법령에 미치는 영향을 자동으로 탐지·분석하여, 긴급/검토/참고 등급으로 분류합니다.",
  icon: "radar" as const,  // 또는 "shield-alert"
}
```

---

## Phase 4: 캐싱 + 타임라인 + 하드닝

### 4-1. 결과 캐싱

기존 `lib/api-cache.ts`의 localStorage 패턴 사용 (IndexedDB 스키마 변경 불필요):
```typescript
// 캐시 키: `impact:${lawNames.sort().join(',')}:${dateFrom}:${dateTo}`
// TTL: 24시간 (법령 데이터는 자주 변하지 않음)
```

### 4-2. 타임라인 뷰 (선택적 토글)

**신규 파일**: `components/impact-tracker/impact-timeline.tsx`

카드 그리드 ↔ 타임라인 토글 지원. 월별 그룹핑 + 세로 타임라인 CSS.

### 4-3. 엣지케이스 처리

- 조문 200개 이상 법령: 경고 토스트 + 분석 시간 안내
- API 타임아웃: 부분 결과 허용 (`recoverable: true` 에러)
- 조문 이력 미지원 법령: 건너뛰기 + 경고
- 빈 결과: "조회 기간 내 변경사항이 없습니다" 안내

---

## 수정/생성 파일 전체 요약

### 신규 파일 (12개)

| 파일 | 역할 | Phase |
|------|------|-------|
| `lib/impact-tracker-types.ts` | 전체 타입/인터페이스 정의 | 1 |
| `lib/impact-tracker/engine.ts` | 7단계 SSE AsyncGenerator 엔진 | 1 |
| `lib/impact-tracker/classifier.ts` | Gemini 영향도 분류 | 1 |
| `lib/impact-tracker/prompts.ts` | Gemini 프롬프트 빌더 | 1 |
| `lib/impact-tracker/server-xml-utils.ts` | 서버측 XML 파싱 유틸 | 1 |
| `app/api/impact-tracker/route.ts` | SSE API 엔드포인트 | 1 |
| `hooks/use-impact-tracker.ts` | 클라이언트 SSE 소비 훅 | 2 |
| `components/impact-tracker/impact-card.tsx` | 영향 카드 UI | 2 |
| `components/impact-tracker/impact-summary.tsx` | 요약 헤더 UI | 2 |
| `components/impact-tracker/impact-filter-bar.tsx` | 필터 바 UI | 2 |
| `components/impact-tracker/impact-tracker-view.tsx` | 메인 대시보드 | 2 |
| `components/impact-tracker/impact-tracker-input.tsx` | 입력 폼 | 3 |

### 수정 파일 (4개)

| 파일 | 변경 내용 | Phase |
|------|----------|-------|
| `app/page.tsx` | ViewMode에 `'impact-tracker'` 추가, 상태/렌더링 추가 | 3 |
| `lib/history-manager.ts` | HistoryState 확장, `pushImpactTrackerHistory()` 추가 | 3 |
| `components/search-view.tsx` | "법령 영향 추적기" 진입 버튼 추가 | 3 |
| `components/feature-cards.tsx` | 7번째 피처 카드 추가 | 3 |

### 선택적 파일 (Phase 4)

| 파일 | 역할 |
|------|------|
| `components/impact-tracker/impact-timeline.tsx` | 타임라인 시각화 |

---

## 재사용하는 기존 인프라

| 기존 자산 | 파일 | 재사용 방식 |
|-----------|------|------------|
| SSE 스트리밍 패턴 | `app/api/fc-rag/route.ts:107-186` | ReadableStream + encoder 패턴 복제 |
| AsyncGenerator 패턴 | `lib/fc-rag/engine.ts` | `executeImpactAnalysis()` 구조 동일 |
| Gemini 호출 | `app/api/summarize/route.ts:111-124` | `GoogleGenAI` + `generateContent()` 동일 |
| 사용량 추적 | `lib/usage-tracker.ts` | `isQuotaExceeded()`, `recordAIUsage()` 그대로 |
| 3단비교 파서 | `lib/three-tier-parser.ts` | `parseThreeTierDelegation()` → 하위법령 매칭 |
| 타입 정의 | `lib/law-types.ts:108-166` | `RevisionHistoryItem`, `ThreeTierArticle`, `DelegationItem` |
| 조문번호 변환 | `lib/law-parser.ts` | `buildJO()`, `formatJO()` |
| 카드 UI 패턴 | `components/search-result-view/SearchResultList.tsx` | 그리드 레이아웃, 뱃지, 필터링 |
| shadcn 컴포넌트 | `components/ui/*` | Badge, Card, Button, Select, Collapsible, Progress |
| 프롬프트 위생 | `app/api/summarize/route.ts:6-8` | `sanitizePromptInput()` |
| localStorage 캐시 | `lib/api-cache.ts` | `setCachedData()`, `getCachedData()` |

---

## 검증 계획

### 단위 테스트
```bash
# 신규 테스트 파일
__tests__/lib/impact-tracker/server-xml-utils.test.ts   # XML 파싱 검증
__tests__/lib/impact-tracker/prompts.test.ts             # 프롬프트 빌드 검증
__tests__/lib/impact-tracker/classifier.test.ts          # 분류 로직 검증 (Gemini mock)
```

### 통합 테스트
```bash
# SSE 엔드포인트 curl 테스트
curl -X POST http://localhost:3000/api/impact-tracker \
  -H "Content-Type: application/json" \
  -d '{"lawNames":["건축법"],"dateFrom":"2025-01-01","dateTo":"2026-03-13"}'
```

### E2E 수동 검증
1. 홈 화면 → "법령 영향 추적기" 버튼 클릭
2. 법령명 "건축법" 입력, 기간 "최근 3개월" 선택
3. 프로그레스 바 + 단계별 메시지 확인
4. 카드 점진적 등장 확인
5. 영향도 뱃지 (🔴🟡🟢) 정상 표시 확인
6. 카드의 [신구대비] 버튼 → ComparisonModal 열리는지 확인
7. 필터 (긴급만) → 카드 필터링 확인
8. 모바일 반응형 확인

### 빌드/린트
```bash
npm run build   # 타입 에러 없는지 확인
npm run lint    # ESLint 통과 확인
```

---

## 구현 순서 요약

```
Phase 1 (백엔드): types → server-xml-utils → prompts → classifier → engine → route.ts
Phase 2 (프론트): hook → impact-card → impact-summary → filter-bar → dashboard-view
Phase 3 (통합): page.tsx → history-manager → input-form → search-view → feature-cards
Phase 4 (하드닝): 캐싱 → 타임라인 → 엣지케이스 → 테스트
```
