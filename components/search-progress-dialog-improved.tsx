'use client'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Brain, Search, FileSearch, Sparkles, CheckCircle, Loader2, Zap } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

interface SearchProgressDialogProps {
  isOpen: boolean
  mode: 'law' | 'ai'
  stage: 'searching' | 'parsing' | 'streaming' | 'complete'
  progress: number
  lawName?: string
}

/**
 * 개선된 검색 프로그레스 Dialog (Artifacts Builder 스타일)
 * - 기본 검색: 법령 검색 → 데이터 파싱
 * - AI 검색: File Search 연결 → 관련 법령 검색 → AI 답변 생성 (스트리밍)
 */
export function SearchProgressDialogImproved({
  isOpen,
  mode,
  stage,
  progress,
  lawName
}: SearchProgressDialogProps) {
  const isAI = mode === 'ai'
  const isComplete = stage === 'complete'

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-lg [&>button]:hidden overflow-hidden"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">
          {isAI ? 'AI 답변 생성 중' : '법령 조회 중'}
        </DialogTitle>

        {/* 배경 그라데이션 효과 */}
        <div className={cn(
          "absolute inset-0 opacity-30 pointer-events-none",
          isAI
            ? "bg-gradient-to-br from-blue-500/20 via-cyan-500/20 to-emerald-500/20"
            : "bg-gradient-to-br from-indigo-500/20 via-slate-500/20 to-purple-500/20"
        )} />

        <div className="relative py-8 space-y-6" style={{ fontFamily: "Pretendard, sans-serif" }}>
          {/* 헤더 섹션 */}
          <div className="text-center space-y-3">
            <div className="flex items-center justify-center">
              {isAI ? (
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full blur-xl opacity-50 animate-pulse" />
                  <div className="relative bg-gradient-to-br from-blue-600 to-cyan-600 p-4 rounded-2xl shadow-lg">
                    <Brain className="h-10 w-10 text-white animate-pulse" />
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full blur-xl opacity-50 animate-pulse" />
                  <div className="relative bg-gradient-to-br from-indigo-600 to-purple-600 p-4 rounded-2xl shadow-lg">
                    <Search className="h-10 w-10 text-white" />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <h3 className="text-2xl font-bold">
                {isAI ? 'AI 답변 생성 중' : '법령 조회 중'}
              </h3>
              {lawName && (
                <p className="text-sm text-muted-foreground font-medium">{lawName}</p>
              )}
            </div>
          </div>

          {/* 프로그레스 바 - 개선된 디자인 */}
          <div className="space-y-3 px-4">
            <div className="relative h-4 bg-muted/50 rounded-full overflow-hidden backdrop-blur-sm">
              {/* 배경 애니메이션 */}
              <div className={cn(
                "absolute inset-0 opacity-20",
                isAI
                  ? "bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-500"
                  : "bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-500",
                "animate-shimmer"
              )} />

              {/* 실제 프로그레스 */}
              <div
                className={cn(
                  "h-full transition-all duration-700 ease-out relative overflow-hidden",
                  isComplete
                    ? "bg-gradient-to-r from-green-500 to-emerald-500"
                    : isAI
                    ? "bg-gradient-to-r from-blue-600 to-cyan-600"
                    : "bg-gradient-to-r from-indigo-600 to-purple-600"
                )}
                style={{ width: `${progress}%` }}
              >
                {/* 진행 중 글로우 효과 */}
                {!isComplete && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-slide" />
                )}
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-muted-foreground">진행률</span>
              <span className={cn(
                "font-bold text-lg",
                isComplete
                  ? "text-green-600 dark:text-green-400"
                  : isAI
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-indigo-600 dark:text-indigo-400"
              )}>
                {progress}%
              </span>
            </div>
          </div>

          {/* 단계 표시 - 카드 스타일 */}
          <div className="space-y-3 px-4">
            {isAI ? (
              <>
                <StageCard
                  icon={Search}
                  label="File Search 연결"
                  description="Google AI와 연결 중"
                  status={getStageStatus('searching', stage)}
                  color="blue"
                />
                <StageCard
                  icon={FileSearch}
                  label="관련 법령 검색"
                  description="벡터 데이터베이스 검색"
                  status={getStageStatus('parsing', stage)}
                  color="cyan"
                />
                <StageCard
                  icon={Sparkles}
                  label="AI 답변 생성"
                  description="Gemini 2.5 Flash 답변 생성"
                  status={getStageStatus('streaming', stage)}
                  isStreaming={stage === 'streaming'}
                  color="emerald"
                />
              </>
            ) : (
              <>
                <StageCard
                  icon={Search}
                  label="법령 검색"
                  description="법제처 API 조회 중"
                  status={getStageStatus('searching', stage)}
                  color="indigo"
                />
                <StageCard
                  icon={FileSearch}
                  label="데이터 파싱"
                  description="조문 데이터 분석 중"
                  status={getStageStatus('parsing', stage)}
                  color="purple"
                />
              </>
            )}
          </div>

          {/* 하단 메시지 */}
          {!isComplete && (
            <div className={cn(
              "mx-4 p-4 rounded-xl border-2",
              isAI
                ? "bg-blue-950/20 border-blue-600/30"
                : "bg-indigo-950/20 border-indigo-600/30"
            )}>
              <div className="flex items-start gap-3">
                <Zap className={cn(
                  "h-5 w-5 flex-shrink-0 mt-0.5",
                  isAI ? "text-blue-400" : "text-indigo-400"
                )} />
                <div className="space-y-1">
                  <p className={cn(
                    "text-sm font-bold",
                    isAI ? "text-blue-300" : "text-indigo-300"
                  )}>
                    {isAI ? '최고 품질의 AI 답변 생성 중' : '빠르고 정확한 법령 검색'}
                  </p>
                  <p className="text-xs text-foreground/80">
                    {isAI
                      ? 'Gemini 2.5 Flash가 최적의 답변을 생성하고 있습니다'
                      : '법제처 공식 데이터를 실시간으로 가져오고 있습니다'
                    }
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function getStageStatus(
  targetStage: string,
  currentStage: string
): 'pending' | 'active' | 'complete' {
  const stages = ['searching', 'parsing', 'streaming', 'complete']
  const targetIndex = stages.indexOf(targetStage)
  const currentIndex = stages.indexOf(currentStage)

  if (currentIndex > targetIndex) return 'complete'
  if (currentIndex === targetIndex) return 'active'
  return 'pending'
}

function StageCard({
  icon: Icon,
  label,
  description,
  status,
  isStreaming = false,
  color = 'blue'
}: {
  icon: React.ElementType
  label: string
  description: string
  status: 'pending' | 'active' | 'complete'
  isStreaming?: boolean
  color?: 'blue' | 'cyan' | 'emerald' | 'indigo' | 'purple'
}) {
  const colorClasses = {
    blue: {
      activeBg: 'bg-blue-500/10',
      activeBorder: 'border-blue-500/50',
      activeIconBg: 'bg-blue-500',
      activeText: 'text-blue-300',
      activeShadow: 'shadow-blue-500/20'
    },
    cyan: {
      activeBg: 'bg-cyan-500/10',
      activeBorder: 'border-cyan-500/50',
      activeIconBg: 'bg-cyan-500',
      activeText: 'text-cyan-300',
      activeShadow: 'shadow-cyan-500/20'
    },
    emerald: {
      activeBg: 'bg-emerald-500/10',
      activeBorder: 'border-emerald-500/50',
      activeIconBg: 'bg-emerald-500',
      activeText: 'text-emerald-300',
      activeShadow: 'shadow-emerald-500/20'
    },
    indigo: {
      activeBg: 'bg-indigo-500/10',
      activeBorder: 'border-indigo-500/50',
      activeIconBg: 'bg-indigo-500',
      activeText: 'text-indigo-300',
      activeShadow: 'shadow-indigo-500/20'
    },
    purple: {
      activeBg: 'bg-purple-500/10',
      activeBorder: 'border-purple-500/50',
      activeIconBg: 'bg-purple-500',
      activeText: 'text-purple-300',
      activeShadow: 'shadow-purple-500/20'
    }
  }

  const colors = colorClasses[color]

  return (
    <div className={cn(
      "flex items-center gap-4 p-4 rounded-xl transition-all duration-300",
      // 완료된 상태: 차분한 초록 배경 + 테두리
      status === 'complete' && [
        "bg-green-900/20 border-2 border-green-700/40",
        "shadow-sm"
      ],
      // 현재 진행 중: 강조된 배경 + 두꺼운 테두리 + 그림자
      status === 'active' && [
        colors.activeBg,
        `border-2 ${colors.activeBorder}`,
        `shadow-lg ${colors.activeShadow}`
      ],
      // 대기 중: 기본 배경 + 얇은 테두리
      status === 'pending' && [
        "bg-card/30 border border-border/30"
      ]
    )}>
      {/* 아이콘 */}
      <div className="relative flex-shrink-0">
        <div className={cn(
          "rounded-full p-3 transition-all duration-300",
          // 완료: 초록 배경
          status === 'complete' && "bg-green-700",
          // 진행 중: 색상 배경 + 애니메이션
          status === 'active' && [
            colors.activeIconBg,
            isStreaming ? "animate-pulse" : "animate-spin"
          ],
          // 대기 중: 어두운 배경
          status === 'pending' && "bg-muted/50"
        )}>
          {status === 'complete' ? (
            <CheckCircle className="h-6 w-6 text-white" />
          ) : (
            <Icon className="h-6 w-6 text-white" />
          )}
        </div>
      </div>

      {/* 텍스트 */}
      <div className="flex-1 min-w-0" style={{ fontFamily: "Pretendard, sans-serif" }}>
        <div className={cn(
          "font-bold text-sm mb-1 leading-tight",
          // 완료: 밝은 초록
          status === 'complete' && "text-green-300",
          // 진행 중: 색상 강조
          status === 'active' && colors.activeText,
          // 대기 중: 중간 밝기
          status === 'pending' && "text-muted-foreground"
        )}>
          {label}
        </div>
        <div className={cn(
          "text-xs leading-tight",
          // 완료: 연한 초록
          status === 'complete' && "text-green-400/80",
          // 진행 중: 일반 텍스트
          status === 'active' && "text-foreground/70",
          // 대기 중: 흐린 텍스트
          status === 'pending' && "text-muted-foreground/60"
        )}>
          {description}
        </div>
      </div>

      {/* 상태 표시 */}
      <div className="flex-shrink-0">
        {status === 'complete' && (
          <div className="w-2 h-2 rounded-full bg-green-500" />
        )}
        {status === 'active' && (
          <div className="flex flex-col gap-1">
            <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", colors.activeIconBg)} />
            <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse delay-75", colors.activeIconBg)} />
            <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse delay-150", colors.activeIconBg)} />
          </div>
        )}
        {status === 'pending' && (
          <div className="w-2 h-2 rounded-full bg-muted/40" />
        )}
      </div>
    </div>
  )
}
