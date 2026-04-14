# Task Log

> 작업 완료 시 자동으로 기록됩니다. 최신 작업이 위에 표시됩니다.

---

## 2025-12-28

### [현재] 문서 현행화 작업
- **Files**:
  - `README.md` (modified) - 프로젝트 현황 업데이트
- **Changes**:
  - API 라우트 수: 49개 → 73개 (판례/해석례 API 추가 반영)
  - 테스트 수: 314개 → 667개
  - 프로젝트 구조: law-viewer 분리 구조 반영
  - 최근 주요 업데이트: 12월 24일까지 반영
- **Impact**: 외부 공개 문서가 현재 상태 반영

---

## 2025-12-24

### law-viewer 컴포넌트 분리 + 구법령 조회
- **Files**:
  - `components/law-viewer.tsx` (modified) - 1,820줄 → 1,189줄
  - `components/law-viewer/*.tsx` (created) - 분리된 하위 컴포넌트
  - `hooks/use-law-viewer-*.ts` (created) - 분리된 훅들
  - `important-docs/09-COMPONENT_ARCHITECTURE.md` (updated)
  - `CLAUDE.md` (updated)
- **Changes**:
  - law-viewer-action-buttons, sidebar, single-article, related-cases, ordinance-actions 분리
  - 관련 훅 5개 분리 (modals, three-tier, admin-rules, precedents, related-precedent-cases)
  - 구법령 조회 기능 (efYd 파라미터 상속)
- **Impact**: 코드 유지보수성 향상, 35% 줄 수 감소

---

## 2025-12-20

### 법률 데이터 API 시스템 (korean-law-mcp 기능 도입)
- **Files**:
  - `app/api/precedent-*`, `interpretation-*`, `tax-tribunal-*`, `customs-*` (created)
  - `lib/precedent-parser.ts`, `precedent-cache.ts` (created)
  - `hooks/use-precedents.ts`, `use-law-viewer-precedents.ts` (created)
  - `components/precedent-section.tsx` (created)
  - `important-docs/07-LEGAL_DATA_API_GUIDE.md` (created)
- **Changes**:
  - 판례/해석례/조세심판원/관세청 검색·조회 API 9개 추가
  - 통합 검색 (법령+행정규칙+자치법규 병렬)
  - law-viewer 판례 연동 UI
- **Impact**: 법률 데이터 검색 범위 대폭 확장

---

## 2025-12-13

### 테스트 인프라 + 보안 강화
- **Changes**:
  - Vitest 테스트 314개 → 667개+
  - Rate Limiting 미들웨어 (일반 100req/min, AI 20req/min)
  - AI 일일 쿼터 (100회/일)
  - 보안 헤더 추가
  - GitHub Actions CI/CD
- **Impact**: 코드 품질 및 보안 대폭 강화

---

## 2025-12-09

### 라이트 테마 UI 가독성 개선
- **Changes**: AI 검색바, 조문 발췌 블록, AI 인용 배지 라이트 모드 색상 최적화
- **Commit**: `fcafdaa`

---

## 2025-12 (1일~8일) 요약

- 2-Tier AI 라우팅 (질문 유형별 프롬프트)
- 아이콘 마이그레이션 (lucide-react → hugeicons)
- 별표/별지 모달 개선
- 4단계 로딩 시각화
- 플로팅 헤더 디자인 개선
- 대규모 코드 정리 (~10,000줄 삭제)

---

## 2025-11 요약

### 주요 완료 작업
- **검색 시스템**: Phase 7 IndexedDB 캐시, 레벤슈타인 유사도 매칭
- **UI/UX**: Apple 스타일 홈페이지, 라이트/다크 테마
- **행정규칙**: Optimistic UI 패턴
- **AI 검색**: SSE 버퍼 처리 버그 수정, Progress 오버레이 개선
- **모달 시스템**: 히스토리 스택 (뒤로가기 지원)
- **법령 링크**: 통합 링크 생성 시스템

---

## 남은 작업 (Backlog)

### P2 중기 개선
- [ ] 온보딩/튜토리얼 시스템
- [ ] 시맨틱 HTML 구조 개선

---

## Archive

2025-11 이전 상세 내용은 `important-docs/01-CHANGELOG.md` 참조.
