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
  maxItems,
  embedded = false,
}: {
  onReview: (record: ViewingRecord) => void
  hideWhenEmpty?: boolean
  maxItems?: number
  // embedded: Cmd+K 검색 모달 등 드롭다운 안에 들어갈 때 — Card 테두리/그림자 없이
  // 형제 섹션('최근 검색' 등)과 동일한 평평한 sticky 헤더 섹션으로 렌더(필터/전체삭제 숨김).
  embedded?: boolean
}) {
  const [records, setRecords] = useState<ViewingRecord[]>([])
  const [filter, setFilter] = useState<ViewingCategory | "all">("all")
  const [hydrating, setHydrating] = useState(false)
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)

  useEffect(() => {
    setRecords(viewingHistoryStore.getRecords())
    setHydrating(viewingHistoryStore.isHydrating())
    const unsubscribe = viewingHistoryStore.subscribe((recs) => {
      setRecords(recs)
      setHydrating(viewingHistoryStore.isHydrating())
    })
    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (filter !== "all" && records.length > 0) {
      const hasCurrentFilter = records.some((r) => r.category === filter)
      if (!hasCurrentFilter) {
        setFilter("all")
      }
    }
  }, [filter, records])

  if (hideWhenEmpty && records.length === 0 && !hydrating) return null

  const filtered = filter === "all" ? records : records.filter((r) => r.category === filter)

  // 임베드 모드: 형제 섹션과 동일한 평평한 sticky 헤더 (필터/전체삭제 없음)
  const headerNode = embedded ? (
    <div className="sticky top-0 z-10 flex items-center gap-2 bg-background px-3 py-2 text-xs font-semibold text-muted-foreground">
      <Icon name="clock" className="h-3.5 w-3.5" />
      <span>최근 조회</span>
      {records.length > 0 && (
        <Badge variant="secondary" className="ml-auto text-xs">
          {records.length}
        </Badge>
      )}
    </div>
  ) : (
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
          confirmClearOpen ? (
            // 인라인 2단계 확인(Radix Dialog 미사용 → Cmd+K 중첩 시 ESC 충돌 회피)
            <div className="flex items-center gap-1">
              <span role="alert" className="mr-0.5 text-[11px] text-muted-foreground">되돌릴 수 없어요</span>
              <Button variant="ghost" size="sm" autoFocus onClick={() => setConfirmClearOpen(false)} className="h-7 text-xs">
                취소
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  viewingHistoryStore.clearAll(filter === "all" ? undefined : filter)
                  setConfirmClearOpen(false)
                }}
              >
                {filter === "all" ? "전체 삭제" : `${CATEGORY_LABEL[filter]} 삭제`}
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmClearOpen(true)}
              className="h-7 text-xs"
            >
              {filter === "all" ? "전체 삭제" : `${CATEGORY_LABEL[filter]} 삭제`}
            </Button>
          )
        )}
      </div>
  )

  const body = (
    <>
      {headerNode}

      {records.length === 0 ? (
        hydrating ? (
          <div className="space-y-1" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-md bg-muted/50" />
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-xs text-muted-foreground">
            조회한 법령·조례·판례가 여기 모입니다.
          </p>
        )
      ) : (
        <>
          {!embedded && (
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
          )}

          <div className="space-y-1">
            {(maxItems ? filtered.slice(0, maxItems) : filtered).map((rec) => (
              <div
                key={rec.id}
                className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-card/50 p-2 transition-colors hover:bg-card"
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
                    className="h-9 w-9 p-0"
                    aria-label={`${rec.title} 삭제`}
                  >
                    <Icon name="x" className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )

  if (embedded) {
    return (
      <div role="region" aria-label="최근 조회 이력">
        {body}
      </div>
    )
  }

  return (
    <Card className="p-4" role="region" aria-label="최근 조회 이력">
      {body}
    </Card>
  )
}
