/**
 * Query Classifier
 * 입력된 쿼리가 일반 검색인지 RAG 분석 모드인지 자동 감지
 */

export type QueryMode = 'simple-search' | 'rag-analysis'

export interface QueryClassification {
  mode: QueryMode
  confidence: number
  reasoning: string
}

/**
 * 입력된 쿼리가 일반 검색인지 RAG 모드인지 자동 감지
 */
export function classifyQuery(query: string): QueryClassification {
  const trimmedQuery = query.trim()

  // 1. 명확한 일반 검색 패턴 (높은 신뢰도)
  const simpleSearchPatterns = [
    // "관세법 38조", "형법 22조"
    /^[\w\s가-힣]+\s*\d+조$/,
    // "관세법 제38조", "형법 제22조"
    /^[\w\s가-힣]+\s*제\d+조$/,
    // "관세법 38조의2", "전기통신사업법 35조의2"
    /^[\w\s가-힣]+\s*\d+조의\d+$/,
    // "제38조" (단독 조문 번호)
    /^제\d+조(의\d+)?$/,
    // 단일 법령명만 (조문 번호 없음)
    /^[\w가-힣\s]+법$/,
    /^[\w가-힣\s]+령$/,
    /^[\w가-힣\s]+규칙$/,
    // 법령명 + 키워드 (예: "도로법 점용허가", "건축법 용도변경")
    /^[\w가-힣\s]+법\s+[\w가-힣]+$/,
    /^[\w가-힣\s]+령\s+[\w가-힣]+$/,
    /^[\w가-힣\s]+규칙\s+[\w가-힣]+$/,
  ]

  for (const pattern of simpleSearchPatterns) {
    if (pattern.test(trimmedQuery)) {
      return {
        mode: 'simple-search',
        confidence: 0.95,
        reasoning: '조문 번호 또는 단일 법령명 패턴 감지',
      }
    }
  }

  // 2. RAG 모드 트리거 키워드 (강력한 신호)
  const ragKeywords = {
    // 분석 요청
    analysis: ['분석', '분석해', '분석해줘', '분석하라', '분석하세요'],
    // 비교 요청
    comparison: ['비교', '비교해', '비교해줘', '차이', '차이점', '대비'],
    // 설명 요청
    explanation: ['설명해', '설명', '알려줘', '알려주세요', '무엇', '어떻게', '왜'],
    // 찾기/검색 요청 (복잡한 형태)
    search: ['찾아줘', '찾아주세요', '검색해줘', '보여줘'],
    // 질문 형태
    question: ['?', '？', '인지', '인가요'],
    // 관계 분석
    relation: ['관련', '연관', '영향', '관계'],
    // 요약/정리
    summary: ['요약', '정리', '요약해', '정리해'],
  }

  let hasRagKeyword = false
  let matchedCategory = ''

  for (const [category, keywords] of Object.entries(ragKeywords)) {
    if (keywords.some((keyword) => trimmedQuery.includes(keyword))) {
      hasRagKeyword = true
      matchedCategory = category
      break
    }
  }

  // 3. 복잡도 분석
  const wordCount = trimmedQuery.split(/\s+/).length

  // 복수 지역 감지 (예: "광진구와 성동구")
  const regionPattern = /([가-힣]+구|[가-힣]+시|[가-힣]+도)/g
  const regions = trimmedQuery.match(regionPattern) || []
  const hasMultipleRegions = regions.length > 1

  // 접속사 감지 (복수 대상 암시)
  const hasConjunction =
    trimmedQuery.includes('와') ||
    trimmedQuery.includes('과') ||
    trimmedQuery.includes('그리고') ||
    trimmedQuery.includes(',')

  // 4. 최종 판단
  if (hasRagKeyword) {
    return {
      mode: 'rag-analysis',
      confidence: 0.9,
      reasoning: `RAG 키워드 감지: ${matchedCategory}`,
    }
  }

  if (hasMultipleRegions && hasConjunction) {
    return {
      mode: 'rag-analysis',
      confidence: 0.85,
      reasoning: '복수 대상 비교 패턴 감지 (지역 + 접속사)',
    }
  }

  if (wordCount > 6) {
    return {
      mode: 'rag-analysis',
      confidence: 0.7,
      reasoning: '긴 문장 패턴 (7단어 이상)',
    }
  }

  // 5. 애매한 경우 또는 짧은 일반 검색
  if (wordCount <= 3 && !hasConjunction) {
    return {
      mode: 'simple-search',
      confidence: 0.6,
      reasoning: '짧은 단순 검색 쿼리',
    }
  }

  // 6. 기본값: 애매하면 일반 검색
  return {
    mode: 'simple-search',
    confidence: 0.5,
    reasoning: '명확하지 않음 - 일반 검색으로 우선 처리',
  }
}

/**
 * 신뢰도가 낮을 때 사용자에게 확인이 필요한지 판단
 */
export function needsUserConfirmation(classification: QueryClassification): boolean {
  return classification.confidence < 0.75
}

/**
 * 쿼리 분류 결과를 콘솔에 로깅 (디버깅용)
 */
export function logClassification(query: string, classification: QueryClassification) {
  console.log('🔍 [Query Classification]', {
    query,
    mode: classification.mode,
    confidence: `${(classification.confidence * 100).toFixed(0)}%`,
    reasoning: classification.reasoning,
    needsConfirmation: needsUserConfirmation(classification),
  })
}
