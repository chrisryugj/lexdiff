'use client'

import { useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { ChatMessage } from './ChatMessage'
import { WelcomeScreen } from './WelcomeScreen'
import type { ChatMessage as ChatMessageType, SearchMode } from './types'

interface ChatContainerProps {
  messages: ChatMessageType[]
  onExampleClick: (query: string, mode: SearchMode) => void
  className?: string
}

export function ChatContainer({
  messages,
  onExampleClick,
  className
}: ChatContainerProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const hasMessages = messages.length > 0

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex-1 overflow-y-auto",
        className
      )}
    >
      {!hasMessages ? (
        <WelcomeScreen onExampleClick={onExampleClick} />
      ) : (
        <div className="max-w-3xl mx-auto pb-4">
          {messages.map((message, index) => (
            <ChatMessage
              key={message.id}
              message={message}
              isLast={index === messages.length - 1}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}
