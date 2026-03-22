-- 영향 분석 재귀 CTE 함수들
-- Supabase Dashboard > SQL Editor에서 실행

-- 하향 영향 분석 (위임 체인 탐색)
CREATE OR REPLACE FUNCTION impact_downstream(
  p_law_id TEXT,
  p_article TEXT DEFAULT NULL,
  p_max_depth INT DEFAULT 3
)
RETURNS TABLE (
  node_id TEXT,
  title TEXT,
  node_type TEXT,
  article TEXT,
  relation TEXT,
  depth INT
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE downstream AS (
    -- 시작점: 직접 위임
    SELECT
      e.to_id AS node_id,
      n.title,
      n.type AS node_type,
      e.to_article AS article,
      e.relation,
      1 AS depth
    FROM law_edge e
    JOIN law_node n ON e.to_id = n.id
    WHERE e.from_id = p_law_id
      AND (p_article IS NULL OR e.from_article = p_article)
      AND e.relation IN ('delegates', 'implements')

    UNION ALL

    -- 재귀: 하위 위임 체인
    SELECT
      e.to_id,
      n.title,
      n.type,
      e.to_article,
      e.relation,
      d.depth + 1
    FROM law_edge e
    JOIN law_node n ON e.to_id = n.id
    JOIN downstream d ON e.from_id = d.node_id
    WHERE d.depth < p_max_depth
      AND e.relation IN ('delegates', 'implements')
  )
  SELECT DISTINCT ON (downstream.node_id, downstream.article)
    downstream.node_id,
    downstream.title,
    downstream.node_type,
    downstream.article,
    downstream.relation,
    downstream.depth
  FROM downstream
  ORDER BY downstream.node_id, downstream.article, downstream.depth;
END;
$$ LANGUAGE plpgsql;


-- 상향 영향 분석 (근거 법률 역추적)
CREATE OR REPLACE FUNCTION impact_upstream(
  p_law_id TEXT,
  p_article TEXT DEFAULT NULL,
  p_max_depth INT DEFAULT 3
)
RETURNS TABLE (
  node_id TEXT,
  title TEXT,
  node_type TEXT,
  article TEXT,
  relation TEXT,
  depth INT
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE upstream AS (
    -- 시작점: 이 법령을 위임한 상위 법령
    SELECT
      e.from_id AS node_id,
      n.title,
      n.type AS node_type,
      e.from_article AS article,
      e.relation,
      1 AS depth
    FROM law_edge e
    JOIN law_node n ON e.from_id = n.id
    WHERE e.to_id = p_law_id
      AND (p_article IS NULL OR e.to_article = p_article)
      AND e.relation IN ('delegates', 'basis')

    UNION ALL

    -- 재귀: 상위 위임 체인
    SELECT
      e.from_id,
      n.title,
      n.type,
      e.from_article,
      e.relation,
      u.depth + 1
    FROM law_edge e
    JOIN law_node n ON e.from_id = n.id
    JOIN upstream u ON e.to_id = u.node_id
    WHERE u.depth < p_max_depth
      AND e.relation IN ('delegates', 'basis')
  )
  SELECT DISTINCT ON (upstream.node_id, upstream.article)
    upstream.node_id,
    upstream.title,
    upstream.node_type,
    upstream.article,
    upstream.relation,
    upstream.depth
  FROM upstream
  ORDER BY upstream.node_id, upstream.article, upstream.depth;
END;
$$ LANGUAGE plpgsql;
