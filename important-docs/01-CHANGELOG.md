# 변경 이력 (Change Log)

> 상세한 변경 이력을 날짜별로 기록합니다. 각 변경사항에는 문제 → 해결 → 영향을 명시합니다.

---

## 2026-03-22: 3차 코드리뷰 — 대형 파일 5개 → 17개 모듈 분리

### 모듈 분리 (5 → 17 파일)

| 원본 | 줄 수 | 분리 결과 |
|------|-------|-----------|
| `engine.ts` | 1095 | `engine.ts` (64, re-export), `engine-shared.ts` (326, 타입/설정/분류), `claude-engine.ts` (218, Claude Primary), `gemini-engine.ts` (547, Gemini Fallback) |
| `tool-adapter.ts` | 1003 | `tool-adapter.ts` (173, 선언+실행), `tool-registry.ts` (216, 57개 도구 정의), `tool-cache.ts` (205, 캐시+압축) |
| `law-viewer-ai-answer.tsx` | 1170 | `law-viewer-ai-answer.tsx` (749, AIAnswerContent), `ai-answer-sidebar.tsx` (272, AIAnswerSidebar), `ai-step-timeline.tsx` (133, AiStepTimeline) |
| `unified-link-generator.ts` | 1158 | `unified-link-generator.ts` (207, 메인+re-exports), `link-pattern-matchers.ts` (641, 9개 패턴), `link-specialized.ts` (365, linkifyRefs) |
| `query-expansion.ts` | 1134 | `query-expansion.ts` (364, 핵심 로직), `query-expansion-data.ts` (655, 동의어/인덱스), `ordinance-search-strategy.ts` (156, 조례 전략) |

### 타입 안전성 강화

- `as any` 26회 → 9회 제거
- `lib/law-constants.ts` 신규 — law.go.kr URL 상수 중앙화
- `lib/api-validation.ts` — Zod 스키마 3개 추가 (eflawRequest, lawHtmlRequest, ragRequest 확장)
- `components/law-viewer.tsx` — LawViewerProps → 3개 서브인터페이스 (Core/AI/Analysis) 분리
- Zod 스키마 4개 API 라우트 적용 (fc-rag, law-search, eflaw, law-html)

### 영향

- 1,200줄 초과 파일 0개 (기준 준수)
- 모든 re-export 허브가 기존 import 경로 유지 → 외부 호출 코드 변경 없음

---

## 2025-12-20: 법률 데이터 API 시스템 + 12월 종합 개선

### korean-law-mcp 기능 도입 (9개 API)

| API | target | 용도 |
|-----|--------|------|
| `/api/precedent-search` | prec | 판례 검색 |
| `/api/precedent-text` | prec | 판례 전문 |
| `/api/interpretation-search` | expc | 해석례 검색 |
| `/api/interpretation-text` | expc | 해석례 전문 |
| `/api/search-all` | law,admrul,ordin | 통합 검색 |
| `/api/tax-tribunal-search` | ttSpecialDecc | 조세심판원 검색 |
| `/api/tax-tribunal-text` | ttSpecialDecc | 조세심판원 전문 |
| `/api/customs-search` | kcsCgmExpc | 관세청 검색 |
| `/api/customs-text` | kcsCgmExpc | 관세청 전문 |

### 추가된 lib/hooks/components

| 파일 | 역할 |
|------|------|
| `lib/precedent-parser.ts` | XML/JSON 파서 |
| `lib/precedent-cache.ts` | IndexedDB 캐시 |
| `hooks/use-precedents.ts` | 판례 데이터 훅 |
| `hooks/use-law-viewer-precedents.ts` | law-viewer 통합 훅 |
| `components/precedent-section.tsx` | 판례 UI |

### 문서

- `important-docs/07-LEGAL_DATA_API_GUIDE.md` 추가

---

## 2025-12 (1일~19일): AI 시스템 및 UX 대폭 개선

### AI 검색 시스템 업그레이드

**2-Tier AI 라우팅 시스템** (4049f95)
- 질문 유형별 라우팅 구현 (Phase 10)
- 질문 유형별 라우팅: 법률 질문 → 전문 프롬프트, 일반 질문 → 간단 응답
- Layman-first 페르소나로 프롬프트 개선 (2b3677a)

**AI 검색 UX 개선** (76426be, ae7faf0)
- 4단계 로딩 시각화: 검색 → 분석 → 답변생성 → 완료
- 타이핑 효과 애니메이션
- 검색어 자동완성
- 헤더에 현재 조문 표시

### 아이콘 시스템 마이그레이션

**lucide-react → hugeicons** (1ee1a80)
- 전체 아이콘 시스템 통합
- 일관된 디자인 언어

### 별표/별지 기능

**별표 모달 개선** (f6dc94e, 4481996, c74ec63)
- AI 답변 뷰에서 별표(annex) 모달 지원
- 별표/별지 링크 자동 연결
- 테이블 스타일링 개선
- HWPX 파서 서버 환경 지원 (5d615ce)

### 홈화면 UX 개선

**플로팅 헤더** (8658c1c, eb98fe1)
- 디자인 개선
- 호 줄바꿈 개선

**사용 가이드** (358677f)
- 오른쪽 슬라이드인 Sheet 모달로 변경

### 보안 및 인프라

**Next.js 16.0.7 보안 업데이트** (a32d421)
- 보안 취약점 패치

**대규모 코드 정리** (6e5d563)
- 미사용 모듈/테마/테스트 파일 삭제 (~10,000줄)
- 토큰 최적화

**전역 설정 개선** (3edabba)
- PDCA 사이클 및 코드베이스 분석 전략 추가
- v2.6 업그레이드

---

## 2025-11-30: CLAUDE.md 전역/프로젝트 설정 다이어트

### 전역 설정 (v2.4 → v2.5)

**변경 내용**:
- 377줄 → 187줄 (**50% 감소**)
- 중복 예시/템플릿 대폭 삭제
- 새 섹션 추가: 도구 호출 절제, 코드 확인 필수 (적극적 탐색)
- 과도한 엔지니어링 방지 원칙 강화

**삭제된 내용**:
- 질문 형식 마크다운 예시 (12줄)
- 기록 형식/워크플로우/통합 상세 (42줄 → 3줄)
- 코드 비대화 예시/체크리스트 (57줄 → 11줄)
- 에이전트 목록/예시 (28줄 → 1줄)
- 서버/브라우저 상세 예시 (18줄 → 2줄)
- 크로스 플랫폼 섹션 (전체)
- 프로젝트 커스터마이징 섹션 (전체)

**추가된 원칙**:
```
### 도구 호출 절제
- 도구는 필요할 때만 사용 (의무적으로 호출하지 않음)
- 간단한 질문은 도구 없이 직접 답변

### 코드 확인 필수 (적극적 탐색)
- 수정 제안 전 관련 파일을 반드시 읽고 이해
- 직접 확인하지 않은 코드에 대해 추측으로 답하지 않음
```

### 프로젝트 설정 (LexDiff)

**변경 내용**:
- 541줄 → 120줄 (**78% 감소**)
- 전역과 중복되는 모든 섹션 제거
- Quick Reference 코드 예시 대폭 축약

**삭제된 내용**:
- 요구사항 명확화 상세 (33줄) - 전역과 중복
- 파일 크기 제한 상세 (34줄) - 전역과 중복
- 불확실성 처리 원칙 (21줄) - 전역과 중복
- 문서 업데이트 원칙 (14줄)
- CLAUDE.md 관리 가이드 (57줄)
- Context Window 관리 (8줄) - 전역과 중복

**유지된 핵심**:
- 문서 참조 테이블 (important-docs 링크)
- Quick Reference 7개 패턴 (축약)
- Project Overview, Tech Stack, Key Files

📍 `~/.claude/CLAUDE.md`, `CLAUDE.md`, `.claude/global-claude-md.sync.md`

---

## 2025-11-29: UI/UX 종합 개선 및 테마 시스템

### 라이트/다크 테마 전환 (74c3f5d)
- `next-themes` 기반 테마 시스템 구현
- 홈화면 헤더에 테마 토글 버튼 추가
- 시스템 설정 자동 감지

### P0/P1 UI/UX 개선 (32ee12b, c4f5a96)
- **접근성**: 키보드 네비게이션 (↑↓ 조문 이동)
- **전문보기**: 즐겨찾기 버튼, 동기 스크롤
- **복사 피드백**: 클릭 위치에 알림 메시지 표시

### 자치법규 모달 개선 (f50ad84, 80148f8)
- 조례/규칙 본문 파싱 지원
- 모달 제목 조문번호 표시 오류 수정
- 법령명만 인용 시 전체 조문(전문) 모달 표시

### handleContentClick 분리 (6b49fd5)
- 클릭 핸들러를 `lib/content-click-handlers/` 훅으로 분리
- 코드 재사용성 향상

---

## 2025-11-28: AI 답변 품질 Phase 7 및 스타일 개선

### AI 답변 품질 개선 Phase 7 (864371e)
- 사이드바 조문제목 표시
- 관련 법령 스타일 개선
- 신뢰도 배지 위치 조정

### 스타일 개선
- 개정 이력 컴포넌트 디자인 전면 개선 (c6e58a7)
- AI 답변 조문 발췌 블록 스타일 개선 (9899a42)

### 법령 업로드 시스템 (2a91a0a, b259cd9)
- 서버 사이드 업로드 로그 구현
- SSE 취소 처리 개선
- 비용 계산 기능

---

## 2025-11-27: RAG Phase 1-6 최적화

### RAG 시스템 대폭 개선 (d996ec2, 31e6627)
- **Phase 1-3**: 오타 교정, 전문 조회 성능 개선
- **Phase 4-6**: 쿼리 전처리, 질문 유형별 프롬프트, Metadata Filter
- 프롬프트 재설계: 메타 지시사항 분리 및 구조화

### Citations 시스템 개선 (243acfd, 6e5bac0)
- Citations를 사이드바에 표시
- source를 'citation'으로 구분
- 전용 아이콘 추가

### 모바일 UI 개선 (6a40eb4, e6b937b)
- 패딩 조정, 액션버튼 1줄화
- 검색 모달 시인성 강화
- 위임법령 탭뷰 링크 클릭 시 탭 전환

### AI 검색 결과 캐시 (0f904be)
- 뒤로가기 시 AI 검색 결과 즉시 복원

---

## 2025-11-25-26: Optimistic UI 및 홈페이지 리디자인

### Optimistic UI for Admin Rules (943e856)
- stale-while-revalidate 패턴 적용
- 캐시 히트 시 즉시 표시
- 로딩 완료 판단 개선

### 홈페이지 Apple 스타일 리디자인 (d31b2bc, 5530f2c)
- 3가지 디자인 버전 (Professional, Futuristic, Organic)
- ScrollReveal 컴포넌트로 스크롤 애니메이션 통합

### 법령 뷰어 UI 개선 (6093a06)
- 플로팅 헤더 구현
- 검색 모달 개선

---

## 2025-11-23-24: law-viewer.tsx 대규모 리팩토링

### Phase 0-2 리팩토링 완료 (24a93ff, 0ee3e35, 0f5b580, bfc26fb)
- **Phase 0**: 코드 다이어트 (527줄 감소)
- **Phase 1**: JSX 분리 (65% 감소)
- **Phase 2**: Modal Hook 분리
- **Admin Rules Hook** 분리

### Three-Tier Hook 분리 (88225b7)
- 위임법령 로직을 별도 Hook으로 분리
- 법령 변경 시 패널 상태 초기화

### 행정규칙 UX 개선 (d73152d, cd4b269)
- 패널 재오픈 시 상태 유지
- 데이터 있을 때 재fetch 방지

---

## 2025-11-22: 모바일 UX 대폭 개선

### 모바일 본문 뷰 UX 개선 (30fea91)
- 4탭 구조 (법률/시행령/시행규칙/행정규칙)
- 헤더 여백 최적화

### 위임법령 2단 뷰 개선 (31a6408, fe979bf)
- 드래그 리사이즈 준비 (react-resizable-panels)
- 2단+탭 구조로 변경

### 조문 네비게이션 (fb4ff1e, a6735a4, 7061c6a)
- FAB (Floating Action Button) 추가
- 조문 목록 가상화로 성능 80% 개선
- 조문 간 스와이프 네비게이션

---

## 2025-11-21: lucide-react 아이콘 통합

### 아이콘 시스템 교체 (a0f93a3)
- 이모지 → lucide-react 아이콘으로 전면 교체
- AI 답변 섹션 아이콘 시스템 개선
- 법령뷰어 아이콘 교체

### 개발용 테스트 대시보드 (5f402d1)
- `/dev-test` 통합 테스트 페이지 추가
- `/rag-test`를 `/dev-test/ai`로 이동

---

## 2025-11-20: 통합 링크 생성 시스템 및 행정규칙 개선

### 통합 링크 생성 시스템 (4827fdf, 9520f54)
- `lib/unified-link-generator.ts` 구현
- 모든 법령 링크를 중앙 시스템으로 통합
- safe/aggressive 모드 지원

### 행정규칙 다운로드 UX 개선 (c9fbfed)
- 진행률 표시
- CDATA 섹션 XML 파싱 개선
- 중복 제거, 항/호 파싱

### Apple-style 스크롤 애니메이션 (57c0cd6)
- 홈페이지 스크롤 애니메이션 추가
- 모바일 반응형 처리

### 루트 폴더 정리 (4778f55)
- 81개 → 44개 파일/폴더 (46% 감소)

---

## 2025-11-19 (오후): AI 뷰 최적화 Phase 1 완료

### 1. 미사용 RAG 카드 컴포넌트 제거 (7cd2d6e)

**문제**: 사용하지 않는 RAG 관련 컴포넌트 3개가 토큰 낭비 유발
- `components/rag-search-panel.tsx` (~80줄)
- `components/rag-result-card.tsx` (~70줄)
- `components/rag-answer-card.tsx` (~90줄)
- `search-result-view.tsx`에서 import만 주석 처리되어 있음

**해결**:
- 3개 컴포넌트 파일 완전 삭제 (~240줄)
- `search-result-view.tsx`에서 주석 처리된 import 라인 제거
- 실제 사용 중인 컴포넌트만 유지:
  - `RAGAnalysisView` (Manual RAG 모드, `/rag-test` 페이지)
  - `FileSearchRAGView` (File Search 모드, `/rag-test` 페이지)
  - `RAGCollectionProgress` (RAGAnalysisView 내부)

**영향**:
- 코드 ~240줄 감소
- 토큰 사용량 ~10% 감소
- 불필요한 import 제거로 빌드 시간 미세 개선

📍 `components/rag-*.tsx`, `components/search-result-view.tsx`

### 2. file-search-rag-view.tsx 더미 데이터 제거 (7cd2d6e)

**문제**: AI 답변 모드에서 의미 없는 더미 meta/articles props 전달
```typescript
// Before
<LawViewer
  meta={{ lawId: '', lawTitle: 'AI 답변', promulgationDate: '', lawType: '' }}
  articles={[]}
  // ... AI 관련 props
/>
```

**해결**: AI 모드에 필요한 props만 전달
```typescript
// After
<LawViewer
  aiAnswerMode={true}
  aiAnswerContent={analysis}
  relatedArticles={relatedLaws}
  aiConfidenceLevel={confidenceLevel}
  // meta, articles는 선택사항이므로 생략
/>
```

**영향**:
- Props 체인 단순화 (불필요한 데이터 제거)
- AI 모드와 일반 모드의 구분 명확화
- 코드 가독성 향상

📍 `components/file-search-rag-view.tsx:296-304`

### 3. law-viewer.tsx Props 개선 (7cd2d6e)

**문제**: meta, articles가 필수 props여서 AI 모드에서도 더미 데이터 전달 필요

**해결**: Props를 선택사항으로 변경하고 기본값 설정
```typescript
// Props 인터페이스
interface LawViewerProps {
  meta?: LawMeta       // 필수 → 선택사항
  articles?: LawArticle[]  // 필수 → 선택사항
  // ... 기타 props
}

// 기본값 설정
export function LawViewer({
  meta = { lawTitle: '', fetchedAt: new Date().toISOString() },
  articles = [],
  // ...
}: LawViewerProps) {
```

**영향**:
- AI 모드에서 더미 데이터 전달 불필요
- 일반 모드는 기존과 동일하게 작동 (하위 호환성 유지)
- TypeScript 타입 안전성 유지

📍 `components/law-viewer.tsx:46-76`

### 4. 최적화 계획 문서 작성 (7cd2d6e)

**추가된 문서**:
1. `docs/ai-view-optimization-plan-updated.md` (현행화 버전)
   - 현재 코드 상태 면밀 분석 (file-search-rag-view: 313줄, law-viewer: 3167줄)
   - Phase 1 즉시 적용 계획 (완료)
   - Phase 2 law-viewer 분할 계획 (20개 파일, 상세)

2. `docs/ai-view-optimization-plan-safe.md` (안전 버전) ⭐ **채택**
   - 과도한 분할 지양 (20개 → 3개 파일)
   - Claude가 읽기 편한 크기 (~1400줄 × 3개)
   - 점진적 개선 가능한 구조

**Phase 2 계획 (미래 작업)**:
```
law-viewer.tsx (3167줄)
  ↓ 분할
components/law-viewer/
├── index.tsx (~1167줄)           - 핵심 로직 유지
├── view-renderers.tsx (~1200줄)  - 6가지 뷰 렌더링 함수
└── shared-components.tsx (~800줄) - 공통 UI 컴포넌트
```

**예상 효과 (Phase 2)**:
- 중복 코드 ~500줄 제거 (84% 감소)
- 파일 크기: 3167줄 → 평균 ~1000줄 (Claude 읽기 편함)
- 유지보수 비용 50% 감소

### 5. 디버그 콘솔 및 불필요한 로그 제거 (06a71c0, cd78c44)

**문제**: 개발 중 사용한 디버그 콘솔과 과도한 로그가 프로덕션에 남아있음
- 메인 레이아웃에 DebugConsole 컴포넌트 렌더링 (화면 하단)
- 브라우저 콘솔에 `[v0]` 프리픽스가 붙은 로그 181개
- 불필요한 디버그 로그 88개 (XML 샘플, 상태 변경, 파싱 성공 등)
- 총 269개의 불필요한 console.log

**해결**:
```typescript
// app/layout.tsx
// Before
<body>
  {children}
  <DebugConsole />  // ❌ 제거
  <Analytics />
</body>

// After
<body>
  {children}
  <Analytics />  // ✅ DebugConsole 제거
</body>
```

**스크립트 작성**:
1. `scripts/cleanup-v0-logs.mjs`
   - 모든 `console.log("[v0] ...")` → `console.log("...")`로 변경
   - 181개 로그 프리픽스 제거

2. `scripts/remove-debug-logs.mjs`
   - 불필요한 디버그 로그 88개 제거
   - 에러 로그는 유지 (debugging에 필수)

**제거된 로그 유형**:
- XML/JSON 파싱 성공 로그
- XML 샘플 출력 로그 (first 500/1000/2000 chars)
- 상태 변경 상세 로그
- 개정이력/조문이력 디버그 로그
- LawViewer 렌더링 로그
- 검색 모드 전환 로그
- 즐겨찾기 추가/삭제 로그

**유지된 로그**:
- `console.error()` - 에러 로그
- `console.warn()` - 경고 로그
- `debugLogger.error()` - 에러 로거
- `debugLogger.warning()` - 경고 로거
- `debugLogger.success()` - 주요 성공 로그 (신·구법 비교 등)

**영향**:
- 브라우저 콘솔 출력 대폭 감소 (269개 로그 제거)
- 디버그 콘솔 UI 제거로 화면 깔끔해짐
- 실제 에러 발생 시 파악 용이 (노이즈 제거)
- 프로덕션 성능 미세 개선 (console.log 오버헤드 감소)

**버그 수정** (cd78c44):
- 로그 제거 스크립트가 `debugLogger.success()` 호출 시작 부분을 잘못 제거한 문제 수정
- search-result-view.tsx의 신·구법 비교 데이터 로드 성공 로그 복구

📍 `app/layout.tsx`, `components/error-report-dialog.tsx`, 전체 로그 시스템

---

## 2025-11-19 (오전): 법령 링크 개선 및 버그 수정

### 1. 항 없이 호만 있는 조문 본문-호 간 빈 줄 제거 (90131dc)

**문제**: 관세법 제2조처럼 항내용 없이 본문+호 구조일 때 불필요한 빈 줄 삽입
- JSON에서 `조문내용`에 본문과 호가 함께 있고, `\n\n`으로 구분됨
- HTML 변환 시 `<br><br>`로 변환되어 빈 줄 생성

**해결**:
```typescript
// lib/law-xml-parser.tsx:365
// 연속된 개행을 호 번호 앞에서 제거
content = content.replace(/\n{2,}\s*(\d+\.)/g, '\n$1')
```

**영향**: 본문-호 사이 줄바꿈 1개만 유지 (빈 줄 제거)

### 2. 개정 마커 스타일링 복구 (2dffc9e)

**문제**: HTML escape 로직이 `<개정>`, `<신설>` 같은 태그를 HTML 태그로 보존
- `<개정 2020.12.22>`가 escape되지 않음
- `applyRevisionStyling()`에서 `&lt;개정&gt;` 형태를 찾아 스타일 적용하는데, 원본 `<개정>`으로 남아있어 스타일 미적용

**해결**: `<a>` 태그만 보존하고 나머지는 모두 escape
```typescript
// lib/law-xml-parser.tsx:343-348
content.replace(/(<a\s[^>]*>|<\/a>)|(<[^>]*>)|([^<]+)/g, (match, linkTag, otherTag, text) => {
  if (linkTag) return linkTag       // <a> 태그만 보존
  if (otherTag) return escapeHtml(otherTag)  // <개정> → &lt;개정&gt;
  if (text) return escapeHtml(text)
  return match
})
```

**영향**: `.rev-mark` 클래스가 정상 적용되어 개정 마커가 파란색으로 표시됨

### 3. 법령 링크 hover 효과 강화 (a8bf720)

**변경사항** (`app/globals.css:225-253`):
- 색상 밝기 향상: `oklch(0.75 0.22 250)` → `oklch(0.8 0.25 250)`
- 밑줄 굵기 증가: `1.5px` → `2px`
- 배경 투명도 증가: `0.08` → `0.15`
- 그림자 강화: `0 1px 4px / 0.3` → `0 2px 8px / 0.5`
- 애니메이션 추가: `transform: translateY(-1px)` (hover 시 살짝 올라감)

**의도**: 법령 링크가 호버 시 더욱 명확하게 강조되도록 개선

### 4. 모달 내 법령 링크 히스토리 스택 (fdc481f, 859e5f0, c6deec1)

**기능**: 모달에서 다른 법령 링크 클릭 시 뒤로가기 가능

**구현 세부사항**:
- 모달 히스토리 스택 관리 (`useState<Array<{lawName, joLabel}>>`)
- 뒤로가기 버튼 표시 (히스토리 있을 때만)
- 이벤트 전파 차단: `e.preventDefault()`, `e.stopPropagation()`으로 중복 네비게이션 방지
- `href="javascript:void(0)"` 사용으로 라우팅 이벤트 차단

**영향**: 모달 UX 개선 - 여러 법령을 연쇄적으로 탐색 후 원래 위치로 복귀 가능

📍 `components/reference-modal.tsx`, `components/comparison-modal.tsx`

---

## 2025-11-18: 법령명 링크 및 조례 판단 로직 개선

### 1. 복합 법령명 링크 생성 정규식 수정 (fd78b36)

**문제**: "국토의 계획 및 이용에 관한 법률 시행령"이 "법률"과 "시행령" 두 개의 링크로 분리됨

**해결**:
- Pattern 3: 부정 전방탐색 추가 `(?!\s+[가-힣]+령)`
  - "법률 시행령" 복합어를 하나의 링크로 유지
- Pattern 5/6: 부정 후방탐색 추가 `(?<![가-힣]\s)`
  - "법률 시행령"에서 "시행령"만 별도 링크 생성 방지

**수정 파일**:
- `lib/law-xml-parser.tsx`: 법령 뷰어용 linkifyRefsB
- `lib/ai-answer-processor.ts`: AI 모달용 linkifyRefsB

### 2. 조례 여부 판단 로직 개선 (772812b)

**문제**: 지방자치단체명 패턴만으로 오판 발생

**해결**:
```typescript
// BEFORE: 지방자치단체명 포함 시 무조건 조례로 판단
const isOrdinanceLaw = /조례|규칙|특별시|광역시|도|시|군|구/.test(lawName)

// AFTER: 키워드 우선 + 지방자치단체명 공백 패턴 정밀화
const isOrdinanceLaw = lawName && (
  /조례|규칙/.test(lawName) ||  // 키워드 우선
  /(특별시|광역시|[가-힣]+도|[가-힣]+(시|군|구))\s+[가-힣]/.test(lawName)  // 공백 포함
)
```
📍 `components/reference-modal.tsx:30-33`

### 3. 항내용 없고 호만 있는 조문 표시 버그 수정 (4e1d0bf)

**문제**: 도로법 시행령 제55조처럼 항 객체는 있지만 항내용이 비어있고 호만 있는 경우, 본문이 제거됨

**해결**:
- 항 정규화: 배열/단일 객체 모두 처리
- 항내용 존재 여부 선확인 (`hasHangContent`)
- 항내용 없고 호만 있는 경우: 본문 + 호 합치기

**수정 전 → 후**:
- ❌ 본문 완전 제거 → ✅ 본문 (제목 제거됨) + 전체 호 내용

📍 `components/law-viewer.tsx` (+62 lines)

---

## 2025-11-15: AI 검색 시스템 3대 핵심 수정

### 발견된 문제들

1. **사이드바 버튼 완전 무반응**
   - 원인: async function을 onClick에 직접 사용
   - 영향: 관련 법령 클릭 시 모달 미표시, 로그 없음

2. **모달 열리지만 빈 화면**
   - 원인: API 응답 형식 불일치 (XML vs JSON)
   - /api/law-search: XML 응답 → .json() 시도 → SyntaxError
   - /api/eflaw: 원본 JSON → .success 필드 확인 → undefined

3. **AI 답변 중간 잘림**
   - 원인: SSE 스트림 종료 후 남은 buffer 미처리
   - 영향: 특정 조문(관세법 38조 등) 답변 400자 내외로 짤림

4. **진행 상태 표시 즉시 사라짐**
   - 원인: `isAnalyzing && !analysis` 조건이 첫 청크에서 false
   - 영향: 로딩 피드백 부족으로 UX 저하

5. **모바일 모달 우측 잘림**
   - 원인: 모달 너비 고정, overflow 처리 부족
   - 영향: 모바일에서 법령 내용 일부 보이지 않음

### 적용된 해결책

**영향을 받는 파일**:
- `components/file-search-rag-view.tsx`: API 파싱, SSE 버퍼, 오버레이
- `components/law-viewer.tsx`: 사이드바 클릭 핸들러
- `components/reference-modal.tsx`: 모바일 반응형
- `lib/file-search-client.ts`: 토큰 사용량 로깅, finishReason 분석

---

## 2025-11-11: 긴급 수정 - Phase 5/6 비활성화 및 Phase 7 버그 수정

### 발견된 문제들

서버 재시작 후 검색 시스템 전체 붕괴 발견:

1. **모든 법령의 최초 검색 시 "검색결과 없음" + 1조 표시**
   - 원인: Phase 7 캐시에서 `selectedJo`를 조문 존재 여부 확인 없이 무조건 설정
   - 파일: `app/page.tsx:576`

2. **잘못된 법령 연결**
   - "형법" 검색 시 "군에서의 형의 집행 및 군수용자의 처우에 관한 법률" 연결
   - 원인: Phase 5 학습 데이터 오염 (80개 쿼리, 80개 결과)

3. **법령 선택 UI 미표시**
   - "세법" 검색 시 사용자 선택 없이 "개별소비세법"으로 자동 연결
   - 원인: 기본 검색 매칭 로직의 낮은 유사도 임계값

### 적용된 해결책

1. **Phase 5/6 완전 비활성화** (`app/page.tsx:627-793`)
2. **Phase 7 조문 검증 버그 수정** (`app/page.tsx:572-603`)
3. **조문 없음 UX 개선**: 가장 유사한 조문 자동 선택 + 배너로 대안 제시
4. **법령 매칭 로직 개선**: 레벤슈타인 거리 기반 유사도 계산 (85%/60% 적응형)
5. **학습 데이터 완전 초기화**: `reset-all-learning.mjs` 스크립트

### 새로 추가된 파일

1. **`reset-all-learning.mjs`**: Turso DB 학습 데이터 완전 삭제
2. **`lib/text-similarity.ts`**: 레벤슈타인 거리 알고리즘

---

## 2025-11-05: 행정규칙 시스템 및 3단 비교 완전 구현

### 주요 구현 사항

1. **시행규칙 파싱 경로 수정 (CRITICAL)**: `rawArticle.시행규칙조문` 직접 접근
2. **행정규칙 중복 제거**: Map 기반 중복 제거 (serialNumber/id)
3. **위임조문 뷰 스크롤 구현**: `calc(100vh - 250px)` 고정 높이
4. **행정규칙 성능 최적화**: IndexedDB + HTTP 캐싱 + 병렬 API 호출
5. **개정 마커 스타일 확장**: `[본조신설]`, `[본조삭제]`, `[종전 ~ 이동]`

---

## 2025-11-04: 3단 비교 UI 개선 및 버그 수정

### 수정된 문제들

1. **개정 이력 마커 줄바꿈 오류 수정**: 정규식 개선으로 날짜 패턴 제외
2. **인용조문 데이터 로딩 비활성화**: 위임조문(knd=2)만 로드
3. **3단 비교 버튼 활성화 로직 개선**: 실제 시행규칙 콘텐츠 유무 확인
