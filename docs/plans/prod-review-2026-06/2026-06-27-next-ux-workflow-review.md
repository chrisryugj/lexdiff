# LexDiff 프로덕션 리뷰 #2 — UX 워크플로우 기반 개선 리팩토링 (다음 세션)

작성: 2026-06-27 (세션2 종료 시). 직전 핸드오프: `2026-06-27-prod-review-handoff.md` 먼저 읽기.

## 현재 상태 (시작 전 파악)
- 브랜치 `feat/prod-review-viewing-history` — 최신 `fa774ed`(별지) / `c6f14f6`(캐시). 원격 푸시됨.
- **프로덕션은 아직 16일전 구버전(4.4.0)**. 모든 신기능은 프리뷰에만: `https://lexdiff-7sbwwbgaw-ryuseungin-8474s-projects.vercel.app` (Vercel 인증 보호 — 로그인 필요)
- 마이그레이션 011 적용됨(viewing_history+RLS). 662 테스트 통과.

## 이번 세션 목표
**모든 기능을 "실제 사용자 워크플로우"로 한 바퀴 돌려 UX 마찰을 찾고, UX 향상 중심의 개선 리팩토링까지 수행.** 단순 버그헌팅 아님 — 실제 사용 흐름에서 답답한 지점·정보위계·반응성·빈/에러 상태·모바일을 개선.

### 진행 방식 (기능별)
각 기능마다: ① 실제 사용자 시나리오(해피패스 + 엣지) 정의 → ② 코드/프리뷰로 흐름 추적 → ③ UX 마찰점 기록(무엇이 왜 답답한가) → ④ surgical 개선 리팩토링 → ⑤ 검증.

### 커버할 기능 인벤토리 (app/api + components 기준)
1. **AI 법령검색(FC-RAG)** — rag-search-input → fc-rag(SSE) → law-viewer-ai-answer. 진행상태 표시, 로딩 단계, 인용/링크, 빈/에러
2. **법령 뷰어** — law-viewer(+사이드바/액션버튼/단문조회/심급), 본문 링크(법령/조문/별표/별지), 가상스크롤
3. **법령 비교 / 참조 모달** — comparison-modal, reference-modal(히스토리 스택)
4. **별표/별지 뷰어** — annex-modal (이번에 별지 추가됨 — 프리뷰 클릭검증 필수)
5. **판례 (3경로)** — 검색결과리스트 / 법령뷰어 하단 관련판례(PrecedentSection) / 판례 전문뷰. recent-precedents
6. **조례(자치법규) benchmark** — ordinance-benchmark-view, benchmark-analyze
7. **위임법령 three-tier / 위임 갭** — three-tier, delegation-gap-modal, delegation-loading-skeleton
8. **행정규칙/해석례/심판례** — admrul, interpretation/tax-tribunal/customs/ruling 등 17도메인 결정문
9. **연혁/타임머신/개정이력** — time-machine-modal, revision-history, oldnew, law-history
10. **영향분석/관계그래프** — impact-tracker, relation-graph, impact-analysis
11. **조회기록** — viewing-history-panel (홈+Cmd+K). 재조회=통합검색 재실행(정밀복원 후속)
12. **즐겨찾기** — favorites-dialog/panel/sync
13. **통합검색 / Cmd+K / 최근검색** — search-view, command-search-modal, recent-searches, search-suggest
14. **설정/약관/개인정보/quota/auth** — settings, terms, privacy, quota, auth

### 🔴 필수 추가 과제 — 과거법령 현행성 버그
**AI 법령 질의 시 "개정 전(과거) 법령"을 끌어와 현행과 다른 오답을 내는 버그가 없는지 점검·개선.**
- 기존 가드: 커밋 `63df261`(v2.3.0-beta 현행성 가드) + korean-law-mcp 4.x 현행성 라벨([현행]/[연혁]·조회기준일·구법령명).
- 할 것: 최근 개정된 법령/구법령명이 섞인 실제 질의를 재현해 ① 도구가 현행을 가져오는지 ② 답변이 [연혁] 버전을 현행처럼 단정하지 않는지 ③ efYd/조회기준일 누수 경로(별표·판례 인용 포함) 확인. 누수 발견 시 surgical 개선 + 재현 테스트.

## ⚠️ 함정 (직전 핸드오프 + 추가)
1. **Hermes 비활성, Gemini ONLY** — fc-rag 100% gemini-3-flash-preview. 디버깅은 `gemini-engine.ts`
2. **판례 2경로**: AI답변 판례=fc-rag(search_decisions, mcp). 법령뷰어 관련판례=/api/precedent-search(법제처 직접, telemetry 미포함)
3. **링크 2경로**: AI답변=linkifyMarkdownLegalRefs(link-specialized, Markdown). 뷰어=link-pattern-matchers(HTML). 별표/별지 둘 다 annexNumber 문자열로 종류구분(별도 type 필드 없음)
4. **별지**: annex-modal이 `isForm`(=/별지|서식/)일 때 knd=2(서식)로 조회. 법제처가 "별지 제N호서식"을 별표종류 "서식"으로 분류
5. **디자인 리팩토링 주의(메모리 feedback-design-vitality)**: 위계 정리한다고 다 약화 금지(생기 죽음). AI슬롭 카피 금지. 강약으로 살리기. **방향은 헤드리스 스샷 2~3안 보여주고 고르게**

## 제약 / 검증
- Surgical changes (인접 코드 개선 금지), 기존 스타일 따르기
- 수정 후 **타입체크(`npx tsc --noEmit`) + 전체 테스트(`npx vitest run`, 현재 662)** 통과
- 디자인 변경은 헤드리스 스크린샷 2~3안 → 사용자 선택 후 적용
- 플랜은 `{repo}/.claude/plans/`. Supabase 마이그레이션 필요 시 메모리 `reference-supabase-pat-management-api` 참고(.env.local SUPABASE_ACCESS_TOKEN + 브라우저 UA)

## 산출물
- 기능별 UX 마찰점 우선순위 목록 (P0/P1/P2)
- 적용한 개선 리팩토링 + 검증 결과
- 과거법령 현행성 점검 결과(누수 유무) + 개선
- 다음 세션 핸드오프
