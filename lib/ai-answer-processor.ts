/**
 * AI 답변 처리 - 기본 법령뷰와 동일한 방식 사용
 *
 * 마크다운 파싱 없이 직접 HTML 생성
 * extractArticleText()와 동일한 파이프라인 적용
 */

/**
 * AI 답변을 HTML로 변환 (기본 법령뷰 방식)
 */
export function convertAIAnswerToHTML(markdown: string): string {
  if (!markdown) return ''

  // 1단계: 마크다운 문법 제거
  let text = removeMarkdownSyntax(markdown)

  // 2단계: HTML 이스케이프 (링크 생성 전에 먼저!)
  text = escapeHtml(text)

  // 3단계: 법령 링크 생성 (이스케이프된 텍스트에 HTML 태그 직접 삽입)
  text = linkifyLawReferences(text)

  // 4단계: 줄바꿈 및 포맷팅
  text = formatLineBreaks(text)

  return text
}

/**
 * 마크다운 문법 제거 (내용만 남김)
 */
function removeMarkdownSyntax(text: string): string {
  let result = text

  // 헤더 제거 (##, ###)
  result = result.replace(/^#{1,6}\s+/gm, '')

  // 볼드 제거 (**)
  result = result.replace(/\*\*([^*]+?)\*\*/g, '$1')

  // 이탤릭 제거 (*)
  result = result.replace(/\*([^*]+?)\*/g, '$1')

  // 코드 제거 (`)
  result = result.replace(/`([^`]+?)`/g, '$1')

  // 리스트 마커 제거 (- )
  result = result.replace(/^-\s+/gm, '')

  // 인용구 제거 (>)
  result = result.replace(/^>\s+/gm, '')

  // 수평선 제거 (---, ***)
  result = result.replace(/^[\-*]{3,}$/gm, '')

  return result
}

/**
 * HTML 이스케이프 (extractArticleText와 동일)
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
 * 법령 링크 생성 (linkifyRefsB와 동일 - 이스케이프된 텍스트에 HTML 직접 삽입)
 */
function linkifyLawReferences(text: string): string {
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

  // 3. 법령명 제X조 패턴 (꺽쇄 없는 버전) - 이미 링크된 부분 제외
  t = t.replace(/(?<!">)([가-힣A-Za-z\d·]+(?:법|령|규칙|조례))\s+제(\d+)조(의(\d+))?(?!<\/a>)/g, (match, lawName, art, _p2, branch) => {
    const joLabel = '제' + art + '조' + (branch ? '의' + branch : '')
    return '<a href="#" class="law-ref" data-ref="law-article" data-law="' + lawName + '" data-article="' + joLabel + '">' + match + '</a>'
  })

  // 4. 제X조 패턴 (현재 법령) - 이미 링크된 부분 제외
  t = t.replace(/(?<!">)제(\d{1,4})조(의(\d{1,2}))?(?!<\/a>)/g, (m) => {
    const data = m.replace(/\s+/g, '')
    return '<a href="#" class="law-ref" data-ref="article" data-article="' + data + '">' + m + '</a>'
  })

  // 5. 대통령령, 시행령
  t = t.replace(/(대통령령|시행령)(?![으로로이가])/g, (m) => {
    return '<a href="#" class="law-ref" data-ref="related" data-kind="decree">' + m + '</a>'
  })

  // 6. 부령, 시행규칙
  t = t.replace(/((?:[가-힣]+)?부령|시행규칙)(?![으로로이가])/g, (m) => {
    return '<a href="#" class="law-ref" data-ref="related" data-kind="rule">' + m + '</a>'
  })

  return t
}

/**
 * 줄바꿈 및 포맷팅
 */
function formatLineBreaks(text: string): string {
  let result = text

  // 빈 줄을 <br><br>로 변환
  result = result.replace(/\n\n+/g, '<br><br>')

  // 단일 줄바꿈을 <br>로 변환
  result = result.replace(/\n/g, '<br>')

  // 연속된 공백 정리
  result = result.replace(/ {2,}/g, ' ')

  return result
}
