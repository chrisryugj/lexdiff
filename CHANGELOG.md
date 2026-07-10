# Changelog

LexDiff의 주요 변경사항을 기록합니다. 형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)을 따르며, 버전은 [Semantic Versioning](https://semver.org/lang/ko/)을 사용합니다.

## [2.5.3-beta] — 2026-07-10

프로덕션 리뷰 #7 — 공모전 시연 리허설. 시연 각본(JUDGE_DEMO_SCENARIO) 전 장면을 프로덕션(lexdiff.gomdori.app)에서 headless Chrome으로 완주하며 실측 시간을 각본과 대조해 현행화하고, 시연 경로 위 잔여 마찰 3건 수리. vitest 743/743 + tsc 클린 + headless 재검증.

### 🐛 Fixed
- **모달에서 브라우저 뒤로가기 시 뷰어 전체 이탈** — 신·구법 대조표/AI 변경 요약 다이얼로그가 열린 상태에서 브라우저 뒤로가기를 누르면 모달만이 아니라 법령 뷰어 전체가 닫히고 홈으로 이탈하던 문제. 다이얼로그가 열릴 때 history에 가드 엔트리를 쌓고 popstate 시 다이얼로그만 닫는 최소 방어 적용(전면 URL 라우팅은 스코프 아님). 동일 뷰로의 가드 pop은 강제 리마운트를 생략해 뷰어 상태 보존 (`hooks/use-dialog-back-guard.ts` 신설, `comparison-modal.tsx`, `ai-summary-dialog.tsx`, `app/page.tsx`)
- **오타/0건 검색 시 에러 화면·다이얼로그 겹침** — "법령을 찾을 수 없습니다" 안내 다이얼로그 뒤로 "검색 결과를 표시할 수 없습니다" 에러 화면이 함께 렌더되어 겹쳐 보이던 문제. 안내 다이얼로그 표시 중에는 배경을 중립 상태로 유지 (`search-result-view/index.tsx`)
- **온보딩 투어 종료 후 검색창 미포커스** — 투어가 끝나도(완주·스킵 모두) 검색창에 포커스가 가지 않아 바로 타이핑할 수 없던 문제. `OnboardingTour`에 `onEnd` 훅 신설 후 검색창 포커스 연결 (`onboarding-tour.tsx`, `search-view.tsx`)

### 📝 Docs
- **JUDGE_DEMO_SCENARIO 프로덕션 리허설 현행화** — 장면 5에 "전국 선택" 단계 보완(지역 기본값이 수도권이라 강릉시가 목록에 안 뜸), 장면 6 홈 카드명 "변경 영향 분석"으로 정정 + 기간 시작일 설정 단계·실측 결과(4건, 긴급3·참고1) 반영, 각 장면 실측 소요시간 갱신

## [2.5.2-beta] — 2026-07-10

프로덕션 리뷰 #6 — 사용자 UX 관점 전체 기능 워크플로우 리뷰. 페르소나 3인(조례 담당 공무원·인허가 민원 담당·법률 비전문 일반인) × 7개 워크플로우를 headless Chrome(데스크톱 1440px + 모바일 375px)으로 완주하며 마찰 15건 목록화, 심각 1건·불편 5건 수리. vitest 743/743 + tsc 클린 + headless 재검증.

### 🐛 Fixed
- **BYOK 키 등록 후 데드엔드 (심각)** — 미로그인 사용자가 AI 게이트에서 Gemini 키를 저장해도 pending 질의·도구가 실행되지 않고 게이트 화면에 그대로 남던 문제. 게이트 버튼 재클릭도 무반응(이미 키가 있어 다이얼로그가 안 뜸)이라 검색어 재입력 외 탈출로가 없었음. 키 저장 시 로그인 성공과 동일하게 pending 액션을 이어가도록 수리 — ① `use-ai-gate`에 `handleKeySaved` 신설(pending 액션 실행) ② 게이트 다이얼로그에 `onKeySaved` 경로 추가 ③ AI 검색 401 게이트 이벤트에 질의 재실행 `onSuccess` 부착 ④ 인증 폴백 화면 버튼에도 동일 적용 (`use-ai-gate.ts`, `ai-gate-dialog.tsx`, `ai-gate-provider.tsx`, `useAiSearch.ts`, `search-result-view/index.tsx`)
- **AI 질문 자동완성 비문** — 문장형 질의("전세 보증금 못 돌려받으면 어떻게 하나요")에 "이란?"을 붙여 "…하나요란?" 비문을 제안하던 것 수리: 문장형은 그대로 질문화, 조문 패턴("인공지능법 30조")은 "내용은?/관련 판례는?"으로 (`search-suggest/route.ts`)
- **단문 조문뷰 판례 버튼 무반응 체감** — 긴 조문에서 판례 패널이 뷰포트 밖(본문 아래)에 열려 클릭해도 아무 일도 없는 것처럼 보이던 문제. 패널 열림 시 smooth 스크롤로 피드백 (`law-viewer-single-article.tsx`)
- **판례 프리페치 유실 (dev)** — React StrictMode 이중 마운트 시 abort된 요청이 동일쿼리 스킵 가드에 걸려 재요청되지 않아 개발 환경에서 판례 배지·목록이 항상 0건이던 문제. cleanup에서 스킵 가드 해제 (`use-precedents.ts`)

### 🔄 Changed
- **조례 미반영 탐지 진입 컨텍스트** — 홈 카드에서 진입 시 제목·설명이 "법령 변경 영향 분석"으로 떠 목적이 안 보이던 것을 모드별 제목("조례 미반영 탐지")·설명으로 전환, 폼 제출에도 모드 유지 (`impact-tracker-view.tsx`, `impact-tracker-input.tsx`)
- **모바일 패널 닫기 라벨** — 위임·판례 패널 동시 오픈 시 "닫기"×2가 나란히 떠 구분이 안 되던 것을 "위임 닫기"/"판례 닫기"로 (`law-viewer-action-buttons.tsx`)
- **AI 변경 요약 변경 없음 안내** — 보던 조문이 해당 개정에서 직접 변경되지 않았을 때 "제N조은(는) 이 개정에서 직접 변경되지 않았습니다" 안내를 diff 위에 표시 — 조문 제목과 무관 조문 diff가 떠 혼란스럽던 것 완화 (`ai-summary-dialog.tsx`)

### 📋 남긴 관찰 (사소 — 미수정)
- 온보딩 투어 종료 후 검색창 미포커스, 투어 예시 칩("관세법 38조")이 클릭 안 되는 장식
- 신구법 대조표 모달에서 브라우저 뒤로가기 시 모달이 아닌 뷰어 전체가 닫힘 (URL 라우팅 미통합)
- 오타·0건 검색 시 배경에 에러 화면과 안내 다이얼로그가 겹쳐 노출, 교정 검색어 뒤 공백
- 모바일 탭 터치 타깃 높이 28px (44px 권장 미달), article-history 중복 호출

## [2.5.1-beta] — 2026-07-10

프로덕션 리뷰 #5 — 검색 매칭·조례비교·전체뷰 판례 3대 버그 수리 + 개정 시점 선택 비교 신설. headless Chrome 실기기 검증(약칭 검색→조문 직행, 판례 라이브 패널 스크롤 갱신, 개정 시점 diff 교체) + vitest 743/743.

### ✨ Added
- **개정 시점 선택 비교** — AI 변경 요약 다이얼로그에 개정 연혁 셀렉터 추가. `law-history`(연혁 목록) + `oldnew?mst=`(해당 개정의 신·구대조)를 연결해 **임의 개정 시점의 신·구 diff와 AI 해설**을 볼 수 있음. 기존엔 최신 개정 1쌍으로 고정 (`ai-summary-dialog.tsx`)
- **전체 조문뷰 라이브 판례 패널** — 법령 전문 보기에서 판례 버튼이 먹통이던 문제 해결. 데이터·스크롤 추적(`fullview-active-jo`)은 이미 있었으나 렌더 마운트 지점이 없었음 → 우측 리사이즈 패널로 마운트, **본문 스크롤 시 화면 상단 조문 기준으로 판례 목록·헤더가 실시간 갱신** (`law-viewer-main-content.tsx`)
- **비공식 약칭 동적 해소** — "인공지능법"(공식 약칭은 "인공지능기본법") 같은 미등록 약칭 검색이 0건→무관 목록으로 빠지던 문제 해결. 법령명 검색 0건 시 어미(법/시행령…) 제거 후 재검색 → 이름·공식약칭 부분수열 점수로 필터·재정렬 (`lib/law-name-match.ts`, law-search·search-suggest 라우트 공용). "인공지능법 30조" → 인공지능기본법 제30조 직행
- **검색 결과 관련도 정렬** — 동의어 확장 결과의 이진(포함/미포함) 정렬을 이름·약칭 유사도 점수 정렬로 교체 — 무관 법령이 상위에 섞이던 문제 완화 (`useBasicSearch.ts`)

### 🐛 Fixed
- **조례비교 표 깨짐** — 프롬프트에 GFM 구분행(`|---|`) 지시 누락 + 셀 내 개행·파이프 무방어가 원인. 프롬프트에 표 3원칙 명시 + 서버측 `normalizeMarkdownTable` 후처리(구분행 삽입·잘린 행 병합·코드펜스 제거·열 수 정합)로 2중 방어 (`benchmark-analyze/route.ts`, `lib/markdown-table-normalizer.ts`)
- **자동완성 노이즈** — ① 조문 패턴("도로교통법 44조") 입력 시 동의어 법령에까지 "제44조"를 붙여 제안하던 것 중단 ② "음주운전 방법은?" 같은 기계식 AI 질문 템플릿을 의미 안전한 2종(이란?/관련 법령은?)으로 교체 ③ 약칭 폴백 결과가 AI 질문보다 아래로 깔리던 스코어 보정 (`search-suggest/route.ts`)

### 📝 Docs
- README 2.5.1 현행화 (베타 안내 v2.4.0 잔재 수정, 신기능 3종, BYOK 신형 키 형식), benchmark-analyze 헤더의 사문화된 "OpenClaw 우선" 주석 정정, 17-SYSTEM_CURRENT_STATE LLM 구성 현행화, 시연 시나리오 `demo/JUDGE_DEMO_SCENARIO.md` 신설

## [2.5.0-beta] — 2026-07-03

AI질의 UX 대개편 + 엔진(프롬프트·분류기·신뢰도) 개편. 라이브 벤치 2회 회귀 검증(avg 19.9s/22.4s, 기대인용 10/10) + headless Chrome 실기기 UX 검증 완료.

### ✨ Added — AI질의 UX
- **라이브 마크다운 스트리밍** — 답변 토큰을 실시간 마크다운으로 렌더 (150ms 스로틀). 스트리밍 토큰이 화면에 안 보이던 버그 수정(타이핑 useEffect isStreaming 분기 부재)
- **진행 타임라인 narration** — 릴레이가 도구 호출 사이에 흘리는 진행 멘트를 "AI 분석 중" 하위 텍스트로 표출 (대기 구간 투명화, 100자 트렁케이션)
- **에러카드 + 다시 시도** — 엔진 실패 시 가짜 답변 대신 에러카드·재시도·웹검색 버튼
- **캐시 배지** — 동일 질의 재검색 시 "저장된 답변 · N분 전" 배지 + 재생성 아이콘 (클라이언트 IndexedDB)
- **쿼터 표시** — 완료 후 통계 hover 팝업에 "오늘 AI 질의 N/M회" (BYOK는 무제한 표기)
- **tool_result 인간화** — 도구 결과를 "N KB 자료 수신" 형태로 표시

### 🔄 Changed — 엔진
- **신뢰도 단일화** — relay/claude 텍스트 경로를 `calcAnswerConfidence`로 통일 (gemini `calcConfidenceDetailed`와 동일 철학·임계 70/45·200자 플로어), claude 'high' 하드코딩 제거
- **인용 파서 bare 법령명 지원** — 낫표(「」) 없는 법령명·시행령·규칙도 인용으로 인정 (대명사형 제외)
- **3엔진 universalFormat 통일** — SPECIALIST[queryType] 폐기 (오분류 시 부적합 구조 강제 문제)
- **fast-path 답변 래핑** — 직결 조회 답변도 `## 조문 원문 조회` 헤딩 구조로 통일
- **inferQueryType 정비** — 요건→requirement·처벌+금액→scope 오버라이드, comparison 우선순위 재배열, '하고' 과탐 제거, term_search/law_system 데드코드 제거
- **hasPreEvidence 프롬프트 모순 해소** — pre-evidence 주입 시 도구 강제 지침과 즉답 지침이 충돌하던 것 조건화

### 🧹 Maintenance
- kordoc 3.5.1 → 3.10.1 (별표 HWP/HWPX/PDF 변환 라이브 회귀 확인, breaking change 없음)
- `components/ai-search-loading/` 데드코드 제거
- 문서 현행화: CLAUDE.md LLM 구성표, 05-RAG_ARCHITECTURE

## [2.4.2-beta] — 2026-07-03

테미스(맥미니 구독 Claude 릴레이) 엔진 3단 최적화 + 프로덕션 리뷰 #4 (전 카테고리 검색·AI 기능 전수 점검).

### ⚡ Performance — 테미스 엔진 3단 최적화
- **평균 응답 34.6s → 20.5s** (6유형 벤치: 조문/벌칙/별표수수료/판례/비교/복합, 정확도 기대인용 10/10 유지). 릴레이 경로에 Gemini 경로에만 있던 가속 레이어를 엔진 대칭으로 수복(`lib/fc-rag/relay-engine.ts`):
  - **Answer Cache 공유** — Upstash 캐시 조회/저장 (동일 질의 0.3s)
  - **Fast Path** — 법명+조문·판례·해석례·행정규칙·별표 패턴은 LLM 없이 직접 도구 호출 (관세법 38조 24.6s→2.6s, 판례검색 39.2s→0.6s)
  - **Pre-evidence** — simple/moderate 질의는 서버측 `search_ai_law` 1회(≤8s)를 시스템프롬프트에 주입 → `claude -p` 도구 왕복 제거·법령 오선택 감소 (비교질의 68.9s→24.0s, 첫토큰 56.4s→13.8s)
- 클라이언트 `preEvidence`(조문 컨텍스트)가 릴레이 경로에서 유실되던 것 전달 복구, `conversationId` 대화 맥락 반영 (follow-up 정확도)
- 벤치 하네스 신설: `scripts/bench-themis.mts`

### 🔧 Fixed — 프로덕션 리뷰 #4
- **홈 법령 통계 전부 0** — 법제처 통계페이지 fetch에 `Accept: text/html` 명시. undici 기본 Accept(`*/*`)면 응답이 ~15s 지연돼 타임아웃 → 헌법/법률/자치법규 카운트 전멸 (실측 15.1s→1.9s, `app/api/law-stats/route.ts`)
- **조세심판·관세 상세 조회 무조건 404** — 법제처 실응답 최상위 키(`SpecialDeccService`/`CgmExpcService`)로 교정 (`app/api/tax-tribunal-text`, `app/api/customs-text`)
- **신형 Google API 키(`AQ.…`) BYOK 등록 불가** — 서버 검증(`lib/api-auth.ts`)·입력 다이얼로그(`components/ai-gate-dialog.tsx`) 정규식에 신형 포맷 허용
- **lint 0 복구** — 정의되지 않은 룰(`@next/next/no-img-element`) disable 주석 제거 (`components/user-menu.tsx`)

## [2.4.1-beta] — 2026-06-28

프로덕션 리뷰 #2 후속(토스트 인프라·잔여 디자인·P2 폴리시) + #3(관련 판례 조회·Cmd+K 레이아웃) 마무리.

### 🔧 Fixed — 관련 판례 조회 (프로덕션 리뷰 #3)
- **조문 하단 '관련 판례'가 거의 항상 0건이던 버그** — `usePrecedents`가 "법령명 제N조"를 법제처 판례**명** 검색으로 보내 "제N조" 토큰이 안 걸려 0건이 되던 문제. **본문(전문)검색(`search=2`)으로 전환**하고, 정밀도를 위해 **구문(따옴표)검색 1차 → 0건이면 토큰 AND 폴백** 하이브리드 적용(`app/api/precedent-search/route.ts`, `hooks/use-precedents.ts`).
  - 변별력 있는 법명은 구문검색의 인접매칭으로 오탐 차단(관세법 제38조 184→28건, 형법 제38조 경합범 오염 배제), 긴 분법/개명 법령명은 폴백으로 0건 회피(소방시설 설치 및 관리에 관한 법률 제12조 129건).
  - 과거 0건 캐시와의 충돌을 막는 캐시키 `::ref` 네임스페이스. 본문검색 경로는 법원명/연도 오추출 스킵. 실 법제처 API 끝단 검증 + 재현 테스트 5건.

### 🎨 Fixed — Cmd+K (프로덕션 리뷰 #3)
- **'최근 조회' 레이아웃** — Cmd+K 검색 모달에서 조회 이력이 `<Card>`(테두리·그림자·패딩)째 렌더돼 위 '최근 검색' 리스트와 겹쳐 부유하던 문제 → `embedded` 모드로 형제 섹션과 동일한 평평한 sticky 헤더 섹션으로 통일(`components/viewing-history-panel.tsx`, `command-search-modal.tsx`).

### 🔧 Fixed — UX 잔여 (프로덕션 리뷰 #2 후속)
- **토스트 렌더러 복구** — `<Toaster/>`가 layout에 미마운트돼 기존 `toast()` 호출(복사완료·검색 피드백·즐겨찾기 undo 등)이 전부 화면에 안 뜨던 잠복 버그 수정(`components/ui/toaster.tsx` 신설 + `app/layout.tsx` 마운트). 즐겨찾기 삭제 '실행취소' 토스트 + user 모드 undo DB 경합 직렬화.
- **잔여 디자인 5건** — 즐겨찾기 삭제 undo·터치타깃(FAV-2), 모바일 온보딩에서 없는 AI토글 단계 제외(SR-3), 판례 '결과 내 검색' 카피 통일(PREC-2), 해석례/재결례 총건수 배지(F2), '관련 심급' → '같은 사건명 판례' 정직화(PREC-4).

### 🧹 Changed — P2 폴리시 47건 (프로덕션 리뷰 #2)
- 위임/비교모달·조례 벤치마킹·법령뷰어·판례·FC-RAG·별표/별지·결정문·타임머신·영향분석·통합검색·즐겨찾기·조회기록 전 영역 다듬기 — 접근성(aria-label·터치타깃), 빈상태/로딩 피드백, 참조모달 ESC 단계 복귀, 즐겨찾기 머지 실패 시 로컬 보존(데이터 손실 방지) 등.

## [2.4.0-beta] — 2026-06-27

조회 이력 재조회, 별지(서식) 뷰어, 그리고 **현행성 가드 2차 강화**(프롬프트 의존을 넘어 프로그램적 백스톱 추가) + 프로덕션 UX 마찰 개선.

### ✨ Added
- **조회 이력(최근 조회)** — 열람한 법령·조례·판례를 홈·Cmd+K에서 재조회. 게스트 localStorage / 로그인 Supabase 동기화(`lib/viewing-history-store.ts`, 마이그레이션 011).
- **별지(別紙 제N호서식) 뷰어** — 법령뷰어 본문·AI답변의 "별지 제N호서식" 링크 → 모달 서식 본문(법제처 별표종류 "서식", knd=2). 별표 캐시 키 6자리 정규화.

### 🛡️ 현행성 가드 2차 (개정 전 법령 오답 차단 — 프로그램적 백스톱)
- **무라벨 과거버전 라벨링** (`lib/fc-rag/tool-adapter.ts`) — `get_batch_articles`(efYd 지정)·`get_historical_law` 출력에 `get_law_text`와 동일한 ⚠️ 현행성 경고 주입(라벨 비대칭 제거).
- **quality-evaluator 현행성 백스톱** — 도구 결과에 연혁/시행예정/구법령명 마커가 있는데 답변이 현행성을 미반영하면 marginal 강등 + 경고(→ answer-cache 저장 차단으로 오답 증폭 방지). `forceLastTurn` 경로에도 품질평가 적용.
- **프롬프트 보강** — "시행일 > 오늘 = 시행예정본" 계산 규칙(라벨 유실 집계 출력까지 커버), 판례 인용 시 구(舊) 조문은 "구 「법명」(YYYY 개정 전)"으로 현행과 구분 표기.
- **pre-evidence 즉답 차단** — 무라벨 `search_ai_law` 결과만으로 조문 인용 전 `search_law`/`get_law_text`로 현행 확인 강제.

### 🔧 Fixed — UX
- **판례 재조회** — 조회 이력의 판례가 사건번호를 '법령명'으로 검색해 0건이 되던 버그 → `classification(searchType='precedent')`을 실어 판례 전용 핸들러로 라우팅.
- **타임머신 모바일** — '이력 N건' 토글이 모바일에서 죽어 있던 문제(사이드바가 `hidden sm:flex`) → 모바일 전용 개정이력 오버레이 추가.
- **별표 보기 dead-end** — 번호 없는 "별표 보기"가 빈 모달로 직행하던 문제 → 폴백(첫 별표) 실행하도록 가드 완화.
- **쿼터 메시지** — 내부 기능키(`fc_rag` 등) 노출 → 한글 기능명으로 교체.
- **Cmd+K 키보드 네비** — 즐겨찾기 6개 이상일 때 화살표가 안 보이는 항목을 선택하던 문제 수정.
- **위임 미비 탐지** — 위임 조항 0건인데 "모두 정상"(녹색)으로 표시돼 분석된 듯 오해되던 문구를 중립 표시로 교정.

### 🎨 Fixed — 모바일 디자인 (헤드리스 스샷 비교 후 선택 적용)
- **신·구법 대조 모달** — 모바일 65vh 고정 → 92dvh로 키워 상하 분할 본문 여유 확보(F2).
- **별표/별지 모달** — 모바일에서 숨겨졌던 컨트롤(폰트·복사·다운로드·법제처원문·새로고침)을 하단 고정 툴바로 노출(LV-ANNEX-2).
- **조례 벤치마크** — 모바일에서 사라지던 시행일·개정유형을 카드형 레이아웃으로 노출(OB-3).
- **개정이력 원문 모달** — 900px 하드코딩 폭(모바일 오버플로우) → 반응형(95vw/900px) + '새 창에서 열기' 링크 추가(TM-3/TM-4).

### ⬆️ Deps
- korean-law-mcp 4.2.x → **4.4.2**, kordoc → **3.5.1** (판례 누락·별표 파서·latency 계측 수정).

## [2.3.0-beta] — 2026-06-10

AI 답변 **현행성(現行性) 가드**. 실사고(소방 질의에 2022년 분법 전 법령 기준 답변) 원인 분석 결과 — ① LLM이 오늘 날짜를 모름 ② "현행 법령 기준" 지침 부재 ③ 도구 미호출 답변이 품질 평가를 통과하는 구멍 ④ 1년 묵은 도구 버전 — 4개를 모두 차단.

### 🛡️ Added — 현행성 가드
- **오늘 날짜(KST) 주입** (`lib/fc-rag/prompts.ts`) — 동적 헤더에 매 질의마다 주입. static 프롬프트에 넣으면 Gemini context cache가 매일 깨지므로 동적 헤더에만 배치.
- **현행 법령 기준 섹션** (static 프롬프트) — 도구 결과의 시행일자·`[현행]`/`[연혁]` 라벨 확인 필수, 연혁/분법/시행예정 감지 시 답변에 명시, "## 근거 법령"에 시행일자 병기, 학습데이터의 옛 법령명·조문번호 사용 금지 (소방 분법 사례 명문화).

### 🔧 Fixed
- **quality-evaluator memory bypass 제거** — 도구 미호출 + 인용 3개 이상이면 marginal을 보장하던 규칙은 개정 전 법령을 그럴듯하게 인용한 환각 답변을 통과시키는 구멍. 역전: 도구 근거 없는 인용은 fail로 강등.
- **vitest 전역 mock 누락 보강** (`vitest.setup.ts`) — `search-normalizer` mock에 `detectAliasesInQuery` 부재로 claude/gemini-engine 테스트 8건이 깨져 있던 문제 수정 (644→652 pass).

### ⬆️ Changed — 의존성 현행화
- **korean-law-mcp `^3.2.1` → `^4.1.1`** — 프로덕션이 semver 제약으로 3.5.x에 묶여 있던 문제 해소. v4의 판례 토큰 74% 감축, verify_citations, 판례 검색 구조화, 법제처 빈 응답 재시도 등 수용. (4.2.0 publish 시 `[현행]`/`[연혁]` 라벨·구 법령명 표기까지 자동 수용)
- **kordoc `^2.2.6` → `^2.9.1`**
- **answer cache 키 v29 → v30** — 옛 프롬프트로 생성된 캐시 답변 즉시 무효화.

## [2.2.0-beta] — 2026-04-15

AI 파이프라인 **관찰성(observability)** 전면 재작성. 질의·답변 본문 없이 개발·품질·비용 신호를 전 엔드포인트에서 수집. 레거시 본문 로거 완전 제거 + 개인정보처리방침 국외이전 고지 반영.

### 🔭 Added — AI Telemetry
- **`ai_telemetry` 신설 테이블** (`supabase/migrations/009_ai_telemetry.sql`) — 본문 없는 집계 관찰성 데이터. RLS 전면 차단(`using (false)`) + service_role만 쓰기. 90일 자동 삭제 크론.
  - 수집: endpoint, BYOK 여부, 세션 익명 해시(30분 윈도우), complexity/queryType/domain 분류, 질의·답변 **길이 버킷**(<50/50-200/200-500/500+), 5단계 latency (total/router/retrieval/generation/verification), 도구 호출 이름·오류, 신뢰도/품질 점수, fast-path 사용 여부, fallback 트리거 여부, verification method 집계, **인용 법령 MST 배열**(공공정보), error_category(원본 메시지 X), 실제 모델 ID, 토큰 수/비용 추정(USD)
  - 저장 금지: 질의/답변 원문, user_id, IP, UA 원본, 도구 인자 — 개인정보 해당 항목 없음 → 별도 동의 불필요
- **`lib/ai-telemetry.ts`** — `recordTelemetry()` + 헬퍼 (`bucketLength`, `classifyUa`, `sessionAnonHash`, `categorizeError`, `estimateCostUsd`). 5개 라우트 공용.
- **전 AI 엔드포인트 연결** — `fc-rag`, `summarize`, `impact-tracker`, `benchmark-analyze`, `impact-analysis`. Vercel serverless fire-and-forget 절단 방지 위해 `finally`에서 `await` 방식.
- **BYOK 요청도 전부 기록** — 기존 로거는 `userId` null로 skip하여 로그 블랙홀이었음. 본문이 없어 약관 개정 불필요하게 전수 관측 가능.

### 🔧 Fixed
- **Gemini Lite 모델 503 대응** — `gemini-3.1-flash-lite-preview` 모델이 Google 쪽에서 과부하 반환. `GEMINI_LITE_MODEL=gemini-3-flash-preview` 환경변수 오버라이드로 `summarize` 500 에러 및 `impact-tracker`의 "AI 미응답 자동 분류" 폴백 현상 해소.
- **`model_id_actual` trailing `\n`** — `vercel env add`에 개행 포함 버그 수정 (`printf` 사용).
- **Vercel serverless fire-and-forget 로그 절단** — JSON 응답 라우트에서 `recordTelemetry`가 응답 flush 후 잘리던 문제. `await` 전환으로 해결.

### 🗑 Removed
- **`ai_query_logs` 테이블 + `delete_my_ai_logs` RPC + 30일 보관 크론** (migration 010) — 본문 저장 리스크 완전 제거.
- **`lib/query-logger.ts`** — Vercel에서 Hermes API로 본문 POST, 로컬에서 `logs/*.jsonl` append하던 레거시. 완전 삭제.
- **`lib/ai-query-logger.ts`** — Supabase `ai_query_logs` 본문 저장 로거. 완전 삭제.
- **fc-rag route의 `logAnswerText`/`logToolCalls` 수집 변수** — 본문 흔적 제거.
- **`model` 필드 `'gemini-flash'` 하드코딩** — 실제 모델 ID(`AI_CONFIG.gemini.primary`/`lite`) 주입.

### 🛡 Legal / Privacy
- **개인정보처리방침 v1.0.0 → v1.1.0** (`components/legal/privacy-content.tsx`, `lib/privacy/consent-versions.ts`)
  - **신설: 국외 이전 고지 배너** — 서비스 진입 상단에 Supabase 일본(Tokyo) 리전 사용 명시
  - **제1항 자동 수집 항목**에 AI 파이프라인 텔레메트리 서브 항목 추가 (본문 미저장 명시)
  - **제3항 보유 기간 표** — 기존 "AI 질의 로그(30일)" → "AI 파이프라인 텔레메트리(90일)"
  - **제6항 처리 위탁 표 확장** — 수탁자별 **이전 국가/리전**과 **이전 방법** 컬럼 신설. Supabase(일본 ap-northeast-1), Vercel(한국 icn1), Google(미국), Cloudflare(글로벌 엣지)
  - **신설 제10항: 국외 이전 요약** — 주 저장소/AI 처리/게이트웨이 구분, 본인 데이터 삭제 경로 안내
  - 개인정보 보호법 제28조의8(개인정보의 국외 이전) 준수

### 🔐 Security
- RLS 4관왕 검증 완료: service_role SELECT/INSERT ✅, anon key INSERT 42501 차단 ✅, 인덱스 6개 정상 생성
- 시크릿 누출 스캔 통과 — `AIzaSy…`, `sk-…`, `sbp_…`, JWT 패턴 신규/수정 파일 전수 검사

### 📊 관찰성으로 즉시 가능해진 분석
- 법령변경영향분석(impact-tracker) 엔드포인트 사용량·latency·에러 분해
- lite 모델 503 시계열
- 도구별 실패율, fast-path 히트율(domain×)
- queryType별 citation 검증 통과율
- 인용 법령 MST 빈도 → 캐싱 우선순위
- 일별 비용 추정(USD) 시계열
- BYOK vs 로그인 사용자 분포 (본문 없이)

### 🧪 검증
- 5개 엔드포인트 parallel smoke test: 전부 HTTP 200 + telemetry row 기록 확인
- Supabase RLS 정책 동작 검증
- `ai_query_logs` DROP 완료 확인
- Gemini API 키 유효성 재검증

---

## [2.1.0-beta] — 2026-04-14

공개 베타 출시. 엔진이 **Gemini 3 Flash 단일 프라이머리**로 정리되고, 일일 쿼터·BYOK·로그 수집 체계가 갖춰졌습니다.

### 🧪 베타 출시
- **공개 도메인**: `lexdiff.gomdori.app` (Cloudflare → Vercel)
- **Google OAuth 로그인 필수** — 미로그인 401
- **Supabase 기반 일일 쿼터** — 유저별 기능별 카운트 (`fc_rag 10/일`, `summarize 30/일`, `impact 5/일`, `benchmark 3/일`)
- **BYOK (Bring Your Own Key)** — 본인 Gemini API 키(`AIzaSy...`) 등록 시 쿼터 무제한, 호출 비용 자부담. 키는 브라우저 로컬에만 저장, 서버 DB에 저장하지 않음 (`x-user-api-key` 헤더로만 전달)
- **익명 쿼리 로그 수집** — `logs/fc-rag-queries.jsonl`에 질문·답변·도구호출·confidence 기록. 품질 튜닝 및 환각 탐지 목적. 개인 식별 정보 미수집
- **법적 고지 배너** — Hero 및 AI 답변 하단에 면책 배너 상시 표출
- **SSE answer 이벤트 면책 자동 주입** — `warnings[0]`에 법률 자문 대체 불가 고지

### 🧠 AI 엔진 전환 (Claude → Gemini)
- **프라이머리**: `gemini-3-flash-preview` — Function Calling 멀티턴 RAG
- **S1 라우터**: `gemini-3.1-flash-lite-preview` — 쿼리 분류 경량 모델 (20% 해시 롤아웃)
- **Hermes/GPT-5.4 경로 비활성** — `DISABLE_HERMES=true` (코드는 유지)
- **46개 등록 도구** — `lib/fc-rag/tool-registry.ts`. 핵심 2개(`search_decisions`/`get_decision_text`)로 17개 결정문 도메인 통합 (precedent/interpretation/tax_tribunal/customs/constitutional/admin_appeal/ftc/pipc/nlrc/acr/appeal_review/acr_special/school/public_corp/public_inst/treaty/english_law)
- **TypeScript 직접 import** — korean-law-mcp 핸들러를 MCP 프로토콜 없이 직접 호출. 오버헤드 제거
- **SSE 스트리밍** — tool_call/tool_result/answer 이벤트 실시간 전달, UI에 도구 호출 과정 표시

### 🎯 품질 튜닝 (FC-RAG)
- **Confidence 공식 재설계** — 분량 편향 제거, 정확성 중심 4신호 기반. Confidence High 판정 1/10 → **10/10**
- **citation verify timeout** 10s → 15s (법제처 느린 응답 대응)
- **MST 환각 차단** — P0-1/2/3 + CHAIN_COVERS 병합, stale MST 제거
- **도구 호출 0회 가드** — `noToolsCalled` 시 confidence=low 강제, 캐시 skip, warning 주입
- **citation recall** 65% → 77%
- **answer-cache + Gemini context caching** — 동일 쿼리 재질의 시 즉답
- **fast-path answer-cache 저장** — P0-0
- **forceLastTurn 재요청** — `cachedTokens` 누적 버그 수정, loop 탈출 가드
- **`callGeminiWithRetry`** — HTTP 429/500/503, `RESOURCE_EXHAUSTED`, `UNAVAILABLE`, `overloaded`, rate-limit 메시지에 지수 백오프 (700→1400→2800ms + jitter). 스트림 중 chunk 에러는 상위 위임
- **결정문 전문 스마트 압축** — 컨텍스트 예산 최적화
- **단일 진실 소스** — `lib/fc-rag/decision-domains.ts` TTL/사이즈/프롬프트/필터 통합

### 🛠 인프라
- **Next.js 16** — `middleware.ts` → `proxy.ts` 마이그레이션. CORS 화이트리스트 echo + CSP nonce + Supabase SSR 세션 리프레시
- **vercel.json `maxDuration`** — `fc-rag=120s`, `impact-tracker=90s`, `summarize=60s`, `benchmark-analyze=60s`. Hobby 10s 기본값 해제
- **Upstash Redis** — 캐시/rate-limit 계층 도입
- **WCAG 2.1 AA** — `aria-live="polite"` 스트리밍 답변 live region, `aria-busy` 진행 표시

### 🎨 UI/UX
- **AI 스트리밍 중지 버튼** — 스트리밍 중 사용자 abort 가능
- **홈 헤더 베타 배지** — 로고 우상단 조용한 `beta` 마크
- **홈 검색창 쿼리 분류** — 엔드포인트 라우팅 정확도 향상
- **Hero 법적 고지 배너** — amber border/bg, `role="note"`

---

## [2.0.0] — 2026-03

### Added
- **Claude CLI subprocess + stream-json** 기반 실시간 SSE (*이후 2.1.0에서 Gemini로 전환*)
- **멀티턴 대화** — 이전 질문 맥락 기억 + pre-evidence 즉답
- **법령 관계 그래프** — Supabase PostgreSQL 기반 시각화 + 영향 분석
- **메타답변 가드** — "법률 상담은 변호사에게" 같은 무의미 답변 차단
- **별표 직접 파싱** — kordoc 연동, HWP/HWPX/PDF를 Gemini Vision 없이 순수 파싱
- **쿼리 확장 엔진** — 자동 확장 + 머징/리랭킹 + 자동완성 연동
- **조례 벤치마킹 도구** — 지자체 간 AI 비교 분석 + 권역 선택 UI
- **667개 테스트** — Vitest 단위·통합·E2E (60개 공무원·법률자문 E2E 포함)

### Changed
- **7차 프로덕션 리뷰** — SSRF 방지, XSS 방어, AbortController, 타입 안전성, 입력 검증 전면 강화
- **데드코드 제거** — 총 -5,600줄

---

## [1.x]

- Anthropic SDK 직접 호출 (Gateway 제거), tool_use 멀티턴 파이프라인
- Claude CLI 스트리밍 stream-json 전환
- PDF 별표 파싱 (pdfjs-dist 포팅, 선 기반 테이블 감지)
- 별표 파서 업그레이드 (구형 HWP 지원 + HWPX 개선)
- AI 비교분석 (포커스 입력 + 지자체 다중선택 벤치마킹)
- 검색 UX (자동완성, 약칭 인식, 검색바 도구 바로가기)
- 질의 로그 시스템 (환경별 분기 + 사용 패턴 분석)
