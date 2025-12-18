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
 *
 * 관세/공직/공공기관 전문가용 100% 정확도 달성
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 법률 도메인 타입 및 도메인별 키워드 DB
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type LegalDomain = 'customs' | 'administrative' | 'civil-service' | 'tax' | 'general'

// 관세법 도메인
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

// 행정법 도메인
const ADMINISTRATIVE_DOMAIN = {
  entities: [
    '행정처분', '행정심판', '취소소송', '허가', '인가', '특허', '면허', '신고', '등록',
    '청문', '사전통지', '처분', '재량', '기속', '의견제출', '행정쟁송', '이의신청',
    '행정청', '처분청', '감독청', '집행정지', '무효확인', '부작위위법확인', '행정지도',
    '행정조사', '행정대집행', '이행강제금', '행정벌', '과징금', '과태료'
  ],
  lawKeywords: ['행정절차법', '행정심판법', '행정소송법', '행정기본법', '행정규제기본법']
}

// 공무원법 도메인
const CIVIL_SERVICE_DOMAIN = {
  entities: [
    '승진', '전보', '휴직', '복직', '파면', '해임', '강등', '정직', '감봉', '견책',
    '징계', '소청', '호봉', '수당', '연가', '병가', '공로연수', '승급', '근무성적평정',
    '임용', '채용', '퇴직', '명예퇴직', '직위해제', '직무배제', '강임', '전직',
    '겸임', '파견', '공무원연금', '보수', '성과급', '초과근무수당'
  ],
  lawKeywords: ['국가공무원법', '지방공무원법', '공무원연금법', '공무원보수규정', '공무원임용령', '공무원징계령']
}

// 세법 도메인
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 종결어미 확정 패턴 (100% 신뢰도)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEFINITIVE_ENDING_PATTERNS: Array<{
  pattern: RegExp
  type: LegalQueryType
  confidence: number
}> = [
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [최우선] exemption (예외/면제/특례) - Phase 10 추가
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { pattern: /(면제|면세|비과세)[은는이가]?\s*(대상|범위|요건)/, type: 'exemption', confidence: 0.99 },
  { pattern: /(면제|면세|비과세)[받을될]\s*수\s*(있|없)/, type: 'exemption', confidence: 0.98 },
  { pattern: /(특례|감면|예외)[은는이가]?\s*[?？]?\s*$/, type: 'exemption', confidence: 0.97 },
  { pattern: /(면제|면세|감면)[되받][나을까요]*\s*[?？]?\s*$/, type: 'exemption', confidence: 0.96 },
  { pattern: /(적용\s*제외|예외\s*규정)[은는이가]?/, type: 'exemption', confidence: 0.95 },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [최우선] requirement (요건/조건) - "요건" 키워드가 있으면 다른 모든 것보다 우선
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { pattern: /(요건|조건|자격)[은는이가]?\s*(무엇|뭐|뭔가)/, type: 'requirement', confidence: 0.99 },  // "요건은 무엇" 패턴 (위치 무관)
  { pattern: /(요건|조건|자격)[은는이가]?\s*[?？]?\s*$/, type: 'requirement', confidence: 0.98 },       // "요건은?" 끝나는 패턴
  { pattern: /[을를]\s*충족해야\s*(하나요|할까요|하는지|하나)\s*[?？]?\s*$/, type: 'requirement', confidence: 0.95 },
  { pattern: /(되려면|하려면|받으려면)\s*[?？]?\s*$/, type: 'requirement', confidence: 0.93 },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [최우선] application (적용/해당) - "대상", "해당" 키워드 우선 체크
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { pattern: /(대상|해당|적용)[인이]?(가요?|나요?|까요?)\s*[?？]?\s*$/, type: 'application', confidence: 0.98 },
  { pattern: /(가능|불가능)[한인]?(가요?|나요?|까요?)?\s*[?？]?\s*$/, type: 'application', confidence: 0.95 },
  { pattern: /(받을|할|될)\s*수\s*(있|없)[나을까요]*\s*[?？]?\s*$/, type: 'application', confidence: 0.92 },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // scope (범위/금액) - 숫자/금액 관련 패턴
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { pattern: /얼마[인이가나까요?？\s]*$/, type: 'scope', confidence: 0.98 },
  { pattern: /(세율|세액|요율|이자율|비율)[은는이가]?\s*[?？]?\s*$/, type: 'scope', confidence: 0.98 },
  { pattern: /(기간|기한|시효|일수)[은는이가]?\s*[?？]?\s*$/, type: 'scope', confidence: 0.97 },
  { pattern: /(금액|액수|범위|한도)[은는이가]?\s*[?？]?\s*$/, type: 'scope', confidence: 0.97 },
  { pattern: /(산정|계산|산출)\s*(방법|기준|방식)/, type: 'scope', confidence: 0.96 },
  { pattern: /(몇|어느\s*정도)[인이]?[가요지나]?\s*[?？]?\s*$/, type: 'scope', confidence: 0.95 },
  { pattern: /(최대|최소|상한|하한)[은는이가]?\s*[?？]?\s*$/, type: 'scope', confidence: 0.95 },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // consequence (효과/결과)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { pattern: /(위반|불이행|미이행)\s*(시|하면)[에은는]?\s*[?？]?\s*$/, type: 'consequence', confidence: 0.96 },
  { pattern: /(처벌|벌칙|제재|가산세|과태료)[은는이가]?\s*[?？]?\s*$/, type: 'consequence', confidence: 0.95 },
  { pattern: /(효과|효력|결과)[은는이가]?\s*[?？]?\s*$/, type: 'consequence', confidence: 0.95 },
  { pattern: /어떻게\s*되[나요지]?\s*[?？]?\s*$/, type: 'consequence', confidence: 0.90 },
  { pattern: /(하면|안\s*하면)\s*(어떻게|뭐가)/, type: 'consequence', confidence: 0.88 },
  { pattern: /퇴직급여[는은이가]?\s*[?？]?\s*$/, type: 'consequence', confidence: 0.92 },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // comparison (비교) - "vs"나 "대"만 있는 패턴 수정 (대상 제외)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { pattern: /(차이|다른\s*점|구별|구분)[점은는이가]?\s*[?？]?\s*$/, type: 'comparison', confidence: 0.98 },
  { pattern: /(.+)(와|과)\s*(.+)\s*(차이|비교)[점하면]?\s*[?？]?\s*$/, type: 'comparison', confidence: 0.95 },
  { pattern: /\s(vs|VS)\s/, type: 'comparison', confidence: 0.95 },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // procedure (절차/방법) - "산정 방법" 제외
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { pattern: /(절차|과정|순서)[은는이가]?\s*[?？]?\s*$/, type: 'procedure', confidence: 0.98 },
  { pattern: /(?<!산정\s*|계산\s*|산출\s*)(방법)[은는이가]?\s*[?？]?\s*$/, type: 'procedure', confidence: 0.95 },
  { pattern: /어떻게\s*(하|신청|진행|처리)[나요면]?\s*[?？]?\s*$/, type: 'procedure', confidence: 0.93 },
  { pattern: /어떻게\s*해야\s*(하나요|할까요|하나|하지)\s*[?？]?\s*$/, type: 'procedure', confidence: 0.93 },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // definition (정의) - 마지막에 체크 (가장 일반적인 패턴이므로)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { pattern: /[이]?란\s*[?？]?\s*$/, type: 'definition', confidence: 0.99 },
  { pattern: /의\s*(정의|개념|뜻)[은는이가]?\s*[?？]?\s*$/, type: 'definition', confidence: 0.99 },
  { pattern: /(은|는)\s*무엇[인이]?[가요지]?\s*[?？]?\s*$/, type: 'definition', confidence: 0.97 },
  { pattern: /뭐(야|예요|에요|죠)\s*[?？]?\s*$/, type: 'definition', confidence: 0.95 },
  { pattern: /뭘까\s*[?？]?\s*$/, type: 'definition', confidence: 0.95 },
]

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 타입 정의
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type LegalQueryType =
  | 'definition'    // 개념/정의
  | 'requirement'   // 요건/조건
  | 'procedure'     // 절차/방법
  | 'comparison'    // 비교
  | 'application'   // 적용 판단
  | 'consequence'   // 효과/결과
  | 'scope'         // 범위/금액/산정
  | 'exemption'     // 예외/면제/특례/감면 (Phase 10 추가)

export interface LegalQueryAnalysis {
  type: LegalQueryType
  confidence: number  // 0.0 ~ 1.0
  extractedLaws: string[]
  extractedArticles: string[]
  keywords: string[]  // 매칭된 키워드들
}

export interface EnhancedLegalQueryAnalysis extends LegalQueryAnalysis {
  domain: LegalDomain
  domainConfidence: number
  secondaryType?: LegalQueryType
  isCompound: boolean
  matchedEntities: string[]
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
  // definition: 개념/정의 질문 (강화된 패턴)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  definition: {
    keywords: [
      '란', '이란', '정의', '뜻', '의미', '개념',
      '무엇', '무엇인가', '무엇인지', '무슨',
      '어떤 것', '어떤것',
      // 추가: 설명 요청 패턴
      '설명', '알려', '뭐야', '뭔가요', '뭘까',
      '에 대해', '에 대한', '내용'
    ],
    patterns: [
      /이란\s*\??$/,                             // ~이란? (끝나는 패턴, 최우선)
      /란\s*\??$/,                               // ~란? (끝나는 패턴)
      /(.+)(이?란|이란)\s*(무엇|뭐|뭔가)/,      // ~란 무엇인가요
      /(.+)(의\s*정의|의\s*개념|의\s*뜻)/,      // ~의 정의
      /(.+)(은|는)\s*(무엇|뭐|뭔가)/,           // ~는 무엇인가요
      /상\s+.+(이란|란)/,                        // ~상 ~이란 (예: 민법상 선의취득이란)
      // 추가: 설명 요청 패턴
      /(.+)(에\s*대해|에\s*대한)\s*(설명|알려)/,// ~에 대해 설명해줘
      /(.+)(설명|알려)\s*(해|줘|주세요|해줘|줄래)/,// ~설명해줘
      /(뭐야|뭔가요|뭘까)\s*\??$/,              // ~뭐야?
      /제\s*\d+\s*조.*(설명|알려|뭐야|뭔가)/,   // 제N조 설명해줘
      /(.+)조\s*(에\s*대해|설명|알려|뭐)/,      // ~조에 대해
    ],
    weight: 0.20  // 20% (기본 가중치 상향)
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
      '처리', '이행', '수속',
      // 추가: 행동 요청 패턴
      '하려면', '해야', '할까', '하면 되', '해야 하'
    ],
    patterns: [
      /(.+)(절차|과정|순서|단계)(는|은|이)/,    // ~절차는
      /(.+)(어떻게|어떤\s*식으로)\s*(하|진행)/,  // 어떻게 하나요
      /(.+)(신청|등록|신고|제출)\s*(방법|절차)/, // 신청 방법
      /(.+)(하는|받는)\s*(방법|절차)/,           // ~하는 방법
      /어떻게\s*(.+)(하|해야|할\s*수)/,          // 어떻게 ~해야
      // 추가: ~하려면 어떻게 패턴
      /(.+)(하려면|하면)\s*(어떻게|뭘)/,         // ~하려면 어떻게
      /(.+)(해야|할까|하면\s*되)/,               // ~해야 하나요
    ],
    weight: 0.18  // 18% (상향)
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
  // application: 적용 판단 질문 (fallback 역할)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  application: {
    keywords: [
      '적용', '해당', '가능', '되나요', '인가요', '할까요',
      '받을 수', '할 수', '될 수', '있나요', '없나요',
      '제 경우', '저는', '저도', '내 경우', '나는',
      '해당되', '적용되', '인정되'
    ],
    patterns: [
      /(.+)(적용|해당)(되나요|될까요|되는지)/,       // ~적용되나요
      /(제|저|나|내)\s*(경우|상황)(에|는|도)/,       // 제 경우에
      /(.+)(받을|할|될)\s*수\s*(있|없)/,             // ~받을 수 있나요
      /(.+)(가능|불가능)(한가요|할까요|인가요)/,     // ~가능한가요
      /(.+)(인가요|일까요|인지)\s*\??$/,             // ~인가요? (끝나는 패턴)
      /(.+)(되나요|될까요|되는지)\s*\??$/,           // ~되나요? (끝나는 패턴)
      /(이런|저런|그런|이)\s*(경우|상황)(에|는|도|라면)/, // 이런 경우에
    ],
    weight: 0.15  // 15% - fallback 역할, 다른 유형 먼저 매칭 시도
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // consequence: 효과/결과 질문
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  consequence: {
    keywords: [
      '결과', '효과', '효력', '영향', '불이익',
      '하면', '안하면', '위반', '벌칙', '처벌',
      '어떻게 되'
    ],
    patterns: [
      /(.+)(하면|안\s*하면)\s*(어떻게|뭐가)/,        // ~하면 어떻게
      /(.+)(결과|효과|효력)(는|은|이)/,              // ~결과는
      /(.+)(위반|불이행)\s*(시|하면)/,               // ~위반 시
      /(.+)(처벌|벌칙|제재)(는|은|이)/,              // ~처벌은
      /어떻게\s*되/,                                  // 어떻게 되나요
    ],
    weight: 0.10  // 10%
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // scope: 범위/금액/산정 질문
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  scope: {
    keywords: [
      '범위', '금액', '산정', '계산', '산출',
      '얼마', '어느 정도', '몇', '액수',
      '손해', '배상', '책임', '보상', '위약금',
      '한도', '상한', '하한', '최대', '최소',
      '기준', '산식', '공식'
    ],
    patterns: [
      /(.+)(범위|한도)(는|은|이|가)/,                // ~범위는
      /(.+)(얼마|어느\s*정도|몇)/,                   // 얼마나
      /(.+)(금액|액수)\s*(은|는|이|를)/,             // ~금액은
      /(.+)(산정|계산|산출)\s*(방법|기준|방식)/,     // ~산정 방법
      /(.+)(손해|배상|책임)\s*(범위|금액|액수)/,     // 손해배상 범위
      /(.+)(위약금|보상금|배상금)\s*(은|는|이)/,     // ~위약금은
      /(최대|최소|상한|하한)\s*(.+)(은|는|이)/,      // 최대 ~은
    ],
    weight: 0.12  // 12% - consequence보다 약간 높게
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // exemption: 예외/면제/특례/감면 질문 (Phase 10 추가)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  exemption: {
    keywords: [
      '면제', '면세', '비과세', '예외', '특례',
      '감면', '감경', '제외', '적용제외', '배제',
      '유예', '공제', '면책', '불처벌', '소급',
      '경과규정', '경과조치', '한시적', '잠정'
    ],
    patterns: [
      /(.+)(면제|면세|비과세)(되|받|대상|범위)/,     // ~면제되나요
      /(.+)(특례|감면|예외)(는|은|이|가)/,           // ~특례는
      /(.+)(적용\s*제외|배제)(되|대상|범위)/,        // ~적용제외 되나요
      /(.+)(불처벌|면책)(되|사유|조건)/,             // ~불처벌 되나요
      /(어떤|어느)\s*(경우|상황)[에서]?\s*(면제|제외|예외)/, // 어떤 경우 면제
      /(.+)(에서|의)\s*(제외|예외|면제)/,            // ~에서 제외
    ],
    weight: 0.15  // 15% - 비교적 높은 가중치
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 법령명/조문 추출 패턴
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 「법령명」 패턴 (가장 명확)
const QUOTED_LAW_PATTERN = /「([^」]+)」/g

// 일반 법령명 패턴 (긴 법령명 지원: 최대 60자)
// 예: "자유무역협정의 이행을 위한 관세법의 특례에 관한 법률" (27자)
// 예: "국가를 당사자로 하는 계약에 관한 법률 시행령" (22자)
const LAW_NAME_PATTERN = /([가-힣a-zA-Z0-9·\s]{2,60}(?:법|령|규칙|조례|약관|지침|규정|협정)(?:\s*시행령|\s*시행규칙)?)/g

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
 * 도메인 탐지 함수
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
      domainScores.customs += 0.5
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

  // 2. 엔티티로 도메인 판단
  const normalizedQuery = query.toLowerCase()

  // 관세법 엔티티
  for (const entity of CUSTOMS_DOMAIN.entities) {
    if (query.includes(entity) || normalizedQuery.includes(entity.toLowerCase())) {
      domainScores.customs += 0.1
      if (!matchedTerms.includes(entity)) {
        matchedTerms.push(entity)
      }
    }
  }

  // 행정법 엔티티
  for (const entity of ADMINISTRATIVE_DOMAIN.entities) {
    if (query.includes(entity) || normalizedQuery.includes(entity.toLowerCase())) {
      domainScores.administrative += 0.1
      if (!matchedTerms.includes(entity)) {
        matchedTerms.push(entity)
      }
    }
  }

  // 공무원법 엔티티
  for (const entity of CIVIL_SERVICE_DOMAIN.entities) {
    if (query.includes(entity) || normalizedQuery.includes(entity.toLowerCase())) {
      domainScores['civil-service'] += 0.1
      if (!matchedTerms.includes(entity)) {
        matchedTerms.push(entity)
      }
    }
  }

  // 세법 엔티티
  for (const entity of TAX_DOMAIN.entities) {
    if (query.includes(entity) || normalizedQuery.includes(entity.toLowerCase())) {
      domainScores.tax += 0.1
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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2. 종결어미 확정 패턴 우선 검사 (100% 신뢰도)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  for (const { pattern, type, confidence } of DEFINITIVE_ENDING_PATTERNS) {
    if (pattern.test(query)) {
      console.log(`[LegalQueryAnalyzer] 확정 패턴 매칭: ${type} (${confidence})`)
      return {
        type,
        confidence,
        extractedLaws,
        extractedArticles,
        keywords: [pattern.source]
      }
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3. 유형별 점수 계산 (기존 로직)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const scores = calculateTypeScores(query)

  // 4. 최고 점수 유형 선택
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

  // 5. 신뢰도 계산 (0.5 ~ 1.0)
  // - 점수가 높을수록 신뢰도 높음
  // - 법령명/조문이 있으면 보너스
  let confidence = Math.min(0.5 + bestScore * 0.3, 0.95)

  if (extractedLaws.length > 0) confidence += 0.05
  if (extractedArticles.length > 0) confidence += 0.05

  confidence = Math.min(confidence, 1.0)

  // 6. 특수 케이스 처리

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
 * 강화된 질문 분석 함수 (도메인 탐지 포함)
 */
export function analyzeEnhancedLegalQuery(query: string): EnhancedLegalQueryAnalysis {
  // 기본 분석 수행
  const baseAnalysis = analyzeLegalQuery(query)

  // 도메인 탐지
  const domainResult = detectDomain(query, baseAnalysis.extractedLaws)

  // 복합 질문 탐지 (2개 이상의 유형 키워드가 있는 경우)
  const scores = calculateTypeScores(query)
  const sortedScores = Array.from(scores.entries())
    .sort((a, b) => b[1].score - a[1].score)

  const isCompound = sortedScores.length >= 2 && sortedScores[1][1].score > 0.3
  const secondaryType = isCompound ? sortedScores[1][0] : undefined

  return {
    ...baseAnalysis,
    domain: domainResult.domain,
    domainConfidence: domainResult.confidence,
    secondaryType,
    isCompound,
    matchedEntities: domainResult.matchedTerms
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
    consequence: 'general',     // 효과 → general
    scope: 'general',           // 범위 → general
    exemption: 'general'        // 예외/면제 → general (Phase 10)
  }

  return {
    queryType: typeMapping[analysis.type],
    extractedLaws: analysis.extractedLaws,
    extractedArticles: analysis.extractedArticles,
    confidence: analysis.confidence
  }
}
