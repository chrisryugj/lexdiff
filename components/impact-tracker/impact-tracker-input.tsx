'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type { ImpactTrackerRequest } from '@/lib/impact-tracker/types'

interface ImpactTrackerInputProps {
  onSubmit: (request: ImpactTrackerRequest) => void
  isAnalyzing: boolean
}

const PERIOD_PRESETS = [
  { label: '1개월', months: 1 },
  { label: '3개월', months: 3 },
  { label: '6개월', months: 6 },
]

function getDateMonthsAgo(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

export function ImpactTrackerInput({ onSubmit, isAnalyzing }: ImpactTrackerInputProps) {
  const [lawInput, setLawInput] = useState('')
  const [lawNames, setLawNames] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState(getDateMonthsAgo(3))
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10))
  const [region, setRegion] = useState('')

  const addLaw = () => {
    const name = lawInput.trim()
    if (!name || lawNames.includes(name) || lawNames.length >= 5) return
    setLawNames(prev => [...prev, name])
    setLawInput('')
  }

  const removeLaw = (name: string) => {
    setLawNames(prev => prev.filter(n => n !== name))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addLaw()
    }
  }

  const handleSubmit = () => {
    if (lawNames.length === 0) return
    onSubmit({ lawNames, dateFrom, dateTo, ...(region.trim() ? { region: region.trim() } : {}) })
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 max-w-xl mx-auto">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4" style={{ fontFamily: "'RIDIBatang', serif" }}>
        법령 영향 추적기
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        법령·조례 개정이 하위법령 및 자치법규에 미치는 영향을 양방향으로 추적합니다.
      </p>

      {/* 법령명 입력 */}
      <div className="mb-4">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
          법령명 (최대 5개)
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={lawInput}
            onChange={e => setLawInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="예: 건축법, 광진구 도시계획 조례"
            className="flex-1 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
            disabled={isAnalyzing}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={addLaw}
            disabled={!lawInput.trim() || lawNames.length >= 5 || isAnalyzing}
          >
            추가
          </Button>
        </div>
        {lawNames.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {lawNames.map(name => (
              <span
                key={name}
                className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs px-2 py-1 rounded"
              >
                {name}
                <button
                  onClick={() => removeLaw(name)}
                  className="hover:text-red-500"
                  disabled={isAnalyzing}
                >
                  <Icon name="x" size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 지역 필터 (선택) */}
      <div className="mb-4">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
          지역 <span className="text-gray-400 font-normal">(선택)</span>
        </label>
        <input
          type="text"
          value={region}
          onChange={e => setRegion(e.target.value)}
          placeholder="예: 광진구, 강동구"
          className="w-full border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
          disabled={isAnalyzing}
        />
        <p className="text-xs text-gray-400 mt-1">상위법령 입력 시, 영향받는 조례를 이 지역 범위로 탐색합니다.</p>
      </div>

      {/* 기간 선택 */}
      <div className="mb-6">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
          분석 기간
        </label>
        <div className="flex gap-2 mb-2">
          {PERIOD_PRESETS.map(preset => (
            <button
              key={preset.months}
              onClick={() => setDateFrom(getDateMonthsAgo(preset.months))}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                dateFrom === getDateMonthsAgo(preset.months)
                  ? 'bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              disabled={isAnalyzing}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            disabled={isAnalyzing}
          />
          <span className="text-gray-400 text-xs">~</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            disabled={isAnalyzing}
          />
        </div>
      </div>

      {/* 분석 시작 */}
      <Button
        onClick={handleSubmit}
        disabled={lawNames.length === 0 || isAnalyzing}
        className="w-full"
      >
        {isAnalyzing ? (
          <>
            <Icon name="loader" size={16} className="animate-spin" />
            분석 중...
          </>
        ) : (
          <>
            <Icon name="shield-alert" size={16} />
            영향 분석 시작
          </>
        )}
      </Button>
    </div>
  )
}
