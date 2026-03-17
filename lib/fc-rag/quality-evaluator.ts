/**
 * RAG 응답 품질 평가기 (Bridge quality-evaluator.mjs 포팅)
 *
 * 도구 사용, 인용, 답변 품질을 0-100점으로 평가하여
 * pass/marginal/fail 분류.
 */

import type { ToolCallResult } from './tool-adapter'

export type QualityLevel = 'pass' | 'marginal' | 'fail'

export interface QualityResult {
  score: number
  level: QualityLevel
  warnings: string[]
}

// ── 증거 도구 세트 ──

const EVIDENCE_TOOLS = new Set([
  // Retrieval
  'get_law_text', 'get_batch_articles', 'get_three_tier', 'get_precedent_text',
  'get_interpretation_text', 'get_ordinance', 'get_article_with_precedents',
  'get_admin_rule', 'get_annexes', 'get_article_history', 'get_law_tree',
  'get_law_history', 'get_admin_appeal_text', 'get_constitutional_decision_text',
  'get_tax_tribunal_decision_text', 'get_customs_interpretation_text',
  'get_ftc_decision_text', 'get_pipc_decision_text', 'get_nlrc_decision_text',
  'compare_old_new',
  // Search
  'search_law', 'search_precedents', 'search_interpretations', 'search_ordinance',
  'search_ai_law', 'search_all', 'advanced_search', 'find_similar_precedents',
  'search_admin_rule', 'search_admin_appeals', 'search_constitutional_decisions',
  'search_tax_tribunal_decisions', 'search_customs_interpretations',
  'search_ftc_decisions', 'search_pipc_decisions', 'search_nlrc_decisions',
  // Chain
  'chain_full_research', 'chain_dispute_prep', 'chain_procedure_detail',
  'chain_action_basis', 'chain_law_system', 'chain_amendment_track',
  'chain_ordinance_compare',
])

// ── 정규식 패턴 ──

const CITATION_PATTERN = /「[^」]+」\s*제\d+조/g
const ARTICLE_REF_PATTERN = /제\d+조/g
const LAW_NAME_PATTERN = /「[^」]+」/g
const ANSWER_FAILURE_PATTERN = /추출[이가은]\s*(?:반복\s*)?실패|직접\s*추출|검색\s*결과\s*없음|조회되지\s*않/

/**
 * RAG 응답 품질 평가
 *
 * @param toolResults - 호출된 도구 결과 목록
 * @param answerText - LLM 최종 답변
 */
export function evaluateResponseQuality(
  toolResults: ToolCallResult[],
  answerText: string,
): QualityResult {
  const warnings: string[] = []

  // 증거 도구 카운트
  const toolsCalled = toolResults.map(t => t.name)
  const retrievalCount = toolsCalled.filter(t => EVIDENCE_TOOLS.has(t)).length
  const hasSuccessfulResults = toolResults.some(t => !t.isError && t.result.length > 100)

  // 인용 카운트
  const citationCount = answerText.match(CITATION_PATTERN)?.length || 0
  const articleRefCount = answerText.match(ARTICLE_REF_PATTERN)?.length || 0
  const lawNameCount = answerText.match(LAW_NAME_PATTERN)?.length || 0

  // ── 점수 계산 (100점 만점) ──

  // Tool Score (0-30): 증거 도구당 10점
  const toolScore = Math.min(retrievalCount * 10, 30)

  // Content Score (0-30): 실제 검색 결과 유무
  let contentScore = 0
  if (hasSuccessfulResults) {
    contentScore = 30
  } else if (answerText.length > 200) {
    contentScore = 15
  }

  // 답변에서 추출 실패 패턴 감지 → 반감 패널티
  if (ANSWER_FAILURE_PATTERN.test(answerText) && contentScore > 0) {
    contentScore = Math.floor(contentScore / 2)
    warnings.push('답변에서 추출 실패 패턴 감지')
  }

  // Citation Score (0-25): 「법령명」 제N조 인용당 5점
  const citationScore = Math.min(citationCount * 5, 25)

  // Answer Score (0-15): 제N조 + 「…」 참조당 3점
  const answerScore = Math.min((articleRefCount + lawNameCount) * 3, 15)

  let score = toolScore + contentScore + citationScore + answerScore

  // ── Memory Bypass: 도구 없지만 인용 충분하면 marginal 보장 ──
  if (retrievalCount === 0 && citationCount >= 3 && score < 30) {
    score = 30
    warnings.push('도구 미호출이나 인용 충분 (memory bypass)')
  }

  // ── 레벨 판정 ──
  const level: QualityLevel = score >= 55 ? 'pass' : score >= 30 ? 'marginal' : 'fail'

  if (level === 'fail') {
    warnings.push(`품질 평가 실패 (${score}점): 법적 근거 부족`)
  } else if (level === 'marginal') {
    warnings.push(`품질 경고 (${score}점): 추가 법적 근거 권장`)
  }

  return { score, level, warnings }
}
