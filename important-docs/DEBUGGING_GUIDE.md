# 디버깅 가이드

> 자주 발생하는 문제와 해결 방법을 패턴별로 정리

---

## 🔍 Debug Console 사용법

**위치**: 화면 하단 (기본 축소 상태)

**로그 항목**:
- API 호출 (URL, 파라미터)
- 파싱 단계 결과
- 에러 스택 트레이스
- AI 스트리밍 (청크 샘플, 토큰 사용량, finishReason)

**사용법**:
```typescript
debugLogger.info('메시지', 데이터)
debugLogger.success('성공 메시지')
debugLogger.warning('경고 메시지')
debugLogger.error('에러 메시지', error)
```

---

## 🚨 자주 발생하는 에러 패턴

### 1. "법령 조회 실패"

**원인**: 잘못된 `lawId`/`mst` 또는 API 키 문제

**디버깅**:
1. 콘솔에서 전체 API URL 확인
2. `.env.local`에서 `LAW_OC` 환경변수 검증
3. law.go.kr 직접 호출 테스트

---

### 2. HTML 에러 페이지 대신 JSON 받음

**원인**: law.go.kr이 잘못된 요청에 HTML 에러 페이지 반환

**확인 방법**:
```typescript
if (text.includes("<!DOCTYPE html")) {
  throw new Error('API returned HTML error page')
}
```

**해결**: 요청 파라미터 검증 (lawId, MST, efYd 형식)

---

### 3. JO 코드 불일치

**원인**: 조문이 구버전/신버전에 없음

**디버깅**:
1. JO 코드가 6자리 형식인지 확인 (`003800`)
2. 구버전과 신버전 모두에 조문이 존재하는지 확인
3. `buildJO()` 함수 로그 확인

---

### 4. 모달이 열리지만 빈 화면

**원인**: API 응답 파싱 불일치

**체크리스트**:
```typescript
// ❌ WRONG
const xml = await response.json()  // /api/law-search는 XML!

// ✅ CORRECT
const xml = await response.text()
const doc = new DOMParser().parseFromString(xml, 'text/xml')
```

**파일별 응답 형식**:
- `/api/law-search`: XML
- `/api/eflaw`: JSON (NO wrapper)
- `/api/oldnew`: XML
- `/api/three-tier`: JSON (NO wrapper)

---

### 5. AI 답변 중간 잘림

**원인**: SSE 버퍼 미처리

**확인 위치**: `file-search-rag-view.tsx:142-172`

**수정 방법**:
```typescript
// 루프 종료 후 남은 buffer 처리
if (buffer.trim() && buffer.startsWith('data: ')) {
  const parsed = JSON.parse(buffer.slice(6))
  // 최종 처리
}
```

---

### 6. Progress가 즉시 사라짐

**원인**: 조건문에 `!analysis` 포함

**확인 위치**: `file-search-rag-view.tsx:288-365`

```typescript
// ❌ WRONG
{isAnalyzing && !analysis && (<div>Progress</div>)}

// ✅ CORRECT
{isAnalyzing && (<div>Progress</div>)}
```

---

### 7. 사이드바 버튼 무반응

**원인**: onClick에 async 함수 직접 사용

**확인 위치**: `law-viewer.tsx:1209-1229`

```typescript
// ❌ WRONG
const handleClick = async () => {
  await openExternalLawArticleModal(...)
}

// ✅ CORRECT
const handleClick = () => {
  openExternalLawArticleModal(...)
    .then(() => debugLogger.success('성공'))
    .catch((err) => debugLogger.error('실패', err))
}
```

---

## 🔧 XML/JSON 파싱 패턴

### XML Response (DOMParser)
```typescript
const xml = await response.text()
const parser = new DOMParser()
const doc = parser.parseFromString(xml, 'text/xml')
const lawId = doc.querySelector('법령ID')?.textContent
```

### JSON Response (Direct Schema)
```typescript
const json = await response.json()
const lawData = json?.법령  // NO wrapper
const articles = lawData?.조문?.조문단위
```

### SSE Streaming (Buffer Handling)
```typescript
while (true) {
  const { done, value } = await reader.read()
  if (done) break
  buffer += decoder.decode(value, { stream: true })
  // 완전한 줄 처리
}

// CRITICAL: 남은 buffer 처리
if (buffer.trim() && buffer.startsWith('data: ')) {
  const parsed = JSON.parse(buffer.slice(6))
}
```

---

## 🎯 환경별 디버깅

### 개발 환경
```bash
npm run dev
# http://localhost:3000
# Debug Console 활성화
```

### 프로덕션 빌드
```bash
npm run build
npm start
# Debug Console은 포함되지만 최소화됨
```

### 긴급 재시작 (Windows)
```bash
restart-server.cmd
# Node 프로세스 전체 종료 + 캐시 클리어
```

---

## 📊 성능 디버깅

### IndexedDB 캐시 확인
```javascript
// 브라우저 DevTools Console
const request = indexedDB.open('LexDiffCache')
request.onsuccess = (e) => {
  const db = e.target.result
  const tx = db.transaction('lawContent', 'readonly')
  const store = tx.objectStore('lawContent')
  const getAllRequest = store.getAll()
  getAllRequest.onsuccess = () => {
    console.log('캐시 항목 수:', getAllRequest.result.length)
    console.log('데이터:', getAllRequest.result)
  }
}
```

### API 호출 시간 측정
```typescript
const start = performance.now()
const response = await fetch(url)
const end = performance.now()
debugLogger.info(`API 호출 시간: ${end - start}ms`)
```

---

## 🚨 긴급 복구

### Phase 5/6 학습 데이터 오염
```bash
node reset-all-learning.mjs
# Turso DB의 search_results, search_query_embeddings 완전 삭제
```

### IndexedDB 캐시 클리어
```javascript
// 브라우저 DevTools Console
indexedDB.deleteDatabase('LexDiffCache')
location.reload()
```

### 환경변수 검증
```bash
# .env.local 확인
LAW_OC=your_api_key_here
GEMINI_API_KEY=your_gemini_key_here
GEMINI_FILE_SEARCH_STORE_ID=your_store_id_here
```
