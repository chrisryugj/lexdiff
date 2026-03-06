# Neo4j 기반 법령 GraphRAG 구축 블루프린트

> 작성일: 2026-03-04
> 목표: Neo4j + Gemini 임베딩 + FC-RAG 엔진 통합으로 법령 관계 기반 검색 구현
> 전제: 미니PC Docker 운영, 비용 최소화, 현재 FC-RAG 엔진과 병합 (대체가 아님)

---

## 1. 왜 Neo4j인가 — 법률 데이터와 그래프의 자연적 매칭

법률 데이터는 **본질적으로 그래프 데이터**:

```
「개인정보 보호법」(법률)
    ├─ DELEGATES_TO → 「개인정보 보호법 시행령」(대통령령)
    │       └─ DELEGATES_TO → 「개인정보 보호법 시행규칙」(부령)
    ├─ HAS_ARTICLE → 제15조(개인정보의 수집·이용)
    │       ├─ REFERENCES → 「정보통신망법」 제22조
    │       ├─ CITED_BY → 대법원 2023다12345 판례
    │       └─ INTERPRETED_BY → 법제처 해석례 22-0456
    └─ RELATED_TO → 「신용정보법」
```

**벡터 검색이 못 하는 것, 그래프가 하는 것**:

| 질문 유형 | 벡터 RAG | 그래프 RAG |
|----------|---------|-----------|
| "개인정보보호법 제15조 내용" | 가능 | 가능 |
| "제15조의 **시행령** 위임 조항은?" | **불가** (별도 검색 필요) | `DELEGATES_TO` 1-hop |
| "제15조 관련 **판례**를 모두 알려줘" | **불가** (별도 검색 필요) | `CITED_BY` 1-hop |
| "개인정보보호법과 **연관된 모든 법령**은?" | **불가** | `REFERENCES` + `DELEGATES_TO` N-hop |
| "민법 제750조를 인용하는 법령 중 **가장 많이 인용되는 것**은?" | **불가** | Cypher 집계 쿼리 |

**현재 FC-RAG 엔진이 이미 하고 있는 일**: Gemini가 `search_law` → `get_batch_articles` → `get_three_tier` 를 **여러 턴**에 걸쳐 호출해서 관계를 따라감. 이게 20~35초 걸리는 이유. Neo4j가 있으면 **1번의 Cypher 쿼리로 0.05초에 동일 결과** 도출.

---

## 2. 아키텍처 설계

### 2.1 전체 구조

```
┌─────────────────────────────────────────────────────────┐
│  LexDiff (Vercel / Next.js)                             │
│  ┌──────────────────────────────────┐                   │
│  │ /api/fc-rag/route.ts             │                   │
│  │  └─ executeRAGStream()           │                   │
│  │       ├─ Fast Path (기존 유지)    │                   │
│  │       ├─ graph_search (NEW)      │──── Bolt ────┐    │
│  │       ├─ search_ai_law (기존)    │              │    │
│  │       ├─ search_law (기존)       │              │    │
│  │       └─ ... 13개 도구 (기존)    │              │    │
│  └──────────────────────────────────┘              │    │
└────────────────────────────────────────────────────│────┘
                                                     │
┌────────────────────────────────────────────────────│────┐
│  미니PC (Docker)                                   │    │
│  ┌──────────────┐  ┌────────────────────────┐     │    │
│  │ OpenClaw      │  │ Neo4j Community 2026   │◄────┘    │
│  │ Bridge        │  │  ├─ 법령 노드 (~6,000) │          │
│  │ (기존 유지)   │  │  ├─ 조문 노드 (~500K)  │          │
│  └──────────────┘  │  ├─ 판례 노드 (~200K)  │          │
│                     │  ├─ 벡터 인덱스        │          │
│  ┌──────────────┐  │  └─ 관계 (~2M edges)   │          │
│  │ Indexer       │  └────────────────────────┘          │
│  │ (cron/수동)   │──── 법제처 API 크롤링                │
│  └──────────────┘                                       │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Neo4j 접속 방식

| 경로 | 프로토콜 | 설명 |
|------|---------|------|
| Vercel → Neo4j | Bolt (7687) via Cloudflare Tunnel | 기존 OpenClaw와 동일 터널 활용 |
| Indexer → Neo4j | Bolt (localhost:7687) | 미니PC 내부 통신 |
| 관리 UI | HTTP (7474) | Neo4j Browser (로컬 전용) |

---

## 3. 데이터 모델 (Graph Schema)

### 3.1 노드 타입

```cypher
-- 법령 (Law): 법률, 시행령, 시행규칙, 조례 등
(:Law {
  mst: "268725",              -- 법령일련번호 (PRIMARY KEY)
  lawId: "001556",            -- 법령ID
  name: "관세법",              -- 법령명
  type: "법률",               -- 법률|대통령령|총리령|부령|조례
  procDate: "20240101",       -- 공포일
  enfDate: "20240701",        -- 시행일
  ministry: "관세청",          -- 소관부처
  abbreviations: ["관세법"],   -- 약칭 목록
  updated_at: datetime()
})

-- 조문 (Article): 법령의 개별 조문
(:Article {
  id: "268725_003800",         -- mst_joCode (UNIQUE)
  mst: "268725",
  joCode: "003800",            -- 제38조 → "003800"
  joNo: "제38조",              -- 사람이 읽는 형태
  title: "신고납부",            -- 조문제목
  content: "... 조문 전문 ...", -- 본문 텍스트 (임베딩 대상)
  embedding: vector(768),      -- Gemini 임베딩 벡터
  updated_at: datetime()
})

-- 판례 (Precedent)
(:Precedent {
  id: "12345",                 -- 판례일련번호
  caseNumber: "2023다12345",   -- 사건번호
  courtName: "대법원",
  caseType: "민사",
  judgeDate: "20231215",
  summary: "판시사항 요약",
  updated_at: datetime()
})

-- 해석례 (Interpretation)
(:Interpretation {
  id: "22-0456",
  title: "해석례 제목",
  replyDate: "20220315",
  summary: "회신 요지",
  updated_at: datetime()
})
```

### 3.2 관계 타입

```cypher
-- 위임 관계: 법률 → 시행령 → 시행규칙
(law:Law)-[:DELEGATES_TO {articles: ["제38조"]}]->(decree:Law)

-- 법령-조문 소속
(law:Law)-[:HAS_ARTICLE]->(article:Article)

-- 조문 간 참조 ("제38조에 따른~", "민법 제750조를 준용")
(article:Article)-[:REFERENCES {context: "제38조에 따른 신고납부"}]->(target:Article)

-- 판례의 법조문 인용
(precedent:Precedent)-[:CITES]->(article:Article)

-- 해석례의 법조문 인용
(interpretation:Interpretation)-[:INTERPRETS]->(article:Article)

-- 관련 법령 (참조 관계, 동일 분야)
(law1:Law)-[:RELATED_TO {reason: "동일소관"}]->(law2:Law)
```

### 3.3 인덱스 정의

```cypher
-- 고유 제약
CREATE CONSTRAINT law_mst FOR (l:Law) REQUIRE l.mst IS UNIQUE;
CREATE CONSTRAINT article_id FOR (a:Article) REQUIRE a.id IS UNIQUE;
CREATE CONSTRAINT precedent_id FOR (p:Precedent) REQUIRE p.id IS UNIQUE;

-- 검색용 인덱스
CREATE INDEX law_name FOR (l:Law) ON (l.name);
CREATE INDEX article_joNo FOR (a:Article) ON (a.joNo);
CREATE INDEX precedent_caseNumber FOR (p:Precedent) ON (p.caseNumber);

-- 벡터 인덱스 (시맨틱 검색)
CREATE VECTOR INDEX article_embeddings FOR (a:Article) ON (a.embedding)
OPTIONS {indexConfig: {
  `vector.dimensions`: 768,
  `vector.similarity_function`: 'cosine'
}};

-- 전문 검색 인덱스 (키워드 검색)
CREATE FULLTEXT INDEX article_fulltext FOR (a:Article) ON EACH [a.content, a.title];
CREATE FULLTEXT INDEX law_fulltext FOR (l:Law) ON EACH [l.name];
```

---

## 4. 데이터 수집 파이프라인 (Indexer)

### 4.1 아키텍처

```
┌──────────────────────────────────────────┐
│  indexer.ts (Node.js 스크립트)            │
│  ├─ Phase 1: 법령 목록 수집              │
│  │   └─ 법제처 현행법령 목록 API 호출     │
│  │       → Law 노드 MERGE               │
│  ├─ Phase 2: 조문 수집                   │
│  │   └─ 각 법령별 get_law_text 호출      │
│  │       → Article 노드 MERGE            │
│  │       → HAS_ARTICLE 관계 생성         │
│  ├─ Phase 3: 관계 추출                   │
│  │   └─ 조문 본문에서 참조 법령 파싱      │
│  │       → REFERENCES 관계 생성          │
│  │       → DELEGATES_TO 관계 생성        │
│  ├─ Phase 4: 임베딩 생성                 │
│  │   └─ Gemini embedding API 호출        │
│  │       → Article.embedding 업데이트     │
│  └─ Phase 5: 판례/해석례 (선택)          │
│      └─ search_precedents 반복 호출      │
│          → Precedent 노드 + CITES 관계   │
└──────────────────────────────────────────┘
```

### 4.2 핵심 구현 — `scripts/neo4j-indexer.ts`

```typescript
/**
 * Neo4j 법령 인덱서
 *
 * 사용법:
 *   npx tsx scripts/neo4j-indexer.ts --phase=1       # 법령 목록만
 *   npx tsx scripts/neo4j-indexer.ts --phase=1,2,3   # 목록+조문+관계
 *   npx tsx scripts/neo4j-indexer.ts --phase=4        # 임베딩만
 *   npx tsx scripts/neo4j-indexer.ts --full           # 전체 (최초)
 *   npx tsx scripts/neo4j-indexer.ts --update         # 변경분만 (일일)
 */

import neo4j from 'neo4j-driver'
import { GoogleGenAI } from '@google/genai'
import { LawApiClient } from 'korean-law-mcp/build/lib/api-client.js'

// ─── 설정 ───

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687'
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j'
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || ''
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
const LAW_API_KEY = process.env.LAW_OC || ''

const EMBEDDING_MODEL = 'gemini-embedding-001'
const EMBEDDING_DIMENSIONS = 768  // 768로 충분. 3072은 저장공간 4배
const EMBEDDING_BATCH_SIZE = 100  // API 1회당 최대 250개, 안전하게 100

// Rate limit: 무료티어 100 RPM, 1000 RPD
// 400,000 조문 ÷ 100/batch = 4,000 요청 → 무료티어 초과
// → 유료 전환 시 $0.15/1M tokens, 400K 조문 × 평균 500 tokens = 200M tokens = $30
// → 또는 4일 분할 실행 (1000 RPD × 100/batch = 100K 조문/일)
const EMBEDDING_RPM_LIMIT = 80     // 여유분 두고 80
const EMBEDDING_RPD_LIMIT = 900    // 여유분 두고 900

// ─── Phase 1: 법령 목록 수집 ───

async function phase1_collectLaws(session: neo4j.Session, apiClient: LawApiClient) {
  console.log('[Phase 1] 현행법령 목록 수집...')

  // 법제처 API: 현행법령 목록 (페이지네이션)
  // open.law.go.kr/LSO/openApi/currentLawList.do
  let page = 1
  let total = 0

  while (true) {
    const result = await fetchLawList(page, LAW_API_KEY)
    if (!result.laws.length) break

    // 배치 MERGE (100건씩)
    await session.executeWrite(async tx => {
      for (const law of result.laws) {
        await tx.run(`
          MERGE (l:Law {mst: $mst})
          SET l.lawId = $lawId,
              l.name = $name,
              l.type = $type,
              l.procDate = $procDate,
              l.enfDate = $enfDate,
              l.ministry = $ministry,
              l.updated_at = datetime()
        `, law)
      }
    })

    total += result.laws.length
    console.log(`  ${total}건 처리 (page ${page})`)

    if (total >= result.totalCount) break
    page++
    await sleep(500) // rate limit 준수
  }

  console.log(`[Phase 1] 완료: ${total}건 법령`)
}

// ─── Phase 2: 조문 수집 ───

async function phase2_collectArticles(session: neo4j.Session, apiClient: LawApiClient) {
  console.log('[Phase 2] 조문 수집...')

  // 임베딩 미완료 or updated_at이 오래된 법령만 대상
  const laws = await session.executeRead(tx =>
    tx.run(`
      MATCH (l:Law)
      WHERE l.type IN ['법률', '대통령령', '총리령·부령']
      AND NOT EXISTS {
        MATCH (l)-[:HAS_ARTICLE]->(:Article)
        WHERE l.updated_at > datetime() - duration('P7D')
      }
      RETURN l.mst AS mst, l.name AS name
      LIMIT 50
    `)
  )

  for (const record of laws.records) {
    const mst = record.get('mst')
    const name = record.get('name')

    try {
      // korean-law-mcp의 get_law_text 활용
      const result = await apiClient.getLawText(mst)
      const articles = parseLawTextToArticles(result, mst)

      // 배치 MERGE
      await session.executeWrite(async tx => {
        for (const article of articles) {
          await tx.run(`
            MERGE (a:Article {id: $id})
            SET a.mst = $mst,
                a.joCode = $joCode,
                a.joNo = $joNo,
                a.title = $title,
                a.content = $content,
                a.updated_at = datetime()
            WITH a
            MATCH (l:Law {mst: $mst})
            MERGE (l)-[:HAS_ARTICLE]->(a)
          `, article)
        }
      })

      console.log(`  ${name}: ${articles.length}개 조문`)
      await sleep(300)
    } catch (e) {
      console.error(`  ${name} 실패:`, e)
    }
  }
}

// ─── Phase 3: 관계 추출 ───

async function phase3_extractRelations(session: neo4j.Session) {
  console.log('[Phase 3] 조문 간 참조 관계 추출...')

  // 조문 본문에서 "「법령명」 제N조" 패턴 추출 → REFERENCES 관계 생성
  // 이 작업은 LLM 없이 순수 regex로 수행 (비용 $0)
  const articles = await session.executeRead(tx =>
    tx.run(`
      MATCH (a:Article)
      WHERE a.content CONTAINS '제' AND a.content CONTAINS '조'
      AND NOT EXISTS { (a)-[:REFERENCES]->() }
      RETURN a.id AS id, a.content AS content, a.mst AS mst
      LIMIT 1000
    `)
  )

  const refPattern = /「([^」]+)」\s*제(\d+)조(?:의(\d+))?/g

  for (const record of articles.records) {
    const content = record.get('content')
    const sourceId = record.get('id')
    const matches = Array.from(content.matchAll(refPattern))

    for (const match of matches) {
      const targetLawName = match[1]
      const targetJoNo = match[3]
        ? `제${match[2]}조의${match[3]}`
        : `제${match[2]}조`

      // 대상 조문이 DB에 있으면 관계 생성
      await session.executeWrite(tx =>
        tx.run(`
          MATCH (source:Article {id: $sourceId})
          MATCH (targetLaw:Law {name: $targetLawName})-[:HAS_ARTICLE]->(target:Article {joNo: $targetJoNo})
          MERGE (source)-[:REFERENCES {context: $context}]->(target)
        `, {
          sourceId,
          targetLawName,
          targetJoNo,
          context: match[0],
        })
      )
    }
  }

  // 위임법령 관계: 법률→시행령, 시행령→시행규칙
  // 법제처 체계도 API 또는 법령명 패턴 매칭으로 생성
  await session.executeWrite(tx =>
    tx.run(`
      MATCH (parent:Law), (child:Law)
      WHERE parent.type = '법률'
        AND child.type = '대통령령'
        AND child.name STARTS WITH parent.name
        AND child.name ENDS WITH '시행령'
      MERGE (parent)-[:DELEGATES_TO]->(child)
    `)
  )

  await session.executeWrite(tx =>
    tx.run(`
      MATCH (parent:Law), (child:Law)
      WHERE parent.type = '대통령령'
        AND child.type IN ['총리령·부령', '부령']
        AND replace(child.name, ' 시행규칙', '') = replace(parent.name, ' 시행령', '')
      MERGE (parent)-[:DELEGATES_TO]->(child)
    `)
  )

  console.log('[Phase 3] 완료')
}

// ─── Phase 4: 임베딩 생성 ───

async function phase4_embeddings(session: neo4j.Session) {
  console.log('[Phase 4] Gemini 임베딩 생성...')

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  let dailyRequestCount = 0

  while (dailyRequestCount < EMBEDDING_RPD_LIMIT) {
    // 임베딩 미생성 조문 배치 로드
    const batch = await session.executeRead(tx =>
      tx.run(`
        MATCH (a:Article)
        WHERE a.embedding IS NULL AND a.content IS NOT NULL
        RETURN a.id AS id, a.joNo + ': ' + a.title + '\n' + a.content AS text
        LIMIT $limit
      `, { limit: EMBEDDING_BATCH_SIZE })
    )

    if (batch.records.length === 0) {
      console.log('  모든 조문 임베딩 완료!')
      break
    }

    const texts = batch.records.map(r => r.get('text').slice(0, 2048)) // 2048 토큰 제한
    const ids = batch.records.map(r => r.get('id'))

    try {
      const response = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: texts.map(t => ({ parts: [{ text: t }] })),
        config: { outputDimensionality: EMBEDDING_DIMENSIONS },
      })

      // 벡터를 Neo4j에 저장
      await session.executeWrite(async tx => {
        for (let i = 0; i < ids.length; i++) {
          const embedding = response.embeddings[i].values
          await tx.run(`
            MATCH (a:Article {id: $id})
            SET a.embedding = $embedding
          `, { id: ids[i], embedding })
        }
      })

      dailyRequestCount++
      console.log(`  배치 ${dailyRequestCount}: ${ids.length}건 임베딩 (총 ${dailyRequestCount * EMBEDDING_BATCH_SIZE}건)`)

      // Rate limit: 80 RPM → 750ms 간격
      await sleep(750)
    } catch (e) {
      console.error('  임베딩 오류:', e)
      await sleep(5000) // 에러 시 5초 대기
    }
  }
}
```

### 4.3 실행 시간·비용 예측

| Phase | 대상 | 소요 시간 | API 비용 |
|-------|------|----------|---------|
| 1. 법령 목록 | ~6,000 법령 | ~10분 | $0 (법제처 무료) |
| 2. 조문 수집 | ~400,000 조문 | ~8시간 (rate limit) | $0 (법제처 무료) |
| 3. 관계 추출 | regex 파싱 | ~5분 | $0 (로컬 처리) |
| 4. 임베딩 | ~400,000 조문 | **4일** (무료) / **2시간** (유료) | $0 (무료) / ~$30 (유료) |
| 5. 판례 (선택) | ~200,000 판례 | ~12시간 | $0 |

**무료 전략 (4일 분할)**:
- 1일차: Phase 1+2 (법령 목록 + 조문 수집)
- 2~5일차: Phase 4 (임베딩 1000 RPD × 100/batch = 100K 조문/일)
- Phase 3은 아무 때나 가능 (로컬 처리)

**유료 전략 (반나절 완료)**:
- 전체 Phase 1~4를 연속 실행
- 임베딩 비용: 400K 조문 × 500 tokens/조문 = 200M tokens × $0.15/1M = **$30**
- 이후 일일 업데이트: 변경분만 (~100건/일) = 사실상 $0

---

## 5. FC-RAG 엔진 통합 — `graph_search` 도구

### 5.1 도구 정의

```typescript
// lib/fc-rag/tools/graph-search.ts

import neo4j from 'neo4j-driver'
import { z } from 'zod'
import { GoogleGenAI } from '@google/genai'

export const GraphSearchSchema = z.object({
  query: z.string().describe('자연어 검색 쿼리'),
  mode: z.enum(['semantic', 'traverse', 'hybrid']).default('hybrid')
    .describe('검색 모드: semantic(벡터), traverse(관계 탐색), hybrid(둘 다)'),
  lawName: z.string().optional().describe('특정 법령명으로 범위 제한'),
  depth: z.number().min(1).max(3).default(2)
    .describe('관계 탐색 깊이 (1=직접 연결, 2=2-hop, 3=3-hop)'),
})

// Neo4j 드라이버 싱글턴
let _driver: neo4j.Driver | null = null
function getDriver(): neo4j.Driver {
  if (!_driver) {
    _driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || ''
      )
    )
  }
  return _driver
}

// Gemini 임베딩 (쿼리용)
async function embedQuery(query: string): Promise<number[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })
  const response = await ai.models.embedContent({
    model: 'gemini-embedding-001',
    contents: [{ parts: [{ text: query }] }],
    config: { outputDimensionality: 768 },
  })
  return response.embeddings[0].values
}

export async function graphSearch(
  _client: unknown,
  input: z.infer<typeof GraphSearchSchema>
) {
  const driver = getDriver()
  const session = driver.session()

  try {
    const results: string[] = []

    // ── 1. 시맨틱 검색 (벡터) ──
    if (input.mode !== 'traverse') {
      const queryVector = await embedQuery(input.query)

      const vectorResult = await session.executeRead(tx =>
        tx.run(`
          CALL db.index.vector.queryNodes('article_embeddings', 10, $vector)
          YIELD node, score
          WHERE score > 0.7
          MATCH (law:Law)-[:HAS_ARTICLE]->(node)
          RETURN law.name AS lawName, node.joNo AS joNo,
                 node.title AS title, node.content AS content,
                 score
          ORDER BY score DESC
          LIMIT 5
        `, { vector: queryVector })
      )

      if (vectorResult.records.length > 0) {
        results.push('## 시맨틱 검색 결과\n')
        for (const r of vectorResult.records) {
          results.push(
            `### 「${r.get('lawName')}」 ${r.get('joNo')}(${r.get('title') || ''})`,
            `유사도: ${(r.get('score') * 100).toFixed(1)}%`,
            r.get('content').slice(0, 500),
            ''
          )
        }
      }
    }

    // ── 2. 관계 탐색 (그래프) ──
    if (input.mode !== 'semantic') {
      // 2a. 위임법령 체계
      if (input.lawName) {
        const delegationResult = await session.executeRead(tx =>
          tx.run(`
            MATCH path = (l:Law)-[:DELEGATES_TO*1..2]->(child:Law)
            WHERE l.name CONTAINS $lawName
            RETURN [n IN nodes(path) | n.name] AS chain,
                   [n IN nodes(path) | n.type] AS types
          `, { lawName: input.lawName })
        )

        if (delegationResult.records.length > 0) {
          results.push('\n## 위임법령 체계\n')
          for (const r of delegationResult.records) {
            const chain = r.get('chain')
            const types = r.get('types')
            results.push(chain.map((n: string, i: number) => `${n}(${types[i]})`).join(' → '))
          }
        }
      }

      // 2b. 참조 법령 네트워크
      const refLawName = input.lawName || extractLawName(input.query)
      if (refLawName) {
        const refResult = await session.executeRead(tx =>
          tx.run(`
            MATCH (l:Law {name: $lawName})-[:HAS_ARTICLE]->(a:Article)
                  -[:REFERENCES]->(target:Article)<-[:HAS_ARTICLE]-(other:Law)
            RETURN DISTINCT other.name AS refLaw,
                   collect(DISTINCT target.joNo)[..3] AS articles,
                   count(*) AS refCount
            ORDER BY refCount DESC
            LIMIT 5
          `, { lawName: refLawName })
        )

        if (refResult.records.length > 0) {
          results.push('\n## 참조 법령\n')
          for (const r of refResult.records) {
            results.push(
              `- 「${r.get('refLaw')}」 (${r.get('refCount')}회 참조): ${r.get('articles').join(', ')}`
            )
          }
        }
      }

      // 2c. 관련 판례
      const caseResult = await session.executeRead(tx =>
        tx.run(`
          CALL db.index.vector.queryNodes('article_embeddings', 3, $vector)
          YIELD node, score
          WHERE score > 0.75
          MATCH (p:Precedent)-[:CITES]->(node)
          RETURN p.caseNumber AS caseNo, p.courtName AS court,
                 p.summary AS summary, node.joNo AS citedArticle
          LIMIT 3
        `, { vector: await embedQuery(input.query) })
      )

      if (caseResult.records.length > 0) {
        results.push('\n## 관련 판례\n')
        for (const r of caseResult.records) {
          results.push(
            `- ${r.get('court')} ${r.get('caseNo')} (인용: ${r.get('citedArticle')})`,
            `  ${r.get('summary')?.slice(0, 150) || ''}`
          )
        }
      }
    }

    return {
      content: [{ type: 'text', text: results.join('\n') || '검색 결과가 없습니다.' }],
      isError: false,
    }
  } finally {
    await session.close()
  }
}

function extractLawName(query: string): string | null {
  const match = query.match(/「([^」]+)」/) || query.match(/([\w가-힣]+(?:법|령|규칙))/)
  return match?.[1] || null
}
```

### 5.2 tool-adapter.ts 통합

```typescript
// lib/fc-rag/tool-adapter.ts 에 추가

import { graphSearch, GraphSearchSchema } from './tools/graph-search'

// TOOLS 배열에 추가:
{
  name: 'graph_search',
  description: '법령 지식그래프 검색. 조문 시맨틱 검색 + 위임법령 체계 + 참조 법령 + 관련 판례를 한번에 조회합니다. 법령 간 관계를 파악할 때 search_ai_law보다 정확합니다.',
  schema: GraphSearchSchema,
  handler: graphSearch,
}
```

### 5.3 프롬프트 수정 (prompts.ts)

```typescript
// 도구 사용 우선순위 변경:
`## 도구 사용 (우선순위)
1. **graph_search 우선**: 법령 관계(위임법령, 참조법령, 판례)가 필요한 질문에 사용.
   mode="hybrid"로 시맨틱 검색 + 관계 탐색을 한번에 수행.
2. **search_ai_law**: graph_search 결과가 부족하거나 그래프에 없는 법령일 때 사용.
3. **get_batch_articles**: graph_search가 조문 요약만 제공할 때 전문이 필요하면 사용.
4. 이하 기존과 동일...`
```

---

## 6. 일일 업데이트 파이프라인

### 6.1 변경 감지 전략

```typescript
// scripts/neo4j-daily-update.ts

/**
 * 매일 자정 실행 (cron: 0 0 * * *)
 *
 * 1. 법제처 "최근 개정 법령" API 호출 (최근 7일)
 * 2. 변경된 법령만 조문 재수집
 * 3. 변경된 조문만 임베딩 재생성
 * 4. 관계 재추출 (변경된 조문만)
 *
 * 일일 변경량: 평균 10~50건 법령, 100~500건 조문
 * 소요 시간: 10~30분
 * 임베딩 비용: 무료 (1000 RPD 내)
 */

async function dailyUpdate() {
  // 1. 최근 개정 법령 조회
  const recentLaws = await fetchRecentlyAmendedLaws(7) // 최근 7일

  // 2. 변경된 법령의 조문 재수집
  for (const law of recentLaws) {
    await phase2_collectArticles(session, apiClient, [law.mst])
    // 기존 조문과 비교: content가 변경된 것만 embedding = null 처리
    await session.executeWrite(tx =>
      tx.run(`
        MATCH (l:Law {mst: $mst})-[:HAS_ARTICLE]->(a:Article)
        WHERE a.updated_at > datetime() - duration('PT1H')
        SET a.embedding = null
      `, { mst: law.mst })
    )
  }

  // 3. 임베딩 재생성 (변경분만)
  await phase4_embeddings(session) // embedding IS NULL인 것만 처리

  // 4. 관계 재추출 (변경분만)
  await phase3_extractRelations(session)

  console.log(`[일일 업데이트] ${recentLaws.length}건 법령 업데이트 완료`)
}
```

### 6.2 cron 설정 (미니PC)

```bash
# crontab -e
# 매일 새벽 3시 실행
0 3 * * * cd /home/user/lexdiff && npx tsx scripts/neo4j-daily-update.ts >> /var/log/neo4j-indexer.log 2>&1
```

---

## 7. 미니PC 인프라 구성

### 7.1 Docker Compose

```yaml
# docker-compose.neo4j.yml

services:
  neo4j:
    image: neo4j:2026.01.4-community
    container_name: lexdiff-neo4j
    restart: always
    ports:
      - "7474:7474"   # Browser (로컬 전용)
      - "7687:7687"   # Bolt (Cloudflare Tunnel 노출)
    environment:
      - NEO4J_AUTH=neo4j/${NEO4J_PASSWORD}
      - NEO4J_PLUGINS=["genai"]       # 벡터 검색 플러그인
      - NEO4J_server_memory_heap_initial__size=512m
      - NEO4J_server_memory_heap_max__size=1g
      - NEO4J_server_memory_pagecache_size=512m
      - NEO4J_dbms_security_procedures_unrestricted=genai.*
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
    # 리소스 제한 (미니PC 보호)
    deploy:
      resources:
        limits:
          memory: 2g
          cpus: '2.0'

volumes:
  neo4j_data:
  neo4j_logs:
```

### 7.2 리소스 예측

| 항목 | 예상 사용량 | 비고 |
|------|-----------|------|
| 디스크 | ~2~4GB | 500K 노드 + 2M 관계 + 벡터 인덱스 |
| 메모리 | ~1.5~2GB | Heap 1G + PageCache 512M |
| CPU | 유휴 시 <5% | 쿼리 시 일시적 증가 |

미니PC 최소 스펙: **RAM 4GB 이상** (Neo4j 2G + OS + OpenClaw Bridge)

### 7.3 Cloudflare Tunnel 설정

```yaml
# cloudflared config에 추가
ingress:
  - hostname: neo4j.yourdomain.com
    service: tcp://localhost:7687
  # 기존 OpenClaw 설정 유지
  - hostname: openclaw.yourdomain.com
    service: http://localhost:8080
```

**보안**: Cloudflare Access 정책으로 Neo4j Bolt 포트 접근 제한 (기존 OpenClaw와 동일)

---

## 8. 비용 시나리오

### 시나리오 A: 최소 비용 (무료)

| 항목 | 비용 | 설명 |
|------|------|------|
| Neo4j Community | $0 | Docker self-hosted |
| 임베딩 (초기) | $0 | 무료티어 4일 분할 실행 |
| 임베딩 (일일) | $0 | 변경분 100건/일 = 무료티어 내 |
| 법제처 API | $0 | 무료 |
| Gemini Flash (쿼리) | $0~5/월 | 기존 비용 (오히려 도구 턴 감소로 절감) |
| **총 월 비용** | **$0~5** | |

### 시나리오 B: 최상 품질 (유료)

| 항목 | 비용 | 설명 |
|------|------|------|
| Neo4j Community | $0 | Docker self-hosted |
| 임베딩 (초기) | $30 (1회) | 유료 티어 2시간 완료 |
| 임베딩 (일일) | $0~0.5/월 | 변경분 소량 |
| 3072차원 벡터 | +$0 | 더 정밀한 검색, 디스크 4배 (~12GB) |
| 판례 인덱싱 | +$15 (1회) | 200K 판례 임베딩 |
| Gemini 3.1 Flash | $5~15/월 | 복잡 질문에 고급 모델 사용 |
| **총 월 비용** | **$5~15** | 초기 $45 1회 투자 |

### 비용 대비 효과

| 지표 | 현재 (API만) | 시나리오 A (최소) | 시나리오 B (최상) |
|------|------------|----------------|----------------|
| 단순 질문 응답 시간 | 20~25초 | **3~5초** | **1~3초** |
| 복합 관계 질문 정확도 | 45~50% | **70~75%** | **80~85%** |
| multi-hop 질문 지원 | 불가 (수동 N턴) | **1-hop 자동** | **3-hop 자동** |
| Gemini 도구 턴 수 | 2~4턴 | **1~2턴** | **1턴** |
| 월 비용 | $15~25 | **$0~5** | **$5~15** |

---

## 9. 구현 로드맵

```
Week 1: 인프라 + 초기 데이터
├─ Day 1: Docker Compose 배포, Neo4j 기동 확인
├─ Day 2: Phase 1 (법령 목록 수집) + Phase 3 (위임관계 추출)
├─ Day 3: Phase 2 시작 (조문 수집, 상위 500 법령)
├─ Day 4-5: Phase 2 계속 + Phase 4 시작 (임베딩, 무료티어)
└─ Day 5: 기본 Cypher 쿼리 테스트

Week 2: 엔진 통합 + 테스트
├─ Day 6: graph_search 도구 구현
├─ Day 7: tool-adapter.ts 통합 + 프롬프트 수정
├─ Day 8: Cloudflare Tunnel Bolt 설정
├─ Day 9: 10개 테스트 질문으로 A/B 비교
└─ Day 10: 일일 업데이트 cron 설정

Week 3: 판례 + 최적화 (선택)
├─ Phase 5: 판례 인덱싱 (200K)
├─ 관계 품질 검증 + 누락 관계 보완
├─ 쿼리 성능 튜닝 (인덱스 최적화)
└─ 프로덕션 배포
```

---

## 10. 리스크와 완화 전략

| 리스크 | 영향 | 완화 |
|--------|------|------|
| 미니PC 다운 → Neo4j 접속 불가 | 그래프 검색 불가 | FC-RAG 엔진이 기존 도구로 **자동 폴백** (현재와 동일 동작) |
| 임베딩 품질 부족 (한국어) | 시맨틱 검색 정확도 저하 | search_ai_law 병용, 768→3072차원 전환 검토 |
| 조문 개정 후 벡터 불일치 | 옛 조문 검색 | 일일 업데이트 + 변경 감지 (enfDate 비교) |
| Cloudflare Tunnel Bolt 지연 | 쿼리 지연 | 결과 캐싱 (tool-adapter 캐시 계층) |
| Neo4j 메모리 부족 (미니PC) | 서버 크래시 | deploy.resources.limits 설정, PageCache 조정 |

**핵심 안전장치**: Neo4j는 **보조 도구**. 기존 13개 도구 + 법제처 API는 그대로 유지. graph_search 실패 시 기존 파이프라인으로 자동 폴백.

---

## 11. 관련 문서

| 문서 | 내용 |
|------|------|
| [12-RAG_PIPELINE_OPTIMIZATION_PLAN](12-RAG_PIPELINE_OPTIMIZATION_PLAN.md) | 전체 RAG 최적화 종합안 |
| [05-RAG_ARCHITECTURE](05-RAG_ARCHITECTURE.md) | 현재 FC-RAG/SSE 아키텍처 |
| [PIPELINE_IMPROVEMENT_PLAN](../PIPELINE_IMPROVEMENT_PLAN.md) | Bridge 중심 개선안 |

---

**버전**: 1.0 | **작성**: 2026-03-04
