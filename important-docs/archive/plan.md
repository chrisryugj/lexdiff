# LexDiff AI 검색 아키텍처 전환 계획
## "Google File Search RAG → MCP Tool-Calling + 서버사이드 캐시" 마이그레이션

---

## 1. 현황 분석 (AS-IS)

### 현재 아키텍처
```
유저 질문
  ↓
AI Router (Gemini 2.5 Flash Lite) ─ 질문 분류 (8가지 유형)
  ↓
Gemini 2.5 Flash + File Search Store ─ 벡터 검색 + 답변 생성
  ↓
Grounding Metadata → Citation 추출
  ↓
SSE 스트리밍 → 클라이언트 렌더링
```

### 현재 핵심 파일
| 파일 | 역할 |
|------|------|
| `lib/file-search-client.ts` | Gemini File Search Store 연동 (790줄) |
| `app/api/file-search-rag/route.ts` | RAG API 엔드포인트 |
| `lib/ai-question-router.ts` | 2-Tier AI 라우팅 |
| `lib/ai-agents/router-agent.ts` | Gemini Flash Lite 질문 분석 |
| `lib/ai-agents/specialist-agents.ts` | 8종 전문 프롬프트 |
| `lib/usage-tracker.ts` | IP 기반 사용량 제한 (100회/일) |
| `lib/rag-response-cache.ts` | IndexedDB RAG 응답 캐시 (24h TTL) |
| `components/file-search-answer-display.tsx` | UI + 타이핑 효과 + Citation |

### 현재 비용 구조 (운영자 전액 부담)
- **Gemini File Search Store**: 문서 저장 + 벡터 임베딩 + 검색 쿼리
- **AI Router (Flash Lite)**: 질문당 ~500토큰 (분류)
- **RAG 답변 (Flash)**: 질문당 ~4,000-8,000 출력 토큰
- **관리 비용**: 법령 파싱 → 업로드 → Store 관리 (admin 라우트 30개+)

### 문제점
1. **상용화 불가**: Google File Search Store는 운영자 API 키만 사용 가능
2. **비용 전가 불가**: 유저가 자기 API 키를 쓸 수 없는 구조
3. **관리 부담**: 법령 변경 시 File Store 재업로드 필요
4. **데이터 신선도**: 업로드된 법령만 검색 가능 (전체 법령 커버 불가)

---

## 2. 목표 아키텍처 (TO-BE)

### 핵심 전환: "벡터 검색" → "MCP Tool-Calling + 실시간 API"

```
유저 질문
  ↓
[1] 서버사이드 캐시 체크 (법령 DB 캐시 - 자주 검색되는 법령)
  ↓ (캐시 미스 시)
[2] AI Router (기존 유지) ─ 질문 분류 + 키워드 추출 + 필요 법령 식별
  ↓
[3] MCP Tool 호출 결정 (Gemini Function Calling)
  ├── search_law → 법제처 API 법령 검색
  ├── get_law_text → 법령 전문 조회
  ├── search_precedents → 판례 검색
  ├── get_precedent_text → 판례 전문
  ├── get_three_tier → 위임법령 3단 비교
  ├── get_article_history → 조문 개정이력
  ├── search_interpretations → 법령해석례
  ├── get_legal_term_kb → 법률용어 검색
  └── ... (58개 MCP 도구 중 필요한 것만)
  ↓
[4] Tool 결과를 컨텍스트로 구성
  ↓
[5] Specialist Agent가 컨텍스트 기반 답변 생성 (기존 8종 프롬프트 재활용)
  ↓
[6] 응답 캐시 저장 + 법령 DB 캐시 업데이트
  ↓
[7] 스트리밍 응답 → 클라이언트
```

### BYO-Key (Bring Your Own Key) 구조
```
[Phase 1] 운영자 키 모드 (현재와 동일 - 기본)
  └── 서버의 GEMINI_API_KEY 사용, 일일 100회 제한 유지

[Phase 2] 유저 키 모드 (상용화 단계)
  └── 유저가 자기 Gemini/OpenAI 키 입력
  └── 제한 없음, 비용은 유저 부담
  └── 키는 브라우저 세션에만 저장 (서버 미저장)
```

---

## 3. 법령 DB 캐시 전략 (서버사이드)

### 왜 캐시가 필요한가
- 법제처 API 응답 속도: ~500-2000ms
- 멀티턴 Tool Calling 시 3-5회 API 호출 → 누적 지연 심각
- **자주 검색되는 법령은 캐싱하여 Tool Call 응답 시간 단축**

### 3계층 캐시 아키텍처

```
[L1] 인메모리 캐시 (Node.js Map)
  ├── 용도: 핫 법령 (최근 1시간 내 조회된 법령)
  ├── TTL: 1시간
  ├── 최대: 200개 법령
  └── 속도: ~1ms

[L2] 서버사이드 파일 캐시 (JSON 파일 또는 SQLite)
  ├── 용도: 자주 검색되는 법령 (관세법, 민법, 형법 등 Top 100)
  ├── TTL: 24시간
  ├── 사전 워밍: 빌드 타임에 주요 법령 프리로드
  └── 속도: ~5ms

[L3] 법제처 API (실시간)
  ├── 용도: 캐시 미스 시 원본 조회
  ├── TTL: 없음 (항상 최신)
  └── 속도: ~500-2000ms
```

### 캐시 워밍 전략 (비용 = 0, 법제처 API 무료)
```typescript
// 빌드 타임 또는 서버 시작 시 실행
const HOT_LAWS = [
  '관세법', '관세법 시행령', '관세법 시행규칙',
  '민법', '형법', '상법',
  '국세기본법', '소득세법', '법인세법', '부가가치세법',
  '행정절차법', '행정소송법',
  '근로기준법', '노동조합법',
  // ... Top 50-100 법령
]
// → 법제처 API로 미리 조회 → L2 캐시에 저장
```

### 기존 캐시와의 관계
| 기존 캐시 | 유지 여부 | 변경사항 |
|-----------|----------|---------|
| `rag-response-cache.ts` (IndexedDB) | **유지** (이름 변경) | RAG → AI 응답 캐시로 리네임 |
| `law-content-cache.ts` (IndexedDB) | **유지** | 클라이언트 사이드, 뷰어용 |
| `api-cache.ts` (localStorage) | **유지** | 클라이언트 API 캐시 |
| `precedent-cache.ts` (IndexedDB) | **유지** | 판례 캐시 |
| **신규: `law-db-cache.ts`** | **신규** | 서버사이드 법령 캐시 (Tool Calling용) |

---

## 4. MCP 도구 → Function Calling 매핑

### korean-law-mcp 58개 도구 중 핵심 도구 선별

#### Tier 1: 필수 도구 (모든 질문에 활용)
| MCP 도구 | Gemini Function | 용도 |
|----------|----------------|------|
| `search_law` | `search_korean_law` | 법령 키워드 검색 |
| `get_law_text` | `get_law_full_text` | 법령 전문 조회 |
| `get_batch_articles` | `get_specific_articles` | 특정 조문 일괄 조회 |
| `search_precedents` | `search_court_cases` | 판례 검색 |
| `get_precedent_text` | `get_case_full_text` | 판례 전문 |

#### Tier 2: 유형별 도구 (AI Router가 질문 유형에 따라 선택)
| 질문 유형 | 추가 도구 |
|-----------|----------|
| `comparison` | `compare_old_new`, `compare_articles`, `get_three_tier` |
| `procedure` | `get_article_history`, `parse_article_links` |
| `definition` | `get_legal_term_kb`, `get_legal_term_detail`, `get_daily_to_legal` |
| `consequence` | `search_precedents`, `find_similar_precedents` |
| `exemption` | `search_interpretations`, `search_tax_tribunal_decisions` |
| `scope` | `get_law_statistics`, `search_customs_interpretations` |

#### Tier 3: 특수 도구 (필요 시에만)
| 도구 | 용도 |
|------|------|
| `search_constitutional_decisions` | 헌재 결정 |
| `search_admin_appeals` | 행정심판 |
| `search_ftc_decisions` | 공정위 결정 |
| `search_nlrc_decisions` | 노동위 결정 |
| `get_annexes` | 별표/서식 |

### Function Declaration 스키마 설계
```typescript
const LEGAL_TOOLS: FunctionDeclaration[] = [
  {
    name: 'search_korean_law',
    description: '한국 법령을 키워드로 검색합니다. 약칭 자동 인식(예: 화관법→화학물질관리법)',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색 키워드 (법령명, 약칭, 주제어)' },
        category: { type: 'string', enum: ['법률', '시행령', '시행규칙', '조례'], description: '법령 유형 필터' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_law_articles',
    description: '특정 법령의 조문 전문을 조회합니다',
    parameters: {
      type: 'object',
      properties: {
        law_name: { type: 'string', description: '법령명 (예: 관세법)' },
        article_numbers: { type: 'array', items: { type: 'string' }, description: '조문 번호 배열 (예: ["제38조", "제39조"])' }
      },
      required: ['law_name']
    }
  },
  {
    name: 'search_court_cases',
    description: '법원 판례를 키워드로 검색합니다',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '판례 검색 키워드' },
        court: { type: 'string', enum: ['대법원', '헌법재판소', '고등법원', '지방법원'], description: '법원 필터' }
      },
      required: ['query']
    }
  },
  // ... 필요한 도구만 선별적으로 등록
]
```

---

## 5. 비용 최소화 전략

### 5-1. LLM 호출 최소화

| 전략 | 방법 | 절감 효과 |
|------|------|----------|
| **AI 응답 캐시** | 동일 질문 → IndexedDB 캐시 반환 | ~25% 절감 (현행 유지) |
| **규칙 기반 우선** | 단순 질문은 AI Router 건너뛰기 | Router 호출 ~30% 절감 |
| **법령 DB 캐시** | Tool Call 시 캐시 우선 조회 | API 지연 90% 절감 |
| **Tool Call 수 제한** | 최대 3회 Tool Call 후 강제 답변 | 복잡 질문 토큰 30% 절감 |
| **컨텍스트 압축** | 조문 전문 대신 핵심 부분만 주입 | 입력 토큰 50% 절감 |

### 5-2. 토큰 절약 상세

#### Before (현행 RAG)
```
[입력] 유저 질문 (~50 토큰)
     + System Prompt (~2000 토큰)
     + File Search 결과 (~3000-5000 토큰)  ← 제어 불가
= 약 5,000-7,000 입력 토큰

[출력] 답변 생성 (~4,000-8,000 토큰)

총: 질문당 ~9,000-15,000 토큰
```

#### After (Tool Calling)
```
[1차 호출: Router] (~500 입력 + ~200 출력 = ~700 토큰)
  → 질문 분류 + 필요 도구 결정

[2차 호출: Tool Call] (~500 입력 + ~100 출력 = ~600 토큰)
  → search_korean_law → 결과 반환 (서버사이드, LLM 토큰 아님)

[3차 호출: 답변 생성] (~2000 시스템 + ~1500 컨텍스트 + ~50 질문 = ~3,550 입력)
  → 출력 ~3,000-6,000 토큰

총: 질문당 ~5,000-10,000 토큰 (약 30% 절감)
```

#### 핵심 절감 포인트
- File Search의 "제어 불가능한 청크 주입" → **필요한 조문만 정확히 주입**
- 불필요한 grounding metadata 처리 제거
- 컨텍스트 윈도우 효율적 사용

### 5-3. 단순 질문 Fast Path (LLM 0회 호출)

```typescript
// 법령명 + 조문번호가 명확한 경우: LLM 호출 없이 즉시 반환
// 예: "관세법 제38조" → 패턴 매칭 → 바로 캐시/API 조회 → 조문 반환
if (isDirectArticleQuery(query)) {
  const cached = await lawDbCache.get(lawName, articleNo)
  if (cached) return { type: 'direct', article: cached }

  const article = await mcpClient.getArticle(lawName, articleNo)
  await lawDbCache.set(lawName, articleNo, article)
  return { type: 'direct', article }
}
// → LLM 비용 = 0원
```

### 5-4. 비용 비교 요약

| 항목 | 현행 (File Search RAG) | 전환 후 (Tool Calling) |
|------|----------------------|----------------------|
| File Search Store | $0.10/1K queries | **$0 (제거)** |
| 임베딩/저장 비용 | 문서당 과금 | **$0 (제거)** |
| Router (Flash Lite) | ~$0.001/query | ~$0.001/query (동일) |
| 답변 생성 (Flash) | ~$0.003/query | ~$0.002/query (30% 감소) |
| 법제처 API | $0 (무료) | $0 (무료) |
| 인프라 | Google 종속 | **자체 캐시만** |
| **총 비용/query** | **~$0.005** | **~$0.003 (40% 절감)** |

---

## 6. 단계별 구현 계획

### Phase 1: 서버사이드 법령 DB 캐시 구축 (1-2일)

**목표**: Tool Calling의 응답 지연을 최소화할 캐시 레이어

**작업 내용**:
1. `lib/law-db-cache.ts` 생성
   - L1: 인메모리 캐시 (Map, 1시간 TTL, 200개)
   - L2: JSON 파일 캐시 (`/.cache/laws/`, 24시간 TTL)
   - 법령 검색 결과 + 조문 전문 캐시
2. `lib/cache-warmer.ts` 생성
   - 서버 시작 시 Top 50 법령 프리로드
   - 백그라운드 주기적 갱신 (6시간)
3. 기존 `api-cache.ts`, `law-content-cache.ts`는 클라이언트용으로 그대로 유지

**신규 파일**:
- `lib/law-db-cache.ts`
- `lib/cache-warmer.ts`
- `.cache/laws/` (gitignore)

---

### Phase 2: MCP → Gemini Function Calling 브릿지 (2-3일)

**목표**: MCP 도구들을 Gemini Function Calling으로 호출 가능하게 변환

**작업 내용**:
1. `lib/legal-tools.ts` 생성
   - Gemini Function Declaration 스키마 정의 (Tier 1-2 도구, ~15개)
   - 질문 유형별 도구 세트 매핑
2. `lib/legal-tool-executor.ts` 생성
   - Function Call → 법제처 API 실제 호출 (기존 API route 로직 재활용)
   - 캐시 레이어 통합 (L1 → L2 → L3 순서)
   - 응답 정규화 (다양한 API 포맷 → 통일된 JSON)
3. 기존 `app/api/law-search/route.ts`, `app/api/precedent-search/route.ts` 등의 핵심 로직을 `lib/` 레벨로 추출하여 재활용

**핵심 설계: MCP 도구를 직접 import하지 않고, 기존 법제처 API 호출 로직을 재활용**
```
기존: Client → /api/law-search → 법제처 API
신규: Gemini Tool Call → legal-tool-executor → 법제처 API (동일 로직)
```

**신규 파일**:
- `lib/legal-tools.ts` (Function Declaration 스키마)
- `lib/legal-tool-executor.ts` (Tool 실행기)

---

### Phase 3: Tool-Calling RAG 엔진 구축 (2-3일)

**목표**: File Search를 대체하는 새 RAG 파이프라인

**작업 내용**:
1. `lib/tool-calling-rag.ts` 생성 (핵심 엔진)
   - Gemini + Function Calling 멀티턴 루프
   - 최대 3회 Tool Call 후 강제 답변 생성
   - 스트리밍 지원 (SSE)
2. `app/api/tool-calling-rag/route.ts` 생성 (새 API 엔드포인트)
   - 기존 `file-search-rag` 구조 그대로, 내부만 교체
   - usage-tracker 연동 유지
   - 동일 응답 포맷 (answer, citations, confidenceLevel, queryType)
3. Citation 시스템 전환
   - Grounding Metadata → **Tool Call 결과에서 Citation 직접 구성**
   - 법령명 + 조문번호는 100% 정확 (API 원본 데이터)

**AI Router 재활용**: `ai-question-router.ts`를 그대로 사용
- Router 분석 결과에서 `primaryType` → 도구 세트 선택
- `searchOptimization.searchKeywords` → Tool Call 검색어로 활용
- `specialistPrompt` → 최종 답변 생성 시스템 프롬프트로 유지

**흐름**:
```typescript
async function* toolCallingRAG(query: string) {
  // 1. 캐시 체크
  const cached = await checkResponseCache(query)
  if (cached) { yield cached; return }

  // 2. AI Router (기존)
  const routing = await routeQuestion(query)

  // 3. 질문 유형에 맞는 도구 세트 선택
  const tools = selectToolsForQuery(routing.analysis)

  // 4. Gemini + Function Calling (멀티턴)
  const context = await executeToolCalls(query, tools, routing)

  // 5. 컨텍스트 기반 답변 생성 (Specialist Prompt)
  yield* generateAnswer(query, context, routing.specialistPrompt)

  // 6. 캐시 저장
  await cacheResponse(query, fullResponse, citations)
}
```

**신규 파일**:
- `lib/tool-calling-rag.ts`
- `app/api/tool-calling-rag/route.ts`

---

### Phase 4: UI 전환 + 듀얼 모드 (1-2일)

**목표**: 프론트엔드를 새 API로 전환 (기존 UI 최대한 재활용)

**작업 내용**:
1. `file-search-answer-display.tsx` 수정
   - API 엔드포인트만 교체: `/api/file-search-rag` → `/api/tool-calling-rag`
   - 응답 포맷 동일하므로 UI 변경 최소화
   - Citation 렌더링: grounding metadata 기반 → tool-call 기반으로 전환
2. Feature Flag 추가
   ```typescript
   const USE_TOOL_CALLING = process.env.NEXT_PUBLIC_USE_TOOL_CALLING === 'true'
   const ragEndpoint = USE_TOOL_CALLING ? '/api/tool-calling-rag' : '/api/file-search-rag'
   ```
3. A/B 테스트 기간 (2주): 두 엔드포인트 병행 → 품질 비교

**수정 파일**:
- `components/file-search-answer-display.tsx` (엔드포인트 교체)
- `.env.local` (NEXT_PUBLIC_USE_TOOL_CALLING)

---

### Phase 5: BYO-Key + File Search 제거 (1-2일)

**목표**: 유저 API 키 지원 + 레거시 정리

**작업 내용**:
1. BYO-Key UI 추가
   - 설정 모달에서 Gemini API 키 입력
   - `sessionStorage`에만 저장 (서버 미전송, 탭 닫으면 삭제)
   - 키가 있으면 일일 제한 해제
2. 키 전달 방식
   ```typescript
   // 클라이언트: 헤더로 전달
   fetch('/api/tool-calling-rag', {
     headers: { 'X-User-API-Key': userApiKey || '' }
   })
   // 서버: 유저 키 우선, 없으면 서버 키
   const apiKey = request.headers.get('X-User-API-Key') || process.env.GEMINI_API_KEY
   ```
3. File Search 레거시 제거
   - `lib/file-search-client.ts` → 삭제 (또는 archive)
   - `app/api/file-search-rag/route.ts` → 삭제
   - `app/api/admin/` 중 File Search Store 관련 라우트 정리
   - 환경변수 `GEMINI_FILE_SEARCH_STORE_ID` 제거

---

## 7. 보존하는 것 (재활용 자산)

| 자산 | 파일 | 재활용 방법 |
|------|------|------------|
| **AI Router** | `ai-question-router.ts` | 그대로 유지 (질문 분류) |
| **8종 Specialist Prompt** | `specialist-agents.ts` | 답변 생성 프롬프트로 재활용 |
| **질문 유형 체계** | `types.ts` | QueryType, LegalDomain 등 그대로 |
| **사용량 트래커** | `usage-tracker.ts` | IP 기반 제한 유지 |
| **RAG 응답 캐시** | `rag-response-cache.ts` | AI 응답 캐시로 리네임 |
| **법령 캐시들** | `law-content-cache.ts` 등 | 클라이언트용 그대로 |
| **UI 컴포넌트** | `file-search-answer-display.tsx` | API 엔드포인트만 교체 |
| **법령 파서** | `law-parser.ts` | JO 코드 변환 등 유지 |
| **링크 생성기** | `unified-link-generator.ts` | Citation 링크 생성 유지 |

---

## 8. 리스크 및 대응

| 리스크 | 확률 | 대응 |
|--------|------|------|
| 법제처 API 속도 저하 | 중 | L1/L2 캐시로 90% 커버, 타임아웃 5초 |
| Tool Call 과다 (비용 증가) | 중 | 최대 3회 제한, 캐시 우선 |
| Gemini Function Calling 정확도 | 낮 | AI Router가 도구를 사전 결정 → 모델 의존도 낮춤 |
| 법제처 API 장애 | 낮 | 캐시된 법령으로 응답, 경고 표시 |
| Citation 품질 저하 | 낮 | API 원본 데이터라 오히려 향상 예상 |

---

## 9. 타임라인 요약

| Phase | 기간 | 핵심 산출물 |
|-------|------|------------|
| **Phase 1** 서버 캐시 | 1-2일 | `law-db-cache.ts`, `cache-warmer.ts` |
| **Phase 2** Tool 브릿지 | 2-3일 | `legal-tools.ts`, `legal-tool-executor.ts` |
| **Phase 3** RAG 엔진 | 2-3일 | `tool-calling-rag.ts`, 새 API route |
| **Phase 4** UI 전환 | 1-2일 | 엔드포인트 교체, Feature Flag |
| **Phase 5** BYO-Key + 정리 | 1-2일 | 유저 키 지원, File Search 제거 |
| **총** | **7-12일** | |

---

## 10. 성공 지표

| 지표 | 현행 | 목표 |
|------|------|------|
| 질문당 비용 | ~$0.005 | ~$0.003 (40% 절감) |
| 응답 시간 (캐시 히트) | ~3초 | ~0.5초 |
| 응답 시간 (캐시 미스) | ~5초 | ~4초 |
| Citation 정확도 | ~70% (벡터 유사도) | ~95% (API 원본) |
| 법령 커버리지 | 업로드된 법령만 | **전체 법령** (실시간) |
| 상용화 가능성 | 불가 | **BYO-Key 모델** |
