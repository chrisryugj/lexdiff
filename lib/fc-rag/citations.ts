/**
 * Citations — 도구 결과에서 Citation 구성 + 신뢰도 계산
 */

import type { ToolCallResult } from './tool-adapter'
import type { FCRAGCitation } from './engine'

/**
 * 답변 텍스트에서 문맥 인식 조문 참조 추출.
 * "이 법 제N조", "같은 법 제N조", "동법 제N조" → 직전 법령명으로 해석.
 * 단독 "제N조" → 직전 법령명 부착.
 */
function extractContextualArticles(text: string): Set<string> {
  const articles = new Set<string>()

  // 텍스트를 순서대로 스캔하며 조문 번호 수집 (법령명 관계없이 모든 제N조 매칭)
  const patterns = /(?:「[^」]+」\s*)?(?:이\s*법|같은\s*법|동법|본법)?\s*제(\d+)조(?:의(\d+))?/g
  for (const m of text.matchAll(patterns)) {
    const articleNum = m[2] ? `제${m[1]}조의${m[2]}` : `제${m[1]}조`
    articles.add(articleNum)
  }

  return articles
}

/**
 * 도구 결과에서 Citation 구성 (답변 텍스트 기반 필터링)
 */
export function buildCitations(toolResults: ToolCallResult[], answerText?: string): FCRAGCitation[] {
  const citations: FCRAGCitation[] = []
  const seen = new Set<string>()

  const mentionedArticles = answerText
    ? extractContextualArticles(answerText)
    : null

  for (const result of toolResults) {
    if (result.isError) continue

    const text = result.result

    if (result.name === 'get_law_text' || result.name === 'get_batch_articles') {
      const lawNameMatch = text.match(/(?:##\s+|법령명:\s*)(.+?)(?:\n|$)/)
      const lawName = lawNameMatch?.[1]?.trim() || ''

      for (const match of Array.from(text.matchAll(/제(\d+)조(?:의(\d+))?(?:\(([^)]+)\))?/g))) {
        const articleNum = match[2] ? `제${match[1]}조의${match[2]}` : `제${match[1]}조`
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
      for (const match of Array.from(text.matchAll(/📜\s+(.+)\n\s+제(\d+)조(?:의(\d+))?/g))) {
        const lawName = match[1].trim()
        const articleNum = match[3] ? `제${match[2]}조의${match[3]}` : `제${match[2]}조`
        const key = `ai:${lawName}:${articleNum}`
        if (!seen.has(key)) {
          seen.add(key)
          const idx = match.index ?? text.indexOf(match[0])
          const chunkText = text.slice(Math.max(0, idx), Math.min(text.length, idx + 400))
          citations.push({ lawName, articleNumber: articleNum, chunkText, source: 'search_ai_law' })
        }
      }
    }

    if (result.name === 'search_precedents' || result.name === 'get_precedent_text') {
      for (const match of Array.from(text.matchAll(/사건번호[:\s]+(\S+)/g))) {
        const caseNo = match[1]
        if (!seen.has(caseNo)) {
          seen.add(caseNo)
          citations.push({ lawName: '판례', articleNumber: caseNo, chunkText: text.slice(0, 200), source: result.name })
        }
      }
    }

    if (result.name === 'search_interpretations' || result.name === 'get_interpretation_text') {
      for (const match of Array.from(text.matchAll(/(?:해석례|회신번호|ID)[:\s]+(\S+)/g))) {
        const interpNo = match[1]
        if (!seen.has(interpNo)) {
          seen.add(interpNo)
          citations.push({ lawName: '법령해석례', articleNumber: interpNo, chunkText: text.slice(0, 200), source: result.name })
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

    // Domain specialist decisions (행정심판/헌재/조세심판/관세/공정위/개인정보위/노동위)
    if (/^(?:get_admin_appeal|get_constitutional_decision|get_tax_tribunal_decision|get_customs_interpretation|get_ftc_decision|get_pipc_decision|get_nlrc_decision)_text$/.test(result.name)) {
      const nameMatch = text.match(/(?:사건명|사건번호|결정번호|재결번호)[:\s]+(.+?)(?:\n|$)/)
      if (nameMatch) {
        const decisionId = nameMatch[1].trim()
        if (!seen.has(decisionId)) {
          seen.add(decisionId)
          const sourceLabels: Record<string, string> = {
            get_admin_appeal_text: '행정심판',
            get_constitutional_decision_text: '헌법재판소',
            get_tax_tribunal_decision_text: '조세심판',
            get_customs_interpretation_text: '관세해석',
            get_ftc_decision_text: '공정위',
            get_pipc_decision_text: '개인정보위',
            get_nlrc_decision_text: '노동위',
          }
          citations.push({ lawName: sourceLabels[result.name] || '결정례', articleNumber: decisionId, chunkText: text.slice(0, 200), source: result.name })
        }
      }
    }

    // get_article_with_precedents — 법령 조문 + 판례 모두 추출
    if (result.name === 'get_article_with_precedents') {
      const awpLawName = text.match(/법령명: (.+?)\n/)?.[1]?.trim() || ''
      for (const match of Array.from(text.matchAll(/제(\d+)조(?:의(\d+))?/g))) {
        const articleNum = match[2] ? `제${match[1]}조의${match[2]}` : `제${match[1]}조`
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
  if (successful.length >= 3) return 'high'
  if (successful.length >= 1) return 'medium'
  return 'low'
}

/**
 * 답변 텍스트에서 「법령명」 제N조 패턴으로 citation 추출.
 * Claude CLI가 도구를 직접 호출하므로 tool result 없이 텍스트 기반으로 파싱.
 */
export function parseCitationsFromAnswer(answer: string): FCRAGCitation[] {
  const citations: FCRAGCitation[] = []
  const seen = new Set<string>()

  // 「법령명」 제N조 패턴
  const lawArticlePattern = /「([^」]+)」\s*제(\d+)조(?:의(\d+))?/g
  for (const m of answer.matchAll(lawArticlePattern)) {
    const lawName = m[1]
    const articleNum = m[3] ? `제${m[2]}조의${m[3]}` : `제${m[2]}조`
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
