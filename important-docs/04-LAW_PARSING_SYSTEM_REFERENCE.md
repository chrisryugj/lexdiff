# 법령 파싱 시스템 전체 참조 문서

**작성일**: 2025-11-21
**목적**: 디버깅 및 유지보수 시 즉시 참조 가능한 법령 파싱 시스템 완전 분석

---

## 📋 목차

1. [전체 아키텍처 개요](#전체-아키텍처-개요)
2. [법령 뷰어 본문 렌더링](#법령-뷰어-본문-렌더링)
3. [AI 답변 본문 렌더링](#ai-답변-본문-렌더링)
4. [법령 링크 생성 시스템](#법령-링크-생성-시스템)
5. [모달 시스템](#모달-시스템)
6. [관련 법령 목록 파싱](#관련-법령-목록-파싱)
7. [코드 추출 및 주요 함수](#코드-추출-및-주요-함수)

---

## 전체 아키텍처 개요

### 데이터 흐름 구조

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. 사용자 검색/AI 질의                                           │
│    - "관세법 제38조"                                             │
│    - "수입물품의 과세가격은 어떻게 계산하나요?"                    │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. API 레이어                                                    │
│    - /api/eflaw (법령 전문 조회)                                 │
│    - /api/law-search (법령 검색)                                 │
│    - /api/oldnew (신구법 비교)                                   │
│    - /api/hierarchy (계층구조)                                   │
│    - /api/three-tier (3단비교)                                   │
│    - /api/file-search-rag (AI 검색)                              │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. 파서 레이어                                                   │
│    - lib/law-xml-parser.tsx (XML → 구조화 데이터)                │
│    - lib/law-json-parser.ts (JSON → 구조화 데이터)               │
│    - lib/ai-answer-processor.ts (AI 답변 → HTML)                │
│    - lib/oldnew-parser.ts (신구법 비교 XML 파싱)                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. HTML 생성 레이어                                              │
│    - extractArticleText() (법령 본문 → HTML)                     │
│    - convertAIAnswerToHTML() (AI 답변 → HTML)                   │
│    - generateLinks() (텍스트 → 링크 HTML)                        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. 렌더링 레이어                                                 │
│    - components/law-viewer.tsx (법령 뷰어)                       │
│    - components/reference-modal.tsx (법령 참조 모달)             │
│    - components/comparison-modal.tsx (신구법 비교 모달)          │
│    - components/file-search-answer-display.tsx (AI 답변 표시)    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 법령 뷰어 본문 렌더링

### 1. 호출 흐름

#### 검색 → 본문 표시

```typescript
// components/search-result-view.tsx
const handleSearch = async (query: string) => {
  // 1. API 호출
  const response = await fetch(`/api/eflaw?lawId=${lawId}&mst=${mst}`)
  const json = await response.json()

  // 2. JSON 파싱
  const lawData = parseLawJSON(json)

  // 3. 상태 업데이트
  setLawMeta(lawData.meta)
  setArticles(lawData.articles)
}

// lib/law-json-parser.ts
export function parseLawJSON(json: any): LawData {
  // JSON → 구조화 데이터 변환
  const rawArticles = json?.법령?.조문?.조문단위 || []

  const articles = rawArticles.map(rawArticle => {
    // XML 파서로 위임 (동일한 로직)
    return {
      jo: buildJO(rawArticle.조문번호),
      title: rawArticle.조문제목,
      content: rawArticle.조문내용,  // ← plain text
      paragraphs: extractParagraphs(rawArticle)
    }
  })

  return { meta, articles }
}
```

#### 본문 HTML 생성

```typescript
// components/law-viewer.tsx
export function LawViewer({ articles, meta }) {
  const articleHtml = useMemo(() => {
    return articles.map(article => {
      // extractArticleText() 호출하여 HTML 생성
      const html = extractArticleText(article, isOrdinance, meta.lawTitle)
      return { ...article, htmlContent: html }
    })
  }, [articles])

  return (
    <div
      dangerouslySetInnerHTML={{ __html: articleHtml }}
      onClick={handleContentClick}  // 링크 클릭 이벤트
    />
  )
}
```

### 2. extractArticleText() - 핵심 HTML 생성 함수

**파일**: `lib/law-xml-parser.tsx:282-522`

```typescript
export function extractArticleText(
  article: LawArticle,
  isOrdinance = false,
  currentLawName?: string
): string {
  let text = ""

  if (article.content || article.title) {
    let content = ""

    if (article.content) {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // Phase 1: 조문 제목 제거 (본문에 중복)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const titleMatch = article.content.match(
        /^(제\d+조(?:의\d+)?(?:\s*\([^)]+\))?)\s*([\s\S]*)$/
      )
      let rawContent = article.content
      if (titleMatch) {
        const bodyPart = titleMatch[2]
        rawContent = bodyPart.trim() || ''
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // Phase 2: 링크 생성 (escape 전에)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      content = linkifyRefsB(rawContent, currentLawName)
      // → 텍스트 내의 법령 참조를 <a> 태그로 변환

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // Phase 3: HTML escape (링크 태그만 보존)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      content = content.replace(
        /(<a\s[^>]*>|<\/a>)|(<[^>]*>)|([^<]+)/g,
        (match, linkTag, otherTag, text) => {
          if (linkTag) return linkTag      // <a> 태그만 보존
          if (otherTag) return escapeHtml(otherTag)  // <개정> → &lt;개정&gt;
          if (text) return escapeHtml(text)
          return match
        }
      )

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // Phase 4: 개정 마커 스타일링
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      content = applyRevisionStyling(content)
      // &lt;개정 2020.12.22&gt; → <span class="rev-mark">＜개정 2020.12.22＞</span>
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Phase 5: 빈 줄 제거 및 포맷팅
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 호 번호(1. 2. 3.) 앞의 연속 줄바꿈 제거
    content = content.replace(/\n{2,}\s*(\d+\.)/g, '\n$1')

    // 원형번호(①②③) 앞의 연속 줄바꿈 제거
    content = content.replace(/\n{2,}\s*([①-⑳])/g, '\n$1')

    // 줄바꿈 → <br> 변환
    content = content.replace(/\n/g, '<br>')

    // 본문 끝 <br> 제거 (호가 있을 경우 이중 줄바꿈 방지)
    content = content.replace(/<br>\s*$/, '')

    text += content
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 6: 항/호 처리 (paragraphs가 있는 경우)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (article.paragraphs && article.paragraphs.length > 0) {
    const hasParaContent = article.paragraphs.some(p => p.content?.trim())
    const allItems = article.paragraphs.flatMap(p => p.items || [])

    if (hasParaContent) {
      // Case A: 항내용이 있는 경우 (일반적인 경우)
      if (text) text += "\n"

      article.paragraphs.forEach(para => {
        let paraContent = linkifyRefsB(para.content || '', currentLawName)
        paraContent = paraContent.replace(/(<[^>]+>)|([^<]+)/g, (match, tag, text) => {
          if (tag) return tag
          if (text) return escapeHtml(text)
          return match
        })
        paraContent = applyRevisionStyling(paraContent)

        text += "\n" + para.num + ". " + paraContent + "\n"

        // 호 처리
        if (para.items) {
          para.items.forEach(item => {
            let itemContent = linkifyRefsB(item.content || '', currentLawName)
            itemContent = itemContent.replace(/(<[^>]+>)|([^<]+)/g, (match, tag, text) => {
              if (tag) return tag
              if (text) return escapeHtml(text)
              return match
            })
            itemContent = applyRevisionStyling(itemContent)

            text += "  " + item.num + ". " + itemContent + "\n"
          })
        }
      })
    } else if (allItems.length > 0) {
      // Case B: 항내용 없고 호만 있는 경우 (예: 관세법 제2조)
      allItems.forEach((item, index) => {
        let itemContent = linkifyRefsB(item.content || '', currentLawName)
        itemContent = itemContent.replace(/(<[^>]+>)|([^<]+)/g, (match, tag, text) => {
          if (tag) return tag
          if (text) return escapeHtml(text)
          return match
        })
        itemContent = applyRevisionStyling(itemContent)

        // 첫 번째 호만 <br> 하나로 연결
        if (index === 0) {
          text += "<br>" + itemContent
        } else {
          text += "<br>" + itemContent
        }
      })
    }
  }

  return text.trim()
}
```

### 3. applyRevisionStyling() - 개정 마커 처리

**파일**: `lib/law-xml-parser.tsx:570-612`

```typescript
function applyRevisionStyling(text: string): string {
  let styled = text

  // <개정>, ＜개정＞ 형식
  styled = styled.replace(
    /&lt;(개정|신설|전문개정|제정|삭제)\s+([0-9., ]+)&gt;/g,
    '<span class="rev-mark">＜$1 $2＞</span>'
  )

  styled = styled.replace(
    /＜(개정|신설|전문개정|제정|삭제)\s+([0-9., ]+)＞/g,
    '<span class="rev-mark">＜$1 $2＞</span>'
  )

  // "삭제<날짜>" 형식
  styled = styled.replace(
    /(삭제)\s*&lt;([0-9., ]+)&gt;/g,
    '<span class="rev-mark">$1 ＜$2＞</span>'
  )

  // [본조신설], [종전 ~ 이동] 형식
  styled = styled.replace(
    /\[(본조신설|본조삭제)[^\]]*\]/g,
    '<span class="rev-mark">$&</span>'
  )

  styled = styled.replace(
    /\[종전[^\]]*\]/g,
    '<span class="rev-mark">$&</span>'
  )

  return styled
}
```

### 4. escapeHtml() - 보안 처리

**파일**: `lib/law-xml-parser.tsx:561-568`

```typescript
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}
```

---

## AI 답변 본문 렌더링

### 1. 호출 흐름

```typescript
// components/file-search-answer-display.tsx
export function FileSearchAnswerDisplay({ answer }) {
  const htmlContent = useMemo(() => {
    return convertAIAnswerToHTML(answer)
  }, [answer])

  return (
    <div
      dangerouslySetInnerHTML={{ __html: htmlContent }}
      onClick={handleLinkClick}
    />
  )
}
```

### 2. convertAIAnswerToHTML() - AI 답변 HTML 변환

**파일**: `lib/ai-answer-processor.ts:59-104`

```typescript
export function convertAIAnswerToHTML(markdown: string): string {
  if (!markdown) return ''

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 1: 마크다운 문법 제거 (내용만 남김)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  let text = removeMarkdownSyntax(markdown)

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 2: ⚖️ 조문 발췌 마커 추가 (이스케이프 전에)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  text = markLawQuotes(text)
  // "⚖️ 조문 발췌" ~ "📖 핵심 해석" 사이를 <<<QUOTE_START>>> ~ <<<QUOTE_END>>>로 감싸기

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 3: HTML 이스케이프 (링크 생성 전에)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  text = escapeHtml(text)
  // <<<QUOTE_START>>> → &lt;&lt;&lt;QUOTE_START&gt;&gt;&gt;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 4: 구조화 항목 스타일링 추가
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  text = styleStructuredSections(text)
  // - "📋 핵심 요약" → <div class="section-header">
  // - &lt;&lt;&lt;QUOTE_START&gt;&gt;&gt; ~ &lt;&lt;&lt;QUOTE_END&gt;&gt;&gt; → <blockquote>

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 5: 법령 링크 생성 (이스케이프된 텍스트 처리)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  text = linkifyRefsAI(text)
  // linkifyRefsAI가 디코드 → 링크 생성 → 재이스케이프 처리

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 6: 이모지를 아이콘으로 교체
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  text = replaceEmojisWithIcons(text)

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 7: 줄바꿈 처리
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 연속된 빈 줄 제거
  text = text.replace(/\n\n+/g, '\n')

  // div/blockquote 태그 사이의 줄바꿈 제거
  text = text.replace(/<\/div>\n+<div/g, '</div><div')
  text = text.replace(/<\/blockquote>\n+<div/g, '</blockquote><div')

  // 남은 줄바꿈을 <br>로 변환
  text = text.replace(/\n/g, '<br>\n')

  return text
}
```

### 3. markLawQuotes() - 조문 발췌 블록 마커

**파일**: `lib/ai-answer-processor.ts:137-252`

```typescript
function markLawQuotes(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let i = 0
  let inQuoteSection = false
  let currentQuoteLines: string[] = []

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // "⚖️ 조문 발췌" 시작
    if (trimmed === '⚖️ 조문 발췌') {
      result.push(line)
      inQuoteSection = true
      currentQuoteLines = []
      i++
      continue
    }

    // "📖 핵심 해석" 종료 - 블록 종료
    if (inQuoteSection && (trimmed.includes('📖 핵심 해석'))) {
      // 수집된 조문 내용을 블록으로 감싸기
      if (currentQuoteLines.length > 0) {
        result.push('<<<QUOTE_START>>>')
        result.push(...currentQuoteLines)
        result.push('<<<QUOTE_END>>>')
      }
      result.push(line)
      inQuoteSection = false
      currentQuoteLines = []
      i++
      continue
    }

    // 조문 발췌 섹션 내부에서 처리
    if (inQuoteSection) {
      // "(조문 내용 없음)" 발견 시 그것까지만 블록에 포함
      if (trimmed === '(조문 내용 없음)') {
        currentQuoteLines.push(line)
        if (currentQuoteLines.length > 0) {
          result.push('<<<QUOTE_START>>>')
          result.push(...currentQuoteLines)
          result.push('<<<QUOTE_END>>>')
        }
        currentQuoteLines = []
        // 다음 섹션까지 일반 텍스트로 처리
        i++
        while (i < lines.length) {
          const nextLine = lines[i]
          if (nextLine.trim().includes('📖 핵심 해석')) {
            result.push(nextLine)
            inQuoteSection = false
            i++
            break
          }
          result.push(nextLine)
          i++
        }
        continue
      }

      // 일반 조문 내용 수집
      currentQuoteLines.push(line)
      i++
      continue
    }

    result.push(line)
    i++
  }

  return result.join('\n')
}
```

### 4. styleStructuredSections() - 구조화 스타일링

**파일**: `lib/ai-answer-processor.ts:260-283`

```typescript
function styleStructuredSections(text: string): string {
  let result = text

  // 1. 📜 법령 조문 인용을 blockquote로 스타일링 (가장 먼저 처리)
  result = styleLawQuotes(result)
  // &lt;&lt;&lt;QUOTE_START&gt;&gt;&gt; ~ &lt;&lt;&lt;QUOTE_END&gt;&gt;&gt;
  // → <blockquote>조문 내용</blockquote>

  // 2. 주요 섹션 제목 스타일링 (📋 📄 💡 🔗)
  result = styleMainSectionHeadings(result)
  // → <div class="section-header">📋 핵심 요약</div>

  // 3. 📋 핵심 요약: 들여쓰기만 + 상단 여백
  result = indentSection(result, '📋 핵심 요약', { indent: '1rem', bullet: false })

  // 4. 💡 추가 참고: 불릿 + 들여쓰기 + 상단 여백
  result = indentSection(result, '💡 추가 참고', { indent: '1rem', bullet: true })

  // 5. 🔗 관련 법령: 들여쓰기만 + 상단 여백
  result = indentSection(result, '🔗 관련 법령', { indent: '1rem', bullet: false })

  // 6. 📄 상세 내용: 하위 섹션(📖/📝/🔴) 스타일링 + 내용 들여쓰기
  result = styleDetailSection(result, '📄 상세 내용')

  return result
}
```

---

## 법령 링크 생성 시스템

### 1. 통합 링크 생성 아키텍처

**파일**: `lib/unified-link-generator.ts`

```typescript
/**
 * 통합 링크 생성 시스템
 *
 * 목표:
 * 1. 모든 컴포넌트에서 동일한 링크 생성 규칙 사용
 * 2. 중복 처리 및 충돌 방지
 * 3. 테스트 가능한 구조
 */

export interface LinkConfig {
  mode: 'safe' | 'aggressive'  // safe: 「」 있는 것만, aggressive: 모든 패턴
  enableSameRef?: boolean       // "같은 법" 패턴 활성화
  enableAdminRules?: boolean    // 행정규칙 링크 활성화
  currentLawName?: string       // 현재 보고 있는 법령명
}

interface LinkMatch {
  start: number
  end: number
  type: 'law-quoted' | 'law-article' | 'law-name' | 'article' | 'decree' | 'rule' | 'same-law'
  lawName?: string
  article?: string
  displayText: string
  html: string
}
```

### 2. 링크 생성 우선순위

```typescript
export function generateLinks(text: string, config: LinkConfig): string {
  const matches: LinkMatch[] = []

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1단계: 모든 매칭 수집 (우선순위 순서)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 🔴 CRITICAL: 내부 조문 참조를 가장 먼저 수집 (최우선)
  collectInternalArticleMatches(text, matches)
  // "제38조", "제10조의2", "(제39조에" 등

  if (config.enableSameRef) {
    collectSameLawMatches(text, matches, config.currentLawName)
    // "같은 법 제10조", "법 제5조", "시행령 제12조"
  }

  collectQuotedLawMatches(text, matches)
  // "「관세법」 제2조", "「민법」"

  if (config.mode === 'aggressive') {
    collectUnquotedLawMatches(text, matches)
    // "관세법 제38조" (「」 없는 패턴)
  }

  collectDecreeMatches(text, matches)
  // "대통령령으로 정하는"

  collectRuleMatches(text, matches)
  // "기획재정부령으로 정하는"

  if (config.enableAdminRules) {
    collectAdminRuleMatches(text, matches)
    // "관세청장이 정하는"
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2단계: 충돌 해결 (위치 기반 중복 제거)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const resolvedMatches = resolveConflicts(matches)

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3단계: HTML 생성
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  return buildHtml(text, resolvedMatches)
}
```

### 3. 내부 조문 참조 패턴

**파일**: `lib/unified-link-generator.ts:254-292`

```typescript
function collectInternalArticleMatches(text: string, matches: LinkMatch[]): void {
  // 패턴: 제X조 (독립적으로 나타나는 경우)
  // 부정 후방탐색: 「법령명」 패턴 제외
  const articleRegex = /(?<!「[^」]*)(제\s*(\d+)\s*조(?:의\s*(\d+))?)(?:제\s*(\d+)\s*항)?(?:제\s*(\d+)\s*호)?(?![」])/g
  let match: RegExpExecArray | null

  while ((match = articleRegex.exec(text)) !== null) {
    // 이미 처리된 영역인지 확인
    const isOverlap = matches.some(m =>
      match!.index >= m.start && match!.index < m.end
    )

    if (isOverlap) continue

    const joLabel = `제${match[2]}조${match[3] ? '의' + match[3] : ''}`
    const fullLabel = match[1] + (match[4] ? `제${match[4]}항` : '') + (match[5] ? `제${match[5]}호` : '')

    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'article',
      article: joLabel,
      displayText: match[0],
      html: `<a href="javascript:void(0)" class="law-ref" data-ref="article" data-article="${joLabel}" style="cursor: pointer; color: rgb(59 130 246); text-decoration: underline;">${fullLabel}</a>`
    })
  }
}
```

### 4. 같은 법 참조 패턴

**파일**: `lib/unified-link-generator.ts:80-164`

```typescript
function collectSameLawMatches(text: string, matches: LinkMatch[], currentLawName?: string): void {
  // 패턴 1: "같은 법 제X조"
  const sameLawRegex = /같은\s*법\s*제\s*(\d+)\s*조(의\s*(\d+))?(제\s*(\d+)\s*항)?(제\s*(\d+)\s*호)?/g
  let match: RegExpExecArray | null

  while ((match = sameLawRegex.exec(text)) !== null) {
    const offset = match.index
    const fullText = match[0]

    // 마지막 「법령명」 찾기
    const textBefore = text.substring(0, offset)
    const lawMatches = Array.from(textBefore.matchAll(/「\s*([^」]+)\s*」/g))

    if (lawMatches.length > 0) {
      const lastLaw = lawMatches[lawMatches.length - 1]
      const lawName = lastLaw[1].trim()
      const joLabel = `제${match[1]}조${match[3] ? '의' + match[3] : ''}`

      matches.push({
        start: offset,
        end: offset + fullText.length,
        type: 'same-law',
        lawName,
        article: joLabel,
        displayText: fullText,
        html: `<a href="javascript:void(0)" class="law-ref" data-ref="law-article" data-law="${lawName}" data-article="${joLabel}" style="cursor: pointer; color: rgb(59 130 246); text-decoration: underline;">같은 법 ${joLabel}</a>`
      })
    }
  }

  // 패턴 2: "법 제X조", "시행령 제X조", "규칙 제X조"
  const shortRefRegex = /(법|시행령|규칙)\s+제\s*(\d+)\s*조(의\s*(\d+))?(제\s*(\d+)\s*항)?(제\s*(\d+)\s*호)?/g

  while ((match = shortRefRegex.exec(text)) !== null) {
    const refType = match[1]

    // 「법령명」 또는 currentLawName에서 대상 법령명 추론
    let targetLawName: string | undefined

    if (currentLawName) {
      if (refType === '법') {
        targetLawName = currentLawName.replace(/\s*(시행령|시행규칙)$/, '')
      } else if (refType === '시행령') {
        targetLawName = currentLawName.includes('시행령') ? currentLawName : currentLawName + ' 시행령'
      }
    }

    if (targetLawName) {
      const joLabel = `제${match[2]}조${match[4] ? '의' + match[4] : ''}`

      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'same-law',
        lawName: targetLawName,
        article: joLabel,
        displayText: match[0],
        html: `<a href="javascript:void(0)" class="law-ref" data-ref="law-article" data-law="${targetLawName}" data-article="${joLabel}">${refType} ${joLabel}</a>`
      })
    }
  }
}
```

### 5. 인용 법령 패턴 (「」)

**파일**: `lib/unified-link-generator.ts:169-212`

```typescript
function collectQuotedLawMatches(text: string, matches: LinkMatch[]): void {
  // 「법령명」 제X조 패턴
  const articleRegex = /「\s*([^」]+)\s*」\s*제\s*(\d+)\s*조(의\s*(\d+))?(제\s*(\d+)\s*항)?(제\s*(\d+)\s*호)?/g
  let match: RegExpExecArray | null

  while ((match = articleRegex.exec(text)) !== null) {
    const lawName = match[1].trim()
    const joLabel = `제${match[2]}조${match[4] ? '의' + match[4] : ''}`
    const fullLabel = joLabel + (match[6] ? `제${match[6]}항` : '') + (match[8] ? `제${match[8]}호` : '')

    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'law-quoted',
      lawName,
      article: joLabel,
      displayText: match[0],
      html: `<a href="javascript:void(0)" class="law-ref" data-ref="law-article" data-law="${lawName}" data-article="${joLabel}">「${lawName}」 ${fullLabel}</a>`
    })
  }

  // 「법령명」 단독 패턴
  const nameRegex = /「\s*([^」]+)\s*」(?!\s*제\s*\d+\s*조)/g

  while ((match = nameRegex.exec(text)) !== null) {
    const lawName = match[1].trim()

    // 이미 처리된 영역인지 확인
    const isOverlap = matches.some(m =>
      m.start <= match.index && match.index < m.end
    )

    if (!isOverlap) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'law-quoted',
        lawName,
        displayText: match[0],
        html: `<a href="javascript:void(0)" class="law-ref" data-ref="law" data-law="${lawName}">${match[0]}</a>`
      })
    }
  }
}
```

### 6. 충돌 해결 알고리즘

**파일**: `lib/unified-link-generator.ts:354-390`

```typescript
function resolveConflicts(matches: LinkMatch[]): LinkMatch[] {
  // 시작 위치로 정렬
  matches.sort((a, b) => a.start - b.start)

  const resolved: LinkMatch[] = []
  let lastEnd = 0

  for (const match of matches) {
    // 이전 매칭과 겹치지 않는 경우만 추가
    if (match.start >= lastEnd) {
      resolved.push(match)
      lastEnd = match.end
    } else {
      // 겹치는 경우 우선순위 판단
      const lastMatch = resolved[resolved.length - 1]

      // 우선순위: law-quoted > same-law > law-article > others
      const priority: Record<string, number> = {
        'law-quoted': 100,
        'same-law': 90,
        'law-article': 80,
        'law-name': 70,
        'article': 60,
        'decree': 50,
        'rule': 40
      }

      if (priority[match.type] > priority[lastMatch.type]) {
        // 새 매칭이 우선순위가 높으면 교체
        resolved[resolved.length - 1] = match
        lastEnd = match.end
      }
    }
  }

  return resolved
}
```

### 7. 호환성 래퍼 함수

**파일**: `lib/unified-link-generator.ts:420-428`

```typescript
/**
 * 법령 뷰어용 (safe 모드)
 */
export function linkifyRefsB(text: string, currentLawName?: string): string {
  return generateLinks(text, {
    mode: 'safe',
    enableSameRef: true,
    enableAdminRules: true,
    currentLawName
  })
}

/**
 * AI 답변용 (aggressive 모드)
 */
export function linkifyRefsAI(escapedText: string): string {
  // 1. HTML 디코드
  const text = escapedText
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')

  // 2. 링크 생성
  const linked = generateLinks(text, {
    mode: 'aggressive',
    enableSameRef: false,
    enableAdminRules: false
  })

  // 3. HTML 태그는 보존하고 텍스트만 재이스케이프
  return linked.replace(/(<[^>]+>)|([^<]+)/g, (match, tag, text) => {
    if (tag) return tag
    if (text) {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
    }
    return match
  })
}
```

---

## 모달 시스템

### 1. ReferenceModal - 법령 참조 모달

**파일**: `components/reference-modal.tsx`

#### 호출 흐름

```typescript
// components/law-viewer.tsx
const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
  const target = e.target as HTMLElement

  if (target.tagName === 'A') {
    e.preventDefault()

    const dataRef = target.getAttribute('data-ref')
    const article = target.getAttribute('data-article')
    const lawName = target.getAttribute('data-law')

    if (dataRef === 'article') {
      // 내부 조문 참조 → 같은 법령 내 스크롤
      scrollToArticle(article)
    } else if (dataRef === 'law-article') {
      // 외부 법령 참조 → 모달 열기
      openExternalLawArticleModal(lawName, article)
    }
  }
}

const openExternalLawArticleModal = async (lawName: string, joLabel: string) => {
  // 1. 법령 검색 API 호출
  const searchResponse = await fetch(`/api/law-search?query=${lawName}`)
  const searchXml = await searchResponse.text()
  const searchResults = parseLawSearchXML(searchXml)

  if (searchResults.length === 0) {
    // 조례 검색 시도
    const ordinResponse = await fetch(`/api/ordin-search?query=${lawName}`)
    // ...
  }

  // 2. 법령 전문 조회
  const lawId = searchResults[0].lawId
  const mst = searchResults[0].mst

  const lawResponse = await fetch(`/api/eflaw?lawId=${lawId}&mst=${mst}`)
  const lawJson = await lawResponse.json()
  const lawData = parseLawJSON(lawJson)

  // 3. 조문 찾기
  const jo6digit = buildJO(joLabel)
  const targetArticle = lawData.articles.find(a => a.jo === jo6digit)

  if (!targetArticle) {
    toast.error(`${joLabel}를 찾을 수 없습니다`)
    return
  }

  // 4. HTML 생성
  const articleHtml = extractArticleText(
    targetArticle,
    isOrdinance,
    lawData.meta.lawTitle
  )

  // 5. 모달 열기
  setReferenceModal({
    isOpen: true,
    title: `${lawData.meta.lawTitle} ${joLabel}`,
    html: articleHtml,
    lawName: lawData.meta.lawTitle,
    articleNumber: joLabel
  })
}
```

#### 모달 내부 링크 클릭 처리

```typescript
// components/reference-modal.tsx:66-120
useEffect(() => {
  if (!isOpen) return

  // DOM 렌더링 완료 대기
  const timer = setTimeout(() => {
    const contentEl = contentRef.current
    if (!contentEl) return

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement

      // 링크인 경우에만 처리
      if (target && target.tagName === "A") {
        e.preventDefault()
        e.stopPropagation()

        // onContentClick이 있으면 호출 (부모 컴포넌트로 위임)
        if (onContentClick) {
          const reactEvent = e as any as React.MouseEvent<HTMLDivElement>
          onContentClick(reactEvent)
        }
      }
    }

    contentEl.addEventListener("click", handleClick, true)

    return () => {
      contentEl.removeEventListener("click", handleClick, true)
    }
  }, 100)

  return () => clearTimeout(timer)
}, [isOpen, onContentClick, html])
```

#### 모달 히스토리 스택 (모달 → 모달 이동)

```typescript
// components/law-viewer.tsx
const [modalHistory, setModalHistory] = useState<Array<{
  lawName: string
  joLabel: string
  html: string
}>>([])

const openExternalLawArticleModal = async (lawName: string, joLabel: string) => {
  // 현재 모달이 열려있으면 히스토리에 추가
  if (referenceModal.isOpen) {
    setModalHistory(prev => [...prev, {
      lawName: referenceModal.lawName,
      joLabel: referenceModal.articleNumber,
      html: referenceModal.html
    }])
  }

  // 새 모달 열기
  setReferenceModal({
    isOpen: true,
    title: `${lawName} ${joLabel}`,
    html: articleHtml,
    lawName,
    articleNumber: joLabel
  })
}

const handleModalBack = () => {
  if (modalHistory.length === 0) return

  const previous = modalHistory[modalHistory.length - 1]
  setModalHistory(prev => prev.slice(0, -1))

  setReferenceModal({
    isOpen: true,
    title: `${previous.lawName} ${previous.joLabel}`,
    html: previous.html,
    lawName: previous.lawName,
    articleNumber: previous.joLabel
  })
}
```

### 2. ComparisonModal - 신구법 비교 모달

**파일**: `components/comparison-modal.tsx`

#### 호출 흐름

```typescript
// components/law-viewer.tsx
const handleCompare = (jo: string) => {
  setComparisonModal({
    isOpen: true,
    lawTitle: meta.lawTitle,
    lawId: meta.lawId,
    mst: meta.mst,
    targetJo: jo
  })
}

// components/comparison-modal.tsx
const loadComparison = async (revisionDate?: string, revisionNumber?: string) => {
  const params = new URLSearchParams()
  if (lawId) params.append("lawId", lawId)
  else if (mst) params.append("mst", mst)

  if (revisionDate) params.append("ld", revisionDate)
  if (revisionNumber) params.append("ln", revisionNumber)

  const response = await fetch(`/api/oldnew?${params.toString()}`)
  const xmlText = await response.text()

  // parseOldNewXML() 호출
  const comparisonData = parseOldNewXML(xmlText)

  setComparison(comparisonData)
}
```

#### 신구법 차이 하이라이트

**파일**: `lib/oldnew-parser.ts`

```typescript
export function highlightDifferences(oldText: string, newText: string): {
  oldHighlighted: string
  newHighlighted: string
} {
  // diffWords 알고리즘 사용
  const diff = diffWords(oldText, newText)

  let oldHighlighted = ''
  let newHighlighted = ''

  diff.forEach(part => {
    if (part.removed) {
      // 구법에서 삭제됨 (빨간색)
      oldHighlighted += `<mark style="background-color: #fee; color: #c00;">${escapeHtml(part.value)}</mark>`
    } else if (part.added) {
      // 신법에 추가됨 (초록색)
      newHighlighted += `<mark style="background-color: #efe; color: #080;">${escapeHtml(part.value)}</mark>`
    } else {
      // 동일
      oldHighlighted += escapeHtml(part.value)
      newHighlighted += escapeHtml(part.value)
    }
  })

  return { oldHighlighted, newHighlighted }
}
```

---

## 관련 법령 목록 파싱

### 1. 관련 법령 추출

**파일**: `lib/law-parser.ts:extractRelatedLaws()`

```typescript
export function extractRelatedLaws(articles: LawArticle[]): ParsedRelatedLaw[] {
  const relatedLaws: ParsedRelatedLaw[] = []

  articles.forEach(article => {
    const content = article.content || ''

    // 「법령명」 패턴 찾기
    const quotedRegex = /「\s*([^」]+)\s*」/g
    let match: RegExpExecArray | null

    while ((match = quotedRegex.exec(content)) !== null) {
      const lawName = match[1].trim()

      // 이미 추가된 법령인지 확인
      if (relatedLaws.some(l => l.lawName === lawName)) {
        continue
      }

      // 법령 타입 판단
      const lawType = detectLawType(lawName)

      relatedLaws.push({
        lawName,
        lawType,
        jo: article.jo,
        joLabel: formatJO(article.jo)
      })
    }
  })

  return relatedLaws
}

function detectLawType(lawName: string): string {
  if (/시행령/.test(lawName)) return '시행령'
  if (/시행규칙/.test(lawName)) return '시행규칙'
  if (/조례/.test(lawName)) return '조례'
  if (/법률|법$/.test(lawName)) return '법률'
  return '기타'
}
```

### 2. 관련 법령 클릭 처리

```typescript
// components/law-viewer.tsx
const handleRelatedLawClick = (lawName: string, jo: string, article: string) => {
  // openExternalLawArticleModal() 호출
  openExternalLawArticleModal(lawName, article)
}
```

---

## 코드 추출 및 주요 함수

### JO 코드 시스템

**파일**: `lib/law-parser.ts:75-85`

```typescript
/**
 * Converts Korean law article notation to 6-digit JO code
 * Examples:
 *   "38조" → "003800"
 *   "10조의2" → "001002"
 *   "제5조" → "000500"
 */
export function buildJO(input: string): string {
  const components = parseArticleComponents(input)

  const articleNum = components.articleNumber.toString().padStart(4, "0")
  const branchNum = components.branchNumber.toString().padStart(2, "0")
  const jo = `${articleNum}${branchNum}`

  return jo
}

/**
 * Converts 6-digit JO code to Korean notation
 * Examples:
 *   "003800" → "제38조"
 *   "001002" → "제10조의2"
 */
export function formatJO(jo: string): string {
  const articleNum = parseInt(jo.substring(0, 4), 10)
  const branchNum = parseInt(jo.substring(4, 6), 10)

  if (branchNum > 0) {
    return `제${articleNum}조의${branchNum}`
  }
  return `제${articleNum}조`
}
```

### 검색어 파싱

**파일**: `lib/law-parser.ts:93-125`

```typescript
/**
 * Parses search query to extract law name and article
 * Examples:
 *   "관세법 38조" → { lawName: "관세법", article: "38조" }
 *   "관세법 제38조" → { lawName: "관세법", article: "제38조" }
 */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  const normalizedQuery = normalizeLawSearchText(query)

  // 법령명과 조문 사이 공백 선택적
  const articlePattern = /\s*(제?\d+(?:조)?(?:[-의]\d+)?)(?:\s*제?\d+항)?(?:\s*제?\d+호)?(?:\s*제?\d+목)?$/u
  const match = articlePattern.exec(normalizedQuery)

  if (match) {
    const lawName = normalizedQuery.substring(0, match.index).trim()
    const article = match[1]

    return {
      lawName: resolveLawAlias(lawName),
      article,
      jo: buildJO(article)
    }
  }

  return {
    lawName: resolveLawAlias(normalizedQuery),
    article: undefined,
    jo: undefined
  }
}
```

---

## 핵심 규칙 요약

### 1. HTML 생성 순서 (절대 변경 금지)

```
1. 링크 생성 (linkifyRefsB / linkifyRefsAI)
   ↓
2. HTML escape (링크 태그만 보존)
   ↓
3. 개정 마커 스타일링 (applyRevisionStyling)
   ↓
4. 줄바꿈 처리 (<br> 변환)
```

### 2. 링크 우선순위

```
1. law-quoted (「법령명」 제X조)      ← 최우선
2. same-law (같은 법 제X조)
3. law-article (관세법 제38조)
4. article (제38조)                  ← 내부 참조
5. decree (대통령령으로)
6. rule (부령으로)
```

### 3. 항/호 처리 규칙

```
Case A: 항내용 있음
  → 본문 + <br> + 항 번호 + 항내용 + 호

Case B: 항내용 없고 호만 있음 (관세법 제2조)
  → 본문 + <br> + 호 (첫 번째 호만 <br> 하나)
```

### 4. 이스케이프 규칙

```
✅ 보존: <a> 태그, <div>, <span>, <blockquote>
❌ 이스케이프: <개정>, <신설>, 사용자 입력 텍스트
```

### 5. 모달 히스토리 규칙

```
모달 → 모달 이동 시:
1. 현재 모달 상태를 modalHistory에 push
2. 새 모달 열기
3. 뒤로가기 버튼 클릭 시 modalHistory에서 pop
```

---

## 디버깅 체크리스트

### 본문이 제대로 표시되지 않을 때

1. **API 응답 확인**
   ```typescript
   console.log('API response:', JSON.stringify(json, null, 2))
   ```

2. **파싱 단계 확인**
   ```typescript
   console.log('parseLawJSON result:', lawData)
   console.log('articles count:', lawData.articles.length)
   ```

3. **HTML 생성 확인**
   ```typescript
   console.log('extractArticleText input:', article)
   console.log('extractArticleText output:', html)
   ```

4. **링크 생성 확인**
   ```typescript
   console.log('링크 개수:', (html.match(/<a /g) || []).length)
   console.log('개정마커 개수:', (html.match(/rev-mark/g) || []).length)
   ```

### 링크가 작동하지 않을 때

1. **HTML 속성 확인**
   ```typescript
   console.log('data-ref:', link.getAttribute('data-ref'))
   console.log('data-law:', link.getAttribute('data-law'))
   console.log('data-article:', link.getAttribute('data-article'))
   ```

2. **이벤트 리스너 확인**
   ```typescript
   console.log('Event listener attached:', !!contentRef.current)
   ```

3. **모달 상태 확인**
   ```typescript
   console.log('Modal isOpen:', referenceModal.isOpen)
   console.log('Modal history:', modalHistory)
   ```

### AI 답변이 제대로 표시되지 않을 때

1. **마크다운 제거 확인**
   ```typescript
   console.log('Original markdown:', markdown.substring(0, 200))
   console.log('After removeMarkdownSyntax:', text.substring(0, 200))
   ```

2. **마커 추가 확인**
   ```typescript
   console.log('Has QUOTE_START:', text.includes('<<<QUOTE_START>>>'))
   ```

3. **이스케이프 확인**
   ```typescript
   console.log('Has escaped marker:', text.includes('&lt;&lt;&lt;QUOTE_START&gt;&gt;&gt;'))
   ```

4. **blockquote 생성 확인**
   ```typescript
   console.log('Has blockquote:', text.includes('<blockquote'))
   ```

---

**최종 업데이트**: 2025-11-21
**문서 버전**: 1.0
**다음 업데이트 시**: 새로운 파싱 규칙 추가 또는 버그 수정 시 이 문서 업데이트
