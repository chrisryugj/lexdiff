# Changelog

LexDiff의 주요 변경사항을 기록합니다. 형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)을 따르며, 버전은 [Semantic Versioning](https://semver.org/lang/ko/)을 사용합니다.

## [2.4.0-beta] — 2026-06-27

조회 이력 재조회, 별지(서식) 뷰어, 그리고 **현행성 가드 2차 강화**(프롬프트 의존을 넘어 프로그램적 백스톱 추가) + 프로덕션 UX 마찰 개선.

### ✨ Added
- **조회 이력(최근 조회)** — 열람한 법령·조례·판례를 홈·Cmd+K에서 재조회. 게스트 localStorage / 로그인 Supabase 동기화(`lib/viewing-history-store.ts`, 마이그레이션 011).
- **별지(別紙 제N호서식) 뷰어** — 법령뷰어 본문·AI답변의 "별지 제N호서식" 링크 → 모달 서식 본문(법제처 별표종류 "서식", knd=2). 별표 캐시 키 6자리 정규화.

### 🛡️ 현행성 가드 2차 (개정 전 법령 오답 차단 — 프로그램적 백스톱)
- **무라벨 과거버전 라벨링** (`lib/fc-rag/tool-adapter.ts`) — `get_batch_articles`(efYd 지정)·`get_historical_law` 출력에 `get_law_text`와 동일한 ⚠️ 현행성 경고 주입(라벨 비대칭 제거).
- **quality-evaluator 현행성 백스톱** — 도구 결과에 연혁/시행예정/구법령명 마커가 있는데 답변이 현행성을 미반영하면 marginal 강등 + 경고(→ answer-cache 저장 차단으로 오답 증폭 방지). `forceLastTurn` 경로에도 품질평가 적용.
- **프롬프트 보강** — "시행일 > 오늘 = 시행예정본" 계산 규칙(라벨 유실 집계 출력까지 커버), 판례 인용 시 구(舊) 조문은 "구 「법명」(YYYY 개정 전)"으로 현행과 구분 표기.
- **pre-evidence 즉답 차단** — 무라벨 `search_ai_law` 결과만으로 조문 인용 전 `search_law`/`get_law_text`로 현행 확인 강제.

### 🔧 Fixed — UX
- **판례 재조회** — 조회 이력의 판례가 사건번호를 '법령명'으로 검색해 0건이 되던 버그 → `classification(searchType='precedent')`을 실어 판례 전용 핸들러로 라우팅.
- **타임머신 모바일** — '이력 N건' 토글이 모바일에서 죽어 있던 문제(사이드바가 `hidden sm:flex`) → 모바일 전용 개정이력 오버레이 추가.
- **별표 보기 dead-end** — 번호 없는 "별표 보기"가 빈 모달로 직행하던 문제 → 폴백(첫 별표) 실행하도록 가드 완화.
- **쿼터 메시지** — 내부 기능키(`fc_rag` 등) 노출 → 한글 기능명으로 교체.
- **Cmd+K 키보드 네비** — 즐겨찾기 6개 이상일 때 화살표가 안 보이는 항목을 선택하던 문제 수정.
- **위임 미비 탐지** — 위임 조항 0건인데 "모두 정상"(녹색)으로 표시돼 분석된 듯 오해되던 문구를 중립 표시로 교정.

### ⬆️ Deps
- korean-law-mcp 4.2.x → **4.4.2**, kordoc → **3.5.1** (판례 누락·별표 파서·latency 계측 수정).

## [2.3.0-beta] — 2026-06-10

AI 답변 **현행성(現行性) 가드**. 실사고(소방 질의에 2022년 분법 전 법령 기준 답변) 원인 분석 결과 — ① LLM이 오늘 날짜를 모름 ② "현행 법령 기준" 지침 부재 ③ 도구 미호출 답변이 품질 평가를 통과하는 구멍 ④ 1년 묵은 도구 버전 — 4개를 모두 차단.

### 🛡️ Added — 현행성 가드
- **오늘 날짜(KST) 주입** (`lib/fc-rag/prompts.ts`) — 동적 헤더에 매 질의마다 주입. static 프롬프트에 넣으면 Gemini context cache가 매일 깨지므로 동적 헤더에만 배치.
- **현행 법령 기준 섹션** (static 프롬프트) — 도구 결과의 시행일자·`[현행]`/`[연혁]` 라벨 확인 필수, 연혁/분법/시행예정 감지 시 답변에 명시, "## 근거 법령"에 시행일자 병기, 학습데이터의 옛 법령명·조문번호 사용 금지 (소방 분법 사례 명문화).

### 🔧 Fixed
- **quality-evaluator memory bypass 제거** — 도구 미호출 + 인용 3개 이상이면 marginal을 보장하던 규칙은 개정 전 법령을 그럴듯하게 인용한 환각 답변을 통과시키는 구멍. 역전: 도구 근거 없는 인용은 fail로 강등.
- **vitest 전역 mock 누락 보강** (`vitest.setup.ts`) — `search-normalizer` mock에 `detectAliasesInQuery` 부재로 claude/gemini-engine 테스트 8건이 깨져 있던 문제 수정 (644→652 pass).

### ⬆️ Changed — 의존성 현행화
- **korean-law-mcp `^3.2.1` → `^4.1.1`** — 프로덕션이 semver 제약으로 3.5.x에 묶여 있던 문제 해소. v4의 판례 토큰 74% 감축, verify_citations, 판례 검색 구조화, 법제처 빈 응답 재시도 등 수용. (4.2.0 publish 시 `[현행]`/`[연혁]` 라벨·구 법령명 표기까지 자동 수용)
- **kordoc `^2.2.6` → `^2.9.1`**
- **answer cache 키 v29 → v30** — 옛 프롬프트로 생성된 캐시 답변 즉시 무효화.

## [2.2.0-beta] — 2026-04-15

AI 파이프라인 **관찰성(observability)** 전면 재작성. 질의·답변 본문 없이 개발·품질·비용 신호를 전 엔드포인트에서 수집. 레거시 본문 로거 완전 제거 + 개인정보처리방침 국외이전 고지 반영.

### 🔭 Added — AI Telemetry
- **`ai_telemetry` 신설 테이블** (`supabase/migrations/009_ai_telemetry.sql`) — 본문 없는 집계 관찰성 데이터. RLS 전면 차단(`using (false)`) + service_role만 쓰기. 90일 자동 삭제 크론.
  - 수집: endpoint, BYOK 여부, 세션 익명 해시(30분 윈도우), complexity/queryType/domain 분류, 질의·답변 **길이 버킷**(<50/50-200/200-500/500+), 5단계 latency (total/router/retrieval/generation/verification), 도구 호출 이름·오류, 신뢰도/품질 점수, fast-path 사용 여부, fallback 트리거 여부, verification method 집계, **인용 법령 MST 배열**(공공정보), error_category(원본 메시지 X), 실제 모델 ID, 토큰 수/비용 추정(USD)
  - 저장 금지: 질의/답변 원문, user_id, IP, UA 원본, 도구 인자 — 개인정보 해당 항목 없음 → 별도 동의 불필요
- **`lib/ai-telemetry.ts`** — `recordTelemetry()` + 헬퍼 (`bucketLength`, `classifyUa`, `sessionAnonHash`, `categorizeError`, `estimateCostUsd`). 5개 라우트 공용.
- **전 AI 엔드포인트 연결** — `fc-rag`, `summarize`, `impact-tracker`, `benchmark-analyze`, `impact-analysis`. Vercel serverless fire-and-forget 절단 방지 위해 `finally`에서 `await` 방식.
- **BYOK 요청도 전부 기록** — 기존 로거는 `userId` null로 skip하여 로그 블랙홀이었음. 본문이 없어 약관 개정 불필요하게 전수 관측 가능.

### 🔧 Fixed
- **Gemini Lite 모델 503 대응** — `gemini-3.1-flash-lite-preview` 모델이 Google 쪽에서 과부하 반환. `GEMINI_LITE_MODEL=gemini-3-flash-preview` 환경변수 오버라이드로 `summarize` 500 에러 및 `impact-tracker`의 "AI 미응답 자동 분류" 폴백 현상 해소.
- **`model_id_actual` trailing `\n`** — `vercel env add`에 개행 포함 버그 수정 (`printf` 사용).
- **Vercel serverless fire-and-forget 로그 절단** — JSON 응답 라우트에서 `recordTelemetry`가 응답 flush 후 잘리던 문제. `await` 전환으로 해결.

### 🗑 Removed
- **`ai_query_logs` 테이블 + `delete_my_ai_logs` RPC + 30일 보관 크론** (migration 010) — 본문 저장 리스크 완전 제거.
- **`lib/query-logger.ts`** — Vercel에서 Hermes API로 본문 POST, 로컬에서 `logs/*.jsonl` append하던 레거시. 완전 삭제.
- **`lib/ai-query-logger.ts`** — Supabase `ai_query_logs` 본문 저장 로거. 완전 삭제.
- **fc-rag route의 `logAnswerText`/`logToolCalls` 수집 변수** — 본문 흔적 제거.
- **`model` 필드 `'gemini-flash'` 하드코딩** — 실제 모델 ID(`AI_CONFIG.gemini.primary`/`lite`) 주입.

### 🛡 Legal / Privacy
- **개인정보처리방침 v1.0.0 → v1.1.0** (`components/legal/privacy-content.tsx`, `lib/privacy/consent-versions.ts`)
  - **신설: 국외 이전 고지 배너** — 서비스 진입 상단에 Supabase 일본(Tokyo) 리전 사용 명시
  - **제1항 자동 수집 항목**에 AI 파이프라인 텔레메트리 서브 항목 추가 (본문 미저장 명시)
  - **제3항 보유 기간 표** — 기존 "AI 질의 로그(30일)" → "AI 파이프라인 텔레메트리(90일)"
  - **제6항 처리 위탁 표 확장** — 수탁자별 **이전 국가/리전**과 **이전 방법** 컬럼 신설. Supabase(일본 ap-northeast-1), Vercel(한국 icn1), Google(미국), Cloudflare(글로벌 엣지)
  - **신설 제10항: 국외 이전 요약** — 주 저장소/AI 처리/게이트웨이 구분, 본인 데이터 삭제 경로 안내
  - 개인정보 보호법 제28조의8(개인정보의 국외 이전) 준수

### 🔐 Security
- RLS 4관왕 검증 완료: service_role SELECT/INSERT ✅, anon key INSERT 42501 차단 ✅, 인덱스 6개 정상 생성
- 시크릿 누출 스캔 통과 — `AIzaSy…`, `sk-…`, `sbp_…`, JWT 패턴 신규/수정 파일 전수 검사

### 📊 관찰성으로 즉시 가능해진 분석
- 법령변경영향분석(impact-tracker) 엔드포인트 사용량·latency·에러 분해
- lite 모델 503 시계열
- 도구별 실패율, fast-path 히트율(domain×)
- queryType별 citation 검증 통과율
- 인용 법령 MST 빈도 → 캐싱 우선순위
- 일별 비용 추정(USD) 시계열
- BYOK vs 로그인 사용자 분포 (본문 없이)

### 🧪 검증
- 5개 엔드포인트 parallel smoke test: 전부 HTTP 200 + telemetry row 기록 확인
- Supabase RLS 정책 동작 검증
- `ai_query_logs` DROP 완료 확인
- Gemini API 키 유효성 재검증

---

## [2.1.0-beta] — 2026-04-14

공개 베타 출시. 엔진이 **Gemini 3 Flash 단일 프라이머리**로 정리되고, 일일 쿼터·BYOK·로그 수집 체계가 갖춰졌습니다.

### 🧪 베타 출시
- **공개 도메인**: `lexdiff.gomdori.app` (Cloudflare → Vercel)
- **Google OAuth 로그인 필수** — 미로그인 401
- **Supabase 기반 일일 쿼터** — 유저별 기능별 카운트 (`fc_rag 10/일`, `summarize 30/일`, `impact 5/일`, `benchmark 3/일`)
- **BYOK (Bring Your Own Key)** — 본인 Gemini API 키(`AIzaSy...`) 등록 시 쿼터 무제한, 호출 비용 자부담. 키는 브라우저 로컬에만 저장, 서버 DB에 저장하지 않음 (`x-user-api-key` 헤더로만 전달)
- **익명 쿼리 로그 수집** — `logs/fc-rag-queries.jsonl`에 질문·답변·도구호출·confidence 기록. 품질 튜닝 및 환각 탐지 목적. 개인 식별 정보 미수집
- **법적 고지 배너** — Hero 및 AI 답변 하단에 면책 배너 상시 표출
- **SSE answer 이벤트 면책 자동 주입** — `warnings[0]`에 법률 자문 대체 불가 고지

### 🧠 AI 엔진 전환 (Claude → Gemini)
- **프라이머리**: `gemini-3-flash-preview` — Function Calling 멀티턴 RAG
- **S1 라우터**: `gemini-3.1-flash-lite-preview` — 쿼리 분류 경량 모델 (20% 해시 롤아웃)
- **Hermes/GPT-5.4 경로 비활성** — `DISABLE_HERMES=true` (코드는 유지)
- **46개 등록 도구** — `lib/fc-rag/tool-registry.ts`. 핵심 2개(`search_decisions`/`get_decision_text`)로 17개 결정문 도메인 통합 (precedent/interpretation/tax_tribunal/customs/constitutional/admin_appeal/ftc/pipc/nlrc/acr/appeal_review/acr_special/school/public_corp/public_inst/treaty/english_law)
- **TypeScript 직접 import** — korean-law-mcp 핸들러를 MCP 프로토콜 없이 직접 호출. 오버헤드 제거
- **SSE 스트리밍** — tool_call/tool_result/answer 이벤트 실시간 전달, UI에 도구 호출 과정 표시

### 🎯 품질 튜닝 (FC-RAG)
- **Confidence 공식 재설계** — 분량 편향 제거, 정확성 중심 4신호 기반. Confidence High 판정 1/10 → **10/10**
- **citation verify timeout** 10s → 15s (법제처 느린 응답 대응)
- **MST 환각 차단** — P0-1/2/3 + CHAIN_COVERS 병합, stale MST 제거
- **도구 호출 0회 가드** — `noToolsCalled` 시 confidence=low 강제, 캐시 skip, warning 주입
- **citation recall** 65% → 77%
- **answer-cache + Gemini context caching** — 동일 쿼리 재질의 시 즉답
- **fast-path answer-cache 저장** — P0-0
- **forceLastTurn 재요청** — `cachedTokens` 누적 버그 수정, loop 탈출 가드
- **`callGeminiWithRetry`** — HTTP 429/500/503, `RESOURCE_EXHAUSTED`, `UNAVAILABLE`, `overloaded`, rate-limit 메시지에 지수 백오프 (700→1400→2800ms + jitter). 스트림 중 chunk 에러는 상위 위임
- **결정문 전문 스마트 압축** — 컨텍스트 예산 최적화
- **단일 진실 소스** — `lib/fc-rag/decision-domains.ts` TTL/사이즈/프롬프트/필터 통합

### 🛠 인프라
- **Next.js 16** — `middleware.ts` → `proxy.ts` 마이그레이션. CORS 화이트리스트 echo + CSP nonce + Supabase SSR 세션 리프레시
- **vercel.json `maxDuration`** — `fc-rag=120s`, `impact-tracker=90s`, `summarize=60s`, `benchmark-analyze=60s`. Hobby 10s 기본값 해제
- **Upstash Redis** — 캐시/rate-limit 계층 도입
- **WCAG 2.1 AA** — `aria-live="polite"` 스트리밍 답변 live region, `aria-busy` 진행 표시

### 🎨 UI/UX
- **AI 스트리밍 중지 버튼** — 스트리밍 중 사용자 abort 가능
- **홈 헤더 베타 배지** — 로고 우상단 조용한 `beta` 마크
- **홈 검색창 쿼리 분류** — 엔드포인트 라우팅 정확도 향상
- **Hero 법적 고지 배너** — amber border/bg, `role="note"`

---

## [2.0.0] — 2026-03

### Added
- **Claude CLI subprocess + stream-json** 기반 실시간 SSE (*이후 2.1.0에서 Gemini로 전환*)
- **멀티턴 대화** — 이전 질문 맥락 기억 + pre-evidence 즉답
- **법령 관계 그래프** — Supabase PostgreSQL 기반 시각화 + 영향 분석
- **메타답변 가드** — "법률 상담은 변호사에게" 같은 무의미 답변 차단
- **별표 직접 파싱** — kordoc 연동, HWP/HWPX/PDF를 Gemini Vision 없이 순수 파싱
- **쿼리 확장 엔진** — 자동 확장 + 머징/리랭킹 + 자동완성 연동
- **조례 벤치마킹 도구** — 지자체 간 AI 비교 분석 + 권역 선택 UI
- **667개 테스트** — Vitest 단위·통합·E2E (60개 공무원·법률자문 E2E 포함)

### Changed
- **7차 프로덕션 리뷰** — SSRF 방지, XSS 방어, AbortController, 타입 안전성, 입력 검증 전면 강화
- **데드코드 제거** — 총 -5,600줄

---

## [1.x]

- Anthropic SDK 직접 호출 (Gateway 제거), tool_use 멀티턴 파이프라인
- Claude CLI 스트리밍 stream-json 전환
- PDF 별표 파싱 (pdfjs-dist 포팅, 선 기반 테이블 감지)
- 별표 파서 업그레이드 (구형 HWP 지원 + HWPX 개선)
- AI 비교분석 (포커스 입력 + 지자체 다중선택 벤치마킹)
- 검색 UX (자동완성, 약칭 인식, 검색바 도구 바로가기)
- 질의 로그 시스템 (환경별 분기 + 사용 패턴 분석)
