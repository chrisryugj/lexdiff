'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type { ImpactTrackerRequest } from '@/lib/impact-tracker/types'

interface ImpactTrackerInputProps {
  onSubmit: (request: ImpactTrackerRequest) => void
  isAnalyzing: boolean
}

interface Suggestion {
  text: string
  type: string
  category: string
}

const PERIOD_PRESETS = [
  { label: '1개월', months: 1 },
  { label: '3개월', months: 3 },
  { label: '6개월', months: 6 },
]

const HISTORY_KEY = 'impact-tracker-search-history'
const MAX_HISTORY = 10

function getDateMonthsAgo(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveHistory(items: string[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)))
  } catch { /* ignore */ }
}

function addToHistory(name: string) {
  const history = loadHistory().filter(h => h !== name)
  history.unshift(name)
  saveHistory(history)
}

export function ImpactTrackerInput({ onSubmit, isAnalyzing }: ImpactTrackerInputProps) {
  const [lawInput, setLawInput] = useState('')
  const [lawNames, setLawNames] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState(getDateMonthsAgo(3))
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10))
  const [region, setRegion] = useState('')

  // 자동완성
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [isLoading, setIsLoading] = useState(false)
  const [history, setHistory] = useState<string[]>([])

  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 검색 기록 로드
  useEffect(() => {
    setHistory(loadHistory())
  }, [])

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // 자동완성 fetch (디바운스 300ms)
  const fetchSuggestions = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (abortRef.current) abortRef.current.abort()

    if (query.length < 2) {
      setSuggestions([])
      return
    }

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller
      setIsLoading(true)

      try {
        const res = await fetch(
          `/api/search-suggest?q=${encodeURIComponent(query)}&scope=all&limit=8`,
          { signal: controller.signal }
        )
        if (!res.ok) throw new Error()
        const data = await res.json()
        // 법령/조례만 필터 (AI 질문 제외)
        const lawSuggestions = (data.suggestions || []).filter(
          (s: Suggestion) => s.type === 'law'
        )
        setSuggestions(lawSuggestions)
        setSelectedIndex(-1)
      } catch {
        // abort or error - 무시
      } finally {
        setIsLoading(false)
      }
    }, 300)
  }, [])

  const handleInputChange = (value: string) => {
    setLawInput(value)
    fetchSuggestions(value)
    setShowSuggestions(true)
  }

  const selectSuggestion = (text: string) => {
    const name = text.trim()
    if (!name || lawNames.includes(name) || lawNames.length >= 5) return
    setLawNames(prev => [...prev, name])
    addToHistory(name)
    setHistory(loadHistory())
    setLawInput('')
    setSuggestions([])
    setShowSuggestions(false)
  }

  const addLaw = () => {
    const name = lawInput.trim()
    if (!name || lawNames.includes(name) || lawNames.length >= 5) return
    setLawNames(prev => [...prev, name])
    addToHistory(name)
    setHistory(loadHistory())
    setLawInput('')
    setSuggestions([])
    setShowSuggestions(false)
  }

  const removeLaw = (name: string) => {
    setLawNames(prev => prev.filter(n => n !== name))
  }

  const clearHistory = () => {
    saveHistory([])
    setHistory([])
  }

  // 드롭다운에 표시할 항목: 자동완성 결과 또는 검색 기록
  const dropdownItems = suggestions.length > 0
    ? suggestions.map(s => ({ text: s.text, category: s.category, isHistory: false }))
    : lawInput.length === 0
      ? history
          .filter(h => !lawNames.includes(h))
          .slice(0, 5)
          .map(h => ({ text: h, category: '최근 검색', isHistory: true }))
      : []

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions && dropdownItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, dropdownItems.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, -1))
        return
      }
      if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault()
        selectSuggestion(dropdownItems[selectedIndex].text)
        return
      }
      if (e.key === 'Escape') {
        setShowSuggestions(false)
        return
      }
    }
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
    <div className="bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-800 rounded-xl p-6 sm:p-8">
      <h3 className="text-xl font-bold text-[#1a2b4c] dark:text-white mb-2" style={{ fontFamily: "'RIDIBatang', serif" }}>
        법령 변경 영향 분석
      </h3>
      <p className="text-[15px] text-gray-500 dark:text-gray-400 mb-6">
        법령·조례 개정이 하위법령 및 자치법규에 미치는 영향을 양방향으로 분석합니다.
      </p>

      {/* 법령명 입력 + 자동완성 */}
      <div className="mb-4">
        <label className="text-[15px] font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
          법령명 <span className="text-gray-400 text-sm font-normal">(최대 5개)</span>
        </label>
        <div className="relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                value={lawInput}
                onChange={e => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setShowSuggestions(true)}
                placeholder="예: 건축법, 광진구 도시계획 조례"
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                disabled={isAnalyzing}
                autoComplete="off"
              />
              {isLoading && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <Icon name="loader" size={14} className="animate-spin text-gray-400" />
                </div>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={addLaw}
              disabled={!lawInput.trim() || lawNames.length >= 5 || isAnalyzing}
            >
              추가
            </Button>
          </div>

          {/* 자동완성 드롭다운 */}
          {showSuggestions && dropdownItems.length > 0 && !isAnalyzing && (
            <div
              ref={dropdownRef}
              className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto"
            >
              {/* 최근 검색 헤더 */}
              {dropdownItems[0]?.isHistory && (
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-[11px] text-gray-400">최근 검색</span>
                  <button
                    onClick={clearHistory}
                    className="text-[11px] text-gray-400 hover:text-red-500"
                  >
                    전체 삭제
                  </button>
                </div>
              )}
              {dropdownItems.map((item, idx) => (
                <button
                  key={`${item.text}-${idx}`}
                  onClick={() => selectSuggestion(item.text)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                    idx === selectedIndex
                      ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100'
                  }`}
                >
                  <Icon
                    name={item.isHistory ? 'clock' : 'scroll-text'}
                    size={14}
                    className="text-gray-400 shrink-0"
                  />
                  <span className="flex-1 truncate">{item.text}</span>
                  <span className="text-[11px] text-gray-400 shrink-0">{item.category}</span>
                </button>
              ))}
            </div>
          )}
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
        <label className="text-[15px] font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
          지역 <span className="text-gray-400 text-sm font-normal">(선택)</span>
        </label>
        <input
          type="text"
          value={region}
          onChange={e => setRegion(e.target.value)}
          placeholder="예: 광진구, 강동구"
          className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
          disabled={isAnalyzing}
        />
        <p className="text-xs text-gray-400 mt-1">상위법령 입력 시, 영향받는 조례를 이 지역 범위로 탐색합니다.</p>
      </div>

      {/* 기간 선택 */}
      <div className="mb-6">
        <label className="text-[15px] font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
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
            className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            disabled={isAnalyzing}
          />
          <span className="text-gray-400 text-xs">~</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            disabled={isAnalyzing}
          />
        </div>
      </div>

      {/* 분석 시작 */}
      <Button
        onClick={handleSubmit}
        disabled={lawNames.length === 0 || isAnalyzing}
        className="w-full bg-[#1a2b4c] hover:bg-[#1a2b4c]/90 dark:bg-[#e2a85d] dark:hover:bg-[#e2a85d]/90 dark:text-[#0c0e14]"
      >
        {isAnalyzing ? (
          <>
            <Icon name="loader" size={16} className="animate-spin" />
            분석 중...
          </>
        ) : (
          <>
            <Icon name="file-search" size={16} />
            영향 분석 시작
          </>
        )}
      </Button>
    </div>
  )
}
