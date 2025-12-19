/**
 * Enforcement Download Panel - LexDiff Professional Edition
 * Refined interface for downloading enforcement decrees and rules
 * With download log tracking and filter functionality
 */

'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

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
  status: 'pending' | 'downloading' | 'success' | 'not_found' | 'error' | 'confirmed_none'
  articleCount?: number
  error?: string
  downloadedAt?: string
}

interface DownloadLogEntry {
  lawName: string
  type: '시행령' | '시행규칙'
  result: 'success' | 'not_found' | 'error'
  timestamp: string
  articleCount?: number
  error?: string
}

interface EnforcementDownloadPanelProps {
  refreshTrigger?: number
}

type FilterType = 'all' | 'incomplete' | 'completed'

export function EnforcementDownloadPanel({ refreshTrigger }: EnforcementDownloadPanelProps = {}) {
  const [laws, setLaws] = useState<SavedLaw[]>([])
  const [loading, setLoading] = useState(true)
  const [downloadProgress, setDownloadProgress] = useState<Map<string, DownloadStatus[]>>(new Map())
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadedFiles, setDownloadedFiles] = useState<Set<string>>(new Set())
  const [downloadLog, setDownloadLog] = useState<Record<string, { 시행령?: DownloadLogEntry; 시행규칙?: DownloadLogEntry }>>({})
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 })
  const [currentLawName, setCurrentLawName] = useState<string>('')
  const [filter, setFilter] = useState<FilterType>('all')

  useEffect(() => {
    loadLaws()
  }, [])

  useEffect(() => {
    if (refreshTrigger !== undefined) {
      loadLaws()
    }
  }, [refreshTrigger])

  async function loadLaws() {
    setLoading(true)
    try {
      const [lawsResponse, filesResponse, logResponse] = await Promise.all([
        fetch('/api/admin/list-parsed'),
        fetch('/api/admin/list-enforcement-files'),
        fetch('/api/admin/enforcement-download-log')
      ])

      const lawsData = await lawsResponse.json()
      const filesData = await filesResponse.json()
      const logData = await logResponse.json()

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

        // Load download log
        const log = logData.success ? logData.log : {}
        setDownloadLog(log)

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

          // Check log for confirmed "not found" status
          const lawLog = log[law.lawName]
          const decreeLoggedNotFound = lawLog?.시행령?.result === 'not_found'
          const ruleLoggedNotFound = lawLog?.시행규칙?.result === 'not_found'

          initialProgress.set(law.lawName, [
            {
              lawName: law.lawName,
              type: '시행령',
              status: decreePattern ? 'success' : decreeLoggedNotFound ? 'confirmed_none' : 'pending',
              downloadedAt: decreePattern ? downloadDates.get(decreePattern) : undefined
            },
            {
              lawName: law.lawName,
              type: '시행규칙',
              status: rulePattern ? 'success' : ruleLoggedNotFound ? 'confirmed_none' : 'pending',
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

  async function saveDownloadLog(lawName: string, type: '시행령' | '시행규칙', result: 'success' | 'not_found' | 'error', articleCount?: number, error?: string) {
    try {
      await fetch('/api/admin/enforcement-download-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lawName, type, result, articleCount, error })
      })
    } catch (e) {
      console.error('Failed to save download log:', e)
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

          // Log success
          saveDownloadLog(lawName, type, 'success', result.articleCount)

          if (result.skipped) {
            return { ...p, status: 'success' as const }
          }
          return { ...p, status: 'success' as const, articleCount: result.articleCount }
        } else if (result.notFound) {
          // Log not found - this is a confirmed "none" state
          saveDownloadLog(lawName, type, 'not_found')
          return { ...p, status: 'confirmed_none' as const }
        } else {
          // Log error
          saveDownloadLog(lawName, type, 'error', undefined, result.error)
          return { ...p, status: 'error' as const, error: result.error }
        }
      })

      setDownloadProgress(new Map(downloadProgress.set(key, finalProgress)))
    } catch (error: any) {
      const finalProgress = currentProgress.map((p) =>
        p.type === type ? { ...p, status: 'error' as const, error: error.message } : p
      )
      setDownloadProgress(new Map(downloadProgress.set(key, finalProgress)))
      saveDownloadLog(lawName, type, 'error', undefined, error.message)
    }
  }

  async function downloadAll(lawName: string) {
    const key = lawName
    const currentProgress = downloadProgress.get(key) || []

    // Only download items that are still pending (not confirmed_none or success)
    const decreeStatus = currentProgress.find(p => p.type === '시행령')
    const ruleStatus = currentProgress.find(p => p.type === '시행규칙')

    const needsDecree = !decreeStatus || decreeStatus.status === 'pending' || decreeStatus.status === 'error'
    const needsRule = !ruleStatus || ruleStatus.status === 'pending' || ruleStatus.status === 'error'

    if (!needsDecree && !needsRule) {
      return // Nothing to download
    }

    setIsDownloading(true)

    if (needsDecree) {
      await downloadEnforcement(lawName, '시행령')
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    if (needsRule) {
      await downloadEnforcement(lawName, '시행규칙')
    }

    setIsDownloading(false)
  }

  async function downloadAllLaws() {
    // Get filtered laws that need download
    const lawsToDownload = filteredLaws.filter(law => {
      const progress = downloadProgress.get(law.lawName) || []
      return progress.some(p => p.status === 'pending' || p.status === 'error')
    })

    if (lawsToDownload.length === 0) {
      alert('다운로드할 항목이 없습니다.')
      return
    }

    if (!confirm(`${lawsToDownload.length}개 법령의 시행령/시행규칙을 다운로드하시겠습니까?`)) {
      return
    }

    setIsDownloading(true)
    setBatchProgress({ current: 0, total: lawsToDownload.length })

    for (let i = 0; i < lawsToDownload.length; i++) {
      const law = lawsToDownload[i]
      setCurrentLawName(law.lawName)
      setBatchProgress({ current: i + 1, total: lawsToDownload.length })

      await downloadAll(law.lawName)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    setIsDownloading(false)
    setCurrentLawName('')
    setBatchProgress({ current: 0, total: 0 })
    alert('✅ 다운로드 완료!')
  }

  function getStatusIcon(status: DownloadStatus['status']) {
    switch (status) {
      case 'pending':
        return <Icon name="alert-circle" className="w-4 h-4 text-muted-foreground" />
      case 'downloading':
        return <Icon name="loader" className="w-4 h-4 text-primary animate-spin" />
      case 'success':
        return <Icon name="check-circle-2" className="w-4 h-4 text-accent" />
      case 'not_found':
        return <Icon name="x-circle" className="w-4 h-4 text-warning" />
      case 'confirmed_none':
        return <Icon name="minus-circle" className="w-4 h-4 text-muted-foreground" />
      case 'error':
        return <Icon name="x-circle" className="w-4 h-4 text-destructive" />
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
      case 'confirmed_none':
        return '없음 (확인됨)'
      case 'error':
        return '오류'
    }
  }

  // Filter laws based on current filter
  const filteredLaws = useMemo(() => {
    return laws.filter(law => {
      const progress = downloadProgress.get(law.lawName) || []
      const allDone = progress.length === 2 && progress.every(p =>
        p.status === 'success' || p.status === 'confirmed_none' || p.status === 'not_found'
      )
      const hasPending = progress.some(p => p.status === 'pending' || p.status === 'error')

      switch (filter) {
        case 'incomplete':
          return hasPending
        case 'completed':
          return allDone
        default:
          return true
      }
    })
  }, [laws, downloadProgress, filter])

  // Stats calculation
  const stats = useMemo(() => {
    const allProgress = Array.from(downloadProgress.values()).flat()
    const successCount = allProgress.filter(s => s.status === 'success').length
    const confirmedNoneCount = allProgress.filter(s => s.status === 'confirmed_none' || s.status === 'not_found').length
    const pendingCount = allProgress.filter(s => s.status === 'pending').length
    const errorCount = allProgress.filter(s => s.status === 'error').length

    return {
      total: laws.length,
      targetFiles: laws.length * 2,
      success: successCount,
      confirmedNone: confirmedNoneCount,
      pending: pendingCount,
      error: errorCount
    }
  }, [laws, downloadProgress])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Icon name="loader" className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        <div className="p-3 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm">
          <div className="text-xs text-muted-foreground mb-1">총 법령</div>
          <div className="text-2xl font-bold text-foreground">{stats.total}</div>
        </div>
        <div className="p-3 bg-accent/10 backdrop-blur-sm rounded-xl border border-accent/20 shadow-sm">
          <div className="text-xs text-accent mb-1">다운로드 완료</div>
          <div className="text-2xl font-bold text-accent">{stats.success}</div>
        </div>
        <div className="p-3 bg-muted/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm">
          <div className="text-xs text-muted-foreground mb-1">없음 (확인)</div>
          <div className="text-2xl font-bold text-muted-foreground">{stats.confirmedNone}</div>
        </div>
        <div className="p-3 bg-warning/10 backdrop-blur-sm rounded-xl border border-warning/20 shadow-sm">
          <div className="text-xs text-warning mb-1">미확인</div>
          <div className="text-2xl font-bold text-warning">{stats.pending}</div>
        </div>
        <div className="p-3 bg-destructive/10 backdrop-blur-sm rounded-xl border border-destructive/20 shadow-sm">
          <div className="text-xs text-destructive mb-1">오류</div>
          <div className="text-2xl font-bold text-destructive">{stats.error}</div>
        </div>
      </div>

      {/* Batch Progress */}
      {isDownloading && batchProgress.total > 0 && (
        <div className="p-4 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-xl backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Icon name="loader" className="h-5 w-5 text-primary animate-spin" />
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

      {/* Action Bar with Filter */}
      <div className="flex items-center justify-between p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm">
        <div className="flex items-center gap-3">
          <Icon name="filter" className="w-4 h-4 text-muted-foreground" />
          <div className="flex gap-1">
            <Button
              variant={filter === 'all' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('all')}
              className="h-8"
            >
              전체 ({laws.length})
            </Button>
            <Button
              variant={filter === 'incomplete' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('incomplete')}
              className="h-8"
            >
              미완료 ({laws.filter(law => {
                const progress = downloadProgress.get(law.lawName) || []
                return progress.some(p => p.status === 'pending' || p.status === 'error')
              }).length})
            </Button>
            <Button
              variant={filter === 'completed' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('completed')}
              className="h-8"
            >
              완료 ({laws.filter(law => {
                const progress = downloadProgress.get(law.lawName) || []
                return progress.length === 2 && progress.every(p =>
                  p.status === 'success' || p.status === 'confirmed_none' || p.status === 'not_found'
                )
              }).length})
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={loadLaws} disabled={loading || isDownloading} variant="outline" size="default" className="gap-2">
            <Icon name="refresh" className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
          <Button
            onClick={downloadAllLaws}
            disabled={isDownloading || filteredLaws.filter(law => {
              const progress = downloadProgress.get(law.lawName) || []
              return progress.some(p => p.status === 'pending' || p.status === 'error')
            }).length === 0}
            className="gap-2 shadow-lg shadow-primary/20 h-10"
            size="default"
          >
            {isDownloading ? (
              <>
                <Icon name="loader" className="h-4 w-4 animate-spin" />
                처리 중
              </>
            ) : (
              <>
                <Icon name="download" className="h-4 w-4" />
                {filter === 'incomplete' ? '미완료 다운로드' : '전체 다운로드'}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Laws List */}
      <div className="space-y-3">
        {filteredLaws.map((law) => {
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

                {/* Show download button only if at least one is pending or error */}
                {(() => {
                  const allDone = progress.length === 2 &&
                    progress.every((p) => p.status === 'success' || p.status === 'confirmed_none' || p.status === 'not_found')
                  const isCurrentlyDownloading = progress.some((p) => p.status === 'downloading')
                  const hasPendingOrError = progress.some((p) => p.status === 'pending' || p.status === 'error')

                  if (allDone && !isCurrentlyDownloading) {
                    return (
                      <div className="flex items-center gap-1.5 text-sm text-accent">
                        <Icon name="check-circle-2" className="w-4 h-4" />
                        완료
                      </div>
                    )
                  }

                  if (!hasPendingOrError && !isCurrentlyDownloading) {
                    return (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Icon name="minus-circle" className="w-4 h-4" />
                        확인됨
                      </div>
                    )
                  }

                  return (
                    <Button
                      onClick={() => downloadAll(law.lawName)}
                      disabled={isDownloading}
                      size="sm"
                      variant="outline"
                      className="gap-2"
                    >
                      {isCurrentlyDownloading ? (
                        <Icon name="loader" className="w-4 h-4 animate-spin" />
                      ) : (
                        <Icon name="download" className="w-4 h-4" />
                      )}
                      다운로드
                    </Button>
                  )
                })()}
              </div>
            </div>
          )
        })}
      </div>

      {filteredLaws.length === 0 && (
        <div className="p-8 bg-muted/30 backdrop-blur-sm rounded-xl border border-border/50 text-center">
          <p className="text-muted-foreground">
            {filter === 'incomplete' ? '미완료 항목이 없습니다' :
             filter === 'completed' ? '완료된 항목이 없습니다' :
             '저장된 법령이 없습니다'}
          </p>
          {filter !== 'all' && (
            <Button variant="link" onClick={() => setFilter('all')} className="mt-2">
              전체 보기
            </Button>
          )}
        </div>
      )}

      {/* Info */}
      <div className="p-4 bg-muted/30 backdrop-blur-sm rounded-xl border border-border/50">
        <div className="text-sm text-muted-foreground space-y-1">
          <div>• law.go.kr API에서 시행령/시행규칙 검색 및 다운로드</div>
          <div>• <strong>없음 (확인됨)</strong>: 시행령/시행규칙이 존재하지 않는 법령</div>
          <div>• 필터: 미완료건만 선택하여 효율적으로 다운로드 가능</div>
          <div>• 다운로드 이력은 <code className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs">data/enforcement-download-log.json</code>에 저장</div>
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
