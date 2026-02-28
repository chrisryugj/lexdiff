"use client"

import { SearchBar } from "@/components/search-bar"
import { ErrorReportDialog } from "@/components/error-report-dialog"
import { FeatureCards } from "@/components/feature-cards"
import { ThemeToggle } from "@/components/theme-toggle"
import { useState, useRef, useEffect } from "react"
import dynamic from "next/dynamic"
import type { Favorite } from "@/lib/law-types"
import { m } from "framer-motion"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { favoritesStore } from "@/lib/favorites-store"
import { ApiKeyInput } from "@/components/settings/api-key-input"
import { useApiKey } from "@/hooks/use-api-key"

// Dynamic import for FavoritesDialog (reduce initial bundle)
const FavoritesDialog = dynamic(
  () => import("@/components/favorites-dialog").then(m => m.FavoritesDialog),
  { ssr: false }
)
const HelpGuideSheet = dynamic(
  () => import("@/components/help-guide-sheet").then(m => m.HelpGuideSheet),
  { ssr: false }
)

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
  const [helpSheetOpen, setHelpSheetOpen] = useState(false)
  const [favoritesCount, setFavoritesCount] = useState(0)
  const { apiKey, saveKey, clearKey } = useApiKey()
  const [isHeaderVisible, setIsHeaderVisible] = useState(true)

  // Refs for scrolling to sections
  const featuresRef = useRef<HTMLElement>(null)
  const lastScrollY = useRef(0)
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Scroll reveal state
  const [featuresRevealed, setFeaturesRevealed] = useState(false)

  const isLoading = isSearching || ragLoading

  // Scroll detection for header hide/show + favorites count
  useEffect(() => {
    const unsubscribe = favoritesStore.subscribe((favs) => {
      setFavoritesCount(favs.length)
    })
    setFavoritesCount(favoritesStore.getFavorites().length)

    const handleScroll = () => {
      const y = window.scrollY

      if (y < 30) {
        setIsHeaderVisible(true)
        lastScrollY.current = y
        return
      }

      const delta = y - lastScrollY.current
      if (Math.abs(delta) > 8) {
        setIsHeaderVisible(delta <= 0)
        lastScrollY.current = y
      }

      if (scrollTimer.current) clearTimeout(scrollTimer.current)
      scrollTimer.current = setTimeout(() => {
        setIsHeaderVisible(true)
      }, 200)
    }
    window.addEventListener("scroll", handleScroll, { passive: true })

    return () => {
      unsubscribe()
      window.removeEventListener("scroll", handleScroll)
      if (scrollTimer.current) clearTimeout(scrollTimer.current)
    }
  }, [])

  // Intersection Observer for scroll reveals
  useEffect(() => {
    const featuresObserver = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setFeaturesRevealed(true)
    }, { threshold: 0.15, rootMargin: "0px 0px -80px 0px" })

    if (featuresRef.current) featuresObserver.observe(featuresRef.current)
    return () => { featuresObserver.disconnect() }
  }, [])

  const handleFavoritesClick = () => { setFavoritesDialogOpen(true) }
  const handleHelpClick = () => { setHelpSheetOpen(true) }

  const handleLogoClick = () => {
    window.history.pushState({}, "", "/")
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Animation Variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.12, delayChildren: 0.1 },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
    },
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Unified Header */}
      <m.header
        initial={{ y: -40, opacity: 0 }}
        animate={{
          y: isHeaderVisible ? 0 : -80,
          opacity: isHeaderVisible ? 1 : 0,
        }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="sticky top-0 z-50"
      >
        <div className="bg-background/95 backdrop-blur-xl border-b border-border">
          <div className="container mx-auto max-w-[1280px] px-4 md:px-6">
            <div className="flex items-center justify-between h-14 md:h-16">
              {/* Left: Logo */}
              <button
                onClick={handleLogoClick}
                className="flex items-center gap-2.5 group"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                  <Icon name="scale" size={20} className="text-primary-foreground" />
                </div>
                <span
                  className="text-lg font-bold text-foreground tracking-tight"
                  style={{ fontFamily: "'Noto Serif KR', serif" }}
                >
                  LexDiff
                </span>
              </button>

              {/* Right: Actions */}
              <div className="flex items-center gap-1 md:gap-2">
                <ThemeToggle />

                {favoritesCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={handleFavoritesClick} className="flex items-center gap-1.5">
                    <Icon name="star" size={16} className="text-[var(--color-warning)] fill-[var(--color-warning)]" />
                    <Badge variant="secondary" className="text-xs px-1.5 py-0">
                      {favoritesCount}
                    </Badge>
                  </Button>
                )}

                <Button variant="ghost" size="sm" onClick={handleHelpClick} title="사용 가이드">
                  <Icon name="help-circle" size={18} className="text-muted-foreground" />
                </Button>

                <ApiKeyInput apiKey={apiKey} onSave={saveKey} onClear={clearKey} variant="dock" />
              </div>
            </div>
          </div>
        </div>
      </m.header>

      {/* Hero Section */}
      <section className="relative pt-16 pb-8 md:pt-32 md:pb-12 flex flex-col items-center px-4 md:px-6 overflow-hidden">
        {/* Subtle background gradient */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 80% 60% at 50% 0%, oklch(from var(--primary) l c h / 0.04) 0%, transparent 70%)',
          }}
        />

        <div className="container mx-auto max-w-4xl relative">
          <m.div
            className="flex flex-col items-center text-center"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Accent badge */}
            <m.div variants={itemVariants} className="mb-5 md:mb-6">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-border/60 text-muted-foreground bg-card/80 backdrop-blur-sm">
                <Icon name="scale" size={12} className="text-primary" />
                AI Legal Search Platform
              </span>
            </m.div>

            {/* Title */}
            <m.h1
              variants={itemVariants}
              className="text-5xl md:text-7xl font-bold text-foreground tracking-tighter"
              style={{ fontFamily: "'Noto Serif KR', serif" }}
            >
              LexDiff
            </m.h1>

            {/* Decorative accent line */}
            <m.div
              variants={itemVariants}
              className="mt-4 mb-3 w-12 h-0.5 rounded-full"
              style={{
                background: 'linear-gradient(90deg, transparent, var(--primary), transparent)',
              }}
            />

            {/* Subtitle */}
            <m.p
              variants={itemVariants}
              className="text-sm md:text-base text-muted-foreground font-medium tracking-wide"
            >
              AI 법률 검색 플랫폼
            </m.p>

            {/* Description */}
            <m.p
              variants={itemVariants}
              className="text-base md:text-lg text-muted-foreground/70 mt-4 mb-8 md:mb-12 max-w-xl leading-relaxed break-keep"
            >
              <span className="md:hidden">
                법령 검색부터 AI 분석까지,<br />대한민국 법률 정보를 가장 쉽고 빠르게
              </span>
              <span className="hidden md:inline">
                법령 검색부터 AI 분석까지, 대한민국 법률 정보를 가장 쉽고 빠르게
              </span>
            </m.p>

            {/* Search Bar */}
            <m.div variants={itemVariants} className="w-full max-w-3xl relative z-40">
              <SearchBar
                onSearch={onSearch}
                isLoading={isLoading}
                searchMode={searchMode}
              />
            </m.div>
          </m.div>
        </div>
      </section>

      {/* Scrollable Content */}
      <main className="flex-1">
        {/* Section divider */}
        <div className="section-divider" />

        {/* Features Section */}
        <section
          ref={featuresRef}
          className={`py-12 md:py-20 reveal-on-scroll ${featuresRevealed ? 'revealed' : ''}`}
        >
          <div className="container mx-auto max-w-4xl px-4 md:px-6">
            <FeatureCards revealed={featuresRevealed} />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8">
        <div className="container mx-auto max-w-4xl px-4 md:px-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground/60">
              <button onClick={handleHelpClick} className="hover:text-foreground transition-colors whitespace-nowrap">
                사용 가이드
              </button>
              <span className="text-border hidden sm:inline">|</span>
              <span className="whitespace-nowrap">Built with 법제처 Open API</span>
            </div>
            <p className="text-xs text-muted-foreground/40">
              © 2025–2026 Chris ryu. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      <FavoritesDialog
        isOpen={favoritesDialogOpen}
        onClose={() => setFavoritesDialogOpen(false)}
        onSelect={onFavoriteSelect}
      />
      <HelpGuideSheet
        open={helpSheetOpen}
        onOpenChange={setHelpSheetOpen}
      />
      <ErrorReportDialog />
    </div>
  )
}
