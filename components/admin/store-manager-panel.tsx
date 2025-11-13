/**
 * Store Manager Panel Component (Enhanced)
 * Phase 4: Manage File Search Store with cost calculation
 */

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface StoreDocument {
  id: string
  displayName: string
  lawName: string
  state: string
  createTime: string
  updateTime: string
}

interface StoreInfo {
  id: string
  displayName: string
  createTime: string
  updateTime: string
}

interface CostEstimate {
  totalDocuments: number
  totalCharacters: number
  totalTokens: number
  estimatedCost: number
}

interface StoreManagerPanelProps {
  onRefresh?: () => void
}

export function StoreManagerPanel({ onRefresh }: StoreManagerPanelProps) {
  const [documents, setDocuments] = useState<StoreDocument[]>([])
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showStoreId, setShowStoreId] = useState(false)
  const [newStoreName, setNewStoreName] = useState('')
  const [creatingStore, setCreatingStore] = useState(false)
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null)

  useEffect(() => {
    loadStoreInfo()
    loadDocuments()
  }, [])

  async function loadStoreInfo() {
    try {
      const response = await fetch('/api/admin/store-info')
      const data = await response.json()

      if (data.success && data.store) {
        setStoreInfo(data.store)
      }
    } catch (err: any) {
      console.error('Failed to load store info:', err)
    }
  }

  async function loadDocuments() {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/list-store-documents')
      const data = await response.json()

      if (data.success) {
        setDocuments(data.documents)
        calculateCost(data.documents)
      } else {
        setError(data.error || '문서 목록 조회 실패')
      }
    } catch (err: any) {
      setError(err.message || '문서 목록 조회 중 오류')
    } finally {
      setLoading(false)
    }
  }

  function calculateCost(docs: StoreDocument[]) {
    // Estimate: Average 50KB per document
    const avgCharsPerDoc = 50000
    const totalChars = docs.length * avgCharsPerDoc

    // Gemini tokenization: ~4 chars per token (conservative estimate)
    const totalTokens = Math.ceil(totalChars / 4)

    // File Search pricing (as of 2025):
    // - Storage: Free for first 20GB
    // - Retrieval: $0.05 per 1M tokens (input)
    // - Model usage: Gemini 2.5 Flash pricing applies

    // Estimated cost for retrieval (assuming 100 queries, 5 chunks per query)
    const avgTokensPerQuery = 500 * 5 // 5 chunks * ~500 tokens each
    const avgQueries = 100
    const retrievalCost = (avgQueries * avgTokensPerQuery * 0.05) / 1000000

    setCostEstimate({
      totalDocuments: docs.length,
      totalCharacters: totalChars,
      totalTokens: totalTokens,
      estimatedCost: retrievalCost
    })
  }

  async function deleteDocument(documentId: string, lawName: string) {
    if (!confirm(`"${lawName}" 문서를 삭제하시겠습니까?`)) {
      return
    }

    try {
      const response = await fetch('/api/admin/delete-store-document', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ documentId })
      })

      const data = await response.json()

      if (data.success) {
        alert('문서가 삭제되었습니다')
        loadDocuments()
        onRefresh?.()
      } else {
        alert('삭제 실패: ' + data.error)
      }
    } catch (error: any) {
      alert('삭제 중 오류: ' + error.message)
    }
  }

  async function createNewStore() {
    if (!newStoreName.trim()) {
      alert('Store 이름을 입력해주세요')
      return
    }

    setCreatingStore(true)

    try {
      const response = await fetch('/api/admin/create-store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ displayName: newStoreName })
      })

      const data = await response.json()

      if (data.success) {
        alert(data.message || '✅ Store 생성 완료!\n.env.local이 자동으로 업데이트되었습니다.\n\n⚠️ 서버 재시작이 필요합니다.')
        setNewStoreName('')
        // Store info will be updated after server restart
        setTimeout(() => loadStoreInfo(), 1000)
      } else {
        alert('생성 실패: ' + data.error)
      }
    } catch (error: any) {
      alert('생성 중 오류: ' + error.message)
    } finally {
      setCreatingStore(false)
    }
  }

  function copyStoreId() {
    if (storeInfo?.id) {
      navigator.clipboard.writeText(storeInfo.id)
      alert('Store ID가 클립보드에 복사되었습니다')
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">🗄️ File Search Store 관리</h2>
        <p className="text-sm text-gray-400">File Search Store 정보, 문서 관리 및 비용 추정</p>
      </div>

      {/* Store Info */}
      {storeInfo && (
        <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-white">📍 현재 Store</h3>
            <Button onClick={() => setShowStoreId(!showStoreId)} size="sm" variant="outline" className="text-xs">
              {showStoreId ? '숨기기' : 'ID 보기'}
            </Button>
          </div>

          <div className="space-y-2 text-sm">
            <div>
              <span className="text-gray-400">Display Name: </span>
              <span className="text-white font-medium">{storeInfo.displayName}</span>
            </div>

            {showStoreId && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Store ID: </span>
                <code className="flex-1 text-xs bg-gray-900 px-2 py-1 rounded text-blue-400 overflow-x-auto">
                  {storeInfo.id}
                </code>
                <Button onClick={copyStoreId} size="sm" variant="outline" className="text-xs">
                  📋 복사
                </Button>
              </div>
            )}

            <div>
              <span className="text-gray-400">생성일: </span>
              <span className="text-white">{new Date(storeInfo.createTime).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Cost Estimate */}
      {costEstimate && (
        <div className="p-4 bg-gradient-to-br from-blue-900/30 to-purple-900/30 border border-blue-700 rounded-lg">
          <h3 className="font-medium text-white mb-3">💰 비용 추정</h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-400 text-xs">총 문서</p>
              <p className="text-white font-bold text-lg">{costEstimate.totalDocuments}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">예상 문자 수</p>
              <p className="text-white font-bold text-lg">{(costEstimate.totalCharacters / 1000000).toFixed(1)}M</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">예상 토큰</p>
              <p className="text-white font-bold text-lg">{(costEstimate.totalTokens / 1000).toFixed(0)}K</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">월 예상 비용</p>
              <p className="text-green-400 font-bold text-lg">${costEstimate.estimatedCost.toFixed(3)}</p>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-gray-700">
            <p className="text-xs text-gray-400">
              💡 100개 쿼리 기준 (실제 비용은 사용량에 따라 다름)
              <br />
              • Storage: 20GB까지 무료
              <br />• Retrieval: $0.05 per 1M tokens
            </p>
          </div>
        </div>
      )}

      {/* Create New Store */}
      <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
        <h3 className="font-medium text-white mb-3">➕ 새 Store 생성</h3>

        <div className="flex gap-2">
          <Input
            type="text"
            value={newStoreName}
            onChange={(e) => setNewStoreName(e.target.value)}
            placeholder="Store 이름 (예: lexdiff-store-2025)"
            className="flex-1 bg-gray-900 border-gray-700 text-white"
            disabled={creatingStore}
          />
          <Button
            onClick={createNewStore}
            disabled={!newStoreName.trim() || creatingStore}
            className="bg-green-600 hover:bg-green-700"
          >
            {creatingStore ? '생성 중...' : '생성'}
          </Button>
        </div>

        <p className="text-xs text-gray-400 mt-2">
          ⚠️ Store 생성 후 .env.local에 ID를 추가하고 서버를 재시작해야 합니다
        </p>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between p-4 bg-gray-800 border border-gray-700 rounded-lg">
        <div className="text-sm text-gray-300">
          {documents.length > 0 ? `${documents.length}개 문서` : '문서 없음'}
        </div>
        <div className="flex gap-2">
          <Button onClick={loadDocuments} disabled={loading} variant="outline" className="border-gray-600 text-gray-300">
            {loading ? '새로고침 중...' : '🔄 새로고침'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg">
          <p className="text-red-400">❌ {error}</p>
          <p className="text-xs text-gray-400 mt-2">
            💡 Store ID가 변경되었다면 .env.local을 확인하고 서버를 재시작하세요
          </p>
        </div>
      )}

      {/* Documents List */}
      <div className="space-y-2">
        {loading && (
          <div className="p-8 bg-gray-800 border border-gray-700 rounded-lg text-center">
            <p className="text-gray-400">로딩 중...</p>
          </div>
        )}

        {!loading && documents.length === 0 && !error && (
          <div className="p-8 bg-gray-800 border border-gray-700 rounded-lg text-center">
            <p className="text-gray-500">File Search Store에 문서가 없습니다</p>
            <p className="text-sm text-gray-600 mt-1">법령을 업로드하면 여기에 표시됩니다</p>
          </div>
        )}

        {!loading && documents.length > 0 && (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {documents.map((doc) => (
              <div key={doc.id} className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-white">{doc.lawName}</div>
                    <div className="text-sm text-gray-400 mt-1">Display Name: {doc.displayName}</div>
                    <div className="text-xs text-gray-500 mt-1">Document ID: {doc.id}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      생성: {new Date(doc.createTime).toLocaleString()} · 상태: {doc.state}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 ml-4">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        doc.state === 'STATE_ACTIVE'
                          ? 'bg-green-900/30 border border-green-700 text-green-400'
                          : 'bg-gray-700 border border-gray-600 text-gray-400'
                      }`}
                    >
                      {doc.state === 'STATE_ACTIVE' ? '✓ 활성' : doc.state}
                    </span>
                    <Button
                      onClick={() => deleteDocument(doc.id, doc.lawName)}
                      variant="outline"
                      size="sm"
                      className="border-red-700 text-red-400 hover:bg-red-900/30"
                    >
                      🗑️ 삭제
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
