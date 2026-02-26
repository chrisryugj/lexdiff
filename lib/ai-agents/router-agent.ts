/**
 * Router Agent - 규칙 기반 질문 분류
 *
 * FC-RAG 전환 후 LLM 기반 analyzeQuery() 제거.
 * quickClassify()만 남겨서 regex 기반 분류 제공.
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
// 헬퍼 함수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ensureSearchOptimization(
  aiOutput: Partial<SearchOptimization> | undefined,
  query: string,
  laws: string[],
  articles: string[],
  entities: string[],
  domain: LegalDomain
): SearchOptimization {
  const base = aiOutput || {}

  const defaultKeywords = [
    ...laws,
    ...articles,
    ...entities
  ].filter(Boolean)

  const optimizedQuery = base.optimizedQuery || buildOptimizedQuery(query, laws, articles, entities)

  const relatedTerms = expandRelatedTerms(
    base.relatedTerms || [],
    entities,
    domain
  )

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

function buildOptimizedQuery(
  query: string,
  laws: string[],
  articles: string[],
  entities: string[]
): string {
  let optimized = query
    .replace(/[?？]$/, '')
    .replace(/(인가요|나요|할까요|일까요|는지|은지|에요|어요)$/, '')
    .replace(/\s+(의|에서|으로|에|을|를|이|가|은|는)\s+/g, ' ')
    .trim()

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

function expandRelatedTerms(
  aiTerms: string[],
  entities: string[],
  domain: LegalDomain
): string[] {
  const expanded = new Set(aiTerms)

  const domainTerms = DOMAIN_RELATED_TERMS[domain] || {}

  for (const entity of entities) {
    const related = domainTerms[entity]
    if (related) {
      related.forEach(term => expanded.add(term))
    }
  }

  for (const [key, terms] of Object.entries(domainTerms)) {
    if (entities.some(e => key.includes(e) || e.includes(key))) {
      terms.slice(0, 3).forEach(term => expanded.add(term))
    }
  }

  return Array.from(expanded).slice(0, 10)
}

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 규칙 기반 분석
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function fallbackAnalysis(query: string): RouterAnalysis {
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
  } else if (/얼마|세율|금액|범위|기한|산정|계산|기간|일수|몇\s*일/.test(query)) {
    primaryType = 'scope'
  }

  // 도메인 판별
  if (/관세|통관|수입|수출|FTA|HS코드|원산지/.test(query)) {
    domain = 'customs'
  } else if (/행정처분|행정심판|허가|인가|청문/.test(query)) {
    domain = 'administrative'
  } else if (/공무원|승진|징계|휴직|연금|복무|근무/.test(query)) {
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
    reasoning: '규칙 기반 분석',
    searchOptimization
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 빠른 분류 (규칙 기반 - LLM 호출 없음)
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
