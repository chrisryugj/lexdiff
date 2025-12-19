/**
 * Chat UI 타입 정의
 */

export type MessageRole = 'user' | 'assistant' | 'system'
export type MessageStatus = 'thinking' | 'streaming' | 'complete' | 'error'
export type SearchMode = 'law' | 'ai'
export type AIStage = 'analyzing' | 'optimizing' | 'searching' | 'streaming' | 'complete'

export interface Citation {
  lawName: string
  articleNumber: string
  chunkText?: string
}

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: Date

  // AI 답변 전용
  status?: MessageStatus
  stage?: AIStage
  citations?: Citation[]

  // 메타데이터
  metadata?: {
    searchMode: SearchMode
    queryType?: string
    domain?: string
    keywords?: string[]
    processingTimeMs?: number
  }
}

export interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  currentStreamingId: string | null
  inputMode: SearchMode
}
