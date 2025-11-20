# Story 002: Dead Code 제거 - search-view.tsx

**우선순위**: P0 (Critical)
**예상 시간**: 0.5h
**의존성**: None

## 목표

사용되지 않는 `search-view.tsx`를 삭제하고 `search-view-improved.tsx`를 `search-view.tsx`로 리네임하여 명명 규칙을 정리합니다.

## 현재 상태

**파일들**:
- `components/search-view.tsx` (102줄) - ❌ 미사용
- `components/search-view-improved.tsx` (146줄) - ✅ 사용 중

**실제 사용**:
```typescript
// app/page.tsx:158
<SearchViewImproved
  onSearch={handleSearch}
  onFavoriteSelect={handleFavoriteSelect}
  ...
/>
```

**문제점**:
- "improved" 접미사가 영구적이지 않아야 함
- 오래된 버전이 남아있어 혼란 발생

## 완료 조건

- [ ] `search-view.tsx` (구버전) 삭제
- [ ] `search-view-improved.tsx` → `search-view.tsx`로 리네임
- [ ] `app/page.tsx`의 import 경로 수정
- [ ] 빌드 성공
- [ ] 검색 기능 정상 작동

## 구현 가이드

### Step 1: 사용 여부 확인

```bash
# search-view.tsx 사용 확인
grep -r "from.*search-view\"" app components --include="*.tsx" --include="*.ts"

# search-view-improved.tsx 사용 확인
grep -r "from.*search-view-improved\"" app components --include="*.tsx" --include="*.ts"
```

**예상 결과**:
- `search-view.tsx`: 사용 없음
- `search-view-improved.tsx`: `app/page.tsx`에서 사용

### Step 2: 구버전 삭제 및 리네임

```bash
# 구버전 삭제
rm components/search-view.tsx

# 신버전 리네임
mv components/search-view-improved.tsx components/search-view.tsx
```

### Step 3: Import 경로 수정

**파일**: `app/page.tsx`

```typescript
// Before
import { SearchViewImproved } from '@/components/search-view-improved'

// After
import { SearchView } from '@/components/search-view'
```

### Step 4: 컴포넌트명 정리 (search-view.tsx 내부)

**파일**: `components/search-view.tsx`

```typescript
// Before
export function SearchViewImproved({ ... }: SearchViewImprovedProps) {
  // ...
}

// After
export function SearchView({ ... }: SearchViewProps) {
  // ...
}

// interface도 리네임
interface SearchViewProps {
  // ...
}
```

### Step 5: app/page.tsx에서 사용 수정

```typescript
// Before
<SearchViewImproved
  onSearch={handleSearch}
  onFavoriteSelect={handleFavoriteSelect}
  ...
/>

// After
<SearchView
  onSearch={handleSearch}
  onFavoriteSelect={handleFavoriteSelect}
  ...
/>
```

## 테스트 계획

- [ ] `npm run build` 성공
- [ ] 홈 화면 렌더링 정상
- [ ] 검색창 입력 정상
- [ ] 즐겨찾기 클릭 정상
- [ ] 브라우저 콘솔 에러 없음

## 롤백 전략

Git에서 복구:
```bash
git checkout HEAD -- components/search-view.tsx
git checkout HEAD -- components/search-view-improved.tsx
git checkout HEAD -- app/page.tsx
```

## 관련 리소스

- 분석 보고서: `docs/bmad-architect-full-project-analysis.md` (섹션 1)
- CLAUDE.md: 컴포넌트 명명 규칙

## 예상 효과

- 코드 라인 감소: -102줄
- 명명 규칙 정리 (improved 접미사 제거)
- 개발자 혼란 감소
