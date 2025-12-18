/**
 * Router Agent - AI 기반 질문 분석 및 검색 최적화
 *
 * Gemini 2.5 Flash Lite를 사용해 질문을 분석하고:
 * - 질문 유형 분류 (8가지)
 * - 도메인 탐지 (5가지)
 * - 검색 키워드 추출 (Citation 히트율 향상)
 * - 연관 용어 확장 (도메인 지식 기반)
 */

import type {
  RouterAnalysis,
  QueryType,
  LegalDomain,
  QueryComplexity,
  AgentType,
  SearchOptimization
} from './types'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 도메인별 연관 용어 DB (검색 확장용)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DOMAIN_RELATED_TERMS: Record<LegalDomain, Record<string, string[]>> = {
  customs: {
    '신고납부': ['납세의무자', '과세가격', '납부기한', '가산세', '자진납부'],
    '수입신고': ['통관', '세관장', '수입물품', '신고수리', '검사'],
    '수출신고': ['적재', '선적', '반출', '수출물품'],
    '원산지': ['원산지증명서', 'FTA', '협정관세', '특혜관세', '원산지결정기준'],
    '과세가격': ['거래가격', '가산요소', '공제요소', 'CIF', 'FOB'],
    '관세율': ['기본세율', '협정세율', '잠정세율', '할당관세', '덤핑방지관세'],
    '보세': ['보세구역', '보세창고', '보세운송', '보세가공'],
    '환급': ['관세환급', '개별환급', '간이환급', '환급청구']
  },
  administrative: {
    '행정처분': ['처분청', '행정청', '재량', '기속행위', '처분사유'],
    '행정심판': ['재결', '심판청구', '심판위원회', '집행정지'],
    '허가': ['허가취소', '허가조건', '영업허가', '인허가'],
    '청문': ['사전통지', '의견제출', '청문주재자'],
    '과태료': ['질서위반', '과태료부과', '이의제기']
  },
  'civil-service': {
    '승진': ['승진심사', '근무성적', '승진후보자', '승진임용'],
    '징계': ['파면', '해임', '강등', '정직', '감봉', '견책', '소청'],
    '휴직': ['병가', '육아휴직', '공무상휴직', '복직'],
    '연금': ['공무원연금', '퇴직급여', '유족급여', '재직기간']
  },
  tax: {
    '과세': ['과세표준', '세율', '납세의무', '과세기간'],
    '공제': ['세액공제', '소득공제', '필요경비', '손금'],
    '신고': ['확정신고', '예정신고', '수정신고', '경정청구'],
    '가산세': ['무신고가산세', '과소신고가산세', '납부불성실가산세']
  },
  general: {}
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Router Agent System Prompt (검색 최적화 포함)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ROUTER_SYSTEM_PROMPT = `당신은 한국 법률 질문 분석 및 검색 최적화 전문 AI입니다.
사용자의 법률 질문을 분석하여 JSON 형식으로 분류 결과와 검색 최적화 정보를 반환합니다.

## 분석 항목

### 1. 질문 유형 (primaryType) - 8가지 중 선택
- definition: 개념/정의/해석 질문 ("~이란?", "~의 정의", "~의 의미", "해석")
- requirement: 요건/조건/자격 질문 ("~요건은?", "~하려면", "자격", "충족")
- procedure: 절차/방법/구제/불복 질문 ("어떻게", "절차", "신청", "행정심판")
- comparison: 비교/구분 질문 ("차이", "비교", "vs", "구분")
- application: 적용/판단 질문 ("적용되나요?", "해당되나요?", "제 경우")
- consequence: 효과/결과/위반/처벌 질문 ("위반 시", "처벌", "벌칙", "가산세")
- scope: 범위/금액/기한/산정 질문 ("얼마", "세율", "기한", "범위", "계산")
- exemption: 예외/면제/특례/감면 질문 ("면제", "특례", "감면", "예외", "비과세")

### 2. 도메인 (domain) - 5가지 중 선택
- customs: 관세법 (관세, 통관, 수출입, FTA, HS코드, 원산지, 보세)
- administrative: 행정법 (행정처분, 행정심판, 허가, 인가, 청문, 과태료)
- civil-service: 공무원법 (승진, 징계, 휴직, 공무원연금, 소청)
- tax: 세법 (소득세, 법인세, 부가세, 세액공제, 과세표준)
- general: 일반/기타

### 3. 검색 최적화 (searchOptimization) - 가장 중요!
RAG 검색의 Citation 히트율을 높이기 위해 반드시 다음을 추출:

- optimizedQuery: 검색에 최적화된 쿼리 (불필요한 조사/어미 제거, 핵심만)
- searchKeywords: 핵심 검색 키워드 (법령명, 조문, 핵심 개념 - 우선순위 순)
- relatedTerms: 연관 법률 용어 (질문에 없지만 검색에 도움될 용어)
- synonyms: 동의어/유사어 (검색 범위 확장)
- searchHints: 검색 힌트 (targetSection, articleRange, keyProvisions)

## 응답 형식 (반드시 JSON)

{
  "primaryType": "...",
  "secondaryType": null,
  "domain": "...",
  "domainConfidence": 0.0~1.0,
  "complexity": "simple|moderate|complex",
  "extractedLaws": ["법령명1"],
  "extractedArticles": ["제N조"],
  "extractedEntities": ["엔티티1"],
  "intent": "질문의 핵심 의도",
  "subQuestions": null,
  "confidence": 0.0~1.0,
  "reasoning": "분류 근거",
  "searchOptimization": {
    "optimizedQuery": "관세법 제38조 신고납부 요건",
    "searchKeywords": ["관세법", "제38조", "신고납부", "요건"],
    "relatedTerms": ["납세의무자", "과세가격", "납부기한"],
    "synonyms": ["자진납부", "신고납세"],
    "searchHints": {
      "targetSection": null,
      "articleRange": null,
      "keyProvisions": ["신고납부", "납세의무"]
    },
    "strategy": "exact|semantic|hybrid"
  }
}

## 검색 최적화 작성 규칙

1. **optimizedQuery**:
   - 질문 어미 제거 ("~인가요?", "~하나요?" → 제거)
   - 조사 최소화 ("의", "에서", "으로" → 공백으로)
   - 법령명 + 조문 + 핵심 키워드 순서

2. **searchKeywords** (중요도 순):
   - 1순위: 법령명 (있으면)
   - 2순위: 조문 번호 (있으면)
   - 3순위: 핵심 개념 (질문의 주제)
   - 4순위: 행위/대상 (동사/명사)

3. **relatedTerms** (도메인 지식 활용):
   - 질문에 없지만 해당 조문/개념과 관련된 용어
   - 예: "신고납부" → ["납세의무자", "과세가격", "납부기한"]
   - 예: "원산지" → ["원산지증명서", "FTA", "협정관세"]

4. **synonyms**:
   - 동일 개념의 다른 표현
   - 예: "신고납부" ↔ "자진납부", "납세신고"

5. **strategy**:
   - exact: 특정 조문 검색 (법령명+조문 있을 때)
   - semantic: 개념 검색 (조문 없이 개념만)
   - hybrid: 복합 검색 (여러 조문/개념)

## 예시

질문: "관세법 제38조 신고납부의 요건은?"
응답:
{
  "primaryType": "requirement",
  "secondaryType": null,
  "domain": "customs",
  "domainConfidence": 0.95,
  "complexity": "simple",
  "extractedLaws": ["관세법"],
  "extractedArticles": ["제38조"],
  "extractedEntities": ["신고납부"],
  "intent": "관세법상 신고납부 제도의 적용 요건을 알고자 함",
  "subQuestions": null,
  "confidence": 0.95,
  "reasoning": "'요건은?'으로 requirement. 관세법 명시로 customs. 단일 조문으로 simple.",
  "searchOptimization": {
    "optimizedQuery": "관세법 제38조 신고납부 요건 납세의무",
    "searchKeywords": ["관세법", "제38조", "신고납부", "요건"],
    "relatedTerms": ["납세의무자", "과세가격", "납부기한", "가산세", "자진납부"],
    "synonyms": ["자진납부", "납세신고", "세액신고"],
    "searchHints": {
      "targetSection": null,
      "articleRange": "제38조~제39조",
      "keyProvisions": ["신고납부", "납세의무", "납부기한"]
    },
    "strategy": "exact"
  }
}

질문: "수입할 때 관세 면제받으려면 어떻게 해야 하나요?"
응답:
{
  "primaryType": "exemption",
  "secondaryType": "procedure",
  "domain": "customs",
  "domainConfidence": 0.90,
  "complexity": "moderate",
  "extractedLaws": [],
  "extractedArticles": [],
  "extractedEntities": ["관세", "면제", "수입"],
  "intent": "수입 시 관세 면제를 받기 위한 요건과 절차를 알고자 함",
  "subQuestions": ["관세 면제 대상은?", "관세 면제 신청 절차는?"],
  "confidence": 0.88,
  "reasoning": "'면제'로 exemption, '어떻게'로 procedure 추가. 수입/관세로 customs.",
  "searchOptimization": {
    "optimizedQuery": "관세 면제 요건 절차 수입물품",
    "searchKeywords": ["관세", "면제", "수입", "요건", "절차"],
    "relatedTerms": ["면세", "감면", "관세법 제88조", "외교관면세", "재수입면세", "학술연구용품"],
    "synonyms": ["면세", "관세감면", "세금면제"],
    "searchHints": {
      "targetSection": "제4장 면세",
      "articleRange": "제88조~제100조",
      "keyProvisions": ["면세", "감면", "면제물품"]
    },
    "strategy": "semantic"
  }
}

## 중요 규칙
1. 반드시 유효한 JSON만 반환 (마크다운 없이)
2. searchOptimization은 필수 - 빠뜨리지 마세요
3. relatedTerms는 최소 3개 이상 추출
4. 도메인 지식을 활용해 연관 용어 확장
`

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Type Mapping
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const QUERY_TYPE_TO_AGENT: Record<QueryType, AgentType> = {
  definition: 'definition-expert',
  requirement: 'requirement-expert',
  procedure: 'procedure-expert',
  comparison: 'comparison-expert',
  application: 'application-expert',
  consequence: 'consequence-expert',
  scope: 'scope-expert',
  exemption: 'exemption-expert'
}

const DOMAIN_TO_AGENT: Record<LegalDomain, AgentType | null> = {
  customs: 'customs-expert',
  administrative: 'administrative-expert',
  'civil-service': 'civil-service-expert',
  tax: 'tax-expert',
  general: null
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Router Agent Implementation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Router Agent - 질문 분석 및 검색 최적화
 * Gemini 2.5 Flash Lite 사용 (무료 티어)
 */
export async function analyzeQuery(query: string): Promise<RouterAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required')
  }

  console.log('[Router Agent] Analyzing query:', query)
  const startTime = Date.now()

  try {
    // Gemini 2.5 Flash Lite 호출 (Router용 - 빠르고 저렴)
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: `다음 법률 질문을 분석하고 검색 최적화 정보를 추출하세요:\n\n"${query}"` }]
          }],
          systemInstruction: {
            parts: [{ text: ROUTER_SYSTEM_PROMPT }]
          },
          generationConfig: {
            temperature: 0,
            topP: 0.8,
            topK: 10,
            maxOutputTokens: 1500,
            responseMimeType: 'application/json'
          }
        })
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Router Agent] API Error:', response.status, errorText)
      return fallbackAnalysis(query)
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    console.log('[Router Agent] Response time:', Date.now() - startTime, 'ms')

    // JSON 파싱
    const parsed = JSON.parse(text)

    // 에이전트 추천 목록 생성
    const recommendedAgents = determineRecommendedAgents(parsed)

    // searchOptimization 보완 (AI가 누락한 경우)
    const searchOptimization = ensureSearchOptimization(
      parsed.searchOptimization,
      query,
      parsed.extractedLaws || [],
      parsed.extractedArticles || [],
      parsed.extractedEntities || [],
      parsed.domain || 'general'
    )

    const analysis: RouterAnalysis = {
      primaryType: parsed.primaryType || 'application',
      secondaryType: parsed.secondaryType || undefined,
      domain: parsed.domain || 'general',
      domainConfidence: parsed.domainConfidence || 0.5,
      complexity: parsed.complexity || 'simple',
      extractedLaws: parsed.extractedLaws || [],
      extractedArticles: parsed.extractedArticles || [],
      extractedEntities: parsed.extractedEntities || [],
      intent: parsed.intent || '질문 의도 분석',
      subQuestions: parsed.subQuestions || undefined,
      confidence: parsed.confidence || 0.5,
      recommendedAgents,
      reasoning: parsed.reasoning || '',
      searchOptimization
    }

    console.log('[Router Agent] Analysis complete:', {
      type: analysis.primaryType,
      domain: analysis.domain,
      keywords: analysis.searchOptimization.searchKeywords,
      relatedTerms: analysis.searchOptimization.relatedTerms.slice(0, 3)
    })

    return analysis

  } catch (error) {
    console.error('[Router Agent] Error:', error)
    return fallbackAnalysis(query)
  }
}

/**
 * searchOptimization 보완 (AI 출력이 불완전한 경우)
 */
function ensureSearchOptimization(
  aiOutput: Partial<SearchOptimization> | undefined,
  query: string,
  laws: string[],
  articles: string[],
  entities: string[],
  domain: LegalDomain
): SearchOptimization {
  const base = aiOutput || {}

  // 기본 키워드 추출
  const defaultKeywords = [
    ...laws,
    ...articles,
    ...entities
  ].filter(Boolean)

  // 검색 쿼리 최적화 (없으면 생성)
  const optimizedQuery = base.optimizedQuery || buildOptimizedQuery(query, laws, articles, entities)

  // 연관 용어 확장 (도메인 지식 활용)
  const relatedTerms = expandRelatedTerms(
    base.relatedTerms || [],
    entities,
    domain
  )

  // 검색 전략 결정
  const strategy = determineStrategy(laws, articles)

  return {
    optimizedQuery,
    searchKeywords: base.searchKeywords?.length ? base.searchKeywords : defaultKeywords,
    relatedTerms,
    synonyms: base.synonyms || [],
    searchHints: base.searchHints || {
      targetSection: undefined,
      articleRange: articles.length ? `${articles[0]}` : undefined,
      keyProvisions: entities.slice(0, 3)
    },
    strategy
  }
}

/**
 * 검색 쿼리 최적화
 */
function buildOptimizedQuery(
  query: string,
  laws: string[],
  articles: string[],
  entities: string[]
): string {
  // 불필요한 어미/조사 제거
  let optimized = query
    .replace(/[?？]$/, '')
    .replace(/(인가요|나요|할까요|일까요|는지|은지|에요|어요)$/, '')
    .replace(/\s+(의|에서|으로|에|을|를|이|가|은|는)\s+/g, ' ')
    .trim()

  // 법령명 + 조문 + 키워드 순서로 재구성
  if (laws.length || articles.length) {
    const parts = [
      ...laws,
      ...articles,
      ...entities.slice(0, 3)
    ].filter(Boolean)

    if (parts.length > 0) {
      optimized = parts.join(' ')
    }
  }

  return optimized
}

/**
 * 연관 용어 확장 (도메인 지식 활용)
 */
function expandRelatedTerms(
  aiTerms: string[],
  entities: string[],
  domain: LegalDomain
): string[] {
  const expanded = new Set(aiTerms)

  // 도메인별 연관 용어 DB에서 확장
  const domainTerms = DOMAIN_RELATED_TERMS[domain] || {}

  for (const entity of entities) {
    const related = domainTerms[entity]
    if (related) {
      related.forEach(term => expanded.add(term))
    }
  }

  // 도메인 키워드로 추가 확장
  for (const [key, terms] of Object.entries(domainTerms)) {
    // 엔티티 중 하나라도 키워드에 포함되면 연관 용어 추가
    if (entities.some(e => key.includes(e) || e.includes(key))) {
      terms.slice(0, 3).forEach(term => expanded.add(term))
    }
  }

  return Array.from(expanded).slice(0, 10)  // 최대 10개
}

/**
 * 검색 전략 결정
 */
function determineStrategy(
  laws: string[],
  articles: string[]
): 'exact' | 'semantic' | 'hybrid' {
  if (laws.length > 0 && articles.length > 0) {
    return 'exact'
  }
  if (laws.length > 1 || articles.length > 1) {
    return 'hybrid'
  }
  return 'semantic'
}

/**
 * 추천 에이전트 목록 결정
 */
function determineRecommendedAgents(analysis: any): AgentType[] {
  const agents: AgentType[] = []

  const primaryAgent = QUERY_TYPE_TO_AGENT[analysis.primaryType as QueryType]
  if (primaryAgent) {
    agents.push(primaryAgent)
  }

  if (analysis.domainConfidence >= 0.7) {
    const domainAgent = DOMAIN_TO_AGENT[analysis.domain as LegalDomain]
    if (domainAgent) {
      agents.push(domainAgent)
    }
  }

  if (analysis.secondaryType) {
    const secondaryAgent = QUERY_TYPE_TO_AGENT[analysis.secondaryType as QueryType]
    if (secondaryAgent && !agents.includes(secondaryAgent)) {
      agents.push(secondaryAgent)
    }
  }

  if (agents.length === 0) {
    agents.push('application-expert')
  }

  return agents
}

/**
 * Fallback: 규칙 기반 분석 (API 실패 시)
 */
function fallbackAnalysis(query: string): RouterAnalysis {
  console.log('[Router Agent] Using fallback rule-based analysis')

  let primaryType: QueryType = 'application'
  let domain: LegalDomain = 'general'
  let complexity: QueryComplexity = 'simple'

  // 질문 유형 판별
  if (/면제|특례|감면|예외|비과세|제외|면세/.test(query)) {
    primaryType = 'exemption'
  } else if (/[이]?란\s*[?？]?\s*$|정의|개념|뜻|무엇|의미|해석/.test(query)) {
    primaryType = 'definition'
  } else if (/요건|조건|자격|하려면|충족/.test(query)) {
    primaryType = 'requirement'
  } else if (/절차|방법|어떻게|신청|등록|심판|불복|취소소송/.test(query)) {
    primaryType = 'procedure'
  } else if (/차이|비교|vs|구분|다른/.test(query)) {
    primaryType = 'comparison'
  } else if (/위반|처벌|벌칙|하면\s*어떻게|결과|효과|가산세/.test(query)) {
    primaryType = 'consequence'
  } else if (/얼마|세율|금액|범위|기한|산정|계산|기간/.test(query)) {
    primaryType = 'scope'
  }

  // 도메인 판별
  if (/관세|통관|수입|수출|FTA|HS코드|원산지/.test(query)) {
    domain = 'customs'
  } else if (/행정처분|행정심판|허가|인가|청문/.test(query)) {
    domain = 'administrative'
  } else if (/공무원|승진|징계|휴직|연금/.test(query)) {
    domain = 'civil-service'
  } else if (/소득세|법인세|부가세|세액|납세/.test(query)) {
    domain = 'tax'
  }

  // 법령/조문 추출
  const lawMatches = query.match(/「([^」]+)」/g) || []
  const extractedLaws = lawMatches.map(m => m.replace(/[「」]/g, ''))

  const articleMatches = query.match(/제\d+조(?:의\d+)?/g) || []
  const extractedArticles = articleMatches

  // 엔티티 추출
  const entityPatterns = [
    /신고납부|부과고지|원산지|과세가격|통관|수입신고|수출신고/g,
    /행정처분|행정심판|허가|인가|청문|과태료/g,
    /승진|징계|휴직|연금|소청/g,
    /과세|공제|신고|가산세|세액/g
  ]
  const extractedEntities: string[] = []
  for (const pattern of entityPatterns) {
    const matches = query.match(pattern) || []
    extractedEntities.push(...matches)
  }

  // 복잡도
  if (extractedLaws.length > 1 || extractedArticles.length > 2) {
    complexity = 'moderate'
  }

  const recommendedAgents = determineRecommendedAgents({
    primaryType,
    domain,
    domainConfidence: domain === 'general' ? 0.5 : 0.8
  })

  // 검색 최적화 생성
  const searchOptimization = ensureSearchOptimization(
    undefined,
    query,
    extractedLaws,
    extractedArticles,
    extractedEntities,
    domain
  )

  return {
    primaryType,
    secondaryType: undefined,
    domain,
    domainConfidence: domain === 'general' ? 0.5 : 0.8,
    complexity,
    extractedLaws,
    extractedArticles,
    extractedEntities,
    intent: '규칙 기반 분석',
    subQuestions: undefined,
    confidence: 0.7,
    recommendedAgents,
    reasoning: 'Fallback: 규칙 기반 분석',
    searchOptimization
  }
}

/**
 * 빠른 분류 (규칙 기반만 사용 - 캐시용)
 */
export function quickClassify(query: string): {
  type: QueryType
  domain: LegalDomain
  confidence: number
} {
  const analysis = fallbackAnalysis(query)
  return {
    type: analysis.primaryType,
    domain: analysis.domain,
    confidence: analysis.confidence
  }
}
