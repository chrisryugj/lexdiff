/**
 * 법령 영향 추적기 타입 정의
 */

// ── 입력 ──

export interface ImpactTrackerRequest {
  lawNames: string[]       // ["국토계획법", "건축법"]
  dateFrom: string         // "2025-01-01"
  dateTo: string           // "2026-03-14"
  region?: string          // "광진구" — A방향 조례 탐색 시 지역 필터
  mode?: 'impact' | 'ordinance-sync'  // 'ordinance-sync' = B방향 특화 미반영 탐지
}

// ── 영향도 등급 ──

export type ImpactSeverity = 'critical' | 'review' | 'info'

export const SEVERITY_CONFIG: Record<ImpactSeverity, {
  label: string; color: string; bgClass: string
}> = {
  critical: { label: '긴급', color: 'text-red-600', bgClass: 'bg-red-50 border-red-200' },
  review:   { label: '검토', color: 'text-yellow-600', bgClass: 'bg-yellow-50 border-yellow-200' },
  info:     { label: '참고', color: 'text-green-600', bgClass: 'bg-green-50 border-green-200' },
}

// ── 조문별 변경 기록 ──

export interface ArticleChange {
  lawId: string
  lawName: string
  mst: string
  jo: string               // 6자리 JO 코드 ("003800")
  joDisplay: string         // "제38조"
  articleTitle?: string
  revisionType: string      // "개정", "전부개정", "삭제", "신설"
  revisionDate: string      // "2025-06-15"
  effectiveDate?: string
}

// ── 하위법령 영향 ──

export interface DownstreamImpact {
  type: '시행령' | '시행규칙' | '행정규칙' | '자치법규'
  lawName: string
  lawId?: string
  jo?: string
  joDisplay?: string
  content?: string
}

// ── 영향 카드 단위 ──

export interface ImpactItem {
  id: string
  change: ArticleChange
  downstreamImpacts: DownstreamImpact[]
  severity: ImpactSeverity
  severityReason: string
  oldText?: string
  newText?: string
}

// ── 종합 요약 ──

export interface ImpactSummary {
  totalChanges: number
  bySeverity: Record<ImpactSeverity, number>
  byLaw: Record<string, number>
  aiSummary: string
  dateRange: { from: string; to: string }
}

// ── 최종 결과 ──

export interface ImpactTrackerResult {
  items: ImpactItem[]
  summary: ImpactSummary
  analyzedAt: string
}

// ── SSE 이벤트 ──

export type ImpactSSEEvent =
  | { type: 'status'; message: string; progress: number; step: ImpactStep }
  | { type: 'law_resolved'; lawName: string; lawId: string; mst: string }
  | { type: 'changes_found'; lawName: string; changes: ArticleChange[] }
  | { type: 'impact_item'; item: ImpactItem }
  | { type: 'summary'; summary: ImpactSummary }
  | { type: 'ai_source'; source: 'openclaw' | 'gemini' }
  | { type: 'complete'; result: ImpactTrackerResult }
  | { type: 'error'; message: string; recoverable: boolean }
  // B방향: 조례→상위법령 이벤트
  | { type: 'ordinance_refs'; ordinanceName: string; refs: Array<{ lawName: string; refCount: number; articles: string[] }> }
  | { type: 'parent_law_change'; parentLaw: string; changedArticles: string[]; affectedOrdinanceArticles: string[] }

export type ImpactStep =
  | 'resolving'
  | 'extracting'    // B방향: 상위법령 참조 추출
  | 'comparing'
  | 'tracing'
  | 'classifying'
  | 'summarizing'
  | 'complete'

// ── AI 분류기 입출력 ──

export interface ClassificationInput {
  lawName: string
  jo: string
  joDisplay: string
  revisionType: string
  oldText?: string
  newText?: string
  downstreamCount: number
  // B방향: 이 상위법령 조문을 참조하는 조례 조문 정보
  referencingOrdinance?: {
    ordinanceName: string
    ordinanceArticles: string[]  // ["제1조", "제9조"]
  }
}

export interface ClassificationResult {
  jo: string
  severity: ImpactSeverity
  reason: string
}
