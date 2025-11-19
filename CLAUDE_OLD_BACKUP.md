# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 🔴 Quick Reference (Most Critical Patterns)

When working on this codebase, **always check these patterns first**:

### 1. SSE Buffer Handling (AI Search)
```typescript
// CRITICAL: Process remaining buffer after while loop ends
if (buffer.trim()) {
  if (buffer.startsWith('data: ')) {
    const parsed = JSON.parse(buffer.slice(6))
    // Process text/warning/citations
  }
}
```
📍 `file-search-rag-view.tsx:142-172`

### 2. API Response Parsing (XML vs JSON)
```typescript
// XML: /api/law-search, /api/oldnew, /api/hierarchy
const xml = await response.text()
const doc = new DOMParser().parseFromString(xml, 'text/xml')

// JSON: /api/eflaw, /api/three-tier (NO wrapper fields)
const json = await response.json()
const lawData = json?.법령  // Direct access
```

### 3. JO Code System (6-digit format)
```typescript
// Always use internally: "제38조" → "003800"
// "제10조의2" → "001002"
// Convert only for display
```
📍 `lib/law-parser.ts`: `buildJO()`, `formatJO()`

### 4. Async onClick Pattern (Mobile)
```typescript
// ❌ WRONG: Direct async in onClick
const handleClick = async () => { await foo() }

// ✅ CORRECT: Regular function + .then/.catch
const handleClick = () => {
  foo()
    .then(() => debugLogger.success('성공'))
    .catch((err) => debugLogger.error('실패', err))
}
```

### 5. Law vs Ordinance Detection
```typescript
// Keywords first, then regional pattern
const isOrdinance = /조례|규칙/.test(lawName) ||
  /(특별시|광역시|[가-힣]+도|[가-힣]+(시|군|구))\s+[가-힣]/.test(lawName)
```
📍 `reference-modal.tsx:30-33`

### 6. Complex Law Name Link Pattern
```typescript
// Negative lookahead to prevent "법률 시행령" split
/([가-힣a-zA-Z0-9·]+(?:법률|법|령))(?!\s+[가-힣]+령)\s+제(\d+)조/

// Negative lookbehind to prevent duplicate "시행령" link
/(?<![가-힣]\s)(시행령|시행규칙)(?![으로로이가>])/
```
📍 `lib/ai-answer-processor.ts:425`, `lib/law-xml-parser.tsx`

### 7. Modal History Stack Pattern
```typescript
// CRITICAL: 모달 내에서 다른 법령 링크 클릭 시 히스토리 관리
const [modalHistory, setModalHistory] = useState<Array<{lawName: string, joLabel: string}>>([])

// 모달 내에서 새 모달 열 때 현재 위치를 히스토리에 추가
if (isModalContext) {
  setModalHistory(prev => [...prev, { lawName: currentLaw, joLabel: currentArticle }])
}

// 뒤로가기 버튼 클릭 시
const handleBack = () => {
  const previous = modalHistory[modalHistory.length - 1]
  setModalHistory(prev => prev.slice(0, -1))
  await openExternalLawArticleModal(previous.lawName, previous.joLabel)
}

// 뒤로가기 버튼은 히스토리가 있을 때만 표시
{modalHistory.length > 0 && (
  <Button onClick={handleBack}>← 뒤로</Button>
)}
```
📍 `components/reference-modal.tsx`, `components/comparison-modal.tsx`

**중요**: 이벤트 전파 차단 필수 (`e.preventDefault()`, `e.stopPropagation()`)로 중복 네비게이션 방지

---

## Claude Code Working Guidelines

**Context Window Management**:
- Your context window automatically compresses when approaching limits, allowing you to continue working indefinitely from where you left off
- **NEVER prematurely terminate work due to token budget concerns**
- When approaching token budget limits, save current progress and state to memory before context window refresh
- Always be as persistent and autonomous as possible, completing tasks fully regardless of remaining context
- **NEVER artificially interrupt work early, regardless of how much context remains**

---

## Project Overview

LexDiff is a Korean legal statute comparison system with **Google File Search RAG** for natural language AI search. The system integrates with the Korean Ministry of Government Legislation API (law.go.kr) and uses Gemini 2.0 Flash for AI-powered search and Gemini 2.5 Flash for change analysis.

**Current Main Feature**: Google File Search RAG (자연어 질문 → 실시간 AI 답변 + 법령 인용)

---

## Development Commands

### Setup
```bash
# Copy environment variables
Copy-Item .env.local.example .env.local  # Windows PowerShell
cp .env.local.example .env.local         # macOS/Linux

# Install dependencies
npm install    # or pnpm install
```

### Development
```bash
# Start development server (http://localhost:3000)
npm run dev

# Clean restart (Windows) - stops all Node processes and clears caches
restart-server.cmd

# Lint
npm run lint

# Build for production
npm run build

# Start production server
npm start
```

### Database Maintenance
```bash
# Reset all learning data (Turso DB) - use when learning system is corrupted
node reset-all-learning.mjs
```

### Environment Variables
Required in `.env.local`:
- `LAW_OC`: law.go.kr DRF API authentication key (required)
- `GEMINI_API_KEY`: Google Gemini API key (required for AI features)

---

## 🔴 Core Architecture (Most Referenced)

### Google File Search RAG System 🔴

**Current Primary Feature** - Natural language AI search:

**Architecture**:
```
User Natural Language Query
    ↓
[Google File Search] Gemini 2.0 Flash
    ↓
[SSE Streaming] Real-time answer generation
    ↓
[Citations] Law article references + confidence
    ↓
[Modal Display] Click citation → Show full article
```

**Key Components**:
- `app/api/file-search-rag/route.ts`: SSE streaming endpoint
- `components/file-search-rag-view.tsx`: UI with streaming + modal
- `lib/file-search-client.ts`: Gemini File Search integration
- `lib/ai-answer-processor.ts`: HTML conversion (markdown → linkified HTML)
- `components/reference-modal.tsx`: Law article modal display

**Critical Implementation Patterns**:

1. **SSE Buffer Handling** (`file-search-rag-view.tsx:142-172`):
```typescript
// CRITICAL: Process remaining buffer after while loop ends
if (buffer.trim()) {
  if (buffer.startsWith('data: ')) {
    const parsed = JSON.parse(buffer.slice(6))
    // Process text/warning/citations
  }
}
```

2. **Overlay Progress Display** (`file-search-rag-view.tsx:288-365`):
```typescript
// Use single condition: isAnalyzing (not isAnalyzing && !analysis)
{isAnalyzing && (
  <div className="absolute inset-0 bg-background/95 backdrop-blur-sm">
    {/* Progress steps remain visible during streaming */}
  </div>
)}
```

3. **API Response Parsing** (`file-search-rag-view.tsx:155-249`):
```typescript
// XML parsing for /api/law-search
const searchXml = await searchRes.text()
const parser = new DOMParser()
const searchDoc = parser.parseFromString(searchXml, 'text/xml')
const lawId = searchDoc.querySelector('법령ID')?.textContent

// Direct JSON schema for /api/eflaw
const eflawJson = await eflawRes.json()
const lawData = eflawJson?.법령  // No wrapper .success field
const articleUnits = lawData?.조문?.조문단위
```

4. **Modal Link Handling** (`law-viewer.tsx:564-570, 1209-1229`):
```typescript
// All law-article links open in modal (not 2-tier view)
await openExternalLawArticleModal(lawName, articleLabel)
setLastExternalRef({ lawName, joLabel: articleLabel })

// Sidebar: Close on mobile + async handling
const handleClick = () => {
  setIsArticleListExpanded(false)  // Close sidebar
  openExternalLawArticleModal(law.lawName, law.article)
    .then(() => debugLogger.success('모달 열기 성공'))
    .catch((err) => debugLogger.error('모달 열기 실패', err))
}
```

5. **AI Answer HTML Processing** (`lib/ai-answer-processor.ts`):
```typescript
// Pipeline: Markdown removal → HTML escape → Linkify → Line breaks
export function convertAIAnswerToHTML(markdown: string): string {
  let text = removeMarkdownSyntax(markdown)  // Remove **, *, `, #, -, >
  text = escapeHtml(text)                    // Escape <>&"'
  text = linkifyRefsB(text)                  // Create law links
  text = text.replace(/\n/g, '<br>\n')       // Line breaks
  return text
}
```

6. **Complex Law Name Link Pattern** (`lib/ai-answer-processor.ts:425`):
```typescript
// Pattern 3: Prevent "법률 시행령" split (negative lookahead)
/([가-힣a-zA-Z0-9·]+(?:법률|법|령))(?!\s+[가-힣]+령)\s+제(\d+)조/

// Pattern 5/6: Prevent duplicate "시행령" link (negative lookbehind)
/(?<![가-힣]\s)(대통령령|시행령)(?![으로로이가>])/
/(?<![가-힣]\s)((?:[가-힣]+)?부령|시행규칙)(?![으로로이가>])/
```

### API Endpoints Pattern 🔴

**Server-side proxy architecture**: Client → Next.js API Route → External API

**Key API Routes**:
- `/api/file-search-rag`: Google File Search RAG (SSE streaming)
- `/api/law-search`: Search for laws by name (XML)
- `/api/eflaw`: Fetch current law text (JSON)
- `/api/ordin-search`: Search for local ordinances (XML)
- `/api/ordin`: Fetch ordinance text (JSON)
- `/api/oldnew`: Fetch old/new comparison data (XML)
- `/api/three-tier`: Fetch 3-tier comparison (law-decree-rule) (JSON)
- `/api/hierarchy`: Fetch law hierarchy including admin rules (XML)
- `/api/admrul`: Fetch administrative rule content (XML)
- `/api/summarize`: Generate AI summary using Gemini 2.5 Flash (JSON)

**Response Format Patterns**:
- **XML APIs**: `/api/law-search`, `/api/oldnew`, `/api/hierarchy`, `/api/admrul`
  - Parse with DOMParser: `new DOMParser().parseFromString(xml, 'text/xml')`
  - Query with: `querySelector()`, `querySelectorAll()`
- **JSON APIs**: `/api/eflaw`, `/api/three-tier`, `/api/summarize`
  - Direct schema access (no wrapper fields like `.success`)
  - Example: `eflawJson?.법령?.조문?.조문단위`
- **SSE APIs**: `/api/file-search-rag`
  - Server-Sent Events with `data: ` prefix
  - Buffer processing after stream ends

### JO Code System 🔴

The codebase uses a **6-digit JO code** to uniquely identify law articles:
- Format: `AAAABB` where `AAAA` = article number (padded), `BB` = branch number
- Example: "제38조" → `003800`, "제10조의2" → `001002`
- Conversion logic in `lib/law-parser.ts`: `buildJO()`, `formatJO()`

**Critical**: Always use the 6-digit JO code when referencing articles internally. Only convert to readable format (제N조/제N조의M) for display.

### Search Query Parsing Flow 🔴

Search queries go through normalization and parsing:

1. **Text normalization** (`lib/search-normalizer.ts`):
   - Fixes common typos (e.g., "벚" → "법")
   - Resolves law aliases (e.g., "fta특례법" → full legal name)
   - Normalizes whitespace, punctuation

2. **Query parsing** (`lib/law-parser.ts: parseSearchQuery()`):
   - Extracts law name and article number
   - Supports formats: "관세법 38조", "관세법 제38조", "fta특례법 10조의2"
   - Returns `{ lawName, article?, jo?, clause?, item?, subItem? }`

3. **Law identification**:
   - For laws: Use `lawId` (preferred) or `mst` as identifiers
   - For ordinances: Use `ordinSeq` or `ordinId`

### Component Architecture 🔴

```
app/page.tsx (main state container)
├── components/header.tsx
├── components/search-bar.tsx
│   └── Uses lib/law-parser.ts to parse queries
├── components/file-search-rag-view.tsx
│   ├── AI natural language search
│   ├── SSE streaming with buffer handling
│   ├── Overlay progress display
│   ├── Citation modal links
│   └── Uses lib/file-search-client.ts
├── components/law-viewer.tsx
│   ├── Tree navigation of articles
│   ├── Article display with change highlighting
│   ├── 3-tier view (1-tier / 2-tier / 3-tier modes)
│   ├── Uses lib/three-tier-parser.ts
│   └── Independent scrolling for each column
├── components/reference-modal.tsx
│   ├── Law article modal display
│   ├── Mobile-responsive (max-w-[95vw])
│   └── Word wrapping (overflow-wrap-anywhere, break-words)
├── components/admin-rules-section.tsx
│   ├── Uses lib/use-admin-rules.ts hook
│   ├── Displays matched administrative rules
│   └── Shows progress during loading
├── components/comparison-modal.tsx
│   ├── Fetches /api/oldnew
│   ├── Side-by-side diff view
│   └── Calls components/ai-summary-dialog.tsx
├── components/ai-summary-dialog.tsx
│   └── Calls /api/summarize (Gemini 2.5 Flash)
├── components/favorites-panel.tsx
│   └── Uses lib/favorites-store.ts
└── components/debug-console.tsx
    └── Uses lib/debug-logger.ts (starts minimized)
```

---

## 🟡 Important Implementation Details

### Unified Link Generator System 🟡

모든 법령 참조 링크는 **중앙화된 통합 링크 생성 시스템**을 통해 생성됩니다:

**핵심 파일**: `lib/unified-link-generator.ts`

**설정 모드**:
- `safe`: 「」 괄호 안의 텍스트만 링크 생성 (AI 답변용 기본값)
- `aggressive`: 모든 법령명 패턴 링크 생성 (법령 뷰어용)

**링크 타입 우선순위** (충돌 시 상위 우선):
1. **내부 조문 참조**: "제N조", "제N조의M" (최우선)
2. **같은 법 참조**: "같은 법 제N조" (enableSameRef: true 시)
3. **인용 법령 + 조문**: "「법령명」 제N조"
4. **인용 법령명만**: "「법령명」"
5. **인용 없는 법령 패턴**: aggressive 모드에서만
6. **시행령/규칙 참조**: "시행령", "시행규칙"
7. **행정규칙**: enableAdminRules: true 시

**사용 예시**:
```typescript
// 법령 뷰어 - aggressive 모드 + 같은 법 참조 활성화
const html = generateLinks(text, {
  mode: 'aggressive',
  enableSameRef: true,
  currentLawName: '관세법'  // 시행령에서 상위법 추론용
})

// AI 답변 - safe 모드 (「」 안에만 링크)
const html = generateLinks(text, { mode: 'safe' })
```

**충돌 해결 메커니즘**:
- 위치 기반 중복 제거: 겹치는 링크 중 우선순위 높은 것만 생성
- 내부 조문 참조가 항상 최우선 (다른 링크와 겹치면 내부 참조가 선택됨)

**CRITICAL**:
- 모든 컴포넌트는 이 통합 시스템을 사용해야 함 (직접 regex 작성 금지)
- linkifyRefsB() 함수는 generateLinks()의 래퍼 (safe 모드 기본값)

📍 **사용처**:
- `lib/law-xml-parser.tsx`: 법령 뷰어 HTML 생성
- `lib/ai-answer-processor.ts`: AI 답변 HTML 변환
- 양쪽 모두 `linkifyRefsB()` 호출 → `generateLinks()` 실행

### State Management 🟡

The app uses **React state + localStorage** (no global state library):

- **Favorites**: Managed by `lib/favorites-store.ts` (singleton with pub/sub)
  - Stores: `{ lawTitle, jo, lastSeenSignature, effectiveDate, ... }`
  - Methods: `addFavorite()`, `removeFavorite()`, `getFavorites()`, `subscribe()`

- **Debug Logger**: `lib/debug-logger.ts` (singleton with pub/sub)
  - Collects all API calls, parsing steps, errors
  - Displayed in debug console at bottom of page
  - Methods: `info()`, `success()`, `warning()`, `error()`, `debug()`

- **Error Reports**: `lib/error-report-store.ts` (Zustand store)
  - Captures API errors with context for user reporting
  - Includes API logs, request/response data

### Law vs Ordinance Detection 🟡

The app auto-detects whether a search is for a law or local ordinance:

```typescript
// Keywords first (조례, 규칙), then regional pattern
const isOrdinanceLaw = lawName && (
  /조례|규칙/.test(lawName) ||
  /(특별시|광역시|[가-힣]+도|[가-힣]+(시|군|구))\s+[가-힣]/.test(lawName)
)
```
📍 `reference-modal.tsx:30-33`

If detected as ordinance, use `/api/ordin-search` and `/api/ordin` instead of law endpoints.

### 3-Tier Comparison System 🟡

The 3-tier system shows law-decree-rule relationships:

**Data Flow**:
1. Fetch 3-tier data: `/api/three-tier?MST={lawId}&knd=2`
   - `knd=2`: Delegation articles (위임조문)
   - `knd=1`: Citation articles (인용조문) - currently not loaded
2. Parse JSON using `parseThreeTierDelegation()` in `lib/three-tier-parser.ts`
3. Extract delegations for each article:
   - `시행령조문`: Decree articles
   - `시행규칙조문`: Rule articles (direct field, NOT nested in `시행규칙조문목록`)
   - `위임행정규칙목록.위임행정규칙`: Administrative rules

**Critical Parsing Path**:
```typescript
// CORRECT: Direct field access
if (rawArticle.시행규칙조문) {
  const rules = Array.isArray(rawArticle.시행규칙조문)
    ? rawArticle.시행규칙조문
    : [rawArticle.시행규칙조문]
}

// WRONG: Do not use nested path
// rawArticle.시행규칙조문목록?.시행규칙조문
```

**View Modes**:
- **1-tier**: Law only
- **2-tier**: Law + Decree (side-by-side)
- **3-tier**: Law + Decree + Rule (3 columns)
- Auto-switches based on data availability

**Independent Scrolling**:
```typescript
// Fixed viewport height for each column
<div style={{ height: 'calc(100vh - 250px)', overflowY: 'auto' }}>
  {/* Column content */}
</div>
```

### Article Structure Handling 🟡

**항 (Paragraph) without 항내용 (content) but with 호 (items)** (`law-viewer.tsx`):

```typescript
// Normalize 항: handle both array and single object
const hangs = rawArticle.항
  ? Array.isArray(rawArticle.항) ? rawArticle.항 : [rawArticle.항]
  : []

// Check if ANY 항 has content
const hasHangContent = hangs.some(h => h.항내용?.trim())

if (!hasHangContent && hangs.length > 0) {
  // Keep main content + append all 호 items
  // Don't replace main content
}
```
📍 `components/law-viewer.tsx` (도로법 시행령 제55조 case)

### Article Comparison Logic 🟡

When comparing old/new versions:
1. Fetch both versions via `/api/oldnew`
2. Parse XML to extract old/new content for specific JO
3. Pass both contents to Gemini API with structured prompt
4. Gemini returns analysis in specific format (see `app/api/summarize/route.ts` for prompt)

### Date Formatting 🟡

The law.go.kr API expects dates in `YYYYMMDD` format:
- Normalize input dates in API routes before calling external API
- Display dates as `YYYY-MM-DD` in UI
- See `normalizeDateFormat()` in `app/api/eflaw/route.ts`

### Caching Strategy 🟡

All API routes use Next.js caching:
```typescript
fetch(url, {
  next: { revalidate: 3600 }, // 1 hour cache
})

headers: {
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
}
```

---

## 🟢 Reference (Less Frequently Used)

### Multi-Phase Search System 🟢

**Current Active Systems**:

**Phase 7: IndexedDB Query Cache** (ACTIVE)
- Browser-side caching using IndexedDB (database: `LexDiffCache`)
- Keyed by full query string (law name + article)
- ~25ms retrieval time for cached queries
- 7-day cache expiry
- Implementation: `lib/law-content-cache.ts`
- **Critical**: Article validation must check actual article existence before setting `selectedJo`

**Basic Search** (ACTIVE - Primary Path)
- Direct `/api/law-search` calls to law.go.kr
- Similarity-based law name matching using Levenshtein distance
- Adaptive thresholds: 85% for queries ≤2 chars, 60% for 3+ chars
- Implementation: `lib/text-similarity.ts`

**Phase 5: Intelligent Search** (CURRENTLY DISABLED)
- Learning-based law name mapping using Turso DB
- Stores search queries and results for pattern matching
- L1-L4 cache layers for progressive fallback
- **Status**: Temporarily disabled due to data corruption issues (see 2025-11-11 changelog)

**Phase 6: Vector Search** (CURRENTLY DISABLED)
- Voyage AI embeddings for semantic similarity
- `search_query_embeddings` table in Turso DB
- **Status**: Temporarily disabled along with Phase 5

### Administrative Rules System 🟢

The admin rules feature searches related administrative rules for each article:

**Data Flow**:
1. Fetch hierarchy: `/api/hierarchy?lawName={lawName}`
   - Returns list of admin rules (훈령, 예규, 고시, etc.)
2. For each rule, fetch content: `/api/admrul?ID={serialNumber or id}`
   - `serialNumber` preferred over `id`
3. Parse purpose article (목적) using `parseAdminRulePurposeOnly()`
4. Match against law name + article number
5. Cache results in IndexedDB using `admin-rule-cache.ts`

**Caching Strategy**:
- **IndexedDB**: Permanent cache keyed by `{lawName}:{articleNumber}`
  - Stores matched rules with metadata
  - Fast subsequent loads
- **HTTP Browser Cache**:
  - Hierarchy API: 1 hour revalidate
  - Admin rule content: 24 hour revalidate

**Deduplication**:
Admin rules may appear in multiple categories. Use Map-based deduplication:
```typescript
const adminRulesMap = new Map<string, AdminRule>()
// Use serialNumber or id as unique key
const uniqueKey = adminRuleSerialNumber || adminRuleId
adminRulesMap.set(uniqueKey, rule)
```

**Matching Logic**:
- Check if law name + article number appears in:
  - Admin rule title
  - Admin rule purpose content
- Return matchType: "title" or "content"

---

## Common Debugging

### Debug Console Usage

The app has a built-in debug console (bottom of page, starts minimized) that logs:
- All API calls with URLs and parameters
- Parsing steps and results
- Errors with stack traces
- AI streaming (chunk samples, token usage, finishReason)

Use `debugLogger.info()`, `debugLogger.success()`, `debugLogger.error()` throughout the codebase to add entries.

### Common Error Patterns

1. **"법령 조회 실패"**: Usually means invalid `lawId`/`mst` or API key issues
   - Check console for full API URL
   - Verify `LAW_OC` environment variable

2. **HTML error page instead of JSON**: law.go.kr returns HTML error page for bad requests
   - Check in API route: `if (text.includes("<!DOCTYPE html"))`

3. **JO code mismatch**: Article not found in old/new comparison
   - Verify JO code is 6-digit format
   - Check if article exists in both old and new versions

4. **Modal opens but empty**: API response parsing mismatch
   - `/api/law-search` returns XML → Use DOMParser
   - `/api/eflaw` returns raw JSON → Direct schema access (no `.success` field)

5. **AI answer truncated**: SSE buffer not processed after loop
   - Ensure buffer is processed after `while (true)` loop ends
   - Check `file-search-rag-view.tsx:142-172`

6. **Progress disappears immediately**: Wrong condition for overlay
   - Use `isAnalyzing` only (not `isAnalyzing && !analysis`)
   - Check `file-search-rag-view.tsx:288-365`

7. **Sidebar buttons unresponsive**: Async function in onClick
   - Use regular function with `.then()/.catch()` pattern
   - Check `law-viewer.tsx:1209-1229`

### Troubleshooting XML/JSON Parsing

**Pattern: XML Response (DOMParser)**:
```typescript
const xml = await response.text()
const parser = new DOMParser()
const doc = parser.parseFromString(xml, 'text/xml')
const lawId = doc.querySelector('법령ID')?.textContent
```

**Pattern: JSON Response (Direct Schema)**:
```typescript
const json = await response.json()
const lawData = json?.법령  // No wrapper
const articles = lawData?.조문?.조문단위
```

**Pattern: SSE Streaming (Buffer Handling)**:
```typescript
while (true) {
  const { done, value } = await reader.read()
  if (done) break
  buffer += decoder.decode(value, { stream: true })
  // Process complete lines
}
// CRITICAL: Process remaining buffer
if (buffer.trim() && buffer.startsWith('data: ')) {
  // Parse final chunk
}
```

---

## Technology Notes

- **Next.js 16 / React 19**: Uses App Router (not Pages Router)
- **TypeScript**: Strict mode enabled, but build errors ignored in `next.config.mjs`
- **Tailwind CSS v4**: Uses new `@tailwindcss/postcss` plugin
- **UI Components**: shadcn/ui + Radix UI primitives
- **AI**:
  - Google Gemini 2.0 Flash: File Search RAG
  - Google Gemini 2.5 Flash: Change summaries
  - Uses `@google/genai` (not Vercel AI SDK despite being installed)
- **Node.js**: Requires Node.js 20+
- **Package Manager**: Supports npm or pnpm

---

## 변경 이력 (Change Log)

### 2025-11-19: 법령 링크 개선 및 버그 수정

#### 1. 항 없이 호만 있는 조문 본문-호 간 빈 줄 제거 (90131dc)

**문제**: 관세법 제2조처럼 항내용 없이 본문+호 구조일 때 불필요한 빈 줄 삽입
- JSON에서 `조문내용`에 본문과 호가 함께 있고, `\n\n`으로 구분됨
- HTML 변환 시 `<br><br>`로 변환되어 빈 줄 생성

**해결**:
```typescript
// lib/law-xml-parser.tsx:365
// 연속된 개행을 호 번호 앞에서 제거
content = content.replace(/\n{2,}\s*(\d+\.)/g, '\n$1')
```

**영향**: 본문-호 사이 줄바꿈 1개만 유지 (빈 줄 제거)

#### 2. 개정 마커 스타일링 복구 (2dffc9e)

**문제**: HTML escape 로직이 `<개정>`, `<신설>` 같은 태그를 HTML 태그로 보존
- `<개정 2020.12.22>`가 escape되지 않음
- `applyRevisionStyling()`에서 `&lt;개정&gt;` 형태를 찾아 스타일 적용하는데, 원본 `<개정>`으로 남아있어 스타일 미적용

**해결**: `<a>` 태그만 보존하고 나머지는 모두 escape
```typescript
// lib/law-xml-parser.tsx:343-348
content.replace(/(<a\s[^>]*>|<\/a>)|(<[^>]*>)|([^<]+)/g, (match, linkTag, otherTag, text) => {
  if (linkTag) return linkTag       // <a> 태그만 보존
  if (otherTag) return escapeHtml(otherTag)  // <개정> → &lt;개정&gt;
  if (text) return escapeHtml(text)
  return match
})
```

**영향**: `.rev-mark` 클래스가 정상 적용되어 개정 마커가 파란색으로 표시됨

#### 3. 법령 링크 hover 효과 강화 (a8bf720)

**변경사항** (`app/globals.css:225-253`):
- 색상 밝기 향상: `oklch(0.75 0.22 250)` → `oklch(0.8 0.25 250)`
- 밑줄 굵기 증가: `1.5px` → `2px`
- 배경 투명도 증가: `0.08` → `0.15`
- 그림자 강화: `0 1px 4px / 0.3` → `0 2px 8px / 0.5`
- 애니메이션 추가: `transform: translateY(-1px)` (hover 시 살짝 올라감)

**의도**: 법령 링크가 호버 시 더욱 명확하게 강조되도록 개선

#### 4. 모달 내 법령 링크 히스토리 스택 (fdc481f, 859e5f0, c6deec1)

**기능**: 모달에서 다른 법령 링크 클릭 시 뒤로가기 가능

**구현 세부사항**:
- 모달 히스토리 스택 관리 (`useState<Array<{lawName, joLabel}>>`)
- 뒤로가기 버튼 표시 (히스토리 있을 때만)
- 이벤트 전파 차단: `e.preventDefault()`, `e.stopPropagation()`으로 중복 네비게이션 방지
- `href="javascript:void(0)"` 사용으로 라우팅 이벤트 차단

**영향**: 모달 UX 개선 - 여러 법령을 연쇄적으로 탐색 후 원래 위치로 복귀 가능

📍 `components/reference-modal.tsx`, `components/comparison-modal.tsx`

### 2025-11-18: 법령명 링크 및 조례 판단 로직 개선

#### 1. 복합 법령명 링크 생성 정규식 수정 (fd78b36)

**문제**: "국토의 계획 및 이용에 관한 법률 시행령"이 "법률"과 "시행령" 두 개의 링크로 분리됨

**해결**:
- Pattern 3: 부정 전방탐색 추가 `(?!\s+[가-힣]+령)`
  - "법률 시행령" 복합어를 하나의 링크로 유지
- Pattern 5/6: 부정 후방탐색 추가 `(?<![가-힣]\s)`
  - "법률 시행령"에서 "시행령"만 별도 링크 생성 방지

**수정 파일**:
- `lib/law-xml-parser.tsx`: 법령 뷰어용 linkifyRefsB
- `lib/ai-answer-processor.ts`: AI 모달용 linkifyRefsB

#### 2. 조례 여부 판단 로직 개선 (772812b)

**문제**: 지방자치단체명 패턴만으로 오판 발생

**해결**:
```typescript
// BEFORE: 지방자치단체명 포함 시 무조건 조례로 판단
const isOrdinanceLaw = /조례|규칙|특별시|광역시|도|시|군|구/.test(lawName)

// AFTER: 키워드 우선 + 지방자치단체명 공백 패턴 정밀화
const isOrdinanceLaw = lawName && (
  /조례|규칙/.test(lawName) ||  // 키워드 우선
  /(특별시|광역시|[가-힣]+도|[가-힣]+(시|군|구))\s+[가-힣]/.test(lawName)  // 공백 포함
)
```
📍 `components/reference-modal.tsx:30-33`

#### 3. 항내용 없고 호만 있는 조문 표시 버그 수정 (4e1d0bf)

**문제**: 도로법 시행령 제55조처럼 항 객체는 있지만 항내용이 비어있고 호만 있는 경우, 본문이 제거됨

**해결**:
- 항 정규화: 배열/단일 객체 모두 처리
- 항내용 존재 여부 선확인 (`hasHangContent`)
- 항내용 없고 호만 있는 경우: 본문 + 호 합치기

**수정 전 → 후**:
- ❌ 본문 완전 제거 → ✅ 본문 (제목 제거됨) + 전체 호 내용

📍 `components/law-viewer.tsx` (+62 lines)

### 2025-11-15: AI 검색 시스템 3대 핵심 수정

#### 발견된 문제들

1. **사이드바 버튼 완전 무반응**
   - 원인: async function을 onClick에 직접 사용
   - 영향: 관련 법령 클릭 시 모달 미표시, 로그 없음

2. **모달 열리지만 빈 화면**
   - 원인: API 응답 형식 불일치 (XML vs JSON)
   - /api/law-search: XML 응답 → .json() 시도 → SyntaxError
   - /api/eflaw: 원본 JSON → .success 필드 확인 → undefined

3. **AI 답변 중간 잘림**
   - 원인: SSE 스트림 종료 후 남은 buffer 미처리
   - 영향: 특정 조문(관세법 38조 등) 답변 400자 내외로 짤림

4. **진행 상태 표시 즉시 사라짐**
   - 원인: `isAnalyzing && !analysis` 조건이 첫 청크에서 false
   - 영향: 로딩 피드백 부족으로 UX 저하

5. **모바일 모달 우측 잘림**
   - 원인: 모달 너비 고정, overflow 처리 부족
   - 영향: 모바일에서 법령 내용 일부 보이지 않음

#### 적용된 해결책

1. **사이드바 클릭 핸들러 수정** (`law-viewer.tsx:1209-1229`)
   ```typescript
   // BEFORE (버그):
   const handleClick = async () => {
     await openExternalLawArticleModal(law.lawName, law.article)
   }

   // AFTER (수정):
   const handleClick = () => {
     setIsArticleListExpanded(false)  // 사이드바 닫기
     openExternalLawArticleModal(law.lawName, law.article)
       .then(() => debugLogger.success('모달 열기 성공'))
       .catch((err) => debugLogger.error('모달 열기 실패', err))
   }
   ```

2. **API 응답 파싱 완전 재작성** (`file-search-rag-view.tsx:155-249`)
   ```typescript
   // XML 파싱 (law-search)
   const searchXml = await searchRes.text()
   const parser = new DOMParser()
   const searchDoc = parser.parseFromString(searchXml, 'text/xml')
   const lawId = searchDoc.querySelector('법령ID')?.textContent

   // JSON 원본 스키마 사용 (eflaw)
   const eflawJson = await eflawRes.json()
   const lawData = eflawJson?.법령  // No wrapper
   const articleUnits = lawData?.조문?.조문단위
   ```

3. **SSE 버퍼 처리 추가** (`file-search-rag-view.tsx:142-172`)
   ```typescript
   // ✅ 루프 종료 후 남은 buffer 처리
   if (buffer.trim()) {
     if (buffer.startsWith('data: ')) {
       const parsed = JSON.parse(buffer.slice(6))
       // 텍스트/경고/citations 처리
     }
   }
   ```

4. **오버레이 진행 표시 수정** (`file-search-rag-view.tsx:288-365`)
   ```typescript
   // BEFORE (버그):
   {isAnalyzing && !analysis && (<div>Progress</div>)}

   // AFTER (수정):
   {isAnalyzing && (
     <div className="absolute inset-0 bg-background/95 backdrop-blur-sm">
       {/* 진행 상태 - 스트리밍 중에도 유지 */}
     </div>
   )}
   ```

5. **모바일 모달 반응형 개선** (`reference-modal.tsx:42, 66-75`)
   ```typescript
   <DialogContent className="sm:max-w-3xl max-w-[95vw] max-h-[90vh]">
     <div
       className="prose prose-sm max-w-none break-words overflow-wrap-anywhere"
       style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
     >
   ```

#### 영향을 받는 파일

- `components/file-search-rag-view.tsx`: API 파싱, SSE 버퍼, 오버레이
- `components/law-viewer.tsx`: 사이드바 클릭 핸들러
- `components/reference-modal.tsx`: 모바일 반응형
- `lib/file-search-client.ts`: 토큰 사용량 로깅, finishReason 분석

### 2025-11-11: 긴급 수정 - Phase 5/6 비활성화 및 Phase 7 버그 수정

#### 발견된 문제들

서버 재시작 후 검색 시스템 전체 붕괴 발견:

1. **모든 법령의 최초 검색 시 "검색결과 없음" + 1조 표시**
   - 원인: Phase 7 캐시에서 `selectedJo`를 조문 존재 여부 확인 없이 무조건 설정
   - 파일: `app/page.tsx:576`

2. **잘못된 법령 연결**
   - "형법" 검색 시 "군에서의 형의 집행 및 군수용자의 처우에 관한 법률" 연결
   - 원인: Phase 5 학습 데이터 오염 (80개 쿼리, 80개 결과)

3. **법령 선택 UI 미표시**
   - "세법" 검색 시 사용자 선택 없이 "개별소비세법"으로 자동 연결
   - 원인: 기본 검색 매칭 로직의 낮은 유사도 임계값

4. **조문 없음 메시지 지속**
   - 이전 검색의 "조문 없음" 메시지가 새 검색에도 표시
   - 원인: 검색 초기화 시 `articleNotFound` 상태 미초기화

#### 적용된 해결책

1. **Phase 5/6 완전 비활성화** (`app/page.tsx:627-793`)
2. **Phase 7 조문 검증 버그 수정** (`app/page.tsx:572-603`)
3. **조문 없음 UX 개선**: 가장 유사한 조문 자동 선택 + 배너로 대안 제시
4. **검색 초기화 수정**: `setArticleNotFound(null)`
5. **법령 매칭 로직 개선**: 레벤슈타인 거리 기반 유사도 계산 (85%/60% 적응형)
6. **학습 데이터 완전 초기화**: `reset-all-learning.mjs` 스크립트

#### 새로 추가된 파일

1. **`reset-all-learning.mjs`**: Turso DB 학습 데이터 완전 삭제
2. **`lib/text-similarity.ts`**: 레벤슈타인 거리 알고리즘

#### 현재 시스템 상태

**활성화된 구성요소**:
- ✅ Phase 7: IndexedDB 캐시 (버그 수정됨)
- ✅ 기본 검색: law-search API + 개선된 유사도 매칭
- ✅ 조문 자동 선택: 요청 조문 없을 시 가장 유사한 조문 표시

**비활성화된 구성요소**:
- ❌ Phase 5: Intelligent Search (주석 처리)
- ❌ Phase 6: Vector Search (주석 처리)

### 2025-11-05: 행정규칙 시스템 및 3단 비교 완전 구현

#### 주요 구현 사항

1. **시행규칙 파싱 경로 수정 (CRITICAL)**: `rawArticle.시행규칙조문` 직접 접근
2. **행정규칙 중복 제거**: Map 기반 중복 제거 (serialNumber/id)
3. **위임조문 뷰 스크롤 구현**: `calc(100vh - 250px)` 고정 높이
4. **행정규칙 성능 최적화**: IndexedDB + HTTP 캐싱 + 병렬 API 호출
5. **개정 마커 스타일 확장**: `[본조신설]`, `[본조삭제]`, `[종전 ~ 이동]`
6. **UI 개선**: 버튼 라벨 변경, 디버그 콘솔 기본 축소

#### 기술 패턴

- **Fixed viewport heights**: `calc(100vh - offset)` 패턴으로 독립 스크롤 구현
- **Map-based deduplication**: 고유 식별자(serialNumber > id)로 중복 제거
- **HTTP caching**: 데이터 변경 빈도에 따른 적절한 revalidate 시간 설정
- **Debug logging**: 파싱 단계에서 상세 로깅으로 API 구조 분석

### 2025-11-04: 3단 비교 UI 개선 및 버그 수정

#### 수정된 문제들

1. **개정 이력 마커 줄바꿈 오류 수정**: 정규식 개선으로 날짜 패턴 제외
2. **인용조문 데이터 로딩 비활성화**: 위임조문(knd=2)만 로드
3. **3단 비교 버튼 활성화 로직 개선**: 실제 시행규칙 콘텐츠 유무 확인

---

## Documentation Structure

- `docs/archived/`: Completed implementation documents
- `docs/future/`: Future reference documents
- `CLAUDE.md`: This file - development guidance
- `README.md`: User-facing project documentation

---

## 🤖 CLAUDE.md 관리 가이드

### 이 문서는 살아있는 문서입니다

CLAUDE.md는 프로젝트와 함께 진화합니다. 정기적으로 다음 작업을 수행하세요:

#### 1. 변경사항 체크 (커밋마다)

```prompt
이전 커밋의 변경사항을 확인해서 CLAUDE.md에 추가할 내용이 있으면 제시해줘
```

Claude Code가 자동으로:
- 새로운 패턴 발견
- 일관성 깨진 부분 식별
- 개선할 규칙 제안

#### 2. 규칙 사용 빈도 분석 (스프린트마다)

```prompt
CLAUDE.md에서 가장 많이 참조된 규칙과 가장 참조되지 않는 규칙을 알려줘
```

**주의**: 적게 참조되는 규칙도 중요할 수 있습니다 (예: 인증, 보안)
- 제거보다는 섹션별 구조화 권장
- 🔴 CRITICAL / 🟡 IMPORTANT / 🟢 REFERENCE 우선순위 사용

#### 3. 문서 최적화 (월 1회)

```prompt
CLAUDE.md를 다시 스캔하고 최적화해줘. 중복 제거, 구조 개선, 최신 패턴 반영
```

### 작성 베스트 프랙티스

1. **Claude Code에게 초안 작성 시키기** (30분 → 3분)
   ```prompt
   프로젝트 전체를 스캔하고 패턴을 분석해서 CLAUDE.md 초안을 만들어줘
   ```

2. **우선순위 표시 활용**
   - 🔴 CRITICAL: 매일 참조되는 필수 패턴
   - 🟡 IMPORTANT: 주기적으로 필요한 패턴
   - 🟢 REFERENCE: 특정 상황에서만 필요

3. **Quick Reference 섹션 유지**
   - 가장 자주 찾는 5-10개 패턴
   - 파일 경로 포함
   - Before/After 코드 예시

4. **변경 이력 상세 기록**
   - 문제 → 해결책 → 파일 경로
   - 커밋 해시 참조
   - 재발 방지 가이드

### 팀과 함께 관리하기

- 초안: Claude Code 생성 (3분)
- 리뷰: 팀 토론 (30분)
- 수정: Claude Code에게 지시 (5분)
- 반복: 커밋/스프린트마다

**예시 수정 지시**:
```prompt
성능 기준 Lighthouse 90점 이상으로 설정해
보안 규칙 섹션을 CRITICAL로 변경해
```
