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

// ─── 결정문 전문(판례/해석례 등) 섹션 기반 압축 ───
//
// korean-law-mcp 의 getPrecedentText 등은 고정된 섹션 헤더로 포맷됨:
//   === {판례명} ===
//   기본 정보: ...
//   판시사항: ...       ← 🔴 절대 자르지 않음 (대법원 공식 요약)
//   판결요지: ...       ← 🔴 절대 자르지 않음 (공식 syllabus)
//   참조조문: ...       ← 유지 (짧음)
//   참조판례: ...       ← 길면 자연 경계에서 자름
//   전문: ...           ← 자연 경계에서 자름 (판시사항 존재 여부에 따라 길이 조절)
//
// 🛡️ 할루시네이션 방지 원칙:
//   1. 문장 중간에서 절대 자르지 않음 — 단락(\n\n) → 문장 끝(다.) → 줄바꿈 순으로
//      자연 경계 찾아서 그 전에서 자름.
//   2. 판시사항/판결요지는 이미 대법원이 확정한 공식 요약 → 절대 손대지 않음.
//   3. 전문 자를 때 **명시적 truncation 마커** 삽입 → LLM이 "여기 뒤 내용은
//      확인 불가, 인용 금지"를 인지하도록 유도.
//   4. 판시사항이 존재하면 전문은 짧게(보조용), 없으면 더 길게 유지.

const DECISION_FULLTEXT_WITH_HEADNOTE = 1200   // 판시사항 있으면 전문은 짧게
const DECISION_FULLTEXT_NO_HEADNOTE = 3000     // 판시사항 없으면 전문을 길게 유지
const DECISION_REFCASE_KEEP = 500              // 참조판례는 짧게

/**
 * 자연 경계에서 자르기. target 이하 길이로 자르되, 문장/단락 중간을 피함.
 * 우선순위: 단락 경계(\n\n) > 문장 끝(다./요./임.) > 줄바꿈 > 하드 컷(최후수단)
 * 경계를 target의 60% 이전에서도 못 찾으면 할루시네이션 위험 회피 위해 하드 컷.
 */
function cutAtNaturalBoundary(text: string, target: number): string {
  if (text.length <= target) return text
  const minAcceptable = Math.floor(target * 0.6)  // 너무 일찍 자르면 내용 부족
  const window = text.slice(0, target)

  // 1. 단락 경계 (\n\n) — 가장 안전
  const paraIdx = window.lastIndexOf('\n\n')
  if (paraIdx >= minAcceptable) return text.slice(0, paraIdx)

  // 2. 한국어 문장 끝 패턴 — "~다." 뒤 공백/줄바꿈
  const sentRegex = /(?:다|요|임|함|음)\.(?:\s|$)/g
  let lastSentEnd = -1
  let sm: RegExpExecArray | null
  while ((sm = sentRegex.exec(window)) !== null) {
    lastSentEnd = sm.index + sm[0].length
  }
  if (lastSentEnd >= minAcceptable) return text.slice(0, lastSentEnd).trimEnd()

  // 3. 줄바꿈
  const nlIdx = window.lastIndexOf('\n')
  if (nlIdx >= minAcceptable) return text.slice(0, nlIdx)

  // 4. 마침표 단독
  const dotIdx = window.lastIndexOf('. ')
  if (dotIdx >= minAcceptable) return text.slice(0, dotIdx + 1)

  // 5. 최후수단 — 하드 컷 (자연 경계 탐색 모두 실패)
  return text.slice(0, target)
}

const TRUNCATION_MARKER = '\n\n⚠️ [이후 생략 — 이 뒤 내용은 LLM에 전달되지 않음. 인용 시 위 내용만 사용]'

/**
 * 판례/해석례 상세 결과를 섹션 인식 + 자연 경계 기반으로 압축.
 * 이미 TOOL_RESULT_LIMITS 로 1차 head-truncation 된 텍스트를 추가 압축.
 * 섹션 마커를 찾지 못하면 원본 반환 (안전).
 */
export function compressDecisionText(text: string): string {
  // 섹션 마커가 하나도 없으면 포맷을 모르는 것 → 건드리지 않음
  if (!/(?:판시사항|판결요지|전문|판례내용):/.test(text)) return text

  const sectionRegex = /\n(기본 정보|판시사항|판결요지|참조조문|참조판례|전문|판례내용):\n/g
  const matches: Array<{ name: string; idx: number; headerEnd: number }> = []
  let m: RegExpExecArray | null
  while ((m = sectionRegex.exec(text)) !== null) {
    matches.push({ name: m[1], idx: m.index + 1, headerEnd: sectionRegex.lastIndex })
  }
  if (matches.length === 0) return text

  // 판시사항/판결요지 존재 여부 — 존재하면 전문은 짧게 (판시사항이 이미 공식 요약)
  const hasHeadnote = matches.some(m => m.name === '판시사항' || m.name === '판결요지')
  const fulltextKeep = hasHeadnote ? DECISION_FULLTEXT_WITH_HEADNOTE : DECISION_FULLTEXT_NO_HEADNOTE

  // 헤더(=== 판례명 ===) + matches 이전 prelude 보존
  const prelude = text.slice(0, matches[0].idx).trimEnd()

  const parts: string[] = [prelude]
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]
    const next = matches[i + 1]
    const rawBody = text.slice(cur.headerEnd, next ? next.idx : text.length).trimEnd()

    let body = rawBody
    // 🔴 판시사항/판결요지/기본정보/참조조문은 절대 자르지 않음 (공식 요약 or 짧음)
    if (cur.name === '전문' || cur.name === '판례내용') {
      if (rawBody.length > fulltextKeep) {
        body = cutAtNaturalBoundary(rawBody, fulltextKeep) + TRUNCATION_MARKER
      }
    } else if (cur.name === '참조판례') {
      if (rawBody.length > DECISION_REFCASE_KEEP) {
        body = cutAtNaturalBoundary(rawBody, DECISION_REFCASE_KEEP) + '\n... (참조판례 일부 생략)'
      }
    }
    parts.push(`\n${cur.name}:\n${body}`)
  }
  return parts.join('\n').replace(/\n{3,}/g, '\n\n')
}

export function isEmptySearchResult(text: string): boolean {
  if (!text || text.trim().length === 0) return true
  if (/검색 결과가 없|결과 없음|0건|데이터가 없|찾을 수 없/.test(text)) return true
  if (/총 0건/.test(text)) return true
  return false
}
