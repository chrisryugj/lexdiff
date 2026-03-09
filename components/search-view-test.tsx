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

const FavoritesDialog = dynamic(
  () => import("@/components/favorites-dialog").then(m => m.FavoritesDialog),
  { ssr: false }
)
const HelpGuideSheet = dynamic(
  () => import("@/components/help-guide-sheet").then(m => m.HelpGuideSheet),
  { ssr: false }
)

/** 0에서 target까지 카운트업 애니메이션 (뷰포트 진입 시 시작) */
function AnimatedNumber({ value, duration = 600, delay = 0 }: { value: number; duration?: number; delay?: number }) {
  const [display, setDisplay] = useState(0)
  const [started, setStarted] = useState(false)
  const spanRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = spanRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setStarted(true); observer.disconnect() } },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!started || value <= 0) return
    const timer = setTimeout(() => {
      let start: number | null = null
      let raf: number

      const step = (ts: number) => {
        if (!start) start = ts
        const progress = Math.min((ts - start) / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        setDisplay(Math.round(eased * value))
        if (progress < 1) raf = requestAnimationFrame(step)
      }

      raf = requestAnimationFrame(step)
    }, delay)
    return () => clearTimeout(timer)
  }, [started, value, duration, delay])

  return <span ref={spanRef}>{display.toLocaleString()}</span>
}

export interface SearchViewTestProps {
  onSearch: (query: { lawName: string; article?: string; jo?: string }) => Promise<void>
  onFavoriteSelect: (favorite: Favorite) => void
  isSearching: boolean
  ragLoading: boolean
  searchMode: 'basic' | 'rag'
}

export function SearchViewTest({
  onSearch,
  onFavoriteSelect,
  isSearching,
  ragLoading,
  searchMode,
}: SearchViewTestProps) {
  const [favoritesDialogOpen, setFavoritesDialogOpen] = useState(false)
  const [helpSheetOpen, setHelpSheetOpen] = useState(false)
  const [favoritesCount, setFavoritesCount] = useState(0)
  const { apiKey, saveKey, clearKey } = useApiKey()
  const [isHeaderVisible, setIsHeaderVisible] = useState(true)
  const [lawStats, setLawStats] = useState<{ laws: number; adminRules: number; ordinances: number; precedents: number } | null>(null)

  const featuresRef = useRef<HTMLElement>(null)
  const lastScrollY = useRef(0)
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [featuresRevealed, setFeaturesRevealed] = useState(false)

  const isLoading = isSearching || ragLoading

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

  useEffect(() => {
    fetch("/api/law-stats")
      .then(r => r.json())
      .then(data => {
        if (data.laws || data.ordinances) setLawStats(data)
      })
      .catch(() => {})
  }, [])

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

  // 보다 무겁고 우아한 애니메이션 (Slow/Smooth)
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
      {/* Header */}
      <m.header
        initial={{ y: -40, opacity: 0 }}
        animate={{
          y: isHeaderVisible ? 0 : -80,
          opacity: isHeaderVisible ? 1 : 0,
        }}
        transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
        className="sticky top-0 z-50"
      >
        <div className="bg-background/95 backdrop-blur-xl border-b border-border">
          <div className="container mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14 md:h-16 lg:h-20">
              {/* Logo */}
              <button
                onClick={handleLogoClick}
                className="flex items-center gap-2.5 group"
              >
                <div className="flex h-9 w-9 md:h-10 md:w-10 items-center justify-center bg-primary text-primary-foreground shadow-md transition-transform duration-300 group-hover:scale-105">
                  <Icon name="scale" size={20} />
                </div>
                <span
                  className="text-lg md:text-xl lg:text-2xl font-bold text-foreground tracking-tight"
                  style={{ fontFamily: "'RIDIBatang', serif" }}
                >
                  LexDiff
                </span>
              </button>

              {/* Actions */}
              <div className="flex items-center gap-1 md:gap-2 lg:gap-4">
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
      <section className="relative pt-16 pb-8 md:pt-24 md:pb-16 lg:pt-40 lg:pb-24 flex flex-col items-center px-4 md:px-6 lg:px-8">
        {/* Subtle background gradient */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 80% 60% at 50% 0%, oklch(from var(--primary) l c h / 0.04) 0%, transparent 70%)',
          }}
        />

        <div className="container mx-auto max-w-4xl relative z-10">
          <m.div
            className="flex flex-col items-center text-center"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Elegant Badge */}
            <m.div variants={itemVariants} className="mb-5 md:mb-6 lg:mb-8">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 md:px-4 md:py-1.5 rounded-full text-xs font-medium border border-border/60 text-muted-foreground bg-card/80 backdrop-blur-sm tracking-widest uppercase">
                <Icon name="scale" size={12} className="text-primary" />
                Premium Legal AI
              </span>
            </m.div>

            {/* Title */}
            <m.h1
              variants={itemVariants}
              className="text-5xl md:text-6xl lg:text-8xl font-black text-foreground tracking-tighter"
              style={{ fontFamily: "'RIDIBatang', serif", lineHeight: 1.1 }}
            >
              LexDiff
            </m.h1>

            {/* Accent Line */}
            <m.div
              variants={itemVariants}
              className="mt-4 mb-4 md:mt-6 md:mb-6 w-12 md:w-16 h-0.5 md:h-1 rounded-full"
              style={{
                background: 'linear-gradient(90deg, transparent, var(--primary), transparent)',
              }}
            />

            {/* Subtitle */}
            <m.p
              variants={itemVariants}
              className="text-sm md:text-base text-muted-foreground font-medium tracking-wide mb-3"
            >
              AI 법률 검색 플랫폼
            </m.p>

            {/* Description */}
            <m.p
              variants={itemVariants}
              className="text-base md:text-lg text-muted-foreground/70 mb-8 md:mb-10 lg:mb-12 max-w-xl leading-relaxed break-keep"
            >
              <span className="md:hidden">
                법령 검색부터 AI 분석까지,<br />대한민국 법률 정보를 가장 쉽고 빠르게
              </span>
              <span className="hidden md:inline">
                어려운 법률 용어 대신 일상 언어로,{' '}
                공직자를 위한 가장 쉬운 지능형 법령 검색 플랫폼
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

        <section
          ref={featuresRef}
          className={`py-12 md:py-20 lg:py-32 transition-opacity duration-1000 ${featuresRevealed ? 'opacity-100' : 'opacity-0'}`}
        >
          <div className="container mx-auto max-w-4xl md:max-w-7xl px-4 md:px-6 lg:px-8">
            <FeatureCards revealed={featuresRevealed} />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 md:py-12">
        <div className="container mx-auto max-w-4xl md:max-w-7xl px-4 md:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-4 md:gap-6">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <Icon name="scale" size={24} className="text-primary" />
              <span className="text-xl font-bold text-foreground tracking-tight" style={{ fontFamily: "'RIDIBatang', serif" }}>LexDiff</span>
            </div>

            {/* Live stats */}
            {lawStats && (
              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs md:text-sm text-muted-foreground">
                {lawStats.laws > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Icon name="scale" size={14} className="text-primary/60" />
                    <span>법령 <AnimatedNumber value={lawStats.laws} delay={0} />건</span>
                  </span>
                )}
                {lawStats.adminRules > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Icon name="file-text" size={14} className="text-primary/60" />
                    <span>행정규칙 <AnimatedNumber value={lawStats.adminRules} delay={300} />건</span>
                  </span>
                )}
                {lawStats.ordinances > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Icon name="building-2" size={14} className="text-primary/60" />
                    <span>자치법규 <AnimatedNumber value={lawStats.ordinances} delay={600} />건</span>
                  </span>
                )}
                {lawStats.precedents > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Icon name="gavel" size={14} className="text-primary/60" />
                    <span>판례 <AnimatedNumber value={lawStats.precedents} delay={900} />건</span>
                  </span>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground/60">
              <button onClick={handleHelpClick} className="hover:text-foreground transition-colors font-medium whitespace-nowrap">이용 안내</button>
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
