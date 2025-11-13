/**
 * File Search RAG View Component
 * Google File Search 기반 RAG 인터페이스
 * 기존 RAG 시스템과 독립적
 */

'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'

interface Citation {
  lawName: string
  articleNum: string
  text: string
  source: string
  relevanceScore?: number
}

export function FileSearchRAGView({
  initialQuery,
  onCitationClick
}: {
  initialQuery: string
  onCitationClick?: (lawName: string, articleNum: string) => void
}) {
  const [query, setQuery] = useState(initialQuery || '')
  const [analysis, setAnalysis] = useState<string>('')
  const [citations, setCitations] = useState<Citation[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * File Search RAG 쿼리 실행
   */
  async function handleFileSearchQuery(searchQuery: string) {
    try {
      setError(null)
      setIsAnalyzing(true)
      setAnalysis('')
      setCitations([])

      const response = await fetch('/api/file-search-rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery })
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      // SSE 스트리밍 읽기
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body')
      }

      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)

            if (data === '[DONE]') {
              setIsAnalyzing(false)
              continue
            }

            try {
              const parsed = JSON.parse(data)

              if (parsed.type === 'text') {
                setAnalysis(prev => prev + parsed.text)
              } else if (parsed.type === 'citations') {
                setCitations(parsed.citations || [])
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
        }
      }

      setIsAnalyzing(false)

    } catch (err) {
      console.error('File Search error:', err)
      setError(err instanceof Error ? err.message : '분석 중 오류가 발생했습니다.')
      setIsAnalyzing(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-900">
      {/* Left: Info Panel */}
      <div className="w-80 border-r border-gray-700 bg-gray-800 overflow-y-auto">
        <div className="p-4">
          <h3 className="font-bold text-lg mb-4 text-white">🔍 File Search RAG</h3>

          <div className="space-y-4">
            <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-3">
              <p className="text-sm text-blue-200 font-medium mb-2">✨ 특징</p>
              <ul className="text-xs text-blue-300 space-y-1">
                <li>• 전체 법령 검색</li>
                <li>• 자동 Citation</li>
                <li>• 빠른 응답</li>
                <li>• Zero 관리</li>
              </ul>
            </div>

            {citations.length > 0 && (
              <div className="bg-gray-700 rounded-lg p-3">
                <p className="text-sm font-medium text-white mb-2">📚 참고 조문 ({citations.length}개)</p>
                <div className="space-y-2">
                  {citations.map((citation, idx) => (
                    <button
                      key={idx}
                      onClick={() => onCitationClick?.(citation.lawName, citation.articleNum)}
                      className="w-full bg-gray-800 hover:bg-gray-750 p-2 rounded text-xs text-left transition-colors border border-transparent hover:border-blue-500"
                    >
                      <p className="text-blue-400 font-medium mb-1">
                        {citation.lawName} {citation.articleNum}
                      </p>
                      <p className="text-gray-300 line-clamp-2">{citation.text}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="text-xs text-gray-500">
              <p>💡 Google File Search 기반</p>
              <p className="mt-1">30개 법령 자동 검색</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Analysis Result */}
      <div className="flex-1 flex flex-col bg-gray-900">
        {/* Analysis Display */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-2">
                <span className="text-red-400">❌</span>
                <div className="flex-1">
                  <h4 className="font-medium text-red-200">오류 발생</h4>
                  <p className="text-sm text-red-300 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {analysis && (
            <div className="prose prose-invert max-w-none">
              <ReactMarkdown>{analysis}</ReactMarkdown>
            </div>
          )}

          {isAnalyzing && !analysis && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
                <p className="text-gray-200">File Search로 분석 중...</p>
                <p className="text-sm text-gray-400 mt-2">
                  전체 법령에서 관련 내용을 검색하고 있습니다
                </p>
              </div>
            </div>
          )}

          {!analysis && !isAnalyzing && !error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-400">
                <p className="text-lg">File Search RAG</p>
                <p className="text-sm mt-2">질문을 입력하고 분석을 시작하세요</p>
              </div>
            </div>
          )}
        </div>

        {/* Query Input */}
        {!isAnalyzing && (
          <div className="border-t border-gray-700 p-4 bg-gray-800">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (query.trim()) {
                  handleFileSearchQuery(query.trim())
                }
              }}
            >
              <div className="flex gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  type="text"
                  placeholder="질문을 입력하세요 (예: 관세법의 목적은?)"
                  className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isAnalyzing}
                />
                <button
                  type="submit"
                  disabled={isAnalyzing || !query.trim()}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  분석
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                💡 30개 법령 전체에서 자동 검색됩니다
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
