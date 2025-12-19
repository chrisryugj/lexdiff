'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Icon } from '@/components/ui/icon'

interface RagSearchInputProps {
  onSearch: (query: string) => void
  isLoading?: boolean
}

export function RagSearchInput({ onSearch, isLoading }: RagSearchInputProps) {
  const [query, setQuery] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim() && !isLoading) {
      onSearch(query.trim())
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-3xl">
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="자연어로 질문하세요 (예: 관세법상 신고납부 제도의 요건은?)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={isLoading}
          className="flex-1"
        />
        <Button type="submit" disabled={isLoading || !query.trim()}>
          {isLoading ? (
            <>
              <Icon name="loader" className="w-4 h-4 mr-2 animate-spin" />
              검색 중
            </>
          ) : (
            <>
              <Icon name="search" className="w-4 h-4 mr-2" />
              검색
            </>
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        💡 File Search RAG를 사용하여 업로드된 법령에서 답변을 찾습니다
      </p>
    </form>
  )
}
