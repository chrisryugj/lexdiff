/**
 * search-view-improved.tsx
 *
 * 개선된 메인 화면 컴포넌트
 * - 히어로 섹션 + 기능 카드 + 통계 섹션
 * - 애니메이션 효과
 * - 전문적인 법률 서비스 디자인
 */

"use client"

import { Header } from "@/components/header"
import { SearchBar } from "@/components/search-bar"
import { FavoritesPanel } from "@/components/favorites-panel"
import { FavoritesDialog } from "@/components/favorites-dialog"
import { ErrorReportDialog } from "@/components/error-report-dialog"
import { FeatureCards } from "@/components/feature-cards"
import { StatsSection } from "@/components/stats-section"
import { useState } from "react"
import type { Favorite } from "@/lib/law-types"

export interface SearchViewProps {
  onSearch: (query: { lawName: string; article?: string; jo?: string }) => Promise<void>
  onFavoriteSelect: (favorite: Favorite) => void
  isSearching: boolean
  ragLoading: boolean
  searchMode: 'basic' | 'rag'
}

export function SearchViewImproved({
  onSearch,
  onFavoriteSelect,
  isSearching,
  ragLoading,
  searchMode,
}: SearchViewProps) {
  const [favoritesDialogOpen, setFavoritesDialogOpen] = useState(false)

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
        {/* Hero Section */}
        <section className="hero-gradient border-b border-border/50">
          <div className="container mx-auto px-6 py-16 md:py-24">
            <div className="flex flex-col items-center text-center space-y-8">
              {/* Title & Subtitle */}
              <div className="space-y-4 animate-fade-in">
                <h1
                  className="text-6xl md:text-7xl font-bold text-foreground tracking-tight"
                  style={{ fontFamily: "GiantsInline, sans-serif" }}
                >
                  LexDiff
                </h1>
                <p className="text-xl md:text-3xl text-muted-foreground font-bold" style={{ fontFamily: "InkLiquid, sans-serif" }}>
                  Your AI-Powered Legal Companion
                </p>
                <p className="text-base md:text-lg text-muted-foreground/80 max-w-2xl mx-auto" style={{ fontFamily: "Pretendard, sans-serif" }}>
                  법령 검색부터 AI 분석까지, 대한민국 법률 정보를 가장 쉽고 빠르게
                </p>
              </div>

              {/* Search Bar */}
              <div className="w-full max-w-3xl animate-fade-in" style={{ animationDelay: "100ms" }}>
                <SearchBar
                  onSearch={onSearch}
                  isLoading={isLoading}
                  searchMode={searchMode}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="border-b border-border/50 bg-card/30 backdrop-blur-sm">
          <div className="container mx-auto px-6 py-12">
            <StatsSection />
          </div>
        </section>

        {/* Features Section */}
        <section className="bg-background">
          <div className="container mx-auto px-6 py-16 md:py-20">
            <FeatureCards />
          </div>
        </section>

        {/* CTA Section */}
        <section className="border-t border-border/50 bg-card/20">
          <div className="container mx-auto px-6 py-12 text-center">
            <div className="space-y-4 max-w-2xl mx-auto animate-fade-in">
              <h3 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Pretendard, sans-serif" }}>지금 바로 시작하세요</h3>
              <p className="text-muted-foreground" style={{ fontFamily: "Pretendard, sans-serif" }}>
                복잡한 법령도 LexDiff와 함께라면 쉽습니다.<br />
                검색창에 질문을 입력하거나 법령명을 입력해보세요.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 bg-card/30">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground" style={{ fontFamily: "Pretendard, sans-serif" }}>
              © 2025 Chris ryu. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-sm text-muted-foreground" style={{ fontFamily: "Pretendard, sans-serif" }}>
              <a href="/admin/settings" className="hover:text-foreground transition-colors">
                설정
              </a>
              <span>|</span>
              <span>법제처 API 연동</span>
              <span>|</span>
              <span>Powered by Gemini AI</span>
            </div>
          </div>
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
