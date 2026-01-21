"use client"

import type React from "react"
import { useCallback } from "react"
import { parseSearchQuery } from "@/lib/law-parser"
import { debugLogger } from "@/lib/debug-logger"
import { classifySearchQuery } from "@/lib/unified-query-classifier"
import type { SearchBarState, SearchBarActions, SearchQuery, Suggestion } from "../types"
import { MAX_RECENT } from "../types"

interface UseSearchBarHandlersParams {
  state: SearchBarState
  actions: SearchBarActions
  isAiMode: boolean
  onSearch: (query: SearchQuery) => void
}

export function useSearchBarHandlers({
  state,
  actions,
  isAiMode,
  onSearch
}: UseSearchBarHandlersParams) {
  const { suggestions, recentSearches } = state
  const displayedRecentSearches = recentSearches.slice(0, 5)

  const saveRecentSearch = useCallback((searchQuery: string) => {
    const stored = localStorage.getItem("recentSearches")
    let searches: string[] = []

    if (stored) {
      try {
        searches = JSON.parse(stored)
      } catch (error) {
        console.error("[SearchBar] Failed to parse recent searches:", error)
      }
    }

    searches = searches.filter((s) => s !== searchQuery)
    searches.unshift(searchQuery)
    searches = searches.slice(0, MAX_RECENT)

    localStorage.setItem("recentSearches", JSON.stringify(searches))
    actions.setRecentSearches(searches)
  }, [actions])

  const executeSearch = useCallback((searchQuery: string) => {
    try {
      const classification = classifySearchQuery(searchQuery)
      debugLogger.info("SearchBar 통합 검색 분류", { query: searchQuery, classification })

      // 수동 AI 모드
      if (state.forceAiMode) {
        debugLogger.info("AI 검색 실행 (수동 선택)", { query: searchQuery })
        saveRecentSearch(searchQuery)
        onSearch({
          lawName: searchQuery,
          article: undefined,
          jo: undefined,
          searchType: 'ai',
          classification
        })
        actions.setShowDropdown(false)
        return
      }

      // 판례/해석례/재결례
      if (['precedent', 'interpretation', 'ruling'].includes(classification.searchType)) {
        debugLogger.info(`${classification.searchType} 검색 실행`, { query: searchQuery })
        saveRecentSearch(searchQuery)
        onSearch({
          lawName: classification.entities.lawName || searchQuery,
          article: classification.entities.articleNumber,
          jo: classification.entities.articleNumber,
          searchType: classification.searchType,
          caseNumber: classification.entities.caseNumber,
          classification
        })
        actions.setShowDropdown(false)
        return
      }

      // 자동 AI 모드
      if (classification.searchType === 'ai' && classification.confidence >= 0.7) {
        debugLogger.info("AI 검색 실행 (자동 감지)", { query: searchQuery, confidence: classification.confidence })
        saveRecentSearch(searchQuery)
        onSearch({
          lawName: searchQuery,
          article: undefined,
          jo: undefined,
          searchType: 'ai',
          classification,
          forcedMode: 'ai'
        })
        actions.setShowDropdown(false)
        return
      }

      // 애매한 경우
      const hasArticleNumber = /제?\s*\d+\s*조(?:의\s*\d+)?/.test(searchQuery)
      if (hasArticleNumber && classification.searchType !== 'ai' && classification.confidence >= 0.6 && classification.confidence < 0.95) {
        actions.setPendingQuery(searchQuery)
        actions.setShowChoiceDialog(true)
        return
      }

      // 명확한 법령 검색
      const parsed = parseSearchQuery(searchQuery)
      debugLogger.info("통합 검색 실행", parsed)

      saveRecentSearch(searchQuery)
      onSearch({
        ...parsed,
        searchType: classification.searchType,
        classification
      })
      actions.setShowDropdown(false)
    } catch (error) {
      debugLogger.error("검색어 파싱 실패", error)
    }
  }, [state.forceAiMode, saveRecentSearch, onSearch, actions])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()

    if (!state.query.trim()) {
      debugLogger.warning("검색어가 비어있습니다")
      return
    }

    executeSearch(state.query.trim())
  }, [state.query, executeSearch])

  const handleSearchChoice = useCallback((choice: 'law' | 'ai') => {
    actions.setShowChoiceDialog(false)
    saveRecentSearch(state.pendingQuery)

    const classification = classifySearchQuery(state.pendingQuery)

    if (choice === 'ai') {
      debugLogger.info("AI 검색 실행 (사용자 선택)", { query: state.pendingQuery })
      onSearch({
        lawName: state.pendingQuery,
        article: undefined,
        jo: undefined,
        searchType: 'ai',
        classification,
        forcedMode: 'ai'
      })
    } else {
      try {
        const parsed = parseSearchQuery(state.pendingQuery)
        debugLogger.info("법령 검색 실행 (사용자 선택)", parsed)
        onSearch({
          ...parsed,
          searchType: classification.searchType,
          classification,
          forcedMode: 'law'
        })
      } catch (error) {
        debugLogger.error("법령 검색 파싱 실패", error)
      }
    }

    actions.setPendingQuery("")
  }, [state.pendingQuery, saveRecentSearch, onSearch, actions])

  const handleSuggestionClick = useCallback((text: string) => {
    actions.setQuery(text)
    actions.setShowDropdown(false)
    actions.setSelectedIndex(-1)
    executeSearch(text)
  }, [actions, executeSearch])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const totalItems = suggestions.length + displayedRecentSearches.length

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      actions.setSelectedIndex((state.selectedIndex + 1) % totalItems)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      actions.setSelectedIndex((state.selectedIndex - 1 + totalItems) % totalItems)
    } else if (e.key === 'Enter') {
      if (state.selectedIndex >= 0 && totalItems > 0) {
        e.preventDefault()
        const allItems = [...suggestions.map(s => s.text), ...displayedRecentSearches]

        if (allItems[state.selectedIndex]) {
          handleSuggestionClick(allItems[state.selectedIndex])
        }
      }
    } else if (e.key === 'Escape') {
      actions.setShowDropdown(false)
      actions.setSelectedIndex(-1)
    }
  }, [suggestions, displayedRecentSearches, state.selectedIndex, actions, handleSuggestionClick])

  return {
    handleSubmit,
    handleSearchChoice,
    handleSuggestionClick,
    handleKeyDown,
    displayedRecentSearches
  }
}
