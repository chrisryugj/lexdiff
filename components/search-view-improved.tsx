"use client"

import { SearchBar } from "@/components/search-bar"
import { ErrorReportDialog } from "@/components/error-report-dialog"
import { FeatureCards } from "@/components/feature-cards"
import { ThemeToggle } from "@/components/theme-toggle"
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text"
import { Dock, DockIcon } from "@/components/ui/dock"
import { Particles } from "@/components/ui/particles"
import { useState, useRef, useEffect } from "react"
import dynamic from "next/dynamic"
import type { Favorite } from "@/lib/law-types"
import { m, AnimatePresence } from "framer-motion"
import { useTheme } from "next-themes"

// Dynamic import for FavoritesDialog (reduce initial bundle)
const FavoritesDialog = dynamic(
  () => import("@/components/favorites-dialog").then(m => m.FavoritesDialog),
  { ssr: false }
)
const HelpGuideSheet = dynamic(
  () => import("@/components/help-guide-sheet").then(m => m.HelpGuideSheet),
  { ssr: false }
)
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { favoritesStore } from "@/lib/favorites-store"
import { ApiKeyInput } from "@/components/settings/api-key-input"
import { useApiKey } from "@/hooks/use-api-key"

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
  const [scrolled, setScrolled] = useState(false)
  const { resolvedTheme } = useTheme()
  const [particleColor, setParticleColor] = useState("#ffffff")

  // Refs for scrolling to sections
  const featuresRef = useRef<HTMLElement>(null)

  // Scroll reveal state - Features는 스크롤 시 페이드인
  const [featuresRevealed, setFeaturesRevealed] = useState(false)

  const isLoading = isSearching || ragLoading

  // Theme-based particle color
  useEffect(() => {
    setParticleColor(resolvedTheme === "dark" ? "#ffffff" : "#000000")
  }, [resolvedTheme])

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

  const handleHelpClick = () => {
    setHelpSheetOpen(true)
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
      {/* Floating Navigation with Dock Style */}
      <m.header
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="fixed top-3 md:top-4 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none"
      >
        <Dock
          iconSize={32}
          iconMagnification={48}
          iconDistance={120}
          className="pointer-events-auto bg-background/30 backdrop-blur-md border border-border/20 shadow-lg shadow-black/5 gap-4 px-5 py-3"
        >
          {/* Logo Button with Text - 확대 효과 제외 */}
          <div
            onClick={handleLogoClick}
            className="flex items-center gap-2 px-2 cursor-pointer shrink-0"
          >
            <div className="relative flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 animate-[glow_3s_ease-in-out_infinite] hover:animate-[glow-hover_1.5s_ease-in-out_infinite]">
              <Icon name="scale" size={16} className="text-white" />
              <style jsx>{`
                @keyframes glow {
                  0%, 100% { box-shadow: 0 0 6px rgba(168, 85, 247, 0.15); }
                  50% { box-shadow: 0 0 12px rgba(168, 85, 247, 0.25); }
                }
                @keyframes glow-hover {
                  0%, 100% { box-shadow: 0 0 8px rgba(168, 85, 247, 0.2); }
                  50% { box-shadow: 0 0 16px rgba(168, 85, 247, 0.35); }
                }
              `}</style>
            </div>
            <span className="text-sm md:text-base font-bold bg-gradient-to-l text-transparent bg-clip-text animate-text-gradient bg-[length:300%] from-zinc-500 via-zinc-950 to-zinc-600 dark:from-zinc-600 dark:via-zinc-100 dark:to-zinc-600 whitespace-nowrap" style={{ fontFamily: "GiantsInline, sans-serif" }}>
              LexDiff
            </span>
          </div>

          {/* Divider */}
          <div className="h-8 w-[1px] bg-border/50" />

          {/* Theme Toggle */}
          <DockIcon className="flex items-center justify-center">
            <ThemeToggle />
          </DockIcon>

          {/* Favorites */}
          {favoritesCount > 0 && (
            <DockIcon onClick={handleFavoritesClick} className="cursor-pointer">
              <div className="flex items-center gap-1">
                <Icon name="star" size={16} className="text-yellow-400" />
                <span className="text-xs font-medium text-foreground">{favoritesCount}</span>
              </div>
            </DockIcon>
          )}

          {/* Help */}
          <DockIcon onClick={handleHelpClick} className="cursor-pointer" title="사용 가이드">
            <Icon name="help-circle" size={16} className="text-muted-foreground hover:text-foreground" />
          </DockIcon>

          {/* Settings + API Key */}
          <DockIcon className="cursor-pointer">
            <ApiKeyInput apiKey={apiKey} onSave={saveKey} onClear={clearKey} variant="dock" />
          </DockIcon>
        </Dock>
      </m.header>

      {/* Hero Section - 스크롤 가능 */}
      <section className="hero-section-fixed pt-32 pb-12 md:pt-64 md:pb-5 flex flex-col items-center justify-center px-6 relative z-20">
        {/* Particles Background */}
        <Particles
          className="absolute inset-0 z-0"
          quantity={100}
          ease={80}
          color={particleColor}
          refresh
        />
        <div className="container mx-auto max-w-4xl relative z-10">
          <m.div
            className="flex flex-col items-center text-center"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Title & Subtitle */}
            <div className="space-y-2 md:space-y-3 mb-6 md:mb-8 w-full">
              <m.h1
                variants={itemVariants}
                className="text-6xl md:text-6xl font-bold bg-gradient-to-l text-transparent bg-clip-text animate-text-gradient bg-[length:300%] from-zinc-500 via-zinc-950 to-zinc-600 dark:from-zinc-600 dark:via-zinc-100 dark:to-zinc-600 tracking-tight cursor-pointer hover:opacity-80 transition-opacity logo-glow"
                style={{ fontFamily: "GiantsInline, sans-serif" }}
                onClick={handleLogoClick}
              >
                LexDiff
              </m.h1>
              <m.p
                variants={itemVariants}
                className="text-2xl md:text-2xl text-muted-foreground font-bold"
                style={{ fontFamily: "ReperepointSpecialItalic, sans-serif" }}
              >
                Legal AI Platform
              </m.p>
              <m.p
                variants={itemVariants}
                className="text-lg md:text-base max-w-full md:max-w-2xl mx-auto leading-relaxed"
                style={{ fontFamily: "Pretendard, sans-serif" }}
              >
                <AnimatedShinyText className="md:hidden text-muted-foreground/70">
                  법령 검색부터 AI 분석까지,<br />대한민국 법률 정보를 가장 쉽고 빠르게
                </AnimatedShinyText>
                <AnimatedShinyText className="hidden md:inline text-muted-foreground/70">
                  법령 검색부터 AI 분석까지, 대한민국 법률 정보를 가장 쉽고 빠르게
                </AnimatedShinyText>
              </m.p>
            </div>

            {/* Search Bar */}
            <m.div variants={itemVariants} className="w-full max-w-3xl mb-6 md:mb-15 relative z-[110]">
              <SearchBar
                onSearch={onSearch}
                isLoading={isLoading}
                searchMode={searchMode}
              />
            </m.div>

            {/* Scroll Indicator */}
            <m.button
              variants={itemVariants}
              className="scroll-indicator-apple p-2 rounded-full hover:bg-white/5 transition-colors relative z-0"
              onClick={handleScrollIndicatorClick}
              aria-label="스크롤하여 다음 섹션으로 이동"
            >
              <Icon name="chevron-down" size={20} className="text-muted-foreground/40" />
            </m.button>
          </m.div>
        </div>
      </section>

      {/* Scrollable Content */}
      <main className="flex-1 relative z-10">
        {/* Features Section */}
        <section
          ref={featuresRef}
          className={`section-primary py-5 md:py-40 reveal-on-scroll ${featuresRevealed ? 'revealed' : ''} relative`}
        >
          {/* Particles Background for entire Features section */}
          <Particles
            className="absolute inset-0 z-0"
            quantity={100}
            ease={80}
            color={particleColor}
            refresh
          />
          <div className="container mx-auto max-w-4xl px-6 relative z-10">
            <FeatureCards revealed={featuresRevealed} />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 section-subtle">
        <div className="container mx-auto max-w-4xl px-6">
          <div className="flex flex-col items-center gap-3 text-center" style={{ fontFamily: "Pretendard, sans-serif" }}>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground/60">
              <button onClick={handleHelpClick} className="hover:text-foreground transition-colors whitespace-nowrap">
                사용 가이드
              </button>
              <span className="text-border hidden sm:inline">|</span>
              <span className="whitespace-nowrap">법제처 API 연동</span>
              <span className="text-border hidden sm:inline">|</span>
              <span className="whitespace-nowrap">Powered by OpenClaw AI</span>
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
