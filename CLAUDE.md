# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 📚 Important Documents Reference

**CRITICAL**: 상세한 내용은 아래 문서를 참조하세요. Claude는 필요시 자동으로 이 문서들을 읽습니다.

- 🔴 **[JSON→HTML 파싱 플로우](important-docs/03-JSON_TO_HTML_FLOW.md)** 🚨 **가장 자주 참조**
  - API JSON 응답 → HTML 생성 전체 파이프라인
  - `extractArticleText()` 상세 설명
  - 자주 발생하는 실수 패턴

- 🔴 **[RAG Architecture](important-docs/05-RAG_ARCHITECTURE.md)**
  - Google File Search RAG 시스템 구조
  - SSE 버퍼 처리 패턴 (답변 잘림 방지)
  - API 응답 파싱 (XML vs JSON)

- 🟡 **[Debugging Guide](important-docs/02-DEBUGGING_GUIDE.md)**
  - 자주 발생하는 에러 패턴 및 해결법
  - Debug Console 사용법
  - 환경별 디버깅 방법

- 🟢 **[Change Log](important-docs/01-CHANGELOG.md)**
  - 날짜별 상세 변경 이력
  - 문제 → 해결 → 영향 기록
  - 과거 버그 재발 방지

### 📄 Additional Documentation

- `docs/06-GEMINI_FILE_SEARCH_GUIDE.md` - File Search 설정 (핵심)
- `docs/11-REFACTORING_PLAN_V3.md` - 현재 진행중 리팩토링 계획
- `docs/13-bmad-architect-full-project-analysis.md` - 전체 아키텍처 분석
- `.claude/agent.md` - 에이전트 활용 가이드
- `task.md` - 작업 로그
- `docs/future/` - 미래 기능 계획 (Phase 8+)
- `docs/archived/` - 완료된 구현 문서 (29개)

---

## 🤖 Claude Code 작업 지침

### 🚨 요구사항 명확화 우선 (CRITICAL)

**모든 작업 시작 전 필수 확인**:

1. **불명확한 요구사항이 있는가?**
   - 모호하거나 정보가 부족한 부분을 찾아냄
   - **절대 임의로 결정하지 말 것**
   - "확인이 필요한 질문 리스트"를 우선순위별로 작성

2. **질문과 함께 추천 안 제시**:
   ```markdown
   ## 확인이 필요한 사항

   ### 1. [높은 우선순위] 레이아웃 구조
   **질문**: 모바일과 데스크탑에서 다른 레이아웃을 사용하시나요?
   **추천 안**: 반응형 그리드(Tailwind md: 브레이크포인트) 사용
   **이유**: 유지보수 용이, 일관된 UX

   ### 2. [중간 우선순위] 데이터 캐싱 전략
   **질문**: API 응답을 어느 정도 기간 캐시하시겠습니까?
   **추천 안**: 1시간 (next.revalidate: 3600)
   **이유**: 법령 데이터는 자주 변경되지 않음
   ```

3. **사용자 답변 확인 후 작업 시작**:
   - 모든 불명확한 사항 해결 확인
   - .claude/agent.md 참조하여 적절한 에이전트 활용 검토

**예시**:
```
❌ "아마도 이 방식이 맞을 것 같아 진행했습니다"
✅ "A 방식(추천)과 B 방식이 있습니다. A 방식을 추천하는 이유는..."
```

### 🚨 파일 크기 제한 (CRITICAL)

**25,000 토큰 제한**: Claude Code는 한 번에 25,000 토큰 이상의 파일을 읽을 수 없습니다.

**필수 원칙**:
1. ✅ **컴포넌트는 항상 작게**: 단일 파일은 **1,000줄 이하** 권장
2. ✅ **조기 분리**: 500줄 넘으면 분리 검토 시작
3. ✅ **책임 분리**: UI / 로직 / 유틸리티 파일 분리
4. ❌ **거대 컴포넌트 금지**: 3,000줄 이상은 읽기/수정 불가능

**컴포넌트 분리 기준**:
```typescript
// ❌ 나쁜 예: 하나의 거대한 컴포넌트
components/
  law-viewer.tsx (4,000줄) ← 읽기 불가능

// ✅ 좋은 예: 작은 컴포넌트로 분리
components/
  law-viewer/
    index.tsx (200줄) ← 메인 컴포넌트
    article-list.tsx (150줄) ← 조문 목록
    article-content.tsx (180줄) ← 조문 내용
    modals/
      reference-modal-handler.tsx (120줄) ← 모달 로직
      external-law-loader.tsx (100줄) ← 외부 법령 로드
    hooks/
      use-article-navigation.tsx (80줄) ← 네비게이션 hook
      use-modal-state.tsx (60줄) ← 모달 상태 hook
```

**리팩토링 시점**:
- 📏 파일이 1,500줄 초과: 즉시 분리 계획 수립
- 🔍 파일 읽기 실패: 긴급 분리 필요
- 🐛 버그 수정 어려움: 복잡도 과다 신호

### 문서 참조 자동화

**CRITICAL**: 작업 시작 시 항상 관련 문서를 먼저 읽으세요!

```typescript
// 예시: HTML 생성 관련 작업을 할 때
1. Read important-docs/03-JSON_TO_HTML_FLOW.md
2. 문서의 패턴 확인
3. 작업 진행
4. 디버깅 필요 시 important-docs/02-DEBUGGING_GUIDE.md 참조
```

### 불확실성 처리 원칙

**CRITICAL**: 작업 계획 수립 시 불확실한 부분이 있다면 **반드시 멈추고 사용자에게 질문**하세요!

**DO NOT**:
- ❌ 추측으로 작업 진행
- ❌ 요구사항이 불명확한 상태에서 구현 시작
- ❌ 여러 접근 방식 중 임의로 선택
- ❌ 문서에 없는 패턴을 추측으로 생성

**DO**:
- ✅ 관련 important-docs 문서 먼저 확인
- ✅ 문서에도 없고 불명확하면 사용자에게 질문
- ✅ 요구사항 명확화 후 작업 시작
- ✅ 여러 접근 방식이 있다면 사용자에게 선택 요청

**예시**:
```
❌ "아마 이 방식이 맞을 것 같아서 진행했습니다"
✅ "이 부분은 A 방식과 B 방식이 가능합니다. 어떤 방식을 선호하시나요?"
```

### 문서 업데이트 원칙

**새로운 패턴을 발견하거나 버그를 수정할 때**:

1. 해당 important-docs 문서를 먼저 업데이트
2. 문제 → 해결 → 영향을 명확히 기록
3. 01-CHANGELOG.md에 날짜별로 추가
4. 이 CLAUDE.md는 참조 링크만 유지

**예시**:
```
❌ CLAUDE.md에 500줄 추가
✅ important-docs/03-JSON_TO_HTML_FLOW.md 업데이트 + 01-CHANGELOG.md 날짜별 기록
```

---

## 🔴 Quick Reference (Most Critical Patterns)

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
📖 상세: [RAG_ARCHITECTURE.md](important-docs/05-RAG_ARCHITECTURE.md)

### 2. API Response Parsing (XML vs JSON)
```typescript
// XML: /api/law-search, /api/oldnew, /api/hierarchy
const xml = await response.text()
const doc = new DOMParser().parseFromString(xml, 'text/xml')

// JSON: /api/eflaw, /api/three-tier (NO wrapper fields)
const json = await response.json()
const lawData = json?.법령  // Direct access
```
📖 상세: [JSON_TO_HTML_FLOW.md](important-docs/03-JSON_TO_HTML_FLOW.md)

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
📍 `lib/unified-link-generator.ts`

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
```
📍 `components/reference-modal.tsx`, `components/comparison-modal.tsx`

---

## Claude Code Working Guidelines

**Context Window Management**:
- Your context window automatically compresses when approaching limits
- **NEVER prematurely terminate work due to token budget concerns**
- **NEVER artificially interrupt work early, regardless of how much context remains**

**CRITICAL**: 작업 시작 전 항상 관련 important-docs 문서를 먼저 읽으세요!

---

## Project Overview

LexDiff는 한국 법령 비교 시스템으로 **Google File Search RAG**를 통한 자연어 AI 검색을 지원합니다. 법제처 API(law.go.kr)와 연동하며, AI 검색에 Gemini 2.0 Flash, 변경 분석에 Gemini 2.5 Flash를 사용합니다.

**핵심 기능**:
- 🔍 **AI 자연어 검색**: Google File Search RAG (실시간 SSE 스트리밍 + 인용 출처)
- 📊 **3단 비교**: 법률 + 시행령 + 시행규칙 동시 표시
- 📋 **행정규칙 조회**: Optimistic UI + IndexedDB 영구 캐싱
- 🔗 **통합 링크 시스템**: 모든 법령 참조를 클릭 가능한 링크로 변환

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
- `GEMINI_FILE_SEARCH_STORE_ID`: Google File Search store ID

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

**CRITICAL**:
- 모든 컴포넌트는 이 통합 시스템을 사용해야 함 (직접 regex 작성 금지)
- linkifyRefsB() 함수는 generateLinks()의 래퍼 (safe 모드 기본값)

📍 **사용처**:
- `lib/law-xml-parser.tsx`: 법령 뷰어 HTML 생성
- `lib/ai-answer-processor.ts`: AI 답변 HTML 변환

### State Management 🟡

**Singleton Stores (pub/sub 패턴)**:
- `lib/favorites-store.ts` - 즐겨찾기
- `lib/debug-logger.ts` - 디버그 로깅
- `lib/error-report-store.ts` - 에러 리포트 (Zustand)

**IndexedDB Caching**:
- `lib/law-content-cache.ts` - 법령 내용 (7일 TTL)
- `lib/admin-rule-cache.ts` - 행정규칙 (영구, Optimistic UI)

**History API**: URL 변경 없이 검색 결과 히스토리 관리 (`lib/history-manager.ts`)

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

## Technology Stack

| Category | Technology |
|----------|------------|
| **Framework** | Next.js 16 (App Router), React 19, TypeScript 5 |
| **Styling** | Tailwind CSS v4 (`@tailwindcss/postcss`), shadcn/ui, Radix UI |
| **AI** | Gemini 2.5 Flash (File Search RAG, 요약), `@google/genai` |
| **State** | React Hooks + localStorage + IndexedDB (Zustand은 에러 리포트만) |
| **Caching** | IndexedDB (7일 쿼리, 영구 행정규칙), HTTP Cache (1h/24h) |
| **Database** | Turso/LibSQL (학습 데이터) |
| **Runtime** | Node.js 20+ |

**API 라우트**: 49개 (법령 검색/조회, AI/RAG, Admin 관리 28개)

---

## Documentation Structure

- `important-docs/` - 핵심 구현 패턴 및 아키텍처
- `docs/` - API, 배포, 설정 가이드
- `docs/archived/` - 완료된 구현 문서
- `docs/future/` - 미래 기능 계획
- `CLAUDE.md` - 이 파일 (참조 허브)
- `README.md` - User-facing project documentation

---

## 🤖 CLAUDE.md 관리 가이드

### 이 문서는 살아있는 문서입니다

**문서 업데이트 원칙**:

1. **새로운 중요 패턴 발견 시**:
   - important-docs/에 새 파일 생성 또는 기존 파일 업데이트
   - 이 CLAUDE.md에 참조 링크 추가
   - 01-CHANGELOG.md에 날짜별 기록

2. **버그 수정 시**:
   - important-docs/03-JSON_TO_HTML_FLOW.md 또는 02-DEBUGGING_GUIDE.md 업데이트
   - "자주 발생하는 실수" 섹션에 추가
   - 01-CHANGELOG.md에 기록

3. **이 CLAUDE.md는**:
   - 300줄 이하 유지
   - Quick Reference만 포함
   - 상세 내용은 항상 important-docs/ 참조

### 작성 베스트 프랙티스

**DO**:
- ✅ important-docs에 상세 내용 작성
- ✅ CLAUDE.md에는 참조 링크만 유지
- ✅ Quick Reference는 7-10개 핵심 패턴만
- ✅ 파일 경로와 함께 📍 표시

**DON'T**:
- ❌ CLAUDE.md에 500줄 이상 추가
- ❌ 중복 설명 (한 곳에만 작성)
- ❌ 날짜 없는 변경 이력
- ❌ 구현 완료된 내용을 CLAUDE.md에 유지

### 문서 참조 자동화 원칙

**Claude Code는 작업 전 자동으로**:
1. CLAUDE.md 읽음 (Quick Reference 확인)
2. 필요한 important-docs 파일 자동 읽음
3. 패턴 확인 후 작업 시작
4. 새로운 패턴 발견 시 문서 업데이트 제안

**예시 작업 플로우**:
```
Task: "JSON 파싱 버그 수정"
  ↓
1. Read CLAUDE.md (Quick Reference 확인)
  ↓
2. Read important-docs/03-JSON_TO_HTML_FLOW.md (상세 패턴 확인)
  ↓
3. 버그 수정
  ↓
4. 03-JSON_TO_HTML_FLOW.md 업데이트 ("자주 발생하는 실수" 추가)
  ↓
5. 01-CHANGELOG.md에 날짜별 기록
```

---

## 📁 Project Structure (Key Files)

```
app/
├── page.tsx                    # 메인 페이지 (IndexedDB + History API)
├── api/                        # 49개 API 라우트
│   ├── file-search-rag/        # Google File Search RAG (SSE)
│   ├── eflaw/                  # 현행 법령 (JSON)
│   ├── law-search/             # 법령 검색 (XML)
│   ├── three-tier/             # 3단 비교 (JSON)
│   ├── admrul/                 # 행정규칙
│   └── admin/                  # Admin 관리 (28개)
components/
├── search-result-view.tsx      # 검색 결과 (2,340줄 - 리팩토링 필요)
├── law-viewer.tsx              # 법령 뷰어 (1,176줄)
├── file-search-answer-display.tsx  # AI 답변 표시
├── reference-modal.tsx         # 법령 참조 모달
└── admin/                      # Admin 패널 컴포넌트
lib/
├── unified-link-generator.ts   # 통합 링크 시스템 (핵심)
├── law-parser.ts               # JO 코드 파서
├── file-search-client.ts       # Google File Search 클라이언트
├── admin-rule-cache.ts         # 행정규칙 캐시 (Optimistic UI)
└── ai-answer-processor.ts      # AI 답변 HTML 변환
hooks/
├── use-admin-rules.ts          # 행정규칙 상태 관리
├── use-law-viewer-modals.ts    # 모달 상태
└── use-law-viewer-three-tier.ts # 3단 비교 상태
```

**⚠️ 대형 컴포넌트 주의**: `search-result-view.tsx` (2,340줄) - 향후 분리 필요

---

**Last Updated**: 2025-11-28
**Total Lines**: ~380
**Important Docs**: 03-JSON_TO_HTML_FLOW, 05-RAG_ARCHITECTURE, 02-DEBUGGING_GUIDE, 01-CHANGELOG
