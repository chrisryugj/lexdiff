-- 004_add_search_result_id.sql
-- api_parameter_mappings 테이블에 search_result_id 추가 (L3 캐시용)

ALTER TABLE api_parameter_mappings ADD COLUMN search_result_id INTEGER REFERENCES search_results(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_api_param_result ON api_parameter_mappings(search_result_id);
