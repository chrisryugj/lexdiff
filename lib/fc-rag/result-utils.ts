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
    // Admin rules
    case 'search_admin_rule': {
      const count = text.match(/총 (\d+)건/)?.[1]
      return count ? `${count}건 검색됨` : '행정규칙 검색 완료'
    }
    case 'get_admin_rule': return '행정규칙 전문 조회 완료'
    // Chain tools
    case 'chain_full_research': return '종합 리서치 완료'
    case 'chain_dispute_prep': return '쟁송 자료 수집 완료'
    case 'chain_procedure_detail': return '절차/비용 조회 완료'
    case 'chain_action_basis': return '처분근거 조회 완료'
    case 'chain_law_system': return '법체계 파악 완료'
    case 'chain_amendment_track': return '개정 추적 완료'
    case 'chain_ordinance_compare': return '조례 비교 완료'
    // Domain specialists
    case 'search_admin_appeals': {
      const count = text.match(/총 (\d+)건/)?.[1]
      return count ? `행정심판례 ${count}건` : '행정심판례 검색 완료'
    }
    case 'get_admin_appeal_text': return '행정심판례 조회 완료'
    case 'search_constitutional_decisions': {
      const count = text.match(/총 (\d+)건/)?.[1]
      return count ? `헌재 결정 ${count}건` : '헌재 결정 검색 완료'
    }
    case 'get_constitutional_decision_text': return '헌재 결정 조회 완료'
    case 'search_tax_tribunal_decisions': {
      const count = text.match(/총 (\d+)건/)?.[1]
      return count ? `조세심판 ${count}건` : '조세심판 검색 완료'
    }
    case 'get_tax_tribunal_decision_text': return '조세심판 재결 조회 완료'
    case 'search_customs_interpretations': {
      const count = text.match(/총 (\d+)건/)?.[1]
      return count ? `관세 해석 ${count}건` : '관세 해석 검색 완료'
    }
    case 'get_customs_interpretation_text': return '관세 해석 조회 완료'
    case 'search_ftc_decisions': return '공정위 결정 검색 완료'
    case 'get_ftc_decision_text': return '공정위 결정 조회 완료'
    case 'search_pipc_decisions': return '개인정보위 결정 검색 완료'
    case 'get_pipc_decision_text': return '개인정보위 결정 조회 완료'
    case 'search_nlrc_decisions': return '노동위 결정 검색 완료'
    case 'get_nlrc_decision_text': return '노동위 결정 조회 완료'
    case 'get_article_with_precedents': {
      const lawName = text.match(/법령명: (.+?)\n/)?.[1]?.trim()
      return lawName ? `${lawName} 조문+판례` : '조문+판례 조회 완료'
    }
    case 'get_law_history': return '법령 연혁 조회 완료'
    // Tier 2: Structural / Historical
    case 'get_law_system_tree': return '법령 체계 분류 조회 완료'
    case 'get_external_links': return '외부 링크 생성 완료'
    case 'search_historical_law': {
      const count = text.match(/총 (\d+)건/)?.[1]
      return count ? `과거 법령 ${count}건` : '과거 법령 검색 완료'
    }
    case 'get_historical_law': return '과거 법령 조문 조회 완료'
    // Tier 3: Legal terms / Knowledge base
    case 'search_legal_terms': return '법령용어 검색 완료'
    case 'get_legal_term_kb': return '법령용어 지식베이스 조회 완료'
    case 'get_legal_term_detail': return '법령용어 상세 조회 완료'
    case 'get_daily_term': return '일상용어 검색 완료'
    case 'get_daily_to_legal': return '일상→법률 용어 변환 완료'
    case 'get_legal_to_daily': return '법률→일상 용어 변환 완료'
    case 'get_term_articles': return '용어 관련 조문 조회 완료'
    case 'get_related_laws': return '관련 법령 조회 완료'
    case 'get_law_statistics': return '법령 통계 조회 완료'
    case 'suggest_law_names': return '법령명 자동완성 완료'
    case 'compare_articles': return '조문 비교 완료'
    case 'parse_article_links': return '조문 참조 분석 완료'
    case 'extract_precedent_keywords': return '판례 키워드 추출 완료'
    case 'summarize_precedent': return '판례 요약 완료'
    case 'search_english_law': return '영문 법령 검색 완료'
    case 'get_english_law_text': return '영문 법령 조회 완료'
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
    // Admin rules
    case 'search_admin_rule': return args.query as string
    case 'get_admin_rule': return args.id as string
    // Chain tools
    case 'chain_full_research': return args.query as string
    case 'chain_dispute_prep': return args.query as string
    case 'chain_procedure_detail': return args.query as string
    case 'chain_action_basis': return args.query as string
    case 'chain_law_system': return args.query as string
    case 'chain_amendment_track': return args.query as string
    case 'chain_ordinance_compare': return args.query as string
    // Domain specialists
    case 'search_admin_appeals': return args.query as string
    case 'search_constitutional_decisions': return args.query as string
    case 'search_tax_tribunal_decisions': return args.query as string
    case 'search_customs_interpretations': return args.query as string
    case 'search_ftc_decisions': return args.query as string
    case 'search_pipc_decisions': return args.query as string
    case 'search_nlrc_decisions': return args.query as string
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
 * H-RAG1: BM25 기반 reranker.
 * 기존 keyword-frequency scoring은 긴 조문에 유리하고 짧은 조문을 과소평가.
 * BM25는 문서 길이 정규화를 포함해 법률 도메인에서 더 안정적.
 *
 * 파라미터: k1=1.2, b=0.75 (web search 표준값, 법률 문서에서도 실전 검증된 범위)
 * 법령명에는 x3 가중치, 조문 번호 완전 일치는 별도 large boost.
 */
const BM25_K1 = 1.2
const BM25_B = 0.75

const SUFFIX_STOPWORDS_RE = /(?:은|는|이|가|을|를|에|의|로|으로|와|과|에서|한|하는|대한|대해|인가요|인지|위한|있는|없는|되는|되어|해서|해|줘)$/
const WHOLE_STOPWORDS = new Set(['무엇', '어떤', '어떻게', '것', '및', '또는', '경우', '알려', '설명', '궁금', '내용', '관련'])

function extractKeywords(query: string): string[] {
  return query
    .replace(/[「」]/g, '')
    .split(/\s+/)
    .map(w => w.replace(SUFFIX_STOPWORDS_RE, ''))
    .filter(w => w.length >= 2 && !WHOLE_STOPWORDS.has(w))
}

/** 문서의 term frequency — 법령명/본문 분리 가중치 위해 필드별 카운트 */
interface DocStats {
  firstLine: string
  body: string
  totalLen: number
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let pos = 0
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++
    pos += needle.length
  }
  return count
}

function bm25DocumentFreq(keyword: string, docs: DocStats[]): number {
  let df = 0
  for (const d of docs) if (countOccurrences(d.firstLine + ' ' + d.body, keyword) > 0) df++
  return df
}

function bm25Idf(df: number, N: number): number {
  // Okapi BM25+ IDF: log((N - df + 0.5) / (df + 0.5) + 1)
  return Math.log((N - df + 0.5) / (df + 0.5) + 1)
}

function bm25ScoreDoc(keyword: string, doc: DocStats, idf: number, avgDL: number): number {
  // 법령명(첫 라인) 매칭에는 ×3 가중치 적용 — effective term frequency.
  const tfBody = countOccurrences(doc.body, keyword)
  const tfTitle = countOccurrences(doc.firstLine, keyword)
  const tf = tfBody + tfTitle * 3
  if (tf === 0) return 0
  const numerator = tf * (BM25_K1 + 1)
  const denominator = tf + BM25_K1 * (1 - BM25_B + BM25_B * (doc.totalLen / Math.max(1, avgDL)))
  return idf * (numerator / denominator)
}

export function rerankAiSearchResult(text: string, query: string): string {
  const headerMatch = text.match(/^[^\n]*(?:검색|총)[^\n]*\n/)
  const header = headerMatch ? headerMatch[0] : ''
  const body = headerMatch ? text.slice(header.length) : text

  const blocks = body.split(/(?=📜\s)/).filter(b => b.trim().length > 0)
  if (blocks.length <= 1) return text  // 1건 이하면 재정렬 불필요

  const keywords = extractKeywords(query)

  // 쿼리에서 조문번호 추출 (완전 일치 large boost)
  const queryArticles = new Set(
    Array.from(query.matchAll(/제(\d+)조(?:의(\d+))?/g))
      .map(m => m[2] ? `제${m[1]}조의${m[2]}` : `제${m[1]}조`)
  )

  // 문서 통계 준비
  const docs: DocStats[] = blocks.map(b => {
    const firstLine = b.split('\n')[0] || ''
    return { firstLine, body: b.slice(firstLine.length), totalLen: b.length }
  })
  const N = docs.length
  const avgDL = docs.reduce((s, d) => s + d.totalLen, 0) / N

  // 키워드별 IDF 선계산
  const idfMap = new Map<string, number>()
  for (const kw of keywords) {
    const df = bm25DocumentFreq(kw, docs)
    idfMap.set(kw, bm25Idf(df, N))
  }

  const scored = blocks.map((block, i) => {
    const doc = docs[i]
    let score = 0
    for (const kw of keywords) {
      const idf = idfMap.get(kw) ?? 0
      score += bm25ScoreDoc(kw, doc, idf, avgDL)
    }
    // 조문번호 완전 일치 — BM25와 별개로 절대 우선
    for (const art of queryArticles) {
      if (block.includes(art)) score += 10
    }
    return { block, score }
  })

  scored.sort((a, b) => b.score - a.score)

  // 관련성 없는 노이즈 제거: score > 0 결과가 3건 이상이면 score 0 결과 드롭
  const positiveScored = scored.filter(s => s.score > 0)
  const filtered = positiveScored.length >= 3 ? positiveScored : scored

  return header + filtered.map(s => s.block).join('\n\n')
}
