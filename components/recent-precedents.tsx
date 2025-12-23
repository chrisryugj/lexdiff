"use client"

import { useState, useEffect } from "react"
import { Icon } from "@/components/ui/icon"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { debugLogger } from "@/lib/debug-logger"
import {
  getRecentPrecedents,
  removeRecentPrecedent,
  clearRecentPrecedents,
  type RecentPrecedent
} from "@/lib/recent-precedent-store"

interface RecentPrecedentsProps {
  onSelect: (precedent: RecentPrecedent) => void
}

export function RecentPrecedents({ onSelect }: RecentPrecedentsProps) {
  const [precedents, setPrecedents] = useState<RecentPrecedent[]>([])

  useEffect(() => {
    loadPrecedents()
  }, [])

  const loadPrecedents = () => {
    try {
      const stored = getRecentPrecedents()
      setPrecedents(stored)
    } catch (error) {
      debugLogger.error("최근 판례 로드 실패", error)
    }
  }

  const handleRemove = (id: string) => {
    removeRecentPrecedent(id)
    loadPrecedents()
  }

  const handleClearAll = () => {
    clearRecentPrecedents()
    setPrecedents([])
  }

  if (precedents.length === 0) {
    return null
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon name="court" className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">최근 조회 판례</h3>
          <Badge variant="secondary" className="text-xs">
            {precedents.length}
          </Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={handleClearAll} className="h-7 text-xs">
          전체 삭제
        </Button>
      </div>
      <div className="space-y-1">
        {precedents.map((precedent) => (
          <div
            key={precedent.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/50 p-2 hover:bg-card transition-colors"
          >
            <button
              onClick={() => onSelect(precedent)}
              className="flex-1 text-left text-sm text-foreground hover:text-primary"
            >
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs shrink-0">
                  {precedent.court}
                </Badge>
                <span className="font-medium truncate">{precedent.caseNumber}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 truncate">
                {precedent.caseName}
              </div>
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleRemove(precedent.id)}
              className="h-6 w-6 p-0 shrink-0"
            >
              <Icon name="x" className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </Card>
  )
}
