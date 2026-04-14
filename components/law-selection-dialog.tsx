"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import * as VisuallyHidden from "@radix-ui/react-visually-hidden"
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

  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSearch = useCallback(async (q: string, signal: AbortSignal) => {
    setIsSearching(true)
    setSearched(true)
    try {
      const res = await fetch(`/api/law-search?query=${encodeURIComponent(q)}`, { signal })
      if (!res.ok) throw new Error('검색 실패')
      const xml = await res.text()
      if (signal.aborted) return
      const parsed = parseLawSearchXML(xml)
      setResults(parsed.map(item => ({
        lawName: item.lawName,
        lawId: item.lawId || '',
        mst: item.mst || '',
        lawType: item.lawType || '',
        effectiveDate: item.effectiveDate || '',
      })))
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return
      setResults([])
    } finally {
      if (!signal.aborted) setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (abortRef.current) abortRef.current.abort()

    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearched(false)
      setIsSearching(false)
      return
    }

    debounceRef.current = setTimeout(() => {
      const controller = new AbortController()
      abortRef.current = controller
      runSearch(q, controller.signal)
    }, 250)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, runSearch])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && results.length > 0) handleSelect(results[0])
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
        <VisuallyHidden.Root>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description || '항목을 선택하세요.'}</DialogDescription>
        </VisuallyHidden.Root>
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

        {/* 검색 입력 (실시간 자동 검색) */}
        <div className="px-4 py-3 border-b border-border">
          <div className="relative">
            <Icon
              name="search"
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <Input
              placeholder="법령명 입력 (2글자 이상, 자동 검색)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 h-9 pl-8 pr-8"
              autoFocus
            />
            {isSearching && (
              <Icon
                name="loader"
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin"
              />
            )}
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
