/**
 * RAG Search Panel Component
 *
 * 자연어 질문 입력 및 검색 옵션 설정 UI
 */

'use client'

import { useState } from 'react'
import { Search, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

export interface SearchOptions {
  limit: number
  threshold: number
  lawFilter?: string
}

interface RagSearchPanelProps {
  onSearch: (query: string, options: SearchOptions) => void
  isLoading: boolean
  error: string | null
}

export function RagSearchPanel({ onSearch, isLoading, error }: RagSearchPanelProps) {
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(5)
  const [threshold, setThreshold] = useState(0.7)
  const [lawFilter, setLawFilter] = useState('')
  const [showOptions, setShowOptions] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim().length === 0) return

    onSearch(query, {
      limit,
      threshold,
      lawFilter: lawFilter.trim() || undefined,
    })
  }

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-card">
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* 질문 입력 */}
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              type="text"
              placeholder="법령에 대해 질문하세요 (예: 수출통관 시 필요한 서류는?)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={isLoading}
              className="text-base"
            />
          </div>
          <Button type="submit" disabled={isLoading || query.trim().length === 0}>
            {isLoading ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                검색 중...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                검색
              </>
            )}
          </Button>
        </div>

        {/* 검색 옵션 (토글) */}
        <Collapsible open={showOptions} onOpenChange={setShowOptions}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full">
              <Settings className="w-4 h-4 mr-2" />
              {showOptions ? '옵션 숨기기' : '검색 옵션'}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            {/* 결과 개수 */}
            <div className="space-y-2">
              <Label>결과 개수: {limit}개</Label>
              <Slider
                value={[limit]}
                onValueChange={([value]) => setLimit(value)}
                min={1}
                max={10}
                step={1}
                disabled={isLoading}
              />
            </div>

            {/* 유사도 임계값 */}
            <div className="space-y-2">
              <Label>유사도 임계값: {(threshold * 100).toFixed(0)}%</Label>
              <Slider
                value={[threshold * 100]}
                onValueChange={([value]) => setThreshold(value / 100)}
                min={50}
                max={95}
                step={5}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                높을수록 더 관련성 높은 결과만 표시됩니다
              </p>
            </div>

            {/* 법령 필터 */}
            <div className="space-y-2">
              <Label>특정 법령으로 제한 (선택)</Label>
              <Input
                type="text"
                placeholder="예: 관세법"
                value={lawFilter}
                onChange={(e) => setLawFilter(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* 에러 메시지 */}
        {error && (
          <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
            ❌ {error}
          </div>
        )}
      </form>

      {/* 사용 예시 */}
      {!isLoading && query.length === 0 && (
        <div className="text-sm text-muted-foreground border-t pt-3">
          <p className="font-medium mb-2">💡 질문 예시:</p>
          <ul className="space-y-1 ml-4">
            <li>• 수출통관 시 필요한 서류는?</li>
            <li>• 청년 창업 지원 내용은 무엇인가요?</li>
            <li>• 관세 환급 신청 조건은?</li>
          </ul>
        </div>
      )}
    </div>
  )
}
