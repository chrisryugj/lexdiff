# Task Log

> 작업 완료 시 자동으로 기록됩니다. 최신 작업이 위에 표시됩니다.

---

## 2025-12-09

### [15:30 KST] 라이트 테마 UI 가독성 전반 개선
- **Files**:
  - `app/globals.css` (modified) - prose blockquote 테마별 색상 분리
  - `components/search-bar.tsx` (modified) - AI 검색바 라이트 모드 배경
  - `components/law-viewer-ai-answer.tsx` (modified) - AI 인용 아이콘/배지 색상
  - `components/file-search-answer-display.tsx` (modified) - 조문 발췌 블록 배경
  - `lib/file-search-client.ts` (modified) - RAG 프롬프트 개선
- **Changes**:
  - **AI 검색바**: 라이트 모드 `bg-purple-50`, 버튼 `bg-purple-700` (가독성 향상)
  - **조문 발췌 블록**: 라이트 모드 `oklch(0.45 0.01 240)` 어두운 회색 배경, 텍스트 `#1f2937`
  - **AI 인용 아이콘**: 사이드바 항목 `bg-emerald-600/20 text-emerald-700` (라이트 모드)
  - **AI 인용 배지**: 헤더 `bg-emerald-200/40 text-emerald-900` (라이트 모드)
  - **AI 경고 문구**: 라이트 모드 `bg-amber-50 text-amber-900` 추가
  - **RAG 프롬프트**: 관련 법령에서 본문 출력 금지 규칙 강화 (조문번호+제목만)
- **Impact**: 라이트 테마에서 주요 UI 요소 가독성 대폭 향상
- **Commit**: `fcafdaa`

---

## 2025-11-29

### [10:30 KST] UI/UX 개선 Phase 2 - 전문조회 복사 피드백 및 신구법 모달 레이아웃
- **Files**:
  - `components/virtualized-full-article-view.tsx` (modified)
  - `components/comparison-modal.tsx` (modified)
- **Changes**:
  - **전문조회 복사 피드백**: viewport 좌표 계산 수정, 토스트 스타일 개선 (bg-primary)
  - **신구법 모달 제목**: 순서 변경 (아이콘+법령명 → 신·구법 대조표 + 법령명)
  - **법령명 들여쓰기**: '신' 글자와 정렬 (ml-[28px] sm:ml-[32px])
- **Impact**: 복사 피드백 정상 표시, 모달 제목 계층 구조 개선
- **Commit**: `49348f1`

### [09:00 KST] UI/UX 종합 분석 및 P0/P1 개선 완료
- **Files**:
  - `docs/24-UI-UX-ANALYSIS-REPORT.md` (created) - 종합 분석 보고서
  - `components/file-search-answer-display.tsx` - 프로그레스바 단계별 진행
  - `components/reference-modal.tsx` - 포커스 관리, 폰트 크기 확장
  - `components/comparison-modal.tsx` - 포커스 관리, 비율 기반 동기 스크롤
  - `lib/unified-link-generator.ts` - aria-label 접근성 추가
  - `components/law-viewer.tsx` - 키보드 화살표 네비게이션
  - `components/virtualized-full-article-view.tsx` - 즐겨찾기/복사 버튼 추가
  - `app/globals.css` - 방문 링크 스타일
- **Changes**:
  - **P0 완료**: 프로그레스바 정확도, 모달 포커스 관리, aria-label, 폰트 크기 범위
  - **P1 완료**: 키보드 네비게이션, 방문 링크 스타일, 비율 기반 동기 스크롤
  - **추가 구현**: 전문보기 즐겨찾기/복사 버튼 (포탈 토스트 피드백)
- **Score**: 68/100 (Nielsen 59/100, WCAG Level A 부분 준수)
- **Commits**: `32ee12b`, `c4f5a96`, `e7caf5c`, `49348f1`

---

## 남은 UI/UX 개선 작업

### P1 미완료
- [ ] **handleContentClick 함수 분리** (`law-viewer.tsx:577-810`)
  - 링크 타입별 핸들러를 별도 훅으로 분리
  - 코드 복잡도 감소, 유지보수성 향상

### P2 중기 개선
- [ ] **온보딩/튜토리얼 시스템** (`components/onboarding/`)
  - 첫 방문 환영 모달
  - 검색 타입 안내 (일반 vs AI)
  - 법령 뷰어 사용법, 단축키 안내
- [ ] **라이트 테마 구현** (`app/globals.css`)
  - 현재 다크 모드만 지원
  - `:root`에 라이트 모드 변수 추가
- [ ] **시맨틱 HTML 구조 개선** (`lib/law-xml-parser.tsx`)
  - `<article>`, `<section>` 태그 활용
  - ARIA 속성 추가

---

## 2025-11-28

### [17:15 KST] 포커스 모드 버튼 임시 숨김
- **Files**: `components/floating-compact-header.tsx` (modified)
- **Changes**:
  - 포커스 모드 버튼(Maximize2 아이콘) 주석 처리로 임시 숨김
  - 상태(`isFocusMode`)만 존재하고 실제 UI 반영 로직이 미구현된 상태
- **Impact**: 동작하지 않는 버튼 제거로 UX 혼란 방지
- **TODO**: 추후 포커스 모드 기능 구현 시 주석 해제 필요
  - 구현 내용: 사이드바/헤더 숨김, 콘텐츠 영역 전체화면화
  - 위치: `search-result-view.tsx`에서 `isFocusMode` 상태에 따른 레이아웃 변경

### [16:00 KST] AI 답변 품질 개선 Phase 7 - 간결성 및 UX 향상
- **Files**:
  - `lib/file-search-client.ts` (modified) - 프롬프트 전면 개편
  - `lib/query-preprocessor.ts` (modified) - 쿼리 분류 키워드 확장
  - `lib/ai-answer-processor.ts` (modified) - [1] [2] [3] 단계 CSS 스타일링
  - `components/law-viewer-ai-answer.tsx` (modified) - 신뢰도/잘림 경고 배너
  - `components/law-viewer.tsx` (modified) - aiIsTruncated props
  - `components/ai-search-view.tsx` (modified) - isTruncated 상태 관리
- **Changes**:
  - **프롬프트 개편**: 장황한 설명형 답변 → 개조식(명사형 종결) + 800자 제한
  - **쿼리 분류 확장**: 절차 질문 키워드 3개 → 17개 (신청, 등록, 허가, 발급, 신고, 인가, 승인, 면허, 지정, 선정, 추천, 제출, 제외, 면제, 적용, 대상, 인정)
  - **단계 표시 스타일링**: [1] [2] [3] → CSS 원형 배지 (파란색, 그라데이션)
  - **신뢰도 경고**: confidence='low' 시 빨간 경고 배너 표시
  - **잘림 경고**: maxOutputTokens 도달 시 노란 경고 배너 표시
- **Impact**:
  - AI 답변 길이 약 70% 감소 예상 (토큰 비용 절감)
  - 절차 관련 질문 정확 분류율 향상 (17개 키워드)
  - 사용자 경험 개선 (시각적 피드백, 명확한 경고)
  - 개조식 답변으로 핵심만 빠르게 파악 가능
- **Reason**: AI 답변 과도한 장황함 개선 요청 (사용자 피드백)

### [14:30 KST] 사용법 안내 툴팁 및 상세 도움말 페이지 구현
- **Files**:
  - `components/ui/popover.tsx` (created) - shadcn/ui Popover 컴포넌트
  - `components/usage-guide-popover.tsx` (created) - 사용법 안내 팝오버
  - `app/help/page.tsx` (created) - 상세 도움말 페이지
  - `components/floating-compact-header.tsx` (modified) - 도움말 버튼 추가
  - `components/search-result-view.tsx` (modified) - AI/법령 모드별 guideType 설정
- **Changes**:
  - **2단계 도움말 시스템 구현**:
    - 간편 툴팁 (Popover): 핵심 기능 빠른 안내 + 첫 방문 자동 표시
    - 상세 도움말 페이지 (/help): 모든 기능 자세한 설명 + 예시
  - **법령 검색 가이드**: 검색 방법, 조문 탐색, 즐겨찾기, 비교 기능, 3단 비교, 단축키
  - **AI 검색 가이드**: 질문 방법, 답변 구조, 인용 출처, 검색 팁, 질문 예시
  - 첫 방문 시 localStorage 기반 자동 표시
  - 탭 네비게이션으로 법령/AI 검색 가이드 전환
- **Impact**: 처음 사용하는 사용자를 위한 친절한 사용법 안내 제공

---

## 2025-11-26

### [23:30 KST] Claude Code /doctor 오류 수정 및 가이드 문서 추가
- **Files**:
  - `.claude/agents/*.md` (modified) - 5개 파일
  - `.clauderc` (deleted)
  - `docs/CLAUDE_CODE_DOCTOR_FIXES.md` (created)
- **Changes**:
  - Agent 파일에 YAML frontmatter 추가 (name, description 필수)
  - .clauderc 삭제 (deprecated - settings.json으로 대체)
  - /doctor 수정 가이드 문서 작성
- **Impact**: Claude Code /doctor 검사 통과, 회사 프로젝트 적용 가이드

### [23:00 KST] AI 검색 결과 캐시로 뒤로가기 시 즉시 복원
- **Files**:
  - `components/search-result-view.tsx` (modified)
  - `components/law-viewer.tsx` (modified)
  - `lib/search-result-store.ts` (modified)
- **Changes**:
  - AI 검색(RAG) 결과를 IndexedDB에 캐시 저장
  - 뒤로가기 시 API 재호출 없이 캐시에서 즉시 복원
  - aiMode에 aiCitations, userQuery, fileSearchFailed 필드 추가
  - AI 모드에서 article-history API 호출 스킵 (503 에러 방지)
  - PC 법령뷰 즐겨찾기 버튼을 위임법령 오른쪽으로 이동
- **Impact**: AI 검색 후 홈 → 뒤로가기 시 즉시 복원 (재로딩 없음)

### [22:00 KST] 모바일 UI 개선 - 패딩 조정, 액션버튼 1줄화, 날짜 포맷 통일
- **Files**:
  - `components/law-viewer.tsx` (modified)
  - `components/law-viewer-ai-answer.tsx` (modified)
  - `components/search-result-view.tsx` (modified)
  - `components/reference-modal.tsx` (modified)
- **Changes**:
  - 모바일 본문 카드 패딩 조정 (컨테이너 p-2 pt-3, 내부 px-3 pt-4)
  - 조문 제목줄에 즐겨찾기 아이콘 버튼 추가 (모바일)
  - 액션버튼 1줄 표시: 텍스트 축약 (비교/요약/원문/위임)
  - 시행일 날짜 형식 YYYYMMDD → YYYY-MM-DD 통일
  - 레퍼런스 모달 모바일에서 글자크기 숫자 숨김
- **Impact**: 모바일 화면 활용도 향상, UI 일관성 개선

### [21:00 KST] UI 테마 시스템 개선 및 레이아웃 최적화
- **Files**:
  - `components/command-search-modal.tsx` (modified)
  - `components/floating-compact-header.tsx` (modified)
  - `components/law-viewer-ai-answer.tsx` (modified)
  - `components/law-viewer.tsx` (modified)
  - `components/reference-modal.tsx` (modified)
  - `components/search-result-view.tsx` (modified)
- **Changes**:
  - 검색 모달: 하드코딩된 색상을 CSS 변수로 전환 (다크/라이트 테마 지원)
  - AI 답변: PC/모바일 레이아웃 분리, 신뢰도 배지 위치 최적화
  - 법령 뷰어: 그리드 레이아웃 CSS 클래스 방식으로 변경
  - 참조 모달: 헤더 UI 개선, 법제처 원문 버튼 추가
  - 즐겨찾기: formatJO 함수로 조문 번호 포맷 통일
- **Impact**: 테마 시스템 일관성, PC/모바일 레이아웃 최적화

### [20:00 KST] 모바일 위임법령 탭뷰 링크 클릭 시 탭 전환 기능 완전 구현
- **Files**: `components/law-viewer.tsx` (modified)
- **Changes**: 위임법령 탭 내 링크 클릭 시 해당 탭으로 자동 전환
- **Impact**: 모바일에서 위임법령 탐색 UX 개선

### [19:00 KST] AI 검색 History 통합, 즐겨찾기 키 정규화, 모바일 레이아웃 개선
- **Files**: 다수 컴포넌트 수정
- **Changes**:
  - AI 검색도 History API에 통합 (뒤로가기 지원)
  - 즐겨찾기 키를 lawTitle-jo 조합으로 정규화
  - 모바일 레이아웃 개선
- **Impact**: AI 검색 ↔ 홈 네비게이션 자연스러움

### [18:00 KST] AI 답변 헤더 및 질문 표시 UI 개선
- **Files**: `components/law-viewer-ai-answer.tsx` (modified)
- **Changes**: 헤더 레이아웃 개선, 질문 표시 추가
- **Impact**: AI 답변 컨텍스트 명확화

### [17:00 KST] AI 답변 및 관련 법령 사이드바 UI 개선
- **Files**: 다수 컴포넌트 수정
- **Changes**: 사이드바 레이아웃, 패딩, 잘림 현상 수정
- **Impact**: AI 모드 사이드바 가독성 향상

### [14:00 KST] 법령 뷰어 UI 개선 - 플로팅 헤더 및 검색 모달
- **Files**:
  - `components/floating-compact-header.tsx` (modified)
  - `components/command-search-modal.tsx` (modified)
- **Changes**: 플로팅 헤더 스타일 개선, 검색 모달 UI 개선
- **Impact**: 법령 뷰어 헤더 UX 향상

### [11:45 KST] 유형별 프롬프트 템플릿 HTML 로직 호환성 검토 및 문서 업데이트
- **Files**:
  - `docs/future/RAG_QUALITY_IMPROVEMENT_PLAN.md` (modified)
- **Changes**:
  - B5 섹션(질문 유형별 시스템 프롬프트) 전면 수정
  - `ai-answer-processor.ts` HTML 변환 로직 분석 결과 반영
  - 기존 로직이 인식하는 패턴만 사용하도록 프롬프트 재설계:
    - 주요 섹션: `📋 핵심 요약`, `📄 상세 내용`, `💡 추가 참고`, `🔗 관련 법령`
    - 상세 내용 하위: `⚖️ 조문 발췌`, `📖 핵심 해석`, `📝 실무 적용`, `🔴 조건·예외`
  - 호환성 체크리스트 테이블 추가
  - 각 유형(specific/general/comparison/procedural)별 구조 명시
- **Impact**: HTML 로직 수정 없이 프롬프트만 변경하여 유형별 답변 구조 적용 가능
- **Reason**: 기존 CSS 스타일링 유지하면서 유형별 최적화 구현

### [10:30 KST] RAG 검색 품질 개선 계획 문서화
- **Files**:
  - `docs/future/RAG_QUALITY_IMPROVEMENT_PLAN.md` (created)
- **Changes**:
  - 현재 RAG 시스템 상태 분석 (Google File Search 기반)
  - 3단계 개선 계획 수립:
    - **Phase A (Quick Wins)**: maxOutputTokens 8192 증가, relevanceScore 기반 신뢰도, Citation 0 재시도
    - **Phase B (핵심 개선)**: 쿼리 전처리 파이프라인, 동적 프롬프트, 응답 캐싱
    - **Phase C (고급 기능)**: Metadata Filter, 관련 법령 확장, 피드백 루프
  - 각 작업별 코드 예시 및 적용 위치 명시
  - 예상 효과 및 비용 영향 분석
  - 구현 로드맵 (3주 계획)
- **Impact**: RAG 품질 개선 작업 시 참조 문서로 활용
- **Status**: 대기 (승인 후 구현 예정)

---

## 2025-11-25

### [22:30 KST] 홈페이지 디자인 개선 - Apple 스타일 스크롤 애니메이션
- **Files**:
  - `app/globals.css` (modified)
  - `components/search-view-improved.tsx` (modified)
  - `components/feature-cards.tsx` (modified)
  - `components/stats-section.tsx` (modified)
- **Changes**:
  - **globals.css**:
    - 통합 배경 시스템 추가 (page-bg, section-primary, section-elevated, section-subtle)
    - Apple 스타일 스크롤 애니메이션 (reveal-on-scroll, reveal-stagger)
    - feature-card, stat-card 통일된 스타일링
    - CTA 섹션 그라데이션 (cta-gradient)
    - section-divider 추가
    - 부드러운 scroll indicator 애니메이션 (scroll-indicator-apple)
  - **search-view-improved.tsx**:
    - 레이아웃 통일 (max-w-[1200px])
    - Intersection Observer 기반 스크롤 reveal
    - 배경 전환 통일 (히어로~컨텐츠 seamless)
    - Fixed 헤더 backdrop-blur 적용
  - **feature-cards.tsx**:
    - 일관된 카드 사이즈 (feature-card 클래스)
    - 미사용 import 제거 (Card, CardContent, ScrollReveal)
  - **stats-section.tsx**:
    - stat-card 클래스 적용
    - 아이콘 배경색 통일
- **Impact**: 깔끔하고 일관된 홈페이지 UX, 스크롤 시 부드러운 페이드인 효과
- **Reason**: 사용자 요청 (애플 스타일 디자인 개선)

### [21:30 KST] 최적화 계획 문서 업데이트
- **Files**:
  - `docs/integrated-optimization-plan.md` (modified)
  - `docs/future/FUTURE_ROADMAP.md` (modified)
- **Changes**:
  - **integrated-optimization-plan.md 전면 개정**:
    - 현재 코드베이스 상태 반영 (API 49개, 컴포넌트 87개)
    - 최근 완료 작업 목록 추가 (rag-answer/rag-search 삭제, Optimistic UI)
    - 미완료 데드 코드 목록 업데이트 (search-progress, search-view 파일들)
    - P0~P3 우선순위 재정의
    - search-result-view.tsx (2,266줄) 분할 계획 상세화
    - law-viewer.tsx (1,176줄) 분할 계획 추가
    - 실행 체크리스트 현행화
  - **FUTURE_ROADMAP.md 업데이트**:
    - 현재 활성화 시스템 목록 갱신 (File Search RAG, Optimistic UI 등)
    - Phase 8~12 기능 로드맵 간소화
    - 월간 비용 추정 업데이트
- **Impact**: 최적화 문서가 현재 프로젝트 상태와 일치
- **Reason**: 사용자 요청 (최적화 계획 현행화)

### [21:00 KST] CLAUDE.md, README.md 리프레시 및 데드 코드 정리
- **Files**:
  - `CLAUDE.md` (modified)
  - `README.md` (modified)
  - `app/api/rag-answer/route.ts` (deleted)
  - `app/api/rag-search/route.ts` (deleted)
  - `components/search-result-view.tsx` (modified)
- **Changes**:
  - **CLAUDE.md 업데이트**:
    - Project Overview 한글화 및 핵심 기능 정리
    - Technology Stack 테이블 형식으로 정리
    - State Management 섹션에 IndexedDB 캐싱 추가
    - Project Structure 섹션 추가 (주요 파일 구조)
    - API 라우트 수 51→49개로 업데이트
  - **README.md 업데이트**:
    - 기술 스택 테이블 형식으로 정리
    - Optimistic UI 패턴 추가
    - 프로젝트 구조 현행화 (hooks/, important-docs/ 추가)
  - **데드 코드 삭제**:
    - `/api/rag-answer` - 미사용 API 라우트 삭제
    - `/api/rag-search` - 미사용 API 라우트 삭제
    - `handleRagSearch` 함수 삭제 (search-result-view.tsx)
    - 미사용 state 변수 정리 (`ragResults`, `ragAnswer`)
  - AI 모델 정보 수정: Gemini 2.5 Flash만 사용 (2.0 Flash Exp 삭제됨)
- **Impact**:
  - 문서가 현재 코드베이스 상태 반영
  - 미사용 코드 72줄+ 삭제
  - API 라우트 2개 삭제로 유지보수 부담 감소
- **Reason**: 사용자 요청 (프로젝트 재분석 및 문서 업데이트)

### [15:30 KST] Optimistic UI 버그 수정 및 행정규칙 로드 속도 개선
- **Files**:
  - `lib/use-admin-rules.ts` (modified)
  - `hooks/use-law-viewer-admin-rules.ts` (modified)
- **Changes**:
  - **Strict Mode 버그 수정**: React Strict Mode에서 useEffect가 두 번 실행될 때 첫 번째 실행의 `cancelled=true`로 인해 Optimistic 캐시가 무시되는 문제 수정
  - **dataReady 플래그 도입**: 데이터 로드 완료 여부를 명시적으로 추적하는 새로운 상태 추가
    - 메모리 캐시 히트, IndexedDB Optimistic 캐시 히트, 폴링 완료, 전체 fetch 완료, 에러 발생 등 모든 완료 시점에서 `dataReady=true` 설정
  - **hasEverLoaded 로직 간소화**: 복잡한 `prevLoadingRef` + `allRulesCount` 로직 제거, `dataReady` 플래그만으로 판단
  - **로드 속도 개선**:
    - 배치 사이즈 10 → 25 증가
    - progress 업데이트를 각 요청마다 → 배치 완료 시에만으로 변경 (렌더링 횟수 감소)
  - 디버그 로그 정리
- **Impact**:
  - 새로고침 후 동일 법령 재검색 시 "행정규칙 없음" 표시 버그 해결
  - 캐시 없는 첫 로드 시 약 2배 속도 향상
  - React Strict Mode에서도 안정적으로 동작
- **Reason**: Optimistic UI 적용 후 발생한 연쇄 버그 해결 및 UX 개선

---

## 2025-11-23

### [21:45 KST] Fix 2-tier view scroll issues in law-viewer
- **Files**:
  - `components/law-viewer.tsx` (modified)
  - `lib/three-tier-parser.ts` (modified - 중복 조문 병합)
  - `lib/unified-link-generator.ts` (modified - 대통령령/부령 패턴 확장)
- **Changes**:
  - **핵심 문제**: Card 컴포넌트에 `overflow-hidden` 누락으로 인해 flex 자식들의 스크롤 범위가 제한되지 않음
  - Card에 `overflow-hidden` 추가 (line 1866)
  - Content wrapper를 `flex-1 min-h-0`로 유지 (flex item이 부모를 넘지 않도록)
  - 전문조회 모드를 ScrollArea로 감싸서 스크롤 활성화
  - 2단 뷰 본문에 FileText 아이콘 추가
  - three-tier-parser: 같은 법 조문에 대해 여러 시행령/시행규칙이 API에서 개별 객체로 올 때 Map으로 병합 (관세법 제38조 사례)
  - unified-link-generator: "대통령령으로 정하는" 외에 "정한다"도 캡처, "XXX부령으로 정한다"도 캡처
- **Impact**:
  - 1단 뷰, 2단 뷰, 전문조회 모드 모두에서 스크롤 정상 작동
  - 각 Panel이 독립적으로 스크롤 가능
  - 시행령/시행규칙 링크 클릭 시 해당 탭 자동 오픈
  - 관세법처럼 복잡한 위임 구조도 정확히 병합
- **Reason**: 사용자 피드백 ("2단뷰 스크롤 안됨", "1단뷰도 짤림", "전문도 없어짐")

## 2025-11-20

### [15:30] Create custom subagents system
- **Files**:
  - `.claude/agents/doc-maintainer.md` (created)
  - `.claude/agents/api-debugger.md` (created)
  - `.claude/agents/component-refactor.md` (created)
  - `.claude/agents/regex-pattern-expert.md` (created)
  - `.claude/agents/task-logger.md` (created)
  - `.claude/SUBAGENTS_GUIDE.md` (created)
  - `task.md` (created)
  - `CLAUDE_GLOBAL_SETTINGS.md` (created)
- **Changes**:
  - 프로젝트 작업 스타일 분석 (40+ API routes, React components, important-docs 시스템)
  - 5개 전문 에이전트 설계 및 구현:
    1. **Doc Maintainer**: 문서 작성/업데이트/CHANGELOG 관리
    2. **API Debugger**: API 통합 문제 진단, XML/JSON 파싱 에러 해결
    3. **Component Refactor**: React 컴포넌트 리팩토링, 모달 패턴
    4. **Regex Pattern Expert**: 정규표현식 패턴 설계/디버깅/최적화
    5. **Task Logger**: 작업 자동 기록 시스템
  - 각 에이전트별 워크플로우, 패턴, 예시 태스크 작성
  - 에이전트 사용 가이드 및 연계 패턴 문서화
  - 전역 설정 템플릿 생성 (프로젝트별 참조 제외)
- **Impact**:
  - 작업 효율성 향상 (전문 에이전트 자동 실행)
  - 일관된 문서화 및 작업 기록
  - 복잡한 문제 체계적 해결 (API 디버깅, Regex 최적화)
  - 프로젝트 지식 자동 축적 (task.md, CHANGELOG.md)
- **Reason**: 반복 작업 자동화 및 작업 패턴 최적화 요청

### [15:50 KST] Condense global settings template
- **Files**:
  - `CLAUDE_GLOBAL_SETTINGS.md` (modified)
- **Changes**:
  - 568줄 → 220줄로 다이어트 (~61% 감소)
  - 중복 내용 제거 (Context Window, Documentation, Git 등)
  - 저활용 섹션 제거 (디버깅 상세, 환경별 고려사항 상세)
  - 섹션별 핵심만 유지 (DO/DON'T, 간결한 예시)
  - Task Logger 자동 트리거 지침 추가
- **Impact**: 읽기 쉽고 재사용하기 쉬운 전역 템플릿 완성
- **Reason**: 사용자 피드백 ("너무 장황, 중복 줄이고 다이어트 필요")

### [16:05 KST] Translate to Korean and add KST timezone + agent auto-use
- **Files**:
  - `CLAUDE_GLOBAL_SETTINGS.md` (modified)
  - `task.md` (modified)
- **Changes**:
  - 전체 내용 한글로 번역 (영어 → 한글)
  - 시간대 설정 추가: 항상 서울 표준시(KST, UTC+9) 사용
  - 시간 표기 형식: `[HH:MM KST]`
  - 전문 에이전트 자동 사용 섹션 추가
  - 에이전트 패턴별 자동 매칭 예시 포함
- **Impact**:
  - 한국어 프로젝트에서 더 명확한 이해
  - 시간대 혼동 방지 (모든 기록이 KST로 통일)
  - 에이전트 자동 사용으로 작업 효율성 향상
- **Reason**: 사용자 요청 (한글 번역 + KST 사용 + 에이전트 자동 제안)

### [16:15 KST] Add server restart and browser cache refresh prohibition
- **Files**:
  - `CLAUDE_GLOBAL_SETTINGS.md` (modified)
  - `task.md` (modified)
- **Changes**:
  - "서버 및 브라우저 관련 제안 금지" 섹션 추가
  - 서버 재시작 직접 실행 금지 명시
    - npm run dev 재실행, kill 명령, 개발 서버 stop/start
  - 브라우저 캐시 새로고침 제안 금지 명시
    - 캐시 지우기, 하드 리프레시, 시크릿 모드
  - 대안 제시: "서버를 재시작해주세요" (사용자 요청)
  - 이유: 사용자가 직접 제어, 환경별 차이, 간단한 요청이 더 효과적
- **Impact**:
  - Claude가 서버/브라우저를 직접 제어하려는 시도 방지
  - 불필요한 기술적 지시 감소
  - 사용자 중심의 간단한 소통 유도
- **Reason**: 사용자 요청 (서버 재시작은 사용자에게 부탁, 브라우저 캐시 제안 금지)

---

## Archive

1000줄 이상 시 오래된 항목은 자동으로 Archive로 이동됩니다.
