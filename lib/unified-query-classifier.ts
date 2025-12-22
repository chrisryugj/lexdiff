/**
 * 통합 쿼리 분류기 (Unified Query Classifier)
 *
 * 기존 3개 파일 통합:
 * - query-detector.ts → detectQueryType, isNaturalLanguageQuery
 * - legal-query-analyzer.ts → analyzeLegalQuery, detectDomain
 * - query-preprocessor.ts → preprocessQuery
 *
 * 7가지 핵심 개선사항:
 * 1. 통합 구조 (3개 → 1개)
 * 2. confidence 계산 개선 (조화평균)
 * 3. 판례/해석례/재결례 패턴 추가
 * 4. 키워드 충돌 해결 (우선순위)
 * 5. 조례 판별 강화 (양방향)
 * 6. 법령명 추출 개선 (띄어쓰기 자동 삽입)
 * 7. 도메인 감지 가중치 조정
 *
 * @updated 2025-12-22 통합검색 개선 계획 (08-UNIFIED_SEARCH_IMPROVEMENT_PLAN.md)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 타입 정의
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type QueryType = 'structured' | 'natural'
export type SearchMode = 'law' | 'ordinance' | 'ai'

// ✅ 신규 타입 (통합검색 지원)
export type SearchType = 'law' | 'ordinance' | 'ai' | 'precedent' | 'interpretation' | 'ruling' | 'multi'

export type LegalQueryType =
  | 'definition'    // 개념/정의
  | 'requirement'   // 요건/조건
  | 'procedure'     // 절차/방법
  | 'comparison'    // 비교
  | 'application'   // 적용 판단
  | 'consequence'   // 효과/결과
  | 'scope'         // 범위/금액/산정
  | 'exemption'     // 예외/면제/특례/감면

export type LegalDomain = 'customs' | 'administrative' | 'civil-service' | 'tax' | 'general'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 통합 인터페이스 (핵심)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface UnifiedQueryClassification {
  // Primary search type
  searchType: SearchType

  // Secondary types (multi인 경우)
  secondaryTypes?: SearchType[]

  // Confidence level
  confidence: number // 0.0 ~ 1.0

  // Legal query type
  legalQueryType: LegalQueryType

  // Domain
  domain: LegalDomain

  // Extracted entities
  entities: {
    lawName?: string          // "민법"
    articleNumber?: string    // "제38조"
    caseNumber?: string       // "2023도1234"
    court?: string            // "대법원"
    ruleType?: string         // "예규", "고시"
    interpretationType?: string // "행정해석", "유권해석"
    rulingNumber?: string     // "조심2023서0001"
  }

  // Preprocessed query for RAG
  preprocessedQuery: string

  // Additional metadata
  reason: string              // 분류 이유
  isCompound: boolean         // 복합 질문 여부
  matchedPatterns: string[]   // 매칭된 패턴 이름
}

// 기존 호환 인터페이스
export interface QueryDetectionResult {
  type: QueryType
  confidence: number
  reason: string
}

export interface LegalQueryAnalysis {
  type: LegalQueryType
  confidence: number
  extractedLaws: string[]
  extractedArticles: string[]
  keywords: string[]
}

export interface EnhancedLegalQueryAnalysis extends LegalQueryAnalysis {
  domain: LegalDomain
  domainConfidence: number
  secondaryType?: LegalQueryType
  isCompound: boolean
  matchedEntities: string[]
}

export interface UnifiedClassificationResult {
  searchMode: SearchMode
  queryType: QueryType
  legalQueryType: LegalQueryType
  confidence: number
  domain: string
  reason: string
}

export interface ProcessedQuery {
  originalQuery: string
  processedQuery: string
  extractedLaws: string[]
  extractedArticles: string[]
  queryType: 'specific' | 'general' | 'comparison' | 'procedural'
  confidence: number
  metadataFilter?: string
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 패턴 정의 (200 라인)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ✅ 개선 3: 판례/해석례/재결례 패턴 추가
const PRECEDENT_PATTERNS = [
  /(대법원|서울고등법원|서울고법|부산고등법원|부산고법|대구고등법원|대구고법|광주고등법원|광주고법|서울중앙지법|서울동부지법|서울남부지법|서울북부지법|서울서부지법|인천지법|수원지법|부산지법|대구지법|광주지법|대전지법|울산지법|창원지법)\s*\d{4}(도|나|가|마|바|자|아|카|타|파|하|두|구|누|부|머|사|로|고단|노|초|추)\s*\d+/,
  /(대법원|서울고등법원|서울고법|부산고등법원|부산고법|대구고등법원|대구고법|광주고등법원|광주고법)\s*\d{4}/,  // 법원명 + 연도 (예: "대법원 2025")
  /\d{4}(도|나|가|마|바|자|아|카|타|파|하|두|구|누|부|머|사|로|고단|노|초|추)\s*\d+/,
  /(판례|판결|결정).*\d{4}년/,
  /(대법원|고등법원|지방법원)\s*(판결|결정)/
]

const RULING_PATTERNS = [
  /(조심|국심)\s*\d{4}[서동중경인광대부전울창제]\d+/,
  /심판청구.*\d{4}/,
  /조세심판/
]

const INTERPRETATION_PATTERNS = [
  /(행정해석|법제처\s*해석|유권해석)/,
  /(예규|고시|훈령|지침)/,
  /법령.*해석/,
  /해석례/
]

// 법령명/조문 추출 패턴
const QUOTED_LAW_PATTERN = /「([^」]+)」/g
const LAW_NAME_PATTERN = /([가-힣a-zA-Z0-9·\s]{2,60}(?:법|령|규칙|조례|약관|지침|규정|협정)(?:\s*시행령|\s*시행규칙)?)/g
const ARTICLE_PATTERN = /제\s*(\d+)\s*조(?:의\s*(\d+))?(?:\s*제\s*(\d+)\s*항)?/g

// 조문 번호 패턴 (제 없이)
const SIMPLE_ARTICLE_PATTERN = /(?<!제)(?<!\d)(\d+)조/g

// ✅ 개선 5: 조례 판별 강화 (양방향)
const ORDINANCE_PATTERNS = [
  /조례|자치법규/,
  /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(특별시|광역시|도)?\s*(조례|규칙)/,
  /(조례|규칙)\s*((특별|광역)?시|도|군|구)/,  // 역순 지원
  /((특별|광역)?시|도|군|구)\s*[가-힣]+\s*(조례|규칙)/
]

// 도메인별 키워드 DB
const CUSTOMS_DOMAIN = {
  entities: [
    'HS코드', '과세가격', '원산지', 'FTA', '환급', '보세', '통관', '수입신고', '수출신고',
    '관세율', '덤핑방지관세', '상계관세', '할당관세', '계절관세', '원산지증명서', '세번',
    '품목분류', '간이통관', '정식통관', '보세창고', '보세구역', '개별환급', '간이환급',
    '협정관세', '특혜관세', '관세청', '세관', '수입', '수출', '통관업', '화물',
    '수입물품', '수출물품', '관세사', '관세평가', 'CIF', 'FOB', '가산요소', '공제요소'
  ],
  lawKeywords: ['관세법', '관세율표', 'FTA', '자유무역협정', '수출입', '통관', '관세법 시행령', '관세법 시행규칙']
}

const ADMINISTRATIVE_DOMAIN = {
  entities: [
    '행정처분', '행정심판', '취소소송', '허가', '인가', '특허', '면허', '신고', '등록',
    '청문', '사전통지', '처분', '재량', '기속', '의견제출', '행정쟁송', '이의신청',
    '행정청', '처분청', '감독청', '집행정지', '무효확인', '부작위위법확인', '행정지도',
    '행정조사', '행정대집행', '이행강제금', '행정벌', '과징금', '과태료'
  ],
  lawKeywords: ['행정절차법', '행정심판법', '행정소송법', '행정기본법', '행정규제기본법']
}

const CIVIL_SERVICE_DOMAIN = {
  entities: [
    '승진', '전보', '휴직', '복직', '파면', '해임', '강등', '정직', '감봉', '견책',
    '징계', '소청', '호봉', '수당', '연가', '병가', '공로연수', '승급', '근무성적평정',
    '임용', '채용', '퇴직', '명예퇴직', '직위해제', '직무배제', '강임', '전직',
    '겸임', '파견', '공무원연금', '보수', '성과급', '초과근무수당'
  ],
  lawKeywords: ['국가공무원법', '지방공무원법', '공무원연금법', '공무원보수규정', '공무원임용령', '공무원징계령']
}

const TAX_DOMAIN = {
  entities: [
    '과세', '납세', '세액', '세율', '종합소득세', '법인세', '부가가치세', '양도소득세',
    '상속세', '증여세', '취득세', '재산세', '종부세', '종합부동산세', '지방세',
    '가산세', '가산금', '경정', '경정청구', '세무조사', '결정', '고지', '징수',
    '체납', '압류', '공매', '감면', '공제', '필요경비', '손금', '익금', '세액공제',
    '세액감면', '원천징수', '예정신고', '확정신고'
  ],
  lawKeywords: ['소득세법', '법인세법', '부가가치세법', '상속세및증여세법', '국세기본법', '지방세법', '세법']
}

// ✅ 개선 4: 키워드 충돌 해결 (우선순위)
const PRIORITY_KEYWORDS: Record<LegalQueryType, {
  priority: number
  patterns: RegExp[]
}> = {
  // 우선순위 1: exemption (면제/예외)
  exemption: {
    priority: 1,
    patterns: [
      /(면제|면세|비과세)[은는이가]?\s*(대상|범위|요건)/,
      /(면제|면세|비과세)[받을될]\s*수\s*(있|없)/,
      /(특례|감면|예외)[은는이가]?\s*[?？]?\s*$/,
      /(적용\s*제외|예외\s*규정)[은는이가]?/
    ]
  },
  // 우선순위 2: requirement (요건/조건)
  requirement: {
    priority: 2,
    patterns: [
      /(요건|조건|자격)[은는이가]?\s*(무엇|뭐|뭔가)/,
      /(요건|조건|자격)[은는이가]?\s*[?？]?\s*$/,
      /[을를]\s*충족해야\s*(하나요|할까요|하는지|하나)\s*[?？]?\s*$/,
      /(되려면|하려면|받으려면)\s*[?？]?\s*$/
    ]
  },
  // 우선순위 3: scope (범위/금액)
  scope: {
    priority: 3,
    patterns: [
      /얼마[인이가나까요?？\s]*$/,
      /(세율|세액|요율|이자율|비율)[은는이가]?\s*[?？]?\s*$/,
      /(기간|기한|시효|일수)[은는이가]?\s*[?？]?\s*$/,
      /(금액|액수|범위|한도)[은는이가]?\s*[?？]?\s*$/,
      /(산정|계산|산출)\s*(방법|기준|방식)/
    ]
  },
  // 우선순위 4: application (적용/해당)
  application: {
    priority: 4,
    patterns: [
      /(대상|해당|적용)[인이]?(가요?|나요?|까요?)\s*[?？]?\s*$/,
      /(가능|불가능)[한인]?(가요?|나요?|까요?)?\s*[?？]?\s*$/,
      /(받을|할|될)\s*수\s*(있|없)[나을까요]*\s*[?？]?\s*$/
    ]
  },
  // 우선순위 5: consequence (효과/결과)
  consequence: {
    priority: 5,
    patterns: [
      /(위반|불이행|미이행)\s*(시|하면)[에은는]?\s*[?？]?\s*$/,
      /(처벌|벌칙|제재|가산세|과태료)[은는이가]?\s*[?？]?\s*$/,
      /(효과|효력|결과)[은는이가]?\s*[?？]?\s*$/,
      /어떻게\s*되[나요지]?\s*[?？]?\s*$/
    ]
  },
  // 우선순위 6: comparison (비교)
  comparison: {
    priority: 6,
    patterns: [
      /(차이|다른\s*점|구별|구분)[점은는이가]?\s*[?？]?\s*$/,
      /(.+)(와|과)\s*(.+)\s*(차이|비교)[점하면]?\s*[?？]?\s*$/,
      /\s(vs|VS)\s/
    ]
  },
  // 우선순위 7: procedure (절차/방법)
  procedure: {
    priority: 7,
    patterns: [
      /(절차|과정|순서)[은는이가]?\s*[?？]?\s*$/,
      /(?<!산정\s*|계산\s*|산출\s*)(방법)[은는이가]?\s*[?？]?\s*$/,
      /어떻게\s*(하|신청|진행|처리)[나요면]?\s*[?？]?\s*$/,
      /어떻게\s*해야\s*(하나요|할까요|하나|하지)\s*[?？]?\s*$/
    ]
  },
  // 우선순위 8: definition (정의)
  definition: {
    priority: 8,
    patterns: [
      /[이]?란\s*[?？]?\s*$/,
      /의\s*(정의|개념|뜻)[은는이가]?\s*[?？]?\s*$/,
      /(은|는)\s*무엇[인이]?[가요지]?\s*[?？]?\s*$/,
      /뭐(야|예요|에요|죠)\s*[?？]?\s*$/,
      /뭘까\s*[?？]?\s*$/
    ]
  }
}

// 종결어미 확정 패턴 (144개)
const DEFINITIVE_ENDING_PATTERNS: Array<{
  pattern: RegExp
  type: LegalQueryType
  confidence: number
}> = [
  // exemption (예외/면제)
  { pattern: /(면제|면세|비과세)[은는이가]?\s*(대상|범위|요건)/, type: 'exemption', confidence: 0.99 },
  { pattern: /(면제|면세|비과세)[받을될]\s*수\s*(있|없)/, type: 'exemption', confidence: 0.98 },
  { pattern: /(특례|감면|예외)[은는이가]?\s*[?？]?\s*$/, type: 'exemption', confidence: 0.97 },
  { pattern: /(면제|면세|감면)[되받][나을까요]*\s*[?？]?\s*$/, type: 'exemption', confidence: 0.96 },
  { pattern: /(적용\s*제외|예외\s*규정)[은는이가]?/, type: 'exemption', confidence: 0.95 },

  // requirement (요건/조건)
  { pattern: /(요건|조건|자격)[은는이가]?\s*(무엇|뭐|뭔가)/, type: 'requirement', confidence: 0.99 },
  { pattern: /(요건|조건|자격)[은는이가]?\s*[?？]?\s*$/, type: 'requirement', confidence: 0.98 },
  { pattern: /[을를]\s*충족해야\s*(하나요|할까요|하는지|하나)\s*[?？]?\s*$/, type: 'requirement', confidence: 0.95 },
  { pattern: /(되려면|하려면|받으려면)\s*[?？]?\s*$/, type: 'requirement', confidence: 0.93 },

  // application (적용/해당)
  { pattern: /(대상|해당|적용)[인이]?(가요?|나요?|까요?)\s*[?？]?\s*$/, type: 'application', confidence: 0.98 },
  { pattern: /(가능|불가능)[한인]?(가요?|나요?|까요?)?\s*[?？]?\s*$/, type: 'application', confidence: 0.95 },
  { pattern: /(받을|할|될)\s*수\s*(있|없)[나을까요]*\s*[?？]?\s*$/, type: 'application', confidence: 0.92 },

  // scope (범위/금액)
  { pattern: /얼마[인이가나까요?？\s]*$/, type: 'scope', confidence: 0.98 },
  { pattern: /(세율|세액|요율|이자율|비율)[은는이가]?\s*[?？]?\s*$/, type: 'scope', confidence: 0.98 },
  { pattern: /(기간|기한|시효|일수)[은는이가]?\s*[?？]?\s*$/, type: 'scope', confidence: 0.97 },
  { pattern: /(금액|액수|범위|한도)[은는이가]?\s*[?？]?\s*$/, type: 'scope', confidence: 0.97 },
  { pattern: /(산정|계산|산출)\s*(방법|기준|방식)/, type: 'scope', confidence: 0.96 },
  { pattern: /(몇|어느\s*정도)[인이]?[가요지나]?\s*[?？]?\s*$/, type: 'scope', confidence: 0.95 },
  { pattern: /(최대|최소|상한|하한)[은는이가]?\s*[?？]?\s*$/, type: 'scope', confidence: 0.95 },

  // consequence (효과/결과)
  { pattern: /(위반|불이행|미이행)\s*(시|하면)[에은는]?\s*[?？]?\s*$/, type: 'consequence', confidence: 0.96 },
  { pattern: /(처벌|벌칙|제재|가산세|과태료)[은는이가]?\s*[?？]?\s*$/, type: 'consequence', confidence: 0.95 },
  { pattern: /(효과|효력|결과)[은는이가]?\s*[?？]?\s*$/, type: 'consequence', confidence: 0.95 },
  { pattern: /어떻게\s*되[나요지]?\s*[?？]?\s*$/, type: 'consequence', confidence: 0.90 },
  { pattern: /(하면|안\s*하면)\s*(어떻게|뭐가)/, type: 'consequence', confidence: 0.88 },

  // comparison (비교)
  { pattern: /(차이|다른\s*점|구별|구분)[점은는이가]?\s*[?？]?\s*$/, type: 'comparison', confidence: 0.98 },
  { pattern: /(.+)(와|과)\s*(.+)\s*(차이|비교)[점하면]?\s*[?？]?\s*$/, type: 'comparison', confidence: 0.95 },
  { pattern: /\s(vs|VS)\s/, type: 'comparison', confidence: 0.95 },

  // procedure (절차/방법)
  { pattern: /(절차|과정|순서|단계)[은는이가]?\s*[?？]?\s*$/, type: 'procedure', confidence: 0.98 },
  { pattern: /(?<!산정\s*|계산\s*|산출\s*)(방법)[은는이가]?\s*[?？]?\s*$/, type: 'procedure', confidence: 0.95 },
  { pattern: /어떻게\s*(하|신청|진행|처리)[나요면]?\s*[?？]?\s*$/, type: 'procedure', confidence: 0.93 },
  { pattern: /어떻게\s*해야\s*(하나요|할까요|하나|하지)\s*[?？]?\s*$/, type: 'procedure', confidence: 0.93 },

  // definition (정의)
  { pattern: /[이]?란\s*[?？]?\s*$/, type: 'definition', confidence: 0.99 },
  { pattern: /의\s*(정의|개념|뜻)[은는이가]?\s*[?？]?\s*$/, type: 'definition', confidence: 0.99 },
  { pattern: /(은|는)\s*무엇[인이]?[가요지]?\s*[?？]?\s*$/, type: 'definition', confidence: 0.97 },
  { pattern: /뭐(야|예요|에요|죠)\s*[?？]?\s*$/, type: 'definition', confidence: 0.95 },
  { pattern: /뭘까\s*[?？]?\s*$/, type: 'definition', confidence: 0.95 }
]

// 질문 종결어미 패턴
const QUESTION_ENDINGS = /[?？]$|인가요?$|인지요?$|될까요?$|되나요?$|습니까?$|니까?$|알려줘|설명해줘|가르쳐줘|말해줘|찾아줘|보여줘|궁금|뭐야|뭐지|뭔지|뭘까$/

const QUESTION_WORDS = /(무엇|어떻게|어떤|왜|언제|어디서|누가|어느|뭐|뭘)/

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 핵심 함수 (600 라인)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ✅ 개선 6: 법령명 추출 개선 (띄어쓰기 자동 삽입)
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
    let lawName = match[1].trim()

    // 띄어쓰기 자동 삽입: "관세법시행령" → "관세법 시행령"
    lawName = lawName
      .replace(/(법)(시행령)/, '$1 $2')
      .replace(/(법)(시행규칙)/, '$1 $2')
      .replace(/(령)(시행규칙)/, '$1 $2')

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
 * 판례 패턴 감지
 */
function detectPrecedentPattern(query: string): {
  matched: boolean
  caseNumber?: string
  court?: string
} {
  for (const pattern of PRECEDENT_PATTERNS) {
    const match = query.match(pattern)
    if (match) {
      // 법원명과 사건번호 추출
      const fullMatch = match[0]

      // 법원명 추출
      const courtMatch = fullMatch.match(/(대법원|서울고등법원|서울고법|부산고등법원|부산고법|대구고등법원|대구고법|광주고등법원|광주고법|서울중앙지법|서울동부지법|서울남부지법|서울북부지법|서울서부지법|인천지법|수원지법|부산지법|대구지법|광주지법|대전지법|울산지법|창원지법)/)
      const court = courtMatch ? courtMatch[0] : undefined

      // 사건번호 추출 (공백 허용)
      const caseMatch = fullMatch.match(/\d{4}(도|나|가|마|바|자|아|카|타|파|하|두|구|누|부|머|사|로|고단|노|초|추)\s*\d+/)
      const caseNumber = caseMatch ? caseMatch[0].replace(/\s+/g, '') : undefined  // 공백 제거

      return { matched: true, caseNumber, court }
    }
  }
  return { matched: false }
}

/**
 * 재결례 패턴 감지
 */
function detectRulingPattern(query: string): {
  matched: boolean
  rulingNumber?: string
} {
  for (const pattern of RULING_PATTERNS) {
    const match = query.match(pattern)
    if (match) {
      const rulingNumber = match[0]
      return { matched: true, rulingNumber }
    }
  }
  return { matched: false }
}

/**
 * 해석례 패턴 감지
 */
function detectInterpretationPattern(query: string): {
  matched: boolean
  interpretationType?: string
  ruleType?: string
} {
  for (const pattern of INTERPRETATION_PATTERNS) {
    const match = query.match(pattern)
    if (match) {
      const interpretationType = match[0]

      // 예규/고시/훈령 등 세부 타입 추출
      const ruleTypeMatch = query.match(/(예규|고시|훈령|지침)/)
      const ruleType = ruleTypeMatch ? ruleTypeMatch[0] : undefined

      return { matched: true, interpretationType, ruleType }
    }
  }
  return { matched: false }
}

/**
 * ✅ 개선 5: 조례 판별 강화 (양방향)
 */
function isOrdinanceQuery(query: string): boolean {
  for (const pattern of ORDINANCE_PATTERNS) {
    if (pattern.test(query)) {
      return true
    }
  }
  return false
}

/**
 * ✅ 개선 7: 도메인 감지 가중치 조정
 */
function detectDomain(query: string, extractedLaws: string[]): {
  domain: LegalDomain
  confidence: number
  matchedTerms: string[]
} {
  const matchedTerms: string[] = []
  const domainScores: Record<LegalDomain, number> = {
    customs: 0,
    administrative: 0,
    'civil-service': 0,
    tax: 0,
    general: 0
  }

  // 1. 법령명으로 도메인 판단 (가장 강력한 신호)
  for (const law of extractedLaws) {
    // 관세법 도메인
    if (CUSTOMS_DOMAIN.lawKeywords.some(k => law.includes(k))) {
      domainScores.customs += 0.5  // 법령명: +0.5
      matchedTerms.push(law)
    }
    // 행정법 도메인
    if (ADMINISTRATIVE_DOMAIN.lawKeywords.some(k => law.includes(k))) {
      domainScores.administrative += 0.5
      matchedTerms.push(law)
    }
    // 공무원법 도메인
    if (CIVIL_SERVICE_DOMAIN.lawKeywords.some(k => law.includes(k))) {
      domainScores['civil-service'] += 0.5
      matchedTerms.push(law)
    }
    // 세법 도메인
    if (TAX_DOMAIN.lawKeywords.some(k => law.includes(k))) {
      domainScores.tax += 0.5
      matchedTerms.push(law)
    }
  }

  // 2. 엔티티로 도메인 판단 (가중치 0.1 → 0.05로 조정)
  const normalizedQuery = query.toLowerCase()

  // 관세법 엔티티
  for (const entity of CUSTOMS_DOMAIN.entities) {
    if (query.includes(entity) || normalizedQuery.includes(entity.toLowerCase())) {
      domainScores.customs += 0.05  // 엔티티: +0.05 (기존 0.1에서 절반)
      if (!matchedTerms.includes(entity)) {
        matchedTerms.push(entity)
      }
    }
  }

  // 행정법 엔티티
  for (const entity of ADMINISTRATIVE_DOMAIN.entities) {
    if (query.includes(entity) || normalizedQuery.includes(entity.toLowerCase())) {
      domainScores.administrative += 0.05
      if (!matchedTerms.includes(entity)) {
        matchedTerms.push(entity)
      }
    }
  }

  // 공무원법 엔티티
  for (const entity of CIVIL_SERVICE_DOMAIN.entities) {
    if (query.includes(entity) || normalizedQuery.includes(entity.toLowerCase())) {
      domainScores['civil-service'] += 0.05
      if (!matchedTerms.includes(entity)) {
        matchedTerms.push(entity)
      }
    }
  }

  // 세법 엔티티
  for (const entity of TAX_DOMAIN.entities) {
    if (query.includes(entity) || normalizedQuery.includes(entity.toLowerCase())) {
      domainScores.tax += 0.05
      if (!matchedTerms.includes(entity)) {
        matchedTerms.push(entity)
      }
    }
  }

  // 3. 최고 점수 도메인 선택
  let bestDomain: LegalDomain = 'general'
  let bestScore = 0

  for (const [domain, score] of Object.entries(domainScores)) {
    if (score > bestScore) {
      bestScore = score
      bestDomain = domain as LegalDomain
    }
  }

  // 4. 신뢰도 계산 (0.0 ~ 1.0)
  const confidence = Math.min(bestScore, 1.0)

  return {
    domain: bestDomain,
    confidence,
    matchedTerms
  }
}

/**
 * ✅ 개선 4: 키워드 충돌 해결 (우선순위 기반)
 */
function analyzeLegalQuestion(query: string, _extractedLaws: string[], extractedArticles: string[]): {
  type: LegalQueryType
  confidence: number
  keywords: string[]
} {
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
  const sortedTypes = Object.entries(PRIORITY_KEYWORDS).sort((a, b) => a[1].priority - b[1].priority)

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
 * ✅ 개선 2: Confidence 계산 개선 (조화평균)
 */
function calculateHarmonicMean(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return 2 / (1 / a + 1 / b)
}

/**
 * 기본 쿼리 타입 감지 (structured vs natural)
 * query-detector.ts에서 통합
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
  const articlePattern = /제?\s*\d+\s*조(?:의\s*\d+)?/
  const hasArticleNumber = articlePattern.test(trimmedQuery)

  if (hasArticleNumber) {
    const textWithoutArticle = trimmedQuery.replace(articlePattern, '').trim()
    const pureLawNamePattern = /^[가-힣A-Za-z0-9·\s]+(?:법률\s*시행령|법률\s*시행규칙|법\s*시행령|법\s*시행규칙|법률|법|령|규칙|규정|조례|지침|고시|훈령|예규)$/

    if (pureLawNamePattern.test(textWithoutArticle)) {
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

    if (textWithoutArticle && !pureLawNamePattern.test(textWithoutArticle)) {
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
    const pureLawNamePattern = /^[가-힣A-Za-z0-9·\s]+(?:법률\s*시행령|법률\s*시행규칙|법\s*시행령|법\s*시행규칙|특별법|기본법|법률|법|령|규칙|규정|조례|지침|고시|훈령|예규)$/
    if (pureLawNamePattern.test(trimmedQuery)) {
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
    const pureLawNamePattern = /^[가-힣A-Za-z0-9·\s]+(?:법률\s*시행령|법률\s*시행규칙|법\s*시행령|법\s*시행규칙|법률|법|령|규칙|규정|조례|지침|고시|훈령|예규)$/
    if (pureLawNamePattern.test(trimmedQuery)) {
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

/**
 * 복합 쿼리 감지
 */
function detectCompoundQuery(query: string): {
  isCompound: boolean
  secondaryTypes: SearchType[]
} {
  const types: SearchType[] = []

  // 판례 키워드 + 법령 키워드
  const hasPrecedent = PRECEDENT_PATTERNS.some(p => p.test(query))
  const hasLaw = /법|령|규칙/.test(query)
  const hasInterpretation = INTERPRETATION_PATTERNS.some(p => p.test(query))

  if (hasPrecedent) types.push('precedent')
  if (hasLaw) types.push('law')
  if (hasInterpretation) types.push('interpretation')

  return {
    isCompound: types.length >= 2,
    secondaryTypes: types.slice(1)  // 첫 번째는 primary
  }
}

/**
 * 쿼리 전처리 (RAG용)
 */
function preprocessForRAG(query: string): string {
  let processed = query

  // 1. 조문 형식 정규화: "38조" → "제38조"
  processed = processed.replace(SIMPLE_ARTICLE_PATTERN, '제$1조')

  // 2. 법령명 띄어쓰기 정규화
  processed = processed
    .replace(/(법)(시행령)/g, '$1 $2')
    .replace(/(법)(시행규칙)/g, '$1 $2')
    .replace(/(령)(시행규칙)/g, '$1 $2')

  // 3. 질문 어미 제거
  processed = processed
    .replace(/\?$/, '')
    .replace(/(인가요|인지요|할까요|일까요|나요|는지|은지)$/, '')
    .trim()

  return processed
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✅ 신규 통합 함수 (핵심)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 통합 검색 쿼리 분류 함수 (메인)
 *
 * 우선순위:
 * 1. 판례/재결례/해석례 패턴 감지 (최우선)
 * 2. 법령 패턴 감지
 * 3. AI 질문 감지
 * 4. 복합 쿼리 감지
 * 5. 법률 질문 유형 분석
 * 6. 도메인 감지
 * 7. 엔티티 추출
 * 8. 쿼리 전처리
 * 9. 최종 결과 반환
 */
export function classifySearchQuery(query: string): UnifiedQueryClassification {
  const trimmedQuery = query.trim()

  // 빈 쿼리 처리
  if (!trimmedQuery) {
    return {
      searchType: 'law',
      confidence: 0.5,
      legalQueryType: 'application',
      domain: 'general',
      entities: {},
      preprocessedQuery: '',
      reason: '빈 쿼리',
      isCompound: false,
      matchedPatterns: []
    }
  }

  const matchedPatterns: string[] = []

  // 1. 엔티티 추출
  const extractedLaws = extractLaws(trimmedQuery)
  const extractedArticles = extractArticles(trimmedQuery)

  // 2. 판례/재결례/해석례 패턴 감지 (최우선)
  const precedentPattern = detectPrecedentPattern(trimmedQuery)
  const rulingPattern = detectRulingPattern(trimmedQuery)
  const interpretationPattern = detectInterpretationPattern(trimmedQuery)

  // 3. 조례 판별
  const isOrdinance = isOrdinanceQuery(trimmedQuery)

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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 9. SearchType 결정 (우선순위 기반)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
  // 우선순위 5: 법령/조례 (구조화 검색)
  else if (basicDetection.type === 'structured' && basicDetection.confidence >= 0.9) {
    searchType = isOrdinance ? 'ordinance' : 'law'
    confidence = basicDetection.confidence
    reason = basicDetection.reason
    matchedPatterns.push(isOrdinance ? 'ordinance' : 'law')
  }
  // 우선순위 6: AI 질문 (자연어 검색)
  else if (basicDetection.type === 'natural' && basicDetection.confidence >= 0.75) {
    searchType = 'ai'
    // confidence 조화평균 사용
    confidence = calculateHarmonicMean(basicDetection.confidence, legalQuestion.confidence)
    reason = basicDetection.reason
    matchedPatterns.push('ai')
  }
  // 우선순위 7: 애매한 경우 (법령 우선)
  else {
    if (legalQuestion.type === 'definition' &&
        extractedArticles.length > 0 &&
        extractedLaws.length > 0) {
      searchType = isOrdinance ? 'ordinance' : 'law'
      confidence = 0.7
      reason = '법령 + 조문 추정'
      matchedPatterns.push('law')
    } else if (legalQuestion.confidence >= 0.7) {
      searchType = 'ai'
      confidence = legalQuestion.confidence
      reason = '자연어 질문 추정'
      matchedPatterns.push('ai')
    } else {
      searchType = isOrdinance ? 'ordinance' : 'law'
      confidence = 0.6
      reason = '기본 법령 검색'
      matchedPatterns.push('law')
    }
  }

  // 10. 최종 결과 반환
  return {
    searchType,
    secondaryTypes: compoundQuery.isCompound ? compoundQuery.secondaryTypes : undefined,
    confidence,
    legalQueryType: legalQuestion.type,
    domain: domainResult.domain,
    entities: {
      lawName: extractedLaws[0],
      articleNumber: extractedArticles[0],
      caseNumber: precedentPattern.caseNumber,
      court: precedentPattern.court,
      ruleType: interpretationPattern.ruleType,
      interpretationType: interpretationPattern.interpretationType,
      rulingNumber: rulingPattern.rulingNumber
    },
    preprocessedQuery,
    reason: domainResult.domain !== 'general' ? `${reason} + ${domainResult.domain} 도메인` : reason,
    isCompound: compoundQuery.isCompound,
    matchedPatterns
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✅ 하위 호환성 유지 (기존 코드용)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * query-detector.ts 호환 함수
 */
export function getSearchMode(query: string): SearchMode {
  const classification = classifySearchQuery(query)
  // SearchType → SearchMode 매핑
  if (classification.searchType === 'precedent' ||
      classification.searchType === 'interpretation' ||
      classification.searchType === 'ruling' ||
      classification.searchType === 'multi') {
    return 'ai'  // 기존에는 ai로 처리
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

export function analyzeEnhancedLegalQuery(query: string): EnhancedLegalQueryAnalysis {
  const baseAnalysis = analyzeLegalQuery(query)
  const domainResult = detectDomain(query, baseAnalysis.extractedLaws)
  const compoundQuery = detectCompoundQuery(query)

  return {
    ...baseAnalysis,
    domain: domainResult.domain,
    domainConfidence: domainResult.confidence,
    secondaryType: undefined,  // 단순화
    isCompound: compoundQuery.isCompound,
    matchedEntities: domainResult.matchedTerms
  }
}

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

  // queryType 매핑
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
    metadataFilter: undefined  // 비활성화 유지
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 테스트 케이스 (10개 - 각 타입별 검증)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 테스트 실행 함수
 */
export function runTests(): void {
  const tests = [
    // 1. 법령 검색
    {
      query: '민법 제38조',
      expected: { searchType: 'law', confidence: 0.98, legalQueryType: 'definition' }
    },
    // 2. 조례 검색
    {
      query: '서울특별시 주차장 조례',
      expected: { searchType: 'ordinance', confidence: 0.95 }
    },
    // 3. 판례 검색
    {
      query: '대법원 2023도1234',
      expected: { searchType: 'precedent', confidence: 0.99, caseNumber: '2023도1234', court: '대법원' }
    },
    // 4. 해석례 검색
    {
      query: '관세법 예규',
      expected: { searchType: 'interpretation', confidence: 0.95, ruleType: '예규' }
    },
    // 5. 재결례 검색
    {
      query: '조심2023서0001',
      expected: { searchType: 'ruling', confidence: 0.98, rulingNumber: '조심2023서0001' }
    },
    // 6. AI 질문 (requirement)
    {
      query: '면제 요건은?',
      expected: { searchType: 'ai', legalQueryType: 'requirement' }
    },
    // 7. AI 질문 (exemption)
    {
      query: '면제 대상은?',
      expected: { searchType: 'ai', legalQueryType: 'exemption' }
    },
    // 8. 복합 쿼리
    {
      query: '민법 제38조 관련 판례',
      expected: { searchType: 'multi', isCompound: true }
    },
    // 9. 긴 법령명
    {
      query: '자유무역협정의 이행을 위한 관세법의 특례에 관한 법률',
      expected: { searchType: 'law', confidence: 0.95 }
    },
    // 10. 띄어쓰기 없는 법령명
    {
      query: '관세법시행령',
      expected: { searchType: 'law', lawName: '관세법 시행령' }
    }
  ]

  console.log('=== 통합 쿼리 분류기 테스트 ===\n')

  let passedCount = 0
  let failedCount = 0

  tests.forEach((test, index) => {
    const result = classifySearchQuery(test.query)

    let passed = true
    const errors: string[] = []

    // searchType 검증
    if (test.expected.searchType && result.searchType !== test.expected.searchType) {
      passed = false
      errors.push(`searchType: expected ${test.expected.searchType}, got ${result.searchType}`)
    }

    // confidence 검증 (±0.05 허용)
    if (test.expected.confidence !== undefined) {
      const diff = Math.abs(result.confidence - test.expected.confidence)
      if (diff > 0.05) {
        passed = false
        errors.push(`confidence: expected ~${test.expected.confidence}, got ${result.confidence}`)
      }
    }

    // legalQueryType 검증
    if (test.expected.legalQueryType && result.legalQueryType !== test.expected.legalQueryType) {
      passed = false
      errors.push(`legalQueryType: expected ${test.expected.legalQueryType}, got ${result.legalQueryType}`)
    }

    // entities 검증
    if (test.expected.caseNumber && result.entities.caseNumber !== test.expected.caseNumber) {
      passed = false
      errors.push(`caseNumber: expected ${test.expected.caseNumber}, got ${result.entities.caseNumber}`)
    }
    if (test.expected.court && result.entities.court !== test.expected.court) {
      passed = false
      errors.push(`court: expected ${test.expected.court}, got ${result.entities.court}`)
    }
    if (test.expected.ruleType && result.entities.ruleType !== test.expected.ruleType) {
      passed = false
      errors.push(`ruleType: expected ${test.expected.ruleType}, got ${result.entities.ruleType}`)
    }
    if (test.expected.rulingNumber && result.entities.rulingNumber !== test.expected.rulingNumber) {
      passed = false
      errors.push(`rulingNumber: expected ${test.expected.rulingNumber}, got ${result.entities.rulingNumber}`)
    }
    if (test.expected.lawName && result.entities.lawName !== test.expected.lawName) {
      passed = false
      errors.push(`lawName: expected ${test.expected.lawName}, got ${result.entities.lawName}`)
    }

    // isCompound 검증
    if (test.expected.isCompound !== undefined && result.isCompound !== test.expected.isCompound) {
      passed = false
      errors.push(`isCompound: expected ${test.expected.isCompound}, got ${result.isCompound}`)
    }

    if (passed) {
      passedCount++
      console.log(`✅ Test ${index + 1}: "${test.query}"`)
    } else {
      failedCount++
      console.log(`❌ Test ${index + 1}: "${test.query}"`)
      errors.forEach(err => console.log(`   - ${err}`))
    }
  })

  console.log(`\n=== 결과: ${passedCount}/${tests.length} 통과 (${failedCount} 실패) ===`)
}

// Node.js 환경에서 직접 실행 시 테스트 자동 실행
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  runTests()
}
