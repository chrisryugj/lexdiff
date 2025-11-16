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

  // 2단계: 📜 조문 발췌 마커 추가 (이스케이프 전에)
  text = markLawQuotes(text)
  debugLogger.info('마커 추가 후', { hasMarker: text.includes('<<<QUOTE_START>>>') })

  // 3단계: HTML 이스케이프
  text = escapeHtml(text)
  debugLogger.info('이스케이프 후', { hasEscapedMarker: text.includes('&lt;&lt;&lt;QUOTE_START&gt;&gt;&gt;') })

  // 4단계: 구조화 항목 스타일링 추가
  text = styleStructuredSections(text)
  debugLogger.info('스타일링 후', { hasBlockquote: text.includes('<blockquote') })

  // 4단계: 법령 링크 생성 (linkifyRefsB와 동일)
  text = linkifyRefsB(text)

  // 5단계: 줄바꿈 처리
  // 연속된 빈 줄 제거
  text = text.replace(/\n\n+/g, '\n')

  // div 태그 사이의 줄바꿈 제거 (내용 간 빈 줄 제거)
  text = text.replace(/<\/div>\n+<div/g, '</div><div')

  // blockquote와 div 사이의 줄바꿈 제거
  text = text.replace(/<\/blockquote>\n+<div/g, '</blockquote><div')
  text = text.replace(/<\/div>\n+<blockquote/g, '</div><blockquote')

  // 주요 섹션 제목 뒤에만 줄바꿈 추가 (시각적 구분)
  text = text.replace(/(📋 핵심 요약|📄 상세 내용|💡 추가 참고|📖 관련 법령)<\/div>/g, '$1</div><br>')

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
 * 📜 조문 발췌 마커 추가 (HTML 이스케이프 전에 실행)
 * 조문 내용을 특수 마커로 감싸서 나중에 blockquote로 변환
 */
function markLawQuotes(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let i = 0
  let inRelatedLawSection = false

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // 📖 관련 법령 섹션 감지
    if (/📖 관련 법령/.test(trimmed)) {
      inRelatedLawSection = true
      result.push(line)
      i++
      continue
    }

    // 다른 주요 섹션이 나오면 관련 법령 섹션 종료
    if (/📋 핵심 요약|📄 상세 내용|💡 추가 참고/.test(trimmed)) {
      inRelatedLawSection = false
      result.push(line)
      i++
      continue
    }

    // "📜 조문 발췌"인 경우 (관련 법령 섹션이 아닐 때만)
    if (trimmed === '📜 조문 발췌' && !inRelatedLawSection) {
      result.push(line)
      i++

      // 다음 줄부터 조문 전체 수집 (다음 하위 섹션이나 주요 섹션 전까지)
      const quoteLines: string[] = []
      while (i < lines.length) {
        const nextLine = lines[i]
        const nextTrimmed = nextLine.trim()

        // 빈 줄, 하위 섹션, 주요 섹션이면 종료
        if (
          nextTrimmed === '' ||
          /^(📖 핵심 해석|📝 실무 적용|🔴 조건·예외)$/.test(nextTrimmed) ||
          /^(📋 핵심 요약|📄 상세 내용|💡 추가 참고|📖 관련 법령)$/.test(nextTrimmed)
        ) {
          break
        }

        quoteLines.push(nextLine)
        i++
      }

      // 조문 전체를 마커로 감싸기
      if (quoteLines.length > 0) {
        result.push('<<<QUOTE_START>>>')
        result.push(...quoteLines)
        result.push('<<<QUOTE_END>>>')
      }
      continue
    }

    result.push(line)
    i++
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

  // 2. 주요 섹션 제목 스타일링 (📋 📄 💡 📖)
  result = styleMainSectionHeadings(result)

  // 3. 📋 핵심 요약: 들여쓰기만
  result = indentSection(result, '📋 핵심 요약', { indent: '1rem', bullet: false })

  // 4. 💡 추가 참고: 불릿 + 들여쓰기
  result = indentSection(result, '💡 추가 참고', { indent: '1rem', bullet: true })

  // 5. 📖 관련 법령: 들여쓰기만
  result = indentSection(result, '📖 관련 법령', { indent: '1rem', bullet: false })

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

      // blockquote 생성
      if (quoteLines.length > 0) {
        const quoteContent = quoteLines.join('<br>')
        result.push(
          `<blockquote style="border-left: 3px solid #cbd5e1; padding-left: 1rem; margin: 0.5rem 0 0.5rem 1rem; color: #64748b; font-style: italic;">${quoteContent}</blockquote>`
        )
      }
      continue
    }

    result.push(line)
    i++
  }

  return result.join('\n')
}

/**
 * 주요 섹션 헤더 스타일링 (📋/📄/💡/📖)
 */
function styleMainSectionHeadings(text: string): string {
  const mainSections = ['📋 핵심 요약', '📄 상세 내용', '💡 추가 참고', '📖 관련 법령']

  let result = text

  mainSections.forEach((section) => {
    const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`^(${escaped})$`, 'gm')
    result = result.replace(
      regex,
      `<div style="font-size: 1.1rem; font-weight: bold; margin-top: 1.9rem; padding-bottom: 0.5rem; border-bottom: 1px solid #1f2937;">$1</div>`
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
}

/**
 * 공통 섹션 처리: 들여쓰기 + (옵션) 불릿
 */
function indentSection(text: string, sectionTitle: string, options: IndentOptions): string {
  const escapedTitle = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const sectionRegex = new RegExp(
    `(${escapedTitle}[\\s\\S]*?)(?=📋 핵심 요약|📄 상세 내용|💡 추가 참고|📖 관련 법령|$)`,
    'g'
  )

  return text.replace(sectionRegex, (match) => {
    const lines = match.split('\n')
    const [titleLine, ...rest] = lines
    const contentLines: string[] = []

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

      // ✅ 📌 🔔 이모지가 있는 경우 → hanging indent (핵심 요약 섹션 전용)
      if (sectionTitle === '📋 핵심 요약' && /^[✅📌🔔]/.test(trimmed)) {
        contentLines.push(
          `<div style="margin-left: ${options.indent}; text-indent: -1.5em; padding-left: 1.5em;">${trimmed}</div>`
        )
        return
      }

      // 일반 텍스트 → 들여쓰기 + (옵션) 불릿
      const prefix = options.bullet ? '• ' : ''

      // 💡 추가 참고 섹션의 불릿 → hanging indent
      if (options.bullet) {
        contentLines.push(
          `<div style="margin-left: ${options.indent}; text-indent: -0.7em; padding-left: 1em;">${prefix}${trimmed}</div>`
        )
      } else {
        contentLines.push(
          `<div style="margin-left: ${options.indent};">${prefix}${trimmed}</div>`
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
    `(${escapedTitle}[\\s\\S]*?)(?=📋 핵심 요약|📄 상세 내용|💡 추가 참고|📖 관련 법령|$)`,
    'g'
  )

  return text.replace(sectionRegex, (match) => {
    const lines = match.split('\n')
    const [titleLine, ...rest] = lines
    const contentLines: string[] = []

    let currentSub: 'none' | 'core' | 'practice' | 'condition' = 'none'

    rest.forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed) return

      // blockquote나 이미 div인 줄은 그대로
      if (trimmed.startsWith('<blockquote') || trimmed.startsWith('<div')) {
        contentLines.push(line)
        // blockquote 이후에는 currentSub을 none으로 리셋
        if (trimmed.startsWith('<blockquote')) {
          currentSub = 'none'
        }
        return
      }

      // 하위 섹션 제목 감지
      if (trimmed === '📜 조문 발췌') {
        currentSub = 'none'
        contentLines.push(
          `<div style="font-weight: bold; margin-left: 1rem;">${trimmed}</div>`
        )
        return
      }

      if (trimmed.startsWith('📖 핵심 해석')) {
        currentSub = 'core'
        contentLines.push(
          `<div style="font-weight: bold; margin-left: 1rem;">${trimmed}</div>`
        )
        return
      }

      if (trimmed.startsWith('📝 실무 적용')) {
        currentSub = 'practice'
        contentLines.push(
          `<div style="font-weight: bold; margin-left: 1rem;">${trimmed}</div>`
        )
        return
      }

      if (trimmed.startsWith('🔴 조건·예외')) {
        currentSub = 'condition'
        contentLines.push(
          `<div style="font-weight: bold; margin-left: 1rem;">${trimmed}</div>`
        )
        return
      }

      // 하위 섹션 내부 텍스트 → 추가 들여쓰기 (2rem → 3rem)
      if (currentSub !== 'none') {
        contentLines.push(
          `<div style="margin-left: 2.3rem;">${trimmed}</div>`
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

  // 1. 「법령명」 제X조 패턴
  t = t.replace(/「([^」]+)」\s*제(\d+)조(의(\d+))?/g, (_m, lawName, art, _p2, branch) => {
    const joLabel = '제' + art + '조' + (branch ? '의' + branch : '')
    const label = '「' + lawName + '」 ' + joLabel
    return '<a href="#" class="law-ref" data-ref="law-article" data-law="' + lawName + '" data-article="' + joLabel + '">' + label + '</a>'
  })

  // 2. 「법령명」 단독
  t = t.replace(/「([^」]+)」/g, (match, lawName) => {
    return '<a href="#" class="law-ref" data-ref="law" data-law="' + lawName + '">' + match + '</a>'
  })

  // 3. 법령명 제X조 패턴 (꺽쇄 없음) - 이미 링크된 부분 제외
  t = t.replace(/(?<!="|\/">)([가-힣A-Za-z\d·]+(?:법|령|규칙|조례))\s+제(\d+)조(의(\d+))?(?!<\/a>)/g, (match, lawName, art, _p2, branch) => {
    const joLabel = '제' + art + '조' + (branch ? '의' + branch : '')
    return '<a href="#" class="law-ref" data-ref="law-article" data-law="' + lawName + '" data-article="' + joLabel + '">' + match + '</a>'
  })

  // 4. 제X조 패턴 (현재 법령) - 이미 링크된 부분 제외
  // ⚠️ 법령명 바로 뒤에 있는 조문은 건너뛰기 (이미 3번에서 처리됨)
  t = t.replace(/(?<!="|\/">|[가-힣A-Za-z\d·]+(?:법|령|규칙|조례)\s+)제(\d{1,4})조(의(\d{1,2}))?(?!<\/a>)/g, (m) => {
    const data = m.replace(/\s+/g, '')
    return '<a href="#" class="law-ref" data-ref="article" data-article="' + data + '">' + m + '</a>'
  })

  // 5. 대통령령, 시행령
  t = t.replace(/(?<!="|\/">)(대통령령|시행령)(?![으로로이가<])/g, (m) => {
    return '<a href="#" class="law-ref" data-ref="related" data-kind="decree">' + m + '</a>'
  })

  // 6. 부령, 시행규칙
  t = t.replace(/(?<!="|\/">)((?:[가-힣]+)?부령|시행규칙)(?![으로로이가<])/g, (m) => {
    return '<a href="#" class="law-ref" data-ref="related" data-kind="rule">' + m + '</a>'
  })

  return t
}
