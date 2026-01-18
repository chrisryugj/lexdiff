"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { favoritesStore } from "@/lib/favorites-store"
import { ThemeToggle } from "@/components/theme-toggle"

interface HeaderProps {
  onReset?: () => void
  onFavoritesClick?: () => void
  onSettingsClick?: () => void
  onHelpClick?: () => void
}

export function Header({ onReset, onFavoritesClick, onSettingsClick, onHelpClick }: HeaderProps) {
  const [favoritesCount, setFavoritesCount] = useState(0)

  useEffect(() => {
    const unsubscribe = favoritesStore.subscribe((favs) => {
      setFavoritesCount(favs.length)
    })

    setFavoritesCount(favoritesStore.getFavorites().length)

    return () => { unsubscribe() }
  }, [])

  const handleHomeClick = (e: React.MouseEvent) => {
    e.preventDefault()
    if (onReset) {
      onReset()
    }
    window.history.pushState({}, "", "/")
    // 최상단으로 부드럽게 스크롤
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="container mx-auto max-w-[1280px] flex h-16 items-center justify-between px-6">
        <button
          onClick={handleHomeClick}
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <Icon name="scale" size={24} className="text-primary-foreground" />
          </div>
          <div className="flex flex-col items-start">
            <h1 className="text-lg font-bold text-foreground mb-0" style={{ fontFamily: "GiantsInline, sans-serif" }}>
              LexDiff
            </h1>
            <p className="text-sm text-muted-foreground font-bold -mt-1" style={{ fontFamily: "ReperepointSpecialItalic, sans-serif" }}>Legal AI Platform</p>
          </div>
        </button>

        {/* 우측 버튼들 */}
        <div className="flex items-center gap-2">
          {/* 테마 토글 */}
          <ThemeToggle />

          {/* 즐겨찾기 */}
          {favoritesCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onFavoritesClick} className="flex items-center gap-2">
              <Icon name="star" size={20} className="text-[var(--color-warning)] fill-[var(--color-warning)]" />
              <Badge variant="secondary" className="text-xs">
                {favoritesCount}
              </Badge>
            </Button>
          )}

          {/* 도움말 */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onHelpClick}
            title="사용 가이드"
          >
            <Icon name="help-circle" size={20} className="text-muted-foreground hover:text-foreground transition-colors" />
          </Button>

          {/* 설정 */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onSettingsClick}
            title="설정"
          >
            <Icon name="settings" size={20} className="text-muted-foreground hover:text-foreground transition-colors" />
          </Button>
        </div>
      </div>
    </header>
  )
}
