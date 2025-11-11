# Phase 9 Pro: Small RAG 기반 법령 분석 시스템

## 🎯 목표

**"광진구와 성동구의 4차산업 관련 조례를 분석, 비교해줘"** 같은 자연어 질문에 대해:
1. AI가 질문을 분석하여 필요한 법령/조례 파악
2. 자동으로 관련 데이터 수집
3. 수집된 데이터를 RAG 컨텍스트로 활용
4. NotebookLM처럼 세션 기반으로 심층 분석 제공

---

## 🏗️ 전체 아키�ecture

```
┌─────────────────────────────────────────────────────────────┐
│  User Input: "광진구와 성동구의 4차산업 관련 조례 비교"      │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 1: 자연어 모드 자동 감지 (Query Classifier)           │
│  - 일반 검색: "관세법 38조"                                  │
│  - RAG 모드: "비교해줘", "분석해줘", "차이점은?" 등         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 2: AI 기반 의도 분석 (Intent Analyzer)                │
│  → Gemini Flash: 질문 분석 + 필요 데이터 식별              │
│                                                             │
│  Output:                                                    │
│  {                                                          │
│    "intent": "compare_laws",                                │
│    "targets": [                                             │
│      { "type": "조례", "region": "광진구", "keyword": "4차산업" },│
│      { "type": "조례", "region": "성동구", "keyword": "4차산업" } │
│    ],                                                       │
│    "analysisType": "comparative",                           │
│    "focusAreas": ["정의", "지원대상", "지원내용", "예산"]   │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 3: 자동 데이터 수집 (Data Collector)                  │
│                                                             │
│  For each target:                                           │
│    1. 검색어 정규화: "광진구 4차산업" → API 검색어          │
│    2. /api/ordin-search 호출                                │
│    3. 관련 조례 목록 획득                                   │
│    4. 가장 관련성 높은 조례 선택 (AI 또는 키워드 매칭)       │
│    5. /api/ordin 호출하여 전문 다운로드                     │
│                                                             │
│  Progress UI:                                               │
│  [████████░░] 80% 데이터 수집 중...                         │
│  ✅ 광진구 4차산업 진흥 조례 (5개 조문)                      │
│  ⏳ 성동구 관련 조례 검색 중...                             │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 4: 세션 컨텍스트 저장 (Session Store)                 │
│                                                             │
│  Storage: IndexedDB (세션 단위)                             │
│  Database: LexDiffRAGSessions                               │
│                                                             │
│  Structure:                                                 │
│  {                                                          │
│    sessionId: "sess_1699123456",                            │
│    createdAt: timestamp,                                    │
│    query: "광진구와 성동구의...",                           │
│    sources: [                                               │
│      {                                                      │
│        id: "source_1",                                      │
│        type: "ordinance",                                   │
│        title: "광진구 4차산업혁명 대응 산업진흥 조례",       │
│        content: "제1조(목적) 이 조례는...",                 │
│        metadata: { region: "광진구", totalArticles: 15 }    │
│      },                                                     │
│      {                                                      │
│        id: "source_2",                                      │
│        type: "ordinance",                                   │
│        title: "성동구 4차산업혁명 대응 조례",               │
│        content: "제1조(목적) ...",                          │
│        metadata: { region: "성동구", totalArticles: 12 }    │
│      }                                                      │
│    ],                                                       │
│    chatHistory: []                                          │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 5: RAG 기반 분석 (RAG Analyzer)                       │
│                                                             │
│  Prompt to Gemini 2.5 Flash:                                │
│  """                                                        │
│  당신은 법령 분석 전문가입니다.                              │
│                                                             │
│  # 제공된 소스 자료                                          │
│                                                             │
│  ## 소스 1: 광진구 4차산업혁명 대응 산업진흥 조례            │
│  ```                                                        │
│  제1조(목적) 이 조례는 광진구의 4차 산업혁명에 대응하여...  │
│  제2조(정의) ...                                            │
│  제3조(지원대상) ...                                        │
│  [전체 조문 내용]                                           │
│  ```                                                        │
│                                                             │
│  ## 소스 2: 성동구 4차산업혁명 대응 조례                     │
│  ```                                                        │
│  제1조(목적) ...                                            │
│  [전체 조문 내용]                                           │
│  ```                                                        │
│                                                             │
│  # 사용자 질문                                               │
│  "광진구와 성동구의 4차산업 관련 조례를 분석, 비교해줘"      │
│                                                             │
│  # 분석 지침                                                 │
│  1. 두 조례의 목적과 취지 비교                               │
│  2. 지원 대상의 차이점 분석                                  │
│  3. 지원 내용 및 방법 비교                                   │
│  4. 예산 및 재원 조달 방식 비교                              │
│  5. 특징적인 조항 및 차별화 포인트                           │
│  6. 실효성 및 개선 제안                                      │
│                                                             │
│  마크다운 형식으로 구조화된 분석 결과를 제공하세요.          │
│  """                                                        │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 6: 스트리밍 응답 (Streaming Response)                 │
│                                                             │
│  UI에 실시간으로 AI 분석 결과 표시:                          │
│                                                             │
│  ┌───────────────────────────────────────┐                 │
│  │ 📊 분석 결과                           │                 │
│  │                                       │                 │
│  │ ## 1. 조례 목적 비교                   │                 │
│  │                                       │                 │
│  │ **광진구**: 4차 산업혁명 대응을 통한   │                 │
│  │ 지역 산업 경쟁력 강화...              │                 │
│  │                                       │                 │
│  │ **성동구**: 4차 산업혁명 시대의 신산업 │                 │
│  │ 육성과 일자리 창출...                 │                 │
│  │                                       │                 │
│  │ [계속 스트리밍...]                    │                 │
│  └───────────────────────────────────────┘                 │
│                                                             │
│  하단 소스 표시:                                            │
│  📄 참고한 자료 (2)                                         │
│  - 광진구 4차산업혁명 대응 산업진흥 조례 (15개 조문)         │
│  - 성동구 4차산업혁명 대응 조례 (12개 조문)                 │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 7: 후속 질문 지원 (Follow-up Q&A)                     │
│                                                             │
│  사용자: "광진구의 지원 예산은 얼마야?"                      │
│  → 동일 세션 컨텍스트 유지                                  │
│  → 이미 수집된 소스에서 답변                                │
│  → 추가 데이터 수집 불필요                                  │
│                                                             │
│  사용자: "강남구도 추가해서 3개 비교해줘"                    │
│  → 강남구 조례만 추가 수집                                  │
│  → 세션에 소스 추가                                         │
│  → 3개 조례 비교 분석 재실행                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔍 Step 1: 자연어 모드 자동 감지

### 감지 로직

```typescript
// lib/query-classifier.ts

interface QueryClassification {
  mode: 'simple-search' | 'rag-analysis'
  confidence: number
  reasoning: string
}

/**
 * 입력된 쿼리가 일반 검색인지 RAG 모드인지 자동 감지
 */
export function classifyQuery(query: string): QueryClassification {
  // 1. 명확한 일반 검색 패턴
  const simpleSearchPatterns = [
    /^[\w\s]+\s*\d+조$/,              // "관세법 38조"
    /^[\w\s]+$/,                      // "관세법" (단일 법령명)
    /^제\d+조/,                       // "제38조"
  ]

  for (const pattern of simpleSearchPatterns) {
    if (pattern.test(query.trim())) {
      return {
        mode: 'simple-search',
        confidence: 0.95,
        reasoning: '조문 번호 또는 단일 법령명 패턴 감지'
      }
    }
  }

  // 2. RAG 모드 트리거 키워드
  const ragKeywords = [
    // 분석 요청
    '분석', '분석해', '분석해줘', '분석하라',
    // 비교 요청
    '비교', '비교해', '비교해줘', '차이', '차이점',
    // 설명 요청
    '설명해', '알려줘', '무엇', '어떻게', '왜',
    // 찾기 요청
    '찾아줘', '검색해줘',
    // 질문 형태
    '?', '？',
    // 관계 분석
    '관련', '연관', '영향',
    // 복수 대상
    '들을', '들의', '와/과',
  ]

  const hasRagKeyword = ragKeywords.some(keyword =>
    query.includes(keyword)
  )

  // 3. 복잡도 분석
  const wordCount = query.split(/\s+/).length
  const hasMultipleEntities = (query.match(/\w+구|시|도/g) || []).length > 1

  // 4. 최종 판단
  if (hasRagKeyword || wordCount > 5 || hasMultipleEntities) {
    return {
      mode: 'rag-analysis',
      confidence: hasRagKeyword ? 0.9 : 0.7,
      reasoning: hasRagKeyword
        ? 'RAG 키워드 감지'
        : '복잡한 쿼리 패턴 (긴 문장 또는 복수 대상)'
    }
  }

  // 5. 애매한 경우 → 사용자에게 물어보기
  return {
    mode: 'simple-search',
    confidence: 0.5,
    reasoning: '명확하지 않음 - 일반 검색으로 우선 처리'
  }
}
```

### UI: 모드 전환 안내

```typescript
// 신뢰도가 낮을 때 (0.5~0.7) 사용자에게 확인
if (classification.confidence < 0.7) {
  showModeSelector({
    query,
    suggestion: '이 질문은 AI 분석이 필요할 수 있습니다.',
    options: [
      { mode: 'simple-search', label: '일반 검색' },
      { mode: 'rag-analysis', label: 'AI 분석 (추천)' },
    ]
  })
}
```

---

## 🧠 Step 2: AI 기반 의도 분석

### Intent Analyzer

```typescript
// lib/intent-analyzer.ts

interface AnalysisIntent {
  intent: 'compare_laws' | 'explain_law' | 'find_related' | 'summarize'
  targets: DataTarget[]
  analysisType: 'comparative' | 'explanatory' | 'summary'
  focusAreas?: string[]
  additionalContext?: string
}

interface DataTarget {
  type: 'law' | 'ordinance' | 'decree' | 'rule'
  identifier?: string        // 법령명 (명확한 경우)
  region?: string            // 지역 (조례인 경우)
  keywords?: string[]        // 검색 키워드
  confidence: number
}

async function analyzeIntent(query: string): Promise<AnalysisIntent> {
  const prompt = `
당신은 법령 검색 의도 분석 전문가입니다.

사용자 질문: "${query}"

질문을 분석하여 다음 정보를 JSON으로 추출하세요:

1. **intent**: 사용자의 주요 의도
   - "compare_laws": 여러 법령 비교
   - "explain_law": 특정 법령 설명
   - "find_related": 관련 법령 찾기
   - "summarize": 법령 요약

2. **targets**: 필요한 데이터 목록
   각 항목:
   - type: "law" (법률), "ordinance" (조례), "decree" (시행령), "rule" (시행규칙)
   - identifier: 명확한 법령명 (있는 경우)
   - region: 지역명 (조례인 경우, 예: "광진구")
   - keywords: 검색에 필요한 키워드 배열 (예: ["4차산업", "진흥"])
   - confidence: 0~1 (이 데이터가 필요한 확신도)

3. **analysisType**: 분석 유형
   - "comparative": 비교 분석
   - "explanatory": 설명
   - "summary": 요약

4. **focusAreas**: 분석 시 집중할 영역 (선택사항)
   예: ["목적", "지원대상", "지원내용", "예산"]

5. **additionalContext**: 추가 컨텍스트 (선택사항)

# 응답 예시

사용자 질문: "광진구와 성동구의 4차산업 관련 조례를 분석, 비교해줘"

\`\`\`json
{
  "intent": "compare_laws",
  "targets": [
    {
      "type": "ordinance",
      "region": "광진구",
      "keywords": ["4차산업", "산업진흥", "혁신"],
      "confidence": 0.95
    },
    {
      "type": "ordinance",
      "region": "성동구",
      "keywords": ["4차산업", "산업진흥", "혁신"],
      "confidence": 0.95
    }
  ],
  "analysisType": "comparative",
  "focusAreas": ["목적", "정의", "지원대상", "지원내용", "예산", "시행일"]
}
\`\`\`

이제 실제 사용자 질문을 분석하고 JSON만 응답하세요.
`

  const response = await callGeminiFlash(prompt)
  return JSON.parse(response)
}
```

---

## 📦 Step 3: 자동 데이터 수집

### Data Collector

```typescript
// lib/rag-data-collector.ts

interface CollectedSource {
  id: string
  type: 'law' | 'ordinance' | 'decree' | 'rule'
  title: string
  content: string      // 전문 텍스트
  articles: LawArticle[]
  metadata: {
    region?: string
    lawId?: string
    effectiveDate?: string
    totalArticles: number
    collectedAt: number
  }
}

async function collectData(
  targets: DataTarget[],
  onProgress?: (progress: CollectionProgress) => void
): Promise<CollectedSource[]> {
  const sources: CollectedSource[] = []

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]

    onProgress?.(createProgress(i, targets.length, `${target.region || target.identifier} 검색 중...`))

    try {
      if (target.type === 'ordinance') {
        // 조례 검색
        const source = await collectOrdinance(target)
        sources.push(source)
      } else if (target.type === 'law') {
        // 법률 검색
        const source = await collectLaw(target)
        sources.push(source)
      }

      onProgress?.(createProgress(i + 1, targets.length, `✅ ${sources[sources.length - 1].title}`))

    } catch (error) {
      console.error(`Failed to collect: ${target.identifier || target.keywords}`, error)
      onProgress?.(createProgress(i + 1, targets.length, `❌ 수집 실패`))
    }
  }

  return sources
}

async function collectOrdinance(target: DataTarget): Promise<CollectedSource> {
  // 1. 검색어 생성
  const searchQuery = [
    target.region,
    ...(target.keywords || [])
  ].filter(Boolean).join(' ')

  // 2. 조례 검색
  const searchResults = await fetch(
    `/api/ordin-search?query=${encodeURIComponent(searchQuery)}`
  ).then(r => r.json())

  if (!searchResults.list || searchResults.list.length === 0) {
    throw new Error(`No ordinance found for: ${searchQuery}`)
  }

  // 3. 가장 관련성 높은 조례 선택
  const bestMatch = await selectBestMatch(searchResults.list, target.keywords || [])

  // 4. 조례 전문 다운로드
  const fullContent = await fetch(
    `/api/ordin?ordinSeq=${bestMatch.ordinSeq}`
  ).then(r => r.json())

  // 5. 파싱
  const articles = parseOrdinanceArticles(fullContent)
  const contentText = articles.map(a =>
    `${a.joNum}\n${a.content}`
  ).join('\n\n')

  return {
    id: `source_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'ordinance',
    title: fullContent.title,
    content: contentText,
    articles,
    metadata: {
      region: target.region,
      ordinSeq: bestMatch.ordinSeq,
      totalArticles: articles.length,
      collectedAt: Date.now()
    }
  }
}

async function selectBestMatch(
  candidates: any[],
  keywords: string[]
): Promise<any> {
  if (candidates.length === 1) return candidates[0]

  // AI로 가장 관련성 높은 것 선택
  const prompt = `
다음 조례 중 "${keywords.join(', ')}"와 가장 관련성 높은 것을 선택하세요.

후보 목록:
${candidates.map((c, i) => `${i + 1}. ${c.ordinNm}`).join('\n')}

가장 관련성 높은 번호만 응답하세요 (1-${candidates.length}):
`

  const response = await callGeminiFlash(prompt)
  const selectedIndex = parseInt(response.trim()) - 1

  return candidates[selectedIndex] || candidates[0]
}
```

### Progress UI

```typescript
// components/rag-collection-progress.tsx

interface CollectionProgress {
  current: number
  total: number
  message: string
  sources: CollectedSource[]
}

export function RAGCollectionProgress({ progress }: { progress: CollectionProgress }) {
  const percentage = (progress.current / progress.total) * 100

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>데이터 수집 중...</span>
          <span>{progress.current} / {progress.total}</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <p className="text-sm text-gray-600">{progress.message}</p>
      </div>

      {/* Collected Sources */}
      <div className="space-y-2">
        <h4 className="font-medium">수집된 자료</h4>
        <div className="space-y-1">
          {progress.sources.map(source => (
            <div key={source.id} className="flex items-center gap-2 text-sm">
              <span className="text-green-600">✓</span>
              <span>{source.title}</span>
              <span className="text-gray-500">({source.metadata.totalArticles}개 조문)</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

---

## 💾 Step 4: 세션 컨텍스트 저장

### Session Store (IndexedDB)

```typescript
// lib/rag-session-store.ts

interface RAGSession {
  sessionId: string
  createdAt: number
  lastActivityAt: number
  originalQuery: string
  intent: AnalysisIntent
  sources: CollectedSource[]
  chatHistory: ChatMessage[]
  metadata?: {
    totalTokens?: number
    analysisCount?: number
  }
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

class RAGSessionStore {
  private dbName = 'LexDiffRAGSessions'
  private storeName = 'sessions'
  private db: IDBDatabase | null = null

  async init() {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'sessionId' })
          store.createIndex('createdAt', 'createdAt', { unique: false })
          store.createIndex('lastActivityAt', 'lastActivityAt', { unique: false })
        }
      }
    })
  }

  async createSession(query: string, intent: AnalysisIntent, sources: CollectedSource[]): Promise<RAGSession> {
    const session: RAGSession = {
      sessionId: `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      originalQuery: query,
      intent,
      sources,
      chatHistory: []
    }

    await this.saveSession(session)
    return session
  }

  async saveSession(session: RAGSession): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.put(session)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getSession(sessionId: string): Promise<RAGSession | null> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.get(sessionId)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }

  async addMessage(sessionId: string, message: ChatMessage): Promise<void> {
    const session = await this.getSession(sessionId)
    if (!session) throw new Error('Session not found')

    session.chatHistory.push(message)
    session.lastActivityAt = Date.now()

    await this.saveSession(session)
  }

  async addSource(sessionId: string, source: CollectedSource): Promise<void> {
    const session = await this.getSession(sessionId)
    if (!session) throw new Error('Session not found')

    session.sources.push(source)
    session.lastActivityAt = Date.now()

    await this.saveSession(session)
  }

  async listSessions(): Promise<RAGSession[]> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const index = store.index('lastActivityAt')
      const request = index.openCursor(null, 'prev') // 최근 활동 순

      const sessions: RAGSession[] = []

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          sessions.push(cursor.value)
          cursor.continue()
        } else {
          resolve(sessions)
        }
      }

      request.onerror = () => reject(request.error)
    })
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.delete(sessionId)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async cleanupOldSessions(maxAge: number = 24 * 60 * 60 * 1000): Promise<number> {
    const sessions = await this.listSessions()
    const now = Date.now()
    let deleted = 0

    for (const session of sessions) {
      if (now - session.lastActivityAt > maxAge) {
        await this.deleteSession(session.sessionId)
        deleted++
      }
    }

    return deleted
  }
}

export const ragSessionStore = new RAGSessionStore()
```

---

## 🤖 Step 5: RAG 기반 분석

### RAG Analyzer

```typescript
// lib/rag-analyzer.ts

interface RAGAnalysisResult {
  content: string        // 마크다운 분석 결과
  usage?: {
    inputTokens: number
    outputTokens: number
  }
}

async function analyzeWithRAG(
  session: RAGSession,
  userQuery?: string     // 후속 질문 (선택사항)
): Promise<RAGAnalysisResult> {
  const query = userQuery || session.originalQuery

  // 1. 소스 데이터를 프롬프트에 포함
  const sourcesContext = session.sources.map((source, index) => `
## 소스 ${index + 1}: ${source.title}

**메타데이터**:
- 종류: ${source.type === 'ordinance' ? '조례' : '법률'}
${source.metadata.region ? `- 지역: ${source.metadata.region}` : ''}
- 조문 수: ${source.metadata.totalArticles}개

**전문**:
\`\`\`
${source.content}
\`\`\`
`).join('\n\n---\n\n')

  // 2. 대화 히스토리 포함 (후속 질문인 경우)
  const chatContext = session.chatHistory.length > 0
    ? `\n\n# 이전 대화\n\n${session.chatHistory.map(msg =>
        `**${msg.role === 'user' ? '사용자' : 'AI'}**: ${msg.content}`
      ).join('\n\n')}`
    : ''

  // 3. 프롬프트 구성
  const prompt = `
당신은 법령 분석 전문가입니다. 제공된 소스 자료를 바탕으로 사용자의 질문에 답변하세요.

# 제공된 소스 자료

${sourcesContext}
${chatContext}

# 사용자 질문

"${query}"

# 분석 지침

${getAnalysisGuidelines(session.intent)}

# 응답 형식

마크다운 형식으로 구조화된 분석 결과를 제공하세요.

- 명확한 제목과 소제목 사용
- 표를 활용한 비교 (가능한 경우)
- 중요한 조문은 인용
- 객관적이고 전문적인 톤 유지
- 근거를 명시 (어느 소스의 어느 조문 참조)

**중요**: 제공된 소스 자료에 근거하여 답변하세요. 추측이나 외부 정보는 사용하지 마세요.
`

  // 4. Gemini API 호출 (스트리밍)
  const response = await callGeminiWithStreaming(prompt)

  return {
    content: response.content,
    usage: response.usage
  }
}

function getAnalysisGuidelines(intent: AnalysisIntent): string {
  switch (intent.analysisType) {
    case 'comparative':
      return `
1. 각 법령/조례의 목적과 취지 비교
2. 주요 정의 및 용어 비교
3. 적용 대상 및 범위 비교
4. 핵심 내용 및 조항 비교
5. 절차 및 방법 비교 (있는 경우)
6. 예산 및 재원 비교 (있는 경우)
7. 특징적인 조항 및 차별화 포인트
8. 종합 평가 및 시사점
`

    case 'explanatory':
      return `
1. 법령의 제정 목적 및 배경
2. 주요 내용 요약
3. 핵심 조항 설명
4. 적용 대상 및 범위
5. 절차 및 방법
6. 관련 법령 (있는 경우)
7. 실무적 시사점
`

    case 'summary':
      return `
1. 핵심 내용 요약 (3-5문장)
2. 주요 조항 리스트
3. 적용 대상
4. 중요 포인트
`

    default:
      return '사용자 질문에 최선을 다해 답변하세요.'
  }
}
```

### Streaming API Endpoint

```typescript
// app/api/rag-analyze/route.ts

import { GoogleGenerativeAI } from '@google/generative-ai'

export async function POST(request: Request) {
  const { sessionId, userQuery } = await request.json()

  // 세션 로드
  const session = await ragSessionStore.getSession(sessionId)
  if (!session) {
    return new Response('Session not found', { status: 404 })
  }

  // 프롬프트 구성 (위의 analyzeWithRAG 로직)
  const prompt = buildRAGPrompt(session, userQuery)

  // Gemini Streaming
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

  const result = await model.generateContentStream(prompt)

  // Server-Sent Events (SSE) 스트리밍
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of result.stream) {
          const text = chunk.text()
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
        }

        // 완료 시그널
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}
```

---

## 🎨 Step 6: UI 구현

### Main RAG Interface

```typescript
// components/rag-analysis-view.tsx

export function RAGAnalysisView() {
  const [session, setSession] = useState<RAGSession | null>(null)
  const [isCollecting, setIsCollecting] = useState(false)
  const [collectionProgress, setCollectionProgress] = useState<CollectionProgress | null>(null)
  const [analysis, setAnalysis] = useState<string>('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  async function handleRAGQuery(query: string) {
    // 1. 의도 분석
    setIsCollecting(true)
    const intent = await analyzeIntent(query)

    // 2. 데이터 수집
    const sources = await collectData(intent.targets, setCollectionProgress)

    // 3. 세션 생성
    const newSession = await ragSessionStore.createSession(query, intent, sources)
    setSession(newSession)
    setIsCollecting(false)

    // 4. RAG 분석 시작
    setIsAnalyzing(true)
    await streamAnalysis(newSession.sessionId)
  }

  async function streamAnalysis(sessionId: string, userQuery?: string) {
    setAnalysis('')
    setIsAnalyzing(true)

    const response = await fetch('/api/rag-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, userQuery })
    })

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') {
            setIsAnalyzing(false)
            break
          }

          try {
            const { text } = JSON.parse(data)
            setAnalysis(prev => prev + text)
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  return (
    <div className="flex h-screen">
      {/* Left: Sources Panel */}
      <div className="w-80 border-r bg-gray-50 p-4">
        <h3 className="font-bold mb-4">📚 참고 자료</h3>

        {session && (
          <div className="space-y-3">
            {session.sources.map((source, index) => (
              <div key={source.id} className="bg-white p-3 rounded-lg shadow-sm">
                <div className="flex items-start gap-2">
                  <span className="text-lg">📄</span>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate">{source.title}</h4>
                    <p className="text-xs text-gray-500 mt-1">
                      {source.metadata.totalArticles}개 조문
                    </p>
                    {source.metadata.region && (
                      <p className="text-xs text-blue-600 mt-1">
                        {source.metadata.region}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {isCollecting && collectionProgress && (
          <RAGCollectionProgress progress={collectionProgress} />
        )}
      </div>

      {/* Right: Analysis Result */}
      <div className="flex-1 flex flex-col">
        {/* Analysis Display */}
        <div className="flex-1 overflow-y-auto p-6">
          {analysis && (
            <div className="prose max-w-none">
              <ReactMarkdown>{analysis}</ReactMarkdown>
            </div>
          )}

          {isAnalyzing && !analysis && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
                <p className="text-gray-600">AI가 분석 중입니다...</p>
              </div>
            </div>
          )}
        </div>

        {/* Follow-up Chat */}
        {session && !isAnalyzing && (
          <div className="border-t p-4">
            <form onSubmit={(e) => {
              e.preventDefault()
              const input = e.currentTarget.query
              streamAnalysis(session.sessionId, input.value)
              input.value = ''
            }}>
              <div className="flex gap-2">
                <input
                  name="query"
                  type="text"
                  placeholder="후속 질문을 입력하세요..."
                  className="flex-1 px-4 py-2 border rounded-lg"
                />
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  질문
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
```

---

## 💰 비용 추정

### Gemini 2.0 Flash Experimental 기준

| 단계 | 평균 토큰 | 비용 (per query) |
|------|----------|------------------|
| Intent 분석 | ~500 | $0.000038 |
| Best Match 선택 | ~300 | $0.000023 |
| RAG 분석 (소스 2개) | ~8,000 입력 + 2,000 출력 | ~$0.0008 |
| **합계** | | **~$0.0009/쿼리** |

**월간 추정** (100 쿼리/일):
- $0.0009 × 100 × 30 = **$2.70/월**

→ **매우 저렴!**

---

## 📊 성능 최적화

### 1. 소스 캐싱
```typescript
// 동일한 법령은 재다운로드하지 않음
// IndexedDB에 법령 전문 캐시
```

### 2. 점진적 데이터 수집
```typescript
// 필수 데이터만 먼저 수집
// 부가 데이터는 백그라운드에서 수집
```

### 3. 스트리밍 응답
```typescript
// 분석 결과를 실시간으로 표시
// 사용자 대기 시간 감소
```

---

## 🎯 예상 사용 시나리오

### 시나리오 1: 조례 비교
```
사용자: "광진구와 성동구의 4차산업 관련 조례를 분석, 비교해줘"

→ AI 자동 수집:
  - 광진구 4차산업혁명 대응 산업진흥 조례
  - 성동구 4차산업혁명 대응 조례

→ 비교 분석 제공:
  - 목적 비교
  - 지원 대상 비교
  - 예산 규모 비교
  - 특징적 조항 분석

→ 후속 질문:
  "광진구의 지원 금액 한도는?"
  → 즉시 답변 (재수집 불필요)
```

### 시나리오 2: 법령 계층 분석
```
사용자: "관세법과 관세법 시행령의 관계를 설명해줘"

→ AI 자동 수집:
  - 관세법 전문
  - 관세법 시행령 전문

→ 설명 제공:
  - 법률-시행령 관계 설명
  - 위임 조항 분석
  - 구체적인 연결 관계
```

### 시나리오 3: 다중 법령 검토
```
사용자: "수출입 관련 법령들을 모두 찾아서 요약해줘"

→ AI 자동 수집:
  - 관세법
  - 대외무역법
  - 수출입검사법
  - FTA 특례법
  ...

→ 각 법령 요약 제공
→ 상호 관계 설명
```

---

## 🚀 구현 우선순위

### Phase 1 (1주): 기본 RAG 시스템
- ✅ Query Classifier
- ✅ Intent Analyzer
- ✅ Data Collector (조례만)
- ✅ Session Store
- ✅ RAG Analyzer (기본)
- ✅ 간단한 UI

### Phase 2 (1주): 향상된 기능
- ✅ 법률 데이터 수집 지원
- ✅ 스트리밍 응답
- ✅ 후속 질문 처리
- ✅ 소스 표시 UI 개선

### Phase 3 (1주): 최적화
- ✅ 소스 캐싱
- ✅ 점진적 데이터 수집
- ✅ 세션 관리 UI
- ✅ 에러 처리 강화

### Phase 4 (추가): 프리미엄 기능
- ✅ 비교 표 자동 생성
- ✅ 조문별 하이라이트
- ✅ PDF 내보내기
- ✅ 팀 협업 (세션 공유)

---

## 💡 핵심 차별화 포인트

1. **완전 자동화**: 사용자는 질문만 하면 됨 (법령명 몰라도 OK)
2. **정확한 RAG**: 실제 법령 데이터 기반 (환각 없음)
3. **세션 기반**: 후속 질문으로 깊이 있는 분석
4. **저비용**: ~$0.001/쿼리 (무료 티어로 충분)
5. **NotebookLM 스타일**: 친숙한 UX

---

## 🎉 결론

이 시스템을 구현하면:

- ✅ "법령명 몰라도 OK" → 자연어 질문만으로 분석
- ✅ "비교/분석 자동화" → AI가 알아서 데이터 수집 + 분석
- ✅ "전문가 수준 인사이트" → 깊이 있는 법령 비교
- ✅ "저비용 운영" → ~$3/월로 100 사용자 지원

**LexDiff의 킬러 기능이 될 것입니다!** 🚀

다음 단계: Phase 1부터 시작할까요?
