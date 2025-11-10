import { db } from './db'
import { createHash } from 'crypto'

/**
 * Voyage AI 임베딩 생성 및 캐싱 시스템
 * Phase 6: Vector Search Implementation
 */

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY
const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings'
const EMBEDDING_MODEL = 'voyage-3-lite' // 512 dimensions
const EMBEDDING_DIMENSIONS = 512

// ============================================
// Vector Blob Utilities
// ============================================

/**
 * Convert number array to Float32 Buffer for LibSQL F32_BLOB
 */
export function vectorToBlob(vector: number[]): Buffer {
  const float32Array = new Float32Array(vector)
  return Buffer.from(float32Array.buffer)
}

/**
 * Convert LibSQL F32_BLOB Buffer back to number array
 */
export function blobToVector(blob: Buffer | Uint8Array): number[] {
  const buffer = Buffer.isBuffer(blob) ? blob : Buffer.from(blob)
  const float32Array = new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / 4
  )
  return Array.from(float32Array)
}

// ============================================
// Text Hashing for Cache Keys
// ============================================

/**
 * Generate SHA-256 hash for text to use as cache key
 */
export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

// ============================================
// Voyage AI API Integration
// ============================================

interface VoyageEmbeddingResponse {
  data: Array<{
    embedding: number[]
    index: number
  }>
  model: string
  usage: {
    total_tokens: number
  }
}

/**
 * Call Voyage AI API to generate embeddings
 * @private - Use generateEmbedding() instead for automatic caching
 */
async function callVoyageAPI(texts: string[]): Promise<VoyageEmbeddingResponse> {
  if (!VOYAGE_API_KEY) {
    throw new Error('VOYAGE_API_KEY not configured in environment variables')
  }

  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: texts,
      model: EMBEDDING_MODEL,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `Voyage AI API error (${response.status}): ${errorText}`
    )
  }

  return response.json()
}

// ============================================
// Embedding Generation with Caching
// ============================================

export interface EmbeddingResult {
  embedding: number[]
  model: string
  tokens: number
  cached: boolean
}

/**
 * Generate embedding for text with automatic database caching
 * Checks cache first, falls back to API if not found
 */
export async function generateEmbedding(
  text: string
): Promise<EmbeddingResult> {
  const textHash = hashText(text)

  // 1. Check cache first
  try {
    const cached = await db.execute({
      sql: `
        SELECT embedding, embedding_model, hit_count
        FROM embedding_cache
        WHERE text_hash = ?
      `,
      args: [textHash],
    })

    if (cached.rows.length > 0) {
      const row = cached.rows[0]
      const embeddingBlob = row.embedding as Buffer

      // Update hit count and last accessed time
      await db.execute({
        sql: `
          UPDATE embedding_cache
          SET hit_count = hit_count + 1,
              last_accessed_at = datetime('now')
          WHERE text_hash = ?
        `,
        args: [textHash],
      })

      return {
        embedding: blobToVector(embeddingBlob),
        model: row.embedding_model as string,
        tokens: 0, // Cached, no tokens used
        cached: true,
      }
    }
  } catch (error) {
    console.error('Cache lookup error:', error)
    // Continue to API call if cache fails
  }

  // 2. Call Voyage AI API
  const apiResponse = await callVoyageAPI([text])
  const embedding = apiResponse.data[0].embedding

  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected ${EMBEDDING_DIMENSIONS} dimensions, got ${embedding.length}`
    )
  }

  // 3. Store in cache
  try {
    await db.execute({
      sql: `
        INSERT INTO embedding_cache (
          text_hash,
          original_text,
          embedding,
          embedding_model,
          hit_count
        ) VALUES (?, ?, ?, ?, 0)
        ON CONFLICT(text_hash) DO UPDATE SET
          hit_count = hit_count + 1,
          last_accessed_at = datetime('now')
      `,
      args: [textHash, text, vectorToBlob(embedding), EMBEDDING_MODEL],
    })
  } catch (error) {
    console.error('Cache storage error:', error)
    // Continue even if cache fails
  }

  return {
    embedding,
    model: apiResponse.model,
    tokens: apiResponse.usage.total_tokens,
    cached: false,
  }
}

/**
 * Generate embeddings for multiple texts in batch
 * More efficient than calling generateEmbedding() in a loop
 */
export async function generateEmbeddingsBatch(
  texts: string[]
): Promise<EmbeddingResult[]> {
  if (texts.length === 0) return []

  const results: EmbeddingResult[] = []
  const uncachedTexts: string[] = []
  const uncachedIndexes: number[] = []

  // 1. Check cache for all texts
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i]
    const textHash = hashText(text)

    try {
      const cached = await db.execute({
        sql: `
          SELECT embedding, embedding_model
          FROM embedding_cache
          WHERE text_hash = ?
        `,
        args: [textHash],
      })

      if (cached.rows.length > 0) {
        const row = cached.rows[0]
        results[i] = {
          embedding: blobToVector(row.embedding as Buffer),
          model: row.embedding_model as string,
          tokens: 0,
          cached: true,
        }

        // Update hit count
        await db.execute({
          sql: `
            UPDATE embedding_cache
            SET hit_count = hit_count + 1,
                last_accessed_at = datetime('now')
            WHERE text_hash = ?
          `,
          args: [textHash],
        })
      } else {
        uncachedTexts.push(text)
        uncachedIndexes.push(i)
      }
    } catch (error) {
      console.error(`Cache lookup error for text ${i}:`, error)
      uncachedTexts.push(text)
      uncachedIndexes.push(i)
    }
  }

  // 2. Generate embeddings for uncached texts
  if (uncachedTexts.length > 0) {
    const apiResponse = await callVoyageAPI(uncachedTexts)

    for (let i = 0; i < uncachedTexts.length; i++) {
      const text = uncachedTexts[i]
      const embedding = apiResponse.data[i].embedding
      const originalIndex = uncachedIndexes[i]

      results[originalIndex] = {
        embedding,
        model: apiResponse.model,
        tokens: Math.floor(apiResponse.usage.total_tokens / uncachedTexts.length),
        cached: false,
      }

      // Store in cache
      try {
        const textHash = hashText(text)
        await db.execute({
          sql: `
            INSERT INTO embedding_cache (
              text_hash,
              original_text,
              embedding,
              embedding_model,
              hit_count
            ) VALUES (?, ?, ?, ?, 0)
            ON CONFLICT(text_hash) DO NOTHING
          `,
          args: [textHash, text, vectorToBlob(embedding), EMBEDDING_MODEL],
        })
      } catch (error) {
        console.error(`Cache storage error for text ${i}:`, error)
      }
    }
  }

  return results
}

// ============================================
// Search Query Embedding Management
// ============================================

/**
 * Store search query embedding in search_query_embeddings table
 */
export async function storeSearchQueryEmbedding(
  queryText: string,
  embedding: number[],
  options?: {
    normalizedText?: string
    mappedPattern?: string
    mappingId?: number
  }
): Promise<number> {
  const result = await db.execute({
    sql: `
      INSERT INTO search_query_embeddings (
        query_text,
        normalized_text,
        embedding,
        embedding_model,
        mapped_pattern,
        mapping_id,
        search_count
      ) VALUES (?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(query_text) DO UPDATE SET
        search_count = search_count + 1,
        last_searched_at = datetime('now')
      RETURNING id
    `,
    args: [
      queryText,
      options?.normalizedText || null,
      vectorToBlob(embedding),
      EMBEDDING_MODEL,
      options?.mappedPattern || null,
      options?.mappingId || null,
    ],
  })

  return result.rows[0].id as number
}

/**
 * Get search query embedding by query text
 */
export async function getSearchQueryEmbedding(
  queryText: string
): Promise<{ id: number; embedding: number[] } | null> {
  const result = await db.execute({
    sql: `
      SELECT id, embedding
      FROM search_query_embeddings
      WHERE query_text = ?
    `,
    args: [queryText],
  })

  if (result.rows.length === 0) return null

  const row = result.rows[0]
  return {
    id: row.id as number,
    embedding: blobToVector(row.embedding as Buffer),
  }
}

// ============================================
// Law Article Embedding Management
// ============================================

/**
 * Store law article embedding in law_article_embeddings table
 */
export async function storeLawArticleEmbedding(
  lawId: string,
  lawName: string,
  articleJo: string,
  articleContent: string,
  contentEmbedding: number[],
  options?: {
    articleDisplay?: string
    articleTitle?: string
    articleSummary?: string
    titleEmbedding?: number[]
    keywords?: string
    effectiveDate?: string
  }
): Promise<number> {
  const result = await db.execute({
    sql: `
      INSERT INTO law_article_embeddings (
        law_id,
        law_name,
        article_jo,
        article_display,
        article_title,
        article_content,
        article_summary,
        content_embedding,
        title_embedding,
        embedding_model,
        keywords,
        effective_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(law_id, article_jo) DO UPDATE SET
        article_content = excluded.article_content,
        content_embedding = excluded.content_embedding,
        title_embedding = excluded.title_embedding,
        updated_at = datetime('now')
      RETURNING id
    `,
    args: [
      lawId,
      lawName,
      articleJo,
      options?.articleDisplay || null,
      options?.articleTitle || null,
      articleContent,
      options?.articleSummary || null,
      vectorToBlob(contentEmbedding),
      options?.titleEmbedding ? vectorToBlob(options.titleEmbedding) : null,
      EMBEDDING_MODEL,
      options?.keywords || null,
      options?.effectiveDate || null,
    ],
  })

  return result.rows[0].id as number
}
