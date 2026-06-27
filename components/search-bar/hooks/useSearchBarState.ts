"use client"

import { useState, useEffect, useCallback, useRef } from "react"
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
  const [searchType, setSearchType] = useState<"law" | "ordinance" | "admrul" | "ai" | null>(null)
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

    if (classification.searchType === 'admrul') {
      setSearchType("admrul")
      setIsNaturalQuery(false)
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
  const abortRef = useRef<AbortController | null>(null)
  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q || q.length < 1) {
      setSuggestions([])
      return
    }

    // SR-4: 이전 in-flight 요청 취소 — 느린 망에서 옛 응답이 최신 추천을 덮는 경합 방지
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoadingSuggestions(true)
    try {
      const res = await fetch(`/api/search-suggest?q=${encodeURIComponent(q)}&limit=5`, { signal: controller.signal })
      if (res.ok) {
        const data = await res.json()
        setSuggestions(data.suggestions || [])
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      console.error("[SearchBar] Failed to fetch suggestions:", error)
    } finally {
      // 최신 요청만 로딩 해제 (abort된 옛 요청의 finally가 스피너를 끄지 않도록)
      if (abortRef.current === controller) setIsLoadingSuggestions(false)
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
