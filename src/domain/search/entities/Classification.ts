/**
 * Classification - 검색 분류 결과 엔티티
 *
 * 통합 검색 쿼리 분류 결과를 나타내는 엔티티
 */

import type { SearchType, QueryType } from '../value-objects/SearchType'
import type { LegalQueryType } from '../value-objects/LegalQueryType'
import type { LegalDomain } from '../value-objects/LegalDomain'

/**
 * 추출된 엔티티
 */
export interface ExtractedEntities {
  lawName?: string          // "민법"
  articleNumber?: string    // "제38조"
  caseNumber?: string       // "2023도1234"
  court?: string            // "대법원"
  ruleType?: string         // "예규", "고시"
  interpretationType?: string // "행정해석", "유권해석"
  rulingNumber?: string     // "조심2023서0001"
}

/**
 * 통합 검색 분류 결과
 */
export interface UnifiedQueryClassification {
  // Primary search type
  searchType: SearchType

  // Secondary types (multi인 경우)
  secondaryTypes?: SearchType[]

  // Confidence level
  confidence: number // 0.0 ~ 1.0

  // Legal query type
  legalQueryType: LegalQueryType

  // Domain
  domain: LegalDomain

  // Extracted entities
  entities: ExtractedEntities

  // Preprocessed query for RAG
  preprocessedQuery: string

  // Additional metadata
  reason: string              // 분류 이유
  isCompound: boolean         // 복합 질문 여부
  matchedPatterns: string[]   // 매칭된 패턴 이름
}

/**
 * 기존 호환 인터페이스 - QueryDetectionResult
 */
export interface QueryDetectionResult {
  type: QueryType
  confidence: number
  reason: string
}

/**
 * 기존 호환 인터페이스 - LegalQueryAnalysis
 */
export interface LegalQueryAnalysis {
  type: LegalQueryType
  confidence: number
  extractedLaws: string[]
  extractedArticles: string[]
  keywords: string[]
}

/**
 * 기존 호환 인터페이스 - EnhancedLegalQueryAnalysis
 */
export interface EnhancedLegalQueryAnalysis extends LegalQueryAnalysis {
  domain: LegalDomain
  domainConfidence: number
  secondaryType?: LegalQueryType
  isCompound: boolean
  matchedEntities: string[]
}

/**
 * 기존 호환 인터페이스 - ProcessedQuery
 */
export interface ProcessedQuery {
  originalQuery: string
  processedQuery: string
  extractedLaws: string[]
  extractedArticles: string[]
  queryType: 'specific' | 'general' | 'comparison' | 'procedural'
  confidence: number
  metadataFilter?: string
}

/**
 * Classification에 Override 적용 (사용자 선택 반영)
 */
export function withOverride(
  classification: UnifiedQueryClassification,
  override: { searchType?: SearchType; confidence?: number }
): UnifiedQueryClassification {
  return {
    ...classification,
    searchType: override.searchType ?? classification.searchType,
    confidence: override.confidence ?? 1.0, // 사용자 선택은 확실
    reason: `${classification.reason} (사용자 선택)`
  }
}

/**
 * 빈 Classification 생성
 */
export function createEmptyClassification(): UnifiedQueryClassification {
  return {
    searchType: 'law',
    confidence: 0.5,
    legalQueryType: 'application',
    domain: 'general',
    entities: {},
    preprocessedQuery: '',
    reason: '빈 쿼리',
    isCompound: false,
    matchedPatterns: []
  }
}
