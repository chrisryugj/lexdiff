/**
 * Law Parser Panel Component
 * Phase 1: Search and parse laws from law.go.kr API
 */

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Search } from 'lucide-react'

interface ParsedLaw {
  lawId: string
  lawName: string
  effectiveDate: string
  articleCount: number
  totalCharacters: number
  markdown: string
  markdownSize: number
}

interface Candidate {
  lawId: string
  lawName: string
  effectiveDate: string
  promulgationDate: string
  revisionType: string
}

interface LawParserPanelProps {
  onParsed: (law: ParsedLaw) => void
}

export function LawParserPanel({ onParsed }: LawParserPanelProps) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])

  async function handleSearch(searchQuery: string) {
    if (!searchQuery.trim()) {
      setError('검색어를 입력해주세요')
      return
    }

    setLoading(true)
    setError(null)
    setCandidates([])

    try {
      const response = await fetch('/api/admin/parse-law', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: searchQuery })
      })

      const data = await response.json()

      if (data.success) {
        // Successfully parsed
        onParsed(data.law)
        setQuery('')
      } else if (data.candidates && data.candidates.length > 0) {
        // Multiple candidates - show selection UI
        setCandidates(data.candidates)
      } else {
        setError(data.error || '검색 결과가 없습니다')
      }
    } catch (err: any) {
      setError(err.message || '검색 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    handleSearch(query)
  }

  function handleSelectCandidate(lawId: string) {
    handleSearch(lawId)
    setCandidates([])
  }

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="법령명 또는 법령 ID 입력 (예: 관세법, 001556, 소득세...)"
          className="bg-card/50 backdrop-blur-sm border-border/50 text-foreground h-12"
          disabled={loading}
        />
        <Button
          type="submit"
          disabled={loading || !query.trim()}
          className="w-full gap-2 shadow-lg shadow-primary/20"
          size="default"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              검색 중...
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              검색
            </>
          )}
        </Button>
      </form>

      {error && (
        <div className="p-4 bg-warning/10 backdrop-blur-sm border border-warning/30 rounded-xl">
          <p className="text-warning text-sm">⚠ {error}</p>
        </div>
      )}

      {candidates.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{candidates.length}개의 후보를 찾았습니다</p>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {candidates.map((candidate, index) => (
              <button
                key={candidate.lawId}
                onClick={() => handleSelectCandidate(candidate.lawId)}
                className="w-full p-4 bg-card/30 hover:bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/30 rounded-xl text-left transition-all duration-200 hover:shadow-md"
                style={{
                  animation: `fadeInUp 0.3s ease-out ${index * 50}ms both`
                }}
              >
                <div className="font-medium text-foreground">{candidate.lawName}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  법령 ID: {candidate.lawId}
                  {candidate.effectiveDate && ` · 시행일: ${formatDate(candidate.effectiveDate)}`}
                  {candidate.revisionType && ` · ${candidate.revisionType}`}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="p-4 bg-muted/30 backdrop-blur-sm border border-border/50 rounded-xl">
        <div className="text-sm text-muted-foreground space-y-1">
          <div>• "관세법" - 법령명으로 검색</div>
          <div>• "001556" - 법령 ID로 직접 조회</div>
          <div>• "소득세" - 부분 검색 (여러 후보 표시)</div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) {
    return dateStr
  }

  const year = dateStr.substring(0, 4)
  const month = dateStr.substring(4, 6)
  const day = dateStr.substring(6, 8)

  return `${year}-${month}-${day}`
}
