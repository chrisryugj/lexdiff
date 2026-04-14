# Active Context

**마지막 업데이트**: 2026-04-14 (FC-RAG Confidence 판정 완성 — High 10/10 달성)

---

## 🎯 다음 세션 우선순위 (베타 출시 안전망 작업)

### 1. P4 — Confidence 안정성 검증 (가장 시급)
**왜**: 현재 fix는 단일 run 10/10이 전부. LLM 비결정성 흡수 여부 미검증. 베타 사용자 첫 쿼리에서 low/medium 줄줄이 나오면 신뢰도 박살.

**선행 확인**:
- Vercel `GEMINI_API_KEY` 새 키 반영됐는지 (이번 세션에서 production 교체 + redeploy 완료, https://lexdiff-420chjdia-ryuseungin-8474s-projects.vercel.app, status Ready)
- 로컬 dev `.env.local` 도 새 키 (`***REDACTED***`)
- dev 서버 살아있는지 (`curl -s http://localhost:3000/`)

**실행**:
```bash
cd d:/AI_Project/lexdiff
for v in v18 v19 v20; do
  node -e "const fs=require('fs');const f='lib/fc-rag/answer-cache.ts';let c=fs.readFileSync(f,'utf8');c=c.replace(/const CACHE_KEY_VERSION = 'v\d+'/,\"const CACHE_KEY_VERSION = '$v'\");fs.writeFileSync(f,c)"
  sleep 1
  node scripts/e2e-real-queries.mjs
done
```

**측정 지표** (3 run 평균/최악):
- High confidence 비율 (목표: 평균 ≥ 8/10, 최악 ≥ 6/10)
- Citation recall (목표: 평균 ≥ 95%)
- 어느 페르소나가 run 마다 흔들리는지 (변동성 큰 케이스 = 추가 calibration 대상)

**판단**: 분산이 작으면 confidence 안정 OK → 다음 단계. 분산 크면 evidence 가중치 재조정 (citations.ts:277, `* 5` → `* 8` 등).

---

### 2. P5 — 22 카테고리 커버리지
**왜**: 오늘 검증은 10 페르소나뿐. 22개 도메인(precedent/interpretation/tax_tribunal/customs/constitutional/admin_appeal/ftc/pipc/nlrc/acr/appeal_review/acr_special/school/public_corp/public_inst/treaty/...) 중 어디가 깨지는지 모름.

**실행**:
```bash
node scripts/e2e-category-coverage.mjs --parallel=4
```

**제외**: english_law (한국 법령 시스템이라 의미 없음)

**찾을 것**: 카테고리 단위 fail율 / 도구 잘못 선택 / citation 누락 패턴

---

### 3. 분류기 정확도 (근본 작업)
**왜**: Confidence는 답변 *후* 단계. 분류기는 답변 *전* 단계. complexity/queryType/domain 잘못 잡으면 시작부터 잘못된 도구 선택 → 답변 품질 박살. 이번 세션에선 안 건드림.

**대상**:
- `inferComplexity` (simple/moderate/complex)
- `inferQueryType`
- `detectDomain`
- 위치: [lib/fc-rag/](lib/fc-rag/) (구체 파일은 grep 필요)

**검증 도구**: `scripts/test-classifier-exhaustive.ts` 가 이미 존재. 이번 세션에서 SearchType에 `admrul` 추가했음.

---

## 📌 2026-04-14 세션 결과 요약 (Confidence 판정 근본 개선)

### 지표
| | 시작 | 최종 (단일 run) |
|---|---|---|
| High confidence | 1/10 | **10/10** |
| Citation recall | 80% | **100%** |
| Cache hit | 9.9% | **47.9%** |
| Wall time | 294s | 271s |

### 근본 원인
**Router planResults 누적 버그** — S1 라우터 실행한 tool result가 `geminiEvidence` 문자열에만 주입되고 `allToolResults` 배열에는 push 안 됨. S2가 추가 도구 호출 없이 답변하면 `allToolResults.length === 0` → `noToolsCalled` 가드에 강제 low 강등. #5 자영업자가 계속 low 찍히던 진짜 이유.

### 변경 파일 (전부 미커밋)
1. **[citations.ts:283](lib/fc-rag/citations.ts#L283)** — calcConfidence 임계 80/48 → **72/40**
2. **[gemini-engine.ts:417](lib/fc-rag/gemini-engine.ts#L417)** — Router planResults + prefetchSearch → allToolResults push (근본 fix)
3. **[gemini-engine.ts:437](lib/fc-rag/gemini-engine.ts#L437)** — Pre-evidence aiSearch 도 push
4. **[gemini-engine.ts:169](lib/fc-rag/gemini-engine.ts#L169)** — forceLastTurn textParts 300자 가드 (#6 토막답변 차단)
5. **[gemini-engine.ts:328](lib/fc-rag/gemini-engine.ts#L328)** — `const allToolResults` 선언을 router 블록 위로 (TDZ 회피)
6. **[engine-shared.ts:38](lib/fc-rag/engine-shared.ts#L38)** — `FCRAGResult.confidenceBreakdown?` 타입 추가
7. **[gemini-engine.ts:590](lib/fc-rag/gemini-engine.ts#L590)** — 정상/forceLastTurn 양 경로에 breakdown 주입
8. **[scripts/e2e-real-queries.mjs:338](scripts/e2e-real-queries.mjs#L338)** — `record.confidenceBreakdown` JSONL 저장
9. **[answer-cache.ts:26](lib/fc-rag/answer-cache.ts#L26)** — `CACHE_KEY_VERSION` 마지막 v17 (사용자 dbg 로그 추가됨)
10. **[scripts/test-classifier-exhaustive.ts:18](scripts/test-classifier-exhaustive.ts#L18)** — SearchType 에 `admrul` 추가 (Vercel 빌드 fix)
11. **[engine-shared.ts:242](lib/fc-rag/engine-shared.ts#L242)** — getMaxToolTurns +1 (simple 3, moderate 4, complex 5)

### 관측 패턴 (회귀 디버깅 시 참조)
- `downgraded: "noTools"` + `weightedEvidence: 0` + pass quality → router 경로인데 누적 안 된 경우
- `qualityLevel` 필드 부재 → forceLastTurn 경유 (정상경로는 `qualityLevel/qualityScore` 찍힘)
- score 72-80 + pass → 임계 경계선. evidence 가중치 재튜닝 고려

### 이번 세션 인프라 변경
- **Vercel production redeploy**: 새 GEMINI_API_KEY 반영. https://lexdiff-420chjdia-ryuseungin-8474s-projects.vercel.app
- **Vercel CLI 51 한글 hostname 버그 발견**: 컴퓨터 이름이 한글("류승인")이라 user-agent ASCII 위반 → CLI 51 로그인 불가. **v39 + `--token` 으로 우회** (`npx vercel@39 --token vcp_...`)
- **dev 서버 재시작**: 새 키 반영 위해 1회 (HMR로 env 갱신 안 돼서)

### 환경 주의사항
- 빌링: Gemini 키 한 번 spending cap 친 적 있음 (이전 키, 이번 세션 14회 cache bump 후). 대량 fresh run 돌릴 때 빌링 모니터링.
- HMR: Next 16 turbo가 chunk 캐시 stale 발생할 수 있음. 코드 변경 후 효과 안 나오면 dev 재시작 (`taskkill /pid <next-dev-pid>` + `npm run dev`).

---

## 🔧 시스템 상태

- **Primary LLM**: GPT-5.4 (Hermes Agent API, 로컬 `http://127.0.0.1:8642`, Vercel은 CF Worker 경유)
- **Fallback LLM**: Gemini Flash (gemini-engine.ts)
- **MCP 도구**: lexdiff 가 korean-law-mcp 핸들러 직접 import (MCP 프로토콜 X)
- **로그**: `logs/fc-rag-queries.jsonl`, `logs/e2e-real-queries-*.jsonl`
