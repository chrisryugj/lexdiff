/**
 * Ordinance Upload Progress Panel Component
 * Upload .md files from data/parsed-ordinances/{districtName}/ to File Search Store
 */

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Loader2, Upload, Pause, Play, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
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
  onRenderHeader?: (syncButton: React.ReactNode) => void
}

export function OrdinanceUploadPanel({ onUploadComplete, refreshTrigger, onRenderHeader }: OrdinanceUploadPanelProps) {
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
    // Don't auto-sync with server on mount - user must click sync button
  }, [])

  useEffect(() => {
    // Pass sync button to parent if callback provided
    if (onRenderHeader) {
      const syncButton = (
        <Button
          onClick={checkStoreIdAndSync}
          disabled={uploading}
          variant="outline"
          size="sm"
          className="border-primary/30 text-primary hover:bg-primary/10"
        >
          스토어 동기화
        </Button>
      )
      onRenderHeader(syncButton)
    }
  }, [uploading, onRenderHeader])

  // Reload when refreshTrigger changes (tab switch)
  useEffect(() => {
    if (refreshTrigger !== undefined) {
      loadParsedOrdinances()
      // Don't auto-sync on tab switch - user must click sync button
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

  function forceResetUploadStatus() {
    if (
      !confirm(
        '⚠️ 조례 업로드 상태를 강제로 초기화하시겠습니까?\n\n이 작업은 다음을 수행합니다:\n• 모든 조례를 "미업로드" 상태로 변경\n• 실제 File Search Store의 파일은 삭제되지 않음\n• 이미 업로드된 파일을 다시 업로드하면 중복이 발생할 수 있음'
      )
    ) {
      return
    }

    try {
      localStorage.removeItem('uploadedOrdinances')
      setUploadedFiles(new Set())
      alert('✅ 조례 업로드 상태가 초기화되었습니다')
    } catch (error: any) {
      alert('❌ 초기화 실패: ' + error.message)
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
  const progress = uploading && totalFiles > 0 ? (currentIndex / totalFiles) * 100 : 0

  return (
    <div className="space-y-6">
      {/* Progress Monitor */}
      {uploading && (
        <div className="relative overflow-hidden p-4 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-xl backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 shadow-sm">
                {paused ? (
                  <Pause className="h-5 w-5 text-warning" />
                ) : (
                  <Loader2 className="h-5 w-5 text-primary animate-spin" />
                )}
              </div>
              <div>
                <div className="font-medium text-foreground">
                  {paused ? '일시중지됨' : '업로드 중...'} ({currentIndex} / {selectedCount})
                </div>
                <div className="text-sm text-muted-foreground">동시 업로드: {concurrency}개 병렬 처리</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-foreground">{Math.round(progress)}%</div>
              <div className="text-sm text-muted-foreground">남은 파일: {selectedCount - currentIndex}개</div>
            </div>
          </div>
          <div className="relative h-2 bg-muted/50 rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-accent to-primary rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"
              style={{ width: '50%' }}
            />
          </div>
        </div>
      )}

      {/* District Multi-Select Filter */}
      <div className="p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-muted-foreground">
            자치구 필터 ({selectedDistricts.size === 0 ? '전체' : `${selectedDistricts.size}개 선택`})
          </label>
          <div className="flex gap-2">
            <Button
              onClick={selectAllDistricts}
              variant="outline"
              size="sm"
              disabled={loading || uploading}
            >
              전체 선택
            </Button>
            <Button
              onClick={clearDistrictSelection}
              variant="outline"
              size="sm"
              disabled={loading || uploading || selectedDistricts.size === 0}
            >
              선택 해제
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-64 overflow-y-auto">
          {districts.map((district, index) => {
            const count = parsedOrdinances.filter((o) => o.districtName === district).length
            const pendingCount = parsedOrdinances.filter(
              (o) => o.districtName === district && !uploadedFiles.has(getFileKey(o))
            ).length
            const isSelected = selectedDistricts.has(district)

            return (
              <div
                key={district}
                onClick={() => !loading && !uploading && toggleDistrictSelection(district)}
                className={`
                  p-3 border rounded-xl cursor-pointer transition-all
                  ${isSelected
                    ? 'bg-primary/10 border-primary/30 ring-2 ring-primary/20 shadow-md'
                    : 'bg-card/30 border-border/50 hover:border-primary/30 hover:bg-card/50 hover:shadow-sm'
                  }
                  ${loading || uploading ? 'opacity-50 cursor-not-allowed' : ''}
                `}
                style={{
                  animation: `fadeInUp 0.3s ease-out ${index * 20}ms both`
                }}
              >
                <div className="text-sm font-medium text-foreground truncate" title={district}>
                  {district}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  전체 {count}개 · 대기 {pendingCount}개
                </div>
                {isSelected && (
                  <div className="mt-2">
                    <span className="px-2 py-1 bg-primary/10 border border-primary/20 rounded text-xs text-primary">
                      ✓ 선택됨
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          💡 여러 자치구를 선택하면 해당 자치구의 조례만 필터링됩니다
        </p>
      </div>

      {/* Batch Settings */}
      <div className="p-4 bg-muted/30 backdrop-blur-sm rounded-xl border border-border/50">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">배치 크기 (묶음 단위)</label>
            <select
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              className="w-full px-3 py-2 bg-card/50 border border-border/50 rounded text-foreground text-sm"
              disabled={uploading}
            >
              <option value={10}>10개씩</option>
              <option value={50}>50개씩</option>
              <option value={100}>100개씩 (빠름)</option>
              <option value={200}>200개씩 (매우 빠름)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">동시 업로드 수</label>
            <select
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
              className="w-full px-3 py-2 bg-card/50 border border-border/50 rounded text-foreground text-sm"
              disabled={uploading}
            >
              <option value={1}>1개 (안전)</option>
              <option value={3}>3개 (권장)</option>
              <option value={5}>5개 (빠름)</option>
              <option value={10}>10개 (매우 빠름)</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          💡 동시 업로드: {concurrency}개씩 병렬 처리 · 배치 저장: {batchSize}개마다 진행 상황 저장
        </p>
      </div>

      {/* Selection Controls */}
      <div className="flex items-center justify-between p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm">
        <div className="text-sm text-muted-foreground">
          {selectedCount > 0 ? `${selectedCount}개 선택됨` : <>선택된<br />파일 없음</>}
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Sync button moved to header - only show if not using callback */}
          {!onRenderHeader && (
            <Button
              onClick={checkStoreIdAndSync}
              disabled={uploading}
              variant="outline"
              size="default"
              className="border-primary/30 text-primary hover:bg-primary/10"
            >
              스토어 동기화
            </Button>
          )}
          <Button
            onClick={forceResetUploadStatus}
            disabled={uploading}
            variant="outline"
            size="default"
          >
            강제 초기화
          </Button>
          <Button
            onClick={loadParsedOrdinances}
            disabled={loading || uploading}
            variant="outline"
            size="default"
          >
            {loading ? '새로고침 중' : '새로고침'}
          </Button>
          <LogImport onImport={handleLogImport} />
          <Button
            onClick={selectedCount > 0 ? clearSelection : selectAll}
            variant="outline"
            size="default"
          >
            {selectedCount > 0 ? '선택 해제' : '전체 선택'}
          </Button>
          {uploading && !paused ? (
            <Button onClick={pauseUpload} variant="outline" size="default" className="border-warning/30 text-warning hover:bg-warning/10 gap-2">
              <Pause className="w-4 h-4" />
              일시중지
            </Button>
          ) : uploading && paused ? (
            <Button onClick={resumeUpload} size="default" className="shadow-lg shadow-accent/20 bg-accent hover:bg-accent/90 gap-2">
              <Play className="w-4 h-4" />
              재개
            </Button>
          ) : (
            <Button
              onClick={startUpload}
              disabled={selectedCount === 0}
              className="shadow-lg shadow-primary/20 gap-2"
              size="default"
            >
              <Upload className="w-4 h-4" />
              업로드
            </Button>
          )}
        </div>
      </div>

      {/* Upload Results */}
      {results.length > 0 && (
        <div className="p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm">
          <div className="space-y-1 text-sm mb-3">
            <p className="flex items-center gap-2 text-accent">
              <CheckCircle2 className="w-4 h-4" />
              성공: {successCount}개
            </p>
            <p className="flex items-center gap-2 text-warning">
              <XCircle className="w-4 h-4" />
              실패: {errorCount}개
            </p>
          </div>

          {errorCount > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-muted-foreground">실패한 파일:</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {results
                  .filter((r) => r.status === 'error')
                  .map((r, idx) => (
                    <div key={idx} className="text-xs text-warning bg-warning/10 p-2 rounded">
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
        {loading ? (
          <div className="p-8 bg-muted/30 backdrop-blur-sm rounded-xl border border-border/50 text-center">
            <Loader2 className="h-12 w-12 text-muted-foreground mx-auto mb-3 animate-spin" />
            <p className="text-muted-foreground">로딩 중...</p>
          </div>
        ) : pendingOrdinances.length === 0 ? (
          <div className="p-8 bg-muted/30 backdrop-blur-sm rounded-xl border border-border/50 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {selectedDistricts.size === 0
                ? '업로드 대기 중인 파일이 없습니다'
                : '선택한 자치구에 업로드 대기 중인 파일이 없습니다'}
            </p>
            <p className="text-sm text-muted-foreground/70 mt-1">모든 파일이 업로드되었습니다</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {pendingOrdinances.map((ordinance, index) => {
              const key = getFileKey(ordinance)
              const isSelected = selectedFiles.has(key)
              const uploadResult = results.find(
                (r) => r.fileName === ordinance.fileName && r.districtName === ordinance.districtName
              )

              return (
                <div
                  key={key}
                  onClick={() => !uploading && toggleSelection(ordinance)}
                  className={`
                    p-4 border rounded-xl cursor-pointer transition-all
                    ${isSelected
                      ? 'bg-primary/10 border-primary/30 ring-2 ring-primary/20 shadow-md'
                      : uploadResult?.status === 'success'
                        ? 'bg-accent/10 border-accent/30 shadow-sm'
                        : uploadResult?.status === 'error'
                          ? 'bg-warning/10 border-warning/30 shadow-sm'
                          : 'bg-card/30 border-border/50 hover:border-primary/30 hover:bg-card/50 hover:shadow-sm'
                    }
                    ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                  style={{
                    animation: `fadeInUp 0.3s ease-out ${index * 10}ms both`
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-foreground">{ordinance.ordinanceName}</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {ordinance.districtName} · {(ordinance.fileSize / 1024).toFixed(2)} KB
                      </div>
                      <div className="text-xs text-muted-foreground/70 mt-1">
                        다운로드: {formatDate(ordinance.lastModified)}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      {isSelected && !uploadResult && (
                        <span className="px-2 py-1 bg-primary/10 border border-primary/20 rounded text-xs text-primary">
                          선택됨
                        </span>
                      )}
                      {uploadResult?.status === 'success' && (
                        <CheckCircle2 className="w-5 h-5 text-accent" />
                      )}
                      {uploadResult?.status === 'error' && (
                        <XCircle className="w-5 h-5 text-warning" />
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
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {uploadedOrdinances.map((ordinance) => {
            const key = getFileKey(ordinance)
            return (
              <div key={key} className="p-4 border border-accent/20 bg-accent/10 rounded-xl opacity-75">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-foreground">{ordinance.ordinanceName}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {ordinance.districtName} · {(ordinance.fileSize / 1024).toFixed(2)} KB
                    </div>
                    <div className="text-xs text-muted-foreground/70 mt-1">
                      다운로드: {formatDate(ordinance.lastModified)}
                    </div>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-accent" />
                </div>
              </div>
            )
          })}
        </div>
      )}

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

function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate)
    // Convert to KST (UTC+9)
    const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000))
    const year = kstDate.getUTCFullYear()
    const month = String(kstDate.getUTCMonth() + 1).padStart(2, '0')
    const day = String(kstDate.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  } catch {
    return isoDate
  }
}
