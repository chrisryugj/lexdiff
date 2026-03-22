/**
 * 법령 본문 텍스트에서 인용(cites) 관계를 추출한다.
 *
 * link-pattern-matchers의 패턴 매칭 함수를 재사용하여
 * 「관세법」제38조, 같은 법 제40조, 시행령 제54조 등의 패턴을 탐지.
 */

import type { LinkMatch } from '@/lib/unified-link-generator'
import {
  collectQuotedLawMatches,
  collectSameLawMatches,
  collectDecreeMatches,
  collectRuleMatches,
} from '@/lib/link-pattern-matchers'
import type { ExtractionResult, LawNodeInsert, LawEdgeInsert, LawNodeType } from '../relation-types'

/**
 * 법령 본문에서 인용 관계를 추출한다.
 *
 * @param sourceLawId - 현재 법령 ID
 * @param sourceArticle - 현재 조문번호 (6자리 JO 코드)
 * @param text - 조문 본문 텍스트
 * @param contextLawName - 현재 법령명 ("같은 법" 해석용)
 */
export function extractCitationsFromText(
  sourceLawId: string,
  sourceArticle: string,
  text: string,
  contextLawName?: string,
): ExtractionResult {
  if (!text.trim()) return { nodes: [], edges: [] }

  // 패턴 매칭 수집
  const matches: LinkMatch[] = []
  collectQuotedLawMatches(text, matches)
  collectSameLawMatches(text, matches, contextLawName)
  collectDecreeMatches(text, matches)
  collectRuleMatches(text, matches)

  if (matches.length === 0) return { nodes: [], edges: [] }

  const nodeMap = new Map<string, LawNodeInsert>()
  const edgeSet = new Set<string>()
  const edges: LawEdgeInsert[] = []

  for (const match of matches) {
    // 대상 법령명 결정
    const targetLawName = match.lawName || contextLawName
    if (!targetLawName) continue

    // 노드 ID (법령명 기반)
    const targetId = `name:${targetLawName}`

    // 노드 타입 결정
    let nodeType: LawNodeType = 'law'
    if (match.type === 'decree') nodeType = 'decree'
    else if (match.type === 'rule') nodeType = 'rule'
    else if (/시행령/.test(targetLawName)) nodeType = 'decree'
    else if (/시행규칙/.test(targetLawName)) nodeType = 'rule'

    // 노드 등록
    if (!nodeMap.has(targetId)) {
      nodeMap.set(targetId, {
        id: targetId,
        title: targetLawName,
        type: nodeType,
      })
    }

    // 엣지 중복 방지
    const targetArticle = match.article || null
    const edgeKey = `${sourceLawId}|${targetId}|cites|${sourceArticle}|${targetArticle}`
    if (edgeSet.has(edgeKey)) continue
    edgeSet.add(edgeKey)

    edges.push({
      from_id: sourceLawId,
      to_id: targetId,
      relation: 'cites',
      from_article: sourceArticle,
      to_article: targetArticle,
      metadata: {
        matchType: match.type,
        displayText: match.displayText,
      },
    })
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
  }
}
