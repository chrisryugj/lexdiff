# LexDiff Legal AI GraphRAG 도입 PRD

> **목표**: 현재 FC-RAG 파이프라인(20~35초, multi-hop 정확도 45~50%)을
> Neo4j GraphRAG + 스트림 챗봇으로 고도화하여 **5~10초, 정확도 80%+** 달성
>
> **전제**: 기존 13개 도구 + 법제처 API 실시간 호출은 **유지**. Neo4j는 **보조 도구로 병합** (대체가 아님)

---

## 1. 현재 파이프라인 진단

### 1.1 아키텍처 흐름

```
사용자 질문 → /api/fc-rag/route.ts (SSE)
  ├─ OpenClaw healthy? → YES → Bridge (미니PC, 4-Phase) → GPT → SSE
  └─ NO → Gemini FC-RAG (17 tools, multi-turn) → SSE 직접 스트리밍
```

**핵심 파일**:
| 파일 | 역할 |
|------|------|
| `lib/fc-rag/engine.ts` (946줄) | FC-RAG 엔진: Fast Path + Full Pipeline (Gemini 멀티턴) |
| `lib/fc-rag/tool-adapter.ts` (343줄) | korean-law-mcp → Gemini FunctionDeclaration 변환 + API 캐시 |
| `lib/fc-rag/prompts.ts` (143줄) | complexity × queryType별 동적 시스템 프롬프트 |
| `app/api/fc-rag/route.ts` (184줄) | SSE ReadableStream 엔드포인트 |
| `lib/openclaw-client.ts` | 미니PC Bridge SSE 통신 + 서킷 브레이커 |

### 1.2 레이턴시 병목 분석

| Phase | 소요 시간 | 병목 원인 |
|-------|----------|----------|
| 요청 + inferComplexity/QueryType + Fast Path | <50ms | 순수 regex, 무시 가능 |
| Phase 1: `search_ai_law` (법제처 NLP API) | 3~5초 | law.go.kr 네트워크 왕복 |
| Phase 2: `search_law` × N (MST resolve) | 2~3초 | Gemini 결정 ~1초 + API 호출 |
| Phase 3: `get_batch_articles` + 해석례 | 3~5초 | correctToolArgs()가 추가 search_law 유발 가능 |
| Phase 4: Adaptive tools (판례/위임/신구법) | 3~5초 | complex 질문만. auto-chain 순차 호출 |
| Gemini LLM 답변 생성 | 8~12초 | 멀티턴: simple(2), moderate(3), complex(4) 턴 |
| **총 합계** | **20~35초** | |

### 1.3 품질 문제

1. **Evidence 절단**: `MAX_RESULT_LENGTH=3000` (tool-adapter.ts:314)으로 긴 법령 본문 절단 → Gemini가 잘린 내용 인지 불가
2. **Multi-hop 실패**: "개인정보보호법 → 시행령 → 관련판례" 같은 질문은 4턴 필요하나, inferComplexity()가 "moderate"(3턴)로 오분류 빈번
3. **MST 환각**: Gemini가 MST 번호를 자주 날조. correctToolArgs()가 보정하지만 추가 API 호출로 지연 발생
4. **반복 호출**: 동일 법령도 매 세션마다 search_law + get_batch_articles 재호출

### 1.4 비용 구조

| 항목 | 쿼리당 | 월간 (1000 쿼리) |
|------|--------|----------------|
| Gemini Flash input | ~5000 tokens | ~$0.38 |
| Gemini Flash output | ~2000 tokens | ~$0.60 |
| 법제처 API | 4~8회 호출 | $0 (무료) |
| **총 합계** | | **$5~25/월** |

---

## 2. Neo4j GraphRAG 아키텍처 설계

### 2.1 왜 GraphRAG인가

법률 데이터는 **본질적으로 그래프 데이터**:

```
「개인정보 보호법」(법률)
    ├─ DELEGATES_TO → 「개인정보 보호법 시행령」(대통령령)
    ├─ HAS_ARTICLE → 제15조(개인정보의 수집·이용)
    │       ├─ REFERENCES → 「정보통신망법」 제22조
    │       ├─ CITED_BY → 대법원 2023다12345
    │       └─ INTERPRETED_BY → 법제처 해석례 22-0456
    └─ RELATED_TO → 「신용정보법」
```

| 질문 유형 | 현재 (API 멀티턴) | GraphRAG |
|----------|-----------------|----------|
| "관세법 제38조 내용" | 가능 (2턴, 8초) | 가능 (1-hop, 0.05초) |
| "제15조의 시행령 위임 조항은?" | 불가 → 별도 search 필요 (3턴) | `DELEGATES_TO` 1-hop |
| "제15조 관련 판례 모두" | 불가 → 별도 search 필요 (3턴) | `CITED_BY` 1-hop |
| "민법 제750조 인용하는 법령 중 최다 인용은?" | **불가** | Cypher 집계 쿼리 |

**핵심**: 현재 Gemini가 `search_law` → `get_batch_articles` → `get_three_tier`를 **여러 턴**에 걸쳐 호출하는 것을 **1번의 Cypher 쿼리로 0.05초에 동일 결과** 도출.

### 2.2 그래프 스키마 (전체)

**노드 타입**:

```cypher
(:Law {
  mst: "268725",              -- PRIMARY KEY
  lawId: "001556",
  name: "관세법",
  nameNormalized: "관세법",    -- alias-resolved (search-normalizer.ts 활용)
  type: "법률",               -- 법률|대통령령|총리령·부령|조례
  procDate: "20240101",
  enfDate: "20240701",
  ministry: "관세청",
  abbreviations: ["관세법"],
  articleCount: 327,
  lastIndexed: datetime(),
  updated_at: datetime()
})

(:Article {
  id: "268725_003800",         -- mst_joCode (UNIQUE)
  mst: "268725",
  joCode: "003800",            -- 제38조 → "003800" (law-parser.ts buildJO())
  joNo: "제38조",
  title: "신고납부",
  content: "... 조문 전문 ...",
  embedding: vector(768),      -- Gemini embedding-001
  updated_at: datetime()
})

(:Precedent {
  id: "12345",
  caseNumber: "2023다12345",
  courtName: "대법원",
  caseType: "민사",
  judgeDate: "20231215",
  summary: "판시사항 요약",
  holding: "...",              -- 판결요지 (truncated)
  embedding: vector(768),      -- summary 임베딩
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
```

**관계 타입**:

```cypher
-- 위임 관계: 법률 → 시행령 → 시행규칙
(law:Law)-[:DELEGATES_TO {articles: ["제38조"]}]->(decree:Law)

-- 법령-조문 소속
(law:Law)-[:HAS_ARTICLE]->(article:Article)

-- 조문 간 참조
(article:Article)-[:REFERENCES {context: "제38조에 따른 신고납부"}]->(target:Article)

-- 판례의 법조문 인용
(precedent:Precedent)-[:CITES]->(article:Article)

-- 해석례의 법조문 인용
(interpretation:Interpretation)-[:INTERPRETS]->(article:Article)

-- 관련 법령
(law1:Law)-[:RELATED_TO {reason: "동일소관"}]->(law2:Law)

-- 심급 관계 (판례 간)
(precedent:Precedent)-[:APPEALS_TO]->(precedent2:Precedent)

-- 행정규칙 → 조문
(adminRule:AdminRule)-[:IMPLEMENTS]->(article:Article)

-- 폐지/대체 관계
(law:Law)-[:SUPERSEDES {date: "20240101"}]->(oldLaw:Law)
```

**인덱스 정의**:

```cypher
-- 고유 제약
CREATE CONSTRAINT law_mst FOR (l:Law) REQUIRE l.mst IS UNIQUE;
CREATE CONSTRAINT article_id FOR (a:Article) REQUIRE a.id IS UNIQUE;
CREATE CONSTRAINT precedent_id FOR (p:Precedent) REQUIRE p.id IS UNIQUE;

-- 검색용 인덱스
CREATE INDEX law_name FOR (l:Law) ON (l.name);
CREATE INDEX law_type_name FOR (l:Law) ON (l.type, l.name);
CREATE INDEX article_joNo FOR (a:Article) ON (a.joNo);
CREATE INDEX precedent_caseNumber FOR (p:Precedent) ON (p.caseNumber);

-- 벡터 인덱스 (시맨틱 검색)
CREATE VECTOR INDEX article_embeddings FOR (a:Article) ON (a.embedding)
OPTIONS {indexConfig: {`vector.dimensions`: 768, `vector.similarity_function`: 'cosine'}};

CREATE VECTOR INDEX precedent_embeddings FOR (p:Precedent) ON (p.embedding)
OPTIONS {indexConfig: {`vector.dimensions`: 768, `vector.similarity_function`: 'cosine'}};

-- 전문 검색 인덱스
CREATE FULLTEXT INDEX article_fulltext FOR (a:Article) ON EACH [a.content, a.title];
CREATE FULLTEXT INDEX law_fulltext FOR (l:Law) ON EACH [l.name];
```

### 2.3 하이브리드 검색 전략

`graph_search` 도구는 3가지 검색 전략을 통합:

| 전략 | 용도 | 예시 |
|------|------|------|
| **Semantic** (벡터) | 자연어 질문 → 관련 조문 | "음주운전 처벌 기준은?" |
| **Fulltext** (키워드) | 정확한 법령명/조문번호 | "관세법 제38조" |
| **Traverse** (그래프) | 관계 탐색 | "시행령 위임 조항 + 관련 판례" |

**Hybrid 모드** (기본값): 벡터 + 키워드 검색으로 조문 찾기 → 해당 조문의 그래프 관계 (위임법령, 참조법령, 판례) 자동 수집

### 2.4 FC-RAG 엔진 통합 (4개 파일 수정)

**통합 원칙**: `graph_search`를 **18번째 도구**로 추가. 기존 17개 도구는 그대로 유지.

**파일 1: `lib/fc-rag/tools/graph-search.ts` (NEW)**
- Neo4j 드라이버 싱글턴 + 건강 체크 (60초 캐시)
- `graphSearch()` 함수: semantic/traverse/hybrid 모드
- Gemini embedding-001로 쿼리 임베딩
- 연결 실패 시 `{ isError: true }` 반환 → Gemini가 기존 도구로 자동 폴백

**파일 2: `lib/fc-rag/tool-adapter.ts`**
```typescript
// TOOLS 배열 선두에 추가
{
  name: 'graph_search',
  description: '법령 지식그래프 검색. 시맨틱 검색 + 위임법령 체계 + 참조법령 + 판례를 한번에 조회.',
  schema: GraphSearchSchema,
  handler: graphSearch,
}
// CACHE_TTL에 추가
graph_search: 1 * 3600_000,  // 1시간
```

**파일 3: `lib/fc-rag/prompts.ts`**
```typescript
// 도구 우선순위 변경 (NEO4J_ENABLED일 때만)
`## 도구 사용 (우선순위)
1. **graph_search 우선**: 법령 관계(위임법령, 참조법령, 판례) 필요 시.
   mode="hybrid"로 시맨틱+관계 한번에 수행.
2. **search_ai_law**: graph_search 부족하거나 그래프에 없는 법령일 때.
3. **get_batch_articles**: 조문 전문이 필요할 때.
4. 이하 기존과 동일...`
```

**파일 4: `lib/fc-rag/engine.ts`**
- `TOOL_DISPLAY_NAMES`에 `'graph_search': '법령 지식그래프 검색'` 추가
- `summarizeToolResult()`에 graph_search 케이스 추가
- `getToolCallQuery()`에 graph_search 케이스 추가
- **핵심 루프 로직 변경 없음** — Gemini가 언제 graph_search를 호출할지 자율 결정

### 2.5 Fallback 전략

```
graph_search 호출
    ↓
Neo4j 건강 체크 (60초 캐시)
    ├─ 건강 → Cypher 쿼리 실행 → 결과 반환
    └─ 불건강 → { isError: true, result: "그래프 DB 연결 불가..." }
                    ↓
              Gemini가 에러 확인 → 다음 턴에서 search_ai_law/search_law 사용
              (기존 파이프라인과 100% 동일하게 동작)
```

`failureCount` 추적 (engine.ts:481)이 2회 실패 후 `graph_search`를 도구 선언에서 자동 제외 → 반복 타임아웃 방지.

---

## 3. 법령DB 자동 구축 파이프라인

### 3.1 5-Phase 인덱서 (`scripts/neo4j-indexer.ts`)

```
Phase 1: 법령 목록 수집 ───→ ~6,000 Law 노드
    ↓
Phase 2: 조문 수집 ─────────→ ~400,000 Article 노드 + HAS_ARTICLE 관계
    ↓
Phase 3: 관계 추출 ─────────→ REFERENCES + DELEGATES_TO 관계 (regex, $0)
    ↓
Phase 4: 임베딩 생성 ───────→ Article.embedding (Gemini embedding-001)
    ↓
Phase 5: 판례/해석례 (선택) ─→ ~200,000 Precedent 노드 + CITES 관계
```

**실행 명령**:
```bash
npx tsx scripts/neo4j-indexer.ts --phase=1       # 법령 목록만
npx tsx scripts/neo4j-indexer.ts --phase=1,2,3   # 목록+조문+관계
npx tsx scripts/neo4j-indexer.ts --phase=4        # 임베딩만
npx tsx scripts/neo4j-indexer.ts --full           # 전체 (최초)
npx tsx scripts/neo4j-indexer.ts --update         # 변경분만 (일일)
```

**주요 구현 포인트**:
- `LawApiClient`는 기존 `korean-law-mcp` 패키지 재사용
- JO 코드 변환은 `lib/law-parser.ts`의 `buildJO()` 함수 재사용
- 법령 약칭 해소는 `lib/search-normalizer.ts`의 `resolveLawAlias()` 재사용
- Phase 2는 `type IN ['법률', '대통령령', '총리령·부령']`만 대상 (조례 제외)
- Phase 3 regex: `/「([^」]+)」\s*제(\d+)조(?:의(\d+))?/g`
- Phase 4 텍스트: `"${joNo}: ${title}\n${content}"`, 2048자 절단

### 3.2 시간·비용 예측

| Phase | 대상 | 소요 시간 | API 비용 |
|-------|------|----------|---------|
| 1. 법령 목록 | ~6,000 법령 | ~10분 | $0 |
| 2. 조문 수집 | ~400,000 조문 | ~8시간 (rate limit) | $0 |
| 3. 관계 추출 | regex 파싱 | ~5분 | $0 (로컬) |
| 4. 임베딩 | ~400,000 조문 | **4일** (무료) / **2시간** (유료 ~$30) | $0~$30 |
| 5. 판례 (선택) | ~200,000 판례 | ~12시간 | $0 |

**무료 전략 (4일 분할)**:
- 1일차: Phase 1+2+3 (법령 목록 + 조문 + 관계)
- 2~5일차: Phase 4 (임베딩 1000 RPD × 100/batch = 100K 조문/일)

**유료 전략 (반나절 완료)**: $30 1회 투자, 이후 무료

### 3.3 일일 업데이트 파이프라인 (`scripts/neo4j-daily-update.ts`)

```
Cron: 0 3 * * * (매일 새벽 3시)
    ↓
1. 법제처 "최근 개정 법령" API (최근 7일)
    ↓
2. 변경된 법령의 조문 재수집 → content 해시 비교
   → 변경된 조문만 SET embedding = null
    ↓
3. Phase 4: embedding IS NULL인 조문만 재임베딩
   (일일 ~100~500건 → 무료 티어 내)
    ↓
4. Phase 3: 변경된 조문만 관계 재추출
```

**변경 감지**: Law 노드의 `enfDate` 비교. API에서 더 최신 `enfDate` 반환 시 해당 법령 재수집.

### 3.4 Rate Limit 핸들링

| API | 제한 | 전략 |
|-----|------|------|
| 법제처 법령 API | ~2 req/s (비공식) | 500ms sleep |
| Gemini embedding 무료 | 100 RPM, 1000 RPD | 750ms 간격, 일일 카운터 |
| Gemini embedding 유료 | 3000 RPM | 20ms 간격, 제한 없음 |

---

## 4. 질의응답 스트림 챗봇 고도화

### 4.1 현재 멀티턴 인프라 (이미 존재하지만 미완성)

이미 구현된 것:
- `ConversationEntry` 타입 (`search-result-view/types.ts`)
- `conversationId`/`conversationHistory` 상태 (`useSearchState.ts`)
- `handleFollowUp()` / `handleNewConversation()` (`useAiSearch.ts`)
- `conversationId`가 SSE route → engine.ts까지 전달됨

**미구현**: `conversationId`가 engine.ts에서 **사용되지 않음**. 매 질문이 독립적으로 처리됨.

### 4.2 서버사이드 대화 메모리

**신규 파일: `lib/fc-rag/conversation-store.ts`**

```typescript
interface ConversationTurn {
  query: string
  answer: string        // 1500자 제한
  toolsUsed: string[]
  timestamp: number
}

// In-memory store, TTL 30분, 최대 5턴
const conversations = new Map<string, {
  turns: ConversationTurn[]
  expiry: number
}>()
```

### 4.3 engine.ts 대화 컨텍스트 주입

```typescript
// Full Pipeline 진입부 (engine.ts:455)에서 이전 대화 주입
const messages = []

if (conversationId) {
  const history = getConversationHistory(conversationId)
  for (const turn of history) {
    messages.push({ role: 'user', parts: [{ text: turn.query }] })
    messages.push({ role: 'model', parts: [{ text: turn.answer }] })
  }
}

messages.push({ role: 'user', parts: [{ text: query }] })
```

답변 완료 후 대화 저장:
```typescript
if (conversationId) {
  addConversationTurn(conversationId, {
    query,
    answer: answer.slice(0, 1500),
    toolsUsed: allToolResults.map(r => r.name),
    timestamp: Date.now(),
  })
}
```

### 4.4 컨텍스트 윈도우 관리

| 구성요소 | 토큰 예산 |
|---------|----------|
| 시스템 프롬프트 | ~500 tokens |
| 대화 히스토리 (최대 5턴) | ~3,750 tokens |
| 현재 질문 | ~100 tokens |
| 도구 결과 (최대 4턴) | ~6,000 tokens |
| **총합** | **~12,000 tokens/요청** |

시스템 프롬프트에 추가: "이전 대화 맥락을 참고하되, 새로운 질문에 집중하여 답변."

### 4.5 UI/UX 개선

1. **채팅 말풍선 레이아웃**: `conversationHistory.length > 0`일 때 이전 Q&A를 접을 수 있는 말풍선으로 렌더링
2. **후속 질문 입력 바**: AI 답변 아래 "추가 질문을 입력하세요..." 입력 필드 (기존 `handleFollowUp()` 연결)
3. **지식그래프 뱃지**: `graph_search` 사용 시 "지식그래프" 뱃지 표시 → 관계 기반 검색 활용을 사용자에게 알림
4. **스트리밍**: 기존 SSE 인프라 그대로 활용 (변경 불필요)

---

## 5. 성능 목표

### 5.1 응답 시간 목표

| 질문 유형 | 현재 | Phase 1 (Neo4j) | Phase 2 (캐시+대화) |
|----------|------|-----------------|-------------------|
| 단순 조문 조회 | 3~5초 (Fast Path) | 1~2초 | 0.5~1초 |
| 단일 법령 질문 | 20~25초 | **5~8초** | **3~5초** |
| Multi-hop 관계 질문 | 25~35초 | **8~12초** | **5~8초** |
| 판례+위임 체계 | 30~35초 | **10~15초** | **7~10초** |
| 후속 질문 (동일 맥락) | 20~25초 | **3~5초** | **2~3초** |

### 5.2 정확도 목표

| 지표 | 현재 | 목표 |
|------|------|------|
| Multi-hop 쿼리 완성도 | ~45~50% | **75~85%** |
| Citation 정확도 | ~70% | **85~90%** |
| 위임 체계 완성도 (법률→시행령→시행규칙) | ~60% | **95%+** |
| 관련 판례 재현율 | ~30% | **70%+** |
| 평균 도구 턴 수 (complex) | 3.5턴 | **1.5턴** |

### 5.3 비용 전망

| 시나리오 | 월 비용 | 비고 |
|---------|--------|------|
| 현재 | $5~25 | 매 질문 Gemini 5000+ tokens |
| Phase 1 (Neo4j) | $0~15 | 도구 턴 감소 → 토큰 절감 |
| Phase 2 (캐시+대화) | $0~8 | 반복 질문 캐시 히트, 후속 질문 경량화 |

---

## 6. 구현 로드맵

### Week 1: 인프라 + 초기 데이터 (5일)

| Day | 작업 | 산출물 |
|-----|------|--------|
| **1** | Docker Compose 배포, Neo4j 기동 확인, 스키마 생성 | `docker-compose.neo4j.yml` |
| **2** | Phase 1 (법령 목록) + Phase 3 (위임관계) 실행 | `scripts/neo4j-indexer.ts` |
| **3~4** | Phase 2 (조문 수집, 상위 500 법령 우선) | ~50,000 Article 노드 |
| **5** | Phase 4 시작 (임베딩), Cypher 쿼리 테스트 | 벡터 인덱스 검증 |

### Week 2: 엔진 통합 + 테스트 (5일)

| Day | 작업 | 수정 파일 |
|-----|------|----------|
| **6** | `graph_search` 도구 구현 | `lib/fc-rag/tools/graph-search.ts` (NEW) |
| **7** | tool-adapter + prompts + engine 통합 | `tool-adapter.ts`, `prompts.ts`, `engine.ts` |
| **8** | Cloudflare Tunnel Bolt 설정 + 연결 테스트 | cloudflared config |
| **9** | 10개 테스트 질문으로 A/B 비교 | 벤치마크 결과 |
| **10** | 일일 업데이트 cron 설정 | `scripts/neo4j-daily-update.ts` |

### Week 3: 챗봇 + 최적화 (5일)

| Day | 작업 | 수정 파일 |
|-----|------|----------|
| **11** | 대화 메모리 구현 | `lib/fc-rag/conversation-store.ts` (NEW), `engine.ts` |
| **12** | 채팅 UI 개선 (말풍선, 후속질문 바, 그래프 뱃지) | `useAiSearch.ts`, 관련 UI 컴포넌트 |
| **13** | Phase 5: 판례 인덱싱 (상위 200 법령) | `neo4j-indexer.ts` |
| **14** | 성능 튜닝 (Cypher PROFILE, 커넥션 풀, 캐시 TTL) | `graph-search.ts`, `tool-adapter.ts` |
| **15** | 프로덕션 배포 + 모니터링 | Vercel 환경변수, 로그 확인 |

---

## 7. 인프라

### 7.1 Docker Compose

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

### 7.2 Cloudflare Tunnel

```yaml
# cloudflared config에 추가
ingress:
  - hostname: neo4j-bolt.yourdomain.com
    service: tcp://localhost:7687
  - hostname: openclaw.yourdomain.com     # 기존 유지
    service: http://localhost:8080
```

**Vercel 환경변수**: `NEO4J_URI=bolt+s://neo4j-bolt.yourdomain.com:443`

### 7.3 리소스 예측

| 항목 | 유휴 시 | 쿼리 시 | 인덱싱 시 |
|------|--------|---------|----------|
| RAM | ~1.5GB | ~1.8GB | ~2.0GB |
| CPU | <5% | 10~20% | 30~50% |
| 디스크 | ~2~4GB | — | ~4~6GB |

**미니PC 최소 스펙**: RAM 4GB+, 2코어+, 디스크 10GB+

### 7.4 신규 npm 의존성

```json
{ "neo4j-driver": "^5.x" }
```

기존 `@google/genai` (임베딩), `korean-law-mcp` (인덱서) 재사용.

### 7.5 환경변수

```env
# Vercel
NEO4J_URI=bolt+s://neo4j-bolt.yourdomain.com:443
NEO4J_USER=neo4j
NEO4J_PASSWORD=<secure>
NEO4J_ENABLED=true

# 미니PC
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=<secure>
GEMINI_API_KEY=<key>
LAW_OC=<법제처-api-key>
```

---

## 8. 리스크 및 완화 전략

| 리스크 | 확률 | 영향 | 완화 |
|--------|------|------|------|
| 미니PC 다운 → Neo4j 접속 불가 | 중 | 그래프 검색 불가 | 자동 폴백: graph_search 에러 → Gemini가 기존 도구 사용. **사용자 영향 제로** |
| Neo4j 메모리 부족 | 낮 | 서버 크래시 | Docker memory limit 2G, PageCache 조정 |
| Cloudflare Tunnel Bolt 지연 | 낮 | 쿼리 50~100ms 추가 | 결과 1시간 캐싱 (tool-adapter) |
| 한국어 임베딩 품질 부족 | 중 | 시맨틱 검색 정확도 저하 | search_ai_law 병용, 768→3072차원 전환 검토 |
| 법령 개정 후 그래프 불일치 | 낮 | 옛 조문 검색 | 일일 cron 업데이트 + enfDate 비교 |
| Gemini가 graph_search 무시 | 낮 | 성능 개선 없음 | 시스템 프롬프트 명시적 우선순위 + 모니터링 |

**핵심 안전장치**: Neo4j는 **보조 도구**. 기존 17개 도구 + 법제처 API는 100% 유지. graph_search 실패 시 기존 파이프라인으로 자동 폴백.

---

## 9. 검증 방법

### 9.1 벤치마크 테스트 (10개 질문)

| # | 질문 | 유형 | 측정 항목 |
|---|------|------|----------|
| 1 | "관세법 제38조 내용 알려줘" | 단순 조문 | 응답 시간, 정확도 |
| 2 | "개인정보보호법 시행령 위임 조항은?" | 위임관계 | multi-hop 완성도 |
| 3 | "민법 제750조 관련 판례 알려줘" | 판례 검색 | 판례 재현율 |
| 4 | "음주운전 처벌 기준과 관련 판례" | 복합 질문 | 도구 턴 수, 시간 |
| 5 | "관세법과 부가가치세법의 수입물품 과세 비교" | 비교 | 정확도 |
| 6 | "정보통신망법 제22조를 인용하는 다른 법령은?" | 그래프 탐색 | **현재 불가** → 가능 여부 |
| 7 | "건축법 건축허가 신청 절차" | 절차 | 단계별 완성도 |
| 8 | (후속) "시행령에서의 세부 요건은?" | 대화 연속 | 컨텍스트 유지 |
| 9 | "최근 개정된 근로기준법 변경 내용" | 개정 | 최신성 |
| 10 | "소득세법 비과세 항목과 감면 특례" | 면제/감면 | 범위 완성도 |

### 9.2 A/B 비교 방법

1. 동일 질문을 `NEO4J_ENABLED=false` (현재) / `NEO4J_ENABLED=true` (GraphRAG)로 실행
2. SSE 이벤트 로그에서 tool_call/tool_result 기록 비교
3. 응답 시간, 도구 턴 수, 답변 길이, citation 수 비교
4. 인간 평가: 답변 완성도 1~5점 채점

---

## 수정 대상 파일 요약

| 파일 | 변경 유형 | 내용 |
|------|----------|------|
| `lib/fc-rag/tools/graph-search.ts` | **NEW** | Neo4j graph_search 도구 |
| `lib/fc-rag/tool-adapter.ts` | 수정 | TOOLS 배열에 graph_search 추가 |
| `lib/fc-rag/prompts.ts` | 수정 | 도구 우선순위에 graph_search 추가 |
| `lib/fc-rag/engine.ts` | 수정 | display names, summarizer, 대화 히스토리 주입 |
| `lib/fc-rag/conversation-store.ts` | **NEW** | 서버사이드 대화 메모리 |
| `scripts/neo4j-indexer.ts` | **NEW** | 5-Phase 인덱서 |
| `scripts/neo4j-daily-update.ts` | **NEW** | 일일 업데이트 파이프라인 |
| `docker-compose.neo4j.yml` | **NEW** | Neo4j Docker 설정 |
| `useAiSearch.ts` | 수정 | 채팅 UI 개선 |
| `package.json` | 수정 | `neo4j-driver` 의존성 추가 |
