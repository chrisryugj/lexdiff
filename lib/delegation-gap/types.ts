import type { DelegationItem } from "@/lib/law-types"

/** 위임 대상 유형 */
export type DelegationTargetType = '시행령' | '시행규칙' | '고시등'

/** 위임 조항 (법률 조문에서 추출) */
export interface DelegationClause {
  jo: string              // 6자리 JO 코드 ("003800")
  joDisplay: string       // "제38조"
  paragraph?: string      // 항번호 ("②")
  targetType: DelegationTargetType
  rawText: string         // 원문 발췌 (위임 문구 포함 문장)
}

/** 크로스체크 결과 상태 */
export type DelegationGapStatus = 'fulfilled' | 'missing' | 'partial'

/** 크로스체크 결과 (조항 단위) */
export interface DelegationGapResult {
  clause: DelegationClause
  status: DelegationGapStatus
  matchedDelegations: DelegationItem[]
  note?: string           // 부분 미비 사유 등
}

/** 전체 분석 결과 */
export interface DelegationGapAnalysis {
  lawTitle: string
  lawId: string
  mst: string
  totalClauses: number
  missingCount: number
  partialCount: number
  fulfilledCount: number
  results: DelegationGapResult[]
  analyzedAt: string
}

/** 분석 진행 단계 */
export type DelegationGapStep = 'scanning' | 'extracting' | 'crosschecking' | 'done' | 'error'

/** 캐시 키 생성 */
export function getDelegationGapCacheKey(mst: string): string {
  return `delegation-gap:${mst}`
}

/** 캐시 TTL (24시간) */
export const DELEGATION_GAP_CACHE_TTL = 24 * 60 * 60 * 1000
