/**
 * 검색 쿼리 타입 감지 유틸리티
 *
 * 기본 검색 vs RAG(자연어 검색) 자동 판별
 */

export type QueryType = 'structured' | 'natural'

interface QueryDetectionResult {
  type: QueryType
  confidence: number // 0-1 범위
  reason: string
}

/**
 * 검색 쿼리가 구조화된 법령 검색인지, 자연어 질문인지 자동 판별
 *
 * @param query 사용자 입력 검색어
 * @returns QueryDetectionResult
 *
 * @example
 * detectQueryType("관세법 38조")
 * // → { type: 'structured', confidence: 0.95, reason: '조문 번호 포함' }
 *
 * detectQueryType("수출통관 시 필요한 서류는 무엇인가요?")
 * // → { type: 'natural', confidence: 0.9, reason: '질문형 패턴' }
 */
export function detectQueryType(query: string): QueryDetectionResult {
  const trimmedQuery = query.trim()

  // 빈 쿼리
  if (!trimmedQuery) {
    return {
      type: 'structured',
      confidence: 0.5,
      reason: '빈 쿼리'
    }
  }

  // 패턴 1: 조문 번호가 명시된 경우
  const articlePattern = /제?\s*\d+\s*조(?:의\s*\d+)?/
  const hasArticleNumber = articlePattern.test(trimmedQuery)

  // 1-1: "법령명 + 조번호"만 있는 경우 → 구조화 검색 (예: "관세법 38조")
  if (hasArticleNumber) {
    const lengthAfterArticle = trimmedQuery.replace(articlePattern, '').trim().length

    // 조문 번호 뒤에 추가 텍스트가 거의 없으면 구조화 검색
    if (lengthAfterArticle <= 5) {
      return {
        type: 'structured',
        confidence: 0.98,
        reason: '조문 번호만 포함 (추가 질문 없음)'
      }
    }

    // 조문 번호 + 긴 질문이 있으면 자연어로 간주
    // 예: "관세법 38조에 대해 알려줘" (뒤에 10글자 추가)
    if (lengthAfterArticle > 5) {
      return {
        type: 'natural',
        confidence: 0.9,
        reason: '조문 번호 + 자연어 질문 혼합'
      }
    }
  }

  // 패턴 2: 질문 종결어미 → 자연어 검색
  const questionEndings = /[?？]$|인가요?$|인지요?$|될까요?$|되나요?$|습니까?$|니까?$|알려줘|설명해줘|가르쳐줘|말해줘$/
  if (questionEndings.test(trimmedQuery)) {
    return {
      type: 'natural',
      confidence: 0.95,
      reason: '질문형 종결어미'
    }
  }

  // 패턴 2-1: "~에 대해" 패턴
  const aboutPattern = /에\s*대해/
  if (aboutPattern.test(trimmedQuery)) {
    return {
      type: 'natural',
      confidence: 0.9,
      reason: '"~에 대해" 패턴'
    }
  }

  // 패턴 3: 질문 의문사 포함
  const questionWords = /(무엇|어떻게|어떤|왜|언제|어디서|누가|어느)/
  if (questionWords.test(trimmedQuery)) {
    return {
      type: 'natural',
      confidence: 0.9,
      reason: '질문 의문사 포함'
    }
  }

  // 패턴 4: 조사 패턴 (은/는/이/가 + 명사 + 서술어)
  // 예: "관세법상 신고납부 제도의 요건은", "수출통관 절차가 궁금합니다"
  const sentencePattern = /(은|는|이|가|에서|에|를|을)\s*[가-힣\s]+\s*(무엇|어떻|알려|설명|궁금)/
  if (sentencePattern.test(trimmedQuery)) {
    return {
      type: 'natural',
      confidence: 0.85,
      reason: '문장형 패턴'
    }
  }

  // 패턴 5: 긴 쿼리 (15자 이상) → 자연어일 가능성 높음
  if (trimmedQuery.length >= 15) {
    // 단, 법령명이 길 수도 있으므로 신중하게
    const hasLawKeywords = /(법|령|규칙|조례|규정|지침|고시|훈령|예규)/g
    const lawKeywordCount = (trimmedQuery.match(hasLawKeywords) || []).length

    if (lawKeywordCount === 1 && trimmedQuery.length < 25) {
      // "지방자치단체를 당사자로 하는 계약에 관한 법률" 같은 긴 법령명
      return {
        type: 'structured',
        confidence: 0.7,
        reason: '긴 법령명으로 추정'
      }
    }

    return {
      type: 'natural',
      confidence: 0.75,
      reason: '긴 쿼리 (자연어 추정)'
    }
  }

  // 패턴 6: 짧은 단어 나열 (법령명 검색으로 추정)
  // 예: "관세법", "지방세법", "FTA특례법"
  if (trimmedQuery.length < 15) {
    return {
      type: 'structured',
      confidence: 0.8,
      reason: '짧은 법령명 쿼리'
    }
  }

  // 기본값: 애매한 경우 구조화 검색으로 (기존 동작 유지)
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
