# Active Context

**마지막 업데이트**: 2026-04-12 (FC-RAG Primary 경로 문서 정정 — Hermes Gateway/GPT-5.4로 현행화, Claude CLI subprocess 흔적 제거)

## 현재 상태

**FC-RAG Primary 경로 = Hermes Gateway 경유 GPT-5.4** (HTTP `:8642/v1/chat/completions` SSE).
- `lib/fc-rag/hermes-client.ts`가 단일 진입. `child_process.spawn` / Claude CLI / stream-json 플래그 모두 코드베이스에 없음.
- 함수명/파일명 `claude-engine.ts`, `executeClaudeRAGStream`, `callAnthropicStream`은 **legacy 네이밍**. 이름만 보고 Anthropic Claude 직접 호출이라 가정 금지.
- korean-law-mcp는 Hermes가 자식 프로세스로 직접 관리. lexdiff는 MCP를 모름.
- 2026-04-12: `claude-engine.ts:25-28, 111` 주석 + `important-docs/05-RAG_ARCHITECTURE.md`, `09-COMPONENT_ARCHITECTURE.md`, `17-SYSTEM_CURRENT_STATE.md` 정정 완료.

**별표(annex) 파싱 kordoc 전환 완료.** HWPX/HWP5는 kordoc, PDF는 lexdiff 직접 처리 (Vercel 서버리스 호환). PDF 표 추출 개선 작업 진행 중.

## 프로젝트 관계 (중요!)

| 레포 | 역할 | 실행 환경 |
|------|------|----------|
| **lexdiff** | 웹앱 (Next.js) — 자체 FC-RAG 엔진 (`lib/fc-rag/`) | Vercel/로컬 |
| **kordoc** (`github.com/chrisryugj/kordoc`) | HWP/HWPX/PDF → Markdown 변환 라이브러리 | npm 패키지 |

### ✅ 완료된 작업 (2026-03-28 — 별표 모달 재설계)

| 카테고리 | 수정 내용 | 파일 |
|----------|----------|------|
| **kordoc 도입** | 자체 파서 5개 삭제 → kordoc 래퍼 | `lib/annex-parser/index.ts` |
| **Gemini Vision 제거** | annex-to-markdown에서 AI 의존 완전 제거 (156→85줄) | `app/api/annex-to-markdown/route.ts` |
| **HWPX/HWP5 구분** | 법제처 content-type "hwp"인 HWPX(ZIP) 파일 정확 판별 | `app/api/annex-pdf/route.ts` |
| **별표 법령명 파싱** | 문장 경계(다. + ①②③) 체크로 잘못된 법령 연결 수정 | `lib/link-pattern-matchers.ts` |
| **스크롤 복원** | 모달 닫을 때 savedScrollRef + requestAnimationFrame | `components/annex-modal.tsx` |
| **PDF Vercel 호환** | DOMMatrix polyfill + worker 사전 주입 + static import | `lib/annex-parser/pdf-polyfill.ts`, `index.ts` |
| **serverExternalPackages** | kordoc, jszip 추가 / pdfjs-dist 제거 (번들링 필요) | `next.config.mjs` |

### 🔧 진행 중 — PDF 표 추출 개선

**상태**: kordoc `src/pdf/parser.ts`에 열 경계 학습 기반 테이블 빌더 작성 중. 미완성, 미커밋.

**핵심 문제**:
- gap 15px 고정 → 열 구분 부정확 (같은 열 gap 9px vs 다른 열 gap 10px)
- 셀 내 줄바꿸(26면/58면)이 별도 행으로 분리
- 비고 텍스트가 테이블로 오인식

**해결 방향** (코드 작성 중):
1. 가장 아이템 많은 행의 gap 분석 → minGap*2를 열 경계 threshold
2. 테이블 후보: 4+ 아이템 + x 범위 넓음 + 평균 텍스트 길이 3+
3. 왼쪽 열에 실질적 새 텍스트 있으면 새 행, 1-2글자면 continuation
4. 비테이블 연속 2줄이면 테이블 종료

**작업 파일**: `c:\github_project\kordoc\src\pdf\parser.ts` (미커밋)
**lexdiff 반영**: kordoc 버전업 후 `pnpm update kordoc`

### Vercel pdfjs-dist 호환 교훈 (중요!)

| 문제 | 원인 | 해결 |
|------|------|------|
| DOMMatrix not defined | pdfjs-dist 모듈 로드 시 참조 | `pdf-polyfill.ts`에서 import 전 polyfill 주입 |
| workerSrc="" 무효 | pdfjs v5가 `workerSrc \|\|= "./pdf.worker.mjs"`로 덮어씀 | `globalThis.pdfjsWorker`에 worker 모듈 static import로 사전 주입 |
| serverExternalPackages에 pdfjs-dist 포함 시 | 외부 모듈로 로드되면 fake worker의 dynamic import 실패 | pdfjs-dist는 **번들링에 포함** (serverExternalPackages에서 제거) |
| ES 모듈 import 호이스팅 | 인라인 polyfill이 import보다 늦게 실행 | 별도 파일(`pdf-polyfill.ts`)로 분리 |

### 📋 다음 할 일

- [ ] **kordoc PDF 표 추출 완성**: 열 경계 학습, 행 병합, 비고 영역 분리
- [ ] **kordoc 버전업 + npm publish**
- [ ] **lexdiff pnpm update kordoc** → PDF 표 품질 자동 반영
- [ ] **lexdiff PDF 파서도 동기화** (현재 lexdiff는 자체 PDF 파서 유지 — Vercel 호환 이유)

### 쿼리 확장 핵심 파일

| 파일 | 역할 |
|------|------|
| `lib/query-expansion.ts` | 핵심 로직 (stripKoreanSuffix, extractKeywords, expandQuery) |
| `lib/query-expansion-data.ts` | 사전 데이터 (동의어, 복합어, 매핑) |
