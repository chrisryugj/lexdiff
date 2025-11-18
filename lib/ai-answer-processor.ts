/**
 * AI 답변 처리 - 기본 법령뷰와 완전히 동일한 방식
 */

import { debugLogger } from './debug-logger'

/**
 * AI 답변을 HTML로 변환 (extractArticleText와 동일한 파이프라인)
 */
export function convertAIAnswerToHTML(markdown: string): string {
  if (!markdown) return ''

  debugLogger.info('AI 답변 HTML 변환 시작', { length: markdown.length })

  // 1단계: 마크다운 문법 제거 (내용만 남김)
  let text = removeMarkdownSyntax(markdown)

  // 2단계: ⚖️ 조문 발췌 마커 추가 (이스케이프 전에)
  text = markLawQuotes(text)
  debugLogger.info('마커 추가 후', { hasMarker: text.includes('<<<QUOTE_START>>>') })

  // 3단계: 법령 링크를 임시 마커로 변환 (이스케이프 전에)
  text = linkifyRefsB(text)
  debugLogger.info('링크 마커 변환 후', { hasLawLink: text.includes('<<<LAWLINK') })

  // 4단계: HTML 이스케이프
  text = escapeHtml(text)
  debugLogger.info('이스케이프 후', { hasEscapedMarker: text.includes('&lt;&lt;&lt;QUOTE_START&gt;&gt;&gt;') })

  // 5단계: 구조화 항목 스타일링 추가
  text = styleStructuredSections(text)
  debugLogger.info('스타일링 후', { hasBlockquote: text.includes('<blockquote') })

  // 6단계: 법령 링크 마커 복원 (이스케이프된 마커를 실제 링크로 변환)
  text = restoreLinkMarkers(text)
  debugLogger.info('링크 복원 후', { hasLawLink: text.includes('law-ref') })

  // 7단계: 줄바꿈 처리
  // 연속된 빈 줄 제거
  text = text.replace(/\n\n+/g, '\n')

  // div 태그 사이의 줄바꿈 제거 (내용 간 빈 줄 제거)
  text = text.replace(/<\/div>\n+<div/g, '</div><div')

  // blockquote와 div 사이의 줄바꿈 제거
  text = text.replace(/<\/blockquote>\n+<div/g, '</blockquote><div')
  text = text.replace(/<\/div>\n+<blockquote/g, '</div><blockquote')

  // 주요 섹션 제목 뒤 줄바꿈 제거 (구분선 아래 padding으로 대체)
  // text = text.replace(/(📋 핵심 요약|📄 상세 내용|💡 추가 참고|🔗 관련 법령)<\/div>/g, '$1</div><br>')

  // 남은 줄바꿈을 <br>로 변환
  text = text.replace(/\n/g, '<br>\n')

  debugLogger.success('AI 답변 HTML 변환 완료')

  return text
}

/**
 * 마크다운 문법 제거
 */
function removeMarkdownSyntax(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')           // 헤더
    .replace(/\*\*([^*]+?)\*\*/g, '$1')   // 볼드
    .replace(/\*([^*]+?)\*/g, '$1')       // 이탤릭
    .replace(/`([^`]+?)`/g, '$1')         // 코드
    .replace(/^[-*]\s+/gm, '')            // 리스트
    .replace(/^>\s+/gm, '')               // 인용
    .replace(/^[\-*]{3,}$/gm, '')         // 구분선
}

/**
 * HTML 이스케이프
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * ⚖️ 조문 발췌 마커 추가 (HTML 이스케이프 전에 실행)
 * "⚖️ 조문 발췌"와 "📖 핵심 해석" 사이의 모든 내용을 
 * 로 감싸기
 */
function markLawQuotes(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let i = 0
  let inQuoteSection = false

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // "⚖️ 조문 발췌" 시작
    if (trimmed === '⚖️ 조문 발췌') {
      result.push(line)
      result.push('<<<QUOTE_START>>>')
      inQuoteSection = true
      i++
      continue
    }

    // "📖 핵심 해석" 종료
    if (inQuoteSection && trimmed === '📖 핵심 해석') {
      result.push('<<<QUOTE_END>>>')
      result.push(line)
      inQuoteSection = false
      i++
      continue
    }

    // 조문 발췌 섹션 내부 - 모든 내용 수집
    if (inQuoteSection) {
      result.push(line)
      i++
      continue
    }

    // 그 외 일반 텍스트
    result.push(line)
    i++
  }

  // 섹션이 끝까지 열려있으면 닫기
  if (inQuoteSection) {
    result.push('<<<QUOTE_END>>>')
  }

  return result.join('\n')
}

/**
 * 구조화 항목 스타일링
 * - 주요 섹션 (📋 📄 💡 📖): 크게 + 굵게 + 구분선
 * - 하위 섹션 (핵심해석 실무적용 조건예외): 굵게 + 들여쓰기
 * - 내용에 불릿 추가 + 들여쓰기
 * - 법령 조문 인용 blockquote 처리
 */
function styleStructuredSections(text: string): string {
  let result = text

  // 1. 📜 법령 조문 인용을 blockquote로 스타일링 (가장 먼저 처리)
  result = styleLawQuotes(result)

  // 2. 주요 섹션 제목 스타일링 (📋 📄 💡 🔗)
  result = styleMainSectionHeadings(result)

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

/**
 * 마커를 blockquote로 변환 (HTML 이스케이프 후 실행)
 */
function styleLawQuotes(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // QUOTE_START 마커 발견
    if (trimmed === '&lt;&lt;&lt;QUOTE_START&gt;&gt;&gt;') {
      i++
      const quoteLines: string[] = []

      // QUOTE_END까지 수집
      while (i < lines.length) {
        const nextLine = lines[i]
        const nextTrimmed = nextLine.trim()

        if (nextTrimmed === '&lt;&lt;&lt;QUOTE_END&gt;&gt;&gt;') {
          i++
          break
        }

        quoteLines.push(nextTrimmed)
        i++
      }

      // blockquote 생성 (스타일은 law-viewer.tsx의 prose 클래스에서 적용)
      if (quoteLines.length > 0) {
        let quoteContent = quoteLines.join('<br>')
        // blockquote 내부에서 <strong> 태그 제거 (이탤릭은 prose 클래스에서 자동 적용)
        quoteContent = quoteContent.replace(/<strong>([^<]+)<\/strong>/g, '$1')
        result.push(`<blockquote>${quoteContent}</blockquote>`)
      }
      continue
    }

    result.push(line)
    i++
  }

  return result.join('\n')
}

/**
 * 주요 섹션 헤더 스타일링 (📋/📄/💡/🔗)
 */
function styleMainSectionHeadings(text: string): string {
  const mainSections = ['📋 핵심 요약', '📄 상세 내용', '💡 추가 참고', '🔗 관련 법령']

  let result = text

  mainSections.forEach((section) => {
    const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`^(${escaped})$`, 'gm')
    result = result.replace(
      regex,
      `<div class="section-header" style="font-weight: bold; margin-top: 0.8rem; padding-top: 0.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid hsl(var(--border)); font-size: 1.05rem;">$1</div>`
    )
  })

  return result
}

/**
 * 들여쓰기 옵션
 */
type IndentOptions = {
  indent: string
  bullet: boolean
  topMargin?: string
}

/**
 * 공통 섹션 처리: 들여쓰기 + (옵션) 불릿
 */
function indentSection(text: string, sectionTitle: string, options: IndentOptions): string {
  const escapedTitle = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const sectionRegex = new RegExp(
    `(${escapedTitle}[\\s\\S]*?)(?=📋 핵심 요약|📄 상세 내용|💡 추가 참고|🔗 관련 법령|$)`,
    'g'
  )

  return text.replace(sectionRegex, (match) => {
    const lines = match.split('\n')
    const [titleLine, ...rest] = lines
    const contentLines: string[] = []
    let isFirstContent = true

    rest.forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed) return

      // 이미 HTML 태그로 시작하는 줄은 그대로
      if (trimmed.startsWith('<div') || trimmed.startsWith('<span') || trimmed.startsWith('<blockquote')) {
        contentLines.push(line)
        return
      }

      // 이미 불릿 있으면 그대로
      if (/^[\s]*[•\-]/.test(trimmed)) {
        contentLines.push(line)
        return
      }

      // 상단 여백 스타일 (첫 번째 내용에만 적용)
      const marginTop = isFirstContent && options.topMargin ? `margin-top: ${options.topMargin}; ` : ''
      isFirstContent = false

      // ✅ 📌 🔔 이모지가 있는 경우 → hanging indent (핵심 요약 섹션 전용)
      if (sectionTitle === '📋 핵심 요약' && /^[✅📌🔔]/.test(trimmed)) {
        contentLines.push(
          `<div style="${marginTop}margin-left: ${options.indent}; text-indent: -1.5em; padding-left: 1.5em;">${trimmed}</div>`
        )
        return
      }

      // 일반 텍스트 → 들여쓰기 + (옵션) 불릿
      const prefix = options.bullet ? '• ' : ''

      // 💡 추가 참고 섹션의 불릿 → hanging indent
      if (options.bullet) {
        contentLines.push(
          `<div style="${marginTop}margin-left: ${options.indent}; text-indent: -0.7em; padding-left: 1em;">${prefix}${trimmed}</div>`
        )
      } else {
        contentLines.push(
          `<div style="${marginTop}margin-left: ${options.indent};">${prefix}${trimmed}</div>`
        )
      }
    })

    // 제목 + 내용 (빈 줄 없이 붙임)
    return titleLine + contentLines.join('')
  })
}

/**
 * 📄 상세 내용 전용 처리 (하위 섹션 + 들여쓰기)
 */
function styleDetailSection(text: string, sectionTitle: string): string {
  const escapedTitle = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const sectionRegex = new RegExp(
    `(${escapedTitle}[\\s\\S]*?)(?=📋 핵심 요약|📄 상세 내용|💡 추가 참고|🔗 관련 법령|$)`,
    'g'
  )

  return text.replace(sectionRegex, (match) => {
    const lines = match.split('\n')
    const [titleLine, ...rest] = lines
    const contentLines: string[] = []

    let currentSub: 'none' | 'core' | 'practice' | 'condition' = 'none'
    let isFirstContentInSub = false

    rest.forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed) return

      // blockquote나 이미 div인 줄은 그대로
      if (trimmed.startsWith('<blockquote') || trimmed.startsWith('<div')) {
        contentLines.push(line)
        // blockquote 이후에는 currentSub을 none으로 리셋
        if (trimmed.startsWith('<blockquote')) {
          currentSub = 'none'
          isFirstContentInSub = false
        }
        return
      }

      // 하위 섹션 제목 감지
      if (trimmed === '⚖️ 조문 발췌') {
        currentSub = 'none'
        isFirstContentInSub = false
        contentLines.push(
          `<div style="font-weight: bold; margin-left: 1rem; margin-top: 0.0rem;">${trimmed}</div>`
        )
        return
      }

      if (trimmed.startsWith('📖 핵심 해석')) {
        currentSub = 'core'
        isFirstContentInSub = true
        contentLines.push(
          `<div style="font-weight: bold; margin-left: 1rem; margin-top: 0.5rem;">${trimmed}</div>`
        )
        return
      }

      if (trimmed.startsWith('📝 실무 적용')) {
        currentSub = 'practice'
        isFirstContentInSub = true
        contentLines.push(
          `<div style="font-weight: bold; margin-left: 1rem; margin-top: 0.5rem;">${trimmed}</div>`
        )
        return
      }

      if (trimmed.startsWith('🔴 조건·예외')) {
        currentSub = 'condition'
        isFirstContentInSub = true
        contentLines.push(
          `<div style="font-weight: bold; margin-left: 1rem; margin-top: 0.5rem;">${trimmed}</div>`
        )
        return
      }

      // 하위 섹션 내부 텍스트 → 추가 들여쓰기 + 첫 내용에 상단 여백
      if (currentSub !== 'none') {
        const marginTop = isFirstContentInSub ? 'margin-top: 0.0rem; ' : ''
        isFirstContentInSub = false
        contentLines.push(
          `<div style="${marginTop}margin-left: 2.3rem;">${trimmed}</div>`
        )
        return
      }

      // 그 외는 그대로
      contentLines.push(line)
    })

    // 섹션 제목 + 내용 (빈 줄 없이 붙임)
    return titleLine + contentLines.join('')
  })
}

/**
 * 법령 링크 생성 (law-xml-parser.tsx의 linkifyRefsB와 동일)
 *
 * 중요: 이미 생성된 HTML 속성 안의 텍스트는 다시 링크하지 않도록 lookbehind 사용
 */
function linkifyRefsB(text: string): string {
  let t = text

  // 1. 「법령명」 제X조 패턴 (항, 호 포함) - 임시 마커로 변환
  // 링크는 조문까지만, 표시는 항·호 포함
  t = t.replace(/「([^」]+)」\s*제(\d+)조(의(\d+))?(제(\d+)항)?(제(\d+)호)?/g, (_m, lawName, art, _p1, branch, _p2, para, _p3, item) => {
    const displayLabel = '제' + art + '조' + (branch ? '의' + branch : '') + (para ? '제' + para + '항' : '') + (item ? '제' + item + '호' : '')
    const linkLabel = '제' + art + '조' + (branch ? '의' + branch : '')  // 항·호 제외
    return '<<<LAWLINK_WITH_ARTICLE:' + lawName + '|||' + linkLabel + '|||' + displayLabel + '>>>'
  })

  // 2. 「법령명」 단독 - 임시 마커로 변환
  t = t.replace(/「([^」]+)」/g, (_match, lawName) => {
    return '<<<LAWLINK:' + lawName + '>>>'
  })

  // 3. 법령명 제X조 패턴 (꺽쇄 없음) - 임시 마커로 변환
  // "법률 시행령"같이 법률 뒤에 다른 단어가 오는 경우 제외
  t = t.replace(
    /(?<!<<<[^>]*)([가-힣a-zA-Z0-9·\s]+(?:특별시|광역시|도|시|군|구)\s+[가-힣a-zA-Z0-9·\s]+(?:조례|규칙)|[가-힣a-zA-Z0-9·]+(?:법률|법|령|규칙|조례))(?!\s+[가-힣]+령)\s+제(\d+)조(의(\d+))?\s*(\([\[\]가-힣a-zA-Z0-9\s·ㆍ]+\))?/g,
    (_match, lawName, art, _p2, branch, title) => {
      const cleanLawName = lawName.trim()
      const joLabel = '제' + art + '조' + (branch ? '의' + branch : '')
      const titlePart = title ? '|||' + title.replace(/\[([^\]]+)\]/g, '$1') : ''
      return '<<<LAWLINK_ARTICLE:' + cleanLawName + '|||' + joLabel + titlePart + '>>>'
    }
  )

  // 4. 제X조 패턴 (현재 법령) - 임시 마커로 변환
  t = t.replace(/(?<!<<<[^>]*|[가-힣A-Za-z\d·\s]+(?:법|령|규칙|조례)\s+)제(\d{1,4})조(의(\d{1,2}))?/g, (m) => {
    const data = m.replace(/\s+/g, '')
    return '<<<ARTICLE:' + data + '>>>'
  })

  // 5. 대통령령, 시행령 - 임시 마커로 변환 (이미 마커 안의 텍스트 제외)
  // 법률 시행령, 법령 시행령 등 복합어 제외
  t = t.replace(/(?<!<<<[^>]*)(?<![가-힣]\s)(대통령령|시행령)(?![으로로이가>])/g, (m) => {
    return '<<<DECREE:' + m + '>>>'
  })

  // 6. 부령, 시행규칙 - 임시 마커로 변환 (이미 마커 안의 텍스트 제외)
  // 법률 시행규칙 등 복합어 제외
  t = t.replace(/(?<!<<<[^>]*)(?<![가-힣]\s)((?:[가-힣]+)?부령|시행규칙)(?![으로로이가>])/g, (m) => {
    return '<<<RULE:' + m + '>>>'
  })

  return t
}

/**
 * 마커를 실제 HTML 링크로 복원 (이스케이프 후 실행)
 */
function restoreLinkMarkers(text: string): string {
  let t = text

  // 1. 「법령명」 제X조 링크 복원 (linkLabel만 data-article에, displayLabel은 텍스트에)
  t = t.replace(/&lt;&lt;&lt;LAWLINK_WITH_ARTICLE:([^|]+)\|\|\|([^|&]+)(?:\|\|\|([^&]+))?&gt;&gt;&gt;/g, (_, lawName, linkLabel, displayLabel) => {
    const label = '「' + lawName + '」 ' + (displayLabel || linkLabel)
    return '<a href="#" class="law-ref" data-ref="law-article" data-law="' + lawName + '" data-article="' + linkLabel + '">' + label + '</a>'
  })

  // 2. 「법령명」 단독 링크 복원
  t = t.replace(/&lt;&lt;&lt;LAWLINK:([^&]+)&gt;&gt;&gt;/g, (_, lawName) => {
    return '<a href="#" class="law-ref" data-ref="law" data-law="' + lawName + '">「' + lawName + '」</a>'
  })

  // 3. 법령명 제X조 (꺽쇄 없음) 링크 복원
  t = t.replace(/&lt;&lt;&lt;LAWLINK_ARTICLE:([^|]+)\|\|\|([^|&]+)(?:\|\|\|([^&]+))?&gt;&gt;&gt;/g, (_, lawName, joLabel, title) => {
    const linkPart = lawName + ' ' + joLabel
    const titlePart = title ? ' ' + title : ''
    return '<a href="#" class="law-ref" data-ref="law-article" data-law="' + lawName + '" data-article="' + joLabel + '">' + linkPart + '</a>' + titlePart
  })

  // 4. 제X조 링크 복원
  t = t.replace(/&lt;&lt;&lt;ARTICLE:([^&]+)&gt;&gt;&gt;/g, (_, article) => {
    return '<a href="#" class="law-ref" data-ref="article" data-article="' + article + '">' + article + '</a>'
  })

  // 5. 대통령령, 시행령 링크 복원
  t = t.replace(/&lt;&lt;&lt;DECREE:([^&]+)&gt;&gt;&gt;/g, (_, decree) => {
    return '<a href="#" class="law-ref" data-ref="related" data-kind="decree">' + decree + '</a>'
  })

  // 6. 부령, 시행규칙 링크 복원
  t = t.replace(/&lt;&lt;&lt;RULE:([^&]+)&gt;&gt;&gt;/g, (_, rule) => {
    return '<a href="#" class="law-ref" data-ref="related" data-kind="rule">' + rule + '</a>'
  })

  return t
}
