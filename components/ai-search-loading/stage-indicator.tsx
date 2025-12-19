/**
 * ai-search-loading/stage-indicator.tsx
 *
 * 6단계 AI 검색 프로그레스 표시 컴포넌트
 * - 단계별 아이콘 + 레이블
 * - 현재 단계 하이라이트
 * - 프로그레스 바
 */

"use client"

import { Icon } from "@/components/ui/icon"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { AI_STAGES, type AISearchStage } from "../search-result-view/types"

interface StageIndicatorProps {
  /** 현재 단계 */
  currentStage: AISearchStage
  /** 진행률 (0-100) */
  progress: number
  /** 추가 클래스명 */
  className?: string
  /** 모바일에서 간략화 (현재 단계만 표시) */
  compact?: boolean
}

const STAGE_MESSAGES: Record<AISearchStage, string> = {
  analyzing: "질문을 분석하고 있습니다...",
  optimizing: "검색어를 최적화하고 있습니다...",
  searching: "법령 데이터베이스에서 검색 중입니다...",
  streaming: "AI가 답변을 생성하고 있습니다...",
  extracting: "관련 조문을 추출하고 있습니다...",
  complete: "완료되었습니다!",
}

export function StageIndicator({
  currentStage,
  progress,
  className,
  compact = false,
}: StageIndicatorProps) {
  const currentStageIndex = AI_STAGES.findIndex((s) => s.key === currentStage)

  // 컴팩트 모드 (모바일)
  if (compact) {
    const current = AI_STAGES[currentStageIndex]
    return (
      <div className={cn("space-y-3", className)}>
        <div className="flex items-center gap-2 text-sm">
          <Icon
            name={current?.icon || "loading-03"}
            className={cn(
              "h-5 w-5",
              currentStage === "complete"
                ? "text-green-500"
                : "text-primary animate-pulse"
            )}
          />
          <span className="text-muted-foreground">
            {current?.label || "처리 중"}
          </span>
          <span className="ml-auto font-medium">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>
    )
  }

  // 풀 모드 (데스크톱)
  return (
    <div className={cn("space-y-4", className)}>
      {/* 단계 표시 */}
      <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2">
        {AI_STAGES.slice(0, -1).map((stage, index) => {
          const isCompleted = index < currentStageIndex
          const isCurrent = index === currentStageIndex
          const isPending = index > currentStageIndex

          return (
            <div key={stage.key} className="flex items-center flex-shrink-0">
              {/* 단계 아이콘 + 레이블 */}
              <div
                className={cn(
                  "flex flex-col items-center gap-1 px-2 py-1 rounded-lg transition-colors",
                  isCurrent && "bg-primary/10"
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full transition-all",
                    isCompleted && "bg-green-500/20 text-green-500",
                    isCurrent && "bg-primary/20 text-primary",
                    isPending && "bg-muted text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <Icon name="checkmark-circle-02" className="h-5 w-5" />
                  ) : isCurrent ? (
                    <Icon
                      name={stage.icon}
                      className="h-5 w-5 animate-pulse"
                    />
                  ) : (
                    <Icon name={stage.icon} className="h-4 w-4 opacity-50" />
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs whitespace-nowrap",
                    isCompleted && "text-green-500",
                    isCurrent && "text-primary font-medium",
                    isPending && "text-muted-foreground"
                  )}
                >
                  {stage.label}
                </span>
              </div>

              {/* 연결선 */}
              {index < AI_STAGES.length - 2 && (
                <div
                  className={cn(
                    "w-4 h-0.5 mx-1 flex-shrink-0",
                    isCompleted ? "bg-green-500" : "bg-muted"
                  )}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* 프로그레스 바 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {STAGE_MESSAGES[currentStage]}
          </span>
          <span className="font-medium tabular-nums">
            {Math.round(progress)}%
          </span>
        </div>
        <Progress value={progress} className="h-2.5" />
      </div>
    </div>
  )
}
