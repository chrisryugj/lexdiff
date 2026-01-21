/**
 * CompatibilityLayer - 하위 호환 함수들
 *
 * 기존 코드와의 호환성을 위한 어댑터 함수들
 */

import type { SearchMode } from '../value-objects/SearchType'
import type { LegalQueryType } from '../value-objects/LegalQueryType'
import type { LegalDomain } from '../value-objects/LegalDomain'
import type {
  LegalQueryAnalysis,
  EnhancedLegalQueryAnalysis,
  ProcessedQuery
} from '../entities/Classification'

import { classifySearchQuery } from './QueryClassifier'
import { extractLaws, extractArticles } from './EntityExtractor'
import { detectDomain } from './DomainDetector'
import { analyzeLegalQuestion } from './QueryAnalyzer'

/**
 * query-detector.ts 호환 함수
 * SearchType → SearchMode 변환
 */
export function getSearchMode(query: string): SearchMode {
  const classification = classifySearchQuery(query)

  if (
    classification.searchType === 'precedent' ||
    classification.searchType === 'interpretation' ||
    classification.searchType === 'ruling' ||
    classification.searchType === 'multi'
  ) {
    return 'ai'
  }
  if (classification.searchType === 'ordinance') return 'ordinance'
  if (classification.searchType === 'law') return 'law'
  return 'ai'
}

/**
 * legal-query-analyzer.ts 호환 함수
 */
export function analyzeLegalQuery(query: string): LegalQueryAnalysis {
  const extractedLaws = extractLaws(query)
  const extractedArticles = extractArticles(query)
  const legalQuestion = analyzeLegalQuestion(query, extractedLaws, extractedArticles)

  return {
    type: legalQuestion.type,
    confidence: legalQuestion.confidence,
    extractedLaws,
    extractedArticles,
    keywords: legalQuestion.keywords
  }
}

/**
 * 확장 법률 쿼리 분석
 */
export function analyzeEnhancedLegalQuery(query: string): EnhancedLegalQueryAnalysis {
  const baseAnalysis = analyzeLegalQuery(query)
  const domainResult = detectDomain(query, baseAnalysis.extractedLaws)
  const classification = classifySearchQuery(query)

  return {
    ...baseAnalysis,
    domain: domainResult.domain,
    domainConfidence: domainResult.confidence,
    secondaryType: undefined,
    isCompound: classification.isCompound,
    matchedEntities: domainResult.matchedTerms
  }
}

/**
 * 프롬프트용 쿼리 타입 정보 추출
 */
export function getQueryTypeForPrompt(query: string): {
  queryType: string
  extractedLaws: string[]
  extractedArticles: string[]
  confidence: number
} {
  const analysis = analyzeLegalQuery(query)

  const typeMapping: Record<LegalQueryType, string> = {
    definition: 'general',
    requirement: 'general',
    procedure: 'procedural',
    comparison: 'comparison',
    application: 'general',
    consequence: 'general',
    scope: 'general',
    exemption: 'general'
  }

  return {
    queryType: typeMapping[analysis.type],
    extractedLaws: analysis.extractedLaws,
    extractedArticles: analysis.extractedArticles,
    confidence: analysis.confidence
  }
}

/**
 * query-preprocessor.ts 호환 함수
 */
export async function preprocessQuery(query: string): Promise<ProcessedQuery> {
  const classification = classifySearchQuery(query)

  let queryType: 'specific' | 'general' | 'comparison' | 'procedural'
  if (classification.legalQueryType === 'comparison') {
    queryType = 'comparison'
  } else if (classification.legalQueryType === 'procedure') {
    queryType = 'procedural'
  } else if (classification.entities.articleNumber) {
    queryType = 'specific'
  } else {
    queryType = 'general'
  }

  return {
    originalQuery: query,
    processedQuery: classification.preprocessedQuery,
    extractedLaws: classification.entities.lawName ? [classification.entities.lawName] : [],
    extractedArticles: classification.entities.articleNumber ? [classification.entities.articleNumber] : [],
    queryType,
    confidence: classification.confidence,
    metadataFilter: undefined
  }
}
