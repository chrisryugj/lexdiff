'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Dialog, DialogTitle, DialogPortal } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface SearchProgressModernProps {
  isOpen: boolean
  mode: 'law' | 'ai'
  stage: 'searching' | 'parsing' | 'streaming' | 'complete'
  progress: number
  lawName?: string
  isCacheHit?: boolean
}

/**
 * 컴팩트 검색 프로그레스 다이얼로그
 * Design: Compact Liquid Glass - 유기적이고 흐르는 듯한 초미니멀 디자인
 */
export function SearchProgressModern({
  isOpen,
  mode,
  stage,
  progress,
  lawName,
  isCacheHit = false
}: SearchProgressModernProps) {
  const isAI = mode === 'ai'
  const isComplete = stage === 'complete'

  // 단계별 설정
  const stages = isAI
    ? [
        { id: 'searching', icon: '🔍', label: 'File Search' },
        { id: 'parsing', icon: '🎯', label: '벡터 검색' },
        { id: 'streaming', icon: '✨', label: 'AI 생성' }
      ]
    : [
        { id: 'searching', icon: '🔍', label: '법령 검색' },
        { id: 'parsing', icon: '📋', label: '데이터 파싱' }
      ]

  const currentStageIndex = stages.findIndex(s => s.id === stage)

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogPortal>
        {/* 커스텀 블러 오버레이 */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        {/* 다이얼로그 콘텐츠 */}
        <DialogPrimitive.Content
          className="fixed top-[50%] left-[50%] z-50 translate-x-[-50%] translate-y-[-50%] sm:max-w-[360px] max-w-[85vw] [&>button]:hidden overflow-hidden border-0 bg-transparent shadow-none p-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200"
          aria-describedby={undefined}
          style={{ fontFamily: 'Pretendard, sans-serif' }}
        >
          <DialogTitle className="sr-only">
            {isAI ? 'AI 답변 생성 중' : '법령 조회 중'}
          </DialogTitle>

        {/* 메인 글래스모피즘 카드 - 더 컴팩트 */}
        <div className="relative rounded-2xl overflow-hidden backdrop-blur-2xl bg-gradient-to-br from-white/10 via-white/5 to-white/10 border border-white/20 shadow-2xl">
          {/* 배경 애니메이션 그라데이션 */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div
              className={cn(
                "absolute -top-1/2 -left-1/2 w-full h-full rounded-full blur-3xl opacity-20 animate-liquid-1",
                isAI ? "bg-cyan-400" : "bg-indigo-400"
              )}
            />
            <div
              className={cn(
                "absolute -bottom-1/2 -right-1/2 w-full h-full rounded-full blur-3xl opacity-20 animate-liquid-2",
                isAI ? "bg-blue-400" : "bg-purple-400"
              )}
            />
            <div
              className={cn(
                "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 rounded-full blur-3xl opacity-10 animate-liquid-3",
                isAI ? "bg-emerald-400" : "bg-violet-400"
              )}
            />
          </div>

          <div className="relative p-6 space-y-4">
            {/* 법령명 (있을 경우에만) */}
            {lawName && (
              <div className="text-center">
                <p className="text-xs text-white/50 font-medium truncate">{lawName}</p>
              </div>
            )}

            {/* 중앙 프로그레스 숫자 + 링 */}
            <div className="flex items-center justify-center">
              <div className="relative">
                {/* 외곽 링 애니메이션 - 더 작게 */}
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                  <circle
                    cx="48"
                    cy="48"
                    r="44"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-white/10"
                  />
                  <circle
                    cx="48"
                    cy="48"
                    r="44"
                    fill="none"
                    stroke="url(#gradient)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${(progress / 100) * 276} 276`}
                    className="transition-all duration-700 ease-out"
                  />
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop
                        offset="0%"
                        stopColor={isAI ? "#06b6d4" : "#6366f1"}
                        stopOpacity="1"
                      />
                      <stop
                        offset="100%"
                        stopColor={isAI ? "#10b981" : "#a855f7"}
                        stopOpacity="1"
                      />
                    </linearGradient>
                  </defs>
                </svg>

                {/* 중앙 숫자 + 아이콘 */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-2xl mb-0.5">
                    {isComplete ? '✓' : stages[currentStageIndex]?.icon || '🔍'}
                  </div>
                  <div className="inline-flex items-baseline gap-0.5">
                    <span
                      className={cn(
                        "text-3xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-br transition-all duration-300",
                        isComplete
                          ? "from-emerald-300 to-green-400"
                          : isAI
                          ? "from-cyan-300 to-blue-400"
                          : "from-indigo-300 to-purple-400"
                      )}
                    >
                      {progress}
                    </span>
                    <span className="text-sm font-bold text-white/40">%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 단계 인디케이터 - 가로 도트 형식 */}
            <div className="flex items-center justify-center gap-2">
              {stages.map((stageInfo, index) => {
                const isCurrent = index === currentStageIndex
                const isDone = index < currentStageIndex || isComplete
                const isPending = index > currentStageIndex && !isComplete

                return (
                  <div key={stageInfo.id} className="flex flex-col items-center gap-1">
                    {/* 상태 점 */}
                    <div className="relative">
                      <div
                        className={cn(
                          "w-2 h-2 rounded-full transition-all duration-500",
                          isDone && "bg-emerald-400 shadow-lg shadow-emerald-400/50",
                          isCurrent && [
                            "w-2.5 h-2.5 animate-pulse shadow-lg",
                            isAI
                              ? "bg-cyan-400 shadow-cyan-400/50"
                              : "bg-indigo-400 shadow-indigo-400/50"
                          ],
                          isPending && "bg-white/20"
                        )}
                      />
                      {isCurrent && (
                        <div
                          className={cn(
                            "absolute inset-0 rounded-full animate-ping",
                            isAI ? "bg-cyan-400" : "bg-indigo-400"
                          )}
                        />
                      )}
                    </div>

                    {/* 라벨 */}
                    <div
                      className={cn(
                        "text-[10px] font-semibold transition-colors duration-300 whitespace-nowrap",
                        isDone && "text-emerald-300",
                        isCurrent && "text-white",
                        isPending && "text-white/30"
                      )}
                    >
                      {stageInfo.label}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 하단 상태 메시지 - 더 컴팩트 */}
            {!isComplete && (
              <div className="text-center">
                <p
                  className={cn(
                    "text-xs font-bold",
                    isCacheHit
                      ? "text-emerald-300"
                      : isAI
                      ? "text-cyan-300"
                      : "text-indigo-300"
                  )}
                >
                  {isCacheHit
                    ? '⚡ 캐시에서 빠르게 로드 중'
                    : isAI
                    ? '최고 품질의 AI 답변 생성 중'
                    : '법제처 공식 데이터 조회 중'}
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
