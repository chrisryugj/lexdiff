"use client"

import { SearchBar } from "@/components/search-bar"
import { ErrorReportDialog } from "@/components/error-report-dialog"
import { FeatureCards } from "@/components/feature-cards"
import { ThemeToggle } from "@/components/theme-toggle"
import { useState, useRef, useEffect } from "react"
import dynamic from "next/dynamic"
import type { Favorite } from "@/lib/law-types"
import { motion, AnimatePresence } from "framer-motion"

// Dynamic import for FavoritesDialog (reduce initial bundle)
const FavoritesDialog = dynamic(
  () => import("@/components/favorites-dialog").then(m => m.FavoritesDialog),
  { ssr: false }
)
import { ChevronDown, Scale, Star, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { favoritesStore } from "@/lib/favorites-store"

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
  const [favoritesCount, setFavoritesCount] = useState(0)
  const [scrolled, setScrolled] = useState(false)

  // Refs for scrolling to sections
  const featuresRef = useRef<HTMLElement>(null)

  // Scroll reveal state - Features는 스크롤 시 페이드인
  const [featuresRevealed, setFeaturesRevealed] = useState(false)

  const isLoading = isSearching || ragLoading

  // Scroll detection for floating nav + favorites count
  useEffect(() => {
    const unsubscribe = favoritesStore.subscribe((favs) => {
      setFavoritesCount(favs.length)
    })
    setFavoritesCount(favoritesStore.getFavorites().length)

    const handleScroll = () => {
      setScrolled(window.scrollY > 100)
    }
    window.addEventListener("scroll", handleScroll)

    return () => {
      unsubscribe()
      window.removeEventListener("scroll", handleScroll)
    }
  }, [])

  // Intersection Observer for scroll reveals
  useEffect(() => {
    const observerOptions = {
      threshold: 0.15,
      rootMargin: "0px 0px -80px 0px"
    }

    const featuresObserver = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setFeaturesRevealed(true)
    }, observerOptions)

    if (featuresRef.current) featuresObserver.observe(featuresRef.current)

    return () => {
      featuresObserver.disconnect()
    }
  }, [])

  const handleFavoritesClick = () => {
    setFavoritesDialogOpen(true)
  }

  const handleSettingsClick = () => {
    window.location.href = '/admin/settings'
  }

  const handleScrollIndicatorClick = () => {
    if (featuresRef.current) {
      const elementPosition = featuresRef.current.getBoundingClientRect().top + window.pageYOffset
      const offsetPosition = elementPosition - 80
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

  // Animation Variants - Apple style
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.1,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 30, filter: "blur(8px)" },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: {
        duration: 0.7,
        ease: [0.16, 1, 0.3, 1] as const,
      },
    },
  }

  return (
    <div className="min-h-screen page-bg">
      {/* Floating Navigation - 스크롤 시 나타남 */}
      <AnimatePresence>
        {scrolled && (
          <motion.header
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-4 md:top-6 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none"
          >
            <div className="pointer-events-auto flex items-center justify-between gap-6 md:gap-8 px-4 md:px-6 py-2.5 md:py-3 rounded-full bg-background/80 backdrop-blur-xl border border-border/50 shadow-lg shadow-black/20">
              <button
                onClick={handleLogoClick}
                className="flex items-center gap-2 md:gap-3 group"
              >
                <div className="relative flex h-8 w-8 md:h-9 md:w-9 items-center justify-center rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 shadow-lg shadow-purple-500/20 group-hover:shadow-purple-500/40 transition-shadow duration-300">
                  <Scale className="h-4 w-4 text-white" />
                </div>
                <span className="text-base md:text-lg font-bold text-foreground" style={{ fontFamily: "GiantsInline, sans-serif" }}>
                  LexDiff
                </span>
              </button>

              <div className="h-4 w-[1px] bg-border/50" />

              <div className="flex items-center gap-1">
                {/* 테마 토글 */}
                <ThemeToggle />

                {favoritesCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleFavoritesClick}
                    className="rounded-full hover:bg-foreground/5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Star className="h-4 w-4 mr-1.5 text-yellow-400" />
                    <span className="text-xs font-medium">{favoritesCount}</span>
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSettingsClick}
                  className="rounded-full hover:bg-foreground/5 text-muted-foreground hover:text-foreground transition-colors w-8 h-8 md:w-9 md:h-9"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Hero Section - 스크롤 가능 */}
      <section className="hero-section-fixed pt-32 pb-12 md:pt-64 md:pb-5 flex flex-col items-center justify-center px-6 relative z-20">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            className="flex flex-col items-center text-center"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Title & Subtitle */}
            <div className="space-y-2 md:space-y-3 mb-6 md:mb-8 w-full">
              <motion.h1
                variants={itemVariants}
                className="text-6xl md:text-6xl font-bold text-foreground tracking-tight cursor-pointer hover:opacity-80 transition-opacity logo-glow"
                style={{ fontFamily: "GiantsInline, sans-serif" }}
                onClick={handleLogoClick}
              >
                LexDiff
              </motion.h1>
              <motion.p
                variants={itemVariants}
                className="text-2xl md:text-2xl text-muted-foreground font-bold"
                style={{ fontFamily: "ReperepointSpecialItalic, sans-serif" }}
              >
                Legal AI Platform
              </motion.p>
              <motion.p
                variants={itemVariants}
                className="text-lg md:text-base text-muted-foreground/70 max-w-full md:max-w-2xl mx-auto leading-relaxed"
                style={{ fontFamily: "Pretendard, sans-serif" }}
              >
                <span className="md:hidden">법령 검색부터 AI 분석까지,<br />대한민국 법률 정보를 가장 쉽고 빠르게</span>
                <span className="hidden md:inline">법령 검색부터 AI 분석까지, 대한민국 법률 정보를 가장 쉽고 빠르게</span>
              </motion.p>
            </div>

            {/* Search Bar */}
            <motion.div variants={itemVariants} className="w-full max-w-3xl mb-6 md:mb-15">
              <SearchBar
                onSearch={onSearch}
                isLoading={isLoading}
                searchMode={searchMode}
              />
            </motion.div>

            {/* Scroll Indicator */}
            <motion.button
              variants={itemVariants}
              className="scroll-indicator-apple p-2 rounded-full hover:bg-white/5 transition-colors"
              onClick={handleScrollIndicatorClick}
              aria-label="스크롤하여 다음 섹션으로 이동"
            >
              <ChevronDown className="w-5 h-5 text-muted-foreground/40" />
            </motion.button>
          </motion.div>
        </div>
      </section>

      {/* Scrollable Content */}
      <main className="flex-1 relative z-10">
        {/* Features Section */}
        <section
          ref={featuresRef}
          className={`section-primary py-5 md:py-40 reveal-on-scroll ${featuresRevealed ? 'revealed' : ''}`}
        >
          <div className="container mx-auto max-w-4xl px-6">
            <FeatureCards revealed={featuresRevealed} />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 section-subtle">
        <div className="container mx-auto max-w-4xl px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground/60" style={{ fontFamily: "Pretendard, sans-serif" }}>
              © 2025 Chris ryu. All rights reserved.
            </p>
            <div className="flex items-center gap-4 text-sm text-muted-foreground/60" style={{ fontFamily: "Pretendard, sans-serif" }}>
              <a href="/admin/settings" className="hover:text-foreground transition-colors">
                설정
              </a>
              <span className="text-border">|</span>
              <span>법제처 API 연동</span>
              <span className="text-border">|</span>
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
