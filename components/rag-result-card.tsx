/**
 * RAG Result Card Component
 *
 * 검색된 조문을 카드 형태로 표시
 */

'use client'

import { BookOpen, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface RagResultCardProps {
  result: {
    lawName: string
    articleDisplay: string
    articleTitle: string | null
    articleContent: string
    similarity: number
  }
  onClick?: () => void
  isHighlighted?: boolean
}

export function RagResultCard({ result, onClick, isHighlighted = false }: RagResultCardProps) {
  const { lawName, articleDisplay, articleTitle, articleContent, similarity } = result

  // 유사도에 따른 색상
  const getSimilarityColor = (score: number) => {
    if (score >= 0.85) return 'text-green-600 bg-green-50'
    if (score >= 0.7) return 'text-yellow-600 bg-yellow-50'
    return 'text-gray-600 bg-gray-50'
  }

  // 유사도 라벨
  const getSimilarityLabel = (score: number) => {
    if (score >= 0.85) return '매우 관련성 높음'
    if (score >= 0.7) return '관련성 있음'
    return '관련성 낮음'
  }

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md',
        isHighlighted && 'ring-2 ring-primary'
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              {lawName} {articleDisplay}
            </CardTitle>
            {articleTitle && (
              <p className="text-sm text-muted-foreground mt-1">{articleTitle}</p>
            )}
          </div>

          {/* 유사도 점수 */}
          <div className="flex flex-col items-end gap-1">
            <Badge className={getSimilarityColor(similarity)}>
              <TrendingUp className="w-3 h-3 mr-1" />
              {(similarity * 100).toFixed(1)}%
            </Badge>
            <span className="text-xs text-muted-foreground">{getSimilarityLabel(similarity)}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* 조문 내용 (일부만 표시) */}
        <p className="text-sm text-foreground line-clamp-3">{articleContent}</p>

        {/* 더보기 힌트 */}
        {articleContent.length > 150 && (
          <p className="text-xs text-primary mt-2">클릭하여 전체 내용 보기 →</p>
        )}
      </CardContent>
    </Card>
  )
}
