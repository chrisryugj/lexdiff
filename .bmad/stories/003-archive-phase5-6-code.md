# Story 003: Phase 5/6 비활성 코드 아카이브

**우선순위**: P1 (High)
**예상 시간**: 1h
**의존성**: None

## 목표

현재 비활성화된 Phase 5/6 검색 관련 코드를 `lib/archived/` 폴더로 이동하여 활성 코드와 분리합니다.

## 현재 상태

**비활성화된 파일들** (lib 디렉토리):
- `search-learning.ts` (Phase 5 - Turso DB 학습)
- `vector-search.ts` (Phase 6 - Voyage AI)
- `db.ts` (Turso DB 연결)
- `embedding.ts` (Voyage AI 임베딩)
- `search-feedback-db.ts` (학습 피드백 DB)
- `query-classifier.ts` (사용 여부 확인 필요)
- `query-detector.ts` (사용 여부 확인 필요)
- `intent-analyzer.ts` (사용 여부 확인 필요)

**비활성화 이유**:
- 2025-11-11 학습 데이터 오염으로 Phase 5/6 비활성화
- `app/page.tsx:627-793` 주석 처리됨

## 완료 조건

- [ ] `lib/archived/` 폴더 생성
- [ ] `lib/archived/README.md` 작성 (비활성화 이유 명시)
- [ ] 8개 파일 이동
- [ ] import 에러 확인 (사용 중인 파일 있는지)
- [ ] 빌드 성공

## 구현 가이드

### Step 1: 사용 여부 확인

```bash
# 각 파일의 사용 여부 확인
for file in search-learning vector-search db embedding search-feedback-db query-classifier query-detector intent-analyzer; do
  echo "=== $file.ts ==="
  grep -r "from.*$file" app components lib --include="*.ts" --include="*.tsx" | grep -v "lib/$file.ts"
done
```

**예상 결과**: Phase 5/6 관련 파일은 사용 없음

### Step 2: archived 폴더 생성 및 README 작성

```bash
mkdir -p lib/archived
```

**파일**: `lib/archived/README.md`

```markdown
# Archived Code (비활성화된 기능)

이 디렉토리는 현재 비활성화된 기능의 코드를 보관합니다.

## Phase 5/6 검색 시스템 (2025-11-11 비활성화)

**비활성화 이유**:
- 학습 데이터 오염 발견 (80개 쿼리, 80개 결과)
- "형법" 검색 시 잘못된 법령 연결
- "세법" 검색 시 사용자 선택 없이 자동 연결

**관련 파일**:
- `search-learning.ts`: Turso DB 학습 시스템
- `vector-search.ts`: Voyage AI 벡터 검색
- `db.ts`: Turso DB 연결
- `embedding.ts`: Voyage AI 임베딩
- `search-feedback-db.ts`: 학습 피드백 저장

**재활성화 조건**:
- 학습 데이터 정확도 검증 시스템 구축
- 사용자 선택 UI 개선
- 오염 데이터 정리 (reset-all-learning.mjs)

**참고**:
- CLAUDE.md: 변경 이력 2025-11-11
- docs/bmad-architect-full-project-analysis.md: Section 4
```

### Step 3: 파일 이동

```bash
# Phase 5/6 관련 파일 이동
mv lib/search-learning.ts lib/archived/
mv lib/vector-search.ts lib/archived/
mv lib/db.ts lib/archived/
mv lib/embedding.ts lib/archived/
mv lib/search-feedback-db.ts lib/archived/

# 사용 여부에 따라 조건부 이동 (Step 1 결과 확인 후)
# mv lib/query-classifier.ts lib/archived/
# mv lib/query-detector.ts lib/archived/
# mv lib/intent-analyzer.ts lib/archived/
```

### Step 4: Import 경로 확인

**만약 아직 사용 중인 import가 있다면**:

```typescript
// 경고 주석 추가
/**
 * @deprecated
 * This module is archived and will be removed in future versions.
 * See lib/archived/README.md for details.
 */
```

### Step 5: 빌드 확인

```bash
npm run build
```

**주의사항**:
- TypeScript 오류 발생 시 아직 사용 중인 파일이 있다는 의미
- 해당 파일은 이동하지 않고 조사 필요

## 테스트 계획

- [ ] `npm run build` 성공
- [ ] 기본 검색 기능 정상 작동 (law-search API)
- [ ] Phase 7 (IndexedDB 캐시) 정상 작동
- [ ] 브라우저 콘솔 에러 없음

## 롤백 전략

```bash
# 아카이브된 파일 복구
mv lib/archived/search-learning.ts lib/
mv lib/archived/vector-search.ts lib/
mv lib/archived/db.ts lib/
mv lib/archived/embedding.ts lib/
mv lib/archived/search-feedback-db.ts lib/

# archived 폴더 삭제
rm -rf lib/archived
```

## 관련 리소스

- CLAUDE.md: 변경 이력 2025-11-11
- `docs/bmad-architect-full-project-analysis.md`: Section 4
- `reset-all-learning.mjs`: 학습 데이터 초기화 스크립트

## 예상 효과

- 활성 코드와 비활성 코드 명확히 분리
- 개발자 혼란 감소
- 향후 재활성화 시 명확한 컨텍스트 제공
- lib 디렉토리 파일 수 감소 (48개 → ~43개)
