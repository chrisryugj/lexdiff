"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Search, Loader2, Clock, Scale, Building2, Sparkles, Bot, Brain, HelpCircle } from "lucide-react"
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

const MAX_RECENT = 5

export function SearchBar({ onSearch, isLoading, searchMode = 'basic' }: SearchBarProps) {
  const [query, setQuery] = useState("")
  const [showRecent, setShowRecent] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [searchType, setSearchType] = useState<"law" | "ordinance" | "ai" | null>(null)
  const [isNaturalQuery, setIsNaturalQuery] = useState(false)
  const [forceAiMode, setForceAiMode] = useState(false)  // NEW: 수동 AI 모드 전환
  const [showChoiceDialog, setShowChoiceDialog] = useState(false)  // 선택 다이얼로그
  const [pendingQuery, setPendingQuery] = useState("")  // 대기중인 쿼리
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 자동 감지 + 수동 전환 병합
  const isAiMode = forceAiMode || (searchMode === 'rag') || (searchType === 'ai')

  useEffect(() => {
    if (!query.trim()) {
      setSearchType(null)
      setIsNaturalQuery(false)
      return
    }

    // 우선순위 1: 자연어 감지를 먼저 수행
    const queryDetection = detectQueryType(query)

    // 우선순위 2: 자연어 패턴이 감지되면 AI 검색 우선
    if (queryDetection.type === 'natural' && queryDetection.confidence >= 0.7) {
      setSearchType("ai")
      setIsNaturalQuery(true)
      console.log("[v0] AI 검색 모드 감지:", { query, confidence: queryDetection.confidence, reason: queryDetection.reason })
      return
    }

    // 우선순위 3: 자연어가 아닌 경우 법령/조례 키워드 확인
    const hasLawKeyword = /법|법률|시행령|시행규칙/.test(query)
    const hasOrdinanceKeyword = /조례|자치법규/.test(query) || (/규칙/.test(query) && !/시행규칙/.test(query))
    const isOrdinanceQuery = hasOrdinanceKeyword && !hasLawKeyword

    if (hasLawKeyword || hasOrdinanceKeyword) {
      setSearchType(isOrdinanceQuery ? "ordinance" : "law")
      setIsNaturalQuery(false)
      console.log("[v0] 법령 검색 모드:", { query, hasLawKeyword, hasOrdinanceKeyword, type: isOrdinanceQuery ? "조례" : "법령" })
      return
    }

    // 기본값: 법령 검색
    setSearchType("law")
    setIsNaturalQuery(false)
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
      // 수동으로 AI 모드를 선택한 경우
      if (forceAiMode) {
        debugLogger.info("AI 검색 실행 (수동 선택)", { query })
        saveRecentSearch(query.trim())
        onSearch({ lawName: query.trim(), article: undefined, jo: undefined })
        setShowRecent(false)
        return
      }

      // 자동 감지로 AI 모드가 확실한 경우
      if (searchType === 'ai' && isNaturalQuery) {
        debugLogger.info("AI 검색 실행 (자동 감지)", { query })
        saveRecentSearch(query.trim())
        onSearch({ lawName: query.trim(), article: undefined, jo: undefined })
        setShowRecent(false)
        return
      }

      // 애매한 경우 판별
      const queryDetection = detectQueryType(query)
      const hasArticleNumber = /제?\s*\d+\s*조(?:의\s*\d+)?/.test(query)

      // 조문번호가 있고 confidence가 애매한 경우 (0.6 ~ 0.9)
      if (hasArticleNumber && queryDetection.confidence >= 0.6 && queryDetection.confidence < 0.95) {
        setPendingQuery(query.trim())
        setShowChoiceDialog(true)
        return
      }

      // 명확한 법령 검색
      const parsed = parseSearchQuery(query)
      debugLogger.info("통합 검색 실행", parsed)

      saveRecentSearch(query.trim())
      onSearch(parsed)
      setShowRecent(false)
    } catch (error) {
      debugLogger.error("검색어 파싱 실패", error)
    }
  }

  // 선택 다이얼로그에서 선택 처리
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

  const handleRecentClick = (search: string) => {
    setQuery(search)
    setShowRecent(false)
    try {
      // 해당 검색어가 AI 모드인지 확인
      const queryDetection = detectQueryType(search)
      if (queryDetection.type === 'natural' && queryDetection.confidence >= 0.7) {
        debugLogger.info("AI 검색 실행 (최근 검색)", { search })
        onSearch({ lawName: search, article: undefined, jo: undefined })
      } else {
        const parsed = parseSearchQuery(search)
        onSearch(parsed)
      }
    } catch (error) {
      debugLogger.error("최근 검색 실행 실패", error)
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="w-full max-w-3xl relative" style={{ fontFamily: "Pretendard, sans-serif" }}>
        <div className="flex gap-2">
        {/* AI 모드 전환 버튼 (NEW) */}
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
          <Brain className={cn("h-5 w-5", forceAiMode && "animate-pulse")} />
        </Button>

        <div className="relative flex-1">
          {isAiMode ? (
            <Brain className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-purple-500 animate-pulse" />
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
            placeholder={isAiMode ? '🤖 AI에게 질문하세요... 예: "수출통관 절차는?", "청년 창업 지원은?"' : '법령명 또는 조문 검색... 예: "관세법 38조", "민법 제1조"'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setShowRecent(true)}
            className={cn(
              "pl-11 h-12 text-base transition-all duration-300",
              isAiMode && [
                "ring-1 ring-purple-500/30 border-purple-500/50",
                "shadow-[0_0_15px_rgba(139,92,246,0.15)]",
                "bg-gradient-to-r from-purple-950/50 to-blue-950/50",
                "text-foreground placeholder:text-muted-foreground"
              ]
            )}
            disabled={isLoading}
          />

          {showRecent && recentSearches.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-md shadow-xl z-[100] max-h-60 overflow-y-auto"
            >
              <div className="p-2">
                <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground" style={{ fontFamily: "Pretendard, sans-serif" }}>
                  <Clock className="h-3 w-3" />
                  <span>최근 검색</span>
                </div>
                {recentSearches.map((search, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleRecentClick(search)}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-secondary transition-colors text-sm"
                    style={{ fontFamily: "Pretendard, sans-serif" }}
                  >
                    {search}
                  </button>
                ))}
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
              "bg-purple-600/80",
              "hover:bg-purple-600",
              "border-purple-500/50"
            ]
          )}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span className="hidden sm:inline">{isAiMode ? 'AI 검색 중' : '검색 중'}</span>
              <span className="sm:hidden">검색</span>
            </>
          ) : (
            <>
              {isAiMode && <Brain className="mr-2 h-4 w-4" />}
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
            <HelpCircle className="h-5 w-5 text-blue-500" />
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
            <Scale className="h-8 w-8 text-amber-500" />
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
            <Brain className="h-8 w-8 text-purple-500" />
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
