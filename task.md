# Task Log

> 작업 완료 시 자동으로 기록됩니다. 최신 작업이 위에 표시됩니다.

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
