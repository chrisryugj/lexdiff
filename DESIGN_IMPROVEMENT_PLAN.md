# LexDiff 디자인 개선 전략서

**Date**: 2026-03-16
**기반 문서**: DESIGN_ANALYSIS_REPORT.md

---

## 이슈 쉬운 설명 + 구체적 개선 계획

---

## 1. 다크모드에서 네이비색과 골드색이 같아지는 버그

### 무슨 문제야?

LexDiff의 브랜드 색상은 두 가지다: **진한 남색(Navy)**과 **금색(Gold)**. 라이트 모드에서는 이 두 색이 확실히 다르게 보인다. 그런데 다크 모드로 바꾸면 **둘 다 똑같은 금색**이 된다.

쉽게 비유하면: 축구팀의 홈 유니폼(파랑)과 어웨이 유니폼(노랑)이 있는데, 야간 경기 때 둘 다 똑같은 노란색을 입고 나오는 것과 같다. 구분이 안 된다.

```css
/* 현재 코드 — 다크모드에서 두 값이 동일! */
.dark {
  --brand-navy: 0.72 0.12 65;   /* 금색 */
  --brand-gold: 0.72 0.12 65;   /* 금색 ← 같음! */
}
```

### 개선 계획

**파일**: `app/styles/theme-variables.css`

```css
/* 수정안 — 다크모드에서도 두 색을 구분 */
.dark {
  --brand-navy: 0.85 0.03 240;      /* 밝은 실버블루 (다크에서의 Navy 역할) */
  --brand-gold: 0.72 0.12 65;       /* 금색 (유지) */
  --brand-gold-light: 0.82 0.10 65; /* 연한 금색 (유지) */
}
```

**원리**: 다크 모드에서 Navy를 "밝은 은빛 블루"로 바꾸면, Gold와 확실히 구분되면서도 "차가운 전문성" 느낌을 유지한다. 라이트의 짙은 남색 → 다크의 은빛 블루는 자연스러운 반전이다.

**작업량**: CSS 변수 3줄 수정 — 5분

---

## 2. 색상 변수를 만들어놓고 안 쓰는 문제

### 무슨 문제야?

집에 식기세척기를 사놓고 매번 손으로 설거지하는 것과 같다.

`theme-variables.css`에 `--border`, `--muted`, `--muted-foreground` 같은 색상 변수를 **정성스럽게 정의**해두었다. 이 변수들은 라이트/다크 모드에 따라 자동으로 바뀌도록 설계되어 있다. 그런데 실제 컴포넌트 코드에서는 이걸 안 쓰고 `text-gray-600`, `bg-gray-50`, `dark:bg-[#1a222c]` 같은 **직접 색상값**을 넣고 있다.

이러면 뭐가 문제냐면:
- 다크 모드에서 색이 이상하게 나올 수 있다
- 나중에 테마 색을 바꾸고 싶을 때, 변수 하나만 고치면 될 걸 **파일 수십 개를 다 뒤져야** 한다
- 같은 "회색 배경"인데 파일마다 미묘하게 다른 색(`#121620`, `#1f2937`, `#1a222c`)을 쓰고 있다

### 개선 계획

**대상 파일**: 주요 컴포넌트 전체 (search-view.tsx, feature-cards.tsx, search-bar-home.tsx 등)

**치환 규칙표**:

| 현재 (하드코딩) | 변경 후 (CSS 변수) | 이유 |
|---|---|---|
| `text-gray-600 dark:text-gray-400` | `text-muted-foreground` | 보조 텍스트 |
| `text-gray-500 dark:text-gray-400` | `text-muted-foreground` | 보조 텍스트 |
| `text-gray-300 dark:text-gray-600` | `text-border` | 구분선/비활성 |
| `text-gray-800 dark:text-gray-200` | `text-foreground` | 주요 텍스트 |
| `bg-gray-50 dark:bg-background` | `bg-muted` | 약한 배경 |
| `bg-white dark:bg-[#121620]` | `bg-background` | 기본 배경 |
| `bg-white dark:bg-[#1a222c]` | `bg-card` | 카드 배경 |
| `dark:bg-[#1f2937]` | `bg-card` | 카드 배경 |
| `border-gray-200 dark:border-gray-800` | `border-border` | 테두리 |
| `border-gray-300 dark:border-gray-700` | `border-input` | 입력 필드 테두리 |
| `hover:bg-gray-100 dark:hover:bg-gray-800` | `hover:bg-muted` | 호버 배경 |
| `hover:bg-gray-200 dark:hover:bg-gray-800` | `hover:bg-accent` | 호버 강조 배경 |

**작업 순서**:
1. `search-view.tsx` — 홈 화면 (가장 많이 보이는 화면)
2. `feature-cards.tsx` — 기능 카드 섹션
3. `search-bar-home.tsx` — 검색바
4. `header.tsx` — 헤더
5. 나머지 컴포넌트 순차 적용

**작업량**: 파일당 10~20분, 총 2~3시간

---

## 3. 글꼴 굵기가 가짜로 만들어지는 문제

### 무슨 문제야?

우리 프로젝트의 메인 글꼴 Pretendard는 현재 **Regular(400) 한 가지 굵기만** 다운로드하고 있다. 그런데 코드에서는 `font-bold`(굵게), `font-semibold`(약간 굵게), `font-black`(아주 굵게)을 막 쓰고 있다.

이러면 브라우저가 "나한테 Bold 파일이 없는데... 그냥 Regular 글자를 억지로 두껍게 만들자" 하고 **가짜 볼드(Faux Bold)**를 만든다. 이건 마치 연필로 쓴 글씨를 복사기로 진하게 복사하는 것과 같다 — 글자 획이 뭉개지고 지저분해진다. 특히 한글은 획이 복잡해서 이 문제가 심하다.

### 개선 계획

**파일**: `app/styles/fonts.css`

```css
/* 현재 — Regular 하나만 로드 */
@font-face {
  font-family: 'Pretendard';
  src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/pretendard@1.0/Pretendard-Regular.woff2');
  font-weight: 400;
  font-display: swap;
}

/* 추가해야 할 것 — SemiBold, Bold */
@font-face {
  font-family: 'Pretendard';
  src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/pretendard@1.0/Pretendard-SemiBold.woff2') format('woff2');
  font-weight: 600;
  font-display: swap;
}

@font-face {
  font-family: 'Pretendard';
  src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/pretendard@1.0/Pretendard-Bold.woff2') format('woff2');
  font-weight: 700;
  font-display: swap;
}
```

**주의**: `font-black`(900)은 코드에서 실제 쓰이는 곳이 feature-cards의 섹션 제목 딱 1곳이다. 900 weight를 추가 로드하면 용량이 늘어나므로, 차라리 해당 부분을 `font-bold`(700)로 바꾸는 게 낫다.

**작업량**: CSS 2개 추가 + 클래스 1개 수정 — 10분

---

## 4. 모서리 둥글기가 들쭉날쭉한 문제

### 무슨 문제야?

LexDiff의 카드, 검색바, 로고 아이콘은 **각진 모서리(네모)**인데, 도구 버튼은 **완전히 둥근 알약 모양**이고, 일반 버튼은 **약간 둥근 모서리**다. 한 화면에 세 가지 모서리 스타일이 섞여 있다.

이건 양복 위에 운동화를 신고, 넥타이 대신 스카프를 두르는 것과 같다 — 각각은 괜찮지만 조합이 어색하다. 특히 LexDiff처럼 "법률의 엄격함"을 전달하려는 디자인에서는 **일관된 모서리 전략**이 중요하다.

### 개선 계획

**전략: "Sharp + Micro-Radius" 규칙 선언**

| 요소 종류 | 모서리 규칙 | 예시 |
|---|---|---|
| 대형 컨테이너 | `rounded-none` (0px) | 카드, 검색바, 모달 |
| 버튼 / 인터랙티브 | `rounded-sm` (2px) | 검색 버튼, 액션 버튼 |
| 뱃지 / 태그 | `rounded-full` (999px) | "New" 뱃지, 상태 태그 |
| 아이콘 컨테이너 | `rounded-none` (0px) | 로고 아이콘, 기능 아이콘 |
| 입력 필드 | `rounded-none` (0px) | 텍스트 인풋, 셀렉트 |
| 툴팁 / 팝오버 | `rounded-sm` (2px) | 드롭다운, 팝오버 |

**구체적 변경점**:

1. **도구 버튼**: `rounded-full` → `rounded-sm` + 약간의 패딩 조정
   ```tsx
   // Before
   "px-3 sm:px-4 py-2 rounded-full border border-brand-navy/15"
   // After
   "px-4 sm:px-5 py-2.5 rounded-sm border border-brand-navy/15"
   ```

2. **기본 버튼 컴포넌트**: `rounded-md` → `rounded-sm`
   ```tsx
   // button.tsx의 buttonVariants base class
   // Before: "rounded-md"
   // After:  "rounded-sm"
   ```

3. **Header 로고 아이콘**: `rounded-lg` → `rounded-none`
   ```tsx
   // header.tsx
   // Before: "rounded-lg bg-primary"
   // After:  "bg-primary" (rounded 제거)
   ```

**작업량**: 컴포넌트별 클래스 수정 — 1~2시간

---

## 5. 핸드폰에서 화면 확대가 안 되는 접근성 문제

### 무슨 문제야?

현재 코드에 `userScalable: false`가 설정되어 있다. 이건 "사용자가 핸드폰에서 두 손가락으로 화면을 확대할 수 없게 막는" 설정이다.

왜 막았냐면 — iPhone Safari에서 입력 필드를 터치하면 자동으로 화면이 확대되는 귀찮은 현상이 있어서, 이걸 방지하려고 넣은 거다.

그런데 이건 **시력이 안 좋은 사용자가 글씨를 크게 볼 수 없게 막는 것**이다. 웹 접근성 국제 표준(WCAG 2.1)에서 명확히 "하지 마라"고 규정하고 있는 항목이다. 공공기관 대상 법률 서비스라면 특히 중요하다.

게다가, 우리 프로젝트에는 이미 입력 필드 줌 방지가 **다른 방법으로 적용되어 있다**:

```css
/* globals.css에 이미 존재 */
input, select, textarea {
  font-size: max(16px, 1em);  /* ← 이게 있으면 iOS 자동줌이 안 일어남 */
}
```

즉, `userScalable: false`는 **이미 해결된 문제를 이중으로 막고 있으면서, 부작용만 만드는** 상태다.

### 개선 계획

**파일**: `app/layout.tsx`

```tsx
// Before
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,        // ← 삭제
  userScalable: false,     // ← 삭제
}

// After
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
}
```

**작업량**: 2줄 삭제 — 1분

---

## 6. 애니메이션 속도와 느낌이 파일마다 제각각인 문제

### 무슨 문제야?

애니메이션에는 두 가지 핵심 설정이 있다:
- **속도(Duration)**: 얼마나 걸리나 (0.2초? 0.5초? 1초?)
- **느낌(Easing)**: 어떤 느낌으로 움직이나 (톡 튀기는? 부드러운? 기계적인?)

현재 LexDiff에는 **속도가 10가지**(0.2초~2초), **느낌이 7가지 이상**이 혼재되어 있다. 이건 마치 오케스트라에서 각 연주자가 **자기 마음대로 템포를 정하는** 것과 같다. 개별 악기 소리는 괜찮은데 전체가 어우러지지 않는다.

사용자는 이걸 의식적으로 인지하지 못하지만, **"뭔가 이 앱 매끄럽지 않아"** 라고 느낀다.

### 개선 계획

**파일**: `app/styles/animations.css` 상단에 모션 토큰 추가

```css
/* ============================================
   Motion Tokens — 프로젝트 전체 표준
   ============================================ */
:root {
  /* Duration Scale (5단계) */
  --duration-instant: 100ms;   /* 호버, 포커스 링 */
  --duration-fast: 200ms;      /* 토글, 버튼 눌림 */
  --duration-normal: 300ms;    /* 패널, 드롭다운 */
  --duration-slow: 500ms;      /* 모달, 페이지 전환 */
  --duration-slower: 800ms;    /* 스크롤 리빌, 시퀀스 */

  /* Easing Scale (3종) */
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);      /* 기본 호버, 포커스 */
  --ease-productive: cubic-bezier(0.16, 1, 0.3, 1);    /* 열기/닫기, 슬라이드 */
  --ease-expressive: cubic-bezier(0.34, 1.56, 0.64, 1); /* 등장, 강조, 바운스 */
}
```

**사용법 가이드**:

| 상황 | Duration | Easing | 예시 |
|------|----------|--------|------|
| 버튼 호버/포커스 | instant (100ms) | standard | 배경색 변경 |
| 아이콘 호버 효과 | fast (200ms) | expressive | 회전, 이동, 확대 |
| 드롭다운/팝오버 | normal (300ms) | productive | 검색 자동완성 |
| 모달 열기/닫기 | slow (500ms) | productive | 비교 모달, 참조 모달 |
| 스크롤 리빌 | slower (800ms) | productive | Feature Cards 등장 |
| 페이지 전환 | slow (500ms) | productive | 홈 → 검색결과 |

**마이그레이션 순서**:
1. 변수 정의 (animations.css)
2. 기존 애니메이션에서 하드코딩된 값을 변수로 교체
3. 컴포넌트의 inline transition도 점진적 교체

**작업량**: 변수 정의 30분 + 기존 코드 교체 2~3시간

---

## 7. 글자 크기를 매번 즉흥적으로 정하는 문제

### 무슨 문제야?

현재 코드를 보면, 같은 종류의 텍스트인데도 파일마다 크기가 다르다:

```
섹션 제목: text-3xl (어디선가) vs text-2xl (다른 곳)
설명 텍스트: text-lg (여기) vs text-base (저기) vs text-sm (또 다른 곳)
버튼 텍스트: text-lg (검색 버튼) vs text-xs (도구 버튼) vs text-sm (일반 버튼)
```

이건 마치 신문 기사에서 **기자마다 다른 글자 크기를 쓰는** 것과 같다. 독자가 "이게 제목인가 본문인가 부제인가" 혼란스러워진다.

세계적 디자인 시스템은 글자 크기를 **이름 붙여서 관리**한다:
- `display`: 히어로 타이틀 전용 (아주 큼)
- `heading-lg`: 섹션 제목
- `heading-sm`: 카드 제목
- `body`: 본문
- `caption`: 부가 설명

### 개선 계획

**파일**: `app/styles/theme-variables.css`의 `@theme inline` 블록에 추가

```css
@theme inline {
  /* ... 기존 색상 변수들 ... */

  /* Type Scale */
  --font-size-display: clamp(2.5rem, 5vw + 1rem, 5rem);   /* Hero 타이틀 */
  --font-size-heading-lg: clamp(1.75rem, 3vw, 3rem);       /* 섹션 제목 */
  --font-size-heading-sm: clamp(1.125rem, 1.5vw, 1.25rem); /* 카드 제목 */
  --font-size-body: 1rem;                                    /* 본문 (16px) */
  --font-size-body-sm: 0.875rem;                             /* 작은 본문 (14px) */
  --font-size-caption: 0.75rem;                              /* 캡션 (12px) */
}
```

**Tailwind 유틸리티 클래스로 매핑** (globals.css):

```css
@layer utilities {
  .text-display { font-size: var(--font-size-display); line-height: 1.1; }
  .text-heading-lg { font-size: var(--font-size-heading-lg); line-height: 1.2; }
  .text-heading-sm { font-size: var(--font-size-heading-sm); line-height: 1.3; }
  .text-body { font-size: var(--font-size-body); line-height: 1.6; }
  .text-body-sm { font-size: var(--font-size-body-sm); line-height: 1.5; }
  .text-caption { font-size: var(--font-size-caption); line-height: 1.4; }
}
```

**적용 예시**:

```tsx
// Before (즉흥적)
<h1 className="text-6xl lg:text-8xl font-medium">LexDiff</h1>
<h3 className="text-3xl lg:text-5xl font-black">법령에서 찾고</h3>
<p className="text-lg text-gray-500">설명 텍스트</p>

// After (체계적)
<h1 className="text-display font-medium">LexDiff</h1>
<h3 className="text-heading-lg font-bold">법령에서 찾고</h3>
<p className="text-body text-muted-foreground">설명 텍스트</p>
```

**장점**: `clamp()` 사용으로 `lg:text-8xl` 같은 반응형 분기가 필요 없다. 화면 크기에 따라 **자동으로 부드럽게** 크기가 조절된다.

**작업량**: 변수 정의 30분 + 컴포넌트 마이그레이션 3~4시간

---

## 8. 모바일 버튼이 너무 작은 문제

### 무슨 문제야?

홈 화면의 도구 버튼("변경 영향 분석", "조례 미반영 탐지" 등)의 세로 패딩이 `py-2`(8px)로, 터치 영역의 총 높이가 약 **32px** 정도밖에 안 된다.

Apple은 "터치 영역은 최소 44px 이상이어야 한다"고 규정한다. 32px 버튼은 **손가락이 큰 사람이 정확히 누르기 어렵고**, 실수로 옆 버튼을 누를 수 있다. 법률 검색이라는 진지한 맥락에서 "잘못 눌러서 다른 기능이 실행됨"은 사용자 신뢰를 깨뜨린다.

### 개선 계획

**파일**: `components/search-view.tsx`

```tsx
// Before — 터치 영역 부족
"px-3 sm:px-4 py-2 rounded-full"

// After — 최소 44px 보장
"px-4 sm:px-5 py-3 rounded-sm min-h-[44px]"
```

**추가로 프로젝트 전체 규칙 선언**:

```css
/* globals.css에 추가 */
@layer base {
  /* 모바일 터치 타겟 최소 크기 보장 */
  @media (pointer: coarse) {
    button, [role="button"], a {
      min-height: 44px;
      min-width: 44px;
    }
  }
}
```

`@media (pointer: coarse)`는 "터치스크린 기기에서만" 적용된다. 마우스 사용자에게는 영향을 주지 않는다.

**작업량**: CSS 규칙 1개 + 버튼 클래스 수정 — 30분

---

## 9. 간격(Spacing)에 규칙이 없는 문제

### 무슨 문제야?

요소 사이의 여백(마진, 패딩, 갭)이 `4, 6, 8, 10, 12, 16, 24` 등 무작위로 사용되고 있다. 이건 마치 악보 없이 연주하는 것과 같다 — 대충 맞는 것 같지만 전문가 귀에는 박자가 어긋난다.

좋은 디자인에서는 간격이 **배수 관계**를 이룬다. 작은 간격의 2배가 중간 간격이고, 중간의 2배가 큰 간격인 식이다. 이러면 화면 전체에 **보이지 않는 그리드**가 형성되어 "정돈된 느낌"을 준다.

### 개선 계획

**8px 기반 간격 스케일 선언**:

| 토큰 이름 | 값 | Tailwind | 용도 |
|---|---|---|---|
| space-1 | 4px | `gap-1`, `p-1` | 아이콘-텍스트 간격 |
| space-2 | 8px | `gap-2`, `p-2` | 인라인 요소 간격 |
| space-3 | 12px | `gap-3`, `p-3` | 카드 내부 패딩 (모바일) |
| space-4 | 16px | `gap-4`, `p-4` | 카드 내부 패딩 (기본) |
| space-6 | 24px | `gap-6`, `p-6` | 섹션 내 그룹 간격 |
| space-8 | 32px | `gap-8`, `p-8` | 카드 내부 패딩 (데스크탑) |
| space-10 | 40px | `gap-10`, `p-10` | 섹션 간 간격 |
| space-16 | 64px | `gap-16`, `p-16` | 대형 섹션 간 간격 |

**금지 목록**: `gap-3`(12px), `gap-5`(20px), `gap-7`(28px) 등 **8의 배수가 아닌 값**은 원칙적으로 사용하지 않는다. 예외: 4px(space-1)과 12px(space-3)은 미세 조정용으로 허용.

**적용 예시**:

```tsx
// Before — 즉흥적
"gap-8 lg:gap-12"    // 32px → 48px (48은 8의 배수지만 점프가 큼)
"mb-6 lg:mb-8"       // 24px → 32px
"mb-4"               // 16px
"mb-3"               // 12px (왜 여기만 12?)

// After — 체계적
"gap-8 lg:gap-10"    // 32px → 40px (한 단계 점프)
"mb-6 lg:mb-8"       // 24px → 32px (유지, 이건 맞음)
"mb-4"               // 16px (유지)
"mb-4"               // 16px (12→16으로 통일)
```

**작업량**: 규칙 정의 + 기존 간격 정리 — 2~3시간

---

## 10. 홈 화면이 "어디서 많이 본" 레이아웃인 문제

### 무슨 문제야?

홈 화면은 "가운데 큰 제목 → 아래에 서브타이틀 → 검색바 → 카드 그리드"의 구조다. 이 레이아웃은 2020년대 모든 SaaS, AI 서비스, 스타트업이 쓰는 **가장 흔한 패턴**이다. LexDiff 특유의 개성이 없다.

법률 분야의 권위감은 **비대칭 레이아웃**에서 나온다. 실제 법률 서적, 판결문, 관보를 보면 가운데 정렬이 아니라 **넓은 왼쪽 마진 + 좌측 정렬**이다. 이게 "격식"의 시각 언어다.

### 개선 계획

**방향 A: 비대칭 히어로 (권장)**

```
[로고]                    [테마] [즐겨찾기] [도움말]
─────────────────────────────────────────────────

        Premium Legal AI

        LexDiff
        ─── (골드 라인)

        어려운 법률 용어 대신 일상 언어로,
        공직자를 위한 가장 쉬운 지능형
        법령 검색 플랫폼

        [==================================검색바==================================]
        [변경 영향 분석]  [조례 미반영 탐지]  [조례 벤치마킹]
```

**핵심 변경점**:
- `text-center` → `text-left` (좌측 정렬)
- `items-center` → `items-start`
- 컨테이너를 `max-w-4xl` → `max-w-5xl`로 넓히되, 좌측으로 오프셋
- 검색바는 전체 너비 유지 (좌측 정렬과 어울림)

**방향 B: 2컬럼 히어로 (대안)**

```
[왼쪽 60%]                     [오른쪽 40%]
Premium Legal AI               ┌─────────────┐
                                │  법령 구조   │
LexDiff                         │  시각화 or   │
─── (골드 라인)                 │  최근 검색   │
                                │  미니 카드   │
서브타이틀 텍스트               └─────────────┘

[========================검색바========================]
```

오른쪽에 **법령 구조 시각화**(트리 구조), **최근 검색 내역**, 또는 **실시간 법령 업데이트**를 배치하면 검색 플랫폼으로서의 가치를 즉시 보여줄 수 있다.

**작업량**: 방향 A는 클래스 수정 위주 — 2~3시간, 방향 B는 새 컴포넌트 필요 — 1~2일

---

## 실행 로드맵 요약

### Phase 1: 즉시 수정 (1일)

| 순서 | 작업 | 시간 | 위험도 |
|------|------|------|--------|
| 1-1 | `userScalable: false` 삭제 | 1분 | 없음 |
| 1-2 | 다크모드 `--brand-navy` 값 수정 | 5분 | 낮음 |
| 1-3 | Pretendard 600/700 weight 추가 | 10분 | 없음 |
| 1-4 | 모바일 터치 타겟 44px 규칙 추가 | 30분 | 낮음 |
| 1-5 | feature-cards.tsx `font-black` → `font-bold` | 5분 | 없음 |

### Phase 2: 토큰 시스템 구축 (2~3일)

| 순서 | 작업 | 시간 |
|------|------|------|
| 2-1 | 모션 토큰 정의 (duration + easing) | 30분 |
| 2-2 | 타입 스케일 정의 + Tailwind 유틸리티 | 1시간 |
| 2-3 | border-radius 전략 선언 + button.tsx 수정 | 1시간 |
| 2-4 | 간격 규칙 문서화 | 30분 |

### Phase 3: 하드코딩 제거 마이그레이션 (3~5일)

| 순서 | 작업 | 시간 |
|------|------|------|
| 3-1 | search-view.tsx 색상 변수 교체 | 1시간 |
| 3-2 | feature-cards.tsx 색상 + 타입 스케일 교체 | 1시간 |
| 3-3 | search-bar-home.tsx 정리 | 30분 |
| 3-4 | header.tsx + 기타 컴포넌트 | 2~3시간 |
| 3-5 | 기존 애니메이션 → 모션 토큰 교체 | 2~3시간 |
| 3-6 | 전체 다크모드 QA | 2시간 |

### Phase 4: 레이아웃 개선 (선택, 1~2주)

| 순서 | 작업 | 시간 |
|------|------|------|
| 4-1 | 히어로 비대칭 레이아웃 전환 | 3시간 |
| 4-2 | Feature Cards 시각적 위계 개선 | 2시간 |
| 4-3 | 법령 뷰어 브랜드 경험 강화 | 1~2일 |
| 4-4 | Spring physics 모션 적용 | 1일 |

---

## 부록: 개선 전후 비교 체크리스트

| 항목 | Before | After |
|------|--------|-------|
| 다크모드 Navy ≠ Gold | 동일값 | 구분됨 |
| 하드코딩 색상 수 | 30개+ | 0개 |
| Pretendard weight | 1개 (400) | 3개 (400/600/700) |
| Easing 종류 | 7종+ | 3종 |
| Duration 종류 | 10종+ | 5종 |
| border-radius 규칙 | 없음 | 3단계 명시 |
| Type Scale | ad-hoc | 6단계 시맨틱 |
| 모바일 최소 터치 | 32px | 44px |
| `userScalable` | false | 제거 |
| Spacing 규칙 | 없음 | 8px grid |

---

*이 문서는 DESIGN_ANALYSIS_REPORT.md의 발견사항을 기반으로 한 실행 계획서입니다.*
