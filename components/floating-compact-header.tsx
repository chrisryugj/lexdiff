"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Scale, Star, Settings, ChevronLeft, Search, Maximize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { favoritesStore } from "@/lib/favorites-store"
import { UsageGuidePopover } from "@/components/usage-guide-popover"

interface FloatingCompactHeaderProps {
  onBack?: () => void
  onFavoritesClick?: () => void
  onSettingsClick?: () => void
  onSearchClick?: () => void // 검색 모달 열기
  onFocusModeToggle?: () => void // 포커스 모드 토글
  currentLawName?: string // 현재 법령명
  showBackButton?: boolean
  isFocusMode?: boolean
  guideType?: 'law-search' | 'ai-search' // 사용법 안내 타입
}

export function FloatingCompactHeader({
  onBack,
  onFavoritesClick,
  onSettingsClick,
  onSearchClick,
  onFocusModeToggle,
  currentLawName,
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

  // 스크롤 감지 (모바일/PC 모두 항상 표시, 깜빡임 방지)
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      setScrolled(currentScrollY > 20)
      // 항상 표시 (깜빡임 방지)
      setIsVisible(true)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.header
          initial={{ y: 0, opacity: 1 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className={`sticky top-0 z-50 ${scrolled ? 'shadow-lg' : ''}`}
        >
          <div className="bg-background/95 backdrop-blur-xl border-b border-border">
            <div className="container mx-auto max-w-[1280px] px-4 lg:px-6">
              <div className="flex items-center justify-between h-16 lg:h-20 gap-4">
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
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                  )}

                  <button
                    onClick={onBack}
                    className="flex items-center gap-2 lg:gap-3 group flex-shrink-0"
                  >
                    <div className="relative flex h-8 w-8 lg:h-10 lg:w-10 items-center justify-center rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 shadow-lg shadow-purple-500/20 group-hover:shadow-purple-500/40 transition-shadow duration-300">
                      <Scale className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
                    </div>
                    <span
                      className="hidden md:block text-lg lg:text-xl font-bold text-foreground"
                      style={{ fontFamily: "GiantsInline, sans-serif" }}
                    >
                      LexDiff
                    </span>
                  </button>

                  {/* 법령명 Badge (클릭 시 검색 모달) - 모바일/PC 모두 표시 */}
                  {currentLawName && (
                    <Button
                      variant="outline"
                      onClick={onSearchClick}
                      className="flex items-center gap-2 max-w-[140px] lg:max-w-md truncate bg-muted/50 hover:bg-muted border-primary/20 hover:border-primary/40 transition-all"
                      title="검색 (Cmd+K)"
                    >
                      <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm font-medium">{currentLawName}</span>
                    </Button>
                  )}
                </div>

                {/* 오른쪽: 버튼들 */}
                <div className="flex items-center gap-1 lg:gap-2">
                  {/* 사용법 안내 */}
                  <UsageGuidePopover type={guideType} />

                  {/* 즐겨찾기 */}
                  {favoritesCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onFavoritesClick}
                      className="flex items-center gap-1.5 lg:gap-2"
                      title="즐겨찾기"
                    >
                      <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                      <Badge variant="secondary" className="text-xs px-1.5 py-0">
                        {favoritesCount}
                      </Badge>
                    </Button>
                  )}


                  {/* 포커스 모드 */}
                  <Button
                    variant={isFocusMode ? "default" : "ghost"}
                    size="icon"
                    onClick={onFocusModeToggle}
                    className="hidden lg:flex"
                    title="포커스 모드 (F11)"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>

                  {/* 설정 */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onSettingsClick}
                    title="설정"
                  >
                    <Settings className="h-4 w-4 lg:h-5 lg:w-5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </motion.header>
      )}
    </AnimatePresence>
  )
}
