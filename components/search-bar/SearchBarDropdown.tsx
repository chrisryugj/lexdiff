"use client"

import { forwardRef } from "react"
import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"
import type { Suggestion } from "./types"

interface SearchBarDropdownProps {
  suggestions: Suggestion[]
  displayedRecentSearches: string[]
  selectedIndex: number
  isLoadingSuggestions: boolean
  query: string
  onSuggestionClick: (text: string) => void
}

export const SearchBarDropdown = forwardRef<HTMLDivElement, SearchBarDropdownProps>(
  function SearchBarDropdown(
    { suggestions, displayedRecentSearches, selectedIndex, isLoadingSuggestions, query, onSuggestionClick },
    ref
  ) {
    const lawSuggestions = suggestions.filter(s => s.type === 'law')
    const precedentSuggestions = suggestions.filter(s => ['precedent', 'interpretation', 'ruling'].includes(s.type))
    const aiSuggestions = suggestions.filter(s => s.type === 'ai')

    return (
      <div
        ref={ref}
        className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-xl z-[100] overflow-hidden pointer-events-auto"
      >
        {/* 로딩 표시 */}
        {isLoadingSuggestions && query.trim() && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground border-b border-border">
            <Icon name="loader" className="h-3 w-3 animate-spin" />
            <span>검색 중...</span>
          </div>
        )}

        {/* 실시간 추천 */}
        {suggestions.length > 0 && (
          <div className="max-h-[200px] overflow-y-auto border-b border-border">
            <div className="p-1.5">
              {/* 법령 추천 */}
              {lawSuggestions.length > 0 && (
                <>
                  <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground font-medium sticky top-0 bg-background z-10">
                    <Icon name="scale" className="h-3 w-3 text-amber-500" />
                    <span>법령</span>
                  </div>
                  {lawSuggestions.map((suggestion, index) => (
                    <button
                      key={`law-${index}`}
                      type="button"
                      onClick={() => onSuggestionClick(suggestion.text)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-md transition-colors text-sm flex items-center gap-2",
                        selectedIndex === index ? "bg-accent" : "hover:bg-secondary"
                      )}
                    >
                      <Icon name="scale" className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                      <span className="truncate">{suggestion.text}</span>
                    </button>
                  ))}
                </>
              )}

              {/* 판례/해석례/재결례 추천 */}
              {precedentSuggestions.length > 0 && (
                <>
                  {lawSuggestions.length > 0 && <div className="border-t border-border my-1.5" />}
                  <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground font-medium sticky top-0 bg-background z-10">
                    <Icon name="gavel" className="h-3 w-3 text-blue-600" />
                    <span>판례/해석례/재결례</span>
                  </div>
                  {precedentSuggestions.map((suggestion, index) => {
                    const globalIndex = lawSuggestions.length + index
                    const iconName = suggestion.type === 'precedent' ? 'gavel' : suggestion.type === 'interpretation' ? 'file-text' : 'shield'
                    const iconColor = suggestion.type === 'precedent' ? 'text-blue-600' : suggestion.type === 'interpretation' ? 'text-green-600' : 'text-indigo-600'

                    return (
                      <button
                        key={`${suggestion.type}-${index}`}
                        type="button"
                        onClick={() => onSuggestionClick(suggestion.text)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-md transition-colors text-sm flex items-center gap-2",
                          selectedIndex === globalIndex ? "bg-accent" : "hover:bg-secondary"
                        )}
                      >
                        <Icon name={iconName} className={cn("h-3.5 w-3.5 flex-shrink-0", iconColor)} />
                        <span className="truncate">{suggestion.text}</span>
                        <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">{suggestion.category}</span>
                      </button>
                    )
                  })}
                </>
              )}

              {/* AI 질문 추천 */}
              {aiSuggestions.length > 0 && (
                <>
                  {(lawSuggestions.length > 0 || precedentSuggestions.length > 0) && (
                    <div className="border-t border-border my-1.5" />
                  )}
                  <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground font-medium sticky top-0 bg-background z-10">
                    <Icon name="sparkles" className="h-3 w-3 text-primary" />
                    <span>AI 질문</span>
                  </div>
                  {aiSuggestions.map((suggestion, index) => {
                    const globalIndex = lawSuggestions.length + precedentSuggestions.length + index

                    return (
                      <button
                        key={`ai-${index}`}
                        type="button"
                        onClick={() => onSuggestionClick(suggestion.text)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-md transition-colors text-sm flex items-center gap-2 group",
                          selectedIndex === globalIndex ? "bg-primary/10 dark:bg-primary/10" : "hover:bg-primary/5 dark:hover:bg-primary/5"
                        )}
                      >
                        <Icon name="brain" className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                        <span className="truncate text-primary dark:text-primary">{suggestion.text}</span>
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          </div>
        )}

        {/* 최근 검색 */}
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
                    onClick={() => onSuggestionClick(search)}
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
    )
  }
)
