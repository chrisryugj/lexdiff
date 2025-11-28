/**
 * Store Manager Panel Component (Enhanced)
 * Phase 4: Manage File Search Store with cost calculation
 */

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, CheckCircle2, XCircle, AlertCircle, FileText, DollarSign, Database, Eye, EyeOff, Filter, Search, Trash2 } from 'lucide-react'

interface StoreDocument {
  id: string
  displayName: string
  lawName: string
  state: string
  createTime: string
  updateTime: string
  customMetadata?: Array<{ key: string; stringValue?: string }>
}

interface StoreInfo {
  id: string
  displayName: string
  createTime: string
  updateTime: string
  isActive?: boolean
}

interface CostEstimate {
  totalDocuments: number
  totalCharacters: number
  totalTokens: number
  estimatedCost: number
}

interface StoreManagerPanelProps {
  onRefresh?: () => void
  onTabLeave?: () => void
}

export function StoreManagerPanel({ onRefresh, onTabLeave }: StoreManagerPanelProps) {
  const [documents, setDocuments] = useState<StoreDocument[]>([])
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null)
  const [allStores, setAllStores] = useState<StoreInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingStores, setLoadingStores] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showStoreId, setShowStoreId] = useState(false)
  const [newStoreName, setNewStoreName] = useState('')
  const [creatingStore, setCreatingStore] = useState(false)
  const [switchingStore, setSwitchingStore] = useState(false)
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null)
  const [showStoreList, setShowStoreList] = useState(true)
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState<string>('')

  // Batch delete & filtering states
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())
  const [filterType, setFilterType] = useState<'all' | 'law' | 'ordinance'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isDeletingBatch, setIsDeletingBatch] = useState(false)

  useEffect(() => {
    loadStoreInfo()
    loadAllStores()
    // Don't auto-load documents on mount - user must click button

    // Cleanup on unmount - ALWAYS abort ongoing requests
    return () => {
      if (abortController) {
        console.log('[Store Manager] Aborting ongoing document fetch due to component unmount')
        abortController.abort()
      }
      onTabLeave?.()
    }
  }, [abortController, onTabLeave])

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

  async function loadAllStores() {
    setLoadingStores(true)
    try {
      const response = await fetch('/api/admin/list-stores')
      const data = await response.json()

      if (data.success) {
        setAllStores(data.stores)
        // Set initial selected store to current active store
        const activeStore = data.stores.find((s: StoreInfo) => s.isActive)
        if (activeStore) {
          setSelectedStoreId(activeStore.id)
        }
      } else {
        console.error('Failed to load stores:', data.error)
      }
    } catch (err: any) {
      console.error('Failed to load stores:', err)
    } finally {
      setLoadingStores(false)
    }
  }

  async function loadDocuments() {
    // Cancel any ongoing request
    if (abortController) {
      abortController.abort()
    }

    const controller = new AbortController()
    setAbortController(controller)
    setLoading(true)
    setIsLoadingDocuments(true)
    setError(null)
    setLoadingProgress('문서 조회 시작 중...')

    const startTime = Date.now()

    try {
      const response = await fetch('/api/admin/list-store-documents', {
        signal: controller.signal
      })

      setLoadingProgress('응답 파싱 중...')
      const data = await response.json()

      if (data.success) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        setLoadingProgress(`${data.documents.length}개 문서 로드 완료 (${elapsed}초)`)

        setDocuments(data.documents)
        calculateCost(data.documents)

        // Clear progress after 2 seconds
        setTimeout(() => setLoadingProgress(''), 2000)
      } else {
        setError(data.error || '문서 목록 조회 실패')
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('문서 조회가 취소되었습니다')
        setError('조회가 취소되었습니다')
        setLoadingProgress('')
      } else {
        setError(err.message || '문서 목록 조회 중 오류')
        setLoadingProgress('')
      }
    } finally {
      setLoading(false)
      setIsLoadingDocuments(false)
      setAbortController(null)
    }
  }

  function cancelLoadDocuments() {
    if (abortController) {
      abortController.abort()
      setAbortController(null)
      setLoading(false)
      setIsLoadingDocuments(false)
      setError('조회가 취소되었습니다')
      setLoadingProgress('')
    }
  }

  function calculateCost(docs: StoreDocument[]) {
    // More accurate estimate based on actual Korean legal documents
    // Law files: ~30-100KB, Ordinance files: ~10-30KB
    // Average: ~40KB per document
    const avgCharsPerDoc = 40000
    const totalChars = docs.length * avgCharsPerDoc

    // Gemini tokenization for Korean: ~2.5 chars per token (more accurate for Korean)
    const totalTokens = Math.ceil(totalChars / 2.5)

    // File Search pricing (as of 2025):
    // - Storage: Free for first 20GB
    // - Retrieval: $0.05 per 1M tokens
    //
    // Retrieval cost based on 1 full retrieval of total tokens (capacity planning)
    // Retrieval: $0.05 per 1M tokens
    const retrievalCost = (totalTokens * 0.05) / 1000000

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

  async function batchDeleteDocuments() {
    const count = selectedDocIds.size
    if (count === 0) {
      alert('삭제할 문서를 선택해주세요')
      return
    }

    if (!confirm(`선택한 ${count}개 문서를 삭제하시겠습니까?\n\n⚠️ 이 작업은 되돌릴 수 없습니다.`)) {
      return
    }

    setIsDeletingBatch(true)

    try {
      const response = await fetch('/api/admin/batch-delete-documents', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ documentIds: Array.from(selectedDocIds) })
      })

      const data = await response.json()

      if (data.success) {
        alert(
          `✅ 삭제 완료\n\n성공: ${data.successCount}개\n실패: ${data.failedCount}개`
        )
        setSelectedDocIds(new Set())
        loadDocuments()
        onRefresh?.()
      } else {
        alert('일괄 삭제 실패: ' + data.error)
      }
    } catch (error: any) {
      alert('일괄 삭제 중 오류: ' + error.message)
    } finally {
      setIsDeletingBatch(false)
    }
  }

  function toggleDocumentSelection(docId: string) {
    setSelectedDocIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(docId)) {
        newSet.delete(docId)
      } else {
        newSet.add(docId)
      }
      return newSet
    })
  }

  function toggleSelectAll() {
    if (selectedDocIds.size === filteredDocuments.length) {
      setSelectedDocIds(new Set())
    } else {
      setSelectedDocIds(new Set(filteredDocuments.map((doc) => doc.id)))
    }
  }

  // Filtering logic
  const filteredDocuments = documents.filter((doc) => {
    // Type filter
    if (filterType === 'law') {
      const isLaw = doc.customMetadata?.some((m) => m.key === 'law_name')
      if (!isLaw) return false
    } else if (filterType === 'ordinance') {
      const isOrdinance = doc.customMetadata?.some((m) => m.key === 'ordinance_name')
      if (!isOrdinance) return false
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      return (
        doc.lawName.toLowerCase().includes(query) ||
        doc.displayName.toLowerCase().includes(query)
      )
    }

    return true
  })

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
        // Reload stores and store info
        setTimeout(() => {
          loadStoreInfo()
          loadAllStores()
        }, 1000)
      } else {
        alert('생성 실패: ' + data.error)
      }
    } catch (error: any) {
      alert('생성 중 오류: ' + error.message)
    } finally {
      setCreatingStore(false)
    }
  }

  async function applyStoreSelection() {
    if (!selectedStoreId) {
      alert('Store를 선택해주세요')
      return
    }

    const selectedStore = allStores.find((s) => s.id === selectedStoreId)
    if (!selectedStore) {
      alert('선택한 Store를 찾을 수 없습니다')
      return
    }

    // If already active, no need to switch
    if (selectedStore.isActive) {
      alert('이미 활성화된 Store입니다')
      return
    }

    if (!confirm(`"${selectedStore.displayName}" Store로 전환하시겠습니까?\n\n전환 후 서버를 재시작해야 합니다.`)) {
      return
    }

    setSwitchingStore(true)

    try {
      const response = await fetch('/api/admin/switch-store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ storeId: selectedStoreId })
      })

      const data = await response.json()

      if (data.success) {
        alert(data.message || '✅ Store 전환 완료!\n\n⚠️ 서버 재시작이 필요합니다.')
        // Reload stores and store info
        setTimeout(() => {
          loadStoreInfo()
          loadAllStores()
          loadDocuments()
        }, 1000)
      } else {
        alert('전환 실패: ' + data.error)
      }
    } catch (error: any) {
      alert('전환 중 오류: ' + error.message)
    } finally {
      setSwitchingStore(false)
    }
  }

  async function deleteStore(storeId: string, storeName: string) {
    // First confirmation
    if (
      !confirm(
        `"${storeName}" Store를 삭제하시겠습니까?\n\n⚠️ 경고: 이 작업은 되돌릴 수 없습니다!\n\n삭제되는 내용:\n• Store 내 모든 문서 (법령, 조례 등)\n• 문서와 연결된 모든 메타데이터\n• 업로드 이력 정보`
      )
    ) {
      return
    }

    // Second confirmation (stronger warning)
    if (
      !confirm(
        `⚠️ 최종 확인\n\n정말로 "${storeName}" Store를 삭제하시겠습니까?\n\n이 작업은 복구할 수 없으며, 모든 데이터가 영구적으로 삭제됩니다.`
      )
    ) {
      return
    }

    try {
      const response = await fetch('/api/admin/delete-store', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ storeId })
      })

      const data = await response.json()

      if (data.success) {
        alert('✅ Store가 삭제되었습니다')
        loadAllStores()
      } else {
        alert('❌ 삭제 실패: ' + data.error)
      }
    } catch (error: any) {
      alert('❌ 삭제 중 오류: ' + error.message)
    }
  }

  function copyStoreId() {
    if (storeInfo?.id) {
      navigator.clipboard.writeText(storeInfo.id)
      alert('Store ID가 클립보드에 복사되었습니다')
    }
  }

  return (
    <div className="space-y-6">
      {/* Store Info */}
      {storeInfo && (
        <div className="p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <h3 className="font-medium text-foreground">현재 Store</h3>
            </div>
            <Button onClick={() => setShowStoreId(!showStoreId)} size="sm" variant="outline">
              {showStoreId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>

          <div className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Display Name: </span>
              <span className="text-foreground font-medium">{storeInfo.displayName}</span>
            </div>

            {showStoreId && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Store ID: </span>
                <code className="flex-1 text-xs bg-muted/30 px-2 py-1 rounded text-primary overflow-x-auto">
                  {storeInfo.id}
                </code>
                <Button onClick={copyStoreId} size="sm" variant="outline" className="text-xs">
                  복사
                </Button>
              </div>
            )}

            <div>
              <span className="text-muted-foreground">생성일: </span>
              <span className="text-foreground">{new Date(storeInfo.createTime).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* All Stores List */}
      <div className="p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-medium text-foreground">모든 Stores</h3>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setShowStoreList(!showStoreList)}
              size="sm"
              variant="outline"
            >
              {showStoreList ? '숨기기' : '보기'}
            </Button>
            <Button onClick={loadAllStores} disabled={loadingStores} size="sm" variant="outline">
              {loadingStores ? <Loader2 className="h-4 w-4 animate-spin" /> : '새로고침'}
            </Button>
          </div>
        </div>

        {showStoreList && (
          <div className="space-y-2">
            {loadingStores && (
              <div className="p-8 text-center">
                <Loader2 className="h-8 w-8 text-muted-foreground mx-auto mb-3 animate-spin" />
                <p className="text-muted-foreground">로딩 중...</p>
              </div>
            )}

            {!loadingStores && allStores.length === 0 && (
              <div className="p-8 text-center">
                <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Store가 없습니다</p>
              </div>
            )}

            {!loadingStores && allStores.length > 0 && (
              <>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {allStores.map((store, index) => (
                    <label
                      key={store.id}
                      className={`
                        flex items-start p-3 rounded-xl border transition-all cursor-pointer
                        ${selectedStoreId === store.id
                          ? 'bg-primary/10 border-primary/30 ring-2 ring-primary/20 shadow-md'
                          : 'bg-card/30 border-border/50 hover:border-primary/30 hover:bg-card/50 hover:shadow-sm'
                        }
                      `}
                      style={{
                        animation: `fadeInUp 0.3s ease-out ${index * 50}ms both`
                      }}
                    >
                      <input
                        type="radio"
                        name="store-selection"
                        value={store.id}
                        checked={selectedStoreId === store.id}
                        onChange={(e) => setSelectedStoreId(e.target.value)}
                        className="mt-1 mr-3"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-foreground">{store.displayName}</span>
                          {store.isActive && (
                            <span className="px-2 py-0.5 bg-accent text-foreground text-xs rounded-full">현재 활성</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          생성: {new Date(store.createTime).toLocaleDateString()}
                        </div>
                        <div className="text-xs text-muted-foreground/70 mt-1 font-mono break-all">{store.id}</div>
                      </div>
                      <div className="ml-3">
                        <Button
                          onClick={(e) => {
                            e.preventDefault()
                            deleteStore(store.id, store.displayName)
                          }}
                          disabled={store.isActive}
                          size="sm"
                          variant="outline"
                          className="text-xs border-warning/30 text-warning hover:bg-warning/10 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          삭제
                        </Button>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Apply Button */}
                <div className="flex gap-3 pt-3 border-t border-border/50">
                  <Button
                    onClick={applyStoreSelection}
                    disabled={switchingStore || !selectedStoreId || allStores.find((s) => s.id === selectedStoreId)?.isActive}
                    className="flex-1 shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed min-w-[140px]"
                    size="default"
                  >
                    {switchingStore ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        전환 중...
                      </>
                    ) : (
                      '선택한 Store 적용하기'
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Cost Estimate */}
      {costEstimate && (
        <div className="p-4 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent border border-accent/20 rounded-xl backdrop-blur-sm shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="h-5 w-5 text-accent" />
            <h3 className="font-medium text-foreground">비용 추정</h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="p-3 bg-card/30 rounded-lg">
              <p className="text-muted-foreground text-xs mb-1">총 문서</p>
              <p className="text-foreground font-bold text-lg">{costEstimate.totalDocuments}</p>
            </div>
            <div className="p-3 bg-card/30 rounded-lg">
              <p className="text-muted-foreground text-xs mb-1">예상 문자 수</p>
              <p className="text-foreground font-bold text-lg">{(costEstimate.totalCharacters / 1000000).toFixed(1)}M</p>
            </div>
            <div className="p-3 bg-card/30 rounded-lg">
              <p className="text-muted-foreground text-xs mb-1">예상 토큰</p>
              <p className="text-foreground font-bold text-lg">{(costEstimate.totalTokens / 1000).toFixed(0)}K</p>
            </div>
            <div className="p-3 bg-accent/10 rounded-lg">
              <p className="text-muted-foreground text-xs mb-1">월 예상 비용</p>
              <p className="text-accent font-bold text-lg">${costEstimate.estimatedCost.toFixed(3)}</p>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              💡 전체 토큰 1회 검색 기준 (실제 비용은 사용량에 따라 다름)
              <br />
              • Storage: 20GB까지 무료
              <br />• Retrieval: $0.05 per 1M tokens
            </p>
          </div>
        </div>
      )}

      {/* Create New Store */}
      <div className="p-4 bg-muted/30 backdrop-blur-sm rounded-xl border border-border/50">
        <h3 className="font-medium text-foreground mb-3">새 Store 생성</h3>

        <div className="flex gap-2">
          <Input
            type="text"
            value={newStoreName}
            onChange={(e) => setNewStoreName(e.target.value)}
            placeholder="Store 이름 (예: lexdiff-store-2025)"
            className="flex-1 bg-card/50 border-border/50 text-foreground"
            disabled={creatingStore}
          />
          <Button
            onClick={createNewStore}
            disabled={!newStoreName.trim() || creatingStore}
            className="shadow-lg shadow-primary/20 min-w-[100px]"
            size="default"
          >
            {creatingStore ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                생성 중...
              </>
            ) : (
              '생성'
            )}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          ⚠️ Store 생성 후 .env.local에 ID를 추가하고 서버를 재시작해야 합니다
        </p>
      </div>

      {/* Controls */}
      <div className="p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {loadingProgress
              ? loadingProgress
              : isLoadingDocuments
                ? '문서 조회 중...'
                : documents.length > 0
                  ? `${documents.length}개 문서 (필터링: ${filteredDocuments.length}개)`
                  : '조회 버튼을 클릭하여 문서를 불러오세요'}
          </div>
          <div className="flex gap-2">
            <Button
              onClick={loadDocuments}
              disabled={isLoadingDocuments}
              variant="outline"
              className="shadow-sm"
            >
              {isLoadingDocuments ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  조회 중...
                </>
              ) : (
                '문서 조회'
              )}
            </Button>
          </div>
        </div>

        {/* Loading Warning & Cancel Button */}
        {isLoadingDocuments && (
          <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1">
                <AlertCircle className="h-4 w-4 text-warning" />
                <div className="text-xs text-warning">
                  <strong>조회 진행 중</strong> - 다른 탭으로 이동하면 자동으로 취소됩니다
                </div>
              </div>
              <Button
                onClick={cancelLoadDocuments}
                size="sm"
                variant="outline"
                className="border-warning/50 text-warning hover:bg-warning/20 ml-3"
              >
                <XCircle className="h-3 w-3 mr-1" />
                조회 취소
              </Button>
            </div>
          </div>
        )}

        {/* Performance Tip */}
        {documents.length === 0 && !isLoadingDocuments && (
          <div className="p-3 bg-primary/10 border border-primary/20 rounded text-xs text-primary">
            💡 Gemini API 제한: 페이지 크기는 최대 20개입니다. 15,000개 파일 조회 시 약 750번의 API 호출이 필요하므로 시간이 소요될 수 있습니다.
          </div>
        )}
      </div>

      {/* Filter & Batch Actions */}
      {documents.length > 0 && (
        <div className="p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm space-y-3">
          {/* Filter Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">필터:</span>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setFilterType('all')}
                size="sm"
                variant={filterType === 'all' ? 'default' : 'outline'}
                className="text-xs"
              >
                전체 ({documents.length})
              </Button>
              <Button
                onClick={() => setFilterType('law')}
                size="sm"
                variant={filterType === 'law' ? 'default' : 'outline'}
                className="text-xs"
              >
                법령 ({documents.filter((d) => d.customMetadata?.some((m) => m.key === 'law_name')).length})
              </Button>
              <Button
                onClick={() => setFilterType('ordinance')}
                size="sm"
                variant={filterType === 'ordinance' ? 'default' : 'outline'}
                className="text-xs"
              >
                조례 ({documents.filter((d) => d.customMetadata?.some((m) => m.key === 'ordinance_name')).length})
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="문서명으로 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-card/50 border-border/50 text-foreground text-sm"
            />
            {searchQuery && (
              <Button onClick={() => setSearchQuery('')} size="sm" variant="outline" className="text-xs">
                지우기
              </Button>
            )}
          </div>

          {/* Batch Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filteredDocuments.length > 0 && selectedDocIds.size === filteredDocuments.length}
                  onChange={toggleSelectAll}
                  className="h-4 w-4"
                />
                <span className="text-sm text-foreground">
                  전체 선택 ({selectedDocIds.size}/{filteredDocuments.length})
                </span>
              </label>
            </div>
            <Button
              onClick={batchDeleteDocuments}
              disabled={selectedDocIds.size === 0 || isDeletingBatch}
              variant="outline"
              className="border-warning/30 text-warning hover:bg-warning/10"
              size="sm"
            >
              {isDeletingBatch ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  삭제 중...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  선택 항목 삭제 ({selectedDocIds.size})
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-warning/10 border border-warning/20 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-warning mt-0.5" />
            <div className="flex-1">
              <p className="text-warning">{error}</p>
              <p className="text-xs text-muted-foreground mt-2">
                💡 Store ID가 변경되었다면 .env.local을 확인하고 서버를 재시작하세요
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Documents List */}
      <div className="space-y-2">
        {loading && (
          <div className="p-8 bg-muted/30 backdrop-blur-sm rounded-xl border border-border/50 text-center">
            <Loader2 className="h-12 w-12 text-muted-foreground mx-auto mb-3 animate-spin" />
            <p className="text-muted-foreground">로딩 중...</p>
          </div>
        )}

        {!loading && documents.length === 0 && !error && (
          <div className="p-8 bg-muted/30 backdrop-blur-sm rounded-xl border border-border/50 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">File Search Store에 문서가 없습니다</p>
            <p className="text-sm text-muted-foreground/70 mt-1">법령을 업로드하면 여기에 표시됩니다</p>
          </div>
        )}

        {!loading && filteredDocuments.length > 0 && (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filteredDocuments.map((doc, index) => (
              <div
                key={doc.id}
                className={`p-4 border rounded-xl transition-all ${selectedDocIds.has(doc.id)
                  ? 'bg-primary/10 border-primary/30 shadow-md'
                  : 'bg-card/30 border-border/50 hover:bg-card/50 hover:shadow-sm'
                  }`}
                style={{
                  animation: `fadeInUp 0.3s ease-out ${index * 10}ms both`
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={selectedDocIds.has(doc.id)}
                    onChange={() => toggleDocumentSelection(doc.id)}
                    className="mt-1 h-4 w-4 cursor-pointer"
                  />

                  {/* Document Info */}
                  <div className="flex-1">
                    <div className="font-medium text-foreground">{doc.lawName}</div>
                    <div className="text-sm text-muted-foreground mt-1">Display Name: {doc.displayName}</div>
                    <div className="text-xs text-muted-foreground/70 mt-1">Document ID: {doc.id}</div>
                    <div className="text-xs text-muted-foreground/70 mt-1">
                      생성: {new Date(doc.createTime).toLocaleString()} · 상태: {doc.state}
                    </div>
                    {/* Document Type Badge */}
                    <div className="flex gap-2 mt-2">
                      {doc.customMetadata?.some((m) => m.key === 'law_name') && (
                        <span className="px-2 py-0.5 bg-primary/10 border border-primary/30 text-primary text-xs rounded">
                          법령
                        </span>
                      )}
                      {doc.customMetadata?.some((m) => m.key === 'ordinance_name') && (
                        <span className="px-2 py-0.5 bg-accent/10 border border-accent/30 text-accent text-xs rounded">
                          조례
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 ml-4">
                    <span
                      className={`px-2 py-1 rounded text-xs ${doc.state === 'STATE_ACTIVE'
                        ? 'bg-accent/10 border border-accent/30 text-accent'
                        : 'bg-muted/30 border border-border/50 text-muted-foreground'
                        }`}
                    >
                      {doc.state === 'STATE_ACTIVE' ? (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          활성
                        </span>
                      ) : (
                        doc.state
                      )}
                    </span>
                    <Button
                      onClick={() => deleteDocument(doc.id, doc.lawName)}
                      variant="outline"
                      size="sm"
                      className="border-warning/30 text-warning hover:bg-warning/10"
                    >
                      삭제
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && documents.length > 0 && filteredDocuments.length === 0 && (
          <div className="p-8 bg-muted/30 backdrop-blur-sm rounded-xl border border-border/50 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">필터 조건에 맞는 문서가 없습니다</p>
            <p className="text-sm text-muted-foreground/70 mt-1">다른 필터를 선택하거나 검색어를 변경해보세요</p>
          </div>
        )}
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
