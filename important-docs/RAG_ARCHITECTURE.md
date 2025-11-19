# Google File Search RAG 시스템 아키텍처

**현재 메인 기능**: 자연어 질문 → 실시간 AI 답변 + 법령 인용

---

## 🏗️ 시스템 구조

```
User Query: "관세법 제38조에서 말하는 수입이란?"
    ↓
[file-search-rag-view.tsx] SSE 스트리밍 시작
    ↓
[/api/file-search-rag] Gemini 2.0 Flash + File Search
    ↓
[SSE Stream] data: {"type":"text","text":"..."} 실시간 전송
    ↓
[Citation Modal] 클릭 시 해당 법령 조문 표시
```

---

## 🔴 핵심 구현 패턴

### 1. SSE Buffer Handling (CRITICAL)

**파일**: `components/file-search-rag-view.tsx` (142-172줄)

```typescript
while (true) {
  const { done, value } = await reader.read()
  if (done) break

  buffer += decoder.decode(value, { stream: true })
  const lines = buffer.split('\n')
  buffer = lines.pop() || ''  // 마지막 불완전한 줄 보관

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const parsed = JSON.parse(line.slice(6))
      // 처리...
    }
  }
}

// ⚠️ CRITICAL: 루프 종료 후 남은 buffer 처리
if (buffer.trim()) {
  if (buffer.startsWith('data: ')) {
    const parsed = JSON.parse(buffer.slice(6))
    // 최종 청크 처리
  }
}
```

**실수 사례**: 루프 종료 후 buffer 처리 누락 → 답변 중간 잘림

---

### 2. Overlay Progress Display

**파일**: `components/file-search-rag-view.tsx` (288-365줄)

```typescript
// ❌ WRONG
{isAnalyzing && !analysis && (<div>Progress</div>)}
// → 첫 청크 도착 시 analysis가 생기면서 progress 사라짐

// ✅ CORRECT
{isAnalyzing && (
  <div className="absolute inset-0 bg-background/95 backdrop-blur-sm">
    {/* 진행 단계 표시 - 스트리밍 중에도 유지 */}
  </div>
)}
```

---

### 3. API Response Parsing

**파일**: `components/file-search-rag-view.tsx` (155-249줄)

```typescript
// XML 파싱 (law-search)
const searchXml = await searchRes.text()
const parser = new DOMParser()
const searchDoc = parser.parseFromString(searchXml, 'text/xml')
const lawId = searchDoc.querySelector('법령ID')?.textContent

// JSON 원본 스키마 (eflaw)
const eflawJson = await eflawRes.json()
const lawData = eflawJson?.법령  // NO wrapper .success field
const articleUnits = lawData?.조문?.조문단위
```

**CRITICAL**: `/api/eflaw` 응답에는 wrapper가 없음. 직접 `json?.법령` 접근.

---

## 📂 파일 구조

| 파일 | 역할 |
|------|------|
| `app/api/file-search-rag/route.ts` | SSE 스트리밍 엔드포인트 |
| `components/file-search-rag-view.tsx` | UI + SSE 처리 + Citation 모달 |
| `lib/file-search-client.ts` | Gemini File Search 클라이언트 |
| `lib/ai-answer-processor.ts` | Markdown → HTML 변환 |
| `components/reference-modal.tsx` | 조문 모달 표시 |

---

## 🚨 자주 발생하는 버그

1. **AI 답변 잘림**: SSE buffer 처리 누락
2. **Progress 즉시 사라짐**: 조건문에 `!analysis` 포함
3. **Modal 열리지만 빈 화면**: XML/JSON 파싱 혼동
4. **인코딩 깨짐**: curl 사용 시 한글 깨짐 (브라우저는 정상)

---

## 🔗 참고

- Gemini 2.0 Flash 모델 사용
- File Search Store ID: 환경변수 `GEMINI_FILE_SEARCH_STORE_ID`
- Token usage 로깅: `lib/file-search-client.ts`
