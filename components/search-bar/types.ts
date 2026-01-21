import type { UnifiedQueryClassification, SearchType } from "@/lib/unified-query-classifier"

export interface SearchQuery {
  lawName: string
  article?: string
  jo?: string
  searchType?: SearchType
  caseNumber?: string
  classification?: UnifiedQueryClassification
  forcedMode?: 'law' | 'ai'
}

export interface SearchBarProps {
  onSearch: (query: SearchQuery) => void
  isLoading?: boolean
  searchMode?: 'basic' | 'rag'
}

export interface Suggestion {
  text: string
  type: 'law' | 'ai' | 'recent' | 'precedent' | 'interpretation' | 'ruling'
  category: string
}

export interface SearchBarState {
  query: string
  showDropdown: boolean
  recentSearches: string[]
  suggestions: Suggestion[]
  isLoadingSuggestions: boolean
  selectedIndex: number
  searchType: "law" | "ordinance" | "ai" | null
  isNaturalQuery: boolean
  forceAiMode: boolean
  showChoiceDialog: boolean
  pendingQuery: string
}

export interface SearchBarActions {
  setQuery: (query: string) => void
  setShowDropdown: (show: boolean) => void
  setRecentSearches: (searches: string[]) => void
  setSuggestions: (suggestions: Suggestion[]) => void
  setIsLoadingSuggestions: (loading: boolean) => void
  setSelectedIndex: (index: number) => void
  setSearchType: (type: "law" | "ordinance" | "ai" | null) => void
  setIsNaturalQuery: (natural: boolean) => void
  setForceAiMode: (force: boolean) => void
  setShowChoiceDialog: (show: boolean) => void
  setPendingQuery: (query: string) => void
}

export const MAX_RECENT = 10
