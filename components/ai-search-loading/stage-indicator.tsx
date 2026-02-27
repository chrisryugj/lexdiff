/**
 * ai-search-loading/stage-indicator.tsx
 *
 * 6단계 AI 검색 프로그레스 표시 컴포넌트
 * - 단계별 아이콘 + 레이블
 * - 현재 단계 하이라이트
 * - 프로그레스 바
 * - 단계별 타이머 (각 단계 진입 시 0초로 리셋)
 */

"use client"

import { useEffect, useState, useRef } from "react"
import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"
import { AI_STAGES, type AISearchStage } from "../search-result-view/types"

interface StageIndicatorProps {
  /** 현재 단계 */
  currentStage: AISearchStage
  /** 진행률 (0-100) */
  progress: number
  /** 추가 클래스명 */
  className?: string
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
}: StageIndicatorProps) {
  const currentStageIndex = AI_STAGES.findIndex((s) => s.key === currentStage)
  const [stageElapsedTime, setStageElapsedTime] = useState(0)
  const stageStartTimeRef = useRef<number | null>(null)
  const prevStageRef = useRef<AISearchStage | null>(null)

  // 단계별 타이머 - 각 단계 진입 시 0초로 리셋
  useEffect(() => {
    // 단계 변경 감지
    if (currentStage !== prevStageRef.current) {
      stageStartTimeRef.current = Date.now()
      setStageElapsedTime(0)
      prevStageRef.current = currentStage
    }

    // 완료 시 타이머 정지
    if (currentStage === 'complete') {
      return
    }

    // 타이머 업데이트
    const interval = setInterval(() => {
      if (stageStartTimeRef.current) {
        const elapsed = (Date.now() - stageStartTimeRef.current) / 1000
        setStageElapsedTime(elapsed)
      }
    }, 100)

    return () => clearInterval(interval)
  }, [currentStage])

  // 모던 프로그레스 UI (모바일 + 데스크톱 공통)
  return (
    <div className={cn("space-y-4 md:space-y-6", className)}>
      {/* 단계 표시 - 그라데이션 연결선 */}
      <div className="relative">
        {/* 배경 연결선 */}
        <div className="absolute top-4 md:top-5 left-6 md:left-8 right-6 md:right-8 h-0.5 md:h-1 bg-gradient-to-r from-muted via-muted to-muted rounded-full" />

        {/* 진행된 연결선 */}
        <div
          className="absolute top-4 md:top-5 left-6 md:left-8 h-0.5 md:h-1 bg-gradient-to-r from-violet-500 via-purple-500 to-blue-500 rounded-full transition-all duration-700 ease-out shadow-lg shadow-primary/20"
          style={{
            width: currentStageIndex > 0
              ? `calc(${(currentStageIndex / (AI_STAGES.length - 2)) * 100}% - 3rem)`
              : '0%'
          }}
        />

        <div className="flex items-center justify-between gap-1 md:gap-2 overflow-x-auto pb-2">
          {AI_STAGES.slice(0, -1).map((stage, index) => {
            const isCompleted = index < currentStageIndex
            const isCurrent = index === currentStageIndex
            const isPending = index > currentStageIndex

            return (
              <div key={stage.key} className="flex flex-col items-center gap-1 md:gap-2 flex-shrink-0 relative z-10">
                {/* 펄스 애니메이션 - 활성 단계만 */}
                {isCurrent && (
                  <>
                    <div
                      className="absolute top-0 w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-violet-500/30 to-purple-500/30"
                      style={{ animation: 'pulse-wave 2s ease-out infinite' }}
                    />
                    <div
                      className="absolute top-0 w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20"
                      style={{ animation: 'pulse-wave 2s ease-out infinite 0.5s' }}
                    />
                  </>
                )}

                {/* 단계 아이콘 */}
                <div
                  className={cn(
                    "relative flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full transition-all duration-500 border-2",
                    isCompleted && "bg-gradient-to-br from-green-500 to-emerald-600 border-green-400 text-white shadow-lg shadow-green-500/30",
                    isCurrent && "bg-gradient-to-br from-violet-500 via-purple-500 to-blue-500 border-violet-400 text-white shadow-xl shadow-primary/40 scale-110",
                    isPending && "bg-card border-muted-foreground/20 text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <Icon name="check-circle-2" className="h-4 w-4 md:h-5 md:w-5 drop-shadow-sm" />
                  ) : isCurrent ? (
                    <Icon name={stage.icon} className="h-4 w-4 md:h-5 md:w-5 drop-shadow-sm" />
                  ) : (
                    <Icon name={stage.icon} className="h-3.5 w-3.5 md:h-4 md:w-4 opacity-50" />
                  )}
                </div>

                {/* 라벨 */}
                <span
                  className={cn(
                    "text-[10px] md:text-xs whitespace-nowrap font-semibold transition-all duration-500",
                    isCompleted && "text-green-600 dark:text-green-400",
                    isCurrent && "text-primary scale-105",
                    isPending && "text-muted-foreground"
                  )}
                >
                  {stage.label}
                </span>

                {/* 타이머 - 활성 단계만 */}
                {isCurrent && currentStage !== 'complete' && (
                  <span className="text-[10px] md:text-xs text-muted-foreground/70 tabular-nums min-w-[4.5ch] text-center">
                    {stageElapsedTime.toFixed(1)}초
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 프로그레스 바 - 개선된 디자인 */}
      <div className="space-y-2 md:space-y-3">
        <div className="flex items-center justify-between text-xs md:text-sm">
          <span className="text-muted-foreground font-medium">
            {STAGE_MESSAGES[currentStage]}
          </span>
          <span className="font-bold text-primary tabular-nums min-w-[4ch] text-right">
            {Math.round(progress)}%
          </span>
        </div>
        <div className="h-2.5 md:h-3 bg-muted/50 rounded-full overflow-hidden shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-violet-500 via-purple-500 to-blue-500 rounded-full transition-all duration-500 ease-out shadow-sm"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* CSS 애니메이션 */}
      <style jsx>{`
        @keyframes pulse-wave {
          0% {
            transform: scale(1);
            opacity: 0.7;
          }
          50% {
            transform: scale(1.8);
            opacity: 0.3;
          }
          100% {
            transform: scale(2.5);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
