/**
 * RAG Collection Progress Component
 * 데이터 수집 진행 상황을 표시
 */

import type { CollectionProgress } from '@/lib/rag-data-collector'

interface RAGCollectionProgressProps {
  progress: CollectionProgress
}

export function RAGCollectionProgress({ progress }: RAGCollectionProgressProps) {
  const percentage = progress.total > 0 ? (progress.current / progress.total) * 100 : 0

  return (
    <div className="space-y-4 p-4">
      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-gray-600">
          <span className="font-medium">데이터 수집 중...</span>
          <span>
            {progress.current} / {progress.total}
          </span>
        </div>

        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-300 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <p className="text-sm text-gray-600">{progress.message}</p>
      </div>

      {/* Collected Sources */}
      {progress.sources.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-gray-700">수집된 자료</h4>
          <div className="space-y-1">
            {progress.sources.map((source) => (
              <div key={source.id} className="flex items-start gap-2 text-sm bg-green-50 p-2 rounded">
                <span className="text-green-600 flex-shrink-0">✓</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{source.title}</p>
                  <p className="text-xs text-gray-500">
                    {source.metadata.region && `${source.metadata.region} · `}
                    {source.metadata.totalArticles}개 조문
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
