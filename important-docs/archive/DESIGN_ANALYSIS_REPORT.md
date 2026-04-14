# LexDiff Design Analysis Report

**Date**: 2026-03-16
**Analyst**: World-Class Web Design Audit
**Framework**: Taste Skill Design Parameters (DESIGN_VARIANCE=8, MOTION_INTENSITY=6, VISUAL_DENSITY=4)

---

## Executive Summary

LexDiff는 한국 법령 검색 + AI 분석 플랫폼으로, **법률 도메인에 특화된 고급 디자인 시스템**을 구축하고 있다. OKLCH 컬러 스페이스, 프리미엄 서체 스택, Framer Motion 기반 애니메이션 등 기술적 기반은 견고하다. 그러나 세계적 수준의 디자인 관점에서 보면 **"기술은 있으나 의도가 부족한" 지점**들이 존재한다.

**Overall Score: 7.2 / 10**

| Category | Score | Assessment |
|----------|-------|------------|
| Color System | 8.5/10 | OKLCH 기반 — 업계 최선단 |
| Typography | 8.0/10 | 서체 선택 우수, 스케일 체계 미흡 |
| Layout & Spacing | 6.5/10 | 안전한 센터 정렬, 리듬감 부족 |
| Motion & Interaction | 7.0/10 | 풍부하나 체계 없음 |
| Component Quality | 7.5/10 | shadcn 기반 안정적, 개성 부재 |
| Dark Mode | 7.0/10 | 작동하나 "재설계"가 아닌 "반전" |
| Mobile Experience | 6.0/10 | 반응형이나 모바일 퍼스트 아님 |
| Brand Identity | 8.0/10 | Navy + Gold 조합 탁월 |
| Accessibility | 7.0/10 | Radix 기반 양호, 커스텀 부분 미흡 |
| Performance | 7.5/10 | LazyMotion + Dynamic import 활용 |

---

## I. COLOR SYSTEM — "기술적으로 완벽, 감정적으로 미완"

### What's Excellent

**OKLCH 컬러 스페이스 채택** — 이것 하나만으로도 2025년 이후의 디자인 트렌드를 정확히 읽고 있다. 대부분의 프로덕션 앱이 아직 HSL에 머물러 있는 시점에서, OKLCH의 **지각적 균일성(perceptual uniformity)**을 사용한 것은 탁월한 판단이다.

```css
/* Light */  --primary: oklch(0.28 0.04 250);  /* Deep Navy */
/* Dark */   --primary: oklch(0.75 0.12 75);   /* Champagne Gold */
```

라이트 모드의 Deep Navy → 다크 모드의 Champagne Gold로 전환하는 **듀얼 브랜드 전략**은 법률 도메인에서 보기 드문 세련된 접근이다.

### What Needs Work

**1. 중간 톤 팔레트 빈약**

현재 컬러 시스템은 양 극단(매우 밝은 배경 vs 매우 진한 텍스트)에 집중되어 있고, 중간 단계가 부족하다. `--muted-foreground: oklch(0.45 0.02 240)` 하나로 너무 많은 역할을 담당하고 있다.

**처방**: Primary에서 파생된 5단계 tint scale(50/100/200/300/400) 생성이 필요하다. 현재 `--brand-navy`와 `--primary` 사이에 중간 단계가 없어 카드 배경, 호버 상태, 비활성 상태 등에서 **시각적 공백**이 발생한다.

**2. 시맨틱 컬러 사용 일관성 부재**

`--success`, `--warning`, `--info`가 정의되어 있지만, 실제 컴포넌트에서는 Tailwind의 하드코딩된 클래스(`text-gray-600`, `bg-gray-50`)가 빈번하게 사용되고 있다.

```tsx
// feature-cards.tsx — 하드코딩 색상 다수
className="text-gray-600 dark:text-gray-400"  // ← --muted-foreground 사용 가능
className="bg-gray-50 dark:bg-background"      // ← --muted 사용 가능
className="border-gray-200 dark:border-gray-800"  // ← --border 사용 가능
```

**이는 디자인 시스템의 근본적 모순이다.** 정교한 CSS 변수 체계를 구축해놓고, 실제 컴포넌트에서는 직접 Tailwind 유틸리티를 쓰고 있다. 다크 모드에서의 일관성이 깨지는 주요 원인이다.

**3. 다크 모드의 `--brand-navy` 붕괴**

```css
/* Light */ --brand-navy: 0.22 0.04 250;  /* Deep Blue */
/* Dark */  --brand-navy: 0.72 0.12 65;   /* ← brand-gold와 동일값! */
```

다크 모드에서 `--brand-navy`와 `--brand-gold`가 **완전히 같은 값**이다. 이는 명백한 설계 오류이다. 브랜드의 이중 정체성(Navy + Gold)이 다크 모드에서 단색으로 붕괴한다. `text-brand-navy`와 `text-brand-gold`가 시각적으로 구분 불가능해지면서 정보 위계가 파괴된다.

---

## II. TYPOGRAPHY — "서체는 명품, 운용은 중급"

### What's Excellent

한국 법률 도메인에 특화된 서체 스택은 **교과서적으로 완벽**하다:

| 역할 | 서체 | 평가 |
|------|------|------|
| UI 산세리프 | Pretendard | 한국어 최적, 가독성 우수 |
| 법조문 본문 | RIDIBatang | 격식 있는 명조체, 법률 문서에 이상적 |
| 보조 세리프 | MaruBuri | 부드러운 명조, 폴백으로 적절 |
| 브랜드 디스플레이 | Libre Bodoni Italic | 서구 법률 전통의 클래식 세리프 |

Libre Bodoni Italic을 로고 타이포에 사용한 것은 **"LexDiff"라는 영문 브랜드명에 법적 권위감**을 부여하는 탁월한 선택이다. Variable Font으로 제공되어 `fontVariationSettings: "'wght' 500"`으로 미세 조정하고 있는 점도 프로페셔널하다.

### What Needs Work

**1. Type Scale 부재**

현재 프로젝트에 **명시적인 타이포그래피 스케일**이 없다. Tailwind의 기본 사이즈(`text-sm`, `text-base`, `text-lg`, `text-xl` 등)를 ad-hoc으로 사용하고 있다.

```tsx
// search-view.tsx 내 타이포 사이즈 혼재
"text-6xl lg:text-8xl"      // Hero title
"text-base lg:text-xl"      // Subtitle
"text-sm font-bold"         // Badge
"text-xs sm:text-sm"        // Tool buttons
"text-3xl lg:text-5xl"      // Section heading
"text-lg"                   // Section description
```

세계적 디자인 시스템(Vercel Geist, Linear, Stripe)은 **의도된 Type Scale**을 갖고 있다: `display-xl` → `heading-lg` → `body-md` → `caption-sm` 같은 시맨틱 레이어가 있어야 한다. 현재는 매번 개발자가 "여기는 text-3xl이 맞나 text-4xl이 맞나"를 판단하고 있다.

**2. 폰트 로딩 전략의 비효율**

```css
/* fonts.css */
@font-face {
  font-family: 'Pretendard';
  src: url('https://cdn.jsdelivr.net/gh/...');
  font-weight: 400;
  font-display: swap;
}
```

Pretendard는 **400 weight만** 로드하고 있다. 그런데 코드에서는 `font-bold`(700), `font-semibold`(600), `font-black`(900)을 사용하고 있다. 브라우저가 **faux bold**를 합성하고 있을 가능성이 높다. 이는 특히 한국어에서 글자 두께가 부자연스럽게 보이는 원인이 된다.

**3. line-height 불일치**

법조문 콘텐츠는 `line-height: 1.8`로 관대하게 설정되어 있는 반면, UI 요소들은 Tailwind 기본값(`leading-normal` = 1.5)을 따르고 있다. 이 두 영역이 한 화면에 공존할 때 **시각적 리듬의 단절**이 발생한다.

---

## III. LAYOUT & SPATIAL SYSTEM — "안전하지만 기억에 남지 않는"

### What's Excellent

- `max-w-7xl`(1280px) 컨테이너 제한은 법률 콘텐츠의 가독성에 적합하다
- `px-6 lg:px-8` 패딩은 모바일/데스크탑 간 적절한 전환을 제공한다

### Critical Issues

**1. LLM 바이어스: 대칭 센터 정렬 과의존**

Hero 섹션이 전형적인 **"Big Title + Subtitle + CTA" 패턴**이다:

```
[          Badge          ]
[        LexDiff          ]  ← 센터
[      ─── 라인 ───       ]  ← 센터
[       서브타이틀        ]  ← 센터
[      [ 검색바 ]         ]  ← 센터
[   버튼  버튼  버튼      ]  ← 센터
```

이것은 2020년대 웹사이트의 **가장 흔한 레이아웃**이다. Vercel, Linear, Stripe, Notion 모두 이 패턴에서 벗어난 지 오래다. 법률 플랫폼으로서의 **권위감**을 주려면, 왼쪽 정렬 + 비대칭 레이아웃이 더 효과적이다. 실제 법률 서적의 판면 디자인을 참고하라 — 중앙 정렬이 아니라 **좌측 정렬 + 넓은 마진**이 격식을 부여한다.

**2. Spacing Scale의 무원칙**

```tsx
// 같은 feature-cards.tsx 내
"gap-8 lg:gap-12"     // Branding cards gap
"gap-4 lg:gap-6"      // Tool cards gap
"mb-6 lg:mb-8"        // Section header margin
"mb-4"                // Card title margin
"mb-6"                // Icon container margin
"mb-2"                // Tool title margin
"mb-3"                // Tool description margin
```

이 간격들 사이에 **수학적 비율**이 없다. 4, 6, 8, 12가 혼재하며, 8px 기반 그리드를 따르는 듯 하지만 일관되지 않다. 프리미엄 디자인 시스템은 **4의 배수** 또는 **Golden Ratio** 기반의 간격 스케일을 갖는다.

**3. Feature Cards의 시각적 단조로움**

3개의 브랜딩 카드가 `md:grid-cols-3`으로 **동일한 크기**로 나열되어 있다. AI 법률 분석 > 법령 비교·추적 > 실시간 데이터의 **정보 위계**가 시각적으로 표현되지 않는다. 첫 번째 카드가 더 크거나, 다른 시각적 무게를 가져야 한다.

---

## IV. MOTION & INTERACTION — "양은 충분, 시스템은 부재"

### What's Excellent

- **15개 이상의 키프레임 애니메이션** 정의 — 풍부한 모션 팔레트
- **Intersection Observer 기반 Scroll Reveal** — 성능 고려한 올바른 접근
- **아이콘별 맥락적 호버 효과** (`button-hover.css`) — 이것은 정말 돋보이는 디테일이다

```css
/* 비교 버튼 → 아이콘 회전 */
button:hover [data-icon="git-compare"] {
  transform: rotate(12deg) scale(1.1);
}
/* 외부 링크 → 대각선 이동 */
button:hover [data-icon="external-link"] {
  transform: translate(2px, -2px) scale(1.1);
}
```

이런 **맥락 인식 마이크로인터랙션**은 $150k+ 에이전시급 디테일이다. 대부분의 프로덕트가 모든 아이콘에 동일한 `scale(1.1)`을 적용하는 것과 비교하면, 각 아이콘의 **의미론적 움직임**을 반영한 것은 탁월하다.

### What Needs Work

**1. Easing Function의 비체계성**

```css
/* 같은 프로젝트 내 혼재하는 easing */
cubic-bezier(0.34, 1.56, 0.64, 1)  /* scale-in (overshoot) */
cubic-bezier(0.16, 1, 0.3, 1)      /* fade-in-up (smooth decelerate) */
cubic-bezier(0.4, 0, 0.2, 1)       /* law-link hover (standard ease) */
cubic-bezier(0.25, 1, 0.5, 1)      /* container animation */
ease-in-out                          /* shimmer, swipe */
ease-out                             /* fade-in, sparkle */
ease                                 /* button hover */
```

**7가지 이상의 서로 다른 easing function**이 사용되고 있다. Apple, Google, Linear 같은 최고 수준의 디자인 시스템은 **2-3개의 이징 커브**만 정의한다:
- `ease-productive`: 기능적 전환 (메뉴 열기, 탭 전환)
- `ease-expressive`: 강조 전환 (페이지 전환, 모달 등장)
- `ease-standard`: 기본 호버, 포커스

현재는 애니메이션마다 개발자가 "느낌"에 따라 easing을 선택하고 있어 **전체적인 모션 언어가 통일되지 않는다.**

**2. Duration Scale 미정의**

```css
0.2s, 0.3s, 0.4s, 0.5s, 0.6s, 0.7s, 0.8s, 1s, 1.5s, 2s
```

거의 모든 duration이 사용되고 있다. 세계적 디자인 시스템은 **100ms 단위의 제한된 duration scale**을 사용한다:
- `instant`: 100ms (호버, 포커스)
- `fast`: 200ms (토글, 스위치)
- `normal`: 300ms (패널 열기, 카드 전환)
- `slow`: 500ms (페이지 전환, 모달)
- `slower`: 800ms (데이터 시각화, 시퀀스)

**3. 스프링 물리학 미적용**

Framer Motion을 사용하고 있으면서 **spring animation**을 거의 활용하지 않고 있다. 현재의 `duration` + `ease` 조합은 CSS로도 가능한 수준이다. Framer Motion의 진정한 강점인 `spring({ stiffness: 300, damping: 25 })` 같은 물리 기반 애니메이션이 적용되면 **확연히 다른 촉감**을 줄 수 있다.

---

## V. COMPONENT QUALITY — "shadcn의 한계 안에서의 최선"

### What's Excellent

- **CVA(Class Variance Authority)** 기반 버튼 시스템은 type-safe하고 확장 가능
- `active:scale-[0.98]` 같은 디테일은 **물리적 누름 감**을 제공
- `hover:shadow-md hover:shadow-primary/25` — 그림자에 브랜드 컬러를 tint하는 것은 세련된 터치
- `data-slot="button"`, `data-slot="icon"` — Radix 패턴을 확장한 슬롯 시스템

### What Needs Work

**1. border-radius = 0 전략의 불완전한 실행**

흥미로운 디자인 결정이 보인다 — **로고 아이콘 박스, 검색바, 카드** 등에서 `rounded-none`(각진 모서리)을 사용하고 있다. 이것은 **법률의 엄격함과 정밀함**을 시각적으로 표현하려는 의도로 읽힌다. 그러나:

```tsx
// 각진 요소들
"flex h-10 w-10 items-center justify-center bg-brand-navy"  // 로고 아이콘 (각짐)
"bg-white dark:bg-[#1f2937] border border-gray-300"         // 검색바 (각짐)
"bg-white dark:bg-[#1a222c] border border-gray-200"         // 카드 (각짐)

// 둥근 요소들 (동시에 존재)
"rounded-full border border-brand-navy/15"                   // 도구 버튼 (완전히 둥글음)
"rounded-md"                                                 // 기본 버튼 (중간)
"rounded-lg bg-primary"                                      // Header 로고 (둥글음)
```

**각진 것과 둥근 것이 무원칙적으로 혼재**한다. "LexDiff는 각진 디자인이다"라고 선언했다면, 도구 버튼의 `rounded-full`은 모순이다. 반대로 "둥근 디자인"이라면 카드와 검색바가 모순이다.

**처방**: **radius 전략을 명확히 선언**하라. 법률 도메인의 권위감을 위해 "Sharp" 전략을 선택했다면, 모든 interactive 요소에 일관되게 적용하라. Pill 형태(`rounded-full`)는 태그/뱃지에만 허용하는 식으로 규칙을 세워야 한다.

**2. SearchBar의 비례 불균형**

```tsx
// 검색바 구성
[AI 토글: w-16 h-16] | [입력필드: flex-1 h-16] | [검색 버튼: h-16 px-8]
```

AI 토글 버튼과 검색 버튼의 **시각적 무게가 동일**하다. 그러나 기능적 중요도는 `검색 > 입력 >>> AI 토글`이다. AI 토글은 더 작거나 시각적으로 후퇴해야 하고, 검색 버튼은 더 강조되어야 한다. 현재 레이아웃은 세 요소가 동등한 시각적 무게를 가져 사용자의 시선 흐름을 방해한다.

---

## VI. DARK MODE — "반전이 아닌 재설계가 필요하다"

### The Good

Navy → Gold 팔레트 전환은 **감정적으로 다른 경험**을 제공한다. 라이트 모드가 "공적 문서"의 느낌이라면, 다크 모드는 "집무실의 야간 업무" 분위기다.

### Critical Issues

**1. 하드코딩된 다크모드 색상**

```tsx
// search-view.tsx
"bg-white dark:bg-[#121620]"         // 하드코딩
"dark:bg-[#1f2937]"                   // 하드코딩
"dark:bg-[#1a222c]"                   // 하드코딩
"dark:border-gray-800/60"             // Tailwind 기본 gray
"dark:text-gray-400"                  // Tailwind 기본 gray
```

CSS 변수 시스템을 구축해놓고 컴포넌트에서 **3가지 서로 다른 다크 배경색**을 하드코딩하고 있다. `#121620`, `#1f2937`, `#1a222c`는 서로 미묘하게 다른 블루-그레이인데, 이것이 의도된 계층인지 실수인지 불명확하다.

**처방**: `--card`, `--popover`, `--secondary` 등 이미 정의된 시맨틱 변수를 사용하라.

**2. 대비율(Contrast Ratio) 미검증 우려**

다크 모드에서 `--muted-foreground: oklch(0.65 0.02 240)`와 `--background: oklch(0.12 0.01 240)`의 대비율이 WCAG AA 기준(4.5:1)을 충족하는지 검증이 필요하다. OKLCH가 perceptual uniformity를 제공하지만, 그것이 자동으로 접근성 기준을 보장하지는 않는다.

---

## VII. MOBILE EXPERIENCE — "작동하지만 최적화되지 않았다"

### Issues

**1. `userScalable: false`의 접근성 위반**

```tsx
export const viewport: Viewport = {
  maximumScale: 1,
  userScalable: false,  // ← WCAG 2.1 SC 1.4.4 위반
}
```

이것은 **시각 장애를 가진 사용자의 핀치 줌을 차단**한다. iOS Safari에서 폼 줌을 막으려는 의도라면, `font-size: max(16px, 1em)` 처리만으로 충분하다 (이미 globals.css에 적용됨). `userScalable: false`는 제거해야 한다.

**2. 모바일 도구 버튼의 터치 타겟**

```tsx
"px-3 sm:px-4 py-2 rounded-full"  // 도구 버튼
```

`py-2`(8px)는 모바일 터치 타겟으로 **너무 작다.** Apple의 HIG는 최소 44pt, Google Material은 48dp를 권장한다. `py-3`(12px) 이상이 필요하며, 전체 높이가 44px 이상이 되어야 한다.

**3. SPA 단일 URL의 모바일 UX 문제**

URL이 항상 `/`인 것은 **모바일에서 "공유하기" 기능**을 무력화한다. 사용자가 특정 법령 검색 결과를 공유하고 싶을 때, 해당 상태를 URL로 인코딩할 수 없다. History API로 브라우저 뒤로가기는 해결했지만, **딥 링킹**은 불가능하다.

---

## VIII. BRAND IDENTITY — "가장 강력한 자산"

### What's Exceptional

**Navy + Gold + Sharp Geometry + Libre Bodoni Italic** — 이 조합은 LexDiff의 가장 강력한 디자인 자산이다.

| Element | Signal |
|---------|--------|
| Deep Navy | 법적 권위, 신뢰, 전문성 |
| Champagne Gold | 프리미엄, 정밀함, 가치 |
| Sharp edges (no radius) | 법의 엄격함, 정확성 |
| Libre Bodoni Italic | 서양 법률 전통, 학술적 권위 |
| RIDIBatang | 한국 법률 문서의 격식 |

이 브랜드 언어가 **전체 UI에 일관되게 적용된다면**, 한국 법률 테크 시장에서 시각적으로 가장 강력한 포지셔닝을 가질 수 있다.

### What Needs Work

**브랜드 요소가 전체 경험에 스며들지 못하고 있다.** Hero 섹션에서는 강렬하게 표현되지만, 검색 결과 페이지, 법령 뷰어, 모달 등 **작업 화면(working screens)**으로 넘어가면 일반적인 shadcn/ui 앱처럼 보인다. 사용자가 법령을 읽고 분석하는 **핵심 경험의 80%**에서 브랜드가 희석된다.

---

## IX. PRIORITIZED RECOMMENDATIONS

### Quick Wins (High Impact / Low Effort)

| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 1 | 하드코딩 색상 → CSS 변수 마이그레이션 | 9/10 | 2/10 |
| 2 | `userScalable: false` 제거 | 8/10 | 1/10 |
| 3 | 다크모드 `--brand-navy` 값 수정 (≠ brand-gold) | 8/10 | 1/10 |
| 4 | 모바일 터치 타겟 최소 44px 보장 | 7/10 | 2/10 |
| 5 | Pretendard 600/700 weight 추가 로드 | 7/10 | 1/10 |

### Strategic (High Impact / High Effort)

| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 6 | Motion Tokens 정의 (easing 3종 + duration 5단계) | 8/10 | 5/10 |
| 7 | Type Scale 시맨틱 레이어 구축 | 8/10 | 6/10 |
| 8 | Spacing Scale 체계화 (8px grid strict) | 7/10 | 5/10 |
| 9 | border-radius 전략 통일 | 7/10 | 4/10 |
| 10 | Hero 레이아웃 비대칭 리디자인 | 6/10 | 6/10 |

### Long-term Vision

| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 11 | 법령 뷰어 브랜드 경험 강화 | 9/10 | 8/10 |
| 12 | Spring physics 모션 도입 | 7/10 | 7/10 |
| 13 | URL 기반 딥 링킹 시스템 | 8/10 | 8/10 |
| 14 | Double-Bezel 카드 패턴 도입 | 6/10 | 5/10 |

---

## X. VERDICT

LexDiff는 **기술적으로 성숙한 디자인 인프라** 위에 구축되어 있다. OKLCH 컬러, 프리미엄 서체 스택, Framer Motion, Radix Primitives — 이 도구들은 모두 올바른 선택이다.

문제는 **"시스템으로서의 디자인"이 아직 완성되지 않았다**는 점이다. 색상 변수를 정의해놓고 하드코딩을 하고, 애니메이션을 만들어놓고 체계 없이 사용하고, 각진 모서리를 선언해놓고 둥근 요소를 섞는다.

**비유하자면**: 최고급 원단(OKLCH, Libre Bodoni, Framer Motion)을 갖고 있지만, 재단사의 패턴(Design Tokens, Scale System, Motion Language)이 아직 덜 완성된 맞춤 정장이다.

원단의 품질이 이미 뛰어나므로, **패턴만 정리하면 세계 수준의 법률 테크 UI**가 될 수 있다.

---

*Generated by Taste Design Analysis System*
*Parameters: DESIGN_VARIANCE=8, MOTION_INTENSITY=6, VISUAL_DENSITY=4*
