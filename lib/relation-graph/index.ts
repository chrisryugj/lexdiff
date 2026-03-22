// 법령 관계 그래프 모듈 public API

// Types
export type {
  RelationType, LawNodeType, LawStatus,
  LawNode, LawNodeInsert,
  LawEdge, LawEdgeInsert,
  ExtractionResult,
} from './relation-types'

// Constants & validators
export {
  RELATION_TYPES, RELATION_LABELS,
  LAW_NODE_TYPES, NODE_TYPE_LABELS,
  isValidRelationType, isValidNodeType,
} from './relation-types'

// CRUD
export {
  upsertNode, bulkUpsertNodes, getNodeById, deleteNode,
  upsertEdge, bulkUpsertEdges, getEdgesFrom, getEdgesTo, deleteEdge,
  storeExtractionResult, storeRelationsAsync,
} from './relation-db'

// Impact analysis
export { analyzeImpact } from './impact-analysis'
export type { ImpactResult, ImpactItem } from './impact-analysis'

// Extractors
export { extractRelationsFromThreeTier } from './extractors/three-tier-extractor'
export { extractRelationsFromPrecedents } from './extractors/precedent-extractor'
export { extractCitationsFromText } from './extractors/citation-extractor'
