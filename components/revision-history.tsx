"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import type { RevisionHistoryItem } from "@/lib/law-types"

interface RevisionHistoryProps {
  history: RevisionHistoryItem[]
  articleTitle?: string
}

// 유형별 배지 스타일 (타법개정 vs 일부개정 등 구분 - 명확한 색상)
const getTypeBadgeStyle = (type: string) => {
  if (type === "제정") {
    return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30"
  }
  if (type.includes("전부개정") || type.includes("전문개정")) {
    return "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/30"
  }
  if (type.includes("타법개정")) {
    // 보라색 - 다른 법에 의한 변경
    return "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/20 dark:text-purple-400 dark:border-purple-500/30"
  }
  if (type.includes("일부개정")) {
    // 파란색 - 직접 개정
    return "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-500/20 dark:text-sky-400 dark:border-sky-500/30"
  }
  if (type.includes("폐지") || type.includes("삭제")) {
    return "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-500/20 dark:text-zinc-400 dark:border-zinc-500/30"
  }
  // 기타 개정
  return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/20 dark:text-slate-400 dark:border-slate-500/30"
}

// 설명(사유) 배지 스타일 - 타법개정 vs 일부개정 구분
const getReasonBadgeStyle = (reason: string) => {
  if (reason.includes("타법개정")) {
    // 보라색 - 다른 법에 의한 변경
    return "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/20 dark:text-purple-400 dark:border-purple-500/30"
  }
  if (reason.includes("일부개정")) {
    // 파란색 - 직접 개정
    return "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-500/20 dark:text-sky-400 dark:border-sky-500/30"
  }
  if (reason.includes("전부개정") || reason.includes("전문개정")) {
    return "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/30"
  }
  if (reason.includes("제정")) {
    return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30"
  }
  return "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-500/20 dark:text-zinc-400 dark:border-zinc-500/30"
}

// 불릿 색상 (유형에 따라 - 배지와 동일한 색상 체계)
const getBulletColor = (type: string) => {
  if (type === "제정") return "bg-emerald-500"
  if (type.includes("전부개정") || type.includes("전문개정")) return "bg-rose-500"
  if (type.includes("타법개정")) return "bg-purple-400" // 보라
  if (type.includes("일부개정")) return "bg-sky-400" // 파랑
  if (type.includes("폐지") || type.includes("삭제")) return "bg-zinc-500"
  return "bg-slate-500"
}

export function RevisionHistory({ history, articleTitle }: RevisionHistoryProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [selectedRevision, setSelectedRevision] = useState<RevisionHistoryItem | null>(null)

  if (!history || history.length === 0) {
    return null
  }

  const sortedHistory = [...history].reverse()
  const displayedHistory = showAllHistory ? sortedHistory : sortedHistory.slice(0, 10)
  const hasMoreHistory = sortedHistory.length > 10

  return (
    <>
      <div className="mt-6 border border-border/50 rounded-lg overflow-hidden">
        {/* 헤더 - 심플하게 */}
        <button
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <Icon name="history" className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium text-sm leading-none">개정 이력</span>
            <span className="text-sm font-medium px-2.5 py-1 rounded-md bg-muted text-muted-foreground leading-none inline-flex items-center">
              {history.length}건
            </span>
          </div>
          <Icon name={isExpanded ? "chevron-up" : "chevron-down"} className="h-4 w-4 text-muted-foreground" />
        </button>

        {/* 트리형 이력 목록 */}
        {isExpanded && (
          <div className="px-4 pb-4 pt-1">
            {articleTitle && (
              <div className="text-sm font-medium text-foreground mb-3 pl-1">
                {articleTitle}
              </div>
            )}

            <div className="relative pl-3">
              {/* 세로 트리라인 */}
              <div className="absolute left-[5px] top-2 bottom-2 w-px bg-border" />

              <div className="space-y-0.5">
                {displayedHistory.map((item, index) => (
                    <button
                      key={index}
                      onClick={() => item.articleLink && setSelectedRevision(item)}
                      disabled={!item.articleLink}
                      className={`w-full text-left py-1.5 pl-4 pr-2 rounded transition-colors flex items-center gap-2.5 relative
                        ${item.articleLink ? "hover:bg-muted/60 cursor-pointer" : "cursor-default"}
                      `}
                    >
                      {/* 트리 불릿 */}
                      <div
                        className={`absolute left-0 w-2.5 h-2.5 rounded-full border-2 border-background ${getBulletColor(item.type)}`}
                        style={{ top: "50%", transform: "translateY(-50%)" }}
                      />

                      {/* 날짜 */}
                      <span className="text-sm text-foreground tabular-nums min-w-[85px]">
                        {item.date}
                      </span>

                      {/* 유형 배지 */}
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border ${getTypeBadgeStyle(item.type)}`}
                      >
                        {item.type}
                      </span>

                      {/* 설명 배지 */}
                      {item.description && (
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] ${getReasonBadgeStyle(item.description)}`}
                        >
                          {item.description}
                        </span>
                      )}
                    </button>
                ))}
              </div>

              {/* 더보기/접기 */}
              {hasMoreHistory && !showAllHistory && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllHistory(true)}
                  className="mt-2 ml-3 h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Icon name="chevron-down" className="h-3 w-3 mr-1" />
                  {sortedHistory.length - 10}건 더보기
                </Button>
              )}
              {showAllHistory && sortedHistory.length > 10 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllHistory(false)}
                  className="mt-2 ml-3 h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Icon name="chevron-up" className="h-3 w-3 mr-1" />
                  접기
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 개정 원문 모달 - 다크테마 */}
      <Dialog open={!!selectedRevision} onOpenChange={(open) => !open && setSelectedRevision(null)}>
        <DialogContent
          className="max-h-[65vh] overflow-hidden flex flex-col"
          style={{ width: "900px", maxWidth: "900px" }}
        >
          <DialogHeader className="border-b border-border pb-3 flex-shrink-0">
            <DialogTitle className="text-base flex items-center gap-2">
              <span className="font-medium">{selectedRevision?.date}</span>
              {selectedRevision?.type && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getTypeBadgeStyle(selectedRevision.type)}`}
                >
                  {selectedRevision.type}
                </span>
              )}
              {selectedRevision?.description && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getReasonBadgeStyle(selectedRevision.description)}`}
                >
                  {selectedRevision.description}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-hidden">
            {selectedRevision?.articleLink && (
              <div className="relative w-full h-[550px] overflow-hidden rounded">
                <iframe
                  src={selectedRevision.articleLink}
                  className="absolute top-0 left-0 w-full h-full border-0 bg-white"
                  title="개정 원문 내용"
                  style={{ colorScheme: "light" }}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
