/**
 * 법령 관계 그래프 타입 정의
 *
 * 6가지 관계 타입으로 법령 간 방향성 있는 엣지를 모델링한다.
 * OpenCrab 메타엣지 컨셉을 법령 도메인에 맞게 축소 적용.
 */

// ─── 관계 타입 ────────────────────────────────────────

/** 법령 간 관계 타입 (방향: from → to) */
export type RelationType =
  | 'delegates'    // 위임: 법률 → 시행령, 시행령 → 시행규칙
  | 'implements'   // 구체화: 시행령 → 고시/훈령/예규
  | 'cites'        // 인용: 조문 → 조문 ("제38조에 따라")
  | 'interprets'   // 해석: 판례 → 조문
  | 'basis'        // 근거: 법률 → 조례
  | 'amends'       // 개정: 개정법 → 원법

export const RELATION_TYPES: readonly RelationType[] = [
  'delegates', 'implements', 'cites', 'interprets', 'basis', 'amends',
] as const

export const RELATION_LABELS: Record<RelationType, string> = {
  delegates: '위임',
  implements: '구체화',
  cites: '인용',
  interprets: '해석',
  basis: '근거',
  amends: '개정',
}

export function isValidRelationType(value: string): value is RelationType {
  return RELATION_TYPES.includes(value as RelationType)
}

// ─── 노드 타입 ────────────────────────────────────────

/** 법령 노드 종류 */
export type LawNodeType =
  | 'law'          // 법률
  | 'decree'       // 시행령 (대통령령)
  | 'rule'         // 시행규칙 (부령)
  | 'ordinance'    // 조례/규칙 (자치법규)
  | 'admin_rule'   // 행정규칙 (훈령/예규/고시)
  | 'precedent'    // 판례

export const LAW_NODE_TYPES: readonly LawNodeType[] = [
  'law', 'decree', 'rule', 'ordinance', 'admin_rule', 'precedent',
] as const

export const NODE_TYPE_LABELS: Record<LawNodeType, string> = {
  law: '법률',
  decree: '시행령',
  rule: '시행규칙',
  ordinance: '자치법규',
  admin_rule: '행정규칙',
  precedent: '판례',
}

export function isValidNodeType(value: string): value is LawNodeType {
  return LAW_NODE_TYPES.includes(value as LawNodeType)
}

/** 법령 시행 상태 */
export type LawStatus = 'active' | 'repealed' | 'pending'

// ─── DB Row 타입 ──────────────────────────────────────

/** law_node 테이블 row */
export interface LawNode {
  id: string
  title: string
  type: LawNodeType
  status: LawStatus
  effective_date: string | null
  created_at: string
  updated_at: string
}

/** law_node INSERT/UPSERT용 */
export interface LawNodeInsert {
  id: string
  title: string
  type: LawNodeType
  status?: LawStatus
  effective_date?: string | null
}

/** law_edge 테이블 row */
export interface LawEdge {
  id: number
  from_id: string
  to_id: string
  relation: RelationType
  from_article: string | null
  to_article: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

/** law_edge INSERT/UPSERT용 */
export interface LawEdgeInsert {
  from_id: string
  to_id: string
  relation: RelationType
  from_article?: string | null
  to_article?: string | null
  metadata?: Record<string, unknown>
}

// ─── 추출기 공통 인터페이스 ───────────────────────────

/** 관계 추출 결과 (모든 extractor가 반환하는 형태) */
export interface ExtractionResult {
  nodes: LawNodeInsert[]
  edges: LawEdgeInsert[]
}
