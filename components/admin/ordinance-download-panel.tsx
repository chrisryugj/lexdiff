/**
 * Ordinance Download Panel - LexDiff Professional Edition
 * Refined interface for Seoul ordinance batch downloads
 * With parallel processing and abort control
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'

// Parallel processing configuration
const PARALLEL_LIMIT = 8 // Number of concurrent downloads

const SEOUL_DISTRICTS = [
  { code: '11', name: '서울특별시' },
  { code: '11110', name: '종로구' },
  { code: '11140', name: '중구' },
  { code: '11170', name: '용산구' },
  { code: '11200', name: '성동구' },
  { code: '11215', name: '광진구' },
  { code: '11230', name: '성북구' },
  { code: '11260', name: '강북구' },
  { code: '11290', name: '도봉구' },
  { code: '11305', name: '노원구' },
  { code: '11320', name: '은평구' },
  { code: '11350', name: '서대문구' },
  { code: '11380', name: '마포구' },
  { code: '11410', name: '양천구' },
  { code: '11440', name: '강서구' },
  { code: '11470', name: '구로구' },
  { code: '11500', name: '금천구' },
  { code: '11530', name: '영등포구' },
  { code: '11545', name: '동작구' },
  { code: '11560', name: '관악구' },
  { code: '11590', name: '서초구' },
  { code: '11620', name: '강남구' },
  { code: '11650', name: '송파구' },
  { code: '11680', name: '강동구' },
  { code: '11710', name: '동대문구' },
  { code: '11740', name: '중랑구' }
]

interface DistrictStatus {
  code: string
  name: string
  status: 'pending' | 'downloading' | 'success' | 'error'
  ordinanceCount?: number
  skippedCount?: number
  totalFound?: number
  error?: string
  startTime?: number
  lastDownloaded?: string
}

export function OrdinanceDownloadPanel() {
  const [selectedDistricts, setSelectedDistricts] = useState<Set<string>>(new Set())
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<Map<string, DistrictStatus>>(new Map())
  const [activeDownloads, setActiveDownloads] = useState<Set<string>>(new Set())
  const [elapsedTime, setElapsedTime] = useState(0)
  const [districtDownloadDates, setDistrictDownloadDates] = useState<Map<string, string>>(new Map())

  // Abort controller for stopping downloads
  const abortControllerRef = useRef<AbortController | null>(null)
  const isAbortedRef = useRef(false)

  // Load existing ordinance files on mount
  useEffect(() => {
    loadExistingFiles()
  }, [])

  async function loadExistingFiles() {
    try {
      const response = await fetch('/api/admin/list-parsed-ordinances')
      const data = await response.json()

      if (data.success) {
        // Group by district and find latest download date
        const datesByDistrict = new Map<string, string>()

        data.ordinances.forEach((file: any) => {
          const districtName = file.districtName
          const existing = datesByDistrict.get(districtName)

          if (!existing || new Date(file.lastModified) > new Date(existing)) {
            datesByDistrict.set(districtName, file.lastModified)
          }
        })

        setDistrictDownloadDates(datesByDistrict)
      }
    } catch (error) {
      console.error('Failed to load ordinance files:', error)
    }
  }

  function toggleDistrict(code: string) {
    if (isDownloading) return
    const newSelection = new Set(selectedDistricts)
    if (newSelection.has(code)) {
      newSelection.delete(code)
    } else {
      newSelection.add(code)
    }
    setSelectedDistricts(newSelection)
  }

  function toggleAllDistricts() {
    if (isDownloading) return
    if (selectedDistricts.size === SEOUL_DISTRICTS.length) {
      setSelectedDistricts(new Set())
    } else {
      setSelectedDistricts(new Set(SEOUL_DISTRICTS.map((d) => d.code)))
    }
  }

  async function downloadDistrict(
    districtCode: string,
    districtName: string,
    signal: AbortSignal
  ): Promise<DistrictStatus> {
    const startTime = Date.now()

    // Mark as downloading
    setActiveDownloads(prev => new Set(prev).add(districtCode))
    setDownloadProgress(prev => {
      const newMap = new Map(prev)
      newMap.set(districtCode, {
        code: districtCode,
        name: districtName,
        status: 'downloading',
        startTime
      })
      return newMap
    })

    try {
      // Use SSE streaming for abort support
      const response = await fetch('/api/admin/download-ordinances', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          districtCode,
          districtName,
          delay: 50 // Very fast delay
        }),
        signal
      })

      if (!response.ok) {
        throw new Error('API 요청 실패')
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('스트림 읽기 실패')
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let finalResult: any = null

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
              if (data.type === 'complete') {
                finalResult = data
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      const status: DistrictStatus = finalResult?.success
        ? {
            code: districtCode,
            name: districtName,
            status: 'success',
            ordinanceCount: finalResult.ordinanceCount || 0,
            skippedCount: finalResult.skippedCount || 0,
            totalFound: finalResult.totalFound || 0,
            startTime
          }
        : {
            code: districtCode,
            name: districtName,
            status: 'error',
            error: finalResult?.error || '다운로드 실패',
            startTime
          }

      setDownloadProgress(prev => {
        const newMap = new Map(prev)
        newMap.set(districtCode, status)
        return newMap
      })

      return status
    } catch (error: any) {
      const status: DistrictStatus = {
        code: districtCode,
        name: districtName,
        status: 'error',
        error: signal.aborted ? '중지됨' : error.message,
        startTime
      }

      setDownloadProgress(prev => {
        const newMap = new Map(prev)
        newMap.set(districtCode, status)
        return newMap
      })

      return status
    } finally {
      setActiveDownloads(prev => {
        const newSet = new Set(prev)
        newSet.delete(districtCode)
        return newSet
      })
    }
  }

  async function startBatchDownload() {
    if (selectedDistricts.size === 0) {
      alert('다운로드할 자치구를 선택해주세요')
      return
    }

    const estimatedMinutes = Math.ceil(selectedDistricts.size / PARALLEL_LIMIT * 0.5)
    if (
      !confirm(
        `선택한 ${selectedDistricts.size}개 자치구의 조례를 다운로드하시겠습니까?\n\n` +
        `병렬 처리: ${PARALLEL_LIMIT}개 동시 다운로드\n` +
        `예상 소요 시간: ${estimatedMinutes}~${estimatedMinutes * 2}분`
      )
    ) {
      return
    }

    // Reset abort state
    isAbortedRef.current = false
    abortControllerRef.current = new AbortController()

    setIsDownloading(true)
    setDownloadProgress(new Map())
    setElapsedTime(0)

    const startTime = Date.now()
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)

    // Convert selected districts to array
    const districtsToDownload = Array.from(selectedDistricts)
      .map(code => SEOUL_DISTRICTS.find(d => d.code === code))
      .filter((d): d is typeof SEOUL_DISTRICTS[0] => d !== undefined)

    // Parallel processing with semaphore pattern
    const results: DistrictStatus[] = []
    let index = 0

    async function processNext(): Promise<void> {
      while (index < districtsToDownload.length && !isAbortedRef.current) {
        const currentIndex = index++
        const district = districtsToDownload[currentIndex]

        // Check abort before starting
        if (isAbortedRef.current) {
          results.push({
            code: district.code,
            name: district.name,
            status: 'error',
            error: '중지됨'
          })
          continue
        }

        const result = await downloadDistrict(
          district.code,
          district.name,
          abortControllerRef.current!.signal
        )
        results.push(result)
      }
    }

    // Start parallel workers
    const workers = Array(Math.min(PARALLEL_LIMIT, districtsToDownload.length))
      .fill(null)
      .map(() => processNext())

    await Promise.all(workers)

    clearInterval(timer)
    setIsDownloading(false)
    setActiveDownloads(new Set())

    const successCount = results.filter(d => d.status === 'success').length
    const errorCount = results.filter(d => d.status === 'error').length
    const abortedCount = results.filter(d => d.error === '중지됨').length
    const totalFound = results.reduce((sum, d) => sum + (d.totalFound || 0), 0)
    const totalDownloaded = results.reduce((sum, d) => sum + (d.ordinanceCount || 0), 0)
    const totalSkipped = results.reduce((sum, d) => sum + (d.skippedCount || 0), 0)

    if (isAbortedRef.current) {
      alert(`⛔ 다운로드가 중지되었습니다\n\n완료: ${successCount}개 자치구\n실패: ${errorCount - abortedCount}개\n중지: ${abortedCount}개\n\n조례: ${totalFound.toLocaleString()}개 (신규 ${totalDownloaded}, 기존 ${totalSkipped})`)
    } else {
      alert(`✅ 조례 다운로드 완료\n\n자치구: ${successCount}개 성공, ${errorCount}개 실패\n조례: ${totalFound.toLocaleString()}개 (신규 ${totalDownloaded}, 기존 ${totalSkipped})`)
    }

    // Reload file dates
    loadExistingFiles()
  }

  function stopDownload() {
    if (!confirm('다운로드를 중지하시겠습니까?\n\n현재 진행 중인 다운로드가 즉시 중지됩니다.')) {
      return
    }

    isAbortedRef.current = true
    // Abort all current SSE connections
    abortControllerRef.current?.abort()
  }

  function getDistrictStatus(code: string): DistrictStatus | undefined {
    return downloadProgress.get(code)
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const successCount = Array.from(downloadProgress.values()).filter((d) => d.status === 'success').length
  const errorCount = Array.from(downloadProgress.values()).filter((d) => d.status === 'error').length
  const completedCount = successCount + errorCount
  const progressPercent = selectedDistricts.size > 0 ? (completedCount / selectedDistricts.size) * 100 : 0

  // Calculate total ordinances from completed downloads
  const totalOrdinancesDownloaded = Array.from(downloadProgress.values())
    .filter(d => d.status === 'success')
    .reduce((sum, d) => sum + (d.ordinanceCount || 0), 0)
  const totalOrdinancesSkipped = Array.from(downloadProgress.values())
    .filter(d => d.status === 'success')
    .reduce((sum, d) => sum + (d.skippedCount || 0), 0)
  const totalOrdinancesFound = Array.from(downloadProgress.values())
    .filter(d => d.status === 'success')
    .reduce((sum, d) => sum + (d.totalFound || 0), 0)

  return (
    <div className="space-y-6">
      {/* Progress Monitor */}
      {isDownloading && (
        <div className="relative overflow-hidden p-4 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-xl backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 shadow-sm">
                <Icon name="loader" className="h-5 w-5 text-primary animate-spin" />
              </div>
              <div>
                <div className="font-medium text-foreground">
                  병렬 다운로드 중 ({activeDownloads.size}/{PARALLEL_LIMIT} 활성)
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatTime(elapsedTime)} 경과 · {Array.from(activeDownloads).map(code => {
                    const district = SEOUL_DISTRICTS.find(d => d.code === code)
                    return district?.name
                  }).filter(Boolean).join(', ') || '대기 중'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-2xl font-bold text-foreground">{Math.round(progressPercent)}%</div>
                <div className="text-sm text-muted-foreground">
                  {completedCount}/{selectedDistricts.size} 자치구 · {totalOrdinancesFound.toLocaleString()}개 조례
                </div>
              </div>
              <Button
                onClick={stopDownload}
                variant="destructive"
                size="sm"
                className="gap-2"
              >
                <Icon name="stop-circle" className="h-4 w-4" />
                중지
              </Button>
            </div>
          </div>
          <div className="relative h-2 bg-muted/50 rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-accent to-primary rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"
              style={{ width: '50%' }}
            />
          </div>
        </div>
      )}

      {/* Stats & Controls */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-sm text-muted-foreground mb-1">전체 자치구</div>
          <div className="text-3xl font-bold text-foreground">{SEOUL_DISTRICTS.length}</div>
        </div>
        <div className="p-4 bg-primary/10 backdrop-blur-sm rounded-xl border border-primary/20 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-sm text-primary mb-1">선택됨</div>
          <div className="text-3xl font-bold text-primary">{selectedDistricts.size}</div>
        </div>
        <div className="p-4 bg-accent/10 backdrop-blur-sm rounded-xl border border-accent/20 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-sm text-accent mb-1">완료</div>
          <div className="text-3xl font-bold text-accent">{successCount}</div>
        </div>
        <div className="p-4 bg-warning/10 backdrop-blur-sm rounded-xl border border-warning/20 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-sm text-warning mb-1">실패</div>
          <div className="text-3xl font-bold text-warning">{errorCount}</div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm">
        <div className="flex items-center gap-3">
          <Button
            onClick={toggleAllDistricts}
            disabled={isDownloading}
            variant="outline"
            size="sm"
          >
            {selectedDistricts.size === SEOUL_DISTRICTS.length ? '전체 해제' : '전체 선택'}
          </Button>
          <div className="text-sm text-muted-foreground">
            {selectedDistricts.size > 0
              ? totalOrdinancesFound > 0
                ? `${totalOrdinancesFound.toLocaleString()}개 조례 완료 · ${Math.max(1, Math.ceil(selectedDistricts.size / PARALLEL_LIMIT))}~${Math.max(2, Math.ceil(selectedDistricts.size / PARALLEL_LIMIT * 2))}분 예상`
                : `${selectedDistricts.size}개 자치구 선택 · 약 ${Math.max(1, Math.ceil(selectedDistricts.size / PARALLEL_LIMIT))}~${Math.max(2, Math.ceil(selectedDistricts.size / PARALLEL_LIMIT * 2))}분 예상`
              : '자치구를 선택하세요'}
          </div>
        </div>
        <Button
          onClick={startBatchDownload}
          disabled={isDownloading || selectedDistricts.size === 0}
          className="gap-2 shadow-lg shadow-primary/20"
          size="default"
        >
          {isDownloading ? (
            <>
              <Icon name="loader" className="w-4 h-4 animate-spin" />
              처리 중
            </>
          ) : (
            <>
              <Icon name="download" className="w-4 h-4" />
              다운로드 ({selectedDistricts.size})
            </>
          )}
        </Button>
      </div>

      {/* District Grid */}
      <div className="grid grid-cols-4 gap-3">
        {SEOUL_DISTRICTS.map((district, index) => {
          const isSelected = selectedDistricts.has(district.code)
          const status = getDistrictStatus(district.code)

          return (
            <div
              key={district.code}
              onClick={() => !isDownloading && toggleDistrict(district.code)}
              role="button"
              tabIndex={isDownloading ? -1 : 0}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !isDownloading) {
                  e.preventDefault()
                  toggleDistrict(district.code)
                }
              }}
              className={`
                p-4 rounded-xl border transition-all duration-200 text-left
                ${isSelected
                  ? 'bg-primary/10 border-primary/30 ring-2 ring-primary/20 shadow-md'
                  : status?.status === 'success'
                    ? 'bg-accent/10 border-accent/30 shadow-sm'
                    : status?.status === 'error'
                      ? 'bg-warning/10 border-warning/30 shadow-sm'
                      : 'bg-card/30 border-border/50 hover:border-primary/30 hover:bg-card/50 hover:shadow-sm'
                }
                ${isDownloading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
              `}
              style={{
                animation: `fadeInUp 0.3s ease-out ${index * 20}ms both`
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <Checkbox checked={isSelected} disabled={isDownloading} onCheckedChange={() => {}} />
                {status && (
                  <div>
                    {status.status === 'downloading' && (
                      <Icon name="loader" className="h-4 w-4 text-primary animate-spin" />
                    )}
                    {status.status === 'success' && (
                      <Icon name="check-circle-2" className="h-4 w-4 text-accent" />
                    )}
                    {status.status === 'error' && (
                      <Icon name="x-circle" className="h-4 w-4 text-warning" />
                    )}
                  </div>
                )}
              </div>

              <div className="font-medium text-foreground mb-1">{district.name}</div>
              <div className="text-xs text-muted-foreground font-mono">{district.code}</div>

              {status && status.status === 'success' && (
                <div className="mt-2 text-xs text-accent">
                  ✓ {status.totalFound?.toLocaleString()}개 조례
                  {status.ordinanceCount! > 0 && ` (신규 ${status.ordinanceCount})`}
                </div>
              )}

              {status && status.status === 'error' && (
                <div className="mt-2 text-xs text-warning truncate">
                  ✗ {status.error}
                </div>
              )}

              {!status && districtDownloadDates.has(district.name) && (
                <div className="mt-2 text-xs text-muted-foreground">
                  최근: {formatDate(districtDownloadDates.get(district.name)!)}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Info Card */}
      <div className="p-4 bg-muted/30 backdrop-blur-sm rounded-xl border border-border/50">
        <div className="text-sm text-muted-foreground space-y-1">
          <div>• law.go.kr API에서 조례 다운로드 (<strong>{PARALLEL_LIMIT}개 병렬 처리</strong>)</div>
          <div>• 저장 경로: <code className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs">data/parsed-ordinances/(자치구명)/</code></div>
          <div>• 전체 다운로드 약 {Math.ceil(SEOUL_DISTRICTS.length / PARALLEL_LIMIT)}~{Math.ceil(SEOUL_DISTRICTS.length / PARALLEL_LIMIT * 2)}분 소요 (약 12,000개 조례)</div>
          <div>• RAG 청킹을 위한 메타데이터 포함</div>
          <div>• 중지 버튼으로 다운로드 강제 종료 가능</div>
        </div>
      </div>

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
