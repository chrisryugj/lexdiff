# FC-RAG (Function Calling RAG) 시스템 아키텍처

**현재 메인 기능**: 자연어 질문 → korean-law-mcp 도구 호출 → 실시간 AI 답변 + 법령 인용

---

## 🏗️ 시스템 구조

```
User Query: "관세법 제38조에서 말하는 수입이란?"
    ↓
[검색 입력] → useAiSearch.ts (SSE 소비)
    ↓
[/api/fc-rag] SSE 스트리밍 엔드포인트
    ↓
┌─────────────────────────────────────────────┐
│  2-Tier AI 라우팅                            │
│                                             │
│  ┌────────────────────────────────────────┐ │
│  │ 1순위: Hermes Gateway (GPT-5.4)        │ │
│  │   HTTP fetch + SSE                     │ │
│  │   POST /v1/chat/completions            │ │
│  │   (OpenAI-compatible, stream:true)     │ │
│  │   로컬: http://127.0.0.1:8642          │ │
│  │   Vercel: CF Worker → Quick Tunnel     │ │
│  │           → Hermes (동일 경로)          │ │
│  │   ※ Codex OAuth + MCP는 Hermes가 관리  │ │
│  └──────────┬─────────────────────────────┘ │
│             │ 실패 시                        │
│  ┌──────────▼─────────────────────────────┐ │
│  │ 2순위: Gemini FC-RAG                   │ │
│  │   (gemini-3-flash-preview)             │ │
│  │   Function Calling + MCP 도구 직접호출  │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
    ↓
[korean-law-mcp tools] 법제처 API 실시간 호출
    ↑ Primary 경로에서는 Hermes가 자식 프로세스로 직접 관리
    ↑ Gemini 폴백 경로에서는 lexdiff가 tool-adapter로 직접 호출
    ↓
[SSE Stream] status → tool_call → tool_result → answer → citation_verification
    ↓
[law-viewer-ai-answer.tsx] 답변 표시 + 인용 검증 배지
```

---

## 🔴 핵심 구현 패턴

### 1. SSE 이벤트 타입

```typescript
type FCRAGStreamEvent =
  | { type: 'status'; message: string; progress: number }
  | { type: 'tool_call'; name: string; displayName: string; query?: string }
  | { type: 'tool_result'; name: string; displayName: string; success: boolean; summary: string }
  | { type: 'token_usage'; inputTokens: number; outputTokens: number; totalTokens: number }
  | { type: 'answer'; data: FCRAGResult }
  | { type: 'answer_token'; data: { text: string } }           // Bridge 스트리밍 토큰
  | { type: 'citation_verification'; citations: VerifiedCitation[] }
  | { type: 'source'; source: 'hermes' | 'gemini' }
  | { type: 'error'; message: string }
```

**`answer_token`**: Hermes Gateway SSE 경로(로컬/Vercel 동일)에서 발생. Hermes의 OpenAI-호환 `delta.content` 청크를 그대로 토큰 단위로 전달하여 타이핑 효과 구현. Gemini 경로는 최종 answer만 전송.

### 2. SSE Buffer Handling (CRITICAL)

**파일**: `components/search-result-view/hooks/useSearchHandlers/useAiSearch.ts`

```typescript
let buffer = ''
const chunk = decoder.decode(value, { stream: true })
buffer += chunk

const lines = buffer.split('\n')
buffer = lines.pop() || ''  // 마지막 불완전한 줄 보관

for (const line of lines) {
  if (line.startsWith('data: ')) {
    const parsed = JSON.parse(line.slice(6))
    // 처리...
  }
}
// ⚠️ 루프 종료 후 buffer 잔여 처리 필수!
```

### 3. preEvidence 즉답 모드

**흐름**: 조문 뷰어 → ArticleSuggestions → AI 질의 (preEvidence 포함)

```
LawViewerSingleArticle → ArticleSuggestions
  ↓ onAiQuery(query, preEvidence)
fetch('/api/fc-rag', { query, preEvidence })
  ↓
engine.ts: preEvidence 있으면 fast-path 스킵
  → Claude에게 "MCP 도구 호출 금지, 아래 조문으로 즉답" 지시
  → 도구 호출 0회로 즉시 답변
```

### 4. 도구 티어 시스템

| Tier | 활성 조건 | 도구 수 | 예시 |
|------|----------|---------|------|
| **Tier 0** | 항상 | 9 | search_ai_law, search_law, get_law_text, search_precedents 등 |
| **Tier 1** | 도메인 감지 시 | 16개 도메인 | 세금→조세심판, 관세→관세해석, 노동→노동위원회 등 |
| **Tier 2** | 컨텍스트 감지 시 | 12 | get_three_tier, get_article_history, get_law_system_tree 등 |
| **Tier 3** | 온디맨드 | 20+ | 법률용어, 유사판례, 영문법령, 조문비교 등 |

**도메인 자동 감지** (`lib/fc-rag/tool-tiers.ts`):
- 16개 도메인: tax, customs, labor, privacy, competition, constitutional, admin, public_servant, housing, environment, construction, civil_service, medical, education, finance, military, general

### 5. 질의 유형별 프롬프트

| 유형 | 예시 | 답변 구조 |
|------|------|-----------|
| `definition` | "수입이란?" | 결론 → 본문 → 조문 → 혼동 개념 → 근거법 |
| `requirement` | "신청 자격은?" | 결론 → 결격사유 → 필수항목 → 가점항목 → 실무팁 |
| `procedure` | "신청 절차는?" | 결론(로드맵) → 단계별 → 주의사항 |
| `comparison` | "A vs B?" | 결론 → 비교표 → 상황별 추천 |
| `application` | "적용되나?" | 결론(yes/no+신뢰도) → 요건 체크 → 보충 |
| `consequence` | "위반하면?" | 결론(벌칙) → 구제수단 → 세부사항 |
| `scope` | "얼마나?" | 결론 → 산출 근거 → 시뮬레이션 2건 |
| `exemption` | "면제되나?" | 결론 → 자격 체크 → 신청 방법 |

### 6. 인용 검증 시스템

```
AI 답변 생성 후
    ↓
Citation 추출 (법령명 + 조문번호)
    ↓
law.go.kr eflaw API로 실제 존재 여부 확인
    ↓
verified/unverified 배지 표시
```

---

## 📂 파일 구조

### 코어 RAG 엔진
| 파일 | 역할 |
|------|------|
| `app/api/fc-rag/route.ts` | SSE 스트리밍 엔드포인트 (Hermes Primary → Gemini 폴백) |
| `lib/fc-rag/engine.ts` | RAG 엔진 진입점 (executeClaudeRAGStream / executeGeminiRAGStream re-export) |
| `lib/fc-rag/claude-engine.ts` | **Primary 오케스트레이터** (legacy 네이밍 — 실제 LLM은 Hermes 경유 GPT-5.4) |
| `lib/fc-rag/hermes-client.ts` | Hermes Gateway HTTP/SSE 클라이언트 — `fetch :8642/v1/chat/completions` |
| `lib/fc-rag/tool-adapter.ts` | korean-law-mcp 도구 어댑터 (60+ 도구 등록) |
| `lib/fc-rag/prompts.ts` | 8가지 질의유형별 시스템 프롬프트 |
| `lib/fc-rag/tool-tiers.ts` | 도구 선택 (Tier 0/1/2/3) + 도메인 감지 |
| `lib/fc-rag/citations.ts` | 인용 추출 |
| `lib/fc-rag/fast-path.ts` | 단순 질의 바이패스 (법령명+조문번호, 판례/해석례/별표) |
| `lib/fc-rag/result-utils.ts` | 도구 결과 요약 + 파라미터 보정 |
| `lib/fc-rag/quality-evaluator.ts` | 응답 품질 평가 |

### Hermes Gateway 연동
- 로컬/Vercel 모두 동일한 Hermes Agent API를 사용. lexdiff는 OpenAI-compatible HTTP 클라이언트일 뿐, 별도 Bridge 코드 없음.
- Vercel 환경에서는 `HERMES_API_URL`이 CF Worker → Quick Tunnel → Hermes로 라우팅됨 (lexdiff는 URL만 바뀔 뿐 동일 경로).
- `child_process.spawn`, Claude CLI, stream-json 플래그 모두 코드베이스에 존재하지 않음.

### 인용 검증 & 후처리
| 파일 | 역할 |
|------|------|
| `lib/citation-verifier.ts` | AI 인용 조문 실존 검증 |
| `lib/ai-answer-processor.ts` | Markdown → HTML 변환 (이모지→아이콘, 섹션 헤더) |
| `lib/ai-law-inference.ts` | 법령명 추론 |

### UI 컴포넌트
| 파일 | 역할 |
|------|------|
| `components/search-result-view/hooks/useSearchHandlers/useAiSearch.ts` | AI 검색 SSE 소비 핵심 훅 |
| `components/search-result-view/hooks/useSearchHandlers/index.ts` | 검색 핸들러 오케스트레이터 |
| `components/search-result-view/hooks/useSearchState.ts` | AI/검색 상태 관리 |
| `components/law-viewer.tsx` | 메인 법령/AI 답변 뷰어 (오케스트레이터) |
| `components/law-viewer-ai-answer.tsx` | AI 답변 표시 + 인용 링크 |
| `components/law-viewer/article-suggestions.tsx` | "AI에게 물어보기" 추천 질의 칩 |
| `components/ai-search-loading/index.tsx` | 로딩 상태 (단계별 진행) |
| `components/ai-gate-dialog.tsx` | 비밀번호 게이트 |

### 캐시 & 모니터링
| 파일 | 역할 |
|------|------|
| `lib/rag-response-cache.ts` | 응답 캐시 (LRU, 24시간 TTL) |
| `lib/usage-tracker.ts` | API 사용량/쿼터 추적 (IP별 일일 제한) |
| `lib/trace-logger.ts` | Hermes(Primary) vs Gemini(Fallback) 라우팅 추적 |
| `lib/query-logger.ts` | 질의 로그 기록 (traceId, 도구, 소요시간 등) |

---

## ⚡ 성능 최적화

| 전략 | 설명 |
|------|------|
| **Fast Path** | 단순 `법령명 + 조문번호` 질의 → LLM 멀티턴 스킵, 직접 도구 호출 |
| **preEvidence** | 조문 뷰어에서 이미 가진 데이터 → 도구 호출 0회 즉답 |
| **KNOWN_MST 캐시** | 런타임 법령 MST 캐시 (최대 5000건, 50개 프리로드) |
| **응답 캐시** | 동일 쿼리+인용 LRU 캐시 (24시간 TTL) |
| **도구 결과 캐시** | API별 캐시 (3시간~24시간) |
| **Chain 도구** | 7개 chain 매크로로 다단계 조회를 1턴에 처리 |
| **Hermes 장애 폴백** | Hermes 응답 실패/타임아웃 시 즉시 Gemini FC-RAG로 전환 |

---

## 🔧 환경변수

| 변수 | 용도 | 필수 |
|------|------|------|
| `GEMINI_API_KEY` | Google Gemini API 키 | ✅ (Gemini 폴백) |
| `GEMINI_MODEL` | 모델 선택 (기본: gemini-3-flash-preview) | ❌ |
| `LAW_OC` | 법제처 API 키 (korean-law-mcp) | ✅ |
| `HERMES_API_URL` | Hermes Gateway URL (기본 `http://127.0.0.1:8642`, Vercel은 CF Worker URL) | ✅ |
| `HERMES_API_KEY` | Hermes 게이트웨이 인증 키 | ✅ |
| `HERMES_MODEL` | 모델 식별자 (기본 `hermes-agent`) | ❌ |
| `CF_ACCESS_CLIENT_ID` | Cloudflare Access (Vercel→Tunnel) | Vercel 시 |
| `CF_ACCESS_CLIENT_SECRET` | Cloudflare Access | Vercel 시 |

---

## 🚨 자주 발생하는 버그

1. **AI 답변 잘림**: SSE buffer 루프 종료 후 잔여 처리 누락
2. **source 라벨 오류**: route.ts와 프론트엔드 간 source 값 불일치 ('hermes'/'gemini')
3. **Hermes 타임아웃**: 90초 초과 시 Gemini 폴백 정상 작동 여부 확인
4. **preEvidence 미전달**: article-suggestions → handleAiQuery 시 preEvidence 누락으로 불필요한 도구 호출
5. **레거시 네이밍 혼동**: `claude-engine.ts` / `executeClaudeRAGStream` / `callAnthropicStream`은 이름만 Claude — 실제로는 Hermes Gateway 경유 GPT-5.4. 함수명 보고 Anthropic 직접 호출이라 가정 금지.

---

## 📊 구 시스템과 비교

| 항목 | 구 (File Search) | 현재 (FC-RAG) |
|------|------------------|---------------|
| **그라운딩** | Gemini File Search API | korean-law-mcp Function Calling |
| **데이터 소스** | 사전 인덱싱된 법령 DB | 법제처 API 실시간 호출 |
| **커버리지** | 인덱스된 법령만 | 모든 법령+해석례+판례+조례+행정규칙 |
| **인용** | File Search 청크 | 도구 결과 + 수동 추출 + 사후 검증 |
| **폴백** | 없음 | Hermes(GPT-5.4) → Gemini 2-tier 라우팅 |
| **환경 분기** | 없음 | 로컬/Vercel 동일 (HERMES_API_URL만 변경) |

---

**버전**: 3.1 | **업데이트**: 2026-04-12
