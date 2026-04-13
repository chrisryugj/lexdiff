# LexDiff

**법령을 쉽게. AI로 똑똑하게.**

[![Live](https://img.shields.io/badge/Live-lexdiff.vercel.app-1a2b4c)](https://lexdiff.vercel.app)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript 5](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Claude Sonnet 4.6](https://img.shields.io/badge/Claude-Sonnet_4.6-cc785c?logo=anthropic)](https://anthropic.com)
[![667 Tests](https://img.shields.io/badge/Tests-667-green)](https://vitest.dev)

> *"관세법 38조가 뭐야?" — 이런 질문을 검색창에 치면, AI가 법령·판례를 직접 찾아서 근거와 함께 답합니다.*

<p align="center">
  <img src="demo/out/lexdiff-demo.gif" alt="LexDiff Demo" width="720" />
</p>

<p align="center">
  <a href="https://lexdiff.vercel.app"><strong>lexdiff.vercel.app</strong></a>
</p>

---

## 💡 LexDiff로 무엇을 할 수 있나요?

일상 언어로 법률을 질문하면 AI가 **법령 원문과 판례를 근거로** 답합니다. 단순 검색이 아닙니다.

* **🧠 AI 법률 검색** — "퇴직금 못 받았는데 어떻게 해야 하나요?" → Claude가 법제처 API에서 법령·판례를 직접 조회하고, 근거와 함께 실시간 스트리밍 답변. 후속 질문도 맥락을 기억합니다.
* **⚡ 신구조문 비교** — 개정 전후 변경점을 색깔로 하이라이팅. AI가 "뭐가 바뀌었는지" 한 줄로 요약해줍니다.
* **📋 3단 위임법령 비교** — 법률 → 시행령 → 시행규칙을 한 화면에서 나란히 대조. 위임 조항끼리 자동 연결.
* **🔍 법령 영향 추적기** — 법이 바뀌면 어디까지 영향이 가는지 자동 분석. 상위법 → 시행령 → 시행규칙 → 관련 조례까지 연쇄 영향을 추적하고, AI가 심각도(위험/검토/참고)를 분류해줍니다.
* **🏛️ 조례 벤치마킹** — "출산장려금 조례"를 전국 지자체에서 한번에 검색. 우리 구 vs 옆 구 조례를 AI가 비교 분석해서 "뭐가 다른지" 표로 정리해줍니다.
* **🔗 위임 미비 탐지기** — "대통령령으로 정한다"고 써놨는데 정작 시행령이 없는 조항을 자동으로 찾아냅니다. 입법 공백을 한눈에 파악.
* **⏪ 타임머신** — 날짜를 선택하면 그 시점의 법령 원문을 보여줍니다. 현행법과 나란히 놓고 뭐가 바뀌었는지 비교. 중간 개정 이력도 클릭 한 번으로 이동.
* **📖 판례·해석례 통합** — 대법원 판례, 법제처 해석례, 조세심판원 재결례, 관세청 해석을 한 곳에서 검색.
* **🏠 자치법규 검색** — 전국 17개 시도 + 226개 시군구 조례/규칙 통합 검색.
* **📎 위임법령 추적** — 조문별 행정규칙(고시/훈령)을 자동 연결. 법령 간 관계를 그래프로 시각화.

---

## v2.0.0 변경사항

- **AI 엔진 전환** — Claude CLI subprocess + stream-json 기반 실시간 SSE 스트리밍. 중간 도구 호출 과정이 UI에 실시간 표시.
- **멀티턴 대화** — 이전 질문 맥락을 기억하는 후속 질문 지원. pre-evidence 즉답으로 응답 속도 개선.
- **법령 관계 그래프** — Supabase PostgreSQL 기반 법령 간 관계 시각화 + 영향 분석.
- **메타답변 가드** — "법률 상담은 변호사에게" 같은 무의미 답변 차단. 60개 공무원·법률자문 E2E 테스트.
- **별표 직접 파싱** — kordoc 연동으로 HWP/HWPX/PDF 별표를 Gemini Vision 없이 순수 파싱. 비용 제로.
- **쿼리 확장 엔진** — 법령 검색 자동 확장 + 머징/리랭킹 + 자동완성 연동.
- **벤치마킹 도구** — 지자체 간 조례 비교 분석 + AI 요약 + 권역 선택 UI.
- **7차 프로덕션 리뷰** — SSRF 방지, XSS 방어, AbortController, 타입 안전성, 입력 검증 전면 강화. 총 -5,600줄 데드코드 제거.
- **667개 테스트** — Vitest 기반 단위·통합·E2E 테스트.

<details>
<summary>v1.x 주요 기능</summary>

- **Anthropic SDK 직접 호출** — Gateway 제거, tool_use 멀티턴 파이프라인.
- **Claude CLI 스트리밍** — stream-json 전환으로 중간 도구 호출 실시간 전달.
- **PDF 별표 파싱** — pdfjs-dist 포팅, 선 기반 테이블 감지.
- **별표 파서 업그레이드** — 구형 HWP 지원 + HWPX 개선.
- **AI 비교분석** — 포커스 입력 + 지자체 다중선택 벤치마킹.
- **검색 UX** — 자동완성, 약칭 인식, 검색바 도구 바로가기.
- **질의 로그 시스템** — 환경별 분기 + 사용 패턴 분석.

</details>

---

## 누구를 위한 건가요?

- **공무원·지자체 담당자** — 상위법령-조례 위임 관계 추적, 조례 개정 시 상위법 변경사항 확인
- **관세사·무역 전문가** — 관세법 3단 비교, 관세청 해석례, HS코드 분류 기준
- **세무사·변호사** — 세법 개정 영향 분석, 조세심판원 재결례, 법령해석례

---

## 빠른 시작

```bash
git clone https://github.com/chrisryugj/lexdiff.git
cd lexdiff
pnpm install
cp .env.local.example .env.local   # API 키 설정
pnpm dev                            # http://localhost:3000
```

**필수**: Node.js 20+, pnpm

### 환경 변수

```bash
ANTHROPIC_API_KEY=       # Claude Sonnet 4.6
LAW_OC=                  # 법제처 Open API 키 (무료)
SUPABASE_URL=            # Supabase 프로젝트 URL
SUPABASE_ANON_KEY=       # Supabase 익명 키
```

---

## 아키텍처

```
사용자 질문
  ↓
Claude Sonnet 4.6 (CLI subprocess, stream-json)
  ↓ MCP 도구 호출
법제처 API (73개 엔드포인트)  ←→  korean-law MCP
  ↓
실시간 SSE 스트리밍 → UI
```

| 레이어 | 스택 |
|--------|------|
| **프론트엔드** | React 19, Tailwind v4, shadcn/ui, Framer Motion |
| **백엔드** | Next.js 16 API Routes, Zod validation |
| **AI** | Claude Sonnet 4.6 (primary), Gemini Flash (fallback), MCP tool use |
| **데이터** | 법제처 Open API, Supabase PostgreSQL, IndexedDB cache |
| **테스트** | Vitest, 667 tests |

---

## 프로젝트 구조

```
app/api/          73개 API 라우트 (법령, 판례, AI RAG, 비교...)
components/       법령 뷰어, 검색, 모달, 판례 패널
lib/              핵심 로직 (링크 생성, 법령 파서, AI 엔진)
hooks/            React 훅 (법령 뷰어, 검색, 판례)
demo/             Remotion 인트로 영상 소스
```

---

## 기술 스택

Next.js 16 · React 19 · TypeScript 5 · Tailwind CSS v4 · shadcn/ui · Radix UI ·
Claude Sonnet 4.6 · Gemini 2.5 Flash · korean-law MCP · Supabase · Turso/LibSQL ·
IndexedDB · Vitest · Framer Motion

## 라이선스

**Business Source License 1.1 (BSL-1.1)**

이 프로젝트는 [BSL-1.1](LICENSE) 라이선스가 적용됩니다.

- ✅ 비프로덕션(개발, 테스트, 평가 등) 용도로만 사용 가능합니다.
- ❌ **프로덕션 환경에서의 사용(상업적 이용 포함)은 금지됩니다.**
- 🕒 **전환 일자(Change Date, 2030-04-14)** 이후에는 `Apache License 2.0`으로 자동 전환됩니다.

라이선스 관련 특수한 문의가 필요하시다면 [GitHub Issues](https://github.com/chrisryugj/lexdiff/issues)를 이용해주세요.

---

<sub>Made by 류주임 @ 광진구청 AI동호회 AI.Do</sub>
