# LexDiff 법령질의 파이프라인 개선안 v2

> 작성일: 2026-02-28 (v2 리팩토링)
> 전제: 미니PC OpenClaw 브릿지 파이프라인이 메인. Gemini FC-RAG는 폴백 전용.
> 목표: Gemini 직통 수준을 뛰어넘는 답변 품질·속도 달성

---

## 1. 현재 아키텍처 (실측 기반)

### 1.1 전체 흐름

```
사용자 질문 (LexDiff Web / Telegram)
    ↓
[LexDiff /api/fc-rag]  ← SSE ReadableStream 이미 구현됨
    ├─ OPENCLAW_ENABLED=true && healthy → fetchFromOpenClaw()
    │   └─ POST /api/legal-query (JSON req/res, 가짜 진행률 이벤트)
    └─ fallback → Gemini executeRAGStream() (실시간 SSE)
         ↓
[Bridge server.mjs :8080] POST /api/legal-query
    ├─ classifyComplexity() + classifyQueryType() + detectDomain()
    ├─ buildFallbackPlan()
    ├─ Phase 1: search_ai_law → parseMstsFromAiSearch()
    ├─ Phase 2: search_law × N (미해결 MST만, Promise.allSettled 병렬)
    ├─ Phase 3: get_batch_articles + search_interpretations (Promise.allSettled 병렬)
    ├─ Phase 4: runAdaptiveTools (budget 기반, Promise.allSettled 병렬)
    ├─ structureEvidence() ← 이미 구현됨 (9개 섹션 분류)
    ├─ buildPrompt() ← JSON 출력 계약 포함
    ├─ runChatCompletion() ← stream: false, 동기 대기
    ├─ parseStructuredAnswer() ← JSON 파싱 (3단계 폴백)
    ├─ assessEvidenceQuality() + confidence 보정
    └─ json(res, 200, result) ← 일괄 JSON 응답
```

### 1.2 기존 코드 현황 (초안에서 오인한 부분 보정)

| 항목 | 초안 기술 | 실제 |
|------|-----------|------|
| structureEvidence | "미사용" | **이미 구현** (line 738-784, 9개 섹션) |
| 프론트엔드 SSE | "없음" | **이미 완비** (useAiSearch: 5종 이벤트 핸들러) |
| Phase 2~3 병렬화 | "직렬" | Phase 2는 `Promise.allSettled` 병렬, Phase 3도 병렬 |
| Budget 관리 | 미언급 | `createLegalBudget()` + `hasRetryBudget()` 구현됨 |
| 도구 캐시 | 미언급 | `toolResultCache` Map (TTL 3분, max 800) 구현됨 |
| 가짜 진행률 | 미언급 | `fetchFromOpenClaw()`에서 3s/7s/12s/20s 타이머로 fake progress |

### 1.3 실측 타임라인

```
[0.0s]  요청 수신 + 분류 (즉시)
[0~5s]  Phase 1: search_ai_law (law.go.kr, 3~5초)
[5~8s]  Phase 2: search_law × N 병렬 (MST resolve, 2~3초)
[8~13s] Phase 3: get_batch_articles + interpretations 병렬 (3~5초)
[13~18s] Phase 4: adaptive tools 병렬 (budget 허용 시, 3~5초)
[18~19s] evidence 구조화 + 프롬프트 조립 (즉시)
[19~30s] OpenClaw Chat Completion (8~12초)
         ├─ HTTP 왕복 + 에이전트 부트 (~2초)
         ├─ LLM 전체 생성 대기 (~5~8초, stream:false)
         └─ JSON 파싱 + 품질 검증 (~1초)
[30s+]  JSON 일괄 응답 → 프론트엔드에서 answer 이벤트 발행
```

**총 레이턴시: 20~35초**
**사용자 체감: 가짜 진행률만 보이고 실제 진행과 무관**

---

## 2. 병목 진단 (우선순위 재정렬)

### 2.1 즉시 해결 가능 (코드 변경만으로)

| ID | 병목 | 근본 원인 | 영향도 |
|----|------|-----------|--------|
| **B1** | JSON 출력 강제 | LLM이 answer+citations+confidence+toolsUsed 전부 JSON으로 생성 → 토큰 낭비 + 파싱 실패 | 품질 **상**, 안정성 **상** |
| **B2** | Evidence 절단 | 조문 2600자, 해석례 2000자 일률 `.slice()` → 핵심 조문 중간 절단 | 품질 **상** |
| **B3** | 가짜 진행률 | 브릿지가 동기 JSON 응답 → 프론트에서 타이머 기반 fake progress → 실제 진행과 불일치 | UX **상** |

### 2.2 구조 변경 필요 (설계 수반)

| ID | 병목 | 근본 원인 | 영향도 |
|----|------|-----------|--------|
| **B4** | Phase 1→2 직렬 의존 | AI검색 결과(MST)가 있어야 Phase 2 시작 가능 → 구조적으로 불가피한 면 있음 | 속도 **중** |
| **B5** | Chat Completion 동기 | stream:false → 전체 생성 완료까지 8~12초 블락 | 속도 **상**, UX **상** |
| **B6** | general 도메인 plan 빈약 | domainMap에 없는 법령 → buildFallbackPlan이 빈 plan 반환 | 품질 **중** |

### 2.3 장기 최적화 (투자 대비 효과 검증 필요)

| ID | 병목 | 비고 |
|----|------|------|
| **B7** | 모델 단일 | GPT 단일 모델 → 복잡 질문에서 추론 깊이 부족. 단, 모델 분기는 A/B 테스트 필수 |
| **B8** | 약칭 사전 미활용 | LAW_ABBREVIATIONS 보강으로 법령명 인식률 향상 가능 |

---

## 3. 개선안 (수술 순서)

### 3.1 [B1] JSON 출력 계약 제거 → Markdown 직접 생성

**왜 1순위인가**: 이 하나의 변경이 품질·안정성·비용 세 마리 토끼를 잡는다.

**현재 문제 (server.mjs buildPrompt, line 582-591)**:
```javascript
// 프롬프트 말미에 JSON 출력 계약 삽입
'## 출력 계약 (중요)',
'최종 출력은 반드시 JSON 객체 하나만 반환. 코드블록 금지.',
'{',
'  "answer": "마크다운 본문",',
'  "citations": [...]',
// ... 400자 이상의 JSON 스키마 명세
```

**문제의 심각성**:
1. LLM 출력 토큰의 30~40%가 JSON 구조(key, bracket, 중복 메타)에 소비됨
2. `citations`과 `toolsUsed`는 **브릿지가 이미 수집 완료한 데이터** → LLM이 재구성하면 오히려 틀림
3. `confidenceLevel`은 LLM 자가 평가 → 이미 `assessEvidenceQuality()` (line 1506)가 로직 기반으로 판단
4. JSON 파싱 실패 시 `tryParseJsonObject()` (line 1744)의 3단계 폴백으로 복구 시도 → 그래도 실패 시 전체 응답 손실

**변경 내용**:

```javascript
// buildPrompt: JSON 출력 계약 부분 제거
// 대신 이렇게 끝냄:
`## 사용자 질문\n${query}`
// 끝. LLM은 순수 Markdown만 생성.

// 요청 핸들러 (line ~230):
// 기존
const structured = parseStructuredAnswer(rawText, complexity, queryType);
// 변경
const result = {
  ok: true,
  answer: rawText.trim(),                                    // LLM 출력 그대로
  citations: legal.citations,                                 // 브릿지가 수집한 것
  confidenceLevel: assessConfidence(legal),                   // 로직 판단
  complexity,
  queryType,
  source: 'openclaw',
  toolsUsed: legal.toolsUsed,                                // 브릿지가 수집한 것
};
```

**삭제 가능 코드**: `parseStructuredAnswer()`, `tryParseJsonObject()`, `unwrapAnswerPayload()`, `normalizeConfidence()` (약 80줄)

**`assessConfidence()` 신규 함수** (기존 `assessEvidenceQuality` 확장):

```javascript
function assessConfidence(legal) {
  const { citations, toolsUsed } = legal;
  const q = assessEvidenceQuality(citations);
  // high: 법률 조문 2+ 인용, 고유 법령 1+
  if (q.pass && q.count >= 3 && q.hasBaseLaw) return 'high';
  // medium: 기본 충족
  if (q.pass) return 'medium';
  // low: 미충족
  return 'low';
}
```

**리스크**: 낮음. Markdown 출력은 JSON보다 LLM이 훨씬 안정적으로 생성. 프론트엔드는 `answer` 필드만 렌더링하므로 호환성 문제 없음.

**롤백**: buildPrompt에 JSON 계약 다시 추가 + parseStructuredAnswer 복원 (git revert).

**검증 방법**: 동일 질문 10개를 변경 전/후로 실행 → 답변 길이, 조문 인용 수, 응답 시간 비교.

---

### 3.2 [B2] Evidence 절단 개선 — 조문 단위 Smart Truncation

**현재 (server.mjs line 985)**:
```javascript
evidenceParts.push(`[조문조회: ${lawName}]\n${item.r.text.slice(0, 2600)}`);
```

문제: `slice(0, 2600)`은 조문 중간을 자름. 「관세법」 제30조(과세가격의 결정) 본문이 2000자인데, 뒤이어 나오는 제31조가 600자 지점에서 잘리면 → LLM이 불완전한 조문을 근거로 답변.

**법률 도메인에서 이것이 치명적인 이유**:
- 법률 답변의 정확도는 **조문 원문의 완전성**에 직접 비례
- 조문 제1항은 원칙, 단서(다만~)는 예외 → 단서가 잘리면 원칙만 답변 = **오답**
- 해석례는 "결정요지"가 핵심인데, 뒤쪽에 위치하여 자주 잘림

**변경 내용**:

```javascript
const EVIDENCE_LIMITS = {
  articles: 4000,       // 2600 → 4000 (조문은 최우선 근거)
  aiSearch: 2000,       // 유지 (개요 성격)
  searchLaw: 1200,      // 유지
  interpretations: 2500, // 2000 → 2500
  adaptive: 2000,       // 유지
};

// 조문 단위 truncation (slice 대체)
function truncateByArticle(text, maxChars) {
  // klaw-direct 조문 포맷: 【법령명 제N조(제목)】\n내용
  const articles = text.split(/(?=【)/);
  let result = '';
  let included = 0;
  for (const article of articles) {
    if (result.length + article.length > maxChars) {
      const remaining = articles.length - included;
      if (remaining > 0) {
        result += `\n[... ${remaining}개 조문 생략]`;
      }
      break;
    }
    result += article;
    included++;
  }
  return result || text.slice(0, maxChars); // 포맷 불일치 시 폴백
}
```

**리스크**: 낮음. evidence 총량 증가로 입력 토큰 10~15% 증가 (B1의 출력 토큰 절감으로 상쇄).

**롤백**: 상수값을 원래대로 복원, truncateByArticle → slice 복원.

---

### 3.3 [B3+B5] 브릿지 SSE 스트리밍 + Chat Completion 스트리밍

**핵심 인사이트**: 프론트엔드는 이미 SSE를 완벽히 지원한다.

- `useAiSearch.ts` (line 119-150): SSE parser + 잔여 버퍼 처리 구현 완료
- `/api/fc-rag/route.ts` (line 54-99): `ReadableStream` + `text/event-stream` 구현 완료
- 5종 이벤트 핸들러: `status`, `tool_call`, `tool_result`, `token_usage`, `answer`
- 현재 OpenClaw 경로만 **가짜 진행률**(3초/7초/12초/20초 타이머)로 우회 중

**변경이 필요한 곳은 2곳뿐**:

#### A. `server.mjs` — JSON 응답 → SSE 스트림 응답

```javascript
// 현재: json(res, 200, result);
// 변경: SSE 스트림

function startSSE(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',  // nginx/cloudflare 버퍼링 방지
  });
  return (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
}

// 파이프라인 각 단계에서:
const send = startSSE(res);
send({ type: 'status', message: '법령 검색 중...', progress: 10 });

const aiResult = await callTool('search_ai_law', ...);
send({ type: 'tool_result', name: 'search_ai_law', displayName: 'AI 법령 검색',
       success: !!aiResult, summary: summarizeAiResult(aiResult) });

// ... 각 Phase마다 tool_result 이벤트 발행 ...

// Chat completion 스트리밍
send({ type: 'status', message: '답변 생성 중...', progress: 70 });
for await (const chunk of runChatCompletionStream({ sessionKey, prompt })) {
  if (chunk.type === 'partial') {
    send({ type: 'partial_answer', text: chunk.text });
  }
}
send({ type: 'answer', data: finalResult });
res.end();
```

#### B. `openclaw-client.ts` — 동기 JSON fetch → SSE 파싱

```typescript
// 현재: const resp = await fetch(url, { method: 'POST', body: JSON.stringify({...}) });
//       const result = await resp.json();
//       send({ type: 'answer', data: { ... } });

// 변경: SSE 파싱 (프론트엔드 useAiSearch와 동일 패턴)
const resp = await fetch(url, {
  method: 'POST',
  headers: { ... },
  body: JSON.stringify({ query, userId, conversationId }),
  signal: options?.abortSignal,
});

const reader = resp.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n\n');
  buffer = lines.pop() || '';
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const event = JSON.parse(line.slice(6));
    send(event);  // 브릿지 이벤트를 그대로 프론트엔드에 전달 (프록시)
  }
}
// 잔여 버퍼 처리
if (buffer.startsWith('data: ')) {
  send(JSON.parse(buffer.slice(6)));
}
```

**가짜 진행률 타이머 제거**: `setInterval` 기반 fake progress 코드 삭제.

#### C. `runChatCompletionStream()` — stream: true

```javascript
async function* runChatCompletionStream({ sessionKey, prompt }) {
  const resp = await fetch(`${OPENCLAW_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-openclaw-agent-id': OPENCLAW_AGENT_ID,
      'x-openclaw-session-key': sessionKey,
    },
    body: JSON.stringify({
      model: OPENCLAW_CHAT_MODEL,
      stream: true,
      user: sessionKey,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Chat completion failed: ${resp.status} ${text}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue;
      try {
        const chunk = JSON.parse(trimmed.slice(6));
        const text = chunk.choices?.[0]?.delta?.content || '';
        if (text) {
          fullText += text;
          yield { type: 'partial', text };
        }
      } catch { /* skip malformed chunk */ }
    }
  }
  yield { type: 'done', text: fullText };
}
```

**효과**:
- 사용자 체감 TTFB: **30초 → 2~3초** (첫 tool_result 이벤트까지)
- LLM 답변 첫 글자 표시: 법령 수집 완료 후 **1~2초**
- 총 처리 시간: 변화 없지만, **진행 상황이 실시간으로 보임**

**리스크**: 중간. SSE 변환은 서버+클라이언트 양쪽 수정. Cloudflare Tunnel 버퍼링 확인 필요.

**Cloudflare Tunnel 대응**:
- `cloudflared` 설정에 `--no-chunked-encoding` 추가
- 또는 응답 헤더 `X-Accel-Buffering: no` (이미 포함)
- 실패 시: SSE 폴백으로 기존 JSON 동기 방식 유지 (Accept 헤더로 분기)

**폴백 전략**: Accept 헤더 기반 분기

```javascript
// server.mjs
const wantsSSE = req.headers.accept?.includes('text/event-stream');
if (wantsSSE) {
  // SSE 스트리밍
} else {
  // 기존 JSON 응답 (하위 호환)
}
```

**롤백**: openclaw-client에서 Accept 헤더 제거하면 자동으로 JSON 모드 복귀.

---

### 3.4 [B6] AI 검색 결과 역류 — Plan 보강

**현재 흐름**:
```
buildFallbackPlan(query) → heuristic plan (domainMap 기반)
                                ↓
Phase 1: search_ai_law  → MST 파싱만 활용
                                ↓
Phase 2: resolve        → heuristic plan의 법령만 resolve
```

**문제**: "건축법상 건축허가 취소 요건"처럼 domainMap에 없는 법령은 heuristic plan이 빈 plan 반환. search_ai_law가 건축법 제11조를 찾아도 plan에 반영 안 됨.

**변경 흐름**:
```
Phase 1: search_ai_law  → MST + 조문번호 파싱
                                ↓
enrichedPlan = buildFallbackPlan(query) + AI 검색 결과 병합
                                ↓
Phase 2: enrichedPlan 기반 resolve + fetch
```

```javascript
// search_ai_law 결과에서 조문번호 추출 (기존 parseMstsFromAiSearch 확장)
function parseArticlesFromAiSearch(text) {
  const results = [];
  // law.go.kr search_ai_law 결과 포맷:
  // 📜 건축법\n  - MST: 12345\n  📌 제11조(건축허가)\n    건축허가를 받으려는...
  const lawBlocks = text.split(/(?=📜\s)/);
  for (const block of lawBlocks) {
    const lawMatch = block.match(/📜\s*([^\n]+)/);
    if (!lawMatch) continue;
    const lawName = lawMatch[1].trim();
    // 해당 법령 블록 내의 조문번호 추출
    const articleRe = /제(\d+)조(?:의(\d+))?/g;
    let m;
    const articles = new Set();
    while ((m = articleRe.exec(block))) {
      articles.add(m[0]);
    }
    if (articles.size) {
      results.push({ lawName, articles: [...articles] });
    }
  }
  return results;
}

// plan 보강
function enrichPlanWithAiResults(basePlan, aiMsts, aiArticles) {
  const enriched = { ...basePlan, laws: [...basePlan.laws] };
  for (const ai of aiArticles) {
    const existing = enriched.laws.find(l => l.name === ai.lawName);
    if (existing) {
      // 기존 법령에 AI가 찾은 조문 추가
      const merged = new Set([...existing.articles, ...ai.articles]);
      existing.articles = [...merged].slice(0, 8); // 과다 방지
    } else {
      // 새 법령 추가
      const mst = aiMsts.find(m => m.lawName === ai.lawName)?.mst;
      enriched.laws.push({
        name: ai.lawName,
        mst: mst || null, // MST 없으면 Phase 2에서 resolve
        articles: ai.articles.slice(0, 6),
      });
    }
  }
  return enriched;
}
```

**리스크**: 낮음. 기존 plan에 정보를 추가만 하므로, 최악의 경우 불필요한 조문을 더 가져오는 정도.

---

### 3.5 [B4] Phase 1+2 부분 병렬화

**현재**: Phase 1(search_ai_law) 완료 후에야 MST를 알 수 있어서 Phase 2 시작.

**완전 병렬화는 불가능하지만**, domainMap에 법령이 있는 경우 heuristic 기반 조기 fetch 가능:

```javascript
async function runLegalPipeline({ query, queryType, domain, budget, send }) {
  const plan = buildFallbackPlan(query, queryType);

  // heuristic 법령이 있으면 AI 검색과 동시에 search_law 시작
  const heuristicLaw = plan.laws.find(l => !l.mst);
  const earlyResolvePromise = heuristicLaw
    ? callTool('search_law', { query: heuristicLaw.name, apiKey: LAW_OC })
    : Promise.resolve(null);

  // Phase 1: AI 검색 (+ heuristic resolve 병렬)
  const [aiResult, earlyResolve] = await Promise.all([
    callTool('search_ai_law', { query, apiKey: LAW_OC }),
    earlyResolvePromise,
  ]);

  // earlyResolve 결과로 MST 즉시 반영
  if (earlyResolve?.text) {
    const parsed = parseTopLawResult(earlyResolve.text, heuristicLaw.name);
    if (parsed?.mst) heuristicLaw.mst = parsed.mst;
  }

  // AI 검색 결과로 plan 보강 (3.4)
  const enrichedPlan = enrichPlanWithAiResults(plan, ...);

  // Phase 2: 나머지 미해결 MST만 resolve (이미 resolve된 건 스킵)
  // Phase 3: fetch articles + interpretations
  // ...
}
```

**효과**: domainMap 매칭 시 Phase 1+2가 겹쳐서 **2~3초 절약**. general 도메인은 효과 없음.

**리스크**: 낮음. heuristic 법령이 없으면 기존과 동일하게 동작.

---

## 4. 구현 우선순위

### Sprint 1: 핵심 품질 (1~2일)

가장 적은 코드 변경으로 가장 큰 품질 개선. **server.mjs만 수정.**

| # | 작업 | 변경량 | 효과 |
|---|------|--------|------|
| 1 | JSON 출력 계약 제거 → Markdown 직접 생성 | buildPrompt ~10줄 삭제, parseStructuredAnswer ~80줄 삭제, 응답 구성 ~15줄 수정 | 출력 토큰 30% 절감, 파싱 실패 0%, 답변 집중도 향상 |
| 2 | Evidence truncation 개선 | slice(0,2600) → truncateByArticle(), 상수 조정 | 조문 중간 절단 방지, 핵심 근거 보존 |
| 3 | AI 검색 결과 역류 (plan 보강) | parseArticlesFromAiSearch + enrichPlanWithAiResults 추가 (~50줄) | general 도메인 빈 plan 해소 |

**Sprint 1 완료 기준**: 동일 10개 질문으로 변경 전/후 비교
- 답변에 포함된 조문 인용 수 증가 확인
- JSON 파싱 실패 0건 확인
- 답변 길이 (유효 내용) 20%+ 증가 확인

### Sprint 2: 체감 속도 (3~5일)

프론트엔드 + 브릿지 양쪽 수정. **테스트 환경에서 Cloudflare Tunnel SSE 검증 선행.**

| # | 작업 | 변경량 | 효과 |
|---|------|--------|------|
| 4 | 브릿지 SSE 스트리밍 | server.mjs 응답 부분 리팩토링, Accept 헤더 분기 | 실시간 진행 상황 표시 |
| 5 | openclaw-client SSE 파싱 | openclaw-client.ts fetch → SSE reader, fake progress 제거 | 실제 진행률 반영 |
| 6 | Chat completion stream:true | runChatCompletion → runChatCompletionStream (generator) | 답변 실시간 표시 |
| 7 | Phase 1+2 부분 병렬화 | runLegalPipeline 초반부 수정 (~20줄) | 2~3초 단축 |

**Sprint 2 선행 조건**: Cloudflare Tunnel SSE 동작 검증
```bash
# 테스트: 브릿지에서 SSE 보내고 Tunnel 경유해서 도착 확인
curl -N -H "Accept: text/event-stream" https://your-tunnel.domain/api/legal-query \
  -d '{"query":"관세법 과세가격","userId":"test"}' \
  -H "Authorization: Bearer xxx"
```

### Sprint 3: 최적화 (필요 시)

A/B 테스트와 데이터 기반 의사결정.

| # | 작업 | 선행 조건 |
|---|------|-----------|
| 8 | 복잡도별 모델 분기 | Sprint 1 완료 후 Markdown 모드에서 모델별 품질 비교 테스트 |
| 9 | Smart truncation (관련도 정렬) | Sprint 1 완료 후 조문 누락 케이스 수집·분석 |
| 10 | 캐시 TTL 최적화 | 실 운영 로그에서 캐시 히트율 측정 후 조정 |

---

## 5. 예상 성능 비교

### 5.1 속도

| 질문 유형 | 현재 | Sprint 1 후 | Sprint 2 후 |
|----------|------|------------|------------|
| 단순 (조문 조회) | 20~25초 | 18~22초 | 18~22초 (체감 3초) |
| 보통 (비교/절차) | 25~35초 | 22~28초 | 22~28초 (체감 3초) |
| 복합 (법령+판례) | 35~45초 | 30~38초 | 28~35초 (체감 3초) |
| **체감 TTFB** | **20~35초** | **15~25초** | **2~3초** |

> Sprint 1은 출력 토큰 절감으로 LLM 생성 시간 약간 단축.
> Sprint 2는 총 시간은 비슷하지만 **TTFB가 극적으로 개선**.
> 총 시간 대폭 단축은 Phase 병렬화(2~3초) + adaptive 스킵(3~5초) 복합 효과.

### 5.2 품질

| 항목 | 현재 | Sprint 1 후 | 측정 방법 |
|------|------|------------|-----------|
| 조문 인용 정확도 | 60~70% | **80~85%** | 답변 내 「법령명」제N조 패턴 vs evidence 내 실제 조문 대조 |
| JSON 파싱 실패율 | 5~10% | **0%** | 더 이상 JSON 파싱 없음 |
| 핵심 조문 누락율 | 30~40% | **10~15%** | evidence에 포함된 조문 vs 답변에서 인용된 조문 비교 |
| general 도메인 빈 plan | ~60% | **~15%** | AI 검색 역류로 plan 보강 |

> 수치는 보수적 추정. 95% 같은 과대 목표는 비현실적이므로 제외.

### 5.3 비용

| 항목 | 현재 | Sprint 1 후 |
|------|------|------------|
| 입력 토큰/질의 | ~5,000 | ~5,800 (+16%, evidence 상향) |
| 출력 토큰/질의 | ~2,000 | ~1,300 (-35%, JSON 제거) |
| 순 비용 변화 | - | **-15~20%** (출력 토큰이 비용 비중 높음) |

---

## 6. 미니PC 운영 고려사항

| 항목 | 영향 | 대응 |
|------|------|------|
| SSE 커넥션 유지 | 동시 연결 증가 가능 | MAX_CONCURRENCY(5) 내에서 관리, SSE timeout 설정 |
| Cloudflare Tunnel | SSE 버퍼링 가능성 | `X-Accel-Buffering: no` 헤더 + 테스트 |
| 메모리 | evidence 상향 → 요청당 메모리 미미하게 증가 | 현재 200MB → 220MB 수준, 무시 가능 |
| klaw-direct 병렬 호출 | 법제처 API rate limit | 현재 Phase 3이 이미 병렬, 추가 병렬화 시 호출 빈도 확인 |

---

## 7. 변경 파일 요약

| 파일 | Sprint | 변경 내용 |
|------|--------|-----------|
| `bridge/lexdiff-openclaw-bridge/server.mjs` | 1, 2 | buildPrompt, evidence truncation, plan 보강, SSE 응답, stream completion |
| `lib/openclaw-client.ts` | 2 | JSON fetch → SSE 파싱, fake progress 제거 |
| `app/api/fc-rag/route.ts` | - | 변경 없음 (이미 SSE 지원) |
| `components/.../useAiSearch.ts` | - | 변경 없음 (이미 SSE 파싱 지원) |

---

## 8. 결론

### 근본 원칙

1. **LLM은 답변 생성에만 집중** — 메타데이터(citations, confidence, toolsUsed)는 브릿지가 이미 갖고 있다. LLM에게 다시 만들라고 하는 것은 낭비이자 오류 원인.
2. **Evidence는 완전한 조문 단위로** — 법률 답변에서 조문 원문의 완전성은 타협 불가. 바이트 수로 자르는 것은 법률 도메인에서 가장 위험한 패턴.
3. **이미 있는 것을 활용** — 프론트엔드 SSE 인프라가 완비되어 있으므로, 브릿지만 SSE를 내보내면 즉시 동작.

### 실행 순서

```
Sprint 1 (1~2일): JSON 계약 제거 + Evidence 개선 + Plan 보강
    → 품질 즉시 개선, 코드 오히려 감소 (80줄 삭제)
    → 검증: 10개 테스트 질문 비교

Sprint 2 (3~5일): SSE 스트리밍 (브릿지 + 클라이언트)
    → 선행: Cloudflare Tunnel SSE 테스트
    → 체감 TTFB 2~3초 달성
    → 폴백: Accept 헤더 분기로 JSON 모드 유지

Sprint 3 (데이터 기반): 모델 분기, smart truncation
    → Sprint 1~2 결과 분석 후 필요성 판단
```
