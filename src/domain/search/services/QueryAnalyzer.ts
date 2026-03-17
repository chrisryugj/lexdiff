/**
 * QueryAnalyzer - 쿼리 분석 서비스
 *
 * 법률 질문 유형 분석 및 쿼리 타입 감지
 */

import type { LegalQueryType } from '../value-objects/LegalQueryType'
import type { QueryType } from '../value-objects/SearchType'
import type { QueryDetectionResult } from '../entities/Classification'
import { DEFINITIVE_ENDING_PATTERNS, PRIORITY_KEYWORDS } from '../value-objects/LegalQueryType'
import { QUESTION_ENDINGS, QUESTION_WORDS, isPureLawName } from '../../patterns/LawPattern'

export interface LegalQuestionAnalysis {
  type: LegalQueryType
  confidence: number
  keywords: string[]
}

/**
 * 법률 질문 유형 분석
 * 우선순위 기반 패턴 매칭
 */
export function analyzeLegalQuestion(
  query: string,
  _extractedLaws: string[],
  extractedArticles: string[]
): LegalQuestionAnalysis {
  // 1. 종결어미 확정 패턴 우선 검사 (100% 신뢰도)
  for (const { pattern, type, confidence } of DEFINITIVE_ENDING_PATTERNS) {
    if (pattern.test(query)) {
      return {
        type,
        confidence,
        keywords: [pattern.source]
      }
    }
  }

  // 2. 우선순위 기반 키워드 매칭 (충돌 해결)
  const sortedTypes = Object.entries(PRIORITY_KEYWORDS).sort(
    (a, b) => a[1].priority - b[1].priority
  )

  for (const [typeStr, { patterns }] of sortedTypes) {
    const type = typeStr as LegalQueryType
    for (const pattern of patterns) {
      if (pattern.test(query)) {
        return {
          type,
          confidence: 0.95,
          keywords: [pattern.source]
        }
      }
    }
  }

  // 3. 특정 조문 언급 + 질문 종결어미 없음 = definition
  if (extractedArticles.length > 0 && !/[?요까지]/.test(query)) {
    return {
      type: 'definition',
      confidence: 0.7,
      keywords: []
    }
  }

  // 4. Fallback: application (가장 빈번)
  return {
    type: 'application',
    confidence: 0.5,
    keywords: []
  }
}

/**
 * 기본 쿼리 타입 감지 (structured vs natural)
 */
export function detectQueryType(query: string): QueryDetectionResult {
  const trimmedQuery = query.trim()

  if (!trimmedQuery) {
    return {
      type: 'structured',
      confidence: 0.5,
      reason: '빈 쿼리'
    }
  }

  // 패턴 1: 조문 번호가 명시된 경우
  // "제38조", "제38조의2", "제38조 제1항", "제38조 제1항 제2호" 모두 매칭
  const articlePattern = /제?\s*\d+\s*조(?:의\s*\d+)?(?:\s*제?\s*\d+\s*항)?(?:\s*제?\s*\d+\s*호)?/
  const hasArticleNumber = articlePattern.test(trimmedQuery)

  if (hasArticleNumber) {
    const textWithoutArticle = trimmedQuery.replace(articlePattern, '').trim()

    if (isPureLawName(textWithoutArticle)) {
      return {
        type: 'structured',
        confidence: 0.98,
        reason: '순수 법령명 + 조문 번호'
      }
    }

    const questionKeywordsAfterArticle = /(요건|내용|설명|의미|뜻|정의|무엇|어떻게|어떤|왜|언제|어디|누가|인가|될까|되나|습니까|니까|알려|설명|가르|말해|찾아|보여|궁금|에\s*대해)/
    if (questionKeywordsAfterArticle.test(trimmedQuery)) {
      return {
        type: 'natural',
        confidence: 0.95,
        reason: '조문 번호 + 질문 키워드'
      }
    }

    if (textWithoutArticle && !isPureLawName(textWithoutArticle)) {
      return {
        type: 'natural',
        confidence: 0.85,
        reason: '조문 번호 + 추가 설명'
      }
    }

    return {
      type: 'structured',
      confidence: 0.9,
      reason: '조문 번호만 있음'
    }
  }

  // 패턴 2: 질문 종결어미
  if (QUESTION_ENDINGS.test(trimmedQuery)) {
    return {
      type: 'natural',
      confidence: 0.95,
      reason: '질문형 종결어미'
    }
  }

  // 패턴 3: 질문 의문사 포함
  if (QUESTION_WORDS.test(trimmedQuery)) {
    return {
      type: 'natural',
      confidence: 0.9,
      reason: '질문 의문사 포함'
    }
  }

  // 패턴 4: 긴 쿼리 (15자 이상)
  if (trimmedQuery.length >= 15) {
    if (isPureLawName(trimmedQuery)) {
      return {
        type: 'structured',
        confidence: 0.95,
        reason: '순수 법령명 (긴 법령명)'
      }
    }
    return {
      type: 'natural',
      confidence: 0.75,
      reason: '긴 쿼리 (자연어 추정)'
    }
  }

  // 패턴 5: 짧은 법령명
  if (trimmedQuery.length < 15) {
    if (isPureLawName(trimmedQuery)) {
      return {
        type: 'structured',
        confidence: 0.95,
        reason: '순수 법령명 (짧은 쿼리)'
      }
    }
    return {
      type: 'structured',
      confidence: 0.6,
      reason: '법령명 + 키워드 추정'
    }
  }

  return {
    type: 'structured',
    confidence: 0.6,
    reason: '불명확 (기본 검색)'
  }
}

/**
 * RAG 검색이 적합한지 여부만 간단히 체크
 */
export function isNaturalLanguageQuery(query: string): boolean {
  const result = detectQueryType(query)
  return result.type === 'natural' && result.confidence >= 0.75
}
