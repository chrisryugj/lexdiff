-- 006_rls_hardening.sql
-- law_node/law_edge: 공개 read 의도를 RLS 정책으로 명시
-- user_quota: service_role 전용 쓰기를 명시적 거부 정책으로 선언

-- ============================================================
-- law_node / law_edge: public read
-- ============================================================
ALTER TABLE law_node ENABLE ROW LEVEL SECURITY;
ALTER TABLE law_edge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "law_node_read_all" ON law_node;
CREATE POLICY "law_node_read_all" ON law_node
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "law_edge_read_all" ON law_edge;
CREATE POLICY "law_edge_read_all" ON law_edge
  FOR SELECT USING (true);

-- ============================================================
-- user_quota: 쓰기 명시적 거부 (service_role은 RLS bypass)
-- ============================================================
DROP POLICY IF EXISTS "user_quota_deny_insert" ON user_quota;
CREATE POLICY "user_quota_deny_insert" ON user_quota
  FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "user_quota_deny_update" ON user_quota;
CREATE POLICY "user_quota_deny_update" ON user_quota
  FOR UPDATE USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "user_quota_deny_delete" ON user_quota;
CREATE POLICY "user_quota_deny_delete" ON user_quota
  FOR DELETE USING (false);
