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
  const [scrollTargetIndex, setScrollTargetIndex] = useState(0)
  const statsRef = useRef<HTMLElement>(null)
  const featuresRef = useRef<HTMLElement>(null)
  const ctaRef = useRef<HTMLElement>(null)

  const isLoading = isSearching || ragLoading

  // Initial sequential animation on page load
  useEffect(() => {
    // Hero appears with delay for stronger fade-in effect
    setTimeout(() => setHeroVisible(true), 300)
  }, [])

  // Intersection Observer for scroll-reveal animations
  useEffect(() => {
    // 반응형: 모바일(768px 미만)은 -100px, PC는 -300px
    const isMobile = window.innerWidth < 768
    const observerOptions = {
      root: null,
      rootMargin: isMobile ? '-100px 0px' : '-300px 0px',
      threshold: 0.1
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
        }
        // Remove the "dim again" logic - once visible, stay visible
      })
    }, observerOptions)

    const sections = [statsRef.current, featuresRef.current, ctaRef.current]
    sections.forEach((section) => {
      if (section) observer.observe(section)
    })

    return () => observer.disconnect()
  }, [])

  const handleReset = () => {
    // 이미 홈 화면이므로 아무것도 하지 않음
  }

  const handleFavoritesClick = () => {
    setFavoritesDialogOpen(true)
  }

  const handleSettingsClick = () => {
    window.location.href = '/admin/settings'
  }

  const handleScrollIndicatorClick = () => {
    // 3단계 순환: 주요기능 섹션 → 다음 섹션(CTA) → 최상단
    if (scrollTargetIndex === 0) {
      // 1번 클릭: 주요기능 섹션으로 스크롤 (제목이 위쪽에 보이도록)
      if (featuresRef.current) {
        const elementPosition = featuresRef.current.getBoundingClientRect().top + window.pageYOffset
        const offsetPosition = elementPosition - 600 // 헤더 높이만큼 오프셋
        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        })
      }
    } else if (scrollTargetIndex === 1) {
      // 2번 클릭: 다음 섹션(CTA)으로 스크롤
      if (ctaRef.current) {
        const elementPosition = ctaRef.current.getBoundingClientRect().top + window.pageYOffset
        const offsetPosition = elementPosition - 100
        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        })
      }
    } else {
      // 3번 클릭: 최상단으로 스크롤
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    // 다음 타겟으로 순환 (3개 순환: 주요기능 → CTA → 최상단)
    setScrollTargetIndex((prev) => (prev + 1) % 3)
  }

  const handleLogoClick = () => {
    // 홈으로 이동 및 최상단 스크롤
    window.history.pushState({}, "", "/")
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Fixed Header + Hero Section */}
      <div className="fixed top-0 left-0 right-0 z-[100] bg-background">
        <Header onReset={handleReset} onFavoritesClick={handleFavoritesClick} onSettingsClick={handleSettingsClick} />

        {/* Hero Section - Fixed */}
        <section className={`hero-gradient border-b border-border/50 hero-section ${heroVisible ? 'is-visible' : ''}`}>
          <div className="container mx-auto px-6 pt-[40px] md:pt-[100px] pb-[10px] md:pb-[20px]">
            <div className="flex flex-col items-center text-center space-y-4 md:space-y-8">
              {/* Title & Subtitle */}
              <div className="space-y-2 md:space-y-4">
                <h1
                  className="text-5xl md:text-7xl font-bold text-foreground tracking-tight cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ fontFamily: "GiantsInline, sans-serif" }}
                  onClick={handleLogoClick}
                >
                  LexDiff
                </h1>
                <p className="text-lg md:text-3xl text-muted-foreground font-bold" style={{ fontFamily: "Pretendard, sans-serif" }}>
                  Legal AI
                </p>
                <p className="text-sm md:text-lg text-muted-foreground/80 max-w-2xl mx-auto" style={{ fontFamily: "Pretendard, sans-serif" }}>
                  법령 검색부터 AI 분석까지, 대한민국 법률 정보를 가장 쉽고 빠르게
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
      <div className="h-[calc(64px+40px+60px+12rem)] md:h-[calc(64px+100px+60px+14rem)]" />

      {/* Scrollable Content */}
      <main className="flex-1 relative z-10">
        {/* Extra spacing before Stats Section */}
        <div className="h-[10px] md:h-[50px]" />

        {/* Stats Section - Blur and fade in on scroll */}
        <section
          ref={statsRef}
          className="stats-section bg-card/30 backdrop-blur-sm"
        >
          <div className="container mx-auto px-6 py-24 md:py-32">
            <StatsSection />
          </div>
        </section>

        {/* Features Section - Apple-style fade up on scroll */}
        <section
          ref={featuresRef}
          className="features-section bg-background"
        >
          <div className="container mx-auto px-6 py-32 md:py-40">
            <FeatureCards />
          </div>
        </section>

        {/* CTA Section - Pull-up animation (no border) */}
        <section
          ref={ctaRef}
          className="cta-section bg-card/20"
        >
          <div className="container mx-auto px-6 py-24 md:py-32 text-center">
            <div className="space-y-8 max-w-3xl mx-auto">
              <h3 className="text-5xl md:text-7xl font-bold text-foreground" style={{ fontFamily: "Pretendard, sans-serif" }}>
                <span className="md:hidden">지금 바로<br />시작하세요</span>
                <span className="hidden md:inline">지금 바로 시작하세요</span>
              </h3>
              <p className="text-xl md:text-2xl text-muted-foreground" style={{ fontFamily: "Pretendard, sans-serif" }}>
                복잡한 법령도 LexDiff와 함께라면 쉽습니다.<br />
                검색창에 질문을 입력하거나 법령명을 입력해보세요.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 bg-background relative z-[100]">
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

      <style jsx global>{`
        /* Hero Section - Blur fade-in only (no movement, ultra slow) */
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


        /* Features and CTA - Scroll-triggered fade-up (ultra slow) */
        .stats-section,
        .features-section,
        .cta-section {
          opacity: 0;
          transform: translateY(150px);
          transition: opacity 2s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .stats-section,
        .features-section.is-visible,
        .cta-section.is-visible {
          opacity: 1;
          transform: translateY(0);
        }

        /* Smooth scrolling */
        html {
          scroll-behavior: smooth;
        }

        /* Scroll Indicator - Gentle bounce animation */
        .scroll-indicator {
          animation: bounce 2s infinite;
          margin-top: 3rem;
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
