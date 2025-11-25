/**
 * search-view-improved.tsx
 *
 * 개선된 메인 화면 컴포넌트 (Apple Style Scroll)
 * - Fixed Hero Section with 200px top margin
 * - Three distinct scroll animations for each section
 * - Premium UI/UX with advanced effects
 */

"use client"

import { Header } from "@/components/header"
import { SearchBar } from "@/components/search-bar"
import { FavoritesDialog } from "@/components/favorites-dialog"
import { ErrorReportDialog } from "@/components/error-report-dialog"
import { FeatureCards } from "@/components/feature-cards"
import { StatsSection } from "@/components/stats-section"
import { useState, useEffect, useRef } from "react"
import { ScrollReveal } from "@/components/ui/scroll-reveal"
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
  const [heroVisible, setHeroVisible] = useState(false)

  // Refs for scrolling to sections
  const featuresRef = useRef<HTMLElement>(null)
  const ctaRef = useRef<HTMLElement>(null)

  const isLoading = isSearching || ragLoading

  // Initial sequential animation on page load for Hero
  useEffect(() => {
    setTimeout(() => setHeroVisible(true), 300)
  }, [])

  const handleReset = () => {
    // Already on home
  }

  const handleFavoritesClick = () => {
    setFavoritesDialogOpen(true)
  }

  const handleSettingsClick = () => {
    window.location.href = '/admin/settings'
  }

  const handleScrollIndicatorClick = () => {
    // Scroll to features section
    if (featuresRef.current) {
      const elementPosition = featuresRef.current.getBoundingClientRect().top + window.pageYOffset
      const offsetPosition = elementPosition - 100
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      })
    }
  }

  const handleLogoClick = () => {
    window.history.pushState({}, "", "/")
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Fixed Header + Hero Section */}
      <div className="fixed top-0 left-0 right-0 z-[100] bg-background">
        <Header onReset={handleReset} onFavoritesClick={handleFavoritesClick} onSettingsClick={handleSettingsClick} />

        {/* Hero Section - Fixed */}
        <section className={`hero-gradient hero-section ${heroVisible ? 'is-visible' : ''}`}>
          <div className="container mx-auto max-w-[1280px] px-6 pt-[40px] md:pt-[50px] pb-[10px] md:pb-[10px]">
            <div className="flex flex-col items-center text-center space-y-4 md:space-y-6">
              {/* Title & Subtitle */}
              <div className="space-y-2 md:space-y-4">
                <h1
                  className="text-5xl md:text-7xl font-bold text-foreground tracking-tight cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ fontFamily: "GiantsInline, sans-serif" }}
                  onClick={handleLogoClick}
                >
                  LexDiff
                </h1>
                <p className="text-lg md:text-3xl text-muted-foreground font-bold" style={{ fontFamily: "ReperepointSpecialItalic, sans-serif" }}>
                  Legal AI Platform
                </p>
                <p className="text-sm md:text-lg text-muted-foreground/80 max-w-2xl mx-auto" style={{ fontFamily: "Pretendard, sans-serif" }}>
                  <span className="md:hidden">법령 검색부터 AI 분석까지,<br />대한민국 법률 정보를 가장 쉽고 빠르게</span>
                  <span className="hidden md:inline">법령 검색부터 AI 분석까지, 대한민국 법률 정보를 가장 쉽고 빠르게</span>
                </p>
              </div>

              {/* Search Bar */}
              <div className="w-full max-w-3xl">
                <SearchBar
                  onSearch={onSearch}
                  isLoading={isLoading}
                  searchMode={searchMode}
                />
              </div>

              {/* Scroll Indicator */}
              <div
                className="scroll-indicator cursor-pointer"
                onClick={handleScrollIndicatorClick}
                role="button"
                aria-label="스크롤하여 다음 섹션으로 이동"
              >
                <svg
                  className="w-6 h-6 text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Spacer for fixed header + hero */}
      <div className="h-[calc(64px+40px+30px+16rem)] md:h-[calc(64px+100px+60px+14rem)]" />

      {/* Scrollable Content */}
      <main className="flex-1 relative z-10">
        {/* Extra spacing before Stats Section - reduced */}
        <div className="h-[0px] md:h-[0px]" />

        {/* Stats Section */}
        <section className="stats-section bg-card/30 backdrop-blur-sm">
          <div className="container mx-auto max-w-[1280px] px-6 py-8 md:py-20">
            <StatsSection />
          </div>
        </section>

        {/* Features Section */}
        <section
          ref={featuresRef}
          className="features-section bg-background"
        >
          <div className="container mx-auto max-w-[1280px] px-6 py-32 md:py-40">
            <FeatureCards />
          </div>
        </section>

        {/* CTA Section */}
        <section
          ref={ctaRef}
          className="cta-section bg-card/20"
        >
          <div className="container mx-auto max-w-[1280px] px-6 py-24 md:py-32 text-center">
            <ScrollReveal animation="fade-up" duration="1000ms">
              <div className="space-y-8 max-w-3xl mx-auto">
                <ScrollReveal animation="fade-up" delay={100}>
                  <h3 className="text-5xl md:text-7xl font-bold text-foreground" style={{ fontFamily: "Pretendard, sans-serif" }}>
                    <span className="md:hidden">지금 바로<br />시작하세요</span>
                    <span className="hidden md:inline">지금 바로 시작하세요</span>
                  </h3>
                </ScrollReveal>
                <ScrollReveal animation="fade-up" delay={300}>
                  <p className="text-xl md:text-2xl text-muted-foreground" style={{ fontFamily: "Pretendard, sans-serif" }}>
                    복잡한 법령도 LexDiff와 함께라면 쉽습니다.<br />
                    검색창에 질문을 입력하거나 법령명을 입력해보세요.
                  </p>
                </ScrollReveal>
              </div>
            </ScrollReveal>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 bg-background relative z-[100]">
        <div className="container mx-auto max-w-[1280px] px-6">
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

      <style jsx global>{`
        /* Hero Section - Blur fade-in only */
        .hero-section {
          opacity: 0;
          filter: blur(5px);
          transition: opacity 2s cubic-bezier(0.16, 1, 0.3, 1),
                      filter 1s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .hero-section.is-visible {
          opacity: 1;
          filter: blur(0px);
        }

        /* Smooth scrolling */
        html {
          scroll-behavior: smooth;
        }

        /* Scroll Indicator - Gentle bounce animation */
        .scroll-indicator {
          animation: bounce 2s infinite;
          margin-top: 0;
        }

        @keyframes bounce {
          0%, 100% {
            transform: translateY(0);
            opacity: 0.3;
          }
          50% {
            transform: translateY(10px);
            opacity: 0.6;
          }
        }
      `}</style>
    </div>
  )
}
