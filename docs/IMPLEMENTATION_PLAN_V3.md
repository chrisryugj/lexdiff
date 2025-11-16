# LexDiff 페이지 분리 리팩토링 계획 (V3 - URL 숨김 방식)

## 📋 목표

**현재 문제**:
- `app/page.tsx` 1984줄 → 단일 파일에 모든 로직 집중
- 검색 + 결과 표시가 한 페이지에서 동작 (상태 복잡)

**리팩토링 목표**:
1. **코드 분리**: 검색 컴포넌트 / 결과 컴포넌트로 역할 분리
2. **URL 유지**: 주소창은 항상 `/` (깔끔함)
3. **UI 유지**: 현재 디자인 **완전히 그대로**
4. **히스토리 지원**: History API로 뒤로가기/앞으로가기
5. **UX 개선**: 프로그레스 UI, AI 모드 강화, 설정 페이지

---

## 🎯 핵심 원칙

- ✅ **UI 변경 없음**: 현재 화면 레이아웃 그대로 유지
- ✅ **URL 숨김**: 주소창 항상 `/` 유지 (내부 상태로 관리)
- ✅ **코드 분리**: 역할별 컴포넌트 분리
- ✅ **History API**: 브라우저 뒤로가기 지원

---

## 📐 아키텍처

### **새 구조**

```
app/page.tsx (~300줄)
├── 상태
│   ├── viewMode: 'home' | 'search-result'
│   ├── searchId: string | null
│   └── 기존 상태들 유지
├── History API
│   ├── pushState: 검색 시 히스토리 추가
│   ├── popState: 뒤로가기 처리
│   └── replaceState: URL 초기화
└── 조건부 렌더링
    ├── viewMode === 'home' → 메인 화면
    └── viewMode === 'search-result' → 결과 화면

components/search-view.tsx (NEW - ~200줄)
└── 메인 화면 (로고 + 검색창 + 즐겨찾기)

components/search-result-view.tsx (NEW - ~1600줄)
└── 검색 결과 화면 (기존 lawData 있을 때 로직)
```

**사용자 경험**:
1. 검색어 입력 → 엔터
2. URL 그대로 `/` 유지
3. 화면만 검색 결과로 전환
4. 뒤로가기 → 메인 화면 (URL 여전히 `/`)

---

## 🏗️ 구현 단계

### **Phase 1: 인프라 구축**

#### 1.1 히스토리 관리 유틸리티
**파일**: `lib/history-manager.ts` (NEW)

```typescript
/**
 * History API 기반 상태 관리
 */

export interface HistoryState {
  viewMode: 'home' | 'search-result'
  searchId?: string
  timestamp: number
}

/**
 * 검색 결과 히스토리 추가
 */
export function pushSearchHistory(searchId: string) {
  const state: HistoryState = {
    viewMode: 'search-result',
    searchId,
    timestamp: Date.now()
  }

  // URL은 그대로 유지, 상태만 추가
  window.history.pushState(state, '', '/')
}

/**
 * 메인 화면으로 히스토리 추가
 */
export function pushHomeHistory() {
  const state: HistoryState = {
    viewMode: 'home',
    timestamp: Date.now()
  }

  window.history.pushState(state, '', '/')
}

/**
 * 현재 히스토리 상태 조회
 */
export function getCurrentHistoryState(): HistoryState | null {
  return window.history.state as HistoryState | null
}

/**
 * 히스토리 상태 초기화 (새로고침 시)
 */
export function initializeHistory() {
  const state: HistoryState = {
    viewMode: 'home',
    timestamp: Date.now()
  }

  window.history.replaceState(state, '', '/')
}
```

---

#### 1.2 검색 결과 캐싱 (간소화)
**파일**: `lib/search-result-cache.ts` (NEW)

```typescript
/**
 * SessionStorage 기반 검색 결과 임시 캐싱
 * (새로고침 시 초기화됨 - 의도된 동작)
 */

export interface SearchResultCache {
  searchId: string
  query: {
    lawName: string
    article?: string
    jo?: string
  }

  // 검색 결과
  lawData?: any
  lawSelectionState?: any
  ordinanceSelectionState?: any
  aiMode?: any

  timestamp: number
}

const CACHE_KEY = 'lexdiff-search-cache'

/**
 * 검색 결과 저장 (SessionStorage)
 */
export function saveSearchCache(cache: SearchResultCache): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch (error) {
    console.error('Failed to save search cache:', error)
  }
}

/**
 * 검색 결과 조회
 */
export function getSearchCache(): SearchResultCache | null {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY)
    return cached ? JSON.parse(cached) : null
  } catch (error) {
    console.error('Failed to get search cache:', error)
    return null
  }
}

/**
 * 검색 결과 삭제
 */
export function clearSearchCache(): void {
  sessionStorage.removeItem(CACHE_KEY)
}

/**
 * 검색 ID 생성
 */
export function generateSearchId(): string {
  return `search-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}
```

---

### **Phase 2: 컴포넌트 분리**

#### 2.1 메인 화면 컴포넌트
**파일**: `components/search-view.tsx` (NEW)

```typescript
'use client'

import { SearchBar } from '@/components/search-bar'
import { FavoritesPanel } from '@/components/favorites-panel'

interface SearchViewProps {
  onSearch: (query: { lawName: string; article?: string }) => void
  onFavoriteSelect: (favorite: any) => void
  isSearching: boolean
}

export function SearchView({ onSearch, onFavoriteSelect, isSearching }: SearchViewProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-8">
      {/* 로고 + 설명 */}
      <div className="w-full max-w-3xl text-center">
        <h2
          className="text-5xl font-bold text-foreground mb-4"
          style={{ fontFamily: "GiantsInline, sans-serif" }}
        >
          LexDiff
        </h2>
        <p className="text-lg text-muted-foreground mb-2">
          See the Difference in Law.
        </p>
        <p className="text-muted-foreground max-w-2xl mb-8 mx-auto">
          법령 검색부터 신·구법 대조, AI 요약까지<br />
          한 화면에서 제공하는 전문가용 법령 분석 도구
        </p>
      </div>

      {/* 검색창 */}
      <SearchBar onSearch={onSearch} isLoading={isSearching} />

      {/* 즐겨찾기 패널 */}
      <FavoritesPanel onSelect={onFavoriteSelect} />
    </div>
  )
}
```

---

#### 2.2 검색 결과 컴포넌트
**파일**: `components/search-result-view.tsx` (NEW)

```typescript
'use client'

import { useState, useEffect } from 'react'
import { SearchBar } from '@/components/search-bar'
import { LawViewer } from '@/components/law-viewer'
import { ComparisonModal } from '@/components/comparison-modal'
import { AISummaryDialog } from '@/components/ai-summary-dialog'
import { ArticleNotFoundBanner } from '@/components/article-not-found-banner'
import { FeedbackButtons } from '@/components/feedback-buttons'
import { SearchProgress } from '@/components/search-progress'
import { getSearchCache } from '@/lib/search-result-cache'

interface SearchResultViewProps {
  searchId: string
  onBack: () => void
  onReSearch: (query: any) => void
}

export function SearchResultView({ searchId, onBack, onReSearch }: SearchResultViewProps) {
  // ✅ 기존 page.tsx의 검색 결과 관련 상태들 그대로 복사
  const [isSearching, setIsSearching] = useState(false)
  const [lawData, setLawData] = useState<any>(null)
  const [lawSelectionState, setLawSelectionState] = useState<any>(null)
  const [ordinanceSelectionState, setOrdinanceSelectionState] = useState<any>(null)
  const [comparisonModal, setComparisonModal] = useState<any>({ isOpen: false })
  const [summaryDialog, setSummaryDialog] = useState<any>({ isOpen: false })
  const [articleNotFound, setArticleNotFound] = useState<any>(null)
  const [aiAnswerContent, setAiAnswerContent] = useState<string>('')
  const [aiRelatedLaws, setAiRelatedLaws] = useState<any[]>([])
  const [isAiMode, setIsAiMode] = useState(false)
  const [comparisonLaw, setComparisonLaw] = useState<any>(null)

  // 프로그레스
  const [loadingStage, setLoadingStage] = useState<string>('')
  const [loadingProgress, setLoadingProgress] = useState(0)

  /**
   * 캐시 로드
   */
  useEffect(() => {
    const cached = getSearchCache()

    if (cached && cached.searchId === searchId) {
      // 캐시 복원
      if (cached.lawData) {
        setLawData(cached.lawData)
        setLawSelectionState(cached.lawSelectionState || null)
        setOrdinanceSelectionState(cached.ordinanceSelectionState || null)

        if (cached.aiMode) {
          setIsAiMode(true)
          setAiAnswerContent(cached.aiMode.aiAnswerContent)
          setAiRelatedLaws(cached.aiMode.aiRelatedLaws)
          setComparisonLaw(cached.aiMode.comparisonLaw || null)
        }

        setLoadingStage('complete')
      } else {
        // 쿼리만 있으면 검색 실행
        executeSearch(cached.query)
      }
    } else {
      // 캐시 없으면 메인으로
      onBack()
    }
  }, [searchId])

  /**
   * 검색 실행 (기존 handleSearch 로직)
   */
  async function executeSearch(query: any) {
    // ✅ 기존 page.tsx의 검색 로직 그대로 복사
    // ...
  }

  // ✅ 기존 page.tsx의 모든 핸들러 함수들 복사
  // - handleLawSelect
  // - handleOrdinanceSelect
  // - handleCompare
  // - handleSummarize
  // - handleToggleFavorite
  // - handleCitationClick

  return (
    <>
      {/* 검색창 (재검색) */}
      <div className="mb-6">
        <SearchBar onSearch={onReSearch} isLoading={isSearching} />
      </div>

      {/* 프로그레스 UI */}
      {loadingStage && loadingStage !== 'complete' && (
        <SearchProgress
          mode={isAiMode ? 'ai' : 'law'}
          stage={loadingStage}
          lawName={lawData?.meta.lawTitle}
          progress={loadingProgress}
        />
      )}

      {/* ✅ 기존 page.tsx의 검색 결과 렌더링 로직 그대로 복사 */}
      {lawSelectionState && (
        <div>법령 선택 화면</div>
      )}

      {ordinanceSelectionState && (
        <div>조례 선택 화면</div>
      )}

      {lawData && loadingStage === 'complete' && (
        <>
          {articleNotFound && <ArticleNotFoundBanner {...articleNotFound} />}
          {lawData.searchResultId && <FeedbackButtons {...} />}
          <LawViewer {...} />
        </>
      )}

      {/* 모달들 */}
      {lawData && (
        <>
          <ComparisonModal {...} />
          <AISummaryDialog {...} />
        </>
      )}
    </>
  )
}
```

---

### **Phase 3: 메인 페이지 통합**

**파일**: `app/page.tsx` (MODIFY)

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/header'
import { SearchView } from '@/components/search-view'
import { SearchResultView } from '@/components/search-result-view'
import { FavoritesDialog } from '@/components/favorites-dialog'
import {
  pushSearchHistory,
  pushHomeHistory,
  getCurrentHistoryState,
  initializeHistory
} from '@/lib/history-manager'
import {
  generateSearchId,
  saveSearchCache,
  clearSearchCache
} from '@/lib/search-result-cache'
import { debugLogger } from '@/lib/debug-logger'

export default function Home() {
  const [viewMode, setViewMode] = useState<'home' | 'search-result'>('home')
  const [searchId, setSearchId] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [favoritesDialogOpen, setFavoritesDialogOpen] = useState(false)

  /**
   * 초기화: History 상태 설정
   */
  useEffect(() => {
    // 새로고침 시 메인으로 초기화
    initializeHistory()
    clearSearchCache()

    // popstate 이벤트 처리 (뒤로가기/앞으로가기)
    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as HistoryState | null

      if (state) {
        if (state.viewMode === 'home') {
          setViewMode('home')
          setSearchId(null)
          clearSearchCache()
        } else if (state.viewMode === 'search-result' && state.searchId) {
          setViewMode('search-result')
          setSearchId(state.searchId)
        }
      } else {
        // 상태 없으면 메인으로
        setViewMode('home')
        setSearchId(null)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  /**
   * 검색 핸들러
   */
  const handleSearch = async (query: { lawName: string; article?: string }) => {
    try {
      setIsSearching(true)
      debugLogger.info('검색 시작', query)

      // 1. 검색 ID 생성
      const newSearchId = generateSearchId()

      // 2. SessionStorage에 쿼리 저장
      saveSearchCache({
        searchId: newSearchId,
        query,
        timestamp: Date.now()
      })

      // 3. History에 상태 추가 (URL은 / 유지)
      pushSearchHistory(newSearchId)

      // 4. 뷰 전환
      setSearchId(newSearchId)
      setViewMode('search-result')

    } catch (error) {
      debugLogger.error('검색 시작 실패', error)
    } finally {
      setIsSearching(false)
    }
  }

  /**
   * 뒤로가기 핸들러 (프로그래밍 방식)
   */
  const handleBack = () => {
    window.history.back()
  }

  /**
   * 메인으로 핸들러 (헤더 클릭)
   */
  const handleReset = () => {
    clearSearchCache()
    pushHomeHistory()
    setViewMode('home')
    setSearchId(null)
  }

  /**
   * 즐겨찾기 선택
   */
  const handleFavoriteSelect = (favorite: any) => {
    const query = {
      lawName: favorite.lawTitle,
      jo: favorite.jo
    }
    handleSearch(query)
  }

  /**
   * 설정 페이지 이동
   */
  const handleSettingsClick = () => {
    window.location.href = '/admin/settings'
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        onReset={handleReset}
        onFavoritesClick={() => setFavoritesDialogOpen(true)}
        onSettingsClick={handleSettingsClick}
      />

      <main className="flex-1">
        <div className="container mx-auto p-6">
          {/* 조건부 렌더링 */}
          {viewMode === 'home' ? (
            <SearchView
              onSearch={handleSearch}
              onFavoriteSelect={handleFavoriteSelect}
              isSearching={isSearching}
            />
          ) : searchId ? (
            <SearchResultView
              searchId={searchId}
              onBack={handleBack}
              onReSearch={handleSearch}
            />
          ) : null}
        </div>
      </main>

      <FavoritesDialog
        isOpen={favoritesDialogOpen}
        onClose={() => setFavoritesDialogOpen(false)}
        onSelect={handleFavoriteSelect}
      />

      {viewMode === 'home' && (
        <footer className="border-t border-border py-6">
          <div className="container mx-auto px-6">
            <p className="text-center text-sm text-muted-foreground">
              © 2025 Chris ryu. All rights reserved.
            </p>
          </div>
        </footer>
      )}
    </div>
  )
}
```

**코드 라인 수**: ~300줄 (메인 페이지만)

---

### **Phase 4: 프로그레스 UI**

#### 4.1 통합 검색 프로그레스
**파일**: `components/search-progress.tsx` (NEW)

```typescript
// ✅ V2 계획과 동일
```

---

### **Phase 5: SearchBar AI 모드 강화**

**파일**: `components/search-bar.tsx` (MODIFY)

```typescript
// ✅ V2 계획과 동일
// - AI 모드 전환 버튼
// - Brain 아이콘
// - 글로우 효과
```

---

### **Phase 6: 설정 페이지**

**파일**: `app/admin/settings/page.tsx` (NEW)

```typescript
// ✅ V2 계획과 동일
// - 비밀번호 1234
// - RAG 관리 페이지 리다이렉트
```

---

## 📊 구현 순서 체크리스트

### ✅ Phase 1: 인프라
- [ ] `lib/history-manager.ts` 생성 (History API)
- [ ] `lib/search-result-cache.ts` 생성 (SessionStorage)

### ✅ Phase 2: 컴포넌트 분리
- [ ] `components/search-view.tsx` 생성 (메인 화면)
- [ ] `components/search-result-view.tsx` 생성 (검색 결과)
- [ ] `components/search-progress.tsx` 생성 (프로그레스)

### ✅ Phase 3: 메인 페이지 통합
- [ ] `app/page.tsx` 수정 (History API + 조건부 렌더링)

### ✅ Phase 4: SearchBar 개선
- [ ] AI 모드 전환 버튼 추가
- [ ] Brain 아이콘 + 글로우 효과
- [ ] `app/globals.css` 애니메이션 추가

### ✅ Phase 5: 설정 페이지
- [ ] `components/header.tsx` 설정 버튼 추가
- [ ] `app/admin/settings/page.tsx` 생성

### ✅ Phase 6: 테스트
- [ ] 검색 → 결과 표시 (URL 그대로 /)
- [ ] 뒤로가기 → 메인 화면 (URL 그대로 /)
- [ ] 새로고침 → 메인으로 초기화
- [ ] 프로그레스 UI 표시
- [ ] AI 모드 전환 동작 확인

---

## 🎯 성공 기준

### 사용자 관점
- ✅ **UI 동일**: 기존 화면 100% 동일
- ✅ **URL 깔끔**: 항상 `/` 유지
- ✅ **뒤로가기 지원**: 자연스러운 내비게이션
- ✅ **새로고침 안전**: 메인으로 돌아감 (의도됨)
- ✅ **프로그레스 표시**: 로딩 상태 시각화

### 개발자 관점
- ✅ **코드 분리**: 역할별 컴포넌트 분리
- ✅ **History API**: 브라우저 히스토리 활용
- ✅ **SessionStorage**: 간단한 캐싱
- ✅ **유지보수성**: 명확한 책임 분리

---

## 📁 파일 변경 요약

### 신규 파일 (5개)
1. `lib/history-manager.ts` - History API 관리
2. `lib/search-result-cache.ts` - SessionStorage 캐싱
3. `components/search-view.tsx` - 메인 화면
4. `components/search-result-view.tsx` - 검색 결과
5. `components/search-progress.tsx` - 프로그레스 UI
6. `app/admin/settings/page.tsx` - 설정 페이지

### 수정 파일 (3개)
1. `app/page.tsx` - History API + 조건부 렌더링 (~300줄)
2. `components/search-bar.tsx` - AI 모드 UI 강화
3. `components/header.tsx` - 설정 버튼 추가

### CSS 추가
1. `app/globals.css` - 애니메이션 추가

---

## 🚨 주의사항

### 1. 새로고침 동작
**의도된 동작**: 새로고침 시 메인 화면으로 초기화
- SessionStorage는 탭 닫으면 사라짐
- 검색 결과는 영구 저장 안 함

### 2. URL 공유 불가
**트레이드오프**: URL이 항상 `/`이므로 검색 결과 링크 공유 불가
- 내부 도구로 사용 시 문제 없음
- 필요하면 나중에 V2 방식으로 전환 가능

### 3. History Stack
**주의**: popstate 이벤트 처리 시 무한 루프 방지
```typescript
// ❌ 잘못된 예
window.history.back()
setViewMode('home') // popstate에서 다시 호출됨

// ✅ 올바른 예
window.history.back() // popstate가 자동으로 setViewMode 호출
```

---

## 💡 장단점 비교

### URL 숨김 방식 (V3 - 현재)
**장점**:
- ✅ 주소창 깔끔 (항상 `/`)
- ✅ 구현 간단
- ✅ 뒤로가기 자연스러움

**단점**:
- ❌ URL 공유 불가
- ❌ 북마크 불가
- ❌ 새로고침 시 초기화

### URL 표시 방식 (V2 - 이전)
**장점**:
- ✅ URL 공유 가능
- ✅ 북마크 가능
- ✅ 새로고침 시 유지

**단점**:
- ❌ URL 복잡 (`/search/lex-123...`)
- ❌ IndexedDB 필요
- ❌ 구현 복잡

---

## 🏁 다음 단계

V3 방식(URL 숨김)으로 진행할까요, 아니면 V2 방식(URL 표시)으로 할까요?

**추천**: V3 방식 (깔끔하고 간단)
- 내부 도구로만 사용
- URL 공유 필요 없음
- 구현 빠름

준비되시면 Phase 1부터 시작하겠습니다! 🚀
