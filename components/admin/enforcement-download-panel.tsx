/**
 * Enforcement Download Panel - LexDiff Professional Edition
 * Refined interface for downloading enforcement decrees and rules
 */

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Download, CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react'

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
  downloadedAt?: string
}

interface EnforcementDownloadPanelProps {
  refreshTrigger?: number
}

export function EnforcementDownloadPanel({ refreshTrigger }: EnforcementDownloadPanelProps = {}) {
  const [laws, setLaws] = useState<SavedLaw[]>([])
  const [loading, setLoading] = useState(true)
  const [downloadProgress, setDownloadProgress] = useState<Map<string, DownloadStatus[]>>(new Map())
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadedFiles, setDownloadedFiles] = useState<Set<string>>(new Set())
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 })
  const [currentLawName, setCurrentLawName] = useState<string>('')

  useEffect(() => {
    loadLaws()
  }, [])

  useEffect(() => {
    if (refreshTrigger !== undefined) {
      loadLaws()
    }
  }, [refreshTrigger])

  async function loadLaws() {
    try {
      const [lawsResponse, filesResponse] = await Promise.all([
        fetch('/api/admin/list-parsed'),
        fetch('/api/admin/list-enforcement-files')
      ])

      const lawsData = await lawsResponse.json()
      const filesData = await filesResponse.json()

      if (lawsData.success) {
        const allLaws = lawsData.laws || []
        const baseLaws = allLaws.filter(
          (law: SavedLaw) => !law.lawName.includes('시행령') && !law.lawName.includes('시행규칙')
        )

        const downloaded = new Set<string>()
        const downloadDates = new Map<string, string>()

        // Use file metadata for downloaded files
        if (filesData.success) {
          filesData.files.forEach((file: any) => {
            downloaded.add(file.lawName)
            downloadDates.set(file.lawName, file.downloadedAt)
          })
        }

        setLaws(baseLaws)
        setDownloadedFiles(downloaded)

        const initialProgress = new Map<string, DownloadStatus[]>()
        baseLaws.forEach((law: SavedLaw) => {
          const patterns = [
            `${law.lawName} 시행령`,
            `${law.lawName}시행령`,
            `${law.lawName.trim()} 시행령`
          ]
          const rulePatterns = [
            `${law.lawName} 시행규칙`,
            `${law.lawName}시행규칙`,
            `${law.lawName.trim()} 시행규칙`
          ]

          const decreePattern = patterns.find((pattern) => downloaded.has(pattern))
          const rulePattern = rulePatterns.find((pattern) => downloaded.has(pattern))

          initialProgress.set(law.lawName, [
            {
              lawName: law.lawName,
              type: '시행령',
              status: decreePattern ? 'success' : 'pending',
              downloadedAt: decreePattern ? downloadDates.get(decreePattern) : undefined
            },
            {
              lawName: law.lawName,
              type: '시행규칙',
              status: rulePattern ? 'success' : 'pending',
              downloadedAt: rulePattern ? downloadDates.get(rulePattern) : undefined
            }
          ])
        })

        setDownloadProgress(initialProgress)
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

    const updatedProgress = currentProgress.map((p) => (p.type === type ? { ...p, status: 'downloading' as const } : p))
    setDownloadProgress(new Map(downloadProgress.set(key, updatedProgress)))

    try {
      const response = await fetch('/api/admin/download-enforcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lawName, type })
      })

      const result = await response.json()

      const finalProgress = currentProgress.map((p) => {
        if (p.type !== type) return p

        if (result.success) {
          const enforcementName = `${lawName} ${type}`
          setDownloadedFiles((prev) => new Set([...prev, enforcementName]))

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
    await new Promise((resolve) => setTimeout(resolve, 1000))
    await downloadEnforcement(lawName, '시행규칙')

    setIsDownloading(false)
  }

  async function downloadAllLaws() {
    if (!confirm(`전체 ${laws.length}개 법령의 시행령/시행규칙을 다운로드하시겠습니까?`)) {
      return
    }

    setIsDownloading(true)
    setBatchProgress({ current: 0, total: laws.length })

    for (let i = 0; i < laws.length; i++) {
      const law = laws[i]
      setCurrentLawName(law.lawName)
      setBatchProgress({ current: i + 1, total: laws.length })

      await downloadAll(law.lawName)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    setIsDownloading(false)
    setCurrentLawName('')
    setBatchProgress({ current: 0, total: 0 })
    alert('✅ 전체 다운로드 완료!')
  }

  function getStatusIcon(status: DownloadStatus['status']) {
    switch (status) {
      case 'pending':
        return <AlertCircle className="w-4 h-4 text-muted-foreground" />
      case 'downloading':
        return <Loader2 className="w-4 h-4 text-primary animate-spin" />
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-accent" />
      case 'not_found':
        return <XCircle className="w-4 h-4 text-warning" />
      case 'error':
        return <XCircle className="w-4 h-4 text-destructive" />
    }
  }

  function getStatusText(status: DownloadStatus['status']) {
    switch (status) {
      case 'pending':
        return '대기'
      case 'downloading':
        return '다운로드 중'
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
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  const completedCount = Array.from(downloadProgress.values())
    .flat()
    .filter((s) => s.status === 'success').length

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-sm text-muted-foreground mb-1">총 법령</div>
          <div className="text-3xl font-bold text-foreground">{laws.length}</div>
        </div>
        <div className="p-4 bg-primary/10 backdrop-blur-sm rounded-xl border border-primary/20 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-sm text-primary mb-1">다운로드 대상</div>
          <div className="text-3xl font-bold text-primary">{laws.length * 2}</div>
          <div className="text-xs text-muted-foreground mt-1">시행령 + 시행규칙</div>
        </div>
        <div className="p-4 bg-accent/10 backdrop-blur-sm rounded-xl border border-accent/20 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-sm text-accent mb-1">다운로드됨</div>
          <div className="text-3xl font-bold text-accent">{completedCount}</div>
        </div>
        <div className="p-4 bg-warning/10 backdrop-blur-sm rounded-xl border border-warning/20 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-sm text-warning mb-1">남은 파일</div>
          <div className="text-3xl font-bold text-warning">{laws.length * 2 - completedCount}</div>
        </div>
      </div>

      {/* Batch Progress */}
      {isDownloading && batchProgress.total > 0 && (
        <div className="p-4 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-xl backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
              <div>
                <div className="font-medium text-foreground">
                  일괄 다운로드 중... ({batchProgress.current} / {batchProgress.total})
                </div>
                {currentLawName && (
                  <div className="text-sm text-muted-foreground mt-0.5">
                    현재: {currentLawName}
                  </div>
                )}
              </div>
            </div>
            <div className="text-2xl font-bold text-primary">
              {Math.round((batchProgress.current / batchProgress.total) * 100)}%
            </div>
          </div>
          <div className="relative h-2 bg-muted/50 rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-accent to-primary rounded-full transition-all duration-500 ease-out"
              style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex items-center justify-between p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm">
        <div className="text-sm text-muted-foreground">
          {laws.length}개 법령 · 각 법령당 2개 파일 (시행령, 시행규칙)
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={loadLaws} disabled={loading || isDownloading} variant="outline" size="default" className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
          <Button onClick={downloadAllLaws} disabled={isDownloading || laws.length === 0} className="gap-2 shadow-lg shadow-primary/20 h-10" size="default">
            {isDownloading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                처리 중
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                전체 다운로드
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Laws List */}
      <div className="space-y-3">
        {laws.map((law) => {
          const progress = downloadProgress.get(law.lawName) || []
          const decreeStatus = progress.find((p) => p.type === '시행령')
          const ruleStatus = progress.find((p) => p.type === '시행규칙')

          return (
            <div
              key={law.lawId}
              className="p-4 bg-card/30 backdrop-blur-sm rounded-xl border border-border/50 hover:bg-card/50 transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-medium text-foreground">{law.lawName}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {law.articleCount}개 조문 · 시행일: {law.effectiveDate}
                  </p>

                  {progress.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {decreeStatus && (
                        <div className="flex items-center gap-2 text-sm">
                          {getStatusIcon(decreeStatus.status)}
                          <span className="text-foreground">시행령</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground">{getStatusText(decreeStatus.status)}</span>
                          {decreeStatus.articleCount && (
                            <span className="text-muted-foreground">({decreeStatus.articleCount}개 조문)</span>
                          )}
                          {decreeStatus.downloadedAt && (
                            <span className="text-muted-foreground text-xs">
                              다운로드: {formatDate(decreeStatus.downloadedAt)}
                            </span>
                          )}
                          {decreeStatus.error && (
                            <span className="text-destructive text-xs">({decreeStatus.error})</span>
                          )}
                        </div>
                      )}
                      {ruleStatus && (
                        <div className="flex items-center gap-2 text-sm">
                          {getStatusIcon(ruleStatus.status)}
                          <span className="text-foreground">시행규칙</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground">{getStatusText(ruleStatus.status)}</span>
                          {ruleStatus.articleCount && (
                            <span className="text-muted-foreground">({ruleStatus.articleCount}개 조문)</span>
                          )}
                          {ruleStatus.downloadedAt && (
                            <span className="text-muted-foreground text-xs">
                              다운로드: {formatDate(ruleStatus.downloadedAt)}
                            </span>
                          )}
                          {ruleStatus.error && <span className="text-destructive text-xs">({ruleStatus.error})</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>

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
            </div>
          )
        })}
      </div>

      {laws.length === 0 && (
        <div className="p-8 bg-muted/30 backdrop-blur-sm rounded-xl border border-border/50 text-center">
          <p className="text-muted-foreground">저장된 법령이 없습니다</p>
          <p className="text-sm text-muted-foreground mt-1">먼저 법령을 다운로드하세요</p>
        </div>
      )}

      {/* Info */}
      <div className="p-4 bg-muted/30 backdrop-blur-sm rounded-xl border border-border/50">
        <div className="text-sm text-muted-foreground space-y-1">
          <div>• law.go.kr API에서 시행령/시행규칙 검색 및 다운로드</div>
          <div>• 저장 경로: <code className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs">data/parsed-laws/</code></div>
          <div>• 자동으로 법령명 기반 매칭</div>
          <div>• RAG 청킹을 위한 메타데이터 포함</div>
          <div>• 다운로드 시점: 파일 생성일 기준 표시</div>
        </div>
      </div>
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
