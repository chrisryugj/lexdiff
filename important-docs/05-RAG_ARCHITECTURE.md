# FC-RAG (Function Calling RAG) 시스템 아키텍처

**현재 메인 기능**: 자연어 질문 → korean-law-mcp 도구 호출 → 실시간 AI 답변 + 법령 인용

> ⚠️ 구 Gemini File Search 방식은 폴백으로만 존재. 메인 엔진은 FC-RAG로 전환됨.

---

## 🏗️ 시스템 구조

```
User Query: "관세법 제38조에서 말하는 수입이란?"
    ↓
[rag-search-input.tsx] 사용자 입력
    ↓
[/api/fc-rag] SSE 스트리밍 엔드포인트
    ↓
┌─────────────────────────────────────┐
│  2-Tier AI 라우팅                    │
│  ┌───────────────────────────────┐  │
│  │ 1순위: OpenClaw Bridge        │  │
│  │   (Claude 기반, OPENCLAW_URL) │  │
│  │   Circuit Breaker 패턴        │  │
│  └──────────┬────────────────────┘  │
│             │ 실패/비활성화 시        │
│  ┌──────────▼────────────────────┐  │
│  │ 2순위: Gemini FC-RAG          │  │
│  │   (gemini-3-flash-preview)    │  │
│  │   Function Calling + MCP 도구 │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
    ↓
[korean-law-mcp tools] 법제처 API 실시간 호출
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
  | { type: 'citation_verification'; citations: VerifiedCitation[] }
  | { type: 'source'; source: 'openclaw' | 'gemini' }
  | { type: 'error'; message: string }
```

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

### 3. 도구 티어 시스템

| Tier | 활성 조건 | 도구 수 | 예시 |
|------|----------|---------|------|
| **Tier 0** | 항상 | 10 | search_ai_law, search_law, get_law_text, search_precedents 등 |
| **Tier 1** | 도메인 감지 시 | 13개 도메인 | 세금→조세심판, 관세→관세해석, 노동→노동위원회 등 |
| **Tier 2** | 컨텍스트 감지 시 | 12 | get_three_tier, get_article_history, compare_old_new 등 |
| **Tier 3** | 온디맨드 | 19 | 법률용어, 유사판례, 영문법령 등 |

**도메인 자동 감지** (`lib/fc-rag/tool-tiers.ts`):
- 13개 도메인: tax, customs, labor, privacy, competition, constitutional, admin, public_servant, housing, environment, construction, civil_service, general

### 4. 질의 유형별 프롬프트

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

### 5. 인용 검증 시스템

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
| `app/api/fc-rag/route.ts` | SSE 스트리밍 엔드포인트 (메인) |
| `lib/fc-rag/engine.ts` | RAG 실행 엔진 (executeRAGStream) |
| `lib/fc-rag/tool-adapter.ts` | korean-law-mcp 도구 어댑터 |
| `lib/fc-rag/prompts.ts` | 8가지 질의유형별 시스템 프롬프트 |
| `lib/fc-rag/tool-tiers.ts` | 도구 선택 (Tier 0/1/2/3) |
| `lib/fc-rag/citations.ts` | 인용 추출 |
| `lib/fc-rag/fast-path.ts` | 단순 질의 바이패스 (법령명+조문번호) |
| `lib/fc-rag/result-utils.ts` | 도구 결과 요약 |

### OpenClaw Bridge
| 파일 | 역할 |
|------|------|
| `lib/openclaw-client.ts` | Bridge 클라이언트 (Circuit Breaker, Health Check) |

### 인용 검증 & 후처리
| 파일 | 역할 |
|------|------|
| `lib/citation-verifier.ts` | AI 인용 조문 실존 검증 |
| `lib/ai-answer-processor.ts` | Markdown → HTML 변환 (이모지→아이콘, 섹션 헤더) |
| `lib/ai-law-inference.ts` | 법령명 추론 |

### UI 컴포넌트
| 파일 | 역할 |
|------|------|
| `components/rag-search-input.tsx` | RAG 검색 입력 |
| `components/law-viewer-ai-answer.tsx` | AI 답변 표시 + 사이드바 |
| `components/ai-answer-loading.tsx` | 로딩 상태 |
| `components/ai-gate-dialog.tsx` | 비밀번호 게이트 |
| `components/ai-summary-dialog.tsx` | 요약 생성 다이얼로그 |

### 캐시 & 모니터링
| 파일 | 역할 |
|------|------|
| `lib/rag-response-cache.ts` | 응답 캐시 (LRU, 24시간 TTL) |
| `lib/usage-tracker.ts` | API 사용량/쿼터 추적 (IP별 일일 제한) |
| `lib/trace-logger.ts` | OpenClaw vs Gemini 라우팅 추적 |

---

## ⚡ 성능 최적화

| 전략 | 설명 |
|------|------|
| **Fast Path** | 단순 `법령명 + 조문번호` 질의 → Gemini 멀티턴 스킵 |
| **KNOWN_MST 캐시** | 런타임 법령 MST 캐시 (최대 5000건) |
| **응답 캐시** | 동일 쿼리+인용 LRU 캐시 (24시간 TTL) |
| **도구 결과 캐시** | API별 캐시 (3시간~24시간) |
| **Circuit Breaker** | OpenClaw 장애 시 5회 실패 → 2분 차단 후 자동 복구 |

---

## 🔧 환경변수

| 변수 | 용도 | 필수 |
|------|------|------|
| `GEMINI_API_KEY` | Google Gemini API 키 | ✅ |
| `GEMINI_MODEL` | 모델 선택 (기본: gemini-3-flash-preview) | ❌ |
| `LAW_OC` | 법제처 API 키 (korean-law-mcp) | ✅ |
| `OPENCLAW_ENABLED` | Bridge 활성화 (true/false) | ❌ |
| `OPENCLAW_URL` | OpenClaw Bridge URL | OPENCLAW_ENABLED=true 시 |
| `OPENCLAW_API_TOKEN` | Bridge 인증 토큰 | OPENCLAW_ENABLED=true 시 |
| `CF_ACCESS_CLIENT_ID` | Cloudflare Access | ❌ |
| `CF_ACCESS_CLIENT_SECRET` | Cloudflare Access | ❌ |

---

## 🚨 자주 발생하는 버그

1. **AI 답변 잘림**: SSE buffer 루프 종료 후 잔여 처리 누락
2. **Progress 즉시 사라짐**: 조건문에 `!analysis` 포함
3. **Modal 열리지만 빈 화면**: XML/JSON 파싱 혼동
4. **인코딩 깨짐**: curl 사용 시 한글 깨짐 (브라우저는 정상)
5. **OpenClaw 타임아웃**: 90초 초과 시 Gemini 폴백 미작동 → Circuit Breaker 확인

---

## 📊 구 시스템과 비교

| 항목 | 구 (File Search) | 현재 (FC-RAG) |
|------|------------------|---------------|
| **그라운딩** | Gemini File Search API | korean-law-mcp Function Calling |
| **데이터 소스** | 사전 인덱싱된 법령 DB | 법제처 API 실시간 호출 |
| **커버리지** | 인덱스된 법령만 | 모든 법령+해석례+판례+조례 |
| **인용** | File Search 청크 | 도구 결과 + 수동 추출 + 사후 검증 |
| **폴백** | 없음 | OpenClaw → Gemini 2-tier 라우팅 |

---

**버전**: 2.0 | **업데이트**: 2026-03-15
