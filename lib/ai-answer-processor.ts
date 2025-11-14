/**
 * AI 답변 마크다운을 HTML로 변환 (섹션별 링크 처리)
 */

import { parseRelatedLawTitle } from './law-parser'

/**
 * AI 답변 마크다운을 HTML로 변환
 *
 * 링크 처리 대상:
 * - "### 📋 상세내용" 섹션: 발췌조문 (**📜 법령명 제N조**)만 링크
 * - "## 📖 관련 법령" 섹션: 관련법령 (- 법령명 제N조)만 링크
 */
export function convertAIAnswerToHTML(markdown: string): string {
  if (!markdown) return ''

  // 줄바꿈 정규화
  const lines = markdown.split('\n')
  const html: string[] = []

  let inDetailSection = false
  let inRelatedSection = false
  let inList = false
  let inBlockquote = false

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

    // 빈 줄
    if (!line.trim()) {
      if (inList) {
        html.push('</ul>')
        inList = false
      }
      if (inBlockquote) {
        html.push('</blockquote>')
        inBlockquote = false
      }
      html.push('<br />')
      continue
    }

    // 헤더 감지 및 섹션 추적
    if (line.startsWith('###')) {
      if (inList) {
        html.push('</ul>')
        inList = false
      }
      if (inBlockquote) {
        html.push('</blockquote>')
        inBlockquote = false
      }

      const headerText = line.replace(/^###\s*/, '')
      inDetailSection = headerText.includes('📋') && headerText.includes('상세내용')
      inRelatedSection = false

      html.push(`<h3 class="text-base font-semibold mt-4 mb-2">${escapeHtml(headerText)}</h3>`)
      continue
    }

    if (line.startsWith('##')) {
      if (inList) {
        html.push('</ul>')
        inList = false
      }
      if (inBlockquote) {
        html.push('</blockquote>')
        inBlockquote = false
      }

      const headerText = line.replace(/^##\s*/, '')
      inRelatedSection = headerText.includes('📖') && headerText.includes('관련')
      inDetailSection = false

      html.push(`<h2 class="text-lg font-bold mt-6 mb-3">${escapeHtml(headerText)}</h2>`)
      continue
    }

    // 리스트 아이템
    if (line.startsWith('- ')) {
      if (!inList) {
        html.push('<ul class="list-disc list-inside space-y-1.5 my-3">')
        inList = true
      }

      let content = line.substring(2).trim()

      // 관련 법령 섹션에서만 링크 처리
      if (inRelatedSection && content.match(/^.+?\s+제\d+조/)) {
        const parsed = parseRelatedLawTitle(content, 'related')
        if (parsed) {
          content = `<a href="#" class="law-link text-blue-400 hover:text-blue-300 underline cursor-pointer" data-law="${escapeHtml(parsed.lawName)}" data-jo="${escapeHtml(parsed.jo)}" data-article="${escapeHtml(parsed.article)}" data-source="related">🔗 ${escapeHtml(content)}</a>`
        } else {
          content = escapeHtml(content)
        }
      } else {
        content = processInlineFormatting(content, false)
      }

      html.push(`<li>${content}</li>`)
      continue
    }

    // 리스트 종료
    if (inList && !line.startsWith('- ')) {
      html.push('</ul>')
      inList = false
    }

    // 인용구
    if (line.startsWith('>')) {
      if (!inBlockquote) {
        html.push('<blockquote class="border-l-4 border-blue-400 bg-blue-950/30 pl-4 py-2 my-4">')
        inBlockquote = true
      }

      const content = line.substring(1).trim()
      html.push(`<p class="my-1 leading-relaxed">${processInlineFormatting(content, false)}</p>`)
      continue
    }

    // 인용구 종료
    if (inBlockquote && !line.startsWith('>')) {
      html.push('</blockquote>')
      inBlockquote = false
    }

    // 일반 단락
    const processedLine = processInlineFormatting(line, inDetailSection)
    html.push(`<p class="my-3 leading-relaxed">${processedLine}</p>`)
  }

  // 열린 태그 닫기
  if (inList) html.push('</ul>')
  if (inBlockquote) html.push('</blockquote>')

  return html.join('\n')
}

/**
 * 인라인 포맷팅 처리 (볼드, 이탤릭, 발췌조문 링크)
 */
function processInlineFormatting(text: string, isDetailSection: boolean): string {
  let result = escapeHtml(text)

  // 발췌조문 링크 처리 (상세내용 섹션에서만)
  if (isDetailSection) {
    result = result.replace(
      /\*\*📜\s*([^*]+?)\*\*/g,
      (match, lawText) => {
        const parsed = parseRelatedLawTitle(lawText.trim(), 'excerpt')
        if (parsed) {
          return `<a href="#" class="law-link text-blue-400 hover:text-blue-300 underline cursor-pointer font-bold" data-law="${escapeHtml(parsed.lawName)}" data-jo="${escapeHtml(parsed.jo)}" data-article="${escapeHtml(parsed.article)}" data-source="excerpt">🔗 📜 ${escapeHtml(lawText)}</a>`
        }
        return `<strong>📜 ${escapeHtml(lawText)}</strong>`
      }
    )
  }

  // 일반 볼드 (발췌조문 아닌 것)
  result = result.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')

  // 이탤릭
  result = result.replace(/\*([^*]+?)\*/g, '<em>$1</em>')

  // 코드
  result = result.replace(/`([^`]+?)`/g, '<code class="px-1.5 py-0.5 bg-muted rounded font-mono text-sm">$1</code>')

  return result
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
