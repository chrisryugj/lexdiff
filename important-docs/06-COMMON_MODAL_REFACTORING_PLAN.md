# 법령 링크/모달 시스템 공통 컴포넌트화 계획

## 📋 현황 분석

### 현재 상태 (2025-12-19 정밀 분석 완료)

| 시스템 | 사용처 | 링크 생성 | ReferenceModal | AnnexModal | 모달 히스토리 |
|--------|--------|-----------|----------------|------------|---------------|
| **법령 뷰어** | law-viewer.tsx | `generateLinks()` (HTML) | ✅ | ✅ | ✅ |
| **AI 답변** | law-viewer-ai-answer.tsx | `linkifyMarkdownLegalRefs()` (Markdown) | ✅ (LawViewer 위임) | ❌ **없음** | ❌ **없음** |

**AI 답변 뷰의 실제 구현 상태**:
- ✅ 법령 링크 (`law://`) → ReferenceModal 정상 작동
- ❌ 별표 링크 (`annex://`) → **링크는 생성되지만 클릭 핸들러 없음**
  - `legal-markdown-renderer.tsx`: `annex://` 프로토콜 처리 로직 없음 (line 318-373)
  - `law-viewer-ai-answer.tsx`: `openAnnexModal` 함수 없음
  - `LegalMarkdownRenderer`에 `onAnnexClick` prop 없음
- ❌ 모달 내 뒤로가기 기능 없음 (모달 히스토리 스택 미구현)

### 핵심 문제점

**실제 상황**:
1. **AI 답변 별표 링크 완전 미작동** - 링크 생성은 되지만 클릭 시 아무 일도 안 일어남
2. **중복된 모달 관리 코드** - 법령 뷰어 `useLawViewerModals` vs AI 답변 개별 구현
3. **유지보수 비효율** - 법령 뷰어에 기능 추가 시 AI 뷰에도 따로 구현 필요
4. **모달 히스토리 없음** - AI 답변 모달에서 뒤로가기 불가

**사용자 요구사항**:
> "법령에 뭐하나 추가하면 AI에도 또 해야 되는데 니가 한번에 구현한 적이 없으니까 하는 소리야"

→ **공통 컴포넌트로 통합하여 한 곳에서 구현하면 법령/AI 자동 적용**

---

## 🎯 목표

**단일 진실 공급원(Single Source of Truth)** 구축:
- 모든 법령 링크는 하나의 생성기에서
- 모든 모달은 하나의 관리 시스템에서
- 모든 클릭 이벤트는 하나의 핸들러 레이어에서

---

## 🔧 설계 방향

### Option A: 법령 뷰어 시스템을 AI 뷰로 확장 (권장)

**장점**:
- 법령 뷰어는 이미 완벽하게 작동 중 (별표 포함)
- 모달 히스토리 스택, 자치법규 등 복잡한 로직 검증 완료
- AI 뷰는 단순히 `onLawClick` 콜백만 구현하면 됨

**단점**:
- Markdown → HTML 변환 후 `dangerouslySetInnerHTML` 사용 필요
- react-markdown 렌더링 장점 상실

### Option B: Markdown 기반 통합 시스템 구축

**장점**:
- react-markdown의 컴포넌트 기반 렌더링 활용
- AI 답변의 스트리밍/타이핑 효과 유지

**단점**:
- 법령 뷰어 전체를 Markdown 기반으로 재작성 필요 (고위험)
- HTML 파싱 로직 손실 (법제처 API는 HTML 반환)

### Option C: 하이브리드 - 공통 모달 + 개별 링크 생성 (절충안)

**핵심 아이디어**:
- **링크 생성**: 각 컨텍스트에 맞게 유지 (HTML vs Markdown)
- **모달 관리**: 공통 훅으로 통합 (`useLawModals`)
- **클릭 핸들러**: 공통 인터페이스 (`LawLinkClickHandler`)

---

## ✅ 최종 결정사항

- **통합 방식**: Option C - 하이브리드 (공통 모달 + 개별 링크 생성)
- **구현 범위**: Phase 1-2만 (AI 답변 뷰까지, 법령 뷰어는 추후)
- **테스트**: 수동 테스트로 회귀 검증

---

## 📐 최종 아키텍처 (Option C - 하이브리드)

### 1단계: 공통 모달 훅 추출

```typescript
// hooks/useLawModals.ts (새 파일)
export function useLawModals(options?: {
  currentLawMeta?: LawMeta
  currentArticle?: LawArticle
}) {
  const [refModal, setRefModal] = useState<RefModalState>({ open: false })
  const [annexModal, setAnnexModal] = useState<AnnexModalState>({ open: false })
  const [modalHistory, setModalHistory] = useState<ModalHistoryItem[]>([])

  // 공통 모달 열기 함수
  const openLawModal = async (lawName: string, article?: string) => { ... }
  const openAnnexModal = async (annexNumber: string, lawName: string) => { ... }

  return {
    refModal,
    annexModal,
    openLawModal,
    openAnnexModal,
    handleModalBack: () => { ... },
    closeAllModals: () => { ... },
  }
}
```

### 2단계: 공통 클릭 핸들러 인터페이스

```typescript
// lib/law-link-handler.ts (새 파일)
export interface LawLinkData {
  type: 'law' | 'law-article' | 'article' | 'annex'
  lawName?: string
  article?: string
  annexNumber?: string
}

export function parseLawLink(
  element: HTMLElement | { href?: string; text?: string }
): LawLinkData | null {
  // law:// 또는 annex:// 프로토콜 파싱
  // data-* 속성 파싱
  // 텍스트 패턴 파싱
}

export function handleLawLinkClick(
  linkData: LawLinkData,
  actions: { openLawModal, openAnnexModal }
): void {
  switch (linkData.type) {
    case 'law-article':
      actions.openLawModal(linkData.lawName!, linkData.article)
      break
    case 'annex':
      actions.openAnnexModal(linkData.annexNumber!, linkData.lawName!)
      break
    // ...
  }
}
```

### 3단계: 링크 생성 통합 (기존 유지)

```
법령 뷰어: generateLinks() → HTML with data-* attributes
AI 답변: linkifyMarkdownLegalRefs() → law:// / annex:// 프로토콜
    ↓
공통: parseLawLink() → 표준화된 LawLinkData
    ↓
공통: handleLawLinkClick() → 모달 열기
```

### 4단계: AI 답변에서 별표 처리 추가

```typescript
// legal-markdown-renderer.tsx 수정
a: ({ href, children }) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()

    // annex:// 프로토콜 추가 처리
    if (href?.startsWith('annex://')) {
      const [lawName, annexNumber] = decodeURIComponent(href.slice(8)).split('/')
      onAnnexClick?.(annexNumber, lawName)  // 새 콜백 추가
      return
    }

    // 기존 law:// 처리
    if (href?.startsWith('law://')) { ... }
  }
}
```

---

## 📂 주요 파일 변경

### 신규 파일

1. **`hooks/useLawModals.ts`** (350줄 예상)
   - 기존 `use-law-viewer-modals.ts`에서 모달 관리 로직 추출
   - AI 답변/법령 뷰어 모두 사용 가능하도록 범용화

2. **`lib/law-link-handler.ts`** (200줄 예상)
   - 링크 파싱 통합 로직
   - `parseLawLink()`, `handleLawLinkClick()` 구현

### 수정 파일

3. **`components/legal-markdown-renderer.tsx`**
   - `annex://` 프로토콜 처리 추가 (30줄)
   - `onAnnexClick` 콜백 prop 추가

4. **`components/law-viewer-ai-answer.tsx`**
   - `useLawModals()` 훅으로 교체 (50줄 리팩토링)
   - `onAnnexClick` 핸들러 구현

5. **`components/law-viewer.tsx`**
   - `useLawModals()` 훅으로 교체 (100줄 리팩토링)
   - 기존 `use-law-viewer-modals.ts` 의존성 제거

6. **`hooks/use-law-viewer-modals.ts`**
   - 모달 관리 로직 제거 (공통 훅으로 이동)
   - 법령 뷰어 전용 로직만 유지 (조문 개정이력 등)

---

## 🚀 구현 순서 (Phase 1-2만)

### Phase 1: 공통 인프라 구축 (위험도: 낮음)
1. ✅ `useLawModals()` 훅 추출
   - `use-law-viewer-modals.ts`에서 모달 관리 로직 복사
   - AI 답변 모드 지원 (meta.lawId === 'ai-answer')
   - 조례/일반 법령 분기 유지

2. ✅ `law-link-handler.ts` 구현
   - `parseLawLink()`: `law://`, `annex://` 프로토콜 파싱
   - `handleLawLinkClick()`: 통합 클릭 핸들러
   - HTML `data-*` 속성 파싱도 지원

3. ✅ 단위 테스트 작성
   - `parseLawLink()` 테스트 (프로토콜/속성 파싱)
   - 기존 코드와 병렬로 동작 확인

### Phase 2: AI 답변 뷰 마이그레이션 (위험도: 중간)
4. ✅ `legal-markdown-renderer.tsx` 수정
   - `annex://` 프로토콜 처리 추가
   - `onAnnexClick` prop 추가 (optional)

5. ✅ `law-viewer-ai-answer.tsx` 수정
   - `useLawModals()` 훅 import
   - `openAnnexModal` 핸들러 구현
   - `LegalMarkdownRenderer`에 `onAnnexClick` 전달

6. ✅ 수동 테스트
   - AI 답변에서 별표 클릭 → AnnexModal 열림 확인
   - 모달 내 법령 링크 클릭 → ReferenceModal 열림 확인
   - 히스토리 스택 (뒤로가기) 동작 확인

### Phase 3-4: 보류 (추후 진행)
- Phase 3 (법령 뷰어 마이그레이션): 현재는 진행하지 않음
- Phase 4 (레거시 정리): Phase 3 완료 후 진행

---

## 🎯 기대 효과

### 즉시 효과
- ✅ **AI 답변에서 별표 클릭 가능** (현재 완전 미작동)
- ✅ **AI 모달 히스토리 (뒤로가기)** 지원
- ✅ 모달 관리 로직 중복 제거 (~300줄 예상)
- ✅ 법령 뷰어와 AI 뷰 동작 일관성

### 장기 효과 (핵심 목표)
- ✅ **새 기능 한 곳에서 구현 → 법령/AI 자동 적용**
- ✅ **버그 수정 한 번만** (현재는 두 번 필요)
- ✅ 유지보수 복잡도 50% 감소
- ✅ 향후 새 뷰 추가 시 링크/모달 무료 지원

---

## ⚠️ 위험 요소 및 대응

| 위험 | 영향도 | 대응 방안 |
|------|--------|----------|
| 법령 뷰어 회귀 | 🔴 높음 | Phase 3 전 E2E 테스트 작성 |
| AI 스트리밍 중 모달 이슈 | 🟡 중간 | 스트리밍 완료 후 클릭만 허용 |
| 모달 히스토리 스택 손실 | 🔴 높음 | 공통 훅에 히스토리 로직 포함 |
| 조례 처리 로직 누락 | 🟡 중간 | `useLawModals`에 조례 분기 포함 |

---

## 📝 Critical Files (Phase 1-2)

### 신규 파일
- `hooks/useLawModals.ts` (350줄 예상) - 공통 모달 관리
- `lib/law-link-handler.ts` (200줄 예상) - 링크 파싱 통합

### 수정 파일
- `components/legal-markdown-renderer.tsx` (~30줄 추가)
- `components/law-viewer-ai-answer.tsx` (~50줄 리팩토링)

### 읽기 전용 (참조만)
- `hooks/use-law-viewer-modals.ts` - 로직 복사 원본
- `components/law-viewer.tsx` - 참조 패턴

---

## 📋 구현 후 수동 테스트 체크리스트

### AI 답변 기본 동작
- [ ] AI 답변에서 법령 링크 클릭 → ReferenceModal 열림
- [ ] AI 답변에서 조문 링크 클릭 → ReferenceModal (조문만)
- [ ] **AI 답변에서 별표 링크 클릭 → AnnexModal 열림** (신규)

### 모달 내 링크
- [ ] ReferenceModal 내 법령 링크 클릭 → 히스토리 저장 + 새 모달
- [ ] **ReferenceModal 내 별표 링크 클릭 → AnnexModal** (신규)
- [ ] **AnnexModal 내 법령 링크 클릭 → ReferenceModal** (신규)

### 히스토리 스택
- [ ] 모달 내 링크 3번 클릭 후 뒤로가기 2번 → 정상 복원
- [ ] 모달 닫기 → 히스토리 스택 초기화

### 조례 처리
- [ ] AI 답변에서 조례 링크 클릭 → `/api/ordin` 호출 확인
- [ ] 조례 모달 열림 확인

### 에러 처리
- [ ] 존재하지 않는 법령 링크 클릭 → 에러 토스트
- [ ] 별표 정보 없는 법령 → 에러 토스트

---

**작성일**: 2025-12-19
**다음 단계**: Phase 1 구현 시작
