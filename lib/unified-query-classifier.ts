/**
 * 통합 쿼리 분류기 - Facade Layer
 *
 * 클린 아키텍처 적용: 기존 API 100% 호환 유지
 * 내부적으로 src/domain/ 서비스 호출
 *
 * @updated 2026-01-21 클린 아키텍처 리팩토링
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 타입 Re-export (하위 호환)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type { QueryType, SearchMode, SearchType } from '@/src/domain/search/value-objects/SearchType'
export type { LegalQueryType } from '@/src/domain/search/value-objects/LegalQueryType'
export type { LegalDomain } from '@/src/domain/search/value-objects/LegalDomain'
export type {
  UnifiedQueryClassification,
  QueryDetectionResult,
  LegalQueryAnalysis,
  EnhancedLegalQueryAnalysis,
  ProcessedQuery
} from '@/src/domain/search/entities/Classification'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 함수 Re-export (핵심)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 메인 분류 함수
export { classifySearchQuery } from '@/src/domain/search/services/QueryClassifier'

// 쿼리 타입 감지
export { detectQueryType, isNaturalLanguageQuery } from '@/src/domain/search/services/QueryAnalyzer'

// 호환 함수들
export {
  getSearchMode,
  analyzeLegalQuery,
  analyzeEnhancedLegalQuery,
  getQueryTypeForPrompt,
  preprocessQuery
} from '@/src/domain/search/services/CompatibilityLayer'

// 테스트 함수
export { runTests } from '@/src/domain/search/services/QueryClassifierTests'
