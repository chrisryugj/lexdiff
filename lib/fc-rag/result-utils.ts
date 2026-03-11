/**
 * Result Utilities — 도구 결과 요약, 파라미터 보정, 검색 결과 재정렬
 */

import type { ToolCallResult } from './tool-adapter'
import { executeTool } from './tool-adapter'
import { TOOL_DISPLAY_NAMES } from './tool-tiers'
import { parseLawEntries, findBestMST, type LawEntry } from './fast-path'

// ─── 도구 결과 요약 유틸 (SSE용) ───

export function summarizeToolResult(name: string, result: ToolCallResult): string {
  if (result.isError) return `오류: ${result.result.slice(0, 60)}`

  const text = result.result
  switch (name) {
    case 'search_ai_law': {
      const countMatch = text.match(/(\d+)건/)
      return countMatch ? `${countMatch[1]}건 조문 검색됨` : '지능형 검색 완료'
    }
    case 'search_law': {
      const countMatch = text.match(/총 (\d+)건/)
      const entries = parseLawEntries(text)
      const firstName = entries[0]?.name
      if (countMatch && firstName) {
        return entries.length > 1 ? `${firstName} 외 ${entries.length - 1}건` : firstName
      }
      return firstName || '검색 완료'
    }
    case 'get_batch_articles': {
      const lawName = text.match(/법령명:\s*(.+?)(?:\n|$)/)?.[1]?.trim()
      const articleCount = new Set(Array.from(text.matchAll(/제(\d+)조/g)).map(m => m[1])).size
      return lawName ? `${lawName} ${articleCount}개 조문` : `${articleCount}개 조문 조회`
    }
    case 'get_law_text': {
      const articleCount = new Set(Array.from(text.matchAll(/제(\d+)조/g)).map(m => m[1])).size
      const lawName = text.match(/(?:##\s+|법령명:\s*)(.+?)(?:\n|$)/)?.[1]?.trim()
      return lawName ? `${lawName} ${articleCount}개 조문` : `${articleCount}개 조문 조회`
    }
    case 'search_precedents': {
      const count = text.match(/총 (\d+)건/)?.[1]
      return count ? `${count}건 검색됨` : '판례 검색 완료'
    }
    case 'get_precedent_text': return '판례 전문 조회 완료'
    case 'search_interpretations': {
      const count = text.match(/총 (\d+)건/)?.[1]
      return count ? `${count}건 검색됨` : '해석례 검색 완료'
    }
    case 'get_interpretation_text': return '해석례 전문 조회 완료'
    case 'get_three_tier': return '위임법령 구조 조회 완료'
    case 'compare_old_new': return '신구법 대조표 조회 완료'
    case 'get_article_history': return '조문 이력 조회 완료'
    case 'search_ordinance': {
      const count = text.match(/총 (\d+)건/)?.[1]
      const firstName = text.match(/\]\s+(.+)/)?.[1]?.trim()
      return count ? `${firstName || '자치법규'} 외 ${count}건` : '자치법규 검색 완료'
    }
    case 'get_ordinance': {
      const name = text.match(/자치법규명:\s*(.+)/)?.[1]?.trim()
      return name || '자치법규 조회 완료'
    }
    default: return '완료'
  }
}

export function getToolCallQuery(name: string, args: Record<string, unknown>): string | undefined {
  switch (name) {
    case 'search_ai_law': return args.query as string
    case 'search_law': return args.query as string
    case 'get_law_text': return args.jo ? `${args.jo}` : undefined
    case 'get_batch_articles': {
      const articles = args.articles as string[] | undefined
      return articles?.join(', ')
    }
    case 'search_precedents': return args.query as string
    case 'search_interpretations': return args.query as string
    case 'search_ordinance': return args.query as string
    case 'get_ordinance': return args.ordinSeq ? `#${args.ordinSeq}` : undefined
    default: return undefined
  }
}

// ─── 파라미터 보정 ───

/** 파라미터 보정: Gemini가 잘못 보낸 MST/jo를 엔진에서 교정 */
export async function correctToolArgs(
  calls: Array<{ name: string; args: Record<string, unknown> }>,
  latestSearchEntries: LawEntry[],
  query: string,
  onSearchFallback?: (entries: LawEntry[], toolResult: ToolCallResult) => void
) {
  for (const call of calls) {
    // get_law_text / get_batch_articles / get_three_tier / compare_old_new / get_article_history: MST 보정
    if (['get_law_text', 'get_batch_articles', 'get_three_tier', 'compare_old_new', 'get_article_history'].includes(call.name)) {
      if (call.args.mst) {
        if (latestSearchEntries.length > 0) {
          // 빠른 경로: known MST에서 보정
          const knownMSTs = new Set(latestSearchEntries.map(e => e.mst))
          if (!knownMSTs.has(call.args.mst as string)) {
            const corrected = findBestMST(latestSearchEntries, query)
            if (corrected) call.args.mst = corrected
          }
        } else {
          // known MST 없음 → search_law 자동 호출하여 수집
          const lawNameMatch = query.match(/「([^」]+)」/) || query.match(/([\w가-힣]+법)/)
          const searchQuery = lawNameMatch?.[1] || query.slice(0, 30)
          const searchResult = await executeTool('search_law', { query: searchQuery })
          if (!searchResult.isError) {
            const entries = parseLawEntries(searchResult.result)
            if (entries.length > 0) {
              latestSearchEntries.push(...entries)
              onSearchFallback?.(entries, searchResult)
              const corrected = findBestMST(entries, query)
              if (corrected) call.args.mst = corrected
            }
          }
        }
      }
    }
    // get_law_text: jo 형식 보정
    if (call.name === 'get_law_text') {
      if (call.args.jo) {
        const jo = String(call.args.jo)
        if (/^\d+$/.test(jo)) call.args.jo = `제${jo}조`
        else if (/^\d+의\d+$/.test(jo)) call.args.jo = `제${jo.replace(/(\d+)의(\d+)/, '$1조의$2')}`
      }
    }
    // get_batch_articles: articles 내 조문번호 형식 보정
    if (call.name === 'get_batch_articles' && Array.isArray(call.args.articles)) {
      call.args.articles = (call.args.articles as string[]).map(a => {
        if (/^\d+$/.test(a)) return `제${a}조`
        if (/^\d+의\d+$/.test(a)) return `제${a.replace(/(\d+)의(\d+)/, '$1조의$2')}`
        return a
      })
    }
  }
}

// ─── search_ai_law 결과 관련성 재정렬 (Context Precision 향상) ───

/**
 * search_ai_law 결과를 쿼리 키워드 매칭으로 재정렬.
 * 쿼리와 관련 없는 조문을 후순위로 밀어 Gemini가 핵심 조문에 집중하게 함.
 *
 * 점수 기준:
 * - 법령명에 쿼리 키워드 포함 시 +3/키워드
 * - 조문 내용에 쿼리 키워드 포함 시 +1/키워드
 * - "제N조" 형태 매칭 시 +5 (사용자가 조문 지정)
 */
export function rerankAiSearchResult(text: string, query: string): string {
  const headerMatch = text.match(/^[^\n]*(?:검색|총)[^\n]*\n/)
  const header = headerMatch ? headerMatch[0] : ''
  const body = headerMatch ? text.slice(header.length) : text

  const blocks = body.split(/(?=📜\s)/).filter(b => b.trim().length > 0)
  if (blocks.length <= 1) return text  // 1건 이하면 재정렬 불필요

  // 쿼리에서 키워드 추출 (불용어 제거)
  const stopWords = /(?:은|는|이|가|을|를|에|의|로|으로|와|과|에서|한|하는|대한|대해|무엇|어떤|어떻게|인가요|인지|것|및|또는|경우|위한|있는|없는|되는|되어|알려|설명|궁금|내용|관련|해서|해|줘)$/
  const keywords = query
    .replace(/[「」]/g, '')
    .split(/\s+/)
    .map(w => w.replace(stopWords, ''))
    .filter(w => w.length >= 2)

  // 쿼리에서 조문번호 추출
  const queryArticles = new Set(
    Array.from(query.matchAll(/제(\d+)조(?:의(\d+))?/g))
      .map(m => m[2] ? `제${m[1]}조의${m[2]}` : `제${m[1]}조`)
  )

  const scored = blocks.map(block => {
    let score = 0
    const firstLine = block.split('\n')[0] || ''  // 📜 법령명 라인

    // 법령명 키워드 매칭 (가중치 높음)
    for (const kw of keywords) {
      if (firstLine.includes(kw)) score += 3
      else if (block.includes(kw)) score += 1
    }

    // 조문번호 직접 매칭 (가중치 최고)
    for (const art of queryArticles) {
      if (block.includes(art)) score += 5
    }

    return { block, score }
  })

  // 점수 내림차순 정렬
  scored.sort((a, b) => b.score - a.score)

  // 관련성 없는 노이즈 제거: score > 0 결과가 3건 이상이면 score 0 결과 드롭
  const positiveScored = scored.filter(s => s.score > 0)
  const filtered = positiveScored.length >= 3 ? positiveScored : scored

  return header + filtered.map(s => s.block).join('\n\n')
}
