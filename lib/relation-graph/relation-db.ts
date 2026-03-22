/**
 * 법령 관계 그래프 CRUD 모듈
 *
 * Supabase PostgreSQL 기반. 환경변수 없으면 모든 함수가 graceful하게 no-op.
 */

import { getSupabase } from '../supabase'
import type {
  LawNode, LawNodeInsert, LawEdge, LawEdgeInsert,
  RelationType,
} from './relation-types'

// ─── 내부 헬퍼 ────────────────────────────────────────

function db() {
  return getSupabase()
}

// ─── Node CRUD ────────────────────────────────────────

/** 노드 upsert (id 기준 INSERT ON CONFLICT UPDATE) */
export async function upsertNode(node: LawNodeInsert): Promise<LawNode | null> {
  const client = db()
  if (!client) return null

  const { data, error } = await client
    .from('law_node')
    .upsert({
      ...node,
      status: node.status ?? 'active',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    .select()
    .single()

  if (error) {
    console.warn('[relation-db] upsertNode error:', error.message)
    return null
  }
  return data as LawNode
}

/** 여러 노드 벌크 upsert */
export async function bulkUpsertNodes(nodes: LawNodeInsert[]): Promise<number> {
  const client = db()
  if (!client || nodes.length === 0) return 0

  const rows = nodes.map(n => ({
    ...n,
    status: n.status ?? 'active',
    updated_at: new Date().toISOString(),
  }))

  const { error, count } = await client
    .from('law_node')
    .upsert(rows, { onConflict: 'id', count: 'exact' })

  if (error) {
    console.warn('[relation-db] bulkUpsertNodes error:', error.message)
    return 0
  }
  return count ?? nodes.length
}

/** ID로 노드 조회 */
export async function getNodeById(id: string): Promise<LawNode | null> {
  const client = db()
  if (!client) return null

  const { data, error } = await client
    .from('law_node')
    .select()
    .eq('id', id)
    .single()

  if (error) return null
  return data as LawNode
}

/** 노드 삭제 */
export async function deleteNode(id: string): Promise<boolean> {
  const client = db()
  if (!client) return false

  // 연관 엣지 먼저 삭제
  await client.from('law_edge').delete().or(`from_id.eq.${id},to_id.eq.${id}`)

  const { error } = await client.from('law_node').delete().eq('id', id)
  return !error
}

// ─── Edge CRUD ────────────────────────────────────────

/** 엣지 upsert (UNIQUE 제약: from_id, to_id, relation, from_article, to_article) */
export async function upsertEdge(edge: LawEdgeInsert): Promise<LawEdge | null> {
  const client = db()
  if (!client) return null

  const { data, error } = await client
    .from('law_edge')
    .upsert({
      ...edge,
      from_article: edge.from_article ?? null,
      to_article: edge.to_article ?? null,
      metadata: edge.metadata ?? {},
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'from_id,to_id,relation,from_article,to_article',
    })
    .select()
    .single()

  if (error) {
    console.warn('[relation-db] upsertEdge error:', error.message)
    return null
  }
  return data as LawEdge
}

/** 여러 엣지 벌크 upsert */
export async function bulkUpsertEdges(edges: LawEdgeInsert[]): Promise<number> {
  const client = db()
  if (!client || edges.length === 0) return 0

  const rows = edges.map(e => ({
    ...e,
    from_article: e.from_article ?? null,
    to_article: e.to_article ?? null,
    metadata: e.metadata ?? {},
    updated_at: new Date().toISOString(),
  }))

  const { error, count } = await client
    .from('law_edge')
    .upsert(rows, {
      onConflict: 'from_id,to_id,relation,from_article,to_article',
      count: 'exact',
    })

  if (error) {
    console.warn('[relation-db] bulkUpsertEdges error:', error.message)
    return 0
  }
  return count ?? edges.length
}

/** 특정 노드에서 나가는 엣지 조회 */
export async function getEdgesFrom(
  nodeId: string,
  article?: string,
  relation?: RelationType,
): Promise<LawEdge[]> {
  const client = db()
  if (!client) return []

  let query = client
    .from('law_edge')
    .select()
    .eq('from_id', nodeId)

  if (article) query = query.eq('from_article', article)
  if (relation) query = query.eq('relation', relation)

  const { data, error } = await query
  if (error) return []
  return (data ?? []) as LawEdge[]
}

/** 특정 노드로 들어오는 엣지 조회 */
export async function getEdgesTo(
  nodeId: string,
  article?: string,
  relation?: RelationType,
): Promise<LawEdge[]> {
  const client = db()
  if (!client) return []

  let query = client
    .from('law_edge')
    .select()
    .eq('to_id', nodeId)

  if (article) query = query.eq('to_article', article)
  if (relation) query = query.eq('relation', relation)

  const { data, error } = await query
  if (error) return []
  return (data ?? []) as LawEdge[]
}

/** 엣지 삭제 */
export async function deleteEdge(id: number): Promise<boolean> {
  const client = db()
  if (!client) return false

  const { error } = await client.from('law_edge').delete().eq('id', id)
  return !error
}

// ─── 복합 저장 (추출기 결과 한번에 저장) ──────────────

/** ExtractionResult를 한번에 저장 (nodes 먼저 → edges) */
export async function storeExtractionResult(
  result: { nodes: LawNodeInsert[], edges: LawEdgeInsert[] },
): Promise<{ nodeCount: number, edgeCount: number }> {
  const nodeCount = await bulkUpsertNodes(result.nodes)
  const edgeCount = await bulkUpsertEdges(result.edges)
  return { nodeCount, edgeCount }
}

/** fire-and-forget 비동기 저장 (API 라우트에서 사용) */
export function storeRelationsAsync(
  result: { nodes: LawNodeInsert[], edges: LawEdgeInsert[] },
): void {
  storeExtractionResult(result).catch(e =>
    console.warn('[relation-db] async store failed:', e)
  )
}
