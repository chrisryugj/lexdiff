"use client"

import { SearchBarHome } from "@/components/search-bar-home"
import { ErrorReportDialog } from "@/components/error-report-dialog"
import { FeatureCards, type ToolCardId } from "@/components/feature-cards"
import { ThemeToggle } from "@/components/theme-toggle"
import { useState, useRef, useEffect } from "react"
import dynamic from "next/dynamic"
import type { Favorite } from "@/lib/law-types"
import { m } from "framer-motion"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { favoritesStore } from "@/lib/favorites-store"
import { UserMenu } from "@/components/user-menu"
import { AiGateDialog } from "@/components/ai-gate-dialog"
import { useScrollDirection } from "@/hooks/use-scroll-direction"
import { LawStatsFooter } from "@/components/shared/law-stats-footer"
import { OnboardingTour, type TourStep } from "@/components/onboarding-tour"

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
  onImpactTracker?: () => void
  onToolClick?: (toolId: ToolCardId) => void
}

export function SearchView({
  onSearch,
  onFavoriteSelect,
  isSearching,
  ragLoading,
  searchMode,
  onImpactTracker,
  onToolClick,
}: SearchViewProps) {
  const [favoritesDialogOpen, setFavoritesDialogOpen] = useState(false)
  const [helpSheetOpen, setHelpSheetOpen] = useState(false)
  const [loginDialogOpen, setLoginDialogOpen] = useState(false)
  const [favoritesCount, setFavoritesCount] = useState(0)
  const [tourRunKey, setTourRunKey] = useState(0)
  const isHeaderVisible = useScrollDirection()  // PERF-3: 통합 훅 사용

  const tourSteps: TourStep[] = [
    {
      selector: '[data-tour="search-input"]',
      title: "법령을 바로 검색하세요",
      body: (
        <>
          법령명이나 조문 번호를 입력하시면 해당 조문으로 바로 이동합니다.
          <div className="mt-2 flex flex-wrap gap-1.5">
            <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-white/5 rounded text-[11px] text-slate-700 dark:text-slate-300">
              관세법 38조
            </code>
            <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-white/5 rounded text-[11px] text-slate-700 dark:text-slate-300">
              민법 제750조
            </code>
            <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-white/5 rounded text-[11px] text-slate-700 dark:text-slate-300">
              근로기준법
            </code>
          </div>
        </>
      ),
      placement: "bottom",
      padding: 8,
    },
    {
      selector: '[data-tour="ai-toggle"]',
      title: "AI 모드로 자연어 질문",
      body: (
        <>
          왼쪽 뇌 아이콘을 누르시면 AI 검색으로 전환됩니다. "수출통관 절차는?",
          "연차휴가 발생 요건"과 같이 일상 언어로 질문하실 수 있습니다.
        </>
      ),
      placement: "bottom",
      padding: 6,
    },
    {
      selector: '[data-tour="quick-actions"]',
      title: "분석 도구 바로가기",
      body: (
        <>
          변경 영향 분석, 조례 미반영 탐지, 조례 벤치마킹 도구를 여기서 바로 여실 수 있습니다.
        </>
      ),
      placement: "bottom",
      padding: 8,
    },
    {
      selector: '[data-tour="features"]',
      title: "주요 기능 한눈에",
      body: (
        <>
          LexDiff가 제공하는 핵심 기능들을 카드로 확인하실 수 있습니다. 원하시는 카드를
          누르면 바로 실행됩니다.
        </>
      ),
      placement: "top",
      padding: 12,
    },
    {
      selector: '[data-tour="help-button"]',
      title: "언제든 다시 보실 수 있습니다",
      body: (
        <>
          사용 가이드는 상단의 <Icon name="help-circle" size={12} className="inline mx-0.5 align-[-1px]" /> 아이콘에서 언제든 다시 여실 수 있습니다. 가이드 안에서 이 투어도 재시작하실 수 있습니다.
        </>
      ),
      placement: "bottom",
      padding: 6,
    },
  ]

  const featuresRef = useRef<HTMLElement>(null)
  const [featuresRevealed, setFeaturesRevealed] = useState(false)

  const isLoading = isSearching || ragLoading

  useEffect(() => {
    const unsubscribe = favoritesStore.subscribe((favs) => {
      setFavoritesCount(favs.length)
    })
    setFavoritesCount(favoritesStore.getFavorites().length)
    return () => { unsubscribe() }
  }, [])

  useEffect(() => {
    // UX-8: 모바일에서도 빠른 감지 — threshold 0/0.05 + 더 큰 음수 rootMargin으로
    // 첫 픽셀 노출 시점에 reveal (모바일 좁은 viewport 대응)
    const featuresObserver = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setFeaturesRevealed(true)
    }, { threshold: [0, 0.05], rootMargin: "0px 0px -40px 0px" })

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

  // 타이틀 전용: y transform 없이 opacity만 (italic 글리프 GPU 레이어 클리핑 방지)
  const titleVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { duration: 0.8, ease: [0.25, 1, 0.5, 1] as const },
    },
  }
  return (
    <div className="min-h-screen bg-content-bg">
      {/* Header - 솔리드하고 정제된 스타일 */}
      <m.header
        initial={{ y: -40, opacity: 0 }}
        animate={{
          y: isHeaderVisible ? 0 : -80,
          opacity: isHeaderVisible ? 1 : 0,
        }}
        transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
        className="sticky top-0 z-50 shadow-sm border-b border-gray-200 dark:border-gray-800/60 bg-content-bg"
      >
        <div className="container mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo */}
            <button
              onClick={handleLogoClick}
              className="flex items-center gap-3 group"
            >
              <div className="flex h-10 w-10 items-center justify-center bg-brand-navy text-white dark:text-background shadow-md transition-transform duration-300 group-hover:scale-105">
                <Icon name="scale" size={22} />
              </div>
              <span
                className="text-xl lg:text-2xl font-medium italic text-brand-navy tracking-tight"
                style={{ fontFamily: "'Libre Bodoni', serif", fontWeight: 500, fontStyle: 'italic', fontVariationSettings: "'wght' 500" }}
              >
                LexDiff
              </span>
              {/* 작은 베타 표시 — 구석에 조용히 */}
              <span
                aria-label="베타 버전"
                className="ml-1 self-start mt-0.5 px-1 py-0 text-[9px] font-semibold uppercase tracking-wider text-brand-gold/90 border border-brand-gold/40 rounded-sm leading-tight"
                style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontStyle: 'normal' }}
              >
                beta
              </span>
            </button>

            {/* Actions */}
            <div className="flex items-center gap-2 lg:gap-4">
              <ThemeToggle />

              {favoritesCount > 0 && (
                <Button variant="ghost" size="sm" onClick={handleFavoritesClick} className="flex items-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-800">
                  <Icon name="star" size={18} className="text-brand-gold fill-brand-gold" />
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{favoritesCount}</span>
                </Button>
              )}

              <Button variant="ghost" size="sm" onClick={handleHelpClick} data-tour="help-button" title="사용 가이드" className="hover:bg-gray-200 dark:hover:bg-gray-800">
                <Icon name="help-circle" size={20} className="text-gray-600 dark:text-gray-400" />
              </Button>

              <UserMenu
                onLoginClick={() => setLoginDialogOpen(true)}
                onFavoriteSelect={onFavoriteSelect}
                onAllFavoritesClick={() => setFavoritesDialogOpen(true)}
              />
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
              <span className="inline-flex items-center gap-2 px-4 py-1.5 border border-brand-navy/20 text-brand-navy text-xs font-bold tracking-widest uppercase bg-transparent">
                <Icon name="scale" size={14} />
                Premium Legal AI
              </span>
            </m.div>

            {/* Title */}
            <m.div variants={titleVariants} className="w-full overflow-visible">
              <h1
                className="overflow-visible text-6xl lg:text-8xl font-medium italic text-brand-navy tracking-tight lg:tracking-tighter"
                style={{ fontFamily: "'Libre Bodoni', serif", fontWeight: 500, fontStyle: 'italic', lineHeight: 1.1 }}
              >
                LexDiff
              </h1>
            </m.div>

            {/* Accent Line */}
            <m.div
              variants={itemVariants}
              className="mt-6 mb-6 w-16 h-1 bg-brand-gold"
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
              {(onImpactTracker || onToolClick) && (
                <div data-tour="quick-actions" className="flex justify-center mt-5 gap-1.5 sm:gap-2 flex-wrap">
                  {onImpactTracker && (
                    <button
                      onClick={onImpactTracker}
                      className="group flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-full border border-brand-navy/15 bg-white/60 dark:bg-gray-900/40 backdrop-blur-sm hover:border-brand-gold hover:shadow-md hover:shadow-brand-gold/10 transition-all duration-300"
                    >
                      <Icon name="chart-line" size={16} className="text-brand-gold" />
                      <span className="text-xs sm:text-sm font-medium text-brand-navy dark:text-foreground">변경 영향 분석</span>
                      <Icon name="arrow-right" size={14} className="text-gray-300 dark:text-gray-600 group-hover:text-brand-gold group-hover:translate-x-0.5 transition-all" />
                    </button>
                  )}
                  {onToolClick && (
                    <button
                      onClick={() => onToolClick('ordinance-sync')}
                      className="group flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-full border border-brand-navy/15 bg-white/60 dark:bg-gray-900/40 backdrop-blur-sm hover:border-brand-gold hover:shadow-md hover:shadow-brand-gold/10 transition-all duration-300"
                    >
                      <Icon name="alert-triangle" size={16} className="text-brand-gold" />
                      <span className="text-xs sm:text-sm font-medium text-brand-navy dark:text-foreground">조례 미반영 탐지</span>
                      <Icon name="arrow-right" size={14} className="text-gray-300 dark:text-gray-600 group-hover:text-brand-gold group-hover:translate-x-0.5 transition-all" />
                    </button>
                  )}
                  {onToolClick && (
                    <button
                      onClick={() => onToolClick('ordinance-benchmark')}
                      className="group flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-full border border-brand-navy/15 bg-white/60 dark:bg-gray-900/40 backdrop-blur-sm hover:border-brand-gold hover:shadow-md hover:shadow-brand-gold/10 transition-all duration-300"
                    >
                      <Icon name="bar-chart" size={16} className="text-brand-gold" />
                      <span className="text-xs sm:text-sm font-medium text-brand-navy dark:text-foreground">조례 벤치마킹</span>
                      <Icon name="arrow-right" size={14} className="text-gray-300 dark:text-gray-600 group-hover:text-brand-gold group-hover:translate-x-0.5 transition-all" />
                    </button>
                  )}
                </div>
              )}
            </m.div>
          </m.div>
        </div>
      </section>

      {/* Scrollable Content */}
      <main className="flex-1 bg-white dark:bg-[#121620] border-t border-gray-200 dark:border-gray-800">
        <section
          ref={featuresRef}
          data-tour="features"
          className={`py-10 lg:py-16 transition-opacity duration-1000 ${featuresRevealed ? 'opacity-100' : 'opacity-0'}`}
        >
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <FeatureCards revealed={featuresRevealed} onToolClick={onToolClick} />
          </div>
        </section>

        {/* 법적 안전 고지 — 베타 단계에서 반드시 노출 (피처카드와 푸터 사이) */}
        <section className="pb-10 lg:pb-14">
          <div
            role="note"
            aria-label="법적 고지"
            className="container mx-auto max-w-5xl px-4 sm:px-6 py-3 border border-amber-400/40 bg-amber-50/60 dark:bg-amber-900/10 rounded-md text-xs lg:text-sm text-amber-900 dark:text-amber-200 leading-relaxed break-keep text-center"
          >
            <span className="font-semibold">⚖️ 법적 고지</span> · 본 서비스는 법령 정보 제공을 위한 <span className="font-semibold">참고용 도구</span>이며, 법률 자문을 대체하지 않습니다. 중요한 법적 판단 전에는 반드시 변호사·법무사 상담을 권장합니다.
          </div>
        </section>
      </main>

      {/* Footer */}
      <LawStatsFooter
        extraLinks={
          <>
            <button onClick={handleHelpClick} className="hover:text-brand-navy transition-colors font-medium">이용 안내</button>
            <span className="text-gray-300 dark:text-gray-600">|</span>
          </>
        }
      />

      <FavoritesDialog
        isOpen={favoritesDialogOpen}
        onClose={() => setFavoritesDialogOpen(false)}
        onSelect={onFavoriteSelect}
      />
      <HelpGuideSheet
        open={helpSheetOpen}
        onOpenChange={setHelpSheetOpen}
        onRestartTour={() => {
          setHelpSheetOpen(false)
          setTourRunKey((k) => k + 1)
        }}
      />
      <OnboardingTour
        steps={tourSteps}
        storageKey="lexdiff-home-tour-v1"
        autoStart
        runKey={tourRunKey}
      />
      <AiGateDialog
        open={loginDialogOpen}
        onClose={() => setLoginDialogOpen(false)}
      />
      <ErrorReportDialog />
    </div>
  )
}
