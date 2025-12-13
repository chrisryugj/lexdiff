/**
 * 법률 질문 분석기 (Legal Query Analyzer)
 *
 * 30년 베테랑 법률 전문가 관점에서 질문을 6가지 유형으로 분류
 * - definition: 개념/정의 질문
 * - requirement: 요건/조건 질문
 * - procedure: 절차/방법 질문
 * - comparison: 비교 질문
 * - application: 적용 판단 질문 (가장 빈번, 70%)
 * - consequence: 효과/결과 질문
 */

export type LegalQueryType =
  | 'definition'    // 개념/정의
  | 'requirement'   // 요건/조건
  | 'procedure'     // 절차/방법
  | 'comparison'    // 비교
  | 'application'   // 적용 판단
  | 'consequence'   // 효과/결과

export interface LegalQueryAnalysis {
  type: LegalQueryType
  confidence: number  // 0.0 ~ 1.0
  extractedLaws: string[]
  extractedArticles: string[]
  keywords: string[]  // 매칭된 키워드들
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 질문 유형별 패턴 정의
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const QUERY_PATTERNS: Record<LegalQueryType, {
  keywords: string[]
  patterns: RegExp[]
  weight: number  // 기본 가중치 (빈도 반영)
}> = {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // definition: 개념/정의 질문
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  definition: {
    keywords: [
      '란', '이란', '정의', '뜻', '의미', '개념',
      '무엇', '무엇인가', '무엇인지', '무슨',
      '어떤 것', '어떤것'
    ],
    patterns: [
      /(.+)(이?란|이란)\s*(무엇|뭐|뭔가)/,      // ~란 무엇인가요
      /(.+)(의\s*정의|의\s*개념|의\s*뜻)/,      // ~의 정의
      /(.+)(은|는)\s*(무엇|뭐|뭔가)/,           // ~는 무엇인가요
      /^(.+)(이란|란)\?*$/,                     // ~란?
    ],
    weight: 0.05  // 5%
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // requirement: 요건/조건 질문
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  requirement: {
    keywords: [
      '요건', '조건', '자격', '필요', '갖춰야', '충족',
      '되려면', '하려면', '받으려면', '위해서는',
      '필수', '구비', '성립요건', '인정요건'
    ],
    patterns: [
      /(.+)(요건|조건|자격)(은|는|이)/,          // ~요건은
      /(.+)(하|되|받)(려면|으려면)/,            // ~하려면
      /(.+)(위해서는|위해서)/,                   // ~위해서는
      /(.+)(필요한|갖춰야\s*할)/,                // ~필요한
      /어떤\s*(요건|조건|자격)/,                 // 어떤 요건이
    ],
    weight: 0.10  // 10%
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // procedure: 절차/방법 질문
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  procedure: {
    keywords: [
      '절차', '과정', '순서', '단계', '방법',
      '어떻게', '진행', '신청', '등록', '허가',
      '신고', '제출', '접수', '발급', '취득',
      '처리', '이행', '수속'
    ],
    patterns: [
      /(.+)(절차|과정|순서|단계)(는|은|이)/,    // ~절차는
      /(.+)(어떻게|어떤\s*식으로)\s*(하|진행)/,  // 어떻게 하나요
      /(.+)(신청|등록|신고|제출)\s*(방법|절차)/, // 신청 방법
      /(.+)(하는|받는)\s*(방법|절차)/,           // ~하는 방법
      /어떻게\s*(.+)(하|해야|할\s*수)/,          // 어떻게 ~해야
    ],
    weight: 0.15  // 15%
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // comparison: 비교 질문
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  comparison: {
    keywords: [
      '차이', '비교', '다른점', '구분', '구별',
      '다르', '같은점', '공통점', 'vs', 'VS',
      '어느', '어떤 것이', '뭐가 더'
    ],
    patterns: [
      /(.+)(와|과|하고)\s*(.+)(의?\s*차이)/,     // A와 B의 차이
      /(.+)(와|과|하고)\s*(.+)\s*(비교)/,        // A와 B 비교
      /(.+)(vs|VS|대)\s*(.+)/,                   // A vs B
      /(.+)(이|가)\s*(다른|다르)/,               // ~가 다른가요
      /(어느|어떤\s*것이?)\s*(더|좋|나)/,        // 어느 것이 더
    ],
    weight: 0.05  // 5%
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // application: 적용 판단 질문 (가장 빈번)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  application: {
    keywords: [
      '적용', '해당', '가능', '되나요', '인가요', '할까요',
      '받을 수', '할 수', '될 수', '있나요', '없나요',
      '경우', '상황', '제 경우', '저는', '저도',
      '해당되', '적용되', '인정되'
    ],
    patterns: [
      /(.+)(적용|해당)(되나요|될까요|되는지)/,       // ~적용되나요
      /(제|저|나|내)\s*(경우|상황)(에|는|도)/,       // 제 경우에
      /(.+)(받을|할|될)\s*수\s*(있|없)/,             // ~받을 수 있나요
      /(.+)(가능|불가능)(한가요|할까요|인가요)/,     // ~가능한가요
      /(.+)(인가요|일까요|인지)/,                    // ~인가요
      /(.+)(되나요|될까요|되는지)/,                  // ~되나요
      /(이런|이|저런|그런)\s*(경우|상황)/,           // 이런 경우
    ],
    weight: 0.55  // 55% - 실제로는 70%이지만 fallback 고려
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // consequence: 효과/결과 질문
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  consequence: {
    keywords: [
      '결과', '효과', '효력', '영향', '불이익',
      '하면', '안하면', '위반', '벌칙', '처벌',
      '손해', '배상', '책임', '어떻게 되'
    ],
    patterns: [
      /(.+)(하면|안\s*하면)\s*(어떻게|뭐가)/,        // ~하면 어떻게
      /(.+)(결과|효과|효력)(는|은|이)/,              // ~결과는
      /(.+)(위반|불이행)\s*(시|하면)/,               // ~위반 시
      /(.+)(처벌|벌칙|제재)(는|은|이)/,              // ~처벌은
      /어떻게\s*되/,                                  // 어떻게 되나요
      /(.+)(책임|손해|배상)(이|을|은)/,              // ~책임이
    ],
    weight: 0.10  // 10%
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 법령명/조문 추출 패턴
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 「법령명」 패턴 (가장 명확)
const QUOTED_LAW_PATTERN = /「([^」]+)」/g

// 일반 법령명 패턴
const LAW_NAME_PATTERN = /([가-힣a-zA-Z0-9·\s]{2,30}(?:법|령|규칙|조례|약관|지침|규정)(?:\s*시행령|\s*시행규칙)?)/g

// 조문 번호 패턴
const ARTICLE_PATTERN = /제\s*(\d+)\s*조(?:의\s*(\d+))?(?:\s*제\s*(\d+)\s*항)?/g

/**
 * 법령명 추출
 */
function extractLaws(query: string): string[] {
  const laws = new Set<string>()

  // 1. 「」로 감싼 법령명 (가장 신뢰도 높음)
  const quotedMatches = query.matchAll(QUOTED_LAW_PATTERN)
  for (const match of quotedMatches) {
    laws.add(match[1].trim())
  }

  // 2. 일반 법령명 패턴
  const generalMatches = query.matchAll(LAW_NAME_PATTERN)
  for (const match of generalMatches) {
    const lawName = match[1].trim()
    // 너무 짧거나 일반 단어인 경우 제외
    if (lawName.length >= 3 && !['방법', '절차', '요건', '조건'].includes(lawName)) {
      laws.add(lawName)
    }
  }

  return Array.from(laws)
}

/**
 * 조문 번호 추출
 */
function extractArticles(query: string): string[] {
  const articles = new Set<string>()

  const matches = query.matchAll(ARTICLE_PATTERN)
  for (const match of matches) {
    const jo = match[1]
    const joSuffix = match[2] ? `의${match[2]}` : ''
    const hang = match[3] ? ` 제${match[3]}항` : ''
    articles.add(`제${jo}조${joSuffix}${hang}`)
  }

  return Array.from(articles)
}

/**
 * 질문 유형별 점수 계산
 */
function calculateTypeScores(query: string): Map<LegalQueryType, { score: number; keywords: string[] }> {
  const scores = new Map<LegalQueryType, { score: number; keywords: string[] }>()
  const normalizedQuery = query.toLowerCase().replace(/\s+/g, ' ')

  for (const [type, config] of Object.entries(QUERY_PATTERNS)) {
    let score = config.weight  // 기본 가중치
    const matchedKeywords: string[] = []

    // 1. 키워드 매칭 (각 키워드당 +0.1)
    for (const keyword of config.keywords) {
      if (normalizedQuery.includes(keyword.toLowerCase())) {
        score += 0.1
        matchedKeywords.push(keyword)
      }
    }

    // 2. 패턴 매칭 (패턴당 +0.2)
    for (const pattern of config.patterns) {
      if (pattern.test(query)) {
        score += 0.2
      }
    }

    scores.set(type as LegalQueryType, { score, keywords: matchedKeywords })
  }

  return scores
}

/**
 * 질문 분석 메인 함수
 */
export function analyzeLegalQuery(query: string): LegalQueryAnalysis {
  // 빈 쿼리 처리
  if (!query || query.trim().length === 0) {
    return {
      type: 'application',  // 기본값
      confidence: 0.5,
      extractedLaws: [],
      extractedArticles: [],
      keywords: []
    }
  }

  // 1. 법령명/조문 추출
  const extractedLaws = extractLaws(query)
  const extractedArticles = extractArticles(query)

  // 2. 유형별 점수 계산
  const scores = calculateTypeScores(query)

  // 3. 최고 점수 유형 선택
  let bestType: LegalQueryType = 'application'  // 기본값 (가장 빈번)
  let bestScore = 0
  let bestKeywords: string[] = []

  for (const [type, { score, keywords }] of scores) {
    if (score > bestScore) {
      bestScore = score
      bestType = type
      bestKeywords = keywords
    }
  }

  // 4. 신뢰도 계산 (0.5 ~ 1.0)
  // - 점수가 높을수록 신뢰도 높음
  // - 법령명/조문이 있으면 보너스
  let confidence = Math.min(0.5 + bestScore * 0.3, 0.95)

  if (extractedLaws.length > 0) confidence += 0.05
  if (extractedArticles.length > 0) confidence += 0.05

  confidence = Math.min(confidence, 1.0)

  // 5. 특수 케이스 처리

  // 특정 조문 언급 + 질문 종결어미 없음 = definition으로 간주
  if (extractedArticles.length > 0 && bestScore < 0.3) {
    // "관세법 제38조" 같은 단순 조문 참조
    if (!/[?요까지]/.test(query)) {
      return {
        type: 'definition',
        confidence: 0.7,
        extractedLaws,
        extractedArticles,
        keywords: []
      }
    }
  }

  return {
    type: bestType,
    confidence,
    extractedLaws,
    extractedArticles,
    keywords: bestKeywords
  }
}

/**
 * 기존 query-preprocessor와 호환되는 인터페이스
 * (점진적 마이그레이션 지원)
 */
export function getQueryTypeForPrompt(query: string): {
  queryType: string
  extractedLaws: string[]
  extractedArticles: string[]
  confidence: number
} {
  const analysis = analyzeLegalQuery(query)

  // 기존 4가지 타입으로 매핑 (호환성)
  const typeMapping: Record<LegalQueryType, string> = {
    definition: 'general',      // 개념 → general
    requirement: 'general',     // 요건 → general
    procedure: 'procedural',    // 절차 → procedural
    comparison: 'comparison',   // 비교 → comparison
    application: 'general',     // 적용 → general
    consequence: 'general'      // 효과 → general
  }

  return {
    queryType: typeMapping[analysis.type],
    extractedLaws: analysis.extractedLaws,
    extractedArticles: analysis.extractedArticles,
    confidence: analysis.confidence
  }
}
