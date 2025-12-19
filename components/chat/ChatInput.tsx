'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/ui/icon'
import type { SearchMode } from './types'

interface ChatInputProps {
  onSubmit: (text: string) => void
  isStreaming: boolean
  mode: SearchMode
  onModeChange: (mode: SearchMode) => void
  onStop?: () => void
  disabled?: boolean
}

export function ChatInput({
  onSubmit,
  isStreaming,
  mode,
  onModeChange,
  onStop,
  disabled
}: ChatInputProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`
    }
  }, [input])

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleSubmit = () => {
    if (!input.trim() || isStreaming || disabled) return
    onSubmit(input.trim())
    setInput('')
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="sticky bottom-0 bg-background/80 backdrop-blur-xl border-t border-border/50 p-4">
      <div className="max-w-3xl mx-auto space-y-3">
        {/* Mode tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => onModeChange('law')}
            disabled={isStreaming}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
              mode === 'law'
                ? "bg-blue-500 text-white shadow-lg shadow-blue-500/25"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
              isStreaming && "opacity-50 cursor-not-allowed"
            )}
          >
            <Icon name="search" className="w-4 h-4" />
            법령 검색
          </button>
          <button
            onClick={() => onModeChange('ai')}
            disabled={isStreaming}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
              mode === 'ai'
                ? "bg-purple-500 text-white shadow-lg shadow-purple-500/25"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
              isStreaming && "opacity-50 cursor-not-allowed"
            )}
          >
            <Icon name="bot" className="w-4 h-4" />
            AI 질문
          </button>
        </div>

        {/* Input area */}
        <div className="relative flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                mode === 'law'
                  ? "법령명 또는 조문 검색 (예: 관세법 제38조)"
                  : "법률 질문을 입력하세요 (예: 관세법 신고납부 요건이 뭐야?)"
              }
              className={cn(
                "w-full resize-none rounded-2xl border-2 bg-muted/30",
                "px-4 py-3 pr-4 text-sm leading-relaxed",
                "focus:outline-none focus:ring-0",
                "max-h-[150px] overflow-y-auto",
                "placeholder:text-muted-foreground/50",
                mode === 'law'
                  ? "border-blue-500/20 focus:border-blue-500/50"
                  : "border-purple-500/20 focus:border-purple-500/50",
                (isStreaming || disabled) && "opacity-50 cursor-not-allowed"
              )}
              rows={1}
              disabled={isStreaming || disabled}
            />
          </div>

          {/* Submit/Stop button */}
          <button
            onClick={isStreaming ? onStop : handleSubmit}
            disabled={(!input.trim() && !isStreaming) || disabled}
            className={cn(
              "flex-shrink-0 p-3 rounded-full transition-all",
              "disabled:opacity-30 disabled:cursor-not-allowed",
              isStreaming
                ? "bg-red-500 hover:bg-red-600 text-white"
                : mode === 'law'
                  ? "bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/25"
                  : "bg-purple-500 hover:bg-purple-600 text-white shadow-lg shadow-purple-500/25"
            )}
          >
            {isStreaming ? (
              <Icon name="square" className="w-5 h-5" />
            ) : (
              <Icon name="arrow-up" className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Hint */}
        <p className="text-xs text-muted-foreground/60 text-center">
          <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px]">Enter</kbd> 전송
          <span className="mx-2">•</span>
          <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px]">Shift+Enter</kbd> 줄바꿈
        </p>
      </div>
    </div>
  )
}
