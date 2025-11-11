/**
 * RAG Analysis View Component
 * Small RAG 기반 법령 분석 인터페이스
 */

'use client'

import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { analyzeIntent, logIntent } from '@/lib/intent-analyzer'
import { collectData, type CollectionProgress } from '@/lib/rag-data-collector'
import { ragSessionStore, type RAGSession } from '@/lib/rag-session-store'
import { RAGCollectionProgress } from './rag-collection-progress'

export function RAGAnalysisView({ initialQuery }: { initialQuery: string }) {
  const [session, setSession] = useState<RAGSession | null>(null)
  const [isCollecting, setIsCollecting] = useState(false)
  const [collectionProgress, setCollectionProgress] = useState<CollectionProgress | null>(null)
  const [analysis, setAnalysis] = useState<string>('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 초기 쿼리 자동 실행
  useEffect(() => {
    if (initialQuery) {
      handleRAGQuery(initialQuery)
    }
  }, [initialQuery])

  /**
   * RAG 쿼리 전체 플로우 실행
   */
  async function handleRAGQuery(query: string) {
    try {
      setError(null)
      setIsCollecting(true)

      // 1. 의도 분석
      console.log('🔍 Step 1: Analyzing intent...')
      const intent = await analyzeIntent(query)
      logIntent(query, intent)

      if (intent.targets.length === 0) {
        throw new Error('분석할 데이터를 식별하지 못했습니다.')
      }

      // 2. 데이터 수집
      console.log('📦 Step 2: Collecting data...')
      const sources = await collectData(intent.targets, setCollectionProgress)

      if (sources.length === 0) {
        throw new Error('관련 데이터를 찾을 수 없습니다.')
      }

      // 3. 세션 생성
      console.log('💾 Step 3: Creating session...')
      const newSession = await ragSessionStore.createSession(query, intent, sources)
      setSession(newSession)
      setIsCollecting(false)

      // 4. RAG 분석 시작
      console.log('🤖 Step 4: Starting RAG analysis...')
      await streamAnalysis(newSession.sessionId)
    } catch (err) {
      console.error('RAG query error:', err)
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.')
      setIsCollecting(false)
      setIsAnalyzing(false)
    }
  }

  /**
   * 후속 질문 처리
   */
  async function handleFollowUpQuestion(query: string) {
    if (!session) return

    try {
      setError(null)
      await streamAnalysis(session.sessionId, query)
    } catch (err) {
      console.error('Follow-up question error:', err)
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.')
    }
  }

  /**
   * RAG 분석 스트리밍
   */
  async function streamAnalysis(sessionId: string, userQuery?: string) {
    setAnalysis('')
    setIsAnalyzing(true)

    try {
      const response = await fetch('/api/rag-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, userQuery }),
      })

      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`)
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)

            if (data === '[DONE]') {
              setIsAnalyzing(false)
              break
            }

            try {
              const { text } = JSON.parse(data)
              setAnalysis((prev) => prev + text)
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (err) {
      console.error('Streaming error:', err)
      setError(err instanceof Error ? err.message : '분석 중 오류가 발생했습니다.')
      setIsAnalyzing(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-900">
      {/* Left: Sources Panel */}
      <div className="w-80 border-r border-gray-700 bg-gray-800 overflow-y-auto">
        <div className="p-4">
          <h3 className="font-bold text-lg mb-4 text-white">📚 참고 자료</h3>

          {session && session.sources.length > 0 && (
            <div className="space-y-3">
              {session.sources.map((source, index) => (
                <div key={source.id} className="bg-gray-700 p-3 rounded-lg border border-gray-600">
                  <div className="flex items-start gap-2">
                    <span className="text-lg flex-shrink-0">
                      {source.type === 'ordinance' ? '📄' : '📖'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm text-white">{source.title}</h4>
                      <p className="text-xs text-gray-400 mt-1">
                        {source.metadata.totalArticles}개 조문
                      </p>
                      {source.metadata.region && (
                        <p className="text-xs text-blue-400 mt-1">{source.metadata.region}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {isCollecting && collectionProgress && (
            <RAGCollectionProgress progress={collectionProgress} />
          )}

          {!session && !isCollecting && (
            <div className="text-center text-gray-500 text-sm py-8">
              <p>자료가 수집되면</p>
              <p>여기에 표시됩니다</p>
            </div>
          )}
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
                <p className="text-gray-200">AI가 분석 중입니다...</p>
                <p className="text-sm text-gray-400 mt-2">
                  수집된 자료를 바탕으로 답변을 생성하고 있습니다
                </p>
              </div>
            </div>
          )}

          {!session && !isCollecting && !error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-400">
                <p className="text-lg">AI 법령 분석</p>
                <p className="text-sm mt-2">자연어 질문을 입력하면 시작됩니다</p>
              </div>
            </div>
          )}
        </div>

        {/* Follow-up Chat */}
        {session && !isAnalyzing && !isCollecting && (
          <div className="border-t border-gray-700 p-4 bg-gray-800">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const formData = new FormData(e.currentTarget)
                const query = formData.get('query') as string
                if (query.trim()) {
                  handleFollowUpQuestion(query.trim())
                  e.currentTarget.reset()
                }
              }}
            >
              <div className="flex gap-2">
                <input
                  name="query"
                  type="text"
                  placeholder="후속 질문을 입력하세요..."
                  className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isAnalyzing}
                />
                <button
                  type="submit"
                  disabled={isAnalyzing}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  질문
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                💡 Tip: 이미 수집된 자료를 바탕으로 추가 질문을 할 수 있습니다
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
