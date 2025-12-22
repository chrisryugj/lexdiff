/**
 * search-result-view/types.ts
 *
 * 검색 결과 화면 관련 타입 정의
 */

import type { LawMeta, LawArticle, Favorite } from "@/lib/law-types"
import type { VerifiedCitation } from "@/lib/citation-verifier"

// ============================================================
// API 응답 타입
// ============================================================

export interface LawSearchResult {
  lawId?: string
  mst?: string
  lawName: string
  lawType: string
  promulgationDate?: string
  effectiveDate?: string
}

export interface OrdinanceSearchResult {
  ordinSeq: string
  ordinName: string
  ordinId: string
  promulgationDate?: string
  effectiveDate?: string
  orgName?: string
  ordinKind?: string
}

// ============================================================
// 검색 모드 타입
// ============================================================

export type SearchMode = 'basic' | 'rag'

/** 법령 검색 단계 */
export type LawSearchStage = 'searching' | 'parsing' | 'complete'

/** AI 검색 단계 (6단계) */
export type AISearchStage =
  | 'analyzing'    // AI Router: 질문 분석 (0-15%)
  | 'optimizing'   // AI Router: 검색 최적화 (15-25%)
  | 'searching'    // RAG: File Search (25-40%)
  | 'streaming'    // RAG: 답변 생성 (40-95%)
  | 'extracting'   // RAG: Citation 추출 (95-99%)
  | 'complete'     // 완료 (100%)

/** 통합 검색 단계 (법령 + AI) */
export type SearchStage = LawSearchStage | AISearchStage

/** AI 검색 단계 메타정보 */
export interface AIStageInfo {
  key: AISearchStage
  label: string
  icon: string
  range: [number, number]
}

/** AI 검색 단계 정의 */
export const AI_STAGES: AIStageInfo[] = [
  { key: 'analyzing', label: '분석 중', icon: 'brain', range: [0, 15] },
  { key: 'optimizing', label: '최적화', icon: 'settings-02', range: [15, 25] },
  { key: 'searching', label: '검색 중', icon: 'search-01', range: [25, 40] },
  { key: 'streaming', label: '생성 중', icon: 'ai-brain-04', range: [40, 95] },
  { key: 'extracting', label: '인용 추출', icon: 'file-01', range: [95, 99] },
  { key: 'complete', label: '완료', icon: 'checkmark-circle-02', range: [100, 100] },
]

/** AI 검색 메타정보 */
export interface AISearchMeta {
  queryType?: string
  domain?: string
  keywords?: string[]
  routingTimeMs?: number
}

// ============================================================
// 컴포넌트 Props 타입
// ============================================================

export interface SearchResultViewProps {
  searchId: string
  onBack: () => void
  onProgressUpdate?: (stage: SearchStage, progress: number) => void
  onModeChange?: (mode: 'basic' | 'rag') => void
  initialSearchMode?: 'basic' | 'rag'
}

export interface SearchQuery {
  lawName: string
  article?: string
  jo?: string
}

// ============================================================
// 상태 타입
// ============================================================

export interface LawDataState {
  meta: LawMeta
  articles: LawArticle[]
  selectedJo?: string
  isOrdinance?: boolean
  viewMode?: "single" | "full"
  searchQueryId?: number
  searchResultId?: number
  isPrecedent?: boolean  // 판례 모드
}

export interface LawSelectionState {
  results: LawSearchResult[]
  query: SearchQuery
}

export interface OrdinanceSelectionState {
  results: OrdinanceSearchResult[]
  query: { lawName: string }
}

export interface ArticleNotFoundState {
  requestedJo: string
  lawTitle: string
  nearestArticles: LawArticle[]
  crossLawSuggestions: Array<{
    lawTitle: string
    lawId: string | null
    articleJo: string
  }>
}

export interface SearchResultsState {
  laws: LawSearchResult[]
  ordinances: OrdinanceSearchResult[]
  jo?: string
}

export interface ComparisonModalState {
  isOpen: boolean
  jo?: string
}

export interface SummaryDialogState {
  isOpen: boolean
  jo?: string
  oldContent?: string
  newContent?: string
  effectiveDate?: string
}

export interface RelatedSearch {
  keyword: string
  results: LawSearchResult[]
}

// ============================================================
// 핸들러 타입
// ============================================================

export type SearchHandler = (query: SearchQuery) => void

export type LawSelectHandler = (law: LawSearchResult) => Promise<void>

export type OrdinanceSelectHandler = (ordinance: OrdinanceSearchResult) => Promise<void>

export type FavoriteSelectHandler = (favorite: Favorite) => void

export type CompareHandler = (jo: string) => void

export type SummarizeHandler = (jo: string) => Promise<void>

export type ToggleFavoriteHandler = (jo: string) => void

export type CitationClickHandler = (lawName: string, jo: string, article: string) => void

// ============================================================
// AI 모드 관련 타입
// ============================================================

export interface AiModeState {
  isAiMode: boolean
  aiAnswerContent: string
  aiRelatedLaws: any[]
  aiCitations: VerifiedCitation[]
  userQuery: string
  fileSearchFailed: boolean
}

// ============================================================
// RAG 관련 타입
// ============================================================

export interface RagState {
  ragLoading: boolean
  ragError: string | null
  ragProgress: number
  ragAnswer: RagAnswer | null
}

export interface RagAnswer {
  content: string
  citations: Array<{
    lawName: string
    articleDisplay: string
    relevance: 'high' | 'medium' | 'low'
  }>
  confidence: 'high' | 'medium' | 'low'
}
