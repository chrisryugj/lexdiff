/**
 * 영향 분석 모듈
 *
 * "이 조문이 바뀌면 뭐가 흔들리나?"에 대한 답을 제공한다.
 *
 * 4방향 분석:
 * - downstream (하향): 위임받은 하위법령 (delegates, implements)
 * - upstream (상향): 근거 법률 (delegates, basis 역방향)
 * - lateral (횡단): 같은 법 내 인용 (cites)
 * - precedents (판례): 해석 판례 (interprets)
 *
 * Supabase PostgreSQL의 재귀 CTE(WITH RECURSIVE)로 다단계 탐색.
 */

import { getSupabase } from '../supabase'
import type { RelationType, LawNodeType } from './relation-types'

// ─── 타입 정의 ────────────────────────────────────────

export interface ImpactItem {
  nodeId: string
  title: string
  type: LawNodeType
  article?: string | null
  relation: RelationType
  depth: number
}

export interface ImpactResult {
  downstream: ImpactItem[]
  upstream: ImpactItem[]
  lateral: ImpactItem[]
  precedents: ImpactItem[]
  stats: {
    total: number
    byRelation: Record<string, number>
  }
}

function emptyResult(): ImpactResult {
  return {
    downstream: [],
    upstream: [],
    lateral: [],
    precedents: [],
    stats: { total: 0, byRelation: {} },
  }
}

// ─── 영향 분석 메인 ───────────────────────────────────

/**
 * 법령 조문의 영향 분석을 수행한다.
 *
 * @param lawId - 법령 ID (MST 코드)
 * @param article - 조문번호 (6자리 JO 코드, 선택)
 * @param maxDepth - 최대 탐색 깊이 (기본 3)
 */
export async function analyzeImpact(
  lawId: string,
  article?: string,
  maxDepth: number = 3,
): Promise<ImpactResult> {
  const client = getSupabase()
  if (!client) return emptyResult()

  const [downstream, upstream, lateral, precedents] = await Promise.all([
    queryDownstream(client, lawId, article, maxDepth),
    queryUpstream(client, lawId, article, maxDepth),
    queryLateral(client, lawId, article),
    queryPrecedents(client, lawId, article),
  ])

  const all = [...downstream, ...upstream, ...lateral, ...precedents]
  const byRelation: Record<string, number> = {}
  for (const item of all) {
    byRelation[item.relation] = (byRelation[item.relation] || 0) + 1
  }

  return {
    downstream,
    upstream,
    lateral,
    precedents,
    stats: { total: all.length, byRelation },
  }
}

// ─── 하향 영향 (delegates, implements 순방향) ─────────

async function queryDownstream(
  client: ReturnType<typeof getSupabase> & object,
  lawId: string,
  article: string | undefined,
  maxDepth: number,
): Promise<ImpactItem[]> {
  // 재귀 CTE로 다단계 위임 체인 탐색
  const { data, error } = await client.rpc('impact_downstream', {
    p_law_id: lawId,
    p_article: article || null,
    p_max_depth: maxDepth,
  })

  if (error) {
    // RPC 함수 미설치 시 폴백: 단순 1단계 쿼리
    return queryDownstreamFallback(client, lawId, article)
  }

  return (data || []).map(rowToImpactItem)
}

async function queryDownstreamFallback(
  client: ReturnType<typeof getSupabase> & object,
  lawId: string,
  article: string | undefined,
): Promise<ImpactItem[]> {
  let query = client
    .from('law_edge')
    .select('to_id, to_article, relation, law_node!law_edge_to_id_fkey(title, type)')
    .eq('from_id', lawId)
    .in('relation', ['delegates', 'implements'])

  if (article) {
    query = query.eq('from_article', article)
  }

  const { data, error } = await query
  if (error || !data) return []

  return data.map((row: Record<string, unknown>) => {
    const node = row.law_node as Record<string, string> | null
    return {
      nodeId: row.to_id as string,
      title: node?.title || '(알 수 없음)',
      type: (node?.type || 'law') as LawNodeType,
      article: row.to_article as string | null,
      relation: row.relation as RelationType,
      depth: 1,
    }
  })
}

// ─── 상향 영향 (delegates, basis 역방향) ──────────────

async function queryUpstream(
  client: ReturnType<typeof getSupabase> & object,
  lawId: string,
  article: string | undefined,
  maxDepth: number,
): Promise<ImpactItem[]> {
  const { data, error } = await client.rpc('impact_upstream', {
    p_law_id: lawId,
    p_article: article || null,
    p_max_depth: maxDepth,
  })

  if (error) {
    return queryUpstreamFallback(client, lawId, article)
  }

  return (data || []).map(rowToImpactItem)
}

async function queryUpstreamFallback(
  client: ReturnType<typeof getSupabase> & object,
  lawId: string,
  article: string | undefined,
): Promise<ImpactItem[]> {
  let query = client
    .from('law_edge')
    .select('from_id, from_article, relation, law_node!law_edge_from_id_fkey(title, type)')
    .eq('to_id', lawId)
    .in('relation', ['delegates', 'basis'])

  if (article) {
    query = query.eq('to_article', article)
  }

  const { data, error } = await query
  if (error || !data) return []

  return data.map((row: Record<string, unknown>) => {
    const node = row.law_node as Record<string, string> | null
    return {
      nodeId: row.from_id as string,
      title: node?.title || '(알 수 없음)',
      type: (node?.type || 'law') as LawNodeType,
      article: row.from_article as string | null,
      relation: row.relation as RelationType,
      depth: 1,
    }
  })
}

// ─── 횡단 영향 (같은 법 내 cites) ────────────────────

async function queryLateral(
  client: ReturnType<typeof getSupabase> & object,
  lawId: string,
  article: string | undefined,
): Promise<ImpactItem[]> {
  if (!article) return []

  // 같은 법 내에서 이 조문을 인용하는 다른 조문
  const { data, error } = await client
    .from('law_edge')
    .select('from_id, from_article, relation')
    .eq('to_id', lawId)
    .eq('to_article', article)
    .eq('relation', 'cites')
    .eq('from_id', lawId) // 같은 법

  if (error || !data) return []

  return data.map((row: Record<string, unknown>) => ({
    nodeId: row.from_id as string,
    title: `${row.from_article || ''}`, // 같은 법이므로 조문번호만
    type: 'law' as LawNodeType,
    article: row.from_article as string | null,
    relation: 'cites' as RelationType,
    depth: 1,
  }))
}

// ─── 판례 영향 (interprets) ──────────────────────────

async function queryPrecedents(
  client: ReturnType<typeof getSupabase> & object,
  lawId: string,
  article: string | undefined,
): Promise<ImpactItem[]> {
  let query = client
    .from('law_edge')
    .select('from_id, relation, metadata, law_node!law_edge_from_id_fkey(title, type)')
    .eq('to_id', lawId)
    .eq('relation', 'interprets')

  if (article) {
    query = query.eq('to_article', article)
  }

  const { data, error } = await query
  if (error || !data) return []

  return data.map((row: Record<string, unknown>) => {
    const node = row.law_node as Record<string, string> | null
    return {
      nodeId: row.from_id as string,
      title: node?.title || '(알 수 없음)',
      type: 'precedent' as LawNodeType,
      relation: 'interprets' as RelationType,
      depth: 1,
    }
  })
}

// ─── 유틸 ─────────────────────────────────────────────

function rowToImpactItem(row: Record<string, unknown>): ImpactItem {
  return {
    nodeId: (row.node_id || row.to_id || row.from_id) as string,
    title: (row.title || '(알 수 없음)') as string,
    type: (row.node_type || row.type || 'law') as LawNodeType,
    article: (row.article || row.to_article || row.from_article || null) as string | null,
    relation: (row.relation || 'delegates') as RelationType,
    depth: (row.depth || 1) as number,
  }
}
