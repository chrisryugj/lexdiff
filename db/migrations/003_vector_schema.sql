-- 003_vector_schema.sql
-- 벡터 임베딩 및 RAG 관련 테이블

-- 10. search_query_embeddings (검색어 임베딩)
CREATE TABLE IF NOT EXISTS search_query_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  query_text TEXT NOT NULL UNIQUE,
  normalized_text TEXT,

  embedding F32_BLOB(512) NOT NULL,

  embedding_model TEXT DEFAULT 'voyage-3-lite',
  embedding_version TEXT,

  mapped_pattern TEXT,
  mapping_id INTEGER REFERENCES api_parameter_mappings(id),

  search_count INTEGER DEFAULT 0,
  last_searched_at TEXT,

  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_search_embedding_vector
  ON search_query_embeddings(libsql_vector_idx(embedding));

CREATE INDEX IF NOT EXISTS idx_search_embedding_text ON search_query_embeddings(query_text);
CREATE INDEX IF NOT EXISTS idx_search_embedding_pattern ON search_query_embeddings(mapped_pattern);

-- 11. law_article_embeddings (법령 조문 임베딩)
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

  delegation_info TEXT,

  keywords TEXT,

  effective_date TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_law_content_vector
  ON law_article_embeddings(libsql_vector_idx(content_embedding));

CREATE UNIQUE INDEX IF NOT EXISTS idx_law_article_unique
  ON law_article_embeddings(law_id, article_jo);

CREATE INDEX IF NOT EXISTS idx_law_name_article
  ON law_article_embeddings(law_name, article_jo);

-- 12. embedding_cache (임베딩 캐시)
CREATE TABLE IF NOT EXISTS embedding_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  text_hash TEXT NOT NULL UNIQUE,
  original_text TEXT NOT NULL,

  embedding F32_BLOB(512) NOT NULL,
  embedding_model TEXT NOT NULL,

  hit_count INTEGER DEFAULT 0,

  created_at TEXT DEFAULT (datetime('now')),
  last_accessed_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_embedding_cache_hash ON embedding_cache(text_hash);

-- 13. rag_context_logs (RAG 로그)
CREATE TABLE IF NOT EXISTS rag_context_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  query_id INTEGER REFERENCES search_queries(id),
  user_query TEXT NOT NULL,

  retrieved_articles TEXT NOT NULL,
  context_article_ids TEXT,

  vector_search_type TEXT,
  top_k_results INTEGER DEFAULT 5,
  avg_similarity_score REAL,

  llm_model TEXT,
  llm_prompt TEXT,
  llm_response TEXT,
  llm_tokens_used INTEGER,

  was_helpful INTEGER,

  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rag_query ON rag_context_logs(query_id);
CREATE INDEX IF NOT EXISTS idx_rag_created ON rag_context_logs(created_at);

-- 14. natural_language_patterns (자연어 패턴)
CREATE TABLE IF NOT EXISTS natural_language_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  natural_query TEXT NOT NULL,
  natural_query_embedding TEXT,

  intent_type TEXT,
  extracted_law_name TEXT,
  extracted_keywords TEXT,

  mapped_group_id INTEGER REFERENCES similar_query_groups(id) ON DELETE SET NULL,

  is_confirmed INTEGER DEFAULT 0,
  confidence_score REAL DEFAULT 0,

  search_count INTEGER DEFAULT 0,
  positive_feedback INTEGER DEFAULT 0,
  negative_feedback INTEGER DEFAULT 0,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_natural_query ON natural_language_patterns(natural_query);
CREATE INDEX IF NOT EXISTS idx_natural_intent ON natural_language_patterns(intent_type);
CREATE INDEX IF NOT EXISTS idx_natural_confidence ON natural_language_patterns(confidence_score DESC);
