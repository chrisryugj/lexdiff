'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, BookOpen, ExternalLink } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

interface Citation {
  lawName: string
  articleNumber: string
  chunkText: string
  uri?: string
}

interface FileSearchAnswerDisplayProps {
  query: string
  onCitationClick?: (lawName: string, articleNumber: string) => void
  onReset?: () => void
}

export function FileSearchAnswerDisplay({
  query,
  onCitationClick,
  onReset
}: FileSearchAnswerDisplayProps) {
  const [answer, setAnswer] = useState('')
  const [citations, setCitations] = useState<Citation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isCancelled = false

    const fetchAnswer = async () => {
      setIsLoading(true)
      setError(null)
      setAnswer('')
      setCitations([])

      try {
        const response = await fetch('/api/file-search-rag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        })

        if (!response.ok) {
          throw new Error('File Search RAG 요청 실패')
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('스트림을 읽을 수 없습니다')
        }

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done || isCancelled) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') {
                setIsLoading(false)
                continue
              }

              try {
                const parsed = JSON.parse(data)

                if (parsed.type === 'text') {
                  setAnswer(prev => prev + parsed.text)
                } else if (parsed.type === 'citations') {
                  setCitations(parsed.citations || [])
                }
              } catch (e) {
                console.error('SSE 파싱 오류:', e)
              }
            }
          }
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : '알 수 없는 오류')
          setIsLoading(false)
        }
      }
    }

    fetchAnswer()

    return () => {
      isCancelled = true
    }
  }, [query])

  if (error) {
    return (
      <Card className="p-6 border-destructive">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h3 className="font-semibold text-destructive mb-2">오류 발생</h3>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          {onReset && (
            <Button variant="outline" size="sm" onClick={onReset}>
              다시 검색
            </Button>
          )}
        </div>
      </Card>
    )
  }

  return (
    <div className="w-full max-w-4xl space-y-4">
      {/* 질문 표시 */}
      <Card className="p-4 bg-muted/50">
        <div className="flex items-start gap-3">
          <BookOpen className="w-5 h-5 text-primary mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground mb-1">질문</p>
            <p className="text-base">{query}</p>
          </div>
          {onReset && !isLoading && (
            <Button variant="ghost" size="sm" onClick={onReset}>
              새 검색
            </Button>
          )}
        </div>
      </Card>

      {/* AI 답변 */}
      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
          AI 법령 해설
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
        </h3>

        {answer ? (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown>{answer}</ReactMarkdown>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>AI가 답변을 생성하고 있습니다...</span>
          </div>
        )}
      </Card>

      {/* 참고 법령 (Citations) */}
      {citations.length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold text-lg mb-4">참고 법령</h3>
          <div className="space-y-3">
            {citations.map((citation, index) => (
              <div
                key={index}
                className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1">
                    <h4 className="font-medium text-sm mb-1">
                      {citation.lawName || '알 수 없는 법령'}
                    </h4>
                    {citation.articleNumber && (
                      <p className="text-xs text-muted-foreground">
                        {citation.articleNumber}
                      </p>
                    )}
                  </div>
                  {onCitationClick && citation.lawName && citation.articleNumber && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onCitationClick(citation.lawName, citation.articleNumber)}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      조문 보기
                    </Button>
                  )}
                </div>
                {citation.chunkText && (
                  <p className="text-xs text-muted-foreground line-clamp-3 mt-2">
                    {citation.chunkText.substring(0, 200)}...
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 주의사항 */}
      <Card className="p-4 bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
        <p className="text-xs text-yellow-800 dark:text-yellow-200">
          ⚠️ 본 답변은 AI가 생성한 참고용 정보이며, 법률 자문이 아닙니다.
          정확한 법률 해석은 전문가와 상담하시기 바랍니다.
        </p>
      </Card>
    </div>
  )
}
