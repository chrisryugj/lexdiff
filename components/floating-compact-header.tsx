"use client"

import { useState, useEffect } from "react"
import { useScrollDirection } from "@/hooks/use-scroll-direction"
import { m } from "framer-motion"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { favoritesStore } from "@/lib/favorites-store"
import { UsageGuidePopover } from "@/components/usage-guide-popover"
import { ThemeToggle } from "@/components/theme-toggle"
import { UserMenu } from "@/components/user-menu"
import type { Favorite } from "@/lib/law-types"

interface FloatingCompactHeaderProps {
  onBack?: () => void
  onHomeClick?: () => void // 로고 클릭 시 홈으로 이동
  onFavoritesClick?: () => void
  onLoginClick?: () => void
  onFavoriteSelect?: (fav: Favorite) => void
  onSearchClick?: () => void // 검색 모달 열기
  onFocusModeToggle?: () => void // 포커스 모드 토글
  onHelpClick?: () => void // 도움말 Sheet 열기
  currentLawName?: string // 현재 법령명
  currentArticle?: string // 현재 조문 번호 (예: "제38조")
  showBackButton?: boolean
  isFocusMode?: boolean
  guideType?: 'law-search' | 'ai-search' // 사용법 안내 타입
}

export function FloatingCompactHeader({
  onBack,
  onHomeClick,
  onFavoritesClick,
  onLoginClick,
  onFavoriteSelect,
  onSearchClick,
  onFocusModeToggle,
  onHelpClick,
  currentLawName,
  currentArticle,
  showBackButton = true,
  isFocusMode = false,
  guideType = 'law-search',
}: FloatingCompactHeaderProps) {
  const [favoritesCount, setFavoritesCount] = useState(0)
  const [scrolled, setScrolled] = useState(false)
  const isVisible = useScrollDirection()  // PERF-3: 통합 훅

  // 즐겨찾기 개수 추적
  useEffect(() => {
    const unsubscribe = favoritesStore.subscribe((favs) => {
      setFavoritesCount(favs.length)
    })
    setFavoritesCount(favoritesStore.getFavorites().length)

    return () => {
      unsubscribe()
    }
  }, [])

  // PERF-3: scrolled (>20px) 상태만 별도 추적 (방향성 로직은 useScrollDirection이 담당)
  useEffect(() => {
    let rafId: number | null = null
    const handleScroll = () => {
      if (rafId != null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        setScrolled(window.scrollY > 20)
      })
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (rafId != null) cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <m.header
      animate={{
        y: isVisible ? 0 : -100,
        opacity: isVisible ? 1 : 0,
      }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={`sticky top-0 z-50 ${scrolled ? 'shadow-lg' : ''}`}
    >
      <div className="bg-background/95 backdrop-blur-xl border-b border-border">
        <div className="container mx-auto max-w-[1280px] px-4 lg:px-6">
          <div className="flex items-center justify-between h-12 lg:h-16 gap-3">
                {/* 왼쪽: 로고 + 뒤로가기 + 법령명 */}
                <div className="flex items-center gap-3 lg:gap-4 flex-1 min-w-0">
                  {showBackButton && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onBack}
                      className="flex-shrink-0"
                      title="뒤로가기"
                    >
                      <Icon name="chevron-left" size={20} />
                    </Button>
                  )}

                  <button
                    onClick={onHomeClick || onBack}
                    className="flex items-center gap-2 lg:gap-3 group flex-shrink-0"
                    title="홈으로 이동"
                  >
                    <div className="flex h-8 w-8 lg:h-9 lg:w-9 items-center justify-center rounded-sm bg-brand-navy transition-transform duration-300 group-hover:scale-105">
                      <Icon name="scale" size={18} className="text-white dark:text-background" />
                    </div>
                    <span
                      className="hidden md:block text-lg lg:text-xl font-medium italic text-brand-navy tracking-tight"
                      style={{ fontFamily: "'Libre Bodoni', serif", fontWeight: 500, fontStyle: 'italic', fontVariationSettings: "'wght' 500" }}
                    >
                      LexDiff
                    </span>
                  </button>

                  {/* 법령명 + 조문 Badge (클릭 시 검색 모달) - 모바일/PC 모두 표시 */}
                  {currentLawName && (
                    <Button
                      variant="outline"
                      onClick={onSearchClick}
                      className="flex items-center gap-2 max-w-[180px] lg:max-w-md truncate bg-muted/50 hover:bg-accent hover:text-accent-foreground border-primary/20 hover:border-primary/40 transition-all"
                      title="검색 (Cmd+K)"
                    >
                      <Icon name="search" size={16} className="flex-shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm font-medium">
                        {currentLawName}
                        {currentArticle && ` ${currentArticle}`}
                      </span>
                    </Button>
                  )}
                </div>

                {/* 오른쪽: 버튼들 */}
                <div className="flex items-center gap-1 lg:gap-2">
                  {/* 테마 토글 */}
                  <ThemeToggle />

                  {/* 사용법 안내 */}
                  <UsageGuidePopover type={guideType} onDetailClick={onHelpClick} />

                  {/* 즐겨찾기 */}
                  {favoritesCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onFavoritesClick}
                      className="flex items-center gap-1.5 lg:gap-2 hover:bg-gray-200 dark:hover:bg-gray-800"
                      title="즐겨찾기"
                    >
                      <Icon name="star" size={16} className="text-brand-gold fill-brand-gold" />
                      <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-transparent border-brand-navy/20 text-brand-navy">
                        {favoritesCount}
                      </Badge>
                    </Button>
                  )}


                  {/* 포커스 모드 - 미구현으로 임시 숨김 */}
                  {/* <Button
                    variant={isFocusMode ? "default" : "ghost"}
                    size="icon"
                    onClick={onFocusModeToggle}
                    className="hidden lg:flex"
                    title="포커스 모드 (F11)"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button> */}

                  {/* 사용자 메뉴 */}
                  <UserMenu
                    onLoginClick={onLoginClick || (() => {})}
                    onFavoriteSelect={onFavoriteSelect || (() => {})}
                    onAllFavoritesClick={onFavoritesClick}
                  />
                </div>
              </div>
            </div>
          </div>
    </m.header>
  )
}
