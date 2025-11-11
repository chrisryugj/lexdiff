# RAG 시스템 통합 가이드

> **목적**: 기존 LexDiff 시스템에 RAG 벡터 검색을 통합하되, 기존 기능을 손상시키지 않고 점진적으로 추가
>
> **작성일**: 2025-11-11
>
> **중요**: 이 가이드는 나중에 코드가 꼬이지 않도록 명확한 구현 순서와 주의사항을 문서화합니다.

---

## 목차

1. [시스템 아키텍처](#1-시스템-아키텍처)
2. [구현 순서](#2-구현-순서)
3. [Phase 1: API 엔드포인트 구현](#3-phase-1-api-엔드포인트-구현)
4. [Phase 2: UI 컴포넌트 구현](#4-phase-2-ui-컴포넌트-구현)
5. [Phase 3: 기존 시스템 통합](#5-phase-3-기존-시스템-통합)
6. [중요 주의사항](#6-중요-주의사항)
7. [테스트 시나리오](#7-테스트-시나리오)
8. [롤백 계획](#8-롤백-계획)

---

## 1. 시스템 아키텍처

### 1.1 현재 시스템 (기존)

```
사용자 입력
    ↓
검색어 파싱 (lib/law-parser.ts)
    ↓
[Phase 7] IndexedDB 캐시 확인
    ↓ (캐시 미스)
[Phase 5/6] 비활성화됨
    ↓
[기본 검색] /api/law-search + 유사도 매칭
    ↓
법령 내용 표시 (components/law-viewer.tsx)
```

**특징**:
- 정확한 법령명 매칭 필요
- 조문 번호 기반 탐색
- 키워드 검색 불가능

### 1.2 RAG 통합 시스템 (목표)

```
사용자 입력
    ↓
┌─────────────────┐
│ 검색 모드 선택  │
└─────────────────┘
    ↓          ↓
 [기존]      [RAG]
    ↓          ↓
법령명+조문  자연어 질문
    ↓          ↓
기존 경로   벡터 검색
            ↓
        유사 조문 검색 (/api/rag-search)
            ↓
        AI 답변 생성 (/api/rag-answer)
            ↓
        컨텍스트 + 출처 표시
```

**추가 기능**:
- 자연어 질문 가능 ("수출 통관 시 필요한 서류는?")
- 의미 기반 검색 (벡터 유사도)
- AI 기반 답변 생성
- 출처 조문 자동 연결

**호환성**:
- 기존 검색 모드는 100% 유지
- 검색 모드 토글로 전환
- 각 모드는 독립적으로 동작

---

## 2. 구현 순서

### Phase 1: API 엔드포인트 (웹 환경 가능)

1. `/api/rag-search` - 벡터 유사도 검색
2. `/api/rag-answer` - AI 답변 생성

**예상 시간**: 2-3시간
**의존성**: 없음 (기존 코드와 독립적)
**테스트 가능**: DB에 임베딩 데이터가 있으면 가능

### Phase 2: UI 컴포넌트 (웹 환경 가능)

1. `components/rag-search-panel.tsx` - 검색 인터페이스
2. `components/rag-result-card.tsx` - 검색 결과 표시
3. `components/rag-answer-card.tsx` - AI 답변 표시

**예상 시간**: 3-4시간
**의존성**: Phase 1 완료 필요
**테스트 가능**: 독립적으로 스토리북 스타일 테스트 가능

### Phase 3: 기존 시스템 통합 (웹 환경 가능)

1. `app/page.tsx`에 검색 모드 토글 추가
2. 모드별 라우팅 로직 구현
3. 상태 관리 통합

**예상 시간**: 2-3시간
**의존성**: Phase 1, 2 완료 필요
**테스트 가능**: 전체 플로우 테스트

### Phase 0: 임베딩 DB 구축 (로컬 환경 필요)

- **주의**: 웹 환경에서는 실행 불가
- 로컬에서 `npm run build-embeddings` 실행
- 30개 법령 + 30개 조례 임베딩 생성
- 예상 비용: ~$0.041

**예상 시간**: 1-2시간 (API 호출 시간 포함)
**의존성**: 로컬 환경 + law.go.kr API 접근
**실행 시점**: Phase 1-3 구현 완료 후

---

## 3. Phase 1: API 엔드포인트 구현

### 3.1 `/api/rag-search` - 벡터 유사도 검색

#### 파일 위치
```
app/api/rag-search/route.ts
```

#### 기능
사용자의 자연어 질문을 임베딩으로 변환하고, 유사한 조문들을 벡터 검색으로 찾아 반환합니다.

#### 요청 스펙

**Method**: `GET`

**Query Parameters**:
```typescript
{
  query: string        // 사용자 질문 (필수)
  limit?: number       // 결과 개수 제한 (기본값: 5)
  threshold?: number   // 유사도 임계값 0-1 (기본값: 0.7)
  lawFilter?: string   // 특정 법령으로 필터링 (선택)
}
```

**예시 요청**:
```
GET /api/rag-search?query=수출통관시%20필요한%20서류는&limit=3&threshold=0.75
```

#### 응답 스펙

**Success (200)**:
```typescript
{
  success: true,
  query: string,              // 원본 질문
  results: Array<{
    lawId: string,            // 법령 ID
    lawName: string,          // 법령명
    articleJo: string,        // 조문 번호 (6자리 JO 코드)
    articleDisplay: string,   // 표시용 조문 ("제38조")
    articleTitle: string | null,
    articleContent: string,   // 조문 내용
    similarity: number,       // 유사도 점수 (0-1)
    keywords: string | null
  }>,
  metadata: {
    totalResults: number,
    executionTimeMs: number,
    embeddingTokens: number
  }
}
```

**Error (400, 500)**:
```typescript
{
  success: false,
  error: string
}
```

#### 구현 로직

```typescript
// app/api/rag-search/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { generateEmbedding } from '@/lib/embedding'
import { searchSimilarArticles } from '@/lib/vector-search'

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    // 1. 파라미터 추출 및 검증
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('query')
    const limit = parseInt(searchParams.get('limit') || '5')
    const threshold = parseFloat(searchParams.get('threshold') || '0.7')
    const lawFilter = searchParams.get('lawFilter') || undefined

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Query parameter is required' },
        { status: 400 }
      )
    }

    // 2. 질문 임베딩 생성
    const embeddingResult = await generateEmbedding(query)

    // 3. 벡터 유사도 검색
    const results = await searchSimilarArticles(query, {
      limit,
      threshold,
      lawFilter,
      useCache: true
    })

    // 4. 결과 반환
    return NextResponse.json(
      {
        success: true,
        query,
        results: results.map(r => ({
          lawId: r.lawId,
          lawName: r.lawName,
          articleJo: r.articleJo,
          articleDisplay: r.articleDisplay || `제${parseInt(r.articleJo.substring(0, 4))}조`,
          articleTitle: r.articleTitle,
          articleContent: r.articleContent,
          similarity: r.similarity,
          keywords: r.keywords
        })),
        metadata: {
          totalResults: results.length,
          executionTimeMs: Date.now() - startTime,
          embeddingTokens: embeddingResult.tokens
        }
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
        }
      }
    )

  } catch (error) {
    console.error('❌ RAG search error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
```

#### 의존성 확인

**기존 파일 사용**:
- `lib/embedding.ts`: `generateEmbedding()` - 이미 구현됨
- `lib/vector-search.ts`: `searchSimilarArticles()` - 이미 구현됨
- DB 테이블: `law_article_embeddings` - 이미 존재함

**추가 작업 필요 없음** - 기존 인프라 활용

---

### 3.2 `/api/rag-answer` - AI 답변 생성

#### 파일 위치
```
app/api/rag-answer/route.ts
```

#### 기능
검색된 조문들을 컨텍스트로 사용하여 Gemini API로 사용자 질문에 대한 답변을 생성합니다.

#### 요청 스펙

**Method**: `POST`

**Request Body**:
```typescript
{
  query: string,              // 사용자 질문 (필수)
  context: Array<{            // 검색된 조문들 (필수)
    lawName: string,
    articleDisplay: string,
    articleContent: string,
    similarity: number
  }>,
  options?: {
    temperature?: number,     // 0-1 (기본값: 0.3)
    maxTokens?: number        // 기본값: 2048
  }
}
```

**예시 요청**:
```json
{
  "query": "수출통관 시 필요한 서류는?",
  "context": [
    {
      "lawName": "관세법",
      "articleDisplay": "제38조",
      "articleContent": "① 세관장은...",
      "similarity": 0.89
    }
  ]
}
```

#### 응답 스펙

**Success (200)**:
```typescript
{
  success: true,
  answer: {
    content: string,          // AI 생성 답변
    citations: Array<{        // 인용된 조문
      lawName: string,
      articleDisplay: string,
      relevance: 'high' | 'medium' | 'low'
    }>,
    confidence: 'high' | 'medium' | 'low'
  },
  metadata: {
    model: string,
    tokensUsed: number,
    executionTimeMs: number,
    contextArticles: number
  }
}
```

**예시 응답**:
```json
{
  "success": true,
  "answer": {
    "content": "수출통관 시 필요한 서류는 다음과 같습니다:\n\n1. **수출신고서** (관세법 제38조)\n   - 세관장에게 제출해야 하는 필수 서류입니다.\n\n2. **송장(Invoice)** 및 **포장명세서(Packing List)**\n   - 물품의 상세 내역을 확인하기 위한 서류입니다.\n\n3. **수출승인서** (해당하는 경우)\n   - 특정 품목의 경우 추가로 필요할 수 있습니다.\n\n관세법 제38조에 따라 이러한 서류들을 갖추어 세관장에게 신고해야 합니다.",
    "citations": [
      {
        "lawName": "관세법",
        "articleDisplay": "제38조",
        "relevance": "high"
      }
    ],
    "confidence": "high"
  },
  "metadata": {
    "model": "gemini-2.0-flash-exp",
    "tokensUsed": 256,
    "executionTimeMs": 1234,
    "contextArticles": 1
  }
}
```

#### 구현 로직

```typescript
// app/api/rag-answer/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // 1. 요청 파싱
    const body = await request.json()
    const { query, context, options = {} } = body

    if (!query || !context || context.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Query and context are required' },
        { status: 400 }
      )
    }

    // 2. 컨텍스트 문자열 생성
    const contextText = context
      .map((c: any, i: number) =>
        `[${i + 1}] ${c.lawName} ${c.articleDisplay} (유사도: ${(c.similarity * 100).toFixed(1)}%)\n${c.articleContent}`
      )
      .join('\n\n---\n\n')

    // 3. Gemini 프롬프트 구성
    const prompt = `당신은 대한민국 법령 전문가입니다. 사용자의 질문에 대해 제공된 법령 조문을 근거로 정확하고 명확한 답변을 제공하세요.

**사용자 질문**:
${query}

**관련 법령 조문**:
${contextText}

**답변 작성 지침**:
1. 질문에 직접적으로 답변하세요
2. 관련 법령 조문을 인용하며 설명하세요 (예: "관세법 제38조에 따르면...")
3. 번호나 목록으로 정리하여 읽기 쉽게 작성하세요
4. 법률 용어는 일반인도 이해할 수 있도록 부연 설명을 추가하세요
5. 확실하지 않은 내용은 추측하지 말고 "명시되어 있지 않습니다"라고 답하세요

답변을 작성해주세요:`

    // 4. Gemini API 호출
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        temperature: options.temperature || 0.3,
        maxOutputTokens: options.maxTokens || 2048,
      }
    })

    const result = await model.generateContent(prompt)
    const response = result.response
    const answerText = response.text()

    // 5. 인용 조문 추출 (간단한 휴리스틱)
    const citations = context
      .filter((c: any) => {
        // 답변에 법령명이 언급되었는지 확인
        return answerText.includes(c.lawName) || answerText.includes(c.articleDisplay)
      })
      .map((c: any) => ({
        lawName: c.lawName,
        articleDisplay: c.articleDisplay,
        relevance: c.similarity > 0.85 ? 'high' : c.similarity > 0.7 ? 'medium' : 'low'
      }))

    // 6. 신뢰도 평가
    const avgSimilarity = context.reduce((sum: number, c: any) => sum + c.similarity, 0) / context.length
    const confidence = avgSimilarity > 0.85 ? 'high' : avgSimilarity > 0.7 ? 'medium' : 'low'

    // 7. 응답 반환
    return NextResponse.json({
      success: true,
      answer: {
        content: answerText,
        citations,
        confidence
      },
      metadata: {
        model: 'gemini-2.0-flash-exp',
        tokensUsed: response.usageMetadata?.totalTokenCount || 0,
        executionTimeMs: Date.now() - startTime,
        contextArticles: context.length
      }
    })

  } catch (error) {
    console.error('❌ RAG answer generation error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
```

#### 의존성 확인

**기존 패키지 사용**:
- `@google/generative-ai` - 이미 설치됨
- 환경변수: `GEMINI_API_KEY` - 이미 설정됨

**추가 작업 필요 없음**

---

## 4. Phase 2: UI 컴포넌트 구현

### 4.1 `components/rag-search-panel.tsx` - 검색 인터페이스

#### 기능
- 자연어 질문 입력
- 검색 옵션 설정 (결과 개수, 유사도 임계값)
- 검색 진행 상태 표시
- 에러 처리

#### Props
```typescript
interface RagSearchPanelProps {
  onSearch: (query: string, options: SearchOptions) => void
  isLoading: boolean
  error: string | null
}

interface SearchOptions {
  limit: number
  threshold: number
  lawFilter?: string
}
```

#### 구현

```typescript
// components/rag-search-panel.tsx

'use client'

import { useState } from 'react'
import { Search, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

interface RagSearchPanelProps {
  onSearch: (query: string, options: SearchOptions) => void
  isLoading: boolean
  error: string | null
}

interface SearchOptions {
  limit: number
  threshold: number
  lawFilter?: string
}

export function RagSearchPanel({ onSearch, isLoading, error }: RagSearchPanelProps) {
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(5)
  const [threshold, setThreshold] = useState(0.7)
  const [lawFilter, setLawFilter] = useState('')
  const [showOptions, setShowOptions] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim().length === 0) return

    onSearch(query, {
      limit,
      threshold,
      lawFilter: lawFilter.trim() || undefined
    })
  }

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-card">
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* 질문 입력 */}
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              type="text"
              placeholder="법령에 대해 질문하세요 (예: 수출통관 시 필요한 서류는?)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={isLoading}
              className="text-base"
            />
          </div>
          <Button type="submit" disabled={isLoading || query.trim().length === 0}>
            {isLoading ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                검색 중...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                검색
              </>
            )}
          </Button>
        </div>

        {/* 검색 옵션 (토글) */}
        <Collapsible open={showOptions} onOpenChange={setShowOptions}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full">
              <Settings className="w-4 h-4 mr-2" />
              {showOptions ? '옵션 숨기기' : '검색 옵션'}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            {/* 결과 개수 */}
            <div className="space-y-2">
              <Label>결과 개수: {limit}개</Label>
              <Slider
                value={[limit]}
                onValueChange={([value]) => setLimit(value)}
                min={1}
                max={10}
                step={1}
                disabled={isLoading}
              />
            </div>

            {/* 유사도 임계값 */}
            <div className="space-y-2">
              <Label>유사도 임계값: {(threshold * 100).toFixed(0)}%</Label>
              <Slider
                value={[threshold * 100]}
                onValueChange={([value]) => setThreshold(value / 100)}
                min={50}
                max={95}
                step={5}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                높을수록 더 관련성 높은 결과만 표시됩니다
              </p>
            </div>

            {/* 법령 필터 */}
            <div className="space-y-2">
              <Label>특정 법령으로 제한 (선택)</Label>
              <Input
                type="text"
                placeholder="예: 관세법"
                value={lawFilter}
                onChange={(e) => setLawFilter(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* 에러 메시지 */}
        {error && (
          <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
            ❌ {error}
          </div>
        )}
      </form>

      {/* 사용 예시 */}
      {!isLoading && query.length === 0 && (
        <div className="text-sm text-muted-foreground border-t pt-3">
          <p className="font-medium mb-2">💡 질문 예시:</p>
          <ul className="space-y-1 ml-4">
            <li>• 수출통관 시 필요한 서류는?</li>
            <li>• 청년 창업 지원 내용은 무엇인가요?</li>
            <li>• 관세 환급 신청 조건은?</li>
          </ul>
        </div>
      )}
    </div>
  )
}
```

---

### 4.2 `components/rag-result-card.tsx` - 검색 결과 표시

#### 기능
- 검색된 조문 표시
- 유사도 점수 시각화
- 법령/조문 클릭 시 상세 보기 연결
- 출처 하이라이트

#### Props
```typescript
interface RagResultCardProps {
  result: {
    lawName: string
    articleDisplay: string
    articleTitle: string | null
    articleContent: string
    similarity: number
  }
  onClick?: () => void
  isHighlighted?: boolean
}
```

#### 구현

```typescript
// components/rag-result-card.tsx

'use client'

import { BookOpen, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface RagResultCardProps {
  result: {
    lawName: string
    articleDisplay: string
    articleTitle: string | null
    articleContent: string
    similarity: number
  }
  onClick?: () => void
  isHighlighted?: boolean
}

export function RagResultCard({ result, onClick, isHighlighted = false }: RagResultCardProps) {
  const { lawName, articleDisplay, articleTitle, articleContent, similarity } = result

  // 유사도에 따른 색상
  const getSimilarityColor = (score: number) => {
    if (score >= 0.85) return 'text-green-600 bg-green-50'
    if (score >= 0.7) return 'text-yellow-600 bg-yellow-50'
    return 'text-gray-600 bg-gray-50'
  }

  // 유사도 라벨
  const getSimilarityLabel = (score: number) => {
    if (score >= 0.85) return '매우 관련성 높음'
    if (score >= 0.7) return '관련성 있음'
    return '관련성 낮음'
  }

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md',
        isHighlighted && 'ring-2 ring-primary'
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              {lawName} {articleDisplay}
            </CardTitle>
            {articleTitle && (
              <p className="text-sm text-muted-foreground mt-1">{articleTitle}</p>
            )}
          </div>

          {/* 유사도 점수 */}
          <div className="flex flex-col items-end gap-1">
            <Badge className={getSimilarityColor(similarity)}>
              <TrendingUp className="w-3 h-3 mr-1" />
              {(similarity * 100).toFixed(1)}%
            </Badge>
            <span className="text-xs text-muted-foreground">
              {getSimilarityLabel(similarity)}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* 조문 내용 (일부만 표시) */}
        <p className="text-sm text-foreground line-clamp-3">
          {articleContent}
        </p>

        {/* 더보기 힌트 */}
        {articleContent.length > 150 && (
          <p className="text-xs text-primary mt-2">
            클릭하여 전체 내용 보기 →
          </p>
        )}
      </CardContent>
    </Card>
  )
}
```

---

### 4.3 `components/rag-answer-card.tsx` - AI 답변 표시

#### 기능
- AI 생성 답변 표시
- 인용 조문 링크
- 신뢰도 표시
- 마크다운 렌더링

#### Props
```typescript
interface RagAnswerCardProps {
  answer: {
    content: string
    citations: Array<{
      lawName: string
      articleDisplay: string
      relevance: 'high' | 'medium' | 'low'
    }>
    confidence: 'high' | 'medium' | 'low'
  }
  onCitationClick?: (lawName: string, articleDisplay: string) => void
}
```

#### 구현

```typescript
// components/rag-answer-card.tsx

'use client'

import { Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface RagAnswerCardProps {
  answer: {
    content: string
    citations: Array<{
      lawName: string
      articleDisplay: string
      relevance: 'high' | 'medium' | 'low'
    }>
    confidence: 'high' | 'medium' | 'low'
  }
  onCitationClick?: (lawName: string, articleDisplay: string) => void
}

export function RagAnswerCard({ answer, onCitationClick }: RagAnswerCardProps) {
  const { content, citations, confidence } = answer

  // 신뢰도 아이콘 및 색상
  const getConfidenceDisplay = (level: string) => {
    switch (level) {
      case 'high':
        return {
          icon: <CheckCircle2 className="w-4 h-4" />,
          label: '높은 신뢰도',
          className: 'text-green-600 bg-green-50'
        }
      case 'medium':
        return {
          icon: <AlertCircle className="w-4 h-4" />,
          label: '중간 신뢰도',
          className: 'text-yellow-600 bg-yellow-50'
        }
      default:
        return {
          icon: <AlertCircle className="w-4 h-4" />,
          label: '낮은 신뢰도',
          className: 'text-gray-600 bg-gray-50'
        }
    }
  }

  const confidenceDisplay = getConfidenceDisplay(confidence)

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI 답변
          </CardTitle>
          <Badge className={confidenceDisplay.className}>
            {confidenceDisplay.icon}
            <span className="ml-1">{confidenceDisplay.label}</span>
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* AI 답변 내용 */}
        <div className="prose prose-sm max-w-none">
          <div className="whitespace-pre-wrap text-foreground">
            {content}
          </div>
        </div>

        {/* 인용 조문 */}
        {citations.length > 0 && (
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-2">📚 참고 조문:</p>
            <div className="flex flex-wrap gap-2">
              {citations.map((citation, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => onCitationClick?.(citation.lawName, citation.articleDisplay)}
                  className={cn(
                    'text-xs',
                    citation.relevance === 'high' && 'border-primary text-primary'
                  )}
                >
                  {citation.lawName} {citation.articleDisplay}
                  {citation.relevance === 'high' && ' ★'}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* 주의사항 */}
        <div className="text-xs text-muted-foreground bg-muted p-3 rounded">
          ⚠️ 이 답변은 AI가 생성한 것으로, 법적 자문을 대체할 수 없습니다.
          정확한 정보는 원문을 확인하거나 전문가와 상담하시기 바랍니다.
        </div>
      </CardContent>
    </Card>
  )
}
```

---

## 5. Phase 3: 기존 시스템 통합

### 5.1 검색 모드 토글 추가

#### 파일 수정: `app/page.tsx`

**목표**: 기존 검색과 RAG 검색을 전환할 수 있는 UI 추가

#### 상태 관리 추가

```typescript
// app/page.tsx 상단에 추가

type SearchMode = 'basic' | 'rag'

export default function Home() {
  // 기존 상태들...

  // 새로운 상태 추가
  const [searchMode, setSearchMode] = useState<SearchMode>('basic')
  const [ragResults, setRagResults] = useState<any[]>([])
  const [ragAnswer, setRagAnswer] = useState<any>(null)
  const [ragLoading, setRagLoading] = useState(false)
  const [ragError, setRagError] = useState<string | null>(null)

  // ... 나머지 기존 코드
```

#### RAG 검색 핸들러 추가

```typescript
// app/page.tsx에 추가

async function handleRagSearch(query: string, options: SearchOptions) {
  setRagLoading(true)
  setRagError(null)
  setRagResults([])
  setRagAnswer(null)

  try {
    // 1. 벡터 검색
    debugLogger.info('RAG 검색 시작', { query, options })

    const searchUrl = `/api/rag-search?query=${encodeURIComponent(query)}&limit=${options.limit}&threshold=${options.threshold}`
    const searchRes = await fetch(searchUrl)

    if (!searchRes.ok) {
      throw new Error(`검색 실패: ${searchRes.status}`)
    }

    const searchData = await searchRes.json()

    if (!searchData.success) {
      throw new Error(searchData.error || '검색 실패')
    }

    debugLogger.success('RAG 검색 완료', {
      results: searchData.results.length,
      tokens: searchData.metadata.embeddingTokens
    })

    setRagResults(searchData.results)

    // 2. AI 답변 생성 (검색 결과가 있는 경우)
    if (searchData.results.length > 0) {
      debugLogger.info('AI 답변 생성 시작')

      const answerRes = await fetch('/api/rag-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          context: searchData.results.map((r: any) => ({
            lawName: r.lawName,
            articleDisplay: r.articleDisplay,
            articleContent: r.articleContent,
            similarity: r.similarity
          }))
        })
      })

      if (!answerRes.ok) {
        throw new Error(`답변 생성 실패: ${answerRes.status}`)
      }

      const answerData = await answerRes.json()

      if (!answerData.success) {
        throw new Error(answerData.error || '답변 생성 실패')
      }

      debugLogger.success('AI 답변 생성 완료', {
        tokens: answerData.metadata.tokensUsed
      })

      setRagAnswer(answerData.answer)
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '알 수 없는 오류'
    debugLogger.error('RAG 검색 오류', { error: errorMsg })
    setRagError(errorMsg)
  } finally {
    setRagLoading(false)
  }
}

// 인용 조문 클릭 핸들러
function handleCitationClick(lawName: string, articleDisplay: string) {
  // 기존 검색 시스템으로 해당 조문 열기
  const query = `${lawName} ${articleDisplay}`
  setSearchMode('basic')
  handleSearch(query) // 기존 검색 함수 호출
}
```

#### UI 렌더링 수정

```typescript
// app/page.tsx의 return 부분 수정

return (
  <div className="min-h-screen bg-background">
    <Header />

    <main className="container mx-auto p-4 space-y-4">
      {/* 검색 모드 토글 */}
      <div className="flex items-center justify-center gap-2 p-2 bg-muted rounded-lg">
        <Button
          variant={searchMode === 'basic' ? 'default' : 'ghost'}
          onClick={() => setSearchMode('basic')}
          size="sm"
        >
          기본 검색
        </Button>
        <Button
          variant={searchMode === 'rag' ? 'default' : 'ghost'}
          onClick={() => setSearchMode('rag')}
          size="sm"
        >
          AI 검색 (RAG)
        </Button>
      </div>

      {/* 기존 검색 UI (searchMode === 'basic'일 때) */}
      {searchMode === 'basic' && (
        <>
          <SearchBar onSearch={handleSearch} />
          {/* 기존 UI 컴포넌트들... */}
          {currentLaw && <LawViewer {...} />}
        </>
      )}

      {/* RAG 검색 UI (searchMode === 'rag'일 때) */}
      {searchMode === 'rag' && (
        <div className="space-y-4">
          <RagSearchPanel
            onSearch={handleRagSearch}
            isLoading={ragLoading}
            error={ragError}
          />

          {/* AI 답변 */}
          {ragAnswer && (
            <RagAnswerCard
              answer={ragAnswer}
              onCitationClick={handleCitationClick}
            />
          )}

          {/* 검색 결과 */}
          {ragResults.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">검색 결과 ({ragResults.length}개)</h3>
              {ragResults.map((result, index) => (
                <RagResultCard
                  key={index}
                  result={result}
                  onClick={() => handleCitationClick(result.lawName, result.articleDisplay)}
                />
              ))}
            </div>
          )}

          {/* 결과 없음 */}
          {!ragLoading && ragResults.length === 0 && ragError === null && (
            <div className="text-center text-muted-foreground py-8">
              검색 결과가 없습니다
            </div>
          )}
        </div>
      )}

      {/* 디버그 콘솔 (공통) */}
      <DebugConsole />
    </main>
  </div>
)
```

---

### 5.2 임포트 추가

```typescript
// app/page.tsx 상단에 추가

import { RagSearchPanel } from '@/components/rag-search-panel'
import { RagResultCard } from '@/components/rag-result-card'
import { RagAnswerCard } from '@/components/rag-answer-card'
```

---

## 6. 중요 주의사항

### 6.1 임베딩 DB 구축 필수

**⚠️ CRITICAL**: RAG 시스템이 작동하려면 반드시 임베딩 DB가 구축되어 있어야 합니다.

```bash
# 로컬 환경에서 실행 (웹 환경 불가)
npm run build-embeddings
```

**DB 구축 전 동작**:
- `/api/rag-search` 호출 시 빈 결과 반환
- 에러는 발생하지 않지만 검색 결과 0개
- UI에 "검색 결과가 없습니다" 메시지 표시

**해결 방법**:
1. 로컬 환경에서 개발 서버 실행
2. `npm run build-embeddings` 실행
3. 약 1-2시간 대기 (30개 법령 + 30개 조례)
4. 완료 후 RAG 검색 테스트

---

### 6.2 비용 관리

**임베딩 생성 비용**:
- 30개 법령: ~$0.02
- 30개 조례: ~$0.02
- **총 예상**: $0.04

**실시간 검색 비용** (사용자당):
- 질문 임베딩: ~$0.0001
- AI 답변 생성: ~$0.0001-0.0005
- **사용자당 평균**: $0.0002-0.0006

**월간 예상 비용** (1,000명 사용 기준):
- 검색 비용: $0.20-0.60
- 매우 저렴함 ✅

---

### 6.3 에러 처리 전략

#### API 장애 시나리오

**Voyage AI 장애**:
```typescript
// lib/embedding.ts에서 자동 처리
// 3회 재시도 + 지수 백오프
// 최종 실패 시 명확한 에러 메시지 반환
```

**Gemini API 장애**:
```typescript
// app/api/rag-answer/route.ts
// 사용자에게 "일시적 오류, 나중에 다시 시도" 메시지 표시
// 검색 결과는 정상 표시 (답변만 생성 실패)
```

**Turso DB 장애**:
```typescript
// 벡터 검색 실패
// 자동으로 기본 검색 모드로 전환하는 fallback 로직 권장
```

#### Fallback 로직 구현 예시

```typescript
// app/page.tsx에 추가

async function handleRagSearch(query: string, options: SearchOptions) {
  try {
    // RAG 검색 시도
    // ... (기존 코드)
  } catch (error) {
    // RAG 검색 실패 시 기본 검색으로 자동 전환
    debugLogger.warning('RAG 검색 실패, 기본 검색으로 전환', { error })

    setSearchMode('basic')
    handleSearch(query) // 기본 검색 실행

    // 사용자에게 알림
    setRagError('AI 검색이 일시적으로 사용 불가합니다. 기본 검색으로 전환했습니다.')
  }
}
```

---

### 6.4 성능 최적화

#### 캐싱 전략

**검색 쿼리 캐싱**:
```typescript
// lib/vector-search.ts
// 이미 구현됨: embedding_cache 테이블 사용
// 동일한 질문은 임베딩 재생성 없이 캐시에서 로드
```

**응답 캐싱**:
```typescript
// 향후 추가 고려: rag_context_logs 테이블 활용
// 동일 질문에 대한 AI 답변 캐싱
// 단, 법령 개정 시 캐시 무효화 필요
```

#### 속도 최적화

**병렬 처리**:
```typescript
// 현재: 검색 → 답변 (순차)
// 개선 가능: 검색과 답변 생성을 병렬로 처리하되,
// 답변 생성은 검색 결과를 대기
```

**스트리밍 응답**:
```typescript
// Gemini API는 스트리밍 지원
// 향후 구현: 답변을 실시간으로 표시 (타이핑 효과)
```

---

### 6.5 기존 시스템과의 호환성

#### 충돌 방지 체크리스트

- [ ] 기존 `handleSearch()` 함수 수정하지 않음
- [ ] 기존 상태 변수 이름 중복 없음 (`currentLaw`, `selectedJo` 등)
- [ ] 기존 컴포넌트 props 변경 없음
- [ ] `searchMode === 'basic'`일 때 기존 로직 100% 유지
- [ ] 디버그 로거 공유 (기존 로그와 함께 표시)
- [ ] 즐겨찾기, 비교 모달 등 기존 기능 정상 작동

#### 테스트 시나리오

**기본 검색 모드**:
1. "관세법 38조" 검색
2. 조문 내용 표시 확인
3. 3단 비교 버튼 클릭
4. 즐겨찾기 추가
5. **예상 결과**: 모든 기능 정상 작동

**RAG 검색 모드**:
1. "수출통관 시 필요한 서류는?" 검색
2. AI 답변 표시 확인
3. 인용 조문 클릭
4. **예상 결과**: 기본 모드로 전환 + 해당 조문 표시

**모드 전환**:
1. RAG 모드에서 검색 수행
2. 기본 모드로 전환
3. **예상 결과**: 기존 UI 정상 표시, RAG 결과 숨김

---

## 7. 테스트 시나리오

### 7.1 API 단독 테스트

#### `/api/rag-search` 테스트

```bash
# 기본 검색
curl "http://localhost:3000/api/rag-search?query=수출통관%20서류"

# 옵션 포함
curl "http://localhost:3000/api/rag-search?query=청년%20창업%20지원&limit=3&threshold=0.8"

# 법령 필터
curl "http://localhost:3000/api/rag-search?query=환급&lawFilter=관세법"
```

**예상 응답**:
```json
{
  "success": true,
  "query": "수출통관 서류",
  "results": [
    {
      "lawName": "관세법",
      "articleJo": "003800",
      "articleDisplay": "제38조",
      "articleContent": "① 세관장은...",
      "similarity": 0.89
    }
  ],
  "metadata": {
    "totalResults": 1,
    "executionTimeMs": 234,
    "embeddingTokens": 12
  }
}
```

#### `/api/rag-answer` 테스트

```bash
curl -X POST http://localhost:3000/api/rag-answer \
  -H "Content-Type: application/json" \
  -d '{
    "query": "수출통관 시 필요한 서류는?",
    "context": [
      {
        "lawName": "관세법",
        "articleDisplay": "제38조",
        "articleContent": "① 세관장은 수출신고를 받은 때에는...",
        "similarity": 0.89
      }
    ]
  }'
```

**예상 응답**: (위 3.2 섹션 참조)

---

### 7.2 UI 통합 테스트

#### 시나리오 1: 정상 플로우

1. RAG 모드 선택
2. "청년 창업 지원 내용은?" 입력
3. 검색 버튼 클릭
4. **확인 사항**:
   - 로딩 스피너 표시
   - AI 답변 카드 표시
   - 검색 결과 카드 3-5개 표시
   - 인용 조문 클릭 가능

#### 시나리오 2: 결과 없음

1. RAG 모드 선택
2. "전혀 관련 없는 질문" 입력 (예: "날씨가 어때?")
3. 검색 버튼 클릭
4. **확인 사항**:
   - "검색 결과가 없습니다" 메시지 표시
   - AI 답변 생성되지 않음
   - 에러 메시지 없음

#### 시나리오 3: 인용 조문 연결

1. RAG 모드에서 검색 수행
2. AI 답변의 인용 조문 클릭
3. **확인 사항**:
   - 자동으로 기본 모드로 전환
   - 해당 법령/조문이 LawViewer에 표시됨
   - 3단 비교, 즐겨찾기 등 기존 기능 사용 가능

#### 시나리오 4: 모드 전환

1. 기본 모드에서 "관세법 38조" 검색
2. RAG 모드로 전환
3. 다시 기본 모드로 전환
4. **확인 사항**:
   - 각 모드의 상태가 독립적으로 유지됨
   - 전환 시 UI 깨짐 없음
   - 기존 검색 결과 유지

---

### 7.3 성능 테스트

#### 응답 시간 목표

- `/api/rag-search`: < 500ms (캐시 히트 시 < 100ms)
- `/api/rag-answer`: < 2000ms
- 전체 플로우: < 3000ms

#### 부하 테스트 (선택)

```bash
# Apache Bench로 간단 테스트
ab -n 100 -c 10 "http://localhost:3000/api/rag-search?query=test"
```

**목표**:
- 100 요청 처리
- 실패율 0%
- 평균 응답 시간 < 1초

---

## 8. 롤백 계획

### 8.1 긴급 비활성화

RAG 기능에 문제가 발생한 경우 빠르게 비활성화하는 방법:

#### 방법 1: UI에서 RAG 모드 숨기기

```typescript
// app/page.tsx

const RAG_ENABLED = false // ← 이 값을 false로 변경

return (
  <div>
    {/* 검색 모드 토글 */}
    {RAG_ENABLED && (
      <div className="flex items-center justify-center gap-2">
        {/* ... 토글 버튼 ... */}
      </div>
    )}

    {/* 기본 검색 UI는 항상 표시 */}
    <SearchBar onSearch={handleSearch} />
    {/* ... */}
  </div>
)
```

**효과**: 사용자는 RAG 기능을 볼 수 없고, 기존 검색만 사용 가능

#### 방법 2: API 엔드포인트 비활성화

```typescript
// app/api/rag-search/route.ts

export async function GET(request: NextRequest) {
  // 최상단에 추가
  return NextResponse.json(
    { success: false, error: 'RAG 검색은 현재 점검 중입니다.' },
    { status: 503 }
  )

  // 기존 코드는 실행되지 않음
}
```

**효과**: API 호출 자체가 실패하므로 완전 비활성화

---

### 8.2 완전 제거

RAG 기능을 완전히 제거해야 하는 경우:

#### 삭제할 파일

```bash
rm -rf app/api/rag-search
rm -rf app/api/rag-answer
rm components/rag-search-panel.tsx
rm components/rag-result-card.tsx
rm components/rag-answer-card.tsx
```

#### app/page.tsx 수정

```typescript
// 다음 코드 블록들을 제거:
// 1. RAG 관련 임포트
// 2. RAG 관련 상태 변수
// 3. handleRagSearch 함수
// 4. RAG UI 렌더링 부분

// 검색 모드 토글도 제거하고 기존 UI만 남김
```

**효과**: 시스템이 RAG 도입 전 상태로 완전 복귀

---

### 8.3 데이터베이스 롤백

임베딩 데이터를 제거해야 하는 경우 (매우 드묾):

```sql
-- Turso DB에서 실행
DELETE FROM law_article_embeddings;
DELETE FROM embedding_cache;
DELETE FROM search_query_embeddings;
DELETE FROM rag_context_logs;
```

**주의**: 이 작업은 되돌릴 수 없으며, 재구축 시 1-2시간 소요

---

## 9. 구현 체크리스트

### Phase 1: API 엔드포인트
- [ ] `app/api/rag-search/route.ts` 파일 생성
- [ ] `/api/rag-search` GET 메서드 구현
- [ ] 파라미터 검증 로직 추가
- [ ] 벡터 검색 호출 및 결과 반환
- [ ] 에러 핸들링 추가
- [ ] 캐싱 헤더 설정
- [ ] `app/api/rag-answer/route.ts` 파일 생성
- [ ] `/api/rag-answer` POST 메서드 구현
- [ ] Gemini API 호출 로직 구현
- [ ] 인용 조문 추출 로직 구현
- [ ] 신뢰도 평가 로직 구현
- [ ] curl 테스트 수행

### Phase 2: UI 컴포넌트
- [ ] `components/rag-search-panel.tsx` 생성
- [ ] 질문 입력 UI 구현
- [ ] 검색 옵션 (토글) 구현
- [ ] 로딩/에러 상태 표시
- [ ] `components/rag-result-card.tsx` 생성
- [ ] 조문 카드 레이아웃 구현
- [ ] 유사도 점수 시각화
- [ ] 클릭 이벤트 핸들러
- [ ] `components/rag-answer-card.tsx` 생성
- [ ] AI 답변 표시 UI 구현
- [ ] 인용 조문 버튼 구현
- [ ] 신뢰도 배지 표시
- [ ] 주의사항 문구 추가

### Phase 3: 기존 시스템 통합
- [ ] `app/page.tsx`에 상태 변수 추가
- [ ] 검색 모드 토글 UI 추가
- [ ] `handleRagSearch` 함수 구현
- [ ] `handleCitationClick` 함수 구현
- [ ] RAG 모드 UI 렌더링 추가
- [ ] 모드별 조건부 렌더링 확인
- [ ] 컴포넌트 임포트 추가
- [ ] 기존 기능 영향 없음 확인

### Phase 0: 임베딩 DB 구축 (로컬)
- [ ] 로컬 환경 설정
- [ ] 개발 서버 실행 확인
- [ ] `npm run build-embeddings` 실행
- [ ] 진행 상태 모니터링
- [ ] 완료 후 DB 확인 (조회 쿼리)
- [ ] 샘플 검색 테스트

### 테스트
- [ ] API 단독 테스트 (curl)
- [ ] UI 단독 테스트 (컴포넌트별)
- [ ] 통합 테스트 (시나리오 1-4)
- [ ] 성능 테스트 (응답 시간)
- [ ] 기존 기능 회귀 테스트
- [ ] 에러 케이스 테스트

### 문서화
- [ ] 이 가이드 검토 및 업데이트
- [ ] CLAUDE.md에 RAG 섹션 추가
- [ ] README에 RAG 사용법 추가

---

## 10. 다음 단계

### 즉시 진행 가능 (웹 환경)

1. **Phase 1 시작**: `/api/rag-search` 구현
2. **Phase 2 진행**: UI 컴포넌트 구현
3. **Phase 3 통합**: 기존 시스템에 연결

### 로컬 환경 필요

1. **Phase 0 실행**: 임베딩 DB 구축
2. **전체 테스트**: 실제 데이터로 E2E 테스트

### 향후 개선 사항

1. **스트리밍 응답**: AI 답변을 실시간으로 표시
2. **답변 캐싱**: 동일 질문에 대한 답변 재사용
3. **피드백 시스템**: 사용자가 답변 품질 평가
4. **하이브리드 검색**: 키워드 + 벡터 혼합 검색
5. **다국어 지원**: 영어 질문 지원 (임베딩 모델 변경)

---

## 마무리

이 가이드를 따라 구현하면:

✅ 기존 시스템에 영향 없이 RAG 기능 추가
✅ 점진적 롤아웃 가능 (모드 토글로 제어)
✅ 문제 발생 시 빠른 롤백 가능
✅ 명확한 구현 순서와 체크리스트

**구현 순서 요약**:
1. API 구현 (2-3시간)
2. UI 구현 (3-4시간)
3. 통합 (2-3시간)
4. 로컬에서 임베딩 DB 구축 (1-2시간)
5. 테스트 및 문서화 (2-3시간)

**총 예상 시간**: 10-15시간

---

**문서 버전**: 1.0
**최종 업데이트**: 2025-11-11
**작성자**: Claude Code (Anthropic)
