/**
 * FC-RAG 엔진 공유 인프라
 * 타입, 설정, 유틸리티, 대화 컨텍스트, Fast Path, 질의 분류
 */

import { executeTool } from './tool-adapter'
import { type LegalQueryType } from './prompts'
import { TOOL_DISPLAY_NAMES } from './tool-tiers'
import { cacheMSTEntries, detectFastPath, parseLawEntries, findBestMST } from './fast-path'
import { buildCitations } from './citations'
import { summarizeToolResult } from './result-utils'
import { AI_CONFIG } from '@/lib/ai-config'

// ─── 타입 ───

export type { LegalQueryType } from './prompts'

export type QueryComplexity = 'simple' | 'moderate' | 'complex'

export interface FCRAGCitation {
  lawName: string
  articleNumber: string
  chunkText: string
  source: string
}

export interface FCRAGResult {
  answer: string
  citations: FCRAGCitation[]
  confidenceLevel: 'high' | 'medium' | 'low'
  complexity: QueryComplexity
  queryType: LegalQueryType
  isTruncated?: boolean
  warnings?: string[]
}

export type FCRAGStreamEvent =
  | { type: 'status'; message: string; progress: number }
  | { type: 'tool_call'; name: string; displayName: string; query?: string }
  | { type: 'tool_result'; name: string; displayName: string; success: boolean; summary: string }
  | { type: 'token_usage'; inputTokens: number; outputTokens: number; totalTokens: number }
  | { type: 'answer'; data: FCRAGResult }
  | { type: 'answer_token'; data: { text: string } }
  | { type: 'citation_verification'; citations: Array<{ lawName: string; articleNum: string; text: string; source: string; verified: boolean; verificationMethod: string }> }
  | { type: 'source'; source: 'claude' | 'openclaw' | 'gemini' }
  | { type: 'error'; message: string }

export interface RAGStreamOptions {
  apiKey?: string
  signal?: AbortSignal
  conversationId?: string
  /** 프론트에서 이미 가진 조문 데이터 — 있으면 도구 호출 없이 즉답 */
  preEvidence?: string
}

export interface GeminiPart {
  text?: string
  functionCall?: { name?: string; args?: Record<string, unknown> }
  functionResponse?: { name?: string; response?: { result?: string } }
}

// ─── 설정 ───

export const MODEL = AI_CONFIG.gemini.primary

export const MAX_TOKENS: Record<QueryComplexity, number> = {
  simple: 3072,
  moderate: 4096,
  complex: 6144,
}

/** Gemini API complexity별 타임아웃 (ms) */
export const GEMINI_TIMEOUT: Record<QueryComplexity, number> = {
  simple: 30_000,
  moderate: 45_000,
  complex: 60_000,
}

// ─── 대화 컨텍스트 스토어 (로컬 dev용, Bridge 경로는 서버사이드 세션 사용) ───

interface ConversationEntry { query: string; answer: string }
const conversationStore = new Map<string, ConversationEntry[]>()
const CONV_MAX_ENTRIES = 5
const CONV_MAX_AGE_MS = 30 * 60_000 // 30분
const CONV_MAX_SIZE = 500 // Map 크기 상한 (메모리 보호)
const conversationTimestamps = new Map<string, number>()

// 주기적 TTL 정리 (새 대화 저장이 없어도 메모리 회수)
// P1-AI-1: HMR/멀티 import 방어 — globalThis 가드로 한 번만 등록
const __g = globalThis as unknown as { __lexdiff_conv_cleanup_started__?: boolean }
if (typeof setInterval !== 'undefined' && !__g.__lexdiff_conv_cleanup_started__) {
  __g.__lexdiff_conv_cleanup_started__ = true
  const _convCleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [id, ts] of conversationTimestamps) {
      if (now - ts > CONV_MAX_AGE_MS) {
        conversationStore.delete(id)
        conversationTimestamps.delete(id)
      }
    }
  }, 5 * 60_000) // 5분 간격
  if (typeof _convCleanupTimer === 'object' && 'unref' in _convCleanupTimer) {
    _convCleanupTimer.unref()
  }
}

export function getConversationContext(conversationId?: string): string {
  if (!conversationId) return ''
  const entries = conversationStore.get(conversationId)
  if (!entries?.length) return ''
  const recent = entries.slice(-3)
  return recent.map((e, i) => `[이전 질문 ${i + 1}] ${e.query}\n[이전 답변 ${i + 1}] ${e.answer.slice(0, 500)}`).join('\n\n')
}

export function storeConversation(conversationId: string | undefined, query: string, answer: string) {
  if (!conversationId) return
  const now = Date.now()
  for (const [id, ts] of conversationTimestamps) {
    if (now - ts > CONV_MAX_AGE_MS) {
      conversationStore.delete(id)
      conversationTimestamps.delete(id)
    }
  }
  while (conversationStore.size >= CONV_MAX_SIZE) {
    let oldestId: string | null = null
    let oldestTs = Infinity
    for (const [id, ts] of conversationTimestamps) {
      if (ts < oldestTs) { oldestTs = ts; oldestId = id }
    }
    if (!oldestId) break
    conversationStore.delete(oldestId)
    conversationTimestamps.delete(oldestId)
  }
  const entries = conversationStore.get(conversationId) || []
  entries.push({ query, answer: answer.slice(0, 2000) })
  if (entries.length > CONV_MAX_ENTRIES) entries.shift()
  conversationStore.set(conversationId, entries)
  conversationTimestamps.set(conversationId, now)
}

// ─── 유틸리티 ───

/** Promise에 타임아웃을 적용하는 유틸 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 타임아웃 (${ms}ms)`)), ms)
    promise.then(
      (val) => { clearTimeout(timer); resolve(val) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}

/** Gemini: complexity 기반 최대 도구 턴 수 */
export function getMaxToolTurns(complexity: QueryComplexity): number {
  switch (complexity) {
    case 'simple': return 2
    case 'moderate': return 3
    case 'complex': return 4
  }
}

/** Claude CLI: complexity 기반 max-turns (도구 호출 횟수 제한) */
export function getMaxClaudeTurns(complexity: QueryComplexity): number {
  switch (complexity) {
    case 'simple': return 5
    case 'moderate': return 8
    case 'complex': return 12
  }
}

// ─── Fast Path 공통 (Claude/Gemini 공유) ───

/**
 * Fast Path 처리. 단순 패턴은 LLM 없이 직접 도구 호출.
 * 처리됐으면 true, 아니면 false 반환.
 */
export async function* handleFastPath(
  query: string,
  queryType: LegalQueryType,
  signal?: AbortSignal,
): AsyncGenerator<FCRAGStreamEvent, boolean> {
  const fastPath = detectFastPath(query)
  if (fastPath.type === 'none') return false

  // ── 패턴 A: 판례/해석례/행정규칙 검색 ──
  if (fastPath.type === 'precedent_search' || fastPath.type === 'interpretation_search' || fastPath.type === 'admin_rule_search') {
    const toolName = fastPath.toolName!
    const displayName = TOOL_DISPLAY_NAMES[toolName] || toolName
    yield { type: 'tool_call', name: toolName, displayName, query: fastPath.searchQuery }
    yield { type: 'status', message: '검색 중...', progress: 40 }
    const searchResult = await executeTool(toolName, { query: fastPath.searchQuery }, signal)
    yield { type: 'tool_result', name: toolName, displayName, success: !searchResult.isError, summary: summarizeToolResult(toolName, searchResult) }
    if (!searchResult.isError) {
      yield { type: 'status', message: '완료', progress: 100 }
      yield {
        type: 'answer',
        data: {
          answer: searchResult.result,
          citations: buildCitations([searchResult]),
          confidenceLevel: 'medium',
          complexity: 'simple',
          queryType,
        },
      }
      return true
    }
  }

  // ── 패턴 B: 별표 조회 ──
  if (fastPath.type === 'annex_resolve') {
    let mst = fastPath.mst
    if (!mst) {
      yield { type: 'tool_call', name: 'search_law', displayName: '법령 검색', query: fastPath.lawName }
      const searchResult = await executeTool('search_law', { query: fastPath.lawName }, signal)
      if (!searchResult.isError) {
        yield { type: 'tool_result', name: 'search_law', displayName: '법령 검색', success: true, summary: summarizeToolResult('search_law', searchResult) }
        const entries = parseLawEntries(searchResult.result)
        cacheMSTEntries(entries)
        mst = findBestMST(entries, query) || undefined
      }
    }
    if (mst) {
      yield { type: 'tool_call', name: 'get_annexes', displayName: '별표/서식 조회', query: fastPath.searchQuery }
      yield { type: 'status', message: '별표를 조회하고 있습니다...', progress: 50 }
      const annexResult = await executeTool('get_annexes', { lawName: fastPath.searchQuery }, signal)
      yield { type: 'tool_result', name: 'get_annexes', displayName: '별표/서식 조회', success: !annexResult.isError, summary: summarizeToolResult('get_annexes', annexResult) }
      if (!annexResult.isError) {
        yield { type: 'status', message: '완료', progress: 100 }
        yield {
          type: 'answer',
          data: {
            answer: annexResult.result,
            citations: buildCitations([annexResult]),
            confidenceLevel: 'high',
            complexity: 'simple',
            queryType,
          },
        }
        return true
      }
    }
  }

  // ── 패턴 C: 법명+조문번호 ──
  if (fastPath.type === 'article_hit' || fastPath.type === 'article_resolve') {
    let mst = fastPath.mst
    const articles = fastPath.articles!

    if (fastPath.type === 'article_resolve') {
      yield { type: 'tool_call', name: 'search_law', displayName: '법령 검색', query: fastPath.lawName }
      yield { type: 'status', message: `${fastPath.lawName} MST 확인 중...`, progress: 20 }
      const searchResult = await executeTool('search_law', { query: fastPath.lawName }, signal)
      if (searchResult.isError) {
        yield { type: 'tool_result', name: 'search_law', displayName: '법령 검색', success: false, summary: '검색 실패' }
      } else {
        yield { type: 'tool_result', name: 'search_law', displayName: '법령 검색', success: true, summary: summarizeToolResult('search_law', searchResult) }
        const entries = parseLawEntries(searchResult.result)
        cacheMSTEntries(entries)
        mst = findBestMST(entries, query) || undefined
      }
    }

    if (mst) {
      yield { type: 'tool_call', name: 'get_batch_articles', displayName: '조문 일괄 조회', query: articles.join(', ') }
      yield { type: 'status', message: '조문을 가져오고 있습니다...', progress: 50 }
      const articlesResult = await executeTool('get_batch_articles', { mst, articles }, signal)
      yield {
        type: 'tool_result', name: 'get_batch_articles', displayName: '조문 일괄 조회',
        success: !articlesResult.isError, summary: summarizeToolResult('get_batch_articles', articlesResult),
      }

      if (!articlesResult.isError) {
        yield { type: 'status', message: '완료', progress: 100 }
        yield {
          type: 'answer',
          data: {
            answer: articlesResult.result,
            citations: buildCitations([articlesResult]),
            confidenceLevel: 'high',
            complexity: 'simple',
            queryType,
          },
        }
        return true
      }
    }
  }

  // fast path 실패 → full pipeline으로 진행
  return false
}

// ─── 질의 분류 ───

export function inferComplexity(query: string): QueryComplexity {
  const lawMatches = query.match(/「([^」]+)」/g) || []
  const articleMatches = query.match(/제\d+조(?:의\d+)?/g) || []

  const complexPatterns = /(?:하고|와\s*함께|판례|전후\s*비교|비교해|변경.{0,5}판례|개정.{0,5}판례)/
  const moderatePatterns = /(?:위임|시행령|시행규칙|해석례|유권해석|이력|변경|개정|바뀐|신구|대조|절차|방법|벌칙|처벌|과태료|벌금|영업정지|허가취소|감면|면제|비과세|특례|요건)/

  const sourceTypes = [
    /판례|판결/.test(query),
    /해석례|유권해석|질의회신/.test(query),
    /별표|서식|부표/.test(query),
    /조례|자치법규/.test(query),
    /비교|대조|신구/.test(query),
  ].filter(Boolean).length

  if (lawMatches.length > 1 || articleMatches.length > 2 || query.length > 100
    || complexPatterns.test(query) || sourceTypes >= 2) {
    return 'complex'
  }
  if (query.length > 50 || articleMatches.length > 0 || moderatePatterns.test(query) || sourceTypes >= 1) {
    return 'moderate'
  }
  return 'simple'
}

/** @internal 테스트용 export */
export function inferQueryType(query: string): LegalQueryType {
  // ── 복합 의도 사전 감지 (순차 매칭 전 오버라이드) ──
  if (/(?:차이|비교|vs|대비|장단점|구분|구별)/.test(query) && /(?:처벌|벌금|과태료|제재|형사|행정처분)/.test(query)) return 'comparison'
  if (/(?:과태료|벌금|범칙금|과징금).{0,8}(?:얼마|금액|한도|상한|세율|별표|기준액)/.test(query)) return 'scope'
  if (/(?:얼마|금액|한도|상한|세율|별표|기준액).{0,8}(?:과태료|벌금|범칙금|과징금)/.test(query)) return 'scope'
  if (/(?:수당|사례금|강의료|보상비|급여).{0,8}(?:얼마|금액|한도|상한|기준액|별표)/.test(query)) return 'scope'
  if (/(?:얼마|금액|한도|상한|기준액|별표).{0,8}(?:수당|사례금|강의료|보상비|급여)/.test(query)) return 'scope'

  const patterns: [RegExp, LegalQueryType][] = [
    [/(?:면제|감면|특례|예외|비과세|영세율|감경)/,                     'exemption'],
    [/(?:벌칙|과태료|처벌|위반|제재|벌금|징역|형사|영업정지|허가취소|과징금|불이익)/, 'consequence'],
    [/(?:절차|방법|신청|신고|등록|제출|처리|납부|환급|경정청구|어떻게|순서|과정|단계)/, 'procedure'],
    [/(?:비교|차이|구별|구분|다른\s*점|vs|대비|장단점)/,               'comparison'],
    [/(?:요건|조건|자격|충족|해당.*경우|갖추|필요.*서류|하려면)/,        'requirement'],
    [/(?:범위|적용.*범위|해당.*대상|포함|제외.*범위|얼마|세율|금액|기한|산정|계산|수당|사례금|강의료|한도|상한|기준액)/, 'scope'],
    [/(?:정의|뜻|의미|개념|무엇|이란\??$)/,                           'definition'],
    [/(?:적용|해당|판단|가능|여부|할\s*수)/,                          'application'],
    [/(?:알려|궁금|설명|내용|전반|개요|현황|주요|핵심|요약|정리)/,       'definition'],
  ]
  for (const [pattern, type] of patterns) {
    if (pattern.test(query)) return type
  }
  return 'application'
}
