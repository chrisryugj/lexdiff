# Story 001: Dead Code 제거 - search-progress 파일 3개

**우선순위**: P0 (Critical)
**예상 시간**: 1h
**의존성**: None

## 목표

사용되지 않는 search-progress 관련 파일 3개를 삭제하여 코드베이스를 정리하고 개발자 혼란을 방지합니다.

## 현재 상태

**파일들**:
- `components/search-progress.tsx` (93줄)
- `components/search-progress-dialog.tsx` (481줄)
- `components/search-progress-dialog-improved.tsx` (368줄)

**문제점**:
- 실제로는 `search-progress-modern.tsx`만 사용 중
- Dead code로 인한 혼란 발생
- 번들 크기 불필요하게 증가 (~30KB)

## 완료 조건

- [ ] `search-progress.tsx` 삭제
- [ ] `search-progress-dialog.tsx` 삭제
- [ ] `search-progress-dialog-improved.tsx` 삭제
- [ ] import 에러 없음 확인 (빌드 성공)
- [ ] Git에서 추적 제거

## 구현 가이드

### Step 1: 사용 여부 최종 확인

```bash
# search-progress.tsx 사용 확인
grep -r "search-progress.tsx" components app --include="*.tsx" --include="*.ts"

# search-progress-dialog.tsx 사용 확인
grep -r "search-progress-dialog.tsx" components app --include="*.tsx" --include="*.ts"

# search-progress-dialog-improved.tsx 사용 확인
grep -r "search-progress-dialog-improved.tsx" components app --include="*.tsx" --include="*.ts"
```

**예상 결과**: 검색 결과 없음 (사용되지 않음)

### Step 2: 파일 삭제

```bash
rm components/search-progress.tsx
rm components/search-progress-dialog.tsx
rm components/search-progress-dialog-improved.tsx
```

### Step 3: 빌드 확인

```bash
npm run build
```

**주의사항**:
- TypeScript 오류 발생 시 import 문 확인
- 실제로 `search-progress-modern.tsx`가 사용되는지 재확인

## 테스트 계획

- [ ] `npm run build` 성공
- [ ] 검색 기능 정상 작동 (search-progress-modern 사용)
- [ ] 브라우저 콘솔 에러 없음

## 롤백 전략

Git에서 복구:
```bash
git checkout HEAD -- components/search-progress.tsx
git checkout HEAD -- components/search-progress-dialog.tsx
git checkout HEAD -- components/search-progress-dialog-improved.tsx
```

## 관련 리소스

- 분석 보고서: `docs/bmad-architect-full-project-analysis.md`
- 실제 사용 파일: `components/search-progress-modern.tsx`

## 예상 효과

- 코드 라인 감소: -942줄
- 번들 크기 감소: ~30KB
- 개발자 혼란 감소
