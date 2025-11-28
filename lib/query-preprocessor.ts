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
  // ✅ Phase 7 Fix: 숫자 앞에 "제"나 다른 숫자가 있으면 변환하지 않음
  // 예: "제38조" → 유지, "38조" → "제38조"
  return query.replace(/(?<!제)(?<!\d)(\d+)조/g, '제$1조')
}

// 법령명 띄어쓰기 정규화
function normalizeLawSpacing(query: string): string {
  // "관세법시행령" → "관세법 시행령"
  return query
    .replace(/(법)(시행령)/g, '$1 $2')
    .replace(/(법)(시행규칙)/g, '$1 $2')
    .replace(/(령)(시행규칙)/g, '$1 $2')
}

// ✅ Phase 7: 쿼리 분류 키워드 확장
const PROCEDURAL_KEYWORDS = [
  '절차', '방법', '어떻게', '신청', '과정', '단계',
  '등록', '허가', '신고', '제출', '접수', '발급',
  '취득', '갱신', '연장', '변경신고', '폐업'
]

const COMPARISON_KEYWORDS = [
  '차이', '비교', '다른', '구분', '구별', '다르게', '차별', '대비'
]

// 질문 유형 분류
function classifyQueryType(
  query: string,
  laws: string[],
  articles: string[]
): 'specific' | 'general' | 'comparison' | 'procedural' {
  // 비교 질문 (확장된 키워드)
  if (COMPARISON_KEYWORDS.some(kw => query.includes(kw))) {
    return 'comparison'
  }

  // 절차 질문 (확장된 키워드)
  if (PROCEDURAL_KEYWORDS.some(kw => query.includes(kw))) {
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
// ⚠️ 비활성화 유지 권장: 전체 검색이 더 나은 결과 제공
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 📌 Google File Search API Metadata Filter 문법 (AIP-160):
// - 정확히 일치: key="value" (예: law_name="관세법")
// - ❌ CONTAINS 미지원 - 부분 매칭 불가
// - ❌ LIKE 미지원
// - 참고: https://google.aip.dev/160
//
// 📌 customMetadata 키 (upload-parsed-law/route.ts에서 설정):
// - law_name: 법령명 (예: "관세법")
// - law_type: "법률" (고정값)
// - file_name, source, uploaded_at
//
// 📌 비활성화 이유:
// 1. 정확히 일치만 지원 → "관세법"으로 필터하면 "관세법 시행령" 제외됨
// 2. 사용자가 "관세법"이라고 해도 시행령/시행규칙이 더 적절할 수 있음
// 3. 전체 검색이 더 넓은 범위에서 관련 조문 검색
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function buildMetadataFilter(_query: string, _extractedLaws: string[]): string | undefined {
  // 비활성화 유지
  return undefined

  // 재활성화 시 올바른 문법 예시:
  // if (query.includes('시행령')) return 'law_type="시행령"'
  // if (extractedLaws.length === 1) return `law_name="${extractedLaws[0]}"`
}
