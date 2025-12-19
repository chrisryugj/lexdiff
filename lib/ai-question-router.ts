/**
 * AI Question Router - 2-Tier RAG 아키텍처 메인 모듈
 *
 * Layer 1: Gemini 2.5 Flash Lite (Router) - 질문 분석 및 검색 최적화
 * Layer 2: Gemini 2.5 Flash + RAG - 전문 프롬프트로 답변 생성
 *
 * 주요 기능:
 * - AI 기반 질문 분류 (8가지 유형)
 * - 검색 키워드 최적화 (Citation 히트율 향상)
 * - 전문 프롬프트 선택
 */

import { analyzeQuery, quickClassify } from './ai-agents/router-agent'
import { getSpecialistPrompt } from './ai-agents/specialist-agents'
import type { RouterAnalysis, QueryType, SearchOptimization } from './ai-agents/types'
import type { LegalQueryType } from './legal-query-analyzer'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 타입 정의
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface RoutingResult {
  /** Router 분석 결과 (전체) */
  analysis: RouterAnalysis

  /** 선택된 전문 프롬프트 */
  specialistPrompt: string

  /** 최적화된 검색 쿼리 (RAG에 전달) */
  optimizedQuery: string

  /** 검색 최적화 정보 */
  searchOptimization: SearchOptimization

  /** 기존 시스템 호환용 타입 */
  legacyType: LegalQueryType

  /** 라우팅 소요 시간 (ms) */
  routingTimeMs: number
}

export interface QuickRoutingResult {
  /** 질문 유형 */
  type: QueryType

  /** 기존 시스템 호환용 타입 */
  legacyType: LegalQueryType

  /** 전문 프롬프트 */
  specialistPrompt: string
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 타입 매핑
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 8가지 QueryType → 8가지 LegalQueryType 매핑 (1:1)
 * Phase 10에서 exemption 추가 완료
 */
const QUERY_TYPE_TO_LEGACY: Record<QueryType, LegalQueryType> = {
  definition: 'definition',
  requirement: 'requirement',
  procedure: 'procedure',
  comparison: 'comparison',
  application: 'application',
  consequence: 'consequence',
  scope: 'scope',
  exemption: 'exemption'  // Phase 10: exemption 타입 추가 완료
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 메인 라우팅 함수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * AI 기반 질문 라우팅 (전체 분석)
 *
 * 2-Tier 아키텍처:
 * 1. Gemini 2.5 Flash Lite로 질문 분석 (~0.5초)
 * 2. 분석 결과에 따라 전문 프롬프트 선택
 *
 * @param query - 사용자 질문
 * @returns 라우팅 결과 (분석, 프롬프트, 검색 최적화)
 */
export async function routeQuestion(query: string): Promise<RoutingResult> {
  const startTime = Date.now()

  console.log('[AI Router] Starting question routing:', query.substring(0, 50) + '...')

  // 1. AI Router 호출 (Layer 1)
  const analysis = await analyzeQuery(query)

  // 2. 전문 프롬프트 선택
  const specialistPrompt = getSpecialistPrompt(analysis.primaryType)

  // 3. 최적화된 검색 쿼리 구성
  const optimizedQuery = buildOptimizedSearchQuery(
    query,
    analysis.searchOptimization
  )

  // 4. 기존 시스템 호환용 타입 매핑
  const legacyType = QUERY_TYPE_TO_LEGACY[analysis.primaryType]

  const routingTimeMs = Date.now() - startTime

  console.log('[AI Router] Routing complete:', {
    primaryType: analysis.primaryType,
    legacyType,
    domain: analysis.domain,
    routingTimeMs,
    optimizedQuery: optimizedQuery.substring(0, 50) + '...'
  })

  return {
    analysis,
    specialistPrompt,
    optimizedQuery,
    searchOptimization: analysis.searchOptimization,
    legacyType,
    routingTimeMs
  }
}

/**
 * 빠른 라우팅 (규칙 기반 - API 호출 없음)
 *
 * 사용 시나리오:
 * - 캐시 검색 키 생성
 * - 실시간 프리뷰
 * - API 할당량 절약
 *
 * @param query - 사용자 질문
 * @returns 빠른 라우팅 결과
 */
export function routeQuestionQuick(query: string): QuickRoutingResult {
  const { type } = quickClassify(query)

  return {
    type,
    legacyType: QUERY_TYPE_TO_LEGACY[type],
    specialistPrompt: getSpecialistPrompt(type)
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 검색 쿼리 최적화
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * RAG 검색에 최적화된 쿼리 구성
 *
 * 전략:
 * - exact: 법령명 + 조문 + 원본 쿼리
 * - semantic: 키워드 + 연관 용어
 * - hybrid: 원본 + 키워드 + 연관 용어
 */
function buildOptimizedSearchQuery(
  originalQuery: string,
  searchOpt: SearchOptimization
): string {
  const { strategy, optimizedQuery, searchKeywords, relatedTerms } = searchOpt

  switch (strategy) {
    case 'exact':
      // 정확한 조문 검색: AI 최적화 쿼리 사용
      return optimizedQuery || originalQuery

    case 'semantic':
      // 개념 검색: 키워드 + 연관 용어 조합
      const semanticParts = [
        ...searchKeywords.slice(0, 4),
        ...relatedTerms.slice(0, 3)
      ].filter(Boolean)
      return semanticParts.length > 0
        ? semanticParts.join(' ')
        : originalQuery

    case 'hybrid':
    default:
      // 복합 검색: 원본 기반 + 보강
      const hybridParts = [
        optimizedQuery || originalQuery,
        ...relatedTerms.slice(0, 2)
      ].filter(Boolean)
      return hybridParts.join(' ')
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 유틸리티
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 라우팅 결과에서 로깅용 요약 생성
 */
export function summarizeRouting(result: RoutingResult): string {
  const { analysis, routingTimeMs } = result
  return [
    `[타입: ${analysis.primaryType}${analysis.secondaryType ? '+' + analysis.secondaryType : ''}]`,
    `[도메인: ${analysis.domain}]`,
    `[복잡도: ${analysis.complexity}]`,
    `[키워드: ${analysis.searchOptimization.searchKeywords.slice(0, 3).join(', ')}]`,
    `[소요: ${routingTimeMs}ms]`
  ].join(' ')
}

/**
 * 분석 결과 검증
 */
export function validateAnalysis(analysis: RouterAnalysis): {
  valid: boolean
  issues: string[]
} {
  const issues: string[] = []

  if (!analysis.primaryType) {
    issues.push('primaryType 누락')
  }

  if (!analysis.domain) {
    issues.push('domain 누락')
  }

  if (!analysis.searchOptimization) {
    issues.push('searchOptimization 누락')
  } else {
    if (!analysis.searchOptimization.searchKeywords?.length) {
      issues.push('searchKeywords 비어있음')
    }
  }

  if (analysis.confidence < 0.5) {
    issues.push(`낮은 신뢰도: ${analysis.confidence}`)
  }

  return {
    valid: issues.length === 0,
    issues
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Re-exports
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export { analyzeQuery } from './ai-agents/router-agent'
export { getSpecialistPrompt } from './ai-agents/specialist-agents'
export type { RouterAnalysis, QueryType, SearchOptimization } from './ai-agents/types'
