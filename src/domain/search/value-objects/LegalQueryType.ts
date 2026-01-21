/**
 * LegalQueryType - 법률 질문 유형 정의
 *
 * 8가지 질문 유형과 우선순위 패턴
 */

// 8가지 법률 질문 유형
export type LegalQueryType =
  | 'definition'    // 개념/정의
  | 'requirement'   // 요건/조건
  | 'procedure'     // 절차/방법
  | 'comparison'    // 비교
  | 'application'   // 적용 판단
  | 'consequence'   // 효과/결과
  | 'scope'         // 범위/금액/산정
  | 'exemption'     // 예외/면제/특례/감면

// 우선순위 기반 키워드 패턴
export const PRIORITY_KEYWORDS: Record<LegalQueryType, {
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

// 종결어미 확정 패턴
export const DEFINITIVE_ENDING_PATTERNS: Array<{
  pattern: RegExp
  type: LegalQueryType
  confidence: number
}> = [
  // exemption
  { pattern: /(면제|면세|비과세)[은는이가]?\s*(대상|범위|요건)/, type: 'exemption', confidence: 0.99 },
  { pattern: /(면제|면세|비과세)[받을될]\s*수\s*(있|없)/, type: 'exemption', confidence: 0.98 },
  { pattern: /(특례|감면|예외)[은는이가]?\s*[?？]?\s*$/, type: 'exemption', confidence: 0.97 },

  // requirement
  { pattern: /(요건|조건|자격)[은는이가]?\s*(무엇|뭐|뭔가)/, type: 'requirement', confidence: 0.99 },
  { pattern: /(요건|조건|자격)[은는이가]?\s*[?？]?\s*$/, type: 'requirement', confidence: 0.98 },
  { pattern: /(되려면|하려면|받으려면)\s*[?？]?\s*$/, type: 'requirement', confidence: 0.93 },

  // application
  { pattern: /(대상|해당|적용)[인이]?(가요?|나요?|까요?)\s*[?？]?\s*$/, type: 'application', confidence: 0.98 },
  { pattern: /(가능|불가능)[한인]?(가요?|나요?|까요?)?\s*[?？]?\s*$/, type: 'application', confidence: 0.95 },

  // scope
  { pattern: /얼마[인이가나까요?？\s]*$/, type: 'scope', confidence: 0.98 },
  { pattern: /(세율|세액|요율|이자율|비율)[은는이가]?\s*[?？]?\s*$/, type: 'scope', confidence: 0.98 },
  { pattern: /(산정|계산|산출)\s*(방법|기준|방식)/, type: 'scope', confidence: 0.96 },

  // consequence
  { pattern: /(위반|불이행|미이행)\s*(시|하면)[에은는]?\s*[?？]?\s*$/, type: 'consequence', confidence: 0.96 },
  { pattern: /(처벌|벌칙|제재|가산세|과태료)[은는이가]?\s*[?？]?\s*$/, type: 'consequence', confidence: 0.95 },

  // comparison
  { pattern: /(차이|다른\s*점|구별|구분)[점은는이가]?\s*[?？]?\s*$/, type: 'comparison', confidence: 0.98 },
  { pattern: /\s(vs|VS)\s/, type: 'comparison', confidence: 0.95 },

  // procedure
  { pattern: /(절차|과정|순서|단계)[은는이가]?\s*[?？]?\s*$/, type: 'procedure', confidence: 0.98 },
  { pattern: /어떻게\s*(하|신청|진행|처리)[나요면]?\s*[?？]?\s*$/, type: 'procedure', confidence: 0.93 },

  // definition
  { pattern: /[이]?란\s*[?？]?\s*$/, type: 'definition', confidence: 0.99 },
  { pattern: /의\s*(정의|개념|뜻)[은는이가]?\s*[?？]?\s*$/, type: 'definition', confidence: 0.99 },
  { pattern: /(은|는)\s*무엇[인이]?[가요지]?\s*[?？]?\s*$/, type: 'definition', confidence: 0.97 },
  { pattern: /궁금[해하]?\s*[?？]?\s*$/, type: 'definition', confidence: 0.95 },
  { pattern: /(알려|설명|가르쳐)(줘|주세요|줄래|줄\s*수)\s*[?？]?\s*$/, type: 'definition', confidence: 0.95 }
]
