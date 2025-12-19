"use client"

import type React from "react"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Icon } from "@/components/ui/icon"
import { favoritesStore } from "@/lib/favorites-store"
import type { Favorite } from "@/lib/law-types"
import { formatJO } from "@/lib/law-parser"
import { useState, useEffect } from "react"

interface FavoritesDialogProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (favorite: Favorite) => void
}

export function FavoritesDialog({ isOpen, onClose, onSelect }: FavoritesDialogProps) {
  const [favorites, setFavorites] = useState<Favorite[]>([])

  useEffect(() => {
    const unsubscribe = favoritesStore.subscribe(setFavorites)
    setFavorites(favoritesStore.getFavorites())
    return unsubscribe
  }, [])

  const handleRemove = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    favoritesStore.removeFavorite(id)
  }

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString)
    return date.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return ""
    // YYYYMMDD 형식을 YYYY-MM-DD로 변환
    if (dateString.length === 8) {
      return `${dateString.substring(0, 4)}-${dateString.substring(4, 6)}-${dateString.substring(6, 8)}`
    }
    return dateString
  }

  const handleSelectAndClose = (favorite: Favorite) => {
    onSelect(favorite)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="file-text" className="h-5 w-5" />
            즐겨찾기
            <Badge variant="secondary" className="ml-2">
              {favorites.length}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <Separator />

        {favorites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Icon name="file-text" className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">즐겨찾기한 법령이 없습니다.</p>
          </div>
        ) : (
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-3">
              {favorites.map((favorite) => (
                <div
                  key={favorite.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-border bg-card/50 p-4 hover:bg-card transition-colors cursor-pointer"
                  onClick={() => handleSelectAndClose(favorite)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-foreground">{favorite.lawTitle}</span>
                      <Badge variant="outline">{formatJO(favorite.jo)}</Badge>
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
                    {favorite.notes && <p className="text-sm text-muted-foreground mb-2">{favorite.notes}</p>}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Icon name="calendar" className="h-3 w-3" />
                      <span>추가: {formatDateTime(favorite.createdAt)}</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleRemove(favorite.id, e)}
                    className="h-8 w-8 p-0 shrink-0"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
