"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
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

interface CommandSearchModalProps {
  isOpen: boolean
  onClose: () => void
  onSearch: (query: { lawName: string; article?: string; jo?: string }) => void
  isAiMode?: boolean // AI 모드 여부
}

export function CommandSearchModal({ isOpen, onClose, onSearch, isAiMode = false }: CommandSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // 즐겨찾기 로드
  useEffect(() => {
    if (isOpen) {
      setFavorites(favoritesStore.getFavorites())

      // 최근 검색어 로드 (localStorage) - search-bar.tsx와 동일한 키 사용
      const recent = localStorage.getItem('recentSearches')
      if (recent) {
        try {
          setRecentSearches(JSON.parse(recent).slice(0, 5))
        } catch (error) {
          console.error('Failed to parse recent searches:', error)
        }
      }

      // 입력창 포커스
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  const handleSearch = (query: string) => {
    if (!query.trim()) return

    // 최근 검색어 저장 - search-bar.tsx와 동일한 키 사용
    const updated = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5)
    setRecentSearches(updated)
    localStorage.setItem('recentSearches', JSON.stringify(updated))

    // parseSearchQuery로 파싱하여 조문 번호 추출
    try {
      const parsed = parseSearchQuery(query)
      debugLogger.info('CommandSearchModal 검색 파싱', { query, parsed })
      onSearch(parsed)
    } catch (error) {
      debugLogger.error('검색 파싱 실패', error)
      onSearch({ lawName: query })
    }
    onClose()
    setSearchQuery("")
  }

  const handleFavoriteClick = (fav: Favorite) => {
    onSearch({ lawName: fav.lawTitle, jo: fav.jo })
    onClose()
  }

  const handleRecentClick = (query: string) => {
    // ✅ 검색 실행 대신 검색창에 자동완성만
    setSearchQuery(query)
    inputRef.current?.focus()
    debugLogger.info('CommandSearchModal 최근 검색 자동완성', { query })
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-2xl p-0 gap-0 overflow-hidden bg-background border-border shadow-2xl sm:rounded-xl"
        showCloseButton={true}
      >
        {/* 접근성을 위한 숨겨진 타이틀 */}
        <VisuallyHidden.Root>
          <DialogTitle>법령 검색</DialogTitle>
        </VisuallyHidden.Root>

        {/* 검색 입력 영역 - 강조된 스타일 */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
            <Icon name="search" className="h-5 w-5 text-primary" />
          </div>
          <Input
            ref={inputRef}
            type="text"
            placeholder="법령명 또는 조문 검색... (예: 민법, 형법 제38조)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearch(searchQuery)
              }
            }}
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base text-foreground placeholder:text-muted-foreground shadow-none"
          />
        </div>

        {/* 검색 제안 영역 */}
        <ScrollArea className="max-h-[400px] bg-background">
          <div className="p-4 space-y-6">
            {/* 최근 검색 */}
            {recentSearches.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="clock" className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-muted-foreground">최근 검색</h3>
                </div>
                <div className="space-y-1">
                  {recentSearches.map((query, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleRecentClick(query)}
                      className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors text-left group border border-transparent hover:border-border"
                    >
                      <span className="text-sm text-foreground">{query}</span>
                      <Icon name="arrow-right" className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:text-primary transition-all" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 즐겨찾기 */}
            {favorites.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="star" className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                  <h3 className="text-sm font-semibold text-muted-foreground">즐겨찾기</h3>
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {favorites.length}
                  </Badge>
                </div>
                <div className="space-y-1">
                  {favorites.slice(0, 5).map((fav) => (
                    <button
                      key={`${fav.lawTitle}-${fav.jo}`}
                      onClick={() => handleFavoriteClick(fav)}
                      className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors text-left group border border-transparent hover:border-border"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate text-foreground">{fav.lawTitle}</div>
                        <div className="text-xs text-muted-foreground">{formatJO(fav.jo)}</div>
                      </div>
                      <Icon name="arrow-right" className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:text-primary transition-all flex-shrink-0 ml-2" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 안내 메시지 */}
            {recentSearches.length === 0 && favorites.length === 0 && (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                  <Icon name="search" className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-sm text-foreground font-medium">법령명을 입력하여 검색하세요</p>
                <p className="text-xs mt-1 text-muted-foreground">예: 민법, 형법 제38조</p>
              </div>
            )}
          </div>
        </ScrollArea>

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
