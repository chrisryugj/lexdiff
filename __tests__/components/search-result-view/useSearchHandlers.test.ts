/**
 * useSearchHandlers 훅 통합 테스트
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSearchHandlers } from '@/components/search-result-view/hooks/useSearchHandlers'
import type { SearchState, SearchStateActions } from '@/components/search-result-view/hooks/useSearchState'

// Mock 모듈들
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}))

vi.mock('@/lib/error-report-store', () => ({
  useErrorReportStore: () => ({
    reportError: vi.fn()
  })
}))

vi.mock('@/lib/debug-logger', () => ({
  debugLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  }
}))

vi.mock('@/lib/favorites-store', () => ({
  favoritesStore: {
    isFavorite: vi.fn(() => false),
    getFavorites: vi.fn(() => []),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
  }
}))

vi.mock('@/lib/query-detector', () => ({
  detectQueryType: vi.fn(() => ({
    type: 'structured',
    confidence: 1.0,
    reason: 'test'
  }))
}))

vi.mock('@/lib/search-normalizer', () => ({
  normalizeLawSearchText: vi.fn((text) => text),
  normalizeSearchQuery: vi.fn((text) => text),
  resolveLawAlias: vi.fn((name) => ({ canonical: name, matchedAlias: null })),
  expandSearchSynonyms: vi.fn(() => ({ expanded: [] }))
}))

vi.mock('@/lib/law-search-parser', () => ({
  parseLawSearchXML: vi.fn(() => [
    { lawId: '001706', lawName: '민법', lawType: '법률' }
  ])
}))

vi.mock('@/lib/rag-response-cache', () => ({
  getCachedResponse: vi.fn(() => null),
  cacheResponse: vi.fn()
}))

// VH-2 직접 재오픈 테스트: 조례 본문 파싱을 결정론적으로 (DOMParser XML 브리틀니스 회피)
vi.mock('@/lib/ordin-parser', () => ({
  parseOrdinanceXML: vi.fn(() => ({
    meta: { lawTitle: '서울특별시 주차장 설치 조례', fetchedAt: '2026-06-27T00:00:00.000Z', isOrdinance: true },
    articles: [{ jo: '000100', joNum: '제1조', title: '목적', content: '내용', isPreamble: false }],
  })),
}))

// fetch mock
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('useSearchHandlers', () => {
  let mockState: SearchState
  let mockActions: SearchStateActions
  let mockOnBack: () => void

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()

    mockOnBack = vi.fn() as () => void

    // 기본 상태 mock
    mockState = {
      isSearching: false,
      searchMode: 'basic',
      searchStage: 'searching',
      searchProgress: 0,
      searchQuery: '',
      isCacheHit: false,
      isFocusMode: false,
      showSearchModal: false,
      mobileView: 'content',
      favoritesDialogOpen: false,
      lawData: null,
      lawSelectionState: null,
      ordinanceSelectionState: null,
      searchResults: { laws: [], ordinances: [] },
      articleNotFound: null,
      relatedSearches: [],
      favorites: new Set(),
      comparisonModal: { isOpen: false },
      summaryDialog: { isOpen: false },
      showChoiceDialog: false,
      pendingQuery: null,
      showNoResultDialog: false,
      noResultQuery: null,
      isAiMode: false,
      aiAnswerContent: '',
      aiRelatedLaws: [],
      aiCitations: [],
      userQuery: '',
      fileSearchFailed: false,
      ragLoading: false,
      ragError: null,
      ragProgress: 0,
      ragAnswer: null,
      aiQueryType: 'application',
      aiConfidenceLevel: 'high',
      aiIsTruncated: false,
      aiAuthRequired: false,
      toolCallLogs: [],
      aiSearchMeta: null,
      precedentResults: null,
      precedentTotalCount: 0,
      precedentPage: 1,
      precedentPageSize: 10,
      precedentYearFilter: undefined,
      precedentCourtFilter: undefined,
      interpretationResults: null,
      interpretationTotalCount: 0,
      rulingResults: null,
      rulingTotalCount: 0,
      ordinancePage: 1,
      ordinancePageSize: 10,
      ordinanceTotalCount: 0,
      conversationId: null,
      conversationHistory: [],
    }

    // 액션 mock
    mockActions = {
      setIsSearching: vi.fn(),
      setSearchMode: vi.fn(),
      updateProgress: vi.fn(),
      setSearchQuery: vi.fn(),
      setIsCacheHit: vi.fn(),
      setIsFocusMode: vi.fn(),
      setShowSearchModal: vi.fn(),
      setMobileView: vi.fn(),
      setFavoritesDialogOpen: vi.fn(),
      setLawData: vi.fn(),
      setLawSelectionState: vi.fn(),
      setOrdinanceSelectionState: vi.fn(),
      setSearchResults: vi.fn(),
      setArticleNotFound: vi.fn(),
      setRelatedSearches: vi.fn(),
      setComparisonModal: vi.fn(),
      setSummaryDialog: vi.fn(),
      setShowChoiceDialog: vi.fn(),
      setPendingQuery: vi.fn(),
      setShowNoResultDialog: vi.fn(),
      setNoResultQuery: vi.fn(),
      setIsAiMode: vi.fn(),
      setAiAnswerContent: vi.fn(),
      setAiRelatedLaws: vi.fn(),
      setAiCitations: vi.fn(),
      setUserQuery: vi.fn(),
      setFileSearchFailed: vi.fn(),
      setRagLoading: vi.fn(),
      setRagError: vi.fn(),
      setRagProgress: vi.fn(),
      setRagAnswer: vi.fn(),
      setAiQueryType: vi.fn(),
      setAiConfidenceLevel: vi.fn(),
      setAiIsTruncated: vi.fn(),
      setAiSearchMeta: vi.fn(),
      setAiAuthRequired: vi.fn(),
      addToolCallLog: vi.fn(),
      clearToolCallLogs: vi.fn(),
      setPrecedentResults: vi.fn(),
      setPrecedentTotalCount: vi.fn(),
      setPrecedentPage: vi.fn(),
      setPrecedentPageSize: vi.fn(),
      setPrecedentYearFilter: vi.fn(),
      setPrecedentCourtFilter: vi.fn(),
      setInterpretationResults: vi.fn(),
      setInterpretationTotalCount: vi.fn(),
      setRulingResults: vi.fn(),
      setRulingTotalCount: vi.fn(),
      setOrdinancePage: vi.fn(),
      setOrdinancePageSize: vi.fn(),
      setOrdinanceTotalCount: vi.fn(),
      resetSearchState: vi.fn(),
      resetToHome: vi.fn(),
      setConversationId: vi.fn(),
      addConversationEntry: vi.fn(),
      clearConversation: vi.fn(),
    }
  })

  describe('handleSearch', () => {
    it('검색 쿼리로 handleSearchInternal 호출', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('<법령검색결과><법령><법령ID>001706</법령ID><법령명>민법</법령명><법령종류>법률</법령종류></법령></법령검색결과>')
      })

      const { result } = renderHook(() => useSearchHandlers({
        state: mockState,
        actions: mockActions,
        onBack: mockOnBack
      }))

      await act(async () => {
        result.current.handleSearch({ lawName: '민법' })
      })

      expect(mockActions.setSearchQuery).toHaveBeenCalledWith('민법')
      expect(mockActions.setUserQuery).toHaveBeenCalledWith('민법')
    })
  })

  describe('handleSearchChoice', () => {
    it('law 모드 선택 시 법령 검색 실행', async () => {
      const stateWithPendingQuery = {
        ...mockState,
        pendingQuery: { lawName: '민법' }
      }

      const { result } = renderHook(() => useSearchHandlers({
        state: stateWithPendingQuery,
        actions: mockActions,
        onBack: mockOnBack
      }))

      await act(async () => {
        result.current.handleSearchChoice('law')
      })

      expect(mockActions.setShowChoiceDialog).toHaveBeenCalledWith(false)
      expect(mockActions.setPendingQuery).toHaveBeenCalledWith(null)
    })

    it('ai 모드 선택 시 AI 검색 실행', async () => {
      const stateWithPendingQuery = {
        ...mockState,
        pendingQuery: { lawName: '임대차 보증금 반환' }
      }

      const { result } = renderHook(() => useSearchHandlers({
        state: stateWithPendingQuery,
        actions: mockActions,
        onBack: mockOnBack
      }))

      await act(async () => {
        result.current.handleSearchChoice('ai')
      })

      expect(mockActions.setShowChoiceDialog).toHaveBeenCalledWith(false)
    })
  })

  describe('handleNoResultChoice', () => {
    it('cancel 선택 시 검색 중단', () => {
      const stateWithNoResult = {
        ...mockState,
        noResultQuery: { lawName: '존재하지않는법' }
      }

      const { result } = renderHook(() => useSearchHandlers({
        state: stateWithNoResult,
        actions: mockActions,
        onBack: mockOnBack
      }))

      act(() => {
        result.current.handleNoResultChoice('cancel')
      })

      expect(mockActions.setShowNoResultDialog).toHaveBeenCalledWith(false)
      expect(mockActions.setNoResultQuery).toHaveBeenCalledWith(null)
      expect(mockActions.setIsSearching).toHaveBeenCalledWith(false)
    })

    it('ai 선택 시 AI 검색으로 전환', async () => {
      const stateWithNoResult = {
        ...mockState,
        noResultQuery: { lawName: '존재하지않는법' }
      }

      const { result } = renderHook(() => useSearchHandlers({
        state: stateWithNoResult,
        actions: mockActions,
        onBack: mockOnBack
      }))

      await act(async () => {
        result.current.handleNoResultChoice('ai')
      })

      expect(mockActions.setShowNoResultDialog).toHaveBeenCalledWith(false)
      expect(mockActions.setNoResultQuery).toHaveBeenCalledWith(null)
    })
  })

  describe('handleCompare', () => {
    it('비교 모달 열기', () => {
      const { result } = renderHook(() => useSearchHandlers({
        state: mockState,
        actions: mockActions,
        onBack: mockOnBack
      }))

      act(() => {
        result.current.handleCompare('000100')
      })

      expect(mockActions.setComparisonModal).toHaveBeenCalledWith({
        isOpen: true,
        jo: '000100'
      })
    })
  })

  describe('handleToggleFavorite', () => {
    it('lawData 없으면 아무 동작 안함', () => {
      const { result } = renderHook(() => useSearchHandlers({
        state: mockState,
        actions: mockActions,
        onBack: mockOnBack
      }))

      act(() => {
        result.current.handleToggleFavorite('000100')
      })

      // favoritesStore 함수가 호출되지 않아야 함
    })

    it('lawData 있으면 즐겨찾기 토글', () => {
      const stateWithLawData = {
        ...mockState,
        lawData: {
          meta: {
            lawId: '001706',
            lawTitle: '민법',
            fetchedAt: new Date().toISOString(),
          },
          articles: [
            { jo: '000100', joNum: '제1조', title: '', content: '테스트', isPreamble: false }
          ],
        }
      }

      const { result } = renderHook(() => useSearchHandlers({
        state: stateWithLawData,
        actions: mockActions,
        onBack: mockOnBack
      }))

      act(() => {
        result.current.handleToggleFavorite('000100')
      })

      // favoritesStore.addFavorite가 호출되어야 함
    })
  })

  describe('handleReset', () => {
    it('resetToHome 호출 및 onBack 콜백 실행', () => {
      const { result } = renderHook(() => useSearchHandlers({
        state: mockState,
        actions: mockActions,
        onBack: mockOnBack
      }))

      act(() => {
        result.current.handleReset()
      })

      expect(mockActions.resetToHome).toHaveBeenCalled()
      expect(mockOnBack).toHaveBeenCalled()
    })
  })

  describe('handleFavoritesClick', () => {
    it('즐겨찾기 다이얼로그 열기', () => {
      const { result } = renderHook(() => useSearchHandlers({
        state: mockState,
        actions: mockActions,
        onBack: mockOnBack
      }))

      act(() => {
        result.current.handleFavoritesClick()
      })

      expect(mockActions.setFavoritesDialogOpen).toHaveBeenCalledWith(true)
    })
  })

  describe('handleCitationClick', () => {
    it('인용된 조문 클릭 처리', async () => {
      const { result } = renderHook(() => useSearchHandlers({
        state: mockState,
        actions: mockActions,
        onBack: mockOnBack
      }))

      await act(async () => {
        await result.current.handleCitationClick('민법', '000100', '제1조')
      })

      // 현재는 로깅만 수행
    })
  })

  describe('handleRecentSelect', () => {
    it('최근 검색 선택 시 검색 실행', async () => {
      const { result } = renderHook(() => useSearchHandlers({
        state: mockState,
        actions: mockActions,
        onBack: mockOnBack
      }))

      await act(async () => {
        result.current.handleRecentSelect({ lawName: '민법', article: '1조' })
      })

      expect(mockActions.setSearchQuery).toHaveBeenCalled()
    })
  })

  describe('handleFavoriteSelect', () => {
    it('즐겨찾기 선택 시 검색 실행', async () => {
      const { result } = renderHook(() => useSearchHandlers({
        state: mockState,
        actions: mockActions,
        onBack: mockOnBack
      }))

      await act(async () => {
        result.current.handleFavoriteSelect({
          id: '1',
          lawId: '001706',
          lawTitle: '민법',
          jo: '000100',
          lastSeenSignature: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      })

      expect(mockActions.setSearchQuery).toHaveBeenCalled()
    })
  })

  // PREC-3: 캐시 복원(뒤로가기) 후 판례 페이지네이션이 court/caseNumber/정제쿼리를 유지하는지
  describe('PREC-3: 판례 페이지네이션 파라미터 시드', () => {
    it('seedPrecedentSearchParams 후 페이지 변경 시 court/caseNumber 유지', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ precedents: [], totalCount: 0 }),
      })

      const { result } = renderHook(() => useSearchHandlers({
        state: mockState,
        actions: mockActions,
        onBack: mockOnBack,
      }))

      act(() => {
        result.current.seedPrecedentSearchParams({ searchQuery: '2020도1234', court: '대법원', caseNumber: '2020도1234' })
      })

      await act(async () => {
        await result.current.handlePrecedentPageChange(2)
      })

      const url = mockFetch.mock.calls.at(-1)?.[0] as string
      expect(url).toContain('/api/precedent-search')
      expect(url).toContain('page=2')
      expect(url).toContain('court=')
      expect(url).toContain('caseNumber=')
      expect(url).toContain(encodeURIComponent('2020도1234'))
    })

    it('시드 없이 페이지 변경 시 court/caseNumber 미포함(회귀 없음)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ precedents: [], totalCount: 0 }),
      })

      const { result } = renderHook(() => useSearchHandlers({
        state: { ...mockState, userQuery: '민법' },
        actions: mockActions,
        onBack: mockOnBack,
      }))

      await act(async () => {
        await result.current.handlePrecedentPageChange(2)
      })

      const url = mockFetch.mock.calls.at(-1)?.[0] as string
      expect(url).toContain('/api/precedent-search')
      expect(url).not.toContain('court=')
      expect(url).not.toContain('caseNumber=')
    })
  })

  // VH-2: 조회 이력 재조회 시 ordinanceSeq를 알면 이름검색 없이 해당 조례를 직접 연다
  describe('VH-2: 조례 ordinanceSeq 직접 재오픈', () => {
    it('ordinanceSeq 있으면 이름검색(/api/ordin-search) 없이 /api/ordin 직접 호출', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<자치법규></자치법규>'),
      })

      const { result } = renderHook(() => useSearchHandlers({
        state: mockState,
        actions: mockActions,
        onBack: mockOnBack,
      }))

      await act(async () => {
        result.current.handleSearch({
          lawName: '서울특별시 주차장 설치 조례',
          searchType: 'ordinance',
          ordinanceSeq: '2057000',
          classification: { searchType: 'ordinance', confidence: 1 },
        } as never)
      })

      const urls = mockFetch.mock.calls.map((c) => c[0] as string)
      expect(urls.some((u) => u.includes('/api/ordin?') && u.includes('ordinSeq=2057000'))).toBe(true)
      expect(urls.some((u) => u.includes('/api/ordin-search'))).toBe(false)
    })
  })
})
