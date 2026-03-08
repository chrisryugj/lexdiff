'use client'

import { cn } from '@/lib/utils'
import { Icon } from '@/components/ui/icon'
import { StreamingText } from './StreamingText'
import { ThinkingIndicator, ThinkingDots } from './ThinkingIndicator'
import type { ChatMessage as ChatMessageType } from './types'
import ReactMarkdown from 'react-markdown'
import { m } from 'framer-motion'

interface ChatMessageProps {
  message: ChatMessageType
  isLast?: boolean
}

export function ChatMessage({ message, isLast }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const isThinking = message.status === 'thinking'
  const isStreaming = message.status === 'streaming'
  const isComplete = message.status === 'complete'

  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "flex gap-4 px-4 py-6",
        isUser ? "bg-transparent" : "bg-muted/30"
      )}
    >
      {/* Avatar */}
      <div className={cn(
        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
        isUser
          ? "bg-[#1a2b4c] dark:bg-muted"
          : "bg-primary"
      )}>
        {isUser ? (
          <Icon name="user" className="w-4 h-4 text-white" />
        ) : (
          <Icon name="bot" className="w-4 h-4 text-white" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* Role label */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {isUser ? '질문' : 'AI 법령 해설'}
          </span>
          {!isUser && message.metadata?.queryType && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {message.metadata.queryType}
            </span>
          )}
        </div>

        {/* Message content */}
        {isUser ? (
          <p className="text-foreground">{message.content}</p>
        ) : (
          <div className="space-y-4">
            {/* Thinking indicator */}
            {isThinking && message.stage && (
              <ThinkingIndicator stage={message.stage} />
            )}

            {/* Streaming/Complete content */}
            {(isStreaming || isComplete) && message.content && (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                {isStreaming && isLast ? (
                  <StreamingText
                    text={message.content}
                    isStreaming={true}
                    className="whitespace-pre-wrap"
                  />
                ) : (
                  <ReactMarkdown
                    components={{
                      h2: ({ children }) => (
                        <h2 className="text-lg font-bold text-foreground mt-6 mb-3 first:mt-0">
                          {children}
                        </h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
                          {children}
                        </h3>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-bold text-primary">{children}</strong>
                      ),
                      ul: ({ children }) => (
                        <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>
                      ),
                      li: ({ children }) => (
                        <li className="text-muted-foreground">{children}</li>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-4 border-primary/50 pl-4 py-2 my-3 bg-muted/50 rounded-r-lg">
                          {children}
                        </blockquote>
                      ),
                      code: ({ children }) => (
                        <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">
                          {children}
                        </code>
                      ),
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                )}
              </div>
            )}

            {/* Thinking placeholder */}
            {isThinking && !message.content && (
              <div className="flex items-center text-muted-foreground">
                <span>생각하는 중</span>
                <ThinkingDots />
              </div>
            )}

            {/* Citations */}
            {isComplete && message.citations && message.citations.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border/50">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Icon name="scale" className="w-4 h-4" />
                  <span>참조 법령</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {message.citations.map((citation, i) => (
                    <button
                      key={i}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                                bg-muted hover:bg-muted/80 text-sm transition-colors
                                border border-border/50 hover:border-primary/50"
                    >
                      <span>「{citation.lawName}」 {citation.articleNumber}</span>
                      <Icon name="external-link" className="w-3 h-3 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Metadata */}
            {isComplete && message.metadata?.processingTimeMs && (
              <div className="text-xs text-muted-foreground/60">
                {(message.metadata.processingTimeMs / 1000).toFixed(1)}초 소요
              </div>
            )}
          </div>
        )}
      </div>
    </m.div>
  )
}
