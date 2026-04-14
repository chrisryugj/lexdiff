# Changelog

LexDiff의 주요 변경사항을 기록합니다. 형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)을 따르며, 버전은 [Semantic Versioning](https://semver.org/lang/ko/)을 사용합니다.

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
