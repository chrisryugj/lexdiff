/**
 * ai-law-inference.ts
 *
 * AI 답변 모드에서 법령명을 자동으로 추론하는 로직
 * - 사용자 질의 분석
 * - 관련 법령 목록 분석
 * - AI 답변 내용 분석
 * - Citations 분석
 */

import type { ParsedRelatedLaw } from './law-parser'

export interface LawInferenceContext {
  /** 사용자의 원본 질의 */
  userQuery?: string
  /** AI가 추출한 관련 법령 목록 */
  relatedLaws?: ParsedRelatedLaw[]
  /** AI 답변 전체 내용 */
  aiAnswerContent?: string
  /** File Search Citations (있는 경우) */
  citations?: Array<{
    lawName: string
    articleNum?: string
    source?: string
  }>
}

export interface InferredLaw {
  lawName: string
  confidence: number  // 0-1
  reason: string
}

/**
 * 조문 번호(예: "제39조")로부터 법령명을 추론
 *
 * @param articleLabel 조문 번호 (예: "제39조", "제10조의2")
 * @param context 추론에 사용할 컨텍스트 정보
 * @returns 추론된 법령명과 신뢰도
 */
export function inferLawNameFromArticle(
  articleLabel: string,
  context: LawInferenceContext
): InferredLaw | null {
  const candidates: InferredLaw[] = []

  // 1. Citations에서 정확한 조문 매칭 (가장 높은 우선순위)
  if (context.citations && context.citations.length > 0) {
    for (const citation of context.citations) {
      if (citation.articleNum === articleLabel) {
        candidates.push({
          lawName: citation.lawName,
          confidence: 0.95,
          reason: `Citations에서 정확히 일치 (${articleLabel})`
        })
      }
    }
  }

  // 2. 관련 법령 목록에서 조문 매칭
  if (context.relatedLaws && context.relatedLaws.length > 0) {
    for (const law of context.relatedLaws) {
      if (law.article === articleLabel) {
        candidates.push({
          lawName: law.lawName,
          confidence: 0.9,
          reason: `관련 법령 목록에서 정확히 일치 (${articleLabel})`
        })
      }
    }
  }

  // 3. AI 답변 내용에서 조문이 언급된 법령 찾기
  if (context.aiAnswerContent) {
    const lawMentions = extractLawMentionsWithArticle(context.aiAnswerContent, articleLabel)
    for (const lawName of lawMentions) {
      candidates.push({
        lawName,
        confidence: 0.8,
        reason: `AI 답변에서 "${lawName} ${articleLabel}" 언급 발견`
      })
    }
  }

  // 4. 사용자 질의에서 법령명 추출
  if (context.userQuery) {
    const queryLaws = extractLawNamesFromQuery(context.userQuery)
    if (queryLaws.length > 0) {
      // 질의에 법령이 하나만 있으면 높은 확률로 그 법령
      if (queryLaws.length === 1) {
        candidates.push({
          lawName: queryLaws[0],
          confidence: 0.7,
          reason: `사용자 질의에서 유일한 법령명 "${queryLaws[0]}" 발견`
        })
      } else {
        // 여러 법령이 있으면 낮은 확률
        for (const lawName of queryLaws) {
          candidates.push({
            lawName,
            confidence: 0.5,
            reason: `사용자 질의에서 법령명 "${lawName}" 발견 (다중 법령)`
          })
        }
      }
    }
  }

  // 5. Citations에서 가장 빈번하게 언급된 법령 (fallback)
  if (context.citations && context.citations.length > 0 && candidates.length === 0) {
    const citationCounts = new Map<string, number>()
    for (const citation of context.citations) {
      citationCounts.set(citation.lawName, (citationCounts.get(citation.lawName) || 0) + 1)
    }

    const mostFrequent = Array.from(citationCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]

    if (mostFrequent) {
      candidates.push({
        lawName: mostFrequent[0],
        confidence: 0.6,
        reason: `Citations에서 가장 많이 언급됨 (${mostFrequent[1]}회)`
      })
    }
  }

  // 6. 관련 법령 목록의 첫 번째 법령 (최후의 fallback)
  if (context.relatedLaws && context.relatedLaws.length > 0 && candidates.length === 0) {
    candidates.push({
      lawName: context.relatedLaws[0].lawName,
      confidence: 0.4,
      reason: `관련 법령 목록의 첫 번째 법령 (fallback)`
    })
  }

  // 신뢰도가 가장 높은 후보 선택
  if (candidates.length === 0) {
    return null
  }

  candidates.sort((a, b) => b.confidence - a.confidence)
  return candidates[0]
}

/**
 * AI 답변 내용에서 특정 조문과 함께 언급된 법령명 추출
 *
 * 예: "관세법 제39조에 따르면..." → ["관세법"]
 */
function extractLawMentionsWithArticle(content: string, articleLabel: string): string[] {
  const lawNames: string[] = []

  // 패턴: [법령명] [조문] 형태
  // 예: "관세법 제39조", "소득세법 제10조의2"
  const patterns = [
    // 직접 연결: "관세법 제39조"
    new RegExp(`([가-힣]{2,}법(?:령)?|[가-힣]{2,}규칙)\\s*${articleLabel.replace(/[()]/g, '\\$&')}`, 'g'),
    // 조사 포함: "관세법의 제39조", "소득세법에서 제39조"
    new RegExp(`([가-힣]{2,}법(?:령)?|[가-힣]{2,}규칙)[의에서]?\\s*${articleLabel.replace(/[()]/g, '\\$&')}`, 'g'),
  ]

  for (const pattern of patterns) {
    const matches = content.matchAll(pattern)
    for (const match of matches) {
      if (match[1]) {
        lawNames.push(match[1].trim())
      }
    }
  }

  // 중복 제거
  return Array.from(new Set(lawNames))
}

/**
 * 사용자 질의에서 법령명 추출
 *
 * 예: "관세법 제39조가 뭐야?" → ["관세법"]
 */
function extractLawNamesFromQuery(query: string): string[] {
  const lawNames: string[] = []

  // 법령명 패턴: [한글]법, [한글]법령, [한글]규칙
  const pattern = /([가-힣]{2,}(?:법(?:령)?|규칙))/g
  const matches = query.matchAll(pattern)

  for (const match of matches) {
    if (match[1]) {
      lawNames.push(match[1].trim())
    }
  }

  // 중복 제거
  return Array.from(new Set(lawNames))
}

/**
 * 법령명의 유사도를 계산 (간단한 문자열 일치 기반)
 */
function calculateLawNameSimilarity(name1: string, name2: string): number {
  const n1 = name1.replace(/\s+/g, '')
  const n2 = name2.replace(/\s+/g, '')

  if (n1 === n2) return 1.0
  if (n1.includes(n2) || n2.includes(n1)) return 0.8

  // 공통 부분 문자열 길이 비율
  let commonLength = 0
  for (let i = 0; i < Math.min(n1.length, n2.length); i++) {
    if (n1[i] === n2[i]) {
      commonLength++
    } else {
      break
    }
  }

  return commonLength / Math.max(n1.length, n2.length)
}
