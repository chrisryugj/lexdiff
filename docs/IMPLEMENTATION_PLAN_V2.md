# LexDiff 페이지 분리 리팩토링 계획 (수정본)

## 📋 목표

**현재 문제**:
- `app/page.tsx` 1984줄 → 단일 파일에 모든 로직 집중
- 검색 + 결과 표시가 한 페이지에서 동작 (상태 복잡)

**리팩토링 목표**:
1. **페이지 분리**: 메인(`/`) + 검색 결과(`/search/[id]`)
2. **코드 단순화**: 메인은 검색만, 결과 페이지는 표시만
3. **UI 유지**: 현재 디자인 **완전히 그대로** (사용자는 변화 못 느낌)
4. **검색 결과 영구 보존**: IndexedDB로 뒤로가기/새로고침 지원
5. **UX 개선 추가**: 프로그레스 UI, AI 모드 강화, 설정 페이지
6. **한글 URL 지원**: 국가법령정보센터 스타일 (`/search/관세법/제38조`)

---

## 🎯 핵심 원칙

- ✅ **UI 변경 없음**: 현재 화면 레이아웃 그대로 유지
- ✅ **로직 분리만**: 메인(검색 입력) / 결과(표시 + 모든 기능)
- ✅ **기존 컴포넌트 재사용**: LawViewer, ComparisonModal 등 이동만
- ✅ **점진적 리팩토링**: 단계별로 안전하게 진행

---

## 📐 아키텍처 비교

### **현재 구조 (Before)**

```
app/page.tsx (1984줄)
├── 상태 (15개 이상)
│   ├── lawData, lawSelectionState, ordinanceSelectionState
│   ├── ragResults, ragAnswer, aiAnswerContent
│   ├── comparisonModal, summaryDialog
│   └── favorites, articleNotFound, ...
├── 검색 핸들러 (handleSearch)
│   ├── API 호출 (law-search, eflaw, ordin-search, file-search-rag)
│   ├── 파싱 (parseLawJSON, parseOrdinanceXML)
│   └── 상태 업데이트
├── UI 렌더링
│   ├── !lawData → 메인 화면 (검색창 + 로고)
│   ├── lawSelectionState → 법령 선택 화면
│   ├── lawData → 검색 결과 화면 (LawViewer)
│   └── 모달들 (ComparisonModal, AISummaryDialog, ...)
```

### **리팩토링 후 (After)**

```
app/page.tsx (~200줄)
├── 상태 (2개)
│   ├── isSearching
│   └── favoritesDialogOpen
├── 검색 핸들러 (handleSearch)
│   ├── 검색 ID 생성
│   ├── IndexedDB에 쿼리 저장
│   └── router.push(/search/[id])
└── UI 렌더링
    ├── 검색창 + 로고 (현재 !lawData일 때랑 동일)
    └── FavoritesPanel

app/search/[id]/page.tsx (~1800줄)
├── 상태 (기존 page.tsx의 모든 상태 이동)
├── 검색 실행 로직 (기존 handleSearch 내부 로직)
│   ├── IndexedDB 캐시 확인
│   ├── API 호출 + 파싱
│   └── 프로그레스 UI 업데이트
└── UI 렌더링 (기존 lawData 있을 때랑 동일)
    ├── LawViewer (똑같음)
    ├── ComparisonModal (똑같음)
    ├── AISummaryDialog (똑같음)
    └── 모든 기능 그대로
```

**변경점**:
- **사용자 관점**: 검색 후 URL이 바뀜 (`/` → `/search/xxx`)
- **개발자 관점**: 코드가 2개 파일로 분리 (역할 명확)

---

## 🏗️ 구현 단계

### **Phase 1: 인프라 구축**

#### 1.1 검색 ID 생성 유틸리티
**파일**: `lib/search-id-generator.ts` (NEW)

```typescript
/**
 * 검색 쿼리 → URL-safe ID 생성
 * 예: { lawName: "관세법", article: "38조" } → "lex-1731734400000-abc123"
 */
export function generateSearchId(query: {
  lawName: string
  article?: string
  jo?: string
}): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `lex-${timestamp}-${random}`
}

/**
 * ID에서 쿼리 정보 추출 (선택적)
 * 현재는 IndexedDB에서 조회하므로 불필요할 수 있음
 */
export function parseSearchId(id: string): { timestamp: number } | null {
  const match = id.match(/^lex-(\d+)-/)
  if (!match) return null
  return { timestamp: parseInt(match[1]) }
}
```

---

#### 1.2 검색 결과 캐싱 스토어
**파일**: `lib/search-result-store.ts` (NEW)

```typescript
/**
 * IndexedDB를 사용한 검색 결과 캐싱
 * Database: LexDiffSearchCache
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

// IndexedDB 초기화
async function initDB(): Promise<IDBDatabase>

// 검색 결과 저장
export async function saveSearchResult(cache: SearchResultCache): Promise<void>

// 검색 결과 조회
export async function getSearchResult(searchId: string): Promise<SearchResultCache | null>

// 만료된 결과 삭제 (앱 시작 시 호출)
export async function cleanupExpiredResults(): Promise<void>

// 특정 검색 결과 삭제
export async function deleteSearchResult(searchId: string): Promise<void>
```

**특징**:
- **기존 상태 구조 그대로 저장**: 호환성 100%
- **만료 시간**: 7일 (조정 가능)
- **자동 정리**: 페이지 로드 시 만료 항목 삭제

---

### **Phase 2: 프로그레스 UI 컴포넌트**

#### 2.1 통합 검색 프로그레스
**파일**: `components/search-progress.tsx` (NEW)

```typescript
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
export function SearchProgress({ mode, stage, lawName, progress }: SearchProgressProps)
```

**UI 디자인**:
```tsx
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
          <StageItem label="File Search 연결" status={getStatus('connecting', stage)} />
          <StageItem label="관련 법령 검색" status={getStatus('searching', stage)} />
          <StageItem label="AI 답변 생성" status={getStatus('streaming', stage)} />
          <StageItem label="관련 법령 추출" status={getStatus('extracting', stage)} />
        </>
      ) : (
        <>
          <StageItem label="법령 검색" status={getStatus('searching', stage)} />
          <StageItem label="데이터 파싱" status={getStatus('parsing', stage)} />
          <StageItem label="렌더링 준비" status={getStatus('rendering', stage)} />
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

### **Phase 3: SearchBar AI 모드 강화**

**파일**: `components/search-bar.tsx` (MODIFY)

#### 3.1 AI 모드 수동 전환 버튼 추가

```tsx
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

#### 3.2 커스텀 애니메이션 추가
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

### **Phase 4: 메인 페이지 리팩토링**

**파일**: `app/page.tsx` (MODIFY - 대폭 단순화)

#### 4.1 제거할 코드 (기존 1984줄 → ~200줄)

```typescript
// ❌ 제거할 상태들
// const [lawData, setLawData] = useState(...)
// const [lawSelectionState, setLawSelectionState] = useState(...)
// const [ordinanceSelectionState, setOrdinanceSelectionState] = useState(...)
// const [ragResults, setRagResults] = useState(...)
// const [ragAnswer, setRagAnswer] = useState(...)
// const [aiAnswerContent, setAiAnswerContent] = useState(...)
// const [comparisonModal, setComparisonModal] = useState(...)
// const [summaryDialog, setSummaryDialog] = useState(...)
// const [articleNotFound, setArticleNotFound] = useState(...)

// ❌ 제거할 함수들
// const fetchLawContent = async (...) => { ... }
// const handleLawSelect = async (...) => { ... }
// const handleOrdinanceSelect = async (...) => { ... }
// const handleCompare = (...) => { ... }
// const handleSummarize = (...) => { ... }
// const handleToggleFavorite = (...) => { ... }
// const handleCitationClick = async (...) => { ... }

// ❌ 제거할 렌더링 블록
// - lawSelectionState 처리
// - ordinanceSelectionState 처리
// - lawData 처리 (LawViewer 전체)
// - ComparisonModal, AISummaryDialog
```

#### 4.2 새 메인 페이지 구조

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { SearchBar } from '@/components/search-bar'
import { FavoritesPanel } from '@/components/favorites-panel'
import { FavoritesDialog } from '@/components/favorites-dialog'
import { generateSearchId, saveSearchResult } from '@/lib/search-result-store'
import { detectQueryType } from '@/lib/query-detector'
import { debugLogger } from '@/lib/debug-logger'
import { useToast } from '@/hooks/use-toast'

export default function Home() {
  const router = useRouter()
  const { toast } = useToast()

  const [isSearching, setIsSearching] = useState(false)
  const [favoritesDialogOpen, setFavoritesDialogOpen] = useState(false)

  /**
   * 검색 핸들러: 쿼리만 받아서 검색 결과 페이지로 넘김
   */
  const handleSearch = async (query: { lawName: string; article?: string; jo?: string }) => {
    try {
      setIsSearching(true)
      debugLogger.info('검색 시작', query)

      // 1. 검색 ID 생성
      const searchId = generateSearchId(query)

      // 2. IndexedDB에 초기 쿼리 저장
      await saveSearchResult({
        searchId,
        query,
        timestamp: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
      })

      // 3. 검색 결과 페이지로 이동 (로딩 모드)
      router.push(`/search/${searchId}`)

    } catch (error) {
      debugLogger.error('검색 시작 실패', error)
      toast({ title: '검색 오류', description: '검색을 시작할 수 없습니다', variant: 'destructive' })
    } finally {
      setIsSearching(false)
    }
  }

  /**
   * 즐겨찾기 선택 핸들러
   */
  const handleFavoriteSelect = async (favorite: Favorite) => {
    const query = {
      lawName: favorite.lawTitle,
      jo: favorite.jo
    }
    await handleSearch(query)
  }

  /**
   * 헤더 리셋 핸들러
   */
  const handleReset = () => {
    router.push('/')
  }

  /**
   * 설정 페이지 이동
   */
  const handleSettingsClick = () => {
    router.push('/admin/settings')
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
          {/* 메인 화면: 현재 !lawData일 때랑 완전히 동일 */}
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
            <SearchBar onSearch={handleSearch} isLoading={isSearching} />

            {/* 즐겨찾기 패널 */}
            <FavoritesPanel onSelect={handleFavoriteSelect} />
          </div>
        </div>
      </main>

      <FavoritesDialog
        isOpen={favoritesDialogOpen}
        onClose={() => setFavoritesDialogOpen(false)}
        onSelect={handleFavoriteSelect}
      />

      <footer className="border-t border-border py-6">
        <div className="container mx-auto px-6">
          <p className="text-center text-sm text-muted-foreground">
            © 2025 Chris ryu. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
```

**코드 라인 수**: 1984줄 → **~150줄** (90% 감소)

---

### **Phase 5: 검색 결과 페이지 생성**

**파일**: `app/search/[id]/page.tsx` (NEW - 기존 page.tsx 로직 이동)

```typescript
'use client'

import { use, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { SearchBar } from '@/components/search-bar'
import { LawViewer } from '@/components/law-viewer'
import { ComparisonModal } from '@/components/comparison-modal'
import { AISummaryDialog } from '@/components/ai-summary-dialog'
import { FavoritesDialog } from '@/components/favorites-dialog'
import { ArticleNotFoundBanner } from '@/components/article-not-found-banner'
import { FeedbackButtons } from '@/components/feedback-buttons'
import { SearchProgress } from '@/components/search-progress'
import { LawSelector } from '@/components/law-selector'
import { getSearchResult, saveSearchResult } from '@/lib/search-result-store'
import { debugLogger } from '@/lib/debug-logger'
import type { LawMeta, LawArticle, Favorite } from '@/lib/law-types'

// ⚠️ 기존 page.tsx의 모든 helper 함수들 복사
// - convertArticleNumberToCode
// - extractContentFromHangArray
// - parseLawJSON
// - 기타 유틸리티 함수들

export default function SearchResultPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const resolvedParams = use(params)
  const searchId = resolvedParams.id
  const router = useRouter()

  // ✅ 기존 page.tsx의 모든 상태들 그대로 복사
  const [isSearching, setIsSearching] = useState(false)
  const [lawData, setLawData] = useState<{
    meta: LawMeta
    articles: LawArticle[]
    selectedJo?: string
    isOrdinance?: boolean
    viewMode?: "single" | "full"
    searchQueryId?: number
    searchResultId?: number
  } | null>(null)
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
  const [favoritesDialogOpen, setFavoritesDialogOpen] = useState(false)

  // 프로그레스 상태 (NEW)
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
          router.push('/')
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
        router.push('/')
      }
    }

    loadSearchResult()
  }, [searchId])

  /**
   * 실제 검색 실행 (기존 handleSearch 로직)
   */
  async function executeSearch(query: { lawName: string; article?: string; jo?: string }) {
    try {
      setIsSearching(true)
      setLoadingStage('searching')
      setLoadingProgress(20)

      // ✅ 기존 page.tsx의 handleSearch 로직 그대로 복사
      // - detectQueryType
      // - law-search API 호출
      // - eflaw API 호출
      // - ordin-search / ordin API 호출
      // - file-search-rag API 호출 (AI 모드)
      // - parseLawJSON / parseOrdinanceXML
      // - 상태 업데이트

      setLoadingStage('parsing')
      setLoadingProgress(60)

      // ... 파싱 로직 ...

      setLoadingStage('rendering')
      setLoadingProgress(90)

      // 결과를 IndexedDB에 저장
      await saveSearchResult({
        searchId,
        query,
        lawData,
        lawSelectionState,
        ordinanceSelectionState,
        aiMode: isAiMode ? { aiAnswerContent, aiRelatedLaws, comparisonLaw } : undefined,
        timestamp: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
      })

      setLoadingStage('complete')
      setLoadingProgress(100)

    } catch (error) {
      debugLogger.error('검색 실행 실패', error)
      setLoadingStage('error')
    } finally {
      setIsSearching(false)
    }
  }

  /**
   * 재검색 핸들러 (검색 결과 페이지에서 새로운 검색)
   */
  const handleReSearch = async (query: { lawName: string; article?: string; jo?: string }) => {
    const newSearchId = generateSearchId(query)
    await saveSearchResult({
      searchId: newSearchId,
      query,
      timestamp: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
    })
    router.push(`/search/${newSearchId}`)
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
    <div className="flex min-h-screen flex-col">
      <Header
        onReset={() => router.push('/')}
        onFavoritesClick={() => setFavoritesDialogOpen(true)}
        onSettingsClick={() => router.push('/admin/settings')}
      />

      <main className="flex-1">
        <div className="container mx-auto p-6">
          {/* 검색창 (재검색 가능) */}
          <div className="mb-6">
            <SearchBar onSearch={handleReSearch} isLoading={isSearching} />
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
              {/* ... 기존 코드 그대로 ... */}
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
        </div>
      </main>

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

      <FavoritesDialog
        isOpen={favoritesDialogOpen}
        onClose={() => setFavoritesDialogOpen(false)}
        onSelect={handleFavoriteSelect}
      />
    </div>
  )
}
```

**핵심 전략**:
- 기존 `page.tsx`의 **검색 결과 관련 모든 코드를 그대로 복사**
- UI는 **한 글자도 바꾸지 않음** (사용자는 차이를 못 느낌)
- 추가 기능: 프로그레스 UI + IndexedDB 캐싱

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

#### 6.3 에러 애니메이션 추가
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

### **Phase 7: 테스트 및 검증**

#### 7.1 기능 테스트
- [ ] 메인 페이지에서 검색 → `/search/[id]`로 이동
- [ ] 법령 검색 결과 표시 (기존 UI와 동일)
- [ ] AI 검색 결과 표시 (기존 UI와 동일)
- [ ] 프로그레스 UI 표시 (법령/AI 각각)
- [ ] 뒤로가기 → 메인 페이지
- [ ] 앞으로가기 → 검색 결과 (캐시 복원)
- [ ] 새로고침 → 검색 결과 유지
- [ ] 재검색 (검색 결과 페이지에서)
- [ ] 즐겨찾기 클릭 → 검색 결과 페이지 이동
- [ ] 설정 페이지 접근 (비밀번호 1234)

#### 7.2 UI 테스트
- [ ] 메인 페이지 UI 동일
- [ ] 검색 결과 페이지 UI 동일
- [ ] LawViewer 동작 동일
- [ ] ComparisonModal 동작 동일
- [ ] AISummaryDialog 동작 동일
- [ ] 모바일 반응형 확인

#### 7.3 성능 테스트
- [ ] IndexedDB 저장 속도 확인
- [ ] 캐시 조회 속도 확인 (< 50ms)
- [ ] 페이지 이동 속도 확인 (< 100ms)
- [ ] AI 스트리밍 끊김 없음 확인

---

### **Phase 8: 한글 URL 지원 (선택적 - 마지막 단계)**

⚠️ **주의**: 이 단계는 Phase 1-7이 모두 완료되고 안정화된 후에 진행

#### 8.1 라우팅 구조 변경

**현재** (Phase 1-7):
```
/search/lex-1731734400000-abc123
```

**변경 후**:
```
/search/관세법
/search/관세법/제38조
/search/민법/제1조
```

#### 8.2 파일 구조 변경

**Before**:
```
app/search/[id]/page.tsx
```

**After**:
```
app/search/[...slug]/page.tsx
```

#### 8.3 URL 생성 유틸리티 수정

**파일**: `lib/search-id-generator.ts` (MODIFY)

```typescript
/**
 * 한글 URL 생성 (Phase 8)
 */
export function generateSearchUrl(query: {
  lawName: string
  article?: string
}): string {
  // 법령명 정규화 (공백 → 하이픈)
  const normalizedLawName = query.lawName.trim().replace(/\s+/g, '-')

  // 조문이 있으면 추가
  if (query.article) {
    const normalizedArticle = query.article.trim().replace(/\s+/g, '-')
    return `/search/${normalizedLawName}/${normalizedArticle}`
  }

  return `/search/${normalizedLawName}`
}

/**
 * URL에서 쿼리 파싱
 */
export function parseSearchUrl(slug: string[]): {
  lawName: string
  article?: string
} | null {
  if (slug.length === 0) return null

  return {
    lawName: decodeURIComponent(slug[0]).replace(/-/g, ' '),
    article: slug[1] ? decodeURIComponent(slug[1]).replace(/-/g, ' ') : undefined
  }
}
```

#### 8.4 메인 페이지 수정

```typescript
const handleSearch = async (query: { lawName: string; article?: string }) => {
  // Phase 8: 한글 URL 사용
  const searchUrl = generateSearchUrl(query)

  // IndexedDB 캐시 키는 URL
  await saveSearchResult({
    cacheKey: searchUrl,
    query,
    timestamp: Date.now(),
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
  })

  router.push(searchUrl)
}
```

#### 8.5 검색 결과 페이지 수정

```typescript
export default function SearchResultPage({
  params
}: {
  params: Promise<{ slug: string[] }>
}) {
  const resolvedParams = use(params)
  const slug = resolvedParams.slug

  // URL 파싱
  const query = parseSearchUrl(slug)

  if (!query) {
    router.push('/')
    return null
  }

  // 캐시 키는 전체 URL
  const cacheKey = `/search/${slug.join('/')}`

  // ... 나머지 로직 동일
}
```

#### 8.6 테스트 (Phase 8)

- [ ] 한글 URL 생성 확인
- [ ] 브라우저 주소창 표시 확인
- [ ] URL 복사/붙여넣기 동작 확인
- [ ] IndexedDB 캐시 키 동작 확인
- [ ] 뒤로가기/앞으로가기 동작 확인
- [ ] 특수문자 법령명 처리 확인 (공백, 괄호 등)

---

## 📊 구현 순서 체크리스트

### ✅ Phase 1: 인프라
- [ ] `lib/search-id-generator.ts` 생성
- [ ] `lib/search-result-store.ts` 생성 (IndexedDB)
- [ ] IndexedDB 초기화 테스트

### ✅ Phase 2: UI 컴포넌트
- [ ] `components/search-progress.tsx` 생성
- [ ] `app/globals.css` 애니메이션 추가

### ✅ Phase 3: SearchBar 개선
- [ ] AI 모드 전환 버튼 추가
- [ ] Brain 아이콘 추가 (`lucide-react`)
- [ ] 글로우 효과 구현

### ✅ Phase 4: 메인 페이지
- [ ] `app/page.tsx` 대폭 단순화
- [ ] 검색 핸들러 수정 (ID 생성 → 페이지 이동)
- [ ] UI는 현재 !lawData일 때와 동일하게 유지

### ✅ Phase 5: 검색 결과 페이지
- [ ] `app/search/[id]/page.tsx` 생성
- [ ] 기존 page.tsx의 모든 로직/상태 복사
- [ ] IndexedDB 캐시 로직 추가
- [ ] 프로그레스 UI 통합

### ✅ Phase 6: 설정 페이지
- [ ] `components/header.tsx` 설정 버튼 추가
- [ ] `app/admin/settings/page.tsx` 생성
- [ ] 비밀번호 검증 (1234)

### ✅ Phase 7: 테스트
- [ ] 기본 검색 → 결과 페이지 이동 확인
- [ ] AI 검색 → 프로그레스 표시 확인
- [ ] 뒤로가기 → 캐시 복원 확인
- [ ] 새로고침 → 결과 유지 확인
- [ ] 설정 페이지 비밀번호 확인

### ✅ Phase 8: 한글 URL (선택적 - 마지막)
- [ ] `app/search/[...slug]/page.tsx`로 변경
- [ ] `lib/search-id-generator.ts` 한글 URL 함수 추가
- [ ] 메인 페이지 한글 URL 생성 로직 적용
- [ ] 검색 결과 페이지 slug 파싱 로직 적용
- [ ] 전체 흐름 재테스트

---

## 🎯 성공 기준

### 사용자 관점
- ✅ **UI 동일**: 검색 결과 화면이 현재랑 100% 동일
- ✅ **URL 변경**: 검색 후 `/search/xxx`로 이동 (북마크 가능)
- ✅ **뒤로가기 지원**: 브라우저 뒤로가기 시 결과 유지
- ✅ **프로그레스 표시**: 로딩 중 진행 상태 시각화
- ✅ **AI 모드 구분**: 검색창에서 AI 모드 명확히 인지 가능
- ✅ **한글 URL** (Phase 8): `/search/관세법/제38조`

### 개발자 관점
- ✅ **코드 단순화**: 메인 페이지 1984줄 → ~150줄
- ✅ **역할 분리**: 메인(검색 입력) / 결과(표시 + 기능)
- ✅ **기존 로직 보존**: 검색/파싱/렌더링 로직 그대로 유지
- ✅ **캐싱 추가**: IndexedDB로 성능 개선

---

## 🚨 주의사항

### 1. 코드 복사 시 누락 방지
**문제**: 기존 page.tsx의 helper 함수들을 복사할 때 누락 가능
**해결**: 체크리스트 작성
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
**문제**: 사용자가 스트리밍 중 뒤로가기 → 답변 잘림
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

### 4. Phase 8 한글 URL 주의사항
**문제**: 특수문자, 공백, 인코딩 이슈
**해결**:
- 공백 → 하이픈 변환
- 브라우저 자동 인코딩 활용
- 충분한 테스트 (특수문자 법령명)

---

## 📁 파일 변경 요약

### 신규 파일 (5개 + Phase 8에서 1개 수정)
1. `lib/search-id-generator.ts`
2. `lib/search-result-store.ts`
3. `components/search-progress.tsx`
4. `app/search/[id]/page.tsx` (Phase 1-7) → `app/search/[...slug]/page.tsx` (Phase 8)
5. `app/admin/settings/page.tsx`

### 수정 파일 (3개)
1. `app/page.tsx` - 대폭 단순화 (1984줄 → ~150줄)
2. `components/search-bar.tsx` - AI 모드 UI 강화
3. `components/header.tsx` - 설정 버튼 추가

### CSS 추가
1. `app/globals.css` - 애니메이션 2개 추가

---

## 🏁 다음 단계

**Phase 1-7**: 안정적인 기능 구현 우선
**Phase 8**: 모든 기능이 완벽히 동작한 후 한글 URL 추가

준비되시면 Phase 1부터 시작하겠습니다!
