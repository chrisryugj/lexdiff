#!/usr/bin/env node
/**
 * Simple Embedding Builder - No lib dependencies
 * Directly uses @libsql/client and fetch
 */

import { createClient } from '@libsql/client'
import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=')
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim()
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
    }
  })
}

// Check environment variables
const REQUIRED_VARS = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'VOYAGE_API_KEY', 'LAW_OC']
const missing = REQUIRED_VARS.filter(v => !process.env[v])
if (missing.length > 0) {
  console.error('❌ Missing environment variables:', missing.join(', '))
  process.exit(1)
}

// Create Turso client
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

console.log('✅ Database connected')

// Voyage AI config
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY
const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings'
const EMBEDDING_MODEL = 'voyage-3-lite'

// Statistics
const stats = {
  totalLaws: 0,
  totalArticles: 0,
  totalEmbeddings: 0,
  totalTokens: 0,
  totalCost: 0,
  cachedEmbeddings: 0,
  errors: 0,
  startTime: Date.now(),
}

// Priority laws (first 5 for testing)
const TEST_LAWS = [
  '관세법',
  '소득세법',
]

// Helper: Generate SHA-256 hash
function hashText(text) {
  return createHash('sha256').update(text).digest('hex')
}

// Helper: Convert vector to Buffer
function vectorToBlob(vector) {
  const float32Array = new Float32Array(vector)
  return Buffer.from(float32Array.buffer)
}

// Helper: Generate embedding with Voyage AI
async function generateEmbedding(text) {
  const textHash = hashText(text)

  // Check cache first
  try {
    const cached = await db.execute({
      sql: `SELECT embedding, embedding_model FROM embedding_cache WHERE text_hash = ?`,
      args: [textHash],
    })

    if (cached.rows.length > 0) {
      const row = cached.rows[0]
      const embeddingBlob = row.embedding
      const float32Array = new Float32Array(
        embeddingBlob.buffer,
        embeddingBlob.byteOffset,
        embeddingBlob.byteLength / 4
      )
      const embedding = Array.from(float32Array)

      // Update hit count
      await db.execute({
        sql: `UPDATE embedding_cache SET hit_count = hit_count + 1, last_accessed_at = datetime('now') WHERE text_hash = ?`,
        args: [textHash],
      })

      return { embedding, model: row.embedding_model, tokens: 0, cached: true }
    }
  } catch (error) {
    console.warn('  Cache lookup error:', error.message)
  }

  // Call Voyage AI API
  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: [text],
      model: EMBEDDING_MODEL,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Voyage AI error (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  const embedding = data.data[0].embedding

  // Store in cache
  try {
    await db.execute({
      sql: `
        INSERT INTO embedding_cache (text_hash, original_text, embedding, embedding_model, hit_count)
        VALUES (?, ?, ?, ?, 0)
        ON CONFLICT(text_hash) DO NOTHING
      `,
      args: [textHash, text, vectorToBlob(embedding), EMBEDDING_MODEL],
    })
  } catch (error) {
    console.warn('  Cache storage error:', error.message)
  }

  return {
    embedding,
    model: data.model,
    tokens: data.usage.total_tokens,
    cached: false,
  }
}

// Helper: Store law article embedding
async function storeLawArticleEmbedding(lawId, lawName, articleJo, articleContent, contentEmbedding, options = {}) {
  await db.execute({
    sql: `
      INSERT INTO law_article_embeddings (
        law_id, law_name, article_jo, article_display, article_title,
        article_content, content_embedding, embedding_model, keywords
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(law_id, article_jo) DO UPDATE SET
        article_content = excluded.article_content,
        content_embedding = excluded.content_embedding,
        updated_at = datetime('now')
      RETURNING id
    `,
    args: [
      lawId,
      lawName,
      articleJo,
      options.articleDisplay || null,
      options.articleTitle || null,
      articleContent,
      vectorToBlob(contentEmbedding),
      EMBEDDING_MODEL,
      options.keywords || null,
    ],
  })
}

// Helper: Fetch law content
async function fetchLawContent(lawName) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  const searchUrl = `${baseUrl}/api/law-search?query=${encodeURIComponent(lawName)}`

  console.log(`🔍 Searching: ${lawName}`)

  const searchRes = await fetch(searchUrl)
  if (!searchRes.ok) {
    throw new Error(`Search failed: ${searchRes.status}`)
  }

  const searchData = await searchRes.json()
  if (!searchData.laws || searchData.laws.length === 0) {
    throw new Error(`No results found`)
  }

  const law = searchData.laws[0]
  const lawId = law.lawId || law.mst

  console.log(`  ✓ Found: ${law.lawTitle} (${lawId})`)

  // Fetch content
  const contentUrl = `${baseUrl}/api/eflaw?lawId=${lawId}`
  const contentRes = await fetch(contentUrl)

  if (!contentRes.ok) {
    throw new Error(`Content fetch failed: ${contentRes.status}`)
  }

  const contentData = await contentRes.json()

  return {
    lawId,
    lawName: law.lawTitle,
    content: contentData,
  }
}

// Main: Process law
async function processLaw(lawName) {
  try {
    stats.totalLaws++

    const lawData = await fetchLawContent(lawName)

    if (!lawData.content || !lawData.content.articles) {
      console.warn(`  ⚠️  No articles found`)
      return
    }

    const articles = lawData.content.articles
    console.log(`  📄 Processing ${articles.length} articles...`)

    let processed = 0

    for (const article of articles) {
      try {
        if (!article.content || article.content.trim().length === 0) {
          continue
        }

        stats.totalArticles++

        const embeddingResult = await generateEmbedding(article.content)
        stats.totalEmbeddings++
        stats.totalTokens += embeddingResult.tokens

        if (embeddingResult.cached) {
          stats.cachedEmbeddings++
        }

        // Calculate cost (Voyage 3 Lite: $0.05 per 1M tokens)
        stats.totalCost += (embeddingResult.tokens * 0.05) / 1_000_000

        // Store in DB
        await storeLawArticleEmbedding(
          lawData.lawId,
          lawData.lawName,
          article.jo,
          article.content,
          embeddingResult.embedding,
          {
            articleDisplay: article.joNum || article.display,
            articleTitle: article.title,
            keywords: article.content.substring(0, 100),
          }
        )

        processed++

        if (processed % 10 === 0) {
          console.log(`    ⏳ ${processed}/${articles.length} articles`)
        }

      } catch (articleError) {
        console.error(`    ❌ Article ${article.jo} failed:`, articleError.message)
        stats.errors++
      }
    }

    console.log(`  ✅ Completed: ${processed} articles`)
    console.log(`     Tokens: ${stats.totalTokens.toLocaleString()}, Cost: $${stats.totalCost.toFixed(4)}\n`)

  } catch (error) {
    console.error(`❌ Law failed:`, error.message)
    stats.errors++
  }
}

// Main execution
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗')
  console.log('║             RAG Vector Search - Embedding Builder              ║')
  console.log('╚════════════════════════════════════════════════════════════════╝\n')

  console.log(`📊 Testing with ${TEST_LAWS.length} laws\n`)

  for (const lawName of TEST_LAWS) {
    await processLaw(lawName)
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  const elapsed = (Date.now() - stats.startTime) / 1000
  console.log('\n' + '═'.repeat(64))
  console.log('📊 STATISTICS')
  console.log('═'.repeat(64))
  console.log(`Laws:              ${stats.totalLaws}`)
  console.log(`Articles:          ${stats.totalArticles}`)
  console.log(`Embeddings:        ${stats.totalEmbeddings}`)
  console.log(`Cached:            ${stats.cachedEmbeddings}`)
  console.log(`Tokens:            ${stats.totalTokens.toLocaleString()}`)
  console.log(`Cost:              $${stats.totalCost.toFixed(4)}`)
  console.log(`Errors:            ${stats.errors}`)
  console.log(`Time:              ${elapsed.toFixed(1)}s`)
  console.log('═'.repeat(64) + '\n')

  console.log('✅ Completed!\n')
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error)
  process.exit(1)
})
