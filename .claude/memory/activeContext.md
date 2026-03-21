# Active Context

**마지막 업데이트**: 2026-03-21 (Phase 3 E2E 품질테스트 완료 + 재시도 로직 + 양방향 Impact Tracker 검증)

## 현재 상태

**Phase 3 E2E 품질테스트 완료.** 4 커밋 (e22c5ed → 835bb7d → 021d512 → 미커밋). 공무원 10/10 통과, 멀티턴 3턴 통과, Impact Tracker A/B 양방향 정상.

## 프로젝트 관계 (중요!)

| 레포 | 역할 | 실행 환경 |
|------|------|----------|
| **lexdiff** | 웹앱 (Next.js) — 자체 FC-RAG 엔진 (`lib/fc-rag/`) | Vercel/로컬 |
| **chrisbot** (`github.com/chrisryugj/chrisbot`) | 미니PC 봇 — Bridge + Gateway | 미니PC (Mong NAS) |

### ✅ 완료된 작업 (2026-03-21 이번 세션)

| 작업 | 파일 | 상태 |
|------|------|------|
| 징계감경 기대값 완화 (징계령 추가) | `scripts/e2e-civil-servant.mjs` | 미커밋 |
| E2E 타임아웃 180s→300s | `scripts/e2e-civil-servant.mjs` | 미커밋 |
| Claude CLI transient error 1회 재시도 | `app/api/fc-rag/route.ts` | 미커밋 |
| 공무원 실무 10/10 통과 (A:9, B:1) | 테스트 결과 | ✅ |
| 멀티턴 3턴 연속 통과 | 테스트 결과 | ✅ |
| Impact Tracker A방향 (근로기준법 5.7s) | 테스트 결과 | ✅ |
| Impact Tracker B방향 (광진구 주차장 조례 28.7s, 49건) | 테스트 결과 | ✅ |

### ✅ 이전 커밋 작업 (Phase 3)

| 작업 | 파일 | 커밋 |
|------|------|------|
| citation-verifier 배치 인덱스 버그 수정 | `citation-verifier.ts:115` | e22c5ed |
| fetch 10s 타임아웃 추가 | `citation-verifier.ts:148,231` | e22c5ed |
| citation 배치 3→10 | `citation-verifier.ts:110` | 835bb7d |
| quality-evaluator chain 가중치 2배 | `quality-evaluator.ts:62-76` | e22c5ed |
| 인용 패턴 확장 (OO법 제N조 인식) | `quality-evaluator.ts:43` | e22c5ed |
| 주차장/주차 → construction 도메인 | `tool-tiers.ts:82` | e22c5ed |
| 지역명 → ordinance 컨텍스트 | `tool-tiers.ts:98` | e22c5ed |
| Claude max-turns 복잡도별 5/8/12 | `engine.ts:108-114` | 835bb7d |
| 분류기 기반 pre-evidence 수집 | `engine.ts:284-332` | 835bb7d |
| moderate "참고자료 모드" (턴 제한 해제) | `engine.ts:346-365` | 021d512 |
| queryType별 보충: consequence→벌칙편 | `engine.ts:318-325` | 021d512 |
| queryType별 보충: scope→별표 | `engine.ts:326-332` | 021d512 |
| Gemini thought_signature 호환 | `engine.ts:885-896` | 835bb7d |
| inferComplexity 벌칙/요건→moderate | `engine.ts:938` | 835bb7d |
| 멀티턴 conversationStore (인메모리) | `engine.ts:30-57` | 021d512 |
| search_ai_law 캐시 3h→12h | `tool-adapter.ts:145` | 835bb7d |
| KNOWN_MST 프리로드 74→81 법령 | `fast-path.ts:73-74` | 835bb7d |
| 프롬프트 속도 지침 추가 | `prompts.ts:172-175` | 835bb7d |
| E2E 테스트 스크립트 (5 도메인) | `scripts/e2e-fcrag-test.mjs` | e22c5ed |
| 공무원 실무 테스트 (10 시나리오) | `scripts/e2e-civil-servant.mjs` | 021d512 |

### 📋 다음 할 일

**AI 기능 추가 검증**:
- [ ] Benchmark Analyze: 5개 이상 지자체 비교 안정성

**P3 잔여 (3차 리뷰에서 이월)**:
- [ ] useSearchState 45개 useState → zustand 전환
- [ ] Gemini generateContent → generateContentStream (answer_token)
- [ ] tool-adapter.ts 분리 (~1000줄)

## E2E 테스트 결과 요약

### 기본 5개 도메인
| 도메인 | 도구 | 인용 | 품질 | 검증 |
|--------|------|------|------|------|
| 관세 | ✅ | ✅ | high | 7/7 |
| 노동 | ✅ | ✅ | high | 4/4 |
| 세무 | ✅ | ✅ | high | 3/3 |
| 공무원 | ✅ | ✅ | high | - |
| 건설 | ✅ | ✅ | high | - |

### 공무원 실무 10개 (최신)
**10/10 통과** — A등급 9개, B등급 1개(출장비), F등급 0개

### 멀티턴
"근로기준법 제26조" → "위반 벌칙?" → "해고예고 수당 얼마?" → ✅ 3턴 컨텍스트 유지

### Impact Tracker
| 방향 | 입력 | 시간 | 변경 | 에러 |
|------|------|------|------|------|
| A (상위→하위) | 근로기준법 | 5.7s | 6건 | 0 |
| B (조례→상위) | 광진구 주차장 조례 | 28.7s | 49건 | 0 |

## 핵심 파일

| 파일 | 역할 |
|------|------|
| `lib/fc-rag/engine.ts` | 메인 RAG 엔진 (pre-evidence, conversationStore, 분류기 라우팅) |
| `lib/fc-rag/anthropic-client.ts` | Claude CLI subprocess (stream-json) |
| `lib/fc-rag/tool-tiers.ts` | 도메인 감지 + 도구 선택 (17 도메인) |
| `lib/fc-rag/quality-evaluator.ts` | 응답 품질 평가 (chain 가중치) |
| `lib/fc-rag/fast-path.ts` | 단순 패턴 LLM 바이패스 (81 법령 프리로드) |
| `lib/fc-rag/prompts.ts` | 시스템 프롬프트 (속도 지침 포함) |
| `lib/fc-rag/tool-adapter.ts` | 도구 정의/스키마/실행/캐시 (12h AI검색) |
| `lib/citation-verifier.ts` | 인용 실존 검증 (배치 10, 10s 타임아웃) |
| `app/api/fc-rag/route.ts` | API 라우트 (Claude→Gemini 폴백 + 재시도) |
| `app/api/impact-tracker/route.ts` | 법령변경영향분석 SSE |
| `app/api/benchmark-analyze/route.ts` | 조례간 AI 비교 |
| `scripts/e2e-fcrag-test.mjs` | 5 도메인 E2E (--parallel, --fast) |
| `scripts/e2e-civil-servant.mjs` | 10 공무원 실무 E2E (--pick, --parallel) |
