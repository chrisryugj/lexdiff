# 변경 이력 (Change Log)

> 상세한 변경 이력을 날짜별로 기록합니다. 각 변경사항에는 문제 → 해결 → 영향을 명시합니다.

---

## 2025-11-19: 법령 링크 개선 및 버그 수정

### 1. 항 없이 호만 있는 조문 본문-호 간 빈 줄 제거 (90131dc)

**문제**: 관세법 제2조처럼 항내용 없이 본문+호 구조일 때 불필요한 빈 줄 삽입
- JSON에서 `조문내용`에 본문과 호가 함께 있고, `\n\n`으로 구분됨
- HTML 변환 시 `<br><br>`로 변환되어 빈 줄 생성

**해결**:
```typescript
// lib/law-xml-parser.tsx:365
// 연속된 개행을 호 번호 앞에서 제거
content = content.replace(/\n{2,}\s*(\d+\.)/g, '\n$1')
```

**영향**: 본문-호 사이 줄바꿈 1개만 유지 (빈 줄 제거)

### 2. 개정 마커 스타일링 복구 (2dffc9e)

**문제**: HTML escape 로직이 `<개정>`, `<신설>` 같은 태그를 HTML 태그로 보존
- `<개정 2020.12.22>`가 escape되지 않음
- `applyRevisionStyling()`에서 `&lt;개정&gt;` 형태를 찾아 스타일 적용하는데, 원본 `<개정>`으로 남아있어 스타일 미적용

**해결**: `<a>` 태그만 보존하고 나머지는 모두 escape
```typescript
// lib/law-xml-parser.tsx:343-348
content.replace(/(<a\s[^>]*>|<\/a>)|(<[^>]*>)|([^<]+)/g, (match, linkTag, otherTag, text) => {
  if (linkTag) return linkTag       // <a> 태그만 보존
  if (otherTag) return escapeHtml(otherTag)  // <개정> → &lt;개정&gt;
  if (text) return escapeHtml(text)
  return match
})
```

**영향**: `.rev-mark` 클래스가 정상 적용되어 개정 마커가 파란색으로 표시됨

### 3. 법령 링크 hover 효과 강화 (a8bf720)

**변경사항** (`app/globals.css:225-253`):
- 색상 밝기 향상: `oklch(0.75 0.22 250)` → `oklch(0.8 0.25 250)`
- 밑줄 굵기 증가: `1.5px` → `2px`
- 배경 투명도 증가: `0.08` → `0.15`
- 그림자 강화: `0 1px 4px / 0.3` → `0 2px 8px / 0.5`
- 애니메이션 추가: `transform: translateY(-1px)` (hover 시 살짝 올라감)

**의도**: 법령 링크가 호버 시 더욱 명확하게 강조되도록 개선

### 4. 모달 내 법령 링크 히스토리 스택 (fdc481f, 859e5f0, c6deec1)

**기능**: 모달에서 다른 법령 링크 클릭 시 뒤로가기 가능

**구현 세부사항**:
- 모달 히스토리 스택 관리 (`useState<Array<{lawName, joLabel}>>`)
- 뒤로가기 버튼 표시 (히스토리 있을 때만)
- 이벤트 전파 차단: `e.preventDefault()`, `e.stopPropagation()`으로 중복 네비게이션 방지
- `href="javascript:void(0)"` 사용으로 라우팅 이벤트 차단

**영향**: 모달 UX 개선 - 여러 법령을 연쇄적으로 탐색 후 원래 위치로 복귀 가능

📍 `components/reference-modal.tsx`, `components/comparison-modal.tsx`

---

## 2025-11-18: 법령명 링크 및 조례 판단 로직 개선

### 1. 복합 법령명 링크 생성 정규식 수정 (fd78b36)

**문제**: "국토의 계획 및 이용에 관한 법률 시행령"이 "법률"과 "시행령" 두 개의 링크로 분리됨

**해결**:
- Pattern 3: 부정 전방탐색 추가 `(?!\s+[가-힣]+령)`
  - "법률 시행령" 복합어를 하나의 링크로 유지
- Pattern 5/6: 부정 후방탐색 추가 `(?<![가-힣]\s)`
  - "법률 시행령"에서 "시행령"만 별도 링크 생성 방지

**수정 파일**:
- `lib/law-xml-parser.tsx`: 법령 뷰어용 linkifyRefsB
- `lib/ai-answer-processor.ts`: AI 모달용 linkifyRefsB

### 2. 조례 여부 판단 로직 개선 (772812b)

**문제**: 지방자치단체명 패턴만으로 오판 발생

**해결**:
```typescript
// BEFORE: 지방자치단체명 포함 시 무조건 조례로 판단
const isOrdinanceLaw = /조례|규칙|특별시|광역시|도|시|군|구/.test(lawName)

// AFTER: 키워드 우선 + 지방자치단체명 공백 패턴 정밀화
const isOrdinanceLaw = lawName && (
  /조례|규칙/.test(lawName) ||  // 키워드 우선
  /(특별시|광역시|[가-힣]+도|[가-힣]+(시|군|구))\s+[가-힣]/.test(lawName)  // 공백 포함
)
```
📍 `components/reference-modal.tsx:30-33`

### 3. 항내용 없고 호만 있는 조문 표시 버그 수정 (4e1d0bf)

**문제**: 도로법 시행령 제55조처럼 항 객체는 있지만 항내용이 비어있고 호만 있는 경우, 본문이 제거됨

**해결**:
- 항 정규화: 배열/단일 객체 모두 처리
- 항내용 존재 여부 선확인 (`hasHangContent`)
- 항내용 없고 호만 있는 경우: 본문 + 호 합치기

**수정 전 → 후**:
- ❌ 본문 완전 제거 → ✅ 본문 (제목 제거됨) + 전체 호 내용

📍 `components/law-viewer.tsx` (+62 lines)

---

## 2025-11-15: AI 검색 시스템 3대 핵심 수정

### 발견된 문제들

1. **사이드바 버튼 완전 무반응**
   - 원인: async function을 onClick에 직접 사용
   - 영향: 관련 법령 클릭 시 모달 미표시, 로그 없음

2. **모달 열리지만 빈 화면**
   - 원인: API 응답 형식 불일치 (XML vs JSON)
   - /api/law-search: XML 응답 → .json() 시도 → SyntaxError
   - /api/eflaw: 원본 JSON → .success 필드 확인 → undefined

3. **AI 답변 중간 잘림**
   - 원인: SSE 스트림 종료 후 남은 buffer 미처리
   - 영향: 특정 조문(관세법 38조 등) 답변 400자 내외로 짤림

4. **진행 상태 표시 즉시 사라짐**
   - 원인: `isAnalyzing && !analysis` 조건이 첫 청크에서 false
   - 영향: 로딩 피드백 부족으로 UX 저하

5. **모바일 모달 우측 잘림**
   - 원인: 모달 너비 고정, overflow 처리 부족
   - 영향: 모바일에서 법령 내용 일부 보이지 않음

### 적용된 해결책

**영향을 받는 파일**:
- `components/file-search-rag-view.tsx`: API 파싱, SSE 버퍼, 오버레이
- `components/law-viewer.tsx`: 사이드바 클릭 핸들러
- `components/reference-modal.tsx`: 모바일 반응형
- `lib/file-search-client.ts`: 토큰 사용량 로깅, finishReason 분석

---

## 2025-11-11: 긴급 수정 - Phase 5/6 비활성화 및 Phase 7 버그 수정

### 발견된 문제들

서버 재시작 후 검색 시스템 전체 붕괴 발견:

1. **모든 법령의 최초 검색 시 "검색결과 없음" + 1조 표시**
   - 원인: Phase 7 캐시에서 `selectedJo`를 조문 존재 여부 확인 없이 무조건 설정
   - 파일: `app/page.tsx:576`

2. **잘못된 법령 연결**
   - "형법" 검색 시 "군에서의 형의 집행 및 군수용자의 처우에 관한 법률" 연결
   - 원인: Phase 5 학습 데이터 오염 (80개 쿼리, 80개 결과)

3. **법령 선택 UI 미표시**
   - "세법" 검색 시 사용자 선택 없이 "개별소비세법"으로 자동 연결
   - 원인: 기본 검색 매칭 로직의 낮은 유사도 임계값

### 적용된 해결책

1. **Phase 5/6 완전 비활성화** (`app/page.tsx:627-793`)
2. **Phase 7 조문 검증 버그 수정** (`app/page.tsx:572-603`)
3. **조문 없음 UX 개선**: 가장 유사한 조문 자동 선택 + 배너로 대안 제시
4. **법령 매칭 로직 개선**: 레벤슈타인 거리 기반 유사도 계산 (85%/60% 적응형)
5. **학습 데이터 완전 초기화**: `reset-all-learning.mjs` 스크립트

### 새로 추가된 파일

1. **`reset-all-learning.mjs`**: Turso DB 학습 데이터 완전 삭제
2. **`lib/text-similarity.ts`**: 레벤슈타인 거리 알고리즘

---

## 2025-11-05: 행정규칙 시스템 및 3단 비교 완전 구현

### 주요 구현 사항

1. **시행규칙 파싱 경로 수정 (CRITICAL)**: `rawArticle.시행규칙조문` 직접 접근
2. **행정규칙 중복 제거**: Map 기반 중복 제거 (serialNumber/id)
3. **위임조문 뷰 스크롤 구현**: `calc(100vh - 250px)` 고정 높이
4. **행정규칙 성능 최적화**: IndexedDB + HTTP 캐싱 + 병렬 API 호출
5. **개정 마커 스타일 확장**: `[본조신설]`, `[본조삭제]`, `[종전 ~ 이동]`

---

## 2025-11-04: 3단 비교 UI 개선 및 버그 수정

### 수정된 문제들

1. **개정 이력 마커 줄바꿈 오류 수정**: 정규식 개선으로 날짜 패턴 제외
2. **인용조문 데이터 로딩 비활성화**: 위임조문(knd=2)만 로드
3. **3단 비교 버튼 활성화 로직 개선**: 실제 시행규칙 콘텐츠 유무 확인
