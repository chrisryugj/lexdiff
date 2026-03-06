# RAG 파이프라인 최적화 종합 개선안

> 작성일: 2026-03-04
> 목표: 검색속도, 비용절감, 답변품질 고도화를 동시에 달성하는 아키텍처 개선
> 전제: Google File Search Store 폐기 (수동 법령 업데이트, 불완전 커버리지, 벤더 종속성)

---

## 1. 현재 아키텍처 진단

### 1.1 전체 흐름

```
사용자 질문
    ↓
[/api/fc-rag/route.ts] ── OpenClaw healthy? ──→ YES → Bridge (미니PC) → 4-Phase Pipeline → GPT → SSE
                                              └─→ NO  → Gemini FC-RAG (13 tools) → SSE 직접 스트리밍
    ↓
법제처 API 실시간 호출 (search_ai_law, search_law, get_batch_articles 등)
    ↓
LLM 답변 생성 → SSE → 프론트엔드
```

### 1.2 파이프라인 구성요소

| 구성요소 | 파일 | 역할 |
|----------|------|------|
| API 엔드포인트 | `app/api/fc-rag/route.ts` | SSE ReadableStream, OpenClaw/Gemini 분기 |
| FC-RAG 엔진 | `lib/fc-rag/engine.ts` | Gemini 멀티턴 Function Calling + Fast Path |
| 도구 어댑터 | `lib/fc-rag/tool-adapter.ts` | korean-law-mcp → Gemini FunctionDeclaration 변환 + 실행 |
| 프롬프트 | `lib/fc-rag/prompts.ts` | 복잡도×질문유형별 동적 시스템 프롬프트 |
| OpenClaw 클라이언트 | `lib/openclaw-client.ts` | 미니PC Bridge SSE 통신 + 서킷 브레이커 |
| 사용량 트래커 | `lib/usage-tracker.ts` | IP 기반 일일 100회 쿼터 |

### 1.3 FC-RAG 엔진 상세 (engine.ts)

```
질문 → inferComplexity() + inferQueryType()
    ↓
[Fast Path 감지] 법명+조문번호 명확? → YES → API 직접 호출 (LLM 바이패스)
    ↓ NO
[Full Pipeline] Gemini 멀티턴:
    Turn 1: Gemini가 도구 선택 → 병렬 실행 → 결과를 Gemini에 전달
    Turn 2~N: 추가 도구 호출 또는 최종 답변 생성
    ↓
Auto-chain: search → 상세조회 자동 연결 (해석례, 조례, 신구법 등)
    ↓
MST 보정: Gemini가 잘못 보낸 법령ID를 엔진에서 교정 (correctToolArgs)
    ↓
Citation 구성: 도구 결과에서 법령명+조문번호 추출
```

**핵심 설계 포인트**:
- complexity별 최대 도구 턴 수: simple(2), moderate(3), complex(4)
- 도구 결과 3000자 truncation (`MAX_RESULT_LENGTH`)
- search_law 결과 압축 포맷 (MST:ID, 구분만 유지)
- KNOWN_MST 런타임 캐시 (서버 프로세스 수명)
- 실패 도구 2회 이상 시 선언에서 제외

### 1.4 OpenClaw Bridge 상세 (미니PC)

```
POST /api/legal-query
    ├─ classifyComplexity() + classifyQueryType() + detectDomain()
    ├─ buildFallbackPlan() (domainMap 기반)
    ├─ Phase 1: search_ai_law → parseMstsFromAiSearch() (3~5초)
    ├─ Phase 2: search_law × N 병렬 (MST resolve, 2~3초)
    ├─ Phase 3: get_batch_articles + interpretations 병렬 (3~5초)
    ├─ Phase 4: runAdaptiveTools (budget 기반, 3~5초)
    ├─ structureEvidence() (9개 섹션 분류)
    ├─ buildPrompt() (JSON 출력 계약 포함)
    ├─ runChatCompletion() (stream:true, SSE)
    └─ SSE 이벤트 전송 (status/tool_result/token/done)
```

**Bridge 특성**:
- `toolResultCache` Map (TTL 3분, max 800) 이미 구현
- `createLegalBudget()` + `hasRetryBudget()` 구현
- SSE 스트리밍 이미 구현 (token 이벤트 실시간 전송)
- Cloudflare Tunnel 경유 접속

### 1.5 실측 타임라인

```
[0.0s]  요청 수신 + 분류
[0~5s]  Phase 1: search_ai_law (law.go.kr, 3~5초)
[5~8s]  Phase 2: search_law × N 병렬 (MST resolve, 2~3초)
[8~13s] Phase 3: get_batch_articles + interpretations 병렬 (3~5초)
[13~18s] Phase 4: adaptive tools 병렬 (budget 허용 시, 3~5초)
[18~30s] LLM 답변 생성 (8~12초, Bridge는 SSE 스트리밍)
```

**총 레이턴시: 20~35초**

### 1.6 핵심 문제 3가지

| 문제 | 증상 | 근본 원인 |
|------|------|-----------|
| **속도** | 20~35초 응답 | 법제처 API 직렬 호출(3~5초 × 4 Phase) + LLM 동기 대기 |
| **비용** | 매 질문마다 5000+ 토큰 소모 | 캐싱 미흡, 동일 법령도 매번 API 재호출 + LLM 재생성 |
| **품질** | 조문 중간 절단, general 도메인 빈 plan | Evidence truncation, AI 검색 역류 미작동 |

---

## 2. Google File Search Store 폐기 사유

| 문제 | 상세 |
|------|------|
| **수동 업데이트** | 법령 개정 시 직접 파일 업로드 필요. 4,000+ 법령 관리 불가능 |
| **불완전 커버리지** | 모든 법령을 File Search Store에 올릴 수 없음. 주요 법령만 일부 커버 |
| **벤더 종속(RAG)** | Google File Search API 전용 → 개인 LLM API 사용 불가 |
| **비용** | File Search Store 저장 + 검색 비용 별도 발생 |
| **기본 RAG 한계** | 단순 청크 매칭 수준. 법률 도메인 특화 retrieval 불가 |

---

## 3. 개선안 (5가지, 독립적 선택 적용 가능)

### 3.1 방안 1: 서버사이드 시맨틱 캐시

**핵심**: 유사한 질문이 들어오면 LLM 호출 없이 캐시된 답변 반환

```
질문: "관세법 과세가격이란?"
    ↓
[시맨틱 캐시] embedding 유사도 > 0.92?
    ├─ YES → 캐시 답변 반환 (0.1초, 비용 $0)
    └─ NO  → 정상 파이프라인 → 답변 생성 후 캐시 저장
```

**구현 옵션**:

| 옵션 | 도구 | 비용 | 특성 |
|------|------|------|------|
| A. 경량 (메모리) | `Map<hash, answer>` + Gemini embedding | $0 | 서버 재시작 시 리셋 |
| B. 영속 (SQLite) | `better-sqlite3` + Gemini `text-embedding-004` | $0 | 미니PC에 SQLite 파일. 임베딩 무료티어 |

**옵션 B 구현 스케치**:

```typescript
// lib/semantic-cache.ts
import Database from 'better-sqlite3'

interface CacheEntry {
  queryHash: string
  queryEmbedding: Float32Array  // 768차원
  answer: string
  citations: string             // JSON stringified
  createdAt: number
  hitCount: number
}

// 코사인 유사도 > 0.92면 캐시 히트
// 엔트리 수 < 10,000이면 brute-force 충분 (< 5ms)
function findSimilar(embedding: Float32Array): CacheEntry | null { ... }
```

**예상 효과**:
- 반복 질문 40~60% 캐시 히트 (법률 질문은 패턴이 한정적)
- LLM 비용 40~60% 절감
- 캐시 히트 시 응답 시간 **0.1초**

**주의점**:
- 법령 개정 시 캐시 무효화 필요 → TTL 7일 + 수동 flush 엔드포인트
- 임베딩 모델: Gemini `text-embedding-004` 무료티어 (분당 1500 요청)

---

### 3.2 방안 2: 법제처 API 응답 캐시 레이어

**핵심**: 법제처 API는 법령 개정 전까지 동일 응답. 도구 실행 레벨에 캐시 삽입.

```
get_batch_articles(mst:268725, ["제38조","제39조"])
    ↓
[API 캐시] 키: "batch:268725:38,39" → 히트?
    ├─ YES → 캐시 반환 (0ms, API 호출 안 함)
    └─ NO  → 법제처 API 호출 → 응답 캐시 저장 (TTL: 24시간)
```

**현재 상태**:
- Bridge에는 `toolResultCache` (TTL 3분, max 800) 이미 있음
- **FC-RAG 엔진(engine.ts)에는 캐시가 없음** ← 여기가 개선 포인트

**구현 위치**: `lib/fc-rag/tool-adapter.ts`의 `executeTool()` 래핑

```typescript
// tool-adapter.ts 수정
const apiCache = new Map<string, { result: ToolCallResult; expiry: number }>()

const CACHE_TTL: Record<string, number> = {
  get_law_text: 24 * 3600_000,      // 24시간 (법령 본문)
  get_batch_articles: 24 * 3600_000, // 24시간
  get_precedent_text: 24 * 3600_000, // 24시간 (판례 본문)
  get_interpretation_text: 24 * 3600_000,
  get_ordinance: 24 * 3600_000,
  search_law: 6 * 3600_000,          // 6시간
  search_ai_law: 3 * 3600_000,       // 3시간 (NLP 검색)
  search_precedents: 12 * 3600_000,
  search_interpretations: 12 * 3600_000,
  get_three_tier: 24 * 3600_000,
  compare_old_new: 24 * 3600_000,
  get_article_history: 24 * 3600_000,
}

export async function executeTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  const cacheKey = `${name}:${JSON.stringify(args)}`
  const cached = apiCache.get(cacheKey)
  if (cached && Date.now() < cached.expiry) return cached.result

  const result = await executeToolRaw(name, args) // 기존 로직
  const ttl = CACHE_TTL[name]
  if (ttl && !result.isError) {
    apiCache.set(cacheKey, { result, expiry: Date.now() + ttl })
    if (apiCache.size > 2000) { /* oldest cleanup */ }
  }
  return result
}
```

**예상 효과**:
- 동일 법령 재질문 시 Phase 1~3 건너뜀 → **15~20초 → 5~8초**
- 법제처 API 호출 횟수 50~70% 감소
- 구현 난이도: **매우 낮음** (tool-adapter.ts 30줄 추가)

---

### 3.3 방안 3: 자체 벡터DB RAG — 트레이드오프 분석

| 항목 | 자체 벡터DB | 현재 (실시간 API) | 하이브리드 |
|------|------------|------------------|-----------|
| 검색 정확도 | 높음 (시맨틱) | 중간 (keyword + AI검색) | **최고** |
| 데이터 최신성 | 크롤링 주기 의존 | **실시간 (항상 최신)** | 실시간 + 캐시 |
| 커버리지 | 인덱싱한 법령만 | **전체 법령** | 전체 + 우선 인덱싱 |
| 속도 | **0.05초** | 3~5초 (API 왕복) | 0.05초(히트) / 3~5초(미스) |
| 비용 | 초기 세팅 + 호스팅 | $0 (법제처 무료) | 혼합 |
| 유지보수 | **높음** | **제로** | 중간 |

**현 단계 권장: 벡터DB 비추천**

이유:
1. 법제처 `search_ai_law`가 이미 시맨틱 검색 제공 (무료)
2. 법령 4,000+개 × 평균 100조문 = 400,000+ 청크 → 초기 인덱싱 수십 시간
3. 매일 개정 법령 체크 + 재임베딩 파이프라인 필요
4. **방안 2의 API 캐시로 속도 이점의 80% 달성 가능**

**향후 도입 시 스펙**:

```
도구: Qdrant (Rust, self-hosted 무료, Docker)
임베딩: text-embedding-004 (Gemini 무료) 또는 multilingual-e5-large (로컬)
범위: 주요 법령 500개 우선 인덱싱 (80/20 법칙)
인프라: 미니PC Docker, 메모리 512MB
업데이트: 법제처 RSS/일일 크롤 → diff → 변경분만 재임베딩
```

---

### 3.4 방안 4: 2-Tier LLM 전략

**핵심**: 질문 복잡도에 따라 모델 분기

```
질문 → inferComplexity()
    ├─ simple   → Fast Path (LLM 호출 없음)         ← 이미 구현!
    ├─ moderate → Gemini 2.0 Flash Lite (최저가)
    └─ complex  → Gemini 3.0/3.1 Flash (고품질)
```

**현재**: 모든 질문이 동일 모델 `gemini-3-flash-preview` 사용

**변경** (`engine.ts`):

```typescript
function selectModel(complexity: QueryComplexity): string {
  switch (complexity) {
    case 'simple':   return 'gemini-2.0-flash-lite'  // 단순 요약
    case 'moderate': return 'gemini-3.0-flash'        // 일반 질문
    case 'complex':  return 'gemini-3.1-flash'        // 복합 분석
  }
}
```

**예상 비용 절감**:
- simple (~30% 쿼리): Flash Lite = Flash의 1/3 가격
- moderate (~50%): 현재와 동일
- complex (~20%): 약간 비싸지만 품질 향상
- **순 비용 절감: ~20~25%**

---

### 3.5 방안 5: 기존 PIPELINE_IMPROVEMENT_PLAN Sprint 1 즉시 실행

`PIPELINE_IMPROVEMENT_PLAN.md`의 Sprint 1은 이미 잘 설계되어 있고, ROI 최고:

| 작업 | 효과 | 변경량 |
|------|------|--------|
| JSON 출력 계약 제거 → Markdown | 출력 토큰 30% 절감, 파싱 실패 0% | ~80줄 삭제 |
| Evidence Smart Truncation | 조문 절단 방지 → 답변 정확도 향상 | ~30줄 수정 |
| AI 검색 역류 (plan 보강) | general 도메인 커버리지 향상 | ~50줄 추가 |

상세 내용은 `PIPELINE_IMPROVEMENT_PLAN.md` 참조.

---

## 4. 종합 로드맵 (권장 실행 순서)

```
Phase 0 (즉시, 1일): 방안 2 — API 캐시 레이어
   └─ tool-adapter.ts에 30줄 추가
   └─ 효과: 재질문 시 속도 3x, API 부하 50% 감소

Phase 1 (1~2일): 방안 5 — 기존 Sprint 1 실행
   └─ Bridge server.mjs: JSON→Markdown, truncation, plan 보강
   └─ 효과: 답변 품질 즉시 개선, 코드 80줄 순 감소

Phase 2 (2~3일): 방안 4 — 2-Tier 모델 분기
   └─ engine.ts 모델 선택 로직 추가
   └─ 효과: 비용 20~25% 절감

Phase 3 (3~5일): 방안 1 — 시맨틱 캐시
   └─ SQLite + 임베딩 기반 캐시
   └─ 효과: LLM 비용 40~60% 추가 절감

Phase 4 (선택, 장기): 방안 3 — 벡터DB
   └─ Phase 0~3 결과 보고 필요성 판단
   └─ 현 시점에서는 비추천
```

---

## 5. 비용 예측 (월 100쿼리/일 기준)

| 단계 | Gemini API | 법제처 API | 인프라 | 총 월 비용 |
|------|-----------|-----------|--------|-----------|
| 현재 | ~$15~25 | $0 (무료) | 미니PC 전기료 | ~$15~25 |
| Phase 0+1 후 | ~$10~18 | $0 | 동일 | ~$10~18 |
| Phase 2+3 후 | **~$4~8** | $0 | 동일 | **~$4~8** |

---

## 6. 속도 예측

| 질문 유형 | 현재 | Phase 0 후 (캐시 히트) | Phase 0 후 (캐시 미스) |
|----------|------|----------------------|----------------------|
| 단순 (조문 조회) | 20~25초 | **2~5초** | 18~22초 |
| 보통 (비교/절차) | 25~35초 | **3~8초** | 22~28초 |
| 복합 (법령+판례) | 35~45초 | **5~10초** | 30~38초 |

> 시맨틱 캐시(Phase 3) 추가 시 반복 질문 **0.1초**

---

## 7. GraphRAG / LangGraph / Obsidian MCP 기반 대안 검토

### 7.1 Microsoft GraphRAG — 지식 그래프 기반 RAG

**핵심 원리**: 문서에서 엔터티·관계를 LLM으로 추출 → 지식 그래프 구축 → 커뮤니티 탐지(Leiden) → 계층적 요약 → 쿼리 시 그래프 탐색

```
문서 청킹 → LLM 엔터티 추출 → LLM 관계 추출 → 그래프 구축
    → Leiden 커뮤니티 탐지 → LLM 커뮤니티 요약
    → 쿼리: Local Search (엔터티 중심) / Global Search (커뮤니티 요약)
```

**법률 도메인 적합성**: 매우 높음

법률 데이터는 본질적으로 관계형 데이터:
- 법률 → 시행령 → 시행규칙 (위임 관계)
- 조문 간 참조 ("제38조에 따른~", "민법 제750조를 준용")
- 판례 → 조문 인용, 판례 → 판례 인용
- 이 관계들이 벡터 유사도로는 포착 불가 → 그래프가 자연스럽게 포착

**성능**: 복잡 multi-hop 쿼리에서 벡터 RAG 대비 **3.2배 정확도** (80-85% vs 45-50%)

| 변형 | 인덱싱 비용 | 쿼리 비용 | 특성 |
|------|-----------|----------|------|
| **Full GraphRAG** | 매우 높음 ($120/1000페이지 PDF) | ~$0.40/쿼리 | LLM으로 모든 단계 처리. 최고 품질 |
| **LazyGraphRAG** | Full의 **0.1%** (벡터 RAG와 동일) | Full의 **0.14%** | NLP noun phrase로 인덱싱, LLM은 쿼리 시에만. **비용 대비 최고** |
| **FastGraphRAG** | 저렴 | 유사 | NLP 기반 추출. 예산 제약 시 |

**Gemini 지원**: v2.2.0+부터 LiteLLM 통합으로 공식 지원
```yaml
models:
  default:
    model_provider: gemini
    model: gemini-2.5-flash-lite
    api_key: ${GEMINI_API_KEY}
  embeddings:
    model_provider: gemini
    model: gemini-embedding-001
```

**한국어 주의사항**:
- 영어 중심 설계 → 추출 프롬프트 한국어 번역/적응 필요
- 한국어 형태소 분석(NER)은 영어보다 어려움 → Gemini의 한국어 능력 활용 권장
- LazyGraphRAG는 NLP noun phrase 기반이므로 한국어 noun phrase 추출기 필요 (KoNLPy 등)

**LexDiff 적용 시 권장**: **LazyGraphRAG**
- 인덱싱 비용이 벡터 RAG 수준 (사실상 무료)
- 쿼리 시에만 LLM 호출 → Gemini Flash로 처리 가능
- 법률 4,000개 인덱싱도 몇 시간 + 수 달러 수준

---

### 7.2 LangGraph — 에이전트 워크플로우 오케스트레이션

**핵심**: LangGraph ≠ GraphRAG. 완전히 다른 도구.

| | **LangGraph** | **GraphRAG** |
|---|---|---|
| "그래프" 의미 | 실행 흐름 그래프 (노드=단계, 엣지=전환) | 지식 그래프 (노드=엔터티, 엣지=관계) |
| 목적 | 멀티스텝 AI 에이전트 워크플로우 조율 | 관계 기반 지식 검색 |
| 경쟁 제품 | CrewAI, AutoGen, OpenAI Agents SDK | 벡터 RAG, 전통적 검색 |

**둘은 보완 관계**: LangGraph로 워크플로우 조율 + GraphRAG로 지식 검색 = 조합 가능

**현재 FC-RAG 엔진 대체 가능 여부**:

| 장점 | 단점 |
|------|------|
| 표준화된 상태 관리 | LangChain 생태계 종속 (잦은 breaking change 이력) |
| 조건 분기, 루프, human-in-the-loop 내장 | 추상화 오버헤드 (현재 커스텀 엔진이 더 가볍고 맞춤형) |
| 디버깅, 모니터링 도구 | 프로덕션 배포 시 추가 인프라 필요 |

**LexDiff 판단**: **현 단계에서 불필요**
- 현재 `engine.ts`의 커스텀 FC-RAG가 법률 도메인에 더 최적화
- LangGraph는 멀티에이전트 시스템(예: 법령검색 에이전트 + 판례분석 에이전트 + 비교생성 에이전트 분리)이 필요할 때 재검토
- 오버엔지니어링 위험 높음

---

### 7.3 Obsidian MCP — 지식 그래프 프론트엔드

**생태계 현황**: 24+ Obsidian MCP 서버 존재 (2025년 기준)

| MCP 서버 | 핵심 기능 |
|----------|----------|
| [cyanheads/obsidian-mcp-server](https://github.com/cyanheads/obsidian-mcp-server) | CRUD + 전문검색 + JsonLogic 쿼리 + YAML frontmatter |
| [aaronsb/obsidian-mcp-plugin](https://github.com/aaronsb/obsidian-mcp-plugin) | **그래프 탐색** + 시맨틱 검색 + 개념 발견 |
| [smart-connections-mcp](https://github.com/msdanyg/smart-connections-mcp) | 384차원 임베딩 시맨틱 검색 + 연결 그래프 |
| [obsidian-graph-mcp](https://github.com/drewburchfield/obsidian-graph-mcp) | Voyage 임베딩 + pgvector + multi-hop BFS 그래프 탐색 |
| [graph-rag-mcp-server](https://deepwiki.com/ferparra/graph-rag-mcp-server) | 벡터 + 그래프 하이브리드 검색 + 자동 전략 라우팅 |

**법률 도메인 매핑**:

| Obsidian 기능 | 법률 도메인 매핑 |
|--------------|----------------|
| `[[WikiLinks]]` | 법령 간 참조 (「관세법」→「관세법 시행령」) |
| Backlinks | "이 조문을 참조하는 다른 법령은?" |
| Graph View | 위임법령 체계(법률→시행령→시행규칙) 시각화 |
| Tags (`#판례`, `#해석례`) | 문서 유형 분류 |
| YAML Frontmatter | 법령ID, MST, 공포일, 시행일 등 구조화 메타데이터 |
| Dataview 플러그인 | "관세법 제38조를 인용하는 모든 판례" 쿼리 |

**실제 GraphRAG + Obsidian 구현 사례**:
- [obsidianGraphRAG](https://github.com/Jinstronda/obsidianGraphRAG): Obsidian 노트 → 지식그래프 → 하이브리드 검색(벡터+그래프) → LLM 답변
- [Neural Composer](https://forum.obsidian.md/t/neural-composer-local-graph-rag-made-easy-lightrag-integration/109891): LightRAG 통합 Obsidian 플러그인

**LexDiff 판단**: **시각화/탐색 도구로는 우수, 프로덕션 백엔드로는 부적합**
- 프로토타이핑과 법령 관계 시각화에 활용 가치 있음
- 프로덕션 데이터 저장소로는 Neo4j가 더 적합
- Obsidian vault를 "법령 위키"로 만들고, MCP로 AI에 노출하는 보조 활용은 가능

---

### 7.4 Neo4j — 프로덕션급 법령 그래프 데이터베이스

**무료 옵션**:

| 옵션 | 비용 | 제약 |
|------|------|------|
| Community Edition | 무료 (GPLv3) | 단일 인스턴스, 벡터 검색 포함 |
| AuraDB Free (클라우드) | 무료 | 50K 노드, 175K 관계 |
| Desktop (개발용) | 무료 | Enterprise 전체 기능, 로컬 전용 |

**법령 Cypher 쿼리 예시**:

```cypher
-- 위임법령 체계 탐색 (법률 → 시행령 → 시행규칙)
MATCH path = (law:Law)-[:DELEGATES_TO]->(decree:Decree)-[:DELEGATES_TO]->(rule:Rule)
WHERE law.name CONTAINS "개인정보"
RETURN path

-- 특정 조문을 인용하는 모든 판례
MATCH (p:Precedent)-[:CITES]->(a:Article {jo_code: "003800"})<-[:HAS_ARTICLE]-(l:Law)
RETURN p.case_number, p.date, a.title

-- 법령 간 참조 네트워크 (가장 많이 참조되는 법령)
MATCH (a:Article)-[:REFERENCES]->(b:Article)<-[:HAS_ARTICLE]-(other:Law)
WHERE a.law_name = "민법"
RETURN DISTINCT other.name, count(*) AS ref_count
ORDER BY ref_count DESC

-- 하이브리드: 시맨틱 검색 + 그래프 탐색
CALL db.index.vector.queryNodes('article_embeddings', 5, $queryVector)
YIELD node, score
MATCH (node)-[:DELEGATED_BY]->(parent:Law)
MATCH (node)<-[:CITES]-(p:Precedent)
RETURN node.text, parent.name, collect(p.case_number) AS cases
```

**neo4j-graphrag-python 하이브리드 검색**:
- `VectorRetriever`: 순수 시맨틱 검색
- `HybridRetriever`: 벡터 + 전문검색 결합 (조문번호 같은 정확 매칭 포착)
- `HybridCypherRetriever`: 하이브리드 검색 → 그래프 탐색 (관련 시행령, 판례 자동 수집)
- `Text2Cypher`: 자연어 → Cypher 쿼리 자동 생성

**LexDiff 판단**: 장기적으로 **가장 강력한 옵션**
- Community Edition 무료, 미니PC Docker로 운행 가능
- 벡터 검색 + 그래프 탐색 네이티브 지원
- 법률 도메인의 관계형 특성과 완벽 매칭

---

### 7.5 종합 비교 — 어떤 그래프 RAG를 선택할 것인가

| 기준 | LazyGraphRAG | Neo4j + 벡터 | Obsidian + MCP | LangGraph |
|------|-------------|-------------|---------------|-----------|
| **법률 적합성** | 높음 | **최고** | 중간 | 해당없음 (오케스트레이션) |
| **인덱싱 비용** | **최저** (NLP) | 중간 (임베딩) | 낮음 (WikiLink) | - |
| **쿼리 비용** | 중간 (LLM) | **낮음** (Cypher) | 낮음 | - |
| **한국어** | 주의 필요 | **좋음** | 좋음 | 좋음 |
| **유지보수** | 중간 | 중간 | **낮음** | 높음 |
| **프로덕션 적합** | 중간 | **높음** | 낮음 | 높음 |
| **초기 투자** | 낮음 | 중간 | **최저** | 높음 |
| **현재 엔진 호환** | 별도 파이프라인 | 도구 추가로 통합 가능 | 보조 도구 | 엔진 교체 필요 |

### 7.6 권장 아키텍처 — 단계적 도입

```
현재 (유지)
├─ FC-RAG 엔진 (Gemini Function Calling)
└─ 법제처 API 실시간 호출

Phase A: Obsidian 법령 위키 (1~2주)
├─ 주요 법령 500개를 Obsidian vault로 구조화
├─ [[WikiLinks]]로 위임법령 / 참조 관계 인코딩
├─ YAML frontmatter에 MST, lawId, 시행일 등 메타데이터
├─ MCP 서버(graph-rag-mcp-server)로 AI 접근 제공
└─ 효과: 법령 관계 시각화 + 보조 검색 채널

Phase B: Neo4j 그래프 DB (2~4주)
├─ Community Edition (무료) Docker로 미니PC에 배포
├─ 법제처 API 크롤링 → Neo4j 노드/관계 생성 파이프라인
│   ├─ Law, Decree, Rule 노드 (4,000+)
│   ├─ Article 노드 (400,000+)
│   ├─ DELEGATES_TO, REFERENCES, HAS_ARTICLE 관계
│   └─ Gemini text-embedding-004로 조문 임베딩 (무료)
├─ FC-RAG 엔진에 'graph_search' 도구 추가
│   └─ 기존 13개 도구에 Neo4j Cypher 검색 도구 1개 추가
└─ 효과: multi-hop 질문 정확도 3x 향상, 참조법령 자동 탐색

Phase C: LazyGraphRAG 통합 (선택, 4~6주)
├─ 전체 법령 텍스트에 LazyGraphRAG 인덱싱 (NLP 기반, 저비용)
├─ Global query 지원 ("한국 개인정보보호 법체계 전반을 설명해줘")
├─ Gemini Flash로 쿼리 시 커뮤니티 요약 생성
└─ 효과: 광역 질문 답변 품질 대폭 향상
```

**핵심 원칙**: 현재 실시간 API 호출 방식을 완전 대체하지 않고, **그래프 검색을 추가 도구로 병합**. 기존 `search_ai_law`, `search_law` 등은 유지하되, 그래프 기반 관계 탐색이 추가되는 구조.

---

## 8. 관련 파일 참조

| 파일 | 내용 |
|------|------|
| `lib/fc-rag/engine.ts` | FC-RAG 엔진 (Fast Path + Full Pipeline) |
| `lib/fc-rag/tool-adapter.ts` | 도구 실행 + 캐시 삽입 지점 |
| `lib/fc-rag/prompts.ts` | 시스템 프롬프트 (complexity × queryType) |
| `lib/openclaw-client.ts` | OpenClaw Bridge SSE 클라이언트 |
| `app/api/fc-rag/route.ts` | API 엔드포인트 (SSE 스트리밍) |
| `lib/usage-tracker.ts` | IP 기반 사용량 제한 |
| `PIPELINE_IMPROVEMENT_PLAN.md` | Bridge 중심 개선안 (Sprint 1~3) |

---

**버전**: 1.1 | **작성**: 2026-03-04 | **업데이트**: GraphRAG/LangGraph/Obsidian MCP 검토 추가
