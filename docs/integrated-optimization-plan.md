# LexDiff 최적화 실행 계획

**마지막 업데이트**: 2025-11-25
**현재 상태**: P0 일부 완료, 핵심 리팩토링 미착수

---

## 현재 프로젝트 상태

### 코드베이스 현황

| 항목 | 수치 | 비고 |
|------|------|------|
| **API 라우트** | 49개 | rag-answer, rag-search 삭제됨 |
| **컴포넌트** | 87개 | components/ 디렉토리 |
| **search-result-view.tsx** | 2,266줄 | 가장 큰 컴포넌트 (리팩토링 필요) |
| **law-viewer.tsx** | 1,176줄 | 두 번째로 큰 컴포넌트 |

### 최근 완료된 작업 (2025-11-25)

- [x] `/api/rag-answer`, `/api/rag-search` 삭제 (미사용 데드 코드)
- [x] `handleRagSearch` 함수 제거
- [x] CLAUDE.md, README.md 현행화
- [x] Optimistic UI 구현 (행정규칙)

### 미완료 데드 코드

| 파일 | 줄 수 | 상태 |
|------|-------|------|
| `search-progress.tsx` | ~100줄 | 사용 여부 확인 필요 |
| `search-progress-dialog.tsx` | ~150줄 | 사용 여부 확인 필요 |
| `search-progress-dialog-improved.tsx` | ~200줄 | 사용 여부 확인 필요 |
| `search-progress-modern.tsx` | ~150줄 | 사용 여부 확인 필요 |
| `search-view.tsx` | ~200줄 | search-result-view.tsx와 중복? |
| `search-view-improved.tsx` | ~250줄 | 사용 여부 확인 필요 |

---

## 우선순위 재정의

### P0: 즉시 실행 (1-2일)

**목표**: 데드 코드 제거로 유지보수 부담 감소

| 작업 | 예상 시간 | 리스크 | 효과 |
|------|----------|--------|------|
| search-progress 파일들 사용 여부 확인 및 정리 | 2h | 낮음 | ~600줄 제거 |
| search-view 파일들 사용 여부 확인 및 정리 | 1h | 낮음 | ~450줄 제거 |
| Dependencies 정리 (unused packages) | 2h | 중간 | 번들 크기 감소 |

**완료 조건**:
- `npm run build` 성공
- 검색 기능 정상 작동
- 번들 크기 측정

### P1: 핵심 리팩토링 (1-2주)

**목표**: 대형 컴포넌트 분리로 유지보수성 개선

#### search-result-view.tsx 분할 (2,266줄)

**현재 책임**:
- 검색 결과 표시
- File Search RAG 처리
- 법령 로딩
- 조문 선택
- AI 답변 표시
- 모달 상태 관리

**분할 계획**:

```
components/search-result/
├── index.tsx                 # 메인 컨테이너 (~300줄)
├── SearchResultHeader.tsx    # 헤더 및 네비게이션 (~150줄)
├── LawSearchResult.tsx       # 법령 검색 결과 (~200줄)
├── AISearchResult.tsx        # AI 검색 결과 (~300줄)
├── hooks/
│   ├── use-search-state.ts   # 검색 상태 관리 (~200줄)
│   ├── use-file-search-rag.ts # RAG 로직 (~300줄)
│   └── use-law-loader.ts     # 법령 로딩 로직 (~200줄)
└── types.ts                  # 타입 정의 (~50줄)
```

**예상 효과**: 2,266줄 → ~1,200줄 (47% 감소)

#### law-viewer.tsx 분할 (1,176줄)

**현재 책임**:
- 법령 본문 표시
- 3단 비교 뷰
- 조문 네비게이션
- 행정규칙 표시
- 참조 링크 처리

**분할 계획**:

```
components/law-viewer/
├── index.tsx                 # 메인 컨테이너 (~200줄)
├── ArticleContent.tsx        # 조문 본문 (~200줄)
├── ArticleNav.tsx            # 조문 네비게이션 (~150줄)
├── ThreeTierView.tsx         # 3단 비교 (~300줄)
├── AdminRulesPanel.tsx       # 행정규칙 (~150줄)
└── hooks/
    ├── use-article-navigation.ts
    └── use-three-tier.ts
```

**예상 효과**: 1,176줄 → ~600줄 (49% 감소)

### P2: 품질 개선 (2-4주)

**TypeScript 오류 수정**:
- `next.config.mjs`의 `ignoreBuildErrors: true` 제거
- 모든 타입 오류 수정

**성능 최적화**:
- React.lazy로 코드 스플리팅
- Virtual Scrolling (긴 조문 목록)
- 번들 분석 및 최적화

**테스트 추가**:
- 핵심 유틸리티 함수 테스트
- Hook 테스트

### P3: 장기 개선 (1-2개월)

**API Layer 통합**:
- LawAPIClient 클래스 생성
- 중복 코드 제거
- 타입 안전성 강화

**검색 시스템 개선**:
- Phase 8: 오타 교정 (규칙 기반 + AI 하이브리드)
- Phase 9: 자연어 검색 (Gemini 기반)

---

## 실행 체크리스트

### Week 1: P0 데드 코드 정리

- [ ] **Day 1**: search-progress 파일 분석
  - [ ] 각 파일의 import 검색
  - [ ] 사용되지 않는 파일 삭제
  - [ ] 빌드 확인

- [ ] **Day 2**: search-view 파일 분석
  - [ ] search-view.tsx vs search-result-view.tsx 비교
  - [ ] 중복 파일 삭제
  - [ ] 빌드 확인

- [ ] **Day 3**: Dependencies 정리
  - [ ] unused dependencies 분석
  - [ ] package.json 정리
  - [ ] 번들 크기 측정

### Week 2-3: P1 컴포넌트 분할

- [ ] **search-result-view.tsx 분할**
  - [ ] hooks 추출
  - [ ] 서브 컴포넌트 분리
  - [ ] 통합 테스트

- [ ] **law-viewer.tsx 분할**
  - [ ] hooks 추출
  - [ ] 서브 컴포넌트 분리
  - [ ] 통합 테스트

---

## 예상 효과

### 코드 품질

| 지표 | Before | After P0 | After P1 |
|------|--------|----------|----------|
| search-result-view.tsx | 2,266줄 | 2,266줄 | ~1,200줄 |
| law-viewer.tsx | 1,176줄 | 1,176줄 | ~600줄 |
| Dead Code 파일 | 6개 | 0개 | 0개 |
| 평균 파일 크기 | ~250줄 | ~230줄 | ~150줄 |

### 유지보수성

| 지표 | Before | After |
|------|--------|-------|
| 컴포넌트 책임 | 불명확 | 명확 |
| 코드 재사용 | 낮음 | 높음 |
| 테스트 용이성 | 어려움 | 용이 |
| 새 기능 추가 | 복잡 | 단순 |

---

## 리스크 관리

### 높은 리스크 작업

| 작업 | 리스크 | 완화 전략 |
|------|--------|----------|
| search-result-view 분할 | 중간 | Feature flag + 단계별 분리 |
| TypeScript 오류 수정 | 중간 | 점진적 수정 + 빌드 모니터링 |
| API Layer 통합 | 중간 | 2개 API 먼저 검증 |

### 롤백 계획

```bash
# 특정 파일 복구
git checkout HEAD~1 -- components/search-result-view.tsx

# 전체 롤백
git revert HEAD
```

---

## 다음 단계

1. **즉시**: P0 데드 코드 분석 시작
   - search-progress 파일들 사용 여부 확인
   - search-view 파일들 사용 여부 확인

2. **P0 완료 후**: search-result-view.tsx 분할 계획 상세화

3. **P1 완료 후**: TypeScript 오류 수정 시작

---

**문서 버전**: 2.0 (2025-11-25 업데이트)
**이전 버전**: 1.0 (2025-11-20)
