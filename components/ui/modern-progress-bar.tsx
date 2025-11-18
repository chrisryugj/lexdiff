import React from 'react'
import { cn } from '@/lib/utils'

interface ModernProgressBarProps {
  progress: number
  label?: string
  statusMessage?: string
  variant?: 'ocean' | 'sunset' | 'forest' | 'lavender'
  size?: 'sm' | 'md' | 'lg'
  showPercentage?: boolean
  animationDuration?: number
  className?: string
}

export function ModernProgressBar({
  progress = 0,
  label = 'Processing',
  statusMessage = '',
  variant = 'ocean',
  size = 'md',
  showPercentage = true,
  animationDuration = 500,
  className
}: ModernProgressBarProps) {
  // 진행률 범위 제한
  const clampedProgress = Math.min(100, Math.max(0, progress))

  // 크기별 설정
  const sizeConfig = {
    sm: {
      height: 'h-1.5',
      padding: 'py-2',
      labelText: 'text-xs',
      statusText: 'text-[10px]',
      gap: 'gap-1.5'
    },
    md: {
      height: 'h-2.5',
      padding: 'py-3',
      labelText: 'text-sm',
      statusText: 'text-xs',
      gap: 'gap-2'
    },
    lg: {
      height: 'h-4',
      padding: 'py-4',
      labelText: 'text-base',
      statusText: 'text-sm',
      gap: 'gap-3'
    }
  }

  // 색상 변형 (그라디언트 + 글로우 효과)
  const variantStyles = {
    ocean: {
      bar: 'bg-gradient-to-r from-blue-500 via-blue-600 to-cyan-500',
      glow: 'shadow-[0_0_20px_rgba(59,130,246,0.5)]',
      text: 'text-blue-600 dark:text-blue-400'
    },
    sunset: {
      bar: 'bg-gradient-to-r from-orange-400 via-pink-500 to-purple-600',
      glow: 'shadow-[0_0_20px_rgba(236,72,153,0.5)]',
      text: 'text-pink-600 dark:text-pink-400'
    },
    forest: {
      bar: 'bg-gradient-to-r from-emerald-500 via-green-600 to-teal-500',
      glow: 'shadow-[0_0_20px_rgba(16,185,129,0.5)]',
      text: 'text-emerald-600 dark:text-emerald-400'
    },
    lavender: {
      bar: 'bg-gradient-to-r from-purple-400 via-violet-500 to-indigo-600',
      glow: 'shadow-[0_0_20px_rgba(139,92,246,0.5)]',
      text: 'text-violet-600 dark:text-violet-400'
    }
  }

  const config = sizeConfig[size]
  const style = variantStyles[variant]

  return (
    <div className={cn('w-full', className)}>
      {/* 상단: 라벨과 퍼센티지 */}
      <div className={cn(
        'flex items-baseline justify-between mb-2',
        config.labelText
      )}>
        <span className="font-medium text-gray-700 dark:text-gray-200 tracking-tight">
          {label}
        </span>
        {showPercentage && (
          <span className={cn(
            'font-mono font-semibold tabular-nums',
            style.text
          )}>
            {clampedProgress}%
          </span>
        )}
      </div>

      {/* 프로그래스 바 */}
      <div className={cn('relative', config.gap)}>
        {/* 배경 트랙 */}
        <div className={cn(
          'w-full overflow-hidden rounded-full',
          'bg-gray-200 dark:bg-gray-800',
          config.height
        )}>
          {/* 진행 바 */}
          <div
            className={cn(
              'h-full rounded-full relative overflow-hidden',
              'transition-all ease-out',
              style.bar,
              clampedProgress > 0 && style.glow
            )}
            style={{
              width: `${clampedProgress}%`,
              transitionDuration: `${animationDuration}ms`
            }}
          >
            {/* 애니메이션 효과: 빛나는 웨이브 */}
            <div className="absolute inset-0 opacity-30">
              <div className="h-full w-full bg-gradient-to-r from-transparent via-white to-transparent
                            animate-shimmer" />
            </div>

            {/* 진행 끝부분 강조 */}
            {clampedProgress > 0 && clampedProgress < 100 && (
              <div className="absolute right-0 top-0 bottom-0 w-1
                            bg-white/40 blur-[2px]" />
            )}
          </div>
        </div>

        {/* 하단: 상태 메시지 */}
        {statusMessage && (
          <div className={cn(
            'text-center mt-2',
            config.statusText,
            'text-gray-500 dark:text-gray-400'
          )}>
            {statusMessage}
          </div>
        )}
      </div>
    </div>
  )
}