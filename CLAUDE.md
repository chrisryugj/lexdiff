# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LexDiff is a Korean legal statute comparison system that enables professionals to search laws, compare old/new versions, and generate AI summaries. The system integrates with the Korean Ministry of Government Legislation API (law.go.kr) and uses Gemini 2.5 Flash for AI-powered change analysis.

## Development Commands

### Setup
```bash
# Copy environment variables (Windows PowerShell)
Copy-Item .env.local.example .env.local

# Copy environment variables (macOS/Linux)
cp .env.local.example .env.local

# Install dependencies
npm install
# or
pnpm install
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
- `GEMINI_API_KEY`: Google Gemini API key (required for AI summaries)

## Core Architecture

### API Endpoints Pattern

The application uses a **server-side proxy architecture** to call external APIs:

1. **Client → Next.js API Route → External API**
   - All external API calls are proxied through Next.js API routes in `app/api/`
   - This protects API keys and enables caching
   - Each route follows the pattern: validate → fetch → parse → cache

2. **Key API Routes**:
   - `/api/law-search`: Search for laws by name
   - `/api/ordin-search`: Search for local ordinances
   - `/api/eflaw`: Fetch current law text (JSON format)
   - `/api/ordin`: Fetch ordinance text
   - `/api/oldnew`: Fetch old/new comparison data (XML format)
   - `/api/three-tier`: Fetch 3-tier comparison (law-decree-rule) (JSON format)
   - `/api/hierarchy`: Fetch law hierarchy including admin rules (XML format)
   - `/api/admrul`: Fetch administrative rule content (XML format)
   - `/api/summarize`: Generate AI summary using Gemini 2.5 Flash

### JO Code System

The codebase uses a **6-digit JO code** to uniquely identify law articles:
- Format: `AAAABB` where `AAAA` = article number (padded), `BB` = branch number
- Example: "제38조" → `003800`, "제10조의2" → `001002`
- Conversion logic in `lib/law-parser.ts`: `buildJO()`, `formatJO()`

**Critical**: Always use the 6-digit JO code when referencing articles internally. Only convert to readable format (제N조/제N조의M) for display.

### Search Query Parsing Flow

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

### State Management

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

### XML vs JSON Parsing

The law.go.kr API returns different formats:
- **JSON**:
  - Current law text (`/api/eflaw`) → parsed by `parseLawJSON()` in `app/page.tsx`
  - 3-tier comparison (`/api/three-tier`) → parsed by `parseThreeTierDelegation()` in `lib/three-tier-parser.ts`
- **XML**:
  - Old/new comparison (`/api/oldnew`), search results, ordinances
  - Law hierarchy (`/api/hierarchy`) → parsed by `parseHierarchyXML()` in `lib/hierarchy-parser.ts`
  - Admin rules (`/api/admrul`) → parsed by `parseAdminRulePurposeOnly()` in `lib/admrul-parser.ts`
  - Use DOMParser to parse XML
  - Extract specific nodes with `querySelector()`/`querySelectorAll()`

### 3-Tier Comparison System

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

### Administrative Rules System

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

### Component Architecture

```
app/page.tsx (main state container)
├── components/header.tsx
├── components/search-bar.tsx
│   └── Uses lib/law-parser.ts to parse queries
├── components/law-viewer.tsx
│   ├── Tree navigation of articles
│   ├── Article display with change highlighting
│   ├── 3-tier view (1-tier / 2-tier / 3-tier modes)
│   ├── Uses lib/three-tier-parser.ts
│   └── Independent scrolling for each column
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

## Critical Implementation Details

### Law vs Ordinance Detection

The app auto-detects whether a search is for a law or local ordinance:

```typescript
const isOrdinanceQuery = /조례|규칙|특별시|광역시|도|시|군|구/.test(query.lawName)
```

If detected as ordinance, use `/api/ordin-search` and `/api/ordin` instead of law endpoints.

### Article Comparison Logic

When comparing old/new versions:
1. Fetch both versions via `/api/oldnew`
2. Parse XML to extract old/new content for specific JO
3. Pass both contents to Gemini API with structured prompt
4. Gemini returns analysis in specific format (see `app/api/summarize/route.ts` for prompt)

### Date Formatting

The law.go.kr API expects dates in `YYYYMMDD` format:
- Normalize input dates in API routes before calling external API
- Display dates as `YYYY-MM-DD` in UI
- See `normalizeDateFormat()` in `app/api/eflaw/route.ts`

### Caching Strategy

All API routes use Next.js caching:
```typescript
fetch(url, {
  next: { revalidate: 3600 }, // 1 hour cache
})

headers: {
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
}
```

### Multi-Phase Search System

The application originally implemented a multi-layer caching and learning system:

**Phase 5: Intelligent Search** (CURRENTLY DISABLED)
- Learning-based law name mapping using Turso DB
- Stores search queries and results for pattern matching
- L1-L4 cache layers for progressive fallback
- **Status**: Temporarily disabled due to data corruption issues (see 2025-11-11 changelog)

**Phase 6: Vector Search** (CURRENTLY DISABLED)
- Voyage AI embeddings for semantic similarity
- `search_query_embeddings` table in Turso DB
- **Status**: Temporarily disabled along with Phase 5

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

## Common Debugging

### Debug Console Usage

The app has a built-in debug console (bottom of page) that logs:
- All API calls with URLs and parameters
- Parsing steps and results
- Errors with stack traces

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

## Technology Notes

- **Next.js 16 / React 19**: Uses App Router (not Pages Router)
- **TypeScript**: Strict mode enabled, but build errors ignored in `next.config.mjs`
- **Tailwind CSS v4**: Uses new `@tailwindcss/postcss` plugin
- **UI Components**: shadcn/ui + Radix UI primitives
- **AI**: Google Gemini via `@google/genai` (not Vercel AI SDK despite being installed)
- **Node.js**: Requires Node.js 20+
- **Package Manager**: Supports npm or pnpm

## 변경 이력 (Change Log)

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
   ```typescript
   // ⚠️ Phase 5/6 (Intelligent Search) 일시 비활성화
   // 학습 시스템이 잘못된 법령을 반환하는 문제 때문에 기본 검색으로 복귀
   console.log('⚠️ Phase 5/6 비활성화 - 기본 검색 사용')

   /* ===== Phase 5 비활성화 =====
   [157 lines of intelligent-search logic commented out]
   ===== Phase 5 비활성화 끝 ===== */
   ```

2. **Phase 7 조문 검증 버그 수정** (`app/page.tsx:572-603`)
   ```typescript
   // BEFORE (버그):
   const parsedData = {
     selectedJo: query.jo,  // ← 무조건 설정
   }

   // AFTER (수정):
   let selectedJo: string | undefined = undefined

   if (query.jo) {
     const targetArticle = cachedContent.articles.find(a => a.jo === query.jo)
     if (targetArticle) {
       selectedJo = targetArticle.jo
     } else {
       // 조문 없음 → 가장 유사한 조문 자동 선택
       const nearestArticles = findNearestArticles(query.jo, cachedContent.articles)
       if (nearestArticles.length > 0) {
         selectedJo = nearestArticles[0].jo
       }
       setArticleNotFound({...})  // 배너로 안내
     }
   }
   ```

3. **조문 없음 UX 개선** (`app/page.tsx:402-425, 582-603`)
   - 변경 전: 빈 화면 + 에러 메시지만 표시
   - 변경 후: 가장 유사한 조문 자동 선택 + 배너로 대안 제시
   - 적용 경로: Phase 7 경로 및 기본 검색 경로 모두

4. **검색 초기화 수정** (`app/page.tsx:545`)
   ```typescript
   setArticleNotFound(null)  // 이전 검색의 "조문 없음" 메시지 제거
   ```

5. **디스플레이 필드 수정** (`app/page.tsx:195, 394, 707`)
   ```typescript
   // BEFORE: a.display (undefined)
   // AFTER: a.joNum (올바른 필드명)
   ```

6. **법령 매칭 로직 개선** (`app/page.tsx:863-891`)
   - 레벤슈타인 거리 기반 유사도 계산 도입
   - 검색어 길이별 적응형 임계값:
     - ≤2글자: 85% 유사도 필요
     - 3+글자: 60% 유사도 필요
   - 새 파일: `lib/text-similarity.ts`

7. **학습 데이터 완전 초기화**
   - 새 스크립트: `reset-all-learning.mjs`
   - 삭제 내용:
     - `search_results`: 80개 행
     - `search_queries`: 80개 행
     - `search_query_embeddings`: 8개 행

#### 새로 추가된 파일

1. **`reset-all-learning.mjs`**
   - 용도: Turso DB의 모든 학습 데이터 완전 삭제
   - 사용: `node reset-all-learning.mjs`

2. **`lib/text-similarity.ts`**
   - 레벤슈타인 거리 알고리즘 구현
   - `calculateSimilarity(a, b)`: 0~1 범위 유사도 반환
   - `findMostSimilar()`: 후보 중 최적 매칭 검색

3. **`EMERGENCY_FIX_PLAN.md`**
   - 상세 문제 분석 및 해결 계획 문서
   - 3가지 해결 방안 비교 (Phase 완전 제거 vs 부분 비활성화 vs 전면 수정)

#### 현재 시스템 상태

**활성화된 구성요소**:
- ✅ Phase 7: IndexedDB 캐시 (버그 수정됨)
- ✅ 기본 검색: law-search API + 개선된 유사도 매칭
- ✅ 조문 자동 선택: 요청 조문 없을 시 가장 유사한 조문 표시

**비활성화된 구성요소**:
- ❌ Phase 5: Intelligent Search (주석 처리)
- ❌ Phase 6: Vector Search (주석 처리)

#### 예상 동작

```
"형법 22조" 검색:
→ Phase 7 캐시 미스
→ Phase 5/6 건너뜀 (비활성화)
→ 기본 검색: "형법" 100% 매칭 ✅
→ 제22조 내용 표시 ✅

"세법" 검색:
→ 기본 검색
→ 정확 매칭 없음
→ 유사도 < 85% (2글자 임계값)
→ 사용자 선택 UI 표시 ✅

"형법 999조" 검색 (존재하지 않는 조문):
→ "형법" 매칭
→ 999조 없음
→ 가장 유사한 조문(예: 373조) 자동 선택
→ 배너: "요청하신 제999조는 없습니다. 유사한 제373조를 표시합니다" ✅
```

#### 영향을 받는 파일

- `app/page.tsx`: Phase 5/6 비활성화, Phase 7 버그 수정, 매칭 로직 개선
- `lib/text-similarity.ts`: 신규 파일 - 레벤슈타인 거리 계산
- `reset-all-learning.mjs`: 신규 파일 - DB 학습 데이터 초기화
- `EMERGENCY_FIX_PLAN.md`: 신규 문서 - 상세 분석 및 계획
- `restart-server.cmd`: 기존 파일 - 완전 클린 재시작 스크립트

#### 향후 계획

**단기 (1주일)**:
- 기본 검색 안정화 모니터링
- Phase 7만 사용한 성능 검증
- 사용자 피드백 수집

**중기 (1개월)**:
- Phase 5 재설계: 신뢰도 점수 시스템 도입
- 자동 검증 메커니즘 구현
- Phase 6 벡터 검색 정확도 개선

**장기 (3개월)**:
- 전체 시스템 안정화
- 학습 데이터 품질 관리 시스템
- 모니터링 대시보드 구축

### 2025-11-05: 행정규칙 시스템 및 3단 비교 완전 구현

#### 주요 구현 사항

1. **시행규칙 파싱 경로 수정 (CRITICAL)**
   - 문제: API 구조 오해로 `시행규칙조문목록?.시행규칙조문` 경로 사용
   - 해결: 올바른 경로 `rawArticle.시행규칙조문` 직접 접근
   - 영향: 3단 비교 기능 완전 동작
   - 파일: `lib/three-tier-parser.ts:121-150`

2. **행정규칙 중복 제거**
   - 문제: 같은 행정규칙이 여러 카테고리(훈령, 예규, 고시)에서 중복 표시
   - 해결: Map 기반 중복 제거 (`serialNumber` 우선, 없으면 `id` 사용)
   - 영향: 검색 결과 정확도 향상 (예: 관세법 38조 4건 → 2건)
   - 파일: `lib/hierarchy-parser.ts:106-133`

3. **위임조문 뷰 스크롤 구현**
   - 문제: 2단/3단 뷰에서 콘텐츠 길이가 길어지면 전체 페이지 스크롤 발생
   - 해결: `calc(100vh - 250px)` 고정 높이 컨테이너로 각 열 독립 스크롤
   - 파일: `components/law-viewer.tsx:1595, 1725`

4. **행정규칙 성능 최적화**
   - **IndexedDB 영구 캐싱**: 이미 구현된 기능 유지
   - **HTTP 브라우저 캐싱 활성화**:
     - Hierarchy API: 1시간 revalidate
     - Admin rule content: 24시간 revalidate
   - **완전 병렬 API 호출**: Promise.all로 모든 규칙 동시 조회
   - 영향: 초기 로딩 대기 시간 단축, 재방문 시 즉시 로딩
   - 파일: `lib/use-admin-rules.ts:67-72, 106-109`

5. **개정 마커 스타일 확장**
   - 추가 패턴: `[본조신설]`, `[본조삭제]`, `[종전 ~ 이동]`
   - 기존 패턴: `<개정>`, `＜개정＞`, `＜신설＞` 등
   - 파일: `lib/law-xml-parser.tsx:359-385`

6. **UI 개선**
   - 버튼 라벨 변경: "2단 비교" → "시행령", "3단 비교" → "시행규칙"
   - 위임조문 뷰 간소화: 중복 정보(아이콘, 배지, 조번호 중복) 제거
   - 제목 표시: `delegation.title`만 사용 (조번호 포함됨)
   - 디버그 콘솔: 기본 축소 상태로 시작
   - 파일: `components/law-viewer.tsx:1201-1223, 1659-1707`

#### 기술 패턴

- **Fixed viewport heights**: `calc(100vh - offset)` 패턴으로 독립 스크롤 구현
- **Map-based deduplication**: 고유 식별자(serialNumber > id)로 중복 제거
- **HTTP caching**: 데이터 변경 빈도에 따른 적절한 revalidate 시간 설정
- **Debug logging**: 파싱 단계에서 상세 로깅으로 API 구조 분석

#### 영향 파일

- `lib/hierarchy-parser.ts`: 행정규칙 중복 제거
- `lib/three-tier-parser.ts`: 시행규칙 파싱 경로 수정 + 디버그 로깅
- `lib/use-admin-rules.ts`: HTTP 캐싱 활성화
- `lib/law-xml-parser.tsx`: 개정 마커 패턴 확장
- `components/law-viewer.tsx`: 스크롤, UI 간소화, 버튼 라벨, 자동 뷰 전환
- `components/debug-console.tsx`: 기본 축소 상태

### 2025-11-04: 3단 비교 UI 개선 및 버그 수정

#### 수정된 문제들
1. **개정 이력 마커 줄바꿈 오류 수정**
   - 문제: `＜개정 2010. 3. 26.＞` 같은 개정 이력 마커가 날짜 부분에서 줄바꿈되는 현상
   - 원인: `formatDelegationContent()` 함수의 정규식이 날짜 내 숫자 패턴(예: "2010. ", "3. ")을 항목 번호로 잘못 인식
   - 해결: 부정형 후방탐색(`(?<!\d\. )`)과 전방탐색(`(?!\d+\.)`)을 사용하여 날짜 패턴 제외
   - 파일: `lib/law-xml-parser.tsx:339`

2. **인용조문 데이터 로딩 비활성화**
   - 변경: 인용조문(knd=1) API 호출 완전 제거, 위임조문(knd=2)만 로드
   - 이유: 현재 위임조문만 필요하므로 불필요한 API 호출 제거
   - 파일: `app/api/three-tier/route.ts`
   - 변경사항:
     - 인용조문 API 요청 제거
     - 응답에서 `citation: null` 반환
     - `parseThreeTierCitation` 임포트 제거

3. **3단 비교 버튼 활성화 로직 개선**
   - 문제: 시행규칙 내용이 없는데도 3단 비교 버튼이 활성화됨
   - 해결:
     - `hasValidSihyungkyuchik` 체크 추가: 실제 시행규칙 콘텐츠가 있는지 확인
     - 3단 버튼 표시 조건: `threeTierDataType === "delegation" && hasValidSihyungkyuchik`
     - 자동 뷰 모드 전환: 시행규칙이 없는 조문으로 이동 시 자동으로 2단 또는 1단 뷰로 전환
   - 파일: `components/law-viewer.tsx:117, 960, 275-283`

#### 기술적 세부사항
- **정규식 개선**: 날짜 패턴(`\d+\. \d+\. \d+\.`)과 항목 번호(`1. `, `2. `)를 구분하는 정규식 패턴 구현
- **타입 필터링**: `validDelegations.some((d) => d.type === "시행규칙")`로 시행규칙 존재 여부 확인
- **자동 뷰 전환**: useEffect를 통해 현재 조문의 데이터에 따라 tierViewMode를 자동으로 조정

#### 영향을 받는 파일
- `lib/law-xml-parser.tsx`: formatDelegationContent() 함수 수정
- `app/api/three-tier/route.ts`: 인용조문 API 호출 제거
- `components/law-viewer.tsx`: 3단 버튼 활성화 로직 및 자동 전환 로직 추가
