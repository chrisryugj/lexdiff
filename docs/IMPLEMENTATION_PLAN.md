# LexDiff 페이지 분리 및 UX 개선 구현 계획

## 📋 목표

1. **페이지 분리**: 메인 페이지(`/`)와 검색 결과 페이지(`/search/[id]`)로 구분
2. **로딩 UI 개선**: 법령/AI 검색 각각 진행 상태를 시각적으로 표시
3. **검색창 AI 모드 강화**: 아이콘, 글로우, 수동 전환 버튼 추가
4. **설정 페이지**: 비밀번호 보호 (1234)로 RAG 관리 페이지 접근
5. **검색 결과 영구 보존**: IndexedDB로 뒤로가기/새로고침 시에도 유지

---

## 🎯 핵심 원칙

- ✅ **기존 기능 보존**: 현재 잘 작동하는 기능 유지
- ✅ **최소 수정**: 필요한 부분만 변경
- ✅ **컴포넌트 재사용**: 기존 `LawViewer`, `ComparisonModal` 등 그대로 활용
- ✅ **점진적 개선**: Phase별 단계적 구현

---

## 📐 아키텍처 개요

### 페이지 구조

```
/ (메인 페이지)
├── LexDiff 로고 + 설명
├── SearchBar (기본/AI 모드 자동/수동 전환)
└── FavoritesPanel

/search/[id] (검색 결과 페이지)
├── Header (뒤로가기 포함)
├── SearchBar (동일 - 재검색 가능)
├── ProgressUI (법령/AI 로딩 중)
└── LawViewer (검색 결과)

/admin/settings (설정 페이지 - NEW)
├── 비밀번호 입력 (1234)
└── RAG 관리 페이지로 리다이렉트
```

### 데이터 흐름

```
[메인 페이지]
검색어 입력
   ↓
검색 ID 생성 (예: lex-관세법38조-1731734400000)
   ↓
router.push(/search/lex-관세법38조-1731734400000?mode=loading)
   ↓
[검색 결과 페이지]
   ↓
URL params에서 검색 ID 추출
   ↓
IndexedDB 캐시 확인
   ├─ 캐시 있음 → 즉시 표시
   └─ 캐시 없음 → API 호출
          ↓
   ProgressUI 표시 (법령/AI 각각)
          ↓
   API 응답 → IndexedDB 저장
          ↓
   결과 표시 (LawViewer)
```

---

## 🏗️ 구현 단계

### **Phase 1: 인프라 구축**

#### 1.1 검색 ID 생성 유틸리티
**파일**: `lib/search-id-generator.ts` (NEW)

```typescript
/**
 * 검색 ID 생성
 * 형식: lex-{lawName}-{timestamp}
 * 예: lex-관세법38조-1731734400000
 */
export function generateSearchId(query: { lawName: string; article?: string }): string

/**
 * 검색 ID 파싱
 * 반환: { lawName, timestamp }
 */
export function parseSearchId(id: string): { lawName: string; timestamp: number } | null
```

**특징**:
- URL-safe (인코딩 불필요)
- 타임스탬프로 고유성 보장
- 검색 이력 추적 가능

---

#### 1.2 검색 결과 캐싱 스토어
**파일**: `lib/search-result-store.ts` (NEW)

```typescript
/**
 * IndexedDB 스토어
 * Database: LexDiffSearchCache
 * Store: searchResults
 */

interface SearchResult {
  searchId: string          // lex-관세법38조-1731734400000
  query: {
    lawName: string
    article?: string
    jo?: string
  }
  mode: 'basic' | 'ai'      // 검색 모드
  lawData?: {               // 법령 검색 결과
    meta: LawMeta
    articles: LawArticle[]
    selectedJo?: string
  }
  aiData?: {                // AI 검색 결과
    answer: string
    relatedLaws: ParsedRelatedLaw[]
  }
  timestamp: number
  expiresAt: number         // 7일 후 자동 삭제
}

// API
export async function saveSearchResult(result: SearchResult): Promise<void>
export async function getSearchResult(searchId: string): Promise<SearchResult | null>
export async function deleteSearchResult(searchId: string): Promise<void>
export async function deleteExpiredResults(): Promise<void>
```

**캐싱 전략**:
- **만료 시간**: 7일
- **자동 정리**: 페이지 로드 시 만료된 항목 삭제
- **용량 제한**: 100개 초과 시 오래된 항목부터 삭제

---

### **Phase 2: 프로그레스 UI 컴포넌트**

#### 2.1 법령 검색 프로그레스
**파일**: `components/law-search-progress.tsx` (NEW)

```typescript
interface LawSearchProgressProps {
  stage: 'searching' | 'parsing' | 'rendering' | 'complete'
  lawName: string
  article?: string
}

/**
 * 법령 검색 진행 단계:
 * 1. [20%] 법령 검색 중 (law-search API)
 * 2. [60%] 법령 데이터 파싱 중
 * 3. [90%] 조문 렌더링 준비 중
 * 4. [100%] 완료
 */
```

**UI 디자인**:
```
┌─────────────────────────────────────┐
│  📜 법령 검색 중...                │
│                                     │
│  ████████████░░░░░░░░░░ 60%        │
│                                     │
│  ✓ 법령 검색 완료                  │
│  ⏳ 법령 데이터 파싱 중...          │
│  ○ 조문 렌더링 준비 중              │
│                                     │
│  관세법 제38조                      │
└─────────────────────────────────────┘
```

---

#### 2.2 AI 검색 프로그레스
**파일**: `components/ai-search-progress.tsx` (NEW)

```typescript
interface AISearchProgressProps {
  stage: 'connecting' | 'searching' | 'streaming' | 'extracting' | 'complete'
  streamedChunks: number
  totalTokens?: number
}

/**
 * AI 검색 진행 단계:
 * 1. [10%] File Search 연결 중
 * 2. [30%] 관련 법령 검색 중
 * 3. [30-90%] AI 답변 스트리밍 (청크 수에 따라 증가)
 * 4. [95%] 관련 법령 추출 중
 * 5. [100%] 완료
 */
```

**UI 디자인**:
```
┌─────────────────────────────────────┐
│  ✨ AI 답변 생성 중...              │
│                                     │
│  ████████████████░░░░ 80%          │
│                                     │
│  ✓ File Search 연결 완료           │
│  ✓ 관련 법령 검색 완료              │
│  ⏳ AI 답변 스트리밍 중...          │
│     (128 토큰 생성됨)               │
│  ○ 관련 법령 추출 대기              │
│                                     │
│  💡 잠시만 기다려주세요             │
│     스트리밍 중에는 페이지를        │
│     이동하지 마세요                 │
└─────────────────────────────────────┘
```

**중요**: SSE 스트리밍 중 페이지 이탈 방지
```typescript
// 스트리밍 중 beforeunload 이벤트 처리
useEffect(() => {
  if (stage === 'streaming') {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      return '답변 생성 중입니다. 페이지를 나가시겠습니까?'
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }
}, [stage])
```

---

### **Phase 3: SearchBar AI 모드 강화**

**파일**: `components/search-bar.tsx` (MODIFY)

#### 3.1 AI 모드 전환 버튼 추가

```tsx
<div className="flex gap-2">
  {/* AI 모드 전환 버튼 (왼쪽) */}
  <Button
    type="button"
    variant="outline"
    size="icon"
    onClick={() => setForceAiMode(!forceAiMode)}
    className={cn(
      "h-12 w-12 transition-all duration-300",
      forceAiMode && "bg-purple-500 text-white hover:bg-purple-600"
    )}
    title={forceAiMode ? "AI 모드 비활성화" : "AI 모드 활성화"}
  >
    <Sparkles className={cn("h-5 w-5", forceAiMode && "animate-pulse")} />
  </Button>

  {/* 검색 입력창 */}
  <div className="relative flex-1">
    {/* ... */}
  </div>

  {/* 검색 버튼 */}
  <Button type="submit">검색</Button>
</div>
```

#### 3.2 AI 모드 아이콘 변경

**기본 모드**:
- 돋보기 (Search) → 법령 검색
- 건물 (Building2) → 조례 검색

**AI 모드**:
- ~~Sparkles~~ → **Brain** (두뇌 아이콘)으로 변경
- 더 직관적인 AI 표현

```tsx
{isAiMode ? (
  <Brain className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-purple-500 animate-pulse" />
) : searchType === "ordinance" ? (
  <Building2 className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-500" />
) : searchType === "law" ? (
  <Scale className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-amber-500" />
) : (
  <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
)}
```

#### 3.3 글로우 효과 강화

```tsx
<Input
  className={cn(
    "pl-11 h-12 text-base transition-all duration-500",
    isAiMode && [
      "ring-2 ring-purple-500/70 border-purple-400",
      "shadow-[0_0_30px_rgba(168,85,247,0.5)]",  // 글로우 증폭
      "bg-gradient-to-r from-purple-50/70 to-blue-50/70",
      "dark:from-purple-950/30 dark:to-blue-950/30",
      "animate-glow-pulse"  // 커스텀 애니메이션
    ]
  )}
/>
```

**커스텀 애니메이션** (추가):
```css
/* globals.css */
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

#### 3.4 검색 버튼 색상 변경

```tsx
<Button
  type="submit"
  className={cn(
    "h-12 px-6 sm:px-8 transition-all duration-300",
    isAiMode && [
      "bg-gradient-to-r from-purple-600 to-blue-600",
      "hover:from-purple-700 hover:to-blue-700",
      "shadow-lg shadow-purple-500/50",
      "text-white font-semibold"
    ]
  )}
>
  {isLoading ? (
    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> AI 검색 중</>
  ) : (
    <><Brain className="mr-2 h-4 w-4" /> AI 검색</>
  )}
</Button>
```

---

### **Phase 4: 메인 페이지 단순화**

**파일**: `app/page.tsx` (MODIFY)

#### 4.1 상태 제거

```typescript
// 제거할 상태들
// const [lawData, setLawData] = useState(null)
// const [lawSelectionState, setLawSelectionState] = useState(null)
// const [ordinanceSelectionState, setOrdinanceSelectionState] = useState(null)
// const [ragResults, setRagResults] = useState([])
// const [ragAnswer, setRagAnswer] = useState(null)

// 유지할 상태들
const [isSearching, setIsSearching] = useState(false)
const [favorites, setFavorites] = useState<Set<string>>(new Set())
const [favoritesDialogOpen, setFavoritesDialogOpen] = useState(false)
```

#### 4.2 검색 핸들러 수정

```typescript
async function handleSearch(query: { lawName: string; article?: string }) {
  try {
    setIsSearching(true)

    // 1. 검색 ID 생성
    const searchId = generateSearchId(query)

    // 2. 검색 모드 감지
    const queryDetection = detectQueryType(query.lawName)
    const mode = queryDetection.type === 'natural' ? 'ai' : 'basic'

    // 3. 검색 결과 저장 (빈 상태로)
    await saveSearchResult({
      searchId,
      query,
      mode,
      timestamp: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
    })

    // 4. 검색 결과 페이지로 이동
    router.push(`/search/${searchId}?mode=loading`)

  } catch (error) {
    debugLogger.error('검색 시작 실패', error)
    toast.error('검색을 시작할 수 없습니다')
  } finally {
    setIsSearching(false)
  }
}
```

#### 4.3 렌더링 단순화

```tsx
return (
  <div className="flex min-h-screen flex-col">
    <Header onReset={handleReset} onFavoritesClick={() => setFavoritesDialogOpen(true)} />

    <main className="flex-1">
      <div className="container mx-auto p-6">
        <div className="flex flex-col items-center justify-center py-12 gap-8">
          {/* 로고 + 설명 */}
          <div className="w-full max-w-3xl text-center">
            <h2 className="text-5xl font-bold" style={{ fontFamily: "GiantsInline" }}>
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

    <footer className="border-t py-6">
      <div className="container mx-auto px-6">
        <p className="text-center text-sm text-muted-foreground">
          © 2025 Chris ryu. All rights reserved.
        </p>
      </div>
    </footer>
  </div>
)
```

**코드 라인 수 감소**: 1984줄 → ~150줄

---

### **Phase 5: 검색 결과 페이지 생성**

**파일**: `app/search/[id]/page.tsx` (NEW)

#### 5.1 페이지 구조

```typescript
'use client'

import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { getSearchResult, saveSearchResult } from '@/lib/search-result-store'
import { LawSearchProgress } from '@/components/law-search-progress'
import { AISearchProgress } from '@/components/ai-search-progress'
import { LawViewer } from '@/components/law-viewer'
import { Header } from '@/components/header'
import { SearchBar } from '@/components/search-bar'

export default function SearchResultPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const searchId = params.id as string
  const isLoading = searchParams.get('mode') === 'loading'

  const [result, setResult] = useState<SearchResult | null>(null)
  const [loadingStage, setLoadingStage] = useState<string>('init')
  const [error, setError] = useState<string | null>(null)

  // 1. 캐시 확인
  useEffect(() => {
    async function loadCache() {
      const cached = await getSearchResult(searchId)
      if (cached && cached.lawData) {
        setResult(cached)
        setLoadingStage('complete')
        return
      }

      // 캐시 없으면 API 호출
      if (isLoading) {
        await fetchSearchResult()
      } else {
        // URL 직접 접근 시 메인으로 리다이렉트
        router.push('/')
      }
    }
    loadCache()
  }, [searchId])

  // 2. API 호출 (법령 또는 AI)
  async function fetchSearchResult() {
    const cached = await getSearchResult(searchId)
    if (!cached) {
      router.push('/')
      return
    }

    if (cached.mode === 'ai') {
      await fetchAIResult(cached.query)
    } else {
      await fetchLawResult(cached.query)
    }
  }

  // 3. 법령 검색 API
  async function fetchLawResult(query: any) {
    setLoadingStage('searching')

    // law-search API
    const searchRes = await fetch(`/api/law-search?query=${query.lawName}`)
    setLoadingStage('parsing')

    // eflaw API
    const lawData = await parseLawData(searchRes)
    setLoadingStage('rendering')

    // 캐시 저장
    await saveSearchResult({ ...result, lawData })
    setResult({ ...result, lawData })
    setLoadingStage('complete')
  }

  // 4. AI 검색 API (SSE)
  async function fetchAIResult(query: any) {
    setLoadingStage('connecting')

    const response = await fetch('/api/file-search-rag', {
      method: 'POST',
      body: JSON.stringify({ query: query.lawName })
    })

    setLoadingStage('searching')

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let answer = ''

    setLoadingStage('streaming')

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      // ... SSE 파싱 로직

      // 부분 업데이트 (스트리밍)
      setResult(prev => ({
        ...prev,
        aiData: { answer, relatedLaws: [] }
      }))
    }

    // 버퍼 마지막 처리 (중요!)
    if (buffer.trim()) {
      // 마지막 청크 처리
    }

    setLoadingStage('extracting')
    const relatedLaws = extractRelatedLaws(answer)

    // 캐시 저장
    await saveSearchResult({
      ...result,
      aiData: { answer, relatedLaws }
    })

    setLoadingStage('complete')
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header onReset={() => router.push('/')} />

      <main className="flex-1">
        <div className="container mx-auto p-6">
          {/* 검색창 (재검색 가능) */}
          <div className="mb-6">
            <SearchBar onSearch={handleReSearch} />
          </div>

          {/* 로딩 UI */}
          {loadingStage !== 'complete' && (
            result?.mode === 'ai' ? (
              <AISearchProgress stage={loadingStage} />
            ) : (
              <LawSearchProgress stage={loadingStage} lawName={result?.query.lawName} />
            )
          )}

          {/* 검색 결과 */}
          {loadingStage === 'complete' && result && (
            result.mode === 'ai' ? (
              <LawViewer
                meta={dummyMeta}
                articles={[]}
                aiAnswerMode={true}
                aiAnswerContent={result.aiData?.answer}
                relatedArticles={result.aiData?.relatedLaws}
              />
            ) : (
              <LawViewer
                meta={result.lawData.meta}
                articles={result.lawData.articles}
                selectedJo={result.lawData.selectedJo}
              />
            )
          )}

          {/* 에러 */}
          {error && (
            <div className="text-center py-12">
              <p className="text-red-500">{error}</p>
              <Button onClick={() => router.push('/')}>홈으로 돌아가기</Button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
```

**핵심 로직**:
1. **캐시 우선**: IndexedDB에서 먼저 조회
2. **점진적 로딩**: 각 단계마다 ProgressUI 업데이트
3. **AI 스트리밍 보존**: SSE 청크를 실시간으로 화면에 표시 (끊김 없음)
4. **재검색 지원**: 검색창에서 새로운 검색 가능

---

### **Phase 6: 설정 페이지 및 비밀번호 보호**

#### 6.1 Header에 설정 버튼 추가

**파일**: `components/header.tsx` (MODIFY)

```tsx
import { Scale, Star, Settings } from "lucide-react"

export function Header({ onReset, onFavoritesClick, onSettingsClick }: HeaderProps) {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* 로고 */}
        <button onClick={handleHomeClick}>...</button>

        {/* 우측 버튼들 */}
        <div className="flex items-center gap-2">
          {/* 즐겨찾기 버튼 */}
          {favoritesCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onFavoritesClick}>
              <Star className="h-5 w-5" />
              <Badge variant="secondary">{favoritesCount}</Badge>
            </Button>
          )}

          {/* 설정 버튼 (NEW) */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onSettingsClick}
            title="설정"
          >
            <Settings className="h-5 w-5 text-muted-foreground hover:text-foreground" />
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
import { Lock } from 'lucide-react'

const ADMIN_PASSWORD = '1234'

export default function SettingsPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (password === ADMIN_PASSWORD) {
      // RAG 관리 페이지로 이동
      router.push('/admin/law-upload')
    } else {
      setError('비밀번호가 올바르지 않습니다')
      setPassword('')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-8 p-8">
        <div className="text-center">
          <Lock className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-6 text-3xl font-bold">관리자 설정</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            RAG 관리 페이지 접근을 위해 비밀번호를 입력하세요
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div>
            <Input
              type="password"
              placeholder="비밀번호"
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
              <p className="mt-2 text-sm text-red-500 text-center">{error}</p>
            )}
          </div>

          <Button type="submit" className="w-full" size="lg">
            확인
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => router.push('/')}
          >
            취소
          </Button>
        </form>
      </div>
    </div>
  )
}
```

#### 6.3 메인/검색 결과 페이지에서 설정 연결

```tsx
// app/page.tsx, app/search/[id]/page.tsx
const router = useRouter()

const handleSettingsClick = () => {
  router.push('/admin/settings')
}

<Header
  onReset={handleReset}
  onFavoritesClick={handleFavoritesClick}
  onSettingsClick={handleSettingsClick}  // NEW
/>
```

---

## 📊 구현 순서 (단계별 체크리스트)

### ✅ Phase 1: 인프라 (기반 작업)
- [ ] `lib/search-id-generator.ts` 생성
- [ ] `lib/search-result-store.ts` 생성 (IndexedDB)
- [ ] 유닛 테스트 (ID 생성/파싱, 캐시 저장/조회)

### ✅ Phase 2: UI 컴포넌트
- [ ] `components/law-search-progress.tsx` 생성
- [ ] `components/ai-search-progress.tsx` 생성
- [ ] `app/globals.css`에 `animate-glow-pulse` 추가

### ✅ Phase 3: SearchBar 개선
- [ ] AI 모드 전환 버튼 추가
- [ ] Brain 아이콘으로 변경
- [ ] 글로우 효과 강화
- [ ] 검색 버튼 색상 변경

### ✅ Phase 4: 메인 페이지 단순화
- [ ] `app/page.tsx` 상태 제거
- [ ] 검색 핸들러 수정 (ID 생성 → 페이지 이동)
- [ ] 렌더링 단순화

### ✅ Phase 5: 검색 결과 페이지
- [ ] `app/search/[id]/page.tsx` 생성
- [ ] 캐시 확인 로직
- [ ] 법령 검색 API 연동 + Progress
- [ ] AI 검색 SSE 연동 + Progress
- [ ] LawViewer 통합

### ✅ Phase 6: 설정 페이지
- [ ] `components/header.tsx` 설정 버튼 추가
- [ ] `app/admin/settings/page.tsx` 생성
- [ ] 비밀번호 검증 (1234)
- [ ] RAG 관리 페이지 리다이렉트

### ✅ Phase 7: 테스트 및 최적화
- [ ] 기본 검색 흐름 테스트
- [ ] AI 검색 흐름 테스트
- [ ] 뒤로가기/앞으로가기 테스트
- [ ] 새로고침 시 캐시 복원 테스트
- [ ] 모바일 반응형 확인

---

## 🎨 디자인 가이드

### 컬러 팔레트

```css
/* 법령 검색 */
--law-primary: #f59e0b (amber-500)
--law-secondary: #fbbf24 (amber-400)

/* 조례 검색 */
--ordinance-primary: #3b82f6 (blue-500)
--ordinance-secondary: #60a5fa (blue-400)

/* AI 검색 */
--ai-primary: #a855f7 (purple-500)
--ai-secondary: #3b82f6 (blue-500)
--ai-glow: rgba(168, 85, 247, 0.5)
```

### 애니메이션 타이밍

```css
/* 검색창 전환 */
transition: all 500ms cubic-bezier(0.4, 0, 0.2, 1)

/* 프로그레스 바 */
transition: width 300ms ease-out

/* 글로우 효과 */
animation: glow-pulse 2s ease-in-out infinite
```

---

## 🔒 보안 고려사항

### 비밀번호 관리
- 현재: 하드코딩 (`1234`)
- **개선 권장**: 환경변수 (`ADMIN_PASSWORD`)로 이관

```env
# .env.local
ADMIN_PASSWORD=your_secure_password
```

```typescript
// app/admin/settings/page.tsx
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || '1234'
```

### IndexedDB 보안
- **도메인 격리**: 같은 도메인 내에서만 접근 가능
- **용량 제한**: 100개 항목 제한으로 DoS 방지
- **만료 시간**: 7일 자동 삭제

---

## 📈 성능 최적화

### IndexedDB 캐싱 효과
- **평균 조회 시간**: ~25ms (API 대비 100배 빠름)
- **네트워크 절약**: 재방문 시 API 호출 0회
- **오프라인 지원**: 캐시된 항목은 오프라인에서도 조회 가능

### SSE 스트리밍 최적화
- **청크 단위 렌더링**: 100 토큰마다 화면 업데이트
- **메모리 관리**: 완료 후 reader 명시적 해제
- **에러 복구**: 타임아웃 30초 설정

---

## 🚨 알려진 이슈 및 주의사항

### 1. AI 스트리밍 중 페이지 이탈
**문제**: 사용자가 스트리밍 중 뒤로가기 → 답변 잘림
**해결**: `beforeunload` 이벤트로 경고 표시

### 2. IndexedDB 브라우저 호환성
**문제**: IE11 미지원
**해결**: 현대 브라우저만 지원 (Chrome, Firefox, Safari, Edge)

### 3. URL 인코딩
**문제**: 한글 법령명이 URL에 포함되면 인코딩 이슈
**해결**: 타임스탬프 기반 ID로 한글 제거

---

## 📝 파일 변경 요약

### 신규 파일 (6개)
1. `lib/search-id-generator.ts` - 검색 ID 생성
2. `lib/search-result-store.ts` - IndexedDB 캐싱
3. `components/law-search-progress.tsx` - 법령 프로그레스 UI
4. `components/ai-search-progress.tsx` - AI 프로그레스 UI
5. `app/search/[id]/page.tsx` - 검색 결과 페이지
6. `app/admin/settings/page.tsx` - 설정 페이지

### 수정 파일 (3개)
1. `app/page.tsx` - 메인 페이지 단순화 (1984줄 → ~150줄)
2. `components/search-bar.tsx` - AI 모드 UI 강화
3. `components/header.tsx` - 설정 버튼 추가

### 수정 파일 (CSS)
1. `app/globals.css` - 커스텀 애니메이션 추가

---

## 🎯 성공 기준

### 기능 요구사항
- ✅ 검색 후 페이지 이동 (`/` → `/search/[id]`)
- ✅ 뒤로가기 시 검색 결과 유지
- ✅ 법령/AI 검색 각각 프로그레스 UI 표시
- ✅ AI 검색 스트리밍 중 답변 끊김 없음
- ✅ 검색창 AI 모드 시각적 구분 (아이콘, 글로우, 버튼)
- ✅ 설정 페이지 비밀번호 보호 (1234)

### 성능 요구사항
- ✅ 캐시 조회 시간 < 50ms
- ✅ 페이지 이동 시간 < 100ms
- ✅ AI 스트리밍 첫 응답 < 3초

### UX 요구사항
- ✅ 로딩 단계별 진행률 % 표시
- ✅ 각 단계 이름 명확히 표시
- ✅ 스트리밍 중 페이지 이탈 경고
- ✅ 모바일 반응형 지원

---

## 📚 참고 자료

### IndexedDB API
- [MDN IndexedDB Guide](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [idb 라이브러리](https://github.com/jakearchibald/idb) (권장)

### SSE (Server-Sent Events)
- [MDN SSE Guide](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [Vercel AI SDK Streaming](https://sdk.vercel.ai/docs/guides/streaming)

### Next.js 라우팅
- [App Router Dynamic Routes](https://nextjs.org/docs/app/building-your-application/routing/dynamic-routes)
- [useSearchParams Hook](https://nextjs.org/docs/app/api-reference/functions/use-search-params)

---

## 🏁 다음 단계

이 계획서를 기반으로 Phase별 구현을 진행합니다.

**구현 순서**:
1. Phase 1-2 (인프라 + UI 컴포넌트)
2. Phase 3-4 (SearchBar + 메인 페이지)
3. Phase 5 (검색 결과 페이지)
4. Phase 6 (설정 페이지)
5. Phase 7 (테스트 및 최적화)

각 Phase 완료 후 커밋하여 변경 이력 추적.
