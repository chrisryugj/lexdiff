"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ChevronDown, ChevronUp, History } from "lucide-react"
import type { RevisionHistoryItem } from "@/lib/law-types"

interface RevisionHistoryProps {
  history: RevisionHistoryItem[]
  articleTitle?: string
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

  const getReasonBadgeVariant = (reason: string) => {
    if (reason.includes("전부개정") || reason.includes("전문개정")) return "destructive"
    if (reason.includes("제정")) return "secondary"
    return "default" // 조문변경 and others get blue
  }

  const getIconColor = (type: string, description?: string) => {
    // Red for complete revisions or new enactments
    if (description?.includes("전부개정") || description?.includes("전문개정") || type.includes("제정")) {
      return "text-red-500"
    }
    // Blue for all other types (partial revisions, etc.)
    return "text-blue-500"
  }

  return (
    <>
      <div className="mt-6 border border-border rounded-lg overflow-hidden">
        <Button
          variant="ghost"
          className="w-full flex items-center justify-between p-4 hover:bg-secondary/50"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-blue-500" />
            <span className="font-semibold text-sm">개정 이력</span>
            <Badge variant="secondary" className="text-xs">
              {history.length}건
            </Badge>
          </div>
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>

        {isExpanded && (
          <div className="p-4 pt-2 bg-secondary/20">
            {articleTitle && <div className="font-semibold text-base mb-3 text-foreground">{articleTitle}</div>}
            <div className="space-y-0 relative">
              {/* Vertical line for tree structure */}
              <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />

              {displayedHistory.map((item, index) => (
                <button
                  key={index}
                  onClick={() => item.articleLink && setSelectedRevision(item)}
                  className="w-full text-left hover:bg-secondary/50 rounded px-2 py-1 transition-colors flex items-center gap-2 relative"
                  disabled={!item.articleLink}
                >
                  {/* Tree node dot with color */}
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 z-10 ${getIconColor(item.type, item.description)}`}
                    style={{ backgroundColor: "currentColor" }}
                  />

                  {/* Date - smaller font */}
                  <span className="text-foreground font-normal text-xs min-w-[85px]">{item.date}</span>

                  {/* Type - smaller font, reduced spacing */}
                  <span className="text-foreground font-normal text-xs min-w-[70px]">{item.type}</span>

                  {/* Badge - reduced spacing */}
                  {item.description && (
                    <Badge variant={getReasonBadgeVariant(item.description)} className="text-xs font-normal">
                      {item.description}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
            {hasMoreHistory && !showAllHistory && (
              <div className="pt-2 pl-5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllHistory(true)}
                  className="h-auto py-1 px-2 text-xs text-blue-500 hover:text-blue-600"
                >
                  <ChevronDown className="h-3 w-3 mr-1" />
                  10개 더보기
                </Button>
              </div>
            )}
            {showAllHistory && (
              <div className="pt-2 pl-5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllHistory(false)}
                  className="h-auto py-1 px-2 text-xs text-blue-500 hover:text-blue-600"
                >
                  <ChevronUp className="h-3 w-3 mr-1" />
                  접기
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={!!selectedRevision} onOpenChange={(open) => !open && setSelectedRevision(null)}>
        <DialogContent
          className="h-[90vh] overflow-hidden flex flex-col bg-white text-black"
          style={{ width: "1000px", maxWidth: "1000px" }}
        >
          <DialogHeader>
            <DialogTitle className="text-lg text-black">
              {selectedRevision?.date} {selectedRevision?.type}
              {selectedRevision?.description && (
                <Badge variant={getReasonBadgeVariant(selectedRevision.description)} className="ml-2">
                  {selectedRevision.description}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden min-h-0 bg-white">
            {selectedRevision?.articleLink && (
              <iframe
                src={selectedRevision.articleLink}
                className="w-full h-full border-0 rounded bg-white"
                title="조문 내용"
                style={{ colorScheme: "light" }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
