"use client"

import type React from "react"
import { useRef, useEffect } from "react"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useSearchBarState } from "./hooks/useSearchBarState"
import { useSearchBarHandlers } from "./hooks/useSearchBarHandlers"
import { SearchBarDropdown } from "./SearchBarDropdown"
import { SearchBarChoiceDialog } from "./SearchBarChoiceDialog"
import type { SearchBarProps } from "./types"

// Re-export types
export type { SearchBarProps, SearchQuery, Suggestion } from "./types"

export function SearchBar({ onSearch, isLoading, searchMode = 'basic' }: SearchBarProps) {
  const { state, actions, isAiMode } = useSearchBarState(searchMode)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const {
    handleSubmit,
    handleSearchChoice,
    handleSuggestionClick,
    handleKeyDown,
    displayedRecentSearches
  } = useSearchBarHandlers({
    state,
    actions,
    isAiMode,
    onSearch
  })

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        actions.setShowDropdown(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [actions])

  const { query, showDropdown, suggestions, isLoadingSuggestions, searchType, forceAiMode, showChoiceDialog, pendingQuery, selectedIndex } = state
  const hasDropdownItems = suggestions.length > 0 || displayedRecentSearches.length > 0

  return (
    <>
      <form onSubmit={handleSubmit} className="w-full relative">
        <div className="flex gap-2">
          {/* AI 모드 전환 버튼 - PC만 표시 */}
          <Button
            type="button"
            variant={forceAiMode ? "default" : "outline"}
            size="icon"
            onClick={() => actions.setForceAiMode(!forceAiMode)}
            className={cn(
              "h-12 w-12 transition-all duration-300 hidden sm:flex",
              forceAiMode && "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
            title={forceAiMode ? "기본 검색으로 전환" : "AI 검색으로 전환"}
          >
            <Icon name="brain" className="h-5 w-5" />
          </Button>

          <div className="relative flex-1">
            {/* 검색 타입 아이콘 */}
            {isAiMode ? (
              <Icon name="brain" className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-primary z-10 pointer-events-none" />
            ) : searchType === "ordinance" ? (
              <Icon name="building-2" className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-primary z-10 pointer-events-none" />
            ) : searchType === "law" ? (
              <Icon name="scale" className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-primary z-10 pointer-events-none" />
            ) : (
              <Icon name="search" className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground z-10 pointer-events-none" />
            )}

            <div className="relative">
              <div className={cn(
                "transition-all rounded-lg",
                showDropdown && "ring-2 ring-primary/30"
              )}>
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder={isAiMode ? 'AI에게 질문하세요... 예: "수출통관 절차는?", "청년 창업 지원은?"' : '법령명 또는 조문 검색... 예: "관세법 38조", "민법 제1조"'}
                  value={query}
                  onChange={(e) => {
                    actions.setQuery(e.target.value)
                    actions.setSelectedIndex(-1)
                  }}
                  onFocus={() => actions.setShowDropdown(true)}
                  onKeyDown={handleKeyDown}
                  className={cn(
                    "pl-11 h-12 text-base",
                    showDropdown && "border-transparent focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
                  )}
                  disabled={isLoading}
                  autoComplete="off"
                />
              </div>
            </div>

            {/* 자동완성 드롭다운 */}
            {showDropdown && hasDropdownItems && (
              <SearchBarDropdown
                ref={dropdownRef}
                suggestions={suggestions}
                displayedRecentSearches={displayedRecentSearches}
                selectedIndex={selectedIndex}
                isLoadingSuggestions={isLoadingSuggestions}
                query={query}
                onSuggestionClick={handleSuggestionClick}
              />
            )}
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={isLoading || !query.trim()}
            className={cn(
              "h-12 transition-all duration-300",
              "px-3 sm:px-8",
            )}
          >
            {isLoading ? (
              <>
                <Icon name="loader" className="h-4 w-4 animate-spin sm:mr-2" />
                <span className="hidden sm:inline">{isAiMode ? 'AI 검색 중' : '검색 중'}</span>
              </>
            ) : (
              <>
                {isAiMode ? (
                  <Icon name="brain" className="h-4 w-4 sm:mr-2" />
                ) : (
                  <Icon name="search" className="h-4 w-4 sm:mr-2 sm:hidden" />
                )}
                <span className="hidden sm:inline">{isAiMode ? 'AI 검색' : '검색'}</span>
              </>
            )}
          </Button>
        </div>
      </form>

      {/* 검색 모드 선택 다이얼로그 */}
      <SearchBarChoiceDialog
        open={showChoiceDialog}
        onOpenChange={actions.setShowChoiceDialog}
        pendingQuery={pendingQuery}
        onChoice={handleSearchChoice}
      />
    </>
  )
}
