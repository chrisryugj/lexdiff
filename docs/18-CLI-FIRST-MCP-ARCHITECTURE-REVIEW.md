# CLI-first, MCP-compatible 아키텍처 검증 분석

> **작성일**: 2026-03-11
> **목적**: "CLI-first, MCP-compatible" 제안을 LexDiff 프로젝트 기준으로 전문가 관점 검증
> **결론**: Core-first, Web-primary, CLI-ops, MCP-adapter

---

## 1. 검증 대상: 제안 요약

"MCP는 죽고 CLI가 대세" 논의에서 도출된 방향:

| 축 | 제안 내용 |
|---|---|
| CLI | ingest, diff, verify, eval, backfill, graph build 등 운영 인터페이스 |
| MCP | Codex/Claude/ChatGPT/IDE 연결용 표준 어댑터 |
| 코어 | transport 분리된 순수 라이브러리 |

원래 점수: CLI-first + MCP wrapper = 92/100

---

## 2. 현 프로젝트 구조 팩트 체크

### 2.1 실제 아키텍처

```
┌─ HTTP Layer ─────────────────────────────────┐
│ app/api/fc-rag/route.ts (SSE)                │
│ app/api/* (38개 라우트, 법제처 API 직접 호출) │
└──────────────────────────────────────────────┘
         ↓
┌─ RAG Engine Layer ───────────────────────────┐
│ lib/fc-rag/engine.ts (1011줄, 멀티턴 루프)   │
│ lib/fc-rag/tool-adapter.ts (403줄, MCP 어댑트)│
│ lib/fc-rag/prompts.ts (153줄, 순수 로직)     │
└──────────────────────────────────────────────┘
         ↓
┌─ Core Logic Layer ───────────────────────────┐
│ lib/law-parser.ts (JO 변환, 순수)            │
│ lib/unified-link-generator.ts (링크, 순수)    │
│ lib/citation-verifier.ts (인용검증, 순수)     │
└──────────────────────────────────────────────┘
         ↓
┌─ External ───────────────────────────────────┐
│ korean-law-mcp (npm 라이브러리로 임베드)      │
│ Gemini 2.5 Flash API                          │
└──────────────────────────────────────────────┘
```

### 2.2 핵심 발견사항

**MCP 사용 방식**: korean-law-mcp를 MCP 프로토콜(stdio/http)로 연결하지 않고, npm 패키지로 직접 import해서 사용 중. `.mcp.json`에도 등록 안 됨.

```typescript
// tool-adapter.ts - 실제 코드
import { LawApiClient } from 'korean-law-mcp/build/lib/api-client.js'
import { searchLaw } from 'korean-law-mcp/build/tools/search.js'
```

**분리도 현황**:

| 계층 | MCP 비의존도 | 평가 |
|------|------------|------|
| Core Logic (law-parser, link-gen, citation) | 100% | 완전 분리 |
| Engine 비즈니스 로직 (Fast Path, rerank, MST보정) | 85% | 우수 |
| Tool Adapter | 0% (의도적) | 단일 접점 |
| API Routes (38개) | 대부분 법제처 직접 호출 | MCP 무관 |

**CLI 관련**: 현재 CLI 인터페이스 전혀 없음. 100% 웹앱(Next.js) 전용.

---

## 3. 전문가 검증: 제안의 타당성

### 3.1 "CLI-first" 주장 검증

#### 동의하는 부분

법률 RAG의 운영(ops) 측면에서 CLI가 압도적으로 유리한 것은 사실:

| 운영 작업 | CLI 적합도 | 웹 UI 적합도 | 이유 |
|----------|-----------|-------------|------|
| 배치 인제스트 (법령 DB 구축) | 95 | 20 | 수천 법령 자동화 |
| 개정 diff/검증 | 90 | 40 | 스크립트 파이프라인 |
| 골든셋 평가 (RAGAS) | 95 | 30 | CI/CD 통합 |
| 그래프 빌드 (Neo4j) | 90 | 20 | 장시간 배치 |
| 증분 동기화 (delta sync) | 95 | 10 | cron 스케줄링 |

#### 반론

**LexDiff는 운영 도구가 아니라 엔드유저 검색 서비스.**

현재 프로젝트의 38개 API 라우트 중:
- **웹 UI 전용** (CLI 대체 불가): ~15개 (HTML 렌더링, HWP 변환, 자동완성, 별표 뷰어)
- **CLI 대체 가능**: ~20개 (단순 CRUD 조회)
- **하이브리드**: ~3개 (FC-RAG, 요약)

이 프로젝트의 주 가치는 "법률 전문가가 브라우저에서 법령을 검색/비교/AI질의하는 것"이지, "개발자가 터미널에서 법령 데이터를 조작하는 것"이 아님.

CLI-first를 도입한다면 **별도의 운영 도구**로서이지, 현재 웹앱을 CLI로 전환하는 것이 아님.

### 3.2 "MCP-compatible" 주장 검증

#### 동의하는 부분

MCP를 표준 어댑터로 유지하는 것은 전략적으로 올바름:
- Claude Code, Codex, ChatGPT 모두 MCP 지원
- 법령 도구를 IDE에서 직접 쓸 수 있는 확장성
- korean-law-mcp가 이미 존재하므로 추가 투자 최소

#### 현실 점검

현재 korean-law-mcp는 MCP 프로토콜로 쓰이고 있지 않다. 실제로는 npm 패키지의 내부 함수를 직접 호출하는 라이브러리 패턴. MCP 프로토콜(stdio/http)은 사용하지 않음. 이것 자체가 나쁜 건 아님 — 오히려 latency 면에서 유리 (IPC 오버헤드 없음).

"MCP-compatible"을 주장하려면:
1. korean-law-mcp를 실제로 stdio/http MCP 서버로도 실행 가능하게 유지
2. LexDiff 내부에서는 직접 import (성능), 외부에서는 MCP 프로토콜 (호환성)
3. 이 이중 접근은 이미 업계 표준 패턴

### 3.3 "코어 분리" 주장 검증

현재 구조에서 **가장 개선이 필요한 영역** — 강하게 동의:

```
현재 문제:
app/api/law-search/route.ts = HTTP 핸들러 + XML 파싱 + 정규화 + 캐싱
app/api/eflaw/route.ts = HTTP 핸들러 + 조문 파싱 + 시행일 처리
→ 비즈니스 로직이 HTTP 레이어에 갇혀 있음
→ CLI/MCP/테스트에서 재사용 불가
```

---

## 4. 점수 재평가

### LexDiff 맥락에서의 재채점

| 전략 | 범용 점수 | LexDiff 보정 점수 | 이유 |
|------|---------|-----------------|------|
| MCP-only | 68 | 65 | LexDiff는 이미 MCP를 라이브러리로만 씀 |
| CLI-only | 74 | 45 | 웹 서비스가 핵심이므로 CLI-only는 부적절 |
| CLI-first + MCP wrapper | 92 | **78** | CLI ops 레이어 가치는 있지만, 이 프로젝트의 코어는 웹 |
| **Web-first + CLI ops + MCP adapter** | - | **91** | 현실에 맞는 최적 조합 |

### 왜 "Web-first"인가

LexDiff의 사용자 = 법률 전문가 (변호사, 법무사, 공무원)
- 이들은 CLI를 쓰지 않음
- 브라우저에서 법령 검색 → AI 질의 → 판례 확인이 핵심 워크플로우
- SSE 스트리밍, 인용 검증 UI, 조문 하이라이트 등은 웹 전용 가치

CLI의 가치는 개발자/운영자 입장에서:
- 법령 데이터 인제스트, 평가 자동화, 그래프 빌드
- 이것은 "법령 운영 도구"이지, "법령 검색 서비스"가 아님

---

## 5. 최종 검증 결론

### 5.1 채택 권장 사항

| # | 제안 | 타당성 | 근거 |
|---|------|--------|------|
| 1 | 핵심 법령 로직을 transport와 분리 | **강하게 동의** | API route에 갇힌 비즈니스 로직 해방 필요 |
| 2 | MCP를 표준 어댑터로 유지 | **동의** | korean-law-mcp 이미 존재, 외부 연동 가치 있음 |
| 3 | "MCP에 운영까지 떠넘기는 구조"가 죽어야 함 | **동의** | 정확한 진단 |
| 4 | CLI로 운영 인터페이스 구축 | **조건부 동의** | 별도 운영 도구로서 가치 있음 (웹 대체 아님) |

### 5.2 수정 필요 사항

| # | 원래 제안 | 수정 제안 | 이유 |
|---|----------|----------|------|
| 1 | "CLI-first" | **"Web-first, CLI-ops"** | 엔드유저는 웹, 운영은 CLI |
| 2 | CLI = 주력 운영 인터페이스 | CLI = **보조** 운영 인터페이스 | 현재 팀 규모(1인)에서 CLI ops 투자 대비 효과 의문 |
| 3 | 92/100 점수 | **78/100** (이 프로젝트 기준) | 범용 법률 RAG에는 맞지만 LexDiff 특화시 과대 |

### 5.3 이 프로젝트에 맞는 실제 우선순위

```
1순위: 코어 로직 분리 (lib/legal-core/)
  → API route의 비즈니스 로직을 순수 함수로 추출
  → 테스트 가능성 + MCP/CLI/웹 재사용성 확보
  → ROI 가장 높음 (현재 가장 큰 기술 부채)

2순위: MCP 어댑터 유지/강화
  → korean-law-mcp의 stdio 서버 모드 정상 작동 확인
  → Claude Code/.mcp.json에서 직접 사용 가능하도록
  → 이미 있는 자산 활용, 추가 투자 최소

3순위: CLI ops 도구 (선택적)
  → GraphRAG 도입 시 ingest/eval CLI 필요해짐
  → 현재 시점에서는 미착수가 합리적
  → GraphRAG Phase 0(베이스라인 측정) 시작 시 함께 구축
```

### 5.4 한 줄 결론

> **제안의 방향은 올바르지만, "CLI-first"가 아니라 "Core-first, Web-primary, CLI-ops, MCP-adapter"가 이 프로젝트의 정답이다.**
> 가장 시급한 건 CLI 도입이 아니라 **API route에 갇힌 법령 비즈니스 로직의 순수 함수 추출**이다.

---

## 6. 세계적 법령 RAG 관점에서의 추가 소견

### 6.1 법령 RAG는 "검색"이 아니라 "해석 보조"

글로벌 법률 AI (Casetext/CoCounsel, Harvey, Luminance) 트렌드:
- 검색 정확도보다 **법적 추론의 투명성**이 더 중요
- Citation verification, evidence chain, confidence scoring이 핵심 차별화
- LexDiff의 인용 검증(citation-verifier.ts)은 올바른 방향

### 6.2 Transport 논쟁보다 중요한 것

법령 RAG에서 진짜 어려운 문제:
1. **효력 시점 기준 조회** — 어느 시점의 법령이 적용되는가?
2. **위임 체계 추적** — 법률→시행령→시행규칙→고시 연결
3. **판례-조문 매핑** — 어떤 판례가 어떤 조문을 해석했는가?
4. **개정 영향 분석** — 이 조문이 바뀌면 어떤 하위법령이 영향받는가?

이 4가지는 MCP든 CLI든 웹이든 **데이터 레이어**의 문제. GraphRAG(Neo4j)가 이걸 해결하는 올바른 도구이고, 이 프로젝트의 설계문서(14/15/17)가 이미 이 방향을 잡고 있음.

### 6.3 투자 우선순위 (법령 RAG 전문가 관점)

```
1. 법령 그래프 구축 (Neo4j)     → 데이터 품질 = 답변 품질
2. 코어 로직 분리              → 재사용성 = 개발 속도
3. 평가 체계 (골든셋+RAGAS)     → 측정 없이 개선 없음
4. MCP 어댑터 유지             → 생태계 연결 = 확장성
5. CLI ops                    → GraphRAG 도입 시 자연스럽게 필요
```

---

## 참고 자료

- [MCP 공식 문서](https://modelcontextprotocol.io/docs/getting-started/intro)
- [OpenAI Codex MCP 지원](https://developers.openai.com/codex/mcp)
- [Claude Code MCP 문서](https://code.claude.com/docs/en/mcp)
- 프로젝트 내부: `important-docs/11-LEGAL_MCP_BOT_ARCHITECTURE.md`
- 프로젝트 내부: `docs/17-LEGAL-AI-GRAPHRAG-PRD.md`
- 프로젝트 내부: `important-docs/15-GRAPHRAG_UNIFIED_PLAN.md`
