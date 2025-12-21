/**
 * ai-answer-loading.tsx
 *
 * AI 검색 프로그레스 UI (터미널 스타일)
 * - 왼쪽: 터미널 스타일 단계 로그
 * - 중앙: 원형 프로그레스 스피너
 * - 타이머 유지 (0초부터 시작)
 * - 단계별 진행률 증가 로직 유지
 */

"use client"

import { useEffect, useState, useRef } from "react"
import { cn } from "@/lib/utils"
import { Terminal, TypingAnimation, AnimatedSpan } from "@/components/ui/terminal"
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar"
import { TypingAnimationSingle } from "@/components/ui/typing-animation-single"

interface AIAnswerLoadingProps {
  /** 진행률 (0-100) */
  searchProgress: number
  /** 추가 클래스명 */
  className?: string
}

// 실제 단계 (API 기반) - 진행률 범위 매핑
const REAL_STAGES = [
  { range: [0, 10], key: "init", terminal: "$ initializing AI search..." },
  { range: [10, 25], key: "analyzing", terminal: "✓ analyzing user query" },
  { range: [25, 35], key: "optimizing", terminal: "✓ optimizing search parameters" },
  { range: [35, 50], key: "searching", terminal: "✓ searching law database" },
  { range: [50, 90], key: "streaming", terminal: "✓ generating AI response" },
  { range: [90, 100], key: "extracting", terminal: "✓ extracting relevant articles" },
] as const

export function AIAnswerLoading({ searchProgress, className }: AIAnswerLoadingProps) {
  const [elapsedTime, setElapsedTime] = useState(0)
  const startTimeRef = useRef<number | null>(null)
  const [hasStarted, setHasStarted] = useState(false)

  // 전체 프로세스 타이머 (0초부터 시작) - 기존 로직 유지
  useEffect(() => {
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

    if (searchProgress === 0 && hasStarted) {
      setHasStarted(false)
      startTimeRef.current = null
      setElapsedTime(0)
    }
  }, [searchProgress, hasStarted])

  // 현재 실제 단계 계산
  const currentRealStage = REAL_STAGES.find(
    (stage) => searchProgress >= stage.range[0] && searchProgress < stage.range[1]
  ) || REAL_STAGES[REAL_STAGES.length - 1]

  // 완료 여부 (100% 도달 시)
  const isComplete = searchProgress >= 100

  // 단계별 메시지
  const getStageMessage = () => {
    switch (currentRealStage.key) {
      case "init": return "검색 시스템을 준비하고 있습니다"
      case "analyzing": return "사용자 질문을 분석하고 있습니다"
      case "optimizing": return "검색어를 최적화하고 있습니다"
      case "searching": return "법령 데이터베이스를 검색하고 있습니다"
      case "streaming": return "AI가 답변을 생성하고 있습니다"
      case "extracting": return "관련 조문을 추출하고 있습니다"
      default: return "처리 중입니다"
    }
  }

  return (
    <div
      className={cn(
        "w-full relative px-4 py-8 transition-all duration-500 min-h-[450px]",
        isComplete && "opacity-0 -translate-y-8 pointer-events-none",
        className
      )}
    >
      {/* 왼쪽: 터미널 로그 */}
      <div className="relative w-full lg:w-[280px]">
        <Terminal className="h-auto w-full" sequence={false} startOnView={false}>
          <TypingAnimation duration={20} className="text-green-400">
            LexDiff AI Search Engine v2.0
          </TypingAnimation>
          <AnimatedSpan className="text-gray-500">
            ────────────────────────────────
          </AnimatedSpan>

          {/* 1-3단계: 초고속 */}
          {searchProgress >= 0 && (
            <TypingAnimation duration={8} delay={0} className="text-sky-400">
              $ initializing search system...
            </TypingAnimation>
          )}
          {searchProgress >= 2 && (
            <TypingAnimation duration={8} delay={250} className="text-yellow-400/70">
              → loading legal embeddings...
            </TypingAnimation>
          )}
          {searchProgress >= 4 && (
            <TypingAnimation duration={8} delay={500} className="text-sky-400">
              ✓ user query analysis complete
            </TypingAnimation>
          )}

          {/* 4-5단계: 고속 */}
          {searchProgress >= 25 && (
            <TypingAnimation duration={10} delay={750} className="text-yellow-400/70">
              → generating search tokens...
            </TypingAnimation>
          )}
          {searchProgress >= 28 && (
            <TypingAnimation duration={10} delay={1000} className="text-sky-400">
              ✓ search params optimized
            </TypingAnimation>
          )}

          {/* 나머지: 고속 */}
          {searchProgress >= 35 && (
            <TypingAnimation duration={10} delay={1250} className="text-yellow-400/70">
              → expanding query terms...
            </TypingAnimation>
          )}
          {searchProgress >= 38 && (
            <TypingAnimation duration={10} delay={1500} className="text-sky-400">
              ✓ law database search complete
            </TypingAnimation>
          )}
          {searchProgress >= 50 && (
            <TypingAnimation duration={10} delay={1750} className="text-yellow-400/70">
              → calculating relevance scores...
            </TypingAnimation>
          )}
          {searchProgress >= 53 && (
            <TypingAnimation duration={10} delay={2000} className="text-sky-400">
              ✓ AI response generated
            </TypingAnimation>
          )}
          {searchProgress >= 90 && (
            <TypingAnimation duration={10} delay={2250} className="text-yellow-400/70">
              → formatting citations...
            </TypingAnimation>
          )}
          {searchProgress >= 93 && (
            <TypingAnimation duration={10} delay={2500} className="text-sky-400">
              ✓ relevant articles extracted
            </TypingAnimation>
          )}

          <AnimatedSpan className="text-gray-500">
            ────────────────────────────────
          </AnimatedSpan>
        </Terminal>

        {/* 터미널 좌측 하단 배지 */}
        <div className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 px-3 py-1 bg-muted rounded-full">
          <span className="text-xs font-mono font-medium tabular-nums">
            {elapsedTime.toFixed(1)}s
          </span>
        </div>
      </div>

      {/* 중앙: 원형 프로그레스 스피너 (화면 중앙 고정) - 항상 표시 */}
      <div className="absolute left-1/2 -translate-x-1/2 top-[105px] flex flex-col items-center gap-3 min-w-[220px]">
        <AnimatedCircularProgressBar
          value={searchProgress}
          min={0}
          max={100}
          gaugePrimaryColor="#2563eb"
          gaugeSecondaryColor="#e5e7eb"
          className="size-32"
        />
        <div className="text-center space-y-1.5 w-full min-h-[60px]">
          <div className="text-sm font-medium text-white min-h-[40px] flex items-center justify-center">
            <TypingAnimationSingle
              words={[getStageMessage()]}
              duration={30}
              loop={false}
              showCursor={false}
              startOnView={false}
              className="inline-block animate-shimmer bg-gradient-to-r from-white via-gray-200 to-white bg-[length:200%_100%] bg-clip-text text-transparent"
              key={currentRealStage.key}
            />
          </div>
          <div className="text-xs text-muted-foreground min-h-[20px] animate-shimmer bg-gradient-to-r from-gray-600 via-gray-400 to-gray-600 bg-[length:200%_100%] bg-clip-text text-transparent">
            {currentRealStage.key === "init" && "잠시만 기다려 주세요"}
            {currentRealStage.key === "analyzing" && "질문 의도를 파악 중입니다"}
            {currentRealStage.key === "optimizing" && "더 나은 검색을 위해 준비 중"}
            {currentRealStage.key === "searching" && "관련 법령을 찾고 있습니다"}
            {currentRealStage.key === "streaming" && "곧 답변이 준비됩니다"}
            {currentRealStage.key === "extracting" && "최종 정리 중입니다"}
          </div>
        </div>
      </div>
    </div>
  )
}
