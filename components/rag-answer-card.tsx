/**
 * RAG Answer Card Component
 *
 * AI가 생성한 답변을 표시
 */

'use client'

import { Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface RagAnswerCardProps {
  answer: {
    content: string
    citations: Array<{
      lawName: string
      articleDisplay: string
      relevance: 'high' | 'medium' | 'low'
    }>
    confidence: 'high' | 'medium' | 'low'
  }
  onCitationClick?: (lawName: string, articleDisplay: string) => void
}

export function RagAnswerCard({ answer, onCitationClick }: RagAnswerCardProps) {
  const { content, citations, confidence } = answer

  // 신뢰도 아이콘 및 색상
  const getConfidenceDisplay = (level: string) => {
    switch (level) {
      case 'high':
        return {
          icon: <CheckCircle2 className="w-4 h-4" />,
          label: '높은 신뢰도',
          className: 'text-green-600 bg-green-50',
        }
      case 'medium':
        return {
          icon: <AlertCircle className="w-4 h-4" />,
          label: '중간 신뢰도',
          className: 'text-yellow-600 bg-yellow-50',
        }
      default:
        return {
          icon: <AlertCircle className="w-4 h-4" />,
          label: '낮은 신뢰도',
          className: 'text-gray-600 bg-gray-50',
        }
    }
  }

  const confidenceDisplay = getConfidenceDisplay(confidence)

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI 답변
          </CardTitle>
          <Badge className={confidenceDisplay.className}>
            {confidenceDisplay.icon}
            <span className="ml-1">{confidenceDisplay.label}</span>
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* AI 답변 내용 */}
        <div className="prose prose-sm max-w-none">
          <div className="whitespace-pre-wrap text-foreground">{content}</div>
        </div>

        {/* 인용 조문 */}
        {citations.length > 0 && (
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-2">📚 참고 조문:</p>
            <div className="flex flex-wrap gap-2">
              {citations.map((citation, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => onCitationClick?.(citation.lawName, citation.articleDisplay)}
                  className={cn(
                    'text-xs',
                    citation.relevance === 'high' && 'border-primary text-primary'
                  )}
                >
                  {citation.lawName} {citation.articleDisplay}
                  {citation.relevance === 'high' && ' ★'}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* 주의사항 */}
        <div className="text-xs text-muted-foreground bg-muted p-3 rounded">
          ⚠️ 이 답변은 AI가 생성한 것으로, 법적 자문을 대체할 수 없습니다. 정확한 정보는
          원문을 확인하거나 전문가와 상담하시기 바랍니다.
        </div>
      </CardContent>
    </Card>
  )
}
