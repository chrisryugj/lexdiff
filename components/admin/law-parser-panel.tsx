/**
 * Law Parser Panel Component
 * Phase 1: Search and parse laws from law.go.kr API
 */

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Icon } from '@/components/ui/icon'

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
  const [selectedLawId, setSelectedLawId] = useState<string | null>(null)

  async function handleSearch(searchQuery: string, fromCandidateSelection: boolean = false) {
    if (!searchQuery.trim()) {
      setError('검색어를 입력해주세요')
      return
    }

    setLoading(true)
    setError(null)

    // Only clear candidates if this is a new search (not from candidate selection)
    if (!fromCandidateSelection) {
      setCandidates([])
    }

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
        // Successfully parsed - now save it to file
        const saveResponse = await fetch('/api/admin/save-parsed', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            lawId: data.law.lawId,
            markdown: data.law.markdown,
            metadata: {
              lawId: data.law.lawId,
              lawName: data.law.lawName,
              effectiveDate: data.law.effectiveDate,
              promulgationDate: data.law.promulgationDate,
              promulgationNumber: data.law.promulgationNumber,
              revisionType: data.law.revisionType,
              articleCount: data.law.articleCount,
              totalCharacters: data.law.totalCharacters
            }
          })
        })

        const saveData = await saveResponse.json()

        if (!saveData.success) {
          setError(`파싱은 성공했으나 저장 실패: ${saveData.error}`)
          return
        }

        // Notify parent component
        onParsed(data.law)

        // Clear candidates and show success
        setCandidates([])
        setQuery('')
        setError(null)

        // Show brief success message
        setError(`✅ "${data.law.lawName}" 다운로드 및 저장 완료 (${data.law.articleCount}개 조문)`)
        setTimeout(() => setError(null), 3000)
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

  async function handleSelectCandidate(lawId: string) {
    // Mark this law as selected (for loading indicator)
    setSelectedLawId(lawId)

    // Pass true to indicate this is from candidate selection
    // This will keep the candidates list visible while loading
    await handleSearch(lawId, true)

    // Clear selection after completion
    setSelectedLawId(null)
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
              <Icon name="loader" className="h-4 w-4 animate-spin" />
              검색 중...
            </>
          ) : (
            <>
              <Icon name="search" className="h-4 w-4" />
              검색
            </>
          )}
        </Button>
      </form>

      {error && (
        <div
          className={`p-4 backdrop-blur-sm border rounded-xl ${
            error.startsWith('✅')
              ? 'bg-accent/10 border-accent/30'
              : 'bg-warning/10 border-warning/30'
          }`}
        >
          <p className={`text-sm ${error.startsWith('✅') ? 'text-accent' : 'text-warning'}`}>
            {error.startsWith('✅') ? error : `⚠ ${error}`}
          </p>
        </div>
      )}

      {candidates.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{candidates.length}개의 후보를 찾았습니다</p>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {candidates.map((candidate, index) => {
              const isLoading = selectedLawId === candidate.lawId

              return (
                <button
                  key={candidate.lawId}
                  onClick={() => handleSelectCandidate(candidate.lawId)}
                  disabled={loading}
                  className={`w-full p-4 backdrop-blur-sm border rounded-xl text-left transition-all duration-200 ${
                    isLoading
                      ? 'bg-primary/10 border-primary/30 shadow-md'
                      : 'bg-card/30 hover:bg-card/50 border-border/50 hover:border-primary/30 hover:shadow-md'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  style={{
                    animation: `fadeInUp 0.3s ease-out ${index * 50}ms both`
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{candidate.lawName}</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        법령 ID: {candidate.lawId}
                        {candidate.effectiveDate && ` · 시행일: ${formatDate(candidate.effectiveDate)}`}
                        {candidate.revisionType && ` · ${candidate.revisionType}`}
                      </div>
                    </div>
                    {isLoading && <Icon name="loader" className="h-5 w-5 text-primary animate-spin ml-3" />}
                  </div>
                </button>
              )
            })}
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
