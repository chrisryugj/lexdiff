/**
 * Intent Analyzer
 * AI를 활용하여 사용자 질문의 의도를 분석하고 필요한 데이터를 식별
 */

export type IntentType = 'compare_laws' | 'explain_law' | 'find_related' | 'summarize' | 'general_question'

export type DataType = 'law' | 'ordinance' | 'decree' | 'rule'

export type AnalysisType = 'comparative' | 'explanatory' | 'summary' | 'general'

export interface DataTarget {
  type: DataType
  identifier?: string // 법령명 (명확한 경우)
  region?: string // 지역 (조례인 경우)
  keywords?: string[] // 검색 키워드
  confidence: number // 0~1
}

export interface AnalysisIntent {
  intent: IntentType
  targets: DataTarget[]
  analysisType: AnalysisType
  focusAreas?: string[]
  additionalContext?: string
}

/**
 * AI를 사용하여 쿼리의 의도를 분석
 * API 엔드포인트를 호출하여 Gemini의 분석 결과를 받음
 */
export async function analyzeIntent(query: string): Promise<AnalysisIntent> {
  const response = await fetch('/api/analyze-intent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })

  if (!response.ok) {
    throw new Error(`Intent analysis failed: ${response.statusText}`)
  }

  const result = await response.json()
  return result.intent
}

/**
 * 의도 분석 결과를 콘솔에 로깅 (디버깅용)
 */
export function logIntent(query: string, intent: AnalysisIntent) {
  console.log('🧠 [Intent Analysis]', {
    query,
    intent: intent.intent,
    analysisType: intent.analysisType,
    targetsCount: intent.targets.length,
    targets: intent.targets.map((t) => ({
      type: t.type,
      identifier: t.identifier,
      region: t.region,
      keywords: t.keywords,
      confidence: `${(t.confidence * 100).toFixed(0)}%`,
    })),
    focusAreas: intent.focusAreas,
  })
}
