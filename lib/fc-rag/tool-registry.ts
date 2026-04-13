/**
 * korean-law-mcp 도구 레지스트리
 * 46개 도구 (17개 결정문 도메인은 search_decisions/get_decision_text 2개로 통합)
 */

import { LawApiClient } from 'korean-law-mcp/lib/api-client'
import { debugLogger } from '../debug-logger'

// ── Tier 0: Core search & retrieval ──
import { searchLaw, SearchLawSchema } from 'korean-law-mcp/tools/search'
import { getLawText, GetLawTextSchema } from 'korean-law-mcp/tools/law-text'
import { searchAiLaw, searchAiLawSchema } from 'korean-law-mcp/tools/life-law'
import { getBatchArticles, GetBatchArticlesSchema } from 'korean-law-mcp/tools/batch-articles'

// ── Unified decisions (판례/해석례/헌재/행정심판/조세심판/관세/공정위/개인정보위/노동위/권익위/소청/학칙/공사공단/공공기관/조약/영문법령 17개 도메인 통합) ──
import {
  searchDecisions, SearchDecisionsSchema,
  getDecisionText, GetDecisionTextSchema,
} from 'korean-law-mcp/tools/unified-decisions'

// ── Article detail (조항호목 정밀 조회) ──
import { getArticleDetail, GetArticleDetailSchema } from 'korean-law-mcp/tools/article-detail'

// ── Tier 1-2: Comparison / Structure / History ──
import { getThreeTier, GetThreeTierSchema } from 'korean-law-mcp/tools/three-tier'
import { compareOldNew, CompareOldNewSchema } from 'korean-law-mcp/tools/comparison'
import { getArticleHistory, ArticleHistorySchema } from 'korean-law-mcp/tools/article-history'
import { searchOrdinance, SearchOrdinanceSchema } from 'korean-law-mcp/tools/ordinance-search'
import { getOrdinance, GetOrdinanceSchema } from 'korean-law-mcp/tools/ordinance'
import { advancedSearch, AdvancedSearchSchema } from 'korean-law-mcp/tools/advanced-search'
import { getAnnexes, GetAnnexesSchema } from 'korean-law-mcp/tools/annex'
import { findSimilarPrecedents, FindSimilarPrecedentsSchema } from 'korean-law-mcp/tools/similar-precedents'
import { getLawTree, GetLawTreeSchema } from 'korean-law-mcp/tools/law-tree'
import { searchAll, SearchAllSchema } from 'korean-law-mcp/tools/search-all'

// ── Composite: 조문+판례 동시 조회 ──
import { getArticleWithPrecedents, GetArticleWithPrecedentsSchema } from 'korean-law-mcp/tools/article-with-precedents'

// ── Admin rules (행정규칙: 훈령/예규/고시) ──
import { searchAdminRule, SearchAdminRuleSchema, getAdminRule, GetAdminRuleSchema } from 'korean-law-mcp/tools/admin-rule'

// ── Chain tools (multi-step macros) ──
import {
  chainFullResearch, chainFullResearchSchema,
  chainDisputePrep, chainDisputePrepSchema,
  chainProcedureDetail, chainProcedureDetailSchema,
  chainActionBasis, chainActionBasisSchema,
  chainLawSystem, chainLawSystemSchema,
  chainAmendmentTrack, chainAmendmentTrackSchema,
  chainOrdinanceCompare, chainOrdinanceCompareSchema,
} from 'korean-law-mcp/tools/chains'

// ── Historical ──
import { getLawHistory, LawHistorySchema } from 'korean-law-mcp/tools/law-history'
import { searchHistoricalLaw, searchHistoricalLawSchema, getHistoricalLaw, getHistoricalLawSchema } from 'korean-law-mcp/tools/historical-law'

// ── Tier 2: Structural (법체계/외부링크) ──
import { getLawSystemTree, getLawSystemTreeSchema } from 'korean-law-mcp/tools/law-system-tree'
import { getExternalLinks, ExternalLinksSchema } from 'korean-law-mcp/tools/external-links'

// ── Tier 3: Legal terms, Knowledge base, Statistics, Autocomplete ──
import { searchLegalTerms, searchLegalTermsSchema } from 'korean-law-mcp/tools/legal-terms'
import {
  getLegalTermKB, getLegalTermKBSchema,
  getLegalTermDetail, getLegalTermDetailSchema,
  getDailyTerm, getDailyTermSchema,
  getDailyToLegal, getDailyToLegalSchema,
  getLegalToDaily, getLegalToDailySchema,
  getTermArticles, getTermArticlesSchema,
  getRelatedLaws, getRelatedLawsSchema,
} from 'korean-law-mcp/tools/knowledge-base'
import { getLawStatistics, LawStatisticsSchema } from 'korean-law-mcp/tools/law-statistics'
import { suggestLawNames, SuggestLawNamesSchema } from 'korean-law-mcp/tools/autocomplete'

// ── Tier 3: Article compare, Link parser, Precedent utils, English law ──
import { compareArticles, CompareArticlesSchema } from 'korean-law-mcp/tools/article-compare'
import { parseArticleLinks, ParseArticleLinksSchema } from 'korean-law-mcp/tools/article-link-parser'
import { extractPrecedentKeywords, ExtractKeywordsSchema } from 'korean-law-mcp/tools/precedent-keywords'
import { summarizePrecedent, SummarizePrecedentSchema } from 'korean-law-mcp/tools/precedent-summary'
import { searchEnglishLaw, searchEnglishLawSchema, getEnglishLawText, getEnglishLawTextSchema } from 'korean-law-mcp/tools/english-law'

// ── Utils (조문번호 변환) ──
import { parseJoCode, ParseJoCodeSchema } from 'korean-law-mcp/tools/utils'

// ─── API 클라이언트 (모듈 레벨 싱글턴) ───

const LAW_OC = process.env.LAW_OC
if (!LAW_OC) {
  debugLogger.warning('[FC-RAG] LAW_OC 환경 변수가 설정되지 않았습니다.')
}
export const apiClient = new LawApiClient({ apiKey: LAW_OC || '' })

// ─── 도구 정의 ───

export interface ToolDef {
  name: string
  description: string
  // `any` is intentional: Zod schemas return diverse parsed types, and tool schemas
  // have dynamic index signatures that can't be narrowed without generics overhead.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: { parse: (data: unknown) => any; [key: string]: any }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (client: LawApiClient, input: any) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>
}

/**
 * 등록된 전체 도구 목록.
 * selectToolsForQuery()가 쿼리별로 필터링하여 LLM에 필요한 것만 전달.
 * Description은 토큰 절약을 위해 압축 (40자 내외).
 */
export const TOOLS: ToolDef[] = [
  // ══ Core search ══
  { name: 'search_ai_law', description: '자연어로 관련 조문 의미검색. 법령명 몰라도 사용 가능. search: 0=법령(기본), 2=행정규칙.', schema: searchAiLawSchema, handler: searchAiLaw },
  { name: 'search_law', description: '법령명 키워드검색. 약칭 자동인식. MST 확인용.', schema: SearchLawSchema, handler: searchLaw },
  { name: 'search_all', description: '법령+판례+해석례+행정규칙 통합검색. 도메인 불명확 시.', schema: SearchAllSchema, handler: searchAll },

  // ══ Core retrieval ══
  { name: 'get_law_text', description: '법령 조문 조회. mst+jo 지정. jo 없으면 전문.', schema: GetLawTextSchema, handler: getLawText },
  { name: 'get_batch_articles', description: '여러 조문 일괄 조회. mst+articles 배열.', schema: GetBatchArticlesSchema, handler: getBatchArticles },
  { name: 'get_article_with_precedents', description: '조문+관련판례 한번에 조회. mst/lawId+jo.', schema: GetArticleWithPrecedentsSchema, handler: getArticleWithPrecedents },
  { name: 'get_article_detail', description: '조항호목 단위 정밀 조회. mst+jo 필수, hang/ho/mok 선택. 벌칙/처분기준 등 특정 항·호·목만 필요할 때.', schema: GetArticleDetailSchema, handler: getArticleDetail },

  // ══ Unified decisions (17개 도메인 통합) ══
  { name: 'search_decisions', description: '결정문 통합검색. domain 필수: precedent(판례)/interpretation(해석례)/tax_tribunal(조세심판)/customs(관세해석)/constitutional(헌재)/admin_appeal(행정심판)/ftc(공정위)/pipc(개인정보위)/nlrc(노동위)/acr(권익위)/appeal_review(소청)/acr_special/school(학칙)/public_corp/public_inst/treaty(조약)/english_law. 결과에 id 포함.', schema: SearchDecisionsSchema, handler: searchDecisions },
  { name: 'get_decision_text', description: '결정문 전문 조회. domain+id 필수. search_decisions 와 동일 domain 세트.', schema: GetDecisionTextSchema, handler: getDecisionText },

  // ══ Structure / Comparison / History ══
  { name: 'get_three_tier', description: '법률→시행령→시행규칙 3단비교. mst+knd.', schema: GetThreeTierSchema, handler: getThreeTier },
  { name: 'compare_old_new', description: '신구법 대조표(개정 전후 비교). mst 필요.', schema: CompareOldNewSchema, handler: compareOldNew },
  { name: 'get_article_history', description: '조문별 개정 이력 조회. lawId+jo.', schema: ArticleHistorySchema, handler: getArticleHistory },
  { name: 'get_law_history', description: '법령 연혁(개정 이력 목록). 날짜별 변경 확인.', schema: LawHistorySchema, handler: getLawHistory },

  // ══ Ordinance ══
  { name: 'search_ordinance', description: '자치법규(조례) 검색. 지역명 포함 필수.', schema: SearchOrdinanceSchema, handler: searchOrdinance },
  { name: 'get_ordinance', description: '자치법규 전문 조회. ordinSeq 필요.', schema: GetOrdinanceSchema, handler: getOrdinance },

  // ══ Admin rules ══
  { name: 'search_admin_rule', description: '행정규칙(훈령/예규/고시) 검색. 결과에 id 포함.', schema: SearchAdminRuleSchema, handler: searchAdminRule },
  { name: 'get_admin_rule', description: '행정규칙 전문 조회. id 필요.', schema: GetAdminRuleSchema, handler: getAdminRule },

  // ══ Advanced / Auxiliary ══
  { name: 'advanced_search', description: '고급 법령검색. 법령종류/부처/시행일 필터.', schema: AdvancedSearchSchema, handler: advancedSearch },
  { name: 'get_annexes', description: '별표/서식 조회. 금액/기준은 별표에 있는 경우 많음.', schema: GetAnnexesSchema, handler: getAnnexes },
  { name: 'find_similar_precedents', description: '유사 판례 검색. 판례 id 입력.', schema: FindSimilarPrecedentsSchema, handler: findSimilarPrecedents },
  { name: 'get_law_tree', description: '법령 체계도(목차) 조회. mst 필요.', schema: GetLawTreeSchema, handler: getLawTree },

  // ══ ⛓️ Chain tools ══
  { name: 'chain_full_research', description: '⛓️ 종합 리서치. AI검색+법령+판례+해석례 병렬 수집. 복합 질문 시 1턴에 전체 자료 확보.', schema: chainFullResearchSchema, handler: chainFullResearch },
  { name: 'chain_dispute_prep', description: '⛓️ 쟁송 대비. 판례+행정심판+도메인별 결정례 병렬. 불복/소송 질문 시.', schema: chainDisputePrepSchema, handler: chainDisputePrep },
  { name: 'chain_procedure_detail', description: '⛓️ 절차/비용. 법령+3단비교+별표/서식 자동 연쇄. 신청/절차 질문 시.', schema: chainProcedureDetailSchema, handler: chainProcedureDetail },
  { name: 'chain_action_basis', description: '⛓️ 처분근거. 3단비교+해석례+판례+행정심판 병렬. 허가/처분 질문 시.', schema: chainActionBasisSchema, handler: chainActionBasis },
  { name: 'chain_law_system', description: '⛓️ 법체계 파악. 법령검색+3단비교+조문+별표 연쇄. 법 구조 질문 시.', schema: chainLawSystemSchema, handler: chainLawSystem },
  { name: 'chain_amendment_track', description: '⛓️ 개정 추적. 신구대조+조문이력 연쇄. 개정/변경 질문 시.', schema: chainAmendmentTrackSchema, handler: chainAmendmentTrack },
  { name: 'chain_ordinance_compare', description: '⛓️ 조례 비교. 상위법령+위임체계+전국 조례검색. 자치법규 질문 시.', schema: chainOrdinanceCompareSchema, handler: chainOrdinanceCompare },

  // ══ Structural / Historical ══
  { name: 'get_law_system_tree', description: '법령 체계 분류(소관부처별 법령 트리) 조회.', schema: getLawSystemTreeSchema, handler: getLawSystemTree },
  { name: 'get_external_links', description: '법제처/법원도서관 외부 링크 생성.', schema: ExternalLinksSchema, handler: (_client, input) => getExternalLinks(input) },
  { name: 'search_historical_law', description: '과거 법령 연혁 검색. 법령명으로 이전 버전 목록.', schema: searchHistoricalLawSchema, handler: searchHistoricalLaw },
  { name: 'get_historical_law', description: '과거 시점 법령 조문 조회. mst+jo.', schema: getHistoricalLawSchema, handler: getHistoricalLaw },

  // ══ Legal Terms / Knowledge Base ══
  { name: 'search_legal_terms', description: '법령용어 검색. 정의/설명 포함.', schema: searchLegalTermsSchema, handler: searchLegalTerms },
  { name: 'get_legal_term_kb', description: '법령용어 지식베이스 검색.', schema: getLegalTermKBSchema, handler: getLegalTermKB },
  { name: 'get_legal_term_detail', description: '법령용어 상세 정보 조회.', schema: getLegalTermDetailSchema, handler: getLegalTermDetail },
  { name: 'get_daily_term', description: '일상용어로 법령용어 검색.', schema: getDailyTermSchema, handler: getDailyTerm },
  { name: 'get_daily_to_legal', description: '일상용어→법률용어 변환.', schema: getDailyToLegalSchema, handler: getDailyToLegal },
  { name: 'get_legal_to_daily', description: '법률용어→일상용어 변환.', schema: getLegalToDailySchema, handler: getLegalToDaily },
  { name: 'get_term_articles', description: '특정 용어가 사용된 조문 목록.', schema: getTermArticlesSchema, handler: getTermArticles },
  { name: 'get_related_laws', description: '관련 법령 목록 조회. lawId 또는 lawName.', schema: getRelatedLawsSchema, handler: getRelatedLaws },

  // ══ Statistics / Autocomplete ══
  { name: 'get_law_statistics', description: '최근 공포/시행 법령 통계.', schema: LawStatisticsSchema, handler: getLawStatistics },
  { name: 'suggest_law_names', description: '법령명 자동완성. 부분 입력→후보 목록.', schema: SuggestLawNamesSchema, handler: suggestLawNames },

  // ══ Compare / Parser / Precedent Utils ══
  { name: 'compare_articles', description: '두 법령 조문 비교. law1/law2 각각 mst+jo.', schema: CompareArticlesSchema, handler: compareArticles },
  { name: 'parse_article_links', description: '조문 내 참조 링크(타법 인용) 파싱.', schema: ParseArticleLinksSchema, handler: parseArticleLinks },
  { name: 'extract_precedent_keywords', description: '판례 키워드 추출. id 필요.', schema: ExtractKeywordsSchema, handler: extractPrecedentKeywords },
  { name: 'summarize_precedent', description: '판례 요약 생성. id 필요.', schema: SummarizePrecedentSchema, handler: summarizePrecedent },

  // ══ English Law ══
  { name: 'search_english_law', description: '영문 법령 검색.', schema: searchEnglishLawSchema, handler: searchEnglishLaw },
  { name: 'get_english_law_text', description: '영문 법령 전문 조회.', schema: getEnglishLawTextSchema, handler: getEnglishLawText },

  // ══ Utils ══
  { name: 'parse_jo_code', description: '조문번호↔JO코드 변환. "제38조"↔"003800".', schema: ParseJoCodeSchema, handler: (_client, input) => parseJoCode(input) },
]
