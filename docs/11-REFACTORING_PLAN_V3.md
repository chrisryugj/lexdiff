# 대형 파일 리팩토링 계획 V3 (최종 수정본)

**작성일**: 2025-11-23
**목표**: law-viewer.tsx를 읽을 수 있는 크기로 분리 (25,000 토큰 = 약 1,500줄)
**전략**: 점진적 Hook 분리 (가장 안전한 방법)

---

## 📊 현재 상황

| 항목 | 값 |
|-----|-----|
| **현재 크기** | 4,040줄 |
| **토큰 추정** | ~42,000 토큰 |
| **읽기 가능 여부** | ❌ 불가능 (25,000 토큰 초과) |
| **Phase 0 완료** | ✅ console.log 제거 (527줄↓) |

---

## 🎯 V3 전략: Hook 추출 (Props Drilling 없음)

### 핵심 아이디어

**문제**: 함수 분리 시 Props가 너무 많아짐 (70개 이상)
**해결**: Custom Hook으로 추출 → Props 전달 없이 상태 공유

### 장점
1. ✅ **Props 전달 불필요**: Hook 내부에서 상태 관리
2. ✅ **점진적 분리 가능**: 한 번에 하나씩 Hook 추출
3. ✅ **롤백 쉬움**: Hook import만 제거하면 복원
4. ✅ **리스크 최소**: 로직 변경 없이 위치만 이동

---

## 📋 Phase 1: Admin Rules Hook 분리 (가장 안전)

### 목표
- **law-viewer.tsx**: 4,040 → 3,900줄 (140줄 감소, 3.5%↓)
- **소요 시간**: 30분
- **리스크**: 5% 미만

### 작업 내용

#### 1. 새 파일 생성: `hooks/use-law-viewer-admin-rules.ts`

**분리 대상**:
```typescript
// 1. Admin rules state (8개)
const [showAdminRules, setShowAdminRules] = useState(false)
const [adminRuleViewMode, setAdminRuleViewMode] = useState<"list" | "detail">("list")
const [adminRuleHtml, setAdminRuleHtml] = useState("")
const [adminRuleTitle, setAdminRuleTitle] = useState("")
const [adminRuleContentCache, setAdminRuleContentCache] = useState<Map<string, { title: string; html: string }>>(new Map())
const [adminRuleMobileTab, setAdminRuleMobileTab] = useState<"law" | "adminRule">("law")
const [loadedAdminRulesCount, setLoadedAdminRulesCount] = useState(0)
const [adminRulePanelSize, setAdminRulePanelSize] = useState(50)

// 2. Admin rules hook (useAdminRules)
const {
  adminRules,
  isLoading: loadingAdminRules,
  error: adminRulesError,
  progress: adminRulesProgress
} = useAdminRules(articleNumber)

// 3. Admin rules handler (handleViewAdminRuleFullContent)
const handleViewAdminRuleFullContent = async (rule: AdminRuleMatch) => {
  // ... (약 80줄)
}
```

**새 Hook 구조**:
```typescript
// hooks/use-law-viewer-admin-rules.ts
import { useState } from 'react'
import { useAdminRules, type AdminRuleMatch } from '@/lib/use-admin-rules'

export function useLawViewerAdminRules(articleNumber: string, meta: LawMeta) {
  // All admin rules state
  const [showAdminRules, setShowAdminRules] = useState(false)
  const [adminRuleViewMode, setAdminRuleViewMode] = useState<"list" | "detail">("list")
  const [adminRuleHtml, setAdminRuleHtml] = useState("")
  const [adminRuleTitle, setAdminRuleTitle] = useState("")
  const [adminRuleContentCache, setAdminRuleContentCache] = useState<Map<string, { title: string; html: string }>>(new Map())
  const [adminRuleMobileTab, setAdminRuleMobileTab] = useState<"law" | "adminRule">("law")
  const [loadedAdminRulesCount, setLoadedAdminRulesCount] = useState(0)
  const [adminRulePanelSize, setAdminRulePanelSize] = useState(50)

  // Admin rules data
  const {
    adminRules,
    isLoading: loadingAdminRules,
    error: adminRulesError,
    progress: adminRulesProgress
  } = useAdminRules(articleNumber)

  // Handler
  const handleViewAdminRuleFullContent = async (rule: AdminRuleMatch) => {
    // ... (기존 로직 그대로)
  }

  return {
    // State
    showAdminRules,
    setShowAdminRules,
    adminRuleViewMode,
    setAdminRuleViewMode,
    adminRuleHtml,
    adminRuleTitle,
    adminRuleMobileTab,
    setAdminRuleMobileTab,
    adminRulePanelSize,
    setAdminRulePanelSize,
    loadedAdminRulesCount,

    // Data
    adminRules,
    loadingAdminRules,
    adminRulesError,
    adminRulesProgress,

    // Handlers
    handleViewAdminRuleFullContent,
  }
}
```

#### 2. law-viewer.tsx 수정

**Before** (140줄):
```typescript
const [showAdminRules, setShowAdminRules] = useState(false)
const [adminRuleViewMode, setAdminRuleViewMode] = useState<"list" | "detail">("list")
// ... 8개 state
// ... useAdminRules hook
// ... handleViewAdminRuleFullContent (80줄)
```

**After** (1줄):
```typescript
const {
  showAdminRules,
  setShowAdminRules,
  adminRuleViewMode,
  setAdminRuleViewMode,
  // ... 모든 반환값
  handleViewAdminRuleFullContent,
} = useLawViewerAdminRules(articleNumber, meta)
```

### 검증 체크리스트
- [ ] 행정규칙 버튼 클릭 → 패널 표시
- [ ] 행정규칙 목록 로드
- [ ] 행정규칙 클릭 → 상세 보기
- [ ] 모바일 탭 전환 (법령 ↔ 행정규칙)
- [ ] 패널 크기 조절 (드래그)
- [ ] 빌드 성공

---

## 📋 Phase 2: Modal Hook 분리 (중간 난이도)

### 목표
- **law-viewer.tsx**: 3,900 → 3,500줄 (400줄 감소, 10%↓)
- **소요 시간**: 1시간
- **리스크**: 10%

### 작업 내용

#### 새 파일: `hooks/use-law-viewer-modals.ts`

**분리 대상**:
```typescript
// 1. Modal state (3개)
const [refModal, setRefModal] = useState<{...}>({...})
const [refModalHistory, setRefModalHistory] = useState([])
const [lastExternalRef, setLastExternalRef] = useState<{...} | null>(null)

// 2. Modal handlers (3개 함수, 약 400줄)
async function openExternalLawArticleModal(...) { ... } // 290줄
async function openRelatedLawModal(...) { ... } // 70줄
async function openLawHierarchyModal(...) { ... } // 40줄
```

**Hook 구조**:
```typescript
export function useLawViewerModals(meta: LawMeta, isOrdinance: boolean) {
  const [refModal, setRefModal] = useState(...)
  const [refModalHistory, setRefModalHistory] = useState([])
  const [lastExternalRef, setLastExternalRef] = useState(null)

  // 모든 모달 함수들
  async function openExternalLawArticleModal(...) { ... }
  async function openRelatedLawModal(...) { ... }
  async function openLawHierarchyModal(...) { ... }

  const handleRefModalBack = () => {
    // 히스토리 뒤로가기
  }

  return {
    refModal,
    setRefModal,
    refModalHistory,
    lastExternalRef,
    setLastExternalRef,
    openExternalLawArticleModal,
    openRelatedLawModal,
    openLawHierarchyModal,
    handleRefModalBack,
  }
}
```

---

## 📋 Phase 3: Revision History Hook 분리 (안전)

### 목표
- **law-viewer.tsx**: 3,500 → 3,350줄 (150줄 감소, 4%↓)
- **소요 시간**: 30분
- **리스크**: 5%

### 작업 내용

#### 새 파일: `hooks/use-revision-history.ts`

**분리 대상**:
```typescript
const [revisionHistory, setRevisionHistory] = useState([])
const [isLoadingHistory, setIsLoadingHistory] = useState(false)

// useEffect for revision history (약 150줄)
useEffect(() => {
  // Fetch revision history
}, [activeJo, meta.lawId])
```

---

## 📋 Phase 4: Three-Tier Hook 분리 (안전)

### 목표
- **law-viewer.tsx**: 3,350 → 3,200줄 (150줄 감소, 4%↓)
- **소요 시간**: 30분
- **리스크**: 5%

### 작업 내용

#### 새 파일: `hooks/use-three-tier-data.ts`

**분리 대상**:
```typescript
const [threeTierCitation, setThreeTierCitation] = useState(null)
const [threeTierDelegation, setThreeTierDelegation] = useState(null)
const [tierViewMode, setTierViewMode] = useState<"1-tier" | "2-tier" | "3-tier">("1-tier")
const [isLoadingThreeTier, setIsLoadingThreeTier] = useState(false)
const [delegationActiveTab, setDelegationActiveTab] = useState<"decree" | "rule" | "admin">("decree")
const [delegationPanelSize, setDelegationPanelSize] = useState(50)

// useEffect for three-tier data (약 100줄)
```

---

## 📋 Phase 5: Article Navigation Hook 분리 (복잡)

### 목표
- **law-viewer.tsx**: 3,200 → 2,800줄 (400줄 감소, 13%↓)
- **소요 시간**: 1.5시간
- **리스크**: 15%

### 작업 내용

#### 새 파일: `hooks/use-article-navigation.ts`

**분리 대상**:
```typescript
const [activeJo, setActiveJo] = useState("")
const [loadedArticles, setLoadedArticles] = useState([])

// handleArticleClick (약 100줄)
// Swipe handlers (약 80줄)
// useEffect for selectedJo sync (약 50줄)
```

---

## 📊 최종 목표

| Phase | law-viewer.tsx | 감소 | 누적 감소 | 읽기 가능 |
|-------|----------------|------|-----------|-----------|
| **현재** | 4,040줄 | - | - | ❌ |
| Phase 1 | 3,900줄 | 140줄↓ | 3.5%↓ | ❌ |
| Phase 2 | 3,500줄 | 400줄↓ | 13.4%↓ | ❌ |
| Phase 3 | 3,350줄 | 150줄↓ | 17.1%↓ | ❌ |
| Phase 4 | 3,200줄 | 150줄↓ | 20.8%↓ | ❌ |
| Phase 5 | 2,800줄 | 400줄↓ | 30.7%↓ | ⚠️ 거의 |
| **Phase 6** | **1,500줄** | **1,300줄↓** | **62.9%↓** | ✅ **가능** |

---

## 🔑 핵심 차이점 (V2 vs V3)

| 항목 | V2 (실패) | V3 (권장) |
|-----|----------|------------|
| **접근법** | 함수 분리 | Custom Hook 분리 |
| **Props 개수** | 70개+ (관리 불가) | 0개 (Hook 내부 관리) |
| **파일 읽기** | 필요 (실패) | 불필요 (작은 단위) |
| **리스크** | 높음 (Props 누락) | 낮음 (상태 캡슐화) |
| **롤백** | 어려움 | 쉬움 (import 제거) |
| **테스트** | 마지막에 한번 | 각 단계마다 |

---

## ⚠️ 주의 사항

### 절대 변경 금지
1. **linkifyRefsB 패턴**: [JSON_TO_HTML_FLOW.md](../important-docs/JSON_TO_HTML_FLOW.md) 참조
2. **7단계 HTML 파이프라인**: 순서 변경 금지
3. **JO Code 변환 로직**: buildJO(), formatJO() 시그니처 유지

### Hook 분리 시 체크리스트
- [ ] Hook 내부에서만 상태 관리 (Props 전달 금지)
- [ ] 모든 의존성 명시 (useEffect deps)
- [ ] 타입 안전성 유지 (TypeScript)
- [ ] 기존 동작 100% 보존
- [ ] 각 Phase마다 빌드 & 테스트

---

## 🔄 롤백 계획

### Phase 실패 시
1. Hook import 제거
2. 기존 코드 복원 (Git에서)
3. 다음 Phase 진행 또는 중단

### 전체 롤백 시
```bash
git log --oneline | grep "Phase"
git revert <commit-hash>
npm run build
```

---

## 🚀 실행 순서

1. **Phase 1 시작** (Admin Rules Hook)
2. 빌드 & 테스트
3. 커밋
4. **Phase 2 시작** (Modal Hook)
5. 빌드 & 테스트
6. 커밋
7. ... 반복

**각 Phase는 독립적**이므로 실패 시 해당 Phase만 롤백 가능

---

**최종 업데이트**: 2025-11-23 23:30 KST
**상태**: Phase 1 ✅ + Phase 2 ✅ 완료
**현재 크기**: 3,459줄 (시작: 4,040줄, 14.4%↓)
**다음 작업**: Phase 3 - Revision History Hook 분리

## ✅ 완료 현황

| Phase | Hook 파일 | 줄 수 | law-viewer.tsx | 감소 | 상태 |
|-------|-----------|-------|----------------|------|------|
| **Phase 1** | `use-law-viewer-admin-rules.ts` | 171줄 | ~3,900줄 | 140줄↓ | ✅ |
| **Phase 2** | `use-law-viewer-three-tier.ts` | 147줄 | 3,459줄 | 228줄↓ | ✅ |
| **누적** | - | - | 3,459줄 | **581줄↓ (14.4%)** | - |

**다음 계획**: `docs/NEXT_STEPS.md` 참조
