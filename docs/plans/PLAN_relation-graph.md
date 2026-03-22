# Implementation Plan: 법령 관계 그래프 + 영향 분석

**Status**: Draft (승인 대기)
**Started**: 2026-03-22 | **Last Updated**: 2026-03-22 | **Estimated Completion**: -
**Plan Size**: Large (6 phases, ~18-22 hours)

---

**CRITICAL INSTRUCTIONS**: After completing each phase:
1. Check off completed task checkboxes
2. Run all quality gate validation commands
3. Verify ALL quality gate items pass
4. Update "Last Updated" date above
5. Document learnings in Notes section
6. Only then proceed to next phase

**DO NOT skip quality gates or proceed with failing checks**

---

## Overview

### Feature Description
법령 간 관계(위임/인용/해석/근거/구체화/개정)를 **Supabase PostgreSQL** 관계 테이블로 저장하고,
"이 조문이 바뀌면 뭐가 흔들리나" 영향 분석 기능을 법령 뷰어에 추가한다.

현재 LexDiff는 완전 API-driven 구조로 모든 관계를 매번 법제처 API에서 즉석 계산한다.
이를 Supabase 관계 테이블로 캐싱하여 탐색 속도를 높이고,
축적된 관계 데이터 위에서 영향 분석 쿼리를 실행한다.

> Supabase 선택 이유: 서버리스 호환 + 추후 로그인/인증 통합 예정

### Success Criteria
- [ ] Supabase 관계 테이블(law_node, law_edge)이 동작
- [ ] 기존 3-tier/판례 조회 시 관계가 자동으로 DB에 적재 (Lazy Crawl)
- [ ] `/api/impact-analysis?lawId=X&jo=003800` API가 상하향/횡단/판례 영향 반환
- [ ] 법령 뷰어에서 "영향 분석" 버튼 클릭 → 영향 트리 표시
- [ ] 기존 기능 회귀 없음

### User Impact
- 위임 체인 조회 속도 향상 (캐시 히트 시 법제처 API 호출 스킵)
- "이 조문 바뀌면 뭐에 영향?" 질문에 즉시 답변
- 법령 간 관계 시각화로 법령 구조 이해도 향상

---

## Architecture Decisions

| Decision | Rationale | Trade-offs |
|----------|-----------|------------|
| **Supabase PostgreSQL** | 서버리스 호환, 추후 Auth 통합, 무료 티어 충분, WITH RECURSIVE 지원 | 외부 의존성 추가, 네트워크 레이턴시 (법제처 API보다는 빠름) |
| **Lazy Crawl** (사용 기반 적재) | 별도 크롤러/배치 없이 자연스럽게 DB 축적, 사용자가 많이 보는 법령부터 채워짐 | 초기에 DB가 비어있음, 첫 조회는 여전히 API 호출 필요 |
| **기존 API 흐름 유지** | 기존 three-tier/precedent API는 그대로 동작, DB 적재는 side-effect로 추가 | 코드 결합도 약간 증가 |
| **PostgreSQL 재귀 CTE** | 다단계 위임 체인 탐색에 `WITH RECURSIVE` 활용, Neo4j 없이 그래프 쿼리 | 복잡한 그래프 패턴 매칭은 어려움 (LexDiff 수준에서는 충분) |
| **RLS 미적용 (초기)** | 관계 데이터는 공개 데이터 (법령), 인증 도입 전까지 RLS 불필요 | 추후 사용자별 북마크 등 추가 시 RLS 적용 필요 |

---

## Dependencies

### Required Before Starting
- [ ] Supabase 프로젝트 생성 (또는 기존 프로젝트에 테이블 추가)
- [ ] `SUPABASE_URL`, `SUPABASE_ANON_KEY` 환경변수 설정

### External Dependencies
- `@supabase/supabase-js`: ^2.x (Supabase 클라이언트)

---

## Test Strategy

**TDD Principle**: Write tests FIRST, then implement to make them pass

| Test Type | Coverage Target | Purpose |
|-----------|-----------------|---------|
| **Unit Tests** | >=80% | 관계 타입 검증, 추출기 로직, 영향 분석 쿼리 구성 |
| **Integration Tests** | Critical paths | API 호출 → DB 적재 → 영향 분석 조회 전체 흐름 |
| **Component Tests** | Key UI | 영향 분석 패널 렌더링, 버튼 인터랙션 |

> 테스트에서 Supabase 호출은 mock 처리. 통합 테스트는 실제 Supabase dev 프로젝트 사용 가능.

---

## Implementation Phases

---

### Phase 1: Supabase 셋업 + 스키마 + 기본 CRUD
**Goal**: Supabase 연결, 테이블 생성, 노드/엣지 CRUD 동작 확인
**Time**: 3 hours | **Status**: Pending

#### Tasks

**RED: Write Failing Tests First**
- [ ] **Test 1.1**: 관계 타입 enum 테스트
  - File: `__tests__/lib/relation-graph/relation-types.test.ts`
  - Cases: 6개 관계 타입 유효성, 잘못된 타입 거부
- [ ] **Test 1.2**: Supabase 클라이언트 + CRUD 테스트 (mocked)
  - File: `__tests__/lib/relation-graph/relation-db.test.ts`
  - Cases: 노드 upsert, 엣지 upsert, 중복 방지, 삭제, 벌크 삽입, 빈 DB 조회 시 빈 배열

**GREEN: Implement to Make Tests Pass**
- [ ] **Task 1.3**: Supabase 설치 + 환경변수
  - `pnpm add @supabase/supabase-js`
  - `.env.local`에 `SUPABASE_URL`, `SUPABASE_ANON_KEY` 추가
- [ ] **Task 1.4**: Supabase 클라이언트 싱글턴 → `lib/supabase.ts`
  ```typescript
  import { createClient } from '@supabase/supabase-js'
  import type { Database } from './relation-graph/database.types'

  export const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  )
  ```
- [ ] **Task 1.5**: 관계 타입 정의 → `lib/relation-graph/relation-types.ts`
  ```typescript
  export type RelationType =
    | 'delegates'    // 위임 (법률→시행령)
    | 'implements'   // 구체화 (시행령→고시)
    | 'cites'        // 인용 (조문→조문)
    | 'interprets'   // 해석 (판례→조문)
    | 'basis'        // 근거 (법률→조례)
    | 'amends'       // 개정

  export type LawNodeType =
    | 'law' | 'decree' | 'rule'
    | 'ordinance' | 'admin_rule' | 'precedent'

  export type LawStatus = 'active' | 'repealed' | 'pending'
  ```
- [ ] **Task 1.6**: SQL 마이그레이션 (Supabase Dashboard 또는 migration 파일)
  ```sql
  -- law_node 테이블
  CREATE TABLE law_node (
    id TEXT PRIMARY KEY,              -- lawId (법제처 MST) 또는 판례번호
    title TEXT NOT NULL,
    type TEXT NOT NULL,               -- law/decree/rule/ordinance/admin_rule/precedent
    status TEXT DEFAULT 'active',
    effective_date TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  );

  -- law_edge 테이블
  CREATE TABLE law_edge (
    id BIGSERIAL PRIMARY KEY,
    from_id TEXT NOT NULL REFERENCES law_node(id),
    to_id TEXT NOT NULL REFERENCES law_node(id),
    relation TEXT NOT NULL,            -- delegates/implements/cites/interprets/basis/amends
    from_article TEXT,                 -- 조문번호 (nullable, 6자리 코드)
    to_article TEXT,
    metadata JSONB DEFAULT '{}',       -- 위임 깊이, 출처 등
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(from_id, to_id, relation, from_article, to_article)
  );

  -- 인덱스
  CREATE INDEX idx_edge_from ON law_edge(from_id, from_article);
  CREATE INDEX idx_edge_to ON law_edge(to_id, to_article);
  CREATE INDEX idx_edge_relation ON law_edge(relation);
  CREATE INDEX idx_node_type ON law_node(type);
  ```
- [ ] **Task 1.7**: DB 모듈 → `lib/relation-graph/relation-db.ts`
  - `upsertNode()`, `upsertEdge()`, `bulkUpsertEdges()`
  - `getNodeById()`, `getEdgesFrom()`, `getEdgesTo()`
  - `deleteNode()`, `deleteEdge()`
  - Supabase `.upsert()` + `onConflict` 활용
- [ ] **Task 1.8**: TypeScript 타입 생성 → `lib/relation-graph/database.types.ts`
  - Supabase CLI `supabase gen types` 또는 수동 작성

**REFACTOR: Clean Up Code**
- [ ] **Task 1.9**: 에러 핸들링 정리, Supabase 에러 래핑

#### Quality Gate

**Validation Commands**:
```bash
npx vitest run __tests__/lib/relation-graph/
npm run lint
npm run build
```

**Manual Test Checklist**:
- [ ] Supabase Dashboard에서 테이블 확인
- [ ] 노드 upsert 후 조회 시 동일 데이터 반환
- [ ] 중복 엣지 삽입 시 에러 없이 업데이트
- [ ] SUPABASE_URL 없을 때 graceful 실패 (앱 크래시 없음)

---

### Phase 2: Three-Tier/판례 → DB 적재 (Lazy Crawl)
**Goal**: 기존 3-tier/판례 API 응답에서 관계를 추출하여 자동으로 Supabase에 적재
**Time**: 3-4 hours | **Status**: Pending

#### Tasks

**RED: Write Failing Tests First**
- [ ] **Test 2.1**: ThreeTierData → 관계 추출 함수 테스트
  - File: `__tests__/lib/relation-graph/extractors/three-tier-extractor.test.ts`
  - Cases:
    - 위임조문 1건 → delegates 엣지 1개 생성
    - 시행령 + 시행규칙 → 각각 별도 엣지
    - 행정규칙 → implements 엣지
    - 빈 delegations → 엣지 0개
    - lawName 없는 DelegationItem → 스킵
- [ ] **Test 2.2**: 판례 참조 → 관계 추출 테스트
  - File: `__tests__/lib/relation-graph/extractors/precedent-extractor.test.ts`
  - Cases:
    - 판례 검색 결과 → interprets 엣지 생성
    - 판례 상세의 참조조문 → cites 엣지 생성

**GREEN: Implement to Make Tests Pass**
- [ ] **Task 2.3**: Three-tier 관계 추출기 → `lib/relation-graph/extractors/three-tier-extractor.ts`
  ```typescript
  export function extractRelationsFromThreeTier(
    sourceLawId: string,
    sourceLawTitle: string,
    data: ThreeTierData
  ): { nodes: LawNode[], edges: LawEdge[] }
  ```
  - ThreeTierArticle.delegations 순회
  - DelegationItem.type → RelationType 매핑
    - "시행령" → delegates
    - "시행규칙" → delegates
    - "행정규칙" → implements
  - 대상 법령 노드 자동 생성 (lawName 기반, id는 lawName 해시 또는 lookup)

- [ ] **Task 2.4**: 판례 관계 추출기 → `lib/relation-graph/extractors/precedent-extractor.ts`
  ```typescript
  export function extractRelationsFromPrecedent(
    lawId: string, article: string,
    precedents: PrecedentSearchResult[]
  ): { nodes: LawNode[], edges: LawEdge[] }
  ```

- [ ] **Task 2.5**: DB 적재 트리거 — 기존 API 라우트에 side-effect 추가
  - `app/api/three-tier/route.ts` — 응답 반환 후 비동기로 DB 적재
  - `app/api/precedent-search/route.ts` — 동일 패턴
  - **핵심**: 기존 응답 속도에 영향 없도록 fire-and-forget
  ```typescript
  // 기존 응답 먼저 반환
  const response = NextResponse.json(result);
  // 비동기 적재 (에러 무시, 로깅만)
  storeRelationsAsync(extractedData).catch(e => debugLogger.warn('relation-store', e));
  return response;
  ```

**REFACTOR: Clean Up Code**
- [ ] **Task 2.6**: 추출기 공통 인터페이스 정리
  ```typescript
  interface ExtractionResult {
    nodes: LawNodeInsert[]
    edges: LawEdgeInsert[]
  }
  ```

#### Quality Gate

**Validation Commands**:
```bash
npx vitest run __tests__/lib/relation-graph/
npm run lint
npm run build
```

**Manual Test Checklist**:
- [ ] 법령 뷰어에서 위임법령 조회 → Supabase에 관계 저장 확인
- [ ] 판례 조회 → Supabase에 interprets 엣지 저장 확인
- [ ] 기존 3-tier API 응답 속도 변화 없음
- [ ] Supabase 에러 발생해도 기존 기능 정상 동작

---

### Phase 3: 인용 관계 추출 (unified-link-generator 연동)
**Goal**: 법령 본문의 인용 패턴(「관세법」제38조)에서 cites 관계 추출 → DB 적재
**Time**: 2-3 hours | **Status**: Pending

#### Tasks

**RED: Write Failing Tests First**
- [ ] **Test 3.1**: 법령 본문 텍스트 → cites 관계 추출 테스트
  - File: `__tests__/lib/relation-graph/extractors/citation-extractor.test.ts`
  - Cases:
    - `「관세법」 제38조` → cites 엣지 (법령명 + 조문)
    - `같은 법 제40조` → cites 엣지 (컨텍스트에서 법명 추론)
    - `시행령 제54조` → cites 엣지 (decree 타입)
    - 인용 없는 텍스트 → 빈 배열
    - 중복 인용 → 디딥

**GREEN: Implement to Make Tests Pass**
- [ ] **Task 3.2**: 인용 관계 추출기 → `lib/relation-graph/extractors/citation-extractor.ts`
  - unified-link-generator의 `collectQuotedLawMatches` 등 재사용
  - 텍스트에서 법령 참조 패턴 추출 → LawEdge[] 변환
  ```typescript
  export function extractCitationsFromText(
    sourceLawId: string, sourceArticle: string,
    text: string, contextLawName?: string
  ): ExtractionResult
  ```
- [ ] **Task 3.3**: 법령 본문 조회 시 적재 트리거 추가
  - 법령 뷰어가 조문 본문 로드할 때 → 인용 추출 → DB 적재
  - 클라이언트에서 추출 후 `/api/relation-graph/store` 엔드포인트로 전송
  - 또는 서버사이드에서 법령 텍스트 캐시 시점에 추출

**REFACTOR: Clean Up Code**
- [ ] **Task 3.4**: 3개 추출기(three-tier, precedent, citation) 공통 인터페이스 정리

#### Quality Gate

**Validation Commands**:
```bash
npx vitest run __tests__/lib/relation-graph/
npm run lint
npm run build
```

**Manual Test Checklist**:
- [ ] 관세법 제30조 본문 로드 → 인용된 다른 조문 Supabase에 저장
- [ ] 기존 link-generator 동작 변화 없음

---

### Phase 4: 영향 분석 API
**Goal**: 관계 DB를 기반으로 상향/하향/횡단/판례 영향 분석 API 구현
**Time**: 3-4 hours | **Status**: Pending

#### Tasks

**RED: Write Failing Tests First**
- [ ] **Test 4.1**: 영향 분석 쿼리 함수 테스트
  - File: `__tests__/lib/relation-graph/impact-analysis.test.ts`
  - Cases:
    - 하향 영향: 법률 조문 → 위임받은 시행령/시행규칙 반환
    - 상향 영향: 시행령 조문 → 근거 법률 반환
    - 횡단 영향: 같은 법 내 인용 조문 반환
    - 판례 영향: 해당 조문 해석 판례 반환
    - 재귀 탐색: 2단 위임 (법률→시행령→시행규칙) 한번에 반환
    - 빈 DB → 빈 결과 (에러 없이)
- [ ] **Test 4.2**: API 라우트 테스트
  - File: `__tests__/app/api/impact-analysis.test.ts`
  - Cases: 정상 응답, 필수 파라미터 누락, DB 비어있을 때

**GREEN: Implement to Make Tests Pass**
- [ ] **Task 4.3**: 영향 분석 쿼리 모듈 → `lib/relation-graph/impact-analysis.ts`
  ```typescript
  interface ImpactResult {
    downstream: ImpactItem[]   // 하향: 위임받은 하위법령
    upstream: ImpactItem[]     // 상향: 근거 법률
    lateral: ImpactItem[]      // 횡단: 같은 법 내 인용
    precedents: ImpactItem[]   // 판례: 해석 판례
    stats: { total: number, byType: Record<RelationType, number> }
  }

  interface ImpactItem {
    nodeId: string
    title: string
    type: LawNodeType
    article?: string
    relation: RelationType
    depth: number              // 위임 깊이 (1단/2단/3단)
  }

  export async function analyzeImpact(
    lawId: string, article?: string, maxDepth?: number
  ): Promise<ImpactResult>
  ```
  - **하향**: `WITH RECURSIVE` CTE로 delegates/implements 체인 탐색
    ```sql
    WITH RECURSIVE downstream AS (
      SELECT to_id, to_article, relation, 1 as depth
      FROM law_edge
      WHERE from_id = $1 AND from_article = $2
        AND relation IN ('delegates', 'implements')
      UNION ALL
      SELECT e.to_id, e.to_article, e.relation, d.depth + 1
      FROM law_edge e
      JOIN downstream d ON e.from_id = d.to_id
      WHERE d.depth < $3
        AND e.relation IN ('delegates', 'implements')
    )
    SELECT d.*, n.title, n.type
    FROM downstream d
    JOIN law_node n ON d.to_id = n.id
    ```
  - **상향**: 역방향 CTE (to_id → from_id)
  - **횡단**: cites에서 from_id = to_id (같은 법) 필터
  - **판례**: interprets 관계 조회

- [ ] **Task 4.4**: API 라우트 → `app/api/impact-analysis/route.ts`
  ```
  GET /api/impact-analysis?lawId=X&jo=003800&depth=3
  → { success: true, impact: ImpactResult }
  ```

- [ ] **Task 4.5**: Supabase RPC 함수 (선택)
  - 복잡한 재귀 CTE는 Supabase Edge Function 또는 PostgreSQL function으로
  - 클라이언트에서 `.rpc('analyze_impact', { law_id, article, max_depth })` 호출

**REFACTOR: Clean Up Code**
- [ ] **Task 4.6**: 쿼리 최적화 (EXPLAIN ANALYZE 확인)

#### Quality Gate

**Validation Commands**:
```bash
npx vitest run __tests__/lib/relation-graph/
npx vitest run __tests__/app/api/impact-analysis.test.ts
npm run lint
npm run build
```

**Manual Test Checklist**:
- [ ] API 호출 → 올바른 영향 트리 반환
- [ ] depth=1 vs depth=3 결과 차이 확인
- [ ] DB 비어있을 때 빈 결과 반환 (500 아님)

---

### Phase 5: 영향 분석 UI
**Goal**: 법령 뷰어에 "영향 분석" 버튼 + 영향 트리 패널 추가
**Time**: 4-5 hours | **Status**: Pending

#### Tasks

**RED: Write Failing Tests First**
- [ ] **Test 5.1**: 영향 분석 훅 테스트
  - File: `__tests__/hooks/use-impact-analysis.test.ts`
  - Cases: 로딩 상태, 성공 응답, 에러 처리, 빈 결과
- [ ] **Test 5.2**: 영향 분석 패널 컴포넌트 렌더링 테스트
  - File: `__tests__/components/law-viewer/impact-analysis-panel.test.tsx`
  - Cases: 각 카테고리(상/하/횡/판례) 렌더링, 빈 상태, 로딩 상태

**GREEN: Implement to Make Tests Pass**
- [ ] **Task 5.3**: 커스텀 훅 → `hooks/use-impact-analysis.ts`
  ```typescript
  export function useImpactAnalysis(lawId: string, jo?: string) {
    // fetch /api/impact-analysis
    // 로딩/에러/데이터 상태 관리
    return { data, isLoading, error, refetch }
  }
  ```
- [ ] **Task 5.4**: 영향 분석 패널 → `components/law-viewer/impact-analysis-panel.tsx`
  - 4개 섹션: 하향/상향/횡단/판례
  - 각 항목 클릭 → 해당 법령/조문으로 이동
  - 트리 구조 시각화 (depth 기반 들여쓰기)
  - 빈 상태: "아직 분석할 관계가 없습니다. 위임법령 조회 후 다시 시도하세요."
  ```
  ┌─ 영향 분석: 관세법 제30조 ──────────────┐
  │                                          │
  │ ▼ 하향 영향 (3건)                        │
  │   ├─ 관세법시행령 제25조     [delegates]  │
  │   │  └─ 관세법시행규칙 제8조 [delegates]  │
  │   └─ 관세청 고시 2024-15호  [implements] │
  │                                          │
  │ ↔ 횡단 참조 (2건)                        │
  │   ├─ 제31조 (인용)           [cites]     │
  │   └─ 제35조 (인용)           [cites]     │
  │                                          │
  │ ⚖ 판례 (2건)                             │
  │   ├─ 대법원 2023두1234       [interprets]│
  │   └─ 헌재 2022헌바56         [interprets]│
  └──────────────────────────────────────────┘
  ```
- [ ] **Task 5.5**: 액션 버튼 추가 — `law-viewer-action-buttons.tsx`에 "영향 분석" 버튼
- [ ] **Task 5.6**: 법령 뷰어 통합 — `law-viewer.tsx`에 패널 연결

**REFACTOR: Clean Up Code**
- [ ] **Task 5.7**: 컴포넌트 분리 (패널 > 섹션 > 아이템), 접근성

#### Quality Gate

**Validation Commands**:
```bash
npx vitest run __tests__/hooks/use-impact-analysis.test.ts
npx vitest run __tests__/components/law-viewer/impact-analysis-panel.test.tsx
npm run lint
npm run build
```

**Manual Test Checklist**:
- [ ] 법령 뷰어 → "영향 분석" 버튼 표시
- [ ] 클릭 → 패널 열림 (로딩 → 결과)
- [ ] DB 비어있을 때 안내 메시지 표시
- [ ] 위임법령 먼저 조회 후 → 영향 분석에 결과 표시
- [ ] 항목 클릭 → 해당 법령으로 이동
- [ ] 모바일 반응형 동작

---

### Phase 6: 통합 테스트 + 최적화 + DB 관리
**Goal**: 전체 흐름 통합 검증, 성능 최적화, DB 관리 유틸리티
**Time**: 3-4 hours | **Status**: Pending

#### Tasks

**RED: Write Failing Tests First**
- [ ] **Test 6.1**: 전체 플로우 통합 테스트
  - File: `__tests__/lib/relation-graph/integration.test.ts`
  - Cases:
    - 3-tier 조회 → DB 적재 → 영향 분석 API → 결과 반환 전체 흐름
    - 여러 법령 조회 후 → 교차 영향 분석 (법률A → 시행령B → 시행규칙C)
    - Supabase 연결 실패 시 → graceful degradation

**GREEN: Implement to Make Tests Pass**
- [ ] **Task 6.2**: DB 상태 API → `app/api/relation-graph/stats/route.ts`
  ```
  GET /api/relation-graph/stats
  → { nodes: 150, edges: 420, byType: {...} }
  ```
- [ ] **Task 6.3**: DB 관리 유틸리티 → `lib/relation-graph/maintenance.ts`
  - `cleanStaleData(olderThan: Date)` — 오래된 노드/엣지 정리
  - `getGraphStats()` — 관계 통계
  - `exportGraph(lawId)` — 특정 법령 중심 관계 내보내기
- [ ] **Task 6.4**: 성능 최적화
  - 자주 쓰는 영향 분석 쿼리 → PostgreSQL function으로 승격 검토
  - 벌크 삽입 최적화 (batch upsert)
  - 응답 캐싱 (영향 분석 결과 클라이언트 캐시)
- [ ] **Task 6.5**: Graceful degradation
  - Supabase 연결 불가 시 → 기능 비활성화 (에러 아님)
  - 환경변수 없을 때 → 관계 기능 자동 스킵

**REFACTOR: Clean Up Code**
- [ ] **Task 6.6**: 전체 모듈 export 정리 (`lib/relation-graph/index.ts`)

#### Quality Gate

**Validation Commands**:
```bash
npx vitest run
npm run lint
npm run build
```

**Manual Test Checklist**:
- [ ] 빈 DB에서 시작 → 법령 3-4개 탐색 → 영향 분석 동작
- [ ] Supabase 환경변수 제거 → 앱 정상 동작 (관계 기능만 비활성)
- [ ] 빌드 + 배포 정상
- [ ] 기존 기능 전체 회귀 없음

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation Strategy |
|------|-------------|--------|---------------------|
| Supabase 무료 티어 제한 (500MB, 50K rows) | Low (법령 관계 데이터는 작음) | Medium | 모니터링 + 필요시 Pro 업그레이드 |
| Supabase 네트워크 레이턴시 | Medium | Low | fire-and-forget 패턴 + 클라이언트 캐싱 |
| DB 적재가 API 응답 속도에 영향 | Low | Medium | 비동기 적재, 에러 무시 |
| 기존 테스트 깨짐 | Low | Medium | Phase마다 전체 테스트 실행 |
| WITH RECURSIVE 쿼리 성능 | Low (깊이 3-4 수준) | Low | maxDepth 제한 + EXPLAIN ANALYZE |

---

## Rollback Strategy

### If Phase 1 Fails
- `pnpm remove @supabase/supabase-js`
- `.env.local`에서 SUPABASE_* 제거
- `lib/relation-graph/` 삭제
- Supabase 테이블 drop (Dashboard에서)

### If Phase 2-3 Fails
- API 라우트에 추가한 적재 코드 제거 (side-effect만 제거)
- Phase 1 코드는 유지 가능 (독립적)

### If Phase 4-5 Fails
- API 라우트 + 컴포넌트 삭제
- 액션 버튼에서 영향 분석 버튼만 제거
- DB 인프라(Phase 1-3)는 유지 가능

---

## File Structure (예상)

```
lib/
  ├── supabase.ts                     # Supabase 클라이언트 싱글턴
  └── relation-graph/
      ├── index.ts                    # 모듈 export
      ├── relation-types.ts           # 타입 정의
      ├── database.types.ts           # Supabase 생성 타입
      ├── relation-db.ts              # CRUD 함수
      ├── impact-analysis.ts          # 영향 분석 쿼리 (WITH RECURSIVE)
      ├── maintenance.ts              # DB 관리 유틸리티
      └── extractors/
          ├── three-tier-extractor.ts # 3-tier → 관계 추출
          ├── precedent-extractor.ts  # 판례 → 관계 추출
          └── citation-extractor.ts   # 본문 인용 → 관계 추출

hooks/
  └── use-impact-analysis.ts          # 영향 분석 데이터 훅

components/law-viewer/
  └── impact-analysis-panel.tsx       # 영향 분석 UI 패널

app/api/
  ├── impact-analysis/route.ts        # 영향 분석 API
  └── relation-graph/
      └── stats/route.ts              # DB 상태 API

supabase/
  └── migrations/
      └── 001_relation_graph.sql      # 테이블 생성 마이그레이션

__tests__/lib/relation-graph/
  ├── relation-types.test.ts
  ├── relation-db.test.ts
  ├── impact-analysis.test.ts
  ├── integration.test.ts
  └── extractors/
      ├── three-tier-extractor.test.ts
      ├── precedent-extractor.test.ts
      └── citation-extractor.test.ts
```

---

## Progress Tracking

| Phase | Estimated | Actual | Status |
|-------|-----------|--------|--------|
| Phase 1: Supabase + 스키마 + CRUD | 3h | - | Pending |
| Phase 2: Three-Tier/판례 Lazy Crawl | 3-4h | - | Pending |
| Phase 3: 인용 관계 추출 | 2-3h | - | Pending |
| Phase 4: 영향 분석 API | 3-4h | - | Pending |
| Phase 5: 영향 분석 UI | 4-5h | - | Pending |
| Phase 6: 통합 + 최적화 + 관리 | 3-4h | - | Pending |
| **Total** | **18-23h** | - | 0% |

---

## Notes & Learnings

### 설계 결정 메모
- **왜 Supabase인가**: 서버리스(Vercel) 호환 + 추후 Auth 통합 예정. SQLite는 Vercel에서 영속성 없음.
- **왜 Lazy Crawl인가**: 법제처에 등록된 법령은 수만 건이지만, 사용자가 실제로 보는 법령은 수백 건. 사용 패턴을 따라 자연스럽게 DB를 채우는 것이 효율적.
- **OpenCrab에서 차용한 것**: 관계 타입 문법 패턴(타입 검증된 방향 엣지), 영향 분석 아이디어. 코드는 차용하지 않음.
- **추후 확장**: Auth 도입 시 user_id 컬럼 추가 + RLS 적용, 사용자별 북마크/메모 기능.

---

## References
- OpenCrab 메타엣지 컨셉: https://github.com/AlexAI-MCP/OpenCrab
- Supabase Docs: https://supabase.com/docs
- PostgreSQL WITH RECURSIVE: https://www.postgresql.org/docs/current/queries-with.html
- 법제처 DRF API: law.go.kr

---

## Final Checklist

**Before marking plan as COMPLETE**:
- [ ] All phases completed with quality gates passed
- [ ] Full integration testing performed
- [ ] 기존 기능 전체 회귀 없음 확인
- [ ] Performance: 영향 분석 쿼리 < 200ms
- [ ] Supabase 연결 실패 시 graceful degradation 확인
- [ ] 빌드 + 배포 정상
- [ ] Plan document archived for future reference

---

**Plan Status**: Draft (승인 대기)
**Next Action**: 사용자 승인 후 Phase 1 시작
**Blocked By**: None
