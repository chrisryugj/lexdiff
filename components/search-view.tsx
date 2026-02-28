/**
 * search-view.tsx
 *
 * 메인 화면 컴포넌트 (page.tsx에서 복사)
 * - 로고 + 검색창 + 즐겨찾기
 * - 기존 page.tsx의 !lawData일 때 UI 그대로 복사
 */

"use client"

import { Header } from "@/components/header"
import { SearchBar } from "@/components/search-bar"
import { FavoritesPanel } from "@/components/favorites-panel"
import { FavoritesDialog } from "@/components/favorites-dialog"
import { ErrorReportDialog } from "@/components/error-report-dialog"
import { useState } from "react"
import type { Favorite } from "@/lib/law-types"

export interface SearchViewProps {
  onSearch: (query: { lawName: string; article?: string; jo?: string }) => Promise<void>
  onFavoriteSelect: (favorite: Favorite) => void
  isSearching: boolean
  ragLoading: boolean
  searchMode: 'basic' | 'rag'
}

export function SearchView({
  onSearch,
  onFavoriteSelect,
  isSearching,
  ragLoading,
  searchMode,
}: SearchViewProps) {
  const [favoritesDialogOpen, setFavoritesDialogOpen] = useState(false)

  // 검색 중인지 확인 (기본 검색 또는 RAG 검색)
  const isLoading = isSearching || ragLoading

  const handleReset = () => {
    // 이미 홈 화면이므로 아무것도 하지 않음
  }

  const handleFavoritesClick = () => {
    setFavoritesDialogOpen(true)
  }

  const handleSettingsClick = () => {
    window.location.href = '/admin/settings'
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header onReset={handleReset} onFavoritesClick={handleFavoritesClick} onSettingsClick={handleSettingsClick} />
      <main className="flex-1">
        <div className="container mx-auto p-6">
          <div className="flex flex-col items-center justify-center py-12 gap-8">
            <div className="w-full max-w-3xl text-center">
              <h2
                className="text-5xl font-bold text-foreground mb-4"
                style={{ fontFamily: "'Noto Serif KR', serif" }}
              >
                LexDiff
              </h2>
              <p className="text-sm text-muted-foreground font-medium mb-2 tracking-wide">AI 법률 검색 플랫폼</p>
              <p className="text-muted-foreground max-w-2xl mb-8 mx-auto">
                법령 검색부터 AI 분석까지, 대한민국 법률 정보를 가장 쉽고 빠르게
              </p>
            </div>

            {/* 통합 검색창 (모드 자동 전환) */}
            <SearchBar
              onSearch={onSearch}
              isLoading={isLoading}
              searchMode={searchMode}
            />

            {searchMode === 'basic' && (
              <div className="w-full max-w-3xl space-y-4">
                <FavoritesPanel onSelect={onFavoriteSelect} />
              </div>
            )}

            {/* AI 답변이 없고, RAG 검색 패널만 표시 */}
          </div>
        </div>
      </main>
      <footer className="border-t border-border py-6">
        <div className="container mx-auto px-6">
          <p className="text-center text-xs text-muted-foreground/40">© 2025–2026 Chris ryu. All rights reserved.</p>
        </div>
      </footer>

      <FavoritesDialog
        isOpen={favoritesDialogOpen}
        onClose={() => setFavoritesDialogOpen(false)}
        onSelect={onFavoriteSelect}
      />
      <ErrorReportDialog />
    </div>
  )
}
