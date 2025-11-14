/**
 * Ordinance Upload Progress Panel Component
 * Upload .md files from data/parsed-ordinances/{districtName}/ to File Search Store
 */

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

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
}

export function OrdinanceUploadPanel({ onUploadComplete }: OrdinanceUploadPanelProps) {
  const [parsedOrdinances, setParsedOrdinances] = useState<ParsedOrdinanceFile[]>([])
  const [districts, setDistricts] = useState<string[]>([])
  const [selectedDistrict, setSelectedDistrict] = useState<string | 'all'>('all')
  const [loading, setLoading] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<UploadResult[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [uploadedFiles, setUploadedFiles] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadParsedOrdinances()
    loadUploadedFiles()
  }, [])

  function loadUploadedFiles() {
    try {
      const stored = localStorage.getItem('uploadedOrdinances')
      if (stored) {
        setUploadedFiles(new Set(JSON.parse(stored)))
      }
    } catch (error) {
      console.error('Failed to load uploaded files:', error)
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
    if (selectedDistrict === 'all') {
      return parsedOrdinances
    }
    return parsedOrdinances.filter((o) => o.districtName === selectedDistrict)
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

    setUploading(true)
    setResults([])
    setCurrentIndex(0)

    const selectedOrdinances = parsedOrdinances.filter((o) => selectedFiles.has(getFileKey(o)))
    const uploadResults: UploadResult[] = []

    for (let i = 0; i < selectedOrdinances.length; i++) {
      const ordinance = selectedOrdinances[i]
      setCurrentIndex(i + 1)

      const result = await uploadSingleFile(ordinance)
      uploadResults.push(result)

      // Small delay between uploads
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    setResults(uploadResults)
    setUploading(false)

    // Update uploaded files list
    const successfulFiles = uploadResults
      .filter((r) => r.status === 'success')
      .map((r) => `${r.districtName}/${r.fileName}`)
    const newUploadedFiles = new Set([...uploadedFiles, ...successfulFiles])
    saveUploadedFiles(newUploadedFiles)

    // Clear selection for successful uploads
    const failedKeys = uploadResults
      .filter((r) => r.status === 'error')
      .map((r) => `${r.districtName}/${r.fileName}`)
    setSelectedFiles(new Set(failedKeys))

    onUploadComplete?.()
  }

  const filteredOrdinances = getFilteredOrdinances()
  const pendingOrdinances = filteredOrdinances.filter((o) => !uploadedFiles.has(getFileKey(o)))
  const uploadedOrdinances = filteredOrdinances.filter((o) => uploadedFiles.has(getFileKey(o)))

  const selectedCount = selectedFiles.size
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

      {/* District Filter */}
      <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
        <label className="text-sm text-gray-300 mb-2 block">자치구 필터:</label>
        <select
          value={selectedDistrict}
          onChange={(e) => {
            setSelectedDistrict(e.target.value)
            clearSelection()
          }}
          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white"
          disabled={loading || uploading}
        >
          <option value="all">전체 ({parsedOrdinances.length}개)</option>
          {districts.map((district) => {
            const count = parsedOrdinances.filter((o) => o.districtName === district).length
            return (
              <option key={district} value={district}>
                {district} ({count}개)
              </option>
            )
          })}
        </select>
      </div>

      {/* Selection Controls */}
      <div className="flex items-center justify-between p-4 bg-gray-800 border border-gray-700 rounded-lg">
        <div className="text-sm text-gray-300">
          {selectedCount > 0 ? `${selectedCount}개 선택됨` : '선택된 파일 없음'}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={loadParsedOrdinances}
            disabled={loading || uploading}
            variant="outline"
            size="sm"
            className="border-gray-600 text-gray-300"
          >
            {loading ? '새로고침 중...' : '🔄 새로고침'}
          </Button>
          <Button onClick={selectAll} variant="outline" size="sm" className="border-gray-600 text-gray-300">
            전체 선택
          </Button>
          <Button onClick={clearSelection} variant="outline" size="sm" className="border-gray-600 text-gray-300">
            선택 해제
          </Button>
          <Button
            onClick={startUpload}
            disabled={selectedCount === 0 || uploading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {uploading ? '업로드 중...' : '업로드 시작'}
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
              {selectedDistrict === 'all' ? '업로드 대기 중인 파일이 없습니다' : '선택한 자치구에 업로드 대기 중인 파일이 없습니다'}
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
