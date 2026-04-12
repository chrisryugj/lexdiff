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

import { memo, useEffect, useState, useRef } from "react"
import { cn } from "@/lib/utils"
import { Terminal, TypingAnimation, AnimatedSpan } from "@/components/ui/terminal"
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar"
import { TypingAnimationSingle } from "@/components/ui/typing-animation-single"

// PERF-6: 100ms 타이머가 부모를 매번 리렌더하던 것을 격리.
// 이 컴포넌트만 100ms마다 리렌더되고 부모(AIAnswerLoading)는 progress 변화에만 반응.
const ElapsedTimer = memo(function ElapsedTimer({ active }: { active: boolean }) {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef<number | null>(null)
  useEffect(() => {
    if (!active) {
      startRef.current = null
      setElapsed(0)
      return
    }
    startRef.current = Date.now()
    setElapsed(0)
    const interval = setInterval(() => {
      if (startRef.current) setElapsed((Date.now() - startRef.current) / 1000)
    }, 100)
    return () => clearInterval(interval)
  }, [active])
  return (
    <span className="text-[10px] font-mono text-gray-400 tabular-nums">
      {elapsed.toFixed(1)}s
    </span>
  )
})

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
  { range: [50, 85], key: "streaming", terminal: "✓ generating AI response" },
  { range: [85, 100], key: "extracting", terminal: "✓ extracting relevant articles" },
] as const

export function AIAnswerLoading({ searchProgress, className }: AIAnswerLoadingProps) {
  const [hasStarted, setHasStarted] = useState(false)
  const [shouldHide, setShouldHide] = useState(false)

  // PERF-6: elapsedTime 상태를 ElapsedTimer 자식 컴포넌트로 이전 (100ms 리렌더 격리)
  useEffect(() => {
    if (searchProgress > 0 && !hasStarted) setHasStarted(true)
    if (searchProgress === 0 && hasStarted) setHasStarted(false)
  }, [searchProgress, hasStarted])

  // 100% 도달 후 4500ms 대기 후 숨김 (마지막 애니메이션 3500ms + 여유 1000ms)
  useEffect(() => {
    if (searchProgress >= 100) {
      const hideTimeout = setTimeout(() => {
        setShouldHide(true)
      }, 4500)
      return () => clearTimeout(hideTimeout)
    } else {
      setShouldHide(false)
    }
  }, [searchProgress])

  // 현재 실제 단계 계산
  const currentRealStage = REAL_STAGES.find(
    (stage) => searchProgress >= stage.range[0] && searchProgress < stage.range[1]
  ) || REAL_STAGES[REAL_STAGES.length - 1]

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
        shouldHide && "opacity-0 -translate-y-8 pointer-events-none",
        className
      )}
    >
      {/* 좌측 상단: 참고용 터미널 로그 */}
      <div className="absolute top-4 left-4 w-[220px]">
        <Terminal className="h-auto w-full" sequence={false} startOnView={false}>
          <TypingAnimation duration={20} delay={0} className="text-white text-[11px] font-medium">
            LexDiff AI Search Engine v2.0
          </TypingAnimation>
          <AnimatedSpan className="text-gray-500 text-[11px]">
            ──────────────────────────────
          </AnimatedSpan>

          {/* 1-3단계 */}
          {searchProgress >= 0 && (
            <div className={cn(
              "text-sky-400 text-[11px] font-pretendard flex items-center transition-opacity duration-500",
              searchProgress >= 10 && searchProgress < 25 && "opacity-50",
              searchProgress >= 25 && searchProgress < 35 && "opacity-35",
              searchProgress >= 35 && searchProgress < 50 && "opacity-25",
              searchProgress >= 50 && "opacity-15"
            )}>
              <TypingAnimation duration={15} delay={500} className="text-sky-400 text-[11px] font-pretendard">
                $ 검색 시스템 초기화 중...
              </TypingAnimation>
              {currentRealStage.key === "init" && searchProgress < 2 && <span className="inline-block w-1 h-3 bg-sky-400 ml-0.5 animate-pulse" />}
            </div>
          )}
          {searchProgress >= 2 && (
            <div className={cn(
              "text-yellow-400/70 text-[11px] font-pretendard flex items-center transition-opacity duration-500",
              searchProgress >= 10 && searchProgress < 25 && "opacity-40",
              searchProgress >= 25 && searchProgress < 35 && "opacity-30",
              searchProgress >= 35 && searchProgress < 50 && "opacity-20",
              searchProgress >= 50 && "opacity-12"
            )}>
              <TypingAnimation duration={15} delay={800} className="text-yellow-400/70 text-[11px] font-pretendard">
                → 법령 임베딩 로딩 중...
              </TypingAnimation>
              {currentRealStage.key === "init" && searchProgress >= 2 && searchProgress < 10 && <span className="inline-block w-1 h-3 bg-yellow-400 ml-0.5 animate-pulse" />}
            </div>
          )}
          {searchProgress >= 10 && (
            <div className={cn(
              "text-sky-400 text-[11px] font-pretendard flex items-center transition-opacity duration-500",
              searchProgress >= 25 && searchProgress < 35 && "opacity-60",
              searchProgress >= 35 && searchProgress < 50 && "opacity-40",
              searchProgress >= 50 && searchProgress < 85 && "opacity-25",
              searchProgress >= 85 && "opacity-15"
            )}>
              <TypingAnimation duration={15} delay={1100} className="text-sky-400 text-[11px] font-pretendard">
                ✓ 질문 분석 완료
              </TypingAnimation>
              {currentRealStage.key === "analyzing" && <span className="inline-block w-1 h-3 bg-sky-400 ml-0.5 animate-pulse" />}
            </div>
          )}

          {/* 4-5단계 */}
          {searchProgress >= 25 && (
            <div className={cn(
              "text-yellow-400/70 text-[11px] font-pretendard flex items-center transition-opacity duration-500",
              searchProgress >= 35 && searchProgress < 50 && "opacity-50",
              searchProgress >= 50 && searchProgress < 85 && "opacity-30",
              searchProgress >= 85 && "opacity-18"
            )}>
              <TypingAnimation duration={15} delay={1400} className="text-yellow-400/70 text-[11px] font-pretendard">
                → 검색 토큰 생성 중...
              </TypingAnimation>
              {currentRealStage.key === "optimizing" && searchProgress < 28 && <span className="inline-block w-1 h-3 bg-yellow-400 ml-0.5 animate-pulse" />}
            </div>
          )}
          {searchProgress >= 28 && (
            <div className={cn(
              "text-sky-400 text-[11px] font-pretendard flex items-center transition-opacity duration-500",
              searchProgress >= 35 && searchProgress < 50 && "opacity-60",
              searchProgress >= 50 && searchProgress < 85 && "opacity-35",
              searchProgress >= 85 && "opacity-20"
            )}>
              <TypingAnimation duration={15} delay={1700} className="text-sky-400 text-[11px] font-pretendard">
                ✓ 검색어 최적화 완료
              </TypingAnimation>
              {currentRealStage.key === "optimizing" && searchProgress >= 28 && <span className="inline-block w-1 h-3 bg-sky-400 ml-0.5 animate-pulse" />}
            </div>
          )}

          {/* 검색 단계 */}
          {searchProgress >= 35 && (
            <div className={cn(
              "text-yellow-400/70 text-[11px] font-pretendard flex items-center transition-opacity duration-500",
              searchProgress >= 50 && searchProgress < 85 && "opacity-50",
              searchProgress >= 85 && "opacity-25"
            )}>
              <TypingAnimation duration={15} delay={2000} className="text-yellow-400/70 text-[11px] font-pretendard">
                → 쿼리 확장 중...
              </TypingAnimation>
              {currentRealStage.key === "searching" && searchProgress < 38 && <span className="inline-block w-1 h-3 bg-yellow-400 ml-0.5 animate-pulse" />}
            </div>
          )}
          {searchProgress >= 38 && (
            <div className={cn(
              "text-sky-400 text-[11px] font-pretendard flex items-center transition-opacity duration-500",
              searchProgress >= 50 && searchProgress < 85 && "opacity-60",
              searchProgress >= 85 && "opacity-30"
            )}>
              <TypingAnimation duration={15} delay={2300} className="text-sky-400 text-[11px] font-pretendard">
                ✓ 법령 DB 검색 완료
              </TypingAnimation>
              {currentRealStage.key === "searching" && searchProgress >= 38 && <span className="inline-block w-1 h-3 bg-sky-400 ml-0.5 animate-pulse" />}
            </div>
          )}

          {/* AI 답변 생성 - 50~85% */}
          {searchProgress >= 50 && searchProgress < 85 && (
            <div className="text-yellow-400/70 text-[11px] font-pretendard flex items-center transition-opacity duration-500">
              <TypingAnimation duration={15} delay={2600} className="text-yellow-400/70 text-[11px] font-pretendard">
                → AI 답변 스트리밍 중...
              </TypingAnimation>
              {currentRealStage.key === "streaming" && <span className="inline-block w-1 h-3 bg-yellow-400 ml-0.5 animate-pulse" />}
            </div>
          )}
          {searchProgress >= 85 && (
            <div className={cn(
              "text-sky-400 text-[11px] font-pretendard flex items-center transition-opacity duration-500",
              searchProgress >= 92 && "opacity-70"
            )}>
              <TypingAnimation duration={15} delay={0} className="text-sky-400 text-[11px] font-pretendard">
                ✓ AI 답변 생성 완료
              </TypingAnimation>
            </div>
          )}

          {/* 조문 추출 - 92~100% */}
          {searchProgress >= 92 && searchProgress < 100 && (
            <div className="text-yellow-400/70 text-[11px] font-pretendard flex items-center transition-opacity duration-500">
              <TypingAnimation duration={15} delay={0} className="text-yellow-400/70 text-[11px] font-pretendard">
                → 관련 조문 추출 중...
              </TypingAnimation>
              {currentRealStage.key === "extracting" && <span className="inline-block w-1 h-3 bg-yellow-400 ml-0.5 animate-pulse" />}
            </div>
          )}
          {searchProgress >= 100 && (
            <div className="text-sky-400 text-[11px] font-pretendard flex items-center transition-opacity duration-500">
              <TypingAnimation duration={15} delay={0} className="text-sky-400 text-[11px] font-pretendard">
                ✓ 관련 조문 추출 완료
              </TypingAnimation>
            </div>
          )}

          <AnimatedSpan className="text-gray-500 text-[11px]">
            ──────────────────────────────
          </AnimatedSpan>
        </Terminal>

        {/* 터미널 하단 타이머 — 격리된 자식 컴포넌트 */}
        <div className="mt-2 opacity-30">
          <ElapsedTimer active={hasStarted} />
        </div>
      </div>

      {/* 중앙: 원형 프로그레스 스피너 (화면 중앙 고정) - 항상 표시 */}
      <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex flex-col items-center gap-3 w-[320px]">
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
              className="block w-full bg-gradient-to-r from-white via-gray-200 to-white bg-[length:200%_100%] bg-clip-text text-transparent"
              key={currentRealStage.key}
            />
          </div>
          <div className="text-xs text-muted-foreground min-h-[20px] block w-full bg-gradient-to-r from-gray-600 via-gray-400 to-gray-600 bg-[length:200%_100%] bg-clip-text text-transparent">
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
