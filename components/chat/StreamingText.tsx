'use client'

import { cn } from '@/lib/utils'

interface StreamingTextProps {
  text: string
  isStreaming: boolean
  showCursor?: boolean
  className?: string
}

export function StreamingText({
  text,
  isStreaming,
  showCursor = true,
  className
}: StreamingTextProps) {
  return (
    <span className={className}>
      {text}
      {isStreaming && showCursor && (
        <span
          className={cn(
            "inline-block w-0.5 h-5 bg-primary ml-0.5 align-middle",
            "animate-pulse"
          )}
          style={{
            animation: 'blink 1s step-end infinite'
          }}
        />
      )}
      <style jsx>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </span>
  )
}
