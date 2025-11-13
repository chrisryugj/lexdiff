"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Search, Loader2, Clock, Scale, Building2, Sparkles } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { parseSearchQuery } from "@/lib/law-parser"
import { debugLogger } from "@/lib/debug-logger"
import { cn } from "@/lib/utils"

interface SearchBarProps {
  onSearch: (query: { lawName: string; article?: string; jo?: string }) => void
  isLoading?: boolean
  searchMode?: 'basic' | 'rag'
}

const MAX_RECENT = 5

export function SearchBar({ onSearch, isLoading, searchMode = 'basic' }: SearchBarProps) {
  const [query, setQuery] = useState("")
  const [showRecent, setShowRecent] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [searchType, setSearchType] = useState<"law" | "ordinance" | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!query.trim()) {
      setSearchType(null)
      return
    }

    // 법령 키워드가 있으면 무조건 법령으로 처리
    const hasLawKeyword = /법$|령$|법률|시행령|시행규칙/.test(query)
    // 조례/규칙 키워드가 명시적으로 있는지 확인 (시행령/시행규칙은 제외)
    const hasOrdinanceKeyword = /조례|자치법규/.test(query) || (/규칙/.test(query) && !/시행규칙/.test(query))
    // 조례 키워드가 있고 법령 키워드가 없으면 조례로 판단
    const isOrdinanceQuery = hasOrdinanceKeyword && !hasLawKeyword

    setSearchType(isOrdinanceQuery ? "ordinance" : "law")
    console.log("[v0] 검색어 타입 감지:", { query, hasLawKeyword, hasOrdinanceKeyword, type: isOrdinanceQuery ? "조례" : "법령" })
  }, [query])

  useEffect(() => {
    const stored = localStorage.getItem("recentSearches")
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setRecentSearches(parsed.slice(0, MAX_RECENT))
      } catch (error) {
        console.error("[v0] Failed to parse recent searches:", error)
      }
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowRecent(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const saveRecentSearch = (searchQuery: string) => {
    const stored = localStorage.getItem("recentSearches")
    let searches: string[] = []

    if (stored) {
      try {
        searches = JSON.parse(stored)
      } catch (error) {
        console.error("[v0] Failed to parse recent searches:", error)
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

    try {
      const parsed = parseSearchQuery(query)
      debugLogger.info("통합 검색 실행", parsed)

      saveRecentSearch(query.trim())
      onSearch(parsed)
      setShowRecent(false)
    } catch (error) {
      debugLogger.error("검색어 파싱 실패", error)
    }
  }

  const handleRecentClick = (search: string) => {
    setQuery(search)
    setShowRecent(false)
    try {
      const parsed = parseSearchQuery(search)
      onSearch(parsed)
    } catch (error) {
      debugLogger.error("최근 검색 실행 실패", error)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-3xl relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          {searchMode === 'rag' ? (
            <Sparkles className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-purple-500 animate-pulse" />
          ) : searchType === "ordinance" ? (
            <Building2 className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-500" />
          ) : searchType === "law" ? (
            <Scale className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-amber-500" />
          ) : (
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          )}
          <Input
            ref={inputRef}
            type="text"
            placeholder={searchMode === 'rag' ? '✨ AI가 답변을 생성하고 있습니다...' : '예: "민법 제1조", "관세법", "서울특별시 청소년 조례"'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setShowRecent(true)}
            className={cn(
              "pl-11 h-12 text-base transition-all duration-300",
              searchMode === 'rag' && "ring-2 ring-purple-500/50 border-purple-300 shadow-lg shadow-purple-500/20"
            )}
            disabled={isLoading}
          />

          {showRecent && recentSearches.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto"
            >
              <div className="p-2">
                <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>최근 검색</span>
                </div>
                {recentSearches.map((search, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleRecentClick(search)}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-secondary transition-colors text-sm"
                  >
                    {search}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <Button type="submit" size="lg" disabled={isLoading || !query.trim()} className="h-12 px-6 sm:px-8">
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span className="hidden sm:inline">검색 중</span>
              <span className="sm:hidden">검색</span>
            </>
          ) : (
            "검색"
          )}
        </Button>
      </div>
      {searchMode === 'rag' ? (
        <div className="mt-2 text-xs flex items-center gap-1.5">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-300/30 rounded-full">
            <Sparkles className="h-3.5 w-3.5 text-purple-600 animate-pulse" />
            <span className="font-medium text-purple-700">AI 법령 검색 활성화</span>
          </div>
        </div>
      ) : query.trim() && searchType && (
        <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
          {searchType === "ordinance" ? (
            <>
              <Building2 className="h-3.5 w-3.5 text-blue-500" />
              <span>조례/규칙 검색</span>
            </>
          ) : (
            <>
              <Scale className="h-3.5 w-3.5 text-amber-500" />
              <span>법령 검색</span>
            </>
          )}
        </div>
      )}
    </form>
  )
}
