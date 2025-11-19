/**
 * Admin Rules Download Panel - LexDiff Professional Edition
 * Refined interface for downloading administrative rules (고시, 예규, 훈령)
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
  ruleName: string
  status: 'pending' | 'downloading' | 'success' | 'not_found' | 'error'
  error?: string
}

interface AdminRulesDownloadPanelProps {
  refreshTrigger?: number
}

export function AdminRulesDownloadPanel({ refreshTrigger }: AdminRulesDownloadPanelProps = {}) {
  const [laws, setLaws] = useState<SavedLaw[]>([])
  const [loading, setLoading] = useState(true)
  const [downloadProgress, setDownloadProgress] = useState<Map<string, DownloadStatus[]>>(new Map())
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadedFiles, setDownloadedFiles] = useState<Set<string>>(new Set())

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
      const response = await fetch('/api/admin/list-parsed')
      const data = await response.json()

      if (data.success) {
        const allLaws = data.laws || []
        const baseLaws = allLaws.filter(
          (law: SavedLaw) =>
            !law.lawName.includes('시행령') &&
            !law.lawName.includes('시행규칙') &&
            !law.lawName.includes('고시') &&
            !law.lawName.includes('예규') &&
            !law.lawName.includes('훈령')
        )

        setLaws(baseLaws)

        const downloaded = new Set<string>()
        allLaws.forEach((law: SavedLaw) => {
          if (
            law.lawName.includes('고시') ||
            law.lawName.includes('예규') ||
            law.lawName.includes('훈령') ||
            law.lawName.includes('규정') ||
            law.lawName.includes('지침')
          ) {
            downloaded.add(law.lawName)
          }
        })

        setDownloadedFiles(downloaded)
      }
    } catch (error) {
      console.error('Failed to load laws:', error)
    } finally {
      setLoading(false)
    }
  }

  async function downloadAdminRulesForLaw(lawName: string) {
    const key = lawName
    setIsDownloading(true)

    try {
      const hierarchyRes = await fetch(`/api/hierarchy?lawName=${encodeURIComponent(lawName)}`)
      if (!hierarchyRes.ok) {
        setDownloadProgress(
          new Map(
            downloadProgress.set(key, [
              {
                lawName,
                ruleName: '행정규칙',
                status: 'error',
                error: '체계도 조회 실패'
              }
            ])
          )
        )
        setIsDownloading(false)
        return
      }

      const hierarchyXml = await hierarchyRes.text()
      const parser = new DOMParser()
      const hierarchyDoc = parser.parseFromString(hierarchyXml, 'text/xml')

      const adminRules: Array<{ name: string; id: string; serialNumber?: string }> = []

      // Extract all admin rule types
      ;['고시', '예규', '훈령'].forEach((ruleType) => {
        hierarchyDoc.querySelectorAll(ruleType).forEach((node) => {
          const name = node.querySelector('행정규칙명')?.textContent
          const id = node.querySelector('행정규칙ID')?.textContent
          const serialNumber = node.querySelector('행정규칙일련번호')?.textContent
          if (name && id) {
            adminRules.push({ name, id, serialNumber: serialNumber || undefined })
          }
        })
      })

      if (adminRules.length === 0) {
        setDownloadProgress(
          new Map(
            downloadProgress.set(key, [
              {
                lawName,
                ruleName: '행정규칙',
                status: 'not_found',
                error: '행정규칙 없음'
              }
            ])
          )
        )
        setIsDownloading(false)
        return
      }

      // Download all admin rules
      const statuses: DownloadStatus[] = []

      for (const rule of adminRules) {
        const status: DownloadStatus = {
          lawName,
          ruleName: rule.name,
          status: 'downloading'
        }
        statuses.push(status)
        setDownloadProgress(new Map(downloadProgress.set(key, [...statuses])))

        try {
          const downloadRes = await fetch('/api/admin/download-admin-rule', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              id: rule.id,
              serialNumber: rule.serialNumber,
              name: rule.name,
              lawName: lawName
            })
          })

          const result = await downloadRes.json()

          if (result.success) {
            status.status = 'success'
            setDownloadedFiles(new Set([...downloadedFiles, rule.name]))
          } else if (result.notFound) {
            status.status = 'not_found'
          } else {
            status.status = 'error'
            status.error = result.error || '다운로드 실패'
          }
        } catch (error: any) {
          status.status = 'error'
          status.error = error.message
        }

        setDownloadProgress(new Map(downloadProgress.set(key, [...statuses])))
        await new Promise((resolve) => setTimeout(resolve, 500))
      }

      setDownloadProgress(new Map(downloadProgress.set(key, [...statuses])))
    } finally {
      setIsDownloading(false)
    }
  }

  async function downloadAllAdminRules() {
    if (!confirm(`전체 ${laws.length}개 법령의 행정규칙을 다운로드하시겠습니까?\n\n시간이 오래 걸릴 수 있습니다.`)) {
      return
    }

    setIsDownloading(true)

    let successCount = 0
    let errorCount = 0

    for (const law of laws) {
      try {
        await downloadAdminRulesForLaw(law.lawName)
        successCount++
        await new Promise((resolve) => setTimeout(resolve, 1000))
      } catch (error) {
        errorCount++
        console.error(`Failed to download admin rules for ${law.lawName}:`, error)
      }
    }

    setIsDownloading(false)
    alert(`✅ 행정규칙 다운로드 완료\n\n성공: ${successCount}개 법령\n실패: ${errorCount}개 법령`)
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

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-sm text-muted-foreground mb-1">총 법령</div>
          <div className="text-3xl font-bold text-foreground">{laws.length}</div>
        </div>
        <div className="p-4 bg-primary/10 backdrop-blur-sm rounded-xl border border-primary/20 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-sm text-primary mb-1">다운로드됨</div>
          <div className="text-3xl font-bold text-primary">{downloadedFiles.size}</div>
          <div className="text-xs text-muted-foreground mt-1">행정규칙 파일</div>
        </div>
        <div className="p-4 bg-accent/10 backdrop-blur-sm rounded-xl border border-accent/20 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-sm text-accent mb-1">처리 상태</div>
          <div className="text-2xl font-bold text-accent">{isDownloading ? '진행 중' : '대기'}</div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm">
        <div className="text-sm text-muted-foreground">
          {laws.length}개 법령 · 각 법령의 모든 행정규칙 다운로드
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={loadLaws} disabled={loading} variant="outline" size="default" className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
          <Button onClick={downloadAllAdminRules} disabled={isDownloading || laws.length === 0} className="gap-2 shadow-lg shadow-primary/20" size="default">
            {isDownloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                처리 중
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                다운로드
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Laws List */}
      <div className="space-y-3">
        {laws.slice(0, 10).map((law) => {
          const progress = downloadProgress.get(law.lawName) || []

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
                    <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
                      {progress.map((rule, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm">
                          {getStatusIcon(rule.status)}
                          <span className="text-foreground truncate">{rule.ruleName}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground">{getStatusText(rule.status)}</span>
                          {rule.error && <span className="text-destructive text-xs">({rule.error})</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Button
                  onClick={() => downloadAdminRulesForLaw(law.lawName)}
                  disabled={isDownloading}
                  size="default"
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
          <div>• 고시, 예규, 훈령 등 법령 체계도의 행정규칙을 다운로드합니다</div>
          <div>• 각 법령의 모든 행정규칙을 다운로드합니다 (제한 없음)</div>
          <div>• 저장 경로: <code className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs">data/parsed-admin-rules/</code></div>
          <div>• 전체 다운로드는 저장된 모든 법령을 처리합니다</div>
        </div>
      </div>
    </div>
  )
}
