/**
 * Auto-migration system
 * Runs migrations automatically on app startup
 */

import { db } from './db'

let migrationRun = false

export async function runMigrationsIfNeeded() {
  // Only run once per app instance
  if (migrationRun) {
    console.log('⏭️  Migrations already checked in this session')
    return
  }
  migrationRun = true

  console.log('🔍 Checking database migrations...')

  try {
    // Check if vector tables exist
    const result = await db.execute(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='search_query_embeddings'
    `)

    if (result.rows.length === 0) {
      console.log('🚀 Running Phase 6 vector schema migration...')

      // Run 003_vector_schema.sql
      await runVectorSchemaMigration()

      console.log('✅ Phase 6 migration completed successfully')
    } else {
      console.log('✅ Vector search tables already exist (skip migration)')
    }
  } catch (error) {
    console.error('❌ Migration check failed (non-critical):', error)
    // Don't throw - allow app to continue
  }
}

async function runVectorSchemaMigration() {
  // 1. search_query_embeddings
  await db.execute(`
    CREATE TABLE IF NOT EXISTS search_query_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_text TEXT NOT NULL UNIQUE,
      normalized_text TEXT,
      embedding F32_BLOB(512) NOT NULL,
      embedding_model TEXT DEFAULT 'voyage-3-lite',
      mapped_pattern TEXT,
      mapping_id INTEGER REFERENCES api_parameter_mappings(id),
      search_count INTEGER DEFAULT 0,
      last_searched_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_query_text
    ON search_query_embeddings(query_text)
  `)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_search_embedding_vector
    ON search_query_embeddings(libsql_vector_idx(embedding))
  `)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_search_mapping_id
    ON search_query_embeddings(mapping_id)
  `)

  // 2. law_article_embeddings
  await db.execute(`
    CREATE TABLE IF NOT EXISTS law_article_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      law_id TEXT NOT NULL,
      law_name TEXT NOT NULL,
      article_jo TEXT NOT NULL,
      article_display TEXT,
      article_title TEXT,
      article_content TEXT NOT NULL,
      article_summary TEXT,
      content_embedding F32_BLOB(512) NOT NULL,
      title_embedding F32_BLOB(512),
      embedding_model TEXT DEFAULT 'voyage-3-lite',
      keywords TEXT,
      effective_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(law_id, article_jo)
    )
  `)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_article_law_id
    ON law_article_embeddings(law_id)
  `)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_article_content_vector
    ON law_article_embeddings(libsql_vector_idx(content_embedding))
  `)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_article_title_vector
    ON law_article_embeddings(libsql_vector_idx(title_embedding))
  `)

  // 3. embedding_cache
  await db.execute(`
    CREATE TABLE IF NOT EXISTS embedding_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text_hash TEXT NOT NULL UNIQUE,
      original_text TEXT NOT NULL,
      embedding F32_BLOB(512) NOT NULL,
      embedding_model TEXT DEFAULT 'voyage-3-lite',
      hit_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      last_accessed_at TEXT DEFAULT (datetime('now'))
    )
  `)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_embedding_text_hash
    ON embedding_cache(text_hash)
  `)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_embedding_cache_vector
    ON embedding_cache(libsql_vector_idx(embedding))
  `)

  // 4. rag_context_logs
  await db.execute(`
    CREATE TABLE IF NOT EXISTS rag_context_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_query TEXT NOT NULL,
      normalized_query TEXT,
      query_embedding F32_BLOB(512),
      retrieved_articles TEXT,
      llm_response TEXT,
      llm_model TEXT,
      llm_tokens_used INTEGER,
      response_time_ms INTEGER,
      helpful INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_rag_created_at
    ON rag_context_logs(created_at)
  `)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_rag_query_vector
    ON rag_context_logs(libsql_vector_idx(query_embedding))
  `)

  // 5. natural_language_patterns
  await db.execute(`
    CREATE TABLE IF NOT EXISTS natural_language_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern_text TEXT NOT NULL UNIQUE,
      normalized_pattern TEXT,
      pattern_embedding F32_BLOB(512),
      group_id INTEGER REFERENCES similar_query_groups(id),
      example_queries TEXT,
      success_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      last_used_at TEXT
    )
  `)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_nl_pattern_vector
    ON natural_language_patterns(libsql_vector_idx(pattern_embedding))
  `)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_nl_group_id
    ON natural_language_patterns(group_id)
  `)

  console.log('✓ Created 5 vector search tables')
}
