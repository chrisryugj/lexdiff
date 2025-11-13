/**
 * RAG Analysis Test Page
 * Phase 9 Pro Small RAG 기능 테스트
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RAGAnalysisView } from '@/components/rag-analysis-view'
import { FileSearchRAGView } from '@/components/file-search-rag-view'
import { classifyQuery, logClassification, needsUserConfirmation } from '@/lib/query-classifier'

export default function RAGTestPage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [classification, setClassification] = useState<any>(null)
  const [useFileSearch, setUseFileSearch] = useState(true)  // File Search 기본값

  /**
   * Citation 클릭 시 메인 페이지로 이동하여 해당 법령 조회
   */
  function handleCitationClick(lawName: string, articleNum: string) {
    const searchQuery = `${lawName} ${articleNum}`.trim()
    console.log('[RAG Test] Citation clicked:', { lawName, articleNum, searchQuery })
    router.push(`/?query=${encodeURIComponent(searchQuery)}`)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!query.trim()) return

    // Query 분류
    const result = classifyQuery(query)
    logClassification(query, result)
    setClassification(result)

    if (result.mode === 'rag-analysis') {
      if (needsUserConfirmation(result)) {
        // 신뢰도가 낮으면 사용자 확인
        setShowConfirm(true)
      } else {
        // 신뢰도가 높으면 바로 실행
        setActiveQuery(query)
        setShowConfirm(false)
      }
    } else {
      // 일반 검색 모드
      alert('일반 검색 모드로 분류되었습니다. 일반 검색 페이지로 이동해야 합니다.')
    }
  }

  function confirmRAGMode() {
    setActiveQuery(query)
    setShowConfirm(false)
  }

  function switchToSimpleSearch() {
    alert('일반 검색으로 전환합니다.')
    setShowConfirm(false)
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Header */}
      <div className="border-b border-gray-700 bg-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">🤖 AI 법령 분석 (RAG Mode)</h1>
            <p className="text-sm text-gray-400 mt-1">Phase 9 Pro - Small RAG Test</p>
          </div>

          {/* Mode Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setUseFileSearch(true)
                setActiveQuery('')
              }}
              className={`px-4 py-2 rounded-lg transition ${
                useFileSearch
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              🔍 File Search
            </button>
            <button
              onClick={() => {
                setUseFileSearch(false)
                setActiveQuery('')
              }}
              className={`px-4 py-2 rounded-lg transition ${
                !useFileSearch
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              📦 Manual RAG
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {!activeQuery && !showConfirm && (
        <div className="flex-1 flex items-center justify-center bg-gray-900">
          <div className="max-w-2xl w-full px-6">
            <h2 className="text-xl font-bold mb-4 text-center text-white">자연어 질문을 입력하세요</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="예: 광진구와 성동구의 4차산업 관련 조례를 분석, 비교해줘"
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px]"
                />
              </div>

              <button
                type="submit"
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition"
              >
                분석 시작
              </button>
            </form>

            <div className="mt-8 p-4 bg-gray-800 border border-gray-700 rounded-lg">
              <h3 className="font-medium mb-2 text-white">💡 예시 질문:</h3>
              <ul className="text-sm space-y-1 text-gray-300">
                <li>• 광진구와 성동구의 4차산업 관련 조례를 비교해줘</li>
                <li>• 서울시와 부산시의 청년 지원 조례 차이점은?</li>
                <li>• 관세법과 관세법 시행령의 관계를 설명해줘</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirm && classification && (
        <div className="flex-1 flex items-center justify-center bg-gray-900">
          <div className="max-w-md w-full mx-6 bg-gray-800 border border-gray-700 rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-bold mb-4 text-white">검색 모드 확인</h3>

            <div className="mb-6">
              <p className="text-sm text-gray-400 mb-2">입력하신 질문:</p>
              <p className="font-medium bg-gray-700 text-white p-3 rounded">{query}</p>
            </div>

            <div className="mb-6 p-4 bg-blue-900/30 border border-blue-700 rounded">
              <p className="text-sm text-gray-200">
                <strong>분류 결과:</strong> {classification.mode === 'rag-analysis' ? 'AI 분석 모드' : '일반 검색'}
              </p>
              <p className="text-sm text-gray-300 mt-1">
                <strong>신뢰도:</strong> {(classification.confidence * 100).toFixed(0)}%
              </p>
              <p className="text-sm text-gray-300 mt-1">
                <strong>이유:</strong> {classification.reasoning}
              </p>
            </div>

            <p className="text-sm text-gray-300 mb-4">
              이 질문은 AI 분석이 필요할 수 있습니다. 어떻게 진행하시겠습니까?
            </p>

            <div className="space-y-2">
              <button
                onClick={confirmRAGMode}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                AI 분석 시작 (추천)
              </button>
              <button
                onClick={switchToSimpleSearch}
                className="w-full px-4 py-2 border border-gray-600 text-gray-200 rounded-lg hover:bg-gray-700 transition"
              >
                일반 검색으로 전환
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RAG Analysis View - Mode에 따라 다른 컴포넌트 렌더링 */}
      {activeQuery && (
        useFileSearch
          ? <FileSearchRAGView
              initialQuery={activeQuery}
              onCitationClick={handleCitationClick}
            />
          : <RAGAnalysisView initialQuery={activeQuery} />
      )}
    </div>
  )
}
