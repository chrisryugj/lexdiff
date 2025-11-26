"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Clock, Star, X, ArrowRight } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { favoritesStore } from "@/lib/favorites-store"
import type { Favorite } from "@/lib/law-types"

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

      // 최근 검색어 로드 (localStorage)
      const recent = localStorage.getItem('recent-searches')
      if (recent) {
        setRecentSearches(JSON.parse(recent).slice(0, 5))
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

    // 최근 검색어 저장
    const updated = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5)
    setRecentSearches(updated)
    localStorage.setItem('recent-searches', JSON.stringify(updated))

    onSearch({ lawName: query })
    onClose()
    setSearchQuery("")
  }

  const handleFavoriteClick = (fav: Favorite) => {
    onSearch({ lawName: fav.lawTitle, jo: fav.jo })
    onClose()
  }

  const handleRecentClick = (query: string) => {
    handleSearch(query)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden" showCloseButton={true}>
        {/* 검색 입력 영역 */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
          <Search className="h-5 w-5 text-muted-foreground flex-shrink-0" />
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
            className="flex-1 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-base"
          />
        </div>

        {/* 검색 제안 영역 */}
        <ScrollArea className="max-h-[400px]">
          <div className="p-4 space-y-6">
            {/* 최근 검색 */}
            {recentSearches.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-muted-foreground">최근 검색</h3>
                </div>
                <div className="space-y-1">
                  {recentSearches.map((query, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleRecentClick(query)}
                      className="w-full flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors text-left group"
                    >
                      <span className="text-sm">{query}</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 즐겨찾기 */}
            {favorites.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
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
                      className="w-full flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors text-left group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{fav.lawTitle}</div>
                        <div className="text-xs text-muted-foreground">{fav.joLabel}</div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 안내 메시지 */}
            {recentSearches.length === 0 && favorites.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">법령명을 입력하여 검색하세요</p>
                <p className="text-xs mt-1">예: 민법, 형법 제38조</p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* 하단 힌트 */}
        <div className="border-t border-border px-4 py-2 bg-muted/30">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Enter로 검색</span>
            <span>ESC로 닫기</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
