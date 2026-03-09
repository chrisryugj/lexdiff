"use client"

import { SearchBarHome } from "@/components/search-bar-home"
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
      transition: { staggerChildren: 0.15, delayChildren: 0.2 },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.8, ease: [0.25, 1, 0.5, 1] as const },
    },
  }

  return (
    <div className="min-h-screen bg-[#faf9f7] dark:bg-[#0c0e14]">
      {/* Header - 솔리드하고 정제된 스타일 */}
      <m.header
        initial={{ y: -40, opacity: 0 }}
        animate={{
          y: isHeaderVisible ? 0 : -80,
          opacity: isHeaderVisible ? 1 : 0,
        }}
        transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
        className="sticky top-0 z-50 shadow-sm border-b border-gray-200 dark:border-gray-800/60 bg-[#faf9f7] dark:bg-[#0c0e14]"
      >
        <div className="container mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo */}
            <button
              onClick={handleLogoClick}
              className="flex items-center gap-3 group"
            >
              <div className="flex h-10 w-10 items-center justify-center bg-[#1a2b4c] dark:bg-[#e2a85d] text-white dark:text-[#0c0e14] shadow-md transition-transform duration-300 group-hover:scale-105">
                <Icon name="scale" size={22} />
              </div>
              <span
                className="text-xl lg:text-2xl font-medium italic text-[#1a2b4c] dark:text-[#e2a85d] tracking-tight"
                style={{ fontFamily: "'Libre Bodoni', serif", fontWeight: 500, fontStyle: 'italic', fontVariationSettings: "'wght' 500" }}
              >
                LexDiff
              </span>
            </button>

            {/* Actions */}
            <div className="flex items-center gap-2 lg:gap-4">
              <ThemeToggle />

              {favoritesCount > 0 && (
                <Button variant="ghost" size="sm" onClick={handleFavoritesClick} className="flex items-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-800">
                  <Icon name="star" size={18} className="text-[#d4af37] fill-[#d4af37]" />
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{favoritesCount}</span>
                </Button>
              )}

              <Button variant="ghost" size="sm" onClick={handleHelpClick} title="사용 가이드" className="hover:bg-gray-200 dark:hover:bg-gray-800">
                <Icon name="help-circle" size={20} className="text-gray-600 dark:text-gray-400" />
              </Button>

              <ApiKeyInput apiKey={apiKey} onSave={saveKey} onClear={clearKey} variant="dock" />
            </div>
          </div>
        </div>
      </m.header>

      {/* Hero Section */}
      <section className="relative pt-24 pb-16 lg:pt-40 lg:pb-24 flex flex-col items-center px-6 lg:px-8">
        <div className="container mx-auto max-w-4xl relative z-10">
          <m.div
            className="flex flex-col items-center text-center"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Elegant Badge */}
            <m.div variants={itemVariants} className="mb-6 lg:mb-8">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 border border-[#1a2b4c]/20 dark:border-[#e2a85d]/30 text-[#1a2b4c] dark:text-[#e2a85d] text-xs font-bold tracking-widest uppercase bg-transparent">
                <Icon name="scale" size={14} />
                Premium Legal AI
              </span>
            </m.div>

            {/* Title */}
            <m.h1
              variants={itemVariants}
              className="text-6xl lg:text-8xl font-medium italic text-[#1a2b4c] dark:text-[#e2a85d] tracking-tight lg:tracking-tighter"
              style={{ fontFamily: "'Libre Bodoni', serif", fontWeight: 500, fontStyle: 'italic', fontVariationSettings: "'wght' 500", lineHeight: 1.1 }}
            >
              LexDiff{'\u2009'}
            </m.h1>

            {/* Accent Line */}
            <m.div
              variants={itemVariants}
              className="mt-6 mb-6 w-16 h-1 bg-[#d4af37] dark:bg-[#e2a85d]"
            />

            {/* Subtitle */}
            <m.p
              variants={itemVariants}
              className="text-base lg:text-xl text-gray-600 dark:text-gray-300 font-medium tracking-wider mb-8 lg:mb-12 max-w-2xl leading-relaxed break-keep"
              style={{ fontFamily: "'RIDIBatang', serif" }}
            >
              어려운 법률 용어 대신 일상 언어로,<br/>
              공직자를 위한 가장 쉬운 지능형 법령 검색 플랫폼
            </m.p>

            {/* Search Bar */}
            <m.div variants={itemVariants} className="w-full max-w-3xl relative z-40">
              <SearchBarHome
                onSearch={onSearch}
                isLoading={isLoading}
                searchMode={searchMode}
              />
            </m.div>
          </m.div>
        </div>
      </section>

      {/* Scrollable Content */}
      <main className="flex-1 bg-white dark:bg-[#121620] border-t border-gray-200 dark:border-gray-800">
        <section
          ref={featuresRef}
          className={`py-20 lg:py-32 transition-opacity duration-1000 ${featuresRevealed ? 'opacity-100' : 'opacity-0'}`}
        >
          <div className="container mx-auto max-w-7xl px-6 lg:px-8">
            <FeatureCards revealed={featuresRevealed} />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#f8f9fa] dark:bg-[#080b0f] text-gray-600 dark:text-gray-400 py-12 border-t border-gray-200 dark:border-gray-800">
        <div className="container mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-gray-200 dark:border-gray-700/50">
            <div className="flex items-center gap-2">
              <Icon name="scale" size={24} className="text-[#1a2b4c] dark:text-[#e2a85d]" />
              <span className="text-xl font-medium italic text-[#1a2b4c] dark:text-white tracking-tight" style={{ fontFamily: "'Libre Bodoni', serif", fontWeight: 500, fontStyle: 'italic', fontVariationSettings: "'wght' 500" }}>LexDiff</span>
            </div>
            {/* Live stats */}
            {lawStats && (
              <div className="flex flex-wrap items-center justify-center gap-6 text-sm font-medium">
                {lawStats.laws > 0 && (
                  <span className="flex items-center gap-2">
                    <Icon name="scale" size={16} className="text-[#d4af37] dark:text-[#e2a85d]" />
                    <span className="text-gray-700 dark:text-gray-300">법령 <AnimatedNumber value={lawStats.laws} delay={0} />건</span>
                  </span>
                )}
                {lawStats.adminRules > 0 && (
                  <span className="flex items-center gap-2">
                    <Icon name="file-text" size={16} className="text-[#d4af37] dark:text-[#e2a85d]" />
                    <span className="text-gray-700 dark:text-gray-300">행정규칙 <AnimatedNumber value={lawStats.adminRules} delay={300} />건</span>
                  </span>
                )}
                {lawStats.ordinances > 0 && (
                  <span className="flex items-center gap-2">
                    <Icon name="building-2" size={16} className="text-[#d4af37] dark:text-[#e2a85d]" />
                    <span className="text-gray-700 dark:text-gray-300">자치법규 <AnimatedNumber value={lawStats.ordinances} delay={600} />건</span>
                  </span>
                )}
                {lawStats.precedents > 0 && (
                  <span className="flex items-center gap-2">
                    <Icon name="gavel" size={16} className="text-[#d4af37] dark:text-[#e2a85d]" />
                    <span className="text-gray-700 dark:text-gray-300">판례 <AnimatedNumber value={lawStats.precedents} delay={900} />건</span>
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 mt-8 text-xs text-gray-500">
            <div className="flex gap-4">
              <button onClick={handleHelpClick} className="hover:text-[#1a2b4c] dark:hover:text-white transition-colors font-medium">이용 안내</button>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <span>Built with 법제처 Open API</span>
            </div>
            <p>
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
