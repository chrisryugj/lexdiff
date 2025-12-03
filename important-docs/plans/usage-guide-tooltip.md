# 사용법 툴팁 + 상세 도움말 페이지 구현 계획

## 개요

법령검색과 AI검색을 처음 사용하는 사용자를 위한 **2단계 도움말 시스템**을 구현합니다.

1. **간편 툴팁 (Popover)**: 핵심 기능 빠른 안내 + 첫 방문 자동 표시
2. **상세 도움말 페이지**: 모든 기능의 자세한 설명 + 스크린샷/예시

---

## 구현 전략

### 2단계 도움말 시스템

| 구분 | 간편 툴팁 (Popover) | 상세 도움말 (Page) |
|------|---------------------|-------------------|
| 목적 | 빠른 참조, 첫 사용자 안내 | 모든 기능 상세 설명 |
| 위치 | 각 뷰 헤더의 ? 아이콘 | `/help` 페이지 |
| 내용 | 핵심 5-7개 기능 | 전체 기능 + 예시 |
| 자동 표시 | 첫 방문 시 (localStorage) | 수동 접근 |
| 링크 | "자세히 보기" → 상세 페이지 | - |

### UI 컴포넌트

- **Popover**: `@radix-ui/react-popover` (이미 설치됨)
- **상세 페이지**: Next.js App Router (`app/help/page.tsx`)

---

## 구현 단계

### 1단계: Popover 컴포넌트 생성

**파일**: `components/ui/popover.tsx`

```typescript
// Radix UI Popover 래핑 (shadcn/ui 표준)
export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
```

### 2단계: 사용법 안내 Popover 컴포넌트

**파일**: `components/usage-guide-popover.tsx`

```typescript
interface UsageGuidePopoverProps {
  type: 'law-search' | 'ai-search'
  showOnFirstVisit?: boolean  // 첫 방문 자동 표시
}
```

**기능**:
- 첫 방문 감지 (localStorage: `lexdiff-guide-seen-{type}`)
- 핵심 기능 간략 안내
- "자세히 보기" 버튼 → `/help#{type}` 앵커 이동

### 3단계: 상세 도움말 페이지

**파일**: `app/help/page.tsx`

전체 기능을 상세히 설명하는 독립 페이지

### 4단계: 법령 뷰 통합

**파일**: `components/search-result-view.tsx`

헤더에 HelpCircle 아이콘 + Popover 추가

### 5단계: AI 뷰 통합

**파일**: `components/ai-search-view.tsx`

헤더에 HelpCircle 아이콘 + Popover 추가

---

## 간편 툴팁 콘텐츠 (Popover)

### 법령 검색 (law-search)

```
📖 법령 검색 빠른 가이드

🔍 검색: "민법", "관세법 38조"
💡 탐색: 좌측 목록 클릭, Ctrl+K
⭐ 즐겨찾기: 별 아이콘 클릭
📊 비교: 개정 전후 변경 확인
🔗 링크: 참조 법령 바로가기

[자세히 보기 →]
```

### AI 검색 (ai-search)

```
🤖 AI 검색 빠른 가이드

💬 질문: 자연어로 물어보세요
   예) "수출통관 절차는?"
📝 답변: 요약 → 조문 → 실무 적용
🔗 출처: 파란 링크로 원문 확인
⚡ 팁: 법령명 포함 시 더 정확!

[자세히 보기 →]
```

---

## 수정할 파일 목록

| 파일 | 작업 | 우선순위 |
|------|------|----------|
| `components/ui/popover.tsx` | 새로 생성 (shadcn/ui) | 1 |
| `components/usage-guide-popover.tsx` | 새로 생성 | 2 |
| `app/help/page.tsx` | 새로 생성 | 3 |
| `components/search-result-view.tsx` | 법령 뷰 헤더에 추가 | 4 |
| `components/ai-search-view.tsx` | AI 뷰 헤더에 추가 | 5 |

---

## 구현 순서

1. `components/ui/popover.tsx` 생성
2. `components/usage-guide-popover.tsx` 생성 (첫 방문 자동 표시 포함)
3. `app/help/page.tsx` 생성 (상세 도움말)
4. 법령 뷰(`search-result-view.tsx`)에 통합
5. AI 뷰(`ai-search-view.tsx`)에 통합
6. 테스트 및 스타일 조정
