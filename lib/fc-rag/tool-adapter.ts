/**
 * korean-law-mcp 도구 → Gemini Function Calling 어댑터
 *
 * korean-law-mcp의 개별 도구를 직접 import하여
 * Gemini FunctionDeclaration으로 변환 + 실행하는 얇은 브릿지 레이어
 */

import { LawApiClient } from 'korean-law-mcp/build/lib/api-client.js'
import { zodToJsonSchema } from 'zod-to-json-schema'

// Tier 1 도구: 항상 제공
import { searchLaw, SearchLawSchema } from 'korean-law-mcp/build/tools/search.js'
import { getLawText, GetLawTextSchema } from 'korean-law-mcp/build/tools/law-text.js'
import { searchPrecedents, searchPrecedentsSchema, getPrecedentText, getPrecedentTextSchema } from 'korean-law-mcp/build/tools/precedents.js'
import { searchInterpretations, searchInterpretationsSchema, getInterpretationText, getInterpretationTextSchema } from 'korean-law-mcp/build/tools/interpretations.js'
import { searchAiLaw, searchAiLawSchema } from 'korean-law-mcp/build/tools/life-law.js'
import { getBatchArticles, GetBatchArticlesSchema } from 'korean-law-mcp/build/tools/batch-articles.js'

// Tier 2 도구: 위임법령/신구법비교/조문이력
import { getThreeTier, GetThreeTierSchema } from 'korean-law-mcp/build/tools/three-tier.js'
import { compareOldNew, CompareOldNewSchema } from 'korean-law-mcp/build/tools/comparison.js'
import { getArticleHistory, ArticleHistorySchema } from 'korean-law-mcp/build/tools/article-history.js'

// Tier 2 도구: 자치법규(조례)
import { searchOrdinance, SearchOrdinanceSchema } from 'korean-law-mcp/build/tools/ordinance-search.js'
import { getOrdinance, GetOrdinanceSchema } from 'korean-law-mcp/build/tools/ordinance.js'

// Tier 3 도구: 확장 (고급검색, 별표, 유사판례, 체계도, 통합검색)
import { advancedSearch, AdvancedSearchSchema } from 'korean-law-mcp/build/tools/advanced-search.js'
import { getAnnexes, GetAnnexesSchema } from 'korean-law-mcp/build/tools/annex.js'
import { findSimilarPrecedents, FindSimilarPrecedentsSchema } from 'korean-law-mcp/build/tools/similar-precedents.js'
import { getLawTree, GetLawTreeSchema } from 'korean-law-mcp/build/tools/law-tree.js'
import { searchAll, SearchAllSchema } from 'korean-law-mcp/build/tools/search-all.js'

import type { FunctionDeclaration } from '@google/genai'
import type { ZodSchema } from 'zod'

// ─── API 클라이언트 (모듈 레벨 싱글턴) ───

const apiClient = new LawApiClient({ apiKey: process.env.LAW_OC || '' })

// ─── API 결과 캐시 ───

interface CacheEntry {
  result: ToolCallResult
  expiry: number
}

const apiCache = new Map<string, CacheEntry>()

const CACHE_TTL: Record<string, number> = {
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
  search_law: 6 * 3600_000,
  search_precedents: 12 * 3600_000,
  search_interpretations: 12 * 3600_000,
  search_ordinance: 12 * 3600_000,
  search_ai_law: 3 * 3600_000,
  advanced_search: 6 * 3600_000,
  search_all: 6 * 3600_000,
  find_similar_precedents: 12 * 3600_000,
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
  schema: ZodSchema
  handler: (client: LawApiClient, input: any) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>
}

const TOOLS: ToolDef[] = [
  {
    name: 'search_ai_law',
    description: '자연어 질문으로 관련 법령 조문을 검색합니다. 법령명을 몰라도 "관세 신고납부 요건", "음주운전 처벌" 같은 자연어로 관련 조문을 찾을 수 있습니다. 조문 내용 기반 의미 검색이므로 search_law보다 먼저 사용하세요. search: 0=법령조문(기본), 2=행정규칙 조문.',
    schema: searchAiLawSchema,
    handler: searchAiLaw,
  },
  {
    name: 'search_law',
    description: '한국 법령을 키워드로 검색합니다. 약칭 자동 인식(예: 화관법→화학물질관리법). 결과에 법령ID와 MST(법령일련번호)가 포함됩니다. 법령명을 알 때 MST를 확인하는 용도. 조문 내용 검색은 search_ai_law를 사용하세요.',
    schema: SearchLawSchema,
    handler: searchLaw,
  },
  {
    name: 'get_law_text',
    description: '특정 법령의 조문 전문을 조회합니다. search_law 결과에서 얻은 mst 값을 사용하세요. jo 파라미터로 특정 조문만 조회 가능(예: jo="제38조"). 여러 조문이 필요하면 get_batch_articles를 사용하세요.',
    schema: GetLawTextSchema,
    handler: getLawText,
  },
  {
    name: 'get_batch_articles',
    description: '여러 조문을 한번에 조회합니다. search_law 결과에서 얻은 mst와 조문번호 배열을 사용하세요. 예: mst="268725", articles=["제38조", "제39조", "제9조"]. 관련 조문을 정밀 조회할 때 사용.',
    schema: GetBatchArticlesSchema,
    handler: getBatchArticles,
  },
  {
    name: 'search_precedents',
    description: '법원 판례를 키워드로 검색합니다. 법원명/사건번호 필터 가능. 결과에 판례 id가 포함됩니다.',
    schema: searchPrecedentsSchema,
    handler: searchPrecedents,
  },
  {
    name: 'get_precedent_text',
    description: '특정 판례의 전문(판시사항, 판결요지, 전문)을 조회합니다. search_precedents 결과에서 얻은 id를 사용하세요.',
    schema: getPrecedentTextSchema,
    handler: getPrecedentText,
  },
  {
    name: 'search_interpretations',
    description: '법제처 유권해석(법령해석례)을 키워드로 검색합니다.',
    schema: searchInterpretationsSchema,
    handler: searchInterpretations,
  },
  {
    name: 'get_interpretation_text',
    description: '특정 해석례의 전문(회신내용, 이유)을 조회합니다. search_interpretations 결과에서 얻은 id를 사용하세요.',
    schema: getInterpretationTextSchema,
    handler: getInterpretationText,
  },
  {
    name: 'get_three_tier',
    description: '법률→시행령→시행규칙 위임법령 3단비교를 조회합니다. search_law 결과에서 얻은 mst와 lawId를 사용하세요. knd: "2"(법률→시행령, 기본값), "3"(시행령→시행규칙).',
    schema: GetThreeTierSchema,
    handler: getThreeTier,
  },
  {
    name: 'compare_old_new',
    description: '법령의 신구법 대조표(개정 전후 비교)를 조회합니다. search_law 결과에서 얻은 mst, lawId를 사용하세요. 최근 개정 내역을 확인할 때 사용합니다.',
    schema: CompareOldNewSchema,
    handler: compareOldNew,
  },
  {
    name: 'get_article_history',
    description: '특정 조문의 개정 이력을 조회합니다. search_law 결과에서 얻은 lawId와 조문번호(jo)를 사용하세요. 예: lawId="001556", jo="38".',
    schema: ArticleHistorySchema,
    handler: getArticleHistory,
  },
  {
    name: 'search_ordinance',
    description: '자치법규(조례·규칙)를 키워드로 검색합니다. 시·도/시·군·구 조례가 필요할 때 사용합니다. 결과에 자치법규일련번호(ordinSeq)가 포함됩니다. 예: query="광진구 복무".',
    schema: SearchOrdinanceSchema,
    handler: searchOrdinance,
  },
  {
    name: 'get_ordinance',
    description: '자치법규(조례) 전문을 조회합니다. search_ordinance 결과에서 얻은 자치법규일련번호(ordinSeq)를 사용하세요.',
    schema: GetOrdinanceSchema,
    handler: getOrdinance,
  },
  // Tier 3: 확장 도구
  {
    name: 'advanced_search',
    description: '고급 법령 검색. 법령종류(법률/시행령/시행규칙), 소관부처, 시행일 등 필터로 정밀 검색합니다. search_ai_law나 search_law로 부족할 때 사용.',
    schema: AdvancedSearchSchema,
    handler: advancedSearch,
  },
  {
    name: 'get_annexes',
    description: '법령의 별표·서식을 조회합니다. "관세법 별표 1", "부가가치세법 서식" 등 별표/서식이 필요할 때 사용. mst 필요.',
    schema: GetAnnexesSchema,
    handler: getAnnexes,
  },
  {
    name: 'find_similar_precedents',
    description: '특정 판례와 유사한 판례를 찾습니다. 판례 id를 입력하면 유사 판례 목록을 반환합니다.',
    schema: FindSimilarPrecedentsSchema,
    handler: findSimilarPrecedents,
  },
  {
    name: 'get_law_tree',
    description: '법령의 체계도(목차 구조)를 조회합니다. 법령의 편/장/절/조 구조를 한눈에 파악할 때 사용. mst 필요.',
    schema: GetLawTreeSchema,
    handler: getLawTree,
  },
  {
    name: 'search_all',
    description: '법령·판례·해석례·행정규칙을 통합 검색합니다. 도메인이 불명확할 때 한 번에 검색. 결과에 각 카테고리별 건수와 상위 항목이 포함됩니다.',
    schema: SearchAllSchema,
    handler: searchAll,
  },
]

// ─── Gemini FunctionDeclaration 변환 ───

let _cachedDeclarations: FunctionDeclaration[] | null = null

/**
 * 도구 스키마를 Gemini FunctionDeclaration 배열로 변환
 * 결과는 캐시되어 재사용
 */
export function getToolDeclarations(): FunctionDeclaration[] {
  if (_cachedDeclarations) return _cachedDeclarations

  _cachedDeclarations = TOOLS.map(tool => {
    const jsonSchema = zodToJsonSchema(tool.schema, { target: 'openApi3' })

    // zodToJsonSchema는 최상위에 $schema, additionalProperties 등을 포함하는데
    // Gemini는 순수 properties/required/type만 원함
    const params: Record<string, unknown> = {
      type: 'OBJECT' as const,
      properties: (jsonSchema as any).properties || {},
    }
    if ((jsonSchema as any).required?.length) {
      params.required = (jsonSchema as any).required
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: params,
    } as FunctionDeclaration
  })

  return _cachedDeclarations
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
  args: Record<string, unknown>
): Promise<ToolCallResult> {
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
    // Zod parse로 기본값 적용 (Gemini가 optional 파라미터 생략 시)
    const parsedArgs = tool.schema.parse(args)
    const response = await tool.handler(apiClient, parsedArgs)
    const text = response.content.map(c => c.text).join('\n')
    const truncated = truncateForContext(text)
    const result: ToolCallResult = {
      name,
      result: name === 'search_law' ? compressSearchResult(truncated) : truncated,
      isError: response.isError || false,
    }

    // 성공 시 캐시 저장
    const ttl = CACHE_TTL[name]
    if (ttl && !result.isError) {
      apiCache.set(cacheKey, { result, expiry: Date.now() + ttl })
      evictOldest()
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
  calls: Array<{ name: string; args: Record<string, unknown> }>
): Promise<ToolCallResult[]> {
  return Promise.all(calls.map(c => executeTool(c.name, c.args)))
}

// ─── 유틸 ───

const MAX_RESULT_LENGTH = 3000

/**
 * 도구 결과가 너무 길면 잘라서 컨텍스트 윈도우 절약
 */
function truncateForContext(text: string): string {
  if (text.length <= MAX_RESULT_LENGTH) return text
  return text.slice(0, MAX_RESULT_LENGTH) + '\n\n... (결과가 너무 길어 일부만 표시)'
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
