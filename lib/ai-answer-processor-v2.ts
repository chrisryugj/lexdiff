/**
 * AI 답변 HTML 변환 프로세서 v2
 *
 * 개선된 링크 생성 시스템:
 * - 단일 패스 스캔으로 중복 처리 방지
 * - 명확한 우선순위 규칙
 * - 테스트 가능한 모듈화 구조
 */

interface Token {
  type: 'text' | 'law_quoted' | 'law_article' | 'law_name' | 'article_only' | 'decree' | 'rule'
  content: string
  data?: {
    lawName?: string
    article?: string
    displayText?: string
  }
}

/**
 * 텍스트를 토큰으로 분리 (단일 패스)
 */
function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let pos = 0

  while (pos < text.length) {
    let matched = false

    // 우선순위 1: 「법령명」 패턴
    const quotedPattern = /^「([^」]+)」(\s*제(\d+)조(의(\d+))?(제(\d+)항)?(제(\d+)호)?)?/
    const quotedMatch = text.slice(pos).match(quotedPattern)

    if (quotedMatch) {
      const lawName = quotedMatch[1]

      if (quotedMatch[2]) {
        // 「법령명」 제X조 패턴
        const article = `제${quotedMatch[3]}조${quotedMatch[5] ? '의' + quotedMatch[5] : ''}`
        const fullDisplay = quotedMatch[0]

        tokens.push({
          type: 'law_quoted',
          content: fullDisplay,
          data: { lawName, article, displayText: fullDisplay }
        })
        pos += quotedMatch[0].length
      } else {
        // 「법령명」 단독
        tokens.push({
          type: 'law_quoted',
          content: quotedMatch[0],
          data: { lawName }
        })
        pos += quotedMatch[0].length
      }
      matched = true
    }

    // 우선순위 2: 법령명 + 제X조 패턴 (「」 없음)
    if (!matched) {
      const lawArticlePattern = /^([가-힣a-zA-Z0-9·\s]+(?:법률|법|령|규칙|조례)(?:\s+시행령|\s+시행규칙)?)\s+제(\d+)조(의(\d+))?(제(\d+)항)?(제(\d+)호)?/
      const lawArticleMatch = text.slice(pos).match(lawArticlePattern)

      if (lawArticleMatch) {
        const lawName = lawArticleMatch[1].trim()
        const article = `제${lawArticleMatch[2]}조${lawArticleMatch[4] ? '의' + lawArticleMatch[4] : ''}`

        tokens.push({
          type: 'law_article',
          content: lawArticleMatch[0],
          data: { lawName, article, displayText: lawArticleMatch[0] }
        })
        pos += lawArticleMatch[0].length
        matched = true
      }
    }

    // 우선순위 3: 법령명만 (조문 없음)
    if (!matched) {
      const lawNamePattern = /^[가-힣a-zA-Z0-9·\s]+(?:법률|법|령|규칙|조례)(?:\s+시행령|\s+시행규칙)?(?![가-힣])/
      const lawNameMatch = text.slice(pos).match(lawNamePattern)

      if (lawNameMatch && !text.slice(pos + lawNameMatch[0].length).match(/^\s*제\d+조/)) {
        tokens.push({
          type: 'law_name',
          content: lawNameMatch[0],
          data: { lawName: lawNameMatch[0].trim() }
        })
        pos += lawNameMatch[0].length
        matched = true
      }
    }

    // 우선순위 4: 제X조만 (현재 법령)
    if (!matched) {
      const articleOnlyPattern = /^제(\d+)조(의(\d+))?/
      const articleMatch = text.slice(pos).match(articleOnlyPattern)

      // 앞에 법령명이 없는 경우만
      if (articleMatch && pos > 0) {
        const prevText = text.slice(Math.max(0, pos - 20), pos)
        if (!prevText.match(/[가-힣]+(?:법|령|규칙|조례)\s*$/)) {
          tokens.push({
            type: 'article_only',
            content: articleMatch[0],
            data: { article: articleMatch[0].replace(/\s/g, '') }
          })
          pos += articleMatch[0].length
          matched = true
        }
      }
    }

    // 우선순위 5: 대통령령/시행령
    if (!matched) {
      const decreePattern = /^(대통령령|(?<![가-힣]\s)시행령)(?![으로로이가])/
      const decreeMatch = text.slice(pos).match(decreePattern)

      if (decreeMatch) {
        tokens.push({
          type: 'decree',
          content: decreeMatch[0]
        })
        pos += decreeMatch[0].length
        matched = true
      }
    }

    // 우선순위 6: 부령/시행규칙
    if (!matched) {
      const rulePattern = /^([가-힣]+부령|(?<![가-힣]\s)시행규칙)(?![으로로이가])/
      const ruleMatch = text.slice(pos).match(rulePattern)

      if (ruleMatch) {
        tokens.push({
          type: 'rule',
          content: ruleMatch[0]
        })
        pos += ruleMatch[0].length
        matched = true
      }
    }

    // 매칭 안된 텍스트
    if (!matched) {
      // 다음 잠재적 매칭 지점까지 텍스트 수집
      let nextPos = pos + 1
      while (nextPos < text.length) {
        // 다음 패턴이 시작될 수 있는 지점 찾기
        if (text[nextPos] === '「' ||
            text.slice(nextPos).match(/^(제\d|[가-힣]+(?:법|령|규칙|조례)|대통령령|시행)/)) {
          break
        }
        nextPos++
      }

      tokens.push({
        type: 'text',
        content: text.slice(pos, nextPos)
      })
      pos = nextPos
    }
  }

  return tokens
}

/**
 * 토큰을 HTML로 변환
 */
function tokensToHTML(tokens: Token[]): string {
  return tokens.map(token => {
    switch (token.type) {
      case 'law_quoted':
        if (token.data?.article) {
          // 「법령명」 제X조
          return `<a href="#" class="law-ref" data-ref="law-article" data-law="${token.data.lawName}" data-article="${token.data.article}">${token.content}</a>`
        } else {
          // 「법령명」만
          return `<a href="#" class="law-ref" data-ref="law" data-law="${token.data?.lawName}">「${token.data?.lawName}」</a>`
        }

      case 'law_article':
        // 법령명 제X조
        return `<a href="#" class="law-ref" data-ref="law-article" data-law="${token.data?.lawName}" data-article="${token.data?.article}">${token.content}</a>`

      case 'law_name':
        // 법령명만
        return `<a href="#" class="law-ref" data-ref="law" data-law="${token.data?.lawName}">${token.content}</a>`

      case 'article_only':
        // 제X조만
        return `<a href="#" class="law-ref" data-ref="article" data-article="${token.data?.article}">${token.content}</a>`

      case 'decree':
        // 대통령령/시행령
        return `<a href="#" class="law-ref" data-ref="related" data-kind="decree">${token.content}</a>`

      case 'rule':
        // 부령/시행규칙
        return `<a href="#" class="law-ref" data-ref="related" data-kind="rule">${token.content}</a>`

      case 'text':
      default:
        return token.content
    }
  }).join('')
}

/**
 * 개선된 링크 생성 함수
 */
export function createLawLinks(text: string): string {
  // HTML 이스케이프 처리된 텍스트인지 확인
  const isEscaped = text.includes('&lt;') || text.includes('&gt;')

  if (isEscaped) {
    // 이미 이스케이프된 경우 디코드 후 처리
    text = text
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, '&')
  }

  // 토큰화
  const tokens = tokenize(text)

  // HTML 생성
  let html = tokensToHTML(tokens)

  // 필요시 재이스케이프 (링크 태그는 제외)
  if (isEscaped) {
    // 링크가 아닌 부분만 이스케이프
    html = html.replace(/(<a[^>]*>.*?<\/a>)|([^<]+)/g, (match, link, text) => {
      if (link) return link // 링크는 그대로
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

  return html
}

/**
 * 테스트용 내보내기
 */
export { tokenize, tokensToHTML }