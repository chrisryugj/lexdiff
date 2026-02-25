# 11. 법령정보 MCP Bot 아키텍처 설계

**Gemini Function Calling + 에이전트 루프 기반 다단계 법률 추론 시스템**

> Nanobot(HKUDS/nanobot) 프레임워크의 tool-calling 오케스트레이션 패턴을 참고하여,
> LexDiff의 기존 법률 데이터 API를 MCP 도구로 래핑하고 에이전트 루프로 복합 법률 질문을 처리하는 아키텍처 설계.

---

## 🏗️ 1. 현재 아키텍처 vs 제안 아키텍처

### 현재: 단발성 RAG (Single-shot)

```
사용자 질문
    │
    ▼
┌─────────────────┐
│  Router Agent    │  ← Gemini 2.5 Flash Lite
│  (analyzeQuery)  │     쿼리 분석 + 분류
└────────┬────────┘
         │ RouterAnalysis (queryType, domain, searchOptimization)
         ▼
┌─────────────────┐
│  File Search RAG │  ← Google File Search API
│  (단일 검색)      │     벡터 검색 1회
└────────┬────────┘
         │ citations + answer
         ▼
┌─────────────────┐
│  Specialist Agent│  ← 정적 프롬프트 8종
│  (최종 답변 생성)  │     단일 생성
└────────┬────────┘
         │
         ▼
    최종 응답 (SSE 스트리밍)
```

**한계점:**
- "관세법 38조 변경내역 + 관련 판례" 같은 **복합 질문**에 대응 불가
- 법제처 API를 **직접 호출할 수 없음** (RAG만 가능)
- 다단계 추론 없이 **1회성 검색-응답** 구조
- 검색 결과가 부족해도 **재검색/보완 검색 불가**

### 제안: 에이전트 루프 + Function Calling

```
사용자 질문
    │
    ▼
┌──────────────────────┐
│  Router Agent         │  ← 기존 analyzeQuery() 재활용
│  (1단계: 쿼리 분석)    │
└──────────┬───────────┘
           │ RouterAnalysis
           ▼
┌──────────────────────────────────────────────────────────┐
│  Agent Loop (최대 5회)                                     │
│                                                            │
│  ┌────────────────┐    ┌──────────────┐                   │
│  │ Gemini 2.5 Flash│◄──│ Tool Results  │                  │
│  │ + function_decl │    │ (피드백)       │                  │
│  └───────┬────────┘    └──────▲───────┘                   │
│          │                     │                           │
│          │ functionCall?       │ functionResult             │
│          ▼                     │                           │
│  ┌────────────────┐    ┌──────┴───────┐                   │
│  │ Tool Dispatcher │───►│ API Executor  │                  │
│  │ (도구 선택/실행)  │    │ (실제 API 호출) │                  │
│  └────────────────┘    └──────────────┘                   │
│                                                            │
│  도구 목록:                                                  │
│  ├── search_laws       (법령 검색)                           │
│  ├── get_law_content   (법령 원문 조회)                       │
│  ├── search_precedents (판례 검색)                           │
│  ├── compare_laws      (법령 비교/요약)                       │
│  ├── get_delegation    (위임법령 체계)                        │
│  └── rag_search        (벡터 RAG 검색)                       │
│                                                            │
│  종료 조건: functionCall 없음 | max iterations | 에러         │
└──────────────────────────────────────────────────────────┘
           │
           │ 최종 text 응답
           ▼
    최종 응답 (SSE 스트리밍)
```

### 비교 테이블

| 항목 | 현재 (Single-shot RAG) | 제안 (Agent Loop + FC) |
|------|----------------------|----------------------|
| **추론 단계** | 1회 (검색→응답) | 최대 5회 반복 |
| **도구 수** | 1개 (File Search) | 6개 (법제처 API + RAG) |
| **복합 질문** | 부분적 답변 | 단계별 분해 후 종합 |
| **검색 보완** | 불가 | 결과 부족 시 재검색 |
| **API 콜 수** | Gemini 2회 (라우터+생성) | Gemini 2~6회 + 법제처 N회 |
| **레이턴시** | 2~4초 | 5~15초 (복합 질문) |
| **비용** | 낮음 | 중간 (Flash는 저렴) |
| **구현 복잡도** | 낮음 | 중간 |

---

## 🔧 2. MCP 도구 정의 (Gemini Function Declarations)

### 전체 도구 목록

6개 도구를 Gemini `function_declarations` 형식으로 정의한다.
각 도구는 기존 LexDiff API 엔드포인트를 내부적으로 호출한다.

### 2-1. `search_laws` — 법령 키워드 검색

**매핑**: `/api/law-search` → `law.go.kr/DRF/lawSearch.do`

```typescript
{
  name: "search_laws",
  description: "법령을 키워드로 검색합니다. 법령명, 조문 내용 등을 검색할 수 있습니다. 검색 결과에는 법령ID, 법령명, 시행일자 등이 포함됩니다.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "검색 키워드 (예: '관세법', '개인정보보호', '전자상거래')"
      }
    },
    required: ["query"]
  }
}
```

**실행 매핑:**
```typescript
async function executeSearchLaws(args: { query: string }) {
  // 기존 /api/law-search 로직 재활용
  // → law.go.kr/DRF/lawSearch.do?OC=&target=law&type=XML&query=...
  // 응답: { laws: [{ lawId, 법령명한글, 시행일자, 법령종류 }], totalCount }
}
```

### 2-2. `get_law_content` — 법령 원문 조회

**매핑**: `/api/eflaw` → `law.go.kr/DRF/lawService.do?target=eflaw`

```typescript
{
  name: "get_law_content",
  description: "특정 법령의 원문(전체 또는 특정 조문)을 조회합니다. lawId 또는 mst 코드가 필요합니다. 특정 조문만 조회하려면 jo 파라미터를 사용하세요.",
  parameters: {
    type: "object",
    properties: {
      lawId: {
        type: "string",
        description: "법령 ID (search_laws 결과에서 획득)"
      },
      mst: {
        type: "string",
        description: "법령 MST 코드 (lawId 대안)"
      },
      jo: {
        type: "string",
        description: "조문 번호 (6자리, 예: '003800' = 제38조, '001000' = 제10조)"
      },
      efYd: {
        type: "string",
        description: "시행일자 (YYYYMMDD, 미입력시 현행)"
      }
    },
    required: []  // lawId 또는 mst 중 하나 필요
  }
}
```

**실행 매핑:**
```typescript
async function executeGetLawContent(args: {
  lawId?: string; mst?: string; jo?: string; efYd?: string
}) {
  // 기존 /api/eflaw 로직 재활용
  // → law.go.kr/DRF/lawService.do?target=eflaw&OC=&type=JSON&ID=...&JO=...
  // 응답: { 법령명, 시행일, 조문: [{ 조번호, 조명, 본문, 항: [{항번호, 항내용}] }] }
}
```

### 2-3. `search_precedents` — 판례 검색

**매핑**: `/api/precedent-search` → `law.go.kr/DRF/lawSearch.do?target=prec`

```typescript
{
  name: "search_precedents",
  description: "판례를 검색합니다. 키워드, 사건번호, 법원명으로 검색 가능합니다. 결과에는 사건번호, 사건명, 판결일, 요약이 포함됩니다.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "검색 키워드 (예: '관세 과세가격', '부당이득반환')"
      },
      caseNumber: {
        type: "string",
        description: "사건번호 (예: '2024두12345')"
      },
      court: {
        type: "string",
        description: "법원명 (예: '대법원', '서울고등법원')"
      },
      display: {
        type: "string",
        description: "결과 수 (기본 20)"
      }
    },
    required: []  // query 또는 caseNumber 중 하나 이상 필요
  }
}
```

**실행 매핑:**
```typescript
async function executeSearchPrecedents(args: {
  query?: string; caseNumber?: string; court?: string; display?: string
}) {
  // 기존 /api/precedent-search 로직 재활용
  // → law.go.kr/DRF/lawSearch.do?OC=&target=prec&type=XML&query=...
  // 응답: { totalCount, precedents: [{ caseNumber, caseName, court, decisionDate, summary }] }
}
```

### 2-4. `compare_laws` — 법령 비교/AI 요약

**매핑**: `/api/summarize` → Gemini 2.5 Flash Lite

```typescript
{
  name: "compare_laws",
  description: "두 시점의 법령 조문을 비교하거나, 판례를 요약합니다. 법령 비교 시 핵심 차이점, 실무 영향, 세부 변경사항을 제공합니다.",
  parameters: {
    type: "object",
    properties: {
      lawTitle: {
        type: "string",
        description: "법령명 (예: '관세법')"
      },
      joNum: {
        type: "string",
        description: "조문 번호 (예: '제38조')"
      },
      oldContent: {
        type: "string",
        description: "구법 조문 내용"
      },
      newContent: {
        type: "string",
        description: "현행/신법 조문 내용"
      },
      isPrecedent: {
        type: "boolean",
        description: "판례 요약 모드 여부 (true시 newContent에 판례 전문)"
      }
    },
    required: ["lawTitle", "newContent", "isPrecedent"]
  }
}
```

### 2-5. `get_delegation_hierarchy` — 위임법령 체계 조회

**매핑**: `/api/three-tier` → `law.go.kr/DRF/lawService.do?target=thdCmp`

```typescript
{
  name: "get_delegation_hierarchy",
  description: "특정 법령의 위임법령 체계(상위법-시행령-시행규칙)를 조회합니다. 위임 관계와 변경 이력을 확인할 수 있습니다.",
  parameters: {
    type: "object",
    properties: {
      lawId: {
        type: "string",
        description: "법령 ID"
      },
      mst: {
        type: "string",
        description: "법령 MST 코드"
      }
    },
    required: []  // lawId 또는 mst 중 하나 필요
  }
}
```

### 2-6. `rag_search` — 벡터 RAG 검색

**매핑**: `/api/file-search-rag` → Google File Search API

```typescript
{
  name: "rag_search",
  description: "법령/판례 데이터베이스에서 의미 기반 검색(RAG)을 수행합니다. 키워드 검색으로 찾기 어려운 개념적 질문에 유용합니다. 관련 조문과 신뢰도 점수를 반환합니다.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "자연어 검색 질문 (예: '수출입 시 원산지 증명 요건은?')"
      }
    },
    required: ["query"]
  }
}
```

### 도구 전체 정의 (코드)

```typescript
// lib/mcp-bot/tool-definitions.ts

import type { FunctionDeclaration } from './types';

export const LEGAL_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "search_laws",
    description: "법령을 키워드로 검색합니다. 법령명, 조문 내용 등을 검색할 수 있습니다.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "검색 키워드" }
      },
      required: ["query"]
    }
  },
  {
    name: "get_law_content",
    description: "특정 법령의 원문(전체 또는 특정 조문)을 조회합니다.",
    parameters: {
      type: "object",
      properties: {
        lawId: { type: "string", description: "법령 ID" },
        mst: { type: "string", description: "법령 MST 코드" },
        jo: { type: "string", description: "조문 번호 (6자리, 예: '003800')" },
        efYd: { type: "string", description: "시행일자 (YYYYMMDD)" }
      },
      required: []
    }
  },
  {
    name: "search_precedents",
    description: "판례를 검색합니다. 키워드, 사건번호, 법원명으로 검색 가능합니다.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "검색 키워드" },
        caseNumber: { type: "string", description: "사건번호" },
        court: { type: "string", description: "법원명" },
        display: { type: "string", description: "결과 수 (기본 20)" }
      },
      required: []
    }
  },
  {
    name: "compare_laws",
    description: "두 시점의 법령 조문을 비교하거나, 판례를 요약합니다.",
    parameters: {
      type: "object",
      properties: {
        lawTitle: { type: "string", description: "법령명" },
        joNum: { type: "string", description: "조문 번호" },
        oldContent: { type: "string", description: "구법 조문 내용" },
        newContent: { type: "string", description: "현행/신법 조문 내용" },
        isPrecedent: { type: "boolean", description: "판례 요약 모드 여부" }
      },
      required: ["lawTitle", "newContent", "isPrecedent"]
    }
  },
  {
    name: "get_delegation_hierarchy",
    description: "특정 법령의 위임법령 체계(상위법-시행령-시행규칙)를 조회합니다.",
    parameters: {
      type: "object",
      properties: {
        lawId: { type: "string", description: "법령 ID" },
        mst: { type: "string", description: "법령 MST 코드" }
      },
      required: []
    }
  },
  {
    name: "rag_search",
    description: "법령/판례 데이터베이스에서 의미 기반 검색(RAG)을 수행합니다.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "자연어 검색 질문" }
      },
      required: ["query"]
    }
  }
];
```

---

## 🔄 3. 에이전트 루프 설계

### 3-1. 핵심 개념: Nanobot 패턴의 TypeScript 적용

Nanobot의 핵심은 **"Reason → Act → Observe → Repeat"** 루프다.

```
┌─────────────────────────────────────────────┐
│                Agent Loop                    │
│                                              │
│  1. Reason  ──► Gemini에 전체 컨텍스트 전달      │
│                  (시스템 프롬프트 + 대화 히스토리    │
│                   + tool declarations)        │
│                                              │
│  2. Act     ──► functionCall 감지 시 도구 실행   │
│                  functionCall 없으면 → 종료     │
│                                              │
│  3. Observe ──► 도구 결과를 functionResult로     │
│                  대화 히스토리에 추가              │
│                                              │
│  4. Repeat  ──► 1로 돌아감 (max N회)            │
│                                              │
└─────────────────────────────────────────────┘
```

### Nanobot vs LexDiff MCP Bot 패턴 비교

| 항목 | Nanobot (Python) | LexDiff MCP Bot (TypeScript) |
|------|-----------------|---------------------------|
| **런타임** | Python async | Next.js API Route (Edge/Node) |
| **LLM** | Provider-agnostic (OpenAI, Anthropic 등) | Gemini 2.5 Flash 고정 |
| **도구 프로토콜** | MCP (Model Context Protocol) | Gemini function_declarations (MCP 호환 가능) |
| **도구 소스** | 외부 MCP 서버 (stdio/SSE) | 내부 API 엔드포인트 직접 호출 |
| **루프 제어** | max_iterations config | MAX_ITERATIONS = 5 상수 |
| **히스토리** | messages 배열 누적 | contents 배열 누적 (Gemini 형식) |
| **종료 조건** | no tool_calls + stop | no functionCall + 텍스트 응답 |
| **스트리밍** | SSE to client | SSE to client (기존 패턴 재활용) |
| **에러 처리** | retry + fallback | fallback to RAG-only |
| **멀티채널** | Discord, Slack, Web, CLI | Web only (Next.js) |
| **코드 규모** | ~4K LOC (전체 프레임워크) | ~500 LOC (루프 + 디스패처) |

### 3-2. 에이전트 루프 구현 (TypeScript)

```typescript
// lib/mcp-bot/agent-loop.ts

import { LEGAL_TOOL_DECLARATIONS } from './tool-definitions';
import { executeTool } from './tool-executor';
import type { GeminiContent, AgentLoopResult } from './types';

const MAX_ITERATIONS = 5;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * 에이전트 루프 메인 함수
 *
 * Nanobot 패턴: Reason → Act → Observe → Repeat
 */
export async function agentLoop(
  query: string,
  routerAnalysis: RouterAnalysis,  // 기존 analyzeQuery() 결과 재활용
  apiKey: string
): Promise<AgentLoopResult> {

  // ── 1. 대화 히스토리 초기화 ──
  const contents: GeminiContent[] = [
    {
      role: 'user',
      parts: [{
        text: buildUserPrompt(query, routerAnalysis)
      }]
    }
  ];

  const toolCallLog: ToolCallRecord[] = [];
  let finalAnswer = '';
  let iteration = 0;

  // ── 2. 에이전트 루프 ──
  while (iteration < MAX_ITERATIONS) {
    iteration++;

    // ── 2a. Reason: Gemini에 전체 컨텍스트 전달 ──
    const geminiResponse = await callGeminiWithTools(
      contents,
      buildSystemPrompt(routerAnalysis),
      apiKey
    );

    const candidate = geminiResponse.candidates?.[0];
    if (!candidate?.content?.parts) {
      break; // 응답 없음 → 종료
    }

    // 응답을 히스토리에 추가
    contents.push({
      role: 'model',
      parts: candidate.content.parts
    });

    // ── 2b. Act: functionCall 감지 ──
    const functionCalls = candidate.content.parts.filter(
      (p: any) => p.functionCall
    );

    // functionCall이 없으면 → 최종 답변으로 간주
    if (functionCalls.length === 0) {
      finalAnswer = candidate.content.parts
        .filter((p: any) => p.text)
        .map((p: any) => p.text)
        .join('');
      break;
    }

    // ── 2c. Observe: 각 도구 실행 → 결과 피드백 ──
    const functionResults: any[] = [];

    for (const part of functionCalls) {
      const { name, args } = part.functionCall;

      try {
        const result = await executeTool(name, args);
        functionResults.push({
          functionResponse: {
            name,
            response: { result: JSON.stringify(result) }
          }
        });
        toolCallLog.push({ name, args, success: true, iteration });
      } catch (error) {
        functionResults.push({
          functionResponse: {
            name,
            response: { error: `도구 실행 실패: ${error.message}` }
          }
        });
        toolCallLog.push({ name, args, success: false, iteration });
      }
    }

    // 도구 결과를 히스토리에 추가 (Gemini 형식)
    contents.push({
      role: 'user',
      parts: functionResults
    });

    // ── 2d. Repeat: 루프 계속 ──
  }

  // ── 3. 최대 반복 도달 시 강제 최종 답변 요청 ──
  if (!finalAnswer && iteration >= MAX_ITERATIONS) {
    finalAnswer = await forceFinalize(contents, apiKey);
  }

  return {
    answer: finalAnswer,
    toolCalls: toolCallLog,
    iterations: iteration
  };
}
```

### 3-3. Gemini Function Calling API 호출

```typescript
// lib/mcp-bot/gemini-client.ts

/**
 * Gemini API에 function declarations와 함께 호출
 */
async function callGeminiWithTools(
  contents: GeminiContent[],
  systemPrompt: string,
  apiKey: string
): Promise<GeminiResponse> {

  const body = {
    // 대화 히스토리 전체 (멀티턴)
    contents,

    // 시스템 프롬프트
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },

    // ★ 도구 정의 (function declarations)
    tools: [{
      function_declarations: LEGAL_TOOL_DECLARATIONS
    }],

    // 도구 호출 설정
    toolConfig: {
      functionCallingConfig: {
        mode: "AUTO"  // AUTO: 모델이 판단 | ANY: 반드시 도구 호출 | NONE: 도구 금지
      }
    },

    // 생성 설정
    generationConfig: {
      temperature: 0.1,   // 도구 선택은 낮은 temperature
      topP: 0.8,
      maxOutputTokens: 4096
    }
  };

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  return response.json();
}
```

### 3-4. Gemini Function Calling 요청/응답 형식 상세

**요청 (도구 정의 포함):**
```json
{
  "contents": [
    { "role": "user", "parts": [{ "text": "관세법 제38조가 2024년에 어떻게 바뀌었나?" }] }
  ],
  "tools": [{
    "function_declarations": [
      {
        "name": "search_laws",
        "description": "법령을 키워드로 검색합니다.",
        "parameters": {
          "type": "object",
          "properties": { "query": { "type": "string" } },
          "required": ["query"]
        }
      }
    ]
  }],
  "toolConfig": { "functionCallingConfig": { "mode": "AUTO" } }
}
```

**응답 (도구 호출):**
```json
{
  "candidates": [{
    "content": {
      "role": "model",
      "parts": [
        {
          "functionCall": {
            "name": "get_law_content",
            "args": {
              "lawId": "10007",
              "jo": "003800",
              "efYd": "20240101"
            }
          }
        }
      ]
    }
  }]
}
```

**도구 결과 피드백:**
```json
{
  "contents": [
    { "role": "user", "parts": [{ "text": "관세법 제38조가 2024년에 어떻게 바뀌었나?" }] },
    {
      "role": "model",
      "parts": [{
        "functionCall": {
          "name": "get_law_content",
          "args": { "lawId": "10007", "jo": "003800", "efYd": "20240101" }
        }
      }]
    },
    {
      "role": "user",
      "parts": [{
        "functionResponse": {
          "name": "get_law_content",
          "response": {
            "result": "{\"법령명\": \"관세법\", \"조문\": [{\"조번호\": \"제38조\", ...}]}"
          }
        }
      }]
    }
  ]
}
```

**응답 (최종 텍스트 — 도구 호출 없음 = 루프 종료):**
```json
{
  "candidates": [{
    "content": {
      "role": "model",
      "parts": [
        { "text": "관세법 제38조의 2024년 주요 변경사항은 다음과 같습니다:\n\n1. ..." }
      ]
    }
  }]
}
```

### 3-5. 도구 실행기 (Tool Executor)

```typescript
// lib/mcp-bot/tool-executor.ts

/**
 * 도구 이름으로 디스패치하여 실행
 * 기존 API route 로직을 함수로 추출하여 재활용
 */
export async function executeTool(
  name: string,
  args: Record<string, any>
): Promise<any> {

  switch (name) {
    case 'search_laws':
      return await searchLaws(args.query);

    case 'get_law_content':
      return await getLawContent(args.lawId, args.mst, args.jo, args.efYd);

    case 'search_precedents':
      return await searchPrecedents(args.query, args.caseNumber, args.court, args.display);

    case 'compare_laws':
      return await compareLaws(args.lawTitle, args.joNum, args.oldContent, args.newContent, args.isPrecedent);

    case 'get_delegation_hierarchy':
      return await getDelegationHierarchy(args.lawId, args.mst);

    case 'rag_search':
      return await ragSearch(args.query);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// 각 함수는 기존 API route의 핵심 로직을 추출한 것
// 예: searchLaws()는 app/api/law-search/route.ts의 법제처 API 호출 로직 재활용
```

### 3-6. 종료 조건 및 에러 핸들링

```typescript
// 종료 조건 (우선순위 순)
const TERMINATION_CONDITIONS = {
  // 1. 정상 종료: Gemini가 functionCall 없이 텍스트만 응답
  NATURAL_END: 'model responded with text only (no functionCall)',

  // 2. 최대 반복 도달: 강제로 최종 답변 생성 요청
  MAX_ITERATIONS: 'reached MAX_ITERATIONS (5), force finalize',

  // 3. 도구 실패 누적: 연속 2회 같은 도구 실패 시 해당 도구 제외
  TOOL_FAILURE: 'tool failed 2+ times consecutively, excluded from declarations',

  // 4. 빈 응답: Gemini가 빈 응답 반환
  EMPTY_RESPONSE: 'no candidates in response',
};

// 강제 최종 답변 요청
async function forceFinalize(
  contents: GeminiContent[],
  apiKey: string
): Promise<string> {
  // toolConfig.mode = "NONE"으로 설정하여 도구 호출 금지
  // → 반드시 텍스트 응답을 생성하도록 강제
  contents.push({
    role: 'user',
    parts: [{
      text: '지금까지 수집한 정보를 바탕으로 최종 답변을 작성해주세요.'
    }]
  });

  const response = await callGeminiWithTools(
    contents,
    '수집된 정보를 종합하여 정확하고 구체적인 답변을 작성하세요.',
    apiKey,
    { mode: 'NONE' }  // ← 도구 호출 금지
  );

  return response.candidates?.[0]?.content?.parts?.[0]?.text ?? '답변을 생성할 수 없습니다.';
}
```

---

## 📋 4. 시스템 프롬프트 설계

```typescript
// lib/mcp-bot/prompts.ts

export function buildSystemPrompt(analysis: RouterAnalysis): string {
  return `당신은 한국 법령 전문 AI 어시스턴트입니다.

## 역할
사용자의 법률 질문에 대해 제공된 도구를 활용하여 정확한 답변을 생성합니다.
필요한 정보를 단계적으로 수집한 후 종합적인 답변을 작성하세요.

## 도구 사용 전략

### 질문 유형별 권장 도구 조합
- **법령 내용 질문** → search_laws → get_law_content
- **법령 변경/비교** → get_law_content(구법 efYd) → get_law_content(현행) → compare_laws
- **판례 검색** → search_precedents → (필요시 rag_search 보완)
- **복합 질문** → 위 조합을 순차적으로
- **위임 체계** → search_laws → get_delegation_hierarchy
- **개념/해석** → rag_search → (필요시 search_precedents 보완)

### 주의사항
1. 도구는 **필요한 경우에만** 호출하세요. 불필요한 호출은 비용과 시간을 낭비합니다.
2. 한 번에 **관련된 도구를 병렬로** 호출할 수 있습니다 (Gemini parallel function calling).
3. 도구 결과가 부족하면 **다른 키워드나 도구**로 재시도하세요.
4. 충분한 정보를 수집했으면 **도구 호출 없이** 바로 답변하세요.
5. 조문 번호 변환: "제38조" → jo="003800", "제10조" → jo="001000"

## 쿼리 분석 결과 (Router Agent)
- 질문 유형: ${analysis.primaryType}
- 법률 도메인: ${analysis.domain}
- 복잡도: ${analysis.complexity}
- 추출된 법령: ${analysis.extractedLaws.join(', ') || '없음'}
- 추출된 조문: ${analysis.extractedArticles.join(', ') || '없음'}
- 의도: ${analysis.intent}
${analysis.subQuestions?.length ? `- 하위 질문:\n${analysis.subQuestions.map((q, i) => `  ${i + 1}. ${q}`).join('\n')}` : ''}

## 답변 형식
- 마크다운 형식으로 구조화된 답변
- 출처(법령명, 조문번호, 판례번호) 명시
- 핵심 내용을 먼저, 상세 내용은 후순위
`;
}

export function buildUserPrompt(query: string, analysis: RouterAnalysis): string {
  let prompt = query;

  // Router가 분해한 하위 질문이 있으면 힌트로 추가
  if (analysis.subQuestions?.length) {
    prompt += `\n\n[참고: 이 질문은 다음 하위 질문으로 분해될 수 있습니다]\n`;
    prompt += analysis.subQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n');
  }

  return prompt;
}
```

---

## 🔍 5. 복합 질문 처리 플로우 예시

### 예시: "관세법 제38조가 2024년에 어떻게 바뀌었고, 관련 판례는?"

```
사용자: "관세법 제38조가 2024년에 어떻게 바뀌었고, 관련 판례는?"

═══ Router Agent (기존 analyzeQuery) ═══
{
  primaryType: "comparison",
  secondaryType: "application",
  domain: "customs",
  complexity: "complex",
  extractedLaws: ["관세법"],
  extractedArticles: ["제38조"],
  subQuestions: [
    "관세법 제38조의 2024년 이전 내용은?",
    "관세법 제38조의 현행 내용은?",
    "관세법 제38조 관련 판례는?"
  ]
}

═══ Agent Loop 시작 ═══

── Iteration 1: 법령 검색 + 구법/현행 조회 ──
Gemini 판단: 관세법 ID를 알아야 하므로 먼저 검색

→ functionCall: search_laws({ query: "관세법" })
← result: { laws: [{ lawId: "10009", 법령명: "관세법", ... }], totalCount: 5 }

── Iteration 2: 구법과 현행 조문 동시 조회 ──
Gemini 판단: lawId 획득 → 두 시점 조문을 병렬 조회

→ functionCall: get_law_content({ lawId: "10009", jo: "003800", efYd: "20231231" })
→ functionCall: get_law_content({ lawId: "10009", jo: "003800" })
← result[0]: { 법령명: "관세법", 조문: [{ 조번호: "제38조", 본문: "구법 내용..." }] }
← result[1]: { 법령명: "관세법", 조문: [{ 조번호: "제38조", 본문: "현행 내용..." }] }

── Iteration 3: 판례 검색 ──
Gemini 판단: 법령 비교 정보 확보 → 판례 검색

→ functionCall: search_precedents({ query: "관세법 제38조 과세가격", court: "대법원" })
← result: { totalCount: 12, precedents: [{ caseNumber: "2023두54321", ... }, ...] }

── Iteration 4: 최종 답변 생성 (functionCall 없음 → 루프 종료) ──
Gemini 판단: 충분한 정보 수집 → 종합 답변 작성

← text: "## 관세법 제38조 2024년 개정 분석\n\n### 1. 핵심 변경사항\n..."
```

**실행 통계:**
| 항목 | 값 |
|------|-----|
| 총 반복 | 4회 |
| 도구 호출 | 5회 (search 1 + get_law 2 + precedent 1 + 최종 0) |
| Gemini API 콜 | 5회 (router 1 + loop 4) |
| 법제처 API 콜 | 4회 |
| 예상 소요시간 | ~8초 (법제처 API 평균 1초/건) |

### 예시 2: 단순 질문은 루프 1회로 종료

```
사용자: "상법에서 이사의 책임 요건은?"

═══ Router Agent ═══
{ primaryType: "requirement", complexity: "simple", ... }

═══ Agent Loop ═══

── Iteration 1: RAG 검색 1회 → 바로 답변 ──
→ functionCall: rag_search({ query: "상법 이사 책임 요건" })
← result: { answer: "...", citations: [...], confidenceLevel: "high" }

── Iteration 2: 최종 답변 (functionCall 없음 → 루프 종료) ──
← text: "상법상 이사의 책임 요건은 다음과 같습니다:\n..."

총 2회 반복, 도구 1회 호출 → 단순 질문은 빠르게 처리
```

---

## 📂 6. 기존 코드 재활용 맵

### 재활용 가능 (수정 없이 또는 최소 수정)

| 기존 파일 | 재활용 내용 | 수정 범위 |
|-----------|-----------|----------|
| `lib/ai-agents/router-agent.ts` | `analyzeQuery()` — 1단계 쿼리 분석 | 그대로 사용 |
| `lib/ai-agents/types.ts` | `RouterAnalysis`, `QueryType`, `LegalDomain` 등 | 그대로 사용 |
| `lib/ai-agents/specialist-agents.ts` | 전문가 프롬프트 8종 → 시스템 프롬프트 참고용 | 참고만 |
| `lib/ai-question-router.ts` | `routeQuestion()` → 엔트리포인트 패턴 참고 | 참고만 |
| `app/api/law-search/route.ts` | 법제처 lawSearch API 호출 로직 | 함수 추출 |
| `app/api/eflaw/route.ts` | 법제처 eflaw API 호출 + 날짜/JO 정규화 | 함수 추출 |
| `app/api/precedent-search/route.ts` | 판례 검색 + 법원/연도 자동 추출 | 함수 추출 |
| `app/api/summarize/route.ts` | Gemini 비교/요약 호출 | 함수 추출 |
| `app/api/three-tier/route.ts` | 위임법령 조회 | 함수 추출 |
| `lib/file-search-client.ts` | SSE 파싱, retry, citation 추출 | 함수 추출 |

### 새로 구현 필요

| 새 파일 (예상) | 역할 | LOC 예상 |
|--------------|------|---------|
| `lib/mcp-bot/agent-loop.ts` | 에이전트 루프 메인 | ~150 |
| `lib/mcp-bot/tool-definitions.ts` | 6개 도구 선언 | ~80 |
| `lib/mcp-bot/tool-executor.ts` | 도구 디스패처 + 각 API 호출 함수 | ~200 |
| `lib/mcp-bot/gemini-client.ts` | Gemini FC API 호출 래퍼 | ~60 |
| `lib/mcp-bot/prompts.ts` | 시스템/사용자 프롬프트 빌더 | ~80 |
| `lib/mcp-bot/types.ts` | 타입 정의 | ~50 |
| `app/api/mcp-bot/route.ts` | API 엔드포인트 (SSE) | ~80 |
| **합계** | | **~700 LOC** |

### 코드 추출 전략

기존 API route는 **HTTP 핸들러 + 비즈니스 로직**이 혼재되어 있다.
MCP Bot에서 재활용하려면 비즈니스 로직을 순수 함수로 추출해야 한다.

```
Before:
  app/api/law-search/route.ts (HTTP handler + 법제처 호출 + XML 파싱)

After:
  lib/legal-api/law-search.ts    ← 순수 함수 추출 (법제처 호출 + 파싱)
  app/api/law-search/route.ts    ← HTTP 래퍼 (import & 호출)
  lib/mcp-bot/tool-executor.ts   ← MCP 도구에서도 같은 함수 호출
```

이 리팩토링은 선택적이며, 초기에는 `tool-executor.ts`에서 내부 API를 HTTP로 호출하는 방식도 가능하다:

```typescript
// 간단한 방식: 내부 API를 HTTP로 호출
async function searchLaws(query: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/law-search?query=${encodeURIComponent(query)}`);
  return res.json();
}

// 최적 방식: 비즈니스 로직 함수를 직접 호출 (네트워크 오버헤드 제거)
import { searchLawsFromLawGoKr } from '@/lib/legal-api/law-search';
async function searchLaws(query: string) {
  return searchLawsFromLawGoKr(query);
}
```

---

## ⚖️ 7. 트레이드오프 분석

### 비용

| 항목 | 현재 | 제안 | 비고 |
|------|------|------|------|
| Gemini API 콜/질문 | 2회 | 2~6회 | Flash는 저렴 ($0.15/1M input) |
| 법제처 API 콜/질문 | 0회 | 1~4회 | 무료 API (rate limit 주의) |
| 월 예상 비용 증가 | - | +50~100% | Flash 기준, 복합 질문 비율에 따라 |

### 레이턴시

| 시나리오 | 현재 | 제안 |
|---------|------|------|
| 단순 질문 | 2~4초 | 3~5초 (+1초 오버헤드) |
| 복합 질문 | 3~5초 (불완전 답변) | 8~15초 (완전한 답변) |
| 최악 케이스 | 6초 | 20초 (5회 반복) |

### 답변 품질

| 측면 | 현재 | 제안 |
|------|------|------|
| 단순 법령 조회 | ★★★★ | ★★★★ (동일) |
| 복합 비교 질문 | ★★☆☆ | ★★★★★ |
| 법령 + 판례 융합 | ★★☆☆ | ★★★★☆ |
| 최신 법령 정확도 | ★★★☆ (RAG 의존) | ★★★★★ (실시간 API) |
| 위임 체계 질문 | ★☆☆☆ | ★★★★☆ |

### Do's and Don'ts

**DO:**
- 기존 `analyzeQuery()` 결과를 1단계로 **반드시** 재활용 (중복 분석 방지)
- `complexity: "simple"` 질문은 루프 없이 기존 RAG로 **바이패스** 고려
- 도구 결과 크기 제한 (조문 전체 대신 필요한 조문만 `jo` 파라미터로)
- SSE 스트리밍으로 중간 상태 표시 ("법령 검색 중...", "판례 조회 중...")

**DON'T:**
- 매 반복마다 전체 법령 원문 조회 (토큰 낭비) → `jo` 파라미터 활용
- `MAX_ITERATIONS`을 10 이상으로 설정 (비용 폭발 + 무한 루프 위험)
- 도구 결과를 그대로 최종 답변에 포함 (가공/요약 필요)
- 병렬 호출 시 상호 의존적인 도구를 동시에 호출 (결과 참조 불가)

---

## 🔗 8. 회사 구현체 비교 포인트 체크리스트

내일 비교 분석 시 아래 항목들을 기준으로 검토:

### 아키텍처 수준

| 비교 항목 | LexDiff MCP Bot | 회사 구현체 |
|-----------|----------------|------------|
| 에이전트 루프 방식 (while/재귀/이벤트) | while 루프 | ? |
| LLM provider (Gemini/OpenAI/Claude) | Gemini 2.5 Flash | ? |
| 도구 프로토콜 (native FC/MCP/custom) | Gemini native FC | ? |
| 도구 등록 방식 (정적/동적/외부 서버) | 정적 declarations | ? |
| 최대 반복 횟수 | 5회 | ? |
| 종료 조건 | no FC + text / max iter / error | ? |
| 멀티턴 히스토리 관리 | contents 배열 누적 | ? |
| 병렬 도구 호출 지원 | Gemini parallel FC | ? |
| 에러 복구 전략 | 도구 제외 + fallback | ? |

### 구현 수준

| 비교 항목 | LexDiff MCP Bot | 회사 구현체 |
|-----------|----------------|------------|
| 언어/프레임워크 | TypeScript / Next.js | ? |
| 예상 코드량 | ~700 LOC | ? |
| 도구 수 | 6개 | ? |
| 도구 실행 방식 (내부 함수/HTTP/MCP) | 내부 함수 호출 | ? |
| 프롬프트 관리 (하드코딩/템플릿/DB) | 템플릿 함수 | ? |
| 스트리밍 지원 | SSE (기존 패턴) | ? |
| 모니터링/로깅 | toolCallLog 배열 | ? |
| 테스트 전략 | 도구 mock + 루프 테스트 | ? |

### 성능/운영 수준

| 비교 항목 | LexDiff MCP Bot | 회사 구현체 |
|-----------|----------------|------------|
| 평균 응답 시간 (단순/복합) | 3~5초 / 8~15초 | ? |
| API 비용 구조 | Gemini Flash (저렴) | ? |
| 외부 API 의존도 | 법제처 API (무료, rate limit) | ? |
| 캐싱 전략 | API route 캐시 재활용 | ? |
| Rate limiting | IP 기반 (기존) | ? |
| 장애 대응 (외부 API 다운 시) | fallback to RAG-only | ? |

---

## 📐 9. 파일 구조 (예상)

```
lib/
├── mcp-bot/
│   ├── agent-loop.ts          # 에이전트 루프 메인
│   ├── tool-definitions.ts    # 6개 도구 선언 (function_declarations)
│   ├── tool-executor.ts       # 도구 디스패처 + 실행
│   ├── gemini-client.ts       # Gemini FC API 호출 래퍼
│   ├── prompts.ts             # 시스템/사용자 프롬프트 빌더
│   └── types.ts               # 타입 정의
│
├── ai-agents/                 # 기존 (수정 없이 재활용)
│   ├── router-agent.ts        # analyzeQuery() ← 1단계 재활용
│   ├── specialist-agents.ts   # 전문가 프롬프트 ← 참고용
│   └── types.ts               # RouterAnalysis 등 ← 공유
│
app/api/
├── mcp-bot/
│   └── route.ts               # MCP Bot API 엔드포인트 (SSE)
│
├── law-search/route.ts        # 기존 (로직 추출 대상)
├── eflaw/route.ts             # 기존 (로직 추출 대상)
├── precedent-search/route.ts  # 기존 (로직 추출 대상)
├── summarize/route.ts         # 기존 (로직 추출 대상)
├── three-tier/route.ts        # 기존 (로직 추출 대상)
└── file-search-rag/route.ts   # 기존 (로직 추출 대상)
```

---

## 🚨 10. 구현 시 주의사항

### 🔴 CRITICAL

1. **JO 코드 변환**: `"제38조"` → `"003800"` — 반드시 `lib/law-parser.ts`의 기존 로직 사용
2. **SSE 버퍼 잔여 처리**: 기존 `file-search-client.ts`의 루프 후 잔여 버퍼 처리 패턴 준수
3. **법제처 API rate limit**: 병렬 호출 시 동시 요청 수 제한 (3~5개)
4. **토큰 관리**: 도구 결과가 길면 잘라내기 (maxResultTokens 설정)
5. **Gemini FC 형식**: `functionResponse`는 반드시 `role: "user"`의 parts에 포함

### ⚠️ 실수 사례

```typescript
// ❌ 잘못: functionResponse를 model role로 보냄
contents.push({ role: 'model', parts: [{ functionResponse: ... }] });

// ✅ 올바름: functionResponse는 user role
contents.push({ role: 'user', parts: [{ functionResponse: ... }] });
```

```typescript
// ❌ 잘못: 도구 결과를 객체로 직접 전달
functionResponse: { name: "search_laws", response: { laws: [...] } }

// ✅ 올바름: 결과를 문자열로 직렬화
functionResponse: { name: "search_laws", response: { result: JSON.stringify({ laws: [...] }) } }
```

```typescript
// ❌ 잘못: 매 반복마다 전체 법령 조회 (토큰 폭발)
get_law_content({ lawId: "10009" })  // 전체 법령 = 수만 토큰

// ✅ 올바름: 필요한 조문만 조회
get_law_content({ lawId: "10009", jo: "003800" })  // 특정 조문만
```

---

## 📚 참고 자료

| 자료 | 링크/경로 |
|------|----------|
| Nanobot 소스코드 | https://github.com/HKUDS/nanobot |
| Gemini Function Calling | https://ai.google.dev/gemini-api/docs/function-calling |
| LexDiff RAG 아키텍처 | `important-docs/05-RAG_ARCHITECTURE.md` |
| LexDiff 컴포넌트 구조 | `important-docs/09-COMPONENT_ARCHITECTURE.md` |
| LexDiff 법률 데이터 API | `important-docs/07-LEGAL_DATA_API_GUIDE.md` |
| 기존 Router Agent | `lib/ai-agents/router-agent.ts` |

---

**v1.0** | 2026-02-25 | 설계 문서 (구현 전 비교 분석용)
