/**
 * Ordinance Download Panel - LexDiff Professional Edition
 * Refined interface for Seoul ordinance batch downloads
 */

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Download, CheckCircle2, XCircle, Play } from 'lucide-react'

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
  error?: string
  startTime?: number
}

export function OrdinanceDownloadPanel() {
  const [selectedDistricts, setSelectedDistricts] = useState<Set<string>>(new Set())
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<Map<string, DistrictStatus>>(new Map())
  const [currentDistrict, setCurrentDistrict] = useState<string | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)

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

  async function downloadDistrict(districtCode: string, districtName: string) {
    const startTime = Date.now()
    setCurrentDistrict(districtName)

    setDownloadProgress(
      new Map(
        downloadProgress.set(districtCode, {
          code: districtCode,
          name: districtName,
          status: 'downloading',
          startTime
        })
      )
    )

    try {
      const response = await fetch('/api/admin/download-ordinances', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          districtCode,
          districtName,
          delay: 1000
        })
      })

      const result = await response.json()

      if (result.success) {
        setDownloadProgress(
          new Map(
            downloadProgress.set(districtCode, {
              code: districtCode,
              name: districtName,
              status: 'success',
              ordinanceCount: result.ordinanceCount || 0,
              startTime
            })
          )
        )
      } else {
        setDownloadProgress(
          new Map(
            downloadProgress.set(districtCode, {
              code: districtCode,
              name: districtName,
              status: 'error',
              error: result.error || '다운로드 실패',
              startTime
            })
          )
        )
      }
    } catch (error: any) {
      setDownloadProgress(
        new Map(
          downloadProgress.set(districtCode, {
            code: districtCode,
            name: districtName,
            status: 'error',
            error: error.message,
            startTime
          })
        )
      )
    }
  }

  async function startBatchDownload() {
    if (selectedDistricts.size === 0) {
      alert('다운로드할 자치구를 선택해주세요')
      return
    }

    if (
      !confirm(
        `선택한 ${selectedDistricts.size}개 자치구의 조례를 다운로드하시겠습니까?\n\n예상 소요 시간: ${Math.ceil(selectedDistricts.size * 2)}분`
      )
    ) {
      return
    }

    setIsDownloading(true)
    setDownloadProgress(new Map())
    setElapsedTime(0)

    const startTime = Date.now()
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)

    for (const code of selectedDistricts) {
      const district = SEOUL_DISTRICTS.find((d) => d.code === code)
      if (!district) continue

      await downloadDistrict(district.code, district.name)
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    clearInterval(timer)
    setIsDownloading(false)
    setCurrentDistrict(null)

    const successCount = Array.from(downloadProgress.values()).filter((d) => d.status === 'success').length
    const errorCount = Array.from(downloadProgress.values()).filter((d) => d.status === 'error').length
    alert(`✅ 조례 다운로드 완료\n\n성공: ${successCount}개 자치구\n실패: ${errorCount}개 자치구`)
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

  return (
    <div className="space-y-6">
      {/* Progress Monitor */}
      {isDownloading && (
        <div className="relative overflow-hidden p-4 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-xl backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 shadow-sm">
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
              </div>
              <div>
                <div className="font-medium text-foreground">처리 중: {currentDistrict || '대기 중'}</div>
                <div className="text-sm text-muted-foreground">{formatTime(elapsedTime)} 경과</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-foreground">{Math.round(progressPercent)}%</div>
              <div className="text-sm text-muted-foreground">{completedCount} / {selectedDistricts.size}</div>
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
            약 {selectedDistricts.size * 80}개 조례 · 약 {Math.ceil(selectedDistricts.size * 2)}분 소요
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
              <Loader2 className="w-4 h-4 animate-spin" />
              처리 중
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
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
            <button
              key={district.code}
              onClick={() => !isDownloading && toggleDistrict(district.code)}
              disabled={isDownloading}
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
                <Checkbox checked={isSelected} disabled={isDownloading} />
                {status && (
                  <div>
                    {status.status === 'downloading' && (
                      <Loader2 className="h-4 w-4 text-primary animate-spin" />
                    )}
                    {status.status === 'success' && (
                      <CheckCircle2 className="h-4 w-4 text-accent" />
                    )}
                    {status.status === 'error' && (
                      <XCircle className="h-4 w-4 text-warning" />
                    )}
                  </div>
                )}
              </div>

              <div className="font-medium text-foreground mb-1">{district.name}</div>
              <div className="text-xs text-muted-foreground font-mono">{district.code}</div>

              {status && status.status === 'success' && (
                <div className="mt-2 text-xs text-accent">
                  ✓ {status.ordinanceCount}개 조례
                </div>
              )}

              {status && status.status === 'error' && (
                <div className="mt-2 text-xs text-warning truncate">
                  ✗ {status.error}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Info Card */}
      <div className="p-4 bg-muted/30 backdrop-blur-sm rounded-xl border border-border/50">
        <div className="text-sm text-muted-foreground space-y-1">
          <div>• law.go.kr API에서 조례 다운로드</div>
          <div>• 저장 경로: <code className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs">data/parsed-ordinances/(자치구명)/</code></div>
          <div>• 자치구당 약 2분 소요 (API 속도 제한)</div>
          <div>• RAG 청킹을 위한 메타데이터 포함</div>
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
