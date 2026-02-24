/**
 * POC: 자체 벡터 검색 + LLM 생성 RAG
 *
 * Gemini File Search Store 없이, Turso 벡터 검색 → Gemini Flash 생성
 * 기존 file-search-rag와 A/B 비교용
 *
 * GET  → DB 상태 확인 (인덱싱된 조문 수)
 * POST → RAG 검색 + 답변 생성
 */

import { analyzeLegalQuery } from '@/lib/legal-query-analyzer'
import { getSpecialistPrompt } from '@/lib/ai-agents/specialist-agents'
import type { QueryType } from '@/lib/ai-agents/types'
import { preprocessQuery } from '@/lib/query-preprocessor'
import { db } from '@/lib/db'
import { NextRequest } from 'next/server'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
const EMBEDDING_MODEL = 'gemini-embedding-001'
const EMBEDDING_DIMS = 512

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET: DB 상태 확인
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function GET() {
  try {
    const countResult = await db.execute({
      sql: 'SELECT COUNT(*) as total FROM law_article_embeddings',
      args: [],
    })
    const total = countResult.rows[0]?.total as number || 0

    const lawsResult = await db.execute({
      sql: 'SELECT DISTINCT law_name, COUNT(*) as articles FROM law_article_embeddings GROUP BY law_name ORDER BY law_name',
      args: [],
    })

    return Response.json({
      status: total > 0 ? 'ready' : 'empty',
      totalArticles: total,
      laws: lawsResult.rows.map(r => ({
        name: r.law_name,
        articles: r.articles,
      })),
      hint: total === 0
        ? 'Run: npx tsx scripts/build-embeddings-gemini.mts'
        : undefined,
    })
  } catch (error) {
    return Response.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'DB connection failed',
      hint: 'Check TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in .env.local',
    }, { status: 500 })
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST: RAG 검색 + 답변 생성
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface SearchArticle {
  id: number
  lawName: string
  articleJo: string
  articleDisplay: string | null
  articleTitle: string | null
  articleContent: string
  similarityScore: number
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const { query } = await request.json()

    if (!query || typeof query !== 'string') {
      return Response.json({ error: 'query is required' }, { status: 400 })
    }

    // ── 1. 쿼리 전처리 ──
    const preprocessed = await preprocessQuery(query)
    const effectiveQuery = preprocessed.processedQuery || query

    // ── 2. 법률 질문 분석 ──
    const legalAnalysis = analyzeLegalQuery(query)
    const queryType = legalAnalysis.type as QueryType

    // ── 3. Gemini 임베딩으로 벡터 검색 ──
    const articles = await searchWithGeminiEmbedding(effectiveQuery, 7, 0.3)

    if (articles.length === 0) {
      return Response.json({
        answer: '관련 법령 조문을 찾지 못했습니다. 다른 키워드로 검색해 보세요.',
        citations: [],
        searchResults: [],
        meta: {
          queryType,
          vectorResults: 0,
          elapsedMs: Date.now() - startTime,
          hint: 'law_article_embeddings 테이블에 데이터가 있는지 확인하세요 (GET /api/rag-search-poc)',
        },
      })
    }

    // ── 4. 컨텍스트 구성 ──
    const context = buildContext(articles)

    // ── 5. LLM 생성 (Gemini Flash) ──
    const systemPrompt = getSpecialistPrompt(queryType, 'moderate')
    const answer = await callGeminiFlash(systemPrompt, context, query)

    // ── 6. Citation 매핑 ──
    const citations = articles.map(a => ({
      lawName: a.lawName,
      articleJo: a.articleJo,
      articleDisplay: a.articleDisplay,
      articleTitle: a.articleTitle,
      relevanceScore: a.similarityScore,
    }))

    const avgScore = articles.reduce((sum, a) => sum + a.similarityScore, 0) / articles.length
    const confidenceLevel =
      articles.length >= 3 && avgScore > 0.7 ? 'high' :
      articles.length >= 1 && avgScore > 0.4 ? 'medium' : 'low'

    return Response.json({
      answer,
      citations,
      confidenceLevel,
      queryType,
      searchResults: articles.map(a => ({
        lawName: a.lawName,
        articleJo: a.articleJo,
        articleDisplay: a.articleDisplay,
        articleTitle: a.articleTitle,
        similarityScore: a.similarityScore,
        contentPreview: a.articleContent.substring(0, 200) + '...',
      })),
      meta: {
        pipeline: 'vector-rag-poc',
        vectorResults: articles.length,
        avgSimilarity: Math.round(avgScore * 1000) / 1000,
        elapsedMs: Date.now() - startTime,
        model: 'gemini-2.5-flash',
        embeddingModel: EMBEDDING_MODEL,
      },
    })
  } catch (error) {
    console.error('[RAG POC] Error:', error)
    return Response.json(
      {
        error: 'RAG search failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gemini Embedding → LibSQL 벡터 검색
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function getGeminiEmbedding(text: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: EMBEDDING_DIMS,
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini embedding error (${res.status}): ${err}`)
  }

  const data = await res.json()
  return data.embedding?.values as number[]
}

async function searchWithGeminiEmbedding(
  queryText: string,
  topK: number,
  threshold: number,
): Promise<SearchArticle[]> {
  const embedding = await getGeminiEmbedding(queryText)
  const queryBlob = Buffer.from(new Float32Array(embedding).buffer)

  const result = await db.execute({
    sql: `
      SELECT
        id, law_name, article_jo, article_display, article_title, article_content,
        (1 - vector_distance_cos(content_embedding, ?) / 2) as similarity_score
      FROM law_article_embeddings
      WHERE (1 - vector_distance_cos(content_embedding, ?) / 2) >= ?
      ORDER BY similarity_score DESC
      LIMIT ?
    `,
    args: [queryBlob, queryBlob, threshold, topK],
  })

  return result.rows.map(row => ({
    id: row.id as number,
    lawName: row.law_name as string,
    articleJo: row.article_jo as string,
    articleDisplay: (row.article_display as string) || null,
    articleTitle: (row.article_title as string) || null,
    articleContent: row.article_content as string,
    similarityScore: row.similarity_score as number,
  }))
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 컨텍스트 구성
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildContext(articles: SearchArticle[]): string {
  return articles.map((a, i) => {
    const header = `[${i + 1}] 「${a.lawName}」 ${a.articleDisplay || a.articleJo}${a.articleTitle ? ` (${a.articleTitle})` : ''}`
    const score = `[유사도: ${(a.similarityScore * 100).toFixed(1)}%]`
    return `${header} ${score}\n${a.articleContent}`
  }).join('\n\n---\n\n')
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gemini Flash API 호출 (생성만, File Search 없이)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function callGeminiFlash(
  systemPrompt: string,
  context: string,
  userQuery: string
): Promise<string> {
  const userMessage = `다음은 벡터 검색으로 찾은 관련 법령 조문입니다. 이 조문들만을 근거로 답변하세요.

[검색된 법령 조문]
${context}

[사용자 질문]
${userQuery}

[필수 규칙]
- 위 조문에 근거한 답변만 하세요
- 조문에 없는 내용을 추측하지 마세요
- 조문 번호를 반드시 명시하세요`

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: userMessage }],
        }],
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        generationConfig: {
          temperature: 0,
          topP: 0.8,
          topK: 20,
          maxOutputTokens: 6144,
        },
      }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini API error (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  const answer = data.candidates?.[0]?.content?.parts?.[0]?.text

  if (!answer) {
    throw new Error('Gemini returned empty response')
  }

  return answer
}
