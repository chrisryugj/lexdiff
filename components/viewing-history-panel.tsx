"use client"

import { useState, useEffect } from "react"
import { Icon } from "@/components/ui/icon"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  viewingHistoryStore,
  type ViewingRecord,
  type ViewingCategory,
} from "@/lib/viewing-history-store"

const CATEGORY_LABEL: Record<ViewingCategory, string> = {
  law: "법령",
  ordinance: "조례",
  precedent: "판례",
}

const FILTERS: Array<{ value: ViewingCategory | "all"; label: string }> = [
  { value: "all", label: "전체" },
  { value: "law", label: "법령" },
  { value: "ordinance", label: "조례" },
  { value: "precedent", label: "판례" },
]

function formatWhen(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return "방금"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}일 전`
  const d = new Date(iso)
  return `${d.getMonth() + 1}.${d.getDate()}`
}

/**
 * 최근 조회 이력 패널 — 사용자가 본 법령/조례/판례를 카테고리별로 보여주고 재조회.
 * 게스트/로그인 모두 동작(viewing-history-store 하이브리드).
 */
export function ViewingHistoryPanel({
  onReview,
  hideWhenEmpty = false,
}: {
  onReview: (record: ViewingRecord) => void
  hideWhenEmpty?: boolean
}) {
  const [records, setRecords] = useState<ViewingRecord[]>([])
  const [filter, setFilter] = useState<ViewingCategory | "all">("all")

  useEffect(() => {
    setRecords(viewingHistoryStore.getRecords())
    const unsubscribe = viewingHistoryStore.subscribe(setRecords)
    return () => {
      unsubscribe()
    }
  }, [])

  if (hideWhenEmpty && records.length === 0) return null

  const filtered = filter === "all" ? records : records.filter((r) => r.category === filter)

  return (
    <Card className="p-4" role="region" aria-label="최근 조회 이력">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="clock" className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">최근 조회</h3>
          {records.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {records.length}
            </Badge>
          )}
        </div>
        {records.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => viewingHistoryStore.clearAll(filter === "all" ? undefined : filter)}
            className="h-7 text-xs"
          >
            {filter === "all" ? "전체 삭제" : `${CATEGORY_LABEL[filter]} 삭제`}
          </Button>
        )}
      </div>

      {records.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          조회한 법령·조례·판례가 여기 모입니다.
        </p>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-1">
            {FILTERS.map((f) => {
              const count =
                f.value === "all" ? records.length : records.filter((r) => r.category === f.value).length
              if (f.value !== "all" && count === 0) return null
              return (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  aria-pressed={filter === f.value}
                  className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                    filter === f.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {f.label}
                </button>
              )
            })}
          </div>

          <div className="space-y-1">
            {filtered.map((rec) => (
              <div
                key={rec.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/50 p-2 transition-colors hover:bg-card"
              >
                <button
                  onClick={() => onReview(rec)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {CATEGORY_LABEL[rec.category]}
                  </Badge>
                  <span className="truncate text-sm text-foreground hover:text-primary">{rec.title}</span>
                  {rec.category === "law" && rec.metadata?.article ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {String(rec.metadata.article)}
                    </span>
                  ) : null}
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="text-[11px] text-muted-foreground">{formatWhen(rec.lastViewedAt)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => viewingHistoryStore.removeRecord(rec.id)}
                    className="h-6 w-6 p-0"
                    aria-label={`${rec.title} 삭제`}
                  >
                    <Icon name="x" className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}
