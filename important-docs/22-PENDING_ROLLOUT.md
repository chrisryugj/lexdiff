# 배포 대기 작업 (Phase 3 이후)

> **상태**: 코드는 모두 main에 병합 완료 (커밋 `0d00dd4` / `ef7c751` / `8066b14`).
> 아래 항목들은 **환경변수/시크릿 등록만** 남은 인프라 작업. 지금 당장 하지 않아도 프로덕션은 정상 동작 중.

---

## 1. GitHub Secrets — Weekly RAG 평가 자동화

**우선순위**: 낮음 (없어도 weekly workflow만 실패, 프로덕션 영향 없음)
**소요**: ~5분
**관련 파일**: [.github/workflows/rag-eval-weekly.yml](../.github/workflows/rag-eval-weekly.yml)

### 등록 위치
GitHub 레포 → Settings → Secrets and variables → Actions → **New repository secret**

### 등록할 Secret
| 이름 | 값 출처 | 용도 |
|---|---|---|
| `LAW_OC` | 로컬 `.env.local` 의 `LAW_OC` | 법제처 API 호출 |
| `GEMINI_API_KEY` | 로컬 `.env.local` | Fallback 엔진 + RAGAS judge |
| `HERMES_API_URL` | 로컬 `.env.local` (staging tunnel 권장) | Primary 엔진 |

### 검증
- GitHub Actions 탭 → "RAG Eval (Weekly)" → **Run workflow** 수동 실행
- `evaluation/history/YYYY-MM-DD/` artifact 다운로드되면 성공
- 실패 시 `server-log-*` artifact에서 원인 확인

### 자동 스케줄
매주 **월요일 03:00 UTC** (KST 12:00) 자동 실행. 결과는 main에 자동 커밋.

---

## 2. M2 CSP nonce — Vercel 환경변수 + 48h soak

**우선순위**: 중간 (XSS 방어 강화, 현재도 기본 CSP는 동작 중)
**소요**: 설정 5분 + 관찰 48시간
**관련 파일**: [middleware.ts](../middleware.ts), [next.config.mjs](../next.config.mjs)

### 현재 상태
- 플래그 `LEXDIFF_CSP_NONCE` **미설정 (= off)**
- 기존 정적 CSP(`script-src 'self' 'unsafe-inline'`) 그대로 동작 중
- 문제없음. 단, XSS 방어가 약함

### 단계별 롤아웃
1. **Preview 환경에만 먼저**
   - Vercel 대시보드 → LexDiff → Settings → Environment Variables
   - `LEXDIFF_CSP_NONCE=true` 추가 (Environment: **Preview** 체크)
   - Preview URL 재배포 트리거

2. **48시간 관찰 체크리스트**
   - [ ] 브라우저 DevTools Console: `Refused to execute inline script` 에러 유무
   - [ ] 주요 플로우 수동 검증: 검색 / 법령 뷰어 열기 / 조문 클릭 / 비교 모달 / 참조 모달 / 뒤로가기 / AI 검색
   - [ ] ThemeProvider 초기 스크립트 정상 (다크모드 깜빡임 없음)
   - [ ] Analytics 정상 (Vercel Analytics 대시보드)
   - [ ] Sentry 등 에러 수집 도구가 있으면 `csp-violation` signature 0

3. **문제없으면 Production**
   - 같은 변수를 Environment: **Production** 체크해서 추가
   - 재배포

4. **롤백 절차**
   - 환경변수 삭제 → 재배포 → 자동으로 기존 CSP 복귀 (회귀 0)

### 왜 단계적인가
Next.js 16 RSC hydration inline 스크립트, ThemeProvider 초기 스크립트 등이 nonce 없이 실행될 가능성. `strict-dynamic`으로 번들 파생 script는 자동 허용되지만 엣지 케이스 관찰 필요.

---

## 3. Citation content verify — 플래그 on 결정

**우선순위**: 낮음 (품질 개선, 환각 방지)
**소요**: 설정 5분 + 레이턴시 모니터링
**관련 파일**: [lib/citation-content-matcher.ts](../lib/citation-content-matcher.ts), [lib/citation-verifier.ts](../lib/citation-verifier.ts)

### 현재 상태
- 플래그 `CITATION_CONTENT_VERIFY` **미설정 (= off)**
- 기본 citation verifier(조문 존재 여부)는 돌고 있음
- LLM이 "제5조(목적)"로 인용한 내용이 **실제 본문과 의미적으로 일치하는지**까지 검증하는 레이어는 off

### 켰을 때 영향
- **+**: 환각 조문(존재하는 조문에 엉뚱한 내용) 탐지율 상승
- **−**: 레이턴시 +2~5초 (조문 본문 fetch + L1/L2 매칭)

### 권장 순서
1. **M2 CSP 안정 확인 이후**에 시도 (두 변화를 동시에 배포하지 않기)
2. Vercel → Environment Variables → `CITATION_CONTENT_VERIFY=true` (Production)
3. 24h 관찰: p95 레이턴시 +10% 이내 유지되는지
4. 문제시 변수 삭제 → 즉시 off

---

## 요약 테이블

| # | 작업 | 어디서 | 언제 | 난이도 | 롤백 |
|---|---|---|---|---|---|
| 1 | GitHub Secrets 3개 | GitHub Settings → Actions Secrets | 아무때나 | 쉬움 | Secret 삭제 |
| 2 | `LEXDIFF_CSP_NONCE=true` | Vercel Preview → Production | Preview 먼저, 48h 후 Prod | 중간 | 변수 삭제 |
| 3 | `CITATION_CONTENT_VERIFY=true` | Vercel Production | M2 안정화 후 | 쉬움 | 변수 삭제 |

모든 항목이 **환경변수 토글만**으로 적용/롤백되며, **코드 재배포 불필요**.

---

## M4 law-viewer reducer (별도 세션)

**상태**: 보류. Playwright 인프라 미설치로 "녹화 선행 필수" 조건 미충족.

**착수 전제**:
- [ ] `pnpm add -D @playwright/test` 설치
- [ ] `playwright.config.ts` 작성
- [ ] 5플로우 녹화: 검색→법령열기 / 조문클릭 / 비교모달 / 참조모달 / 뒤로가기
- [ ] MSW 등으로 외부 API(법제처/Hermes) stub 설계

**작업 본체**:
- [components/law-viewer.tsx](../components/law-viewer.tsx) 885줄 → `useReducer` + `LawViewerContext` 분리
- 녹화 재실행으로 회귀 0 확인
