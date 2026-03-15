# 법령 분석 도구 모음 (Law Analysis Toolkit) — PRD

**문서 번호**: 19
**작성일**: 2026-03-15
**버전**: 1.0
**상태**: 설계 확정, 구현 대기
**선행 조건**: 영향 추적기 Phase 4 하드닝 완료 (localStorage 캐싱, 단위 테스트)

---

## 1. 개요

### 1.1 배경

LexDiff는 FC-RAG 엔진, 3단 비교, 영향 추적기 등 강력한 인프라를 보유하고 있으나, 이를 활용한 **분석 도구**는 영향 추적기 1개뿐이다. 기존 인프라를 최대한 재활용하여 4개의 신규 분석 도구를 추가하고, 기존 영향 추적기를 확장한다.

### 1.2 목표

1. **5개 법령 분석 도구** 통합 제공 (기존 1 + 신규 4)
2. **이중 진입점**: 법령 뷰어 액션 버튼 + 홈 페이지 도구 카드
3. **도구별 최적 UI**: 경량 도구는 Modal, 중량 도구는 ViewMode
4. **AI 리스크 최소화**: Factual 기반 도구 우선 (hallucination 위험 제로)

### 1.3 도구 목록

| # | 도구명 | UI 형태 | 신규/확장 | 우선순위 |
|---|--------|---------|----------|---------|
| 1 | 위임입법 미비 탐지기 | **Modal** | 신규 | P1 |
| 2 | 법령 타임머신 | **Modal** (ComparisonModal 확장) | 신규 | P1 |
| 3 | 법령 변경 영향 추적기 | **ViewMode** (기존) | 확장 | P2 |
| 4 | 조례 상위법 미반영 탐지 | **ViewMode** (영향 추적기 모드) | 확장 | P2 |
| 5 | 조례 벤치마킹 | **ViewMode** (신규) | 신규 | P3 |

### 1.4 설계 원칙

- **Factual First**: AI 판단이 아닌 데이터 크로스체크 기반 → 오답 위험 제로
- **기존 인프라 최대 재활용**: 새 API 엔드포인트 최소화
- **경량 = Modal, 중량 = ViewMode**: 결과 복잡도에 따라 UI 형태 결정
- **점진적 도입**: Phase별로 독립 배포 가능

---

## 2. 진입점 아키텍처

### 2.1 진입점 1: 법령 뷰어 "분석 도구" 드롭다운

#### 2.1.1 위치

현재 액션 버튼 바:
```
[신·구법비교] [AI요약] [원문보기] [위임법령] [판례] [즐겨찾기]
```

변경 후:
```
[신·구법비교] [AI요약] [원문보기] [위임법령] [판례] [📊 분석 ▾] [즐겨찾기]
```

#### 2.1.2 드롭다운 메뉴 구성

법령 타입별 조건부 표시:

| 메뉴 항목 | 아이콘 | 법률 | 시행령/규칙 | 조례 | 동작 |
|----------|--------|------|-----------|------|------|
| 위임 미비 탐지 | `search-check` | ✅ | - | - | DelegationGapModal |
| 법령 타임머신 | `clock` | ✅ | ✅ | ✅ | TimeMachineModal |
| 변경 영향 분석 | `activity` | ✅ | ✅ | ✅ | ViewMode 전환 |
| 상위법 미반영 탐지 | `alert-triangle` | - | - | ✅ | ViewMode 전환 |
| 조례 벤치마킹 | `bar-chart-3` | - | - | ✅ | ViewMode 전환 |

#### 2.1.3 조건부 활성화 로직

```typescript
// 법령 뷰어 → 분석 도구 메뉴 활성화 조건
interface AnalysisToolMenuItem {
  id: AnalysisToolType
  label: string
  icon: string
  enabled: boolean
  action: () => void
}

type AnalysisToolType =
  | 'delegation-gap'      // 위임 미비
  | 'time-machine'        // 타임머신
  | 'impact-tracker'      // 영향 추적
  | 'ordinance-sync'      // 미반영 탐지
  | 'ordinance-benchmark' // 벤치마킹

function getAvailableTools(meta: LawMeta, isOrdinance: boolean, isPrecedent: boolean): AnalysisToolMenuItem[] {
  const tools: AnalysisToolMenuItem[] = []

  if (isPrecedent) return [] // 판례에서는 분석 도구 비활성

  // 위임 미비: 법률(Act)만 — 시행령/시행규칙은 위임 주체가 아님
  const isAct = !isOrdinance && !['시행령', '시행규칙'].includes(meta?.lawType || '')
  if (isAct && meta?.mst) {
    tools.push({ id: 'delegation-gap', label: '위임 미비 탐지', icon: 'search-check', enabled: true, action: ... })
  }

  // 타임머신: 모든 법령 (연혁이 있는 경우)
  if (meta?.mst || meta?.lawId) {
    tools.push({ id: 'time-machine', label: '법령 타임머신', icon: 'clock', enabled: true, action: ... })
  }

  // 영향 추적: 모든 법령/조례
  tools.push({ id: 'impact-tracker', label: '변경 영향 분석', icon: 'activity', enabled: true, action: ... })

  // 조례 전용
  if (isOrdinance) {
    tools.push({ id: 'ordinance-sync', label: '상위법 미반영 탐지', icon: 'alert-triangle', enabled: true, action: ... })
    tools.push({ id: 'ordinance-benchmark', label: '조례 벤치마킹', icon: 'bar-chart-3', enabled: true, action: ... })
  }

  return tools
}
```

#### 2.1.4 드롭다운 UI 컴포넌트

```typescript
// components/law-viewer/law-viewer-analysis-menu.tsx
interface LawViewerAnalysisMenuProps {
  meta: LawMeta
  isOrdinance: boolean
  isPrecedent: boolean
  // Modal 도구 콜백
  onDelegationGap: (meta: LawMeta) => void
  onTimeMachine: (meta: LawMeta) => void
  // ViewMode 도구 콜백
  onImpactTracker: (lawName: string) => void
  onOrdinanceSync: (lawName: string) => void
  onOrdinanceBenchmark: (lawName: string) => void
}
```

**UI**: shadcn/ui `DropdownMenu` 사용. 버튼 크기/스타일은 기존 액션 버튼과 동일 (h-7, px-2).

#### 2.1.5 조례 뷰어 통합

현재 `law-viewer-ordinance-actions.tsx`는 [원문보기]만 있어 빈약함. 분석 도구 드롭다운을 조례 액션에도 추가:

```
변경 전: [원문보기]                    [글자크기] [복사]
변경 후: [원문보기] [📊 분석 ▾]         [글자크기] [복사]
```

---

### 2.2 진입점 2: 홈 페이지 도구 바로가기

#### 2.2.1 Feature Cards 통폐합

**현재 7개 → 브랜딩 3개로 축소:**

| 현재 카드 | 통합 후 |
|----------|---------|
| AI 자연어 검색 + AI 법률 분석 요약 | **AI 법률 분석** |
| 신구법 대비표 + 3단 비교 + 위임법령 추적 | **법령 비교/추적** |
| 실시간 법제처 연동 + 법령 영향 추적기 | **실시간 법제처 데이터** |

**브랜딩 카드 3개 (Core Competence):**

```typescript
const brandingCards = [
  {
    title: "AI 법률 분석",
    description: "자연어 질문으로 법령·판례·해석례를 검색하고, AI가 핵심 쟁점을 분석·요약합니다.",
    icon: "brain",
  },
  {
    title: "법령 비교·추적",
    description: "신구법 대비, 3단 위임법령 비교, 상·하위 법령 체계를 단일 뷰에서 파악합니다.",
    icon: "git-compare",
  },
  {
    title: "실시간 법제처 연동",
    description: "법제처 API 다이렉트 연동으로 법령·조례·판례·해석례 최신 데이터를 실시간 제공합니다.",
    icon: "zap",
  },
]
```

#### 2.2.2 도구 카드 5개 (Analysis Toolkit)

브랜딩 카드 아래에 별도 섹션으로 배치. **시각적 차별화**: 브랜딩 카드는 화이트 배경 + 골드 악센트, 도구 카드는 미묘한 그래디언트 배경 + 클릭 가능한 호버 효과.

```typescript
const toolCards = [
  {
    id: 'impact-tracker',
    title: "변경 영향 분석",
    description: "법령·조례 개정이 하위법령에 미치는 영향을 자동 추적합니다.",
    icon: "activity",
    action: 'viewMode',  // ViewMode로 전환
  },
  {
    id: 'delegation-gap',
    title: "위임 미비 탐지",
    description: "법률이 위임했으나 하위법령이 제정되지 않은 조항을 찾습니다.",
    icon: "search-check",
    action: 'standalone-modal',  // 법령 검색 → 선택 → Modal
  },
  {
    id: 'time-machine',
    title: "법령 타임머신",
    description: "특정 시점의 법령 상태를 복원하고 현행법과 비교합니다.",
    icon: "clock",
    action: 'standalone-modal',  // 법령 검색 → 선택 → Modal
  },
  {
    id: 'ordinance-sync',
    title: "조례 미반영 탐지",
    description: "상위법 개정 후 조례가 미반영된 조항을 식별합니다.",
    icon: "alert-triangle",
    action: 'viewMode',  // ViewMode로 전환 (영향 추적기 모드)
  },
  {
    id: 'ordinance-benchmark',
    title: "조례 벤치마킹",
    description: "동일 주제 조례를 전국 지자체별로 비교 분석합니다.",
    icon: "bar-chart-3",
    action: 'viewMode',  // 신규 ViewMode
  },
]
```

#### 2.2.3 홈 페이지 레이아웃

```
┌─────────────────────────────────────────────┐
│              검색 바 (기존)                    │
│  [법령명 또는 질문 입력...]         [검색]      │
├─────────────────────────────────────────────┤
│                                             │
│            ━━ Core Competence ━━             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │ AI 법률   │ │ 법령     │ │ 실시간    │     │
│  │ 분석     │ │ 비교·추적 │ │ 법제처    │     │
│  │          │ │          │ │ 연동      │     │
│  └──────────┘ └──────────┘ └──────────┘     │
│                                             │
│            ━━ 법령 분석 도구 ━━               │
│  도구를 선택하여 바로 시작하세요.                │
│                                             │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐   │
│  │변경  │ │위임  │ │타임  │ │미반영│ │조례  │   │
│  │영향  │ │미비  │ │머신  │ │탐지  │ │벤치  │   │
│  │분석  │ │탐지  │ │      │ │      │ │마킹  │   │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘   │
└─────────────────────────────────────────────┘
```

#### 2.2.4 독립 진입 시 Modal 도구 UX 흐름

홈에서 "위임 미비 탐지" 또는 "법령 타임머신" 클릭 시:

```
1. 클릭 → 간단한 법령 검색 다이얼로그 표시
   ┌─ 법령 선택 ───────────────────────┐
   │  📝 법령명: [건축법      ] [검색]   │
   │                                   │
   │  검색 결과:                         │
   │  ● 건축법 (법률 제19456호)          │
   │  ● 건축법 시행령                    │
   │  ● 건축법 시행규칙                   │
   │                                   │
   │  [취소]          [선택하여 분석]      │
   └───────────────────────────────────┘

2. 법령 선택 → 해당 도구 Modal 열기 (법령 데이터 자동 입력)
```

**구현**: 기존 `search-suggest` API + 간단한 Dialog 컴포넌트. 법령 선택 후 `/api/eflaw` 또는 `/api/law-search`로 meta 정보(lawId, mst) 획득 → Modal에 전달.

---

## 3. 도구별 상세 스펙

### 3.1 위임입법 미비 탐지기 (DelegationGapModal)

#### 3.1.1 개요

특정 법률(Act)의 조문에서 "대통령령으로 정한다" 등 위임 문구를 추출하고, 실제 하위법령이 제정되었는지 크로스체크하여 미비 항목을 리스트업한다.

#### 3.1.2 왜 Modal인가

- **입력**: 현재 보고 있는 법률 (이미 결정됨)
- **출력**: 테이블 1개 (compact, 스크롤 가능)
- **API 호출**: 2건 (get_law_text + get_three_tier) → 비동기 await, SSE 불필요
- **사용 흐름**: 결과 확인 → Modal 닫고 → 법령 계속 열람

#### 3.1.3 데이터 흐름

```
Input: LawMeta { lawTitle, mst, lawId }
  │
  ├─[1] GET /api/eflaw?lawId={lawId}
  │     → 법률 전문 텍스트 (조문 배열)
  │
  ├─[2] 위임 패턴 추출 (클라이언트 사이드)
  │     regex: /(?:대통령령|총리령|부령|국토교통부령|보건복지부령|...)
  │            (?:으로|에서|이)\s*정(?:한다|하는|하도록|할\s*수)/g
  │     + 항번호 추출: /제(\d+)항/ 매칭
  │     → DelegationClause[] { jo, joDisplay, paragraph, targetType, rawText }
  │
  ├─[3] GET /api/three-tier?mst={mst}&knd=2
  │     → ThreeTierArticle[] (위임법령 매핑 데이터)
  │     → 기존 three-tier-parser.ts 그대로 사용
  │
  ├─[4] 크로스체크 (클라이언트 사이드)
  │     각 DelegationClause에 대해:
  │       ThreeTierArticle 중 같은 jo의 delegations[] 존재 여부 확인
  │       - delegations.length > 0 → ✅ 정상
  │       - delegations.length === 0 → ⚠️ 미비
  │       - 부분 미비: 위임 대상(시행령/시행규칙)과 delegation.type 불일치
  │
  └─[5] 결과 정렬 및 표시
        → 미비 항목 먼저, 정상 항목 뒤
        → 미비 건수 / 전체 건수 요약
```

#### 3.1.4 위임 패턴 정규식

```typescript
// lib/delegation-gap/patterns.ts

// 위임 대상 유형별 패턴
const DELEGATION_PATTERNS = {
  시행령: [
    /대통령령(?:으로|에서|이)\s*정/g,
    /대통령령에\s*위임/g,
  ],
  시행규칙: [
    /(?:총리령|부령)(?:으로|에서|이)\s*정/g,
    // 개별 부처 부령
    /(?:국토교통부령|보건복지부령|환경부령|교육부령|법무부령|기획재정부령|행정안전부령|산업통상자원부령|고용노동부령|농림축산식품부령|해양수산부령|문화체육관광부령|여성가족부령|국방부령|통일부령|외교부령|과학기술정보통신부령)(?:으로|에서|이)\s*정/g,
  ],
  고시등: [
    /(?:고시|훈령|예규|공고)(?:로|하여)\s*정/g,
  ],
}

// 위임이 아닌 false positive 패턴 (제외)
const EXCLUSION_PATTERNS = [
  /다른\s*법률에서\s*정/,    // 다른 법률 참조
  /조례로\s*정/,            // 조례 위임 (별도 추적)
  /이\s*법에서\s*정/,       // 자기 참조
]
```

#### 3.1.5 UI 구성

```
┌─ 위임입법 미비 탐지 ─────────────────────────────────────┐
│                                                          │
│  📋 건축법 (법률 제19456호, 2024.01.01 시행)                │
│                                                          │
│  ━━━ 분석 진행 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│  [1] 조문 스캔 ✅  [2] 위임 추출 ✅ (18건)  [3] 크로스체크 🔄│
│                                                          │
│  ━━━ 결과: 위임 18건 중 미비 2건, 부분미비 1건 ━━━━━━━━━━━  │
│                                                          │
│  [⚠ 미비만] [전체]                            [CSV 내보내기]│
│                                                          │
│  ┌────────┬────────────────┬──────────┬────────┬────────┐│
│  │ 조문    │ 위임 문구       │ 위임 대상 │ 하위법령│ 상태   ││
│  ├────────┼────────────────┼──────────┼────────┼────────┤│
│  │ 제22조② │ 국토부령으로    │ 시행규칙  │ ❌ 없음 │ ⚠ 미비 ││
│  │        │ 정한다          │          │        │        ││
│  ├────────┼────────────────┼──────────┼────────┼────────┤│
│  │ 제35조  │ 대통령령으로    │ 시행령   │ ⚠ 일부  │△ 부분  ││
│  │        │ 정한다          │          │ 누락   │  미비  ││
│  ├────────┼────────────────┼──────────┼────────┼────────┤│
│  │ 제11조③ │ 대통령령으로    │ 시행령   │ 시행령  │ ✅ 정상 ││
│  │        │ 정하는 바에 따라 │          │ 제8조   │        ││
│  │ ...    │                │          │        │        ││
│  └────────┴────────────────┴──────────┴────────┴────────┘│
│                                                          │
│  ℹ️ 위임 기한 도과 안내: 제22조② — 시행일(2023.06.15)로부터  │
│     1년 6개월 경과, 하위법령 미제정 상태                      │
│                                                          │
│                                        [닫기]             │
└──────────────────────────────────────────────────────────┘
```

#### 3.1.6 결과 타입

```typescript
// lib/delegation-gap/types.ts

interface DelegationClause {
  jo: string              // 6자리 JO 코드
  joDisplay: string       // "제22조"
  paragraph?: string      // 항번호 ("②")
  targetType: '시행령' | '시행규칙' | '고시등'
  rawText: string         // 원문 발췌 (위임 문구 포함 문장)
}

interface DelegationGapResult {
  clause: DelegationClause
  status: 'fulfilled' | 'missing' | 'partial'
  matchedDelegations: DelegationItem[]  // three-tier-parser의 기존 타입
  note?: string           // 부분 미비 사유 등
}

interface DelegationGapAnalysis {
  lawTitle: string
  lawId: string
  mst: string
  totalClauses: number
  missingCount: number
  partialCount: number
  fulfilledCount: number
  results: DelegationGapResult[]
  analyzedAt: string
}
```

#### 3.1.7 파일 구조

```
lib/delegation-gap/
├── patterns.ts          // 위임 패턴 regex
├── analyzer.ts          // 크로스체크 로직
└── types.ts             // 타입 정의

components/
└── delegation-gap-modal.tsx  // Modal UI
```

#### 3.1.8 기존 코드 재활용

| 기존 코드 | 재활용 부분 |
|----------|-----------|
| `lib/three-tier-parser.ts` | parseDelegation() → DelegationItem[] |
| `lib/law-parser.ts` | buildJO(), formatJoNum() — JO 코드 변환 |
| `/api/three-tier/route.ts` | API 엔드포인트 그대로 |
| `/api/eflaw/route.ts` | 법률 전문 조회 |

---

### 3.2 법령 타임머신 (TimeMachineModal)

#### 3.2.1 개요

특정 날짜를 입력하면 해당 시점에 유효했던 법령 텍스트를 복원하고, 현행법과의 차이를 diff 하이라이트로 표시한다.

#### 3.2.2 왜 ComparisonModal 확장인가

기존 ComparisonModal이 이미 제공하는 것:
- 좌/우 패널 sync-scroll diff 뷰
- 개정 이력 드롭다운
- 조문별 하이라이트
- 글자 크기 조절
- 반응형 UI

타임머신에 필요한 **추가 요소**:
- date picker (날짜 입력)
- "해당 시점 유효 버전" 자동 검색 로직
- 두 시점 사이 개정 이력 목록

#### 3.2.3 데이터 흐름

```
Input: LawMeta { lawTitle, mst, lawId } + targetDate: string (YYYY-MM-DD)
  │
  ├─[1] GET /api/law-history?lawName={lawTitle}&display=100&sort=efdes
  │     → HistoryItem[] { mst, efYd, ancNo, ancYd, rrCls, lawNm }
  │     → 캐시: 24h (기존 설정)
  │
  ├─[2] 해당 날짜에 유효한 버전 찾기 (클라이언트)
  │     const pastVersion = histories
  │       .filter(h => h.efYd <= targetDate)   // 시행일 ≤ 입력일
  │       .sort((a, b) => b.efYd.localeCompare(a.efYd))[0]  // 가장 최신
  │
  │     if (!pastVersion) → "해당 시점 이전 법령 이력 없음" 안내
  │
  ├─[3] 병렬 호출:
  │     GET /api/eflaw?ID={pastVersion.mst}  → 과거 법령 텍스트
  │     GET /api/eflaw?ID={현재mst}          → 현행 법령 텍스트
  │     (eflaw API는 MST로 특정 버전 조회 가능)
  │
  ├─[4] 두 버전 사이 개정 이력 필터링
  │     const betweenRevisions = histories.filter(
  │       h => h.efYd > pastVersion.efYd && h.efYd <= currentVersion.efYd
  │     )
  │
  └─[5] ComparisonModal의 기존 diff 렌더링에 데이터 전달
        좌측: "과거 ({targetDate} 기준)" — pastVersion 텍스트
        우측: "현행" — currentVersion 텍스트
        하단: 개정 이력 N건 목록
```

#### 3.2.4 ComparisonModal 확장 설계

```typescript
// 기존 ComparisonModal props 확장
interface ComparisonModalProps {
  isOpen: boolean
  onClose: () => void
  lawTitle: string

  // 기존 모드 (신구법 비교)
  mode?: 'compare'        // default
  lawId?: string
  mst?: string
  targetJo?: string

  // 타임머신 모드 (신규)
  mode?: 'timemachine'
  lawId?: string           // 법령ID
  mst?: string             // 현재 MST
  lawName?: string         // law-history API용 법령명
}
```

**내부 분기:**
- `mode === 'compare'` (기존): 이력 드롭다운 → oldnew API 호출
- `mode === 'timemachine'` (신규): date picker → law-history + eflaw 호출

#### 3.2.5 UI 변경 (타임머신 모드)

```
┌─ 법령 타임머신: 건축법 ─────────────────────────────────┐
│                                                        │
│  📅 기준일: [2020-03-15  📅]    [조회]                    │
│                                                        │
│  ℹ️ 적용 버전: 법률 제16738호 (2019.12.10 공포, 2020.01.01 시행) │
│                                                        │
│  ┌────── 과거 (2020.03.15 기준) ──┬──── 현행 ──────────┐ │
│  │                               │                    │ │
│  │ 제11조(건축허가)               │ 제11조(건축허가)    │ │
│  │ ① 건축물을 건축하거나...       │ ① 건축물을 건축하   │ │
│  │                               │ 거나... [변경부분]  │ │
│  │          (sync scroll)        │                    │ │
│  └───────────────────────────────┴────────────────────┘ │
│                                                        │
│  📋 이 기간 개정 이력 (3건)                               │
│  ├─ 2021.01.05 법률 제17893호 (일부개정)                  │
│  ├─ 2022.06.15 법률 제18935호 (타법개정)                  │
│  └─ 2024.01.01 법률 제19456호 (일부개정)                  │
│                                                        │
│                                          [닫기]         │
└────────────────────────────────────────────────────────┘
```

#### 3.2.6 파일 구조

```
lib/time-machine/
└── version-finder.ts    // 날짜 → MST 매핑 로직

components/
└── comparison-modal.tsx  // 기존 파일에 mode='timemachine' 분기 추가
```

#### 3.2.7 기존 코드 재활용

| 기존 코드 | 재활용 부분 |
|----------|-----------|
| `components/comparison-modal.tsx` | diff 뷰, sync-scroll, 글자크기, 전체 UI 프레임 |
| `/api/law-history/route.ts` | 연혁 조회 (24h 캐시) |
| `/api/eflaw/route.ts` | 특정 MST 법령 텍스트 조회 |
| `lib/law-parser.ts` | 조문 파싱 |

---

### 3.3 영향 추적기 확장 (미반영 탐지 모드 흡수)

#### 3.3.1 개요

기존 영향 추적기에 "조례 미반영 탐지" 모드를 추가한다. 기존 B방향 분석의 자연스러운 확장으로, 같은 SSE 파이프라인과 카드 UI를 재활용한다.

#### 3.3.2 모드 구분

| | 변경 영향 분석 (기존) | 조례 미반영 탐지 (신규) |
|---|---|---|
| 입력 | 법령/조례명 + 기간 | 조례명 또는 법률명 + 기간 |
| 분석 방향 | A방향(법률→하위) + B방향(조례→상위) | B방향 특화 + 미반영 판정 |
| 핵심 출력 | 개정된 조항 + 영향받는 하위법령 | 상위법 개정됐는데 조례가 안 바뀐 조항 |
| 심각도 분류 | critical/review/info | 미반영(위험)/확인필요/최신 |

#### 3.3.3 ImpactTrackerInput 변경

```typescript
// 기존 ImpactTrackerRequest 타입 확장
interface ImpactTrackerRequest {
  lawNames: string[]
  dateFrom: string
  dateTo: string
  region?: string
  mode?: 'impact' | 'ordinance-sync'  // 신규 필드
}
```

**UI 변경**: 입력 폼 상단에 모드 토글 추가

```
┌─ 법령 분석 ──────────────────────────────────────┐
│                                                  │
│  📊 분석 유형:                                     │
│  ┌─────────────────┐ ┌────────────────────┐       │
│  │ ● 변경 영향 분석  │ │ ○ 조례 미반영 탐지  │       │
│  └─────────────────┘ └────────────────────┘       │
│                                                  │
│  (이하 기존 입력 폼 동일)                            │
└──────────────────────────────────────────────────┘
```

#### 3.3.4 미반영 판정 로직

```typescript
// lib/impact-tracker/ordinance-sync.ts

interface OrdinanceSyncResult {
  ordinanceName: string
  ordinanceLastRevised: string    // 조례 최종 개정일
  parentLawName: string
  parentLawArticle: string        // 상위법 조문
  parentLawRevisedDate: string    // 상위법 개정일
  syncStatus: 'outdated' | 'check-needed' | 'up-to-date'
  daysBehind: number              // 상위법 개정 후 경과일
  detail: string                  // 변경 내용 요약
}

// 판정 기준:
// - outdated: 상위법 개정일 > 조례 최종개정일 (확실한 미반영)
// - check-needed: 상위법 개정일 < 조례 최종개정일이지만,
//                 해당 조문 관련 개정인지 불확실
// - up-to-date: 상위법 개정 이후 조례도 개정됨
```

#### 3.3.5 법령 뷰어에서 진입 시 자동 입력

```typescript
// page.tsx에서 영향 추적기로 전환 시
const handleImpactTrackerFromViewer = (lawName: string, mode: 'impact' | 'ordinance-sync') => {
  requireAuth(() => {
    const request: ImpactTrackerRequest = {
      lawNames: [lawName],
      dateFrom: getDateMonthsAgo(mode === 'ordinance-sync' ? 12 : 3),
      dateTo: new Date().toISOString().slice(0, 10),
      mode,
    }
    pushImpactTrackerHistory(request)
    setViewMode('impact-tracker')
    setImpactKey(k => k + 1)
    setImpactRequest(request)  // 자동 시작 트리거
  })
}
```

**핵심**: `impactRequest`가 설정되면 `ImpactTrackerView`가 마운트 시 자동으로 분석을 시작한다 (기존 `initialRequest` prop 활용).

#### 3.3.6 영향 추적기 Phase 4 하드닝 (동시 진행)

이 확장과 함께 미완료된 Phase 4도 처리:

| 항목 | 상세 |
|------|------|
| localStorage 캐싱 (24h TTL) | 분석 결과를 캐싱, 동일 요청 시 즉시 표시 |
| 타임라인 뷰 토글 | 분석 단계별 타임라인 ↔ 카드 뷰 전환 |
| 단위 테스트 | result-parser, classifier에 대한 Jest 테스트 |

---

### 3.4 조례 벤치마킹 (OrdinanceBenchmarkView)

#### 3.4.1 개요

동일 주제의 조례를 전국 지자체별로 검색·비교하여 비교표를 생성한다.

#### 3.4.2 왜 ViewMode인가

- **출력이 큼**: 최대 17개 시도 × 조례 비교표 → 스크롤 필요
- **2단계 프로세스**: 검색 → (선택적) AI 비교 분석
- **독립적 작업 흐름**: 법령 뷰어와 무관하게 사용 가능

#### 3.4.3 데이터 흐름

```
Input: { keyword: string, ordinKind?: string, scope: 'metro' | 'basic' | 'all' }
  │
  ├─[Phase 1: 병렬 검색]
  │   17개 광역시도 코드로 병렬 search_ordinance:
  │   GET /api/ordin-search?query={keyword}&org={orgCode}&knd=30001&display=5
  │
  │   광역시도 코드:
  │   서울(1100000), 부산(2600000), 대구(2700000), 인천(2800000),
  │   광주(2900000), 대전(3000000), 울산(3100000), 세종(3600000),
  │   경기(4100000), 강원(5100000), 충북(4300000), 충남(4400000),
  │   전북(4500000), 전남(4600000), 경북(4700000), 경남(4800000),
  │   제주(5000000)
  │
  │   → 결과 수집: { orgName, ordinName, ordinSeq, effectiveDate }[]
  │
  ├─[Phase 2: 결과 표시]
  │   매칭된 조례 목록을 테이블로 표시
  │   각 행: 지자체명, 조례명, 시행일, 주요 내용(발췌)
  │
  └─[Phase 3: AI 비교 분석 (선택적, 버튼 클릭)]
      상위 5~10개 조례 본문 → FC-RAG 엔진에 비교 분석 요청
      → 핵심 비교 항목 추출 (지원금액, 자격요건, 기준치 등)
      → 구조화된 비교표 생성
```

#### 3.4.4 ViewMode 등록

```typescript
// app/page.tsx
type ViewMode = 'home' | 'search-result' | 'precedent-detail' | 'impact-tracker' | 'ordinance-benchmark'

// History API 지원
function pushBenchmarkHistory(params: { keyword: string, scope: string }) {
  window.history.pushState(
    { viewMode: 'ordinance-benchmark', ...params },
    '',
    window.location.pathname
  )
}
```

#### 3.4.5 UI 구성

```
┌─ 조례 벤치마킹 ──────────────────────────────────────────┐
│  [← 뒤로]                                     [🏠 홈]    │
│                                                          │
│  🔍 주제 검색                                              │
│  ┌──────────────────────┐ ┌────────┐ ┌────────┐          │
│  │ 출산장려금             │ │조례 종류▾│ │광역시도▾│ [검색]   │
│  └──────────────────────┘ └────────┘ └────────┘          │
│                                                          │
│  ━━━ 검색 결과: 17개 시도 중 14개 매칭 ━━━━━━━━━━━━━━━━━━  │
│                                                          │
│  ┌────────┬──────────────────┬──────────┬────────────────┐│
│  │ 지자체  │ 조례명            │ 시행일    │ 비고           ││
│  ├────────┼──────────────────┼──────────┼────────────────┤│
│  │ 서울   │ 서울특별시 출산    │ 2025.01  │ 첫째 100만,    ││
│  │        │ 장려금 지급 조례   │          │ 셋째 300만     ││
│  ├────────┼──────────────────┼──────────┼────────────────┤│
│  │ 부산   │ 부산광역시 출산    │ 2024.06  │ 첫째 50만,     ││
│  │        │ 지원금 조례       │          │ 셋째 200만     ││
│  │ ...    │                  │          │                ││
│  └────────┴──────────────────┴──────────┴────────────────┘│
│                                                          │
│  [AI 비교 분석 요청]  ← Phase 3                            │
│                                                          │
│  (AI 분석 결과 영역 — 접이식)                                │
│  ┌──────────────────────────────────────────────────────┐│
│  │ 📊 AI 비교 분석 결과                                   ││
│  │                                                      ││
│  │ | 항목      | 서울    | 부산   | 세종   | ...          ││
│  │ |-----------|---------|--------|--------|             ││
│  │ | 첫째 지원금 | 100만원 | 50만원 | 200만원|             ││
│  │ | 소득 기준  | 없음    | 중위80%| 없음   |             ││
│  │ | 거주 요건  | 1년    | 6개월  | 3개월  |              ││
│  │                                                      ││
│  │ 💡 선진 사례: 세종시 — 가장 높은 지원금, 소득기준 없음    ││
│  └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

#### 3.4.6 API 호출 최적화

- **병렬 호출**: 17개 시도 동시 검색 → `Promise.allSettled()`
- **캐싱**: 검색 결과 24h localStorage 캐시 (키: `benchmark:${keyword}:${scope}`)
- **Rate Limiting 대응**: 한 번에 최대 6개씩 batch 처리 (법제처 API 부하 방지)

```typescript
// lib/ordinance-benchmark/searcher.ts
async function searchAllMunicipalities(
  keyword: string,
  orgCodes: string[],
  options: { batchSize?: number, delayMs?: number }
): Promise<Map<string, OrdinanceSearchResult[]>> {
  const { batchSize = 6, delayMs = 200 } = options
  const results = new Map()

  for (let i = 0; i < orgCodes.length; i += batchSize) {
    const batch = orgCodes.slice(i, i + batchSize)
    const batchResults = await Promise.allSettled(
      batch.map(code => fetchOrdinanceSearch(keyword, code))
    )
    // ... 결과 수집
    if (i + batchSize < orgCodes.length) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
  return results
}
```

#### 3.4.7 파일 구조

```
lib/ordinance-benchmark/
├── searcher.ts          // 병렬 조례 검색 + 배치 처리
├── municipality-codes.ts // 광역시도/기초지자체 코드 매핑
└── types.ts             // 타입 정의

components/ordinance-benchmark/
├── ordinance-benchmark-view.tsx   // 메인 뷰 (ViewMode)
├── benchmark-input.tsx            // 검색 입력
├── benchmark-result-table.tsx     // 결과 테이블
└── benchmark-ai-analysis.tsx      // AI 비교 분석 (Phase 3)

hooks/
└── use-ordinance-benchmark.ts     // 상태 관리 훅
```

---

## 4. ViewMode 및 History 통합

### 4.1 ViewMode 확장

```typescript
// app/page.tsx
type ViewMode =
  | 'home'
  | 'search-result'
  | 'precedent-detail'
  | 'impact-tracker'           // 기존
  | 'ordinance-benchmark'      // 신규
```

**참고**: 위임 미비 탐지와 타임머신은 Modal이므로 ViewMode 추가 불필요.

### 4.2 History State 타입

```typescript
interface HistoryState {
  viewMode: ViewMode
  // search-result
  searchId?: string
  searchMode?: string
  // precedent-detail
  precedentId?: string
  // impact-tracker (기존 + mode 추가)
  lawNames?: string[]
  dateFrom?: string
  dateTo?: string
  region?: string
  mode?: 'impact' | 'ordinance-sync'
  // ordinance-benchmark (신규)
  benchmarkKeyword?: string
  benchmarkScope?: string
}
```

### 4.3 onPopState 핸들러 확장

```typescript
// page.tsx popstate 리스너에 추가
if (state.viewMode === 'ordinance-benchmark') {
  setViewMode('ordinance-benchmark')
  // benchmark 상태 복원은 컴포넌트 내부에서 처리
}
```

---

## 5. 법령 뷰어 → 도구 연결 인터페이스

### 5.1 SearchResultView 콜백 확장

```typescript
// 기존 SearchResultView → LawViewer 전달 콜백에 추가

// Modal 도구용 (SearchResultView 내에서 처리)
onDelegationGap?: (meta: LawMeta) => void
onTimeMachine?: (meta: LawMeta) => void

// ViewMode 도구용 (page.tsx까지 버블업)
onImpactTrackerFromViewer?: (lawName: string, mode: 'impact' | 'ordinance-sync') => void
onOrdinanceBenchmark?: (lawName: string) => void
```

### 5.2 콜백 흐름

```
LawViewerAnalysisMenu (드롭다운 클릭)
  │
  ├─ [위임 미비] → onDelegationGap(meta)
  │   → SearchResultView 내에서 DelegationGapModal 열기
  │
  ├─ [타임머신] → onTimeMachine(meta)
  │   → SearchResultView 내에서 ComparisonModal(mode='timemachine') 열기
  │
  ├─ [변경 영향] → onImpactTrackerFromViewer(lawTitle, 'impact')
  │   → page.tsx → setViewMode('impact-tracker') + 자동 입력
  │
  ├─ [미반영 탐지] → onImpactTrackerFromViewer(lawTitle, 'ordinance-sync')
  │   → page.tsx → setViewMode('impact-tracker') + 미반영 모드
  │
  └─ [조례 벤치마킹] → onOrdinanceBenchmark(ordinanceName)
      → page.tsx → setViewMode('ordinance-benchmark') + 키워드 입력
```

---

## 6. 구현 Phase

### Phase 1: 기반 + 위임 미비 + 타임머신 (1.5~2주)

**Step 1.1 — 법령 뷰어 분석 도구 드롭다운 (2일)**
- [ ] `law-viewer-analysis-menu.tsx` 컴포넌트 생성
- [ ] `law-viewer-action-buttons.tsx`에 드롭다운 통합
- [ ] `law-viewer-ordinance-actions.tsx`에 드롭다운 통합
- [ ] 콜백 인터페이스 연결 (SearchResultView → page.tsx)

**Step 1.2 — 위임 미비 탐지기 (3~4일)**
- [ ] `lib/delegation-gap/patterns.ts` — 위임 패턴 regex
- [ ] `lib/delegation-gap/analyzer.ts` — 크로스체크 로직
- [ ] `lib/delegation-gap/types.ts` — 타입 정의
- [ ] `components/delegation-gap-modal.tsx` — Modal UI
- [ ] 테스트: 건축법, 개인정보보호법으로 E2E 검증

**Step 1.3 — 법령 타임머신 (3~4일)**
- [ ] `lib/time-machine/version-finder.ts` — 날짜→MST 매핑
- [ ] `components/comparison-modal.tsx` — mode='timemachine' 분기 추가
- [ ] date picker UI + 이력 목록 표시
- [ ] 테스트: 건축법 2020-01-01 기준 조회 E2E 검증

### Phase 2: 영향 추적기 확장 + 하드닝 (1.5~2주)

**Step 2.1 — 영향 추적기 하드닝 (3일)**
- [ ] localStorage 캐싱 (24h TTL) 구현
- [ ] result-parser 단위 테스트
- [ ] classifier 단위 테스트

**Step 2.2 — 미반영 탐지 모드 (4~5일)**
- [ ] `ImpactTrackerRequest`에 `mode` 필드 추가
- [ ] `ImpactTrackerInput`에 모드 토글 UI
- [ ] `lib/impact-tracker/ordinance-sync.ts` — 미반영 판정 로직
- [ ] `impact-tracker/engine.ts` — mode='ordinance-sync' 분기
- [ ] ImpactCard에 미반영 상태 배지 추가
- [ ] 법령 뷰어 → 영향 추적기 자동 입력 연결

**Step 2.3 — 법령 뷰어 연결 (1일)**
- [ ] page.tsx `handleImpactTrackerFromViewer()` 구현
- [ ] 조례 뷰어에서 미반영 탐지 버튼 → 자동 전환 테스트

### Phase 3: 조례 벤치마킹 + 홈 UI (2~3주)

**Step 3.1 — 벤치마킹 백엔드 (4~5일)**
- [ ] `lib/ordinance-benchmark/municipality-codes.ts` — 지자체 코드
- [ ] `lib/ordinance-benchmark/searcher.ts` — 병렬 검색 + 배치
- [ ] `lib/ordinance-benchmark/types.ts` — 타입 정의
- [ ] API 호출 최적화 (batch + delay)

**Step 3.2 — 벤치마킹 UI (3~4일)**
- [ ] `components/ordinance-benchmark/ordinance-benchmark-view.tsx` — 메인
- [ ] `components/ordinance-benchmark/benchmark-input.tsx` — 입력
- [ ] `components/ordinance-benchmark/benchmark-result-table.tsx` — 테이블
- [ ] `hooks/use-ordinance-benchmark.ts` — 상태 훅
- [ ] ViewMode 등록 + History 연동

**Step 3.3 — AI 비교 분석 (2~3일)**
- [ ] FC-RAG 엔진에 비교 분석 프롬프트 추가
- [ ] `benchmark-ai-analysis.tsx` — AI 결과 표시
- [ ] 캐싱 (24h localStorage)

**Step 3.4 — 홈 페이지 리디자인 (2~3일)**
- [ ] 브랜딩 카드 3개로 통폐합
- [ ] 도구 카드 5개 추가 (별도 시각 스타일)
- [ ] 도구 카드 클릭 → 각 도구 진입 연결
- [ ] Modal 도구용 법령 선택 다이얼로그

---

## 7. 기존 인프라 재활용 매핑

| 기존 자산 | 파일 | 재활용하는 도구 |
|----------|------|----------------|
| three-tier-parser | `lib/three-tier-parser.ts` | 위임 미비 탐지 |
| three-tier API | `/api/three-tier/route.ts` | 위임 미비 탐지 |
| law-parser (JO 변환) | `lib/law-parser.ts` | 위임 미비 탐지, 타임머신 |
| eflaw API | `/api/eflaw/route.ts` | 위임 미비 탐지, 타임머신 |
| law-history API | `/api/law-history/route.ts` | 타임머신 |
| ComparisonModal | `components/comparison-modal.tsx` | 타임머신 |
| impact-tracker engine | `lib/impact-tracker/engine.ts` | 미반영 탐지 |
| impact-tracker UI | `components/impact-tracker/*` | 미반영 탐지 |
| ordinance-analyzer | `lib/impact-tracker/ordinance-analyzer.ts` | 미반영 탐지 |
| ordin-search API | `/api/ordin-search/route.ts` | 벤치마킹 |
| search-suggest API | `/api/search-suggest/route.ts` | 홈 도구 법령 선택 |
| FC-RAG engine | `lib/fc-rag/engine.ts` | 벤치마킹 AI 분석 |

---

## 8. 리스크 및 대응

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 위임 패턴 regex false positive | 위임 미비 오탐 | EXCLUSION_PATTERNS으로 필터 + 사용자 피드백 반영 |
| law-history API 정확도 | 타임머신 잘못된 버전 표시 | efYd(시행일) 기반 정확한 필터링, 경계 케이스 테스트 |
| 법제처 API rate limiting | 벤치마킹 검색 실패 | batch 처리(6개씩) + 200ms delay + 실패 시 retry |
| 조례 검색 결과 부정확 매칭 | 벤치마킹 비교 오류 | 키워드 매칭 + 사용자가 비교 대상 수동 선택 가능 |
| 영향 추적기 mode 분기 복잡도 | 코드 유지보수 어려움 | engine.ts 공통 로직 분리, 모드별 전략 패턴 |

---

## 9. 성공 지표

| 지표 | 목표 |
|------|------|
| 위임 미비 탐지 정확도 | ≥ 90% (건축법, 개인정보보호법 기준) |
| 타임머신 버전 매칭 정확도 | 100% (시행일 기반 결정적 로직) |
| 벤치마킹 검색 완료율 | ≥ 15/17 시도 (API 장애 시에도) |
| 미반영 탐지 판정 정확도 | ≥ 85% (개정일 비교 기반) |
| 분석 도구 진입 → 결과 확인 시간 | Modal: < 5초, ViewMode: < 15초 |

---

## 10. 향후 확장 (Scope 외, 참고용)

이 PRD 범위에서 **의도적으로 제외**한 기능들:

| 기능 | 제외 사유 | 도입 시기 |
|------|----------|----------|
| 기안문 자동 생성 | AI 오답 → 법적 책임 리스크 | 사용자 신뢰 확보 후 |
| 민원 회신 보조 | 동일 리스크 | 사용자 신뢰 확보 후 |
| 개정 영향 시뮬레이터 | 사전 예측 정확도 불확실 | 영향 추적기 안정화 후 |
| 해석 충돌 탐지기 | AI "모순 판단" 신뢰도 문제 | 장기 R&D |
| 일일 법령 브리핑 | 구독/알림 인프라 신규 필요 | 별도 프로젝트 |

---

**문서 버전**: 1.0
**작성일**: 2026-03-15
**다음 단계**: Phase 1 구현 시작 (별도 세션)
