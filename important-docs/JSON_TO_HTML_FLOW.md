# JSON → HTML 파싱 플로우 (법령 뷰어 렌더링)

**CRITICAL**: 이 문서는 법령 데이터가 JSON에서 HTML로 변환되어 화면에 표시되는 **전체 파이프라인**을 설명합니다.

---

## 🔴 핵심 원칙

1. **API는 항상 JSON을 반환** (HTML 아님)
2. **클라이언트에서 HTML 생성** (서버 사이드 아님)
3. **단일 진입점**: `lib/law-xml-parser.tsx`의 `extractArticleText()`
4. **링크 생성**: `lib/unified-link-generator.ts`의 `generateLinks()`

---

## 📊 전체 데이터 플로우

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. 사용자 검색: "관세법 제2조"                                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. API 호출: /api/eflaw?lawId=001556                            │
│    Response: JSON (NOT HTML)                                    │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. JSON 파싱: components/search-result-view.tsx                 │
│    - parseLawXML(json)                                          │
│    - 결과: LawData { articles: Article[] }                      │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. HTML 생성: lib/law-xml-parser.tsx                            │
│    - extractArticleText(rawArticle)                             │
│    - 결과: HTML string                                          │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. 렌더링: components/law-viewer.tsx                            │
│    - dangerouslySetInnerHTML={{ __html: article.content }}     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔍 상세 단계별 설명

### Step 1: API JSON 구조 (law.go.kr 응답)

```json
{
  "법령": {
    "조문": {
      "조문단위": [
        {
          "조문번호": "2",
          "조문제목": "정의",
          "조문내용": "이 법에서 사용하는 용어의 뜻은 다음과 같다. <개정 2020.12.22>",
          "항": {
            "호": [
              {
                "호번호": "1.",
                "호내용": "\"수입\"이란 외국물품을..."
              }
            ]
          }
        }
      ]
    }
  }
}
```

**CRITICAL 포인트**:
- `조문내용`: 본문 텍스트 (plain text, 마크업 없음)
- `항`: 없을 수도 있음 (optional)
- `호`: 항 안에 있거나, 항 없이 바로 존재 가능
- `<개정 2020.12.22>`: 텍스트로 포함됨 (이후 escape 필요)

---

### Step 2: parseLawXML() - JSON → LawData 변환

**파일**: `lib/law-parser.ts`

```typescript
interface Article {
  jo: string           // "002000" (6자리 JO 코드)
  title: string        // "정의"
  content: string      // HTML string (이미 생성됨)
  paragraphs?: Paragraph[]
}

function parseLawXML(data: any): LawData {
  const rawArticles = data?.법령?.조문?.조문단위 || []

  const articles = rawArticles.map(rawArticle => {
    // extractArticleText()를 호출하여 HTML 생성
    const content = extractArticleText(rawArticle, lawName, mode)

    return {
      jo: buildJO(rawArticle.조문번호),
      title: rawArticle.조문제목 || '',
      content: content,  // ← HTML string
      paragraphs: extractParagraphs(rawArticle)
    }
  })
}
```

**중요**: `content` 필드는 이미 **완성된 HTML 문자열**입니다.

---

### Step 3: extractArticleText() - 핵심 HTML 생성 로직

**파일**: `lib/law-xml-parser.tsx` (343-595줄)

#### 3-1. 입력 데이터 구조

```typescript
interface RawArticle {
  조문번호: string
  조문제목?: string
  조문내용: string      // plain text
  항?: 항단위 | 항단위[]
}

interface 항단위 {
  항번호?: string
  항내용?: string       // plain text
  호?: 호단위 | 호단위[]
}

interface 호단위 {
  호번호: string
  호내용: string        // plain text
}
```

#### 3-2. 처리 파이프라인

```typescript
export function extractArticleText(
  rawArticle: any,
  lawName: string = '',
  mode: 'safe' | 'aggressive' = 'aggressive'
): string {

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 1: 원본 텍스트 추출 (plain text)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  let content = rawArticle.조문내용 || ''

  // 조문 제목 제거 (본문에 중복 포함되어 있음)
  if (rawArticle.조문제목) {
    const titlePattern = new RegExp(`^제\\s*${rawArticle.조문번호}\\s*조\\s*\\([^)]+\\)\\s*`)
    content = content.replace(titlePattern, '').trim()
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 2: 항/호 처리 (구조화)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 항 정규화 (배열/단일 객체 통일)
  const hangs = rawArticle.항
    ? Array.isArray(rawArticle.항) ? rawArticle.항 : [rawArticle.항]
    : []

  // 항내용 존재 여부 확인
  const hasHangContent = hangs.some(h => (h?.항내용 || '').trim())

  // Case 1: 항내용 없고 호만 있는 경우 (예: 관세법 제2조)
  if (!hasHangContent && hangs.length > 0) {
    const allHo = hangs.flatMap(h => {
      const hoInHang = Array.isArray(h?.호) ? h.호 : h?.호 ? [h.호] : []
      return hoInHang
    })

    // 본문은 유지하고 호만 추가
    // content += '\n' + allHo.map(ho => ho.호내용).join('\n')
    // (실제로는 이미 조문내용에 포함되어 있음)
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 3: HTML 생성 준비
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 연속된 개행을 호 번호 앞에서 제거 (빈 줄 제거)
  content = content.replace(/\n{2,}\s*(\d+\.)/g, '\n$1')

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 4: 링크 생성
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 1. 법령 링크 생성 (unified-link-generator 사용)
  content = linkifyRefsB(content, mode, lawName)
  // → 이제 content에 <a> 태그가 포함됨

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 5: HTML Escape (보안)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // CRITICAL: <a> 태그만 보존, 나머지는 escape
  content = content.replace(
    /(<a\s[^>]*>|<\/a>)|(<[^>]*>)|([^<]+)/g,
    (match, linkTag, otherTag, text) => {
      if (linkTag) return linkTag  // <a> 태그 보존
      if (otherTag) return escapeHtml(otherTag)  // <개정> → &lt;개정&gt;
      if (text) return escapeHtml(text)
      return match
    }
  )

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 6: 스타일링
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 1. 개정 마커 스타일 적용
  content = applyRevisionStyling(content)
  // &lt;개정 2020.12.22&gt; → <span class="rev-mark">＜개정 2020.12.22＞</span>

  // 2. 줄바꿈 → <br> 변환
  content = content.replace(/\n/g, '<br>\n')

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 7: 최종 HTML 반환
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  return content  // 완성된 HTML string
}
```

---

### Step 4: linkifyRefsB() - 링크 생성

**파일**: `lib/law-xml-parser.tsx` → `lib/unified-link-generator.ts`

```typescript
// Wrapper 함수
function linkifyRefsB(
  text: string,
  mode: 'safe' | 'aggressive' = 'aggressive',
  currentLawName?: string
): string {
  return generateLinks(text, {
    mode,
    enableSameRef: true,
    currentLawName
  })
}
```

**generateLinks()의 처리 순서**:
1. 내부 조문 참조: "제38조" → `<a class="law-ref">제38조</a>`
2. 같은 법 참조: "같은 법 제10조" → 링크 생성
3. 인용 법령: "「관세법」 제2조" → 링크 생성
4. 시행령/규칙: "시행령" → 링크 생성

**CRITICAL**: 모든 링크에는 `data-law-name`, `data-jo-label` 속성 추가
- `onClick` 이벤트로 `openExternalLawArticleModal()` 호출

---

### Step 5: applyRevisionStyling() - 개정 마커 스타일

**파일**: `lib/law-xml-parser.tsx` (555-597줄)

```typescript
function applyRevisionStyling(text: string): string {
  let styled = text

  // <개정>, <신설> 등 → styled span
  styled = styled.replace(
    /&lt;(개정|신설|전문개정|제정|삭제)\s+([0-9., ]+)&gt;/g,
    '<span class="rev-mark">＜$1 $2＞</span>'
  )

  // <본조신설>, <본조삭제>
  styled = styled.replace(
    /&lt;(본조신설|본조삭제)\s+([0-9., ]+)&gt;/g,
    '<span class="rev-mark">＜$1 $2＞</span>'
  )

  // [종전 ~ 이동]
  styled = styled.replace(
    /\[(종전[^\]]+이동[^\]]*)\]/g,
    '<span class="rev-mark">[$1]</span>'
  )

  return styled
}
```

**CSS**: `app/globals.css`
```css
.rev-mark {
  color: oklch(0.65 0.2 250);
  font-weight: 500;
}
```

---

## 🚨 자주 발생하는 실수

### ❌ 실수 1: HTML escape를 모든 태그에 적용
```typescript
// WRONG
content = escapeHtml(content)  // <a> 태그도 escape됨!
```

**올바른 방법**:
```typescript
// CORRECT: <a> 태그만 보존
content.replace(/(<a\s[^>]*>|<\/a>)|(<[^>]*>)|([^<]+)/g, ...)
```

### ❌ 실수 2: 개정 마커를 escape 전에 처리
```typescript
// WRONG 순서
content = applyRevisionStyling(content)  // <개정> 찾지 못함
content = escapeHtml(content)
```

**올바른 순서**:
```typescript
// CORRECT 순서
content = escapeHtml(content)  // <개정> → &lt;개정&gt;
content = applyRevisionStyling(content)  // &lt;개정&gt; 찾아서 스타일 적용
```

### ❌ 실수 3: 항 없이 호만 있는 경우 본문 제거
```typescript
// WRONG
if (!hasHangContent && hangs.length > 0) {
  content = ''  // 본문을 완전히 제거 ❌
  // 호만 추가
}
```

**올바른 방법**:
```typescript
// CORRECT
if (!hasHangContent && hangs.length > 0) {
  // 본문은 유지하고 호는 이미 조문내용에 포함되어 있음
  // 연속된 개행만 제거
  content = content.replace(/\n{2,}\s*(\d+\.)/g, '\n$1')
}
```

### ❌ 실수 4: 조문 제목 중복 제거 실패
```typescript
// WRONG: 단순 replace
content = content.replace('제2조(정의)', '')  // 본문에 "(정의)"가 있으면 오작동
```

**올바른 방법**:
```typescript
// CORRECT: regex로 정확히 위치 지정
const titlePattern = new RegExp(`^제\\s*${조문번호}\\s*조\\s*\\([^)]+\\)\\s*`)
content = content.replace(titlePattern, '').trim()
```

---

## 🔍 디버깅 체크리스트

HTML이 제대로 생성되지 않을 때:

1. **API 응답 확인**
   ```typescript
   console.log('rawArticle:', JSON.stringify(rawArticle, null, 2))
   ```

2. **Phase별 중간 결과 확인**
   ```typescript
   console.log('Phase 1 - 원본 텍스트:', content.substring(0, 100))
   console.log('Phase 4 - 링크 생성 후:', content.substring(0, 100))
   console.log('Phase 5 - Escape 후:', content.substring(0, 100))
   console.log('Phase 6 - 스타일링 후:', content.substring(0, 100))
   ```

3. **링크 생성 확인**
   ```typescript
   console.log('링크 개수:', (content.match(/<a /g) || []).length)
   console.log('개정마커 개수:', (content.match(/rev-mark/g) || []).length)
   ```

4. **최종 HTML 검증**
   ```typescript
   console.log('최종 HTML 길이:', content.length)
   console.log('br 태그 개수:', (content.match(/<br>/g) || []).length)
   ```

---

## 📍 관련 파일

| 파일 | 역할 | 핵심 함수 |
|------|------|----------|
| `lib/law-parser.ts` | JSON → LawData 변환 | `parseLawXML()`, `buildJO()` |
| `lib/law-xml-parser.tsx` | HTML 생성 | `extractArticleText()`, `applyRevisionStyling()` |
| `lib/unified-link-generator.ts` | 링크 생성 | `generateLinks()`, `linkifyRefsB()` |
| `components/search-result-view.tsx` | API 호출 및 파싱 | `handleSearch()` |
| `components/law-viewer.tsx` | HTML 렌더링 | `dangerouslySetInnerHTML` |

---

## 🎯 핵심 요약

1. **API는 JSON 반환** (HTML 아님)
2. **클라이언트에서 HTML 생성** (`extractArticleText()`)
3. **링크 생성 → HTML Escape → 스타일링** 순서 엄수
4. **<a> 태그만 보존**, 나머지는 escape
5. **항 없이 호만 있는 경우**: 본문 유지 + 빈 줄 제거
6. **개정 마커**: escape 후 스타일 적용

---

**NEVER**:
- ❌ API에서 HTML을 받는다고 가정
- ❌ 모든 HTML을 escape
- ❌ 링크 생성 전에 escape
- ❌ 항 없으면 본문 제거
- ❌ 직접 regex로 링크 생성 (unified-link-generator 사용)
