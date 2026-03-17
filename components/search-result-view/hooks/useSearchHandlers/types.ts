/**
 * useSearchHandlers/types.ts
 *
 * 검색 핸들러 공유 타입 정의
 */

import type { SearchState, SearchStateActions } from "../useSearchState"
import type {
  SearchQuery,
  LawSearchResult,
  OrdinanceSearchResult,
  LawDataState,
} from "../../types"
import type { Favorite } from "@/lib/law-types"

// ============================================================
// Props & Return Types
// ============================================================

export interface UseSearchHandlersProps {
  state: SearchState
  actions: SearchStateActions
  onBack: () => void
  searchId?: string  // 현재 검색 ID (판례 상세 히스토리용)
  onPrecedentSelect?: (precedentId: string | null) => void  // 판례 선택/해제 시 부모에 알림
}

export interface SearchHandlers {
  handleSearch: (query: SearchQuery) => void
  handleSearchInternal: (query: SearchQuery, signal?: AbortSignal, forcedMode?: 'law' | 'ai', skipCache?: boolean) => Promise<void>
  handleSearchChoice: (mode: 'law' | 'ai') => void
  handleNoResultChoice: (choice: 'ai' | 'cancel') => void
  handleLawSelect: (law: LawSearchResult) => Promise<void>
  handleOrdinanceSelect: (ordinance: OrdinanceSearchResult) => Promise<void>
  handleRecentSelect: (search: any) => void
  handleFavoriteSelect: (favorite: Favorite) => void
  handleCompare: (jo: string) => void
  handleSummarize: (jo: string) => Promise<void>
  handleToggleFavorite: (jo: string) => void
  handleCitationClick: (lawName: string, jo: string, article: string) => void
  handleReset: () => void
  handleFavoritesClick: () => void
  handleSettingsClick: () => void
  handleAiRefresh: () => void  // AI 답변 강제 새로고침 (캐시 무시)
  handleAiFollowUp: (followUpQuery: string) => void  // 연속 대화 추가 질문
  handleNewConversation: () => void  // 새 대화 시작
  handleRefresh: () => void  // 법령/판례 강제 새로고침 (캐시 무시)
  fetchLawContent: (selectedLaw: LawSearchResult, query: SearchQuery, skipCache?: boolean) => Promise<void>
  fetchRelatedSearches: (lawName: string, currentResults: LawSearchResult[]) => Promise<void>
  // 통합검색 핸들러
  handlePrecedentSearch: (query: SearchQuery) => Promise<boolean>
  handlePrecedentSelect: (precedentId: string) => Promise<void>
  handlePrecedentPageChange: (page: number) => Promise<void>
  handlePrecedentPageSizeChange: (size: number) => Promise<void>
  handleInterpretationSearch: (query: SearchQuery) => Promise<boolean>
  handleRulingSearch: (query: SearchQuery) => Promise<boolean>
  handleMultiSearch: (query: SearchQuery) => Promise<void>
  // 조례 페이지네이션
  handleOrdinancePageChange: (page: number) => Promise<void>
  handleOrdinancePageSizeChange: (size: number) => Promise<void>
}

// ============================================================
// Internal Dependencies
// ============================================================

export interface HandlerDeps {
  state: SearchState
  actions: SearchStateActions
  toast: (options: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void
  reportError: (
    operation: string,
    error: Error,
    context?: Record<string, any>,
    apiLogs?: Array<{ url: string; method: string; status?: number; response?: string }>
  ) => void
  searchId?: string
  onBack: () => void
  onPrecedentSelect?: (precedentId: string | null) => void
}

// ============================================================
// Re-exports for convenience
// ============================================================

export type { SearchQuery, LawSearchResult, OrdinanceSearchResult, LawDataState }
export type { Favorite }
