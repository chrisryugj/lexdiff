/**
 * Batch Law Parser Panel Component
 * Bulk download multiple laws at once with paste support
 */

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Icon } from '@/components/ui/icon'

interface ParseResult {
  lawName: string
  status: 'pending' | 'searching' | 'selecting' | 'parsing' | 'saving' | 'success' | 'error'
  lawId?: string
  articleCount?: number
  error?: string
  candidates?: Array<{
    lawId: string
    lawName: string
    effectiveDate: string
    revisionType?: string
  }>
  selectedCandidate?: string
}

/**
 * Find base law candidate when candidates are law/시행령/시행규칙 trio
 * Returns the base law (not 시행령 or 시행규칙) if applicable
 */
function findBaseLawCandidate(
  candidates: Array<{ lawId: string; lawName: string; effectiveDate: string; revisionType?: string }>,
  searchQuery: string
): { lawId: string; lawName: string } | null {
  // Only auto-select if candidates <= 3 and query doesn't include 시행령/시행규칙
  if (candidates.length > 3) return null
  if (/시행령|시행규칙/.test(searchQuery)) return null

  // Check if all candidates match the pattern: 법률, 법률 시행령, 법률 시행규칙
  const baseLaw = candidates.find((c) => !c.lawName.endsWith('시행령') && !c.lawName.endsWith('시행규칙'))
  const hasEnforcement = candidates.some((c) => c.lawName.endsWith('시행령'))
  const hasRule = candidates.some((c) => c.lawName.endsWith('시행규칙'))

  // If we have a base law and at least one enforcement/rule variant, auto-select base law
  if (baseLaw && (hasEnforcement || hasRule)) {
    return { lawId: baseLaw.lawId, lawName: baseLaw.lawName }
  }

  return null
}

export function BatchLawParserPanel() {
  const [inputText, setInputText] = useState('')
  const [results, setResults] = useState<ParseResult[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)

  async function handleBatchParse() {
    // Parse input text (one law name per line)
    const lawNames = inputText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    if (lawNames.length === 0) {
      alert('법령명을 입력해주세요 (한 줄에 하나씩)')
      return
    }

    // Initialize results
    const initialResults: ParseResult[] = lawNames.map((name) => ({
      lawName: name,
      status: 'pending'
    }))

    setResults(initialResults)
    setIsProcessing(true)
    setCurrentIndex(0)

    // Process each law sequentially
    for (let i = 0; i < lawNames.length; i++) {
      setCurrentIndex(i)
      await processSingleLaw(lawNames[i], i)
      // Small delay between requests
      if (i < lawNames.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    setIsProcessing(false)
    alert('✅ 일괄 다운로드 완료!')
  }

  async function processSingleLaw(lawName: string, index: number) {
    // Update status to searching
    updateResult(index, { status: 'searching' })

    try {
      // Call parse API
      const response = await fetch('/api/admin/parse-law', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: lawName })
      })

      const data = await response.json()

      if (data.success) {
        // Direct match - proceed to save
        updateResult(index, { status: 'parsing', lawId: data.law.lawId, articleCount: data.law.articleCount })

        // Auto-save
        const saveSuccess = await saveLaw(data.law)
        if (saveSuccess) {
          updateResult(index, { status: 'success' })
        } else {
          updateResult(index, { status: 'error', error: '저장 실패' })
        }
      } else if (data.candidates && data.candidates.length > 0) {
        // Check if candidates are exactly "법률/시행령/시행규칙" trio
        // In that case, auto-select the base law (not 시행령/시행규칙)
        const baseLawCandidate = findBaseLawCandidate(data.candidates, lawName)

        if (baseLawCandidate) {
          // Auto-select the base law
          console.log(`[BatchLawParser] Auto-selecting base law: ${baseLawCandidate.lawName}`)
          await handleSelectCandidate(index, baseLawCandidate.lawId)
        } else {
          // Multiple candidates - needs manual selection
          updateResult(index, {
            status: 'selecting',
            candidates: data.candidates
          })
        }
      } else {
        updateResult(index, { status: 'error', error: data.error || '검색 결과 없음' })
      }
    } catch (error: any) {
      updateResult(index, { status: 'error', error: error.message })
    }
  }

  async function handleSelectCandidate(index: number, lawId: string) {
    updateResult(index, { status: 'parsing', selectedCandidate: lawId })

    try {
      // Parse selected candidate
      const response = await fetch('/api/admin/parse-law', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: lawId })
      })

      const data = await response.json()

      if (data.success) {
        updateResult(index, { lawId: data.law.lawId, articleCount: data.law.articleCount })

        // Auto-save
        const saveSuccess = await saveLaw(data.law)
        if (saveSuccess) {
          updateResult(index, { status: 'success' })
        } else {
          updateResult(index, { status: 'error', error: '저장 실패' })
        }
      } else {
        updateResult(index, { status: 'error', error: data.error || '파싱 실패' })
      }
    } catch (error: any) {
      updateResult(index, { status: 'error', error: error.message })
    }
  }

  async function saveLaw(law: any): Promise<boolean> {
    try {
      const response = await fetch('/api/admin/save-parsed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lawId: law.lawId,
          markdown: law.markdown,
          metadata: {
            lawId: law.lawId,
            lawName: law.lawName,
            effectiveDate: law.effectiveDate,
            promulgationDate: law.promulgationDate || '',
            promulgationNumber: law.promulgationNumber || '',
            revisionType: law.revisionType || '',
            articleCount: law.articleCount,
            totalCharacters: law.totalCharacters,
            fetchedAt: new Date().toISOString()
          }
        })
      })

      const data = await response.json()
      return data.success
    } catch (error) {
      return false
    }
  }

  function updateResult(index: number, updates: Partial<ParseResult>) {
    setResults((prev) => prev.map((r, i) => (i === index ? { ...r, ...updates } : r)))
  }

  function getStatusIcon(status: ParseResult['status']) {
    switch (status) {
      case 'pending':
        return <Icon name="alert-circle" className="w-4 h-4 text-muted-foreground" />
      case 'searching':
      case 'parsing':
      case 'saving':
        return <Icon name="loader" className="w-4 h-4 text-primary animate-spin" />
      case 'selecting':
        return <Icon name="alert-circle" className="w-4 h-4 text-warning" />
      case 'success':
        return <Icon name="check-circle-2" className="w-4 h-4 text-accent" />
      case 'error':
        return <Icon name="x-circle" className="w-4 h-4 text-destructive" />
    }
  }

  function getStatusText(status: ParseResult['status']) {
    switch (status) {
      case 'pending':
        return '대기'
      case 'searching':
        return '검색 중'
      case 'selecting':
        return '선택 필요'
      case 'parsing':
        return '파싱 중'
      case 'saving':
        return '저장 중'
      case 'success':
        return '완료'
      case 'error':
        return '오류'
    }
  }

  const lawCount = inputText.split('\n').filter((l) => l.trim()).length
  const successCount = results.filter((r) => r.status === 'success').length
  const errorCount = results.filter((r) => r.status === 'error').length
  const progressPercent = results.length > 0 ? (successCount / results.length) * 100 : 0

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-sm text-muted-foreground mb-1">입력된 법령</div>
          <div className="text-3xl font-bold text-foreground">{lawCount}</div>
        </div>
        <div className="p-4 bg-accent/10 backdrop-blur-sm rounded-xl border border-accent/20 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-sm text-accent mb-1">완료</div>
          <div className="text-3xl font-bold text-accent">{successCount}</div>
        </div>
        <div className="p-4 bg-warning/10 backdrop-blur-sm rounded-xl border border-warning/20 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-sm text-warning mb-1">오류</div>
          <div className="text-3xl font-bold text-warning">{errorCount}</div>
        </div>
      </div>

      {/* Input Area */}
      <div className="space-y-3">
        <Textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="법령명을 입력하세요 (한 줄에 하나씩)&#10;&#10;예시:&#10;관세법&#10;소득세법&#10;부가가치세법&#10;법인세법"
          className="min-h-[180px] bg-card/50 backdrop-blur-sm border-border/50 text-foreground font-mono"
          disabled={isProcessing}
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {lawCount}개 법령
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => setInputText('')}
              disabled={isProcessing || !inputText}
              variant="outline"
              size="default"
              className="gap-2 h-10"
            >
              <Icon name="rotate-ccw" className="w-4 h-4" />
              초기화
            </Button>
            <Button
              onClick={handleBatchParse}
              disabled={isProcessing || !inputText.trim()}
              className="gap-2 shadow-lg shadow-primary/20 h-10"
              size="default"
            >
              {isProcessing ? (
                <>
                  <Icon name="loader" className="w-4 h-4 animate-spin" />
                  처리 중
                </>
              ) : (
                <>
                  <Icon name="download" className="w-4 h-4" />
                  다운로드
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Progress */}
      {isProcessing && (
        <div className="relative overflow-hidden p-4 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-xl backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-muted-foreground">
              {currentIndex + 1} / {results.length} 처리 중
            </div>
            <div className="text-2xl font-bold text-foreground">{Math.round(progressPercent)}%</div>
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

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-foreground">처리 결과</h3>
            <div className="text-sm text-muted-foreground">
              {successCount} / {results.length} 완료
            </div>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {results.map((result, index) => (
              <div
                key={index}
                className={`p-4 rounded-xl border transition-all ${
                  index === currentIndex && isProcessing
                    ? 'bg-primary/10 border-primary/30 ring-2 ring-primary/20'
                    : 'bg-card/30 border-border/50 hover:bg-card/50'
                }`}
                style={{
                  animation: `fadeInUp 0.3s ease-out ${index * 30}ms both`
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Status Icon */}
                  <div className="mt-0.5">{getStatusIcon(result.status)}</div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground truncate">{result.lawName}</span>
                      <span className="text-xs text-muted-foreground">{getStatusText(result.status)}</span>
                    </div>

                    {result.articleCount && (
                      <p className="text-xs text-muted-foreground mt-1">{result.articleCount}개 조문</p>
                    )}

                    {result.error && <p className="text-xs text-destructive mt-1">⚠ {result.error}</p>}

                    {/* Candidates Selection */}
                    {result.status === 'selecting' && result.candidates && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs text-warning">{result.candidates.length}개 후보 - 선택하세요:</p>
                        <div className="space-y-1.5">
                          {result.candidates.map((candidate) => (
                            <button
                              key={candidate.lawId}
                              onClick={() => handleSelectCandidate(index, candidate.lawId)}
                              className="w-full p-3 bg-card/50 hover:bg-card backdrop-blur-sm border border-border/50 hover:border-primary/30 rounded-lg text-left text-xs transition-all"
                            >
                              <div className="text-foreground font-medium">{candidate.lawName}</div>
                              <div className="text-muted-foreground mt-1">
                                {candidate.lawId}
                                {candidate.effectiveDate && ` · ${candidate.effectiveDate}`}
                                {candidate.revisionType && ` · ${candidate.revisionType}`}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-4 bg-muted/30 backdrop-blur-sm border border-border/50 rounded-xl">
        <div className="text-sm text-muted-foreground space-y-1">
          <div>• 엑셀에서 법령명 목록을 복사해서 붙여넣기 가능</div>
          <div>• 정확히 일치하는 법령은 자동으로 다운로드됨</div>
          <div>• 여러 후보가 있으면 선택 UI가 표시됨</div>
          <div>• 다운로드된 법령은 자동으로 로컬에 저장됨</div>
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
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  )
}
