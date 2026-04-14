# FC-RAG 파이프라인 최적화 — 세션 핸드오프

**작성일**: 2026-04-14 (세션 2 — P0 수정 완료)
**세션 범위**: Phase 1a ~ Phase 2 완료 + 실측 검증 + **P0 버그 수정 + E2E 회귀 검증**
**다음 세션**: 실전 쿼리 10종 품질 분석 + P1 Context Cache 원인 규명

---

## 🆕 세션 2 완료 요약 (2026-04-14)

### ✅ P0 버그 수정 (commit 856a1f3)

**P0-1 — MST 환각 차단** (근본 원인 + 2중 수정)
- **증상**: Router 경로에서 LLM 이 `get_batch_articles` 에 환각 `lawId:"001164"` 주입 → "법령 데이터를 찾을 수 없습니다" 에러
- **근본 원인**:
  1. Router 가 chain 도구만 선제 실행, `search_law` 를 돌리지 않음 → `latestSearchEntries` 가 비어있음
  2. LLM 이 `chain_action_basis` 결과 텍스트에서 주운 숫자를 본체 MST 로 오인
  3. `correctToolArgs` 가 `call.args.mst` 만 검증, `lawId` 는 통째로 블라인드스팟
  4. `get_batch_articles` 스키마가 `mst/lawId` 둘 다 optional 허용해서 validation 통과
- **수정 A (교정)**: [result-utils.ts](../lib/fc-rag/result-utils.ts) `correctToolArgs` 에 `lawId` 케이스 추가 — knownMSTs 없으면 `findBestMST` → `delete lawId; args.mst = corrected`. `get_article_history` 는 lawId 필수라 제외.
- **수정 B (예방)**: [gemini-engine.ts](../lib/fc-rag/gemini-engine.ts) Router 블록에서 쿼리의 법령명 추출 → `executeTool('search_law', ...)` 를 `Promise.all` 로 plan 과 병렬 prefetch → `latestSearchEntries` 사전 채움. 환각 표면적 자체 제거.
- **검증**: 관세법 복합 쿼리 `get_batch_articles` success, stale 에러 0건. E2E 5/5 PASS.

**P0-2 — Router 경로 CHAIN_COVERS 병합 누락**
- `latestSearchEntries` / `chainCoveredTools` 선언을 Router 블록 위로 이동
- Router `toolPlan` 선제 실행 후 `CHAIN_COVERS[call.name]` 을 `chainCoveredTools` 에 병합 → S2 가 같은 체인을 다시 호출하는 낭비 차단

**P0-3 — Context Cache 적중 관측**
- [engine-shared.ts](../lib/fc-rag/engine-shared.ts) `token_usage` 이벤트에 `cachedTokens?: number` 추가
- [gemini-engine.ts](../lib/fc-rag/gemini-engine.ts): `usageMetadata.cachedContentTokenCount` 수집 → `totalCachedTokens` 누적 → 이벤트 방출 + dev 로그 출력 `[context-cache] turn N: cached=X/Y (Z%)`
- **관측 결과: hit rate = 0%**. 복합 쿼리 4턴 모두 `cachedTokens:0`. **Phase 1a (8df5dc1) 가 실제로는 효과 없음.** → P1 우선 과제.

### ✅ 회귀 방지 개선 (별도 커밋 예정)

**`api-auth.ts` graceful downgrade**
- 새로 풀된 [lib/api-auth.ts](../lib/api-auth.ts) 의 `requireAiAuth` 가 Supabase env 없을 때 `createSupabaseServerClient()` throw → **500 으로 새는 버그**
- 로컬 dev 환경은 Supabase 미설정이 정상인데 모든 API 요청이 500
- 수정: `try/catch` 로 감싸서 env 없으면 401 로 내림 (401 = "로그인 필요 또는 BYOK 등록")
- `x-user-api-key` (BYOK) 헤더는 여전히 Supabase 전혀 거치지 않음

**E2E 스크립트 수정** [scripts/e2e-fcrag-test.mjs](../scripts/e2e-fcrag-test.mjs)
- BYOK 헤더 주입 (`process.env.GEMINI_API_KEY` → `x-user-api-key`)
- `result.quality` 기본값 세팅 (HTTP 실패 early-return 시 `toolHits.join` 터지던 버그 수정)
- 실행 시: `export GEMINI_API_KEY=...` 후 `node scripts/e2e-fcrag-test.mjs [--parallel] [--fast]`

### 📊 E2E 회귀 검증 결과 (sequential, fast 모드)

| 시나리오 | Time | Tools | Cite | Quality |
|---|---|---|---|---|
| customs (수입과세가격) | 55.7s | ✅ | ✅ | medium |
| labor (해고예고수당) | 31.9s | ✅ | ❌ | medium |
| tax (양도소득세) | 20.4s | ✅ | ✅ | low |
| public_servant (휴직) | 20.5s | ✅ | ✅ | medium |
| construction (주차장) | 26.5s | ✅ | ✅ | medium |

- **Overall PASS** | Tools 5/5 | Cite 4/5 | High 0/5 | stale MST 에러 0건
- **Parallel vs Sequential**: 41s vs 155s (parallel 3.8× 빠름, 품질 동등). parallel 에서는 일부 SSE stream 연결이 끊겨 `fetch failed` 2건 — **서버 응답은 200**, Node fetch 쪽 경합 문제.
- **High confidence 0건**: `calcConfidence` 또는 `citation_verification` 경로 이슈. `verify:-` 전원이라 citation_verification 이벤트가 아예 안 발행되는 중일 가능성.

---

## 🎯 다음 세션 우선순위 (세션 3)

### 🔴 최우선: 실전 쿼리 10종 품질 분석

다양한 실사용자 페르소나 10개 쿼리를 sequential 로 돌려 결과를 JSON 로 덤프 → 품질/지연/토큰/hit rate 분석 → 저품질 패턴 식별 → 점진적 수정.

**페르소나 × 쿼리 제안** (E2E 스크립트에 `realQueries` 배열로 추가):

| # | 페르소나 | 쿼리 | 기대 tool/citation |
|---|---|---|---|
| 1 | 일반 직장인 | "해고예고수당 못 받으면 어떻게 해야 하나요?" | search_ai_law / 근로기준법 제26조, 제110조 |
| 2 | 건축가 | "대지면적 산정 시 도로에 접한 부분은 어떻게 처리하나요?" | search_ai_law, get_batch_articles / 건축법 시행령 제3조 |
| 3 | 세무사 | "상속세 신고 기한 놓쳤을 때 가산세와 불복 절차" | chain_dispute_prep, search_decisions(tax_tribunal) / 상속세및증여세법 |
| 4 | 공무원 (인사) | "육아휴직 중 승진심사 제외가 적법한지" | search_ai_law, search_decisions(precedent) / 국가공무원법 제71조, 제45조의2 |
| 5 | 자영업자 | "종합소득세 기장의무와 단순경비율 적용 기준" | search_ai_law / 소득세법 제160조 |
| 6 | 법조인 | "민법 제839조의2 재산분할청구권의 제척기간 기산점 판례" | search_decisions(precedent), get_decision_text |
| 7 | 중소기업 대표 | "52시간 근로시간제 위반 시 처벌과 유예조항" | search_ai_law, get_batch_articles / 근로기준법 제53조, 제110조 |
| 8 | 임대인 | "임차인이 월세 3개월 연체 시 계약 해지 방법과 절차" | search_ai_law, search_decisions(precedent) / 주택임대차보호법 |
| 9 | 지자체 담당 | "서울시 조례로 주차장 설치 완화 가능 범위" | search_ordinance, chain_ordinance_compare / 주차장법 + 서울시 조례 |
| 10 | 개인사업자 (개인정보) | "고객 개인정보 유출 시 신고 의무와 과태료" | search_ai_law, search_decisions(pipc) / 개인정보보호법 제34조 |

**로깅 항목** (쿼리당 한 줄 JSONL):
- query, persona, durationMs
- tools (호출 순서), toolCount
- inputTokens, outputTokens, cachedTokens (cache hit 관측)
- answerLength, confidenceLevel, isTruncated
- citationsExpected, citationsFound, citationMatch (precision/recall)
- warnings, errors
- router 적중 여부 (`[S1 라우터]` 로그 검출)
- MST 환각 재발 체크 (`법령 데이터를 찾을 수 없습니다` 패턴 매칭)

**출력**: `logs/e2e-real-queries-{timestamp}.jsonl` + 콘솔 요약표

### 🟡 P1 — Context Cache hit=0 원인 규명
원인 후보:
1. **`gemini-3-flash-preview` preview 모델이 implicit cache 미지원** (가장 유력) — 공식은 `gemini-2.5-flash`/`2.5-pro` 부터
2. systemInstruction 이 1,024 토큰 미달 (확인 필요: `buildStaticSystemPrompt(true)` 토큰 카운트)
3. 프롬프트에 숨은 variation (timestamp, random, etc.)

**시도 순서**:
- a) `GEMINI_MODEL=gemini-2.5-flash` 환경변수 오버라이드 → 실전 쿼리 10종 재돌려 cache hit rate 측정
- b) 히트 안 나면 `ai.caches.create()` explicit cache 로 전환 (Phase 1a 고도화). systemInstruction 을 명시 캐시로 만들어 100% 보장.
- c) `usageMetadata` 필드 전체 덤프해서 cachedContent 가 정말 0 인지 vs 필드 자체가 빠진 건지 확인

### 🟢 P2 — 품질 지표 로직 점검
- `calcConfidence` 가 왜 high 를 안 주는지 ([citations.ts](../lib/fc-rag/citations.ts) 또는 result-utils)
- `citation_verification` 이벤트가 왜 전원 발행 안 되는지 (verify:- 전원)
- labor 시나리오의 citation 누락 패턴 확인 (제26조/제110조)

---

## 🎯 상위 목표

사용자 초기 요구:
> 시니어 슈퍼개발자·RAG 전문가·법률 전문가 관점에서 FC-RAG 답변 파이프라인을 세밀 점검, 답변 퀄리티 유지하면서 응답 시간·토큰 획기적으로 줄이는 천재적 구조 리팩토링.

핵심 발견: **단순히 느린 게 아니라, 잘못된 경로(stale MST)로 빠지고 있었음**. 최적화 효과는 근본 버그 수정과 병행할 때 극대화됨.

---

## ✅ 완료된 커밋 (origin/main 에 푸시됨)

```
a768b04 fix(fc-rag): fast-path stale MST 제거 + router 카탈로그 정리
e1ffad7 feat(fc-rag): S1 Router (Gemini 3.1 Flash-Lite) + 20% 해시 롤아웃
dc85f38 perf(fc-rag): 결정문 전문 스마트 압축 (섹션 인식 + 자연 경계)
8df5dc1 perf(fc-rag): Gemini context caching + answer cache 도입
```

### Phase 1a — Gemini Context Caching 준비 (8df5dc1)
- [lib/fc-rag/prompts.ts](../lib/fc-rag/prompts.ts): `buildStaticSystemPrompt` / `buildDynamicHeader` 분리
- systemInstruction 을 100% 고정으로 만들어 Gemini 2.5+ implicit cache (최소 1,024토큰, 90% 할인) 자동 발동
- complexity/queryType/domain/consequence hint 는 user message 앞 prefix 로 이동
- `buildSystemPrompt` wrapper 는 Claude 엔진/테스트 하위호환용 유지
- [lib/fc-rag/gemini-engine.ts](../lib/fc-rag/gemini-engine.ts) 통합

### Phase 1b — Answer Cache (8df5dc1)
- [lib/fc-rag/answer-cache.ts](../lib/fc-rag/answer-cache.ts): Upstash Redis + Map fallback, TTL 6h
- 키: `lexdiff:fcrag:ans:v1:{sha256(normalize(query))}`
- skip 조건: conversationId / preEvidence / warnings / low confidence / truncated / 짧은 답변
- gemini-engine 진입 직후 lookup, 정상 답변 시 store

### Phase 1c — Decision Text Compression (dc85f38)
- [lib/fc-rag/tool-cache.ts](../lib/fc-rag/tool-cache.ts) `compressDecisionText`
- 판시사항/판결요지는 **절대 자르지 않음** (대법원 공식 요약 보호)
- 전문/참조판례는 **자연 경계**에서 자름 (단락 → 문장 끝 → 줄바꿈 → 최후 하드컷)
- `cutAtNaturalBoundary` 헬퍼: target 의 60% 이상에서 경계 탐색 실패 시에만 하드컷
- 명시 마커 `⚠️ [이후 생략 — 인용 금지]` 삽입 → LLM 할루시네이션 방지
- [__tests__/lib/fc-rag/tool-cache-compress.test.ts](../__tests__/lib/fc-rag/tool-cache-compress.test.ts) 8/8 통과
- 적용: `isDecisionGetTool(name)` 매칭 시 `get_decision_text` 결과만 압축. 일반 법령 미영향.

### Phase 2 — S1 Router (e1ffad7)
- [lib/fc-rag/router-engine.ts](../lib/fc-rag/router-engine.ts): Gemini 3.1 Flash-Lite 경량 라우터
- 출력: `{complexity, queryType, domain, toolPlan, expectedTurns, reasoning}`
- JSON 모드 + `thinkingBudget: 0` + 5초 타임아웃
- 카탈로그 11개 (모두 `{query}` 단일 파라미터 도구만 — 할루시네이션 방어)
- **args 강제 덮어쓰기**: 라우터가 생성한 args 무시하고 `{query: originalQuery}` 통일
- 실패 시 `null` 반환 → regex 폴백 (이중 안전망)
- `shouldUseRouter(query, pct)`: djb2 해시 기반 결정적 20% 롤아웃
- 환경변수:
  - `FC_RAG_S1_ROUTER_ENABLED=true` (기본 false)
  - `FC_RAG_S1_ROUTER_ROLLOUT_PCT=20` (기본 20)
  - `GEMINI_ROUTER_API_KEY` (미설정 시 `GEMINI_API_KEY` 폴백)
- [__tests__/lib/fc-rag/router-engine.test.ts](../__tests__/lib/fc-rag/router-engine.test.ts) 5/5 통과

### Fix — KNOWN_MST 제거 + Router 카탈로그 정리 (a768b04)
- [lib/fc-rag/fast-path.ts](../lib/fc-rag/fast-path.ts) `PRELOAD_LAWS` 배열 전체 삭제
- KNOWN_MST Map 자체는 유지하되 빈 상태 시작 → `cacheMSTEntries` 로 런타임 축적만
- 이유: 법제처 개정마다 MST 변경되어 하드코딩은 stale → `get_batch_articles(mst=268569)` 같은 호출 실패
- [lib/fc-rag/router-engine.ts](../lib/fc-rag/router-engine.ts) 카탈로그에서 `search_law` 제거 (자연어 쿼리 매칭 안 됨)

---

## 📊 실측 검증 결과 (로컬 dev 서버 + curl SSE)

| 테스트 | Before (buggy) | After (전체 수정) | 개선 |
|--------|---------------|-----------------|------|
| **단순 조문 (근로기준법 제60조)** | 47.3s, 30K 토큰, 엉뚱 답변 | **1.8s, 0 토큰, 정확** | **-96% / -100%** |
| **재호출 (Answer Cache hit)** | 매번 새로 | **0.293s, 0 토큰** | **-99.4%** |
| **복잡 쿼리 (관세법 벌칙 vs 행정심판)** | 47s, "답변 생성 실패" | **46s, 완전한 비교표+추천** | 품질 복구 |

핵심 교훈:
- **KNOWN_MST 프리로드 제거가 예상치 못한 대박** — 단순 조문 쿼리 25배 빨라짐
- 사용자가 "시간 너무 오래 걸린다"고 느낀 진짜 원인은 **성능이 아니라 버그 경로 진입**
- 이중 폴백(라우터 실패 → pre-evidence 블록) 설계가 제대로 작동 — 라우터 품질 부족해도 최소한 기본 파이프라인 이상 보장

---

## 🔴 다음 세션 P0 (남은 버그)

### 0. Fast-path 답변 Answer Cache 미저장 (프로덕션 실측 발견)
**증상**: Fast-path article_resolve 경로로 처리된 답변이 Upstash에 저장되지
않아, 동일 쿼리 재호출 시 매번 fast-path 풀 실행 (1~2초 반복 낭비).

**원인**: [lib/fc-rag/engine-shared.ts](../lib/fc-rag/engine-shared.ts) 의
`handleFastPath` 가 answer yield 하는 지점 5곳에서 `cacheAnswer()` 호출
안 함. Phase 1b 구현 시 gemini-engine 의 normal 완료 경로에만 추가했음.

**실측**: 프로덕션 `/api/fc-rag` 에 "근로기준법 제60조 연차휴가 요건"
재호출 → fast-path 재실행 (2.1s). 반면 Upstash에 저장된 "국가공무원법
제78조" 는 cache hit (1.6s, 이전 세션에서 full pipeline 타고 저장됨).

**수정**:
1. engine-shared 에 `import { cacheAnswer } from './answer-cache'` 추가
2. handleFastPath 시그니처에 `cacheOpts: { conversationId?, hasPreEvidence? }` 추가
3. 5개 answer yield 지점마다 `await cacheAnswer(query, data, cacheOpts)` 삽입
4. gemini-engine 의 handleFastPath 호출부에서 cacheOpts 전달

**예상 공수**: 10분. 재호출 성능 특히 단순 조회에서 2.1s → 0.3s 로 단축.

### 1. MST 280363 stale (반복 발생)
**증상**: 관세법 쿼리에서 S2가 `search_law` 호출 → 결과 파싱 → `get_batch_articles(mst=280363, articles=[제119조, ...])` → 실패 `"법령 데이터를 찾을 수 없습니다 (280363)"`

**확인 필요**:
- `search_law` 가 반환한 MST 가 실제로 280363 인지 (응답 캡처)
- 280363 이 법제처에서 유효한 관세법 MST 인지 (직접 API 호출로 검증)
- 또는 파싱 로직(`parseLawEntries` in [fast-path.ts](../lib/fc-rag/fast-path.ts))이 엉뚱한 법령의 MST 를 꺼냈는지

**의심**: 관세법 검색 결과에 "관세법"·"관세법 시행령"·"관세법 제71조에 따른 할당관세의 적용에 관한 규정" 등 유사 법령이 섞여 있고, **첫 번째 매칭을 무조건 선택**하는 로직이 잘못된 것을 고를 가능성.

### 2. Chain 중복 호출 (Router 경로)
**증상**: Router 가 `chain_dispute_prep` 선택 → 성공. 그 후 S2 가 이어서 `chain_action_basis` 또 호출 → 실행 중복. 같은 도메인·동일 질문에 chain 2개 실행은 낭비.

**원인 가설**: [tool-tiers.ts](../lib/fc-rag/tool-tiers.ts)의 `CHAIN_COVERS` 로직은 "이 chain 을 호출했으면 이 도구들은 스킵" 룰인데, Router 경로에서 `chainCoveredTools` Set 에 추가하는 부분이 빠져있을 수 있음.

**확인 필요**: [gemini-engine.ts](../lib/fc-rag/gemini-engine.ts) 의 Router 블록에서 plan 실행 후 `CHAIN_COVERS[routerPlan.toolPlan[0].name]` 을 `chainCoveredTools` 에 병합해야 함.

### 3. `answer_token` 스트림 누락 (Fast-path 경로)
**증상**: Fast-path article_resolve 로 처리되면 `answer_token` 이벤트 없이 raw 조문 원문만 `answer` 이벤트로 발행 → UI 에서 streaming 진행감 없음

**현 동작**: 이는 의도된 동작 (fast-path 는 LLM 을 타지 않음). 하지만 UX 관점에서 조문 원문 덩어리를 LLM 요약 없이 보여주는 건 사용자가 기대하는 "AI 답변" 과 다름.

**개선 선택지**:
- a) Fast-path 결과를 pre-evidence 로 넣고 S2 가 자연어 답변 생성 (시간 5~10초 추가되지만 UX 개선)
- b) 클라이언트에서 fast-path 결과를 "조문 원문" 모드로 별도 렌더링

---

## 🟡 P1 (성능·품질 튜닝)

### 4. 복잡 쿼리 답변 생성 latency
- `forceLastTurnAnswer` 단계에서 답변 생성에 9초 추가 소요 ({관세법 쿼리 46초 중 마지막 9초})
- `maxOutputTokens` 조정 or streaming 개선 여지
- 또는 maxToolTurns 제한으로 턴 수 줄이기

### 5. Context Cache 효과 측정 불가
- Gemini 응답 `usageMetadata.cachedContentTokenCount` 로깅 안 함
- [gemini-engine.ts](../lib/fc-rag/gemini-engine.ts) 의 token_usage 이벤트에 cached 토큰 추가 필요
- 실제 90% 할인 적용 여부 로그로 검증

### 6. Router 플랜 품질
- 현재 Router 가 chain_action_basis 와 chain_dispute_prep 를 제대로 구분 못 하는 경우 있음
- 프롬프트에 체인별 typical use-case 예시 추가 여지

### 7. Tool result 압축 확장
- 일반 법령(`get_law_text`, `get_batch_articles`)도 head-truncation 만 있음 — 조문 경계 인식 smart boundary 로 확장 가능 (사용자가 앞 세션에서 제기한 할루시 우려)

---

## 🟢 P2 (원 제안서의 남은 아이디어)

**원 7가지 천재 아이디어 중 완료/미완료**:

- [x] #1 Speculative Parallel Execution — **미완** (Phase 2 이후 남음)
- [x] #2 Two-Stage Cascading — ✅ 완료 (Phase 2 = S1 Router)
- [x] #3 Progressive Tool Disclosure — **미완**
- [x] #4 Context Caching — ✅ 완료 (Phase 1a)
- [x] #5 Answer Skeleton Streaming — **미완**
- [x] #6 Tool Result Compression — ✅ 부분 완료 (결정문만, 일반 법령 미완)
- [x] #7 Query Fingerprint + Answer Cache — ✅ 완료 (Phase 1b)

### 남은 카드

- **Progressive Tool Disclosure (#3)**: meta-tool `expand_domain_tools` 로 초기 9개 도구만 주입, 필요시 확장
- **Speculative Parallel Execution (#1)**: Fast Path + Router + LLM warm-up race
- **Answer Skeleton Streaming (#5)**: law prefetch 후 UI skeleton 먼저 표시
- **Explicit Context Cache (#4 고도화)**: `ai.caches.create()` 로 hit rate 100% 보장
- **Tool Result Compression 확장 (#6)**: 일반 법령에도 조문 경계 smart boundary

---

## 🔧 환경 설정 체크리스트 (다음 세션 시작 시)

### 로컬 `.env.local` (gitignored — 다른 컴에서 재설정 필요)
```bash
# Phase 1b 필수 — 값은 Upstash 대시보드(https://console.upstash.com)에서 복사
# DB 이름: unified-cattle-98279 (Seoul region)
UPSTASH_REDIS_REST_URL="<upstash-console-에서 복사>"
UPSTASH_REDIS_REST_TOKEN="<upstash-console-에서 복사>"

# Phase 2 S1 Router (선택)
FC_RAG_S1_ROUTER_ENABLED=true
FC_RAG_S1_ROUTER_ROLLOUT_PCT=100   # 로컬 테스트는 100, 프로덕션은 20부터
```

⚠️ **보안**: 이 문서는 tracked 이므로 실제 토큰을 포함하지 않는다. Upstash 콘솔에서 직접 복사하거나 기존 컴 `.env.local` 에서 복붙.

### Vercel 환경변수 (아직 안 되어 있으면 필수)
```
UPSTASH_REDIS_REST_URL          → 위 값
UPSTASH_REDIS_REST_TOKEN        → 위 값
FC_RAG_S1_ROUTER_ENABLED        → true  (선택)
FC_RAG_S1_ROUTER_ROLLOUT_PCT    → 20    (점진 롤아웃 시작)
```

설정 후 최신 배포 Redeploy 필수.

---

## 📚 관련 파일 맵

| 파일 | 역할 | 수정 여부 |
|------|------|----------|
| [lib/fc-rag/prompts.ts](../lib/fc-rag/prompts.ts) | 정적/동적 프롬프트 분리 | Phase 1a |
| [lib/fc-rag/answer-cache.ts](../lib/fc-rag/answer-cache.ts) | Upstash 답변 캐시 | Phase 1b 신규 |
| [lib/fc-rag/tool-cache.ts](../lib/fc-rag/tool-cache.ts) | 결정문 smart compressor | Phase 1c |
| [lib/fc-rag/tool-adapter.ts](../lib/fc-rag/tool-adapter.ts) | compressDecisionText 호출 | Phase 1c |
| [lib/fc-rag/router-engine.ts](../lib/fc-rag/router-engine.ts) | S1 Flash-Lite 라우터 | Phase 2 신규 |
| [lib/fc-rag/gemini-engine.ts](../lib/fc-rag/gemini-engine.ts) | 메인 엔진 + router/cache 통합 | Phase 1a/1b/2 |
| [lib/fc-rag/fast-path.ts](../lib/fc-rag/fast-path.ts) | KNOWN_MST 프리로드 제거 | Fix a768b04 |
| [lib/ai-config.ts](../lib/ai-config.ts) | 모델 ID 중앙화 | 변경 없음 |

### 모델 ID 확정 (절대 틀리지 말 것)
- **S1 Router**: `gemini-3.1-flash-lite-preview` (`AI_CONFIG.gemini.lite`)
- **S2 Executor**: `gemini-3-flash-preview` (`AI_CONFIG.gemini.primary`)
- 하드코딩 금지 — 반드시 `AI_CONFIG` 참조

---

## 🧪 재현 가능한 검증 절차

### 1. Answer Cache 검증
```bash
# 같은 쿼리 두 번. 첫 번째 느림, 두 번째 즉시.
echo '{"query":"국가공무원법 제78조 징계사유 알려줘"}' > /tmp/q.json

time curl -sN -X POST http://localhost:3000/api/fc-rag \
  -H "Content-Type: application/json" \
  -H "x-user-api-key: $GEMINI_API_KEY" \
  --data @/tmp/q.json | head -5

# 즉시 재호출 → "캐시된 답변 반환 중..." status 후 0.3초 내 완료
time curl -sN -X POST http://localhost:3000/api/fc-rag \
  -H "Content-Type: application/json" \
  -H "x-user-api-key: $GEMINI_API_KEY" \
  --data @/tmp/q.json | grep "캐시된"
```

### 2. Router 검증 (복잡 쿼리)
```bash
echo '{"query":"관세법 위반 시 벌칙과 행정심판 절차를 비교해서 설명해줘"}' > /tmp/q2.json
curl -sN -X POST http://localhost:3000/api/fc-rag \
  -H "Content-Type: application/json" \
  -H "x-user-api-key: $GEMINI_API_KEY" \
  --data @/tmp/q2.json | grep -E "S1 라우터|S1 플랜"
```

기대 이벤트:
```
data: {"type":"status","message":"S1 라우터 분석 중...","progress":10}
data: {"type":"status","message":"S1 플랜 실행 (1개 도구)","progress":14}
```

### 3. 단위 테스트
```bash
npm run test:run -- __tests__/lib/fc-rag/
# 기대: 135/138 통과 (실패 3개는 tool-adapter.test.ts 의 pre-existing fake_search 이슈, 이 세션 이전부터 존재)
```

---

## 🚀 다음 세션 시작 프롬프트 (복붙용)

```
important-docs/FC_RAG_OPTIMIZATION_HANDOFF.md 읽고 이어서 작업한다.

이전 세션 요약:
- Phase 1a(context caching) + 1b(answer cache) + 1c(decision compress) + 2(S1 router) 완료
- KNOWN_MST 프리로드 제거로 단순 쿼리 47s → 1.8s 달성
- 실측 검증 완료, 모두 origin/main 에 푸시됨

다음 P0:
1. MST 280363 stale 버그 원인 분석 (관세법 쿼리 search_law → get_batch_articles 실패)
2. Router 경로에서 CHAIN_COVERS 로직 누락 확인 및 수정
3. Context Cache 적중 여부 로깅 (Gemini usageMetadata.cachedContentTokenCount)

.env.local 의 다음 값 복구 필요 (이전 세션 문서에 있음):
- UPSTASH_REDIS_REST_URL
- UPSTASH_REDIS_REST_TOKEN
- FC_RAG_S1_ROUTER_ENABLED=true
- FC_RAG_S1_ROUTER_ROLLOUT_PCT=100

먼저 dev 서버 띄우고 P0-1 부터 파고들어줘. 관세법 쿼리로 재현하면서 search_law 응답을 로그로 찍어보는 것부터 시작.
```

---

**세션 종료 상태**: 커밋 4개 origin/main 푸시 완료, 프로덕션 배포 가능 (Vercel env 설정 필요). 다음 세션에서 P0 버그 수정부터.
