# Schift 도입 검토 — lexdiff 활용 시나리오

**작성일**: 2026-04-12
**대상 서비스**: [Schift](https://schift.io/ko/docs/) — TypeScript AI Agent Framework with built-in RAG
**결론 요약**: Primary LLM 경로 교체 ❌ / 보조 RAG·캐시·rerank로 부분 도입 ✅

---

## 1. Schift 실체 파악

| 항목 | 실제 |
|---|---|
| 정체 | **RAG/벡터 검색 미들웨어** (LLM 게이트웨이 ❌) |
| 핵심 기능 | bucket upload + 벡터 검색 + 임베딩 + 워크플로우 DAG + rerank |
| 에이전트 통합 방식 | Vercel AI SDK / Google Gen AI / Mastra의 **search tool 어댑터** (`schift.tools.vercelAI()`) |
| LLM 호출 주체 | **사용자 코드** (Schift는 LLM을 직접 부르지 않음) |
| MCP 지원 | **언급 0** — 코드/문서/SDK 어디에도 없음 |
| 외부 도구 등록 | Schift 자체 search 도구 1개만, function calling 패스스루 ❌ |
| 인프라 | 한국 리전 (Seoul), 데이터 잔류 |
| 성능 | 벡터 검색 p50 277μs (1M 벡터 기준) |
| 가격 | Ingestion $0.009/page · Search $0.005/req · Storage $0.03/GB·월 · Embed $0.015/1M tokens · 무료 10K 실행/월 |

---

## 2. Primary 경로 교체 불가 이유

lexdiff Primary 경로 = **Hermes Gateway → GPT-5.4 → korean-law-mcp 91개 도구 멀티턴**.

이건 **MCP 호스트 역할**이고, Schift는:
- MCP 호스트가 아니다 (외부 MCP 서버 연결 옵션 없음)
- function calling 도구 등록 인터페이스가 자체 search 도구 외엔 노출 안 됨
- LLM을 자체 보유하지 않음 → tool_use 스트리밍 루프를 돌릴 주체가 없음

요약 / citation 검증 같은 **단발 LLM 호출**도 마찬가지로 LLM 자체가 필요한데 Schift가 안 줌 → 의미 없음.

---

## 3. 활용 가능 시나리오 (임팩트/난이도순)

### 🥇 1순위 — Semantic Response Cache

**문제**
- [`lib/rag-response-cache.ts`](../lib/rag-response-cache.ts) 는 **문자열 일치** LRU
- "관세법 38조 수입이란" ≠ "관세법 제38조 수입의 정의" → 둘 다 GPT-5.4 호출

**해결**
- 신규 질의 → Schift `embed()` → `query()` → 코사인 0.92+ 매치 시 캐시 답변 즉시 반환
- 진입점: [`app/api/fc-rag/route.ts`](../app/api/fc-rag/route.ts) `POST` 핸들러 최상단
- 캐시 적중 시 SSE로 `source: 'cache'` 이벤트만 흘려주고 종료

**기대 효과**
- 적중률 30% 가정 시 GPT-5.4 호출 30% 절감 (가장 비싼 경로)
- p50 277μs → 사용자 체감 즉답

**비용**
- $0.015/1M tokens (embed) + $0.005/req (query) → 절감액이 압도적으로 큼

**위험**
- 임계값 잘못 잡으면 false positive (다른 질문에 같은 답변)
- 완화: 첫 운영기 임계값 0.95 + 인용 정확도 검증 후 점진 완화

---

### 🥇 2순위 — 판례 의미 검색 보강

**문제**
- 법제처 판례 API는 **키워드 매칭**
- "근로자 해고 부당" 검색해도 "고용관계 종료 정당성" 판례 못 찾음
- [`PrecedentResultList`](../components/search-result-view/PrecedentResultList.tsx) 품질 저하 원인

**해결**
- 판시사항 + 요지만 Schift bucket에 적재 (전문 X — 용량/비용↓)
- [`lib/fc-rag/tool-adapter.ts`](../lib/fc-rag/tool-adapter.ts) 에 `search_precedent_semantic` 신규 도구 추가
- Hermes가 키워드/의미 검색 둘 다 호출 → 합집합 후 rerank

**비용**
- 판시사항 평균 0.5페이지 × 판례 수 × $0.009
- 판례는 누적형 데이터 → 1회 적재 후 신규 판례만 증분 ingest

---

### 🥈 3순위 — FAQ 인덱스 (질의 로그 재활용)

**문제**
- [`lib/query-logger.ts`](../lib/query-logger.ts) 에 질의가 쌓이는데 **읽기 전용 로그**
- 같은 질문 반복 들어와도 매번 새로 처리

**해결**
- 정답 답변 + 인용까지 검증된 케이스만 야간 배치로 Schift bucket 적재
- 신규 질의 → 1순위 캐시와 동일 메커니즘으로 매치
- 시간 갈수록 자동으로 좋아짐 (네트워크 효과)

**의존성**
- 1순위(Semantic Cache) 인프라 재사용 → 1순위 안정화 후 진행

---

### 🥉 4순위 — Citation Rerank

**문제**
- Hermes가 도구 여러 번 호출해서 인용 후보가 중복/잡음 많음
- [`lib/fc-rag/citations.ts`](../lib/fc-rag/citations.ts) 는 단순 추출

**해결**
- Schift `rerank()` API로 "질의 ↔ 인용 조문" 관련성 재정렬
- 상위 N개만 UI 노출

**비용**
- 단발 호출, 비용 작음. 답변 품질 가시적 ↑

---

### 5순위 — 쿼리 확장 자동화

**문제**
- [`lib/query-expansion-data.ts`](../lib/query-expansion-data.ts) 는 **수동 사전**
- 신조어/판례 용어 누락

**해결**
- Schift 임베딩으로 질의 벡터 ↔ 법령 용어 인덱스 코사인 매치
- top-k 동의어 자동 추출, 수동 사전은 화이트리스트로만 유지

---

### 6순위 — 별표 PDF RAG (fallback)

**용도**
- kordoc 표 추출 개선이 망할 경우 plan B
- 우선순위 낮음 — 정공법은 [activeContext](../.claude/memory/activeContext.md) 의 kordoc 개선

---

### 7순위 — 법령 개정 변경점 의미 검색

**아이디어**
- 신구법 diff 결과 임베딩 적재
- "이번 개정에서 벌칙이 어떻게 바뀌었어" 류 질의 대응

**상태**
- 누적 데이터 부족 → 후순위

---

## 4. 추천 로드맵

| Phase | 범위 | 예상 기간 | 비용 | 검증 지표 |
|---|---|---|---|---|
| **Phase 1** | 1순위 + 4순위 (Semantic Cache + Rerank) | 1주 | 무료 한도 내 | 캐시 적중률, 인용 정확도 |
| **Phase 2** | 2순위 (판례 의미검색) | 2주 | 최초 적재 비용 산정 후 결정 | PrecedentResultList top-5 정밀도 |
| **Phase 3** | 3순위 (FAQ 인덱스) | 운영 자동화 | 적재량 비례 | 누적 적중률 |

**시작점**: **Phase 1 — Semantic Cache PoC**
- 가장 빠른 ROI 검증
- 망해도 캐시만 빼면 끝, 위험 없음
- route.ts 한 곳에만 손댐
- 측정: 1주 운영 후 적중률 + 비용 절감액 비교

---

## 5. 미해결 항목 (PoC 전 확인 필요)

- [ ] Schift 무료 10K 실행/월의 정확한 측정 단위 (req? embed call?)
- [ ] 한국어 임베딩 모델 명세 (multilingual? 자체 모델?) — 검색 품질 직결
- [ ] bucket 데이터 삭제/갱신 API (법령 개정 시 증분 업데이트 가능 여부)
- [ ] 응답 SLA / 장애 시 폴백 정책 (Schift 다운 시 캐시 미스로만 처리되면 OK)
- [ ] CF Worker / Vercel Edge 런타임에서 SDK 작동 여부

---

## 6. 타 chrisryugj 레포 적용성 검토 (2026-04-12 추가)

lexdiff 외 30개 레포 전수 검토. **Schift는 RAG 미들웨어**라는 1장의 정의를 기준으로 분류.

### 🟢🟢 직접 적용 — RAG가 곧 본질인 프로젝트

| 레포 | 가시성 | 활용 |
|------|-------|------|
| **Docufinder** (Rust/Tauri) | private | "내 컴퓨터 모든 문서 검색 — 키워드+시맨틱+RAG" — 사실상 Schift 프론트엔드. 단 **로컬-퍼스트 철학과 충돌** (사용자 문서가 외부 클라우드로 나감) → 기업 고객 타겟이면 부적합 |
| **EchoAI** (홍보팀 RAG챗봇) | private | 교과서적 케이스. 홍보 자료 PDF/HWP → bucket → 출처 답변. 자체 벡터DB 운영 부담 0. **Phase 1 PoC 후보 1순위** |
| **edu-facility-ai** | private | 교육시설 매뉴얼·규정 RAG라면 즉시 도입 |
| **aido-education** | private | 교재·커리큘럼 RAG라면 동일 |
| **lawmate (관세몽이)** | private | 관세법령·HS코드 해설서·관세청 심사사례 PDF → bucket. lexdiff와 동일 도메인이라 lexdiff PoC 결과를 그대로 이식 가능 |

### 🟢 보조 통합

| 레포 | 활용 |
|------|------|
| **hermes-agent** (Python, public) | Hermes에 Schift 검색을 *툴이 아닌 백엔드 검색 함수*로 통합. lexdiff Phase 1 인프라를 hermes-agent 전체로 재사용 |
| **kordoc / kordoc-ai** | kordoc=추출기, Schift=인덱서 분업. kordoc-ai 데스크톱 도구에 "내 변환 라이브러리에서 검색" 기능 추가 가능 |
| **meari-contents** | 콘텐츠 자산 시맨틱 검색 |
| **hwp2html (카드뉴스 딸깍)** | 과거 카드뉴스 톤·문구 검색해 일관성 유지 |
| **chrisbot** | 봇 장기 기억을 bucket으로 위임 |
| **korean-law-mcp** | lexdiff Phase 2(판례 의미검색)와 동일 도구를 91개 도구 중 1개로 노출 → 모든 다운스트림 자동 혜택 |

### 🔴 부적합
gjdong, nanobanana-image, KoreanFixer, Travel/Travel2, GJRoad, GJ-RPA, threads-archiver, declaw, claude-code-config, auto_maeri, Superkind, AIDo, Kimbpe, Meari-board, maeri, hermes-dashboard(메트릭 패널 제외) — RAG 도메인 아니거나 결정론적 처리

### 핵심 통찰
**RAG 챗봇 프라이빗 레포 4개**(EchoAI, edu-facility-ai, aido-education, lawmate)와 Docufinder가 동일 인프라 N번 재구축 패턴. **Schift를 hermes-agent에 한 번 통합하면 N개 프로젝트가 같은 백엔드 재사용** — 가장 레버리지 큰 한 수.

---

## 7. 공공 AI 서비스 아이디어 (lexdiff 무관, 2026-04-12 추가)

Schift 강점 = **PDF 위주 + OCR 자동 + 한국 리전**. 이 강점이 가장 빛나는 영역:

| # | 서비스 | 데이터 | 가치 |
|---|--------|--------|------|
| 1 | **국회 의안·회의록 Q&A** | 의안정보시스템 PDF, 본회의/상임위 회의록 | "이 법안 누가 왜 발의했고 반대 논거는?" |
| 2 | **감사원 감사보고서 검색** | 감사원 공개 PDF 수천건 | 기자/연구자 "유사 감사 사례" 탐색 |
| 3 | **지자체 조례·규칙 통합 검색** | 243개 지자체 자치법규 | "내 동네는 이 사안 어떻게 규정?" 비교 |
| 4 | **공공 입찰공고 분석봇** | 나라장터 공고문 PDF | 중소기업 "내 업종 적격 공고 + 낙찰 패턴" |
| 5 | **민원 답변 자동화** | 국민신문고 공개 답변 사례 | 공무원 초안, 시민 사전 조회 |
| 6 | **학교생활기록부 가이드 봇** | 교육부 훈령·예규·Q&A | 교사 "이 항목 기재 가능?" |
| 7 | **재난 대응 매뉴얼 검색** | 행안부·소방청 표준 매뉴얼 | 현장 대응자 음성/모바일 질의 |
| 8 | **세법 해석사례 검색** | 국세청 예규·심판례·판례 | 세무사·납세자 (해석사례가 핵심) |
| 9 | **공공데이터 카탈로그 NL 검색** | data.go.kr 메타데이터 | "○○ 통계 어디?" |
| 10 | **국가기록원 비밀해제 문서** | 비밀해제 행정문서 스캔본 | 역사학자·기자, **OCR 필수 → Schift 강점** |

**임팩트 큰 후보**: #2 감사원 / #8 세법 해석사례 / #10 비밀해제 — 모두 PDF 위주 + 키워드 검색이 빈약 + 사용자 지불 의향 높음.

---

## 8. 참고

- [Schift 공식 문서](https://schift.io/ko/docs/)
- [@schift-io/sdk (TypeScript)](https://github.com/schift-io/schift-ts)
- 관련 lexdiff 문서:
  - [05-RAG_ARCHITECTURE](05-RAG_ARCHITECTURE.md) — 현재 FC-RAG 파이프라인
  - [12-RAG_PIPELINE_OPTIMIZATION_PLAN](12-RAG_PIPELINE_OPTIMIZATION_PLAN.md) — 최적화 계획
  - [17-SYSTEM_CURRENT_STATE](17-SYSTEM_CURRENT_STATE.md) — 시스템 현황

---

**버전**: 1.0 | **작성자 검토 필요**: Phase 1 진행 여부 결정
