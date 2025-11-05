# 핵심 구현 코드 예시

> **작성일**: 2025-11-05
> **목적**: 각 Phase별 핵심 코드 제공

---

## lib/db.ts (Turso 클라이언트)

```typescript
import { createClient } from '@libsql/client'

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

export async function query(sql: string, params?: any[]) {
  return db.execute({ sql, args: params || [] })
}

export async function queryOne(sql: string, params?: any[]) {
  const result = await query(sql, params)
  return result.rows[0] || null
}

export async function queryAll(sql: string, params?: any[]) {
  const result = await query(sql, params)
  return result.rows
}
```

---

## lib/search-feedback-db.ts (핵심 쿼리)

```typescript
import { db, query, queryOne } from './db'

export async function recordSearchQuery(params: {
  rawQuery: string
  normalizedQuery: string
  parsedLawName: string
  parsedArticle?: string
  parsedJo?: string
  searchType: 'law' | 'ordinance'
  sessionId?: string
}): Promise<number> {
  const result = await query(`
    INSERT INTO search_queries (
      raw_query, normalized_query, parsed_law_name,
      parsed_article, parsed_jo, search_type, user_session_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    params.rawQuery,
    params.normalizedQuery,
    params.parsedLawName,
    params.parsedArticle || null,
    params.parsedJo || null,
    params.searchType,
    params.sessionId || null
  ])

  return result.lastInsertRowid as number
}

export async function recordSearchResult(params: {
  queryId: number
  lawId?: string
  lawTitle: string
  lawMst?: string
  articleJo?: string
  articleContent?: string
  effectiveDate?: string
  resultType: 'law' | 'ordinance'
}): Promise<number> {
  const result = await query(`
    INSERT INTO search_results (
      query_id, law_id, law_title, law_mst,
      article_jo, article_content, effective_date, result_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    params.queryId,
    params.lawId || null,
    params.lawTitle,
    params.lawMst || null,
    params.articleJo || null,
    params.articleContent || null,
    params.effectiveDate || null,
    params.resultType
  ])

  return result.lastInsertRowid as number
}

export async function recordApiMapping(params: {
  pattern: string
  lawName: string
  article: string
  jo: string
  apiParams: any
}): Promise<number> {
  const result = await query(`
    INSERT INTO api_parameter_mappings (
      normalized_pattern, law_name, article_display, article_jo,
      api_params, api_endpoint, success_count, last_success_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
    ON CONFLICT(normalized_pattern) DO UPDATE SET
      success_count = success_count + 1,
      last_success_at = datetime('now')
  `, [
    params.pattern,
    params.lawName,
    params.article,
    params.jo,
    JSON.stringify(params.apiParams),
    '/api/eflaw'
  ])

  return result.lastInsertRowid as number
}

export async function searchDirectMapping(pattern: string) {
  return await queryOne(`
    SELECT *
    FROM api_parameter_mappings
    WHERE normalized_pattern = ? AND is_verified = 1
    ORDER BY quality_score DESC
    LIMIT 1
  `, [pattern])
}
```

---

## lib/search-strategy.ts (통합 검색)

```typescript
import { parseSearchQuery } from './law-parser'
import { normalizeSearchQuery, createSearchPattern } from './search-normalizer'
import { searchDirectMapping } from './search-feedback-db'
import { searchSimilarVariants } from './variant-matcher'
import { debugLogger } from './debug-logger'

export async function intelligentSearch(rawQuery: string) {
  const startTime = Date.now()
  let strategy: string
  let result: any

  try {
    // 정규화
    const normalized = normalizeSearchQuery(rawQuery)
    const pattern = createSearchPattern(normalized)

    debugLogger.info("검색 시작", { rawQuery, pattern })

    // L1: 직접 매핑
    result = await searchDirectMapping(pattern)
    if (result) {
      strategy = 'direct_mapping'
      debugLogger.success("✨ L1 직접 매핑 HIT", {
        time: Date.now() - startTime
      })
      return {
        source: 'L1_mapping',
        data: JSON.parse(result.api_params),
        time: Date.now() - startTime
      }
    }

    // L2: 유사 검색어
    result = await searchSimilarVariants(rawQuery, pattern)
    if (result) {
      strategy = 'variant_match'
      debugLogger.success("🔄 L2 유사 검색어 HIT", {
        time: Date.now() - startTime
      })
      return {
        source: 'L2_variant',
        data: result,
        time: Date.now() - startTime
      }
    }

    // L3: 고품질 캐시
    result = await searchQualityCache(pattern)
    if (result) {
      strategy = 'quality_cache'
      return { source: 'L3_cache', data: result, time: Date.now() - startTime }
    }

    // L4: API 호출
    debugLogger.warning("⏳ L4 API 호출 필요")
    const parsed = parseSearchQuery(rawQuery)
    result = await fetchFromAPI(parsed)
    strategy = 'api_call'

    // 자동 학습
    if (result) {
      await learnFromSuccessfulSearch({ rawQuery, normalized, pattern, parsed, apiResult: result })
    }

    return { source: 'L4_api', data: result, time: Date.now() - startTime }

  } finally {
    await logSearchStrategy({ rawQuery, strategy, totalTime: Date.now() - startTime })
  }
}

async function searchQualityCache(pattern: string) {
  const result = await queryOne(`
    SELECT sr.*, sqs.quality_score
    FROM search_results sr
    JOIN search_queries sq ON sr.query_id = sq.id
    JOIN search_quality_scores sqs ON sqs.search_result_id = sr.id
    WHERE sq.normalized_query = ?
      AND sqs.quality_score >= 0.7
      AND sr.created_at > datetime('now', '-30 days')
    ORDER BY sqs.quality_score DESC
    LIMIT 1
  `, [pattern])

  return result
}
```

---

## lib/variant-generator.ts (유사 검색어 생성)

```typescript
export function generateVariants(
  rawQuery: string,
  parsed: { lawName: string; article?: string }
): Array<{ query: string; type: string; confidence: number }> {
  const variants: Array<{ query: string; type: string; confidence: number }> = []
  const { lawName, article } = parsed

  if (!article) return variants

  // 1. 띄어쓰기 변형
  variants.push(
    { query: `${lawName} ${article}`, type: 'spacing', confidence: 1.0 },
    { query: `${lawName}${article}`, type: 'spacing', confidence: 0.95 },
    { query: `${lawName}  ${article}`, type: 'spacing', confidence: 0.9 }
  )

  // 2. 조문 표기 변형
  const articleNum = article.replace(/[^0-9]/g, '')
  const branchMatch = article.match(/의(\d+)/)

  if (branchMatch) {
    const branchNum = branchMatch[1]
    variants.push(
      { query: `${lawName} ${articleNum}조의${branchNum}`, type: 'article_format', confidence: 1.0 },
      { query: `${lawName} 제${articleNum}조의${branchNum}`, type: 'article_format', confidence: 1.0 },
      { query: `${lawName} ${articleNum}-${branchNum}`, type: 'article_format', confidence: 0.85 }
    )
  } else {
    variants.push(
      { query: `${lawName} ${articleNum}조`, type: 'article_format', confidence: 1.0 },
      { query: `${lawName} 제${articleNum}조`, type: 'article_format', confidence: 1.0 },
      { query: `${lawName} ${articleNum}`, type: 'article_format', confidence: 0.9 }
    )
  }

  // 3. 오타 패턴
  const typos = [
    { from: '법', to: '벚' },
    { from: '제', to: '재' }
  ]

  for (const typo of typos) {
    const typoQuery = rawQuery.replace(typo.from, typo.to)
    if (typoQuery !== rawQuery) {
      variants.push({ query: typoQuery, type: 'typo', confidence: 0.7 })
    }
  }

  return Array.from(new Map(variants.map(v => [v.query, v])).values())
}
```

---

## lib/embedding.ts (벡터 임베딩)

```typescript
import crypto from 'crypto'
import { db, queryOne, query } from './db'

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY!
const EMBEDDING_MODEL = 'voyage-3-lite'

export async function generateEmbedding(text: string): Promise<number[]> {
  // 캐시 확인
  const cached = await getCachedEmbedding(text)
  if (cached) return cached

  // API 호출
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: text,
      model: EMBEDDING_MODEL,
    }),
  })

  const data = await response.json()
  const embedding = data.data[0].embedding

  // 캐시 저장
  await cacheEmbedding(text, embedding)

  return embedding
}

async function getCachedEmbedding(text: string): Promise<number[] | null> {
  const hash = crypto.createHash('sha256').update(text).digest('hex')

  const cached = await queryOne(`
    SELECT embedding FROM embedding_cache
    WHERE text_hash = ? AND embedding_model = ?
  `, [hash, EMBEDDING_MODEL])

  if (cached) {
    await query(`
      UPDATE embedding_cache
      SET hit_count = hit_count + 1, last_accessed_at = datetime('now')
      WHERE text_hash = ?
    `, [hash])

    return blobToVector(cached.embedding)
  }

  return null
}

async function cacheEmbedding(text: string, embedding: number[]): Promise<void> {
  const hash = crypto.createHash('sha256').update(text).digest('hex')
  const blob = vectorToBlob(embedding)

  await query(`
    INSERT INTO embedding_cache (text_hash, original_text, embedding, embedding_model)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(text_hash) DO NOTHING
  `, [hash, text, blob, EMBEDDING_MODEL])
}

function vectorToBlob(vector: number[]): Buffer {
  const buffer = Buffer.allocUnsafe(vector.length * 4)
  for (let i = 0; i < vector.length; i++) {
    buffer.writeFloatLE(vector[i], i * 4)
  }
  return buffer
}

function blobToVector(blob: Buffer): number[] {
  const vector: number[] = []
  for (let i = 0; i < blob.length; i += 4) {
    vector.push(blob.readFloatLE(i))
  }
  return vector
}
```

---

## components/search-feedback-button.tsx

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { toast } from 'sonner'

export function SearchFeedbackButton({
  searchResultId
}: {
  searchResultId: number
}) {
  const [feedback, setFeedback] = useState<'positive' | 'negative' | null>(null)
  const [loading, setLoading] = useState(false)

  const handleFeedback = async (type: 'positive' | 'negative') => {
    if (loading) return

    setLoading(true)
    setFeedback(type)

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchResultId,
          feedbackType: type,
        })
      })

      if (response.ok) {
        toast.success('피드백이 저장되었습니다')
      } else {
        throw new Error('피드백 저장 실패')
      }
    } catch (error) {
      console.error(error)
      toast.error('피드백 저장에 실패했습니다')
      setFeedback(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={feedback === 'positive' ? 'default' : 'outline'}
        size="sm"
        onClick={() => handleFeedback('positive')}
        disabled={loading || feedback !== null}
      >
        <ThumbsUp className="h-4 w-4 mr-1" />
        정확함
      </Button>
      <Button
        variant={feedback === 'negative' ? 'destructive' : 'outline'}
        size="sm"
        onClick={() => handleFeedback('negative')}
        disabled={loading || feedback !== null}
      >
        <ThumbsDown className="h-4 w-4 mr-1" />
        부정확함
      </Button>
    </div>
  )
}
```

---

## app/api/feedback/route.ts

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getOrCreateSessionId } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    const { searchResultId, feedbackType, feedbackDetail } = await request.json()

    if (!searchResultId || !feedbackType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const sessionId = getOrCreateSessionId()

    await query(`
      INSERT INTO user_feedback (
        search_result_id,
        feedback_type,
        feedback_detail,
        user_session_id
      ) VALUES (?, ?, ?, ?)
    `, [
      searchResultId,
      feedbackType,
      feedbackDetail ? JSON.stringify(feedbackDetail) : null,
      sessionId
    ])

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[feedback] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

---

## 사용 예시 (app/page.tsx 통합)

```typescript
// app/page.tsx
'use client'

import { intelligentSearch } from '@/lib/search-strategy'
import { SearchFeedbackButton } from '@/components/search-feedback-button'

export default function Page() {
  const [searchResultId, setSearchResultId] = useState<number | null>(null)

  const handleSearch = async (query: string) => {
    // 통합 검색
    const result = await intelligentSearch(query)

    console.log(`검색 완료: ${result.source}, ${result.time}ms`)

    // 결과 표시
    setLawData(result.data)
    setSearchResultId(result.data.searchResultId) // DB에 저장된 ID
  }

  return (
    <div>
      {/* 검색 UI */}
      <SearchBar onSearch={handleSearch} />

      {/* 결과 표시 */}
      {lawData && (
        <div>
          <div className="flex justify-between items-center">
            <h2>{lawData.lawTitle}</h2>

            {/* 피드백 버튼 */}
            {searchResultId && (
              <SearchFeedbackButton searchResultId={searchResultId} />
            )}
          </div>

          <LawViewer data={lawData} />
        </div>
      )}
    </div>
  )
}
```
