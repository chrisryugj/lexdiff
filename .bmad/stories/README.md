# LexDiff 개발 스토리 (BMAD Scrum Master)

**생성 일시**: 2025-11-19
**기반 문서**: `docs/bmad-architect-full-project-analysis.md`
**방법론**: BMAD-METHOD Scrum Master Agent

---

## 📋 스토리 목록

### 🔴 Phase 1: Quick Wins (1-2일, 총 4.5시간)

즉시 개선 가능한 Dead Code 제거 및 Dependencies 정리

| Story | 제목 | 우선순위 | 예상 시간 | 상태 |
|-------|------|---------|----------|------|
| 001 | Dead Code 제거 - search-progress 파일 3개 | P0 | 1h | ⬜ Pending |
| 002 | Dead Code 제거 - search-view.tsx | P0 | 0.5h | ⬜ Pending |
| 003 | Phase 5/6 비활성 코드 아카이브 | P1 | 1h | ⬜ Pending |
| 004 | Dependencies 정리 및 중복 제거 | P1 | 2h | ⬜ Pending |

**예상 효과**:
- 코드 라인 감소: -1,040줄
- 번들 크기 감소: ~400KB
- lib 디렉토리 파일 수: 48개 → ~43개

---

### 🟡 Phase 2: API Layer (3-5일, 총 8시간+)

API 레이어 통합 및 정규화

| Story | 제목 | 우선순위 | 예상 시간 | 상태 |
|-------|------|---------|----------|------|
| 005 | LawAPIClient 통합 클래스 생성 | P1 | 8h | ⬜ Pending |
| 006-049 | 44개 API 라우트 마이그레이션 | P2 | TBD | 📝 계획 필요 |

**예상 효과**:
- 중복 코드 제거: ~500줄
- 타입 안전성 향상
- 에러 처리 일관성

---

### 🟠 Phase 3: Component Refactoring (1-2주)

대형 컴포넌트 분할 (law-viewer, search-result-view)

| Story | 제목 | 우선순위 | 예상 시간 | 상태 |
|-------|------|---------|----------|------|
| TBD | law-viewer.tsx 분할 계획 | P1 | TBD | 📝 계획 필요 |
| TBD | search-result-view.tsx 분할 계획 | P1 | TBD | 📝 계획 필요 |

**참고**: `docs/architect-report-law-viewer.md`에 상세 분할 계획 있음

---

### 🟢 Phase 4: Performance (1주)

성능 최적화 (Code Splitting, Lazy Loading)

| Story | 제목 | 우선순위 | 예상 시간 | 상태 |
|-------|------|---------|----------|------|
| TBD | Code Splitting 적용 | P2 | TBD | 📝 계획 필요 |
| TBD | Virtual Scrolling 적용 | P2 | TBD | 📝 계획 필요 |

---

## 🚀 시작하기

### 1. Phase 1 스토리부터 시작

```bash
# Story 001 실행
cat .bmad/stories/001-delete-search-progress-files.md

# 완료 후 체크리스트 확인
# - [ ] search-progress.tsx 삭제
# - [ ] search-progress-dialog.tsx 삭제
# - [ ] search-progress-dialog-improved.tsx 삭제
# - [ ] 빌드 성공
```

### 2. 각 스토리는 독립적으로 실행 가능

각 스토리 파일에는 다음이 포함됨:
- ✅ 목표 및 현재 상태
- ✅ 완료 조건 (체크리스트)
- ✅ 구체적인 구현 가이드 (Before/After 코드)
- ✅ 테스트 계획
- ✅ 롤백 전략

### 3. 우선순위 기준

- **P0 (Critical)**: 즉시 실행, Dead Code 제거
- **P1 (High)**: 단기 목표 (1개월 내), API Layer, Component 분할
- **P2 (Medium)**: 중기 목표 (3개월 내), 성능 최적화

---

## 📊 전체 로드맵 예상

| Phase | 기간 | 스토리 수 | 예상 시간 |
|-------|------|----------|----------|
| Phase 1: Quick Wins | 1-2일 | 4개 | 4.5h |
| Phase 2: API Layer | 3-5일 | 1+44개 | 8h+ |
| Phase 3: Components | 1-2주 | TBD | TBD |
| Phase 4: Performance | 1주 | TBD | TBD |
| **총계** | **1-2개월** | **50+개** | **100+h** |

---

## 🎯 성공 기준

### Phase 1 완료 시
- [ ] 코드베이스 -10% (1,040줄 감소)
- [ ] 번들 크기 -15% (~400KB)
- [ ] lib 디렉토리 정리 (archived 폴더 생성)

### Phase 2 완료 시
- [ ] API 라우트 중복 코드 -90% (~500줄 제거)
- [ ] LawAPIClient 사용률 100% (44/44)
- [ ] 타입 안전성 향상

### Phase 3 완료 시
- [ ] 평균 컴포넌트 크기 < 300줄
- [ ] law-viewer.tsx 분할 완료 (15개 파일)
- [ ] search-result-view.tsx 분할 완료 (12개 파일)

### Phase 4 완료 시
- [ ] Lighthouse 점수 > 90
- [ ] 초기 로딩 시간 < 2초
- [ ] 번들 크기 < 900KB

---

## 📚 관련 문서

- **전체 분석 보고서**: `docs/bmad-architect-full-project-analysis.md`
- **law-viewer.tsx 분할 계획**: `docs/architect-report-law-viewer.md`
- **CLAUDE.md**: 프로젝트 가이드라인 및 패턴

---

## 💡 사용 예시

### Claude Code에서 스토리 실행

```
"Story 001을 실행해줘. 완료 조건을 체크하면서 진행해줘."
```

### 특정 Phase 전체 실행

```
"Phase 1 (Quick Wins) 4개 스토리를 순서대로 실행해줘.
각 스토리 완료 후 빌드 확인하고 다음으로 넘어가줘."
```

### 진행 상황 확인

```
"Phase 1 진행 상황을 요약해줘."
```

---

**작성자**: BMAD Scrum Master Agent
**버전**: 1.0
**최종 업데이트**: 2025-11-19
