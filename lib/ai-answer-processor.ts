/**
 * AI 답변 처리 - 기본 법령뷰와 완전히 동일한 방식
 */

import { debugLogger } from './debug-logger'
import { linkifyRefsAI } from './unified-link-generator'

/**
 * 이모지를 lucide 아이콘 SVG로 교체
 */
function replaceEmojisWithIcons(text: string): string {
  // 섹션 헤더 이모지 → 아이콘
  const sectionIcons: Record<string, string> = {
    '📋': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1.5"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/></svg>', // Clipboard
    '📄': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1.5"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>', // FileText
    '💡': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1.5"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>', // Lightbulb
    '🔗': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>', // Link2
  }

  // 핵심 요약 하위 이모지 → 아이콘
  const summaryIcons: Record<string, string> = {
    '✅': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>', // CheckCircle2
    '📌': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1"><line x1="12" x2="12" y1="17" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>', // Pin
    '🔔': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>', // Bell
  }

  // 상세 내용 하위 이모지 → 아이콘
  const detailIcons: Record<string, string> = {
    '⚖️': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1"><path d="m16 11 2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>', // Scale
    '📖': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>', // BookOpen
    '📜': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>', // FileText
    '📝': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>', // PenLine
    '🔴': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>', // AlertTriangle
  }

  let result = text

  // 섹션 헤더 교체
  Object.entries(sectionIcons).forEach(([emoji, svg]) => {
    result = result.replace(new RegExp(emoji, 'g'), svg)
  })

  // 핵심 요약 하위 항목 교체
  Object.entries(summaryIcons).forEach(([emoji, svg]) => {
    result = result.replace(new RegExp(emoji, 'g'), svg)
  })

  // 상세 내용 하위 항목 교체
  Object.entries(detailIcons).forEach(([emoji, svg]) => {
    result = result.replace(new RegExp(emoji, 'g'), svg)
  })

  return result
}

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

  // 3단계: HTML 이스케이프 (링크 생성 전에)
  text = escapeHtml(text)
  debugLogger.info('이스케이프 후', { hasEscapedMarker: text.includes('&lt;&lt;&lt;QUOTE_START&gt;&gt;&gt;') })

  // 4단계: 구조화 항목 스타일링 추가
  text = styleStructuredSections(text)
  debugLogger.info('스타일링 후', { hasBlockquote: text.includes('<blockquote') })

  // 5단계: 법령 링크 생성 (이스케이프된 텍스트 처리)
  // linkifyRefsAI가 디코드 → 링크 생성 → 재이스케이프 처리
  text = linkifyRefsAI(text)
  debugLogger.info('링크 생성 완료', { hasLawLink: text.includes('law-ref') })

  // 6단계: 이모지를 아이콘으로 교체
  text = replaceEmojisWithIcons(text)

  // 7단계: 줄바꿈 처리
  // 연속된 빈 줄 제거
  text = text.replace(/\n\n+/g, '\n')

  // div 태그 사이의 줄바꿈 제거 (내용 간 빈 줄 제거)
  text = text.replace(/<\/div>\n+<div/g, '</div><div')

  // blockquote와 div 사이의 줄바꿈 제거
  text = text.replace(/<\/blockquote>\n+<div/g, '</blockquote><div')
  text = text.replace(/<\/div>\n+<blockquote/g, '</div><blockquote')

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
 * "⚖️ 조문 발췌"와 "📖 핵심 해석" 사이의 조문 내용만 블록으로 처리
 * "(조문 내용 없음)" 이후의 항목은 블록에 포함시키지 않음
 */
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
    if (inQuoteSection && (trimmed.includes('📖 핵심 해석') || trimmed.includes('핵심 해석'))) {
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
        // 블록 종료하고 나머지는 일반 텍스트로 처리
        if (currentQuoteLines.length > 0) {
          result.push('<<<QUOTE_START>>>')
          result.push(...currentQuoteLines)
          result.push('<<<QUOTE_END>>>')
        }
        currentQuoteLines = []
        // 다음 줄부터는 블록 바깥으로 처리 (📖 핵심 해석이 나올 때까지)
        i++

        // "(조문 내용 없음)" 이후 "📖 핵심 해석" 전까지의 내용은 블록 밖에 표시
        while (i < lines.length) {
          const nextLine = lines[i]
          const nextTrimmed = nextLine.trim()

          if (nextTrimmed.includes('📖 핵심 해석') || nextTrimmed.includes('핵심 해석')) {
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

      // 빈 줄이 2개 이상 연속으로 나오면 블록 종료 (조문 끝으로 간주)
      if (!trimmed && i + 1 < lines.length && !lines[i + 1].trim()) {
        if (currentQuoteLines.length > 0) {
          result.push('<<<QUOTE_START>>>')
          result.push(...currentQuoteLines)
          result.push('<<<QUOTE_END>>>')
          currentQuoteLines = []
        }
        result.push(line)
        i++
        continue
      }

      // 조문 제목 패턴 (📜로 시작하는 경우)
      if (trimmed.startsWith('📜')) {
        // 이전 블록이 있으면 종료
        if (currentQuoteLines.length > 0) {
          result.push('<<<QUOTE_START>>>')
          result.push(...currentQuoteLines)
          result.push('<<<QUOTE_END>>>')
          currentQuoteLines = []
        }
        // 새로운 블록 시작
        currentQuoteLines.push(line)
        i++
        continue
      }

      // 일반 조문 내용 수집
      currentQuoteLines.push(line)
      i++
      continue
    }

    // 그 외 일반 텍스트
    result.push(line)
    i++
  }

  // 섹션이 끝까지 열려있으면 닫기
  if (inQuoteSection && currentQuoteLines.length > 0) {
    result.push('<<<QUOTE_START>>>')
    result.push(...currentQuoteLines)
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
        // 호(1. 2. 3.) 분리를 위한 전처리
        const expandedLines: string[] = []
        for (const line of quoteLines) {
          // 줄 내부에 호 번호가 있는 경우 분리 (예: "① 내용 1. 호1 2. 호2")
          // 정규식: 공백 + 숫자 + 점 + 공백 패턴을 찾아 줄바꿈 추가
          const parts = line.split(/(?=\s\d+\.\s)/)
          for (const part of parts) {
            const trimmed = part.trim()
            if (trimmed) {
              expandedLines.push(trimmed)
            }
          }
        }

        let quoteContent = expandedLines.join('<br>')
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
      if (trimmed.includes('⚖️ 조문 발췌')) {
        currentSub = 'none'
        isFirstContentInSub = false
        contentLines.push(
          `<div style="font-weight: bold; margin-left: 1rem; margin-top: 0.0rem;">⚖️ 조문 발췌</div>`
        )
        return
      }

      const coreMatch = trimmed.match(/^[\s*#-]*(?:📖\s*)?핵심\s*해석\s*:?\s*(.*)/)
      if (coreMatch) {
        currentSub = 'core'
        isFirstContentInSub = true
        contentLines.push(
          `<div style="font-weight: bold; margin-left: 1rem; margin-top: 0.5rem;">📖 핵심 해석</div>`
        )
        const inlineContent = coreMatch[1].trim()
        if (inlineContent) {
          contentLines.push(
            `<div style="margin-top: 0.0rem; margin-left: 2.3rem;">${inlineContent}</div>`
          )
          isFirstContentInSub = false
        }
        return
      }

      const practiceMatch = trimmed.match(/^[\s*#-]*(?:📝\s*)?실무\s*적용\s*:?\s*(.*)/)
      if (practiceMatch) {
        currentSub = 'practice'
        isFirstContentInSub = true
        contentLines.push(
          `<div style="font-weight: bold; margin-left: 1rem; margin-top: 0.5rem;">📝 실무 적용</div>`
        )
        const inlineContent = practiceMatch[1].trim()
        if (inlineContent) {
          contentLines.push(
            `<div style="margin-top: 0.0rem; margin-left: 2.3rem;">${inlineContent}</div>`
          )
          isFirstContentInSub = false
        }
        return
      }

      const conditionMatch = trimmed.match(/^[\s*#-]*(?:🔴\s*)?조건[·\.]?예외\s*:?\s*(.*)/)
      if (conditionMatch) {
        currentSub = 'condition'
        isFirstContentInSub = true
        contentLines.push(
          `<div style="font-weight: bold; margin-left: 1rem; margin-top: 0.5rem;">🔴 조건·예외</div>`
        )
        const inlineContent = conditionMatch[1].trim()
        if (inlineContent) {
          contentLines.push(
            `<div style="margin-top: 0.0rem; margin-left: 2.3rem;">${inlineContent}</div>`
          )
          isFirstContentInSub = false
        }
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

// 기존 linkifyRefsB와 restoreLinkMarkers 함수는 통합 시스템(unified-link-generator)으로 대체됨
// linkifyRefsAI 사용으로 마커 시스템 불필요
