# LexDiff 검색 피드백 데이터베이스 스키마

> **작성일**: 2025-11-05
> **데이터베이스**: Turso (LibSQL/SQLite)
> **총 테이블**: 14개

---

## 마이그레이션 파일 구조

```
db/
├── migrations/
│   ├── 001_basic_schema.sql          # 기본 검색/피드백 테이블
│   ├── 002_mapping_schema.sql        # API 매핑 및 유사 검색어
│   └── 003_vector_schema.sql         # 벡터 임베딩 및 RAG
└── seed.ts                            # 테스트 데이터 (선택)
```

---

## 001_basic_schema.sql

### 1. search_queries (검색 쿼리)

```sql
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
```

### 2. search_results (검색 결과)

```sql
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
```

### 3. delegation_connections (위임조문)

```sql
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
```

### 4. user_feedback (사용자 피드백)

```sql
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
```

### 5. search_quality_scores (품질 점수)

```sql
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
```

---

## 002_mapping_schema.sql

### 6. api_parameter_mappings (API 파라미터 직접 매핑)

```sql
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
```

### 7. similar_query_groups (유사 검색어 그룹)

```sql
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
```

### 8. query_variants (검색어 변형)

```sql
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
```

### 9. search_strategy_logs (전략 로그)

```sql
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
```

---

## 003_vector_schema.sql

### 10. search_query_embeddings (검색어 임베딩)

```sql
CREATE TABLE search_query_embeddings (
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

CREATE INDEX idx_search_embedding_vector
  ON search_query_embeddings(libsql_vector_idx(embedding));

CREATE INDEX idx_search_embedding_text ON search_query_embeddings(query_text);
CREATE INDEX idx_search_embedding_pattern ON search_query_embeddings(mapped_pattern);
```

### 11. law_article_embeddings (법령 조문 임베딩)

```sql
CREATE TABLE law_article_embeddings (
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

CREATE INDEX idx_law_content_vector
  ON law_article_embeddings(libsql_vector_idx(content_embedding));

CREATE UNIQUE INDEX idx_law_article_unique
  ON law_article_embeddings(law_id, article_jo);

CREATE INDEX idx_law_name_article
  ON law_article_embeddings(law_name, article_jo);
```

### 12. embedding_cache (임베딩 캐시)

```sql
CREATE TABLE embedding_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  text_hash TEXT NOT NULL UNIQUE,
  original_text TEXT NOT NULL,

  embedding F32_BLOB(512) NOT NULL,
  embedding_model TEXT NOT NULL,

  hit_count INTEGER DEFAULT 0,

  created_at TEXT DEFAULT (datetime('now')),
  last_accessed_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_embedding_cache_hash ON embedding_cache(text_hash);
```

### 13. rag_context_logs (RAG 로그)

```sql
CREATE TABLE rag_context_logs (
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

CREATE INDEX idx_rag_query ON rag_context_logs(query_id);
CREATE INDEX idx_rag_created ON rag_context_logs(created_at);
```

### 14. natural_language_patterns (자연어 패턴)

```sql
CREATE TABLE natural_language_patterns (
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

CREATE INDEX idx_natural_query ON natural_language_patterns(natural_query);
CREATE INDEX idx_natural_intent ON natural_language_patterns(intent_type);
CREATE INDEX idx_natural_confidence ON natural_language_patterns(confidence_score DESC);
```

---

## 트리거 (Triggers)

### 피드백 시 품질 점수 자동 업데이트

```sql
CREATE TRIGGER update_quality_score_on_feedback
AFTER INSERT ON user_feedback
BEGIN
  -- search_quality_scores 업데이트
  INSERT INTO search_quality_scores (search_result_id, positive_count, negative_count)
  VALUES (NEW.search_result_id,
          CASE WHEN NEW.feedback_type = 'positive' THEN 1 ELSE 0 END,
          CASE WHEN NEW.feedback_type = 'negative' THEN 1 ELSE 0 END)
  ON CONFLICT(search_result_id) DO UPDATE SET
    positive_count = positive_count + CASE WHEN NEW.feedback_type = 'positive' THEN 1 ELSE 0 END,
    negative_count = negative_count + CASE WHEN NEW.feedback_type = 'negative' THEN 1 ELSE 0 END,
    quality_score = CAST(positive_count + 1 AS REAL) / (positive_count + negative_count + 2),
    last_updated = datetime('now');
END;
```

### 피드백 시 매핑 품질 업데이트

```sql
CREATE TRIGGER update_mapping_quality_on_feedback
AFTER INSERT ON user_feedback
BEGIN
  UPDATE api_parameter_mappings
  SET
    quality_score = (
      SELECT CAST(SUM(CASE WHEN uf.feedback_type = 'positive' THEN 1 ELSE 0 END) + 1 AS REAL) /
             (COUNT(*) + 2)
      FROM user_feedback uf
      JOIN search_results sr ON uf.search_result_id = sr.id
      JOIN search_queries sq ON sr.query_id = sq.id
      WHERE sq.normalized_query = api_parameter_mappings.normalized_pattern
    ),
    is_verified = (
      SELECT SUM(CASE WHEN uf.feedback_type = 'positive' THEN 1 ELSE 0 END) >= 3
      FROM user_feedback uf
      JOIN search_results sr ON uf.search_result_id = sr.id
      JOIN search_queries sq ON sr.query_id = sq.id
      WHERE sq.normalized_query = api_parameter_mappings.normalized_pattern
    ),
    updated_at = datetime('now')
  WHERE EXISTS (
    SELECT 1 FROM search_results sr
    JOIN search_queries sq ON sr.query_id = sq.id
    WHERE sr.id = NEW.search_result_id
      AND sq.normalized_query = api_parameter_mappings.normalized_pattern
  );
END;
```

### 검색 시 variant 카운트 증가

```sql
CREATE TRIGGER increment_variant_search_count
AFTER INSERT ON search_queries
BEGIN
  UPDATE query_variants
  SET
    search_count = search_count + 1,
    last_searched_at = datetime('now')
  WHERE variant_query = NEW.raw_query;
END;
```

---

## 초기 데이터 설정

### 세션 ID 생성 (클라이언트)

```typescript
// lib/session.ts
export function getOrCreateSessionId(): string {
  const key = 'lexdiff_session_id'
  let sessionId = localStorage.getItem(key)

  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    localStorage.setItem(key, sessionId)
  }

  return sessionId
}
```

---

## 마이그레이션 실행

```bash
# Turso CLI로 실행
turso db shell lexdiff-feedback < db/migrations/001_basic_schema.sql
turso db shell lexdiff-feedback < db/migrations/002_mapping_schema.sql
turso db shell lexdiff-feedback < db/migrations/003_vector_schema.sql
```

또는 Node.js 스크립트:

```typescript
// scripts/migrate.ts
import { db } from '../lib/db'
import fs from 'fs'

async function migrate() {
  const migrations = [
    './db/migrations/001_basic_schema.sql',
    './db/migrations/002_mapping_schema.sql',
    './db/migrations/003_vector_schema.sql',
  ]

  for (const file of migrations) {
    console.log(`Migrating ${file}...`)
    const sql = fs.readFileSync(file, 'utf-8')
    const statements = sql.split(';').filter(s => s.trim())

    for (const statement of statements) {
      await db.execute(statement)
    }

    console.log(`✅ ${file} completed`)
  }
}

migrate()
```

---

## 데이터 검증 쿼리

```sql
-- 모든 테이블 확인
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;

-- 인덱스 확인
SELECT name, tbl_name FROM sqlite_master WHERE type='index';

-- 트리거 확인
SELECT name, tbl_name FROM sqlite_master WHERE type='trigger';

-- 벡터 인덱스 확인
SELECT * FROM sqlite_master WHERE sql LIKE '%libsql_vector_idx%';
```
