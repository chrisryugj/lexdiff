/**
 * AI Citations를 ParsedRelatedLaw 형식으로 변환하고 기존 relatedArticles와 병합하는 순수함수.
 */

import { buildJO, type ParsedRelatedLaw } from "@/lib/law-parser"
import type { VerifiedCitation } from "@/lib/citation-verifier"

/**
 * Citations를 ParsedRelatedLaw로 변환 후 relatedArticles와 병합.
 * 같은 법령이 본문(excerpt/related)과 AI 인용(citation)에 동시 존재하면 둘 다 유지.
 */
export function mergeCitationsWithRelated(
  aiCitations: VerifiedCitation[],
  relatedArticles: ParsedRelatedLaw[],
): ParsedRelatedLaw[] {
  if (!aiCitations || aiCitations.length === 0) {
    return relatedArticles
  }

  const citationsAsRelatedLaws: ParsedRelatedLaw[] = aiCitations
    .filter(c => c.lawName && c.articleNum)
    .map(citation => {
      const articleNum = citation.articleNum.replace(/^제/, '').replace(/조$/, '')
      const jo = buildJO(articleNum)

      // 조문 제목 보완: citation에 제목이 없으면 relatedArticles에서 찾기
      let title = citation.articleTitle
      if (!title && relatedArticles.length > 0) {
        const matching = relatedArticles.find(
          r => r.lawName === citation.lawName && r.article === citation.articleNum && r.title
        )
        if (matching) {
          title = matching.title
        }
      }

      return {
        lawName: citation.lawName,
        article: citation.articleNum,
        jo,
        title,
        display: `${citation.lawName} ${citation.articleNum}`,
        source: 'citation',
        fullText: citation.text,
      }
    })

  return [...relatedArticles, ...citationsAsRelatedLaws]
}
