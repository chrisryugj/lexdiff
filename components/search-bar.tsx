"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback } from "react"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { parseSearchQuery } from "@/lib/law-parser"
import { debugLogger } from "@/lib/debug-logger"
import { cn } from "@/lib/utils"
import { detectQueryType } from "@/lib/query-detector"

interface SearchBarProps {
  onSearch: (query: { lawName: string; article?: string; jo?: string }) => void
  isLoading?: boolean
  searchMode?: 'basic' | 'rag'
}

interface Suggestion {
  text: string
  type: 'law' | 'ai' | 'recent'
  category: string
}

const MAX_RECENT = 10 // 최대 10개 저장 (표시는 5개)

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

export function SearchBar({ onSearch, isLoading, searchMode = 'basic' }: SearchBarProps) {
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
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

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

    const queryDetection = detectQueryType(query)

    if (queryDetection.type === 'natural' && queryDetection.confidence >= 0.7) {
      setSearchType("ai")
      setIsNaturalQuery(true)
      return
    }

    const hasLawKeyword = /법|법률|시행령|시행규칙/.test(query)
    const hasOrdinanceKeyword = /조례|자치법규/.test(query) || (/규칙/.test(query) && !/시행규칙/.test(query))
    const isOrdinanceQuery = hasOrdinanceKeyword && !hasLawKeyword

    if (hasLawKeyword || hasOrdinanceKeyword) {
      setSearchType(isOrdinanceQuery ? "ordinance" : "law")
      setIsNaturalQuery(false)
      return
    }

    setSearchType("law")
    setIsNaturalQuery(false)
  }, [query])

  // 최근 검색 로드 (전체 10개 로드, 표시는 5개)
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

  // 자동완성 API 호출 (최대 5개로 제한)
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

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // 키보드 네비게이션 (실시간 추천 → 최근 검색 순서)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const totalItems = suggestions.length + displayedRecentSearches.length

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => (prev + 1) % totalItems)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => (prev - 1 + totalItems) % totalItems)
    } else if (e.key === 'Enter') {
      // 드롭다운 항목을 화살표로 선택한 경우에만 해당 항목 실행
      if (selectedIndex >= 0 && totalItems > 0) {
        e.preventDefault()
        const allItems = [...suggestions.map(s => s.text), ...displayedRecentSearches]

        if (allItems[selectedIndex]) {
          const isRecent = selectedIndex >= suggestions.length
          handleSuggestionClick(allItems[selectedIndex], isRecent)
        }
      }
      // selectedIndex === -1 (선택 안 함) → 현재 입력값으로 검색 (폼 submit)
      // 이 경우 e.preventDefault() 호출 안 함 → handleSubmit이 실행됨
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
      setSelectedIndex(-1)
    }
  }

  const saveRecentSearch = (searchQuery: string) => {
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
    setRecentSearches(searches)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!query.trim()) {
      debugLogger.warning("검색어가 비어있습니다")
      return
    }

    executeSearch(query.trim())
  }

  const executeSearch = (searchQuery: string) => {
    try {
      // 수동으로 AI 모드를 선택한 경우
      if (forceAiMode) {
        debugLogger.info("AI 검색 실행 (수동 선택)", { query: searchQuery })
        saveRecentSearch(searchQuery)
        onSearch({ lawName: searchQuery, article: undefined, jo: undefined })
        setShowDropdown(false)
        return
      }

      // 자동 감지로 AI 모드가 확실한 경우
      if (searchType === 'ai' && isNaturalQuery) {
        debugLogger.info("AI 검색 실행 (자동 감지)", { query: searchQuery })
        saveRecentSearch(searchQuery)
        onSearch({ lawName: searchQuery, article: undefined, jo: undefined })
        setShowDropdown(false)
        return
      }

      // 애매한 경우 판별
      const queryDetection = detectQueryType(searchQuery)
      const hasArticleNumber = /제?\s*\d+\s*조(?:의\s*\d+)?/.test(searchQuery)

      if (hasArticleNumber && queryDetection.confidence >= 0.6 && queryDetection.confidence < 0.95) {
        setPendingQuery(searchQuery)
        setShowChoiceDialog(true)
        return
      }

      // 명확한 법령 검색
      const parsed = parseSearchQuery(searchQuery)
      debugLogger.info("통합 검색 실행", parsed)

      saveRecentSearch(searchQuery)
      onSearch(parsed)
      setShowDropdown(false)
    } catch (error) {
      debugLogger.error("검색어 파싱 실패", error)
    }
  }

  const handleSearchChoice = (choice: 'law' | 'ai') => {
    setShowChoiceDialog(false)
    saveRecentSearch(pendingQuery)

    if (choice === 'ai') {
      debugLogger.info("AI 검색 실행 (사용자 선택)", { query: pendingQuery })
      onSearch({ lawName: pendingQuery, article: undefined, jo: undefined })
    } else {
      try {
        const parsed = parseSearchQuery(pendingQuery)
        debugLogger.info("법령 검색 실행 (사용자 선택)", parsed)
        onSearch(parsed)
      } catch (error) {
        debugLogger.error("법령 검색 파싱 실패", error)
      }
    }

    setPendingQuery("")
  }

  const handleSuggestionClick = (text: string, isRecent: boolean = false) => {
    setQuery(text)
    setShowDropdown(false)
    setSelectedIndex(-1)

    // ✅ 최근 검색은 무조건 즉시 실행
    if (isRecent) {
      executeSearch(text)
      return
    }

    // 제안 목록은 기존 로직 유지 (AI 패턴 감지)
    if (text.endsWith('?') || text.includes('요건') || text.includes('절차') || text.includes('방법')) {
      executeSearch(text)
    } else {
      // 일반 제안은 입력만 (기존 동작 유지)
      inputRef.current?.focus()
    }
  }

  // 드롭다운에 표시할 항목들 - 실시간 추천을 먼저 표시 (최대 5개)
  const displayedRecentSearches = recentSearches.slice(0, 5) // 최근 검색 5개만 표시
  const dropdownItems = [
    ...suggestions, // 실시간 추천 먼저
    ...displayedRecentSearches.map(s => ({ text: s, type: 'recent' as const, category: '최근 검색' }))
  ]

  const hasDropdownItems = dropdownItems.length > 0

  return (
    <>
      <form onSubmit={handleSubmit} className="w-full max-w-3xl relative" style={{ fontFamily: "Pretendard, sans-serif" }}>
        <div className="flex gap-2">
          {/* AI 모드 전환 버튼 */}
          <Button
            type="button"
            variant={forceAiMode ? "default" : "outline"}
            size="icon"
            onClick={() => setForceAiMode(!forceAiMode)}
            className={cn(
              "h-12 w-12 transition-all duration-300",
              forceAiMode && "bg-gradient-to-br from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600"
            )}
            title={forceAiMode ? "기본 검색으로 전환" : "AI 검색으로 전환"}
          >
            <Icon name="brain" className={cn("h-5 w-5", forceAiMode && "animate-pulse")} />
          </Button>

          <div className="relative flex-1">
            {isAiMode ? (
              <Icon name="brain" className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-purple-500 animate-pulse z-10" />
            ) : searchType === "ordinance" ? (
              <Icon name="building-2" className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-500 z-10" />
            ) : searchType === "law" ? (
              <Icon name="scale" className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-amber-500 z-10" />
            ) : (
              <Icon name="search" className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground z-10" />
            )}
            <div className="relative">
              <style>{`
                @keyframes border-beam-ai {
                  0% {
                    background-position: 0% 50%;
                  }
                  100% {
                    background-position: 200% 50%;
                  }
                }
                @keyframes border-beam-normal {
                  0% {
                    background-position: 0% 50%;
                  }
                  100% {
                    background-position: 200% 50%;
                  }
                }
                .input-beam-wrapper-ai {
                  position: relative;
                  padding: 2px;
                  border-radius: 0.5rem;
                  background: linear-gradient(
                    90deg,
                    transparent 0%,
                    transparent 30%,
                    #a78bfa 45%,
                    #ec4899 55%,
                    transparent 70%,
                    transparent 100%
                  );
                  background-size: 200% 100%;
                  animation: border-beam-ai 3s linear infinite;
                }
                .input-beam-wrapper-normal {
                  position: relative;
                  padding: 2px;
                  border-radius: 0.5rem;
                  background: linear-gradient(
                    90deg,
                    transparent 0%,
                    transparent 30%,
                    #3b82f6 45%,
                    #06b6d4 55%,
                    transparent 70%,
                    transparent 100%
                  );
                  background-size: 200% 100%;
                  animation: border-beam-normal 4s linear infinite;
                }
              `}</style>
              <div className={cn(
                showDropdown && (isAiMode ? "input-beam-wrapper-ai" : "input-beam-wrapper-normal")
              )}>
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder={isAiMode ? '🤖 AI에게 질문하세요... 예: "수출통관 절차는?", "청년 창업 지원은?"' : '법령명 또는 조문 검색... 예: "관세법 38조", "민법 제1조"'}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setSelectedIndex(-1)
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onKeyDown={handleKeyDown}
                  className={cn(
                    "pl-11 h-12 text-base relative",
                    "focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none",
                    showDropdown && "border-transparent",
                    isAiMode && [
                      "bg-purple-50/50 dark:bg-gradient-to-r dark:from-purple-950/30 dark:to-blue-950/30",
                      "text-foreground placeholder:text-muted-foreground"
                    ]
                  )}
                  disabled={isLoading}
                  autoComplete="off"
                />
              </div>
            </div>

            {/* 자동완성 드롭다운 */}
            {showDropdown && hasDropdownItems && (
              <div
                ref={dropdownRef}
                className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-xl z-[100] overflow-hidden"
              >
                {/* 로딩 표시 */}
                {isLoadingSuggestions && query.trim() && (
                  <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground border-b border-border">
                    <Icon name="loader" className="h-3 w-3 animate-spin" />
                    <span>검색 중...</span>
                  </div>
                )}

                {/* 실시간 추천 (법령 + AI) - 독립 스크롤 영역 */}
                {suggestions.length > 0 && (
                  <div className="max-h-[200px] overflow-y-auto border-b border-border">
                    <div className="p-1.5">
                      {/* 법령 추천 */}
                      {suggestions.filter(s => s.type === 'law').length > 0 && (
                        <>
                          <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground font-medium sticky top-0 bg-background z-10">
                            <Icon name="scale" className="h-3 w-3 text-amber-500" />
                            <span>법령</span>
                          </div>
                          {suggestions
                            .filter(s => s.type === 'law')
                            .map((suggestion, index) => {
                              const globalIndex = index

                              return (
                                <button
                                  key={`law-${index}`}
                                  type="button"
                                  onClick={() => handleSuggestionClick(suggestion.text)}
                                  className={cn(
                                    "w-full text-left px-3 py-2 rounded-md transition-colors text-sm flex items-center gap-2",
                                    selectedIndex === globalIndex ? "bg-accent" : "hover:bg-secondary"
                                  )}
                                >
                                  <Icon name="scale" className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                                  <span className="truncate">{suggestion.text}</span>
                                </button>
                              )
                            })}
                        </>
                      )}

                      {/* AI 질문 추천 */}
                      {suggestions.filter(s => s.type === 'ai').length > 0 && (
                        <>
                          {suggestions.filter(s => s.type === 'law').length > 0 && (
                            <div className="border-t border-border my-1.5" />
                          )}
                          <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground font-medium sticky top-0 bg-background z-10">
                            <Icon name="sparkles" className="h-3 w-3 text-purple-500" />
                            <span>AI 질문</span>
                          </div>
                          {suggestions
                            .filter(s => s.type === 'ai')
                            .map((suggestion, index) => {
                              const lawCount = suggestions.filter(s => s.type === 'law').length
                              const globalIndex = lawCount + index

                              return (
                                <button
                                  key={`ai-${index}`}
                                  type="button"
                                  onClick={() => handleSuggestionClick(suggestion.text)}
                                  className={cn(
                                    "w-full text-left px-3 py-2 rounded-md transition-colors text-sm flex items-center gap-2 group",
                                    selectedIndex === globalIndex ? "bg-purple-50 dark:bg-purple-950/30" : "hover:bg-purple-50/50 dark:hover:bg-purple-950/20"
                                  )}
                                >
                                  <Icon name="brain" className="h-3.5 w-3.5 text-purple-500 flex-shrink-0" />
                                  <span className="truncate text-purple-700 dark:text-purple-300">{suggestion.text}</span>
                                </button>
                              )
                            })}
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* 최근 검색 - 독립 스크롤 영역 (5개만 표시) */}
                {displayedRecentSearches.length > 0 && (
                  <div className="max-h-[200px] overflow-y-auto">
                    <div className="p-1.5">
                      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground font-medium sticky top-0 bg-background z-10">
                        <Icon name="clock" className="h-3 w-3" />
                        <span>최근 검색</span>
                      </div>
                      {displayedRecentSearches.map((search, index) => {
                        const globalIndex = suggestions.length + index

                        return (
                          <button
                            key={`recent-${index}`}
                            type="button"
                            onClick={() => handleSuggestionClick(search, true)}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-md transition-colors text-sm flex items-center gap-2",
                              selectedIndex === globalIndex ? "bg-accent" : "hover:bg-secondary"
                            )}
                          >
                            <Icon name="clock" className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="truncate">{search}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* 하단 팁 */}
                <div className="border-t border-border px-3 py-2 bg-muted/30">
                  <div className="text-xs text-muted-foreground flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 bg-background border rounded text-[10px]">↑↓</kbd>
                      이동
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 bg-background border rounded text-[10px]">Enter</kbd>
                      선택
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 bg-background border rounded text-[10px]">Esc</kbd>
                      닫기
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={isLoading || !query.trim()}
            className={cn(
              "h-12 px-6 sm:px-8 transition-all duration-300",
              isAiMode && [
                "bg-purple-700",
                "hover:bg-purple-600",
                "border-purple-500/50",
                "dark:bg-purple-600/80"
              ]
            )}
          >
            {isLoading ? (
              <>
                <Icon name="loader" className="mr-2 h-4 w-4 animate-spin" />
                <span className="hidden sm:inline">{isAiMode ? 'AI 검색 중' : '검색 중'}</span>
                <span className="sm:hidden">검색</span>
              </>
            ) : (
              <>
                {isAiMode && <Icon name="brain" className="mr-2 h-4 w-4" />}
                <span className="hidden sm:inline">{isAiMode ? 'AI 검색' : '검색'}</span>
                <span className="sm:hidden">검색</span>
              </>
            )}
          </Button>
        </div>
      </form>

      {/* 검색 모드 선택 다이얼로그 */}
      <Dialog open={showChoiceDialog} onOpenChange={setShowChoiceDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="help-circle" className="h-5 w-5 text-blue-500" />
              검색 방법을 선택하세요
            </DialogTitle>
            <DialogDescription className="pt-2">
              <div className="text-sm text-muted-foreground mb-3">
                입력하신 "<span className="font-medium text-foreground">{pendingQuery}</span>"를 어떻게 검색할까요?
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              onClick={() => handleSearchChoice('law')}
              variant="outline"
              className="h-auto p-4 flex flex-col items-center gap-2 hover:bg-amber-50 dark:hover:bg-amber-950/20"
            >
              <Icon name="scale" className="h-8 w-8 text-amber-500" />
              <div className="text-center">
                <div className="font-semibold">법령 검색</div>
                <div className="text-xs text-muted-foreground mt-1">
                  조문 직접 확인
                </div>
              </div>
            </Button>
            <Button
              onClick={() => handleSearchChoice('ai')}
              variant="outline"
              className="h-auto p-4 flex flex-col items-center gap-2 hover:bg-purple-50 dark:hover:bg-purple-950/20"
            >
              <Icon name="brain" className="h-8 w-8 text-purple-500" />
              <div className="text-center">
                <div className="font-semibold">AI 검색</div>
                <div className="text-xs text-muted-foreground mt-1">
                  자연어로 설명
                </div>
              </div>
            </Button>
          </div>
          <div className="text-xs text-muted-foreground text-center mt-3">
            💡 Tip: 왼쪽 보라색 버튼으로 AI 모드를 고정할 수 있습니다
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
