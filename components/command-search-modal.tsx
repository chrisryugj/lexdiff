"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Clock, Star, X, ArrowRight } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import * as VisuallyHidden from "@radix-ui/react-visually-hidden"
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
      <DialogContent
        className="max-w-2xl p-0 gap-0 overflow-hidden bg-gray-950 border-2 border-primary/40 shadow-2xl shadow-primary/30 ring-1 ring-white/10"
        showCloseButton={true}
      >
        {/* 접근성을 위한 숨겨진 타이틀 */}
        <VisuallyHidden.Root>
          <DialogTitle>법령 검색</DialogTitle>
        </VisuallyHidden.Root>

        {/* 검색 입력 영역 - 강조된 스타일 */}
        <div className="flex items-center gap-3 px-4 py-4 border-b-2 border-primary/20 bg-gray-800/50">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/20">
            <Search className="h-5 w-5 text-primary" />
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
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base text-white placeholder:text-gray-400"
          />
        </div>

        {/* 검색 제안 영역 */}
        <ScrollArea className="max-h-[400px]">
          <div className="p-4 space-y-6">
            {/* 최근 검색 */}
            {recentSearches.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-400">최근 검색</h3>
                </div>
                <div className="space-y-1">
                  {recentSearches.map((query, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleRecentClick(query)}
                      className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-white/10 transition-colors text-left group border border-transparent hover:border-primary/30"
                    >
                      <span className="text-sm text-gray-200">{query}</span>
                      <ArrowRight className="h-4 w-4 text-gray-500 opacity-0 group-hover:opacity-100 group-hover:text-primary transition-all" />
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
                  <h3 className="text-sm font-semibold text-gray-400">즐겨찾기</h3>
                  <Badge variant="secondary" className="ml-auto text-xs bg-yellow-500/20 text-yellow-300 border-yellow-500/30">
                    {favorites.length}
                  </Badge>
                </div>
                <div className="space-y-1">
                  {favorites.slice(0, 5).map((fav) => (
                    <button
                      key={`${fav.lawTitle}-${fav.jo}`}
                      onClick={() => handleFavoriteClick(fav)}
                      className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-white/10 transition-colors text-left group border border-transparent hover:border-primary/30"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate text-gray-200">{fav.lawTitle}</div>
                        <div className="text-xs text-gray-500">{fav.joLabel}</div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-gray-500 opacity-0 group-hover:opacity-100 group-hover:text-primary transition-all flex-shrink-0 ml-2" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 안내 메시지 */}
            {recentSearches.length === 0 && favorites.length === 0 && (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                  <Search className="h-8 w-8 text-primary/50" />
                </div>
                <p className="text-sm text-gray-300">법령명을 입력하여 검색하세요</p>
                <p className="text-xs mt-1 text-gray-500">예: 민법, 형법 제38조</p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* 하단 힌트 */}
        <div className="border-t-2 border-primary/20 px-4 py-3 bg-gray-800/50">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400 flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 font-mono text-[10px]">Enter</kbd>
              검색
            </span>
            <span className="text-gray-400 flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 font-mono text-[10px]">ESC</kbd>
              닫기
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
