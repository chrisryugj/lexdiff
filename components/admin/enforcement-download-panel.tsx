/**
 * Enforcement Download Panel
 * Download 시행령/시행규칙 for saved laws
 */

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Loader2, Download, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

interface SavedLaw {
  lawId: string
  lawName: string
  effectiveDate: string
  articleCount: number
  fileSize: number
  savedAt: string
}

interface DownloadStatus {
  lawName: string
  type: '시행령' | '시행규칙'
  status: 'pending' | 'downloading' | 'success' | 'not_found' | 'error'
  articleCount?: number
  error?: string
}

interface EnforcementDownloadPanelProps {
  refreshTrigger?: number // Optional prop to trigger refresh
}

export function EnforcementDownloadPanel({ refreshTrigger }: EnforcementDownloadPanelProps = {}) {
  const [laws, setLaws] = useState<SavedLaw[]>([])
  const [loading, setLoading] = useState(true)
  const [downloadProgress, setDownloadProgress] = useState<Map<string, DownloadStatus[]>>(new Map())
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadedFiles, setDownloadedFiles] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadLaws()
  }, [])

  // Reload when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger !== undefined) {
      loadLaws()
    }
  }, [refreshTrigger])

  async function loadLaws() {
    try {
      const response = await fetch('/api/admin/list-parsed')
      const data = await response.json()

      if (data.success) {
        const allLaws = data.laws || []

        // Separate base laws and enforcement files
        const baseLaws = allLaws.filter(
          (law: SavedLaw) => !law.lawName.includes('시행령') && !law.lawName.includes('시행규칙')
        )

        // Track which enforcement files are already downloaded
        const downloaded = new Set<string>()
        const enforcementFiles: string[] = []

        allLaws.forEach((law: SavedLaw) => {
          if (law.lawName.includes('시행령') || law.lawName.includes('시행규칙')) {
            downloaded.add(law.lawName)
            enforcementFiles.push(law.lawName)
          }
        })

        setLaws(baseLaws)
        setDownloadedFiles(downloaded)

        console.log('📋 All enforcement files found:')
        enforcementFiles.forEach(name => console.log(`   - ${name}`))

        // Initialize download status based on local files
        const initialProgress = new Map<string, DownloadStatus[]>()
        baseLaws.forEach((law: SavedLaw) => {
          // Try multiple matching patterns
          const patterns = [
            `${law.lawName} 시행령`,           // "관세법 시행령"
            `${law.lawName}시행령`,             // "관세법시행령" (공백 없음)
            `${law.lawName.trim()} 시행령`,    // 앞뒤 공백 제거
          ]

          const rulePatterns = [
            `${law.lawName} 시행규칙`,
            `${law.lawName}시행규칙`,
            `${law.lawName.trim()} 시행규칙`,
          ]

          // Check if any pattern matches
          const hasDecree = patterns.some(pattern => downloaded.has(pattern))
          const hasRule = rulePatterns.some(pattern => downloaded.has(pattern))

          // Find exact match for logging
          const matchedDecree = patterns.find(p => downloaded.has(p))
          const matchedRule = rulePatterns.find(p => downloaded.has(p))

          console.log(`\n🔍 Checking ${law.lawName}:`)
          console.log(`   시행령: ${hasDecree ? `✅ 있음 (${matchedDecree})` : '❌ 없음'}`)
          console.log(`   시행규칙: ${hasRule ? `✅ 있음 (${matchedRule})` : '❌ 없음'}`)

          initialProgress.set(law.lawName, [
            {
              lawName: law.lawName,
              type: '시행령',
              status: hasDecree ? 'success' : 'pending'
            },
            {
              lawName: law.lawName,
              type: '시행규칙',
              status: hasRule ? 'success' : 'pending'
            }
          ])
        })

        setDownloadProgress(initialProgress)

        console.log(`\n✅ Summary: ${baseLaws.length} base laws, ${downloaded.size} enforcement files already downloaded`)
      }
    } catch (error) {
      console.error('Failed to load laws:', error)
    } finally {
      setLoading(false)
    }
  }

  async function downloadEnforcement(lawName: string, type: '시행령' | '시행규칙') {
    const key = lawName
    const currentProgress = downloadProgress.get(key) || []

    // Update status to downloading
    const updatedProgress = currentProgress.map((p) => (p.type === type ? { ...p, status: 'downloading' as const } : p))
    setDownloadProgress(new Map(downloadProgress.set(key, updatedProgress)))

    try {
      const response = await fetch('/api/admin/download-enforcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lawName, type })
      })

      const result = await response.json()

      // Update status based on result
      const finalProgress = currentProgress.map((p) => {
        if (p.type !== type) return p

        if (result.success) {
          // Add to downloaded files set
          const enforcementName = `${lawName} ${type}`
          setDownloadedFiles(prev => new Set([...prev, enforcementName]))

          if (result.skipped) {
            return { ...p, status: 'success' as const }
          }
          return { ...p, status: 'success' as const, articleCount: result.articleCount }
        } else if (result.notFound) {
          return { ...p, status: 'not_found' as const }
        } else {
          return { ...p, status: 'error' as const, error: result.error }
        }
      })

      setDownloadProgress(new Map(downloadProgress.set(key, finalProgress)))
    } catch (error: any) {
      const finalProgress = currentProgress.map((p) =>
        p.type === type ? { ...p, status: 'error' as const, error: error.message } : p
      )
      setDownloadProgress(new Map(downloadProgress.set(key, finalProgress)))
    }
  }

  async function downloadAll(lawName: string) {
    const key = lawName
    setDownloadProgress(
      new Map(
        downloadProgress.set(key, [
          { lawName, type: '시행령', status: 'pending' },
          { lawName, type: '시행규칙', status: 'pending' }
        ])
      )
    )

    setIsDownloading(true)

    await downloadEnforcement(lawName, '시행령')
    await new Promise((resolve) => setTimeout(resolve, 1000)) // 1초 delay
    await downloadEnforcement(lawName, '시행규칙')

    setIsDownloading(false)
  }

  async function downloadAllLaws() {
    setIsDownloading(true)

    for (const law of laws) {
      await downloadAll(law.lawName)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    setIsDownloading(false)
    alert('✅ 전체 다운로드 완료!')
  }

  function getStatusIcon(status: DownloadStatus['status']) {
    switch (status) {
      case 'pending':
        return <AlertCircle className="w-4 h-4 text-gray-400" />
      case 'downloading':
        return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-400" />
      case 'not_found':
        return <XCircle className="w-4 h-4 text-yellow-400" />
      case 'error':
        return <XCircle className="w-4 h-4 text-red-400" />
    }
  }

  function getStatusText(status: DownloadStatus['status']) {
    switch (status) {
      case 'pending':
        return '대기 중'
      case 'downloading':
        return '다운로드 중...'
      case 'success':
        return '완료'
      case 'not_found':
        return '없음'
      case 'error':
        return '오류'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">시행령/시행규칙 다운로드</h2>
          <p className="text-sm text-gray-400 mt-1">저장된 법령의 시행령과 시행규칙을 다운로드합니다</p>
        </div>
        <Button onClick={downloadAllLaws} disabled={isDownloading || laws.length === 0} className="gap-2">
          {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          전체 다운로드
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4 bg-gray-800 border-gray-700">
          <p className="text-sm text-gray-400">총 법령</p>
          <p className="text-2xl font-bold text-white">{laws.length}</p>
        </Card>
        <Card className="p-4 bg-gray-800 border-gray-700">
          <p className="text-sm text-gray-400">다운로드 가능</p>
          <p className="text-2xl font-bold text-blue-400">{laws.length * 2}</p>
          <p className="text-xs text-gray-500">시행령 + 시행규칙</p>
        </Card>
        <Card className="p-4 bg-gray-800 border-gray-700">
          <p className="text-sm text-gray-400">로컬 MD 파일</p>
          <p className="text-2xl font-bold text-green-400">{downloadedFiles.size}</p>
          <p className="text-xs text-gray-500">이미 다운로드됨</p>
        </Card>
        <Card className="p-4 bg-gray-800 border-gray-700">
          <p className="text-sm text-gray-400">남은 파일</p>
          <p className="text-2xl font-bold text-yellow-400">{laws.length * 2 - downloadedFiles.size}</p>
        </Card>
      </div>

      {/* Laws List */}
      <div className="space-y-3">
        {laws.map((law) => {
          const progress = downloadProgress.get(law.lawName) || []
          const decreeStatus = progress.find((p) => p.type === '시행령')
          const ruleStatus = progress.find((p) => p.type === '시행규칙')

          return (
            <Card key={law.lawId} className="p-4 bg-gray-800 border-gray-700">
              <div className="flex items-start justify-between gap-4">
                {/* Law Info */}
                <div className="flex-1">
                  <h3 className="font-medium text-white">{law.lawName}</h3>
                  <p className="text-sm text-gray-400 mt-1">
                    {law.articleCount}개 조문 · 시행일: {law.effectiveDate}
                  </p>

                  {/* Download Status */}
                  {progress.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {decreeStatus && (
                        <div className="flex items-center gap-2 text-sm">
                          {getStatusIcon(decreeStatus.status)}
                          <span className="text-gray-300">시행령</span>
                          <span className="text-gray-500">·</span>
                          <span className="text-gray-400">{getStatusText(decreeStatus.status)}</span>
                          {decreeStatus.articleCount && (
                            <span className="text-gray-500">({decreeStatus.articleCount}개 조문)</span>
                          )}
                          {decreeStatus.error && (
                            <span className="text-red-400 text-xs">({decreeStatus.error})</span>
                          )}
                        </div>
                      )}
                      {ruleStatus && (
                        <div className="flex items-center gap-2 text-sm">
                          {getStatusIcon(ruleStatus.status)}
                          <span className="text-gray-300">시행규칙</span>
                          <span className="text-gray-500">·</span>
                          <span className="text-gray-400">{getStatusText(ruleStatus.status)}</span>
                          {ruleStatus.articleCount && (
                            <span className="text-gray-500">({ruleStatus.articleCount}개 조문)</span>
                          )}
                          {ruleStatus.error && <span className="text-red-400 text-xs">({ruleStatus.error})</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Download Button */}
                <Button
                  onClick={() => downloadAll(law.lawName)}
                  disabled={isDownloading}
                  size="sm"
                  variant="outline"
                  className="gap-2"
                >
                  {progress.some((p) => p.status === 'downloading') ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  다운로드
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      {laws.length === 0 && (
        <Card className="p-8 bg-gray-800 border-gray-700 text-center">
          <p className="text-gray-400">저장된 법령이 없습니다</p>
          <p className="text-sm text-gray-500 mt-1">먼저 &quot;파싱&quot; 탭에서 법령을 다운로드하세요</p>
        </Card>
      )}
    </div>
  )
}
