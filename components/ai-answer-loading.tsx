/**
 * ai-answer-loading.tsx
 *
 * AI 검색 4단계 프로그레스 UI (전면 개편)
 * - 스크린샷 디자인 기반 구현
 * - 전체 프로세스 타이머 (0초부터 시작)
 * - 각 단계별 이름 + 설명
 * - 진행 중 펄스 애니메이션
 * - 완료 시 위로 접히는 전환 효과
 */

"use client"

import { useEffect, useState, useRef } from "react"
import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"

interface AIAnswerLoadingProps {
  /** 진행률 (0-100) */
  searchProgress: number
  /** 추가 클래스명 */
  className?: string
}

// 4단계 정의 (실제 API 단계와 매칭)
const STAGES = [
  {
    id: 1,
    name: "질문 분석",
    description: "사용자 질의를 분석하고 검색 전략을 수립합니다",
    range: [0, 25] as const, // analyzing + optimizing 통합
  },
  {
    id: 2,
    name: "법령 검색",
    description: "법령 데이터베이스에서 관련 조문을 찾습니다",
    range: [25, 40] as const, // searching
  },
  {
    id: 3,
    name: "답변 생성",
    description: "AI가 검색 결과를 바탕으로 답변을 작성합니다",
    range: [40, 95] as const, // streaming
  },
  {
    id: 4,
    name: "최종 검토",
    description: "답변 품질을 확인하고 인용 출처를 정리합니다",
    range: [95, 100] as const, // extracting + complete
  },
]

export function AIAnswerLoading({ searchProgress, className }: AIAnswerLoadingProps) {
  const [elapsedTime, setElapsedTime] = useState(0)
  const startTimeRef = useRef<number | null>(null)
  const [hasStarted, setHasStarted] = useState(false)

  // 전체 프로세스 타이머 (0초부터 시작)
  useEffect(() => {
    // 진행률이 0보다 크면 타이머 시작
    if (searchProgress > 0 && !hasStarted) {
      setHasStarted(true)
      startTimeRef.current = Date.now()
      setElapsedTime(0)
    }

    if (hasStarted && startTimeRef.current) {
      const interval = setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current!) / 1000
        setElapsedTime(elapsed)
      }, 100)

      return () => clearInterval(interval)
    }

    // 진행률이 0으로 돌아오면 리셋
    if (searchProgress === 0 && hasStarted) {
      setHasStarted(false)
      startTimeRef.current = null
      setElapsedTime(0)
    }
  }, [searchProgress, hasStarted])

  // 현재 단계 계산
  const currentStageIndex = STAGES.findIndex(
    (stage) => searchProgress >= stage.range[0] && searchProgress < stage.range[1]
  )
  const activeStage = currentStageIndex >= 0 ? currentStageIndex : STAGES.length - 1

  return (
    <div className={cn("w-full space-y-6 px-8", className)}>
      {/* 타이머 */}
      <div className="flex items-center gap-2 text-lg">
        <span className="text-muted-foreground font-medium">AI 검색 진행 중</span>
        <span className="font-mono text-muted-foreground/70 tabular-nums text-sm">{elapsedTime.toFixed(1)}초</span>
      </div>

      {/* 4단계 프로그레스 바 */}
      <div className="relative">
        {/* 배경 연결선 */}
        <div className="absolute top-6 left-8 right-8 h-[3px] bg-gray-200 dark:bg-gray-700 rounded-full" />

        {/* 진행된 연결선 */}
        <div
          className="absolute top-6 left-8 h-[3px] bg-[#2196F3] rounded-full transition-all duration-500 ease-out"
          style={{
            width: activeStage > 0
              ? `calc(${(activeStage / (STAGES.length - 1)) * 100}% - 4rem)`
              : "0%",
          }}
        />

        {/* 단계 아이콘들 */}
        <div className="flex items-center justify-between gap-2">
          {STAGES.map((stage, index) => {
            const isCompleted = index < activeStage
            const isCurrent = index === activeStage
            const isPending = index > activeStage

            return (
              <div key={stage.id} className="relative z-10 flex flex-col items-center gap-2.5 flex-1">
                {/* 펄스 애니메이션 (진행 중 단계만) */}
                {isCurrent && (
                  <>
                    <div
                      className="absolute top-0 w-14 h-14 rounded-full bg-[#2196F3]/30"
                      style={{ animation: "pulse-wave 1.5s ease-out infinite" }}
                    />
                    <div
                      className="absolute top-0 w-14 h-14 rounded-full bg-[#2196F3]/15"
                      style={{ animation: "pulse-wave 1.5s ease-out infinite 0.4s" }}
                    />
                  </>
                )}

                {/* 단계 번호 원 */}
                <div
                  className={cn(
                    "relative flex items-center justify-center w-12 h-12 rounded-full transition-all duration-500 border-[3px]",
                    isCompleted && "bg-[#2196F3] border-[#2196F3] text-white",
                    isCurrent && "bg-white dark:bg-gray-900 border-[#2196F3] text-[#2196F3] scale-110 shadow-lg shadow-[#2196F3]/30",
                    isPending && "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500"
                  )}
                >
                  {isCompleted ? (
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : isCurrent ? (
                    <div className="animate-spin">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                  ) : (
                    <span className="text-base font-bold">{stage.id}</span>
                  )}
                </div>

                {/* 단계 이름 */}
                <div
                  className={cn(
                    "text-base font-medium text-center transition-all duration-500 whitespace-nowrap",
                    isCompleted && "text-gray-600 dark:text-gray-400",
                    isCurrent && "text-[#2196F3] font-semibold",
                    isPending && "text-gray-400 dark:text-gray-500"
                  )}
                >
                  {stage.name}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 현재 단계 설명 */}
      <div className="space-y-3">
        <div className="text-base text-muted-foreground text-center">
          {STAGES[activeStage]?.description || "처리 중..."}
        </div>

        {/* 프로그레스 바 */}
        <div className="relative h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#2196F3] rounded-full transition-all duration-300 ease-out flex items-center justify-end pr-2.5"
            style={{ width: `${searchProgress}%` }}
          >
            {searchProgress > 5 && (
              <span className="text-xs font-bold text-white tabular-nums drop-shadow-sm">
                {Math.round(searchProgress)}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* CSS 애니메이션 */}
      <style jsx>{`
        @keyframes pulse-wave {
          0% {
            transform: scale(1);
            opacity: 0.5;
          }
          50% {
            transform: scale(1.4);
            opacity: 0.2;
          }
          100% {
            transform: scale(1.8);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
