/**
 * QueryClassifier - 핵심 쿼리 분류 서비스
 *
 * 통합 검색 쿼리를 7가지 타입으로 분류
 * 우선순위: 판례 > 재결례 > 해석례 > 복합 > 법령/조례 > AI
 */

import type { SearchType } from '../value-objects/SearchType'
import type { UnifiedQueryClassification, ExtractedEntities } from '../entities/Classification'
import { createEmptyClassification } from '../entities/Classification'
import { calculateHarmonicMean } from '../value-objects/Confidence'

// Services
import { extractLaws, extractArticles, preprocessForRAG } from './EntityExtractor'
import {
  detectPrecedentPattern,
  detectRulingPattern,
  detectInterpretationPattern,
  detectCompoundQuery
} from './PatternDetector'
import { detectDomain } from './DomainDetector'
import { detectQueryType, analyzeLegalQuestion } from './QueryAnalyzer'

// Patterns
import { isOrdinanceQuery, containsLocalGovName, LAW_ENFORCEMENT_PATTERN } from '../../patterns/OrdinancePattern'
import { isAdminRuleName } from '../../patterns/LawPattern'

/**
 * 통합 검색 쿼리 분류 함수 (메인)
 *
 * 우선순위:
 * 1. 판례/재결례/해석례 패턴 감지 (최우선)
 * 2. 복합 쿼리 감지
 * 3. 법령/조례 패턴 감지
 * 4. AI 질문 감지
 */
export function classifySearchQuery(query: string): UnifiedQueryClassification {
  const trimmedQuery = query.trim()

  // 빈 쿼리 처리
  if (!trimmedQuery) {
    return createEmptyClassification()
  }

  const matchedPatterns: string[] = []

  // 1. 엔티티 추출
  const extractedLaws = extractLaws(trimmedQuery)
  const extractedArticles = extractArticles(trimmedQuery)

  // 2. 판례/재결례/해석례 패턴 감지 (최우선)
  const precedentPattern = detectPrecedentPattern(trimmedQuery)
  const rulingPattern = detectRulingPattern(trimmedQuery)
  const interpretationPattern = detectInterpretationPattern(trimmedQuery)

  // 3. 조례 판별 (명시적 키워드 or 지역명 포함 + 법령 키워드 없음)
  const isOrdinance = isOrdinanceQuery(trimmedQuery) ||
    (!LAW_ENFORCEMENT_PATTERN.test(trimmedQuery) &&
     !/(법|법률|시행령|규정)/.test(trimmedQuery) &&
     containsLocalGovName(trimmedQuery))

  // 4. 기본 쿼리 타입 감지
  const basicDetection = detectQueryType(trimmedQuery)

  // 5. 법률 질문 유형 분석
  const legalQuestion = analyzeLegalQuestion(trimmedQuery, extractedLaws, extractedArticles)

  // 6. 도메인 감지
  const domainResult = detectDomain(trimmedQuery, extractedLaws)

  // 7. 복합 쿼리 감지
  const compoundQuery = detectCompoundQuery(trimmedQuery)

  // 8. 쿼리 전처리
  const preprocessedQuery = preprocessForRAG(trimmedQuery)

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 9. SearchType 결정 (우선순위 기반)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  let searchType: SearchType
  let confidence: number
  let reason: string

  // 우선순위 1: 판례
  if (precedentPattern.matched) {
    searchType = 'precedent'
    confidence = 0.99
    reason = '판례번호 패턴 감지'
    matchedPatterns.push('precedent')
  }
  // 우선순위 2: 재결례
  else if (rulingPattern.matched) {
    searchType = 'ruling'
    confidence = 0.98
    reason = '재결번호 패턴 감지'
    matchedPatterns.push('ruling')
  }
  // 우선순위 3: 해석례
  else if (interpretationPattern.matched) {
    searchType = 'interpretation'
    confidence = 0.95
    reason = '해석례 키워드 감지'
    matchedPatterns.push('interpretation')
  }
  // 우선순위 4: 복합 쿼리
  else if (compoundQuery.isCompound) {
    searchType = 'multi'
    confidence = 0.85
    reason = '복합 쿼리 감지'
    matchedPatterns.push('multi')
  }
  // 우선순위 5: 행정규칙 (고시/훈령/예규/지침)
  else if (isAdminRuleName(trimmedQuery)) {
    searchType = 'admrul'
    confidence = 0.95
    reason = '행정규칙명 감지'
    matchedPatterns.push('admrul')
  }
  // 우선순위 6: 법령/조례 (구조화 검색)
  else if (basicDetection.type === 'structured' && basicDetection.confidence >= 0.9) {
    searchType = isOrdinance ? 'ordinance' : 'law'
    confidence = basicDetection.confidence
    reason = basicDetection.reason
    matchedPatterns.push(isOrdinance ? 'ordinance' : 'law')
  }
  // 우선순위 6: AI 질문 (자연어 검색)
  else if (basicDetection.type === 'natural' && basicDetection.confidence >= 0.75) {
    searchType = 'ai'
    // confidence: detectQueryType가 natural로 확실히 판단하면 최소 0.7 보장
    // (legalQuestion fallback 0.5가 조화평균으로 전체를 끌어내리는 문제 방지)
    const harmonicMean = calculateHarmonicMean(basicDetection.confidence, legalQuestion.confidence)
    confidence = Math.max(harmonicMean, Math.min(basicDetection.confidence, 0.75))
    reason = basicDetection.reason
    matchedPatterns.push('ai')
  }
  // 우선순위 8: 애매한 경우 (법령 우선)
  else {
    if (legalQuestion.type === 'definition' &&
        extractedArticles.length > 0 &&
        extractedLaws.length > 0) {
      searchType = isOrdinance ? 'ordinance' : 'law'
      confidence = 0.7
      reason = '법령 + 조문 추정'
      matchedPatterns.push('law')
    } else if (basicDetection.type === 'natural' && legalQuestion.confidence >= 0.7) {
      // basicDetection이 natural일 때만 AI — structured인데 토픽 키워드만 있는 건 법령 검색
      searchType = 'ai'
      confidence = legalQuestion.confidence
      reason = '자연어 질문 추정'
      matchedPatterns.push('ai')
    } else if (isAdminRuleName(trimmedQuery)) {
      searchType = 'admrul'
      confidence = 0.75
      reason = '행정규칙명 추정'
      matchedPatterns.push('admrul')
    } else {
      searchType = isOrdinance ? 'ordinance' : 'law'
      // 조례 패턴 매칭 시 confidence 상향 (다이얼로그 방지)
      confidence = isOrdinance ? 0.75 : 0.6
      reason = isOrdinance ? '조례 패턴 감지' : '기본 법령 검색'
      matchedPatterns.push(isOrdinance ? 'ordinance' : 'law')
    }
  }

  // 엔티티 구성
  const entities: ExtractedEntities = {
    lawName: extractedLaws[0],
    articleNumber: extractedArticles[0],
    caseNumber: precedentPattern.caseNumber,
    court: precedentPattern.court,
    ruleType: interpretationPattern.ruleType,
    interpretationType: interpretationPattern.interpretationType,
    rulingNumber: rulingPattern.rulingNumber
  }

  // 10. 최종 결과 반환
  return {
    searchType,
    secondaryTypes: compoundQuery.isCompound ? compoundQuery.types as SearchType[] : undefined,
    confidence,
    legalQueryType: legalQuestion.type,
    domain: domainResult.domain,
    entities,
    preprocessedQuery,
    reason: domainResult.domain !== 'general'
      ? `${reason} + ${domainResult.domain} 도메인`
      : reason,
    isCompound: compoundQuery.isCompound,
    matchedPatterns
  }
}
