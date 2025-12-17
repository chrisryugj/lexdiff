# CLAUDE.md - LexDiff 프로젝트

---

## 📚 문서 참조

| 우선순위 | 문서 | 내용 |
|----------|------|------|
| 🔴 | [JSON→HTML 파싱](important-docs/03-JSON_TO_HTML_FLOW.md) | API→HTML 파이프라인, extractArticleText() |
| 🔴 | [RAG Architecture](important-docs/05-RAG_ARCHITECTURE.md) | SSE 버퍼, XML/JSON 파싱 |
| 🟡 | [Debugging Guide](important-docs/02-DEBUGGING_GUIDE.md) | 에러 패턴, Debug Console |
| 🟢 | [Change Log](important-docs/01-CHANGELOG.md) | 변경 이력 |

**Skills**: `.claude/skills/` (systematic-debugging, root-cause-tracing 등)
**전역 동기화**: `/sync-global` → `.claude/global-claude-md.sync.md`

---

## 🔴 Quick Reference

### 1. SSE Buffer - 루프 후 잔여 버퍼 처리 필수
```typescript
if (buffer.trim() && buffer.startsWith('data: ')) {
  const parsed = JSON.parse(buffer.slice(6))
}
```
📍 `file-search-rag-view.tsx:142-172`

### 2. API 응답 - XML vs JSON
- **XML**: `/api/law-search`, `/api/oldnew` → `DOMParser`
- **JSON**: `/api/eflaw`, `/api/three-tier` → `json?.법령` 직접 접근

### 3. JO 코드 - 6자리 내부 형식
`"제38조"` → `"003800"` / `"제10조의2"` → `"001002"`
📍 `lib/law-parser.ts`: `buildJO()`, `formatJO()`

### 4. onClick - 모바일에서 async 금지
```typescript
// ❌ async () => await foo()
// ✅ () => foo().then().catch()
```

### 5. 조례 판별
```typescript
/조례|규칙/.test(lawName) || /(특별시|광역시|도|시|군|구)\s+[가-힣]/.test(lawName)
```

### 6. 법령 링크 패턴
📍 `lib/unified-link-generator.ts` - 모든 링크 생성은 이 파일 사용

### 7. 모달 히스토리 스택
모달 내 법령 링크 → `modalHistory` 배열로 뒤로가기 지원
📍 `reference-modal.tsx`, `comparison-modal.tsx`

---

## Project Overview

한국 법령 비교 시스템 + Google File Search RAG AI 검색
- 법제처 API (law.go.kr) 연동
- AI: Gemini 2.5 Flash (RAG, 요약)

**핵심**: AI 검색, 3단 비교, 행정규칙 조회, 통합 링크 시스템

---

## Commands

```bash
npm run dev      # 개발 서버
npm run build    # 빌드
npm run lint     # 린트
```

---

## 🔴 환경변수 (`.env.local`)

| 변수명 | 값 | 용도 |
|--------|-----|------|
| `LAW_OC` | `ryuseungin` | 법제처 API 인증키 |
| `GEMINI_API_KEY` | (비공개) | Gemini AI API 키 |
| `GEMINI_FILE_SEARCH_STORE_ID` | (비공개) | File Search RAG 스토어 ID |

**CLI에서 API 테스트 시**:
```bash
# Windows PowerShell
$env:LAW_OC="ryuseungin"; curl "https://www.law.go.kr/DRF/lawService.do?target=eflaw&OC=$env:LAW_OC&type=JSON&MST=000013&JO=002800"

# Git Bash / WSL
LAW_OC=ryuseungin curl "https://www.law.go.kr/DRF/lawService.do?target=eflaw&OC=$LAW_OC&type=JSON&MST=000013&JO=002800"
```

---

## 🟡 Implementation Details

### Unified Link Generator
📍 `lib/unified-link-generator.ts` - **모든 법령 링크는 이 파일 사용** (직접 regex 금지)
- `safe` 모드: 「」 안만 링크 (AI 답변용)
- `aggressive` 모드: 모든 패턴 (법령 뷰어용)

### State Management
- **Singleton**: `favorites-store.ts`, `debug-logger.ts`, `error-report-store.ts`
- **IndexedDB**: `law-content-cache.ts` (7일), `admin-rule-cache.ts` (영구)

### API 날짜 형식
- API: `YYYYMMDD` / UI: `YYYY-MM-DD`
- 📍 `app/api/eflaw/route.ts`: `normalizeDateFormat()`

---

## Tech Stack

| 분류 | 기술 |
|------|------|
| Framework | Next.js 16, React 19, TypeScript 5 |
| Styling | Tailwind CSS v4, shadcn/ui |
| AI | Gemini 2.5 Flash, `@google/genai` |
| State | React Hooks + IndexedDB |
| DB | Turso/LibSQL |

---

## 📁 Key Files

| 경로 | 설명 |
|------|------|
| `lib/unified-link-generator.ts` | 통합 링크 시스템 (핵심) |
| `lib/law-parser.ts` | JO 코드 파서 |
| `components/search-result-view.tsx` | 검색 결과 ⚠️ 2,340줄 |
| `components/law-viewer.tsx` | 법령 뷰어 |
| `app/api/file-search-rag/` | RAG SSE API |

---

**버전**: 2.5 | **업데이트**: 2025-11-30
