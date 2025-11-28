# LexDiff 페이지 분리 리팩토링 최종 계획

## 📋 목표

**현재 문제**:
- `app/page.tsx` 1984줄 → 단일 파일에 모든 로직 집중
- 검색 + 결과 표시가 한 페이지에서 동작 (상태 복잡)

**리팩토링 목표**:
1. **코드 분리**: 검색 컴포넌트 / 결과 컴포넌트로 역할 분리
2. **URL 유지**: 주소창은 항상 `/` (깔끔함)
3. **새로고침 지원**: IndexedDB로 F5 새로고침해도 결과 유지
4. **히스토리 지원**: History API로 뒤로가기/앞으로가기
5. **UI 유지**: 현재 디자인 **완전히 그대로**
6. **UX 개선**: 프로그레스 UI, AI 모드 강화, 설정 페이지

---

## 🎯 핵심 원칙

- ✅ **UI 변경 없음**: 현재 화면 레이아웃 그대로 유지
- ✅ **URL 숨김**: 주소창 항상 `/` 유지 (내부 상태로 관리)
- ✅ **새로고침 안전**: IndexedDB로 결과 영구 보존 (7일)
- ✅ **코드 분리**: 역할별 컴포넌트 분리
- ✅ **History API**: 브라우저 뒤로가기 지원

---

## 📐 아키텍처

### **최종 구조**

```
app/page.tsx (~300줄)
├── 상태
│   ├── viewMode: 'home' | 'search-result'
│   ├── searchId: string | null
│   └── isSearching
├── History API
│   ├── pushState: 검색 시 히스토리 추가 (URL은 / 유지)
│   ├── popState: 뒤로가기 처리
│   └── replaceState: 초기 상태 설정
├── IndexedDB
│   ├── 검색 결과 영구 저장 (7일)
│   ├── 새로고침 시 복원
│   └── 자동 만료 처리
└── 조건부 렌더링
    ├── viewMode === 'home' → SearchView
    └── viewMode === 'search-result' → SearchResultView

components/search-view.tsx (~200줄)
└── 메인 화면 (로고 + 검색창 + 즐겨찾기)

components/search-result-view.tsx (~1600줄)
└── 검색 결과 화면 (기존 lawData 있을 때 로직 그대로)

lib/history-manager.ts
└── History API 관리

lib/search-result-store.ts
└── IndexedDB 캐싱 (7일 유지)
```

---

## 🏗️ 구현 단계

### **Phase 1: 인프라 구축**

#### 1.1 검색 ID 생성 유틸리티
**파일**: `lib/search-id-generator.ts` (NEW)

```typescript
/**
 * 검색 ID 생성
 */
export function generateSearchId(): string {
  return `search-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}
```

---

#### 1.2 IndexedDB 캐싱 스토어
**파일**: `lib/search-result-store.ts` (NEW)

```typescript
/**
 * IndexedDB를 사용한 검색 결과 영구 캐싱
 * Database: LexDiffCache
 * Store: searchResults
 */

export interface SearchResultCache {
  searchId: string
  query: {
    lawName: string
    article?: string
    jo?: string
  }

  // 검색 결과 (기존 page.tsx의 상태들 그대로 저장)
  lawData?: {
    meta: LawMeta
    articles: LawArticle[]
    selectedJo?: string
    isOrdinance?: boolean
    viewMode?: "single" | "full"
    searchQueryId?: number
    searchResultId?: number
  }

  lawSelectionState?: {
    results: LawSearchResult[]
    query: { lawName: string; article?: string; jo?: string }
  }

  ordinanceSelectionState?: {
    results: OrdinanceSearchResult[]
    query: { lawName: string }
  }

  // AI 검색 결과
  aiMode?: {
    aiAnswerContent: string
    aiRelatedLaws: any[]
    comparisonLaw?: {
      meta: LawMeta | null
      articles: LawArticle[]
      selectedJo?: string
    }
  }

  timestamp: number
  expiresAt: number  // 7일 후
}

const DB_NAME = 'LexDiffCache'
const STORE_NAME = 'searchResults'
const DB_VERSION = 1

/**
 * IndexedDB 초기화
 */
async function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'searchId' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
        store.createIndex('expiresAt', 'expiresAt', { unique: false })
      }
    }
  })
}

/**
 * 검색 결과 저장
 */
export async function saveSearchResult(cache: SearchResultCache): Promise<void> {
  try {
    const db = await initDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put(cache)

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (error) {
    console.error('Failed to save search result:', error)
    throw error
  }
}

/**
 * 검색 결과 조회
 */
export async function getSearchResult(searchId: string): Promise<SearchResultCache | null> {
  try {
    const db = await initDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(searchId)

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const result = request.result as SearchResultCache | undefined

        if (result && result.expiresAt > Date.now()) {
          resolve(result)
        } else {
          // 만료됨
          resolve(null)
        }
      }
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('Failed to get search result:', error)
    return null
  }
}

/**
 * 만료된 결과 삭제 (앱 시작 시 호출)
 */
export async function deleteExpiredResults(): Promise<void> {
  try {
    const db = await initDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('expiresAt')
    const range = IDBKeyRange.upperBound(Date.now())
    const request = index.openCursor(range)

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      }
    }
  } catch (error) {
    console.error('Failed to delete expired results:', error)
  }
}

/**
 * 특정 검색 결과 삭제
 */
export async function deleteSearchResult(searchId: string): Promise<void> {
  try {
    const db = await initDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(searchId)
  } catch (error) {
    console.error('Failed to delete search result:', error)
  }
}
```

---

#### 1.3 History API 관리자
**파일**: `lib/history-manager.ts` (NEW)

```typescript
/**
 * History API 기반 상태 관리
 */

export interface HistoryState {
  viewMode: 'home' | 'search-result'
  searchId?: string  // IndexedDB 조회 키
  timestamp: number
}

/**
 * 검색 결과 히스토리 추가
 */
export function pushSearchHistory(searchId: string): void {
  const state: HistoryState = {
    viewMode: 'search-result',
    searchId,
    timestamp: Date.now()
  }

  // URL은 / 유지, 상태만 추가
  window.history.pushState(state, '', '/')
}

/**
 * 메인 화면으로 히스토리 추가
 */
export function pushHomeHistory(): void {
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
 * 히스토리 상태 초기화
 * 새로고침 시 호출 - 기존 상태가 있으면 유지, 없으면 홈으로
 */
export function initializeHistory(): void {
  const currentState = window.history.state as HistoryState | null

  if (!currentState) {
    // 최초 방문 시 홈으로 초기화
    const state: HistoryState = {
      viewMode: 'home',
      timestamp: Date.now()
    }
    window.history.replaceState(state, '', '/')
  }
  // 상태가 있으면 그대로 유지 (새로고침 시 복원)
}
```

---

### **Phase 2: 프로그레스 UI 컴포넌트**

#### 2.1 통합 검색 프로그레스
**파일**: `components/search-progress.tsx` (NEW)

```typescript
'use client'

import { cn } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'
import { Scale, Brain, CheckCircle, Loader2, Circle } from 'lucide-react'

interface SearchProgressProps {
  mode: 'law' | 'ordinance' | 'ai'
  stage: string
  lawName?: string
  progress?: number  // 0-100
}

/**
 * 법령 검색 단계:
 * - searching: 법령 검색 중 (20%)
 * - parsing: 데이터 파싱 중 (60%)
 * - rendering: 렌더링 준비 중 (90%)
 * - complete: 완료 (100%)
 *
 * AI 검색 단계:
 * - connecting: File Search 연결 중 (10%)
 * - searching: 관련 법령 검색 중 (30%)
 * - streaming: AI 답변 생성 중 (30-90%, 청크 수에 따라)
 * - extracting: 관련 법령 추출 중 (95%)
 * - complete: 완료 (100%)
 */
export function SearchProgress({ mode, stage, lawName, progress = 0 }: SearchProgressProps) {
  return (
    <div className="max-w-2xl mx-auto py-12">
      <div className="space-y-6">
        {/* 제목 */}
        <div className="text-center">
          {mode === 'ai' ? (
            <h3 className="text-xl font-semibold flex items-center justify-center gap-2">
              <Brain className="h-6 w-6 text-purple-500 animate-pulse" />
              AI 답변 생성 중...
            </h3>
          ) : (
            <h3 className="text-xl font-semibold flex items-center justify-center gap-2">
              <Scale className="h-6 w-6 text-amber-500" />
              법령 조회 중...
            </h3>
          )}
          {lawName && (
            <p className="text-sm text-muted-foreground mt-2">{lawName}</p>
          )}
        </div>

        {/* 프로그레스 바 */}
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-sm text-center text-muted-foreground">{progress}%</p>
        </div>

        {/* 단계 표시 */}
        <div className="space-y-3">
          {mode === 'ai' ? (
            <>
              <StageItem label="File Search 연결" status={getStageStatus('connecting', stage)} />
              <StageItem label="관련 법령 검색" status={getStageStatus('searching', stage)} />
              <StageItem label="AI 답변 생성" status={getStageStatus('streaming', stage)} />
              <StageItem label="관련 법령 추출" status={getStageStatus('extracting', stage)} />
            </>
          ) : (
            <>
              <StageItem label="법령 검색" status={getStageStatus('searching', stage)} />
              <StageItem label="데이터 파싱" status={getStageStatus('parsing', stage)} />
              <StageItem label="렌더링 준비" status={getStageStatus('rendering', stage)} />
            </>
          )}
        </div>

        {/* AI 모드 경고 */}
        {mode === 'ai' && stage === 'streaming' && (
          <div className="mt-6 p-4 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-lg">
            <p className="text-sm text-purple-700 dark:text-purple-300 text-center">
              💡 답변 생성 중입니다. 페이지를 이동하지 마세요.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function getStageStatus(targetStage: string, currentStage: string): 'pending' | 'active' | 'complete' {
  const stages = ['connecting', 'searching', 'streaming', 'extracting', 'parsing', 'rendering', 'complete']
  const targetIndex = stages.indexOf(targetStage)
  const currentIndex = stages.indexOf(currentStage)

  if (currentIndex > targetIndex) return 'complete'
  if (currentIndex === targetIndex) return 'active'
  return 'pending'
}

function StageItem({ label, status }: { label: string; status: 'pending' | 'active' | 'complete' }) {
  return (
    <div className="flex items-center gap-3">
      {status === 'complete' && <CheckCircle className="h-5 w-5 text-green-500" />}
      {status === 'active' && <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />}
      {status === 'pending' && <Circle className="h-5 w-5 text-gray-300" />}
      <span className={cn(
        "text-sm",
        status === 'complete' && "text-foreground",
        status === 'active' && "text-foreground font-medium",
        status === 'pending' && "text-muted-foreground"
      )}>
        {label}
      </span>
    </div>
  )
}
```

---

### **Phase 3: 컴포넌트 분리**

#### 3.1 메인 화면 컴포넌트
**파일**: `components/search-view.tsx` (NEW)

```typescript
'use client'

import { SearchBar } from '@/components/search-bar'
import { FavoritesPanel } from '@/components/favorites-panel'
import type { Favorite } from '@/lib/law-types'

interface SearchViewProps {
  onSearch: (query: { lawName: string; article?: string; jo?: string }) => void
  onFavoriteSelect: (favorite: Favorite) => void
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

#### 3.2 검색 결과 컴포넌트
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
import { LawSelector } from '@/components/law-selector'
import { getSearchResult, saveSearchResult } from '@/lib/search-result-store'
import { favoritesStore } from '@/lib/favorites-store'
import { debugLogger } from '@/lib/debug-logger'
import type { LawMeta, LawArticle, Favorite } from '@/lib/law-types'

// ⚠️ 기존 page.tsx의 모든 helper 함수들 복사
// - convertArticleNumberToCode
// - extractContentFromHangArray
// - parseLawJSON
// - 기타 유틸리티 함수들

interface SearchResultViewProps {
  searchId: string
  onBack: () => void
  onReSearch: (query: { lawName: string; article?: string; jo?: string }) => void
}

export function SearchResultView({ searchId, onBack, onReSearch }: SearchResultViewProps) {
  // ✅ 기존 page.tsx의 모든 상태들 그대로 복사
  const [isSearching, setIsSearching] = useState(false)
  const [lawData, setLawData] = useState<any>(null)
  const [lawSelectionState, setLawSelectionState] = useState<any>(null)
  const [ordinanceSelectionState, setOrdinanceSelectionState] = useState<any>(null)
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [comparisonModal, setComparisonModal] = useState<any>({ isOpen: false })
  const [summaryDialog, setSummaryDialog] = useState<any>({ isOpen: false })
  const [articleNotFound, setArticleNotFound] = useState<any>(null)
  const [aiAnswerContent, setAiAnswerContent] = useState<string>('')
  const [aiRelatedLaws, setAiRelatedLaws] = useState<any[]>([])
  const [isAiMode, setIsAiMode] = useState(false)
  const [comparisonLaw, setComparisonLaw] = useState<any>(null)
  const [isLoadingComparison, setIsLoadingComparison] = useState(false)

  // 프로그레스 상태
  const [loadingStage, setLoadingStage] = useState<string>('')
  const [loadingProgress, setLoadingProgress] = useState(0)

  /**
   * 초기 로드: IndexedDB 캐시 확인
   */
  useEffect(() => {
    async function loadSearchResult() {
      try {
        const cached = await getSearchResult(searchId)

        if (!cached) {
          // 캐시 없으면 메인으로 리다이렉트
          debugLogger.warning('검색 결과 없음 - 메인으로 이동')
          onBack()
          return
        }

        // 캐시에 lawData가 있으면 바로 표시
        if (cached.lawData) {
          debugLogger.success('캐시된 검색 결과 로드', { searchId })
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
          return
        }

        // 캐시에 쿼리만 있으면 실제 검색 실행
        debugLogger.info('캐시에 쿼리만 존재 - 검색 실행', cached.query)
        await executeSearch(cached.query)

      } catch (error) {
        debugLogger.error('검색 결과 로드 실패', error)
        onBack()
      }
    }

    loadSearchResult()

    // 즐겨찾기 구독
    const unsubscribe = favoritesStore.subscribe((favs) => {
      const joSet = new Set(favs.map((f) => f.jo))
      setFavorites(joSet)
    })

    const initialFavs = favoritesStore.getFavorites()
    const joSet = new Set(initialFavs.map((f) => f.jo))
    setFavorites(joSet)

    return unsubscribe
  }, [searchId])

  /**
   * 실제 검색 실행 (기존 handleSearch 로직 그대로)
   */
  async function executeSearch(query: { lawName: string; article?: string; jo?: string }) {
    // ✅ 기존 page.tsx의 handleSearch 로직 그대로 복사
    // 여기에 전체 검색 로직 구현
  }

  // ✅ 기존 page.tsx의 모든 핸들러 함수들 그대로 복사
  // - handleLawSelect
  // - handleOrdinanceSelect
  // - fetchLawContent
  // - handleCompare
  // - handleSummarize
  // - handleToggleFavorite
  // - handleCitationClick
  // - 등등...

  return (
    <>
      {/* 검색창 (재검색 가능) */}
      <div className="mb-6">
        <SearchBar onSearch={onReSearch} isLoading={isSearching} />
      </div>

      {/* 프로그레스 UI */}
      {loadingStage && loadingStage !== 'complete' && (
        <SearchProgress
          mode={isAiMode ? 'ai' : 'law'}
          stage={loadingStage}
          lawName={lawData?.meta?.lawTitle}
          progress={loadingProgress}
        />
      )}

      {/* ✅ 기존 page.tsx의 렌더링 로직 그대로 복사 */}
      {/* 법령 선택 화면 */}
      {lawSelectionState && (
        <div className="flex flex-col items-center justify-center py-4 md:py-12 gap-4 md:gap-8">
          {/* ... 기존 코드 그대로 ... */}
        </div>
      )}

      {/* 조례 선택 화면 */}
      {ordinanceSelectionState && (
        <div className="flex flex-col items-center justify-center py-4 md:py-12 gap-4 md:gap-8">
          {/* ... 기존 코드 그대로 ... */}
        </div>
      )}

      {/* 검색 결과 화면 (LawViewer) */}
      {lawData && loadingStage === 'complete' && (
        <div className="flex flex-col md:flex-row gap-6">
          {articleNotFound && (
            <ArticleNotFoundBanner
              {...articleNotFound}
              onSelectArticle={(jo) => {
                setLawData(prev => prev ? { ...prev, selectedJo: jo } : null)
              }}
              onSelectCrossLaw={(lawTitle) => {
                onReSearch({ lawName: lawTitle })
              }}
              onDismiss={() => setArticleNotFound(null)}
            />
          )}
          {lawData.searchResultId && !isAiMode && (
            <div className="px-4 py-3 bg-muted/50 rounded-lg border">
              <FeedbackButtons
                searchQueryId={lawData.searchQueryId}
                searchResultId={lawData.searchResultId}
                lawId={lawData.meta.lawId}
                lawTitle={lawData.meta.lawTitle}
                articleNumber={lawData.selectedJo}
              />
            </div>
          )}
          <LawViewer
            meta={lawData.meta}
            articles={lawData.articles}
            selectedJo={lawData.selectedJo}
            viewMode={lawData.viewMode}
            onCompare={handleCompare}
            onSummarize={handleSummarize}
            onToggleFavorite={handleToggleFavorite}
            favorites={favorites}
            isOrdinance={lawData.isOrdinance}
            aiAnswerMode={isAiMode}
            aiAnswerContent={aiAnswerContent}
            relatedArticles={aiRelatedLaws}
            onRelatedArticleClick={handleCitationClick}
            comparisonLawMeta={comparisonLaw?.meta || null}
            comparisonLawArticles={comparisonLaw?.articles || []}
            comparisonLawSelectedJo={comparisonLaw?.selectedJo}
            isLoadingComparison={isLoadingComparison}
          />
        </div>
      )}

      {/* 모달들 */}
      {lawData && (
        <>
          <ComparisonModal
            isOpen={comparisonModal.isOpen}
            onClose={() => setComparisonModal({ isOpen: false })}
            lawTitle={lawData.meta.lawTitle}
            lawId={lawData.meta.lawId}
            mst={lawData.meta.mst}
            targetJo={comparisonModal.jo}
          />

          {summaryDialog.isOpen && summaryDialog.oldContent && summaryDialog.newContent && (
            <AISummaryDialog
              isOpen={summaryDialog.isOpen}
              onClose={() => setSummaryDialog({ isOpen: false })}
              lawTitle={lawData.meta.lawTitle}
              joNum={summaryDialog.jo || ""}
              oldContent={summaryDialog.oldContent}
              newContent={summaryDialog.newContent}
              effectiveDate={summaryDialog.effectiveDate}
            />
          )}
        </>
      )}
    </>
  )
}
```

**핵심 전략**:
- 기존 `page.tsx`의 **검색 결과 관련 모든 코드를 그대로 복사**
- UI는 **한 글자도 바꾸지 않음**
- 추가 기능: 프로그레스 UI + IndexedDB 캐싱

---

### **Phase 4: 메인 페이지 통합**

**파일**: `app/page.tsx` (MODIFY - 대폭 단순화)

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
  initializeHistory,
  type HistoryState
} from '@/lib/history-manager'
import {
  generateSearchId,
  saveSearchResult,
  deleteExpiredResults
} from '@/lib/search-result-store'
import { debugLogger } from '@/lib/debug-logger'
import { useToast } from '@/hooks/use-toast'
import type { Favorite } from '@/lib/law-types'

export default function Home() {
  const { toast } = useToast()

  const [viewMode, setViewMode] = useState<'home' | 'search-result'>('home')
  const [searchId, setSearchId] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [favoritesDialogOpen, setFavoritesDialogOpen] = useState(false)

  /**
   * 초기화: History 상태 복원 + 만료 캐시 정리
   */
  useEffect(() => {
    // 만료된 캐시 정리
    deleteExpiredResults()

    // History 초기화 (새로고침 시 상태 유지)
    initializeHistory()

    // 현재 History 상태 확인
    const currentState = getCurrentHistoryState()

    if (currentState?.viewMode === 'search-result' && currentState.searchId) {
      // 새로고침 시 검색 결과 복원
      debugLogger.info('새로고침 - 검색 결과 복원', { searchId: currentState.searchId })
      setViewMode('search-result')
      setSearchId(currentState.searchId)
    } else {
      // 홈 화면
      setViewMode('home')
      setSearchId(null)
    }

    // popstate 이벤트 처리 (뒤로가기/앞으로가기)
    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as HistoryState | null

      if (state?.viewMode === 'home') {
        debugLogger.info('뒤로가기 - 메인 화면')
        setViewMode('home')
        setSearchId(null)
      } else if (state?.viewMode === 'search-result' && state.searchId) {
        debugLogger.info('앞으로가기 - 검색 결과', { searchId: state.searchId })
        setViewMode('search-result')
        setSearchId(state.searchId)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  /**
   * 검색 핸들러
   */
  const handleSearch = async (query: { lawName: string; article?: string; jo?: string }) => {
    try {
      setIsSearching(true)
      debugLogger.info('검색 시작', query)

      // 1. 검색 ID 생성
      const newSearchId = generateSearchId()

      // 2. IndexedDB에 쿼리 저장 (영구 - 7일)
      await saveSearchResult({
        searchId: newSearchId,
        query,
        timestamp: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
      })

      // 3. History에 상태 추가 (URL은 / 유지)
      pushSearchHistory(newSearchId)

      // 4. 뷰 전환
      setSearchId(newSearchId)
      setViewMode('search-result')

    } catch (error) {
      debugLogger.error('검색 시작 실패', error)
      toast({
        title: '검색 오류',
        description: '검색을 시작할 수 없습니다',
        variant: 'destructive'
      })
    } finally {
      setIsSearching(false)
    }
  }

  /**
   * 메인으로 이동 (헤더 클릭)
   */
  const handleReset = () => {
    debugLogger.info('메인으로 이동')
    pushHomeHistory()
    setViewMode('home')
    setSearchId(null)
  }

  /**
   * 즐겨찾기 선택
   */
  const handleFavoriteSelect = (favorite: Favorite) => {
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
              onBack={handleReset}
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

**코드 라인 수**: 1984줄 → **~200줄** (90% 감소)

---

### **Phase 5: SearchBar AI 모드 강화**

**파일**: `components/search-bar.tsx` (MODIFY)

```typescript
// Brain 아이콘 import 추가
import { Brain } from 'lucide-react'

export function SearchBar({ onSearch, isLoading, searchMode }: SearchBarProps) {
  const [query, setQuery] = useState("")
  const [forceAiMode, setForceAiMode] = useState(false)  // NEW

  // 자동 감지 + 수동 전환 병합
  const isAiMode = forceAiMode || (searchMode === 'rag')

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-3xl relative">
      <div className="flex gap-2">
        {/* AI 모드 전환 버튼 (왼쪽 추가) */}
        <Button
          type="button"
          variant={forceAiMode ? "default" : "outline"}
          size="icon"
          onClick={() => setForceAiMode(!forceAiMode)}
          className={cn(
            "h-12 w-12 transition-all duration-300",
            forceAiMode && "bg-gradient-to-br from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600"
          )}
          title={forceAiMode ? "기본 검색으로 전환" : "AI 검색으로 전환"}
        >
          <Brain className={cn("h-5 w-5", forceAiMode && "animate-pulse")} />
        </Button>

        {/* 검색 입력창 */}
        <div className="relative flex-1">
          {isAiMode ? (
            <Brain className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-purple-500 animate-pulse" />
          ) : searchType === "ordinance" ? (
            <Building2 className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-500" />
          ) : searchType === "law" ? (
            <Scale className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-amber-500" />
          ) : (
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          )}

          <Input
            ref={inputRef}
            type="text"
            placeholder={isAiMode
              ? '✨ 자연어로 질문해보세요 (예: "수입 관세는 언제 납부하나요?")'
              : '예: "민법 제1조", "관세법", "서울특별시 청소년 조례"'
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={cn(
              "pl-11 h-12 text-base transition-all duration-500",
              isAiMode && [
                "ring-2 ring-purple-500/70 border-purple-400",
                "shadow-[0_0_30px_rgba(168,85,247,0.5)]",
                "bg-gradient-to-r from-purple-50/70 to-blue-50/70",
                "dark:from-purple-950/30 dark:to-blue-950/30",
                "animate-glow-pulse"
              ]
            )}
            disabled={isLoading}
          />
        </div>

        {/* 검색 버튼 */}
        <Button
          type="submit"
          size="lg"
          disabled={isLoading || !query.trim()}
          className={cn(
            "h-12 px-6 sm:px-8 transition-all duration-300",
            isAiMode && [
              "bg-gradient-to-r from-purple-600 to-blue-600",
              "hover:from-purple-700 hover:to-blue-700",
              "shadow-lg shadow-purple-500/50",
              "font-semibold"
            ]
          )}
        >
          {isLoading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 검색 중</>
          ) : (
            <>
              {isAiMode && <Brain className="mr-2 h-4 w-4" />}
              <span className="hidden sm:inline">{isAiMode ? 'AI 검색' : '검색'}</span>
              <span className="sm:hidden">검색</span>
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
```

**파일**: `app/globals.css` (MODIFY)

```css
/* AI 모드 글로우 펄스 애니메이션 */
@keyframes glow-pulse {
  0%, 100% {
    box-shadow: 0 0 20px rgba(168, 85, 247, 0.4);
  }
  50% {
    box-shadow: 0 0 40px rgba(168, 85, 247, 0.7);
  }
}

.animate-glow-pulse {
  animation: glow-pulse 2s ease-in-out infinite;
}
```

---

### **Phase 6: 설정 페이지**

#### 6.1 Header에 설정 버튼 추가
**파일**: `components/header.tsx` (MODIFY)

```tsx
import { Settings } from 'lucide-react'

interface HeaderProps {
  onReset?: () => void
  onFavoritesClick?: () => void
  onSettingsClick?: () => void  // NEW
}

export function Header({ onReset, onFavoritesClick, onSettingsClick }: HeaderProps) {
  // ... 기존 코드 ...

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* 로고 */}
        <button onClick={handleHomeClick}>...</button>

        {/* 우측 버튼들 */}
        <div className="flex items-center gap-2">
          {/* 즐겨찾기 */}
          {favoritesCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onFavoritesClick}>
              <Star className="h-5 w-5" />
              <Badge variant="secondary">{favoritesCount}</Badge>
            </Button>
          )}

          {/* 설정 (NEW) */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onSettingsClick}
            title="설정"
          >
            <Settings className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
          </Button>
        </div>
      </div>
    </header>
  )
}
```

#### 6.2 설정 페이지
**파일**: `app/admin/settings/page.tsx` (NEW)

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Lock, ArrowLeft } from 'lucide-react'
import { debugLogger } from '@/lib/debug-logger'

const ADMIN_PASSWORD = '1234'

export default function SettingsPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (password === ADMIN_PASSWORD) {
      debugLogger.success('관리자 인증 성공')
      router.push('/admin/law-upload')
    } else {
      setError('비밀번호가 올바르지 않습니다')
      setPassword('')
      debugLogger.warning('관리자 인증 실패')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-8 p-8">
        {/* 헤더 */}
        <div className="text-center">
          <Lock className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-6 text-3xl font-bold">관리자 설정</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            RAG 관리 페이지 접근을 위해 비밀번호를 입력하세요
          </p>
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div>
            <Input
              type="password"
              placeholder="비밀번호 (4자리)"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError('')
              }}
              className="text-center text-2xl tracking-widest"
              maxLength={4}
              autoFocus
            />
            {error && (
              <p className="mt-2 text-sm text-red-500 text-center animate-shake">
                {error}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Button type="submit" className="w-full" size="lg">
              확인
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => router.push('/')}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              취소
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

**파일**: `app/globals.css` (MODIFY)

```css
/* 비밀번호 오류 쉐이크 애니메이션 */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
  20%, 40%, 60%, 80% { transform: translateX(5px); }
}

.animate-shake {
  animation: shake 0.5s ease-in-out;
}
```

---

## 📊 구현 순서 체크리스트

### ✅ Phase 1: 인프라
- [ ] `lib/search-id-generator.ts` 생성
- [ ] `lib/search-result-store.ts` 생성 (IndexedDB)
- [ ] `lib/history-manager.ts` 생성 (History API)
- [ ] IndexedDB 초기화 테스트

### ✅ Phase 2: UI 컴포넌트
- [ ] `components/search-progress.tsx` 생성
- [ ] `app/globals.css` 애니메이션 추가

### ✅ Phase 3: 컴포넌트 분리
- [ ] `components/search-view.tsx` 생성
- [ ] `components/search-result-view.tsx` 생성 (기존 로직 복사)

### ✅ Phase 4: 메인 페이지 통합
- [ ] `app/page.tsx` 수정 (History API + 조건부 렌더링)

### ✅ Phase 5: SearchBar 개선
- [ ] AI 모드 전환 버튼 추가
- [ ] Brain 아이콘 + 글로우 효과

### ✅ Phase 6: 설정 페이지
- [ ] `components/header.tsx` 설정 버튼 추가
- [ ] `app/admin/settings/page.tsx` 생성

### ✅ Phase 7: 테스트
- [ ] 검색 → 결과 표시 (URL 그대로 /)
- [ ] F5 새로고침 → 결과 유지
- [ ] 뒤로가기 → 메인 화면
- [ ] 앞으로가기 → 결과 복원
- [ ] 프로그레스 UI 표시
- [ ] AI 모드 전환 동작 확인
- [ ] 설정 페이지 접근

---

## 🎯 성공 기준

### 사용자 관점
- ✅ **UI 동일**: 기존 화면 100% 동일
- ✅ **URL 깔끔**: 항상 `/` 유지
- ✅ **새로고침 안전**: F5 눌러도 검색 결과 유지
- ✅ **뒤로가기 지원**: 자연스러운 내비게이션
- ✅ **7일 캐싱**: 탭 닫아도 7일간 유지
- ✅ **프로그레스 표시**: 로딩 상태 시각화

### 개발자 관점
- ✅ **코드 분리**: 역할별 컴포넌트 분리
- ✅ **코드 단순화**: 메인 페이지 1984줄 → ~200줄
- ✅ **History API**: 브라우저 히스토리 활용
- ✅ **IndexedDB**: 영구 캐싱 (7일)
- ✅ **기존 로직 보존**: 검색/파싱/렌더링 로직 그대로

---

## 📁 파일 변경 요약

### 신규 파일 (7개)
1. `lib/search-id-generator.ts` - 검색 ID 생성
2. `lib/search-result-store.ts` - IndexedDB 캐싱
3. `lib/history-manager.ts` - History API 관리
4. `components/search-progress.tsx` - 프로그레스 UI
5. `components/search-view.tsx` - 메인 화면
6. `components/search-result-view.tsx` - 검색 결과
7. `app/admin/settings/page.tsx` - 설정 페이지

### 수정 파일 (3개)
1. `app/page.tsx` - 대폭 단순화 (~200줄)
2. `components/search-bar.tsx` - AI 모드 UI 강화
3. `components/header.tsx` - 설정 버튼 추가

### CSS 추가
1. `app/globals.css` - 애니메이션 2개 추가

---

## 🚨 주의사항

### 1. 코드 복사 시 누락 방지
**중요**: `search-result-view.tsx`에 기존 page.tsx의 모든 함수 복사 필수
- [ ] `convertArticleNumberToCode`
- [ ] `extractContentFromHangArray`
- [ ] `parseLawJSON`
- [ ] `fetchLawContent`
- [ ] `handleLawSelect`
- [ ] `handleOrdinanceSelect`
- [ ] `handleCompare`
- [ ] `handleSummarize`
- [ ] `handleToggleFavorite`
- [ ] `handleCitationClick`
- [ ] 기타 모든 핸들러

### 2. AI 스트리밍 중 페이지 이탈
**해결**: `beforeunload` 이벤트 처리

```typescript
useEffect(() => {
  if (loadingStage === 'streaming') {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      return '답변 생성 중입니다. 페이지를 나가시겠습니까?'
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }
}, [loadingStage])
```

### 3. IndexedDB 브라우저 호환성
**지원**: Chrome, Firefox, Safari, Edge (모든 현대 브라우저)
**미지원**: IE11 이하 (무시 가능)

---

## 🏁 다음 단계

Phase 1부터 순차적으로 구현합니다. 준비되시면 시작하겠습니다! 🚀
