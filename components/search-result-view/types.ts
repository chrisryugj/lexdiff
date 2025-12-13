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

export type SearchStage = 'searching' | 'parsing' | 'streaming' | 'complete'

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
