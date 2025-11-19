/**
 * Batch Law Upload Panel Component
 * Upload multiple saved laws to File Search Store at once
 */

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Loader2, Upload, CheckCircle, XCircle } from 'lucide-react'

interface ParsedLawFile {
  fileName: string
  filePath: string
  lawName: string
  fileSize: number
  lastModified: string
}

interface UploadResult {
  fileName: string
  lawName?: string
  status: 'success' | 'error'
  error?: string
  documentId?: string
}

interface BatchLawUploadPanelProps {
  onUploadComplete?: () => void
}

export function BatchLawUploadPanel({ onUploadComplete }: BatchLawUploadPanelProps) {
  const [parsedLaws, setParsedLaws] = useState<ParsedLawFile[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<UploadResult[]>([])
  const [currentBatch, setCurrentBatch] = useState(0)
  const [totalBatches, setTotalBatches] = useState(0)
  const [uploadedFiles, setUploadedFiles] = useState<Set<string>>(new Set())
  const [batchSize, setBatchSize] = useState(10)

  useEffect(() => {
    loadParsedLaws()
    loadUploadedFiles()
  }, [])

  function loadUploadedFiles() {
    try {
      const stored = localStorage.getItem('uploadedLaws')
      if (stored) {
        setUploadedFiles(new Set(JSON.parse(stored)))
      }
    } catch (error) {
      console.error('Failed to load uploaded files:', error)
    }
  }

  function saveUploadedFiles(files: Set<string>) {
    try {
      localStorage.setItem('uploadedLaws', JSON.stringify(Array.from(files)))
      setUploadedFiles(files)
    } catch (error) {
      console.error('Failed to save uploaded files:', error)
    }
  }

  async function loadParsedLaws() {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/list-parsed-laws')
      const data = await response.json()

      if (data.success) {
        setParsedLaws(data.laws)
      } else {
        alert('법령 목록 조회 실패: ' + data.error)
      }
    } catch (error: any) {
      alert('법령 목록 조회 중 오류: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  function toggleSelection(fileName: string) {
    const newSet = new Set(selectedFiles)
    if (newSet.has(fileName)) {
      newSet.delete(fileName)
    } else {
      newSet.add(fileName)
    }
    setSelectedFiles(newSet)
  }

  function selectAll() {
    const pendingFileNames = parsedLaws.filter((l) => !uploadedFiles.has(l.fileName)).map((l) => l.fileName)
    setSelectedFiles(new Set(pendingFileNames))
  }

  function clearSelection() {
    setSelectedFiles(new Set())
  }

  function forceResetUploadStatus() {
    if (
      !confirm(
        '⚠️ 업로드 상태를 강제로 초기화하시겠습니까?\n\n이 작업은 다음을 수행합니다:\n• 모든 법령을 "미업로드" 상태로 변경\n• 실제 File Search Store의 파일은 삭제되지 않음\n• 이미 업로드된 파일을 다시 업로드하면 중복이 발생할 수 있음'
      )
    ) {
      return
    }

    try {
      localStorage.removeItem('uploadedLaws')
      setUploadedFiles(new Set())
      alert('✅ 업로드 상태가 초기화되었습니다')
    } catch (error: any) {
      alert('❌ 초기화 실패: ' + error.message)
    }
  }

  async function uploadBatch() {
    if (selectedFiles.size === 0) return

    setUploading(true)
    setResults([])

    const fileNames = Array.from(selectedFiles)
    const numBatches = Math.ceil(fileNames.length / batchSize)
    setTotalBatches(numBatches)

    const allResults: UploadResult[] = []

    for (let i = 0; i < numBatches; i++) {
      setCurrentBatch(i + 1)

      const batchFileNames = fileNames.slice(i * batchSize, (i + 1) * batchSize)

      // Upload batch
      const batchResults = await uploadBatchFiles(batchFileNames)
      allResults.push(...batchResults)

      // Update results incrementally
      setResults([...allResults])

      // Small delay between batches
      if (i < numBatches - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    setUploading(false)

    // Update uploaded files list
    const successfulFiles = allResults.filter((r) => r.status === 'success').map((r) => r.fileName)
    const newUploadedFiles = new Set([...uploadedFiles, ...successfulFiles])
    saveUploadedFiles(newUploadedFiles)

    // Clear selection for successful uploads
    const failedFiles = allResults.filter((r) => r.status === 'error').map((r) => r.fileName)
    setSelectedFiles(new Set(failedFiles))

    onUploadComplete?.()

    const successCount = allResults.filter((r) => r.status === 'success').length
    alert(
      `✅ 배치 업로드 완료!\n\n성공: ${successCount}개\n실패: ${allResults.length - successCount}개`
    )
  }

  async function uploadBatchFiles(fileNames: string[]): Promise<UploadResult[]> {
    try {
      const formData = new FormData()

      // Read each file and add to formData
      for (const fileName of fileNames) {
        const law = parsedLaws.find((l) => l.fileName === fileName)
        if (!law) continue

        // Read file content
        const response = await fetch(`/api/admin/read-parsed-law?fileName=${encodeURIComponent(fileName)}`)
        const data = await response.json()

        if (!data.success) {
          console.error('Failed to read file:', fileName)
          continue
        }

        // Create Blob from markdown content
        const blob = new Blob([data.markdown], { type: 'text/markdown' })
        const file = new File([blob], fileName, { type: 'text/markdown' })

        formData.append('files', file)
      }

      // Add metadata
      const metadata = {
        law_type: 'law',
        upload_source: 'batch-upload-panel',
        batch_size: fileNames.length.toString()
      }
      formData.append('metadata', JSON.stringify(metadata))

      // Call batch upload API
      const uploadResponse = await fetch('/api/admin/batch-upload-files', {
        method: 'POST',
        body: formData
      })

      const uploadData = await uploadResponse.json()

      if (!uploadData.success) {
        // All failed
        return fileNames.map((fileName) => ({
          fileName,
          status: 'error',
          error: uploadData.error || 'Upload failed'
        }))
      }

      // Map results
      return uploadData.results.map((r: any) => ({
        fileName: r.fileName,
        lawName: r.fileName.replace('.md', ''),
        status: r.success ? 'success' : 'error',
        error: r.error,
        documentId: r.documentId
      }))
    } catch (error: any) {
      return fileNames.map((fileName) => ({
        fileName,
        status: 'error',
        error: error.message
      }))
    }
  }

  const selectedCount = selectedFiles.size
  const successCount = results.filter((r) => r.status === 'success').length
  const errorCount = results.filter((r) => r.status === 'error').length
  const pendingLaws = parsedLaws.filter((law) => !uploadedFiles.has(law.fileName))
  const uploadedLaws = parsedLaws.filter((law) => uploadedFiles.has(law.fileName))

  const progress = uploading && totalBatches > 0 ? (currentBatch / totalBatches) * 100 : 0

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">⚡ 법령 배치 업로드</h2>
        <p className="text-sm text-gray-400">
          여러 법령을 한 번에 File Search Store에 업로드합니다 (더 빠른 속도)
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
          <p className="text-sm text-gray-400">총 법령</p>
          <p className="text-2xl font-bold text-white">{parsedLaws.length}</p>
        </div>
        <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
          <p className="text-sm text-gray-400">대기 중</p>
          <p className="text-2xl font-bold text-yellow-400">{pendingLaws.length}</p>
        </div>
        <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
          <p className="text-sm text-gray-400">이미 업로드됨</p>
          <p className="text-2xl font-bold text-green-400">{uploadedLaws.length}</p>
        </div>
        <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
          <p className="text-sm text-gray-400">선택됨</p>
          <p className="text-2xl font-bold text-blue-400">{selectedCount}</p>
        </div>
      </div>

      {/* Batch Settings */}
      <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
        <div className="flex items-center gap-4">
          <label className="text-sm text-gray-300">배치 크기:</label>
          <select
            value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
            disabled={uploading}
            className="px-3 py-1 bg-gray-900 border border-gray-700 rounded text-white"
          >
            <option value={5}>5개씩</option>
            <option value={10}>10개씩</option>
            <option value={20}>20개씩</option>
            <option value={50}>50개씩</option>
            <option value={100}>100개씩</option>
          </select>
          <span className="text-xs text-gray-500">
            ({selectedCount}개 선택 → 약 {Math.ceil(selectedCount / batchSize)}개 배치)
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between p-4 bg-gray-800 border border-gray-700 rounded-lg">
        <div className="text-sm text-gray-300">
          {selectedCount > 0 ? `${selectedCount}개 선택됨` : '선택된 파일 없음'}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={forceResetUploadStatus}
            disabled={uploading}
            variant="outline"
            size="default"
          >
            강제 초기화
          </Button>
          <Button
            onClick={loadParsedLaws}
            disabled={loading || uploading}
            variant="outline"
            size="default"
          >
            {loading ? '새로고침 중' : '새로고침'}
          </Button>
          <Button
            onClick={selectAll}
            disabled={uploading}
            variant="outline"
            size="default"
          >
            전체 선택
          </Button>
          <Button
            onClick={clearSelection}
            disabled={uploading}
            variant="outline"
            size="default"
          >
            선택 해제
          </Button>
          <Button
            onClick={uploadBatch}
            disabled={selectedCount === 0 || uploading}
            className="gap-2 shadow-lg shadow-primary/20 min-w-[140px]"
            size="default"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                업로드 중... ({currentBatch}/{totalBatches})
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                배치 업로드
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Progress */}
      {uploading && (
        <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-300">
              배치 {currentBatch} / {totalBatches} 진행 중...
            </span>
            <span className="text-sm text-gray-400">{progress.toFixed(0)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      {/* Results Summary */}
      {results.length > 0 && (
        <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
          <h3 className="font-medium text-white mb-2">업로드 결과</h3>
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-green-400">성공: {successCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-400" />
              <span className="text-red-400">실패: {errorCount}</span>
            </div>
          </div>
        </div>
      )}

      {/* File List */}
      <div className="space-y-2">
        {/* Pending Laws */}
        {pendingLaws.length > 0 && (
          <div>
            <h3 className="font-medium text-white mb-2">대기 중인 법령 ({pendingLaws.length}개)</h3>
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {pendingLaws.map((law) => {
                const isSelected = selectedFiles.has(law.fileName)
                const result = results.find((r) => r.fileName === law.fileName)

                return (
                  <label
                    key={law.fileName}
                    className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-900/30 border-blue-600'
                        : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelection(law.fileName)}
                      disabled={uploading}
                      className="mr-3"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white truncate">{law.lawName}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {(law.fileSize / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    {result && (
                      <div className="ml-3">
                        {result.status === 'success' ? (
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        ) : (
                          <div className="flex items-center gap-2">
                            <XCircle className="w-4 h-4 text-red-400" />
                            <span className="text-xs text-red-400">{result.error}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {/* Uploaded Laws */}
        {uploadedLaws.length > 0 && (
          <div>
            <h3 className="font-medium text-white mb-2">이미 업로드됨 ({uploadedLaws.length}개)</h3>
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {uploadedLaws.map((law) => (
                <div
                  key={law.fileName}
                  className="flex items-center p-3 rounded-lg bg-green-900/20 border border-green-700"
                >
                  <CheckCircle className="w-4 h-4 text-green-400 mr-3" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white truncate">{law.lawName}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {(law.fileSize / 1024).toFixed(1)} KB
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {parsedLaws.length === 0 && !loading && (
        <div className="p-8 bg-gray-800 border border-gray-700 rounded-lg text-center">
          <p className="text-gray-500">저장된 법령이 없습니다</p>
          <p className="text-sm text-gray-600 mt-1">먼저 &quot;파싱&quot; 탭에서 법령을 다운로드하세요</p>
        </div>
      )}
    </div>
  )
}
