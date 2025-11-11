import { db } from './db'
import {
  generateEmbedding,
  blobToVector,
  vectorToBlob,
  getSearchQueryEmbedding,
  storeSearchQueryEmbedding,
} from './embedding'
import { debugLogger } from './debug-logger'

/**
 * Vector Similarity Search using LibSQL
 * Phase 6: L0 Search Layer Implementation
 */

export interface SimilarQuery {
  id: number
  queryText: string
  normalizedText: string | null
  similarityScore: number
  mappedPattern: string | null
  mappingId: number | null
  searchCount: number
}

export interface SimilarArticle {
  id: number
  lawId: string
  lawName: string
  articleJo: string
  articleDisplay: string | null
  articleTitle: string | null
  articleContent: string
  similarityScore: number
  keywords: string | null
  effectiveDate: string | null
}

// ============================================
// Vector Similarity Search
// ============================================

/**
 * Search for similar queries using vector similarity
 * Returns top K most similar queries with similarity score >= threshold
 */
export async function searchSimilarQueries(
  queryText: string,
  options?: {
    topK?: number
    threshold?: number
    excludeSelf?: boolean
  }
): Promise<SimilarQuery[]> {
  const topK = options?.topK || 5
  const threshold = options?.threshold || 0.85 // 85% similarity
  const excludeSelf = options?.excludeSelf ?? true

  debugLogger.info(`[Vector Search] Searching similar queries for: "${queryText}"`)

  // 1. Generate or retrieve embedding for query
  let queryEmbedding: number[]

  const existingEmbedding = await getSearchQueryEmbedding(queryText)
  if (existingEmbedding) {
    queryEmbedding = existingEmbedding.embedding
    debugLogger.debug('[Vector Search] Using cached query embedding')
  } else {
    const result = await generateEmbedding(queryText)
    queryEmbedding = result.embedding
    debugLogger.debug(
      `[Vector Search] Generated new embedding (${result.tokens} tokens, cached: ${result.cached})`
    )
  }

  // 2. Search using LibSQL vector_distance_cos
  // Note: LibSQL uses cosine distance (0 = identical, 2 = opposite)
  // We convert to similarity (1 = identical, 0 = orthogonal, -1 = opposite)
  const queryBlob = vectorToBlob(queryEmbedding)

  try {
    const result = await db.execute({
      sql: `
        SELECT
          id,
          query_text,
          normalized_text,
          mapped_pattern,
          mapping_id,
          search_count,
          (1 - vector_distance_cos(embedding, ?) / 2) as similarity_score
        FROM search_query_embeddings
        WHERE (1 - vector_distance_cos(embedding, ?) / 2) >= ?
          ${excludeSelf ? 'AND query_text != ?' : ''}
        ORDER BY similarity_score DESC
        LIMIT ?
      `,
      args: excludeSelf
        ? [queryBlob, queryBlob, threshold, queryText, topK]
        : [queryBlob, queryBlob, threshold, topK],
    })

    const similarQueries: SimilarQuery[] = result.rows.map((row) => ({
      id: row.id as number,
      queryText: row.query_text as string,
      normalizedText: (row.normalized_text as string) || null,
      similarityScore: row.similarity_score as number,
      mappedPattern: (row.mapped_pattern as string) || null,
      mappingId: (row.mapping_id as number) || null,
      searchCount: row.search_count as number,
    }))

    debugLogger.success(
      `[Vector Search] Found ${similarQueries.length} similar queries (threshold: ${threshold})`
    )

    if (similarQueries.length > 0) {
      debugLogger.debug(
        `[Vector Search] Top result: "${similarQueries[0].queryText}" (similarity: ${similarQueries[0].similarityScore.toFixed(3)})`
      )
    }

    return similarQueries
  } catch (error) {
    debugLogger.error('[Vector Search] Query search failed:', error)
    throw error
  }
}

/**
 * Search for similar law articles using vector similarity
 * Useful for finding related articles across different laws
 */
export async function searchSimilarArticles(
  queryText: string,
  options?: {
    topK?: number
    threshold?: number
    lawId?: string // Filter by specific law
  }
): Promise<SimilarArticle[]> {
  const topK = options?.topK || 10
  const threshold = options?.threshold || 0.75 // 75% similarity for articles
  const lawId = options?.lawId

  debugLogger.info(
    `[Vector Search] Searching similar articles for: "${queryText}"${lawId ? ` (law: ${lawId})` : ''}`
  )

  // 1. Generate embedding for query
  const result = await generateEmbedding(queryText)
  const queryEmbedding = result.embedding
  const queryBlob = vectorToBlob(queryEmbedding)

  // 2. Search law articles using content_embedding
  try {
    const sql = `
      SELECT
        id,
        law_id,
        law_name,
        article_jo,
        article_display,
        article_title,
        article_content,
        keywords,
        effective_date,
        (1 - vector_distance_cos(content_embedding, ?) / 2) as similarity_score
      FROM law_article_embeddings
      WHERE (1 - vector_distance_cos(content_embedding, ?) / 2) >= ?
        ${lawId ? 'AND law_id = ?' : ''}
      ORDER BY similarity_score DESC
      LIMIT ?
    `

    const args = lawId
      ? [queryBlob, queryBlob, threshold, lawId, topK]
      : [queryBlob, queryBlob, threshold, topK]

    const dbResult = await db.execute({ sql, args })

    const similarArticles: SimilarArticle[] = dbResult.rows.map((row) => ({
      id: row.id as number,
      lawId: row.law_id as string,
      lawName: row.law_name as string,
      articleJo: row.article_jo as string,
      articleDisplay: (row.article_display as string) || null,
      articleTitle: (row.article_title as string) || null,
      articleContent: row.article_content as string,
      similarityScore: row.similarity_score as number,
      keywords: (row.keywords as string) || null,
      effectiveDate: (row.effective_date as string) || null,
    }))

    debugLogger.success(
      `[Vector Search] Found ${similarArticles.length} similar articles (threshold: ${threshold})`
    )

    return similarArticles
  } catch (error) {
    debugLogger.error('[Vector Search] Article search failed:', error)
    throw error
  }
}

/**
 * Find best matching query using vector similarity
 * Returns the single best match with its mapping information
 */
export async function findBestMatchingQuery(
  queryText: string,
  minSimilarity: number = 0.90
): Promise<SimilarQuery | null> {
  const results = await searchSimilarQueries(queryText, {
    topK: 1,
    threshold: minSimilarity,
    excludeSelf: true,
  })

  return results.length > 0 ? results[0] : null
}

/**
 * Check if a similar query already exists in the database
 * Used before storing new embeddings to avoid duplicates
 */
export async function hasSimilarQuery(
  queryText: string,
  minSimilarity: number = 0.95
): Promise<boolean> {
  const match = await findBestMatchingQuery(queryText, minSimilarity)
  return match !== null
}

// ============================================
// L0 Search Strategy Integration
// ============================================

export interface L0SearchResult {
  found: boolean
  mappingId: number | null
  mappedPattern: string | null
  similarQuery: string | null
  similarityScore: number | null
  source: 'L0_vector'
}

/**
 * L0: Vector similarity search layer
 * First layer in the search cascade, handles typos and similar queries
 *
 * Returns mapping information if a similar query is found
 */
export async function l0VectorSearch(
  queryText: string
): Promise<L0SearchResult> {
  const startTime = Date.now()

  debugLogger.info(`🔍 [L0 Vector] Searching for: "${queryText}"`)

  try {
    const bestMatch = await findBestMatchingQuery(queryText, 0.80)

    const elapsed = Date.now() - startTime

    if (bestMatch && bestMatch.mappingId) {
      debugLogger.success(
        `🎯 [L0 Vector] Match found in ${elapsed}ms: "${bestMatch.queryText}" (similarity: ${bestMatch.similarityScore.toFixed(3)}, mappingId: ${bestMatch.mappingId})`
      )

      return {
        found: true,
        mappingId: bestMatch.mappingId,
        mappedPattern: bestMatch.mappedPattern,
        similarQuery: bestMatch.queryText,
        similarityScore: bestMatch.similarityScore,
        source: 'L0_vector',
      }
    }

    debugLogger.warning(`❌ [L0 Vector] No match found in ${elapsed}ms (threshold: 0.80)`)

    return {
      found: false,
      mappingId: null,
      mappedPattern: null,
      similarQuery: null,
      similarityScore: null,
      source: 'L0_vector',
    }
  } catch (error) {
    debugLogger.error('❌ [L0 Vector] Search failed:', error)
    throw error
  }
}

// ============================================
// Batch Operations
// ============================================

/**
 * Store embeddings for multiple queries at once
 * More efficient than calling storeSearchQueryEmbedding in a loop
 */
export async function storeSearchQueryEmbeddingsBatch(
  queries: Array<{
    queryText: string
    embedding: number[]
    normalizedText?: string
    mappedPattern?: string
    mappingId?: number
  }>
): Promise<void> {
  if (queries.length === 0) return

  const values = queries
    .map(
      () =>
        `(?, ?, ?, ?, ?, ?, 1)`
    )
    .join(', ')

  const args = queries.flatMap((q) => [
    q.queryText,
    q.normalizedText || null,
    vectorToBlob(q.embedding),
    'voyage-3-lite',
    q.mappedPattern || null,
    q.mappingId || null,
  ])

  await db.execute({
    sql: `
      INSERT INTO search_query_embeddings (
        query_text,
        normalized_text,
        embedding,
        embedding_model,
        mapped_pattern,
        mapping_id,
        search_count
      ) VALUES ${values}
      ON CONFLICT(query_text) DO UPDATE SET
        search_count = search_count + 1,
        last_searched_at = datetime('now')
    `,
    args,
  })

  debugLogger.success(`[Vector Search] Stored ${queries.length} query embeddings in batch`)
}

// ============================================
// Cosine Similarity Utility
// ============================================

/**
 * Calculate cosine similarity between two vectors
 * Returns value between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite)
 *
 * Note: Primarily for testing, use LibSQL's vector_distance_cos() in production
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length')
  }

  let dotProduct = 0
  let magnitudeA = 0
  let magnitudeB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    magnitudeA += a[i] * a[i]
    magnitudeB += b[i] * b[i]
  }

  magnitudeA = Math.sqrt(magnitudeA)
  magnitudeB = Math.sqrt(magnitudeB)

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0
  }

  return dotProduct / (magnitudeA * magnitudeB)
}
