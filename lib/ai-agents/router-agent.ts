/**
 * Router Agent - AI 기반 질문 분석 및 라우팅
 *
 * Gemini를 사용해 질문을 분석하고 최적의 전문 에이전트를 선택
 * - 질문 의도 파악
 * - 도메인 탐지
 * - 복잡도 평가
 * - 에이전트 라우팅 결정
 */

import type {
  RouterAnalysis,
  QueryType,
  LegalDomain,
  QueryComplexity,
  AgentType
} from './types'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Router Agent System Prompt
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ROUTER_SYSTEM_PROMPT = `당신은 한국 법률 질문 분석 전문 AI입니다.
사용자의 법률 질문을 분석하여 JSON 형식으로 분류 결과를 반환합니다.

## 분석 항목

### 1. 질문 유형 (primaryType) - 8가지 중 선택
- definition: 개념/정의/해석 질문 ("~이란?", "~의 정의", "~의 의미", "해석", "판례")
- requirement: 요건/조건/자격 질문 ("~요건은?", "~하려면", "자격", "충족")
- procedure: 절차/방법/구제/불복 질문 ("어떻게", "절차", "신청", "행정심판", "취소소송")
- comparison: 비교/구분 질문 ("차이", "비교", "vs", "구분", "다른 점")
- application: 적용/판단 질문 ("적용되나요?", "해당되나요?", "제 경우", "~에 해당")
- consequence: 효과/결과/위반/처벌 질문 ("하면 어떻게", "위반 시", "처벌", "벌칙", "가산세")
- scope: 범위/금액/기한/산정 질문 ("얼마", "세율", "기한", "범위", "산정", "계산")
- exemption: 예외/면제/특례/감면 질문 ("면제", "특례", "감면", "예외", "비과세", "제외")

### 2. 도메인 (domain) - 5가지 중 선택
- customs: 관세법 (관세, 통관, 수출입, FTA, HS코드, 원산지)
- administrative: 행정법 (행정처분, 행정심판, 허가, 인가, 청문)
- civil-service: 공무원법 (승진, 징계, 휴직, 공무원연금)
- tax: 세법 (소득세, 법인세, 부가세, 세액공제)
- general: 일반/기타

### 3. 복잡도 (complexity)
- simple: 단일 조문/개념에 대한 단순 질문
- moderate: 복수 조문 또는 연관 개념이 필요한 질문
- complex: 다중 법령 비교, 복합 적용, 여러 단계 분석 필요

### 4. 추출 정보
- extractedLaws: 질문에 언급된 법령명 (「」로 감싼 것 우선)
- extractedArticles: 언급된 조문 번호 (제N조, 제N조의M)
- extractedEntities: 도메인 특정 용어 (HS코드, 과세가격 등)

### 5. 의도 분석
- intent: 질문의 핵심 의도를 한 문장으로 설명
- subQuestions: 복잡한 질문인 경우 세부 질문으로 분해 (선택적)

## 응답 형식 (반드시 JSON)

\`\`\`json
{
  "primaryType": "definition|requirement|procedure|comparison|application|consequence|scope",
  "secondaryType": null 또는 "..."  (복합 질문인 경우),
  "domain": "customs|administrative|civil-service|tax|general",
  "domainConfidence": 0.0~1.0,
  "complexity": "simple|moderate|complex",
  "extractedLaws": ["법령명1", "법령명2"],
  "extractedArticles": ["제N조", "제M조"],
  "extractedEntities": ["엔티티1", "엔티티2"],
  "intent": "질문의 핵심 의도 설명",
  "subQuestions": ["세부질문1", "세부질문2"] 또는 null,
  "confidence": 0.0~1.0,
  "reasoning": "이렇게 분류한 근거 설명"
}
\`\`\`

## 예시

질문: "관세법 제38조 신고납부의 요건은?"
응답:
\`\`\`json
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
  "reasoning": "'요건은?'이라는 종결어미로 requirement 유형으로 분류. 관세법 명시로 customs 도메인. 단일 조문 질문으로 simple 복잡도."
}
\`\`\`

질문: "수입신고와 수출신고의 차이점은? 각각 어떻게 하나요?"
응답:
\`\`\`json
{
  "primaryType": "comparison",
  "secondaryType": "procedure",
  "domain": "customs",
  "domainConfidence": 0.90,
  "complexity": "moderate",
  "extractedLaws": [],
  "extractedArticles": [],
  "extractedEntities": ["수입신고", "수출신고"],
  "intent": "수입신고와 수출신고의 차이점과 각각의 절차를 알고자 함",
  "subQuestions": ["수입신고와 수출신고의 차이점은 무엇인가?", "수입신고는 어떻게 하는가?", "수출신고는 어떻게 하는가?"],
  "confidence": 0.90,
  "reasoning": "'차이점'으로 comparison, '어떻게 하나요'로 procedure 추가. 수입/수출은 customs 도메인. 비교+절차 질문으로 moderate 복잡도."
}
\`\`\`

## 중요 규칙
1. 반드시 유효한 JSON만 반환 (마크다운 코드블록 없이)
2. 확실하지 않으면 confidence를 낮게 설정
3. 복합 질문이면 secondaryType과 subQuestions 활용
4. 도메인을 판단할 수 없으면 general, domainConfidence 0.5 이하
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
 * Router Agent - 질문 분석 및 라우팅
 */
export async function analyzeQuery(query: string): Promise<RouterAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required')
  }

  console.log('[Router Agent] Analyzing query:', query)

  // Gemini API 호출 (빠른 분석을 위해 flash 모델 사용)
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: `다음 법률 질문을 분석하세요:\n\n"${query}"` }]
        }],
        systemInstruction: {
          parts: [{ text: ROUTER_SYSTEM_PROMPT }]
        },
        generationConfig: {
          temperature: 0,      // 결정적 출력
          topP: 0.8,
          topK: 10,
          maxOutputTokens: 1024,  // 분석에는 짧은 출력
          responseMimeType: 'application/json'  // JSON 강제
        }
      })
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[Router Agent] API Error:', errorText)
    // Fallback to rule-based analysis
    return fallbackAnalysis(query)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

  console.log('[Router Agent] Raw response:', text)

  try {
    // JSON 파싱
    const parsed = JSON.parse(text)

    // 에이전트 추천 목록 생성
    const recommendedAgents = determineRecommendedAgents(parsed)

    const analysis: RouterAnalysis = {
      primaryType: parsed.primaryType || 'application',
      secondaryType: parsed.secondaryType || undefined,
      domain: parsed.domain || 'general',
      domainConfidence: parsed.domainConfidence || 0.5,
      complexity: parsed.complexity || 'simple',
      extractedLaws: parsed.extractedLaws || [],
      extractedArticles: parsed.extractedArticles || [],
      extractedEntities: parsed.extractedEntities || [],
      intent: parsed.intent || '질문 의도 분석 실패',
      subQuestions: parsed.subQuestions || undefined,
      confidence: parsed.confidence || 0.5,
      recommendedAgents,
      reasoning: parsed.reasoning || ''
    }

    console.log('[Router Agent] Analysis result:', analysis)
    return analysis

  } catch (parseError) {
    console.error('[Router Agent] JSON parse error:', parseError)
    return fallbackAnalysis(query)
  }
}

/**
 * 추천 에이전트 목록 결정
 */
function determineRecommendedAgents(analysis: any): AgentType[] {
  const agents: AgentType[] = []

  // 1. 주요 질문 유형에 따른 전문 에이전트
  const primaryAgent = QUERY_TYPE_TO_AGENT[analysis.primaryType as QueryType]
  if (primaryAgent) {
    agents.push(primaryAgent)
  }

  // 2. 도메인 전문 에이전트 (domainConfidence가 높으면 추가)
  if (analysis.domainConfidence >= 0.7) {
    const domainAgent = DOMAIN_TO_AGENT[analysis.domain as LegalDomain]
    if (domainAgent) {
      agents.push(domainAgent)
    }
  }

  // 3. 복합 질문이면 secondaryType 에이전트 추가
  if (analysis.secondaryType) {
    const secondaryAgent = QUERY_TYPE_TO_AGENT[analysis.secondaryType as QueryType]
    if (secondaryAgent && !agents.includes(secondaryAgent)) {
      agents.push(secondaryAgent)
    }
  }

  // 기본값 (에이전트가 없으면)
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

  // 간단한 규칙 기반 분류
  let primaryType: QueryType = 'application'
  let domain: LegalDomain = 'general'
  let complexity: QueryComplexity = 'simple'

  // 질문 유형 판별 (우선순위 순서)
  // exemption을 먼저 체크 (면제/특례는 요건보다 우선)
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

  // 복잡도 판별
  const lawMatches = query.match(/「[^」]+」/g) || []
  const articleMatches = query.match(/제\d+조/g) || []
  if (lawMatches.length > 1 || articleMatches.length > 2) {
    complexity = 'moderate'
  }
  if (/비교.*절차|차이.*방법|여러|다양한/.test(query)) {
    complexity = 'complex'
  }

  // 법령/조문 추출
  const extractedLaws = lawMatches.map(m => m.replace(/[「」]/g, ''))
  const extractedArticles = articleMatches || []

  const recommendedAgents = determineRecommendedAgents({
    primaryType,
    domain,
    domainConfidence: domain === 'general' ? 0.5 : 0.8
  })

  return {
    primaryType,
    secondaryType: undefined,
    domain,
    domainConfidence: domain === 'general' ? 0.5 : 0.8,
    complexity,
    extractedLaws,
    extractedArticles,
    extractedEntities: [],
    intent: '규칙 기반 분석',
    subQuestions: undefined,
    confidence: 0.7,  // 규칙 기반은 신뢰도 낮게
    recommendedAgents,
    reasoning: 'Fallback: 규칙 기반 분석 사용'
  }
}

/**
 * 빠른 분류 (캐시/규칙 기반만 사용)
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
