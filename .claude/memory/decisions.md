# Architecture Decisions

## 2026-01-18 - Gemini 리뷰 기각 결정

### 1. Next.js App Router 전환 ❌ 기각

**Gemini 제안**: `/search`, `/precedent/[id]` 등 App Router 라우트 생성

**기각 이유**:
- **현재 아키텍처 강점**:
  - IndexedDB + History API로 검색 결과 영속화
  - F5 새로고침해도 검색 결과 유지
  - 복잡한 모달 스택 (참조법령 → 비교 → 별표) 관리
  - 뒤로가기/앞으로가기 자연스러운 UX
- **SEO 불필요**: 법률 전문가용 도구. 구글 검색 노출 목적 아님
- **변경 비용**: history-manager, SearchResultView, 모든 뷰 전환 로직 재작성 필요
- **리스크**: 현재 잘 동작하는 UX 파괴 가능성

### 2. !important 제거 캠페인 ❌ 기각

**Gemini 제안**: CSS specificity로 해결

**기각 이유**:
- 실제 사용량 2-3% (20-30개/1,262줄)
- 주로 `.rev-mark` 개정 표시에 집중 (외부 HTML 주입 대응)
- 실제 유지보수 문제 없음

---

## 2026-01-18 - Cheerio 타입 any 사용

**상황**: Cheerio 패키지 버전 업그레이드 후 `Cheerio<Element>` 타입이 `$(el)` 반환값과 호환되지 않아 `never` 타입으로 추론됨

**결정**: 해당 변수들을 `any` 타입으로 선언

**이유**:
- Cheerio 내부 타입 시스템 문제로 정확한 타입 추론 불가
- 런타임에는 정상 작동
- `as Cheerio<Element>` 캐스팅도 작동하지 않음

**영향**:
- `app/api/drf-html/route.ts`
- `app/api/law-html/route.ts`
- `app/api/law-links/route.ts`

---

## 2026-01-18 - LawMeta 타입 확장 (판례/조례 통합)

**상황**: law-viewer.tsx에서 판례 표시 시 caseNumber, promulgationDate 등 사용하나 LawMeta에 정의되지 않음

**결정**: LawMeta 인터페이스에 판례/조례용 optional 속성 추가

**이유**:
- 별도 PrecedentMeta 타입 생성 시 기존 코드 대량 수정 필요
- optional 속성으로 추가하면 기존 코드 영향 없음
- 타입 가드 없이도 안전하게 접근 가능

**영향**: `lib/law-types.ts`

---

## 2026-01-18 - Icon 이름 리터럴 타입 유지

**상황**: 배열/객체에서 icon 속성이 string으로 추론되어 IconName 타입과 불일치

**결정**: `as const` 또는 `IconName` 타입 명시 사용

**이유**:
- ICON_REGISTRY의 키는 리터럴 타입
- string으로 추론되면 타입 에러 발생
- `as const`로 리터럴 타입 유지가 가장 간단

**영향**:
- `components/feature-cards.tsx`
- `components/chat/WelcomeScreen.tsx`
- `components/search-result-view/types.ts`
- `components/help-guide-sheet.tsx`
- `components/stats-section.tsx`

---

## 2026-01-18 - react-markdown inline prop 대응

**상황**: react-markdown v9+에서 code 컴포넌트의 `inline` prop이 제거됨

**결정**: `className` 유무로 inline/block 판단

**이유**:
- 새 버전에서 inline 코드는 className이 없음
- code block은 `language-*` 형태의 className 있음
- 타입 정의에서 inline prop 제거됨

**영향**: `components/file-search-answer-display.tsx:480`

---

## 2026-01-18 - ChatMessage 이름 충돌 해결

**상황**: `@/components/chat`에서 ChatMessage 함수 컴포넌트와 ChatMessage 타입이 같은 이름으로 export

**결정**: 필요한 곳에서 타입은 `@/components/chat/types`에서 직접 import

**이유**:
- index.ts의 re-export 순서로 함수가 우선됨
- 타입을 별도 파일에서 import하면 충돌 회피
- 기존 컴포넌트 이름 변경 불필요

**영향**: `app/test-chat/page.tsx`
