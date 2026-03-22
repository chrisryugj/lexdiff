/**
 * 클라이언트 사이드 HTML sanitize 유틸리티
 * dangerouslySetInnerHTML 사용 전 XSS 방어용
 */
import sanitizeHtml from 'sanitize-html'

/** 법령 렌더링에 허용되는 태그/속성 */
const ALLOWED_TAGS = [
  // 기본 텍스트
  'a', 'b', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'i', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'sub', 'sup', 'u', 'ul',
  // 테이블
  'table', 'thead', 'tbody', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
  // 기타
  'blockquote', 'dl', 'dt', 'dd', 'img', 'small',
]

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'class', 'aria-label', 'title',
    'data-ref', 'data-law', 'data-article', 'data-law-type',
    'data-annex', 'data-old-law', 'data-ef-yd',
    'data-precedent-id', 'data-case-name', 'data-court',
  ],
  span: ['class', 'style', 'data-jo'],
  div: ['class', 'style', 'id'],
  td: ['colspan', 'rowspan', 'class', 'style'],
  th: ['colspan', 'rowspan', 'class', 'style'],
  table: ['class', 'style'],
  col: ['span', 'style'],
  img: ['src', 'alt', 'width', 'height'],
  '*': ['class'],
}

const ALLOWED_SCHEMES = ['http', 'https']

const sanitizeOptions: Parameters<typeof sanitizeHtml>[1] = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTRIBUTES,
  allowedSchemes: ALLOWED_SCHEMES,
  allowedSchemesByTag: { a: ALLOWED_SCHEMES },
  allowProtocolRelative: false,
}

/**
 * 렌더링 전 HTML sanitize
 * 법령/판례 HTML에서 허용된 태그/속성만 통과시킴
 */
export function sanitizeForRender(html: string): string {
  if (!html) return ''
  return sanitizeHtml(html, sanitizeOptions)
}
