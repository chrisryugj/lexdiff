# LexDiff 디자인 불일치 정밀 감사

**Date**: 2026-03-16
**방법론**: 전체 컴포넌트 코드를 맥락 기반으로 읽고, 의도된 설계와 실제 불일치를 구분

> 이전 리포트(DESIGN_ANALYSIS_REPORT.md)에서 숫자만 나열하고 "불규칙하다"고 단정한 부분을 정정합니다.
> 실제 코드의 맥락을 읽고, 의도된 것과 진짜 문제를 구분했습니다.

---

## 이전 분석에서 잘못 지적한 것들 (정정)

### 1. "Spacing이 무원칙" → 실제로는 대부분 의도됨

이전 리포트에서 feature-cards.tsx의 gap/margin 값이 `4, 6, 8, 12` 혼재라고 지적했는데, 실제 맥락을 보면:

| 값 | 실제 용도 | 의도 |
|---|---|---|
| `gap-8 lg:gap-12` | 브랜딩 카드(3열 대형) 간 간격 | 큰 카드니까 넓은 간격 — 합리적 |
| `gap-4 lg:gap-6` | 도구 카드(5열 소형) 간 간격 | 작은 카드니까 좁은 간격 — 합리적 |
| `mb-6 lg:mb-8` | 섹션 헤더 → 카드 그리드 간격 | 섹션 전환이니 넉넉하게 — 합리적 |
| `mb-6` | 아이콘 컨테이너(w-14 h-14) 아래 | 큰 아이콘 아래 공간 — 합리적 |
| `mb-4` | 브랜딩 카드 제목 아래 | 제목→설명 간격 — 합리적 |
| `mb-2` | 도구 카드 제목 아래 | 더 작은 카드이므로 더 좁은 간격 — 합리적 |
| `mb-3` | 도구 카드 설명 아래 | 설명→"시작하기" 사이 — 합리적 |

**결론**: 브랜딩 카드(대형)와 도구 카드(소형)의 간격 차이는 **카드 크기에 비례한 의도적 설계**다. "수학적 비율이 없다"는 이전 지적은 부당했다. 실제로 `p-5 sm:p-8 lg:p-10`(브랜딩) vs `p-4 sm:p-6`(도구)로 카드 크기 자체도 다르게 설정되어 있으므로, 간격도 달라야 맞다.

### 2. "Easing이 7가지" → 실제로는 역할별 분리

이전에 "7가지 easing이 혼재"라고 했는데, 실제 사용 맥락을 보면:

| Easing | 어디서 | 왜 |
|---|---|---|
| `cubic-bezier(0.25, 1, 0.5, 1)` | Hero 입장, 카드 리빌, 헤더 출현 | **페이지 레벨 큰 동작** — 부드럽게 감속하는 것이 맞다 |
| `cubic-bezier(0.16, 1, 0.3, 1)` | Scroll reveal 트랜지션 | **스크롤 연동 리빌** — 약간 더 급한 감속으로 스크롤 따라잡기 |
| `cubic-bezier(0.34, 1.56, 0.64, 1)` | 토스트 scale-in, 아이콘 호버 | **오버슈트(살짝 튕기는 느낌)** — 주목을 끌어야 하는 요소 |
| `cubic-bezier(0.4, 0, 0.2, 1)` | 법령 링크 호버 | CSS 표준 `ease` — 링크 호버는 가장 일반적인 전환 |
| `ease-in-out` | shimmer, swipe 교육 | **반복 애니메이션** — 루프에서는 대칭 이징이 자연스럽다 |
| `ease-out` | fade-in, sparkle | **일회성 입장** — 빠르게 시작, 천천히 마무리 |

**결론**: 실제로는 **(1) 페이지 레벨 감속** (2) **오버슈트** (3) **반복 루프** (4) **일반 호버**의 4가지 역할로 분류 가능하며, 각각 다른 easing을 쓰는 것은 합리적이다. 다만 `(0.25, 1, 0.5, 1)`과 `(0.16, 1, 0.3, 1)`의 차이는 극히 미묘해서, 하나로 통합할 수 있는 여지가 있다.

### 3. "Duration이 10가지" → 맥락상 합리적인 것들

| Duration | 맥락 | 판단 |
|---|---|---|
| `0.2s` | 아이콘 호버, 버튼 트랜지션 | **마이크로인터랙션** — 빨라야 함 |
| `0.3s` | 법령 링크 호버, 도구 버튼 호버 | **호버 효과** — 0.2~0.3s 범위 표준 |
| `0.4s` | 헤더 출현/숨김, 테마 전환 | **UI 패널 전환** — 적절 |
| `0.5s` | 골드 바 scale-x 호버 | **장식 요소** — 느긋한 것이 우아 |
| `0.7s` | 스크롤 리빌 트랜지션 | **콘텐츠 입장** — 중간 속도 |
| `0.8s` | Hero 요소 입장 (Framer Motion) | **첫 인상 연출** — 의도적으로 느리게 |
| `1s` | Feature 섹션 opacity 전환 | **섹션 레벨 페이드** — 배경 전환이라 느린 것이 자연 |
| `1.5s` | slide 프로그레스 바 | **반복 진행 표시** — 여유 있게 반복 |
| `2s` | shimmer, swipe 교육 | **반복 루프** — 교육용이라 천천히 |

**결론**: 마이크로(0.2s) → 호버(0.3s) → UI 전환(0.4s) → 장식(0.5s) → 리빌(0.7-0.8s) → 배경(1s) → 루프(1.5-2s)로 **속도가 점진적으로 증가**하는 패턴이 있다. "무작위"가 아니다. 다만 이 패턴이 명시적으로 문서화/토큰화되어 있지 않은 것은 사실이다.

### 4. "Feature Cards가 동일 크기라 단조롭다" → 의도적 대등 배치

3개의 브랜딩 카드(AI 법률 분석, 법령 비교·추적, 실시간 법제처 데이터)를 동일 크기로 배치한 것을 "정보 위계 부재"라고 지적했는데, 이 3가지는 제품의 **핵심 역량 3가지를 대등하게 소개**하는 구조다. 하나가 더 중요한 것이 아니라 "이 3가지를 다 한다"가 메시지이므로, 대등 배치가 맞다.

---

## 진짜 불일치: 파일 간 교차 비교에서 발견된 것들

### 불일치 1: 같은 "로고 아이콘 박스"가 3곳에서 모두 다르다

프로젝트에 헤더가 3개 존재하며, 각각의 로고 아이콘 박스 스타일이 전부 다르다:

**search-view.tsx:155** (홈 헤더):
```tsx
<div className="flex h-10 w-10 items-center justify-center bg-brand-navy text-white dark:text-background shadow-md">
  <Icon name="scale" size={22} />
```

**header.tsx:48** (검색결과 헤더):
```tsx
<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
  <Icon name="scale" size={20} className="text-primary-foreground" />
```

**floating-compact-header.tsx:131** (법령 뷰어 헤더):
```tsx
<div className="flex h-8 w-8 lg:h-9 lg:w-9 items-center justify-center rounded-sm bg-brand-navy ...">
  <Icon name="scale" size={18} className="text-white dark:text-background" />
```

| | search-view (홈) | header (검색결과) | floating-compact-header (법령 뷰어) |
|---|---|---|---|
| 크기 | `h-10 w-10` | `h-9 w-9` | `h-8 w-8 lg:h-9 lg:w-9` |
| 모서리 | 없음 (각짐) | `rounded-lg` (8px) | `rounded-sm` (2px) |
| 색상 | `bg-brand-navy` | `bg-primary` | `bg-brand-navy` |
| 텍스트 | `text-white dark:text-background` | `text-primary-foreground` | `text-white dark:text-background` |
| 아이콘 크기 | 22 | 20 | 18 |
| 호버 | `group-hover:scale-105` | `hover:opacity-80` | `group-hover:scale-105` |

**왜 진짜 불일치인가**: 3곳 모두 **같은 LexDiff 로고 아이콘**인데, 모서리가 각각 `없음(0px)`, `rounded-lg(8px)`, `rounded-sm(2px)`으로 전부 다르다. 색상 참조도 `bg-brand-navy`(2곳) vs `bg-primary`(1곳)로 나뉘고, 호버 효과도 `scale`(2곳) vs `opacity`(1곳)으로 갈린다.

**의도 가능성 검토**: 홈→검색결과→법령뷰어로 갈수록 로고가 작아지는 것은 "점점 콘텐츠에 집중"이라는 의도로 읽힌다. 하지만 **모서리 radius가 3가지**인 것은 의도라기보다 각 헤더를 별도로 만들면서 생긴 편차다. `header.tsx`만 `bg-primary`를 쓰고 나머지는 `bg-brand-navy`인 것도 통일이 안 된 것이다.

---

### 불일치 2: 같은 "카드" 역할이지만 radius 체계가 다르다

| 컴포넌트 | radius | 역할 |
|---|---|---|
| `ui/card.tsx` (기반 컴포넌트) | `rounded-xl` | shadcn 기본 카드 |
| `feature-cards.tsx` 브랜딩 카드 | 없음 (각짐) | 홈 기능 소개 카드 |
| `feature-cards.tsx` 도구 카드 | 없음 (각짐) | 홈 도구 버튼 카드 |
| `precedent-section.tsx` 판례 아이템 | `rounded-2xl` | 판례 목록 아이템 |
| `PrecedentDetailPanel` 내용 블록 | `rounded-lg` | 판례 상세 섹션 배경 |
| `ui/dialog.tsx` 다이얼로그 | `rounded-lg` | 모달 컨테이너 |
| `ui/badge.tsx` 뱃지 | `rounded-md` | 태그/라벨 |

**왜 진짜 불일치인가**: 두 가지 디자인 언어가 혼재한다.

- **홈 화면 계열**: 각진 모서리 (`feature-cards`, `search-bar-home`, `search-view 로고`)
- **작업 화면 계열**: 둥근 모서리 (`Card rounded-xl`, `precedent rounded-2xl`, `dialog rounded-lg`)

이것이 "홈은 각지게, 내부는 부드럽게"라는 **의도적 이원 전략**이라면 합리적이다. 그러나:

- `precedent-section`의 `rounded-2xl`은 `Card`의 `rounded-xl`보다 **더 둥글다**. 같은 "카드형 아이템"인데 왜 다른가?
- `PrecedentDetailPanel`의 내용 블록은 `rounded-lg`(Card보다 작음). 왜 판례 리스트 아이템(`rounded-2xl`)보다 **덜 둥근가**?

**판례 섹션 내부만 봐도 불일치**:
```
PrecedentListItem: rounded-2xl (가장 둥글음)
PrecedentDetailPanel 배경: rounded-lg (중간)
PrecedentDetailPanel 뱃지: rounded (가장 작음)
```

이 순서가 시각적 위계와 매칭되는지 불분명하다. 보통은 **바깥 컨테이너가 더 둥글고, 안쪽 요소가 덜 둥근** 것이 자연스러운데, 여기서는 리스트 아이템(바깥)이 `2xl`, 상세 내용 블록(안쪽)이 `lg`여서 그 패턴을 따르고 있기는 하다. 다만 `2xl`(16px)은 꽤 공격적인 radius여서 인접한 `Card`(`xl` = 12px)와 미묘한 차이가 느껴진다.

---

### 불일치 3: 색상 참조 방식이 파일마다 다르다

이것은 "하드코딩 vs 변수" 문제가 아니라, **같은 의미의 색상을 참조하는 방식이 3가지**인 문제다.

**방식 A — CSS 변수 (시맨틱)**
```tsx
// header.tsx, precedent-section.tsx, Card, Dialog 등
"text-muted-foreground"
"bg-card"
"border-border"
"text-foreground"
```

**방식 B — Tailwind gray 팔레트 (직접)**
```tsx
// search-view.tsx, feature-cards.tsx, law-stats-footer.tsx
"text-gray-600 dark:text-gray-400"
"bg-gray-50 dark:bg-background"
"border-gray-200 dark:border-gray-800"
```

**방식 C — 하드코딩 hex**
```tsx
// search-view.tsx, feature-cards.tsx, search-bar-home.tsx
"dark:bg-[#121620]"
"dark:bg-[#1a222c]"
"dark:bg-[#1f2937]"
```

**구체적 위치와 문제점**:

#### 같은 "보조 텍스트" 색상인데 3가지 방식:

| 파일 | 코드 | 실제 렌더링 |
|---|---|---|
| header.tsx:81 | `text-muted-foreground` | oklch(0.45 0.02 240) → 다크: oklch(0.65 0.02 240) |
| search-view.tsx:223 | `text-gray-600 dark:text-gray-300` | #4b5563 → 다크: #d1d5db |
| feature-cards.tsx:145 | `text-gray-600 dark:text-gray-400` | #4b5563 → 다크: #9ca3af |
| law-stats-footer.tsx:63 | `text-gray-600 dark:text-gray-400` | #4b5563 → 다크: #9ca3af |

라이트 모드에서는 큰 차이가 없지만, **다크 모드에서 `gray-300`(#d1d5db)과 `gray-400`(#9ca3af)은 눈에 띄게 다르다**. search-view의 서브타이틀만 유독 밝은 보조 텍스트가 되고, feature-cards와 footer의 보조 텍스트는 더 어둡다.

**의도 가능성 검토**: search-view 서브타이틀은 "어려운 법률 용어 대신..."이라는 핵심 메시지여서 `gray-300`(더 밝게)으로 강조한 것일 수 있다. feature-cards의 설명은 부수적이어서 `gray-400`(더 어둡게). 이것이 의도라면 합리적이지만, 이 두 색상 모두 `text-muted-foreground`의 oklch(0.65)와는 또 다른 값이다.

#### 같은 "다크 카드 배경"인데 3가지 hex:

| 파일:라인 | hex 값 | oklch 근사값 | 맥락 |
|---|---|---|---|
| search-view.tsx:277 | `#121620` | L≈0.10 | Feature 섹션 `<main>` 배경 |
| feature-cards.tsx:131,165 | `#1a222c` | L≈0.16 | 카드 배경 |
| search-bar-home.tsx:64 | `#1f2937` | L≈0.19 | 검색바 배경 |
| search-bar-home.tsx:106 | `#1a222c` | L≈0.16 | 검색바 드롭다운 포커스 배경 |

**실제 화면에서의 결과**: 홈 화면을 다크 모드로 보면:
- 메인 배경(content-bg)은 oklch(0.10)
- 그 위에 Feature 섹션 `<main>`은 `#121620`(L≈0.10) — 메인과 거의 같음
- 그 위에 카드들은 `#1a222c`(L≈0.16) — 약간 밝음
- 검색바는 `#1f2937`(L≈0.19) — 카드보다 더 밝음

이것은 **"배경 < 섹션 < 카드 < 입력필드"로 밝기가 올라가는 계층 구조**를 만들려는 의도로 읽힌다. 그 자체는 합리적이다.

**진짜 문제점**: 이 계층이 **CSS 변수(`--background`, `--card`, `--popover`)에 이미 정의된 계층과 별도로** hex로 존재한다는 것이다.

```css
/* theme-variables.css에 이미 있는 다크모드 계층 */
--background: oklch(0.12 0.01 240);  /* L=0.12 */
--card:       oklch(0.16 0.01 240);  /* L=0.16 */
--popover:    oklch(0.14 0.01 240);  /* L=0.14 */
--secondary:  oklch(0.22 0.02 240);  /* L=0.22 */
```

vs

```
실제 사용: #121620(L≈0.10), #1a222c(L≈0.16), #1f2937(L≈0.19)
```

- `#121620`(L≈0.10)은 `--background`(L=0.12)보다 **더 어둡다**. 왜?
- `#1a222c`(L≈0.16)은 `--card`(L=0.16)와 **거의 같다**. 그러면 `bg-card`를 쓰면 된다.
- `#1f2937`(L≈0.19)은 `--card`와 `--secondary` 사이다. 기존 변수로 커버 안 되는 값.

**결론**: 카드 배경의 `#1a222c`는 `bg-card`로 교체 가능하다. 검색바의 `#1f2937`은 CSS 변수 체계에 없는 값이므로, 새 변수(`--input-bg` 등)를 만들거나 `--secondary`(L=0.22)를 조정할 필요가 있다. Feature 섹션의 `#121620`은 `--background`보다 의도적으로 더 어둡게 한 것이라면, `--content-bg` 변수(이미 존재: oklch(0.10 0.02 255))와의 관계를 정리해야 한다.

---

### 불일치 4: 같은 역할의 버튼 호버인데 방식이 다르다

| 파일 | 호버 방식 | 맥락 |
|---|---|---|
| search-view.tsx:171 | `hover:bg-gray-200 dark:hover:bg-gray-800` | 즐겨찾기 버튼 |
| search-view.tsx:177 | `hover:bg-gray-200 dark:hover:bg-gray-800` | 도움말 버튼 |
| floating-compact-header.tsx:173 | `hover:bg-gray-200 dark:hover:bg-gray-800` | 즐겨찾기 버튼 |
| header.tsx:66 | 호버 없음 (Button ghost 기본만) | 즐겨찾기 버튼 |
| header.tsx:81 | `hover:text-foreground` (아이콘에 직접) | 도움말 버튼 |

**로고 호버도 나뉨**:
| 파일 | 호버 방식 |
|---|---|
| search-view.tsx:155 | `group-hover:scale-105` |
| floating-compact-header.tsx:131 | `group-hover:scale-105` |
| header.tsx:46 | `hover:opacity-80` |

홈과 법령뷰어는 같은 패턴(`bg-gray-200` 호버, `scale-105` 로고)을 공유하지만, **검색결과 헤더(header.tsx)만 다른 패턴**을 쓴다. 즐겨찾기 버튼은 커스텀 호버 없이 ghost 기본, 로고는 opacity 변화. 이것은 header.tsx가 별도로 만들어지면서 생긴 편차로 보인다.

---

### 불일치 5: 도구 버튼(pill) vs 전체 디자인 언어

홈 화면 검색바 아래의 도구 바로가기 버튼:
```tsx
// search-view.tsx:242
"rounded-full border border-brand-navy/15 bg-white/60 dark:bg-gray-900/40 backdrop-blur-sm"
```

이 `rounded-full`(완전한 알약 형태)은 프로젝트 전체에서 **유일하게 interactive 요소에 사용**되는 곳이다.
- 다른 모든 버튼: `rounded-md` (Button 컴포넌트 기본)
- 카드: 각짐 또는 `rounded-xl`
- 뱃지: `rounded-md`

**의도 가능성 검토**: 이 도구 버튼들은 검색바 아래에서 **보조 네비게이션 역할**을 하므로, 메인 UI와 시각적으로 구분하기 위해 pill 형태를 채택했을 수 있다. "이건 버튼이 아니라 태그/링크에 가깝다"는 시각적 신호.

**그러나**: 이 버튼들은 실제로 `onClick`으로 영향 추적기, 조례 벤치마킹 등 **무거운 기능을 트리거**한다. pill 형태는 보통 "가벼운 선택"(필터 태그, 칩)을 의미하므로, 기능의 무게감과 시각적 무게감이 불일치한다. feature-cards의 도구 카드(각진, 큰 사이즈)가 같은 기능으로 연결되는데, 이쪽은 "무겁고 격식있게" 표현되어 있다.

---

### 불일치 6: `--brand-navy` 다크모드 값 = `--brand-gold` (확정된 버그)

```css
.dark {
  --brand-navy: 0.72 0.12 65;   /* oklch Gold */
  --brand-gold: 0.72 0.12 65;   /* oklch Gold — 동일! */
  --brand-gold-light: 0.72 0.12 65;  /* 이것도 동일! */
}
```

이전 리포트와 동일한 지적이며, 맥락을 고려해도 **의도일 가능성이 없다**. 세 변수가 완전히 같은 값이다. `text-brand-navy`와 `text-brand-gold`가 다크 모드에서 시각적으로 구분되지 않는다.

**feature-cards.tsx에서의 실제 영향**:
```tsx
// line 139 — 아이콘 색상
"text-brand-navy dark:text-brand-gold"
// line 142 — 제목 색상
"text-brand-navy dark:text-foreground"
```

아이콘은 `brand-gold`로, 제목은 `foreground`로 가서 다크 모드에서도 구분이 된다. 하지만:
```tsx
// line 188 — "시작하기" 텍스트
"text-brand-navy/60 dark:text-brand-gold/60"
```

이런 곳에서 `brand-navy`와 `brand-gold`가 같으면, `dark:` 프리픽스를 쓴 의미가 없어진다.

---

### 불일치 7: Header 컴포넌트가 세 개, 스타일이 각각 다르다

프로젝트에 헤더가 세 개 존재한다:

| 파일 | 사용처 | 배경 | 높이 | max-width | 즐겨찾기 별 | 즐겨찾기 카운트 |
|---|---|---|---|---|---|---|
| `search-view.tsx` 내장 헤더 | 홈 화면 | `bg-content-bg` (불투명) | `h-16 lg:h-20` | `max-w-7xl` | `text-brand-gold` | `<span>` font-semibold |
| `header.tsx` | 검색결과 화면 | `bg-card/50 backdrop-blur-sm` | `h-16` | `max-w-[1280px]` | `text-[var(--color-warning)]` | `<Badge>` secondary |
| `floating-compact-header.tsx` | 법령 뷰어 | `bg-background/95 backdrop-blur-xl` | `h-12 lg:h-16` | `max-w-[1280px]` | `text-brand-gold` | `<Badge>` secondary + 커스텀 |

**높이 계층은 의도적**: 홈(80px) → 검색결과(64px) → 법령뷰어(48-64px)로 점점 컴팩트해지는 것은 "홈은 여유롭게, 작업 중에는 콘텐츠 집중"이라는 합리적 의도다.

**배경도 의도적**: 홈은 불투명(랜딩 느낌), 검색결과/법령뷰어는 반투명+블러(콘텐츠 뒤비침)로 역할이 다르다.

**진짜 문제 1 — 즐겨찾기 별 색상**:
- 홈 + 법령뷰어: `text-brand-gold fill-brand-gold`
- 검색결과: `text-[var(--color-warning)] fill-[var(--color-warning)]`

3곳 중 `header.tsx`만 `--color-warning`을 사용한다. `brand-gold`와 `warning`은 라이트/다크 모드 모두에서 **다른 색상**이다. 같은 즐겨찾기 기능인데 검색결과 화면에서만 별 색이 달라진다.

**진짜 문제 2 — 즐겨찾기 카운트 표시**:
- 홈: `<span className="font-semibold text-gray-800 dark:text-gray-200">` (일반 텍스트)
- 검색결과: `<Badge variant="secondary">` (뱃지)
- 법령뷰어: `<Badge variant="secondary" className="bg-transparent border-brand-navy/20 text-brand-navy">` (커스텀 뱃지)

3곳 모두 다른 방식으로 숫자를 표시한다. 홈만 plain text이고, 검색결과는 기본 Badge, 법령뷰어는 투명 배경 커스텀 Badge다.

**진짜 문제 3 — 테두리 참조 방식**:
- 홈: `border-gray-200 dark:border-gray-800/60` (Tailwind 직접)
- 검색결과 + 법령뷰어: `border-border` (CSS 변수)

같은 "헤더 하단 테두리"인데 홈만 다른 방식을 쓴다.

---

### 불일치 8: `precedent-section`의 색상 표시 인디케이터가 하드코딩

```tsx
// precedent-section.tsx:257-273
<span className="w-1.5 h-1.5 rounded-full bg-blue-500" />     // 법원
<span className="w-1.5 h-1.5 rounded-full bg-purple-500" />   // 사건번호
<span className="w-1.5 h-1.5 rounded-full bg-green-500" />    // 날짜
<span className="w-1.5 h-1.5 rounded-full bg-amber-500" />    // 유형
```

vs

```tsx
// PrecedentDetailPanel:389-444 (같은 파일 아래쪽)
<span className="w-1.5 h-1.5 rounded-full bg-foreground" />   // 판시사항, 판결요지 등
```

같은 파일 내에서 **리스트 아이템**은 `blue/purple/green/amber`(시맨틱 컬러), **상세 패널**은 `foreground`(테마 컬러)를 쓴다.

**의도 가능성**: 리스트에서는 법원/사건번호/날짜를 **색상으로 빠르게 구분**하고, 상세 패널에서는 모든 섹션이 동등하므로 단일 색상. 이건 합리적이다.

**문제점**: 리스트의 색상 인디케이터들이 Tailwind 팔레트(`blue-500`, `purple-500`)를 직접 쓰는데, 이 색상들은 다크 모드에서 **채도와 밝기가 변하지 않는다**. 테마 시스템을 우회하고 있다. 다크 모드에서 이 작은 점들의 대비가 적절한지 검증이 안 되어 있다.

---

## 요약: 진짜 고쳐야 할 것 vs 괜찮은 것

### 확정된 문제 (고쳐야 함)

| # | 내용 | 위치 | 심각도 |
|---|---|---|---|
| 1 | `--brand-navy` = `--brand-gold` = `--brand-gold-light` 동일값 | theme-variables.css:138-140 | Critical |
| 2 | 로고 아이콘 radius/크기/색상 참조가 3곳 모두 다름 | search-view:155, header:48, floating-compact-header:131 | Medium |
| 3 | 즐겨찾기 별 색상 `brand-gold`(홈+뷰어) vs `warning`(검색결과) | header.tsx:67만 다름 | Medium |
| 4 | 즐겨찾기 카운트 표시 방식이 3곳 모두 다름 (span vs Badge vs 커스텀 Badge) | search-view:173, header:68, floating-compact-header:177 | Low-Medium |
| 5 | 다크 카드 배경 `#1a222c`가 `--card`(oklch 0.16)와 거의 동일한데 변수 미사용 | feature-cards.tsx:131,165 | Low |
| 6 | 헤더 테두리 `border-gray-200`(홈) vs `border-border`(나머지 2곳) | search-view:146 vs header:42, floating-compact-header:109 | Low |

### 의도적 차이로 판단 (유지 가능)

| # | 내용 | 의도 |
|---|---|---|
| 1 | 브랜딩 카드(큰 gap) vs 도구 카드(작은 gap) | 카드 크기에 비례 |
| 2 | 헤더 높이 h-20 → h-16 → h-12 (홈→검색→뷰어) | 점진적 컴팩트화 — 콘텐츠 집중 |
| 3 | 홈 각진 카드 vs 판례 둥근 아이템 | 홈(법의 엄격함) vs 콘텐츠(부드러운 탐색) |
| 4 | 호버 easing 차이 (페이지 레벨 vs 마이크로) | 역할별 분리 |
| 5 | Feature 카드 3개 동일 크기 | 핵심 역량 대등 소개 |
| 6 | Duration 범위 (0.2s~2s) | 마이크로 → 루프 점진 스케일 |
| 7 | 헤더 배경 불투명(홈) vs 반투명+블러(작업화면) | 랜딩 vs 앱 컨텍스트 구분 |

### 개선하면 좋지만 급하지 않은 것

| # | 내용 | 이유 |
|---|---|---|
| 1 | `#121620`와 `--content-bg` 관계 정리 | 값이 비슷한데 별도 관리됨 |
| 2 | 판례 인디케이터 색상 테마 대응 | 작은 점이라 영향 미미 |
| 3 | Easing `(0.25,1,0.5,1)` vs `(0.16,1,0.3,1)` 통합 검토 | 차이가 극히 미묘 |
| 4 | `precedent` `rounded-2xl` vs `Card` `rounded-xl` 통일 검토 | 기능적 문제 없음 |
| 5 | 도구 바로가기 pill 형태 재검토 | 기능 무게 vs 시각적 가벼움 |
| 6 | Pretendard 폰트 400(Regular)만 로드, 600/700 미로드 | `font-semibold`/`font-bold`가 73개 파일 182곳에서 사용 중인데 브라우저 합성 볼드에 의존 |
| 7 | 서브타이틀 `dark:text-gray-300` vs 설명 `dark:text-gray-400` 미세 차이 | 의도 가능성 있으나 `text-muted-foreground`와도 다른 값 |

---

*이 문서는 DESIGN_ANALYSIS_REPORT.md와 DESIGN_IMPROVEMENT_PLAN.md의 과도한 지적을 정정하며, 실제 코드 맥락에 기반한 정밀 감사 결과입니다.*
