# 다음 작업 계획 (2025-11-24)

**작성일**: 2025-11-23 23:45 KST
**현재 상태**: Phase 1 + Phase 2 완료
**다음 작업**: **UI 컴포넌트 분리 (최우선)** → Hook 분리보다 효과적

---

## ✅ 완료된 작업

### Phase 1: Admin Rules Hook 분리
- **파일**: `hooks/use-law-viewer-admin-rules.ts` (171줄)
- **감소**: 약 140줄
- **커밋**: ✅ 완료

### Phase 2: Three-Tier Hook 분리
- **파일**: `hooks/use-law-viewer-three-tier.ts` (147줄)
- **감소**: 228줄 (6.2%↓)
- **커밋**: `88225b7` ✅ 완료

### 현재 파일 크기
- **law-viewer.tsx**: **3,459줄** (시작: 4,040줄)
- **누적 감소**: **581줄 (14.4%↓)**
- **문제**: 여전히 Claude가 읽을 수 없음 (목표: 1,500줄)

---

## 🎯 새로운 전략: UI 컴포넌트 분리 우선

### ⚠️ 왜 전략을 바꿨나?

**Hook 분리의 한계**:
- Phase 3-6을 모두 완료해도 **2,680줄** (33.7%↓)
- 여전히 **1,180줄 초과** → Claude가 읽을 수 없음
- 가장 큰 부분(JSX, 약 2,000줄)은 그대로 남음

**UI 컴포넌트 분리의 장점**:
- ✅ **가장 큰 효과**: 한 번에 500-1,000줄 감소
- ✅ **더 쉬움**: JSX 블록만 복사-붙여넣기
- ✅ **리스크 낮음**: Props만 전달, 로직 변경 없음
- ✅ **점진적 가능**: 한 컴포넌트씩 독립적으로 분리

---

## 🚀 Phase UI-1: AI 답변 뷰 분리 (가장 쉽고 독립적)

### 목표
- **law-viewer.tsx**: 3,459 → ~3,150줄 (**300줄 감소**)
- **소요 시간**: 1시간
- **리스크**: 매우 낮음 (3%)

### 왜 이것부터?
1. ✅ **완전 독립적**: `aiAnswerMode`일 때만 렌더링
2. ✅ **다른 부분과 충돌 없음**: 조건부 렌더링으로 분리됨
3. ✅ **Props 간단**: 약 10-15개만 전달
4. ✅ **테스트 쉬움**: AI 모드 켜면 바로 확인

### 분리 대상 JSX

#### 위치
- **데스크톱**: 라인 ~708-950 (AI 답변 + 관련 법령 목록)
- **모바일**: 라인 ~2050-2200 (AI 답변 탭)

#### 예상 Props
```typescript
interface AIAnswerViewProps {
  // Data
  aiAnswerHTML: string
  relatedArticles: ParsedRelatedLaw[]
  aiCitations: VerifiedCitation[]
  userQuery: string
  aiConfidenceLevel: 'high' | 'medium' | 'low'
  fileSearchFailed: boolean

  // Handlers
  onRelatedArticleClick: (lawName: string, jo: string, article: string) => void

  // Meta
  meta: LawMeta
}
```

### 작업 단계

#### Step 1: 새 파일 생성
**파일**: `components/law-viewer-ai-answer.tsx`

```typescript
"use client"

import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, Sparkles, ShieldCheck } from "lucide-react"
import type { LawMeta } from "@/lib/law-types"
import type { ParsedRelatedLaw } from "@/lib/law-parser"
import type { VerifiedCitation } from '@/lib/citation-verifier'

interface AIAnswerViewProps {
  aiAnswerHTML: string
  relatedArticles: ParsedRelatedLaw[]
  aiCitations: VerifiedCitation[]
  userQuery: string
  aiConfidenceLevel: 'high' | 'medium' | 'low'
  fileSearchFailed: boolean
  onRelatedArticleClick: (lawName: string, jo: string, article: string) => void
  meta: LawMeta
}

export function AIAnswerView({
  aiAnswerHTML,
  relatedArticles,
  aiCitations,
  userQuery,
  aiConfidenceLevel,
  fileSearchFailed,
  onRelatedArticleClick,
  meta,
}: AIAnswerViewProps) {
  return (
    <>
      {/* Desktop view */}
      <Card className="hidden lg:flex p-4 flex-col overflow-hidden">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="text-base font-bold">AI 답변</h3>
          {/* Confidence badge */}
          {aiConfidenceLevel === 'high' && (
            <Badge variant="default" className="text-xs">
              <ShieldCheck className="h-3 w-3 mr-1" />
              신뢰도 높음
            </Badge>
          )}
          {/* ... medium, low badges */}
        </div>

        {/* AI Answer content */}
        <ScrollArea className="flex-1">
          {/* Copy JSX from law-viewer.tsx */}
          {/* ... */}
        </ScrollArea>

        {/* Related articles list */}
        {/* Copy JSX from law-viewer.tsx */}
        {/* ... */}
      </Card>

      {/* Mobile view - 필요시 추가 */}
    </>
  )
}
```

#### Step 2: law-viewer.tsx 수정

**제거할 코드** (라인 ~708-950):
```typescript
{aiAnswerMode ? (
  // ========== AI 모드: 왼쪽은 관련 법령 목록 ==========
  <>
    <div className="flex items-center gap-2 mb-3">
      <Sparkles className="h-5 w-5 text-primary" />
      <h3 className="text-base font-bold">AI 답변</h3>
      {/* ... 300줄 정도의 JSX */}
    </div>
  </>
) : (
  // 기존 조문 목록
)}
```

**대체 코드**:
```typescript
{aiAnswerMode ? (
  <AIAnswerView
    aiAnswerHTML={aiAnswerHTML}
    relatedArticles={relatedArticles}
    aiCitations={aiCitations}
    userQuery={userQuery}
    aiConfidenceLevel={aiConfidenceLevel}
    fileSearchFailed={fileSearchFailed}
    onRelatedArticleClick={onRelatedArticleClick}
    meta={meta}
  />
) : (
  // 기존 조문 목록
)}
```

#### Step 3: Import 추가
```typescript
import { AIAnswerView } from "@/components/law-viewer-ai-answer"
```

### 검증 체크리스트
- [ ] AI 모드 켜기 → AI 답변 표시
- [ ] 신뢰도 배지 표시
- [ ] 관련 법령 목록 클릭 동작
- [ ] 인용 법령 링크 클릭 동작
- [ ] 스크롤 정상 동작
- [ ] 빌드 성공
- [ ] 타입 에러 없음

---

## 📋 Phase UI-2: 2단/3단 위임법령 패널 분리

### 목표
- **law-viewer.tsx**: ~3,150 → ~2,750줄 (**400줄 감소**)
- **소요 시간**: 1.5시간
- **리스크**: 낮음 (5%)

### 분리 대상
- 2단 뷰 패널 전체 (시행령/시행규칙/행정규칙 탭)
- 데스크톱 + 모바일 버전

### 새 파일
- `components/law-viewer-delegation-panel.tsx`

### Props
- Three-Tier Hook의 모든 반환값
- Admin Rules Hook의 반환값
- 핸들러들

**예상 효과**: Three-Tier Hook이 이미 있어서 Props 전달 간단함

---

## 📋 Phase UI-3: 조문 목록 사이드바 분리

### 목표
- **law-viewer.tsx**: ~2,750 → ~2,450줄 (**300줄 감소**)
- **소요 시간**: 1시간
- **리스크**: 낮음 (5%)

### 분리 대상
- 좌측 조문 목록 전체 (데스크톱 + 모바일)
- VirtualizedArticleList 래퍼

### 새 파일
- `components/law-viewer-article-sidebar.tsx`

---

## 📋 Phase UI-4: 메인 조문 내용 패널 분리

### 목표
- **law-viewer.tsx**: ~2,450 → ~2,050줄 (**400줄 감소**)
- **소요 시간**: 1.5시간
- **리스크**: 중간 (10%)

### 분리 대상
- 중앙 메인 패널 (조문 내용 표시)
- VirtualizedFullArticleView 래퍼
- 개정이력 표시

### 새 파일
- `components/law-viewer-main-content.tsx`

---

## 🎯 UI 분리 완료 후 예상 결과

| Phase | law-viewer.tsx | 감소 | 누적 감소 | 읽기 가능 |
|-------|----------------|------|-----------|-----------|
| **시작** | 4,040줄 | - | - | ❌ |
| Phase 1-2 ✅ | 3,459줄 | 581줄↓ | 14.4%↓ | ❌ |
| **UI-1** (AI 뷰) | ~3,150줄 | 300줄↓ | 22.0%↓ | ❌ |
| **UI-2** (위임법령) | ~2,750줄 | 400줄↓ | 31.9%↓ | ❌ |
| **UI-3** (조문 목록) | ~2,450줄 | 300줄↓ | 39.4%↓ | ⚠️ 거의 |
| **UI-4** (메인 패널) | ~2,050줄 | 400줄↓ | 49.3%↓ | ⚠️ 거의 |

**UI-4 완료 시**: **약 2,050줄** → 아직 부족 (목표: 1,500줄)

### 추가 작업 (UI-4 이후)
- **모달 렌더링 분리** (~200줄)
- **공통 헤더/버튼 그룹** (~150줄)
- **나머지 Helper 함수** (~200줄)

**최종 예상**: **~1,500줄** → ✅ **Claude가 읽을 수 있음!**

---

## 💡 왜 UI 분리가 더 쉬운가?

### Hook 분리 vs UI 분리 비교

| 항목 | Hook 분리 | UI 분리 |
|-----|-----------|---------|
| **난이도** | 중간-높음 | 낮음 |
| **작업 내용** | 로직 이해 + state 의존성 분석 | JSX 블록 복사 + Props 타입 정의 |
| **타입 에러** | useEffect 의존성 누락 위험 | Props만 맞추면 됨 |
| **효과** | 100-400줄/Phase | 300-500줄/Phase |
| **리스크** | state 동기화 문제 | 거의 없음 (렌더링만) |
| **롤백** | Hook 제거 + 코드 복원 | 컴포넌트 삭제 + JSX 복원 |

### UI 분리의 장점
1. ✅ **IDE가 대부분 해결**: Props 타입 자동 완성
2. ✅ **독립적**: 한 컴포넌트씩 분리 가능
3. ✅ **테스트 쉬움**: 화면 보고 바로 확인
4. ✅ **더 큰 효과**: 한 번에 300-500줄 감소

---

## ⚠️ 주의 사항

### UI 컴포넌트 분리 시 체크리스트
1. **Props 타입 정확히**: TypeScript 에러 0개
2. **이벤트 핸들러 전달**: onClick, onChange 등
3. **ref 전달 필요시**: forwardRef 사용
4. **조건부 렌더링 유지**: 기존 조건 그대로
5. **빌드 성공**: `npm run build` 통과

### 각 Phase 완료 후
1. ✅ 빌드 테스트
2. ✅ 화면에서 동작 확인
3. ✅ 커밋 (상세한 메시지)
4. ✅ 다음 Phase로 진행

---

## 📚 참고 문서

- **리팩토링 계획**: `docs/REFACTORING_PLAN_V3.md`
- **삭제된 코드 아카이브**: `docs/deleted-code-archive.md`

---

## 🔄 대안: Hook 분리 계속 진행

만약 UI 분리가 어렵다면 기존 계획대로 진행:

### Phase 3: Revision History Hook
- 약 150줄 감소
- 30-45분 소요
- 상세 계획은 이전 버전 참조

하지만 **UI 분리를 강력히 권장**합니다:
- 더 큰 효과
- 더 쉬움
- 목표 달성 가능

---

**최종 업데이트**: 2025-11-23 23:45 KST
**다음 작업**: Phase UI-1 (AI 답변 뷰 분리)
**예상 소요**: 1시간
**핵심 메시지**: **Hook보다 UI 먼저!**
