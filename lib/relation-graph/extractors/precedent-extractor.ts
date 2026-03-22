/**
 * 판례 검색 결과에서 법령 관계를 추출한다.
 *
 * 판례 → 조문 관계: interprets (해석)
 */

import type { PrecedentSearchResult } from '@/lib/precedent-parser'
import type { ExtractionResult, LawNodeInsert, LawEdgeInsert } from '../relation-types'

/**
 * 판례 검색 결과에서 interprets 관계를 추출한다.
 *
 * @param lawId - 검색 기준 법령 ID
 * @param lawTitle - 법령 제목
 * @param article - 검색 기준 조문번호 (6자리 JO 코드)
 * @param precedents - 판례 검색 결과 배열
 */
export function extractRelationsFromPrecedents(
  lawId: string,
  lawTitle: string,
  article: string,
  precedents: PrecedentSearchResult[],
): ExtractionResult {
  const nodes: LawNodeInsert[] = []
  const edges: LawEdgeInsert[] = []
  const seen = new Set<string>()

  // 법령 노드
  nodes.push({ id: lawId, title: lawTitle, type: 'law' })

  for (const prec of precedents) {
    if (!prec.id) continue

    const precNodeId = `prec:${prec.id}`

    // 중복 방지
    if (seen.has(precNodeId)) continue
    seen.add(precNodeId)

    // 판례 노드
    nodes.push({
      id: precNodeId,
      title: prec.name || prec.caseNumber || `판례 ${prec.id}`,
      type: 'precedent',
    })

    // interprets 엣지 (판례 → 조문)
    edges.push({
      from_id: precNodeId,
      to_id: lawId,
      relation: 'interprets',
      to_article: article,
      metadata: {
        caseNumber: prec.caseNumber,
        court: prec.court,
        date: prec.date,
        type: prec.type,
      },
    })
  }

  return { nodes, edges }
}
