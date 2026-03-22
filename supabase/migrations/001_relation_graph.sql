-- 법령 관계 그래프 테이블
-- Supabase Dashboard > SQL Editor에서 실행

-- law_node: 법령/판례 노드
CREATE TABLE IF NOT EXISTS law_node (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('law', 'decree', 'rule', 'ordinance', 'admin_rule', 'precedent')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'repealed', 'pending')),
  effective_date TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- law_edge: 법령 간 관계 엣지
CREATE TABLE IF NOT EXISTS law_edge (
  id BIGSERIAL PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES law_node(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES law_node(id) ON DELETE CASCADE,
  relation TEXT NOT NULL CHECK (relation IN ('delegates', 'implements', 'cites', 'interprets', 'basis', 'amends')),
  from_article TEXT,
  to_article TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(from_id, to_id, relation, from_article, to_article)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_edge_from ON law_edge(from_id, from_article);
CREATE INDEX IF NOT EXISTS idx_edge_to ON law_edge(to_id, to_article);
CREATE INDEX IF NOT EXISTS idx_edge_relation ON law_edge(relation);
CREATE INDEX IF NOT EXISTS idx_node_type ON law_node(type);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER law_node_updated_at
  BEFORE UPDATE ON law_node
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER law_edge_updated_at
  BEFORE UPDATE ON law_edge
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
