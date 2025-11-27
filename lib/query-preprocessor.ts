/**
 * RAG 쿼리 전처리 파이프라인 (Phase 4 - B4)
 *
 * 사용자 입력을 File Search에 최적화된 형태로 변환
 */

export interface ProcessedQuery {
  originalQuery: string
  processedQuery: string
  extractedLaws: string[]      // 쿼리에서 추출된 법령명
  extractedArticles: string[]  // 쿼리에서 추출된 조문 번호
  queryType: 'specific' | 'general' | 'comparison' | 'procedural'
  confidence: number           // 전처리 신뢰도 (0-1)
  metadataFilter?: string      // Phase 6 C7: Metadata Filter
}

export async function preprocessQuery(query: string): Promise<ProcessedQuery> {
  const originalQuery = query
  let processedQuery = query

  // 1. 법령명 추출 및 정규화
  const extractedLaws = extractLawNames(query)

  // 2. 조문 번호 추출 및 정규화
  const extractedArticles = extractArticleNumbers(query)
  processedQuery = normalizeArticleFormat(processedQuery)

  // 3. 띄어쓰기 정규화
  processedQuery = normalizeLawSpacing(processedQuery)

  // 4. 질문 유형 분류
  const queryType = classifyQueryType(query, extractedLaws, extractedArticles)

  // 5. 불필요한 조사/어미 제거 (검색 최적화)
  processedQuery = removeSearchNoise(processedQuery)

  // 6. Phase 6 C7: Metadata Filter 구성
  const metadataFilter = buildMetadataFilter(query, extractedLaws)

  return {
    originalQuery,
    processedQuery,
    extractedLaws,
    extractedArticles,
    queryType,
    confidence: calculateConfidence(extractedLaws, extractedArticles),
    metadataFilter
  }
}

// 법령명 추출
function extractLawNames(query: string): string[] {
  const laws: string[] = []

  // 「법령명」 패턴
  const bracketMatches = query.matchAll(/「([^」]+)」/g)
  for (const match of bracketMatches) {
    laws.push(match[1])
  }

  // 일반 법령명 패턴 (법, 령, 규칙, 조례로 끝나는 단어)
  const generalMatches = query.matchAll(/([가-힣]+(?:법|령|규칙|조례))/g)
  for (const match of generalMatches) {
    if (!laws.includes(match[1])) {
      laws.push(match[1])
    }
  }

  return laws
}

// 조문 번호 추출
function extractArticleNumbers(query: string): string[] {
  const articles: string[] = []

  // "제N조", "제N조의M", "N조" 패턴
  const matches = query.matchAll(/제?(\d+)조(?:의(\d+))?/g)
  for (const match of matches) {
    const articleNum = match[2]
      ? `제${match[1]}조의${match[2]}`
      : `제${match[1]}조`
    if (!articles.includes(articleNum)) {
      articles.push(articleNum)
    }
  }

  return articles
}

// 조문 형식 정규화
function normalizeArticleFormat(query: string): string {
  // "38조" → "제38조" (단, "제38조"는 유지)
  return query.replace(/(?<!제)(\d+)조/g, '제$1조')
}

// 법령명 띄어쓰기 정규화
function normalizeLawSpacing(query: string): string {
  // "관세법시행령" → "관세법 시행령"
  return query
    .replace(/(법)(시행령)/g, '$1 $2')
    .replace(/(법)(시행규칙)/g, '$1 $2')
    .replace(/(령)(시행규칙)/g, '$1 $2')
}

// 질문 유형 분류
function classifyQueryType(
  query: string,
  laws: string[],
  articles: string[]
): 'specific' | 'general' | 'comparison' | 'procedural' {
  // 비교 질문
  if (query.includes('차이') || query.includes('비교') || query.includes('다른')) {
    return 'comparison'
  }

  // 절차 질문
  if (query.includes('절차') || query.includes('방법') || query.includes('어떻게')) {
    return 'procedural'
  }

  // 특정 조문 질문
  if (articles.length > 0) {
    return 'specific'
  }

  // 일반 질문
  return 'general'
}

// 검색 노이즈 제거
function removeSearchNoise(query: string): string {
  // 질문 어미 제거
  return query
    .replace(/\?$/, '')
    .replace(/(인가요|인지요|할까요|일까요|나요|는지|은지)$/, '')
    .trim()
}

// 전처리 신뢰도 계산
function calculateConfidence(laws: string[], articles: string[]): number {
  if (laws.length > 0 && articles.length > 0) return 1.0
  if (laws.length > 0) return 0.8
  if (articles.length > 0) return 0.6
  return 0.4
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 6 C7: Metadata Filter 구성
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function buildMetadataFilter(query: string, extractedLaws: string[]): string | undefined {
  // 1. 시행령 명시적 언급
  if (query.includes('시행령') && !query.includes('시행규칙')) {
    return 'law_type="시행령"'
  }

  // 2. 시행규칙 명시적 언급
  if (query.includes('시행규칙')) {
    return 'law_type="시행규칙"'
  }

  // 3. 조례 언급
  if (query.includes('조례')) {
    return 'law_type="조례"'
  }

  // 4. 특정 법령명이 1개만 있으면 해당 법령군 필터
  if (extractedLaws.length === 1) {
    const lawName = extractedLaws[0]
    // "관세법" → law_name CONTAINS "관세법" (시행령, 시행규칙 제외)
    const baseLawName = lawName.replace(/\s*(시행령|시행규칙)$/, '')
    return `law_name CONTAINS "${baseLawName}"`
  }

  // 5. 필터 없음 (전체 검색)
  return undefined
}
