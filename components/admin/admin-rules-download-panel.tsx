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
  downloadedAt?: string
}

interface AdminRulesDownloadPanelProps {
  refreshTrigger?: number
}

interface AdminRule {
  name: string
  id: string
  serialNumber?: string
  type: string
}

export function AdminRulesDownloadPanel({ refreshTrigger }: AdminRulesDownloadPanelProps = {}) {
  const [laws, setLaws] = useState<SavedLaw[]>([])
  const [loading, setLoading] = useState(true)
  const [downloadProgress, setDownloadProgress] = useState<Map<string, DownloadStatus[]>>(new Map())
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadedFiles, setDownloadedFiles] = useState<Set<string>>(new Set())
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 })
  const [currentLawName, setCurrentLawName] = useState<string>('')

  // Selection UI states
  const [selectedLaw, setSelectedLaw] = useState<string | null>(null)
  const [availableRules, setAvailableRules] = useState<AdminRule[]>([])
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set())
  const [loadingRules, setLoadingRules] = useState(false)

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
        fetch('/api/admin/list-admin-rule-files')
      ])

      const lawsData = await lawsResponse.json()
      const filesData = await filesResponse.json()

      if (lawsData.success) {
        const allLaws = lawsData.laws || []
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
        const downloadDates = new Map<string, string>()

        // Use file metadata for downloaded files
        if (filesData.success) {
          filesData.files.forEach((file: any) => {
            downloaded.add(file.ruleName)
            downloadDates.set(file.ruleName, file.downloadedAt)
          })
        }

        setDownloadedFiles(downloaded)

        // Store download dates for later use
        ;(window as any).__adminRuleDownloadDates = downloadDates
      }
    } catch (error) {
      console.error('Failed to load laws:', error)
    } finally {
      setLoading(false)
    }
  }

  async function showRulesForLaw(lawName: string) {
    setSelectedLaw(lawName)
    setLoadingRules(true)
    setAvailableRules([])
    setSelectedRules(new Set())

    try {
      const hierarchyRes = await fetch(`/api/hierarchy?lawName=${encodeURIComponent(lawName)}`)
      if (!hierarchyRes.ok) {
        alert('체계도 조회 실패')
        setSelectedLaw(null)
        setLoadingRules(false)
        return
      }

      const hierarchyXml = await hierarchyRes.text()
      const parser = new DOMParser()
      const hierarchyDoc = parser.parseFromString(hierarchyXml, 'text/xml')

      const adminRules: AdminRule[] = []

      // Extract all admin rule types
      ;['고시', '예규', '훈령'].forEach((ruleType) => {
        hierarchyDoc.querySelectorAll(ruleType).forEach((node) => {
          const name = node.querySelector('행정규칙명')?.textContent
          const id = node.querySelector('행정규칙ID')?.textContent
          const serialNumber = node.querySelector('행정규칙일련번호')?.textContent
          if (name && id) {
            adminRules.push({ name, id, serialNumber: serialNumber || undefined, type: ruleType })
          }
        })
      })

      if (adminRules.length === 0) {
        alert(`${lawName}에 대한 행정규칙이 없습니다`)
        setSelectedLaw(null)
      } else {
        setAvailableRules(adminRules)
      }
    } catch (error: any) {
      alert(`행정규칙 목록 조회 실패: ${error.message}`)
      setSelectedLaw(null)
    } finally {
      setLoadingRules(false)
    }
  }

  async function downloadSelectedRules() {
    if (selectedRules.size === 0 || !selectedLaw) return

    setIsDownloading(true)

    const rulesToDownload = availableRules.filter((r) => selectedRules.has(r.name))
    const statuses: DownloadStatus[] = []

    for (const rule of rulesToDownload) {
      const status: DownloadStatus = {
        lawName: selectedLaw,
        ruleName: rule.name,
        status: 'downloading'
      }
      statuses.push(status)
      setDownloadProgress(new Map(downloadProgress.set(selectedLaw, [...statuses])))

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
            lawName: selectedLaw
          })
        })

        const result = await downloadRes.json()

        if (result.success) {
          status.status = 'success'
          setDownloadedFiles((prev) => new Set([...prev, rule.name]))
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

      setDownloadProgress(new Map(downloadProgress.set(selectedLaw, [...statuses])))
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    setIsDownloading(false)
    setSelectedLaw(null)
    setSelectedRules(new Set())

    const successCount = statuses.filter((s) => s.status === 'success').length
    alert(`✅ 다운로드 완료\n\n성공: ${successCount}개\n실패: ${statuses.length - successCount}개`)
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
            setDownloadedFiles((prev) => new Set([...prev, rule.name]))
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
    setBatchProgress({ current: 0, total: laws.length })

    let successCount = 0
    let errorCount = 0

    for (let i = 0; i < laws.length; i++) {
      const law = laws[i]
      setCurrentLawName(law.lawName)
      setBatchProgress({ current: i + 1, total: laws.length })

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
    setCurrentLawName('')
    setBatchProgress({ current: 0, total: 0 })
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
          {laws.length}개 법령 · 각 법령의 모든 행정규칙 다운로드
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={loadLaws} disabled={loading || isDownloading} variant="outline" size="default" className="gap-2">
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
                전체 다운로드
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Laws List */}
      <div className="space-y-3 max-h-[800px] overflow-y-auto">
        {laws.map((law) => {
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
                  onClick={() => showRulesForLaw(law.lawName)}
                  disabled={isDownloading || loadingRules}
                  size="default"
                  variant="outline"
                  className="gap-2"
                >
                  {progress.some((p) => p.status === 'downloading') ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  목록 보기
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

      {/* Selection Modal */}
      {selectedLaw && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl border border-border shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-foreground">{selectedLaw}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {loadingRules
                      ? '행정규칙 목록 조회 중...'
                      : `${availableRules.length}개 행정규칙 · ${selectedRules.size}개 선택됨`}
                  </p>
                </div>
                <Button
                  onClick={() => {
                    setSelectedLaw(null)
                    setSelectedRules(new Set())
                  }}
                  variant="outline"
                  size="sm"
                  disabled={isDownloading}
                >
                  닫기
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {loadingRules ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Select All */}
                  <label className="flex items-center gap-3 p-3 rounded-lg border border-primary/30 bg-primary/10 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedRules.size === availableRules.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRules(new Set(availableRules.map((r) => r.name)))
                        } else {
                          setSelectedRules(new Set())
                        }
                      }}
                      disabled={isDownloading}
                      className="h-4 w-4"
                    />
                    <span className="font-medium text-primary">전체 선택</span>
                  </label>

                  {/* Rules List */}
                  {availableRules.map((rule, index) => {
                    const isSelected = selectedRules.has(rule.name)
                    const isDownloaded = downloadedFiles.has(rule.name)
                    const downloadDates = (window as any).__adminRuleDownloadDates as Map<string, string> | undefined
                    const downloadedAt = downloadDates?.get(rule.name)

                    return (
                      <label
                        key={index}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-primary/10 border-primary/30 shadow-sm'
                            : isDownloaded
                              ? 'bg-accent/10 border-accent/30 opacity-60'
                              : 'bg-card/30 border-border/50 hover:bg-card/50 hover:border-primary/20'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            const newSet = new Set(selectedRules)
                            if (e.target.checked) {
                              newSet.add(rule.name)
                            } else {
                              newSet.delete(rule.name)
                            }
                            setSelectedRules(newSet)
                          }}
                          disabled={isDownloading || isDownloaded}
                          className="h-4 w-4"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-foreground">{rule.name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {rule.type} · ID: {rule.id}
                            {isDownloaded && downloadedAt && (
                              <span className="ml-2">· 다운로드: {formatDate(downloadedAt)}</span>
                            )}
                          </div>
                        </div>
                        {isDownloaded && (
                          <CheckCircle2 className="h-4 w-4 text-accent" />
                        )}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-border flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {selectedRules.size}개 선택됨
              </div>
              <Button
                onClick={downloadSelectedRules}
                disabled={selectedRules.size === 0 || isDownloading}
                className="gap-2 shadow-lg shadow-primary/20"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    다운로드 중...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    다운로드 ({selectedRules.size})
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="p-4 bg-muted/30 backdrop-blur-sm rounded-xl border border-border/50">
        <div className="text-sm text-muted-foreground space-y-1">
          <div>• 고시, 예규, 훈령 등 법령 체계도의 행정규칙을 다운로드합니다</div>
          <div>• 각 법령의 모든 행정규칙을 다운로드합니다 (제한 없음)</div>
          <div>• 저장 경로: <code className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs">data/parsed-admin-rules/(법령명)/</code></div>
          <div>• 전체 다운로드는 저장된 모든 법령을 처리합니다</div>
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
