# LexDiff 미사용 모듈/테마 정리 리스트

---

## 추가 작업: 전역 지침 업데이트

### 변경 내용
전역 CLAUDE.md에 계획 파일 저장 위치 지침 추가:

**추가할 섹션** (## 🔄 작업 흐름 뒤에):
```markdown
### 계획 파일 저장 위치
- 계획 모드 사용 시 **프로젝트 내** `.claude/plans/` 폴더에 저장
- 전역(`~/.claude/plans/`) 대신 프로젝트 폴더 사용
- 계획 파일도 git에 포함하여 작업 이력 추적
```

### 수정 대상 파일
1. `~/.claude/CLAUDE.md` (전역)
2. `.claude/global-claude-md.sync.md` (프로젝트 동기화 파일)

---

## 요약

| 카테고리 | 파일 수 | 줄 수 | 상태 |
|----------|---------|-------|------|
| 백업 파일 | 2 | 4,754 | 즉시 삭제 가능 |
| 미사용 컴포넌트 | 3 | 1,123 | 즉시 삭제 가능 |
| 테스트 라우트 | 6 | 2,608 | 격리됨 (선택 삭제) |
| 미완성 홈페이지 테마 | 18 | 1,925 | 최근 추가 (확인 필요) |
| **총계** | **29** | **~10,400** | |

---

## 1. 즉시 삭제 가능 (5,877줄)

### 백업 파일
| 파일 | 줄 수 | 설명 |
|------|-------|------|
| `app/page.backup.tsx` | 188 | 구 홈페이지 백업 |
| `components/law-viewer.tsx.backup` | 4,566 | Phase 0 다이어트 전 백업 |

### 미사용 컴포넌트
| 파일 | 줄 수 | 설명 |
|------|-------|------|
| `components/search-progress-dialog-improved.tsx` | 368 | 실험 버전, 미사용 |
| `components/search-progress-modern.tsx` | 499 | 실험 버전, 미사용 |
| `lib/ai-answer-processor-v2.ts` | 256 | v1으로 대체됨 |

---

## 2. 테스트/개발 라우트 (3,136줄)

### 개발 테스트 페이지
| 경로 | 파일 | 줄 수 | 목적 |
|------|------|-------|------|
| `/dev-test` | `app/dev-test/page.tsx` | 617 | 법령 파싱 API 테스트 |
| `/dev-test/ai` | `app/dev-test/ai/page.tsx` | 203 | AI 검색 테스트 |
| `/progress-test` | `app/progress-test/page.tsx` | 339 | 진행 상태 UI 테스트 |
| `/test-admin-rules` | `app/test-admin-rules/page.tsx` | 416 | 행정규칙 2단 뷰 테스트 |
| `/test-three-tier` | `app/test-three-tier/page.tsx` | 247 | 3단 비교 API 테스트 |

### 모달 테스트 페이지
| 파일 | 줄 수 | 상용 대체 |
|------|-------|-----------|
| `app/modal-test/page.tsx` | 91 | 테스트 페이지 |
| `app/modal-test/comparison-modal-redesigned.tsx` | 533 | → `components/comparison-modal.tsx` |
| `app/modal-test/reference-modal-redesigned.tsx` | 335 | → `components/reference-modal.tsx` |

---

## 3. 미완성 홈페이지 테마 (1,925줄)

**최근 추가됨 (2025-11-25)** - 삭제 전 확인 필요

### 라우트
| 라우트 | 테마 | 페이지 줄 수 |
|--------|------|-------------|
| `/new-home` | Professional | 175 |
| `/new-home-v2` | Futuristic | 175 |
| `/new-home-v3` | Organic | 178 |

### 테마 컴포넌트 (15개)

**Professional 테마** (5개):
- `professional-home-view.tsx`
- `professional-header.tsx`
- `professional-hero.tsx`
- `professional-features.tsx`
- `professional-footer.tsx`

**Futuristic 테마** (5개):
- `futuristic-home-view.tsx`
- `futuristic-header.tsx`
- `futuristic-hero.tsx`
- `futuristic-features.tsx`
- `futuristic-footer.tsx`

**Organic 테마** (5개):
- `organic-home-view.tsx`
- `organic-header.tsx`
- `organic-hero.tsx`
- `organic-features.tsx`
- `organic-footer.tsx`

---

## 4. 관찰 필요 (Phase 6 실험)

| 파일 | 줄 수 | 상태 |
|------|-------|------|
| `lib/query-classifier.ts` | 157 | dev-test에서만 사용 |
| `lib/intent-analyzer.ts` | 219 | 낮은 사용률 |
| `lib/embedding.ts` | 424 | Phase 6 실험 |
| `lib/vector-search.ts` | 386 | Phase 6 실험 |

---

## 권장 정리 순서

### Phase 1: 즉시 삭제 (안전)
```
rm app/page.backup.tsx
rm components/law-viewer.tsx.backup
rm components/search-progress-dialog-improved.tsx
rm components/search-progress-modern.tsx
rm lib/ai-answer-processor-v2.ts
```

### Phase 2: 테스트 라우트 삭제 (선택)
```
rm -r app/dev-test/
rm -r app/progress-test/
rm -r app/test-admin-rules/
rm -r app/test-three-tier/
rm -r app/modal-test/
```

### Phase 3: 홈페이지 테마 삭제 (확인 후)
```
rm -r app/new-home/
rm -r app/new-home-v2/
rm -r app/new-home-v3/
rm components/professional-*.tsx
rm components/futuristic-*.tsx
rm components/organic-*.tsx
```

---

**총 정리 가능 코드**: ~10,400줄
