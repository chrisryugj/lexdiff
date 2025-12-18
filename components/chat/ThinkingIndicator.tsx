'use client'

import { cn } from '@/lib/utils'
import { Brain, Sparkles, Search, Edit3, Check, Circle, Loader2 } from 'lucide-react'
import type { AIStage } from './types'

interface ThinkingIndicatorProps {
  stage: AIStage
  className?: string
}

const STAGES = [
  { key: 'analyzing', label: '질문 분석', icon: Brain },
  { key: 'optimizing', label: '검색 최적화', icon: Sparkles },
  { key: 'searching', label: '법령 검색', icon: Search },
  { key: 'streaming', label: '답변 생성', icon: Edit3 },
] as const

export function ThinkingIndicator({ stage, className }: ThinkingIndicatorProps) {
  const currentIndex = STAGES.findIndex(s => s.key === stage)

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <Loader2 className="w-4 h-4 animate-spin text-primary" />

      <div className="flex items-center gap-3">
        {STAGES.map((s, i) => {
          const Icon = s.icon
          const isComplete = i < currentIndex
          const isCurrent = i === currentIndex
          const isPending = i > currentIndex

          return (
            <div
              key={s.key}
              className={cn(
                "flex items-center gap-1.5 text-xs transition-all duration-300",
                isComplete && "text-green-500",
                isCurrent && "text-primary font-medium",
                isPending && "text-muted-foreground/40"
              )}
            >
              {isComplete ? (
                <Check className="w-3.5 h-3.5" />
              ) : isCurrent ? (
                <Icon className="w-3.5 h-3.5 animate-pulse" />
              ) : (
                <Circle className="w-3 h-3" />
              )}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 ml-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-primary/60"
          style={{
            animation: `bounce 1.4s infinite ease-in-out both`,
            animationDelay: `${i * 0.16}s`
          }}
        />
      ))}
      <style jsx>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }
      `}</style>
    </span>
  )
}
