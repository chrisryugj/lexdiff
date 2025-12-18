'use client'

import { useState, useCallback, useRef } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Settings, Star, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import {
  ChatContainer,
  ChatInput,
  type ChatMessage,
  type SearchMode,
  type AIStage
} from '@/components/chat'

// Mock AI response for demo
const MOCK_AI_RESPONSES: Record<string, string> = {
  '관세법 신고납부 요건이 뭐야?': `## 결론

관세법상 신고납부 요건은 **납세의무자**, **과세물건**, **납부기한** 3가지 요소를 충족해야 합니다.

## 적극적 요건 (충족해야 할 것)

### 요건 1: 납세의무자
- **기준**: 수입물품의 화주, 수입 신고인 (「관세법」 제19조)
- **입증책임**: 세관장
- **판단 시점**: 수입 신고일

### 요건 2: 과세물건
- **기준**: 수입물품 (「관세법」 제14조)
- **입증책임**: 납세의무자

### 요건 3: 납부기한
- **기준**: 수입신고 수리일로부터 15일 이내 (「관세법」 제38조)
- **입증책임**: 납세의무자

## 소극적 요건 (결격사유)
- ❌ **관세 면제 대상**: 외교관 물품, 여행자 면세품 등 (「관세법」 제88조)
- ❌ **관세 감면 대상**: FTA 협정 적용 물품 등

## 주의사항
- ⚠️ 신고납부 기한 도과 시 가산세 부과
- ⚠️ 성실 신고 의무 위반 시 가산세 추가`,

  '징계처분과 해임의 차이': `## 핵심 차이 (3줄 요약)
- **징계처분**은 공무원 신분을 유지하면서 받는 제재
- **해임**은 공무원 신분이 박탈되는 중징계의 일종
- 해임은 3년간 공무원 재임용 제한

## 상세 비교표

| 비교 항목 | 징계처분 | 해임 |
|-----------|---------|------|
| **정의** | 의무 위반에 대한 제재 | 신분 박탈 중징계 |
| **근거 법령** | 「국가공무원법」 제78조 | 「국가공무원법」 제79조 |
| **신분** | 유지 | **박탈** |
| **재임용 제한** | 없음 (파면 제외) | **3년** |
| **퇴직금** | 전액 지급 | 전액 지급 |

## 징계처분의 특징
### 종류
- 경징계: 견책, 감봉, 정직
- 중징계: 강등, **해임**, 파면

## 해임의 특징
### 효과
- 공무원 신분 즉시 상실
- 3년간 공무원 재임용 불가
- 퇴직금은 전액 지급 (파면과 차이)

## 선택 가이드
### 해임이 적용되는 경우
- 비위 정도가 중하나 파면까지는 아닌 경우
- 성실의무 위반이 중대한 경우`,

  '지방세 감면 특례 대상은?': `## 결론
- **예외/면제 적용**: 가능 (조건부)
- **면제 유형**: 완전 면제 또는 일부 감면
- **근거**: 「지방세특례제한법」 제4조~제92조

## 원칙 vs 예외 구조

### 원칙 (일반 규정)
- **적용 대상**: 모든 납세의무자
- **내용**: 지방세 전액 납부 의무
- **근거**: 「지방세기본법」 제34조

### 예외 (특례 규정)
- **적용 대상**: 법정 감면 대상자
- **내용**: 전부 또는 일부 면제
- **근거**: 「지방세특례제한법」 각 조항

## 면제/감면 요건

### 적격 요건 (모두 충족 필요)
1. **법정 감면 대상**: 서민주거 안정, 중소기업, 농어업 등
   - 증빙: 해당 증명서
2. **감면 신청**: 납세기한 내 신청
   - 증빙: 감면 신청서
3. **사후관리 의무 준수**: 목적 외 사용 금지

### 배제 사유 (하나라도 해당 시 불가)
- ❌ 감면 후 목적 외 사용
- ❌ 허위 신청

## 면제/감면 범위

| 구분 | 면제/감면 내용 | 적용 대상 |
|------|---------------|----------|
| 완전 면제 | 100% | 국가유공자, 장애인 등 |
| 50% 감면 | 50% | 중소기업 창업, 농어업 등 |
| 특례 세율 | 0.1~2% | 서민주택, 신혼부부 등 |

## 주의사항
- ⚠️ 감면 후 5년 내 목적 외 사용 시 추징
- ⚠️ 가산세 포함 추징 가능`,

  'default': `## 답변

입력하신 질문에 대해 관련 법령을 검색하고 분석했습니다.

### 핵심 내용
해당 질문은 법률적 검토가 필요한 사안입니다. 구체적인 상황에 따라 적용되는 법령이 달라질 수 있습니다.

### 권장 행동
1. 관련 법령 원문 확인
2. 필요시 전문가 상담
3. 관할 기관 문의

### 참고
- 이 답변은 AI가 생성한 일반적인 법률 정보입니다
- 구체적인 법률 자문은 변호사와 상담하세요`
}

// Mock law search results
const MOCK_LAW_CONTENT = `## 「관세법」 제38조 (신고납부)

> ① 납세의무자는 수입신고를 할 때 세관장에게 해당 물품에 부과될 관세의 세율 및 세액을 신고하여야 한다.
>
> ② 제1항에 따라 신고한 납세의무자는 수입신고가 수리되기 전까지 세관장에게 해당 물품에 부과될 관세를 납부하여야 한다. 다만, 담보를 제공하면 수입신고 수리일부터 15일 이내에 납부할 수 있다.

### 조문 해설

**신고납부제도**란 납세의무자가 스스로 세액을 계산하여 신고하고 납부하는 제도입니다.

#### 핵심 포인트
- 수입신고 시 세율 및 세액 신고 의무
- 원칙: 수입신고 수리 전 납부
- 예외: 담보 제공 시 15일 이내 납부

### 관련 조문
- 「관세법」 제38조의2 (수정신고)
- 「관세법」 제38조의3 (경정청구)
- 「관세법」 제39조 (부과고지)`

export default function TestChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [inputMode, setInputMode] = useState<SearchMode>('ai')
  const abortRef = useRef(false)

  // Generate unique ID
  const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

  // Simulate streaming text
  const simulateStreaming = useCallback(async (
    messageId: string,
    fullText: string,
    onUpdate: (text: string) => void,
    onComplete: () => void
  ) => {
    const words = fullText.split(' ')
    let currentText = ''

    for (let i = 0; i < words.length; i++) {
      if (abortRef.current) break

      currentText += (i === 0 ? '' : ' ') + words[i]
      onUpdate(currentText)

      // Variable delay for natural feel
      const delay = Math.random() * 30 + 10
      await new Promise(resolve => setTimeout(resolve, delay))
    }

    onComplete()
  }, [])

  // Handle message submission
  const handleSubmit = useCallback(async (text: string) => {
    abortRef.current = false
    const startTime = Date.now()

    // Add user message
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: new Date(),
      metadata: { searchMode: inputMode }
    }
    setMessages(prev => [...prev, userMessage])
    setIsStreaming(true)

    // Add assistant placeholder
    const assistantId = generateId()
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      status: 'thinking',
      stage: 'analyzing',
      metadata: {
        searchMode: inputMode,
        queryType: inputMode === 'ai' ? 'requirement' : undefined
      }
    }
    setMessages(prev => [...prev, assistantMessage])

    // Simulate AI stages
    const stages: AIStage[] = ['analyzing', 'optimizing', 'searching', 'streaming']

    for (const stage of stages) {
      if (abortRef.current) break

      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, stage } : m
      ))

      if (stage !== 'streaming') {
        await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 400))
      }
    }

    if (abortRef.current) {
      setIsStreaming(false)
      return
    }

    // Get response content
    const responseText = inputMode === 'law'
      ? MOCK_LAW_CONTENT
      : (MOCK_AI_RESPONSES[text] || MOCK_AI_RESPONSES['default'])

    // Update to streaming status
    setMessages(prev => prev.map(m =>
      m.id === assistantId ? { ...m, status: 'streaming' } : m
    ))

    // Simulate streaming
    await simulateStreaming(
      assistantId,
      responseText,
      (currentText) => {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: currentText } : m
        ))
      },
      () => {
        const processingTime = Date.now() - startTime
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? {
            ...m,
            status: 'complete',
            citations: inputMode === 'ai' ? [
              { lawName: '관세법', articleNumber: '제38조' },
              { lawName: '관세법', articleNumber: '제19조' },
            ] : undefined,
            metadata: {
              ...m.metadata,
              processingTimeMs: processingTime
            }
          } : m
        ))
        setIsStreaming(false)
      }
    )
  }, [inputMode, simulateStreaming])

  // Handle stop
  const handleStop = useCallback(() => {
    abortRef.current = true
    setIsStreaming(false)
    setMessages(prev => prev.map(m =>
      m.status === 'streaming' || m.status === 'thinking'
        ? { ...m, status: 'complete' }
        : m
    ))
  }, [])

  // Handle example click
  const handleExampleClick = useCallback((query: string, mode: SearchMode) => {
    setInputMode(mode)
    handleSubmit(query)
  }, [handleSubmit])

  // Reset chat
  const handleReset = useCallback(() => {
    setMessages([])
    setIsStreaming(false)
    abortRef.current = true
  }, [])

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-bold" style={{ fontFamily: 'GiantsInline, sans-serif' }}>
              LexDiff
            </h1>
            <p className="text-xs text-muted-foreground">Chat UI Demo</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleReset}
            className="rounded-full"
            title="대화 초기화"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full">
            <Star className="w-4 h-4" />
          </Button>
          <ThemeToggle />
          <Button variant="ghost" size="icon" className="rounded-full">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Chat area */}
      <ChatContainer
        messages={messages}
        onExampleClick={handleExampleClick}
      />

      {/* Input area */}
      <ChatInput
        onSubmit={handleSubmit}
        isStreaming={isStreaming}
        mode={inputMode}
        onModeChange={setInputMode}
        onStop={handleStop}
      />
    </div>
  )
}
