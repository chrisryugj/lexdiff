# LexDiff GraphRAG 통합 실행 계획 v1.0

> **Synthesized from**: Doc 17 (Strategic PRD) + Doc 14 (Tactical PRD)
> **목표**: FC-RAG + Neo4j GraphRAG 하이브리드 → **P50 응답 3초, Multi-hop 정확도 85%+, 운영비 $15/월 이하**
> **전제**: 기존 17개 도구 + 법제처 API 100% 유지. Neo4j는 **18번째 보조 도구**로 투입 (대체 아님)

---

## 0. Executive Summary

현재 LexDiff FC-RAG는 **20~35초, multi-hop 정확도 45~50%**. 두 PRD의 장점을 병합하여:

1. **Retrieval Planner** (Doc 17)로 질의 의도를 사전 분류 → 불필요 도구 호출 제거
2. **graph_search 하이브리드 도구** (Doc 14)로 관계 탐색을 0.05초에 수행
3. **대화 메모리** (Doc 14)로 후속 질문 2~3초에 처리
4. **SSE 투명성 이벤트** (Doc 17)로 사용자 신뢰도 향상
5. **Phase 0 베이스라인** (Doc 17) + **A/B 벤치마크** (Doc 14)로 정량 검증

**총 5주**, Go/No-Go 게이트 포함.

---

## 1. 현행 파이프라인 정밀 진단

### 1.1 아키텍처 흐름

```
사용자 질문 → /api/fc-rag/route.ts (SSE)
  ├─ OpenClaw healthy? → YES → Bridge (미니PC, 4-Phase) → GPT → SSE
  └─ NO → Gemini FC-RAG (17 tools, multi-turn) → SSE 직접 스트리밍
```

### 1.2 핵심 파일

| 파일 | 역할 | 줄 수 |
|------|------|-------|
| `lib/fc-rag/engine.ts` | FC-RAG 엔진: Fast Path + Full Pipeline | ~946 |
| `lib/fc-rag/tool-adapter.ts` | MCP → Gemini FunctionDeclaration 변환 + API 캐시 | ~343 |
| `lib/fc-rag/prompts.ts` | complexity × queryType별 동적 시스템 프롬프트 | ~143 |
| `app/api/fc-rag/route.ts` | SSE ReadableStream 엔드포인트 | ~184 |
| `lib/openclaw-client.ts` | 미니PC Bridge SSE 통신 + 서킷 브레이커 | - |

### 1.3 레이턴시 병목 (측정 기반)

| Phase | 소요 시간 | 병목 원인 |
|-------|----------|----------|
| 요청 + inferComplexity + Fast Path | <50ms | regex, 무시 가능 |
| Phase 1: `search_ai_law` (법제처 NLP) | 3~5s | law.go.kr RTT |
| Phase 2: `search_law` × N (MST resolve) | 2~3s | Gemini 결정 ~1s + API |
| Phase 3: `get_batch_articles` + 해석례 | 3~5s | correctToolArgs() 추가 호출 유발 |
| Phase 4: Adaptive tools (판례/위임/신구법) | 3~5s | complex만, auto-chain 순차 |
| Gemini LLM 답변 생성 | 8~12s | 멀티턴: simple(2), moderate(3), complex(4) |
| **총 합계** | **20~35s** | |

### 1.4 품질 문제

1. **Evidence 절단**: `MAX_RESULT_LENGTH=3000`으로 긴 법령 본문 절단 → Gemini 인지 불가
2. **Multi-hop 실패**: inferComplexity()가 "moderate"로 오분류 빈번
3. **MST 환각**: Gemini가 MST 번호 날조 → correctToolArgs() 보정하지만 추가 지연
4. **반복 호출**: 동일 법령도 매 세션마다 재호출

### 1.5 비용 구조

| 항목 | 쿼리당 | 월간 (1000 쿼리) |
|------|--------|----------------|
| Gemini Flash input | ~5000 tokens | ~$0.38 |
| Gemini Flash output | ~2000 tokens | ~$0.60 |
| 법제처 API | 4~8회 | $0 |
| **총** | | **$5~25/월** |

---

## 2. To-Be 아키텍처

### 2.1 논리 아키텍처 (Doc 17 확장)

```
[Client Chat UI (SSE)]
        |
        v
[Q&A Orchestrator API - /api/fc-rag/route.ts]
  |
  |-- (NEW) Intent Classifier + Retrieval Planner
  |     ├─ DIRECT_ARTICLE    → graph_search(fulltext) → 답변
  |     ├─ RELATION_TRAVERSE → graph_search(traverse) → 답변
  |     ├─ CASE_AUGMENTED    → graph_search(hybrid) + 판례 도구 → 답변
  |     └─ HYBRID_COMPLEX    → graph_search + 기존 도구 혼합 → 답변
  |
  |-- (A) graph_search (Neo4j, Mini PC)
  |     ├─ Semantic (벡터 유사도)
  |     ├─ Fulltext (키워드)
  |     └─ Traverse (그래프 관계)
  |
  |-- (B) Existing 17 Tools (법제처 API, 판례, 해석례...)
  |
  |-- (NEW) Conversation Store (서버 메모리, TTL 30분)
  |
  |-- Citation Verifier (기존 + 그래프 경로 검증)
  |
  |-- (NEW) SSE Transparency Events
        ├─ graph_plan: 탐색 계획
        ├─ graph_hit: 발견된 관계 경로
        └─ evidence_rank: 근거 채택/탈락
```

### 2.2 물리 배치

| 위치 | 역할 |
|------|------|
| **Vercel** | Next.js App/API, SSE, 인증, Gemini 호출 |
| **Mini PC** | Neo4j Community, Ingestion Worker, Cloudflare Tunnel |

**Mini PC 스펙 (현실적)**:
- RAM: 8GB+ (Neo4j 2G + OS + 인덱서)
- CPU: 4코어+ (인덱싱 시 30~50%)
- SSD: 20GB+ (Neo4j 데이터 ~4~6GB)
- 네트워크: 유선 1GbE

### 2.3 Fallback 전략 (Doc 14)

```
graph_search 호출
    ↓
Neo4j 헬스체크 (60초 캐시)
    ├─ 건강 → Cypher 실행 → 결과 반환
    └─ 불건강 → { isError: true }
                    ↓
              Gemini가 에러 확인 → 기존 도구로 자동 폴백

failureCount ≥ 2 → graph_search를 도구 선언에서 자동 제외 (세션 내)
```

**핵심**: Neo4j 장애 시 **사용자 영향 제로**. 기존 파이프라인 100% 가동.

---

## 3. 그래프 스키마 (양 문서 통합 + 확장)

### 3.1 노드 타입

```cypher
(:Law {
  mst: "268725",                -- PRIMARY KEY
  lawId: "001556",
  name: "관세법",
  nameNormalized: "관세법",      -- search-normalizer.ts 활용
  type: "법률",                  -- 법률|대통령령|총리령·부령|조례
  procDate: "20240101",
  enfDate: "20240701",
  ministry: "관세청",
  abbreviations: ["관세법"],
  articleCount: 327,
  lastIndexed: datetime(),
  updated_at: datetime()
})

(:Article {
  id: "268725_003800",           -- mst_joCode (UNIQUE)
  mst: "268725",
  joCode: "003800",              -- law-parser.ts buildJO()
  joNo: "제38조",
  title: "신고납부",
  content: "... 조문 전문 ...",
  contentHash: "sha256:...",     -- 변경 감지용
  embedding: vector(768),        -- Gemini embedding-001
  updated_at: datetime()
})

(:Clause {                       -- Doc 17 추가: 항/호/목 세분화 (Phase 2+)
  id: "268725_003800_01_02",
  articleId: "268725_003800",
  path: "제1항제2호",
  text: "...",
  updated_at: datetime()
})

(:Precedent {
  id: "12345",
  caseNumber: "2023다12345",
  courtName: "대법원",
  caseType: "민사",
  judgeDate: "20231215",
  summary: "판시사항 요약",
  holding: "...",
  embedding: vector(768),
  updated_at: datetime()
})

(:Interpretation {
  id: "22-0456",
  title: "해석례 제목",
  replyDate: "20220315",
  summary: "회신 요지",
  updated_at: datetime()
})

(:AdminRule {
  id: "rule-1234",
  name: "관세법 사무처리에 관한 고시",
  type: "고시",
  ministry: "관세청",
  updated_at: datetime()
})

(:Term {                          -- Doc 17 추가: 법률 용어 노드
  term: "전자세금계산서",
  normalized: "전자세금계산서",
  domain: "세법",
  updated_at: datetime()
})
```

### 3.2 관계 타입

```cypher
-- 법령 구조
(law:Law)-[:HAS_ARTICLE]->(article:Article)
(article:Article)-[:HAS_CLAUSE]->(clause:Clause)

-- 위임 관계
(law:Law)-[:DELEGATES_TO {articles: ["제38조"]}]->(decree:Law)

-- 조문 간 참조
(article:Article)-[:REFERENCES {context: "..."}]->(target:Article)

-- 판례/해석례 인용
(precedent:Precedent)-[:CITES]->(article:Article)
(interpretation:Interpretation)-[:INTERPRETS]->(article:Article)

-- 행정규칙
(adminRule:AdminRule)-[:IMPLEMENTS]->(article:Article)

-- 관련 법령
(law1:Law)-[:RELATED_TO {reason: "동일소관"}]->(law2:Law)

-- 심급 관계 (판례 간)
(precedent:Precedent)-[:APPEALS_TO]->(precedent2:Precedent)

-- 폐지/대체
(law:Law)-[:SUPERSEDES {date: "20240101"}]->(oldLaw:Law)

-- 용어 매핑
(term:Term)-[:MENTIONED_IN]->(article:Article)

-- 조례-상위법
(ordinance:Law {type: "조례"})-[:BASED_ON]->(law:Law)
```

### 3.3 인덱스 정의

```cypher
-- 고유 제약
CREATE CONSTRAINT law_mst FOR (l:Law) REQUIRE l.mst IS UNIQUE;
CREATE CONSTRAINT article_id FOR (a:Article) REQUIRE a.id IS UNIQUE;
CREATE CONSTRAINT precedent_id FOR (p:Precedent) REQUIRE p.id IS UNIQUE;

-- 검색용
CREATE INDEX law_name FOR (l:Law) ON (l.name);
CREATE INDEX law_type_name FOR (l:Law) ON (l.type, l.name);
CREATE INDEX article_joNo FOR (a:Article) ON (a.joNo);
CREATE INDEX article_hash FOR (a:Article) ON (a.contentHash);
CREATE INDEX precedent_caseNumber FOR (p:Precedent) ON (p.caseNumber);
CREATE INDEX term_norm FOR (t:Term) ON (t.normalized);

-- 벡터 인덱스
CREATE VECTOR INDEX article_embeddings FOR (a:Article) ON (a.embedding)
OPTIONS {indexConfig: {`vector.dimensions`: 768, `vector.similarity_function`: 'cosine'}};

CREATE VECTOR INDEX precedent_embeddings FOR (p:Precedent) ON (p.embedding)
OPTIONS {indexConfig: {`vector.dimensions`: 768, `vector.similarity_function`: 'cosine'}};

-- 전문 검색
CREATE FULLTEXT INDEX article_fulltext FOR (a:Article) ON EACH [a.content, a.title];
CREATE FULLTEXT INDEX law_fulltext FOR (l:Law) ON EACH [l.name];
```

---

## 4. Retrieval Planner (Doc 17 개념 + 구현 설계)

### 4.1 개요

Doc 14는 Gemini의 자율 도구 선택에 의존하지만, Doc 17의 Retrieval Planner 개념이 더 효율적.
**핵심**: 질의를 사전 분류하여 도구 호출 횟수를 최소화.

### 4.2 구현: `lib/fc-rag/retrieval-planner.ts` (NEW)

```typescript
type RetrievalIntent =
  | 'DIRECT_ARTICLE'      // 단일 조문 조회 → graph_search(fulltext)
  | 'RELATION_TRAVERSE'   // 위임/참조 관계 → graph_search(traverse)
  | 'CASE_AUGMENTED'      // 판례 보강 필요 → graph_search(hybrid) + search_precedents
  | 'HYBRID_COMPLEX'      // 복합 → graph_search + 기존 도구 혼합

interface RetrievalPlan {
  intent: RetrievalIntent
  graphMode: 'semantic' | 'fulltext' | 'traverse' | 'hybrid'
  suggestedTools: string[]      // Gemini에게 우선 사용 권장할 도구
  maxTurns: number              // 의도별 최적 턴 수
  skipTools?: string[]          // 불필요한 도구 제외
}
```

### 4.3 분류 로직

1단계: **규칙 기반** (regex + 키워드)
- "제N조 내용/알려줘" → DIRECT_ARTICLE
- "위임/시행령/시행규칙" → RELATION_TRAVERSE
- "판례/판결/대법원" → CASE_AUGMENTED
- 기타 복합 → HYBRID_COMPLEX

2단계: **Gemini 보정** (선택적, Phase 3에서 추가)
- 규칙이 불확실할 때만 Gemini 1턴으로 의도 분류

### 4.4 Planner → Engine 연동

```typescript
// engine.ts Full Pipeline 진입 전
const plan = classifyRetrievalIntent(query)

// 시스템 프롬프트에 plan 주입
const systemPrompt = buildSystemPrompt(complexity, queryType, {
  suggestedTools: plan.suggestedTools,
  maxTurns: plan.maxTurns,
  skipTools: plan.skipTools,
})
```

**효과**: Gemini가 불필요 도구를 호출하지 않아 평균 1~2턴 절감.

---

## 5. graph_search 도구 구현

### 5.1 `lib/fc-rag/tools/graph-search.ts` (NEW)

```typescript
// 3가지 검색 전략 통합
type GraphSearchMode = 'semantic' | 'fulltext' | 'traverse' | 'hybrid'

interface GraphSearchParams {
  query: string
  mode: GraphSearchMode      // default: 'hybrid'
  lawName?: string           // 특정 법령 한정
  articleNo?: string         // 특정 조문 한정
  topK?: number              // default: 10
  includeRelated?: boolean   // 위임/참조 관계 포함 (default: true)
  includePrecedents?: boolean // 관련 판례 포함 (default: true)
}
```

### 5.2 Hybrid 모드 동작

1. **Fulltext**: 법령명/조문번호 추출 → Cypher fulltext 검색
2. **Semantic**: 쿼리 임베딩 → 벡터 유사도 검색
3. **Traverse**: 발견된 조문에서 1~2hop 관계 탐색 (위임, 참조, 판례)
4. **Fusion**: 결과 병합 + 중복 제거 + 관련도 점수화

### 5.3 캐시 전략

```typescript
// tool-adapter.ts CACHE_TTL에 추가
graph_search: 1 * 3600_000,  // 1시간 (법령 데이터는 일 단위 변경)
```

### 5.4 통합 (기존 파일 수정)

| 파일 | 변경 내용 |
|------|----------|
| `tool-adapter.ts` | TOOLS 배열 선두에 graph_search 추가, CACHE_TTL 추가 |
| `prompts.ts` | NEO4J_ENABLED일 때 graph_search 우선순위 프롬프트 |
| `engine.ts` | TOOL_DISPLAY_NAMES, summarizeToolResult, getToolCallQuery 추가 |

---

## 6. 대화 메모리 (Doc 14 기반)

### 6.1 `lib/fc-rag/conversation-store.ts` (NEW)

```typescript
interface ConversationTurn {
  query: string
  answer: string        // 1500자 제한
  toolsUsed: string[]
  graphPaths?: string[] // graph_search 사용 시 경로 요약
  timestamp: number
}

// In-memory Map, TTL 30분, 최대 5턴
```

### 6.2 engine.ts 대화 컨텍스트 주입

- Full Pipeline 진입부에서 이전 대화 히스토리를 Gemini messages에 주입
- 답변 완료 후 현재 턴 저장
- 시스템 프롬프트에 "이전 대화 맥락 참고, 새 질문에 집중" 추가

### 6.3 토큰 예산

| 구성요소 | 예산 |
|---------|------|
| 시스템 프롬프트 | ~500 tokens |
| 대화 히스토리 (최대 5턴) | ~3,750 tokens |
| 현재 질문 | ~100 tokens |
| 도구 결과 (최대 4턴) | ~6,000 tokens |
| **총합** | **~12,000 tokens/요청** |

---

## 7. SSE 투명성 이벤트 (Doc 17 개념 + 구현)

### 7.1 신규 이벤트 타입

```typescript
// 기존 SSE 이벤트에 추가
type SSEEventType =
  | 'graph_plan'      // Planner가 결정한 검색 전략
  | 'graph_hit'       // 발견된 관계 경로 요약
  | 'evidence_rank'   // 근거 채택/탈락 이유

// 예시
{ type: 'graph_plan', data: { intent: 'RELATION_TRAVERSE', strategy: '위임법령 체계 탐색' } }
{ type: 'graph_hit', data: { path: '관세법 → 시행령 제XX조', score: 0.92 } }
{ type: 'evidence_rank', data: { adopted: 3, dropped: 1, reason: '최신성 부족' } }
```

### 7.2 UI 반영

- `graph_plan` → "검색 전략: ..." 표시 (기존 도구 호출 표시와 유사)
- `graph_hit` → "관련 법령 경로 발견" 뱃지
- `evidence_rank` → 근거 채택 표시 (접이식)

**효과**: 사용자 체감 신뢰도 상승 ("왜 이 근거가 선택됐는지" 가시화)

---

## 8. 법령 DB 자동 구축 파이프라인

### 8.1 5-Phase 인덱서 (`scripts/neo4j-indexer.ts`)

```
Phase 1: 법령 목록 수집 ───→ ~6,000 Law 노드
    ↓
Phase 2: 조문 수집 ─────────→ ~400,000 Article 노드 + HAS_ARTICLE
    ↓
Phase 3: 관계 추출 ─────────→ REFERENCES + DELEGATES_TO (regex, $0)
    ↓
Phase 4: 임베딩 생성 ───────→ Article.embedding (Gemini embedding-001)
    ↓
Phase 5: 판례/해석례 (선택) ─→ Precedent 노드 + CITES
```

### 8.2 시간·비용 예측

| Phase | 대상 | 소요 시간 | 비용 |
|-------|------|----------|------|
| 1 | ~6,000 법령 | ~10분 | $0 |
| 2 | ~400,000 조문 | ~8시간 (rate limit) | $0 |
| 3 | regex 파싱 | ~5분 | $0 |
| 4 | ~400,000 임베딩 | 4일 (무료) / 2시간 ($30) | $0~30 |
| 5 | ~200,000 판례 | ~12시간 | $0 |

### 8.3 구현 포인트

- `LawApiClient`: 기존 `korean-law-mcp` 패키지 재사용
- JO 코드 변환: `lib/law-parser.ts`의 `buildJO()` 재사용
- 법령 약칭: `lib/search-normalizer.ts`의 `resolveLawAlias()` 재사용
- Phase 2 대상: `type IN ['법률', '대통령령', '총리령·부령']` (조례 제외)
- Phase 3 regex: `/「([^」]+)」\s*제(\d+)조(?:의(\d+))?/g`
- Phase 4 텍스트: `"${joNo}: ${title}\n${content}"`, 2048자 절단

### 8.4 일일 업데이트 (`scripts/neo4j-daily-update.ts`)

```
Cron: 매일 새벽 3시
  → 법제처 "최근 개정 법령" API (최근 7일)
  → enfDate 비교 → 변경 법령 조문 재수집
  → contentHash 비교 → 변경 조문 embedding = null
  → embedding IS NULL인 조문만 재임베딩 (~100~500건/일)
  → 변경 조문 관계 재추출
```

### 8.5 Rate Limit 핸들링

| API | 제한 | 전략 |
|-----|------|------|
| 법제처 | ~2 req/s | 500ms sleep |
| Gemini embedding 무료 | 100 RPM, 1000 RPD | 750ms 간격, 일일 카운터 |
| Gemini embedding 유료 | 3000 RPM | 20ms 간격 |

---

## 9. 인프라

### 9.1 Docker Compose

```yaml
# docker-compose.neo4j.yml
services:
  neo4j:
    image: neo4j:2026.01.4-community
    container_name: lexdiff-neo4j
    restart: always
    ports:
      - "127.0.0.1:7474:7474"  # Browser (로컬 전용)
      - "7687:7687"             # Bolt (Cloudflare Tunnel 노출)
    environment:
      - NEO4J_AUTH=neo4j/${NEO4J_PASSWORD}
      - NEO4J_PLUGINS=["genai"]
      - NEO4J_server_memory_heap_initial__size=512m
      - NEO4J_server_memory_heap_max__size=1g
      - NEO4J_server_memory_pagecache_size=512m
      - NEO4J_dbms_security_procedures_unrestricted=genai.*
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
    deploy:
      resources:
        limits:
          memory: 2g
          cpus: '2.0'
    healthcheck:
      test: ["CMD", "cypher-shell", "-u", "neo4j", "-p", "${NEO4J_PASSWORD}", "RETURN 1"]
      interval: 30s
      timeout: 10s
      retries: 3
volumes:
  neo4j_data:
  neo4j_logs:
```

### 9.2 Cloudflare Tunnel

```yaml
ingress:
  - hostname: neo4j-bolt.yourdomain.com
    service: tcp://localhost:7687
  - hostname: openclaw.yourdomain.com
    service: http://localhost:8080
```

### 9.3 환경변수

```env
# Vercel
NEO4J_URI=bolt+s://neo4j-bolt.yourdomain.com:443
NEO4J_USER=neo4j
NEO4J_PASSWORD=<secure>
NEO4J_ENABLED=true

# 미니PC
NEO4J_URI=bolt://localhost:7687
GEMINI_API_KEY=<key>
LAW_OC=<법제처-api-key>
```

### 9.4 신규 의존성

```json
{ "neo4j-driver": "^5.x" }
```

---

## 10. KPI / SLO (Doc 17 기반, 현실적 조정)

### 10.1 성능 KPI

| 지표 | 현재 | Phase 1 목표 | Phase 2+ 목표 |
|------|------|-------------|--------------|
| P50 응답시간 | ~12s | 5~8s | **3s 이하** |
| P95 응답시간 | ~30s | 10~15s | **7s 이하** |
| 평균 도구 턴 수 (complex) | 3.5턴 | 2턴 | **1.5턴** |
| 후속 질문 응답시간 | 20~25s | 3~5s | **2~3s** |

### 10.2 정확도 KPI

| 지표 | 현재 | 목표 |
|------|------|------|
| Multi-hop 쿼리 완성도 | ~45~50% | **80%+** |
| Citation 정확도 | ~70% | **90%+** |
| 위임 체계 완성도 | ~60% | **95%+** |
| 관련 판례 재현율 | ~30% | **70%+** |
| Hallucination Rate | 측정 필요 | **<5%** |

### 10.3 운영 SLO

| 지표 | 목표 |
|------|------|
| 월 가용성 | 99.5% |
| Graph API P95 | <400ms |
| 법령 DB 최신성 | 1일 이내 |
| Neo4j 장애 시 폴백 시간 | <100ms (자동) |

---

## 11. 보안 / 컴플라이언스

- API Key: 환경변수로만 주입 (코드 하드코딩 금지)
- Mini PC: WireGuard/Cloudflare Tunnel + IP allowlist
- 개인정보/사건식별정보 필터링 로그 정책
- 감사로그: 누가/언제/어떤 질의 → 90일 보관
- 법률 서비스 고지: "법률정보 제공 도구이며 법률자문을 대체하지 않음" 명시

---

## 12. 릴리즈 계획 (5주)

### Phase 0: 베이스라인 확립 (3일)

| 작업 | 산출물 |
|------|--------|
| 현행 파이프라인 KPI 계측 스크립트 | `scripts/benchmark.ts` |
| 골든셋 30문항 확정 (10×단순, 10×관계, 10×복합) | `tests/golden-set.json` |
| 현행 A 측정 (응답시간 + 정확도 기록) | 베이스라인 리포트 |

**Go/No-Go**: 베이스라인 수치 확보 → Phase 1 진행

### Phase 1: 인프라 + Neo4j + graph_search (Week 1)

| Day | 작업 | 산출물 |
|-----|------|--------|
| 1 | Docker Compose, Neo4j 기동, 스키마 생성 | `docker-compose.neo4j.yml` |
| 2 | Phase 1+3 실행 (법령 목록 + 위임관계) | ~6,000 Law + DELEGATES_TO |
| 3~4 | Phase 2 (조문 수집, 상위 500 법령) | ~50,000 Article |
| 5 | Phase 4 시작 (임베딩), Cypher 테스트 | 벡터 인덱스 검증 |

**Go/No-Go**: 10개 대표 Cypher 쿼리 정상 동작 확인

### Phase 2: 엔진 통합 + Retrieval Planner (Week 2)

| Day | 작업 | 파일 |
|-----|------|------|
| 6 | `graph-search.ts` 도구 구현 | `lib/fc-rag/tools/graph-search.ts` (NEW) |
| 7 | `retrieval-planner.ts` 구현 | `lib/fc-rag/retrieval-planner.ts` (NEW) |
| 8 | tool-adapter + prompts + engine 통합 | 기존 3파일 수정 |
| 9 | Cloudflare Tunnel 설정 + E2E 연결 테스트 | cloudflared config |
| 10 | 골든셋 30문항 A/B 비교 (NEO4J_ENABLED on/off) | 벤치마크 리포트 |

**Go/No-Go**: P50 응답시간 30% 이상 개선 확인

### Phase 3: 대화 메모리 + SSE 투명성 + UX (Week 3)

| Day | 작업 | 파일 |
|-----|------|------|
| 11 | 대화 메모리 구현 | `conversation-store.ts` (NEW), `engine.ts` 수정 |
| 12 | SSE 투명성 이벤트 구현 | `route.ts`, `engine.ts` 수정, UI 컴포넌트 |
| 13 | 채팅 UI 개선 (말풍선, 후속질문, 그래프 뱃지) | UI 컴포넌트 |
| 14 | Phase 5: 판례 인덱싱 (상위 200 법령) | `neo4j-indexer.ts` |
| 15 | 통합 테스트 + 성능 튜닝 | 전체 |

**Go/No-Go**: 후속 질문 3초 이내 + UI 정상 동작

### Phase 4: 최적화 + 운영화 (Week 4~5)

| 작업 | 기간 |
|------|------|
| Cypher PROFILE 기반 쿼리 최적화 | 2일 |
| 일일 업데이트 cron 설정 + 검증 | 2일 |
| 임베딩 전체 완료 (무료 티어 4일 분할) | 4일 (백그라운드) |
| 운영 알람 + 모니터링 설정 | 1일 |
| 프로덕션 배포 + 문서화 | 2일 |
| 골든셋 최종 평가 + KPI 리포트 | 1일 |

**최종 게이트**: 전체 KPI 달성 확인

---

## 13. 테스트 전략 (양 문서 모두 부재 → 신규)

### 13.1 단위 테스트

| 대상 | 테스트 내용 |
|------|-----------|
| `retrieval-planner.ts` | 질의 유형별 올바른 intent 분류 |
| `graph-search.ts` | Neo4j 연결 실패 시 graceful fallback |
| `conversation-store.ts` | TTL 만료, 최대 턴 수 초과, 메모리 정리 |

### 13.2 통합 테스트

| 시나리오 | 검증 항목 |
|---------|----------|
| graph_search → engine 루프 | Gemini가 graph 결과 활용해 답변 생성 |
| Neo4j down → fallback | 기존 도구만으로 답변 완성 |
| 대화 연속 2턴 | 히스토리 주입 + 맥락 유지 |

### 13.3 A/B 벤치마크 (Doc 14)

골든셋 30문항을 `NEO4J_ENABLED=false` / `true`로 실행:
- 응답 시간, 도구 턴 수, 답변 길이, citation 수 비교
- 인간 평가: 답변 완성도 1~5점 채점

---

## 14. 리스크 및 대응

| 리스크 | 확률 | 영향 | 대응 |
|--------|------|------|------|
| Mini PC 다운 | 중 | 그래프 검색 불가 | 자동 폴백 (사용자 영향 제로) |
| Neo4j 메모리 부족 | 낮 | 서버 크래시 | Docker memory limit 2G |
| Cloudflare Tunnel 지연 | 낮 | 쿼리 +50~100ms | 결과 1시간 캐싱 |
| 한국어 임베딩 품질 | 중 | 시맨틱 검색 정확도↓ | search_ai_law 병용, 차원 업그레이드 검토 |
| 법령 개정 후 그래프 불일치 | 낮 | 옛 조문 반환 | 일일 cron + enfDate 비교 |
| Gemini가 graph_search 무시 | 낮 | 성능 개선 없음 | 프롬프트 명시 + Planner 강제 |
| 그래프 데이터 품질 | 중 | 잘못된 관계 | 검증 리포트 + 수동 검수 큐 |

---

## 15. 비용 전망

| 시나리오 | 월 비용 | 비고 |
|---------|--------|------|
| 현재 | $5~25 | 매 질문 Gemini 5000+ tokens |
| Phase 1 (Neo4j) | $0~15 | 도구 턴 감소 → 토큰 절감 |
| Phase 2+ (캐시+대화) | $0~8 | 반복 질문 캐시, 후속 경량화 |
| 초기 구축 (임베딩) | $0~30 1회 | 무료/유료 선택 |

---

## 16. 수정/생성 파일 요약

| 파일 | 유형 | 내용 |
|------|------|------|
| `lib/fc-rag/tools/graph-search.ts` | **NEW** | Neo4j graph_search 도구 (semantic/fulltext/traverse/hybrid) |
| `lib/fc-rag/retrieval-planner.ts` | **NEW** | 질의 의도 분류 + 검색 전략 결정 |
| `lib/fc-rag/conversation-store.ts` | **NEW** | 서버사이드 대화 메모리 (TTL 30분, 5턴) |
| `lib/fc-rag/tool-adapter.ts` | 수정 | TOOLS에 graph_search 추가, CACHE_TTL |
| `lib/fc-rag/prompts.ts` | 수정 | graph_search 우선순위 프롬프트 |
| `lib/fc-rag/engine.ts` | 수정 | Planner 연동, 대화 히스토리, SSE 이벤트, display names |
| `app/api/fc-rag/route.ts` | 수정 | SSE 투명성 이벤트 emit |
| `scripts/neo4j-indexer.ts` | **NEW** | 5-Phase 법령DB 구축 인덱서 |
| `scripts/neo4j-daily-update.ts` | **NEW** | 일일 증분 업데이트 |
| `scripts/benchmark.ts` | **NEW** | 골든셋 자동 평가 스크립트 |
| `docker-compose.neo4j.yml` | **NEW** | Neo4j Docker 설정 |
| `tests/golden-set.json` | **NEW** | 벤치마크 30문항 |
| UI 컴포넌트 (채팅/뱃지) | 수정 | 말풍선, 후속질문 바, 그래프 뱃지 |
| `package.json` | 수정 | `neo4j-driver` 의존성 |

---

## 17. Doc 17 vs Doc 14 vs 본 문서 비교

| 항목 | Doc 17 | Doc 14 | 본 문서 |
|------|--------|--------|---------|
| Phase 0 베이스라인 | O | X | **O** |
| Retrieval Planner | 개념 | X | **개념 + 구현 설계** |
| graph_search 구현 | X | O (코드) | **O (코드 + Planner 연동)** |
| 대화 메모리 | X | O (코드) | **O** |
| SSE 투명성 이벤트 | 개념 | X | **개념 + 이벤트 타입 정의** |
| 그래프 스키마 | 추상적 | 상세 | **상세 + Clause/Term 확장** |
| 테스트 전략 | X | A/B만 | **단위 + 통합 + A/B** |
| 롤백/폴백 | 언급 | 상세 | **상세 + 자동 제외 로직** |
| KPI/SLO | O (공격적) | O (보수적) | **현실적 중간값** |
| 보안 | O | X | **O** |
| 비용 분석 | X | O | **O** |
| 타임라인 | 8주 | 3주 | **5주 (Go/No-Go 포함)** |
| Mini PC 스펙 | 64GB (과다) | 4GB (최소) | **8GB+ (현실적)** |

---

*v1.0 | 2026-03-09 | Synthesized from Doc 17 + Doc 14*
