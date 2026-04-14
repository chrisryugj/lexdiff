# AI 검색 실패 원인 분석 및 수정 계획

**작성일**: 2026-03-18
**상태**: 분석 완료 / 수정 대기

---

## 1. 증상

- **법령 검색**: 정상 동작
- **AI 관련 질의**: 무조건 "검색 결과 없음" 오류 페이지 표시
- **법령/AI 분기 다이얼로그**: 표시되지 않음 (분기 이전에 실패)

---

## 2. 근본 원인 (Critical)

### 2-1. `@anthropic-ai/sdk` 미설치 → 빌드 실패 (가장 큰 원인)

**파일**: `lib/fc-rag/anthropic-client.ts:9`

```
Module not found: Can't resolve '@anthropic-ai/sdk'
```

**원인 경위**:
- 최근 대규모 백엔드 구조변경에서 OpenClaw Gateway를 제거하고 Anthropic SDK 직접 호출로 전환 (커밋 `470aa6d`)
- `package.json`에 `"@anthropic-ai/sdk": "^0.79.0"` 추가됨
- 그러나 `pnpm install` 실행 없이 Vercel/로컬에서 빌드 시도
- 빌드 자체가 실패하여 **모든 API 라우트가 작동 불가**
- `/api/fc-rag` 호출 시 500 에러 → 프론트에서 `API 오류: 500` throw → catch 블록에서 `isAiMode(false)` 설정 → "검색 결과 없음" 페이지

**영향 범위**: AI 검색 전체 (Claude primary + Gemini fallback 모두)

**import chain**:
```
app/api/fc-rag/route.ts
  → lib/fc-rag/engine.ts
    → lib/fc-rag/anthropic-client.ts  ← @anthropic-ai/sdk 미설치
```

`engine.ts`가 `anthropic-client.ts`를 import하므로, Gemini fallback 코드도 같은 모듈에 있어서 **모듈 로드 자체가 실패** → Gemini도 사용 불가.

**수정**: `pnpm install` 실행 (완료)

---

## 3. 부차적 이슈 (Medium - 이미 최근 커밋에서 수정됨)

### 3-1. 프론트 분류기: `forcedMode` 전달 누락 (수정됨: `d277b1d`)

**파일**: `components/search-bar/hooks/useSearchBarHandlers.ts:59`

**문제**: `classifySearchQuery()`가 `searchType: 'ai'`로 정확히 분류해도, `forcedMode: 'ai'`가 `onSearch()` 호출 시 누락되어 `handleSearchInternal`에서 무시됨.

**수정 내용** (이미 적용):
```diff
+ forcedMode: 'ai',
```

### 3-2. `handleSearchInternal`에서 `forcedMode` 미전파 (수정됨: `6d1b4a8`)

**파일**: `components/search-result-view/hooks/useSearchHandlers/index.ts:66`

**문제**: `handleSearchInternal`의 `forcedMode` 파라미터가 실제로는 항상 `undefined`로 호출됨. query 객체에 `forcedMode`가 들어있었지만 별도 파라미터로만 체크.

**수정 내용** (이미 적용):
```diff
+ const effectiveForcedMode = forcedMode || (query as any).forcedMode
```

### 3-3. Claude 내부 에러 시 Gemini 폴백 미실행 (수정됨: `c480748`)

**파일**: `app/api/fc-rag/route.ts:133-163`

**문제**: `executeClaudeRAGStream`이 `error` + `answer` 이벤트를 순차 yield하는데, route.ts에서 error 이후 answer를 클라이언트에 전송하면 handled=true가 되어 Gemini 폴백이 실행되지 않았음.

**수정 내용** (이미 적용):
- `claudeHadError` 플래그로 error 이후 answer 이벤트를 스킵
- 루프 종료 후 `claudeHadError`면 throw → Gemini 폴백 실행

### 3-4. AI 검색 실패 시 스피너 무한 회전 (수정됨: `ad5fb68`)

**파일**: `components/search-result-view/hooks/useSearchHandlers/useAiSearch.ts:73-81`

**문제**: AI 비밀번호 게이트 실패, abort, 등에서 `setIsSearching(false)` 누락

**수정 내용** (이미 적용):
- 모든 early return 경로에 `actions.setIsSearching(false)` + `updateProgress('complete', 0)` 추가
- stale closure 문제 해결 (무조건 해제로 변경)

---

## 4. 잠재적 위험 (Low - 모니터링 필요)

### 4-1. Anthropic 토큰 읽기 경로: Vercel 환경 호환성

**파일**: `lib/fc-rag/anthropic-client.ts:15-18`

```typescript
const AUTH_PROFILES_PATH = join(
  process.env.HOME || process.env.USERPROFILE || '',
  '.openclaw/agents/lexdiff-law/agent/auth-profiles.json',
)
```

**위험**: Vercel serverless 환경에서 `HOME`이 설정되어 있어도 해당 파일이 존재하지 않음. `readFileSync` 실패 → `process.env.ANTHROPIC_API_KEY` 폴백으로 작동해야 하지만, 해당 환경변수가 Vercel에 설정되어 있는지 확인 필요.

**대응**: Claude 실패 시 Gemini 폴백이 정상 동작하므로 (3-3 수정 적용), Gemini만으로도 서비스 가능. 단, `ANTHROPIC_API_KEY`가 Vercel에 설정되면 Claude가 primary로 작동.

### 4-2. `engine.ts`의 모듈 레벨 import 구조

현재 `engine.ts`가 Claude/Gemini 엔진을 모두 포함하므로, `anthropic-client.ts`의 import 실패가 Gemini 폴백까지 차단함. Dynamic import로 분리하면 Gemini 독립성을 보장할 수 있지만, 현재 pnpm install로 해결되었으므로 우선순위 낮음.

---

## 5. 검증 결과

| 항목 | 상태 | 비고 |
|------|------|------|
| `pnpm install` | ✅ 완료 | `@anthropic-ai/sdk 0.79.0` 설치 |
| `npm run build` | ✅ 성공 | 모든 라우트 정상 빌드 |
| 프론트 분류기 `forcedMode` | ✅ 이미 수정됨 | `d277b1d`, `6d1b4a8` |
| Claude→Gemini 폴백 | ✅ 이미 수정됨 | `c480748` |
| 스피너 무한 회전 | ✅ 이미 수정됨 | `ad5fb68` |
| 빈 답변 캐싱 방지 | ✅ 이미 수정됨 | `54af322` |

---

## 6. 프론트 분류기 흐름 검증

### 정상 AI 쿼리 흐름 (수정 후)

```
사용자: "근로기준법에서 연차휴가 요건이 뭐야"
  ↓
useSearchBarHandlers.executeSearch()
  ↓ classifySearchQuery() → searchType: 'ai', confidence: 0.95
  ↓ confidence >= 0.7 → forcedMode: 'ai' 설정
  ↓
handleSearchInternal()
  ↓ effectiveForcedMode = query.forcedMode = 'ai'
  ↓ isAiSearch = true
  ↓
handleAiSearch()
  ↓ POST /api/fc-rag
  ↓
route.ts
  ↓ executeClaudeRAGStream() (primary)
  ↓ 실패 시 → executeGeminiRAGStream() (fallback)
  ↓
SSE 스트림 → answer 이벤트 → AI 답변 표시
```

### 이전 실패 흐름 (수정 전)

```
사용자: "근로기준법에서 연차휴가 요건이 뭐야"
  ↓
useSearchBarHandlers.executeSearch()
  ↓ classifySearchQuery() → searchType: 'ai', confidence: 0.95
  ↓ forcedMode 누락! (3-1)
  ↓
handleSearchInternal()
  ↓ forcedMode = undefined (파라미터), query.forcedMode도 미체크 (3-2)
  ↓ queryDetection 재감지 → 결과에 따라 법령 검색으로 분기 가능
  ↓ 또는 AI로 분기해도...
  ↓
POST /api/fc-rag
  ↓ engine.ts 모듈 로드 실패 (anthropic-client.ts → @anthropic-ai/sdk 미설치)
  ↓ 500 Internal Server Error (2-1)
  ↓
catch 블록 → isAiMode(false) → "검색 결과 없음" 페이지
```

---

## 7. 요약

| 분류 | 원인 | 심각도 | 수정 상태 |
|------|------|--------|-----------|
| **빌드** | `@anthropic-ai/sdk` 미설치 | 🔴 Critical | ✅ pnpm install 완료 |
| **프론트** | forcedMode 전달 누락 | 🟡 Medium | ✅ 최근 커밋에서 수정 |
| **프론트** | forcedMode 미전파 | 🟡 Medium | ✅ 최근 커밋에서 수정 |
| **백엔드** | Claude→Gemini 폴백 미실행 | 🟡 Medium | ✅ 최근 커밋에서 수정 |
| **프론트** | 스피너 무한 회전 | 🟢 Low | ✅ 최근 커밋에서 수정 |
| **환경** | Vercel ANTHROPIC_API_KEY | 🟢 Low | ⚠️ 확인 필요 |
