/**
 * korean-law-mcp 도구 → LLM Function Calling 어댑터
 *
 * korean-law-mcp의 개별 도구를 직접 import하여
 * FunctionDeclaration으로 변환 + 실행하는 얇은 브릿지 레이어.
 *
 * ── LLM 구성 ──
 * Primary : Sonnet 4.6 (Claude) — OpenClaw Bridge 경유
 * Fallback: Gemini Flash — Bridge 불능 시 engine.ts에서 직접 호출
 *
 * 도구 스키마/핸들러는 양쪽 LLM이 공유.
 */

import { LawApiClient } from 'korean-law-mcp/build/lib/api-client.js'
import { zodToJsonSchema } from 'zod-to-json-schema'

// ── Tier 0: Core search & retrieval ──
import { searchLaw, SearchLawSchema } from 'korean-law-mcp/build/tools/search.js'
import { getLawText, GetLawTextSchema } from 'korean-law-mcp/build/tools/law-text.js'
import { searchPrecedents, searchPrecedentsSchema, getPrecedentText, getPrecedentTextSchema } from 'korean-law-mcp/build/tools/precedents.js'
import { searchInterpretations, searchInterpretationsSchema, getInterpretationText, getInterpretationTextSchema } from 'korean-law-mcp/build/tools/interpretations.js'
import { searchAiLaw, searchAiLawSchema } from 'korean-law-mcp/build/tools/life-law.js'
import { getBatchArticles, GetBatchArticlesSchema } from 'korean-law-mcp/build/tools/batch-articles.js'

// ── Tier 1-2: Comparison / Structure / History ──
import { getThreeTier, GetThreeTierSchema } from 'korean-law-mcp/build/tools/three-tier.js'
import { compareOldNew, CompareOldNewSchema } from 'korean-law-mcp/build/tools/comparison.js'
import { getArticleHistory, ArticleHistorySchema } from 'korean-law-mcp/build/tools/article-history.js'
import { searchOrdinance, SearchOrdinanceSchema } from 'korean-law-mcp/build/tools/ordinance-search.js'
import { getOrdinance, GetOrdinanceSchema } from 'korean-law-mcp/build/tools/ordinance.js'
import { advancedSearch, AdvancedSearchSchema } from 'korean-law-mcp/build/tools/advanced-search.js'
import { getAnnexes, GetAnnexesSchema } from 'korean-law-mcp/build/tools/annex.js'
import { findSimilarPrecedents, FindSimilarPrecedentsSchema } from 'korean-law-mcp/build/tools/similar-precedents.js'
import { getLawTree, GetLawTreeSchema } from 'korean-law-mcp/build/tools/law-tree.js'
import { searchAll, SearchAllSchema } from 'korean-law-mcp/build/tools/search-all.js'

// ── Composite: 조문+판례 동시 조회 ──
import { getArticleWithPrecedents, GetArticleWithPrecedentsSchema } from 'korean-law-mcp/build/tools/article-with-precedents.js'

// ── Admin rules (행정규칙: 훈령/예규/고시) ──
import { searchAdminRule, SearchAdminRuleSchema, getAdminRule, GetAdminRuleSchema } from 'korean-law-mcp/build/tools/admin-rule.js'

// ── Chain tools (multi-step macros — 내부에서 여러 도구 자동 연쇄, 턴 수 절감) ──
import {
  chainFullResearch, chainFullResearchSchema,
  chainDisputePrep, chainDisputePrepSchema,
  chainProcedureDetail, chainProcedureDetailSchema,
  chainActionBasis, chainActionBasisSchema,
  chainLawSystem, chainLawSystemSchema,
  chainAmendmentTrack, chainAmendmentTrackSchema,
  chainOrdinanceCompare, chainOrdinanceCompareSchema,
} from 'korean-law-mcp/build/tools/chains.js'

// ── Domain specialist tools ──
import { searchAdminAppeals, searchAdminAppealsSchema, getAdminAppealText, getAdminAppealTextSchema } from 'korean-law-mcp/build/tools/admin-appeals.js'
import { searchConstitutionalDecisions, searchConstitutionalDecisionsSchema, getConstitutionalDecisionText, getConstitutionalDecisionTextSchema } from 'korean-law-mcp/build/tools/constitutional-decisions.js'
import { searchTaxTribunalDecisions, searchTaxTribunalDecisionsSchema, getTaxTribunalDecisionText, getTaxTribunalDecisionTextSchema } from 'korean-law-mcp/build/tools/tax-tribunal-decisions.js'
import { searchCustomsInterpretations, searchCustomsInterpretationsSchema, getCustomsInterpretationText, getCustomsInterpretationTextSchema } from 'korean-law-mcp/build/tools/customs-interpretations.js'
import {
  searchFtcDecisions, searchFtcDecisionsSchema, getFtcDecisionText, getFtcDecisionTextSchema,
  searchPipcDecisions, searchPipcDecisionsSchema, getPipcDecisionText, getPipcDecisionTextSchema,
  searchNlrcDecisions, searchNlrcDecisionsSchema, getNlrcDecisionText, getNlrcDecisionTextSchema,
} from 'korean-law-mcp/build/tools/committee-decisions.js'

// ── Historical ──
import { getLawHistory, LawHistorySchema } from 'korean-law-mcp/build/tools/law-history.js'

import type { FunctionDeclaration } from '@google/genai'

// ─── API 클라이언트 (모듈 레벨 싱글턴) ───

const LAW_OC = process.env.LAW_OC
if (!LAW_OC) {
  console.warn('[FC-RAG] LAW_OC 환경 변수가 설정되지 않았습니다.')
}
const apiClient = new LawApiClient({ apiKey: LAW_OC || '' })

// ─── API 결과 캐시 ───

interface CacheEntry {
  result: ToolCallResult
  expiry: number
}

const apiCache = new Map<string, CacheEntry>()

const CACHE_TTL: Record<string, number> = {
  // 조회 결과 (24시간)
  get_law_text: 24 * 3600_000,
  get_batch_articles: 24 * 3600_000,
  get_precedent_text: 24 * 3600_000,
  get_interpretation_text: 24 * 3600_000,
  get_ordinance: 24 * 3600_000,
  get_three_tier: 24 * 3600_000,
  compare_old_new: 24 * 3600_000,
  get_article_history: 24 * 3600_000,
  get_annexes: 24 * 3600_000,
  get_law_tree: 24 * 3600_000,
  get_article_with_precedents: 12 * 3600_000,
  get_admin_rule: 24 * 3600_000,
  get_admin_appeal_text: 24 * 3600_000,
  get_constitutional_decision_text: 24 * 3600_000,
  get_tax_tribunal_decision_text: 24 * 3600_000,
  get_customs_interpretation_text: 24 * 3600_000,
  get_ftc_decision_text: 24 * 3600_000,
  get_pipc_decision_text: 24 * 3600_000,
  get_nlrc_decision_text: 24 * 3600_000,
  // 검색 결과 (6-12시간)
  search_law: 6 * 3600_000,
  search_precedents: 12 * 3600_000,
  search_interpretations: 12 * 3600_000,
  search_ordinance: 12 * 3600_000,
  search_ai_law: 3 * 3600_000,
  advanced_search: 6 * 3600_000,
  search_all: 6 * 3600_000,
  find_similar_precedents: 12 * 3600_000,
  search_admin_rule: 6 * 3600_000,
  search_admin_appeals: 12 * 3600_000,
  search_constitutional_decisions: 12 * 3600_000,
  search_tax_tribunal_decisions: 12 * 3600_000,
  search_customs_interpretations: 12 * 3600_000,
  search_ftc_decisions: 12 * 3600_000,
  search_pipc_decisions: 12 * 3600_000,
  search_nlrc_decisions: 12 * 3600_000,
  get_law_history: 12 * 3600_000,
  // Chain tools (집계 결과, moderate TTL)
  chain_full_research: 6 * 3600_000,
  chain_dispute_prep: 6 * 3600_000,
  chain_procedure_detail: 6 * 3600_000,
  chain_action_basis: 6 * 3600_000,
  chain_law_system: 6 * 3600_000,
  chain_amendment_track: 6 * 3600_000,
  chain_ordinance_compare: 6 * 3600_000,
}

const CACHE_MAX_SIZE = 2000

function evictOldest() {
  if (apiCache.size <= CACHE_MAX_SIZE) return
  let oldestKey: string | null = null
  let oldestExpiry = Infinity
  for (const [key, entry] of apiCache) {
    if (entry.expiry < oldestExpiry) {
      oldestExpiry = entry.expiry
      oldestKey = key
    }
  }
  if (oldestKey) apiCache.delete(oldestKey)
}

function stableStringify(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort())
}

// ─── 도구 정의 ───

interface ToolDef {
  name: string
  description: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: { parse: (data: unknown) => any; [key: string]: any }
  handler: (client: LawApiClient, input: any) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>
}

/**
 * 등록된 전체 도구 목록.
 * selectToolsForQuery()가 쿼리별로 필터링하여 LLM에 필요한 것만 전달.
 *
 * Description은 토큰 절약을 위해 압축 (40자 내외).
 */
const TOOLS: ToolDef[] = [
  // ══════════════════════════════════════
  // Core search (의미검색/키워드검색)
  // ══════════════════════════════════════
  {
    name: 'search_ai_law',
    description: '자연어로 관련 조문 의미검색. 법령명 몰라도 사용 가능. search: 0=법령(기본), 2=행정규칙.',
    schema: searchAiLawSchema,
    handler: searchAiLaw,
  },
  {
    name: 'search_law',
    description: '법령명 키워드검색. 약칭 자동인식. MST 확인용.',
    schema: SearchLawSchema,
    handler: searchLaw,
  },
  {
    name: 'search_all',
    description: '법령+판례+해석례+행정규칙 통합검색. 도메인 불명확 시.',
    schema: SearchAllSchema,
    handler: searchAll,
  },

  // ══════════════════════════════════════
  // Core retrieval (조문/판례/해석례 조회)
  // ══════════════════════════════════════
  {
    name: 'get_law_text',
    description: '법령 조문 조회. mst+jo 지정. jo 없으면 전문.',
    schema: GetLawTextSchema,
    handler: getLawText,
  },
  {
    name: 'get_batch_articles',
    description: '여러 조문 일괄 조회. mst+articles 배열.',
    schema: GetBatchArticlesSchema,
    handler: getBatchArticles,
  },
  {
    name: 'get_article_with_precedents',
    description: '조문+관련판례 한번에 조회. mst/lawId+jo.',
    schema: GetArticleWithPrecedentsSchema,
    handler: getArticleWithPrecedents,
  },
  {
    name: 'search_precedents',
    description: '판례 키워드검색. 결과에 id 포함.',
    schema: searchPrecedentsSchema,
    handler: searchPrecedents,
  },
  {
    name: 'get_precedent_text',
    description: '판례 전문 조회. id 필요.',
    schema: getPrecedentTextSchema,
    handler: getPrecedentText,
  },
  {
    name: 'search_interpretations',
    description: '법령해석례 키워드검색. 결과에 id 포함.',
    schema: searchInterpretationsSchema,
    handler: searchInterpretations,
  },
  {
    name: 'get_interpretation_text',
    description: '해석례 전문 조회. id 필요.',
    schema: getInterpretationTextSchema,
    handler: getInterpretationText,
  },

  // ══════════════════════════════════════
  // Structure / Comparison / History
  // ══════════════════════════════════════
  {
    name: 'get_three_tier',
    description: '법률→시행령→시행규칙 3단비교. mst+knd.',
    schema: GetThreeTierSchema,
    handler: getThreeTier,
  },
  {
    name: 'compare_old_new',
    description: '신구법 대조표(개정 전후 비교). mst 필요.',
    schema: CompareOldNewSchema,
    handler: compareOldNew,
  },
  {
    name: 'get_article_history',
    description: '조문별 개정 이력 조회. lawId+jo.',
    schema: ArticleHistorySchema,
    handler: getArticleHistory,
  },
  {
    name: 'get_law_history',
    description: '법령 연혁(개정 이력 목록). 날짜별 변경 확인.',
    schema: LawHistorySchema,
    handler: getLawHistory,
  },

  // ══════════════════════════════════════
  // Ordinance (자치법규/조례)
  // ══════════════════════════════════════
  {
    name: 'search_ordinance',
    description: '자치법규(조례) 검색. 지역명 포함 필수.',
    schema: SearchOrdinanceSchema,
    handler: searchOrdinance,
  },
  {
    name: 'get_ordinance',
    description: '자치법규 전문 조회. ordinSeq 필요.',
    schema: GetOrdinanceSchema,
    handler: getOrdinance,
  },

  // ══════════════════════════════════════
  // Admin rules (행정규칙: 훈령/예규/고시)
  // ══════════════════════════════════════
  {
    name: 'search_admin_rule',
    description: '행정규칙(훈령/예규/고시) 검색. 결과에 id 포함.',
    schema: SearchAdminRuleSchema,
    handler: searchAdminRule,
  },
  {
    name: 'get_admin_rule',
    description: '행정규칙 전문 조회. id 필요.',
    schema: GetAdminRuleSchema,
    handler: getAdminRule,
  },

  // ══════════════════════════════════════
  // Advanced / Auxiliary
  // ══════════════════════════════════════
  {
    name: 'advanced_search',
    description: '고급 법령검색. 법령종류/부처/시행일 필터.',
    schema: AdvancedSearchSchema,
    handler: advancedSearch,
  },
  {
    name: 'get_annexes',
    description: '별표/서식 조회. 금액/기준은 별표에 있는 경우 많음.',
    schema: GetAnnexesSchema,
    handler: getAnnexes,
  },
  {
    name: 'find_similar_precedents',
    description: '유사 판례 검색. 판례 id 입력.',
    schema: FindSimilarPrecedentsSchema,
    handler: findSimilarPrecedents,
  },
  {
    name: 'get_law_tree',
    description: '법령 체계도(목차) 조회. mst 필요.',
    schema: GetLawTreeSchema,
    handler: getLawTree,
  },

  // ══════════════════════════════════════
  // ⛓️ Chain tools (multi-step macros)
  // 내부에서 여러 도구를 자동 연쇄/병렬 호출.
  // LLM 턴 수를 대폭 줄여 시간·토큰 절감.
  // ══════════════════════════════════════
  {
    name: 'chain_full_research',
    description: '⛓️ 종합 리서치. AI검색+법령+판례+해석례 병렬 수집. 복합 질문 시 1턴에 전체 자료 확보.',
    schema: chainFullResearchSchema,
    handler: chainFullResearch,
  },
  {
    name: 'chain_dispute_prep',
    description: '⛓️ 쟁송 대비. 판례+행정심판+도메인별 결정례 병렬. 불복/소송 질문 시.',
    schema: chainDisputePrepSchema,
    handler: chainDisputePrep,
  },
  {
    name: 'chain_procedure_detail',
    description: '⛓️ 절차/비용. 법령+3단비교+별표/서식 자동 연쇄. 신청/절차 질문 시.',
    schema: chainProcedureDetailSchema,
    handler: chainProcedureDetail,
  },
  {
    name: 'chain_action_basis',
    description: '⛓️ 처분근거. 3단비교+해석례+판례+행정심판 병렬. 허가/처분 질문 시.',
    schema: chainActionBasisSchema,
    handler: chainActionBasis,
  },
  {
    name: 'chain_law_system',
    description: '⛓️ 법체계 파악. 법령검색+3단비교+조문+별표 연쇄. 법 구조 질문 시.',
    schema: chainLawSystemSchema,
    handler: chainLawSystem,
  },
  {
    name: 'chain_amendment_track',
    description: '⛓️ 개정 추적. 신구대조+조문이력 연쇄. 개정/변경 질문 시.',
    schema: chainAmendmentTrackSchema,
    handler: chainAmendmentTrack,
  },
  {
    name: 'chain_ordinance_compare',
    description: '⛓️ 조례 비교. 상위법령+위임체계+전국 조례검색. 자치법규 질문 시.',
    schema: chainOrdinanceCompareSchema,
    handler: chainOrdinanceCompare,
  },

  // ══════════════════════════════════════
  // Domain specialist tools
  // ══════════════════════════════════════
  {
    name: 'search_admin_appeals',
    description: '행정심판례 검색. 결과에 id 포함.',
    schema: searchAdminAppealsSchema,
    handler: searchAdminAppeals,
  },
  {
    name: 'get_admin_appeal_text',
    description: '행정심판례 전문 조회. id 필요.',
    schema: getAdminAppealTextSchema,
    handler: getAdminAppealText,
  },
  {
    name: 'search_constitutional_decisions',
    description: '헌법재판소 결정 검색. 위헌/헌법소원 시.',
    schema: searchConstitutionalDecisionsSchema,
    handler: searchConstitutionalDecisions,
  },
  {
    name: 'get_constitutional_decision_text',
    description: '헌재 결정 전문 조회. id 필요.',
    schema: getConstitutionalDecisionTextSchema,
    handler: getConstitutionalDecisionText,
  },
  {
    name: 'search_tax_tribunal_decisions',
    description: '조세심판원 재결례 검색. 세무 쟁송 시.',
    schema: searchTaxTribunalDecisionsSchema,
    handler: searchTaxTribunalDecisions,
  },
  {
    name: 'get_tax_tribunal_decision_text',
    description: '조세심판 재결 전문 조회. id 필요.',
    schema: getTaxTribunalDecisionTextSchema,
    handler: getTaxTribunalDecisionText,
  },
  {
    name: 'search_customs_interpretations',
    description: '관세청 법령해석 검색. 관세/통관 질문 시.',
    schema: searchCustomsInterpretationsSchema,
    handler: searchCustomsInterpretations,
  },
  {
    name: 'get_customs_interpretation_text',
    description: '관세 해석 전문 조회. id 필요.',
    schema: getCustomsInterpretationTextSchema,
    handler: getCustomsInterpretationText,
  },
  {
    name: 'search_ftc_decisions',
    description: '공정위 결정 검색. 공정거래/하도급 시.',
    schema: searchFtcDecisionsSchema,
    handler: searchFtcDecisions,
  },
  {
    name: 'get_ftc_decision_text',
    description: '공정위 결정 전문 조회. id 필요.',
    schema: getFtcDecisionTextSchema,
    handler: getFtcDecisionText,
  },
  {
    name: 'search_pipc_decisions',
    description: '개인정보위 결정 검색. 개인정보 질문 시.',
    schema: searchPipcDecisionsSchema,
    handler: searchPipcDecisions,
  },
  {
    name: 'get_pipc_decision_text',
    description: '개인정보위 결정 전문 조회. id 필요.',
    schema: getPipcDecisionTextSchema,
    handler: getPipcDecisionText,
  },
  {
    name: 'search_nlrc_decisions',
    description: '노동위 결정 검색. 부당해고/노동 시.',
    schema: searchNlrcDecisionsSchema,
    handler: searchNlrcDecisions,
  },
  {
    name: 'get_nlrc_decision_text',
    description: '노동위 결정 전문 조회. id 필요.',
    schema: getNlrcDecisionTextSchema,
    handler: getNlrcDecisionText,
  },
]

// ─── Gemini FunctionDeclaration 변환 (Gemini fallback용) ───

let _cachedDeclarations: FunctionDeclaration[] | null = null

/**
 * 도구 스키마를 Gemini FunctionDeclaration 배열로 변환
 * 결과는 캐시되어 재사용
 */
export function getToolDeclarations(): FunctionDeclaration[] {
  if (_cachedDeclarations) return _cachedDeclarations

  _cachedDeclarations = TOOLS.map(tool => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jsonSchema = zodToJsonSchema(tool.schema as any, { target: 'openApi3' })

    // zodToJsonSchema는 최상위에 $schema, additionalProperties 등을 포함하는데
    // Gemini는 순수 properties/required/type만 원함
    const params: Record<string, unknown> = {
      type: 'OBJECT' as const,
      properties: (jsonSchema as any).properties || {},
    }
    if ((jsonSchema as any).required?.length) {
      params.required = (jsonSchema as any).required
    }

    // apiKey는 LLM이 사용할 필요 없는 내부 파라미터 — 토큰 절약을 위해 제거
    if (params.properties && typeof params.properties === 'object' && 'apiKey' in (params.properties as Record<string, unknown>)) {
      const props = { ...(params.properties as Record<string, unknown>) }
      delete props.apiKey
      params.properties = props
      if (Array.isArray(params.required)) {
        params.required = (params.required as string[]).filter(k => k !== 'apiKey')
      }
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: params,
    } as FunctionDeclaration
  })

  return _cachedDeclarations
}

// ─── Anthropic Tool 변환 (Claude primary용) ───

interface AnthropicTool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

let _cachedAnthropicTools: AnthropicTool[] | null = null

/**
 * 도구 스키마를 Anthropic Tool 배열로 변환
 * 결과는 캐시되어 재사용
 */
export function getAnthropicToolDefinitions(): AnthropicTool[] {
  if (_cachedAnthropicTools) return _cachedAnthropicTools

  _cachedAnthropicTools = TOOLS.map(tool => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jsonSchema = zodToJsonSchema(tool.schema as any, { target: 'openApi3' })

    const properties = { ...((jsonSchema as any).properties || {}) }
    delete properties.apiKey
    const required: string[] = ((jsonSchema as any).required || []).filter((k: string) => k !== 'apiKey')

    return {
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object' as const,
        properties,
        ...(required.length ? { required } : {}),
      },
    }
  })

  return _cachedAnthropicTools
}

// ─── 도구 실행 ───

export interface ToolCallResult {
  name: string
  result: string
  isError: boolean
}

/**
 * 단일 도구 실행 (API 캐시 적용)
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal
): Promise<ToolCallResult> {
  // 클라이언트 취소 시 즉시 반환
  if (signal?.aborted) {
    return { name, result: '요청이 취소되었습니다.', isError: true }
  }

  const tool = TOOLS.find(t => t.name === name)
  if (!tool) {
    return { name, result: `알 수 없는 도구: ${name}`, isError: true }
  }

  // 캐시 조회
  const cacheKey = `${name}:${stableStringify(args)}`
  const cached = apiCache.get(cacheKey)
  if (cached && Date.now() < cached.expiry) {
    return cached.result
  }

  try {
    // 실행 전 취소 재확인
    if (signal?.aborted) {
      return { name, result: '요청이 취소되었습니다.', isError: true }
    }
    // Zod parse로 기본값 적용 (LLM이 optional 파라미터 생략 시)
    const parsedArgs = tool.schema.parse(args)
    const response = await tool.handler(apiClient, parsedArgs)
    const text = response.content.map(c => c.text).join('\n')
    const truncated = truncateForContext(text, name)
    const result: ToolCallResult = {
      name,
      result: name === 'search_law'
        ? compressSearchResult(truncated)
        : name === 'search_ai_law'
          ? compressAiSearchResult(truncated)
          : truncated,
      isError: response.isError || false,
    }

    // 성공 시 캐시 저장 (빈 검색 결과는 캐시하지 않음 — 일시적 API 오류일 수 있음)
    const ttl = CACHE_TTL[name]
    if (ttl && !result.isError) {
      const isEmptySearch = name.startsWith('search_') && isEmptySearchResult(result.result)
      if (!isEmptySearch) {
        apiCache.set(cacheKey, { result, expiry: Date.now() + ttl })
        evictOldest()
      }
    }

    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { name, result: `도구 실행 오류: ${message}`, isError: true }
  }
}

/**
 * 여러 도구 병렬 실행
 */
export async function executeToolsParallel(
  calls: Array<{ name: string; args: Record<string, unknown> }>,
  signal?: AbortSignal
): Promise<ToolCallResult[]> {
  return Promise.all(calls.map(c => executeTool(c.name, c.args, signal)))
}

// ─── 유틸 ───

/** 도구별 컨텍스트 절삭 한도 (중요도에 따라 차등) */
const TOOL_RESULT_LIMITS: Record<string, number> = {
  // 핵심 조문 조회 — 원문이 잘리면 Context Recall 하락
  get_batch_articles: 10000,
  get_law_text: 8000,
  get_precedent_text: 8000,
  get_interpretation_text: 6000,
  get_ordinance: 8000,
  get_article_with_precedents: 10000,
  get_admin_rule: 8000,
  // 검색 결과 — 상위 결과가 중요, 하위는 노이즈
  search_ai_law: 6000,
  search_precedents: 4000,
  search_interpretations: 4000,
  // 비교/구조 — 적당한 길이
  get_three_tier: 6000,
  compare_old_new: 6000,
  get_article_history: 4000,
  get_law_tree: 4000,
  get_annexes: 6000,
  get_law_history: 4000,
  // Chain tools — 여러 도구 결과를 합산하므로 넉넉하게
  chain_full_research: 12000,
  chain_dispute_prep: 10000,
  chain_procedure_detail: 10000,
  chain_action_basis: 10000,
  chain_law_system: 8000,
  chain_amendment_track: 8000,
  chain_ordinance_compare: 8000,
  // Domain specialist (조회 결과)
  get_admin_appeal_text: 6000,
  get_constitutional_decision_text: 6000,
  get_tax_tribunal_decision_text: 6000,
  get_customs_interpretation_text: 6000,
  get_ftc_decision_text: 6000,
  get_pipc_decision_text: 6000,
  get_nlrc_decision_text: 6000,
  // Domain specialist (검색 결과)
  search_admin_appeals: 4000,
  search_constitutional_decisions: 4000,
  search_tax_tribunal_decisions: 4000,
  search_customs_interpretations: 4000,
  search_ftc_decisions: 4000,
  search_pipc_decisions: 4000,
  search_nlrc_decisions: 4000,
}
const DEFAULT_RESULT_LIMIT = 3000

/**
 * 도구 결과가 너무 길면 잘라서 컨텍스트 윈도우 절약
 * 도구별 한도를 차등 적용하여 중요한 원문은 더 많이 유지
 */
function truncateForContext(text: string, toolName?: string): string {
  const limit = (toolName && TOOL_RESULT_LIMITS[toolName]) || DEFAULT_RESULT_LIMIT
  if (text.length <= limit) return text
  return text.slice(0, limit) + '\n\n... (결과가 너무 길어 일부만 표시)'
}

/**
 * search_law 결과를 압축 포맷으로 변환
 * "1. 관세법\n   - 법령ID: 001556\n   - MST: 268725\n   - 공포일: ...\n   - 구분: 법률"
 *  → "1. 관세법 (MST:268725, 법률)"
 */
function compressSearchResult(text: string): string {
  const headerMatch = text.match(/^검색 결과 \(총 \d+건\):/)
  const header = headerMatch ? headerMatch[0] + '\n\n' : ''

  const entries: string[] = []
  const regex = /(\d+)\.\s+(.+?)\n\s+- 법령ID:\s*\S+\n\s+- MST:\s*(\d+)\n\s+- 공포일:\s*\S+\n\s+- 구분:\s*(\S+)/g
  let m
  while ((m = regex.exec(text)) !== null) {
    entries.push(`${m[1]}. ${m[2].trim()} (MST:${m[3]}, ${m[4]})`)
  }

  if (entries.length === 0) return text  // 파싱 실패시 원본 반환
  return header + entries.join('\n')
}

/**
 * search_ai_law 결과에서 관련성 낮은 조문을 제거하고 상위 결과에 집중
 *
 * 원본 형식 (📜 법령명\n  제N조 ... \n  내용...) 블록을 파싱하여:
 * 1. 최대 TOP_AI_RESULTS개 블록만 유지 (Context Precision 향상)
 * 2. 각 블록 내 조문 텍스트를 MAX_ARTICLE_CHARS자로 압축
 */
const TOP_AI_RESULTS = 7
const MAX_ARTICLE_CHARS = 600

function compressAiSearchResult(text: string): string {
  // 헤더 추출 (예: "검색 결과 (12건):")
  const headerMatch = text.match(/^[^\n]*검색[^\n]*\n/)
  const header = headerMatch ? headerMatch[0] : ''
  const body = headerMatch ? text.slice(header.length) : text

  // 📜 구분자로 블록 분리
  const blocks = body.split(/(?=📜\s)/).filter(b => b.trim().length > 0)
  if (blocks.length === 0) return text  // 파싱 실패 시 원본 반환

  // 상위 N개만 유지
  const topBlocks = blocks.slice(0, TOP_AI_RESULTS)

  // 각 블록 내용 압축 (너무 긴 조문 텍스트 축약)
  const compressed = topBlocks.map(block => {
    if (block.length <= MAX_ARTICLE_CHARS) return block.trim()
    return block.slice(0, MAX_ARTICLE_CHARS).trim() + '\n  ...(이하 생략)'
  })

  const kept = compressed.length
  const total = blocks.length
  const suffix = total > kept ? `\n\n(총 ${total}건 중 상위 ${kept}건 표시)` : ''
  return header + compressed.join('\n\n') + suffix
}

/**
 * 검색 결과가 실질적으로 비어있는지 판별
 * API가 에러 없이 "결과 없음"을 반환하는 경우를 캐시에서 제외하기 위함
 */
function isEmptySearchResult(text: string): boolean {
  if (!text || text.trim().length === 0) return true
  // "검색 결과가 없습니다" 등의 메시지
  if (/검색 결과가 없|결과 없음|0건|데이터가 없|찾을 수 없/.test(text)) return true
  // 검색 결과 헤더는 있지만 실제 항목이 없는 경우 (총 0건)
  if (/총 0건/.test(text)) return true
  return false
}
