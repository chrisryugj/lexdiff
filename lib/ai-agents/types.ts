/**
 * AI Agent System - Type Definitions
 *
 * Multi-Agent Router 아키텍처의 타입 정의
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Query Analysis Types (질문 분석 타입)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 8가지 질문 유형 */
export type QueryType =
  | 'definition'    // 개념/정의/해석 질문 ("~이란?", "~의 의미", "해석")
  | 'requirement'   // 요건/조건/자격 질문 ("~요건은?", "~하려면")
  | 'procedure'     // 절차/방법/구제/불복 질문 ("어떻게", "절차", "심판")
  | 'comparison'    // 비교/구분 질문 ("차이", "vs", "구분")
  | 'application'   // 적용/해당 판단 질문 ("적용되나요?", "해당되나요?")
  | 'consequence'   // 효과/결과/위반/처벌 질문 ("위반 시", "처벌")
  | 'scope'         // 범위/금액/기한/산정 질문 ("얼마", "세율", "기한")
  | 'exemption'     // 예외/면제/특례/감면 질문 ("면제", "특례", "감면", "예외")

/** 4가지 법률 도메인 */
export type LegalDomain =
  | 'customs'        // 관세법
  | 'administrative' // 행정법
  | 'civil-service'  // 공무원법
  | 'tax'            // 세법
  | 'general'        // 일반/기타

/** 질문 복잡도 */
export type QueryComplexity =
  | 'simple'         // 단순 질문 (단일 조문/개념)
  | 'moderate'       // 중간 복잡도 (복수 조문/연관 개념)
  | 'complex'        // 복잡한 질문 (다중 법령/비교/적용)

/** Router Agent 분석 결과 */
export interface RouterAnalysis {
  // 기본 분류
  primaryType: QueryType
  secondaryType?: QueryType  // 복합 질문인 경우

  // 도메인
  domain: LegalDomain
  domainConfidence: number

  // 복잡도
  complexity: QueryComplexity

  // 추출된 엔티티
  extractedLaws: string[]      // 법령명
  extractedArticles: string[]  // 조문 번호
  extractedEntities: string[]  // 도메인 엔티티 (HS코드, 과세가격 등)

  // 의도 분석
  intent: string               // 자연어 의도 설명
  subQuestions?: string[]      // 세부 질문 분해 (복잡한 질문인 경우)

  // 신뢰도
  confidence: number           // 전체 분석 신뢰도 (0.0 ~ 1.0)

  // 라우팅 결정
  recommendedAgents: AgentType[]  // 추천 에이전트 목록 (우선순위 순)

  // 메타데이터
  reasoning: string            // AI의 분류 근거

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 검색 최적화 (RAG Citation 히트율 향상)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  searchOptimization: SearchOptimization
}

/** 검색 최적화 정보 (Citation 히트율 향상) */
export interface SearchOptimization {
  // 최적화된 검색 쿼리 (RAG에 전달)
  optimizedQuery: string

  // 핵심 검색 키워드 (우선순위 순)
  searchKeywords: string[]

  // 연관 법률 용어 (도메인 지식 기반 확장)
  relatedTerms: string[]

  // 동의어/유사어 (검색 범위 확장)
  synonyms: string[]

  // 검색 힌트 (조문 구조 관련)
  searchHints: {
    targetSection?: string      // "제1장", "부칙" 등
    articleRange?: string       // "제30조~제40조"
    keyProvisions?: string[]    // 핵심 조항 키워드
  }

  // 검색 전략
  strategy: 'exact' | 'semantic' | 'hybrid'
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Agent Types (에이전트 타입)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 전문 에이전트 유형 (8가지) */
export type SpecialistAgentType =
  | 'definition-expert'   // 개념/정의/해석 전문가
  | 'requirement-expert'  // 요건/조건/자격 전문가
  | 'procedure-expert'    // 절차/방법/구제 전문가
  | 'comparison-expert'   // 비교/구분 전문가
  | 'application-expert'  // 적용/판단 전문가
  | 'consequence-expert'  // 효과/결과/처벌 전문가
  | 'scope-expert'        // 범위/금액/기한 전문가
  | 'exemption-expert'    // 예외/면제/특례 전문가

/** 도메인 에이전트 유형 */
export type DomainAgentType =
  | 'customs-expert'
  | 'administrative-expert'
  | 'civil-service-expert'
  | 'tax-expert'

/** 모든 에이전트 유형 */
export type AgentType = SpecialistAgentType | DomainAgentType | 'router' | 'synthesizer'

/** 에이전트 설정 */
export interface AgentConfig {
  id: AgentType
  name: string
  description: string
  systemPrompt: string
  temperature: number
  topP: number
  topK: number
  maxOutputTokens: number
  specialization?: string[]  // 전문 분야
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Agent Response Types (에이전트 응답 타입)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Citation 정보 */
export interface Citation {
  lawName: string
  articleNum: string
  articleTitle?: string
  text: string
  source: string
  relevanceScore?: number
  effectiveDate?: string
}

/** 에이전트 응답 */
export interface AgentResponse {
  agentId: AgentType
  content: string
  citations: Citation[]
  confidence: number
  reasoning?: string
  warnings?: string[]
  metadata?: Record<string, any>
}

/** 스트리밍 청크 */
export interface StreamChunk {
  type: 'text' | 'citation' | 'warning' | 'metadata' | 'done'
  agentId?: AgentType
  text?: string
  citation?: Citation
  warning?: string
  metadata?: Record<string, any>
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Orchestrator Types (오케스트레이터 타입)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 실행 계획 */
export interface ExecutionPlan {
  steps: ExecutionStep[]
  estimatedTokens: number
  strategy: 'sequential' | 'parallel' | 'hierarchical'
}

/** 실행 단계 */
export interface ExecutionStep {
  stepId: number
  agentId: AgentType
  input: string
  dependsOn?: number[]  // 이전 단계 의존성
  priority: number
}

/** 실행 결과 */
export interface ExecutionResult {
  success: boolean
  responses: AgentResponse[]
  synthesizedAnswer: string
  citations: Citation[]
  totalTokensUsed: number
  executionTimeMs: number
  routerAnalysis: RouterAnalysis
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Quality Types (품질 타입)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 응답 품질 평가 */
export interface QualityAssessment {
  overall: number          // 전체 품질 (0.0 ~ 1.0)
  relevance: number        // 관련성
  accuracy: number         // 정확성 (법령 인용 기준)
  completeness: number     // 완전성
  format: number           // 형식 준수
  citationQuality: number  // Citation 품질
  issues: string[]         // 발견된 문제점
  suggestions: string[]    // 개선 제안
}

/** 신뢰도 레벨 */
export type ConfidenceLevel = 'high' | 'medium' | 'low'

/** 응답 메타데이터 */
export interface ResponseMetadata {
  routerAnalysis: RouterAnalysis
  executedAgents: AgentType[]
  qualityAssessment: QualityAssessment
  confidenceLevel: ConfidenceLevel
  processingTimeMs: number
  tokensUsed: {
    router: number
    agents: number
    synthesizer: number
    total: number
  }
}
