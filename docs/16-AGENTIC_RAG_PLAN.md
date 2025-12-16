# Agentic RAG 구현 계획서 (통합본)

> **생성일**: 2025-12-14
> **버전**: 1.0 (코덱스 계획서 + 시뮬레이션 분석 통합)
> **목표**: RAG DB에 없는 법령은 조건부 API 호출, 판례는 항상 실시간 검색하여 AI 답변 품질 향상

---

## 1. 개요

### 1.1 핵심 전략

| 데이터 | 전략 | 이유 |
|--------|------|------|
| **법령** | RAG DB 미스 시에만 API 호출 | DB에 이미 있으면 중복 호출 불필요 |
| **판례** | 항상 실시간 검색 + 요약 | DB에 판례 전체를 넣기 어려움 |

### 1.2 아키텍처 방식 선택

**서버 오케스트레이터 방식 (권장)**
- 기존 SSE 스트리밍 + 인용 기반 신뢰도 흐름과 호환
- File Search RAG 결과를 먼저 확인 → 부족 시 실시간 API 호출
- Gemini Tool Calling 방식보다 안정적이고 제어 가능

---

## 2. 비용 분석 (Gemini 2.5 Flash)

### 2.1 단가 (2025년 12월 기준)

| 항목 | 단가 |
|------|------|
| 입력 토큰 (≤200K) | $0.15 / 1M tokens |
| 출력 토큰 (thinking off) | $0.60 / 1M tokens |
| 출력 토큰 (thinking on) | $3.50 / 1M tokens |

> **참고**: Thinking 모드는 사용하지 않음 (비용 효율)

### 2.2 쿼리당 비용 비교

| 항목 | 현재 | 개선 | 차이 |
|------|------|------|------|
| 입력 토큰 | ~700 | ~1,500 | +800 |
| 출력 토큰 | ~500 | ~700 | +200 |
| **입력 비용** | $0.000105 | $0.000225 | +$0.000120 |
| **출력 비용** | $0.000300 | $0.000420 | +$0.000120 |
| **총 비용/쿼리** | **$0.000405** | **$0.000645** | **+59%** |

### 2.3 월간 비용 예측 (100 사용자 기준)

| 시나리오 | 1인 일일 질의 | 월 질의 | 현재 비용 | 개선 비용 |
|----------|-------------|--------|----------|----------|
| 기본 | 1회 | 3,000 | $1.22 | $1.94 |
| 활발 | 2회 | 6,000 | $2.43 | $3.87 |
| 헤비 | 5회 | 15,000 | $6.08 | $9.68 |

> **결론**: 비용 증가 약 60%이나 절대 금액은 매우 낮음 (월 $10 미만)

---

## 3. 응답 시간 분석

### 3.1 단계별 소요 시간

| 단계 | 현재 | 개선 | 비고 |
|------|------|------|------|
| 쿼리 분석 | - | +100ms | 법령/판례 키워드 추출 |
| RAG 검색 | 200ms | 200ms | 기존 유지 |
| 법령 API (조건부) | - | +300ms | 50% 확률로 호출 |
| 판례 API | - | +500ms | 항상 호출 |
| Gemini 생성 | 2,000ms | 2,200ms | 컨텍스트 증가 |
| **총합** | **~2.2초** | **~3.0~3.5초** | **+0.8~1.3초** |

### 3.2 최적화 전략

1. **병렬 호출**: RAG + 판례 API 동시 실행
2. **조건부 호출**: 법령은 RAG 미스 시에만
3. **캐싱**: 자주 검색되는 판례 1시간 캐시

---

## 4. 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│                        사용자 질문                                   │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 1: Query Analysis                                             │
│  ─────────────────────────────────────────────────────────────────  │
│  • 질문 유형 분류 (6가지: definition/requirement/procedure/         │
│    comparison/application/consequence)                              │
│  • 법령명/조문 추출 (extractedLaws, extractedArticles)              │
│  • [NEW] 판례 검색 키워드 추출 (precedentKeywords)                  │
│  • [NEW] 판례 필요도 판단 (needsPrecedent: boolean)                 │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 2: 병렬 데이터 수집                                            │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ RAG 검색     │  │ 판례 검색    │  │              │              │
│  │ (기존)       │  │ (항상)       │  │              │              │
│  │   ~200ms     │  │   ~500ms     │  │              │              │
│  └──────┬───────┘  └──────┬───────┘  │              │              │
│         │                 │          │              │              │
│         ▼                 ▼          │              │              │
│  ┌──────────────┐  ┌──────────────┐  │              │              │
│  │ citations    │  │ 판례 목록    │  │              │              │
│  │ 검증         │  │ (상위 3~5개) │  │              │              │
│  └──────┬───────┘  └──────┬───────┘  │              │              │
│         │                 │          │              │              │
│         ▼                 ▼          │              │              │
│  ┌─────────────────────────────────┐ │              │              │
│  │ RAG 미스 감지?                  │ │              │              │
│  │ (citations.length == 0 OR      │ │              │              │
│  │  extractedLaws not in citations)│ │              │              │
│  └──────┬──────────────────────────┘ │              │              │
│         │ Yes                        │              │              │
│         ▼                            │              │              │
│  ┌──────────────┐                    │              │              │
│  │ 법령 API     │                    │              │              │
│  │ (조건부)     │                    │              │              │
│  │   ~300ms     │                    │              │              │
│  └──────────────┘                    │              │              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 3: Context Assembly (근거 패킷 조립)                          │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  토큰 예산 분배:                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ • RAG 청크:        최대 2,000 토큰                          │   │
│  │ • 법령 원문:       최대 500 토큰 (조문 1~2개)               │   │
│  │ • 판례 요약:       최대 800 토큰 (3개 × 250자)              │   │
│  │ • 시스템 프롬프트: ~300 토큰                                │   │
│  │ • 사용자 질문:     ~100 토큰                                │   │
│  │ ─────────────────────────────────────────────────────────── │   │
│  │ 총합:              ~3,700 토큰 입력                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 4: Gemini 답변 생성 (SSE 스트리밍)                             │
│  ─────────────────────────────────────────────────────────────────  │
│  • 강화된 시스템 프롬프트 (근거 필수 모드)                           │
│  • 출처별 분리 표기 (RAG / 법령 API / 판례)                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. 의사결정 규칙

### 5.1 법령 API 호출 조건

| 조건 | 동작 |
|------|------|
| `citations.length >= 1` AND 해당 법령 포함 | API 호출 안 함 (RAG 사용) |
| `citations.length == 0` | API 호출 트리거 |
| `extractedLaws`가 있는데 citations에 없음 | API 호출 트리거 |

### 5.2 판례 검색 조건

| 질문 유형 | 판례 검색 | 우선순위 |
|----------|----------|----------|
| `application` (적용 판단) | **필수** | 높음 (70% 빈도) |
| `consequence` (효과/결과) | **필수** | 높음 |
| `requirement` (요건/조건) | 권장 | 중간 |
| `definition` (개념/정의) | 선택 | 낮음 |
| `procedure` (절차/방법) | 선택 | 낮음 |
| `comparison` (비교) | 권장 | 중간 |

### 5.3 토큰/품질 가드레일

- **법령**: 최대 3개 조문, 각 조문 최대 1,200자
- **판례**: 상위 3~5개, 각 요약 최대 250자
- **근거 없음 시**: "근거 부족" 응답 + 추가 질문 유도

---

## 6. 데이터 스키마

### 6.1 Evidence (근거 패킷) 타입

```typescript
type Evidence =
  | {
      kind: 'statute'
      source: 'rag' | 'law.go.kr'
      lawName: string
      article: string           // 예: "제38조", "제10조의2"
      articleTitle?: string     // 예: "신고납부"
      content: string           // 조문 원문 (최대 1,200자)
      effectiveDate?: string
      url?: string
      fetchedAt: string
    }
  | {
      kind: 'precedent'
      source: 'law.go.kr-prec'
      caseNumber: string        // 예: "2020다12345"
      caseName: string          // 예: "손해배상(기)"
      courtName: string         // 예: "대법원"
      judgmentDate: string      // 예: "2020.05.14"
      summary: string           // AI 요약 (최대 250자)
      keyHoldings?: string[]    // 핵심 판시사항 (선택)
      url?: string
      fetchedAt: string
    }
```

### 6.2 AssembledContext 타입

```typescript
interface AssembledContext {
  ragContext: string           // RAG 청크 (최대 2,000 토큰)
  statuteContext: string       // 법령 원문 (최대 500 토큰)
  precedentContext: string     // 판례 요약 (최대 800 토큰)
  totalTokens: number
  sources: Evidence[]
}
```

---

## 7. API 상세

### 7.1 법제처 판례 목록 조회

**URL**: `http://www.law.go.kr/DRF/lawSearch.do`

| 파라미터 | 값 | 설명 |
|----------|-----|------|
| `OC` | `ryuseungin` | 인증키 (.env.local) |
| `target` | `prec` | 판례 검색 |
| `type` | `JSON` | 응답 형식 |
| `query` | `{검색어}` | 검색 키워드 |
| `display` | `5` | 결과 개수 |
| `curt` | `대법원` | 법원 필터 (선택) |

**응답 예시**:
```json
{
  "PrecSearch": {
    "totalCnt": 152,
    "prec": [
      {
        "판례일련번호": "12345",
        "사건명": "손해배상(기)",
        "사건번호": "2020다12345",
        "선고일자": "2020.05.14",
        "법원명": "대법원",
        "판결유형": "판결",
        "판례상세링크": "/LSW/precInfoP.do?precSeq=12345"
      }
    ]
  }
}
```

### 7.2 법제처 법령 조회 (기존)

**URL**: `/api/eflaw`

| 파라미터 | 설명 |
|----------|------|
| `lawId` 또는 `mst` | 법령 ID |
| `jo` | 조문 번호 (6자리, 예: "003800") |
| `efYd` | 시행일 (YYYYMMDD) |

---

## 8. 파일 구조

### 8.1 신규 파일

```
lib/
├── precedent-client.ts        # [신규] 판례 API 클라이언트
│   ├── searchPrecedents()     # 판례 검색
│   ├── summarizePrecedent()   # 판례 요약 (Gemini)
│   └── PrecedentSearchResult  # 타입 정의
│
├── realtime-law-fetcher.ts    # [신규] 조건부 법령 조회
│   ├── checkRAGCoverage()     # RAG 커버리지 확인
│   ├── fetchMissingLaws()     # 누락 법령 조회
│   └── RealtimeLawResult      # 타입 정의
│
├── context-assembler.ts       # [신규] 컨텍스트 조립
│   ├── assembleContext()      # 근거 패킷 조립
│   ├── optimizeTokens()       # 토큰 최적화
│   └── AssembledContext       # 타입 정의
│
└── evidence-cache.ts          # [신규] 캐싱 (선택)
    ├── cacheEvidence()
    └── getCachedEvidence()
```

### 8.2 수정 파일

```
lib/
├── legal-query-analyzer.ts    # [수정] 판례 키워드 추출 추가
│   └── + precedentKeywords: string[]
│   └── + needsPrecedent: boolean
│
└── file-search-client.ts      # [수정] 통합 파이프라인
    └── queryFileSearchStream()  # 확장

app/api/
├── precedent-search/          # [신규] 판례 검색 엔드포인트
│   └── route.ts
│
└── file-search-rag/
    └── route.ts               # [수정] SSE 이벤트 확장
        └── + type: "evidence"  # 근거 패킷 이벤트
```

---

## 9. 구현 로드맵

### Phase 1: 판례 API 클라이언트 (2시간)

**목표**: 법제처 판례 검색 + Gemini 요약 기능

```typescript
// lib/precedent-client.ts
export interface PrecedentSearchResult {
  cases: Array<{
    caseNumber: string
    caseName: string
    courtName: string
    judgmentDate: string
    summary: string  // AI 요약
  }>
  searchKeywords: string[]
  totalCount: number
}

export async function searchPrecedents(
  keywords: string[],
  options?: { court?: string; limit?: number }
): Promise<PrecedentSearchResult>

export async function summarizePrecedent(
  caseInfo: { caseNumber: string; caseName: string; ... }
): Promise<string>
```

### Phase 2: 조건부 법령 조회 (1시간)

**목표**: RAG 미스 감지 + 법령 API 호출

```typescript
// lib/realtime-law-fetcher.ts
export interface RealtimeLawResult {
  lawName: string
  article: string
  content: string
  source: 'rag' | 'api'
}

export function checkRAGCoverage(
  extractedLaws: string[],
  citations: Citation[]
): { covered: string[]; missing: string[] }

export async function fetchMissingLaws(
  missing: Array<{ lawName: string; article?: string }>
): Promise<RealtimeLawResult[]>
```

### Phase 3: 컨텍스트 조립 (1시간)

**목표**: 토큰 예산 내 최적 컨텍스트 구성

```typescript
// lib/context-assembler.ts
export interface AssembledContext {
  ragContext: string
  statuteContext: string
  precedentContext: string
  totalTokens: number
  sources: Evidence[]
}

export function assembleContext(params: {
  ragChunks: any[]
  realtimeLaws: RealtimeLawResult[]
  precedents: PrecedentSearchResult
  tokenBudget?: number
}): AssembledContext
```

### Phase 4: 통합 파이프라인 (2시간)

**목표**: file-search-client.ts에 전체 흐름 통합

```typescript
// lib/file-search-client.ts (수정)
export async function* queryFileSearchStream(query: string, options?: {...}) {
  // 1. 쿼리 분석 (기존 + 판례 키워드)
  const analysis = analyzeLegalQuery(query)

  // 2. 병렬 데이터 수집
  const [ragResult, precedents] = await Promise.all([
    executeRAGQuery(query),
    searchPrecedents(analysis.precedentKeywords)
  ])

  // 3. RAG 미스 확인 → 조건부 법령 API
  const { missing } = checkRAGCoverage(analysis.extractedLaws, ragResult.citations)
  const realtimeLaws = missing.length > 0 ? await fetchMissingLaws(missing) : []

  // 4. 컨텍스트 조립
  const context = assembleContext({ ragChunks: ragResult.chunks, realtimeLaws, precedents })

  // 5. Evidence 이벤트 전송 (NEW)
  yield { type: 'evidence', evidence: context.sources, done: false }

  // 6. Gemini 답변 생성
  yield* callGeminiWithEnrichedContext(query, context)
}
```

### Phase 5: 테스트 및 디버깅 (2시간)

**테스트 케이스**:
1. RAG에 있는 법령 질문 → API 호출 없이 답변
2. RAG에 없는 법령 질문 → API 호출 후 답변
3. 판례 필요 질문 → 판례 검색 + 요약 포함
4. 복합 질문 → 법령 + 판례 모두 포함

---

## 10. SSE 응답 포맷 확장

### 10.1 기존 이벤트

```typescript
{ type: 'text', text: string }
{ type: 'warning', message: string }
{ type: 'citations', citations: Citation[], confidenceLevel: string }
{ type: 'usage_warning', message: string, usage: {...} }
```

### 10.2 신규 이벤트

```typescript
// 근거 패킷 (법령 + 판례)
{
  type: 'evidence',
  evidence: Evidence[],
  sources: {
    rag: number,        // RAG에서 가져온 개수
    api: number,        // API에서 가져온 개수
    precedent: number   // 판례 개수
  }
}
```

---

## 11. 캐싱 전략

### 11.1 판례 캐시

| 항목 | 값 |
|------|-----|
| 저장소 | 메모리 (Map) 또는 Turso |
| 키 | `precedent:${query}:${court}` |
| TTL | 1시간 |
| 이유 | 판례는 자주 변경되지 않음 |

### 11.2 법령 캐시 (기존 활용)

| 항목 | 값 |
|------|-----|
| 저장소 | IndexedDB (`law-content-cache.ts`) |
| TTL | 7일 |
| 이유 | 법령 개정 주기 고려 |

---

## 12. 리스크 및 대응

| 리스크 | 확률 | 영향 | 대응 |
|--------|------|------|------|
| 판례 API Rate Limit | 중 | 중 | 1시간 캐싱 + 검색 개수 제한 (5개) |
| 응답 시간 3.5초 초과 | 중 | 중 | 병렬 호출 + 타임아웃 (3초) |
| 판례 요약 품질 저하 | 낮 | 중 | 구조화 프롬프트 + 검증 |
| 토큰 한도 초과 | 낮 | 높 | 동적 압축 + 우선순위 기반 제거 |
| 법제처 API 장애 | 낮 | 높 | Fallback (RAG만으로 답변) |

---

## 13. 예상 결과물 비교

### 13.1 Before (현재 RAG Only)

```markdown
임대차 계약에서 차임 연체로 인한 해지에 대해 설명드리겠습니다.

민법에 따르면 임차인이 2기 이상의 차임을 연체한 경우
임대인은 계약을 해지할 수 있습니다.

[출처: RAG 데이터베이스]
```

**문제점**:
- 조문 번호 불명확 ("민법에 따르면..." → 몇 조?)
- 법령 원문 없음
- 판례 없음
- 최신성 불확실

### 13.2 After (Agentic RAG)

```markdown
## 차임 연체로 인한 임대차 해지 요건

### 📜 관련 법령

**「민법」 제640조 (차임연체와 해지)**
> 건물 기타 공작물의 임대차에는 임차인의 차임연체액이
> 2기의 차임액에 달하는 때에는 임대인은 계약을 해지할 수 있다.

### ✅ 구체적 요건

1. **대상**: 건물 기타 공작물의 임대차 (토지 임대차는 제641조)
2. **연체액 기준**: 연체액 합계가 2기분 차임액 이상
   - 반드시 연속 2기일 필요 없음
3. **해지 의사표시**: 임대인이 해지 통보 필요

### ⚖️ 관련 판례

**대법원 2020. 5. 14. 선고 2020다12345 판결**
> "2기의 차임액에 달하는 때"란 연체된 차임의 합계액이
> 2기분의 차임액에 달하면 족하고, 반드시 연속한 2기분의
> 차임이 연체되어야 하는 것은 아니다.

---
*출처: 법제처 국가법령정보센터 (API), 대법원 종합법률정보*
```

**개선점**:
- 정확한 조문 번호 및 원문
- 관련 판례 인용
- 출처 명확

---

## 14. 승인 요청 사항

| 항목 | 기본값 | 조정 가능 |
|------|--------|----------|
| 판례 검색 개수 | 5개 | 3~10개 |
| 판례 필터 | 대법원 우선 | 전체 법원 포함 가능 |
| 캐시 TTL | 1시간 | 30분~24시간 |
| 응답 타임아웃 | 3초 | 2~5초 |
| 토큰 예산 | 3,700 | 3,000~5,000 |

---

## 15. 참고 문서

- [기존 계획서](.claude/plans/hybrid-rag-realtime-law-precedent-plan.md) - 코덱스 작성
- [판례 검색 구현 가이드](docs/18-precedent-search-implementation-guide.md)
- [Gemini File Search 가이드](docs/06-GEMINI_FILE_SEARCH_GUIDE.md)
- [법제처 공동활용 API](https://open.law.go.kr)

---

**총 예상 구현 시간**: 8시간

**이 계획으로 진행할까요?**
