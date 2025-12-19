"use client"

import { useState, useEffect } from "react"
import { Icon } from "@/components/ui/icon"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { debugLogger } from "@/lib/debug-logger"

interface RecentSearch {
  id: string
  query: string
  lawName: string
  article?: string
  timestamp: string
}

const STORAGE_KEY = "law-comparison-recent-searches"
const MAX_RECENT = 5

export function RecentSearches({
  onSelect,
}: {
  onSelect: (search: RecentSearch) => void
}) {
  const [searches, setSearches] = useState<RecentSearch[]>([])

  useEffect(() => {
    loadSearches()
  }, [])

  const loadSearches = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setSearches(JSON.parse(stored))
      }
    } catch (error) {
      debugLogger.error("최근 검색 로드 실패", error)
    }
  }

  const addSearch = (lawName: string, article?: string) => {
    const query = article ? `${lawName} ${article}` : lawName
    const newSearch: RecentSearch = {
      id: `${Date.now()}-${Math.random()}`,
      query,
      lawName,
      article,
      timestamp: new Date().toISOString(),
    }

    const updated = [newSearch, ...searches.filter((s) => s.query !== query)].slice(0, MAX_RECENT)
    setSearches(updated)

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      debugLogger.info("최근 검색 추가", { query })
    } catch (error) {
      debugLogger.error("최근 검색 저장 실패", error)
    }
  }

  const removeSearch = (id: string) => {
    const updated = searches.filter((s) => s.id !== id)
    setSearches(updated)

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    } catch (error) {
      debugLogger.error("최근 검색 삭제 실패", error)
    }
  }

  const clearAll = () => {
    setSearches([])
    try {
      localStorage.removeItem(STORAGE_KEY)
      debugLogger.info("최근 검색 전체 삭제")
    } catch (error) {
      debugLogger.error("최근 검색 삭제 실패", error)
    }
  }

  // Expose addSearch method
  useEffect(() => {
    ;(window as any).__addRecentSearch = addSearch
  }, [searches])

  if (searches.length === 0) {
    return null
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon name="clock" className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">최근 검색</h3>
          <Badge variant="secondary" className="text-xs">
            {searches.length}
          </Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={clearAll} className="h-7 text-xs">
          전체 삭제
        </Button>
      </div>
      <div className="space-y-1">
        {searches.map((search) => (
          <div
            key={search.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/50 p-2 hover:bg-card transition-colors"
          >
            <button
              onClick={() => onSelect(search)}
              className="flex-1 text-left text-sm text-foreground hover:text-primary"
            >
              <span className="font-medium">{search.lawName}</span>
              {search.article && <span className="ml-2 text-muted-foreground">{search.article}</span>}
            </button>
            <Button variant="ghost" size="sm" onClick={() => removeSearch(search.id)} className="h-6 w-6 p-0">
              <Icon name="x" className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </Card>
  )
}
