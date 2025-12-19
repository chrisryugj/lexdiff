"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Icon } from "@/components/ui/icon"
import { favoritesStore } from "@/lib/favorites-store"
import type { Favorite } from "@/lib/law-types"
import { formatJO } from "@/lib/law-parser"

interface FavoritesPanelProps {
  onSelect: (favorite: Favorite) => void
}

export function FavoritesPanel({ onSelect }: FavoritesPanelProps) {
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [isExpanded, setIsExpanded] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const unsubscribe = favoritesStore.subscribe(setFavorites)
    setFavorites(favoritesStore.getFavorites())
    return unsubscribe
  }, [])

  // Close when clicking outside of the panel header/content
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (!isExpanded) return
      const el = containerRef.current
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setIsExpanded(false)
      }
    }
    document.addEventListener("mousedown", handleOutside)
    return () => document.removeEventListener("mousedown", handleOutside)
  }, [isExpanded])

  const handleRemove = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    favoritesStore.removeFavorite(id)
  }

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString)
    const formatted = date.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    return formatted
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return ""
    // YYYYMMDD 형식을 YYYY-MM-DD로 변환
    if (dateString.length === 8) {
      return `${dateString.substring(0, 4)}-${dateString.substring(4, 6)}-${dateString.substring(6, 8)}`
    }
    return dateString
  }

  if (favorites.length === 0) {
    return null
  }

  return (
    <Card className="p-4" id="favorites-panel" ref={containerRef}>
      <div
        className="flex items-center justify-between mb-3 cursor-pointer select-none"
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setIsExpanded((v) => !v)
          }
        }}
        aria-expanded={isExpanded}
      >
        <div
          className="flex items-center gap-2 cursor-pointer select-none"
          title="즐겨찾기 펼치기"
          onClick={() => setIsExpanded(true)}
        >
          <Icon name="star" className="h-4 w-4 text-[var(--color-warning)] fill-[var(--color-warning)]" />
          <h3 className="text-sm font-semibold text-foreground">즐겨찾기</h3>
          <Badge variant="secondary" className="text-xs">
            {favorites.length}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            setIsExpanded((v) => !v)
          }}
          className="h-7 text-xs"
          data-expand={isExpanded}
        >
          {isExpanded ? "접기" : "펼치기"}
        </Button>
      </div>

      {isExpanded && (
        <>
          <Separator className="mb-3" />
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2">
              {favorites.map((favorite) => (
                <div
                  key={favorite.id}
                  className="flex items-start justify-between gap-2 rounded-md border border-border bg-card/50 p-3 hover:bg-card transition-colors cursor-pointer"
                  onClick={() => onSelect(favorite)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-foreground text-sm">{favorite.lawTitle}</span>
                      <Badge variant="outline" className="text-xs">
                        {formatJO(favorite.jo)}
                      </Badge>
                      {favorite.effectiveDate && (
                        <Badge variant="secondary" className="text-xs">
                          {formatDate(favorite.effectiveDate)}
                        </Badge>
                      )}
                      {favorite.hasChanges && (
                        <Badge variant="destructive" className="text-xs">
                          <Icon name="alert-circle" className="h-3 w-3 mr-1" />
                          변경됨
                        </Badge>
                      )}
                    </div>
                    {favorite.notes && <p className="text-xs text-muted-foreground truncate">{favorite.notes}</p>}
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <Icon name="calendar" className="h-3 w-3" />
                      <span>추가: {formatDateTime(favorite.createdAt)}</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleRemove(favorite.id, e)}
                    className="h-6 w-6 p-0 shrink-0"
                  >
                    <Icon name="trash" className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </>
      )}
    </Card>
  )
}
