-- 001_basic_schema.sql
-- 기본 검색/피드백 테이블

-- 1. search_queries (검색 쿼리)
CREATE TABLE search_queries (
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

CREATE INDEX idx_search_queries_normalized ON search_queries(normalized_query);
CREATE INDEX idx_search_queries_law_article ON search_queries(parsed_law_name, parsed_article);
CREATE INDEX idx_search_queries_created ON search_queries(created_at);

-- 2. search_results (검색 결과)
CREATE TABLE search_results (
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

CREATE INDEX idx_search_results_query ON search_results(query_id);
CREATE INDEX idx_search_results_law ON search_results(law_id, article_jo);

-- 3. delegation_connections (위임조문)
CREATE TABLE delegation_connections (
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

CREATE INDEX idx_delegation_search_result ON delegation_connections(search_result_id);
CREATE INDEX idx_delegation_article ON delegation_connections(article_jo, delegation_type);

-- 4. user_feedback (사용자 피드백)
CREATE TABLE user_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  search_result_id INTEGER REFERENCES search_results(id) ON DELETE CASCADE,

  feedback_type TEXT NOT NULL,
  feedback_detail TEXT,

  user_session_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_feedback_search_result ON user_feedback(search_result_id);
CREATE INDEX idx_feedback_type ON user_feedback(feedback_type);
CREATE INDEX idx_feedback_created ON user_feedback(created_at);

-- 5. search_quality_scores (품질 점수)
CREATE TABLE search_quality_scores (
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

CREATE INDEX idx_quality_score ON search_quality_scores(quality_score DESC);
CREATE INDEX idx_quality_search_result ON search_quality_scores(search_result_id);