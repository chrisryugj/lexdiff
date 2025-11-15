# 법령 검색 매칭 로직 수정 (2025-11-11)

## 문제 상황

### 증상 1: "형법" 검색 시 잘못된 법령 선택
```
검색: "형법 22조"
결과: "군에서의 형의 집행 및 군수용자의 처우에 관한 법률" 선택됨
오류: 해당 법령에는 22조 없음, 21조/23조 제안
```

### 증상 2: "35조의2" 첫 검색 시 조문 없음
```
검색: "전기통신사업법 35조의2"
1회: "조문 없음, 35조 제안" ❌
2회: "35조의2 정상 표시" ✅ (Phase 7 캐시)
```

---

## 원인 분석

### 문제 1: 법령 매칭 로직 (app/page.tsx:858-864)

**기존 코드**:
```typescript
const normalizedLawName = lawName.replace(/\s+/g, "")
let exactMatch = results.find((r) => r.lawName.replace(/\s+/g, "") === normalizedLawName)

if (!exactMatch) {
  exactMatch = results.find(
    (r) =>
      r.lawName.replace(/\s+/g, "").startsWith(normalizedLawName) &&
      !r.lawName.includes("시행령") &&
      !r.lawName.includes("시행규칙"),
  )
}
```

**문제점**:
1. `startsWith(normalizedLawName)` - 너무 넓은 매칭
   - "형" → "군에서의 **형**의 집행..." 매칭됨
   - "관" → "**관**세법", "**관**광진흥법", "**관**광호텔업 등의..." 모두 매칭
2. 짧은 검색어(1-2글자)도 startsWith 적용 → 오매칭 증가
3. 매칭 실패 시 처리 없음 → 자동으로 첫 번째 결과 선택

---

## 해결 방법

### 수정 1: 법령 매칭 로직 강화

**새 코드** (app/page.tsx:859-889):
```typescript
console.log(`🔍 [법령 검색] 검색어: "${lawName}", 결과: ${results.length}개`)
console.log(`   결과 목록:`, results.slice(0, 5).map(r => r.lawName).join(', '))

// 1. 정확히 일치하는 법령 찾기
let exactMatch = results.find((r) => r.lawName.replace(/\s+/g, "") === normalizedLawName)
console.log(`   정확 매칭: ${exactMatch ? exactMatch.lawName : '없음'}`)

// 2. 정확한 매칭이 없으면 startsWith 로직 (하지만 더 엄격하게)
if (!exactMatch) {
  // startsWith는 매우 짧은 검색어(2글자 이하)에는 사용하지 않음
  if (normalizedLawName.length > 2) {
    exactMatch = results.find(
      (r) =>
        r.lawName.replace(/\s+/g, "").startsWith(normalizedLawName) &&
        !r.lawName.includes("시행령") &&
        !r.lawName.includes("시행규칙"),
    )
    console.log(`   startsWith 매칭: ${exactMatch ? exactMatch.lawName : '없음'}`)
  }
}

// 3. 매칭 실패 시 사용자에게 선택하도록 제안
if (!exactMatch && results.length > 0) {
  console.warn(`⚠️ [법령 검색] "${lawName}"의 정확한 매칭 실패, 사용자 선택 필요`)
  console.log(`   제안 목록:`, results.map(r => r.lawName).join(', '))

  // 여러 결과 중 선택하도록 UI 표시
  setLawSelectionState({
    results: results,
    query: query,
  })
  setIsSearching(false)
  return
}
```

**개선 사항**:
1. ✅ 정확 매칭 우선 (완전 일치)
2. ✅ startsWith는 3글자 이상만 허용
3. ✅ 매칭 실패 시 사용자 선택 UI 표시
4. ✅ 상세 로깅 추가

---

### 수정 2: 조문 파싱 및 검색 디버깅 강화

**추가 로그 1: 조의 조문 파싱 시** (app/page.tsx:147-150):
```typescript
// Debug: Log article parsing for "조의" articles
if (branchNum && Number.parseInt(branchNum) > 0) {
  console.log(`📄 [파싱] 조의 조문: ${display} (JO: ${code}, articleNum: ${articleNum}, branchNum: ${branchNum})`)
}
```

**추가 로그 2: 파싱 완료 시** (app/page.tsx:192-205):
```typescript
// Debug: Show JO code range
if (articles.length > 0) {
  console.log(`📄 [파싱 완료] ${meta.lawTitle}: ${articles.length}개 조문`)
  console.log(`   JO 코드 범위: ${articles[0]?.jo} ~ ${articles[articles.length - 1]?.jo}`)

  // Show all "조의" articles
  const branchArticles = articles.filter(a => {
    const branchNum = parseInt(a.jo.slice(-2))
    return branchNum > 0
  })
  if (branchArticles.length > 0) {
    console.log(`   조의 조문 ${branchArticles.length}개:`, branchArticles.map(a => `${a.jo}(${a.display})`).join(', '))
  }
}
```

**추가 로그 3: 조문 검색 시** (app/page.tsx:370-383, 683-693):
```typescript
console.log(`🔍 [조문 검색] 요청: jo=${query.jo}, 전체 조문 수: ${articles.length}`)

// Debug: Show sample JO codes
const sampleJos = articles.slice(0, 10).map(a => a.jo).join(', ')
console.log(`   샘플 JO 코드 (처음 10개): ${sampleJos}`)

// Check if any "조의" articles exist
const branchArticles = articles.filter(a => a.jo.endsWith('02') || a.jo.endsWith('03') || a.jo.endsWith('04'))
if (branchArticles.length > 0) {
  console.log(`   조의 조문 발견: ${branchArticles.length}개`, branchArticles.slice(0, 5).map(a => `${a.jo}(${a.display})`).join(', '))
}

const targetArticle = articles.find((a) => a.jo === query.jo)
console.log(`   조문 검색 결과: ${targetArticle ? '✅ 발견' : '❌ 없음'}`)
```

---

## 테스트 시나리오

### 시나리오 1: "형법 22조" 검색

**예상 동작**:
```
1. 검색: "형법 22조"
2. API 호출: /api/law-search?query=형법
3. 결과: ["형법", "군에서의 형의 집행...", ...]
4. 로그:
   🔍 [법령 검색] 검색어: "형법", 결과: N개
      결과 목록: 형법, 군에서의 형의 집행...
      정확 매칭: 형법 ✅
5. 법령 선택: "형법"
6. 조문 조회: 제22조 표시
```

**만약 "형법"이 결과에 없다면**:
```
4. 로그:
   🔍 [법령 검색] 검색어: "형법", 결과: N개
      정확 매칭: 없음
      startsWith 매칭: 형법 (partial match)
```

**만약 여전히 애매하다면**:
```
4. 로그:
   ⚠️ [법령 검색] "형법"의 정확한 매칭 실패, 사용자 선택 필요
      제안 목록: ...
5. UI: 법령 선택 화면 표시
```

---

### 시나리오 2: "전기통신사업법 35조의2" 검색

**예상 로그**:
```
📄 [파싱] 조의 조문: 제35조의2 (JO: 003502, articleNum: 35, branchNum: 2)
📄 [파싱 완료] 전기통신사업법: N개 조문
   JO 코드 범위: 000100 (제1조) ~ 009900 (제99조)
   조의 조문 12개: 003502(제35조의2), 004002(제40조의2), ...

🔍 [조문 검색] 요청: jo=003502, 전체 조문 수: N
   샘플 JO 코드 (처음 10개): 000100, 000200, ...
   조의 조문 발견: 12개 003502(제35조의2), ...
   조문 검색 결과: ✅ 발견
```

**만약 여전히 없다면**:
```
🔍 [조문 검색] 요청: jo=003502, 전체 조문 수: N
   샘플 JO 코드: 000100, 000200, ... (003502 없음)
   조의 조문 발견: 0개
   조문 검색 결과: ❌ 없음
→ API 응답에서 해당 조문이 누락되었음을 의미
```

---

## 확인 방법

### Step 1: 브라우저 준비
1. Chrome DevTools 열기 (F12)
2. Console 탭 열기
3. Application > IndexedDB > LexDiffCache 우클릭 > Delete database
4. 페이지 새로고침 (Ctrl+R)

### Step 2: "형법 22조" 검색
1. 검색창에 "형법 22조" 입력
2. Console에서 로그 확인:
   - 🔍 [법령 검색] 로그
   - 정확 매칭 결과
   - 최종 선택된 법령
3. 22조 내용이 표시되는지 확인

### Step 3: "전기통신사업법 35조의2" 검색
1. IndexedDB 다시 삭제 (캐시 제거)
2. "전기통신사업법 35조의2" 검색
3. Console에서 로그 확인:
   - 📄 [파싱] 조의 조문 로그
   - 📄 [파싱 완료] 조의 조문 목록
   - 🔍 [조문 검색] 결과
4. 35조의2 내용이 **첫 검색부터** 표시되는지 확인

---

## 영향 범위

### 수정된 파일
- `app/page.tsx`: 법령 매칭 로직 + 디버깅 로그

### 영향받는 기능
- ✅ 법령 검색 정확도 향상
- ✅ 짧은 검색어 오매칭 방지
- ✅ 사용자 선택 UI 추가
- ✅ 조문 파싱 디버깅 강화

### 하위 호환성
- ✅ 기존 정확 매칭 동작 유지
- ✅ 기존 startsWith 로직 보존 (3글자 이상만)
- ✅ 새로운 선택 UI는 매칭 실패 시만 표시

---

## 추가 개선 사항 (향후)

### 1. 법령 별칭 DB 확장
```typescript
// lib/search-normalizer.ts에 추가
{
  canonical: "형법",
  aliases: ["형벚", "형법전"],
  alternatives: [],
}
```

### 2. 검색 결과 스코어링
- 정확 매칭: 100점
- startsWith 매칭: 80점
- contains 매칭: 60점
- 가장 높은 점수 자동 선택

### 3. 최근 검색 히스토리 활용
- 사용자가 이전에 선택한 법령 우선 제안
