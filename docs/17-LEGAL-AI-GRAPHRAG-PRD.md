# LexDiff 차세대 법령 AI 고도화 PRD

## A) 의도 요약

본 문서는 LexDiff의 현재 AI 질의응답 파이프라인을 점검하고, **Mini PC 기반 Neo4j GraphRAG + 법령 DB 자동 구축 + Stream 챗봇 UX**를 결합해, 현재 대비 **응답 속도(지연시간)와 정확도(근거 일치율/정답률)를 동시에 개선**하기 위한 제품 요구사항 문서(PRD)다.

핵심 목표:
- 평균 응답 지연시간 35% 이상 단축
- 조문 인용 정확도(문맥 일치 포함) 95% 이상
- 복합 질의(법령+시행령+판례+해석례) 정답률 20%p 개선
- 운영비 증가율 15% 이하로 통제

---

## B) 변경/추가 파일 목록

- `docs/17-LEGAL-AI-GRAPHRAG-PRD.md` (신규): 차세대 법령 AI 아키텍처/도입 계획 PRD
- `docs/README.md` (수정): 문서 목록에 신규 PRD 등록

---

## C) PRD 본문

## 1. 배경 및 문제정의

### 1.1 현재 파이프라인 진단 요약

현재 LexDiff의 AI 질의응답은 아래 특징을 가진다.
- SSE 기반 스트리밍 응답 제공
- Function Calling 기반 도구 오케스트레이션
- 다수 법률 도메인 도구(법령/판례/해석례/자치법규)를 순차 또는 병렬 호출
- 인용 검증 후처리(verification) 단계 존재

현행 구조는 기능적으로 성숙했지만, 다음 병목이 반복된다.
1. **원격 API 의존성에 따른 왕복 지연(RTT) 누적**
2. **도구 호출 횟수 증가 시 토큰/시간 비용 동반 증가**
3. **질의 의도 분해가 완전하지 않은 경우 불필요 검색 확대**
4. **법령-시행령-조문-판례 간 관계 탐색이 텍스트 검색 중심으로 제한**

### 1.2 해결 전략

- 텍스트 RAG 중심 구조를 **GraphRAG 하이브리드 구조**로 전환
- Mini PC에 Neo4j를 상주시켜 법령 관계 탐색을 로컬에서 저지연 처리
- 법령/하위규정/판례/해석례 ingest를 **증분 자동화**하여 최신성 확보
- Stream 챗봇 UX를 고도화해 “답변 생성 중 사고과정(검색 단계/근거 채택)”을 투명화

---

## 2. 제품 목표(Goals)와 비목표(Non-Goals)

### 2.1 Goals

1) 성능
- P50 응답시간: 4.2s → 2.7s 이하
- P95 응답시간: 11.0s → 7.0s 이하

2) 정확성
- 조문 인용 검증 통과율: 95%+
- 골든셋(법무 QA 300문항) 정답률: +20%p

3) 운영성
- 법령 DB 자동 동기화 일 1회 + 긴급 패치 온디맨드
- 장애 시 텍스트 RAG로 자동 폴백

### 2.2 Non-Goals

- 초기 단계에서 완전한 판례 전문 지식그래프 100% 구축
- 법률 자문(변호사 대리행위) 자동화
- 외부 상용 벡터DB 추가 도입(초기에는 Neo4j + 기존 저장소로 최소화)

---

## 3. 사용자 시나리오 및 핵심 유스케이스

### 3.1 사용자 페르소나
- 세무/관세 실무자
- 지자체 조례 담당자
- 사내 컴플라이언스 담당자

### 3.2 대표 시나리오

#### 시나리오 A: 단일 조문 해석
- 질의: “부가가치세법 제32조의 전자세금계산서 발급시기 요건 정리해줘”
- 기대: 핵심 요건 요약 + 원문 인용 + 시행령 연계 조문 제시

#### 시나리오 B: 복합 연계 질의
- 질의: “관세법 위반 과태료 기준이 최근 개정으로 어떻게 바뀌었고 관련 판례 경향은?”
- 기대: 개정 전후 비교 + 벌칙·과태료 조문 + 관련 판례 요지 표

#### 시나리오 C: 조례-상위법 위임 체계 질의
- 질의: “OO시 조례의 위임근거가 상위법 어디인지 연결해줘”
- 기대: 상위법-시행령-조례 관계 그래프 기반 경로 제시

---

## 4. 현행 아키텍처 점검(As-Is)

## 4.1 파이프라인 개요

1) 사용자 질문 입력
2) SSE 스트리밍 세션 생성
3) OpenClaw 헬스체크 및 우선 처리 시도
4) 실패/비활성 시 Gemini FC-RAG 실행
5) 도구 호출(법령/판례/해석례/자치법규)
6) 최종 답변 생성
7) 인용 검증 단계
8) 스트림 종료

## 4.2 구조적 강점
- 이미 스트리밍 이벤트 타입과 상태 이벤트가 정비되어 UX 확장이 용이
- 도구 어댑터 계층이 있어 Graph Query 도구 추가가 상대적으로 단순
- 인용 검증 모듈이 있어 품질 게이트를 유지한 채 확장 가능

## 4.3 개선 필요지점
- 복합 질의에서 도구 호출 순서 최적화 부족
- 조문 간/법령 간 관계 탐색이 검색 쿼리 의존적
- 로컬 캐시(KNOWN_MST) 수준을 넘어선 관계 메모리가 부재

---

## 5. To-Be 아키텍처: Mini PC + Neo4j GraphRAG

## 5.1 논리 아키텍처

```text
[Client Chat UI (SSE)]
        |
        v
[Q&A Orchestrator API]
  |-- Intent Classifier
  |-- Retrieval Planner
  |-- Answer Composer
  |-- Citation Verifier
  |
  |----(A) Existing Tool APIs (law.go.kr, precedents, interpretations)
  |
  |----(B) GraphRAG Service (Mini PC)
           |-- Neo4j (Law Graph)
           |-- Graph Retriever (Cypher templates)
           |-- Re-ranker (lightweight)
           |-- Cache (Redis optional, phase2)
```

## 5.2 물리 배치

### 클라우드(Vercel)
- Next.js App/API, 인증, SSE 핸들링
- 모델 호출(기존 Gemini/OpenClaw)

### Mini PC (온프렘 또는 사내망)
- Neo4j Community/Enterprise
- Ingestion Worker (cron + delta sync)
- Graph Retriever API (Node.js/TypeScript)

권장 Mini PC 스펙(초기):
- CPU: 8C/16T 이상 (Ryzen 7 급)
- RAM: 64GB
- NVMe SSD: 2TB (법령/판례 확장 고려)
- 네트워크: 유선 1GbE 이상
- OS: Ubuntu LTS

---

## 6. 데이터 모델(PRD 핵심)

## 6.1 그래프 스키마

### 노드
- `Law` (법령)
  - `law_id`, `mst`, `name_ko`, `law_type`, `effective_date`, `status`
- `Article` (조문)
  - `article_id`, `law_id`, `article_no`, `title`, `body`, `hash`
- `Clause` (항/호/목 세부)
  - `clause_id`, `article_id`, `path`, `text`
- `Precedent`
  - `case_id`, `court`, `date`, `holding`, `summary`
- `Interpretation`
  - `interp_id`, `agency`, `date`, `summary`
- `Ordinance`
  - `ordin_seq`, `local_government`, `name`, `body`
- `Term`
  - `term`, `normalized`, `domain`

### 관계
- `(Law)-[:HAS_ARTICLE]->(Article)`
- `(Article)-[:HAS_CLAUSE]->(Clause)`
- `(Law)-[:DELEGATES_TO]->(Law)`
- `(Article)-[:REFERS_TO]->(Article)`
- `(Precedent)-[:CITES_ARTICLE]->(Article)`
- `(Interpretation)-[:INTERPRETS_ARTICLE]->(Article)`
- `(Ordinance)-[:BASED_ON]->(Law)`
- `(Term)-[:MENTIONED_IN]->(Article)`

## 6.2 인덱스/제약

```cypher
CREATE CONSTRAINT law_id_unique IF NOT EXISTS FOR (l:Law) REQUIRE l.law_id IS UNIQUE;
CREATE CONSTRAINT article_id_unique IF NOT EXISTS FOR (a:Article) REQUIRE a.article_id IS UNIQUE;
CREATE INDEX article_no_idx IF NOT EXISTS FOR (a:Article) ON (a.article_no);
CREATE INDEX term_norm_idx IF NOT EXISTS FOR (t:Term) ON (t.normalized);
```

---

## 7. 검색/답변 파이프라인 설계

## 7.1 Retrieval Planner

질의를 아래로 라우팅:
- `DIRECT_ARTICLE`: 단일 조문 중심
- `RELATION_TRAVERSAL`: 위임/참조/개정 관계 중심
- `CASE_AUGMENTED`: 판례/해석례 보강 필요
- `HYBRID_COMPLEX`: 텍스트+그래프 혼합 다중스텝

## 7.2 GraphRAG 단계

1) Query Parsing
- 법령명, 조문번호, 시간축(개정 전/후), 행위유형(의무/금지/벌칙) 추출

2) Graph Retrieval
- Cypher 템플릿으로 1-hop/2-hop 관계 탐색
- 필요 시 법령 계층(법률→시행령→시행규칙) 경로 반환

3) Text Retrieval
- 기존 검색 도구로 원문/판례 전문 보강

4) Fusion & Re-rank
- 그래프 경로 근거 + 텍스트 근거를 점수화(정확도/최신성/명시성)

5) Answer Composition
- “핵심답변 → 근거조문 → 관련판례 → 유의사항” 고정 포맷

6) Citation Verification
- 기존 verify 단계 유지 + 그래프 경로 존재 검증 추가

## 7.3 스트림 이벤트 확장

기존 SSE 이벤트에 아래 추가:
- `graph_plan`: 그래프 탐색 계획
- `graph_hit`: 탐색된 관계 경로 요약
- `evidence_rank`: 채택/탈락 근거

이를 통해 사용자 체감 신뢰도 상승(“왜 이 근거가 선택됐는지” 가시화).

---

## 8. 법령 DB 자동 구축/동기화 설계

## 8.1 데이터 소스
- 국가법령정보 API (법령/시행령/시행규칙)
- 자치법규 API/크롤링(가능 범위)
- 판례/해석례 공개 소스

## 8.2 동기화 전략

### Full Sync (주 1회)
- 전체 법령 메타+조문 재수집
- 해시 비교 후 변경분만 upsert

### Delta Sync (일 1회)
- 최근 개정/공포 기준 증분 반영
- 실패 시 재시도 큐로 이동

### Hotfix Sync (수동)
- 긴급 법령 변경 시 관리자 트리거

## 8.3 파이프라인 단계

1) fetch → 2) normalize → 3) dedupe/hash → 4) entity linking → 5) graph upsert → 6) 검증 리포트 생성

검증 규칙 예:
- 조문번호 누락 비율 < 0.5%
- 상위법 연결 실패율 < 2%
- 개정 이력 충돌 0건

---

## 9. API 계약(초안)

## 9.1 Graph Retrieve API

### Request
```json
{
  "query": "관세법 과태료 개정 내용",
  "intent": "RELATION_TRAVERSAL",
  "topK": 20,
  "timeContext": "latest"
}
```

### Response
```json
{
  "paths": [
    {
      "score": 0.92,
      "nodes": ["관세법", "제xx조", "관세법 시행령", "제yy조"],
      "edges": ["DELEGATES_TO", "HAS_ARTICLE", "REFERS_TO"]
    }
  ],
  "evidences": [
    {
      "source": "law.go.kr",
      "lawName": "관세법",
      "article": "제xx조",
      "snippet": "..."
    }
  ]
}
```

## 9.2 Chat Stream API
- 기존 `/api/fc-rag` 유지
- 내부적으로 Planner에서 GraphRAG 분기
- 최종 사용자 API 스펙은 호환성 유지(무중단 전환)

---

## 10. 성능/정확도 KPI 및 SLO

## 10.1 KPI
- Retrieval Precision@5
- Citation Match Rate
- Final Answer Groundedness
- Hallucination Rate
- User Follow-up Rate(재질문율)

## 10.2 SLO
- 월 가용성 99.5%
- 그래프 API P95 < 400ms
- 전체 QA P95 < 7s

---

## 11. 보안/컴플라이언스

- API Key는 환경변수로만 주입 (코드 하드코딩 금지)
- Mini PC 접근은 WireGuard/VPN + IP allowlist
- 개인정보/사건식별정보 필터링 로그 정책 적용
- 감사로그(누가/언제/어떤 질의) 90일 보관

법률 서비스 고지:
- “법률정보 제공 도구이며 법률자문을 대체하지 않음” 명시

---

## 12. 릴리즈 계획 (Phase Plan)

## Phase 0 (1주) - 측정 기반선 확립
- 현행 파이프라인 KPI 계측 대시보드 구축
- 골든셋 300문항 확정

## Phase 1 (2주) - Neo4j PoC
- Mini PC 환경 구성
- 법령/조문 노드 + 기본 관계 구축
- 20개 대표 질의 A/B 테스트

## Phase 2 (3주) - Hybrid GraphRAG 통합
- Planner 분기/Graph API 연동
- SSE 신규 이벤트 도입
- 폴백/서킷브레이커 적용

## Phase 3 (2주) - 자동 동기화 및 운영화
- Delta sync 스케줄러
- 운영 알람/리포트 자동화
- 문서화/런북/장애대응 시나리오

총 8주, 단계별 Go/No-Go 게이트 적용.

---

## 13. 리스크 및 대응

1) 그래프 품질 리스크
- 대응: 엔티티 링크 검증 + 수동 검수 큐

2) Mini PC 단일장애점(SPOF)
- 대응: 일일 스냅샷 + cold standby 구성

3) 질의 복잡도 증가에 따른 지연
- 대응: Planner early-stop + 캐시 + topK 동적 조절

4) 외부 API 변동
- 대응: 어댑터 계층 버전 분리 + 계약 테스트

---

## 14. 구현 작업 항목(엔지니어링 백로그)

### Backend
- [ ] `lib/fc-rag/planner.ts` 신설 (intent + route)
- [ ] `lib/graphrag/client.ts` 신설 (Graph API client)
- [ ] `lib/graphrag/scoring.ts` 신설 (evidence fusion)
- [ ] `app/api/fc-rag/route.ts`에 graph event emit 추가

### Data
- [ ] `ingest/jobs/full-sync.ts`
- [ ] `ingest/jobs/delta-sync.ts`
- [ ] `ingest/transform/link-entities.ts`
- [ ] `ingest/neo4j/upsert.ts`

### Infra
- [ ] Mini PC provisioning script
- [ ] Neo4j backup cron
- [ ] Healthcheck + alert webhook

### QA
- [ ] 골든셋 자동 평가 스크립트
- [ ] 회귀 테스트(속도/정확도)

---

## 15. 운영 절차(Doctor 포함)

배포 전 사전 자가진단:

```bash
pnpm --version
node -v
test -f pnpm-lock.yaml && echo "pnpm-lock.yaml: present" || echo "pnpm-lock.yaml: missing"
test -f pnpm-workspace.yaml && echo "pnpm-workspace.yaml: present" || echo "pnpm-workspace.yaml: missing"
```

로컬 재현성 점검:

```bash
rm -rf node_modules && pnpm install --frozen-lockfile && pnpm build
```

postinstall 리스크 점검:
- `package.json`에 `postinstall`이 있으면 CI/Vercel에서 실패 가능성 검토
- 필요 시 빌드 단계로 이동하거나 CI 가드(`|| echo "skip on CI"`) 적용

---

## 16. GitHub + Vercel 하드닝 체크리스트

- Node 엔진 고정: `>=20 <21`
- `packageManager`: `pnpm@x.y.z` 명시
- lockfile(`pnpm-lock.yaml`) 커밋 강제
- `.npmrc` 최소 설정 유지 (`registry`, `fund=false`, `audit=false`)
- `vercel.json` 빌드 명령 고정:
  - `pnpm --version && pnpm install --frozen-lockfile && pnpm run vercel-build`
- Preview는 PR에서만, Production은 `main` 머지로만

---

## 17. 기대효과

- 사용자 관점: “더 빠르고, 더 근거가 명확한” 법령 AI
- 운영 관점: 관계 탐색을 로컬화하여 비용/지연 변동성 감소
- 제품 관점: 법령/판례/해석례를 잇는 고신뢰 지식 레이어 확보

이 PRD는 **속도와 정확도의 동시 개선**을 목표로 하며, 기존 파이프라인의 장점(SSE/검증/도구 어댑터)을 보존한 채 GraphRAG를 단계적으로 흡수하도록 설계되었다.
