"use client"

import { useState, useEffect, useRef } from "react"
import { m } from "framer-motion"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { favoritesStore } from "@/lib/favorites-store"
import { UsageGuidePopover } from "@/components/usage-guide-popover"
import { ThemeToggle } from "@/components/theme-toggle"

interface FloatingCompactHeaderProps {
  onBack?: () => void
  onHomeClick?: () => void // 로고 클릭 시 홈으로 이동
  onFavoritesClick?: () => void
  onSettingsClick?: () => void
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
  onSettingsClick,
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
  const [isVisible, setIsVisible] = useState(true)

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

  // 스크롤 감지 — 스크롤 중 숨김, 멈추면 복귀
  const lastScrollY = useRef(0)
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY
      setScrolled(y > 20)

      // 최상단이면 항상 표시
      if (y < 30) {
        setIsVisible(true)
        lastScrollY.current = y
        return
      }

      // 스크롤 방향 감지: 아래로 일정 이상 움직이면 숨김
      const delta = y - lastScrollY.current
      if (Math.abs(delta) > 8) {
        if (delta > 0) {
          // 아래로 스크롤 → 숨김
          setIsVisible(false)
        } else {
          // 위로 스크롤 → 즉시 표시
          setIsVisible(true)
        }
        lastScrollY.current = y
      }

      // 스크롤 멈춤 감지 (200ms 무반응 → 복귀)
      if (scrollTimer.current) clearTimeout(scrollTimer.current)
      scrollTimer.current = setTimeout(() => {
        setIsVisible(true)
      }, 200)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (scrollTimer.current) clearTimeout(scrollTimer.current)
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
                    <div className="flex h-8 w-8 lg:h-9 lg:w-9 items-center justify-center rounded-sm bg-[#1a2b4c] dark:bg-[#e2a85d] transition-transform duration-300 group-hover:scale-105">
                      <Icon name="scale" size={18} className="text-white dark:text-[#0c0e14]" />
                    </div>
                    <span
                      className="hidden md:block text-lg lg:text-xl font-bold text-[#1a2b4c] dark:text-[#e2a85d] tracking-tight"
                      style={{ fontFamily: "'RIDIBatang', serif" }}
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
                      <Icon name="star" size={16} className="text-[#d4af37] fill-[#d4af37]" />
                      <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-transparent border-[#1a2b4c]/20 dark:border-[#e2a85d]/30 text-[#1a2b4c] dark:text-[#e2a85d]">
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

                  {/* 설정 */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onSettingsClick}
                    title="설정"
                  >
                    <Icon name="settings" size={20} />
                  </Button>
                </div>
              </div>
            </div>
          </div>
    </m.header>
  )
}
