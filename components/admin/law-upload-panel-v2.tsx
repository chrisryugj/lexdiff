/**
 * Law Upload Panel V2 (Unified)
 * Combines single + batch upload with pause/resume/cancel controls
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Loader2, Upload, Pause, Play, XCircle, CheckCircle2, AlertCircle } from 'lucide-react'

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

interface LawUploadPanelProps {
  onUploadComplete?: () => void
  onRenderHeader?: (syncButton: React.ReactNode) => void
}

export function LawUploadPanelV2({ onUploadComplete, onRenderHeader }: LawUploadPanelProps) {
  const [parsedLaws, setParsedLaws] = useState<ParsedLawFile[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState(false)
  const [paused, setPaused] = useState(false)
  const [results, setResults] = useState<UploadResult[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [totalFiles, setTotalFiles] = useState(0)
  const [uploadedFiles, setUploadedFiles] = useState<Set<string>>(new Set())
  const [batchSize, setBatchSize] = useState(10)
  const [currentStoreId, setCurrentStoreId] = useState<string | null>(null)
  const [shouldStop, setShouldStop] = useState(false)

  // Load uploaded files from server log
  async function loadUploadHistory() {
    try {
      const response = await fetch('/api/admin/get-upload-history')
      const data = await response.json()

      if (data.success && Array.isArray(data.files)) {
        const serverFiles = new Set(data.files.map((f: any) => f.fileName))
        console.log(`✅ Loaded ${serverFiles.size} uploaded files from server log`)

        // Merge with localStorage (optional, but good for safety)
        const localStored = localStorage.getItem('uploadedLaws')
        if (localStored) {
          const localFiles = JSON.parse(localStored)
          localFiles.forEach((f: string) => serverFiles.add(f))
        }

        setUploadedFiles(serverFiles)
      }
    } catch (error) {
      console.error('Failed to load upload history:', error)
    }
  }

  useEffect(() => {
    loadParsedLaws()
    loadUploadHistory()
    // Don't auto-sync with server on mount - user must click sync button
  }, [])

  // ... (useEffect for onRenderHeader remains same)

  // ... (checkStoreIdAndSync remains same)

  // ... (syncWithServer remains same)

  // ... (saveUploadedFiles remains same)

  async function loadParsedLaws() {
    setLoading(true)
    try {
      // Load both parsed laws and upload history
      const [lawsResponse] = await Promise.all([
        fetch('/api/admin/list-parsed-laws'),
        loadUploadHistory() // Refresh history too
      ])

      const data = await lawsResponse.json()

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

  async function uploadSingleFile(fileName: string): Promise<UploadResult> {
    try {
      // Read file content
      const response = await fetch(`/api/admin/read-parsed-law?fileName=${encodeURIComponent(fileName)}`)
      const data = await response.json()

      if (!data.success) {
        return {
          fileName,
          status: 'error',
          error: 'Failed to read file'
        }
      }

      // Extract law name from markdown content
      const firstLine = data.markdown.split('\n')[0]
      const lawName = firstLine.replace(/^#\s*/, '').trim()

      // Create FormData
      const formData = new FormData()
      const blob = new Blob([data.markdown], { type: 'text/markdown' })
      const file = new File([blob], fileName, { type: 'text/markdown' })

      formData.append('files', file)

      // Add metadata
      const metadata = {
        law_type: '법령',
        law_name: lawName,
        file_name: fileName,
        source: 'parsed-laws',
        uploaded_at: new Date().toISOString(),
        upload_source: 'law-upload-panel-v2'
      }
      formData.append('metadata', JSON.stringify(metadata))

      // Upload via batch API
      const uploadResponse = await fetch('/api/admin/batch-upload-files', {
        method: 'POST',
        body: formData
      })

      const uploadData = await uploadResponse.json()

      if (uploadData.success && uploadData.results && uploadData.results.length > 0) {
        const result = uploadData.results[0]
        return {
          fileName,
          lawName: fileName.replace('.md', ''),
          status: result.success ? 'success' : 'error',
          error: result.error,
          documentId: result.documentId
        }
      } else {
        return {
          fileName,
          status: 'error',
          error: uploadData.error || 'Upload failed'
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

  // Abort controller for stopping uploads
  const abortControllerRef = useRef<AbortController | null>(null)
  const isAbortedRef = useRef(false)

  async function startUpload() {
    if (selectedFiles.size === 0) return

    setUploading(true)
    setPaused(false)
    setShouldStop(false)
    setResults([])
    setCurrentIndex(0)

    const fileNames = Array.from(selectedFiles)
    setTotalFiles(fileNames.length)

    // Reset abort state
    isAbortedRef.current = false
    abortControllerRef.current = new AbortController()

    try {
      const response = await fetch('/api/admin/stream-upload-laws', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          fileNames,
          delay: 100, // Fast delay
          concurrency: batchSize // Pass batch size as concurrency
        }),
        signal: abortControllerRef.current.signal
      })

      if (!response.ok) {
        throw new Error('Upload request failed')
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('Failed to get reader')

      const decoder = new TextDecoder()
      let buffer = ''
      const newResults: UploadResult[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))

              if (data.type === 'progress') {
                setCurrentIndex(data.current)

                // Add result
                const result: UploadResult = {
                  fileName: data.fileName,
                  lawName: data.fileName.replace('.md', ''),
                  status: data.status,
                  error: data.error
                }

                newResults.push(result)
                setResults([...newResults])

                // ✅ Real-time state update: Save success immediately
                if (data.status === 'success') {
                  setUploadedFiles(prev => {
                    const next = new Set(prev)
                    next.add(data.fileName)
                    // Save to localStorage immediately
                    try {
                      localStorage.setItem('uploadedLaws', JSON.stringify(Array.from(next)))
                    } catch (e) {
                      console.error('Failed to save to localStorage:', e)
                    }
                    return next
                  })

                  // Remove from selection
                  setSelectedFiles(prev => {
                    const next = new Set(prev)
                    next.delete(data.fileName)
                    return next
                  })
                }

              } else if (data.type === 'complete') {
                // Final completion handled below
              }
            } catch (e) {
              console.error('Parse error:', e)
            }
          }
        }
      }

      onUploadComplete?.()

      if (!isAbortedRef.current) {
        const successCount = newResults.filter((r) => r.status === 'success').length
        alert(`✅ 업로드 완료!\n\n성공: ${successCount}개\n실패: ${newResults.length - successCount}개`)
      }

    } catch (error: any) {
      if (error.name === 'AbortError' || isAbortedRef.current) {
        console.log('Upload aborted')
        alert('⛔ 업로드가 중지되었습니다.')
      } else {
        console.error('Upload error:', error)
        alert('❌ 업로드 중 오류가 발생했습니다: ' + error.message)
      }
    } finally {
      setUploading(false)
      setPaused(false)
      abortControllerRef.current = null
    }
  }

  function pauseUpload() {
    // SSE doesn't support pause easily without server support, 
    // but we can implement it if needed. For now, we'll disable pause/resume 
    // to focus on robust cancellation as requested.
    alert('SSE 모드에서는 일시중지가 지원되지 않습니다. 중지 후 다시 시도해주세요.')
  }

  function resumeUpload() {
    // Not supported in SSE mode currently
  }

  function cancelUpload() {
    if (!confirm('업로드를 중지하시겠습니까?\n\n현재 진행 중인 작업이 즉시 중단됩니다.')) {
      return
    }

    isAbortedRef.current = true
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }

  const selectedCount = selectedFiles.size
  const successCount = results.filter((r) => r.status === 'success').length
  const errorCount = results.filter((r) => r.status === 'error').length
  const pendingLaws = parsedLaws.filter((law) => !uploadedFiles.has(law.fileName))
  const uploadedLaws = parsedLaws.filter((law) => uploadedFiles.has(law.fileName))

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
                  {paused ? '일시중지됨' : '업로드 중...'} ({currentIndex} / {totalFiles})
                </div>
                <div className="text-sm text-muted-foreground">
                  성공: {successCount} · 실패: {errorCount}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-foreground">{Math.round(progress)}%</div>
              <div className="text-sm text-muted-foreground">남은 파일: {totalFiles - currentIndex}개</div>
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

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-sm text-muted-foreground mb-1">총 법령</div>
          <div className="text-3xl font-bold text-foreground">{parsedLaws.length}</div>
        </div>
        <div className="p-4 bg-warning/10 backdrop-blur-sm rounded-xl border border-warning/20 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-sm text-warning mb-1">대기 중</div>
          <div className="text-3xl font-bold text-warning">{pendingLaws.length}</div>
        </div>
        <div className="p-4 bg-accent/10 backdrop-blur-sm rounded-xl border border-accent/20 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-sm text-accent mb-1">업로드됨</div>
          <div className="text-3xl font-bold text-accent">{uploadedLaws.length}</div>
        </div>
        <div className="p-4 bg-primary/10 backdrop-blur-sm rounded-xl border border-primary/20 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-sm text-primary mb-1">선택됨</div>
          <div className="text-3xl font-bold text-primary">{selectedCount}</div>
        </div>
      </div>

      {/* Batch Settings */}
      <div className="p-4 bg-muted/30 backdrop-blur-sm rounded-xl border border-border/50">
        <div className="flex items-center gap-4">
          <label className="text-sm text-muted-foreground">배치 업로드:</label>
          <select
            value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
            disabled={uploading}
            className="px-3 py-1 bg-card/50 border border-border/50 rounded text-foreground"
          >
            <option value={1}>1개씩 (느림, 안전)</option>
            <option value={5}>5개씩</option>
            <option value={10}>10개씩 (권장)</option>
            <option value={20}>20개씩</option>
            <option value={50}>50개씩 (빠름)</option>
          </select>
          <span className="text-xs text-muted-foreground">선택: {selectedCount}개</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm">
        <div className="text-sm text-muted-foreground">
          {uploading ? (
            <span>
              업로드 중... ({currentIndex}/{totalFiles})
              {paused && <span className="ml-2 text-warning">(일시중지됨)</span>}
            </span>
          ) : selectedCount > 0 ? (
            `${selectedCount}개 선택됨`
          ) : (
            '선택된 파일 없음'
          )}
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
            onClick={loadParsedLaws}
            disabled={loading || uploading}
            variant="outline"
            size="default"
          >
            {loading ? '새로고침 중' : '새로고침'}
          </Button>
          <Button onClick={selectAll} disabled={uploading} variant="outline" size="default">
            전체 선택
          </Button>
          <Button onClick={clearSelection} disabled={uploading} variant="outline" size="default">
            선택 해제
          </Button>

          {/* Upload Control Buttons */}
          {uploading && !paused && (
            <Button onClick={pauseUpload} variant="outline" size="default" className="gap-2 border-warning/30 text-warning hover:bg-warning/10">
              <Pause className="w-4 h-4" />
              일시중지
            </Button>
          )}
          {uploading && paused && (
            <Button onClick={resumeUpload} size="default" className="gap-2 shadow-lg shadow-accent/20 bg-accent hover:bg-accent/90">
              <Play className="w-4 h-4" />
              재개
            </Button>
          )}
          {uploading && (
            <Button onClick={cancelUpload} variant="outline" size="default" className="gap-2 border-warning/30 text-warning hover:bg-warning/10">
              <XCircle className="w-4 h-4" />
              강제중지
            </Button>
          )}
          {!uploading && (
            <Button onClick={startUpload} disabled={selectedCount === 0} className="gap-2 shadow-lg shadow-primary/20" size="default">
              <Upload className="w-4 h-4" />
              업로드
            </Button>
          )}
        </div>
      </div>

      {/* File List */}
      <div className="space-y-3">
        {/* Pending Laws */}
        {pendingLaws.length > 0 && (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {pendingLaws.map((law, index) => {
              const isSelected = selectedFiles.has(law.fileName)
              const result = results.find((r) => r.fileName === law.fileName)

              return (
                <label
                  key={law.fileName}
                  className={`
                    flex items-center p-3 rounded-xl border cursor-pointer transition-all
                    ${isSelected
                      ? 'bg-primary/10 border-primary/30 ring-2 ring-primary/20 shadow-md'
                      : result?.status === 'success'
                        ? 'bg-accent/10 border-accent/30 shadow-sm'
                        : result?.status === 'error'
                          ? 'bg-warning/10 border-warning/30 shadow-sm'
                          : 'bg-card/30 border-border/50 hover:border-primary/30 hover:bg-card/50 hover:shadow-sm'
                    }
                  `}
                  style={{
                    animation: `fadeInUp 0.3s ease-out ${index * 10}ms both`
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelection(law.fileName)}
                    disabled={uploading}
                    className="mr-3"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground truncate">{law.lawName}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {(law.fileSize / 1024).toFixed(1)} KB · 다운로드: {formatDate(law.lastModified)}
                    </div>
                  </div>
                  {result && (
                    <div className="ml-3">
                      {result.status === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-accent" />
                      ) : (
                        <div className="flex items-center gap-2">
                          <XCircle className="w-4 h-4 text-warning" />
                          <span className="text-xs text-warning">{result.error}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {uploading && currentIndex > 0 && parsedLaws.indexOf(law) === currentIndex - 1 && (
                    <Loader2 className="w-4 h-4 ml-3 text-primary animate-spin" />
                  )}
                </label>
              )
            })}
          </div>
        )}

        {/* Uploaded Laws */}
        {uploadedLaws.length > 0 && (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {uploadedLaws.map((law) => (
              <div key={law.fileName} className="flex items-center p-3 rounded-xl bg-accent/10 border border-accent/20 opacity-75">
                <CheckCircle2 className="w-4 h-4 text-accent mr-3" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-foreground truncate">{law.lawName}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {(law.fileSize / 1024).toFixed(1)} KB · 다운로드: {formatDate(law.lastModified)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {parsedLaws.length === 0 && !loading && (
        <div className="p-8 bg-muted/30 backdrop-blur-sm rounded-xl border border-border/50 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">저장된 법령이 없습니다</p>
          <p className="text-sm text-muted-foreground/70 mt-1">먼저 &quot;파싱&quot; 탭에서 법령을 다운로드하세요</p>
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
