"use client"

import { useState, useCallback } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Icon } from "@/components/ui/icon"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { parseLawSearchXML } from "@/lib/law-search-parser"

interface LawSearchResult {
  lawName: string
  lawId: string
  mst: string
  lawType?: string
  effectiveDate?: string
}

interface LawSelectionDialogProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (law: LawSearchResult) => void
  title: string
  description?: string
}

export function LawSelectionDialog({
  isOpen,
  onClose,
  onSelect,
  title,
  description,
}: LawSelectionDialogProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LawSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return
    setIsSearching(true)
    setSearched(true)

    try {
      const res = await fetch(`/api/law-search?query=${encodeURIComponent(query.trim())}`)
      if (!res.ok) throw new Error('검색 실패')
      const xml = await res.text()
      const parsed = parseLawSearchXML(xml)
      setResults(parsed.map(item => ({
        lawName: item.lawName,
        lawId: item.lawId || '',
        mst: item.mst || '',
        lawType: item.lawType || '',
        effectiveDate: item.effectiveDate || '',
      })))
    } catch {
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [query])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  const handleSelect = (law: LawSearchResult) => {
    onSelect(law)
    onClose()
    setQuery('')
    setResults([])
    setSearched(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[480px] p-0 gap-0 flex flex-col max-h-[70vh]"
      >
        {/* 헤더 */}
        <div className="border-b border-border bg-muted/30 px-4 py-3 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-semibold text-sm">{title}</h3>
            {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
            <Icon name="x" size={16} />
          </Button>
        </div>

        {/* 검색 입력 */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Input
              placeholder="법령명 입력 (예: 건축법, 국토계획법)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 h-9"
              autoFocus
            />
            <Button size="sm" onClick={handleSearch} disabled={isSearching || !query.trim()} className="h-9 px-3">
              {isSearching ? (
                <Icon name="loader" size={14} className="animate-spin" />
              ) : (
                <Icon name="search" size={14} />
              )}
            </Button>
          </div>
        </div>

        {/* 결과 */}
        <ScrollArea className="flex-1 min-h-0">
          {isSearching ? (
            <div className="flex items-center justify-center py-10">
              <Icon name="loader" size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : results.length > 0 ? (
            <div className="divide-y divide-border">
              {results.map((law, i) => (
                <button
                  key={`${law.lawId}-${i}`}
                  onClick={() => handleSelect(law)}
                  className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{law.lawName}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                      {law.lawType && <Badge variant="outline" className="text-[10px] h-4">{law.lawType}</Badge>}
                      {law.effectiveDate && <span>{law.effectiveDate}</span>}
                    </div>
                  </div>
                  <Icon name="arrow-right" size={14} className="text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          ) : searched ? (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm text-muted-foreground">검색 결과가 없습니다.</p>
            </div>
          ) : (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm text-muted-foreground">법령명을 검색하세요.</p>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
