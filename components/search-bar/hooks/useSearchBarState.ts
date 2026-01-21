"use client"

import { useState, useEffect, useCallback } from "react"
import { classifySearchQuery } from "@/lib/unified-query-classifier"
import type { SearchBarState, SearchBarActions, Suggestion } from "../types"
import { MAX_RECENT } from "../types"

// debounce 훅
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

export function useSearchBarState(searchMode: 'basic' | 'rag' = 'basic') {
  const [query, setQuery] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [searchType, setSearchType] = useState<"law" | "ordinance" | "ai" | null>(null)
  const [isNaturalQuery, setIsNaturalQuery] = useState(false)
  const [forceAiMode, setForceAiMode] = useState(false)
  const [showChoiceDialog, setShowChoiceDialog] = useState(false)
  const [pendingQuery, setPendingQuery] = useState("")

  // debounce된 쿼리
  const debouncedQuery = useDebounce(query, 200)

  // 자동 감지 + 수동 전환 병합
  const isAiMode = forceAiMode || (searchMode === 'rag') || (searchType === 'ai')

  // 검색 타입 감지
  useEffect(() => {
    if (!query.trim()) {
      setSearchType(null)
      setIsNaturalQuery(false)
      return
    }

    const classification = classifySearchQuery(query)

    if (classification.searchType === 'ai' && classification.confidence >= 0.7) {
      setSearchType("ai")
      setIsNaturalQuery(true)
      return
    }

    if (classification.searchType === 'ordinance') {
      setSearchType("ordinance")
      setIsNaturalQuery(false)
      return
    }

    if (classification.searchType === 'law') {
      setSearchType("law")
      setIsNaturalQuery(false)
      return
    }

    setSearchType("law")
    setIsNaturalQuery(false)
  }, [query])

  // 최근 검색 로드
  useEffect(() => {
    const stored = localStorage.getItem("recentSearches")
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setRecentSearches(parsed.slice(0, MAX_RECENT))
      } catch (error) {
        console.error("[SearchBar] Failed to parse recent searches:", error)
      }
    }
  }, [])

  // 자동완성 API 호출
  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q || q.length < 1) {
      setSuggestions([])
      return
    }

    setIsLoadingSuggestions(true)
    try {
      const res = await fetch(`/api/search-suggest?q=${encodeURIComponent(q)}&limit=5`)
      if (res.ok) {
        const data = await res.json()
        setSuggestions(data.suggestions || [])
      }
    } catch (error) {
      console.error("[SearchBar] Failed to fetch suggestions:", error)
    } finally {
      setIsLoadingSuggestions(false)
    }
  }, [])

  // debounced 쿼리 변경 시 자동완성 호출
  useEffect(() => {
    if (debouncedQuery.trim()) {
      fetchSuggestions(debouncedQuery.trim())
    } else {
      setSuggestions([])
    }
  }, [debouncedQuery, fetchSuggestions])

  const state: SearchBarState = {
    query,
    showDropdown,
    recentSearches,
    suggestions,
    isLoadingSuggestions,
    selectedIndex,
    searchType,
    isNaturalQuery,
    forceAiMode,
    showChoiceDialog,
    pendingQuery
  }

  const actions: SearchBarActions = {
    setQuery,
    setShowDropdown,
    setRecentSearches,
    setSuggestions,
    setIsLoadingSuggestions,
    setSelectedIndex,
    setSearchType,
    setIsNaturalQuery,
    setForceAiMode,
    setShowChoiceDialog,
    setPendingQuery
  }

  return {
    state,
    actions,
    isAiMode,
    debouncedQuery
  }
}
