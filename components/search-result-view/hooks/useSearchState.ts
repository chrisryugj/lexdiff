/**
 * search-result-view/hooks/useSearchState.ts
 *
 * 검색 결과 화면 상태 관리 훅
 */

import { useState, useEffect, useCallback } from "react"
import { favoritesStore } from "@/lib/favorites-store"
import type {
  SearchMode,
  SearchStage,
  LawDataState,
  LawSelectionState,
  OrdinanceSelectionState,
  ArticleNotFoundState,
  SearchResultsState,
  ComparisonModalState,
  SummaryDialogState,
  RelatedSearch,
  SearchQuery,
  AiModeState,
  RagState,
  RagAnswer,
} from "../types"
import type { VerifiedCitation } from "@/lib/citation-verifier"

export interface UseSearchStateProps {
  initialSearchMode?: 'basic' | 'rag'
  onProgressUpdate?: (stage: SearchStage, progress: number) => void
  onModeChange?: (mode: 'basic' | 'rag') => void
}

export interface SearchState {
  // 검색 상태
  isSearching: boolean
  searchMode: SearchMode
  searchStage: SearchStage
  searchProgress: number
  searchQuery: string
  isCacheHit: boolean

  // UI 상태
  isFocusMode: boolean
  showSearchModal: boolean
  mobileView: "list" | "content"
  favoritesDialogOpen: boolean

  // 데이터 상태
  lawData: LawDataState | null
  lawSelectionState: LawSelectionState | null
  ordinanceSelectionState: OrdinanceSelectionState | null
  searchResults: SearchResultsState
  articleNotFound: ArticleNotFoundState | null
  relatedSearches: RelatedSearch[]
  favorites: Set<string>

  // 모달/다이얼로그 상태
  comparisonModal: ComparisonModalState
  summaryDialog: SummaryDialogState
  showChoiceDialog: boolean
  pendingQuery: SearchQuery | null
  showNoResultDialog: boolean
  noResultQuery: SearchQuery | null

  // AI 모드 상태
  isAiMode: boolean
  aiAnswerContent: string
  aiRelatedLaws: any[]
  aiCitations: VerifiedCitation[]
  userQuery: string
  fileSearchFailed: boolean
  aiQueryType: 'definition' | 'requirement' | 'procedure' | 'comparison' | 'application' | 'consequence'

  // RAG 상태
  ragLoading: boolean
  ragError: string | null
  ragProgress: number
  ragAnswer: RagAnswer | null
}

export interface SearchStateActions {
  // 검색 상태 업데이트
  setIsSearching: (value: boolean) => void
  setSearchMode: (mode: SearchMode) => void
  updateProgress: (stage: SearchStage, progress: number) => void
  setSearchQuery: (query: string) => void
  setIsCacheHit: (value: boolean) => void

  // UI 상태 업데이트
  setIsFocusMode: (value: boolean) => void
  setShowSearchModal: (value: boolean) => void
  setMobileView: (view: "list" | "content") => void
  setFavoritesDialogOpen: (value: boolean) => void

  // 데이터 상태 업데이트
  setLawData: React.Dispatch<React.SetStateAction<LawDataState | null>>
  setLawSelectionState: (state: LawSelectionState | null) => void
  setOrdinanceSelectionState: (state: OrdinanceSelectionState | null) => void
  setSearchResults: (results: SearchResultsState) => void
  setArticleNotFound: (state: ArticleNotFoundState | null) => void
  setRelatedSearches: (searches: RelatedSearch[]) => void

  // 모달/다이얼로그 상태 업데이트
  setComparisonModal: (state: ComparisonModalState) => void
  setSummaryDialog: (state: SummaryDialogState) => void
  setShowChoiceDialog: (value: boolean) => void
  setPendingQuery: (query: SearchQuery | null) => void
  setShowNoResultDialog: (value: boolean) => void
  setNoResultQuery: (query: SearchQuery | null) => void

  // AI 모드 상태 업데이트
  setIsAiMode: (value: boolean) => void
  setAiAnswerContent: (content: string) => void
  setAiRelatedLaws: (laws: any[]) => void
  setAiCitations: (citations: VerifiedCitation[]) => void
  setUserQuery: (query: string) => void
  setFileSearchFailed: (value: boolean) => void
  setAiQueryType: (type: 'definition' | 'requirement' | 'procedure' | 'comparison' | 'application' | 'consequence') => void

  // RAG 상태 업데이트
  setRagLoading: (value: boolean) => void
  setRagError: (error: string | null) => void
  setRagProgress: (progress: number) => void
  setRagAnswer: (answer: RagAnswer | null) => void

  // 복합 액션
  resetSearchState: () => void
  resetToHome: () => void
}

export function useSearchState({
  initialSearchMode,
  onProgressUpdate,
  onModeChange,
}: UseSearchStateProps): [SearchState, SearchStateActions] {
  // ============================================================
  // 검색 상태
  // ============================================================
  const [isSearching, setIsSearching] = useState(false)
  const [searchMode, setSearchModeInternal] = useState<SearchMode>(initialSearchMode || 'basic')
  const [searchStage, setSearchStage] = useState<SearchStage>('searching')
  const [searchProgress, setSearchProgress] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [isCacheHit, setIsCacheHit] = useState(false)

  // ============================================================
  // UI 상태
  // ============================================================
  const [isFocusMode, setIsFocusMode] = useState(false)
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [mobileView, setMobileView] = useState<"list" | "content">("content")
  const [favoritesDialogOpen, setFavoritesDialogOpen] = useState(false)

  // ============================================================
  // 데이터 상태
  // ============================================================
  const [lawData, setLawData] = useState<LawDataState | null>(null)
  const [lawSelectionState, setLawSelectionState] = useState<LawSelectionState | null>(null)
  const [ordinanceSelectionState, setOrdinanceSelectionState] = useState<OrdinanceSelectionState | null>(null)
  const [searchResults, setSearchResults] = useState<SearchResultsState>({ laws: [], ordinances: [] })
  const [articleNotFound, setArticleNotFound] = useState<ArticleNotFoundState | null>(null)
  const [relatedSearches, setRelatedSearches] = useState<RelatedSearch[]>([])
  const [favorites, setFavorites] = useState<Set<string>>(new Set())

  // ============================================================
  // 모달/다이얼로그 상태
  // ============================================================
  const [comparisonModal, setComparisonModal] = useState<ComparisonModalState>({ isOpen: false })
  const [summaryDialog, setSummaryDialog] = useState<SummaryDialogState>({ isOpen: false })
  const [showChoiceDialog, setShowChoiceDialog] = useState(false)
  const [pendingQuery, setPendingQuery] = useState<SearchQuery | null>(null)
  const [showNoResultDialog, setShowNoResultDialog] = useState(false)
  const [noResultQuery, setNoResultQuery] = useState<SearchQuery | null>(null)

  // ============================================================
  // AI 모드 상태
  // ============================================================
  const [isAiMode, setIsAiMode] = useState(false)
  const [aiAnswerContent, setAiAnswerContent] = useState<string>('')
  const [aiRelatedLaws, setAiRelatedLaws] = useState<any[]>([])
  const [aiCitations, setAiCitations] = useState<VerifiedCitation[]>([])
  const [userQuery, setUserQuery] = useState<string>('')
  const [fileSearchFailed, setFileSearchFailed] = useState(false)
  const [aiQueryType, setAiQueryType] = useState<'definition' | 'requirement' | 'procedure' | 'comparison' | 'application' | 'consequence'>('application')

  // ============================================================
  // RAG 상태
  // ============================================================
  const [ragLoading, setRagLoading] = useState(false)
  const [ragError, setRagError] = useState<string | null>(null)
  const [ragProgress, setRagProgress] = useState(0)
  const [ragAnswer, setRagAnswer] = useState<RagAnswer | null>(null)

  // ============================================================
  // 즐겨찾기 구독
  // ============================================================
  useEffect(() => {
    const unsubscribe = favoritesStore.subscribe((favs) => {
      const joSet = new Set(favs.map((f) => `${f.lawTitle}-${f.jo}`))
      setFavorites(joSet)
    })

    const initialFavs = favoritesStore.getFavorites()
    const joSet = new Set(initialFavs.map((f) => `${f.lawTitle}-${f.jo}`))
    setFavorites(joSet)

    return () => {
      unsubscribe()
    }
  }, [])

  // ============================================================
  // 단축키 등록
  // ============================================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K: 검색 모달
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowSearchModal(true)
      }
      // F11: 포커스 모드
      if (e.key === 'F11') {
        e.preventDefault()
        setIsFocusMode(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // ============================================================
  // 액션 함수
  // ============================================================

  const updateProgress = useCallback((stage: SearchStage, progress: number) => {
    setSearchStage(stage)
    setSearchProgress(progress)
    onProgressUpdate?.(stage, progress)
  }, [onProgressUpdate])

  const setSearchMode = useCallback((mode: SearchMode) => {
    setSearchModeInternal(mode)
    onModeChange?.(mode)
  }, [onModeChange])

  const resetSearchState = useCallback(() => {
    setLawData(null)
    setLawSelectionState(null)
    setOrdinanceSelectionState(null)
    setSearchResults({ laws: [], ordinances: [] })
    setArticleNotFound(null)
    setAiAnswerContent('')
    setAiRelatedLaws([])
    setIsAiMode(false)
    setFileSearchFailed(false)
  }, [])

  const resetToHome = useCallback(() => {
    resetSearchState()
    setMobileView("content")
    setSearchModeInternal('basic')
    setRagAnswer(null)
    setRagError(null)
  }, [resetSearchState])

  // ============================================================
  // 상태 객체 생성
  // ============================================================
  const state: SearchState = {
    isSearching,
    searchMode,
    searchStage,
    searchProgress,
    searchQuery,
    isCacheHit,
    isFocusMode,
    showSearchModal,
    mobileView,
    favoritesDialogOpen,
    lawData,
    lawSelectionState,
    ordinanceSelectionState,
    searchResults,
    articleNotFound,
    relatedSearches,
    favorites,
    comparisonModal,
    summaryDialog,
    showChoiceDialog,
    pendingQuery,
    showNoResultDialog,
    noResultQuery,
    isAiMode,
    aiAnswerContent,
    aiRelatedLaws,
    aiCitations,
    userQuery,
    fileSearchFailed,
    aiQueryType,
    ragLoading,
    ragError,
    ragProgress,
    ragAnswer,
  }

  const actions: SearchStateActions = {
    setIsSearching,
    setSearchMode,
    updateProgress,
    setSearchQuery,
    setIsCacheHit,
    setIsFocusMode,
    setShowSearchModal,
    setMobileView,
    setFavoritesDialogOpen,
    setLawData,
    setLawSelectionState,
    setOrdinanceSelectionState,
    setSearchResults,
    setArticleNotFound,
    setRelatedSearches,
    setComparisonModal,
    setSummaryDialog,
    setShowChoiceDialog,
    setPendingQuery,
    setShowNoResultDialog,
    setNoResultQuery,
    setIsAiMode,
    setAiAnswerContent,
    setAiRelatedLaws,
    setAiCitations,
    setUserQuery,
    setFileSearchFailed,
    setAiQueryType,
    setRagLoading,
    setRagError,
    setRagProgress,
    setRagAnswer,
    resetSearchState,
    resetToHome,
  }

  return [state, actions]
}
