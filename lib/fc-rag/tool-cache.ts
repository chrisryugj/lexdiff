/**
 * FC-RAG 도구 결과 캐시 및 압축 유틸
 */

import { isDecisionTool, getDomainTTL, getDomainSizeLimit } from './decision-domains'

// ─── 캐시 인프라 ───

export interface CacheEntry {
  result: { name: string; result: string; isError: boolean }
  expiry: number
}

export const apiCache = new Map<string, CacheEntry>()

export const CACHE_TTL: Record<string, number> = {
  // 조회 결과 (24시간)
  get_law_text: 24 * 3600_000,
  get_batch_articles: 24 * 3600_000,
  get_article_detail: 24 * 3600_000,
  get_ordinance: 24 * 3600_000,
  get_three_tier: 24 * 3600_000,
  compare_old_new: 24 * 3600_000,
  get_article_history: 24 * 3600_000,
  get_annexes: 24 * 3600_000,
  get_law_tree: 24 * 3600_000,
  get_article_with_precedents: 12 * 3600_000,
  get_admin_rule: 24 * 3600_000,
  // 검색 결과 (6-12시간)
  search_law: 6 * 3600_000,
  search_ordinance: 12 * 3600_000,
  search_ai_law: 12 * 3600_000,
  advanced_search: 6 * 3600_000,
  search_all: 6 * 3600_000,
  find_similar_precedents: 12 * 3600_000,
  search_admin_rule: 6 * 3600_000,
  get_law_history: 12 * 3600_000,
  // Chain tools
  chain_full_research: 6 * 3600_000,
  chain_dispute_prep: 6 * 3600_000,
  chain_procedure_detail: 6 * 3600_000,
  chain_action_basis: 6 * 3600_000,
  chain_law_system: 6 * 3600_000,
  chain_amendment_track: 6 * 3600_000,
  chain_ordinance_compare: 6 * 3600_000,
  // Structural / Historical
  get_law_system_tree: 24 * 3600_000,
  get_external_links: 24 * 3600_000,
  search_historical_law: 12 * 3600_000,
  get_historical_law: 24 * 3600_000,
  // Legal terms / Knowledge base
  search_legal_terms: 12 * 3600_000,
  get_legal_term_kb: 12 * 3600_000,
  get_legal_term_detail: 24 * 3600_000,
  get_daily_term: 12 * 3600_000,
  get_daily_to_legal: 24 * 3600_000,
  get_legal_to_daily: 24 * 3600_000,
  get_term_articles: 12 * 3600_000,
  get_related_laws: 12 * 3600_000,
  get_law_statistics: 6 * 3600_000,
  suggest_law_names: 6 * 3600_000,
  // Compare / Parser / Precedent / English
  compare_articles: 24 * 3600_000,
  parse_article_links: 24 * 3600_000,
  extract_precedent_keywords: 24 * 3600_000,
  summarize_precedent: 24 * 3600_000,
  search_english_law: 12 * 3600_000,
  get_english_law_text: 24 * 3600_000,
  // Easy Law
  get_life_law_categories: 24 * 3600_000,
  get_life_law_detail: 24 * 3600_000,
  get_life_law_faq: 24 * 3600_000,
  search_life_law_content: 6 * 3600_000,
  // Utils
  parse_jo_code: 24 * 3600_000,
}

const CACHE_MAX_SIZE = 2000

/**
 * 도구 이름 + 인자로부터 TTL 결정. unified-decisions 는 도메인별 TTL 사용,
 * 나머지는 CACHE_TTL 테이블 폴백. 등록 안 된 도구는 undefined → 캐시 미사용.
 */
export function getToolTTL(name: string, args?: unknown): number | undefined {
  if (isDecisionTool(name)) {
    const ttl = getDomainTTL(name, args)
    if (ttl != null) return ttl
  }
  return CACHE_TTL[name]
}

export function evictOldest() {
  while (apiCache.size > CACHE_MAX_SIZE) {
    let oldestKey: string | null = null
    let oldestExpiry = Infinity
    for (const [key, entry] of apiCache) {
      if (entry.expiry < oldestExpiry) {
        oldestExpiry = entry.expiry
        oldestKey = key
      }
    }
    if (!oldestKey) break
    apiCache.delete(oldestKey)
  }
}

/** 중첩 객체까지 키 순서를 안정적으로 직렬화 */
export function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj)
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']'
  const sorted = Object.keys(obj as Record<string, unknown>).sort()
  return '{' + sorted.map(k => JSON.stringify(k) + ':' + stableStringify((obj as Record<string, unknown>)[k])).join(',') + '}'
}

// ─── 결과 절삭/압축 ───

/** 도구별 컨텍스트 절삭 한도 */
const TOOL_RESULT_LIMITS: Record<string, number> = {
  get_batch_articles: 10000,
  get_law_text: 8000,
  get_article_detail: 6000,
  get_ordinance: 8000,
  get_article_with_precedents: 10000,
  get_admin_rule: 8000,
  search_ai_law: 6000,
  get_three_tier: 6000,
  compare_old_new: 6000,
  get_article_history: 4000,
  get_law_tree: 4000,
  get_annexes: 6000,
  get_law_history: 4000,
  chain_full_research: 12000,
  chain_dispute_prep: 10000,
  chain_procedure_detail: 10000,
  chain_action_basis: 10000,
  chain_law_system: 8000,
  chain_amendment_track: 8000,
  chain_ordinance_compare: 8000,
}
const DEFAULT_RESULT_LIMIT = 3000

export function truncateForContext(text: string, toolName?: string, args?: unknown): string {
  let limit: number | undefined
  if (toolName && isDecisionTool(toolName)) {
    limit = getDomainSizeLimit(toolName, args) ?? undefined
  }
  if (limit == null && toolName) limit = TOOL_RESULT_LIMITS[toolName]
  if (limit == null) limit = DEFAULT_RESULT_LIMIT
  if (text.length <= limit) return text
  return text.slice(0, limit) + '\n\n... (결과가 너무 길어 일부만 표시)'
}

export function compressSearchResult(text: string): string {
  const headerMatch = text.match(/^검색 결과 \(총 \d+건\):/)
  const header = headerMatch ? headerMatch[0] + '\n\n' : ''

  const entries: string[] = []
  const regex = /(\d+)\.\s+(.+?)\n\s+- 법령ID:\s*\S+\n\s+- MST:\s*(\d+)\n\s+- 공포일:\s*\S+\n\s+- 구분:\s*(\S+)/g
  let m
  while ((m = regex.exec(text)) !== null) {
    entries.push(`${m[1]}. ${m[2].trim()} (MST:${m[3]}, ${m[4]})`)
  }

  if (entries.length === 0) return text
  return header + entries.join('\n')
}

const TOP_AI_RESULTS = 7
const MAX_ARTICLE_CHARS = 600

export function compressAiSearchResult(text: string): string {
  const headerMatch = text.match(/^[^\n]*검색[^\n]*\n/)
  const header = headerMatch ? headerMatch[0] : ''
  const body = headerMatch ? text.slice(header.length) : text

  const blocks = body.split(/(?=📜\s)/).filter(b => b.trim().length > 0)
  if (blocks.length === 0) return text

  const topBlocks = blocks.slice(0, TOP_AI_RESULTS)
  const compressed = topBlocks.map(block => {
    if (block.length <= MAX_ARTICLE_CHARS) return block.trim()
    return block.slice(0, MAX_ARTICLE_CHARS).trim() + '\n  ...(이하 생략)'
  })

  const kept = compressed.length
  const total = blocks.length
  const suffix = total > kept ? `\n\n(총 ${total}건 중 상위 ${kept}건 표시)` : ''
  return header + compressed.join('\n\n') + suffix
}

export function isEmptySearchResult(text: string): boolean {
  if (!text || text.trim().length === 0) return true
  if (/검색 결과가 없|결과 없음|0건|데이터가 없|찾을 수 없/.test(text)) return true
  if (/총 0건/.test(text)) return true
  return false
}
