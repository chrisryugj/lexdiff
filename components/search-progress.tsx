/**
 * search-progress.tsx
 *
 * 검색 진행 상태 표시 컴포넌트
 * - 법령 검색: 검색 → 파싱 → 렌더링
 * - AI 검색: 연결 → 검색 → 스트리밍 → 추출
 */

import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"

export type LawSearchStage = 'searching' | 'parsing' | 'rendering' | 'complete'
export type AISearchStage = 'connecting' | 'searching' | 'streaming' | 'extracting' | 'complete'

interface SearchProgressProps {
  mode: 'law' | 'ai'
  stage: LawSearchStage | AISearchStage
  progress?: number // 0-100
  streamingText?: string // AI 스트리밍 중인 텍스트 샘플
}

const LAW_STAGES: Record<LawSearchStage, { label: string; iconName: string; progress: number }> = {
  searching: { label: '법령 검색 중', iconName: 'search', progress: 20 },
  parsing: { label: '조문 파싱 중', iconName: 'file-text', progress: 60 },
  rendering: { label: '화면 렌더링 중', iconName: 'sparkles', progress: 90 },
  complete: { label: '완료', iconName: 'check-circle-2', progress: 100 }
}

const AI_STAGES: Record<AISearchStage, { label: string; iconName: string; progress: number }> = {
  connecting: { label: 'AI 연결 중', iconName: 'loader', progress: 10 },
  searching: { label: 'File Search 검색 중', iconName: 'search', progress: 30 },
  streaming: { label: '답변 생성 중', iconName: 'sparkles', progress: 50 },
  extracting: { label: '인용 조문 추출 중', iconName: 'file-text', progress: 95 },
  complete: { label: '완료', iconName: 'check-circle-2', progress: 100 }
}

export function SearchProgress({ mode, stage, progress, streamingText }: SearchProgressProps) {
  const stages = mode === 'law' ? LAW_STAGES : AI_STAGES
  const currentStage = stages[stage as keyof typeof stages]

  if (!currentStage) {
    return null
  }

  const iconName = currentStage.iconName
  const displayProgress = progress ?? currentStage.progress
  const isComplete = stage === 'complete'

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      {/* 진행 바 */}
      <div className="relative h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full transition-all duration-500 ease-out",
            isComplete ? "bg-green-500" : "bg-primary",
            !isComplete && "animate-pulse"
          )}
          style={{ width: `${displayProgress}%` }}
        />
      </div>

      {/* 상태 표시 */}
      <div className="flex items-center gap-3 text-sm">
        <Icon
          name={iconName}
          className={cn(
            "h-5 w-5",
            isComplete ? "text-green-500" : "text-primary",
            !isComplete && stage === 'connecting' && "animate-spin"
          )}
        />
        <span className="font-medium">{currentStage.label}</span>
        <span className="text-muted-foreground ml-auto">{displayProgress}%</span>
      </div>

      {/* AI 스트리밍 텍스트 미리보기 */}
      {mode === 'ai' && stage === 'streaming' && streamingText && (
        <div className="text-xs text-muted-foreground border-l-2 border-primary pl-3 py-2 max-h-20 overflow-hidden">
          <p className="line-clamp-3">{streamingText}</p>
        </div>
      )}

      {/* 완료 메시지 */}
      {isComplete && (
        <div className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
          <Icon name="check-circle-2" className="h-4 w-4" />
          <span>검색이 완료되었습니다</span>
        </div>
      )}
    </div>
  )
}
