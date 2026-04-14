/**
 * Citations — 도구 결과에서 Citation 구성 + 신뢰도 계산
 */

import type { ToolCallResult } from './tool-adapter'
import type { FCRAGCitation } from './engine'
import {
  isDecisionSearchTool, isDecisionGetTool,
  extractDomain, DOMAIN_META, type DecisionDomain,
} from './decision-domains'

/**
 * 답변 텍스트에서 문맥 인식 조문 참조 추출.
 * "이 법 제N조", "같은 법 제N조", "동법 제N조" → 직전 법령명으로 해석.
 * 단독 "제N조" → 직전 법령명 부착.
 */
function extractContextualArticles(text: string): Set<string> {
  const articles = new Set<string>()

  // 텍스트를 순서대로 스캔하며 조문 번호 수집 (법령명 관계없이 모든 제N조 매칭)
  const patterns = /(?:「[^」]+」\s*)?(?:이\s*법|같은\s*법|동법|본법)?\s*제(\d+)조(?:의(\d+))?(?:의(\d+))?/g
  for (const m of text.matchAll(patterns)) {
    const articleNum = m[3] ? `제${m[1]}조의${m[2]}의${m[3]}`
      : m[2] ? `제${m[1]}조의${m[2]}`
      : `제${m[1]}조`
    articles.add(articleNum)
  }

  return articles
}

/**
 * 도구 결과에서 Citation 구성 (답변 텍스트 기반 필터링)
 */
const MAX_CITATIONS = 50 // 메모리/SSE 대역폭 보호

export function buildCitations(toolResults: ToolCallResult[], answerText?: string): FCRAGCitation[] {
  const citations: FCRAGCitation[] = []
  const seen = new Set<string>()

  const mentionedArticles = answerText
    ? extractContextualArticles(answerText)
    : null

  for (const result of toolResults) {
    if (result.isError) continue
    if (citations.length >= MAX_CITATIONS) break

    const text = result.result

    if (result.name === 'get_law_text' || result.name === 'get_batch_articles') {
      const lawNameMatch = text.match(/(?:##\s+|법령명:\s*)(.+?)(?:\n|$)/)
      const lawName = lawNameMatch?.[1]?.trim() || ''

      for (const match of Array.from(text.matchAll(/제(\d+)조(?:의(\d+))?(?:의(\d+))?(?:\(([^)]+)\))?/g))) {
        const articleNum = match[3] ? `제${match[1]}조의${match[2]}의${match[3]}`
          : match[2] ? `제${match[1]}조의${match[2]}`
          : `제${match[1]}조`
        if (mentionedArticles && !mentionedArticles.has(articleNum)) continue

        const key = `${lawName}:${articleNum}`
        if (!seen.has(key)) {
          seen.add(key)
          const idx = match.index ?? text.indexOf(match[0])
          const chunkText = text.slice(Math.max(0, idx), Math.min(text.length, idx + 400))
          citations.push({ lawName, articleNumber: articleNum, chunkText, source: result.name })
        }
      }
    }

    if (result.name === 'search_ai_law') {
      // search_ai_law 결과에서 법령명 + 조문번호 추출
      for (const match of Array.from(text.matchAll(/📜\s+(.+)\n\s+제(\d+)조(?:의(\d+))?(?:의(\d+))?/g))) {
        const lawName = match[1].trim()
        const articleNum = match[4] ? `제${match[2]}조의${match[3]}의${match[4]}`
          : match[3] ? `제${match[2]}조의${match[3]}`
          : `제${match[2]}조`
        const key = `ai:${lawName}:${articleNum}`
        if (!seen.has(key)) {
          seen.add(key)
          const idx = match.index ?? text.indexOf(match[0])
          const chunkText = text.slice(Math.max(0, idx), Math.min(text.length, idx + 400))
          citations.push({ lawName, articleNumber: articleNum, chunkText, source: 'search_ai_law' })
        }
      }
    }

    // ═══ Unified decisions (search_decisions / get_decision_text) ═══
    // 도메인별로 다른 필드/정규식으로 식별자 추출.
    if (isDecisionSearchTool(result.name) || isDecisionGetTool(result.name)) {
      const domain = extractDomain(result.args) as DecisionDomain | null
      const label = domain ? DOMAIN_META[domain].label : '결정문'
      // precedent/constitutional/admin_appeal: 사건번호
      // interpretation: 회신번호/ID
      // tax_tribunal/ftc/pipc/nlrc/acr/appeal_review: 결정번호/재결번호
      // 통합 정규식: 여러 후보 필드 중 첫 매칭
      const idRegex = /(?:사건번호|회신번호|결정번호|재결번호|안건번호|ID|일련번호)[:\s]+(\S+)/g
      for (const match of Array.from(text.matchAll(idRegex))) {
        const decisionId = match[1]
        const key = `${domain ?? 'decision'}:${decisionId}`
        if (!seen.has(key)) {
          seen.add(key)
          citations.push({
            lawName: label,
            articleNumber: decisionId,
            chunkText: text.slice(0, 200),
            source: result.name,
          })
        }
      }
    }

    if (result.name === 'get_three_tier') {
      const lawNames = Array.from(text.matchAll(/(?:법률|시행령|시행규칙)[:\s]+(.+?)(?:\n|$)/g))
      for (const match of lawNames) {
        const name = match[1].trim()
        const key = `위임:${name}`
        if (name && !seen.has(key)) {
          seen.add(key)
          citations.push({ lawName: name, articleNumber: '위임법령', chunkText: text.slice(0, 200), source: 'get_three_tier' })
        }
      }
    }

    if (result.name === 'compare_old_new') {
      const key = '신구법대조'
      if (!seen.has(key)) {
        seen.add(key)
        const lawNameMatch = text.match(/(?:법령명|법률명)[:\s]+(.+?)(?:\n|$)/)
        citations.push({
          lawName: lawNameMatch?.[1]?.trim() || '신구법 대조',
          articleNumber: '신구법 대조표',
          chunkText: text.slice(0, 200),
          source: 'compare_old_new',
        })
      }
    }

    if (result.name === 'get_article_history') {
      for (const match of Array.from(text.matchAll(/(\d{4}[-./]\d{2}[-./]\d{2})\s*(?:개정|신설|삭제)/g))) {
        const date = match[1]
        const key = `이력:${date}`
        if (!seen.has(key)) {
          seen.add(key)
          citations.push({
            lawName: '조문 개정이력',
            articleNumber: date,
            chunkText: text.slice(Math.max(0, text.indexOf(match[0])), Math.min(text.length, text.indexOf(match[0]) + 200)),
            source: 'get_article_history',
          })
        }
      }
    }

    // Chain tools — 내부에서 여러 도구 결과를 합산하므로, 법령명+조문번호 패턴으로 추출
    if (result.name.startsWith('chain_') && !result.isError) {
      // 법령명 + 조문번호 패턴 추출
      for (const match of Array.from(text.matchAll(/(?:법령명|법률명|법령)[:\s]+(.+?)(?:\n|$)/g))) {
        const chainLawName = match[1].trim()
        // 실패/빈 결과 문구가 lawName 으로 새는 것 차단 (chain_full_research 내부 에러 포매팅 대응)
        if (/(조회\s*실패|검색\s*결과가\s*없|결과\s*없음|에러|오류|찾을\s*수\s*없)/.test(chainLawName)) continue
        const key = `chain:${chainLawName}`
        if (chainLawName && !seen.has(key)) {
          seen.add(key)
          citations.push({ lawName: chainLawName, articleNumber: 'chain', chunkText: text.slice(0, 200), source: result.name })
        }
      }
      // 판례 사건번호 추출 (chain_dispute_prep 등)
      for (const match of Array.from(text.matchAll(/사건번호[:\s]+(\S+)/g))) {
        const caseNo = match[1]
        if (!seen.has(caseNo)) {
          seen.add(caseNo)
          citations.push({ lawName: '판례', articleNumber: caseNo, chunkText: text.slice(0, 200), source: result.name })
        }
      }
    }

    // Admin rules (행정규칙)
    if (result.name === 'get_admin_rule') {
      const ruleName = text.match(/행정규칙명:\s*(.+?)(?:\n|$)/)?.[1]?.trim()
      if (ruleName) {
        const key = `행정규칙:${ruleName}`
        if (!seen.has(key)) {
          seen.add(key)
          citations.push({ lawName: ruleName, articleNumber: '행정규칙', chunkText: text.slice(0, 200), source: 'get_admin_rule' })
        }
      }
    }

    // get_article_with_precedents — 법령 조문 + 판례 모두 추출
    if (result.name === 'get_article_with_precedents') {
      const awpLawName = text.match(/법령명: (.+?)\n/)?.[1]?.trim() || ''
      for (const match of Array.from(text.matchAll(/제(\d+)조(?:의(\d+))?(?:의(\d+))?/g))) {
        const articleNum = match[3] ? `제${match[1]}조의${match[2]}의${match[3]}`
          : match[2] ? `제${match[1]}조의${match[2]}`
          : `제${match[1]}조`
        const key = `awp:${awpLawName}:${articleNum}`
        if (!seen.has(key)) {
          seen.add(key)
          const idx = match.index ?? text.indexOf(match[0])
          citations.push({ lawName: awpLawName, articleNumber: articleNum, chunkText: text.slice(Math.max(0, idx), Math.min(text.length, idx + 400)), source: result.name })
        }
      }
    }

    if (result.name === 'get_ordinance') {
      const ordinName = text.match(/자치법규명:\s*(.+)/)?.[1]?.trim()
      if (ordinName) {
        for (const match of Array.from(text.matchAll(/제(\d+)조(?:의(\d+))?(?:\(([^)]+)\))?/g))) {
          const articleNum = match[2] ? `제${match[1]}조의${match[2]}` : `제${match[1]}조`
          if (mentionedArticles && !mentionedArticles.has(articleNum)) continue
          const key = `${ordinName}:${articleNum}`
          if (!seen.has(key)) {
            seen.add(key)
            const idx = match.index ?? text.indexOf(match[0])
            citations.push({ lawName: ordinName, articleNumber: articleNum, chunkText: text.slice(Math.max(0, idx), Math.min(text.length, idx + 400)), source: 'get_ordinance' })
          }
        }
        // 조문 매칭이 없어도 조례 자체는 citation으로 등록
        const baseKey = `조례:${ordinName}`
        if (!seen.has(baseKey)) {
          seen.add(baseKey)
          citations.push({ lawName: ordinName, articleNumber: '자치법규', chunkText: text.slice(0, 200), source: 'get_ordinance' })
        }
      }
    }
  }

  return citations
}

export function calcConfidence(toolResults: ToolCallResult[]): 'high' | 'medium' | 'low' {
  const successful = toolResults.filter(r => !r.isError)
  // 성공 도구 수 + 실질적 결과 길이로 판단 (빈 결과는 실질 기여 없음)
  const substantive = successful.filter(r => r.result.length > 100)
  if (substantive.length >= 3) return 'high'
  if (substantive.length >= 1 || successful.length >= 2) return 'medium'
  return 'low'
}

/**
 * 답변 텍스트에서 「법령명」 제N조 패턴으로 citation 추출.
 * Claude CLI가 도구를 직접 호출하므로 tool result 없이 텍스트 기반으로 파싱.
 */
/**
 * buildCitations 결과에 답변 본문의 「법령명」 제N조 패턴을 fallback 으로 merge.
 * tool result 형식 파싱이 실패하거나 chain_* 결과에서 조문을 못 뽑아낸 경우에도
 * 답변 본문에 명시된 근거 조문을 citation 으로 노출한다. tool-result 기반 citation 이
 * 이미 있는 (lawName, articleNumber) 조합은 유지(정확한 chunkText 보존).
 */
export function buildCitationsWithAnswerFallback(
  toolResults: ToolCallResult[],
  answerText: string,
): FCRAGCitation[] {
  const primary = buildCitations(toolResults, answerText)
  if (!answerText) return primary

  const fallback = parseCitationsFromAnswer(answerText)
  if (fallback.length === 0) return primary

  const seen = new Set(primary.map(c => `${c.lawName}:${c.articleNumber}`))
  const merged = [...primary]
  for (const fb of fallback) {
    const key = `${fb.lawName}:${fb.articleNumber}`
    if (!seen.has(key)) {
      seen.add(key)
      merged.push({ ...fb, source: 'answer-fallback' })
    }
    if (merged.length >= MAX_CITATIONS) break
  }
  return merged
}

export function parseCitationsFromAnswer(answer: string): FCRAGCitation[] {
  const citations: FCRAGCitation[] = []
  const seen = new Set<string>()

  // 「법령명」 제N조 패턴
  const lawArticlePattern = /「([^」]+)」\s*제(\d+)조(?:의(\d+))?(?:의(\d+))?/g
  for (const m of answer.matchAll(lawArticlePattern)) {
    const lawName = m[1]
    const articleNum = m[4] ? `제${m[2]}조의${m[3]}의${m[4]}`
      : m[3] ? `제${m[2]}조의${m[3]}`
      : `제${m[2]}조`
    const key = `${lawName}:${articleNum}`
    if (!seen.has(key)) {
      seen.add(key)
      const idx = m.index ?? 0
      citations.push({
        lawName,
        articleNumber: articleNum,
        chunkText: answer.slice(Math.max(0, idx), Math.min(answer.length, idx + 300)),
        source: 'claude-cli',
      })
    }
  }

  return citations
}
