"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { m, AnimatePresence } from "framer-motion"
import { Icon } from "@/components/ui/icon"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import * as VisuallyHidden from "@radix-ui/react-visually-hidden"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { favoritesStore } from "@/lib/favorites-store"
import type { Favorite } from "@/lib/law-types"
import { formatJO, parseSearchQuery } from "@/lib/law-parser"
import { debugLogger } from "@/lib/debug-logger"
import { cn } from "@/lib/utils"
import { classifySearchQuery, type UnifiedQueryClassification, type SearchType } from "@/lib/unified-query-classifier"

interface CommandSearchModalProps {
  isOpen: boolean
  onClose: () => void
  onSearch: (query: {
    lawName: string
    article?: string
    jo?: string
    searchType?: SearchType  // ✅ 신규
    caseNumber?: string  // ✅ 신규
    classification?: UnifiedQueryClassification  // ✅ 신규
    rawQuery?: string
  }) => void
  isAiMode?: boolean // AI 모드 여부
}

interface Suggestion {
  text: string
  type: 'law' | 'ai' | 'recent'
  category: string
}

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

export function CommandSearchModal({ isOpen, onClose, onSearch, isAiMode = false }: CommandSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  // debounce된 쿼리
  const debouncedQuery = useDebounce(searchQuery, 200)

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
      console.error("[CommandSearchModal] Failed to fetch suggestions:", error)
    } finally {
      setIsLoadingSuggestions(false)
    }
  }, [])

  // 즐겨찾기 로드
  useEffect(() => {
    if (isOpen) {
      setFavorites(favoritesStore.getFavorites())

      // 최근 검색어 로드 (localStorage) - search-bar.tsx와 동일한 키 사용
      const recent = localStorage.getItem('recentSearches')
      if (recent) {
        try {
          setRecentSearches(JSON.parse(recent).slice(0, 10)) // 최대 10개 로드
        } catch (error) {
          console.error('Failed to parse recent searches:', error)
        }
      }

      // 입력창 포커스
      setTimeout(() => inputRef.current?.focus(), 100)
    } else {
      // 모달 닫힐 때 상태 초기화
      setSearchQuery("")
      setSuggestions([])
      setSelectedIndex(-1)
    }
  }, [isOpen])

  // debounced 쿼리 변경 시 자동완성 호출
  useEffect(() => {
    if (isOpen && debouncedQuery.trim()) {
      fetchSuggestions(debouncedQuery.trim())
    } else {
      setSuggestions([])
    }
  }, [debouncedQuery, isOpen, fetchSuggestions])

  // 키보드 네비게이션
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const displayedRecentSearches = recentSearches.slice(0, 5)
    const totalItems = suggestions.length + displayedRecentSearches.length + favorites.length

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => (prev + 1) % totalItems)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => (prev - 1 + totalItems) % totalItems)
    } else if (e.key === 'Enter') {
      e.preventDefault()

      // 항목 선택 중이면 해당 항목 실행
      if (selectedIndex >= 0 && totalItems > 0) {
        // 순서: 실시간 추천 → 최근 검색 → 즐겨찾기
        if (selectedIndex < suggestions.length) {
          // 실시간 추천
          handleSearch(suggestions[selectedIndex].text)
        } else if (selectedIndex < suggestions.length + displayedRecentSearches.length) {
          // 최근 검색
          const recentIndex = selectedIndex - suggestions.length
          handleRecentClick(displayedRecentSearches[recentIndex])
        } else {
          // 즐겨찾기
          const favIndex = selectedIndex - suggestions.length - displayedRecentSearches.length
          handleFavoriteClick(favorites[favIndex])
        }
      } else {
        // 선택 안 했으면 현재 입력값으로 검색
        handleSearch(searchQuery)
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  // ESC 키로 닫기 (전역)
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleEscapeKey)
    return () => window.removeEventListener('keydown', handleEscapeKey)
  }, [isOpen, onClose])

  const handleSearch = (query: string) => {
    if (!query.trim()) return

    // 최근 검색어 저장 - search-bar.tsx와 동일한 키 사용 (최대 10개)
    const updated = [query, ...recentSearches.filter(s => s !== query)].slice(0, 10)
    setRecentSearches(updated)
    localStorage.setItem('recentSearches', JSON.stringify(updated))

    // ✅ unified-query-classifier 사용
    const classification = classifySearchQuery(query)
    debugLogger.info('CommandSearchModal 통합 검색 분류', { query, classification })

    // ✅ 판례/해석례/재결례는 분류 결과 그대로 전달 (SearchBar와 동일)
    if (['precedent', 'interpretation', 'ruling'].includes(classification.searchType)) {
      debugLogger.info(`${classification.searchType} 검색 실행`, { query })
      onSearch({
        lawName: classification.entities.lawName || query,
        article: classification.entities.articleNumber,
        jo: classification.entities.articleNumber,
        searchType: classification.searchType,
        caseNumber: classification.entities.caseNumber,
        classification: classification,
        rawQuery: query,
      })
      onClose()
      return
    }

    // parseSearchQuery로 조문 번호 추출 (기존 호환성 유지)
    try {
      const parsed = parseSearchQuery(query)
      onSearch({
        lawName: classification.entities.lawName || parsed.lawName || query,
        article: classification.entities.articleNumber || parsed.article,
        jo: classification.entities.articleNumber || parsed.jo,
        searchType: classification.searchType,
        caseNumber: classification.entities.caseNumber,
        classification: classification,
        rawQuery: query,
      })
    } catch (error) {
      debugLogger.error('검색 파싱 실패 (Fallback)', error)
      onSearch({
        lawName: classification.entities.lawName || query,
        searchType: classification.searchType,
        classification: classification,
        rawQuery: query,
      })
    }
    onClose()
  }

  const handleFavoriteClick = (fav: Favorite) => {
    onSearch({ lawName: fav.lawTitle, jo: fav.jo })
    onClose()
  }

  const handleRecentClick = (query: string) => {
    // ✅ 최근 검색 클릭 시 즉시 검색 실행
    handleSearch(query)
    debugLogger.info('CommandSearchModal 최근 검색 실행', { query })
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-2xl p-0 gap-0 overflow-hidden bg-background border-border shadow-2xl sm:rounded-xl top-[12vh] translate-y-0"
        showCloseButton={true}
      >
        {/* 접근성을 위한 숨겨진 타이틀 */}
        <VisuallyHidden.Root>
          <DialogTitle>법령 검색</DialogTitle>
        </VisuallyHidden.Root>

        {/* 검색 입력 영역 - X 버튼 공간 확보 */}
        <div className="flex items-center gap-3 pl-4 pr-12 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
            <Icon name="search" className="h-5 w-5 text-primary" />
          </div>
          <Input
            ref={inputRef}
            type="text"
            placeholder="법령명 또는 조문 검색... (예: 민법, 형법 제38조)"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setSelectedIndex(-1)
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base text-foreground placeholder:text-muted-foreground shadow-none"
            autoComplete="off"
          />
        </div>

        {/* 검색 제안 영역 */}
        <div className="bg-background">
          {/* 로딩 표시 */}
          {isLoadingSuggestions && searchQuery.trim() && (
            <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground border-b border-border">
              <Icon name="loader" className="h-3 w-3 animate-spin" />
              <span>검색 중...</span>
            </div>
          )}

          {/* 실시간 추천 (법령 + AI) - 독립 스크롤 영역 */}
          {suggestions.length > 0 && (
            <div className="max-h-[200px] overflow-y-auto border-b border-border">
              <div className="p-2">
                {/* 법령 추천 */}
                {suggestions.filter(s => s.type === 'law').length > 0 && (
                  <>
                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground font-semibold sticky top-0 bg-background z-10">
                      <Icon name="scale" className="h-3.5 w-3.5 text-amber-500" />
                      <span>법령</span>
                    </div>
                    {suggestions
                      .filter(s => s.type === 'law')
                      .map((suggestion, index) => {
                        const globalIndex = index
                        const isSelected = selectedIndex === globalIndex

                        return (
                          <button
                            key={`law-${index}`}
                            onClick={() => handleSearch(suggestion.text)}
                            className={cn(
                              "w-full flex items-center justify-between p-3 rounded-lg transition-colors text-left group border",
                              isSelected
                                ? "bg-accent border-primary/40"
                                : "border-transparent hover:bg-muted hover:border-border"
                            )}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Icon name="scale" className="h-4 w-4 text-amber-500 flex-shrink-0" />
                              <span className="text-sm font-medium truncate text-foreground">{suggestion.text}</span>
                            </div>
                            <Icon name="arrow-right" className={cn(
                              "h-4 w-4 text-muted-foreground transition-all flex-shrink-0",
                              isSelected ? "opacity-100 text-primary" : "opacity-0 group-hover:opacity-100 group-hover:text-primary"
                            )} />
                          </button>
                        )
                      })}
                  </>
                )}

                {/* AI 질문 추천 */}
                {suggestions.filter(s => s.type === 'ai').length > 0 && (
                  <>
                    {suggestions.filter(s => s.type === 'law').length > 0 && (
                      <div className="border-t border-border my-2" />
                    )}
                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground font-semibold sticky top-0 bg-background z-10">
                      <Icon name="sparkles" className="h-3.5 w-3.5 text-primary" />
                      <span>AI 질문</span>
                    </div>
                    {suggestions
                      .filter(s => s.type === 'ai')
                      .map((suggestion, index) => {
                        const lawCount = suggestions.filter(s => s.type === 'law').length
                        const globalIndex = lawCount + index
                        const isSelected = selectedIndex === globalIndex

                        return (
                          <button
                            key={`ai-${index}`}
                            onClick={() => handleSearch(suggestion.text)}
                            className={cn(
                              "w-full flex items-center justify-between p-3 rounded-lg transition-colors text-left group border",
                              isSelected
                                ? "bg-primary/10 dark:bg-primary/10 border-primary/40"
                                : "border-transparent hover:bg-primary/5 dark:hover:bg-primary/5 hover:border-primary/20"
                            )}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Icon name="brain" className="h-4 w-4 text-primary flex-shrink-0" />
                              <span className="text-sm font-medium truncate text-primary dark:text-primary">{suggestion.text}</span>
                            </div>
                            <Icon name="arrow-right" className={cn(
                              "h-4 w-4 transition-all flex-shrink-0",
                              isSelected ? "opacity-100 text-primary" : "opacity-0 group-hover:opacity-100 text-muted-foreground group-hover:text-primary"
                            )} />
                          </button>
                        )
                      })}
                  </>
                )}
              </div>
            </div>
          )}

          {/* 최근 검색 - 독립 스크롤 영역 (5개만 표시) */}
          {recentSearches.length > 0 && (
            <div className="max-h-[200px] overflow-y-auto border-b border-border">
              <div className="p-2">
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground font-semibold sticky top-0 bg-background z-10">
                  <Icon name="clock" className="h-3.5 w-3.5" />
                  <span>최근 검색</span>
                </div>
                {recentSearches.slice(0, 5).map((query, idx) => {
                  const globalIndex = suggestions.length + idx
                  const isSelected = selectedIndex === globalIndex

                  return (
                    <button
                      key={idx}
                      onClick={() => handleRecentClick(query)}
                      className={cn(
                        "w-full flex items-center justify-between p-3 rounded-lg transition-colors text-left group border",
                        isSelected
                          ? "bg-accent border-primary/40"
                          : "border-transparent hover:bg-muted hover:border-border"
                      )}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Icon name="clock" className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm truncate text-foreground">{query}</span>
                      </div>
                      <Icon name="arrow-right" className={cn(
                        "h-4 w-4 text-muted-foreground transition-all flex-shrink-0",
                        isSelected ? "opacity-100 text-primary" : "opacity-0 group-hover:opacity-100 group-hover:text-primary"
                      )} />
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 즐겨찾기 - 독립 스크롤 영역 */}
          {favorites.length > 0 && (
            <div className="max-h-[200px] overflow-y-auto">
              <div className="p-2">
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground font-semibold sticky top-0 bg-background z-10">
                  <Icon name="star" className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
                  <span>즐겨찾기</span>
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {favorites.length}
                  </Badge>
                </div>
                {favorites.slice(0, 5).map((fav, idx) => {
                  const globalIndex = suggestions.length + recentSearches.slice(0, 5).length + idx
                  const isSelected = selectedIndex === globalIndex

                  return (
                    <button
                      key={`${fav.lawTitle}-${fav.jo}`}
                      onClick={() => handleFavoriteClick(fav)}
                      className={cn(
                        "w-full flex items-center justify-between p-3 rounded-lg transition-colors text-left group border",
                        isSelected
                          ? "bg-accent border-primary/40"
                          : "border-transparent hover:bg-muted hover:border-border"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate text-foreground">{fav.lawTitle}</div>
                        <div className="text-xs text-muted-foreground">{formatJO(fav.jo)}</div>
                      </div>
                      <Icon name="arrow-right" className={cn(
                        "h-4 w-4 text-muted-foreground transition-all flex-shrink-0 ml-2",
                        isSelected ? "opacity-100 text-primary" : "opacity-0 group-hover:opacity-100 group-hover:text-primary"
                      )} />
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 안내 메시지 */}
          {!searchQuery.trim() && recentSearches.length === 0 && favorites.length === 0 && (
            <div className="text-center py-12 px-4">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                <Icon name="search" className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-sm text-foreground font-medium">법령명을 입력하여 검색하세요</p>
              <p className="text-xs mt-1 text-muted-foreground">예: 민법, 형법 제38조</p>
            </div>
          )}
        </div>

        {/* 하단 힌트 */}
        <div className="border-t border-border px-4 py-3 bg-muted/30">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-foreground font-mono text-[10px]">Enter</kbd>
              검색
            </span>
            <span className="text-muted-foreground flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-foreground font-mono text-[10px]">ESC</kbd>
              닫기
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
