# 다음 작업 계획 (2025-11-24)

**작성일**: 2025-11-23 23:30 KST
**현재 상태**: Phase 1 + Phase 2 완료
**다음 작업**: Phase 3 - Revision History Hook 분리

---

## ✅ 완료된 작업

### Phase 1: Admin Rules Hook 분리
- **파일**: `hooks/use-law-viewer-admin-rules.ts` (171줄)
- **감소**: 약 140줄
- **커밋**: ✅ 완료
- **검증**: ✅ 빌드 성공, 동작 확인

### Phase 2: Three-Tier Hook 분리
- **파일**: `hooks/use-law-viewer-three-tier.ts` (147줄)
- **감소**: 228줄 (6.2%↓)
- **커밋**: `88225b7` ✅ 완료
- **검증**: ✅ 빌드 성공

### 현재 파일 크기
- **law-viewer.tsx**: **3,459줄** (시작: 4,040줄)
- **누적 감소**: **581줄 (14.4%↓)**

---

## 🎯 다음 작업: Phase 3 - Revision History Hook 분리

### 목표
- **law-viewer.tsx**: 3,459 → ~3,310줄 (약 150줄 감소 예상)
- **소요 시간**: 30-45분
- **리스크**: 낮음 (5%)

### 분리 대상

#### 1. State (2개)
```typescript
const [revisionHistory, setRevisionHistory] = useState<any[]>([])
const [isLoadingHistory, setIsLoadingHistory] = useState(false)
```

#### 2. 함수 (1개)
```typescript
const fetchRevisionHistory = async (jo: string) => {
  if (!meta.lawId || !jo) return

  setIsLoadingHistory(true)
  try {
    const params = new URLSearchParams()
    params.append("lawId", meta.lawId)
    params.append("jo", jo)

    const response = await fetch(`/api/article-history?${params.toString()}`)
    if (!response.ok) {
      // Handle error
      return
    }

    const xmlText = await response.text()
    const parsedHistory = parseArticleHistoryXML(xmlText)
    setRevisionHistory(parsedHistory || [])
  } catch (error) {
    // Handle error
  } finally {
    setIsLoadingHistory(false)
  }
}
```

#### 3. useEffect (1개)
```typescript
// Fetch revision history when article changes
useEffect(() => {
  if (!meta.lawId || !activeJo || isOrdinance) {
    setRevisionHistory([])
    return
  }

  fetchRevisionHistory(activeJo)
}, [meta.lawId, activeJo, isOrdinance])
```

**예상 코드 라인**: 약 50-60줄 (함수 본문) + state 선언 + useEffect

### 작업 단계

#### Step 1: 새 파일 생성
**파일**: `hooks/use-law-viewer-revision-history.ts`

```typescript
import { useState, useEffect } from 'react'
import type { LawMeta } from '@/lib/law-types'
import { parseArticleHistoryXML } from '@/lib/revision-parser'
import { debugLogger } from '@/lib/debug-logger'

export function useLawViewerRevisionHistory(
  meta: LawMeta,
  activeJo: string,
  isOrdinance: boolean
) {
  const [revisionHistory, setRevisionHistory] = useState<any[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  const fetchRevisionHistory = async (jo: string) => {
    if (!meta.lawId || !jo) return

    setIsLoadingHistory(true)
    try {
      const params = new URLSearchParams()
      params.append("lawId", meta.lawId)
      params.append("jo", jo)

      debugLogger.info("개정이력 조회 시작", { lawId: meta.lawId, jo })
      const response = await fetch(`/api/article-history?${params.toString()}`)

      if (!response.ok) {
        debugLogger.warn("개정이력 API 오류", { status: response.status })
        setRevisionHistory([])
        return
      }

      const xmlText = await response.text()
      const parsedHistory = parseArticleHistoryXML(xmlText)

      if (!parsedHistory) {
        debugLogger.warn("개정이력 파싱 실패")
        setRevisionHistory([])
        return
      }

      debugLogger.success("개정이력 조회 완료", { count: parsedHistory.length })
      setRevisionHistory(parsedHistory)
    } catch (error) {
      debugLogger.error("개정이력 조회 실패", error)
      setRevisionHistory([])
    } finally {
      setIsLoadingHistory(false)
    }
  }

  // Fetch revision history when article changes
  useEffect(() => {
    if (!meta.lawId || !activeJo || isOrdinance) {
      setRevisionHistory([])
      return
    }

    fetchRevisionHistory(activeJo)
  }, [meta.lawId, activeJo, isOrdinance])

  return {
    revisionHistory,
    isLoadingHistory,
    fetchRevisionHistory, // Export for manual refresh if needed
  }
}
```

#### Step 2: law-viewer.tsx 수정

**제거할 코드**:
```typescript
// Line ~117-118
const [revisionHistory, setRevisionHistory] = useState<any[]>([])
const [isLoadingHistory, setIsLoadingHistory] = useState(false)

// Line ~265-310 (약 45줄)
const fetchRevisionHistory = async (jo: string) => {
  // ... 전체 함수 본문
}

// Fetch revision history when article or law changes
useEffect(() => {
  if (!meta.lawId || !activeJo || isOrdinance) {
    setRevisionHistory([])
    return
  }

  fetchRevisionHistory(activeJo)
}, [meta.lawId, activeJo, isOrdinance])
```

**추가할 코드** (Hook 호출 위치: activeArticle 정의 직후):
```typescript
// Revision History hook
const {
  revisionHistory,
  isLoadingHistory,
  fetchRevisionHistory,
} = useLawViewerRevisionHistory(meta, activeJo, isOrdinance)
```

#### Step 3: Import 추가
```typescript
import { useLawViewerRevisionHistory } from "@/hooks/use-law-viewer-revision-history"
```

### 검증 체크리스트
- [ ] 조문 선택 시 개정이력 자동 로드
- [ ] 조례는 개정이력 표시 안 함 (isOrdinance 체크)
- [ ] 로딩 상태 표시
- [ ] 에러 핸들링 동작
- [ ] 빌드 성공
- [ ] 타입 에러 없음

---

## 📋 Phase 4 이후 계획

### Phase 4: handleArticleClick 함수 분리 (중간 난이도)
**예상 감소**: 약 100-150줄

**분리 대상**:
- `handleArticleClick` 함수 (약 80줄)
- 관련 state: `loadingJo`, `loadedArticles`
- Scroll 관련 로직

**새 파일**: `hooks/use-law-viewer-article-navigation.ts`

### Phase 5: handleContentClick 함수 분리 (복잡)
**예상 감소**: 약 300-400줄

**분리 대상**:
- `handleContentClick` 함수 (약 350줄) - **가장 큰 함수**
- Link click handling
- Admin rule links
- Delegation links
- External law links

**새 파일**: `hooks/use-law-viewer-link-handler.ts`

**리스크**: 높음 (15-20%)
- 많은 state 의존성
- 복잡한 조건 분기
- 다양한 링크 타입 처리

### Phase 6: Swipe 관련 분리 (안전)
**예상 감소**: 약 50-80줄

**분리 대상**:
- Swipe hint state
- Swipe handlers

**새 파일**: `hooks/use-law-viewer-swipe.ts` (또는 기존 `use-swipe.ts` 통합)

---

## 🎯 최종 목표 (Phase 3-6 완료 후)

| Phase | law-viewer.tsx | 감소 | 누적 감소 | 상태 |
|-------|----------------|------|-----------|------|
| **시작** | 4,040줄 | - | - | - |
| Phase 1 ✅ | ~3,900줄 | 140줄↓ | 3.5%↓ | 완료 |
| Phase 2 ✅ | 3,459줄 | 441줄↓ | 10.9%↓ | 완료 |
| **Phase 3** | ~3,310줄 | 150줄↓ | 18.1%↓ | 다음 |
| Phase 4 | ~3,160줄 | 150줄↓ | 21.8%↓ | 대기 |
| Phase 5 | ~2,760줄 | 400줄↓ | 31.7%↓ | 대기 |
| Phase 6 | ~2,680줄 | 80줄↓ | 33.7%↓ | 대기 |

**Phase 6 완료 시**: **약 2,680줄 (33.7%↓)** → 여전히 Claude가 읽을 수 없음 (목표: 1,500줄)

### 추가 작업 필요
Phase 6 이후에도 **약 1,180줄 더 감소** 필요:
- UI 컴포넌트 분리 (가장 큰 효과)
- Helper 함수 분리
- Constants 분리

---

## ⚠️ 주의 사항

### Hook 분리 시 반드시 확인
1. **의존성 배열**: useEffect의 모든 의존성 명시
2. **타입 안전성**: TypeScript 에러 0개
3. **기존 동작 보존**: 100% 동일한 동작
4. **빌드 성공**: `npm run build` 통과
5. **Linter 통과**: 경고 없음 (힌트는 OK)

### 각 Phase 완료 후
1. ✅ 빌드 테스트
2. ✅ 동작 확인 (주요 기능 테스트)
3. ✅ 커밋 (상세한 메시지)
4. ✅ 다음 Phase로 진행

### 롤백 방법
```bash
# 최근 커밋 취소
git revert HEAD

# 특정 Phase 롤백
git log --oneline --grep="Phase"
git revert <commit-hash>

# 빌드 확인
npm run build
```

---

## 📚 참고 문서

- **리팩토링 계획**: `docs/REFACTORING_PLAN_V3.md`
- **삭제된 코드 아카이브**: `docs/deleted-code-archive.md`
- **JSON 파싱 플로우**: `important-docs/JSON_TO_HTML_FLOW.md`

---

**최종 업데이트**: 2025-11-23 23:30 KST
**다음 작업자**: Phase 3부터 시작
**예상 소요**: 30-45분 (Phase 3만)
