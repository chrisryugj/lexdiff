# AI 검색 UI/UX 개선 계획서 - LLM Chat Style

**작성일**: 2025-12-18
**Phase**: 12 (UI/UX Overhaul)
**우선순위**: 높음

---

## 1. 현재 상태 분석

### 1.1 현재 UI 흐름

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   홈 화면    │ → │  로딩 화면   │ → │  결과 화면   │
│ (검색창)     │    │ (프로그래스)  │    │ (법령/AI답변) │
└─────────────┘    └─────────────┘    └─────────────┘
     별도 페이지        전체화면 오버레이      별도 페이지
```

### 1.2 현재 문제점

| 문제 | 설명 | 영향 |
|------|------|------|
| **화면 전환** | 홈→로딩→결과가 완전히 분리됨 | 사용자 컨텍스트 유실 |
| **로딩 UX** | 전체화면 프로그래스바만 표시 | 대기 체감 시간 증가 |
| **스트리밍 미활용** | 답변 완료 후 일괄 표시 | LLM 특성 미반영 |
| **인터랙션 부재** | 로딩 중 사용자 액션 불가 | 수동적 대기 |
| **시각적 구분** | 법령/AI 모드 구분 미약 | 혼란 유발 |

### 1.3 참조 사례

**ChatGPT/Claude 스타일의 핵심 특징:**
- 단일 페이지에서 입력 → 스트리밍 → 완료
- 타이핑 애니메이션 (글자 단위 또는 단어 단위)
- 답변 생성 중에도 스크롤/복사 가능
- 명확한 질문-답변 쌍 구조

---

## 2. 개선 방향

### 2.1 LLM Chat Style UI 채택

```
┌─────────────────────────────────────────────────────────┐
│  LexDiff                              [설정] [즐겨찾기] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ 📝 관세법 신고납부 요건이 뭐야?                     │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ 🤖 AI 법령 해설                                    │ │
│  │                                                     │ │
│  │ ## 결론                                            │ │
│  │ 관세법상 신고납부 요건은 다음과 같습니다...▊        │ │
│  │                                                     │ │
│  │ ────────────────────────────────────────           │ │
│  │ 📚 참조: 「관세법」 제38조, 제38조의2               │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  [🔍 법령 검색] [🤖 AI 질문]  ──────────────  [전송 ▶] │
└─────────────────────────────────────────────────────────┘
```

### 2.2 핵심 변경사항

| Before | After |
|--------|-------|
| 3개 화면 분리 | **단일 페이지** 대화형 UI |
| 전체화면 로딩 | **인라인 스트리밍** 표시 |
| 일괄 답변 표시 | **실시간 타이핑** 애니메이션 |
| 프로그래스바 | **Skeleton + Typing cursor** |
| 별도 결과 페이지 | **채팅 스레드** 형태 |

---

## 3. 상세 설계

### 3.1 컴포넌트 구조

```
app/
└── page.tsx                    # 단일 페이지 앱

components/
└── chat/
    ├── ChatContainer.tsx       # 메인 채팅 컨테이너
    ├── ChatInput.tsx           # 하단 입력 영역
    ├── ChatMessage.tsx         # 개별 메시지 (질문/답변)
    ├── StreamingText.tsx       # 타이핑 애니메이션 컴포넌트
    ├── CitationCard.tsx        # 인용 법령 카드
    ├── ThinkingIndicator.tsx   # "생각 중..." 표시
    └── WelcomeScreen.tsx       # 초기 화면 (히어로 섹션)
```

### 3.2 메시지 타입 정의

```typescript
interface ChatMessage {
  id: string
  type: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date

  // AI 답변 전용
  status?: 'thinking' | 'streaming' | 'complete' | 'error'
  citations?: Citation[]
  queryType?: LegalQueryType
  routingInfo?: RoutingInfo

  // 메타데이터
  metadata?: {
    searchMode: 'law' | 'ai'
    processingTimeMs: number
    model?: string
  }
}

interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  currentStreamingId: string | null
  inputMode: 'law' | 'ai'  // 검색 모드
}
```

### 3.3 스트리밍 텍스트 애니메이션

```typescript
// components/chat/StreamingText.tsx

interface StreamingTextProps {
  text: string
  isStreaming: boolean
  speed?: 'slow' | 'normal' | 'fast'  // 20ms | 10ms | 5ms per char
  showCursor?: boolean
}

function StreamingText({
  text,
  isStreaming,
  speed = 'normal',
  showCursor = true
}: StreamingTextProps) {
  const [displayedText, setDisplayedText] = useState('')
  const [cursorVisible, setCursorVisible] = useState(true)

  // 타이핑 효과 (SSE 청크 단위로 실제 구현)
  useEffect(() => {
    // SSE에서 받은 text를 그대로 append
    setDisplayedText(text)
  }, [text])

  // 커서 깜빡임
  useEffect(() => {
    if (!isStreaming) return
    const interval = setInterval(() => {
      setCursorVisible(v => !v)
    }, 500)
    return () => clearInterval(interval)
  }, [isStreaming])

  return (
    <span>
      {displayedText}
      {isStreaming && showCursor && (
        <span className={cn(
          "inline-block w-2 h-5 bg-primary ml-0.5",
          cursorVisible ? "opacity-100" : "opacity-0"
        )} />
      )}
    </span>
  )
}
```

### 3.4 Thinking Indicator (AI Router 단계)

```typescript
// components/chat/ThinkingIndicator.tsx

function ThinkingIndicator({ stage }: { stage: AISearchStage }) {
  const stages = [
    { key: 'analyzing', label: '질문 분석 중', icon: Brain },
    { key: 'optimizing', label: '검색어 최적화 중', icon: Sparkles },
    { key: 'searching', label: '법령 검색 중', icon: Search },
    { key: 'streaming', label: '답변 생성 중', icon: Edit },
  ]

  const currentIndex = stages.findIndex(s => s.key === stage)

  return (
    <div className="flex items-center gap-3 text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" />
      <div className="flex items-center gap-2">
        {stages.map((s, i) => (
          <div
            key={s.key}
            className={cn(
              "flex items-center gap-1 text-xs",
              i < currentIndex && "text-green-500",
              i === currentIndex && "text-primary font-medium",
              i > currentIndex && "text-muted-foreground/50"
            )}
          >
            {i < currentIndex ? (
              <Check className="w-3 h-3" />
            ) : i === currentIndex ? (
              <s.icon className="w-3 h-3 animate-pulse" />
            ) : (
              <Circle className="w-3 h-3" />
            )}
            <span className="hidden sm:inline">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

### 3.5 Welcome Screen (초기 상태)

```typescript
// components/chat/WelcomeScreen.tsx

function WelcomeScreen({ onExampleClick }: { onExampleClick: (q: string) => void }) {
  const examples = [
    { icon: '📋', text: '관세법 신고납부 요건이 뭐야?', type: 'requirement' },
    { icon: '⚖️', text: '공무원 징계처분과 해임의 차이', type: 'comparison' },
    { icon: '📝', text: '행정심판 청구 절차 알려줘', type: 'procedure' },
    { icon: '💰', text: '지방세 감면 특례 대상은?', type: 'exemption' },
  ]

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-6"
      >
        <div className="flex items-center justify-center gap-3">
          <Scale className="w-12 h-12 text-primary" />
          <h1 className="text-4xl font-bold">LexDiff</h1>
        </div>
        <p className="text-lg text-muted-foreground">
          법령 검색부터 AI 분석까지
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 max-w-2xl">
          {examples.map((ex) => (
            <button
              key={ex.text}
              onClick={() => onExampleClick(ex.text)}
              className="flex items-center gap-3 p-4 rounded-xl border
                         hover:bg-accent hover:border-primary/50
                         transition-all text-left group"
            >
              <span className="text-2xl">{ex.icon}</span>
              <span className="text-sm text-muted-foreground group-hover:text-foreground">
                {ex.text}
              </span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
```

---

## 4. 레이아웃 설계

### 4.1 반응형 구조

```
┌─────────────────────────────────────────────────────────────┐
│ Desktop (1280px+)                                           │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │                    Chat Area (max-w-3xl)                │ │
│ │                                                         │ │
│ │  [Welcome Screen / Message Thread]                      │ │
│ │                                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │                    Input Bar (sticky bottom)            │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────┐
│ Mobile (< 768px)            │
│ ┌─────────────────────────┐ │
│ │ Compact Header          │ │
│ ├─────────────────────────┤ │
│ │                         │ │
│ │ Chat Messages           │ │
│ │ (full width)            │ │
│ │                         │ │
│ ├─────────────────────────┤ │
│ │ Input (fixed bottom)    │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

### 4.2 입력 영역 설계

```typescript
// components/chat/ChatInput.tsx

function ChatInput({
  onSubmit,
  isStreaming,
  mode,
  onModeChange
}: ChatInputProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [input])

  return (
    <div className="sticky bottom-0 bg-background/80 backdrop-blur-xl border-t p-4">
      <div className="max-w-3xl mx-auto">
        {/* 모드 선택 탭 */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => onModeChange('law')}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm transition-all",
              mode === 'law'
                ? "bg-blue-500 text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            🔍 법령 검색
          </button>
          <button
            onClick={() => onModeChange('ai')}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm transition-all",
              mode === 'ai'
                ? "bg-purple-500 text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            🤖 AI 질문
          </button>
        </div>

        {/* 입력 영역 */}
        <div className="relative flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  onSubmit(input)
                  setInput('')
                }
              }}
              placeholder={
                mode === 'law'
                  ? "법령명 또는 조문 검색 (예: 관세법 제38조)"
                  : "법률 질문을 입력하세요..."
              }
              className="w-full resize-none rounded-2xl border bg-muted/50
                        px-4 py-3 pr-12 text-sm
                        focus:ring-2 focus:ring-primary/50 focus:border-primary
                        max-h-32 overflow-y-auto"
              rows={1}
              disabled={isStreaming}
            />
          </div>
          <button
            onClick={() => {
              onSubmit(input)
              setInput('')
            }}
            disabled={!input.trim() || isStreaming}
            className="p-3 rounded-full bg-primary text-primary-foreground
                      hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed
                      transition-all"
          >
            {isStreaming ? (
              <Square className="w-5 h-5" /> // 중지 버튼
            ) : (
              <ArrowUp className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* 힌트 */}
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Enter로 전송 • Shift+Enter로 줄바꿈
        </p>
      </div>
    </div>
  )
}
```

---

## 5. 애니메이션 상세

### 5.1 메시지 진입 애니메이션

```typescript
const messageVariants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.95
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.3,
      ease: [0.16, 1, 0.3, 1]  // Apple easing
    }
  }
}
```

### 5.2 타이핑 커서 애니메이션

```css
@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.typing-cursor {
  animation: blink 1s infinite;
}
```

### 5.3 Thinking 도트 애니메이션

```typescript
function ThinkingDots() {
  return (
    <span className="inline-flex gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-primary"
          style={{
            animation: `bounce 1.4s infinite ease-in-out both`,
            animationDelay: `${i * 0.16}s`
          }}
        />
      ))}
    </span>
  )
}
```

---

## 6. 데이터 흐름

### 6.1 SSE 스트리밍 개선

```typescript
// 현재: 청크를 state에 append
// 개선: 메시지 객체의 content를 직접 업데이트

async function handleAISearch(query: string) {
  // 1. 사용자 메시지 추가
  const userMessage = createMessage('user', query)
  addMessage(userMessage)

  // 2. AI 응답 placeholder 추가
  const aiMessage = createMessage('assistant', '', { status: 'thinking' })
  addMessage(aiMessage)

  // 3. AI Router 호출 (Phase 10)
  updateMessageStatus(aiMessage.id, 'thinking')

  // 4. SSE 스트리밍 시작
  const eventSource = new EventSource(`/api/file-search-rag?q=${encodeURIComponent(query)}`)

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data)

    if (data.stage) {
      // 단계 업데이트 (analyzing → optimizing → searching → streaming)
      updateMessageMeta(aiMessage.id, { stage: data.stage })
    }

    if (data.text) {
      // 텍스트 스트리밍
      updateMessageStatus(aiMessage.id, 'streaming')
      appendMessageContent(aiMessage.id, data.text)
    }

    if (data.citations) {
      // Citation 추가
      updateMessageMeta(aiMessage.id, { citations: data.citations })
    }

    if (data === '[DONE]') {
      updateMessageStatus(aiMessage.id, 'complete')
      eventSource.close()
    }
  }
}
```

---

## 7. 마이그레이션 계획

### 7.1 단계별 구현

| 단계 | 작업 | 예상 시간 | 기존 호환성 |
|------|------|-----------|------------|
| **Phase 12-A** | ChatContainer, ChatMessage 기본 구조 | 3h | 병렬 운영 |
| **Phase 12-B** | StreamingText, ThinkingIndicator | 2h | - |
| **Phase 12-C** | ChatInput, 모드 전환 | 2h | - |
| **Phase 12-D** | WelcomeScreen, 예시 질문 | 1h | - |
| **Phase 12-E** | 기존 search-result-view 통합 | 3h | 점진적 전환 |
| **Phase 12-F** | 법령 검색 결과 Chat 스타일로 | 2h | - |
| **Phase 12-G** | 애니메이션 polish | 2h | - |
| **합계** | | **15h** | |

### 7.2 호환성 전략

```typescript
// 설정에서 UI 모드 선택 가능
const UI_MODE = process.env.NEXT_PUBLIC_UI_MODE || 'chat'  // 'chat' | 'classic'

// page.tsx
export default function Home() {
  const uiMode = useUIMode()

  if (uiMode === 'chat') {
    return <ChatUI />
  } else {
    return <ClassicUI />  // 현재 SearchViewImproved + SearchResultView
  }
}
```

---

## 8. 예상 결과

### 8.1 Before vs After

| 항목 | Before | After |
|------|--------|-------|
| 화면 전환 | 3개 화면 (홈/로딩/결과) | **단일 페이지** |
| 로딩 체감 | 프로그래스바 대기 | **실시간 타이핑** 피드백 |
| 인터랙션 | 수동적 대기 | **스크롤/복사** 가능 |
| 컨텍스트 | 질문 기억 어려움 | **대화 히스토리** 유지 |
| 모바일 UX | 화면 전환 잦음 | **자연스러운** 스크롤 |

### 8.2 참고 UI 벤치마크

- [ChatGPT](https://chat.openai.com) - 스트리밍 타이핑, 대화형
- [Claude](https://claude.ai) - 깔끔한 답변 카드, Artifacts
- [Perplexity](https://perplexity.ai) - 인용 소스 표시, 검색+AI 결합
- [Gemini](https://gemini.google.com) - 단계별 Thinking 표시

---

## 9. 참고 자료

### 9.1 2025 UI 트렌드

- [25 Web Design Trends 2025](https://dev.to/watzon/25-web-design-trends-to-watch-in-2025-e83)
- [UI Design Trends 2025 - Lummi](https://www.lummi.ai/blog/ui-design-trends-2025)
- [Pixelmatters UI Trends](https://www.pixelmatters.com/insights/8-ui-design-trends-2025)

### 9.2 LLM UI 구현 참조

- [ChatGPT-like Streaming with tRPC](https://dev.to/mikan3rd/typescript-displaying-chatgpt-like-streaming-responses-with-trpc-in-react-3mnb)
- [Claude Streaming Implementation](https://medium.com/@PowerUpSkills/building-with-claude-ai-real-time-streaming-interactive-response-handling-part-5-of-6-d775713fdb55)
- [Claude Artifacts UI Visualization](https://blog.logrocket.com/implementing-claudes-artifacts-feature-ui-visualization/)

---

## 10. 결론

**핵심 개선 포인트:**

1. ✅ **단일 페이지 대화형 UI** - 화면 전환 제거
2. ✅ **실시간 스트리밍 타이핑** - LLM 특성 살림
3. ✅ **Thinking Indicator** - AI Router 단계 시각화
4. ✅ **대화 히스토리** - 컨텍스트 유지
5. ✅ **모드 전환 탭** - 법령/AI 검색 명확한 구분

**예상 효과:**
- 사용자 체감 대기 시간 50% 감소
- 페이지 이탈률 감소
- 모바일 UX 대폭 개선
- 모던하고 세련된 이미지
