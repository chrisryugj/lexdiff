/**
 * Three-Tier(3단비교) 응답에서 법령 관계를 추출한다.
 *
 * DelegationItem.type → RelationType 매핑:
 *   "시행령"   → delegates
 *   "시행규칙" → delegates
 *   "행정규칙" → implements
 */

import type { ThreeTierData, ThreeTierMeta } from '@/lib/law-types'
import type {
  ExtractionResult, LawNodeInsert, LawEdgeInsert, LawNodeType,
} from '../relation-types'

/** DelegationItem.type → 관계/노드 타입 매핑 */
const DELEGATION_MAP: Record<string, { relation: 'delegates' | 'implements', nodeType: LawNodeType }> = {
  '시행령': { relation: 'delegates', nodeType: 'decree' },
  '시행규칙': { relation: 'delegates', nodeType: 'rule' },
  '행정규칙': { relation: 'implements', nodeType: 'admin_rule' },
}

/** 법령명으로 간이 노드 ID 생성 (lawId가 없을 때) */
function makeNodeId(lawName: string): string {
  return `name:${lawName}`
}

/** ThreeTierMeta에서 시행령/시행규칙 ID 추출 */
function extractMetaNodes(meta: ThreeTierMeta): LawNodeInsert[] {
  const nodes: LawNodeInsert[] = []

  if (meta.sihyungryungId && meta.sihyungryungName) {
    nodes.push({
      id: meta.sihyungryungId,
      title: meta.sihyungryungName,
      type: 'decree',
    })
  }
  if (meta.sihyungkyuchikId && meta.sihyungkyuchikName) {
    nodes.push({
      id: meta.sihyungkyuchikId,
      title: meta.sihyungkyuchikName,
      type: 'rule',
    })
  }

  return nodes
}

/**
 * ThreeTierData에서 법령 관계를 추출한다.
 */
export function extractRelationsFromThreeTier(
  sourceLawId: string,
  sourceLawTitle: string,
  data: ThreeTierData,
): ExtractionResult {
  const nodeMap = new Map<string, LawNodeInsert>()
  const edgeSet = new Set<string>()
  const edges: LawEdgeInsert[] = []

  // 소스 법령 노드
  nodeMap.set(sourceLawId, {
    id: sourceLawId,
    title: sourceLawTitle,
    type: 'law',
  })

  // 메타에서 시행령/시행규칙 노드 추출
  for (const node of extractMetaNodes(data.meta)) {
    nodeMap.set(node.id, node)
  }

  // 각 조문의 위임 항목 순회
  for (const article of data.articles) {
    for (const delegation of article.delegations) {
      const mapping = DELEGATION_MAP[delegation.type]
      if (!mapping) continue

      // lawName 없으면 스킵 (대상 법령 특정 불가)
      if (!delegation.lawName) continue

      // 대상 노드 ID 결정: meta에서 매칭되는 ID가 있으면 사용
      let targetId: string
      if (
        delegation.type === '시행령' &&
        data.meta.sihyungryungId &&
        data.meta.sihyungryungName
      ) {
        targetId = data.meta.sihyungryungId
      } else if (
        delegation.type === '시행규칙' &&
        data.meta.sihyungkyuchikId &&
        data.meta.sihyungkyuchikName
      ) {
        targetId = data.meta.sihyungkyuchikId
      } else {
        targetId = makeNodeId(delegation.lawName)
      }

      // 대상 노드 등록
      if (!nodeMap.has(targetId)) {
        nodeMap.set(targetId, {
          id: targetId,
          title: delegation.lawName,
          type: mapping.nodeType,
        })
      }

      // 엣지 중복 방지 키
      const edgeKey = `${sourceLawId}|${targetId}|${mapping.relation}|${article.jo}|${delegation.jo ?? ''}`
      if (edgeSet.has(edgeKey)) continue
      edgeSet.add(edgeKey)

      edges.push({
        from_id: sourceLawId,
        to_id: targetId,
        relation: mapping.relation,
        from_article: article.jo,
        to_article: delegation.jo ?? null,
        metadata: {
          delegationType: delegation.type,
          sourceJoNum: article.joNum,
          targetJoNum: delegation.joNum ?? null,
        },
      })
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
  }
}
