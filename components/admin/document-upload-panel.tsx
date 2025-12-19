/**
 * Document Upload Panel Component
 * Supports uploading various file types to File Search Store
 */

'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Icon } from '@/components/ui/icon'

interface UploadResult {
  success: boolean
  fileName: string
  documentId?: string
  error?: string
}

interface DocumentUploadPanelProps {
  onUploadComplete?: () => void
}

const SUPPORTED_EXTENSIONS = [
  // Documents
  '.pdf',
  '.txt',
  '.md',
  '.html',
  '.css',
  '.csv',
  '.rtf',
  // MS Office
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  // OpenDocument
  '.odt',
  '.ods',
  '.odp',
  // Korean
  '.hwp',
  '.hwpx',
  // Code
  '.js',
  '.ts',
  '.py',
  '.java',
  '.c',
  '.cpp',
  '.cs',
  '.php',
  '.rb',
  '.go',
  '.rs',
  '.kt',
  '.swift',
  '.scala',
  // Data
  '.json',
  '.xml',
  '.yaml',
  '.toml',
  // LaTeX
  '.tex',
  // Archive
  '.zip',
  // Images
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  // Audio
  '.mp3',
  '.wav',
  '.aac',
  '.flac',
  '.ogg',
  // Video
  '.mp4',
  '.mpeg',
  '.mov',
  '.avi',
  '.webm',
]

export function DocumentUploadPanel({ onUploadComplete }: DocumentUploadPanelProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>('')
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([])
  const [metadata, setMetadata] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    setSelectedFiles((prev) => [...prev, ...files])
  }

  function handleFolderSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    setSelectedFiles((prev) => [...prev, ...files])
  }

  function removeFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  function clearFiles() {
    setSelectedFiles([])
    setUploadResults([])
    setUploadProgress('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (folderInputRef.current) folderInputRef.current.value = ''
  }

  async function handleUpload() {
    if (selectedFiles.length === 0) {
      alert('파일을 선택해주세요')
      return
    }

    setUploading(true)
    setUploadProgress('업로드 준비 중...')
    setUploadResults([])

    try {
      // Parse metadata
      let metadataObj: Record<string, string> = {}
      if (metadata.trim()) {
        try {
          metadataObj = JSON.parse(metadata)
        } catch (e) {
          alert('메타데이터 JSON 형식이 올바르지 않습니다')
          setUploading(false)
          return
        }
      }

      const formData = new FormData()
      selectedFiles.forEach((file) => {
        formData.append('files', file)
      })
      formData.append('metadata', JSON.stringify(metadataObj))

      setUploadProgress(`${selectedFiles.length}개 파일 업로드 중...`)

      const response = await fetch('/api/admin/batch-upload-files', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (data.success) {
        setUploadResults(data.results)
        setUploadProgress(
          `✅ 완료: ${data.summary.success}개 성공${data.summary.failure > 0 ? `, ${data.summary.failure}개 실패` : ''}`
        )
        alert(data.message)

        // Clear files on success
        clearFiles()

        // Notify parent
        onUploadComplete?.()
      } else {
        setUploadProgress(`❌ 업로드 실패: ${data.error}`)
        alert('업로드 실패: ' + data.error)
      }
    } catch (error: any) {
      setUploadProgress(`❌ 오류: ${error.message}`)
      alert('업로드 중 오류: ' + error.message)
    } finally {
      setUploading(false)
    }
  }

  const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0)
  const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">📄 일반 문서 업로드</h2>
        <p className="text-sm text-gray-400">
          PDF, HWP/HWPX, 문서, 이미지, 오디오, 비디오, 코드 파일 등 60+ 형식을 File Search Store에 업로드하세요
        </p>
      </div>

      {/* Supported Formats */}
      <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
        <h3 className="font-medium text-white mb-2">📋 지원 파일 형식</h3>
        <div className="flex flex-wrap gap-2 text-xs">
          {SUPPORTED_EXTENSIONS.map((ext) => (
            <span key={ext} className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-gray-300">
              {ext}
            </span>
          ))}
        </div>
      </div>

      {/* File Selection */}
      <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg space-y-4">
        <h3 className="font-medium text-white mb-2">📂 파일 선택</h3>

        <div className="flex gap-3">
          <div className="flex-1">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={SUPPORTED_EXTENSIONS.join(',')}
              onChange={handleFileSelect}
              className="hidden"
              id="file-input"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              variant="outline"
              className="w-full border-gray-600 text-gray-300"
            >
              📁 파일 선택
            </Button>
          </div>

          <div className="flex-1">
            <input
              ref={folderInputRef}
              type="file"
              // @ts-ignore - webkitdirectory is not in TypeScript types but works in modern browsers
              webkitdirectory=""
              directory=""
              multiple
              onChange={handleFolderSelect}
              className="hidden"
              id="folder-input"
            />
            <Button
              onClick={() => folderInputRef.current?.click()}
              disabled={uploading}
              variant="outline"
              className="w-full border-gray-600 text-gray-300"
            >
              📂 폴더 선택
            </Button>
          </div>

          {selectedFiles.length > 0 && (
            <Button onClick={clearFiles} disabled={uploading} variant="outline" className="border-red-700 text-red-400">
              🗑️ 초기화
            </Button>
          )}
        </div>

        {/* Selected Files List */}
        {selectedFiles.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white font-medium">선택된 파일: {selectedFiles.length}개</span>
              <span className="text-gray-400">총 크기: {totalSizeMB} MB</span>
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-1">
              {selectedFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 bg-gray-900 border border-gray-700 rounded text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-white truncate">{file.name}</div>
                    <div className="text-xs text-gray-500">
                      {file.type || '알 수 없음'} · {(file.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <Button
                    onClick={() => removeFile(index)}
                    disabled={uploading}
                    size="sm"
                    variant="ghost"
                    className="text-red-400 hover:text-red-300 ml-2"
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Metadata (Optional) */}
      <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg space-y-2">
        <h3 className="font-medium text-white mb-2">🏷️ 메타데이터 (선택사항)</h3>
        <p className="text-xs text-gray-400 mb-2">JSON 형식으로 공통 메타데이터를 입력하세요</p>

        <textarea
          value={metadata}
          onChange={(e) => setMetadata(e.target.value)}
          placeholder='{"category": "documents", "source": "manual_upload", "tags": "important"}'
          className="w-full bg-gray-900 border border-gray-700 rounded-md text-white font-mono text-xs h-24 p-2 resize-none"
          disabled={uploading}
        />
      </div>

      {/* Upload Button */}
      <div className="flex gap-3">
        <Button
          onClick={handleUpload}
          disabled={selectedFiles.length === 0 || uploading}
          className="flex-1 gap-2 shadow-lg shadow-primary/20"
          size="default"
        >
          {uploading ? (
            <>
              <Icon name="loader" className="w-4 h-4 animate-spin" />
              업로드 중
            </>
          ) : (
            <>
              <Icon name="upload" className="w-4 h-4" />
              업로드 ({selectedFiles.length})
            </>
          )}
        </Button>
      </div>

      {/* Progress */}
      {uploadProgress && (
        <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
          <p className="text-sm text-white">{uploadProgress}</p>
        </div>
      )}

      {/* Upload Results */}
      {uploadResults.length > 0 && (
        <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg space-y-2">
          <h3 className="font-medium text-white mb-2">📊 업로드 결과</h3>

          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {uploadResults.map((result, index) => (
              <div
                key={index}
                className={`p-3 rounded border text-sm ${
                  result.success
                    ? 'bg-green-900/20 border-green-700 text-green-400'
                    : 'bg-red-900/20 border-red-700 text-red-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{result.success ? '✅' : '❌'} {result.fileName}</span>
                </div>
                {result.error && <div className="text-xs mt-1 text-red-300">오류: {result.error}</div>}
                {result.documentId && <div className="text-xs mt-1 text-gray-500 font-mono">{result.documentId}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
