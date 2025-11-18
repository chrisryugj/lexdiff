/**
 * Ordinance Upload Progress Panel Component
 * Upload .md files from data/parsed-ordinances/{districtName}/ to File Search Store
 */

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import LogImport from '@/admin/components/log-import'

interface ParsedOrdinanceFile {
  fileName: string
  filePath: string
  ordinanceName: string
  districtName: string
  fileSize: number
  lastModified: string
}

interface UploadResult {
  fileName: string
  ordinanceName?: string
  districtName?: string
  status: 'success' | 'error'
  error?: string
  documentId?: string
}

interface OrdinanceUploadPanelProps {
  onUploadComplete?: () => void
  refreshTrigger?: number // Optional prop to trigger refresh
}

export function OrdinanceUploadPanel({ onUploadComplete, refreshTrigger }: OrdinanceUploadPanelProps) {
  const [parsedOrdinances, setParsedOrdinances] = useState<ParsedOrdinanceFile[]>([])
  const [districts, setDistricts] = useState<string[]>([])
  const [selectedDistricts, setSelectedDistricts] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState(false)
  const [paused, setPaused] = useState(false)
  const [results, setResults] = useState<UploadResult[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [totalFiles, setTotalFiles] = useState(0)
  const [uploadedFiles, setUploadedFiles] = useState<Set<string>>(new Set())
  const [batchSize, setBatchSize] = useState(10)
  const [concurrency, setConcurrency] = useState(3)
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const [currentStoreId, setCurrentStoreId] = useState<string | null>(null)

  useEffect(() => {
    loadParsedOrdinances()
    checkStoreIdAndSync()
  }, [])

  // Reload when refreshTrigger changes (tab switch)
  useEffect(() => {
    if (refreshTrigger !== undefined) {
      loadParsedOrdinances()
      checkStoreIdAndSync()
    }
  }, [refreshTrigger])

  // Separate effect for job restoration
  useEffect(() => {
    const savedJobId = localStorage.getItem('currentUploadJobId')
    if (savedJobId && !currentJobId) {
      setCurrentJobId(savedJobId)
      setUploading(true)
      // Start polling after component is fully mounted
      setTimeout(() => {
        pollJobStatus(savedJobId)
      }, 100)
    }
  }, [parsedOrdinances])

  /**
   * ENV 스토어 ID 확인 및 동기화
   * - 스토어 ID가 변경되었으면 localStorage 초기화
   * - 실제 서버 상태와 동기화
   */
  async function checkStoreIdAndSync() {
    try {
      // 1. 현재 ENV 스토어 ID 가져오기
      const response = await fetch('/api/admin/list-store-documents')
      const data = await response.json()

      if (!data.success) {
        console.error('❌ Failed to get store ID:', data.error)
        return
      }

      const envStoreId = data.storeId
      const savedStoreId = localStorage.getItem('currentStoreId')

      console.log('🔍 Store ID check:', {
        env: envStoreId,
        saved: savedStoreId,
        changed: envStoreId !== savedStoreId
      })

      // 2. 스토어 ID가 변경되었으면 localStorage 초기화
      if (savedStoreId && envStoreId !== savedStoreId) {
        console.warn('⚠️ Store ID changed! Clearing localStorage...')
        localStorage.removeItem('uploadedOrdinances')
        setUploadedFiles(new Set())
      }

      // 3. 현재 스토어 ID 저장
      localStorage.setItem('currentStoreId', envStoreId)
      setCurrentStoreId(envStoreId)

      // 4. 서버와 동기화
      await syncWithServer(data.documents)
    } catch (error) {
      console.error('❌ Failed to check store ID:', error)
    }
  }

  function saveUploadedFiles(files: Set<string>) {
    try {
      localStorage.setItem('uploadedOrdinances', JSON.stringify(Array.from(files)))
      setUploadedFiles(files)
    } catch (error) {
      console.error('Failed to save uploaded files:', error)
    }
  }

  async function syncWithServer(documents?: any[]) {
    try {
      console.log('🔄 Syncing with server...')

      // Use provided documents or fetch fresh
      let data: any
      if (documents) {
        data = { success: true, documents }
      } else {
        const response = await fetch('/api/admin/list-store-documents')
        data = await response.json()
      }

      console.log('📊 Server response:', {
        success: data.success,
        documentCount: data.documents?.length || 0
      })

      if (data.success && data.documents) {
        // Extract ordinance file names from server
        const serverFiles = new Set<string>()

        let ordinanceCount = 0
        let matchedToLocalCount = 0

        // NOTE: All documents in store are ordinances (법률/시행령/시행규칙 not uploaded yet)
        for (const doc of data.documents) {
          const metadata = doc.customMetadata || []
          const fileName = metadata.find((m: any) => m.key === 'file_name')?.stringValue
          const districtName = metadata.find((m: any) => m.key === 'district_name')?.stringValue
          const lawType = metadata.find((m: any) => m.key === 'law_type')?.stringValue

          // Future-proof: Skip if it's a law/decree/rule (when uploaded later)
          if (lawType === 'law' || lawType === 'decree' || lawType === 'rule') {
            continue // Skip 법률/시행령/시행규칙
          }

          // Skip if lawType is explicitly not ordinance
          if (lawType && lawType !== 'ordinance') {
            continue
          }

          // All ordinances have metadata (law_type = 'ordinance')
          ordinanceCount++

          // Try to match with local files if we have both fileName and districtName
          if (fileName && districtName) {
            serverFiles.add(`${districtName}/${fileName}`)
            matchedToLocalCount++
          }
        }

        const matchPercentage = ordinanceCount > 0
          ? ((matchedToLocalCount / ordinanceCount) * 100).toFixed(1)
          : '0.0'

        console.log(`📊 Document analysis:`)
        console.log(`   - Total documents: ${data.documents.length}`)
        console.log(`   - 조례 (law_type='ordinance'): ${ordinanceCount}`)
        console.log(`   - 로컬 파일 매칭 성공: ${matchedToLocalCount}/${ordinanceCount} (${matchPercentage}%)`)
        console.log(`✅ Found ${serverFiles.size} ordinances matched with local files`)

        // Update localStorage with server state (even if empty)
        saveUploadedFiles(serverFiles)
      }
    } catch (error) {
      console.error('❌ Failed to sync with server:', error)
    }
  }

  async function loadParsedOrdinances() {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/list-parsed-ordinances')
      const data = await response.json()

      if (data.success) {
        setParsedOrdinances(data.ordinances)
        setDistricts(data.districts || [])
      } else {
        alert('조례 목록 조회 실패: ' + data.error)
      }
    } catch (error: any) {
      alert('조례 목록 조회 중 오류: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  function getFileKey(ordinance: ParsedOrdinanceFile): string {
    return `${ordinance.districtName}/${ordinance.fileName}`
  }

  function toggleSelection(ordinance: ParsedOrdinanceFile) {
    const key = getFileKey(ordinance)
    const newSet = new Set(selectedFiles)
    if (newSet.has(key)) {
      newSet.delete(key)
    } else {
      newSet.add(key)
    }
    setSelectedFiles(newSet)
  }

  function selectAll() {
    // Only select pending (not yet uploaded) files
    const filteredOrdinances = getFilteredOrdinances()
    const pendingKeys = filteredOrdinances.filter((o) => !uploadedFiles.has(getFileKey(o))).map(getFileKey)
    setSelectedFiles(new Set(pendingKeys))
  }

  function clearSelection() {
    setSelectedFiles(new Set())
  }

  function getFilteredOrdinances(): ParsedOrdinanceFile[] {
    if (selectedDistricts.size === 0) {
      return parsedOrdinances
    }
    return parsedOrdinances.filter((o) => selectedDistricts.has(o.districtName))
  }

  function toggleDistrictSelection(district: string) {
    const newSet = new Set(selectedDistricts)
    if (newSet.has(district)) {
      newSet.delete(district)
    } else {
      newSet.add(district)
    }
    setSelectedDistricts(newSet)
    // Clear file selection when district filter changes
    clearSelection()
  }

  function selectAllDistricts() {
    setSelectedDistricts(new Set(districts))
    clearSelection()
  }

  function clearDistrictSelection() {
    setSelectedDistricts(new Set())
    clearSelection()
  }

  async function uploadSingleFile(ordinance: ParsedOrdinanceFile): Promise<UploadResult> {
    try {
      const response = await fetch('/api/admin/upload-parsed-ordinance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileName: ordinance.fileName,
          districtName: ordinance.districtName
        })
      })

      const data = await response.json()

      if (data.success) {
        return {
          fileName: ordinance.fileName,
          ordinanceName: data.ordinanceName,
          districtName: data.districtName,
          status: 'success',
          documentId: data.documentId
        }
      } else {
        return {
          fileName: ordinance.fileName,
          districtName: ordinance.districtName,
          status: 'error',
          error: data.error
        }
      }
    } catch (error: any) {
      return {
        fileName: ordinance.fileName,
        districtName: ordinance.districtName,
        status: 'error',
        error: error.message
      }
    }
  }

  async function startUpload() {
    if (selectedFiles.size === 0) return

    const selectedOrdinances = parsedOrdinances.filter((o) => selectedFiles.has(getFileKey(o)))
    const files = selectedOrdinances.map(o => ({
      fileName: o.fileName,
      districtName: o.districtName
    }))

    setUploading(true)
    setPaused(false)
    setResults([])
    setCurrentIndex(0)
    setTotalFiles(files.length)

    try {
      // Start background job
      const response = await fetch('/api/admin/batch-upload-ordinances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          files,
          concurrency
        })
      })

      const data = await response.json()

      if (data.success && data.jobId) {
        setCurrentJobId(data.jobId)
        // Save to localStorage
        localStorage.setItem('currentUploadJobId', data.jobId)
        // Start polling for progress
        pollJobStatus(data.jobId)
      } else {
        throw new Error(data.error || 'Failed to start upload job')
      }
    } catch (error: any) {
      alert('업로드 시작 실패: ' + error.message)
      setUploading(false)
    }
  }

  async function pollJobStatus(jobId: string) {
    try {
      const response = await fetch('/api/admin/batch-upload-ordinances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'status',
          jobId
        })
      })

      const data = await response.json()

      if (data.success && data.job) {
        const job = data.job
        setCurrentIndex(job.current)
        setTotalFiles(job.total)
        setResults(job.results)

        // Update uploaded files
        const successfulFiles = job.results
          .filter((r: any) => r.status === 'success')
          .map((r: any) => `${r.districtName || ''}/${r.fileName}`)

        setUploadedFiles(prev => {
          const newSet = new Set([...prev, ...successfulFiles])
          localStorage.setItem('uploadedOrdinances', JSON.stringify(Array.from(newSet)))
          return newSet
        })

        // Check if completed
        if (job.status === 'completed') {
          setUploading(false)
          setCurrentJobId(null)
          localStorage.removeItem('currentUploadJobId')
          onUploadComplete?.()
          return
        }

        // Check if paused
        if (job.status === 'paused') {
          setPaused(true)
          return
        }

        // Continue polling if still running
        if (job.status === 'running') {
          setTimeout(() => pollJobStatus(jobId), 2000) // Poll every 2 seconds
        }
      }
    } catch (error) {
      console.error('Polling error:', error)
      // Retry after delay if job still exists in localStorage
      const savedJobId = localStorage.getItem('currentUploadJobId')
      if (savedJobId === jobId) {
        setTimeout(() => pollJobStatus(jobId), 5000)
      }
    }
  }

  async function pauseUpload() {
    if (!currentJobId) return

    try {
      await fetch('/api/admin/batch-upload-ordinances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'pause',
          jobId: currentJobId
        })
      })

      setPaused(true)
    } catch (error) {
      console.error('Pause error:', error)
    }
  }

  async function resumeUpload() {
    if (!currentJobId) return

    const selectedOrdinances = parsedOrdinances.filter((o) => selectedFiles.has(getFileKey(o)))
    const files = selectedOrdinances.map(o => ({
      fileName: o.fileName,
      districtName: o.districtName
    }))

    try {
      await fetch('/api/admin/batch-upload-ordinances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resume',
          jobId: currentJobId,
          files,
          concurrency
        })
      })

      setPaused(false)
      pollJobStatus(currentJobId)
    } catch (error) {
      console.error('Resume error:', error)
    }
  }

  /**
   * 로그 파일에서 업로드된 파일 목록 import
   */
  function handleLogImport(uploadedFileNames: string[]) {
    console.log('📋 Importing uploaded files from log:', uploadedFileNames.length)

    // Convert log file names to file keys
    const importedKeys = new Set<string>()

    for (const logFileName of uploadedFileNames) {
      // Try to match with existing ordinances
      for (const ordinance of parsedOrdinances) {
        const key = getFileKey(ordinance)
        const fullPath = `${ordinance.districtName}/${ordinance.fileName}`
        const rootPath = ordinance.fileName

        // Match patterns: "districtName/fileName" or just "fileName" for root
        if (
          logFileName.includes(ordinance.fileName) ||
          logFileName.includes(ordinance.ordinanceName) ||
          logFileName === ordinance.fileName ||
          logFileName === fullPath ||
          logFileName === rootPath
        ) {
          importedKeys.add(key)
        }
      }
    }

    // Add to uploadedFiles
    const newUploadedFiles = new Set([...uploadedFiles, ...importedKeys])
    saveUploadedFiles(newUploadedFiles)

    console.log(`✅ Imported ${importedKeys.size} files from log`)
    alert(`로그에서 ${importedKeys.size}개 파일을 업로드됨으로 표시했습니다.`)
  }

  const filteredOrdinances = getFilteredOrdinances()
  const pendingOrdinances = filteredOrdinances.filter((o) => !uploadedFiles.has(getFileKey(o)))
  const uploadedOrdinances = filteredOrdinances.filter((o) => uploadedFiles.has(getFileKey(o)))

  // Use current upload job total if available, otherwise selected files
  const selectedCount = uploading && totalFiles > 0 ? totalFiles : selectedFiles.size
  const successCount = results.filter((r) => r.status === 'success').length
  const errorCount = results.filter((r) => r.status === 'error').length

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">📤 조례 File Search Store 업로드</h2>
        <p className="text-sm text-gray-400">
          <code>data/parsed-ordinances</code> 폴더의 조례 마크다운 파일을 File Search Store에 업로드합니다.
        </p>
      </div>

      {/* District Multi-Select Filter */}
      <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-gray-300">
            🏛️ 자치구 필터 ({selectedDistricts.size === 0 ? '전체' : `${selectedDistricts.size}개 선택`})
          </label>
          <div className="flex gap-2">
            <Button
              onClick={selectAllDistricts}
              variant="outline"
              size="sm"
              className="border-gray-600 text-gray-300 text-xs"
              disabled={loading || uploading}
            >
              전체 선택
            </Button>
            <Button
              onClick={clearDistrictSelection}
              variant="outline"
              size="sm"
              className="border-gray-600 text-gray-300 text-xs"
              disabled={loading || uploading || selectedDistricts.size === 0}
            >
              선택 해제
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-64 overflow-y-auto">
          {districts.map((district) => {
            const count = parsedOrdinances.filter((o) => o.districtName === district).length
            const pendingCount = parsedOrdinances.filter(
              (o) => o.districtName === district && !uploadedFiles.has(getFileKey(o))
            ).length
            const isSelected = selectedDistricts.has(district)

            return (
              <div
                key={district}
                onClick={() => !loading && !uploading && toggleDistrictSelection(district)}
                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-blue-900/30 border-blue-700'
                    : 'bg-gray-900 border-gray-700 hover:border-gray-600'
                } ${loading || uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="text-sm font-medium text-white truncate" title={district}>
                  {district}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  전체 {count}개 · 대기 {pendingCount}개
                </div>
                {isSelected && (
                  <div className="mt-2">
                    <span className="px-2 py-1 bg-blue-900/30 border border-blue-700 rounded text-xs text-blue-400">
                      ✓ 선택됨
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <p className="text-xs text-gray-500 mt-3">
          💡 여러 자치구를 선택하면 해당 자치구의 조례만 필터링됩니다
        </p>
      </div>

      {/* Batch Settings */}
      <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
        <h3 className="text-sm font-medium text-gray-300 mb-3">⚙️ 배치 업로드 설정</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">배치 크기 (묶음 단위)</label>
            <select
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm"
              disabled={uploading}
            >
              <option value={10}>10개씩</option>
              <option value={50}>50개씩</option>
              <option value={100}>100개씩 (빠름)</option>
              <option value={200}>200개씩 (매우 빠름)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">동시 업로드 수</label>
            <select
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm"
              disabled={uploading}
            >
              <option value={1}>1개 (안전)</option>
              <option value={3}>3개 (권장)</option>
              <option value={5}>5개 (빠름)</option>
              <option value={10}>10개 (매우 빠름)</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          💡 동시 업로드: {concurrency}개씩 병렬 처리 · 배치 저장: {batchSize}개마다 진행 상황 저장
        </p>
      </div>

      {/* Selection Controls */}
      <div className="flex items-center justify-between p-4 bg-gray-800 border border-gray-700 rounded-lg">
        <div className="text-sm text-gray-300">
          {selectedCount > 0 ? `${selectedCount}개 선택됨` : '선택된 파일 없음'}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={async () => {
              await loadParsedOrdinances()
              await checkStoreIdAndSync()
            }}
            disabled={loading || uploading}
            variant="outline"
            size="sm"
            className="border-gray-600 text-gray-300"
          >
            {loading ? '새로고침 중...' : '🔄 새로고침'}
          </Button>
          <LogImport onImport={handleLogImport} />
          <Button onClick={selectAll} variant="outline" size="sm" className="border-gray-600 text-gray-300">
            전체 선택
          </Button>
          <Button onClick={clearSelection} variant="outline" size="sm" className="border-gray-600 text-gray-300">
            선택 해제
          </Button>
          {uploading && !paused ? (
            <Button onClick={pauseUpload} variant="outline" className="border-yellow-600 text-yellow-400">
              ⏸ 일시정지
            </Button>
          ) : uploading && paused ? (
            <Button onClick={resumeUpload} className="bg-green-600 hover:bg-green-700">
              ▶️ 재개
            </Button>
          ) : (
            <Button
              onClick={startUpload}
              disabled={selectedCount === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              🚀 업로드 시작
            </Button>
          )}
        </div>
      </div>

      {/* Upload Progress */}
      {uploading && (
        <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-300">
                {paused ? '⏸ 일시정지됨' : '🚀 업로드 중...'} ({currentIndex}/{selectedCount})
              </p>
              <p className="text-xs text-gray-500 mt-1">
                동시 업로드: {concurrency}개씩 병렬 처리 중
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-blue-400">{Math.round((currentIndex / selectedCount) * 100)}%</p>
              <p className="text-xs text-gray-500">남은 파일: {selectedCount - currentIndex}개</p>
            </div>
          </div>
          <Progress value={(currentIndex / selectedCount) * 100} className="h-2" />
        </div>
      )}

      {/* Upload Results */}
      {results.length > 0 && (
        <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
          <h3 className="font-medium text-white mb-2">업로드 결과</h3>
          <div className="space-y-1 text-sm">
            <p className="text-green-400">✓ 성공: {successCount}개</p>
            <p className="text-red-400">✗ 실패: {errorCount}개</p>
          </div>

          {errorCount > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-gray-300">실패한 파일:</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {results
                  .filter((r) => r.status === 'error')
                  .map((r, idx) => (
                    <div key={idx} className="text-xs text-red-400 bg-red-900/20 p-2 rounded">
                      {r.districtName}/{r.ordinanceName || r.fileName}: {r.error}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pending Ordinances List */}
      <div className="space-y-2">
        <h3 className="font-medium text-white">📁 업로드 대기 ({pendingOrdinances.length}개 파일)</h3>
        {loading ? (
          <div className="p-8 bg-gray-800 border border-gray-700 rounded-lg text-center">
            <p className="text-gray-400">로딩 중...</p>
          </div>
        ) : pendingOrdinances.length === 0 ? (
          <div className="p-8 bg-gray-800 border border-gray-700 rounded-lg text-center">
            <p className="text-gray-500">
              {selectedDistricts.size === 0
                ? '업로드 대기 중인 파일이 없습니다'
                : '선택한 자치구에 업로드 대기 중인 파일이 없습니다'}
            </p>
            <p className="text-sm text-gray-600 mt-1">모든 파일이 업로드되었습니다</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {pendingOrdinances.map((ordinance) => {
              const key = getFileKey(ordinance)
              const isSelected = selectedFiles.has(key)
              const uploadResult = results.find(
                (r) => r.fileName === ordinance.fileName && r.districtName === ordinance.districtName
              )

              return (
                <div
                  key={key}
                  onClick={() => !uploading && toggleSelection(ordinance)}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-blue-900/30 border-blue-700'
                      : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                  } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-white">{ordinance.ordinanceName}</div>
                      <div className="text-sm text-gray-400 mt-1">
                        📍 {ordinance.districtName} · {ordinance.fileName} · {(ordinance.fileSize / 1024).toFixed(2)}{' '}
                        KB
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        수정: {new Date(ordinance.lastModified).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      {isSelected && !uploadResult && (
                        <span className="px-2 py-1 bg-blue-900/30 border border-blue-700 rounded text-xs text-blue-400">
                          선택됨
                        </span>
                      )}
                      {uploadResult?.status === 'success' && (
                        <span className="px-2 py-1 bg-green-900/30 border border-green-700 rounded text-xs text-green-400">
                          ✓ 업로드 완료
                        </span>
                      )}
                      {uploadResult?.status === 'error' && (
                        <span className="px-2 py-1 bg-red-900/30 border border-red-700 rounded text-xs text-red-400">
                          ✗ 실패
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Uploaded Ordinances List */}
      {uploadedOrdinances.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium text-white">✅ 업로드됨 ({uploadedOrdinances.length}개 파일)</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {uploadedOrdinances.map((ordinance) => {
              const key = getFileKey(ordinance)
              return (
                <div key={key} className="p-4 border border-green-900/30 bg-green-900/10 rounded-lg opacity-75">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-white">{ordinance.ordinanceName}</div>
                      <div className="text-sm text-gray-400 mt-1">
                        📍 {ordinance.districtName} · {ordinance.fileName} · {(ordinance.fileSize / 1024).toFixed(2)}{' '}
                        KB
                      </div>
                    </div>
                    <span className="px-2 py-1 bg-green-900/30 border border-green-700 rounded text-xs text-green-400">
                      ✓ 업로드됨
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
