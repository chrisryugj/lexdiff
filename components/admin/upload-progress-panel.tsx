/**
 * Upload Progress Panel Component (New)
 * Upload .md files from data/parsed-laws to File Search Store
 */

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Loader2, Upload } from 'lucide-react'

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

interface UploadProgressPanelProps {
  onUploadComplete?: () => void
}

export function UploadProgressPanel({ onUploadComplete }: UploadProgressPanelProps) {
  const [parsedLaws, setParsedLaws] = useState<ParsedLawFile[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<UploadResult[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [uploadedFiles, setUploadedFiles] = useState<Set<string>>(new Set())

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
    // Only select pending (not yet uploaded) files
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

  async function uploadSingleFile(fileName: string): Promise<UploadResult> {
    try {
      const response = await fetch('/api/admin/upload-parsed-law', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fileName })
      })

      const data = await response.json()

      if (data.success) {
        return {
          fileName,
          lawName: data.lawName,
          status: 'success',
          documentId: data.documentId
        }
      } else {
        return {
          fileName,
          status: 'error',
          error: data.error
        }
      }
    } catch (error: any) {
      return {
        fileName,
        status: 'error',
        error: error.message
      }
    }
  }

  async function startUpload() {
    if (selectedFiles.size === 0) return

    setUploading(true)
    setResults([])
    setCurrentIndex(0)

    const fileNames = Array.from(selectedFiles)
    const uploadResults: UploadResult[] = []

    for (let i = 0; i < fileNames.length; i++) {
      const fileName = fileNames[i]
      setCurrentIndex(i + 1)

      const result = await uploadSingleFile(fileName)
      uploadResults.push(result)

      // Small delay between uploads
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    setResults(uploadResults)
    setUploading(false)

    // Update uploaded files list
    const successfulFiles = uploadResults.filter((r) => r.status === 'success').map((r) => r.fileName)
    const newUploadedFiles = new Set([...uploadedFiles, ...successfulFiles])
    saveUploadedFiles(newUploadedFiles)

    // Clear selection for successful uploads
    const failedFiles = uploadResults.filter((r) => r.status === 'error').map((r) => r.fileName)
    setSelectedFiles(new Set(failedFiles))

    onUploadComplete?.()
  }

  const selectedCount = selectedFiles.size
  const successCount = results.filter((r) => r.status === 'success').length
  const errorCount = results.filter((r) => r.status === 'error').length

  // Split laws into uploaded and pending
  const pendingLaws = parsedLaws.filter((law) => !uploadedFiles.has(law.fileName))
  const uploadedLaws = parsedLaws.filter((law) => uploadedFiles.has(law.fileName))

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">📤 File Search Store 업로드</h2>
        <p className="text-sm text-gray-400">
          <code>data/parsed-laws</code> 폴더의 마크다운 파일을 File Search Store에 업로드합니다.
        </p>
      </div>

      {/* Selection Controls */}
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
          <Button onClick={selectAll} variant="outline" size="default">
            전체 선택
          </Button>
          <Button onClick={clearSelection} variant="outline" size="default">
            선택 해제
          </Button>
          <Button
            onClick={startUpload}
            disabled={selectedCount === 0 || uploading}
            className="gap-2 shadow-lg shadow-primary/20 min-w-[140px]"
            size="default"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                업로드 중...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                업로드 시작
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Upload Progress */}
      {uploading && (
        <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
          <div className="mb-2">
            <p className="text-sm text-gray-300">
              업로드 중... ({currentIndex}/{selectedCount})
            </p>
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
                  .map((r) => (
                    <div key={r.fileName} className="text-xs text-red-400 bg-red-900/20 p-2 rounded">
                      {r.lawName || r.fileName}: {r.error}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pending Laws List */}
      <div className="space-y-2">
        <h3 className="font-medium text-white">
          📁 업로드 대기 ({pendingLaws.length}개 파일)
        </h3>
        {loading ? (
          <div className="p-8 bg-gray-800 border border-gray-700 rounded-lg text-center">
            <p className="text-gray-400">로딩 중...</p>
          </div>
        ) : pendingLaws.length === 0 ? (
          <div className="p-8 bg-gray-800 border border-gray-700 rounded-lg text-center">
            <p className="text-gray-500">업로드 대기 중인 파일이 없습니다</p>
            <p className="text-sm text-gray-600 mt-1">모든 파일이 업로드되었습니다</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {pendingLaws.map((law) => {
              const isSelected = selectedFiles.has(law.fileName)
              const uploadResult = results.find((r) => r.fileName === law.fileName)

              return (
                <div
                  key={law.fileName}
                  onClick={() => !uploading && toggleSelection(law.fileName)}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-blue-900/30 border-blue-700'
                      : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                  } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-white">{law.lawName}</div>
                      <div className="text-sm text-gray-400 mt-1">
                        {law.fileName} · {(law.fileSize / 1024).toFixed(2)} KB
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        수정: {new Date(law.lastModified).toLocaleString()}
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

      {/* Uploaded Laws List */}
      {uploadedLaws.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium text-white">
            ✅ 업로드됨 ({uploadedLaws.length}개 파일)
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {uploadedLaws.map((law) => (
              <div
                key={law.fileName}
                className="p-4 border border-green-900/30 bg-green-900/10 rounded-lg opacity-75"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-white">{law.lawName}</div>
                    <div className="text-sm text-gray-400 mt-1">
                      {law.fileName} · {(law.fileSize / 1024).toFixed(2)} KB
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-green-900/30 border border-green-700 rounded text-xs text-green-400">
                    ✓ 업로드됨
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
