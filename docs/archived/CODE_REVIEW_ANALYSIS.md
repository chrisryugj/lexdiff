# AI 검색 시스템 코드 분석 보고서
**날짜**: 2025-11-15
**분석자**: 외부 검토 + 현재 코드베이스 비교
**목적**: 제공된 분석 내용과 현재 코드 비교하여 반영 필요 항목 식별

---

## 📋 요약

| 문제 | 분석 결과 | 현재 상태 | 반영 필요 |
|------|-----------|-----------|-----------|
| 1. 법령 모달 빈 화면 | ✅ **정확** | ❌ **문제 있음** | ✅ **반영 필요** |
| 2. 사이드바 목록 안 닫힘 | ✅ **정확** | ✅ **수정 완료** | ❌ 이미 반영됨 |
| 3. 진행률 즉시 사라짐 | ✅ **정확** | ❌ **문제 있음** | ✅ **반영 필요** |
| 4. 스트리밍 답변 잘림 | ✅ **정확** | ❌ **문제 있음** | ✅ **반영 필요** |

---

## 1️⃣ 법령 모달이 빈 화면으로 뜨는 문제 ✅ 반영 필요

### 📌 분석 내용
> handleRelatedArticleClick와 handleCitationClick은 /api/law-search와 /api/eflaw가 JSON({ success, data })을 돌려줄 것이라고 가정하지만, 실제 API는 XML 또는 원본 JSON 문자열을 그대로 반환합니다. 따라서 .json() 호출 단계에서 예외가 발생해 곧바로 catch 블록으로 떨어집니다.

### 🔍 현재 코드 확인

**components/file-search-rag-view.tsx (Line 155-209)**
```typescript
async function handleRelatedArticleClick(lawName: string, jo: string, article: string) {
  try {
    // 1. 법령 검색
    const searchRes = await fetch(`/api/law-search?query=${encodeURIComponent(lawName)}`)
    const searchData = await searchRes.json()  // ❌ XML을 JSON으로 파싱 시도

    if (!searchData.success || !searchData.data) {  // ❌ 존재하지 않는 필드 체크
      throw new Error('법령을 찾을 수 없습니다')
    }

    // 2. 법령 전문 로드
    const eflawRes = await fetch(`/api/eflaw?lawId=${lawId}`)
    const eflawData = await eflawRes.json()  // ✅ JSON이지만 스키마가 다름

    if (!eflawData.success) {  // ❌ 존재하지 않는 필드 체크
      throw new Error(eflawData.error || '법령 전문 로드 실패')
    }
  } catch (err) {
    debugLogger.error('관련 법령 로드 실패', err)
    alert(err instanceof Error ? err.message : '법령 로드 중 오류가 발생했습니다')
  }
}
```

**app/api/law-search/route.ts (Line 58-63)**
```typescript
// ❌ XML을 그대로 반환 (래핑 없음)
return new NextResponse(text, {
  headers: {
    "Content-Type": "application/xml",  // ← XML 타입
    "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
  },
})
```

**app/api/eflaw/route.ts (Line 109-114)**
```typescript
// ⚠️ 원본 JSON을 그대로 반환 ({ success, data } 래핑 없음)
return new NextResponse(text, {
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
  },
})
```

### ✅ 검증 결과
**분석이 100% 정확합니다.**

- `/api/law-search`: XML 반환 → `.json()` 호출 시 **SyntaxError 발생**
- `/api/eflaw`: 원본 JSON 반환 → `.success` 필드 없음 → **조건문 실패**

### 🔧 제안된 해결 방법
> 1. 프런트에서 XML/원본 JSON을 직접 파싱하도록 수정
> 2. 백엔드 API를 수정하여 { success, data } 형태로 래핑

### 📝 구체적 수정 방안

**방안 A: 프런트엔드 수정 (권장)**
```typescript
// components/file-search-rag-view.tsx
async function handleRelatedArticleClick(lawName: string, jo: string, article: string) {
  try {
    // 1. 법령 검색 (XML 파싱)
    const searchRes = await fetch(`/api/law-search?query=${encodeURIComponent(lawName)}`)
    const xmlText = await searchRes.text()

    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlText, 'text/xml')
    const lawNode = doc.querySelector('law')

    if (!lawNode) {
      throw new Error('법령을 찾을 수 없습니다')
    }

    const lawId = lawNode.querySelector('법령ID')?.textContent
    const mst = lawNode.querySelector('법령일련번호')?.textContent

    // 2. 법령 전문 로드 (원본 JSON 파싱)
    const eflawRes = await fetch(`/api/eflaw?lawId=${lawId}`)
    const eflawJson = await eflawRes.json()

    // 원본 스키마 사용
    const lawData = eflawJson?.법령
    const rawArticleUnits = lawData?.조문?.조문단위
    // ... (기존 app/page.tsx의 parseLawJSON 로직 재사용)
  }
}
```

**방안 B: 백엔드 수정 (일관성 향상)**
```typescript
// app/api/law-search/route.ts
return NextResponse.json({
  success: true,
  data: text  // XML 문자열 또는 파싱된 객체
})

// app/api/eflaw/route.ts
return NextResponse.json({
  success: true,
  data: JSON.parse(text)  // 파싱된 객체
})
```

### ⚠️ 영향 범위
- `components/file-search-rag-view.tsx`: handleRelatedArticleClick (사이드바)
- 동일한 패턴이 다른 곳에도 있는지 확인 필요

---

## 2️⃣ 관련 법령 사이드바가 닫히지 않는 문제 ✅ 수정 완료

### 📌 분석 내용
> 사이드바 버튼 클릭 시 openExternalLawArticleModal만 호출하고 패널 상태(isArticleListExpanded)나 상위 콜백(onRelatedArticleClick)은 전혀 건드리지 않습니다.

### 🔍 현재 코드 확인

**components/law-viewer.tsx (Line 1209-1229)** - 최신 커밋 반영됨
```typescript
const handleClick = () => {
  debugLogger.info('🔗 [사이드바] 법령 링크 클릭 - 모달로 열기', { ... })

  // ✅ 사이드바 닫기 (모바일) - 최근 커밋에서 추가됨
  setIsArticleListExpanded(false)

  // ✅ 모달로 법령 조문 열기 (async 호출)
  openExternalLawArticleModal(law.lawName, law.article)
    .then(() => {
      setLastExternalRef({ lawName: law.lawName, joLabel: law.article })
      debugLogger.success('모달 열기 성공', { ... })
    })
    .catch((err) => {
      debugLogger.error('모달 열기 실패', err)
    })
}
```

### ✅ 검증 결과
**이미 최근 커밋(cc01071)에서 수정 완료되었습니다.**

- ✅ `setIsArticleListExpanded(false)` 추가됨
- ✅ 에러 핸들링 개선됨 (.then/.catch)
- ✅ 디버그 로그 추가됨

### 📝 추가 개선 제안
분석에서 제안한 `onRelatedArticleClick?.(law.lawName, law.jo, law.article)` 호출은 **선택 사항**입니다.
- 2단 비교 뷰를 원하면 추가
- 현재는 모달 방식으로 결정되어 불필요

---

## 3️⃣ 자연어 검색 진행률이 즉시 사라지는 문제 ✅ 반영 필요

### 📌 분석 내용
> FileSearchRAGView는 단계별 진행 UI를 isAnalyzing && !analysis일 때만 렌더링합니다. 첫 SSE 청크가 도착해 analysis가 한 글자라도 채워지는 순간 이 조건이 깨져 단계 표시가 즉시 사라집니다.

### 🔍 현재 코드 확인

**components/file-search-rag-view.tsx (Line 221-295)**
```typescript
return (
  <div className="flex flex-col h-full">
    {/* Loading State */}
    {isAnalyzing && !analysis ? (  // ❌ 첫 청크가 오면 조건 깨짐
      <div className="flex items-center justify-center h-full">
        {/* Progress Steps */}
        <div className="space-y-4 mb-8">
          {[
            { icon: Search, label: '법령 데이터베이스 검색', stage: 0 },
            { icon: FileSearch, label: '관련 조문 분석', stage: 1 },
            { icon: Sparkles, label: 'AI 답변 생성', stage: 2 },
            { icon: CheckCircle, label: '답변 최적화', stage: 3 }
          ].map(({ icon: Icon, label, stage }) => {
            // ...
          })}
        </div>
      </div>
    ) : error ? (
      // Error State
    ) : analysis ? (  // ← 여기로 바로 전환됨
      // Analysis Result
    ) : null}
  </div>
)
```

### ✅ 검증 결과
**분석이 정확합니다.**

- 첫 번째 `data: { type: 'text', text: '...' }` SSE 이벤트가 오면
- `setAnalysis(prev => prev + parsed.text)` 실행 (Line 125)
- `analysis`가 빈 문자열이 아니게 됨
- `isAnalyzing && !analysis` 조건이 `false`가 됨
- 진행률 UI가 사라지고 즉시 결과 화면으로 전환

### 🔧 제안된 해결 방법
> 진행 단계 카드를 isAnalyzing 전체 구간에서 유지하거나, 최소한 모바일일 때는 오버레이로 계속 띄우세요.

### 📝 구체적 수정 방안

**방안 A: 조건 변경 (간단)**
```typescript
{isAnalyzing ? (  // ← !analysis 조건 제거
  <div className="flex items-center justify-center h-full">
    {/* Progress Steps - 전체 분석 기간 동안 표시 */}
  </div>
) : analysis ? (
  // Analysis Result
) : null}
```

**방안 B: 오버레이 방식 (UX 개선)**
```typescript
<div className="flex flex-col h-full">
  {/* 항상 컨텐츠 영역 표시 */}
  {analysis && (
    <div className="...">
      {/* AI 답변 표시 */}
    </div>
  )}

  {/* 로딩 중일 때만 오버레이 */}
  {isAnalyzing && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background p-6 rounded-lg">
        {/* Progress Steps */}
      </div>
    </div>
  )}
</div>
```

**방안 C: 단계별 진행률 (최선)**
```typescript
// 스트리밍 중에도 진행 단계 표시
{isAnalyzing && (
  <div className="sticky top-0 z-10 bg-background/95 backdrop-blur p-4">
    <div className="flex items-center gap-3">
      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
      <span className="text-sm text-muted-foreground">
        {!analysis ? '법령 데이터베이스 검색 중...' : 'AI 답변 생성 중...'}
      </span>
    </div>
  </div>
)}

{analysis && (
  <div className="...">
    {/* AI 답변 표시 */}
  </div>
)}
```

### ⚠️ 추가 발견 사항
> 메인 페이지에서 관리하는 ragProgress와 ragResults 상태는 생성만 하고 렌더 트리에 연결하지 않아, 모바일/데스크톱 모두에서 수치가 전혀 노출되지 않습니다.

**app/page.tsx 확인 필요**
```bash
grep -n "ragProgress\|ragResults" app/page.tsx
```
- 상태 변수는 선언되어 있지만 UI에 바인딩되지 않았는지 확인
- FileSearchRAGView 컴포넌트에 props로 전달되지 않았는지 확인

---

## 4️⃣ 스트리밍 답변이 잘리는 현상 ✅ 반영 필요

### 📌 분석 내용
> SSE 처리 루프가 buffer.split('\n\n') 이후 마지막 남은 버퍼(buffer = lines.pop() || '')를 반복 종료 시 처리하지 않습니다. 마지막 청크가 개행 없이 끝나면 그 데이터가 버려져 답변이 중간에서 끊긴 것처럼 보입니다.

### 🔍 현재 코드 확인

**components/file-search-rag-view.tsx (Line 100-142)**
```typescript
let buffer = ''

while (true) {
  const { done, value } = await reader.read()

  if (done) break  // ❌ 루프 종료, 남은 buffer 처리 안 함

  buffer += decoder.decode(value, { stream: true })

  const lines = buffer.split('\n')
  buffer = lines.pop() || ''  // ← 마지막 라인을 buffer에 보관

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6)
      // ... 파싱 처리
    }
  }
}

setIsAnalyzing(false)  // ← buffer에 남은 데이터는 버려짐
```

### ✅ 검증 결과
**분석이 정확합니다.**

**시나리오**:
1. 마지막 SSE 청크: `"data: {\"type\":\"text\",\"text\":\"마지막 문장\"}"`
2. 개행(`\n`)이 없으면 `lines.pop()`으로 `buffer`에 보관됨
3. 다음 반복에서 `done === true`이므로 `break`
4. `buffer`에 남은 데이터 처리 없이 함수 종료

### 🔧 제안된 해결 방법
> 루프가 끝난 뒤 buffer.trim()을 검사해 남은 데이터가 있다면 한 번 더 파싱하도록 추가하세요.

### 📝 구체적 수정 방안

```typescript
let buffer = ''

while (true) {
  const { done, value } = await reader.read()

  if (done) break

  buffer += decoder.decode(value, { stream: true })

  const lines = buffer.split('\n')
  buffer = lines.pop() || ''

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6)

      if (data === '[DONE]') {
        setIsAnalyzing(false)
        continue
      }

      try {
        const parsed = JSON.parse(data)

        if (parsed.type === 'text') {
          setAnalysis(prev => prev + parsed.text)
        } else if (parsed.type === 'warning') {
          setWarning(parsed.message)
          debugLogger.warning('AI 답변 경고', { message: parsed.message })
        } else if (parsed.type === 'citations') {
          debugLogger.info('Citations 수신', {
            count: parsed.citations?.length || 0,
            finishReason: parsed.finishReason
          })
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
  }
}

// ✅ 루프 종료 후 남은 buffer 처리
if (buffer.trim()) {
  debugLogger.info('SSE 스트림 종료 후 남은 버퍼 처리', { buffer })

  if (buffer.startsWith('data: ')) {
    const data = buffer.slice(6)

    if (data !== '[DONE]') {
      try {
        const parsed = JSON.parse(data)

        if (parsed.type === 'text') {
          setAnalysis(prev => prev + parsed.text)
        } else if (parsed.type === 'warning') {
          setWarning(parsed.message)
          debugLogger.warning('AI 답변 경고 (버퍼)', { message: parsed.message })
        } else if (parsed.type === 'citations') {
          debugLogger.info('Citations 수신 (버퍼)', {
            count: parsed.citations?.length || 0,
            finishReason: parsed.finishReason
          })
        }
      } catch (e) {
        debugLogger.error('남은 버퍼 파싱 실패', e)
      }
    }
  }
}

setIsAnalyzing(false)
```

### 🔍 추가 분석: MAX_TOKENS vs 버퍼 문제 구분

사용자 보고:
- 관세법 38조: 400자
- 관세법 36조: 2000자
- 다른 법령: 관련법령 전에 잘림

**구분 방법**:
1. **버퍼 문제**인 경우:
   - `finishReason: "STOP"`
   - 토큰 사용량 정상
   - 마지막 문장이 중간에 끊김 (문법적으로 불완전)

2. **MAX_TOKENS 문제**인 경우:
   - `finishReason: "MAX_TOKENS"`
   - `candidatesTokenCount: 8192`
   - 문장은 완전하지만 내용이 불완전

3. **File Search Store 데이터 부족**인 경우:
   - `finishReason: "STOP"`
   - `chunkSamples`가 짧거나 적음
   - AI가 충분한 컨텍스트를 받지 못함

**현재 코드에 추가된 디버깅 로그**:
```typescript
// lib/file-search-client.ts (Line 357-377)
console.log('[File Search] Token Usage:', {
  promptTokens: usageMetadata?.promptTokenCount || 'unknown',
  candidatesTokens: usageMetadata?.candidatesTokenCount || 'unknown',
  totalTokens: usageMetadata?.totalTokenCount || 'unknown'
})

console.log('[File Search] Grounding Metadata:', {
  chunksCount: groundingChunks.length,
  chunkSamples: groundingChunks.slice(0, 3).map((chunk: any, idx: number) => ({
    index: idx,
    textLength: chunk.retrievedContext?.text?.length || 0,
    textPreview: (chunk.retrievedContext?.text || '').substring(0, 100) + '...'
  }))
})
```

이 로그를 통해 정확한 원인 파악 가능.

---

## 5️⃣ VS Code 한글 인코딩 문제 (추가 정보)

### 📌 분석 내용
> VS Code에서 한글 인코딩이 깨지는 경우 대응

### 📝 예방 조치

**.vscode/settings.json**
```json
{
  "files.encoding": "utf8",
  "files.autoGuessEncoding": true,
  "files.eol": "\n"
}
```

**.editorconfig**
```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
```

**Git 설정**
```bash
# 전역 설정
git config --global core.autocrlf false
git config --global core.eol lf

# 프로젝트별 설정
git config core.autocrlf false
git config core.eol lf
```

### 🔧 복구 방법
이미 손상된 파일:
1. VS Code에서 "Reopen with Encoding" 선택
2. UTF-8 선택
3. 저장

또는 명령줄:
```bash
iconv -f ISO-8859-1 -t UTF-8 input.txt > output.txt
```

---

## 📊 우선순위 및 작업 계획

### 🔴 긴급 (Critical)
1. **법령 모달 빈 화면 문제** - 사용자 경험 직접 영향
   - 파일: `components/file-search-rag-view.tsx`
   - 영향: 모든 AI 검색 결과에서 법령 클릭 불가
   - 작업: handleRelatedArticleClick XML/JSON 파싱 수정

### 🟡 중요 (High)
2. **스트리밍 답변 잘림** - 데이터 손실
   - 파일: `components/file-search-rag-view.tsx`
   - 영향: 마지막 청크 누락 가능
   - 작업: SSE 루프 종료 후 buffer 처리 추가

3. **진행률 즉시 사라짐** - 사용자 경험
   - 파일: `components/file-search-rag-view.tsx`
   - 영향: 로딩 상태 피드백 부족
   - 작업: 조건 변경 또는 오버레이 방식 적용

### 🟢 낮음 (Low)
4. **사이드바 목록 안 닫힘** - ✅ 이미 해결됨 (cc01071 커밋)

---

## 🧪 검증 체크리스트

### 법령 모달 문제 검증
- [ ] AI 검색: "관세법 38조에 대해 알려줘"
- [ ] 사이드바에서 법령 클릭
- [ ] 디버그 콘솔에서 에러 로그 확인
- [ ] 모달에 법령 전문이 표시되는지 확인

### 스트리밍 버퍼 문제 검증
- [ ] 긴 답변 생성 (예: "관세법 전체 설명")
- [ ] 디버그 콘솔에서 "남은 버퍼 처리" 로그 확인
- [ ] 답변 마지막 문장이 완전한지 확인

### 진행률 표시 검증
- [ ] AI 검색 시작
- [ ] 첫 텍스트 청크 도착 시 진행률이 유지되는지 확인
- [ ] 모바일 화면에서도 확인

### MAX_TOKENS 분석
- [ ] "관세법 38조" 검색
- [ ] 콘솔에서 다음 확인:
  ```
  [File Search] finishReason: ?
  [File Search] Token Usage: { candidatesTokens: ? }
  [File Search] Grounding Metadata: { chunkSamples: ? }
  ```
- [ ] "관세법 36조"와 비교

---

## 📝 결론

제공된 분석은 **매우 정확하고 상세**합니다. 현재 코드베이스와 비교한 결과:

- ✅ **4개 문제 중 3개가 현재 코드에 실제로 존재**
- ✅ **1개는 최근 커밋에서 이미 수정됨** (사이드바)
- ✅ **제안된 해결 방법이 모두 실행 가능하고 적절함**

**즉시 반영 권장**:
1. 법령 모달 API 응답 파싱 수정
2. SSE 스트림 버퍼 처리 추가
3. 진행률 표시 조건 개선

**추가 조사 필요**:
- MAX_TOKENS vs 버퍼 문제 vs File Search Store 데이터 문제 구분
- ragProgress/ragResults 상태 변수 활용 여부 확인
