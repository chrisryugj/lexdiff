/**
 * RAG Vector Search API
 *
 * 사용자의 자연어 질문을 임베딩으로 변환하고,
 * 유사한 조문들을 벡터 검색으로 찾아 반환합니다.
 *
 * GET /api/rag-search?query={질문}&limit={개수}&threshold={임계값}&lawFilter={법령명}
 */

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

    if (limit < 1 || limit > 20) {
      return NextResponse.json(
        { success: false, error: 'Limit must be between 1 and 20' },
        { status: 400 }
      )
    }

    if (threshold < 0 || threshold > 1) {
      return NextResponse.json(
        { success: false, error: 'Threshold must be between 0 and 1' },
        { status: 400 }
      )
    }

    console.log('🔍 RAG Search:', { query, limit, threshold, lawFilter })

    // 2. 질문 임베딩 생성
    const embeddingResult = await generateEmbedding(query)
    console.log(`  ✓ Embedding generated: ${embeddingResult.tokens} tokens`)

    // 3. 벡터 유사도 검색
    const results = await searchSimilarArticles(query, {
      limit,
      threshold,
      lawFilter,
      useCache: true,
    })

    console.log(`  ✓ Found ${results.length} similar articles`)

    // 4. 결과 반환
    return NextResponse.json(
      {
        success: true,
        query,
        results: results.map((r) => ({
          lawId: r.lawId,
          lawName: r.lawName,
          articleJo: r.articleJo,
          articleDisplay: r.articleDisplay || `제${parseInt(r.articleJo.substring(0, 4))}조`,
          articleTitle: r.articleTitle,
          articleContent: r.articleContent,
          similarity: r.similarity,
          keywords: r.keywords,
        })),
        metadata: {
          totalResults: results.length,
          executionTimeMs: Date.now() - startTime,
          embeddingTokens: embeddingResult.tokens,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    )
  } catch (error) {
    console.error('❌ RAG search error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}
