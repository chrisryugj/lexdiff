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

  // 2단계: HTML 이스케이프
  text = escapeHtml(text)

  // 3단계: 법령 링크 생성 (linkifyRefsB와 동일)
  text = linkifyRefsB(text)

  // 4단계: 줄바꿈 처리
  text = text.replace(/\n\n+/g, '\n\n').replace(/\n/g, '<br>\n')

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
