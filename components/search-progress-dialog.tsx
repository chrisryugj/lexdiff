'use client'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Brain, Search, FileSearch, Sparkles, CheckCircle, Loader2, Scale, ScrollText, Gavel } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchProgressDialogProps {
  isOpen: boolean
  mode: 'law' | 'ai'
  stage: 'searching' | 'parsing' | 'streaming' | 'complete'
  progress: number
  lawName?: string
}

/**
 * Legal Precision Design - 법령 검색 프로그레스
 *
 * 컨셉: 법조문 검토 체크리스트 + 법원 공문서 느낌
 * - 법령검색: 구조화된 체크리스트 (법률 서류 검토)
 * - AI검색: 실시간 분석 시각화 (AI 법령 분석 과정)
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
      <DialogContent
        className="sm:max-w-lg [&>button]:hidden border-2 shadow-2xl"
        style={{
          borderColor: mode === 'ai' ? 'rgb(147, 51, 234)' : 'rgb(217, 119, 6)',
          background: 'linear-gradient(135deg, rgba(0,0,0,0.97) 0%, rgba(15,15,25,0.97) 100%)'
        }}
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">
          {mode === 'ai' ? 'AI 법령 분석 진행 중' : '법령 데이터 조회 중'}
        </DialogTitle>

        <div className="relative">
          {/* 장식적 헤더 라인 */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />

          {/* 메인 컨텐츠 */}
          <div className="pt-8 pb-6 px-6 space-y-6">
            {/* 타이틀 섹션 */}
            <div className="text-center space-y-3">
              {mode === 'ai' ? (
                <AISearchHeader lawName={lawName} />
              ) : (
                <LawSearchHeader lawName={lawName} />
              )}
            </div>

            {/* 프로그레스 트랙 */}
            <ProgressTrack progress={progress} mode={mode} />

            {/* 단계 표시 */}
            <div className="space-y-2">
              {mode === 'ai' ? (
                <AIStages stage={stage} />
              ) : (
                <LawStages stage={stage} />
              )}
            </div>

            {/* 장식적 푸터 */}
            <div className="pt-4 border-t border-white/10 flex items-center justify-center gap-2 text-xs text-white/40">
              <Scale className="h-3 w-3" />
              <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
                LexDiff Legal Search System
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** AI 검색 헤더 */
function AISearchHeader({ lawName }: { lawName?: string }) {
  return (
    <>
      <div className="flex items-center justify-center gap-3">
        <div className="relative">
          {/* 펄싱 링 효과 */}
          <div className="absolute inset-0 rounded-full bg-purple-500/30 animate-ping" />
          <div className="relative bg-gradient-to-br from-purple-600 to-purple-800 rounded-full p-3 shadow-lg shadow-purple-500/50">
            <Brain className="h-7 w-7 text-white" />
          </div>
        </div>
        <div className="text-left">
          <h3
            className="text-2xl font-bold tracking-tight"
            style={{
              fontFamily: 'Georgia, serif',
              background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}
          >
            AI 법령 분석
          </h3>
          <p className="text-xs text-purple-300/70 font-medium tracking-wide">
            ARTIFICIAL INTELLIGENCE LEGAL ANALYSIS
          </p>
        </div>
      </div>
      {lawName && (
        <div className="mt-3 px-4 py-2 bg-purple-950/40 border border-purple-500/30 rounded">
          <p className="text-sm text-purple-200 font-medium" style={{ fontFamily: 'Pretendard, sans-serif' }}>
            질의: <span className="text-purple-100">{lawName}</span>
          </p>
        </div>
      )}
    </>
  )
}

/** 법령 검색 헤더 */
function LawSearchHeader({ lawName }: { lawName?: string }) {
  return (
    <>
      <div className="flex items-center justify-center gap-3">
        <div className="relative">
          <div className="absolute inset-0 rounded bg-amber-500/20 blur animate-pulse" />
          <div className="relative bg-gradient-to-br from-amber-600 to-amber-800 rounded p-3 shadow-lg shadow-amber-500/30">
            <Gavel className="h-7 w-7 text-white" />
          </div>
        </div>
        <div className="text-left">
          <h3
            className="text-2xl font-bold tracking-tight"
            style={{
              fontFamily: 'Georgia, serif',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}
          >
            법령 데이터 조회
          </h3>
          <p className="text-xs text-amber-300/70 font-medium tracking-wide">
            LEGAL STATUTE DATABASE QUERY
          </p>
        </div>
      </div>
      {lawName && (
        <div className="mt-3 px-4 py-2 bg-amber-950/40 border border-amber-500/30 rounded">
          <p className="text-sm text-amber-200 font-medium" style={{ fontFamily: 'Pretendard, sans-serif' }}>
            검색: <span className="text-amber-100">{lawName}</span>
          </p>
        </div>
      )}
    </>
  )
}

/** 프로그레스 트랙 */
function ProgressTrack({ progress, mode }: { progress: number; mode: 'law' | 'ai' }) {
  const color = mode === 'ai' ? 'purple' : 'amber'

  return (
    <div className="space-y-2">
      {/* 트랙 */}
      <div className="relative h-2 bg-white/10 rounded-full overflow-hidden backdrop-blur">
        {/* 글로우 효과 */}
        <div
          className="absolute top-0 left-0 h-full transition-all duration-700 ease-out blur-sm"
          style={{
            width: `${progress}%`,
            background: mode === 'ai'
              ? 'linear-gradient(90deg, #a855f7 0%, #ec4899 100%)'
              : 'linear-gradient(90deg, #f59e0b 0%, #ef4444 100%)',
            opacity: 0.6
          }}
        />
        {/* 실제 바 */}
        <div
          className="absolute top-0 left-0 h-full transition-all duration-700 ease-out"
          style={{
            width: `${progress}%`,
            background: mode === 'ai'
              ? 'linear-gradient(90deg, #a855f7 0%, #ec4899 100%)'
              : 'linear-gradient(90deg, #f59e0b 0%, #ef4444 100%)'
          }}
        />
        {/* 반짝이는 엣지 */}
        <div
          className="absolute top-0 h-full w-20 transition-all duration-700 ease-out"
          style={{
            left: `${Math.max(0, progress - 20)}%`,
            background: `linear-gradient(90deg, transparent, ${mode === 'ai' ? '#ec4899' : '#ef4444'}80, transparent)`,
            animation: 'shimmer 2s infinite'
          }}
        />
      </div>

      {/* 퍼센트 표시 */}
      <div className="flex justify-between items-center">
        <span
          className="text-xs font-mono font-bold tracking-wider"
          style={{ color: mode === 'ai' ? '#c084fc' : '#fbbf24' }}
        >
          {progress.toFixed(0)}%
        </span>
        <span className="text-xs text-white/30 font-mono">
          {progress < 100 ? 'IN PROGRESS' : 'COMPLETE'}
        </span>
      </div>

      <style jsx>{`
        @keyframes shimmer {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}

/** AI 검색 단계들 */
function AIStages({ stage }: { stage: string }) {
  const stages = [
    {
      key: 'searching',
      icon: Search,
      label: 'File Search 연결',
      description: 'Gemini Vector DB 접속'
    },
    {
      key: 'parsing',
      icon: ScrollText,
      label: '관련 법령 검색',
      description: '조문 매칭 및 추출'
    },
    {
      key: 'streaming',
      icon: Sparkles,
      label: 'AI 답변 생성',
      description: '실시간 스트리밍 응답'
    }
  ]

  return (
    <>
      {stages.map((s, idx) => {
        const status = getStageStatus(s.key, stage)
        return (
          <AIStageItem
            key={s.key}
            icon={s.icon}
            label={s.label}
            description={s.description}
            status={status}
            number={idx + 1}
            isStreaming={s.key === 'streaming' && status === 'active'}
          />
        )
      })}
    </>
  )
}

/** 법령 검색 단계들 */
function LawStages({ stage }: { stage: string }) {
  const stages = [
    {
      key: 'searching',
      icon: Search,
      label: '법령 데이터베이스 검색',
      description: 'law.go.kr API 조회'
    },
    {
      key: 'parsing',
      icon: FileSearch,
      label: '조문 데이터 파싱',
      description: 'XML 구조 분석 및 변환'
    }
  ]

  return (
    <>
      {stages.map((s, idx) => {
        const status = getStageStatus(s.key, stage)
        return (
          <LawStageItem
            key={s.key}
            icon={s.icon}
            label={s.label}
            description={s.description}
            status={status}
            number={idx + 1}
          />
        )
      })}
    </>
  )
}

/** AI 단계 아이템 */
function AIStageItem({
  icon: Icon,
  label,
  description,
  status,
  number,
  isStreaming = false
}: {
  icon: React.ElementType
  label: string
  description: string
  status: 'pending' | 'active' | 'complete'
  number: number
  isStreaming?: boolean
}) {
  return (
    <div className={cn(
      "relative flex items-start gap-4 p-4 rounded-lg transition-all duration-500",
      status === 'complete' && "bg-gradient-to-r from-green-950/40 to-green-900/20 border-l-2 border-green-500",
      status === 'active' && "bg-gradient-to-r from-purple-950/50 to-purple-900/30 border-l-2 border-purple-500 shadow-lg shadow-purple-500/20",
      status === 'pending' && "bg-white/5 border-l-2 border-white/10"
    )}>
      {/* 넘버링 */}
      <div className={cn(
        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all",
        status === 'complete' && "bg-green-600 text-white ring-2 ring-green-400/50",
        status === 'active' && "bg-purple-600 text-white ring-2 ring-purple-400/50 animate-pulse",
        status === 'pending' && "bg-white/10 text-white/40"
      )}>
        {status === 'complete' ? <CheckCircle className="h-5 w-5" /> : number}
      </div>

      {/* 아이콘 */}
      <div className={cn(
        "flex-shrink-0 p-2 rounded transition-all",
        status === 'complete' && "bg-green-600/20",
        status === 'active' && "bg-purple-600/30",
        status === 'pending' && "bg-white/5"
      )}>
        <Icon className={cn(
          "h-5 w-5 transition-all",
          status === 'complete' && "text-green-400",
          status === 'active' && "text-purple-400",
          status === 'pending' && "text-white/30",
          isStreaming && "animate-pulse"
        )} />
      </div>

      {/* 텍스트 */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm font-bold mb-0.5 transition-colors",
          status === 'complete' && 'text-green-300',
          status === 'active' && 'text-purple-200',
          status === 'pending' && 'text-white/40'
        )} style={{ fontFamily: 'Pretendard, sans-serif' }}>
          {label}
        </p>
        <p className={cn(
          "text-xs transition-colors font-mono",
          status === 'complete' && 'text-green-400/60',
          status === 'active' && 'text-purple-300/70',
          status === 'pending' && 'text-white/20'
        )}>
          {description}
        </p>
      </div>

      {/* 스트리밍 인디케이터 */}
      {isStreaming && (
        <div className="flex-shrink-0 flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** 법령 단계 아이템 */
function LawStageItem({
  icon: Icon,
  label,
  description,
  status,
  number
}: {
  icon: React.ElementType
  label: string
  description: string
  status: 'pending' | 'active' | 'complete'
  number: number
}) {
  return (
    <div className={cn(
      "relative flex items-start gap-4 p-4 rounded-lg transition-all duration-500 border-l-4",
      status === 'complete' && "bg-gradient-to-r from-green-950/40 to-green-900/20 border-green-500",
      status === 'active' && "bg-gradient-to-r from-amber-950/50 to-amber-900/30 border-amber-500 shadow-lg shadow-amber-500/20",
      status === 'pending' && "bg-white/5 border-white/10"
    )}>
      {/* 체크박스 스타일 인디케이터 */}
      <div className={cn(
        "flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-all",
        status === 'complete' && "bg-green-600 border-green-400",
        status === 'active' && "border-amber-500 animate-pulse",
        status === 'pending' && "border-white/20"
      )}>
        {status === 'complete' && <CheckCircle className="h-4 w-4 text-white" />}
        {status === 'active' && <div className="w-3 h-3 bg-amber-500 rounded-sm animate-pulse" />}
      </div>

      {/* 아이콘 */}
      <div className={cn(
        "flex-shrink-0 p-2 rounded transition-all",
        status === 'complete' && "bg-green-600/20",
        status === 'active' && "bg-amber-600/30",
        status === 'pending' && "bg-white/5"
      )}>
        <Icon className={cn(
          "h-5 w-5 transition-all",
          status === 'complete' && "text-green-400",
          status === 'active' && "text-amber-400 animate-spin",
          status === 'pending' && "text-white/30"
        )} />
      </div>

      {/* 텍스트 */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm font-bold mb-0.5 transition-colors",
          status === 'complete' && 'text-green-300',
          status === 'active' && 'text-amber-200',
          status === 'pending' && 'text-white/40'
        )} style={{ fontFamily: 'Pretendard, sans-serif' }}>
          {label}
        </p>
        <p className={cn(
          "text-xs transition-colors font-mono",
          status === 'complete' && 'text-green-400/60',
          status === 'active' && 'text-amber-300/70',
          status === 'pending' && 'text-white/20'
        )}>
          {description}
        </p>
      </div>

      {/* 넘버 뱃지 */}
      <div className={cn(
        "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all",
        status === 'complete' && "bg-green-600/30 text-green-300",
        status === 'active' && "bg-amber-600/30 text-amber-300",
        status === 'pending' && "bg-white/5 text-white/30"
      )}>
        {number}
      </div>
    </div>
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
