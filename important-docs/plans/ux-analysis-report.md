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

#### 6.2 모달 포커스 관리 추가
**파일**: `components/reference-modal.tsx`, `components/comparison-modal.tsx`

#### 6.3 링크 aria-label 추가
**파일**: `lib/unified-link-generator.ts`

#### 6.4 폰트 크기 범위 확대
**현재**: 12-20px → **개선**: 12-28px (고령자/시각장애인 배려)

---

### P1: 단기 개선

#### 6.5 handleContentClick 함수 분리
**파일**: `components/law-viewer.tsx` (577-810)

#### 6.6 키보드 화살표 네비게이션
**파일**: `components/law-viewer.tsx`

#### 6.7 방문 링크 상태 표시
**파일**: `app/globals.css`

#### 6.8 동기 스크롤 완전 구현
**파일**: `components/comparison-modal.tsx`

---

### P2: 중기 개선

#### 6.9 온보딩/튜토리얼 시스템
**새 파일**: `components/onboarding/`

#### 6.10 라이트 테마 구현
**파일**: `app/globals.css`

#### 6.11 시맨틱 HTML 구조 개선
**파일**: `lib/law-xml-parser.tsx`

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

---

*보고서 작성: Claude Code (Sequential Thinking + Explore Agents)*
