# 별표·서식 참조 기능 구현 계획

## 📋 요약

법령 본문에서 "별표 1", "별지 제2호서식" 등의 별표·서식 참조를 자동으로 링크화하고, 클릭 시 깔끔하게 파싱된 내용을 모달로 표시. PDF/HWP 원본 다운로드 링크도 제공.

**범위**: 법령, 행정규칙, 자치법규 모두 지원

---

## 🎯 구현 목표

1. ✅ **자동 링크화**: "별표 1", "별지 제2호서식", "서식 3" 등 패턴 인식
2. ✅ **모달 표시**: 법령처럼 깔끔한 스타일로 파싱 (표 포함)
3. ✅ **원본 다운로드**: PDF/HWP 다운로드 버튼 제공
4. ✅ **전 범위 지원**: 법령/행정규칙/자치법규 통합

---

## 📊 API 분석

### 법제처 별표·서식 API

**추정 엔드포인트**:
```
https://www.law.go.kr/DRF/lawSearch.do?target=licbyl
```

**응답 필드 (추정 - 웹 검색 결과 기반)**:
- `별표일련번호`: 고유 ID
- `관련법령명`: 상위 법령명
- `별표명`: 별표 제목
- `별표번호`: 번호 (1, 2, 2의3 등)
- `별표종류`: 별표/서식/별지 구분
- `별표내용`: HTML/XML 본문 (⭐ 파싱 대상)
- `별표서식PDF파일링크`: PDF 다운로드 URL (⭐)
- `별표서식파일링크`: HWP 다운로드 URL (⭐)
- `별표PDF파일명`: PDF 파일명
- `별표HWP파일명`: HWP 파일명

**폴백 전략**:
- API 실패 시 → 법제처 웹 링크 제공
- 별표 내용 없음 → 다운로드 링크만 표시
- 다운로드 링크도 없음 → 법제처 전문 링크

---

## 🔧 구현 계획

### Phase 1: 별표 링크 패턴 추가

**파일**: `lib/unified-link-generator.ts`

**인식할 패턴**:
```typescript
/(별표|별지|서식|별도|부록)(?:\s+제?\s*(\d+)\s*호?(?:의\s*(\d+))?(?:서식)?)/g
```

**매칭 예시**:
- "별표 1" → type: "별표", num: "1"
- "별지 제2호서식" → type: "별지", num: "2"
- "별표 3의2" → type: "별표", num: "3", subNum: "2"

**data 속성**:
```html
<a href="javascript:void(0)"
   class="law-ref appendix-ref"
   data-ref="appendix"
   data-appendix-type="별표"
   data-appendix-num="1"
   data-appendix-subnum=""
   aria-label="별표 1 참조">
  별표 1
</a>
```

**변경 사항**:
1. `LinkMatch` 타입에 `'appendix'` 추가
2. `collectAppendixMatches()` 함수 작성
3. `generateLinks()`에서 aggressive 모드에서만 수집
4. 우선순위: `appendix: 55` (article보다 낮음)

---

### Phase 2: API 라우트 구현

**새 파일**: `app/api/appendix/route.ts`

**요청 파라미터**:
- `lawName`: 법령명 (필수)
- `appendixType`: 별표/별지/서식
- `appendixNum`: 번호

**응답**:
```typescript
{
  appendixId: string
  lawName: string
  title: string
  number: string
  type: string
  content: string       // HTML 본문
  pdfLink: string       // PDF 다운로드
  hwpLink: string       // HWP 다운로드
  pdfFileName: string
  hwpFileName: string
}
```

**처리 로직**:
1. API 호출 (`target=licbyl`)
2. XML 파싱 (`DOMParser`)
3. 별표 번호로 필터링
4. 응답 데이터 추출 및 반환

---

### Phase 3: 별표 핸들러 구현

**새 파일**: `lib/content-click-handlers/appendix-handler.ts`

**처리 흐름**:
1. `data-appendix-type`, `data-appendix-num` 추출
2. `openAppendixModal()` 호출
3. 에러 시 toast 표시

**업데이트 파일**: `hooks/use-content-click-handlers.ts`
```typescript
const HANDLERS: Record<string, RefHandler> = {
  // ... 기존 ...
  appendix: handleAppendixRef,  // 추가
}
```

---

### Phase 4: 모달 로직 구현

**파일**: `hooks/use-law-viewer-modals.ts`

**새 함수**: `openAppendixModal(lawName, appendixType, appendixNum, displayName)`

**처리 순서**:
1. 로딩 상태로 모달 먼저 열기
2. `/api/appendix` 호출
3. HTML 생성:
   - 별표 제목
   - 별표 본문 (CDATA 제거)
   - 다운로드 버튼 (PDF/HWP)
4. 히스토리 스택에 저장
5. 모달 상태 업데이트

**HTML 구조**:
```html
<div class="space-y-4">
  <div class="font-semibold text-lg text-primary">{별표 제목}</div>
  <div class="appendix-content">{별표 본문}</div>
  <div class="pt-3 border-t">
    <h4 class="font-semibold text-sm">원본 파일 다운로드</h4>
    <div class="flex gap-2">
      <a href="{pdfLink}">📄 PDF 다운로드</a>
      <a href="{hwpLink}">📝 HWP 다운로드</a>
    </div>
  </div>
</div>
```

---

### Phase 5: 타입 정의 확장

**파일**: `lib/content-click-handlers/types.ts`

```typescript
export interface ContentClickActions {
  // ... 기존 필드 ...

  openAppendixModal: (
    lawName: string,
    appendixType: string,
    appendixNum: string,
    displayName: string
  ) => Promise<void>  // 추가
}
```

---

### Phase 6: 모달 UI 스타일링

**파일**: `components/reference-modal.tsx`

**CSS 추가** (기존 style 태그 내):
```css
/* 별표 콘텐츠 스타일링 */
.appendix-content table {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
}

.appendix-content table th,
.appendix-content table td {
  border: 1px solid #e5e7eb;
  padding: 0.5rem;
  text-align: left;
}

.appendix-content table th {
  background-color: #f9fafb;
  font-weight: 600;
}

/* 다크모드 */
.dark .appendix-content table th,
.dark .appendix-content table td {
  border-color: #374151;
}

.dark .appendix-content table th {
  background-color: #1f2937;
}
```

---

## 📁 파일 변경 목록

### 새 파일 (2개)
1. `app/api/appendix/route.ts` - API 라우트
2. `lib/content-click-handlers/appendix-handler.ts` - 클릭 핸들러

### 수정 파일 (4개)
1. `lib/unified-link-generator.ts` - 별표 패턴 추가
2. `hooks/use-law-viewer-modals.ts` - openAppendixModal 함수 추가
3. `lib/content-click-handlers/types.ts` - 타입 확장
4. `hooks/use-content-click-handlers.ts` - 핸들러 등록
5. `components/reference-modal.tsx` - CSS 스타일 추가

---

## 🔍 엣지 케이스 처리

### 1. API 실패
```typescript
catch (error) {
  const lawGoKrUrl = `https://www.law.go.kr/법령/${encodeURIComponent(lawName)}`
  // 법제처 링크로 폴백
}
```

### 2. 별표 내용 없음
```typescript
if (!data.content) {
  htmlContent += `<p>별표 내용이 없습니다.</p>`
  htmlContent += `<p>PDF 또는 HWP 파일을 다운로드하여 확인하세요.</p>`
}
```

### 3. 다운로드 링크 없음
```typescript
if (!data.pdfLink && !data.hwpLink) {
  // 다운로드 섹션 표시하지 않음
}
```

### 4. 자치법규 별표
```typescript
const isOrdinance = /조례|규칙/.test(lawName) ||
  /(특별시|광역시|도|시|군|구)\s+[가-힣]/.test(lawName)

if (isOrdinance) {
  // target을 "ordinbyl"로 변경 (추정)
  params.set('target', 'ordinbyl')
}
```

---

## 🧪 테스트 시나리오

### 테스트할 법령
1. **건설산업기본법 시행령**: 별표 4 (건설공사의 종류별 하자담보책임기간)
2. **건축물관리법 시행규칙**: 별지 제1호서식
3. **관세법**: 별표 (관세율표)

### 테스트 패턴
| 패턴 | 예시 텍스트 | 예상 결과 |
|------|------------|----------|
| 기본 | "별표 1" | ✅ 링크 생성 |
| 제호 | "별표 제2호" | ✅ 링크 생성 |
| 분번호 | "별표 3의2" | ✅ 링크 생성 |
| 서식 | "별지 제1호서식" | ✅ 링크 생성 |
| 공백 변형 | "별표  3" | ✅ 링크 생성 |
| 괄호 내 | "(별표 5 참조)" | ✅ 링크 생성 |

---

## ⚠️ 주의사항

### 1. API 확인 필요
- `target=licbyl` 엔드포인트가 실제 작동하는지 확인 필요
- 자치법규(`target=ordinbyl`), 행정규칙 별도 API 존재 가능
- 실제 응답 구조가 추정과 다를 수 있음

### 2. 파일 크기 관리
- `use-law-viewer-modals.ts`: 현재 804줄 → openAppendixModal 추가 후 약 900줄
- ✅ 1,200줄 미만으로 안전

### 3. 기존 시스템 호환성
- ✅ 기존 link generator 패턴 재사용
- ✅ 기존 modal 시스템 재사용
- ✅ 기존 handler 구조 준수

---

## 🚀 구현 우선순위

### Phase 1 (필수)
1. unified-link-generator.ts 패턴 추가
2. API 라우트 구현 및 테스트
3. appendix-handler.ts 구현
4. use-law-viewer-modals.ts 확장
5. 타입 정의 업데이트

### Phase 2 (UI 개선)
1. 별표 콘텐츠 CSS 스타일링
2. 다운로드 버튼 UI
3. 로딩 상태 표시

### Phase 3 (고급 기능)
1. 자치법규 별표 지원 확인
2. 행정규칙 별표 지원 확인
3. 에러 복구 메커니즘 강화

---

## 💡 추가 고려사항

### API 실패 시 대안
- 실제 API 테스트 결과에 따라 조정
- 별표 데이터가 eflaw API 응답에 포함될 가능성도 있음
- 최악의 경우 법제처 웹 링크만 제공

### 확장 가능성
- **부칙**: 부칙 링크 처리 (미래)
- **판례**: 판례 링크 처리 (미래)
- **예규**: 예규 링크 처리 (미래)

---

## 📚 참고 자료

- [법제처 별표,서식(법령) API - 공공데이터포털](https://www.data.go.kr/data/3069189/openapi.do)
- [법제처 별표,서식(자치법규) API - 공공데이터포털](https://www.data.go.kr/data/15031993/openapi.do)
- [법제처 국가법령정보 공유서비스](https://www.data.go.kr/data/15000115/openapi.do)
