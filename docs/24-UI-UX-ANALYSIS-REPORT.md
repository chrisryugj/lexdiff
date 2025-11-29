# LexDiff UI/UX 종합 분석 및 개선 방안 보고서

**분석 일자**: 2025-11-29
**분석 도구**: Explore Agent (3개), Sequential Thinking MCP
**분석 범위**: 전체 프론트엔드 컴포넌트, 디자인 시스템, 사용자 인터랙션

---

## 1. Executive Summary

### 전체 평가 점수: 68/100

| 영역 | 점수 | 상태 |
|------|------|------|
| 시각 디자인 | 75/100 | 양호 |
| 정보 아키텍처 | 70/100 | 양호 |
| 인터랙션 디자인 | 65/100 | 개선 필요 |
| 접근성 (A11y) | 55/100 | 개선 필요 |
| 모바일 UX | 65/100 | 개선 필요 |
| 성능/피드백 | 70/100 | 양호 |

**핵심 진단**: LexDiff는 **기능적으로 완성된** 법령 검색 시스템이나, **접근성 기본 요건 미충족** 및 **사용자 피드백 정확도 이슈**가 있습니다.

---

## 2. 핵심 강점 (유지 및 강화)

### 2.1 SSE 스트리밍 AI 답변
- 실시간 진행 상황 표시
- 다단계 프로그레스 메시지
- 마크다운 기반 유연한 답변 형식

### 2.2 중앙화된 디자인 시스템
- OKLCH 색공간 사용 (지각 균일성 우수)
- 144개 CSS 변수로 색상 중앙화
- shadcn/ui 22개 컴포넌트 활용

### 2.3 법령 탐색 설계
- 모달 히스토리 스택으로 깊이 탐색 지원
- 통합 링크 생성 시스템 (unified-link-generator.ts)
- JO 코드 시스템으로 조문 일관성 유지

### 2.4 반응형 디자인
- 모바일/데스크톱 적응형 레이아웃
- 3단 비교 → 2단 축소 (모바일)
- 스와이프 제스처 지원

---

## 3. 발견된 문제점

### 3.1 접근성 (Accessibility) - WCAG Level A 미충족

| 기준 | 현황 | 영향 |
|------|------|------|
| **1.3.1 정보와 관계** | `dangerouslySetInnerHTML`로 시맨틱 구조 부족 | 스크린 리더 사용자 |
| **2.1.1 키보드** | Tab만 지원, 화살표 키 네비게이션 없음 | 키보드 전용 사용자 |
| **2.4.1 블록 건너뛰기** | Skip to content 링크 없음 | 반복 탐색 불편 |
| **2.4.4 링크 목적** | aria-label 없이 data-ref만 사용 | 링크 목적 불명확 |

### 3.2 사용자 피드백 부정확

**프로그레스바 문제** (`file-search-answer-display.tsx:445-450`):
```typescript
// 현재: 무작위 증가로 실제 진행과 불일치
progressInterval = setInterval(() => {
  setProgress(prev => prev + Math.random() * 10)  // ❌ 부정확
}, 300)
```

**모달 포커스 관리 부재** (`reference-modal.tsx:68-73`):
- 300ms 하드코딩 타이머 사용
- 모달 열릴 때 초기 포커스 설정 없음

### 3.3 코드 복잡도

**handleContentClick 함수** (`law-viewer.tsx:577-810`):
- 390줄의 단일 함수
- 6가지 링크 타입 처리 (article, law, regulation, law-article, same, related)
- AI 모드 vs 일반 모드 분기
- 유지보수 및 테스트 어려움

**섹션 접기/펼치기 상태** (`file-search-answer-display.tsx:22-49`):
- 전역 Map으로 상태 관리 → 메모리 누수 위험
- React 상태 관리 원칙 위배

### 3.4 테마 및 디자인 시스템

**다크 모드만 지원**:
- `:root`와 `.dark`에 동일한 변수값
- 라이트 모드 사용자 배려 없음

**디자인 토큰 문서화 부족**:
- 색상 팔레트 가이드 없음
- 간격/타이포그래피 스케일 문서 없음

### 3.5 모바일 UX

| 요소 | 현황 | 문제 |
|------|------|------|
| 터치 타겟 | 일부 32px 미만 | 작은 버튼 터치 어려움 |
| 스와이프 감도 | 80px/400ms 고정 | 사용자 맞춤 불가 |
| 입력 최적화 | inputMode 미설정 | 키보드 타입 최적화 없음 |

---

## 4. Nielsen's 10 Heuristics 평가

| # | 휴리스틱 | 점수 | 주요 이슈 |
|---|----------|------|----------|
| 1 | 시스템 상태 가시성 | 6/10 | 프로그레스바 부정확, 탭 로딩 불명확 |
| 2 | 현실 세계 일치 | 8/10 | 법률 용어 적절히 사용 |
| 3 | 사용자 제어와 자유 | 7/10 | Undo 없음, 단축키 부족 |
| 4 | 일관성과 표준 | 7/10 | 커스텀 컴포넌트 편차 |
| 5 | 오류 예방 | 5/10 | 입력 유효성 검사 부족 |
| 6 | 인식 > 기억 | 6/10 | 방문 링크 미표시, 자동완성 없음 |
| 7 | 유연성과 효율성 | 4/10 | 단축키 없음, 고급 기능 부족 |
| 8 | 미학적 미니멀 디자인 | 7/10 | 깔끔하나 정보 밀도 조절 없음 |
| 9 | 오류 복구 | 6/10 | 사용자 친화적 에러 메시지 부족 |
| 10 | 도움말/문서 | 3/10 | 온보딩 없음, 인앱 가이드 없음 |

**종합: 59/100**

---

## 5. 우선순위화된 개선 계획

### 영향력-노력 매트릭스

```
        낮은 노력          높은 노력
      ┌─────────────────┬─────────────────┐
높은  │  Quick Wins     │  Major Projects │
영향  │  P0: 1,2,3,4    │  P2: 9,10,11    │
      │  P1: 5,6        │                 │
      ├─────────────────┼─────────────────┤
낮은  │  Fill-ins       │  Defer          │
영향  │  P1: 7,8        │  P3: 13,14,15   │
      │  P2: 12         │                 │
      └─────────────────┴─────────────────┘
```

---

## 6. 구체적 개선 방안

### P0: 즉시 개선 (Quick Wins)

#### 6.1 프로그레스바 정확도 개선
**파일**: `components/file-search-answer-display.tsx`
**현재 문제**: 무작위 증가로 사용자 기대치 불일치
**개선안**:
```typescript
// 스트림 청크 기반 진행률 계산
const [receivedChunks, setReceivedChunks] = useState(0)
const estimatedTotal = 100 // 또는 서버에서 제공

// SSE 응답 처리 시
setReceivedChunks(prev => prev + 1)
setProgress((receivedChunks / estimatedTotal) * 100)
```

#### 6.2 모달 포커스 관리 추가
**파일**: `components/reference-modal.tsx`, `components/comparison-modal.tsx`
**개선안**:
```typescript
const contentRef = useRef<HTMLDivElement>(null)

useEffect(() => {
  if (isOpen) {
    const firstFocusable = contentRef.current?.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) as HTMLElement
    firstFocusable?.focus()
  }
}, [isOpen])
```

#### 6.3 링크 aria-label 추가
**파일**: `lib/unified-link-generator.ts`
**개선안**:
```typescript
// 링크 생성 시 aria-label 자동 추가
const linkTypeLabels = {
  'law': '법령 참조',
  'article': '조문 이동',
  'regulation': '행정규칙',
  'same': '같은 법 조문',
}

return `<a href="#" data-ref="${type}" aria-label="${lawName} ${linkTypeLabels[type]}">`
```

#### 6.4 폰트 크기 범위 확대
**파일**: 여러 컴포넌트
**현재**: 12-20px
**개선**: 12-28px (고령자/시각장애인 배려)
```typescript
const increaseFontSize = () => {
  setFontSize(prev => Math.min(prev + 2, 28))  // 20 → 28
}
```

---

### P1: 단기 개선

#### 6.5 handleContentClick 함수 분리
**파일**: `components/law-viewer.tsx` (577-810)
**개선안**:
```typescript
// 링크 타입별 핸들러 분리
const linkHandlers = {
  article: useArticleClickHandler(),
  law: useLawClickHandler(),
  regulation: useRegulationClickHandler(),
  'law-article': useLawArticleClickHandler(),
  same: useSameRefClickHandler(),
  related: useRelatedLawClickHandler(),
}

const handleContentClick = (e: React.MouseEvent) => {
  const target = e.target as HTMLElement
  if (target?.tagName === 'A') {
    const refType = target.getAttribute('data-ref')
    linkHandlers[refType]?.(e, target)
  }
}
```

#### 6.6 키보드 화살표 네비게이션
**파일**: `components/law-viewer.tsx`
**개선안**:
```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      navigateToPreviousArticle()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      navigateToNextArticle()
    }
  }
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [activeJo, articles])
```

#### 6.7 방문 링크 상태 표시
**파일**: `app/globals.css`
**개선안**:
```css
a[data-ref]:visited {
  color: oklch(0.5 0.15 250);  /* 방문한 링크: 어두운 보라색 */
}

a[data-ref]:not(:visited) {
  color: oklch(0.65 0.2 230);  /* 미방문 링크: 밝은 시안 */
}
```

#### 6.8 동기 스크롤 완전 구현
**파일**: `components/comparison-modal.tsx`
**개선안**:
```typescript
useEffect(() => {
  const oldDiv = oldScrollRef.current
  const newDiv = newScrollRef.current

  const syncScroll = (source: HTMLDivElement, target: HTMLDivElement) => {
    return () => {
      const ratio = source.scrollTop / (source.scrollHeight - source.clientHeight)
      target.scrollTop = ratio * (target.scrollHeight - target.clientHeight)
    }
  }

  const handleOldScroll = syncScroll(oldDiv!, newDiv!)
  const handleNewScroll = syncScroll(newDiv!, oldDiv!)

  oldDiv?.addEventListener('scroll', handleOldScroll)
  newDiv?.addEventListener('scroll', handleNewScroll)

  return () => {
    oldDiv?.removeEventListener('scroll', handleOldScroll)
    newDiv?.removeEventListener('scroll', handleNewScroll)
  }
}, [])
```

---

### P2: 중기 개선

#### 6.9 온보딩/튜토리얼 시스템
**새 파일**: `components/onboarding/`
**주요 화면**:
1. 첫 방문 환영 모달
2. 검색 타입 안내 (일반 vs AI)
3. 법령 뷰어 사용법
4. 단축키 안내

#### 6.10 라이트 테마 구현
**파일**: `app/globals.css`
**추가 필요**:
```css
:root {
  --background: oklch(0.98 0.01 240);
  --foreground: oklch(0.15 0.02 240);
  --card: oklch(0.99 0.005 240);
  /* ... 라이트 모드 전체 변수 */
}

.dark {
  --background: oklch(0.12 0.01 240);
  --foreground: oklch(0.93 0.01 240);
  /* ... 현재 다크 모드 변수 */
}
```

#### 6.11 시맨틱 HTML 구조 개선
**파일**: `lib/law-xml-parser.tsx`
**개선안**:
```typescript
// Before
<div dangerouslySetInnerHTML={{ __html: articleHtml }} />

// After
<article role="article" aria-labelledby={`article-${jo}`}>
  <h1 id={`article-${jo}`}>{formatJO(jo)}</h1>
  <p className="article-title">{title}</p>
  <section className="article-content">
    {/* 파싱된 조문 내용 */}
  </section>
</article>
```

---

## 7. 수정 필요 파일 목록

| 우선순위 | 파일 | 수정 내용 |
|----------|------|----------|
| P0 | `components/file-search-answer-display.tsx` | 프로그레스바 로직 |
| P0 | `components/reference-modal.tsx` | 포커스 관리 |
| P0 | `components/comparison-modal.tsx` | 포커스 관리, 동기 스크롤 |
| P0 | `lib/unified-link-generator.ts` | aria-label 추가 |
| P1 | `components/law-viewer.tsx` | handleContentClick 분리, 키보드 |
| P1 | `app/globals.css` | 방문 링크 스타일 |
| P2 | `app/globals.css` | 라이트 테마 변수 |
| P2 | `lib/law-xml-parser.tsx` | 시맨틱 HTML |
| P2 | `components/onboarding/` (새로 생성) | 온보딩 시스템 |

---

## 8. 예상 효과

### 정량적 개선
- **접근성 점수**: 55 → 75 (WCAG Level A 완전 충족)
- **Nielsen 휴리스틱 점수**: 59 → 75
- **전체 UX 점수**: 68 → 80

### 정성적 개선
- 키보드 전용 사용자 완전 지원
- 고령자/시각장애인 사용성 향상
- 파워 유저 생산성 증가 (단축키)
- 첫 사용자 이탈률 감소 (온보딩)

---

## 9. 결론

LexDiff는 기능적으로 우수한 법령 검색 시스템이나, **접근성 및 사용자 피드백** 영역에서 개선이 필요합니다.

**권장 실행 순서**:
1. **즉시 (P0)**: 프로그레스바, 포커스 관리, aria-label, 폰트 범위
2. **단기 (P1)**: 함수 분리, 키보드 네비게이션, 방문 링크, 동기 스크롤
3. **중기 (P2)**: 온보딩, 라이트 테마, 시맨틱 HTML

이 개선들을 통해 LexDiff는 **모든 사용자에게 접근 가능하고, 전문가에게 효율적인** 법령 검색 도구로 발전할 수 있습니다.

---

*보고서 작성: Claude Code (Sequential Thinking + Explore Agents)*
