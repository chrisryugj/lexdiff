# LexDiff

**법령을 쉽게. AI로 똑똑하게. 공공 Legal AI의 시작.**

[![Live](https://img.shields.io/badge/Live-lexdiff.gomdori.app-1a2b4c)](https://lexdiff.gomdori.app)
[![Version](https://img.shields.io/badge/version-2.1.0--beta-b08d57)](CHANGELOG.md)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript 5](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Gemini](https://img.shields.io/badge/AI-Gemini_3_Flash-4285F4?logo=google)](https://deepmind.google/technologies/gemini/)
[![License: BSL 1.1](https://img.shields.io/badge/License-BSL_1.1-blue)](LICENSE)

> *구글링으로 30분, GPT로 환각, LexDiff로 30초 — 법령·판례 근거까지.*

<p align="center">
  <img src="demo/out/lexdiff-demo.gif" alt="LexDiff Demo" width="720" />
</p>

<p align="center">
  <a href="https://lexdiff.gomdori.app"><strong>lexdiff.gomdori.app</strong></a>
</p>

---

## 💡 LexDiff로 무엇을 할 수 있나요?

일상 언어로 법률을 질문하면 AI가 **법령 원문과 판례를 근거로** 답합니다. 단순 검색이 아닙니다.

* **🧠 AI 법률 검색** — "퇴직금 못 받았는데 어떻게 해야 하나요?" → Gemini가 법제처 API에서 법령·판례를 직접 조회하고, 근거와 함께 실시간 스트리밍 답변. 후속 질문도 맥락을 기억합니다.
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

## 🧪 베타 안내 (v2.1.0)

LexDiff는 현재 **공개 베타**입니다. Google 계정 로그인 후 누구나 무료로 사용할 수 있습니다.

### 무료 사용 쿼터 (로그인 사용자 기준, 일일)

| 기능 | 무료 한도 |
|------|----------|
| AI 법률 검색 (`fc_rag`) | **5회/일** |
| AI 요약 (`summarize`) | 10회/일 |
| 법령 영향 추적 (`impact`) | 5회/일 |
| 조례 벤치마킹 (`benchmark`) | 5회/일 |

한도 초과 시 자정(KST) 리셋까지 대기하거나 **BYOK**로 무제한 사용 가능합니다.

### 🔑 BYOK (Bring Your Own Key)

본인 **Google AI Studio API 키**를 등록하면 쿼터 제한 없이 사용할 수 있습니다. 호출 비용은 본인 Google 계정에서 직접 청구됩니다.

- 등록 방법: 설정 → API 키 → Gemini API Key 입력
- 키 형식: `AIzaSy...` (39자, Google AI Studio 발급)
- 저장 위치: **브라우저 로컬 스토리지** — 서버 DB에 저장하지 않습니다. 요청 헤더(`x-user-api-key`)로만 전달
- 발급: [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (무료)

### 📊 로그 수집 안내

베타 품질 개선을 위해 **익명화된 쿼리 로그**를 수집합니다.

- **수집 항목**: 질문 텍스트, AI 답변, 호출된 도구 목록, 응답 시간, confidence 점수, 에러 발생 여부
- **수집하지 않는 항목**: Google 계정 정보, 이메일, 실명, BYOK API 키, 브라우저 핑거프린팅
- **저장 위치**: `logs/fc-rag-queries.jsonl` (서버 로컬 + 관리자 대시보드)
- **용도**: RAG 파이프라인 튜닝, 환각 탐지, 도구 호출 실패 원인 분석
- **보존**: 베타 기간 중 무기한, 정식 출시 후 정책 재공지

민감한 개인정보가 포함된 질문은 피해주시고, 수집을 원치 않으시면 BYOK 모드로 사용하세요 (BYOK 사용 시에도 품질 로그는 수집되나, 식별자 연결은 이루어지지 않습니다).

---

## 누구를 위한 건가요?

- **공무원·지자체 담당자** — 상위법령-조례 위임 관계 추적, 조례 개정 시 상위법 변경사항 확인
- **관세사·무역 전문가** — 관세법 3단 비교, 관세청 해석례, HS코드 분류 기준
- **세무사·변호사** — 세법 개정 영향 분석, 조세심판원 재결례, 법령해석례

> ⚖️ **법적 고지** — LexDiff는 법령 정보 제공을 위한 **참고용 도구**이며, 법률 자문을 대체하지 않습니다. 중요한 법적 판단 전에는 반드시 변호사·법무사 상담을 권장합니다.

---

## 빠른 시작

```bash
git clone https://github.com/chrisryugj/lexdiff.git
cd lexdiff
pnpm install
cp .env.local.example .env.local   # API 키 설정
pnpm dev                            # http://localhost:3000
```

**필수**: Node.js 20+, pnpm 10+

### 환경 변수

```bash
GEMINI_API_KEY=          # Google AI Studio (Gemini 3 Flash) — 필수
GEMINI_ROUTER_API_KEY=   # S1 Router 전용 분리 키 (Gemini 3.1 Flash-Lite)
LAW_OC=                  # 법제처 Open API 키 (무료)
SUPABASE_URL=            # Supabase 프로젝트 URL
SUPABASE_ANON_KEY=       # Supabase 익명 키 (쿼터 관리용)
UPSTASH_REDIS_REST_URL=  # 캐시/rate-limit
UPSTASH_REDIS_REST_TOKEN=
```

---

## 🧭 왜 Verbatim RAG인가?

LexDiff를 만들며 벡터 청크 RAG와 그래프 RAG를 모두 검토했지만, 결국 **Verbatim RAG**(전문주입형)를 택했습니다. AI가 Function Calling으로 법제처 API를 실시간 호출해, **조문 원문을 글자 그대로** 주입하는 방식입니다. 개인적으로는 법률 도메인에선 이 접근이 가장 정직하다고 믿고 있습니다.

### 청크 기반 벡터 RAG를 피한 이유

- **쪼개면 의미가 흔들립니다** — "전항의 경우", "다만 ..." 같은 단서·참조 구조가 청크 경계에서 끊기면 의미가 반대로 뒤집히는 경우를 자주 봤습니다.
- **환각이 걱정됐습니다** — 유사 청크가 섞이면 *산업안전보건법 38조*를 *관세법 38조*로 착각할 수 있고, 법률에선 이런 혼동을 감당하기 어렵습니다.
- **개정 추적이 까다롭습니다** — 벡터 유사도만으로 "지금 이 순간의 현행 조문"을 보장하기는 쉽지 않았습니다.
- **재인덱싱 부담** — 매일 개정되는 법령·조례·판례를 계속 재임베딩하는 운영 비용이 현실적으로 맞지 않았습니다.

### 그래프 RAG도 접은 이유

법령은 이미 **법제처가 관리하는 잘 짜인 그래프**에 가깝습니다 — 법률↔시행령↔시행규칙 위임, 조문↔판례 인용, 개정 이력까지요. 이 위에 저희가 별도 그래프를 얹으면 결국 법제처 원본보다 뒤처지기 마련이고, 오차가 누적될수록 원문성(原文性)이 흐려진다고 느꼈습니다. 그래서 자체 그래프를 만드는 대신, **법제처 API 자체를 그래프 인터페이스로 쓰는** 쪽을 택했습니다.

### 그래서 Verbatim RAG로

- **원자성** — 조/항/호 단위 원문이 잘리지 않은 채 그대로 주입됩니다
- **항상 최신** — 법제처가 단일 진실 소스라 재인덱싱이 필요 없습니다
- **추적 가능한 근거** — citation verify가 답변을 실제 원문과 대조합니다
- **Agentic 다단계 추론** — "판례 → 인용 법령 → 현행 조문" 체인을 LLM이 46개 도구로 직접 따라갑니다

> 적어도 법률 도메인에서는, RAG가 "검색엔진 + LLM"이기보다 **"법제처 API를 손에 든 법률 리서처"** 에 가까워야 한다고 생각합니다.

---

## 아키텍처

```
사용자 질문
  ↓
Google OAuth + Supabase 일일 쿼터 체크 (BYOK면 skip)
  ↓
S1 Router (Gemini 3.1 Flash-Lite) — 20% 해시 롤아웃
  ↓
Gemini 3 Flash — Function Calling RAG 루프 (멀티턴)
  ↓ 도구 호출 (TypeScript 직접 import, MCP 래핑 없음)
법제처 Open API + 17개 결정문 도메인 + Supabase 법령 그래프
  ↓
실시간 SSE 스트리밍 (tool_call/tool_result/answer) → UI
  ↓
citation verify (15s) + confidence 판정 (4신호) + answer cache
```

| 레이어 | 스택 |
|--------|------|
| **프론트엔드** | React 19, Tailwind v4, shadcn/ui, Framer Motion |
| **백엔드** | Next.js 16 (proxy.ts), Zod validation, SSE 스트리밍 |
| **AI (primary)** | Gemini 3 Flash (Function Calling) — 46개 등록 도구 |
| **AI (router)** | Gemini 3.1 Flash-Lite (S1 쿼리 분류) |
| **데이터** | 법제처 Open API, Supabase PostgreSQL, Upstash Redis, IndexedDB |
| **테스트** | Vitest, 단위·통합·E2E |

> **참고**: 내부적으로 Hermes Agent API(GPT-5.4) 경로도 구현되어 있으나, **베타에서는 의도적으로 비활성**(`DISABLE_HERMES=true`)되어 Gemini 단일 엔진으로 운영됩니다.

---

## 프로젝트 구조

```
app/api/          API 라우트 (법령, 판례, AI RAG, 비교...)
components/       법령 뷰어, 검색, 모달, 판례 패널
lib/              핵심 로직 (링크 생성, 법령 파서, FC-RAG 엔진)
  fc-rag/         Function Calling RAG — tool-registry, engine, confidence
  quota.ts        일일 쿼터 체크 (Supabase RPC)
  api-auth.ts     Google OAuth + 쿼터 게이트 + BYOK 분기
hooks/            React 훅 (법령 뷰어, 검색, 판례)
demo/             Remotion 인트로 영상 소스
important-docs/   아키텍처·RAG·시스템 현황 상세 문서
```

---

## 기술 스택

Next.js 16 · React 19 · TypeScript 5 · Tailwind CSS v4 · shadcn/ui · Radix UI ·
**Gemini 3 Flash** · **Gemini 3.1 Flash-Lite** · Supabase · Upstash Redis ·
IndexedDB · Vitest · Framer Motion · Remotion

## 라이선스

**Business Source License 1.1 (BSL-1.1)**

이 프로젝트는 [BSL-1.1](LICENSE) 라이선스가 적용됩니다.

- ✅ 비프로덕션(개발, 테스트, 평가 등) 용도로만 사용 가능합니다.
- ❌ **프로덕션 환경에서의 사용(상업적 이용 포함)은 금지됩니다.**
- 🕒 **전환 일자(Change Date, 2030-04-14)** 이후에는 `Apache License 2.0`으로 자동 전환됩니다.

라이선스 관련 특수한 문의가 필요하시다면 [GitHub Issues](https://github.com/chrisryugj/lexdiff/issues)를 이용해주세요.

---

<sub>Made by 류주임 @ 광진구청 AI동호회 AI.Do</sub>
