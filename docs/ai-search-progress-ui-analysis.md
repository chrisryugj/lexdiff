# AI 법령 검색 프로그래스바 UI 분석 및 개선 계획서

**작성일**: 2025-12-18
**Phase**: 11 (Progress UI Enhancement)
**우선순위**: 중간

---

## 1. 현재 구현 분석

### 1.1 관련 파일 구조

```
components/
├── search-progress.tsx              # 스테이지 기반 진행 표시 (미사용)
├── file-search-answer-display.tsx   # RAG 답변 표시 + 내장 프로그래스
├── ui/
│   ├── progress.tsx                 # Radix UI 기본 프로그래스
│   └── modern-progress-bar.tsx      # 그라디언트 프로그래스 (search-result-view용)
└── search-result-view/
    ├── index.tsx                    # ModernProgressBar 사용
    └── hooks/
        ├── useSearchState.ts        # searchProgress, searchStage 상태
        └── useSearchHandlers.ts     # 진행률 업데이트 로직
```

### 1.2 현재 진행 단계 (file-search-answer-display.tsx)

| 진행률 | 단계 | 상태 메시지 |
|--------|------|-------------|
| 0% | 초기 | - |
| 10% | 연결 시작 | 📚 법령 데이터베이스 검색 중... |
| 20% | 연결 완료 | 📚 법령 데이터베이스 검색 중... |
| 35% | 스트림 시작 | 🔍 관련 조문 분석 중... |
| 50-95% | 청크 수신 | ✍️ AI 답변 생성 중... |
| 100% | 완료 | ✨ 완료! |

### 1.3 코드 분석

```typescript
// file-search-answer-display.tsx:444-519
setProgress(10)  // 연결 시작
const response = await fetch('/api/file-search-rag', {...})
setProgress(20)  // 연결 완료
setProgress(35)  // 스트림 시작

while (true) {
  // 청크 수신
  setProgress(Math.min(50 + Math.floor(chunkCount * 1.5), 95))
}
setProgress(100)
```

---

## 2. 문제점 분석

### 2.1 구조적 문제

#### P1. 2-Tier AI Router 단계 누락 (Critical)

**현재**: 사용자에게 AI Router 분석 단계가 보이지 않음

**기대**: Phase 10에서 구현된 2-Tier 구조 반영
```
[현재 흐름]
연결 → 검색 → 스트리밍 → 완료

[실제 흐름 (Phase 10)]
AI Router 분석 → 검색 최적화 → RAG 검색 → 스트리밍 → 완료
   (~0.5초)      (내부 처리)     (1-2초)     (2-3초)
```

#### P2. 진행률 불연속성 (High)

```
10% → 20% → 35% → 50% (급격한 점프)
                  ↓
              50% → 51% → 52% ... 95% (점진적, 청크 기반)
```

- 초반 구간(0-50%)에서 급격한 점프로 사용자 경험 저하
- 청크 기반 증가는 네트워크 상태에 따라 불규칙

#### P3. 상태 메시지 단순화 (Medium)

현재 3개의 메시지만 사용:
- "법령 데이터베이스 검색 중"
- "관련 조문 분석 중"
- "AI 답변 생성 중"

실제 처리되는 단계:
1. AI Router: 질문 분석 및 분류
2. AI Router: 검색 키워드 추출
3. AI Router: 연관 용어 확장
4. RAG: File Search Store 검색
5. RAG: 관련 청크 매칭
6. RAG: 답변 생성 (스트리밍)
7. RAG: Citation 추출

### 2.2 UX 문제

#### P4. 정보 부족 (Medium)

- 예상 소요 시간 없음
- 검색 품질/깊이 표시 없음
- 어떤 검색 전략(exact/semantic/hybrid)인지 알 수 없음

#### P5. 오류 상태 피드백 없음 (Medium)

- AI Router 실패 → Fallback 발생 시 사용자에게 알림 없음
- 네트워크 재시도 중에도 동일한 메시지 표시

#### P6. 검색 결과 메타정보 없음 (Low)

- 분류된 질문 유형 표시 없음
- 검색된 도메인(관세/행정/공무원) 표시 없음
- 추출된 키워드 표시 없음

### 2.3 기술적 문제

#### P7. 중복 컴포넌트 (Low)

- `search-progress.tsx`: 5단계 AI 스테이지 정의 (미사용)
- `modern-progress-bar.tsx`: 그라디언트 스타일 (search-result-view에서 사용)
- `file-search-answer-display.tsx`: 자체 Progress 컴포넌트 사용

세 곳에서 서로 다른 스테이지 정의 사용

#### P8. 타입 불일치

```typescript
// useSearchState.ts:72
aiQueryType: 'definition' | ... | 'scope'  // 7개

// legal-query-analyzer.ts (Phase 10 이후)
LegalQueryType = ... | 'exemption'  // 8개
```

---

## 3. 개선 방안

### 3.1 단계별 개선 로드맵

#### Phase 11-A: 2-Tier 구조 반영 (High Priority)

**목표**: AI Router 단계를 프로그래스에 반영

**새로운 스테이지 정의**:
```typescript
type AISearchStage =
  | 'analyzing'    // AI Router: 질문 분석 (0-15%)
  | 'optimizing'   // AI Router: 검색 최적화 (15-25%)
  | 'searching'    // RAG: File Search (25-40%)
  | 'streaming'    // RAG: 답변 생성 (40-95%)
  | 'extracting'   // RAG: Citation 추출 (95-99%)
  | 'complete'     // 완료 (100%)
```

**상태 메시지 개선**:
```typescript
const STAGE_MESSAGES: Record<AISearchStage, string> = {
  analyzing: '🧠 질문 분석 중...',
  optimizing: '🔧 검색어 최적화 중...',
  searching: '📚 법령 데이터베이스 검색 중...',
  streaming: '✍️ AI 답변 생성 중...',
  extracting: '📎 인용 조문 추출 중...',
  complete: '✨ 완료!'
}
```

#### Phase 11-B: 진행률 보간 (Medium Priority)

**목표**: 부드러운 진행 애니메이션

```typescript
// 선형 보간 대신 이징 함수 사용
function smoothProgress(current: number, target: number, duration: number) {
  return current + (target - current) * easeOutCubic(elapsed / duration)
}

// 구간별 가중치 적용
const STAGE_WEIGHTS = {
  analyzing: 15,   // 0-15%
  optimizing: 10,  // 15-25%
  searching: 15,   // 25-40%
  streaming: 55,   // 40-95% (가장 긴 구간)
  extracting: 4,   // 95-99%
  complete: 1      // 100%
}
```

#### Phase 11-C: 메타정보 표시 (Low Priority)

**목표**: 검색 품질 정보 제공

```
┌─────────────────────────────────────────┐
│ 🧠 질문 분석 완료                        │
│ • 유형: 요건 질문 (requirement)          │
│ • 도메인: 관세법                         │
│ • 키워드: 신고납부, 요건, 관세법 제38조   │
└─────────────────────────────────────────┘
```

### 3.2 컴포넌트 통합 계획

**Before**:
```
search-progress.tsx (미사용)
modern-progress-bar.tsx (search-result-view)
file-search-answer-display.tsx (자체 Progress)
```

**After**:
```
ai-search-progress/
├── index.tsx           # 메인 컴포넌트
├── ProgressBar.tsx     # 프로그래스바 UI
├── StageIndicator.tsx  # 단계별 아이콘/메시지
├── MetaInfo.tsx        # 검색 메타정보 표시
└── types.ts            # 타입 정의
```

### 3.3 데이터 흐름 개선

**현재**:
```
file-search-client.ts
    ↓ (routingInfo in final yield)
file-search-answer-display.tsx
    ↓ (진행률만 표시)
UI
```

**개선 후**:
```
file-search-client.ts
    ↓ (routingInfo 즉시 전달)
file-search-answer-display.tsx
    ↓ (단계별 상태 + 메타정보)
ai-search-progress/
    ↓ (시각화)
UI
```

---

## 4. 구현 명세

### 4.1 새로운 타입 정의

```typescript
// lib/ai-search-progress/types.ts

export type AISearchStage =
  | 'idle'
  | 'analyzing'
  | 'optimizing'
  | 'searching'
  | 'streaming'
  | 'extracting'
  | 'complete'
  | 'error'

export interface AISearchProgressState {
  stage: AISearchStage
  progress: number  // 0-100
  message: string

  // 메타정보 (AI Router 결과)
  meta?: {
    queryType?: string
    domain?: string
    keywords?: string[]
    strategy?: 'exact' | 'semantic' | 'hybrid'
    routingTimeMs?: number
  }

  // 에러 정보
  error?: {
    code: string
    message: string
    isRetrying: boolean
  }

  // 타이밍
  startedAt: number
  estimatedTotalMs?: number
}

export interface ProgressUpdateEvent {
  stage: AISearchStage
  progress: number
  message?: string
  meta?: AISearchProgressState['meta']
}
```

### 4.2 SSE 이벤트 확장

```typescript
// app/api/file-search-rag/route.ts

// 기존 이벤트
{ type: 'text', text: '...' }
{ type: 'citations', citations: [...] }

// 신규 이벤트
{ type: 'stage', stage: 'analyzing', message: '질문 분석 중...' }
{ type: 'stage', stage: 'optimizing', message: '검색어 최적화 중...' }
{ type: 'routing_complete', meta: { queryType, domain, keywords, ... } }
{ type: 'stage', stage: 'searching', message: '법령 검색 중...' }
```

### 4.3 프로그래스바 컴포넌트 API

```typescript
// components/ai-search-progress/index.tsx

interface AISearchProgressProps {
  state: AISearchProgressState

  // 스타일
  variant?: 'minimal' | 'detailed' | 'card'
  showMeta?: boolean
  showEstimate?: boolean

  // 콜백
  onCancel?: () => void
}

export function AISearchProgress({
  state,
  variant = 'detailed',
  showMeta = true,
  showEstimate = false,
  onCancel
}: AISearchProgressProps) {
  // ...
}
```

---

## 5. 예상 UI 디자인

### 5.1 Minimal 버전 (현재 유사)

```
AI 법령 검색 중...                    45%
[████████████░░░░░░░░░░░░░░░░░]
🔧 검색어 최적화 중...
```

### 5.2 Detailed 버전 (권장)

```
┌─────────────────────────────────────────────────┐
│  AI 법령 검색                              45%  │
│  [████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░]    │
│                                                 │
│  ✅ 질문 분석        ✅ 검색 최적화             │
│  🔄 법령 검색        ○ 답변 생성                │
│  ○ 인용 추출                                   │
│                                                 │
│  📋 요건 질문 • 관세법 도메인                   │
│  🔑 신고납부, 요건, 제38조                      │
└─────────────────────────────────────────────────┘
```

### 5.3 Card 버전 (모바일)

```
┌───────────────────────────┐
│ 🧠 질문 분석 완료          │
│    요건 질문 (관세법)      │
├───────────────────────────┤
│ ████████░░░░░░░░░░  45%  │
│ 🔧 검색어 최적화 중...     │
└───────────────────────────┘
```

---

## 6. 구현 일정

| 단계 | 작업 | 예상 시간 |
|------|------|-----------|
| 11-A-1 | 타입 정의 및 상수 | 0.5h |
| 11-A-2 | SSE 이벤트 확장 | 1h |
| 11-A-3 | 프로그래스 컴포넌트 구현 | 2h |
| 11-A-4 | file-search-answer-display 통합 | 1h |
| 11-B-1 | 진행률 보간 함수 | 0.5h |
| 11-B-2 | 애니메이션 적용 | 0.5h |
| 11-C-1 | 메타정보 UI 구현 | 1h |
| 11-C-2 | 에러 상태 UI 구현 | 0.5h |
| **합계** | | **7h** |

---

## 7. 성공 지표

| 지표 | 현재 | 목표 |
|------|------|------|
| 스테이지 수 | 3개 | 6개 |
| 진행률 업데이트 빈도 | 불규칙 | 100ms 간격 |
| 메타정보 표시 | 없음 | 3개 이상 |
| 에러 피드백 | 없음 | 즉시 표시 |

---

## 8. 참고 자료

- Phase 10 PRD: `docs/ai-question-routing-prd.md`
- AI Router 구현: `lib/ai-agents/router-agent.ts`
- 현재 프로그래스: `components/file-search-answer-display.tsx`
