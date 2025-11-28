/**
 * Admin Rules Download Panel - LexDiff Professional Edition
 * Refined interface for downloading administrative rules (고시, 예규, 훈령)
 * With download log tracking and filter functionality
 */

'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Download, CheckCircle2, XCircle, AlertCircle, RefreshCw, Filter, MinusCircle } from 'lucide-react'

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
  status: 'pending' | 'downloading' | 'success' | 'not_found' | 'error' | 'confirmed_none'
  error?: string
  downloadedAt?: string
}

interface DownloadLogEntry {
  lawName: string
  ruleName: string
  result: 'success' | 'not_found' | 'error'
  timestamp: string
  articleCount?: number
  error?: string
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

type FilterType = 'all' | 'incomplete' | 'completed'

export function AdminRulesDownloadPanel({ refreshTrigger }: AdminRulesDownloadPanelProps = {}) {
  const [laws, setLaws] = useState<SavedLaw[]>([])
  const [loading, setLoading] = useState(true)
  const [downloadProgress, setDownloadProgress] = useState<Map<string, DownloadStatus[]>>(new Map())
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadedFiles, setDownloadedFiles] = useState<Set<string>>(new Set())
  const [downloadLog, setDownloadLog] = useState<Record<string, Record<string, DownloadLogEntry>>>({})
  const [notFoundRules, setNotFoundRules] = useState<Set<string>>(new Set())
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 })
  const [currentLawName, setCurrentLawName] = useState<string>('')
  const [filter, setFilter] = useState<FilterType>('all')

  // Selection UI states
  const [selectedLaw, setSelectedLaw] = useState<string | null>(null)
  const [availableRules, setAvailableRules] = useState<AdminRule[]>([])
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set())
  const [loadingRules, setLoadingRules] = useState(false)

  // Law-level status tracking
  const [lawStatus, setLawStatus] = useState<Map<string, 'pending' | 'checked' | 'has_rules' | 'no_rules'>>(new Map())

  useEffect(() => {
    loadLaws()
  }, [])

  useEffect(() => {
    if (refreshTrigger !== undefined) {
      loadLaws()
    }
  }, [refreshTrigger])

  async function loadLaws(): Promise<Set<string> | null> {
    setLoading(true)
    try {
      const [lawsResponse, filesResponse, logResponse] = await Promise.all([
        fetch('/api/admin/list-parsed'),
        fetch('/api/admin/list-admin-rule-files'),
        fetch('/api/admin/admin-rule-download-log')
      ])

      const lawsData = await lawsResponse.json()
      const filesData = await filesResponse.json()
      const logData = await logResponse.json()

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

        // Load download log
        const log = logData.success ? logData.log : {}
        const notFound = new Set<string>(logData.notFoundRules || [])
        setDownloadLog(log)
        setNotFoundRules(notFound)
        setDownloadedFiles(downloaded)

        // Store download dates for later use
        ;(window as any).__adminRuleDownloadDates = downloadDates

        // Determine law-level status based on log
        const newLawStatus = new Map<string, 'pending' | 'checked' | 'has_rules' | 'no_rules'>()
        baseLaws.forEach((law: SavedLaw) => {
          const lawLog = log[law.lawName]
          if (lawLog) {
            const ruleNames = Object.keys(lawLog)
            const hasSuccess = ruleNames.some(name => lawLog[name]?.result === 'success')
            const allNotFound = ruleNames.length > 0 && ruleNames.every(name => lawLog[name]?.result === 'not_found')

            if (hasSuccess) {
              newLawStatus.set(law.lawName, 'has_rules')
            } else if (allNotFound) {
              newLawStatus.set(law.lawName, 'no_rules')
            } else {
              newLawStatus.set(law.lawName, 'checked')
            }
          } else {
            newLawStatus.set(law.lawName, 'pending')
          }
        })
        setLawStatus(newLawStatus)

        return downloaded
      }
      return null
    } catch (error) {
      console.error('Failed to load laws:', error)
      return null
    } finally {
      setLoading(false)
    }
  }

  async function saveDownloadLog(lawName: string, ruleName: string, result: 'success' | 'not_found' | 'error', articleCount?: number, error?: string) {
    try {
      await fetch('/api/admin/admin-rule-download-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lawName, ruleName, result, articleCount, error })
      })
    } catch (e) {
      console.error('Failed to save download log:', e)
    }
  }

  async function showRulesForLaw(lawName: string, freshDownloadedFiles?: Set<string>) {
    setSelectedLaw(lawName)
    setLoadingRules(true)
    setAvailableRules([])
    setSelectedRules(new Set())

    const currentDownloaded = freshDownloadedFiles || downloadedFiles

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
      const seenKeys = new Map<string, AdminRule>()

      ;['고시', '예규', '훈령', '공고', '지침', '기타'].forEach((ruleType) => {
        hierarchyDoc.querySelectorAll(`${ruleType} 기본정보`).forEach((node) => {
          const name = node.querySelector('행정규칙명')?.textContent
          const id = node.querySelector('행정규칙ID')?.textContent
          const serialNumber = node.querySelector('행정규칙일련번호')?.textContent

          if (name && id) {
            const uniqueKey = serialNumber || id

            if (!seenKeys.has(uniqueKey)) {
              seenKeys.set(uniqueKey, {
                name,
                id,
                serialNumber: serialNumber || undefined,
                type: ruleType
              })
            }
          }
        })
      })

      adminRules.push(...Array.from(seenKeys.values()))

      if (adminRules.length === 0) {
        // Log that this law has no admin rules
        await saveDownloadLog(lawName, '(행정규칙 없음)', 'not_found')
        setLawStatus(prev => new Map(prev.set(lawName, 'no_rules')))
        alert(`${lawName}에 대한 행정규칙이 없습니다`)
        setSelectedLaw(null)
      } else {
        setAvailableRules(adminRules)
        setLawStatus(prev => new Map(prev.set(lawName, 'has_rules')))
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
    let actualSuccessCount = 0

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
          headers: { 'Content-Type': 'application/json' },
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
          actualSuccessCount++
          setDownloadedFiles((prev) => new Set([...prev, rule.name]))
          await saveDownloadLog(selectedLaw, rule.name, 'success', result.articleCount)
        } else if (result.notFound) {
          status.status = 'confirmed_none'
          await saveDownloadLog(selectedLaw, rule.name, 'not_found')
        } else {
          status.status = 'error'
          status.error = result.error || '다운로드 실패'
          await saveDownloadLog(selectedLaw, rule.name, 'error', undefined, result.error)
        }
      } catch (error: any) {
        status.status = 'error'
        status.error = error.message
        await saveDownloadLog(selectedLaw, rule.name, 'error', undefined, error.message)
      }

      setDownloadProgress(new Map(downloadProgress.set(selectedLaw, [...statuses])))
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    setIsDownloading(false)
    await loadLaws()

    const failedCount = rulesToDownload.length - actualSuccessCount
    alert(`✅ 다운로드 완료\n\n선택: ${rulesToDownload.length}개\n성공: ${actualSuccessCount}개\n실패: ${failedCount}개`)
  }

  async function downloadAllAdminRules() {
    // Get filtered laws that need checking
    const lawsToProcess = filteredLaws.filter(law => {
      const status = lawStatus.get(law.lawName)
      return status === 'pending' || status === undefined
    })

    if (lawsToProcess.length === 0) {
      alert('처리할 항목이 없습니다.')
      return
    }

    if (!confirm(`${lawsToProcess.length}개 법령의 행정규칙을 확인하시겠습니까?\n\n시간이 오래 걸릴 수 있습니다.`)) {
      return
    }

    setIsDownloading(true)
    setBatchProgress({ current: 0, total: lawsToProcess.length })

    let successCount = 0
    let noRulesCount = 0
    let errorCount = 0

    for (let i = 0; i < lawsToProcess.length; i++) {
      const law = lawsToProcess[i]
      setCurrentLawName(law.lawName)
      setBatchProgress({ current: i + 1, total: lawsToProcess.length })

      try {
        // Check hierarchy for admin rules
        const hierarchyRes = await fetch(`/api/hierarchy?lawName=${encodeURIComponent(law.lawName)}`)
        if (!hierarchyRes.ok) {
          errorCount++
          continue
        }

        const hierarchyXml = await hierarchyRes.text()
        const parser = new DOMParser()
        const hierarchyDoc = parser.parseFromString(hierarchyXml, 'text/xml')

        const adminRules: Array<{ name: string; id: string; serialNumber?: string }> = []
        const seenKeys = new Map<string, { name: string; id: string; serialNumber?: string }>()

        ;['고시', '예규', '훈령', '공고', '지침', '기타'].forEach((ruleType) => {
          hierarchyDoc.querySelectorAll(`${ruleType} 기본정보`).forEach((node) => {
            const name = node.querySelector('행정규칙명')?.textContent
            const id = node.querySelector('행정규칙ID')?.textContent
            const serialNumber = node.querySelector('행정규칙일련번호')?.textContent

            if (name && id) {
              const uniqueKey = serialNumber || id
              if (!seenKeys.has(uniqueKey)) {
                seenKeys.set(uniqueKey, { name, id, serialNumber: serialNumber || undefined })
              }
            }
          })
        })

        adminRules.push(...Array.from(seenKeys.values()))

        if (adminRules.length === 0) {
          // No admin rules for this law
          await saveDownloadLog(law.lawName, '(행정규칙 없음)', 'not_found')
          setLawStatus(prev => new Map(prev.set(law.lawName, 'no_rules')))
          noRulesCount++
        } else {
          // Download all admin rules for this law
          const statuses: DownloadStatus[] = []

          for (const rule of adminRules) {
            // Skip if already downloaded
            if (downloadedFiles.has(rule.name)) continue

            const status: DownloadStatus = {
              lawName: law.lawName,
              ruleName: rule.name,
              status: 'downloading'
            }
            statuses.push(status)
            setDownloadProgress(new Map(downloadProgress.set(law.lawName, [...statuses])))

            try {
              const downloadRes = await fetch('/api/admin/download-admin-rule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: rule.id,
                  serialNumber: rule.serialNumber,
                  name: rule.name,
                  lawName: law.lawName
                })
              })

              const result = await downloadRes.json()

              if (result.success) {
                status.status = 'success'
                setDownloadedFiles((prev) => new Set([...prev, rule.name]))
                await saveDownloadLog(law.lawName, rule.name, 'success', result.articleCount)
              } else if (result.notFound) {
                status.status = 'confirmed_none'
                await saveDownloadLog(law.lawName, rule.name, 'not_found')
              } else {
                status.status = 'error'
                status.error = result.error
                await saveDownloadLog(law.lawName, rule.name, 'error', undefined, result.error)
              }
            } catch (error: any) {
              status.status = 'error'
              status.error = error.message
              await saveDownloadLog(law.lawName, rule.name, 'error', undefined, error.message)
            }

            setDownloadProgress(new Map(downloadProgress.set(law.lawName, [...statuses])))
            await new Promise((resolve) => setTimeout(resolve, 300))
          }

          setLawStatus(prev => new Map(prev.set(law.lawName, 'has_rules')))
          successCount++
        }

        await new Promise((resolve) => setTimeout(resolve, 500))
      } catch (error) {
        errorCount++
        console.error(`Failed to process ${law.lawName}:`, error)
      }
    }

    setIsDownloading(false)
    setCurrentLawName('')
    setBatchProgress({ current: 0, total: 0 })
    await loadLaws()
    alert(`✅ 행정규칙 다운로드 완료\n\n처리: ${lawsToProcess.length}개 법령\n행정규칙 있음: ${successCount}개\n행정규칙 없음: ${noRulesCount}개\n오류: ${errorCount}개`)
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
      case 'confirmed_none':
        return <MinusCircle className="w-4 h-4 text-muted-foreground" />
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
      case 'confirmed_none':
        return '없음 (확인됨)'
      case 'error':
        return '오류'
    }
  }

  function getLawStatusIcon(status: string | undefined) {
    switch (status) {
      case 'has_rules':
        return <CheckCircle2 className="w-4 h-4 text-accent" />
      case 'no_rules':
        return <MinusCircle className="w-4 h-4 text-muted-foreground" />
      case 'checked':
        return <AlertCircle className="w-4 h-4 text-warning" />
      default:
        return <AlertCircle className="w-4 h-4 text-muted-foreground" />
    }
  }

  function getLawStatusText(status: string | undefined) {
    switch (status) {
      case 'has_rules':
        return '행정규칙 있음'
      case 'no_rules':
        return '행정규칙 없음 (확인됨)'
      case 'checked':
        return '확인됨'
      default:
        return '미확인'
    }
  }

  // Filter laws based on current filter
  const filteredLaws = useMemo(() => {
    return laws.filter(law => {
      const status = lawStatus.get(law.lawName)
      const isPending = status === 'pending' || status === undefined
      const isComplete = status === 'has_rules' || status === 'no_rules'

      switch (filter) {
        case 'incomplete':
          return isPending
        case 'completed':
          return isComplete
        default:
          return true
      }
    })
  }, [laws, lawStatus, filter])

  // Stats calculation
  const stats = useMemo(() => {
    const hasRulesCount = Array.from(lawStatus.values()).filter(s => s === 'has_rules').length
    const noRulesCount = Array.from(lawStatus.values()).filter(s => s === 'no_rules').length
    const pendingCount = laws.length - hasRulesCount - noRulesCount

    return {
      total: laws.length,
      downloadedFiles: downloadedFiles.size,
      hasRules: hasRulesCount,
      noRules: noRulesCount,
      pending: pendingCount
    }
  }, [laws, lawStatus, downloadedFiles])

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
      <div className="grid grid-cols-5 gap-3">
        <div className="p-3 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm">
          <div className="text-xs text-muted-foreground mb-1">총 법령</div>
          <div className="text-2xl font-bold text-foreground">{stats.total}</div>
        </div>
        <div className="p-3 bg-primary/10 backdrop-blur-sm rounded-xl border border-primary/20 shadow-sm">
          <div className="text-xs text-primary mb-1">다운로드 파일</div>
          <div className="text-2xl font-bold text-primary">{stats.downloadedFiles}</div>
        </div>
        <div className="p-3 bg-accent/10 backdrop-blur-sm rounded-xl border border-accent/20 shadow-sm">
          <div className="text-xs text-accent mb-1">행정규칙 있음</div>
          <div className="text-2xl font-bold text-accent">{stats.hasRules}</div>
        </div>
        <div className="p-3 bg-muted/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm">
          <div className="text-xs text-muted-foreground mb-1">행정규칙 없음</div>
          <div className="text-2xl font-bold text-muted-foreground">{stats.noRules}</div>
        </div>
        <div className="p-3 bg-warning/10 backdrop-blur-sm rounded-xl border border-warning/20 shadow-sm">
          <div className="text-xs text-warning mb-1">미확인</div>
          <div className="text-2xl font-bold text-warning">{stats.pending}</div>
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

      {/* Action Bar with Filter */}
      <div className="flex items-center justify-between p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm">
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
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
              미확인 ({stats.pending})
            </Button>
            <Button
              variant={filter === 'completed' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('completed')}
              className="h-8"
            >
              확인됨 ({stats.hasRules + stats.noRules})
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={loadLaws} disabled={loading || isDownloading} variant="outline" size="default" className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
          <Button
            onClick={downloadAllAdminRules}
            disabled={isDownloading || stats.pending === 0}
            className="gap-2 shadow-lg shadow-primary/20"
            size="default"
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                처리 중
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                {filter === 'incomplete' ? '미확인 다운로드' : '전체 다운로드'}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Laws List */}
      <div className="space-y-3 max-h-[600px] overflow-y-auto">
        {filteredLaws.map((law) => {
          const progress = downloadProgress.get(law.lawName) || []
          const status = lawStatus.get(law.lawName)
          const isComplete = status === 'has_rules' || status === 'no_rules'

          return (
            <div
              key={law.lawId}
              className="p-4 bg-card/30 backdrop-blur-sm rounded-xl border border-border/50 hover:bg-card/50 transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-foreground">{law.lawName}</h3>
                    <div className="flex items-center gap-1 text-xs">
                      {getLawStatusIcon(status)}
                      <span className="text-muted-foreground">{getLawStatusText(status)}</span>
                    </div>
                  </div>
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

                {isComplete ? (
                  <div className="flex items-center gap-1.5 text-sm text-accent">
                    {status === 'has_rules' ? (
                      <><CheckCircle2 className="w-4 h-4" />완료</>
                    ) : (
                      <><MinusCircle className="w-4 h-4 text-muted-foreground" /><span className="text-muted-foreground">없음</span></>
                    )}
                  </div>
                ) : (
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
                )}
              </div>
            </div>
          )
        })}
      </div>

      {filteredLaws.length === 0 && (
        <div className="p-8 bg-muted/30 backdrop-blur-sm rounded-xl border border-border/50 text-center">
          <p className="text-muted-foreground">
            {filter === 'incomplete' ? '미확인 항목이 없습니다' :
             filter === 'completed' ? '확인된 항목이 없습니다' :
             '저장된 법령이 없습니다'}
          </p>
          {filter !== 'all' && (
            <Button variant="link" onClick={() => setFilter('all')} className="mt-2">
              전체 보기
            </Button>
          )}
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
                      checked={availableRules.length > 0 && selectedRules.size === availableRules.filter(r => !downloadedFiles.has(r.name) && !notFoundRules.has(r.name)).length}
                      onChange={() => {
                        const selectableRules = availableRules.filter(r => !downloadedFiles.has(r.name) && !notFoundRules.has(r.name))
                        if (selectedRules.size === selectableRules.length) {
                          setSelectedRules(new Set())
                        } else {
                          setSelectedRules(new Set(selectableRules.map((r) => r.name)))
                        }
                      }}
                      disabled={isDownloading}
                      className="h-4 w-4"
                    />
                    <span className="font-medium text-primary">
                      전체 선택 {selectedRules.size > 0 && `(${selectedRules.size}/${availableRules.filter(r => !downloadedFiles.has(r.name) && !notFoundRules.has(r.name)).length})`}
                    </span>
                  </label>

                  {/* Rules List */}
                  {availableRules.map((rule, index) => {
                    const isSelected = selectedRules.has(rule.name)
                    const isDownloaded = downloadedFiles.has(rule.name)
                    const isConfirmedNone = notFoundRules.has(rule.name)
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
                              : isConfirmedNone
                                ? 'bg-muted/30 border-border/30 opacity-50'
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
                          disabled={isDownloading || isDownloaded || isConfirmedNone}
                          className="h-4 w-4"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-foreground">{rule.name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {rule.type} · ID: {rule.id}
                            {isDownloaded && downloadedAt && (
                              <span className="ml-2">· 다운로드: {formatDate(downloadedAt)}</span>
                            )}
                            {isConfirmedNone && (
                              <span className="ml-2">· 없음 (확인됨)</span>
                            )}
                          </div>
                        </div>
                        {isDownloaded && <CheckCircle2 className="h-4 w-4 text-accent" />}
                        {isConfirmedNone && <MinusCircle className="h-4 w-4 text-muted-foreground" />}
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
          <div>• <strong>행정규칙 없음 (확인됨)</strong>: 해당 법령에 행정규칙이 없는 경우</div>
          <div>• 필터: 미확인건만 선택하여 효율적으로 다운로드 가능</div>
          <div>• 다운로드 이력은 <code className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs">data/admin-rule-download-log.json</code>에 저장</div>
        </div>
      </div>
    </div>
  )
}

function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate)
    const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000))
    const year = kstDate.getUTCFullYear()
    const month = String(kstDate.getUTCMonth() + 1).padStart(2, '0')
    const day = String(kstDate.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  } catch {
    return isoDate
  }
}
