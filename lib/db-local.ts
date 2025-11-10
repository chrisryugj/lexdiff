import { createClient } from '@libsql/client'

// Turso가 설정될 때까지 로컬 SQLite 사용
const useLocal = !process.env.TURSO_DATABASE_URL

export const db = createClient(
  useLocal
    ? {
        // 로컬 SQLite 파일 사용
        url: 'file:./lexdiff-local.db'
      }
    : {
        // Turso 원격 DB 사용
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN!,
      }
)

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

// 로컬 DB 초기화 함수
export async function initializeLocalDB() {
  if (!useLocal) return

  console.log('🔧 Initializing local SQLite database...')

  // 001_basic_schema.sql 내용 실행
  const basicSchema = `
    -- 1. search_queries
    CREATE TABLE IF NOT EXISTS search_queries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raw_query TEXT NOT NULL,
      normalized_query TEXT,
      parsed_law_name TEXT,
      parsed_article TEXT,
      parsed_jo TEXT,
      search_type TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      user_session_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_search_queries_normalized ON search_queries(normalized_query);
    CREATE INDEX IF NOT EXISTS idx_search_queries_law_article ON search_queries(parsed_law_name, parsed_article);
    CREATE INDEX IF NOT EXISTS idx_search_queries_created ON search_queries(created_at);

    -- 2. search_results
    CREATE TABLE IF NOT EXISTS search_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_id INTEGER REFERENCES search_queries(id) ON DELETE CASCADE,
      law_id TEXT,
      law_title TEXT NOT NULL,
      law_mst TEXT,
      ordin_seq TEXT,
      result_type TEXT NOT NULL,
      article_jo TEXT,
      article_content TEXT,
      effective_date TEXT,
      api_source TEXT,
      rank_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_search_results_query ON search_results(query_id);
    CREATE INDEX IF NOT EXISTS idx_search_results_law ON search_results(law_id, article_jo);

    -- 3. delegation_connections
    CREATE TABLE IF NOT EXISTS delegation_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      search_result_id INTEGER REFERENCES search_results(id) ON DELETE CASCADE,
      article_jo TEXT NOT NULL,
      delegation_type TEXT NOT NULL,
      delegation_title TEXT,
      delegation_jo TEXT,
      delegation_content TEXT,
      admin_rule_id TEXT,
      admin_rule_serial_number TEXT,
      admin_rule_match_type TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_delegation_search_result ON delegation_connections(search_result_id);
    CREATE INDEX IF NOT EXISTS idx_delegation_article ON delegation_connections(article_jo, delegation_type);

    -- 4. user_feedback
    CREATE TABLE IF NOT EXISTS user_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      search_result_id INTEGER REFERENCES search_results(id) ON DELETE CASCADE,
      feedback_type TEXT NOT NULL,
      feedback_detail TEXT,
      user_session_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_feedback_search_result ON user_feedback(search_result_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_type ON user_feedback(feedback_type);
    CREATE INDEX IF NOT EXISTS idx_feedback_created ON user_feedback(created_at);

    -- 5. search_quality_scores
    CREATE TABLE IF NOT EXISTS search_quality_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      search_result_id INTEGER UNIQUE REFERENCES search_results(id) ON DELETE CASCADE,
      positive_count INTEGER DEFAULT 0,
      negative_count INTEGER DEFAULT 0,
      total_views INTEGER DEFAULT 0,
      quality_score REAL DEFAULT 0,
      avg_load_time_ms INTEGER,
      cache_hit_count INTEGER DEFAULT 0,
      last_updated TEXT DEFAULT (datetime('now')),
      last_viewed TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_quality_score ON search_quality_scores(quality_score DESC);
    CREATE INDEX IF NOT EXISTS idx_quality_search_result ON search_quality_scores(search_result_id);
  `

  const mappingSchema = `
    -- 6. api_parameter_mappings
    CREATE TABLE IF NOT EXISTS api_parameter_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      normalized_pattern TEXT NOT NULL UNIQUE,
      law_name TEXT NOT NULL,
      article_display TEXT,
      article_jo TEXT,
      api_params TEXT NOT NULL,
      api_endpoint TEXT NOT NULL,
      success_count INTEGER DEFAULT 0,
      last_success_at TEXT,
      avg_response_time_ms INTEGER,
      quality_score REAL DEFAULT 0,
      is_verified INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_api_param_pattern ON api_parameter_mappings(normalized_pattern);
    CREATE INDEX IF NOT EXISTS idx_api_param_quality ON api_parameter_mappings(quality_score DESC);
    CREATE INDEX IF NOT EXISTS idx_api_param_verified ON api_parameter_mappings(is_verified, quality_score DESC);

    -- 7. similar_query_groups
    CREATE TABLE IF NOT EXISTS similar_query_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_query TEXT NOT NULL UNIQUE,
      canonical_pattern TEXT NOT NULL UNIQUE,
      mapping_id INTEGER REFERENCES api_parameter_mappings(id) ON DELETE CASCADE,
      variant_count INTEGER DEFAULT 0,
      total_searches INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_similar_canonical ON similar_query_groups(canonical_pattern);
    CREATE INDEX IF NOT EXISTS idx_similar_mapping ON similar_query_groups(mapping_id);

    -- 8. query_variants
    CREATE TABLE IF NOT EXISTS query_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER REFERENCES similar_query_groups(id) ON DELETE CASCADE,
      variant_query TEXT NOT NULL UNIQUE,
      normalized_variant TEXT NOT NULL,
      variant_type TEXT NOT NULL,
      confidence_score REAL DEFAULT 1.0,
      search_count INTEGER DEFAULT 0,
      last_searched_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_variant_query ON query_variants(variant_query);
    CREATE INDEX IF NOT EXISTS idx_variant_normalized ON query_variants(normalized_variant);
    CREATE INDEX IF NOT EXISTS idx_variant_group ON query_variants(group_id);

    -- 9. search_strategy_logs
    CREATE TABLE IF NOT EXISTS search_strategy_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_id INTEGER REFERENCES search_queries(id) ON DELETE CASCADE,
      strategy_used TEXT NOT NULL,
      total_time_ms INTEGER NOT NULL,
      cache_layer TEXT,
      was_successful INTEGER DEFAULT 1,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_strategy_query ON search_strategy_logs(query_id);
    CREATE INDEX IF NOT EXISTS idx_strategy_type ON search_strategy_logs(strategy_used);
    CREATE INDEX IF NOT EXISTS idx_strategy_time ON search_strategy_logs(total_time_ms);
  `

  // 스키마 실행
  await db.batch(basicSchema.split(';').filter(s => s.trim()).map(sql => ({ sql, args: [] })))
  await db.batch(mappingSchema.split(';').filter(s => s.trim()).map(sql => ({ sql, args: [] })))

  console.log('✅ Local database initialized')
}