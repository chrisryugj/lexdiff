/**
 * RAG Analysis Test Page
 * Phase 9 Pro Small RAG 기능 테스트
 */

'use client'

import { useState } from 'react'
import { RAGAnalysisView } from '@/components/rag-analysis-view'
import { classifyQuery, logClassification, needsUserConfirmation } from '@/lib/query-classifier'

export default function RAGTestPage() {
  const [query, setQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [classification, setClassification] = useState<any>(null)

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
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <h1 className="text-2xl font-bold">🤖 AI 법령 분석 (RAG Mode)</h1>
        <p className="text-sm text-gray-600 mt-1">Phase 9 Pro - Small RAG Test</p>
      </div>

      {/* Main Content */}
      {!activeQuery && !showConfirm && (
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-2xl w-full px-6">
            <h2 className="text-xl font-bold mb-4 text-center">자연어 질문을 입력하세요</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="예: 광진구와 성동구의 4차산업 관련 조례를 분석, 비교해줘"
                  className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px]"
                />
              </div>

              <button
                type="submit"
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                분석 시작
              </button>
            </form>

            <div className="mt-8 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-medium mb-2">💡 예시 질문:</h3>
              <ul className="text-sm space-y-1 text-gray-700">
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
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full mx-6 bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-bold mb-4">검색 모드 확인</h3>

            <div className="mb-6">
              <p className="text-sm text-gray-600 mb-2">입력하신 질문:</p>
              <p className="font-medium bg-gray-50 p-3 rounded">{query}</p>
            </div>

            <div className="mb-6 p-4 bg-blue-50 rounded">
              <p className="text-sm text-gray-700">
                <strong>분류 결과:</strong> {classification.mode === 'rag-analysis' ? 'AI 분석 모드' : '일반 검색'}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                <strong>신뢰도:</strong> {(classification.confidence * 100).toFixed(0)}%
              </p>
              <p className="text-sm text-gray-600 mt-1">
                <strong>이유:</strong> {classification.reasoning}
              </p>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              이 질문은 AI 분석이 필요할 수 있습니다. 어떻게 진행하시겠습니까?
            </p>

            <div className="space-y-2">
              <button
                onClick={confirmRAGMode}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                AI 분석 시작 (추천)
              </button>
              <button
                onClick={switchToSimpleSearch}
                className="w-full px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                일반 검색으로 전환
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RAG Analysis View */}
      {activeQuery && <RAGAnalysisView initialQuery={activeQuery} />}
    </div>
  )
}
