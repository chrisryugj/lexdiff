/**
 * useSearchState 훅 통합 테스트
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSearchState } from '@/components/search-result-view/hooks/useSearchState'

// favoritesStore mock
vi.mock('@/lib/favorites-store', () => ({
  favoritesStore: {
    subscribe: vi.fn((callback) => {
      callback([])
      return () => {}
    }),
    getFavorites: vi.fn(() => []),
  }
}))

describe('useSearchState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('초기 상태', () => {
    it('기본 초기값으로 시작', () => {
      const { result } = renderHook(() => useSearchState({}))
      const [state] = result.current

      expect(state.isSearching).toBe(false)
      expect(state.searchMode).toBe('basic')
      expect(state.searchStage).toBe('searching')
      expect(state.searchProgress).toBe(0)
      expect(state.lawData).toBeNull()
      expect(state.isAiMode).toBe(false)
    })

    it('initialSearchMode로 초기 모드 설정', () => {
      const { result } = renderHook(() => useSearchState({ initialSearchMode: 'rag' }))
      const [state] = result.current

      expect(state.searchMode).toBe('rag')
    })
  })

  describe('검색 상태 업데이트', () => {
    it('setIsSearching으로 검색 상태 변경', () => {
      const { result } = renderHook(() => useSearchState({}))

      act(() => {
        result.current[1].setIsSearching(true)
      })

      expect(result.current[0].isSearching).toBe(true)
    })

    it('updateProgress로 진행 상태 업데이트', () => {
      const onProgressUpdate = vi.fn()
      const { result } = renderHook(() => useSearchState({ onProgressUpdate }))

      act(() => {
        result.current[1].updateProgress('parsing', 50)
      })

      expect(result.current[0].searchStage).toBe('parsing')
      expect(result.current[0].searchProgress).toBe(50)
      expect(onProgressUpdate).toHaveBeenCalledWith('parsing', 50)
    })

    it('setSearchMode로 모드 변경 및 콜백 호출', () => {
      const onModeChange = vi.fn()
      const { result } = renderHook(() => useSearchState({ onModeChange }))

      act(() => {
        result.current[1].setSearchMode('rag')
      })

      expect(result.current[0].searchMode).toBe('rag')
      expect(onModeChange).toHaveBeenCalledWith('rag')
    })
  })

  describe('UI 상태 업데이트', () => {
    it('setIsFocusMode로 포커스 모드 변경', () => {
      const { result } = renderHook(() => useSearchState({}))

      act(() => {
        result.current[1].setIsFocusMode(true)
      })

      expect(result.current[0].isFocusMode).toBe(true)
    })

    it('setShowSearchModal로 검색 모달 상태 변경', () => {
      const { result } = renderHook(() => useSearchState({}))

      act(() => {
        result.current[1].setShowSearchModal(true)
      })

      expect(result.current[0].showSearchModal).toBe(true)
    })

    it('setMobileView로 모바일 뷰 변경', () => {
      const { result } = renderHook(() => useSearchState({}))

      act(() => {
        result.current[1].setMobileView('list')
      })

      expect(result.current[0].mobileView).toBe('list')
    })
  })

  describe('데이터 상태 업데이트', () => {
    it('setLawData로 법령 데이터 설정', () => {
      const { result } = renderHook(() => useSearchState({}))

      const mockLawData = {
        meta: {
          lawId: '001706',
          lawTitle: '민법',
          fetchedAt: new Date().toISOString(),
        },
        articles: [{ jo: '000100', joNum: '제1조', title: '', content: '테스트', isPreamble: false }],
        selectedJo: '000100',
        viewMode: 'full' as const,
      }

      act(() => {
        result.current[1].setLawData(mockLawData)
      })

      expect(result.current[0].lawData).toEqual(mockLawData)
    })

    it('setLawSelectionState로 법령 선택 상태 설정', () => {
      const { result } = renderHook(() => useSearchState({}))

      const mockSelectionState = {
        results: [{ lawId: '001', lawName: '테스트법', lawType: '법률' }],
        query: { lawName: '테스트' }
      }

      act(() => {
        result.current[1].setLawSelectionState(mockSelectionState)
      })

      expect(result.current[0].lawSelectionState).toEqual(mockSelectionState)
    })

    it('setArticleNotFound로 조문 없음 상태 설정', () => {
      const { result } = renderHook(() => useSearchState({}))

      const mockNotFound = {
        requestedJo: '999900',
        lawTitle: '민법',
        nearestArticles: [],
        crossLawSuggestions: []
      }

      act(() => {
        result.current[1].setArticleNotFound(mockNotFound)
      })

      expect(result.current[0].articleNotFound).toEqual(mockNotFound)
    })
  })

  describe('AI 모드 상태 업데이트', () => {
    it('setIsAiMode로 AI 모드 변경', () => {
      const { result } = renderHook(() => useSearchState({}))

      act(() => {
        result.current[1].setIsAiMode(true)
      })

      expect(result.current[0].isAiMode).toBe(true)
    })

    it('setAiAnswerContent로 AI 답변 설정', () => {
      const { result } = renderHook(() => useSearchState({}))

      act(() => {
        result.current[1].setAiAnswerContent('AI 답변 내용')
      })

      expect(result.current[0].aiAnswerContent).toBe('AI 답변 내용')
    })

    it('setAiCitations로 인용 설정', () => {
      const { result } = renderHook(() => useSearchState({}))

      const mockCitations = [
        { lawName: '민법', articleNum: '제1조', verified: true }
      ]

      act(() => {
        result.current[1].setAiCitations(mockCitations as any)
      })

      expect(result.current[0].aiCitations).toEqual(mockCitations)
    })

    it('setFileSearchFailed로 검색 실패 상태 설정', () => {
      const { result } = renderHook(() => useSearchState({}))

      act(() => {
        result.current[1].setFileSearchFailed(true)
      })

      expect(result.current[0].fileSearchFailed).toBe(true)
    })
  })

  describe('모달/다이얼로그 상태 업데이트', () => {
    it('setComparisonModal로 비교 모달 상태 설정', () => {
      const { result } = renderHook(() => useSearchState({}))

      act(() => {
        result.current[1].setComparisonModal({ isOpen: true, jo: '000100' })
      })

      expect(result.current[0].comparisonModal).toEqual({ isOpen: true, jo: '000100' })
    })

    it('setSummaryDialog로 요약 다이얼로그 상태 설정', () => {
      const { result } = renderHook(() => useSearchState({}))

      act(() => {
        result.current[1].setSummaryDialog({
          isOpen: true,
          jo: '제1조',
          oldContent: '구법',
          newContent: '신법'
        })
      })

      expect(result.current[0].summaryDialog.isOpen).toBe(true)
      expect(result.current[0].summaryDialog.jo).toBe('제1조')
    })

    it('setShowChoiceDialog로 선택 다이얼로그 상태 설정', () => {
      const { result } = renderHook(() => useSearchState({}))

      act(() => {
        result.current[1].setShowChoiceDialog(true)
      })

      expect(result.current[0].showChoiceDialog).toBe(true)
    })

    it('setPendingQuery로 대기 쿼리 설정', () => {
      const { result } = renderHook(() => useSearchState({}))

      act(() => {
        result.current[1].setPendingQuery({ lawName: '민법', article: '1조' })
      })

      expect(result.current[0].pendingQuery).toEqual({ lawName: '민법', article: '1조' })
    })
  })

  describe('복합 액션', () => {
    it('resetSearchState로 검색 상태 초기화', () => {
      const { result } = renderHook(() => useSearchState({}))

      // 먼저 상태 설정
      act(() => {
        result.current[1].setLawData({
          meta: { lawId: '001', lawTitle: '테스트', fetchedAt: '' },
          articles: [],
        })
        result.current[1].setIsAiMode(true)
        result.current[1].setAiAnswerContent('답변')
      })

      // 리셋
      act(() => {
        result.current[1].resetSearchState()
      })

      expect(result.current[0].lawData).toBeNull()
      expect(result.current[0].isAiMode).toBe(false)
      expect(result.current[0].aiAnswerContent).toBe('')
    })

    it('resetToHome으로 홈 상태로 복귀', () => {
      const { result } = renderHook(() => useSearchState({}))

      // 먼저 상태 설정
      act(() => {
        result.current[1].setSearchMode('rag')
        result.current[1].setMobileView('list')
        result.current[1].setRagAnswer({ content: '답변', citations: [], confidence: 'high' })
      })

      // 홈으로 복귀
      act(() => {
        result.current[1].resetToHome()
      })

      expect(result.current[0].searchMode).toBe('basic')
      expect(result.current[0].mobileView).toBe('content')
      expect(result.current[0].ragAnswer).toBeNull()
    })
  })

  describe('RAG 상태 업데이트', () => {
    it('setRagLoading으로 로딩 상태 설정', () => {
      const { result } = renderHook(() => useSearchState({}))

      act(() => {
        result.current[1].setRagLoading(true)
      })

      expect(result.current[0].ragLoading).toBe(true)
    })

    it('setRagError로 에러 설정', () => {
      const { result } = renderHook(() => useSearchState({}))

      act(() => {
        result.current[1].setRagError('검색 실패')
      })

      expect(result.current[0].ragError).toBe('검색 실패')
    })

    it('setRagProgress로 진행률 설정', () => {
      const { result } = renderHook(() => useSearchState({}))

      act(() => {
        result.current[1].setRagProgress(75)
      })

      expect(result.current[0].ragProgress).toBe(75)
    })

    it('setRagAnswer로 RAG 답변 설정', () => {
      const { result } = renderHook(() => useSearchState({}))

      const mockAnswer = {
        content: 'RAG 답변',
        citations: [{ lawName: '민법', articleDisplay: '제1조', relevance: 'high' as const }],
        confidence: 'high' as const
      }

      act(() => {
        result.current[1].setRagAnswer(mockAnswer)
      })

      expect(result.current[0].ragAnswer).toEqual(mockAnswer)
    })
  })
})
