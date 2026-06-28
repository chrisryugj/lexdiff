"use client"

import { useMemo, useState } from "react"
import { diffLines, type DiffOp } from "@/lib/text-line-diff"
import { Icon } from "@/components/ui/icon"

type Row = DiffOp | { type: "gap"; count: number }

const CONTEXT = 2 // 변경 라인 주변으로 노출할 유지 라인 수

/** 변경에서 먼 '동일' 라인 런을 접어 변경 지점만 부각한다(결정론 — 입력 같으면 출력 같음). */
function collapseSame(ops: DiffOp[], context: number): Row[] {
  const keep = new Array(ops.length).fill(false)
  ops.forEach((op, idx) => {
    if (op.type !== "same") {
      for (let k = Math.max(0, idx - context); k <= Math.min(ops.length - 1, idx + context); k++) {
        keep[k] = true
      }
    }
  })
  const rows: Row[] = []
  let gap = 0
  ops.forEach((op, idx) => {
    if (keep[idx]) {
      if (gap > 0) {
        rows.push({ type: "gap", count: gap })
        gap = 0
      }
      rows.push(op)
    } else {
      gap++
    }
  })
  if (gap > 0) rows.push({ type: "gap", count: gap })
  return rows
}

/**
 * 결정론적 신·구 조문 라인 diff 뷰.
 * AI 해설과 분리된 "사실" 레이어 — 무엇이 바뀌었는지 환각 없이 정확히 표시.
 */
export function RevisionLineDiff({ oldContent, newContent }: { oldContent: string; newContent: string }) {
  const { ops, added, removed, truncated } = useMemo(
    () => diffLines(oldContent, newContent),
    [oldContent, newContent],
  )
  const [showAll, setShowAll] = useState(false)

  if (added === 0 && removed === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        두 시행본 간 조문 본문에 텍스트 차이가 없습니다.
      </div>
    )
  }

  const hasCollapsible = ops.some((o) => o.type === "same")
  const rows = showAll ? ops.map((o) => o as Row) : collapseSame(ops, CONTEXT)

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 border-b border-border">
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400">
            <span className="tabular-nums">−{removed}</span> 삭제
          </span>
          <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
            <span className="tabular-nums">+{added}</span> 추가
          </span>
          {truncated && <span className="text-muted-foreground">· 일부 생략(긴 본문)</span>}
        </div>
        {hasCollapsible && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            <Icon name={showAll ? "chevron-up" : "chevron-down"} size={12} />
            {showAll ? "변경 부분만" : "전체 보기"}
          </button>
        )}
      </div>

      <div className="divide-y divide-border/40 text-[13px] leading-relaxed max-h-[40vh] overflow-y-auto">
        {rows.map((row, idx) => {
          if (row.type === "gap") {
            return (
              <div key={idx} className="px-3 py-1 text-center text-[11px] text-muted-foreground/60 bg-muted/20 select-none">
                ··· {row.count}줄 동일 ···
              </div>
            )
          }
          const cls =
            row.type === "del"
              ? "bg-rose-500/10 text-rose-900 dark:text-rose-200"
              : row.type === "add"
                ? "bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
                : "text-foreground/70"
          const marker = row.type === "del" ? "−" : row.type === "add" ? "+" : " "
          return (
            <div key={idx} className={`flex gap-2 px-3 py-1.5 ${cls}`}>
              <span className="select-none font-mono text-muted-foreground/70 flex-shrink-0">{marker}</span>
              <span className="min-w-0 break-words whitespace-pre-wrap">{row.text}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
