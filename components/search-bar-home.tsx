"use client"

import type React from "react"
import { useRef, useEffect } from "react"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
// 기존 SearchBar 내부 훅과 기능들을 재사용 (홈 페이지 전용 프리미엄 UI)
import { useSearchBarState } from "@/components/search-bar/hooks/useSearchBarState"
import { useSearchBarHandlers } from "@/components/search-bar/hooks/useSearchBarHandlers"
import { SearchBarDropdown } from "@/components/search-bar/SearchBarDropdown"
import { SearchBarChoiceDialog } from "@/components/search-bar/SearchBarChoiceDialog"
import type { SearchBarProps } from "@/components/search-bar/types"

export function SearchBarHome({ onSearch, isLoading, searchMode = 'basic' }: SearchBarProps) {
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
      <form onSubmit={handleSubmit} className="w-full relative shadow-2xl">
        <div className="flex bg-white dark:bg-[#1f2937] border border-gray-300 dark:border-gray-700">
          <Button
            type="button"
            variant="ghost"
            onClick={() => actions.setForceAiMode(!forceAiMode)}
            className={cn(
              "h-16 w-16 !rounded-none border-r border-gray-300 dark:border-gray-700 transition-colors hidden sm:flex",
              forceAiMode ? "bg-[#1a2b4c] text-white hover:bg-[#1a2b4c]/90 dark:bg-[#e2a85d] dark:text-[#0c0e14]" : "text-gray-500 hover:text-[#1a2b4c] dark:hover:text-[#e2a85d] hover:bg-gray-100 dark:hover:bg-gray-800"
            )}
            title={forceAiMode ? "일반 검색으로 전환" : "AI 모드로 전환"}
          >
            <Icon name="brain" className="h-6 w-6" />
          </Button>

          <div className="relative flex-1">
            {isAiMode ? (
               <Icon name="brain" className="absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-[#1a2b4c] dark:text-[#e2a85d] z-10 pointer-events-none" />
            ) : searchType === "ordinance" ? (
               <Icon name="building-2" className="absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-[#1a2b4c] dark:text-[#e2a85d] z-10 pointer-events-none" />
            ) : searchType === "law" ? (
               <Icon name="scale" className="absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-[#1a2b4c] dark:text-[#e2a85d] z-10 pointer-events-none" />
            ) : (
               <Icon name="search" className="absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" />
            )}

            <div className="relative h-full">
              <Input
                ref={inputRef}
                type="text"
                placeholder={isAiMode ? 'AI 법률 자문 (예: "수출통관 절차는?", "청년 창업 지원제도는?")' : '법령명, 조문번호 검색 (예: "관세법 38조", "근로기준법")'}
                value={query}
                onChange={(e) => {
                  actions.setQuery(e.target.value)
                  actions.setSelectedIndex(-1)
                }}
                onFocus={() => actions.setShowDropdown(true)}
                onKeyDown={handleKeyDown}
                className={cn(
                  "h-16 pl-14 pr-4 text-lg border-0 rounded-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent text-gray-900 dark:text-gray-100 placeholder:text-gray-400",
                  showDropdown && "bg-gray-50 dark:bg-[#1a222c]"
                )}
                disabled={isLoading}
                autoComplete="off"
              />
            </div>

            {showDropdown && hasDropdownItems && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-gray-300 dark:border-gray-700 shadow-xl">
                <SearchBarDropdown
                  ref={dropdownRef}
                  suggestions={suggestions}
                  displayedRecentSearches={displayedRecentSearches}
                  selectedIndex={selectedIndex}
                  isLoadingSuggestions={isLoadingSuggestions}
                  query={query}
                  onSuggestionClick={handleSuggestionClick}
                />
              </div>
            )}
          </div>

          <Button
            type="submit"
            disabled={isLoading || !query.trim()}
            className={cn(
              "h-16 px-8 !rounded-none text-lg font-bold transition-all",
              "bg-[#1a2b4c] hover:bg-[#121e36] text-white dark:bg-[#e2a85d] dark:hover:bg-[#d4994f] dark:text-[#0c0e14]"
            )}
          >
            {isLoading ? (
              <>
                <Icon name="loader" className="h-5 w-5 animate-spin mr-2" />
                <span>검색중...</span>
              </>
            ) : (
              <>
                <span className="tracking-widest">검색</span>
              </>
            )}
          </Button>
        </div>
      </form>

      <SearchBarChoiceDialog
        open={showChoiceDialog}
        onOpenChange={actions.setShowChoiceDialog}
        pendingQuery={pendingQuery}
        onChoice={handleSearchChoice}
      />
    </>
  )
}
