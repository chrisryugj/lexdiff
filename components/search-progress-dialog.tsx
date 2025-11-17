'use client'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Brain, Search, FileSearch, Sparkles, CheckCircle, Loader2 } from 'lucide-react'
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
 * 검색 프로그레스 Dialog
 * - 기본 검색: 법령 검색 → 데이터 파싱
 * - AI 검색: File Search 연결 → 관련 법령 검색 → AI 답변 생성 (스트리밍)
 */
export function SearchProgressDialog({
  isOpen,
  mode,
  stage,
  progress,
  lawName
}: SearchProgressDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md [&>button]:hidden" aria-describedby={undefined}>
        <DialogTitle className="sr-only">
          {mode === 'ai' ? 'AI 답변 생성 중' : '법령 조회 중'}
        </DialogTitle>
        <div className="py-6 space-y-6" style={{ fontFamily: "Pretendard, sans-serif" }}>
          {/* 타이틀 */}
          <div className="text-center">
            {mode === 'ai' ? (
              <div className="flex items-center justify-center gap-2">
                <Brain className="h-8 w-8 text-purple-500 animate-pulse" />
                <h3 className="text-xl font-semibold">AI 답변 생성 중...</h3>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <Search className="h-8 w-8 text-amber-500" />
                <h3 className="text-xl font-semibold">법령 조회 중...</h3>
              </div>
            )}
            {lawName && (
              <p className="text-sm text-muted-foreground mt-2">{lawName}</p>
            )}
          </div>

          {/* 프로그레스 바 */}
          <div className="space-y-2">
            <Progress value={progress} className="h-3" />
            <p className="text-sm text-center text-muted-foreground font-medium">{progress}%</p>
          </div>

          {/* 단계 표시 */}
          <div className="space-y-3">
            {mode === 'ai' ? (
              <>
                <StageItem
                  icon={Search}
                  label="File Search 연결"
                  status={getStageStatus('searching', stage)}
                />
                <StageItem
                  icon={FileSearch}
                  label="관련 법령 검색"
                  status={getStageStatus('parsing', stage)}
                />
                <StageItem
                  icon={Sparkles}
                  label="AI 답변 생성"
                  status={getStageStatus('streaming', stage)}
                  isStreaming={stage === 'streaming'}
                />
              </>
            ) : (
              <>
                <StageItem
                  icon={Search}
                  label="법령 검색"
                  status={getStageStatus('searching', stage)}
                />
                <StageItem
                  icon={FileSearch}
                  label="데이터 파싱"
                  status={getStageStatus('parsing', stage)}
                />
              </>
            )}
          </div>

          {/* AI 모드 경고 */}
          {mode === 'ai' && stage === 'streaming' && (
            <div className="mt-6 p-4 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-lg">
              <p className="text-sm text-purple-700 dark:text-purple-300 text-center">
                💡 답변 생성 중입니다. 잠시만 기다려주세요.
              </p>
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

function StageItem({
  icon: Icon,
  label,
  status,
  isStreaming = false
}: {
  icon: React.ElementType
  label: string
  status: 'pending' | 'active' | 'complete'
  isStreaming?: boolean
}) {
  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg transition-all",
      // 완료: 초록 배경
      status === 'complete' && "bg-green-900/20 border-l-4 border-green-700",
      // 진행 중: 강조 배경
      status === 'active' && "bg-primary/10 border-l-4 border-primary",
      // 대기 중: 기본 배경
      status === 'pending' && "bg-card/30 border-l-4 border-transparent"
    )}>
      <div
        className={cn(
          "flex-shrink-0 rounded-full p-2",
          status === 'complete' && "bg-green-700",
          status === 'active' && "bg-primary",
          status === 'pending' && "bg-muted/50"
        )}
      >
        {status === 'complete' ? (
          <CheckCircle className="h-5 w-5 text-white" />
        ) : status === 'active' ? (
          <Icon className={cn(
            "h-5 w-5 text-white",
            isStreaming ? 'animate-pulse' : 'animate-spin'
          )} />
        ) : (
          <Icon className="h-5 w-5 text-white" />
        )}
      </div>
      <span
        className={cn(
          "text-sm font-bold",
          status === 'complete' && 'text-green-300',
          status === 'active' && 'text-primary',
          status === 'pending' && 'text-muted-foreground'
        )}
        style={{ fontFamily: "Pretendard, sans-serif" }}
      >
        {label}
      </span>
    </div>
  )
}
