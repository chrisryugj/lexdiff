-- 002_mapping_schema.sql
-- API 매핑 및 유사 검색어 테이블

-- 6. api_parameter_mappings (API 파라미터 직접 매핑)
CREATE TABLE api_parameter_mappings (
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

CREATE INDEX idx_api_param_pattern ON api_parameter_mappings(normalized_pattern);
CREATE INDEX idx_api_param_quality ON api_parameter_mappings(quality_score DESC);
CREATE INDEX idx_api_param_verified ON api_parameter_mappings(is_verified, quality_score DESC);

-- 7. similar_query_groups (유사 검색어 그룹)
CREATE TABLE similar_query_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  canonical_query TEXT NOT NULL UNIQUE,
  canonical_pattern TEXT NOT NULL UNIQUE,

  mapping_id INTEGER REFERENCES api_parameter_mappings(id) ON DELETE CASCADE,

  variant_count INTEGER DEFAULT 0,
  total_searches INTEGER DEFAULT 0,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_similar_canonical ON similar_query_groups(canonical_pattern);
CREATE INDEX idx_similar_mapping ON similar_query_groups(mapping_id);

-- 8. query_variants (검색어 변형)
CREATE TABLE query_variants (
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

CREATE INDEX idx_variant_query ON query_variants(variant_query);
CREATE INDEX idx_variant_normalized ON query_variants(normalized_variant);
CREATE INDEX idx_variant_group ON query_variants(group_id);

-- 9. search_strategy_logs (전략 로그)
CREATE TABLE search_strategy_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  query_id INTEGER REFERENCES search_queries(id) ON DELETE CASCADE,

  strategy_used TEXT NOT NULL,

  total_time_ms INTEGER NOT NULL,
  cache_layer TEXT,

  was_successful INTEGER DEFAULT 1,
  error_message TEXT,

  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_strategy_query ON search_strategy_logs(query_id);
CREATE INDEX idx_strategy_type ON search_strategy_logs(strategy_used);
CREATE INDEX idx_strategy_time ON search_strategy_logs(total_time_ms);