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
import { ApiKeyInput } from "@/components/settings/api-key-input"
import { useApiKey } from "@/hooks/use-api-key"
import type { SearchBarProps } from "./types"

// Re-export types
export type { SearchBarProps, SearchQuery, Suggestion } from "./types"

export function SearchBar({ onSearch, isLoading, searchMode = 'basic' }: SearchBarProps) {
  const { state, actions, isAiMode } = useSearchBarState(searchMode)
  const { apiKey, saveKey, clearKey } = useApiKey()
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
      <form onSubmit={handleSubmit} className="w-full max-w-3xl relative" style={{ fontFamily: "Pretendard, sans-serif" }}>
        <div className="flex gap-2">
          {/* AI 모드 전환 버튼 */}
          <Button
            type="button"
            variant={forceAiMode ? "default" : "outline"}
            size="icon"
            onClick={() => actions.setForceAiMode(!forceAiMode)}
            className={cn(
              "h-12 w-12 transition-all duration-300",
              forceAiMode && "bg-gradient-to-br from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600"
            )}
            title={forceAiMode ? "기본 검색으로 전환" : "AI 검색으로 전환"}
          >
            <Icon name="brain" className={cn("h-5 w-5", forceAiMode && "animate-pulse")} />
          </Button>

          <div className="relative flex-1">
            {/* 검색 타입 아이콘 */}
            {isAiMode ? (
              <Icon name="brain" className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-purple-500 animate-pulse z-10 pointer-events-none" />
            ) : searchType === "ordinance" ? (
              <Icon name="building-2" className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-500 z-10 pointer-events-none" />
            ) : searchType === "law" ? (
              <Icon name="scale" className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-amber-500 z-10 pointer-events-none" />
            ) : (
              <Icon name="search" className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground z-10 pointer-events-none" />
            )}

            <div className="relative">
              <style>{`
                @keyframes border-beam-ai {
                  0% { background-position: 0% 50%; }
                  100% { background-position: 200% 50%; }
                }
                @keyframes border-beam-normal {
                  0% { background-position: 0% 50%; }
                  100% { background-position: 200% 50%; }
                }
                .input-beam-wrapper-ai {
                  position: relative;
                  padding: 2px;
                  border-radius: 0.5rem;
                  background: linear-gradient(90deg, transparent 0%, transparent 30%, #a78bfa 45%, #ec4899 55%, transparent 70%, transparent 100%);
                  background-size: 200% 100%;
                  animation: border-beam-ai 3s linear infinite;
                }
                .input-beam-wrapper-normal {
                  position: relative;
                  padding: 2px;
                  border-radius: 0.5rem;
                  background: linear-gradient(90deg, transparent 0%, transparent 30%, #3b82f6 45%, #06b6d4 55%, transparent 70%, transparent 100%);
                  background-size: 200% 100%;
                  animation: border-beam-normal 4s linear infinite;
                }
              `}</style>
              <div className={showDropdown ? (isAiMode ? "input-beam-wrapper-ai" : "input-beam-wrapper-normal") : "p-[2px]"}>
                <div className={showDropdown ? "rounded-md bg-background" : ""}>
                  <Input
                    ref={inputRef}
                    type="text"
                    placeholder={isAiMode ? '🤖 AI에게 질문하세요... 예: "수출통관 절차는?", "청년 창업 지원은?"' : '법령명 또는 조문 검색... 예: "관세법 38조", "민법 제1조"'}
                    value={query}
                    onChange={(e) => {
                      actions.setQuery(e.target.value)
                      actions.setSelectedIndex(-1)
                    }}
                    onFocus={() => actions.setShowDropdown(true)}
                    onKeyDown={handleKeyDown}
                    className={cn(
                      "pl-11 h-12 text-base relative",
                      showDropdown ? "bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none" : "rounded-md"
                    )}
                    disabled={isLoading}
                    autoComplete="off"
                  />
                </div>
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
              "h-12 px-6 sm:px-8 transition-all duration-300",
              isAiMode && ["bg-purple-700", "hover:bg-purple-600", "border-purple-500/50", "dark:bg-purple-600/80"]
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

          {/* BYO-Key 입력 */}
          <ApiKeyInput apiKey={apiKey} onSave={saveKey} onClear={clearKey} />
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
