# Active Context

**마지막 업데이트**: 2026-04-14 (FC-RAG Confidence 판정 완성 — High 10/10 달성)

## 🎯 2026-04-14 세션 (Confidence 판정 근본 개선)

### 결과
| 지표 | 시작 | 최종 |
|---|---|---|
| High confidence | 1/10 | **10/10** |
| Citation recall | 80% | **100%** |
| Cache hit | 9.9% | **47.9%** |
| Wall time | 294s | 271s |

### 근본 원인 (드디어 잡음)
**Router planResults 누적 버그** — S1 라우터가 실행한 tool result가 `geminiEvidence` 문자열에만 주입되고 `allToolResults` 배열에는 push 안 됨. S2가 추가 도구 호출 없이 바로 답변하면 `allToolResults.length === 0` → `noToolsCalled` 가드에 걸려 강제 low 강등. #5 자영업자가 계속 low 찍히던 진짜 이유.

### 변경 파일
1. **[citations.ts:283](lib/fc-rag/citations.ts#L283)** — calcConfidence 임계 80/48 → **72/40**. evidence 신호가 tool result 100자 컷 때문에 과소평가돼서 pass quality 답변들(1000자+, cite 4+, 근거섹션 완비)이 72-78점 구간에 쌓여 medium 강등되던 문제. #1/#2 복구.
2. **[gemini-engine.ts:417](lib/fc-rag/gemini-engine.ts#L417)** — Router 경로에서 `planResults` + `prefetchSearch` 를 `allToolResults` 에 push. 근본 원인 fix.
3. **[gemini-engine.ts:437](lib/fc-rag/gemini-engine.ts#L437)** — Pre-evidence `aiSearch` 도 `allToolResults` 에 push (동일 패턴 방어).
4. **[gemini-engine.ts:169](lib/fc-rag/gemini-engine.ts#L169)** — forceLastTurn textParts>0 분기에 **existingAnswerLen ≥ 300자 가드**. #6 법조인 258자 토막 답변이 무검증 통과하던 regression 차단.
5. **[gemini-engine.ts:317](lib/fc-rag/gemini-engine.ts#L317)** — `allToolResults` 선언을 S1 router 블록보다 앞으로 이동 (TDZ 회피). v7 9/10 fail 원인.
6. **[engine-shared.ts:38](lib/fc-rag/engine-shared.ts#L38)** — `FCRAGResult.confidenceBreakdown?` 타입 추가. score/evidence/citation/length/structure/weightedEvidence/citCount/ansLen/hasGroundsSection/qualityLevel/qualityScore/downgraded 전부 관측.
7. **[gemini-engine.ts:590](lib/fc-rag/gemini-engine.ts#L590)** — 정상/forceLastTurn-textParts/forceLastTurn-retry **세 경로 모두** answer 이벤트에 breakdown 주입. 회귀 추적 가능.
8. **[scripts/e2e-real-queries.mjs:338](scripts/e2e-real-queries.mjs#L338)** — `record.confidenceBreakdown` JSONL 저장.
9. **[answer-cache.ts:26](lib/fc-rag/answer-cache.ts#L26)** — `CACHE_KEY_VERSION v4 → v8` (이 세션에서 5회 bump).

### 관측 패턴 (앞으로 회귀 디버깅 시 참조)
- `downgraded: "noTools"` + `weightedEvidence: 0` + pass quality → router 경로인데 누적 안 된 경우
- `qualityLevel` 필드 부재 → forceLastTurn 경유 (정상경로는 `qualityLevel/qualityScore` 찍힘)
- score 72-80 + pass → 임계 경계선 근처. evidence 가중치 재튜닝 고려

### 보류/미해결
- **P4 run-to-run flakiness 미측정** — 동일 baseline 3회 분산 안 돌려봄. 10/10 high가 단일 run 결과라 LLM 비결정성 흡수 여부 불확실.
- **P5 22 카테고리 커버리지** — 영문 쿼리 제외 유지, maxTurns +1 효과 미검증.
- **MAX_TOKENS simple 한도** — 원래 P2로 잡혀있었으나 실제 관측에서 #5 truncation은 사라짐 (router 누적 fix 덕에 답변 1387자까지 정상 생성됨). 별도 조치 불필요.

## 🎯 진행 중 대형 작업 (2026-04-13 세션에서 결정)

## 🎯 진행 중 대형 작업 (2026-04-13 세션에서 결정)

### 배경
5천 팔로워 대상 베타 출시 준비. Hermes(Codex OAuth 기반)는 외부 배포 불가 → **서버 공용 Gemini 유료키** 방식으로 결정. Gemini 경로 품질을 Hermes 근접 수준으로 끌어올려야 함.

### 의사결정 기록
1. **BYOK 탈락**: Gemini 무료티어 10 RPM, 복잡 쿼리 1건에 턴 8회 → 바로 429. 사용자 경험 파탄
2. **Hermes 클라우드화 탈락**: Codex OAuth = 개인 ChatGPT 구독 묶임 → 상업 재판매 ToS 위반 리스크. 클라우드 전환하면 Hermes 존재 이유(구독 활용) 상실
3. **Lite Engine 신규 설계 탈락**: CAG(Cache-Augmented Generation) + Plan-Fetch-Answer 2콜 아키텍처를 설계했다가 자기검증 후 폐기
   - Gemini Context Cache **저장료 $1/M/hour** → Top 50 영구 캐시 시 월 $540 폭탄
   - 1 request = 1 cachedContent 제약 → 다중 법령 쿼리에서 복수 캐시 동시 참조 불가
   - CAG 히트율 80% 는 근거 없는 낙관 (실제 20~35% 추정)
   - 법제처 변경 웹훅 **존재 안 함** (내가 지어낸 허구 — 폴링만 가능)
   - Plan-Fetch는 Re-plan 루프 없으면 회복 불가능
4. **최종 방향**: 기존 `gemini-engine.ts` **본격 튜닝** + 그 전에 **MCP 도구 리팩토링 선행**

### MCP 도구 인벤토리 결과 (2026-04-13)

| 버전/위치 | 버전 | 상태 |
|---|---|---|
| npm latest | 3.2.1 | 공개 최신 |
| lexdiff node_modules | 3.2.1 | 이미 최신 |
| d:/AI_Project/korean-law-mcp 로컬 레포 | 3.2.2 (pull 완료) | 미배포 (이 세션에서 pull) |

**중요 사실**:
- lexdiff는 **korean-law-mcp의 TypeScript 핸들러 직접 import** (MCP 프로토콜 안 탐). [lib/fc-rag/tool-registry.ts](lib/fc-rag/tool-registry.ts), [tool-adapter.ts:154](lib/fc-rag/tool-adapter.ts#L154)
- v3.2.2 변경(expose get_annexes / refund auto-fetch / http trust proxy)은 **MCP 서버 측 개선** → lexdiff에 실질 이득 0
- 진짜 이득은 **설치본(3.2.1)에 이미 있는데 lexdiff가 등록 안 한 도구들**

**발견된 미등록 핵심 도구**:
1. **`unified-decisions.ts`** ⭐⭐⭐⭐ — `search_decisions` + `get_decision_text` 2개로 **17개 도메인 통합** (34 tools → 2, "51KB → 3KB" 주석)
   - lexdiff가 현재 개별 등록한 14개 도구(precedent/interpretation/constitutional/admin_appeal/tax_tribunal/customs/ftc/pipc/nlrc + get 쌍)를 대체
   - **lexdiff가 아예 놓친 8개 도메인**: acr(권익위), appeal_review(소청), acr_special, school(학칙), public_corp(공사공단), public_inst(공공기관), treaty(조약), english_law(영문법령)
   - `SEARCH_HANDLERS[domain]` dispatch로 기존 핸들러 pass-through → **결과 구조 100% 동일** = citations 파싱 로직 그대로 재사용 가능
2. **`article-detail.ts`** ⭐⭐⭐ — `get_article_detail`: 조항호목 단위 정밀 조회 (jo + hang + ho + mok). 벌칙/처분기준 쿼리 토큰 대폭 절약
3. **`scenarios/`** — 이미 chain 도구 내부에서 `runScenario/detectScenario` 자동 호출 (chains.js:265 등). 별도 등록 불필요. 단 chain 스키마에 `scenario?` optional param 노출돼 있어 명시 지정도 가능
4. **law-linkage** — 보류. 기존 three_tier/chain_ordinance_compare와 중복 + "응답 구조 미확정" 주석 → 불안정

### 🔴 리팩토링 난이도 — lexdiff 하드코딩 의존 8개 파일

도구 이름 문자열 하드코딩 위치 (A안 전면 제거 시 수정 필요):
| 파일 | 라인 | 내용 |
|---|---|---|
| [citations.ts](lib/fc-rag/citations.ts) | 84, 94 | 인용 검증 `result.name === 'search_precedents'` 분기 |
| [fast-path.ts](lib/fc-rag/fast-path.ts) | 134, 140 | preEvidence LLM 우회 경로 `toolName: 'search_precedents'` |
| [gemini-engine.ts](lib/fc-rag/gemini-engine.ts) | 41, 54, 79-83 | 자동체인: search 0건 재검색, search → get_text 연쇄 |
| [prompts.ts](lib/fc-rag/prompts.ts) | 115-121, 204-206, 221 | 도메인별 가이드 + chain 중복 금지 규칙 |
| [quality-evaluator.ts](lib/fc-rag/quality-evaluator.ts) | 22-34 | SEARCH_TOOLS/EVIDENCE_TOOLS 하드코딩 리스트 |
| [result-utils.ts](lib/fc-rag/result-utils.ts) | 40-168 | compactToolResult switch + extractSearchQuery |
| [tool-cache.ts](lib/fc-rag/tool-cache.ts) | 18-158 | 도구별 TTL + size limit 테이블 |
| [tool-registry.ts](lib/fc-rag/tool-registry.ts) | 12-55, 125-173 | import + TOOLS 배열 등록 |

**사용자 지시**: 나중에 실측 안 할 거니까 B안(병행 등록) 금지. **A안(전면 리팩토링)** 으로 근본 해결.

### 해결 설계: Indirection Layer 도입

**핵심 아이디어**: `decision-domains.ts` 신규 파일을 단일 진실 소스로 도입. 8개 파일은 하드코딩된 문자열 비교 대신 이 헬퍼 사용.

**신규 파일 `lib/fc-rag/decision-domains.ts` 골격**:
```typescript
export const DECISION_DOMAINS = [
  'precedent', 'interpretation', 'tax_tribunal', 'customs',
  'constitutional', 'admin_appeal', 'ftc', 'pipc', 'nlrc',
  'acr', 'appeal_review', 'acr_special',
  'school', 'public_corp', 'public_inst',
  'treaty', 'english_law',
] as const
export type DecisionDomain = typeof DECISION_DOMAINS[number]

interface DomainMeta {
  label: string; searchTTL: number; textTTL: number
  searchSizeLimit: number; textSizeLimit: number
  promptHint: string; isPrimary: boolean
}
export const DOMAIN_META: Record<DecisionDomain, DomainMeta> = { ... }

// 헬퍼 API
export function isDecisionSearchTool(name: string): boolean
export function isDecisionGetTool(name: string): boolean
export function isDecisionTool(name: string): boolean
export function extractDomain(args): DecisionDomain | null
export function getResultDomain(result): DecisionDomain | null
export function filterByDomain(results, domain, kind): ...
export function getDomainTTL(name, args): number | null
export function buildDomainPromptSection(): string
```

### 📋 다음 세션 착수 순서 (엄격히 준수)

**선행 확인 3건**:
1. [tool-tiers.ts](lib/fc-rag/tool-tiers.ts) 전체 구조 (14개 제거+3개 추가 반영)
2. fast-path 결과 소비자 (toolArgs 머지 경로) — [gemini-engine.ts](lib/fc-rag/gemini-engine.ts) 또는 [route.ts](app/api/ai-search/route.ts)
3. `SearchDecisionsSchema.options: z.record(z.string(), z.unknown())` 가 Gemini structured schema 변환 시 깨지지 않는지 — [tool-adapter.ts:25-61](lib/fc-rag/tool-adapter.ts#L25) `zodToJsonSchema` 경로 검증

**실행 단계**:
1. `decision-domains.ts` 신규 생성 (독립, 영향 0)
2. `tool-registry.ts` 수정 — 14개 제거 + 3개 추가. 이 시점부터 빌드 깨짐 (의도된 드라이버)
3. 빌드 에러 따라 순차 수정: result-utils → tool-cache → citations → gemini-engine → fast-path → prompts → quality-evaluator → tool-tiers
4. `npm run build` + `npm run lint` 통과
5. 수동 E2E 10쿼리 (각 도메인 1개) — 판례/해석례/헌재/행정심판/조세/관세/공정위/개인정보/노동 + 신규 권익위·조약
6. `scripts/e2e-fcrag-test.mjs`, `e2e-civil-servant-50.mjs` 하드코딩 업데이트 (grep으로 범위 파악 선행)
7. CLAUDE.md 수치 정정 (현재 "15 노출/91 내부" 부정확 → 실제 등록 수 기재. 네이밍도 현행화)
8. **그 다음에야** Gemini 튜닝 Phase 0~5 진입

### Gemini 튜닝 Phase 0~5 (리팩토링 후 진행)

정확한 파라미터 위치는 [engine-shared.ts:66-77, 233-238](lib/fc-rag/engine-shared.ts) 확인됨.

| Phase | 작업 | 파일 | 핵심 변경 |
|---|---|---|---|
| 0 | 베이스라인 측정 | gemini-engine.ts:214 | perf 객체 추가, 평가셋 20건(simple 5/mod 10/complex 5) |
| 1 | 파라미터 튜닝 | engine-shared.ts | maxToolTurns 2/3/4 → 3/6/8, TIMEOUT 30/45/60 → 45/90/150s, MAX_TOKENS 3K/4K/6K → 3K/5K/8K |
| 2 | **Tool Result Compaction** ⭐ | 신규 tool-result-compactor.ts + gemini-engine.ts:319, 538 | turnAge 기반 요약 (turn 0 raw / turn 1+ 축약). 핵심 개선 |
| 3 | 사전 도구 호출 포팅 | gemini-engine.ts:242-251 | claude-engine.ts:66-127의 consequence/scope/procedure 특화 사전검색 이식 |
| 4 | isGemini 프롬프트 강화 | prompts.ts:232-238 | chain 우선, "제N조" 포맷 강제, 병렬 호출 지시 |
| 5 | A/B 플래그 + 평가 | .env.local + engine-shared.ts | GEMINI_TUNING_ENABLED 토글, eval 스크립트 |

**선행 확인**: Vercel `maxDuration` 설정 (route.ts 상단). Hobby면 60s 한계 → Phase 1 타임아웃 튜닝 의미 축소

### ⚠️ 이번 세션에서 내가 잘못 말한 것들 (정정 기록)

1. **"Gemini는 토큰 스트리밍 불가"** — 틀림. [gemini-engine.ts:368](lib/fc-rag/gemini-engine.ts#L368) `yield { type: 'answer_token', ... }` 이미 구현됨
2. **"Gemini는 MCP 못 씀"** — 틀림. lexdiff는 MCP 프로토콜 안 타고 TypeScript 직접 import → 57개 도구 모두 사용 가능
3. **CAG 히트율 80%** — 근거 없는 낙관
4. **"법제처 변경 웹훅"** — 존재 안 함 (폴링만)
5. **Gemini Context Cache 다중 참조 가능** — 틀림. 1 request = 1 cachedContent

---



## 현재 상태

**FC-RAG Primary 경로 = Hermes Gateway 경유 GPT-5.4** (HTTP `:8642/v1/chat/completions` SSE).
- `lib/fc-rag/hermes-client.ts`가 단일 진입. `child_process.spawn` / Claude CLI / stream-json 플래그 모두 코드베이스에 없음.
- 함수명/파일명 `claude-engine.ts`, `executeClaudeRAGStream`, `callAnthropicStream`은 **legacy 네이밍**. 이름만 보고 Anthropic Claude 직접 호출이라 가정 금지.
- korean-law-mcp는 Hermes가 자식 프로세스로 직접 관리. lexdiff는 MCP를 모름.
- 2026-04-12: `claude-engine.ts:25-28, 111` 주석 + `important-docs/05-RAG_ARCHITECTURE.md`, `09-COMPONENT_ARCHITECTURE.md`, `17-SYSTEM_CURRENT_STATE.md` 정정 완료.

**별표(annex) 파싱 kordoc 전환 완료.** HWPX/HWP5는 kordoc, PDF는 lexdiff 직접 처리 (Vercel 서버리스 호환). PDF 표 추출 개선 작업 진행 중.

## 프로젝트 관계 (중요!)

| 레포 | 역할 | 실행 환경 |
|------|------|----------|
| **lexdiff** | 웹앱 (Next.js) — 자체 FC-RAG 엔진 (`lib/fc-rag/`) | Vercel/로컬 |
| **kordoc** (`github.com/chrisryugj/kordoc`) | HWP/HWPX/PDF → Markdown 변환 라이브러리 | npm 패키지 |

### ✅ 완료된 작업 (2026-03-28 — 별표 모달 재설계)

| 카테고리 | 수정 내용 | 파일 |
|----------|----------|------|
| **kordoc 도입** | 자체 파서 5개 삭제 → kordoc 래퍼 | `lib/annex-parser/index.ts` |
| **Gemini Vision 제거** | annex-to-markdown에서 AI 의존 완전 제거 (156→85줄) | `app/api/annex-to-markdown/route.ts` |
| **HWPX/HWP5 구분** | 법제처 content-type "hwp"인 HWPX(ZIP) 파일 정확 판별 | `app/api/annex-pdf/route.ts` |
| **별표 법령명 파싱** | 문장 경계(다. + ①②③) 체크로 잘못된 법령 연결 수정 | `lib/link-pattern-matchers.ts` |
| **스크롤 복원** | 모달 닫을 때 savedScrollRef + requestAnimationFrame | `components/annex-modal.tsx` |
| **PDF Vercel 호환** | DOMMatrix polyfill + worker 사전 주입 + static import | `lib/annex-parser/pdf-polyfill.ts`, `index.ts` |
| **serverExternalPackages** | kordoc, jszip 추가 / pdfjs-dist 제거 (번들링 필요) | `next.config.mjs` |

### 🔧 진행 중 — PDF 표 추출 개선

**상태**: kordoc `src/pdf/parser.ts`에 열 경계 학습 기반 테이블 빌더 작성 중. 미완성, 미커밋.

**핵심 문제**:
- gap 15px 고정 → 열 구분 부정확 (같은 열 gap 9px vs 다른 열 gap 10px)
- 셀 내 줄바꿸(26면/58면)이 별도 행으로 분리
- 비고 텍스트가 테이블로 오인식

**해결 방향** (코드 작성 중):
1. 가장 아이템 많은 행의 gap 분석 → minGap*2를 열 경계 threshold
2. 테이블 후보: 4+ 아이템 + x 범위 넓음 + 평균 텍스트 길이 3+
3. 왼쪽 열에 실질적 새 텍스트 있으면 새 행, 1-2글자면 continuation
4. 비테이블 연속 2줄이면 테이블 종료

**작업 파일**: `c:\github_project\kordoc\src\pdf\parser.ts` (미커밋)
**lexdiff 반영**: kordoc 버전업 후 `pnpm update kordoc`

### Vercel pdfjs-dist 호환 교훈 (중요!)

| 문제 | 원인 | 해결 |
|------|------|------|
| DOMMatrix not defined | pdfjs-dist 모듈 로드 시 참조 | `pdf-polyfill.ts`에서 import 전 polyfill 주입 |
| workerSrc="" 무효 | pdfjs v5가 `workerSrc \|\|= "./pdf.worker.mjs"`로 덮어씀 | `globalThis.pdfjsWorker`에 worker 모듈 static import로 사전 주입 |
| serverExternalPackages에 pdfjs-dist 포함 시 | 외부 모듈로 로드되면 fake worker의 dynamic import 실패 | pdfjs-dist는 **번들링에 포함** (serverExternalPackages에서 제거) |
| ES 모듈 import 호이스팅 | 인라인 polyfill이 import보다 늦게 실행 | 별도 파일(`pdf-polyfill.ts`)로 분리 |

### 📋 다음 할 일

- [ ] **kordoc PDF 표 추출 완성**: 열 경계 학습, 행 병합, 비고 영역 분리
- [ ] **kordoc 버전업 + npm publish**
- [ ] **lexdiff pnpm update kordoc** → PDF 표 품질 자동 반영
- [ ] **lexdiff PDF 파서도 동기화** (현재 lexdiff는 자체 PDF 파서 유지 — Vercel 호환 이유)

### 쿼리 확장 핵심 파일

| 파일 | 역할 |
|------|------|
| `lib/query-expansion.ts` | 핵심 로직 (stripKoreanSuffix, extractKeywords, expandQuery) |
| `lib/query-expansion-data.ts` | 사전 데이터 (동의어, 복합어, 매핑) |
