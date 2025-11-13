/**
 * Law Parser Panel Component
 * Phase 1: Search and parse laws from law.go.kr API
 */

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">📝 법령 검색 및 파싱</h2>
        <p className="text-sm text-gray-400">
          법령명 또는 법령 ID를 입력하세요. 정확히 일치하면 바로 파싱되고, 여러 후보가 있으면 선택할 수 있습니다.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="예: 관세법, 소득세법, 001556..."
          className="flex-1 bg-gray-800 border-gray-700 text-white"
          disabled={loading}
        />
        <Button type="submit" disabled={loading || !query.trim()} className="bg-blue-600 hover:bg-blue-700">
          {loading ? '검색 중...' : '검색'}
        </Button>
      </form>

      {error && (
        <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg">
          <p className="text-red-400">❌ {error}</p>
        </div>
      )}

      {candidates.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-gray-300">🔍 {candidates.length}개의 후보를 찾았습니다. 선택하세요:</p>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {candidates.map((candidate) => (
              <button
                key={candidate.lawId}
                onClick={() => handleSelectCandidate(candidate.lawId)}
                className="w-full p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-blue-500 rounded-lg text-left transition-colors"
              >
                <div className="font-medium text-white">{candidate.lawName}</div>
                <div className="text-sm text-gray-400 mt-1">
                  법령 ID: {candidate.lawId}
                  {candidate.effectiveDate && ` · 시행일: ${formatDate(candidate.effectiveDate)}`}
                  {candidate.revisionType && ` · ${candidate.revisionType}`}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
        <h3 className="font-medium text-white mb-2">💡 사용 예시:</h3>
        <ul className="text-sm space-y-1 text-gray-300">
          <li>• "관세법" - 법령명으로 검색</li>
          <li>• "001556" - 법령 ID로 직접 조회</li>
          <li>• "소득세" - 부분 검색 (여러 후보 표시)</li>
        </ul>
      </div>
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
