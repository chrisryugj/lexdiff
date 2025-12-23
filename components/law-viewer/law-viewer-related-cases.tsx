"use client"

import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"
import { formatPrecedentDate, type PrecedentSearchResult } from "@/lib/precedent-parser"

interface LawViewerRelatedCasesProps {
  isPrecedent: boolean
  showRelatedCases: boolean
  loadingRelatedCases: boolean
  relatedCases: PrecedentSearchResult[]
  onRelatedPrecedentClick: (prec: PrecedentSearchResult) => void
}

export function LawViewerRelatedCases({
  isPrecedent,
  showRelatedCases,
  loadingRelatedCases,
  relatedCases,
  onRelatedPrecedentClick,
}: LawViewerRelatedCasesProps) {
  if (!isPrecedent || !showRelatedCases) {
    return null
  }

  return (
    <div className="border-b border-border px-3 sm:px-4 py-2 bg-muted/30">
      <div className="flex items-center gap-2 mb-2">
        <Icon name="git-compare" size={14} className="text-blue-500" />
        <span className="text-sm font-medium">관련 심급</span>
        {loadingRelatedCases && (
          <Icon name="loader" size={14} className="animate-spin text-muted-foreground" />
        )}
      </div>
      {!loadingRelatedCases && relatedCases.length === 0 ? (
        <p className="text-sm text-muted-foreground">관련 심급 판례가 없습니다</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {relatedCases.map((prec) => (
            <button
              key={prec.id}
              onClick={() => onRelatedPrecedentClick(prec)}
              className="flex items-center gap-2 px-2 py-1.5 bg-background/80 rounded-md border border-border hover:border-primary/50 transition-colors text-left"
            >
              <span className={cn(
                "px-1.5 py-0.5 rounded text-xs font-medium shrink-0",
                prec.court.includes("대법원") ? "bg-purple-500/20 text-purple-500 dark:text-purple-400" :
                prec.court.includes("고등") ? "bg-blue-500/20 text-blue-500 dark:text-blue-400" :
                "bg-green-500/20 text-green-500 dark:text-green-400"
              )}>
                {prec.court.includes("대법원") ? "3심" :
                 prec.court.includes("고등") ? "2심" : "1심"}
              </span>
              <span className="text-sm font-medium truncate max-w-[150px]">{prec.caseNumber}</span>
              <span className="text-xs text-muted-foreground shrink-0">{formatPrecedentDate(prec.date)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
