"use client"

import type React from "react"
import { useRef, useEffect, useState, useCallback } from "react"
import { Icon } from "@/components/ui/icon"
import { Textarea } from "@/components/ui/textarea"
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
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

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

  // 입력 내용에 맞춰 textarea 높이 자동 조절 (긴 질의도 짤리지 않고 다 보이게)
  const adjustHeight = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [query, adjustHeight])

  // Enter=검색 실행, Shift+Enter=줄바꿈 (한글 IME 조합 중·드롭다운 선택 중에는 기본 핸들러로)
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && selectedIndex < 0) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent)
      return
    }
    handleKeyDown(e)
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="w-full relative shadow-2xl">
        <div data-tour="search-input" className="flex bg-white dark:bg-[#1f2937] border border-gray-300 dark:border-gray-700">
          <Button
            type="button"
            variant="ghost"
            data-tour="ai-toggle"
            onClick={() => actions.setForceAiMode(!forceAiMode)}
            className={cn(
              "h-16 w-16 self-start !rounded-none border-r border-gray-300 dark:border-gray-700 transition-colors hidden sm:flex",
              forceAiMode ? "bg-brand-navy text-white hover:bg-brand-navy/90 dark:text-background" : "text-gray-500 hover:text-brand-navy hover:bg-gray-100 dark:hover:bg-gray-800"
            )}
            title={forceAiMode ? "일반 검색으로 전환" : "AI 모드로 전환"}
          >
            <Icon name="brain" className="h-6 w-6" />
          </Button>

          <div className="relative flex-1">
            <div className="absolute left-4 top-0 z-10 flex h-16 items-center pointer-events-none">
              {isAiMode ? (
                 <Icon name="brain" className="h-6 w-6 text-brand-navy" />
              ) : searchType === "ordinance" ? (
                 <Icon name="building-2" className="h-6 w-6 text-brand-navy" />
              ) : searchType === "law" ? (
                 <Icon name="scale" className="h-6 w-6 text-brand-navy" />
              ) : (
                 <Icon name="search" className="h-6 w-6 text-gray-400" />
              )}
            </div>

            <Textarea
              ref={inputRef}
              rows={1}
              aria-label={isAiMode ? "AI 법률 자문 검색" : "법령명, 조문번호 검색"}
              placeholder={isAiMode
                ? (isMobile ? 'AI 법률 자문' : 'AI 법률 자문 (예: "수출통관 절차는?", "청년 창업 지원제도는?")')
                : (isMobile ? '법령·조문 검색' : '법령명, 조문번호 검색 (예: "관세법 38조", "근로기준법")')
              }
              value={query}
              onChange={(e) => {
                actions.setQuery(e.target.value)
                actions.setSelectedIndex(-1)
              }}
              onFocus={() => {
                // UX-2: 드롭다운 열 때 이전 선택 초기화
                actions.setShowDropdown(true)
                actions.setSelectedIndex(-1)
              }}
              onKeyDown={handleTextareaKeyDown}
              className={cn(
                "block min-h-16 max-h-40 resize-none overflow-y-auto py-5 pl-14 pr-3 text-[0.9rem] sm:text-lg border-0 rounded-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400",
                showDropdown && "bg-gray-50 dark:bg-[#1a222c]"
              )}
              disabled={isLoading}
              autoComplete="off"
            />

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
            aria-label="검색"
            className={cn(
              "h-16 w-16 shrink-0 self-start px-0 sm:w-auto sm:px-8 !rounded-none text-lg font-bold transition-all",
              "bg-brand-navy hover:bg-brand-navy/90 text-white dark:text-background"
            )}
          >
            {isLoading ? (
              <>
                <Icon name="loader" className="h-6 w-6 animate-spin sm:h-5 sm:w-5 sm:mr-2" />
                <span className="hidden sm:inline">검색중...</span>
              </>
            ) : (
              <>
                <Icon name="search" className="h-6 w-6 sm:hidden" />
                <span className="hidden sm:inline tracking-widest">검색</span>
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
