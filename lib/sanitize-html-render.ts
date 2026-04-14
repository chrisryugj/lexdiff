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

// M11: img src host 화이트리스트. 법제처/대법원 공식 도메인만 허용.
// 외부 제3자 이미지(추적 픽셀 등) 차단 — sanitize-html의 allowedSchemesByTag는
// scheme만 제한하므로 host는 transformTags로 직접 검사.
const ALLOWED_IMG_HOSTS = new Set([
  'www.law.go.kr',
  'law.go.kr',
  'www.scourt.go.kr',
  'scourt.go.kr',
  'www.moleg.go.kr',
  'moleg.go.kr',
])

function isAllowedImgSrc(src: string): boolean {
  if (!src) return false
  try {
    const u = new URL(src, 'https://www.law.go.kr')
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    return ALLOWED_IMG_HOSTS.has(u.hostname)
  } catch {
    return false
  }
}

const sanitizeOptions: Parameters<typeof sanitizeHtml>[1] = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTRIBUTES,
  allowedSchemes: ALLOWED_SCHEMES,
  allowedSchemesByTag: { a: ALLOWED_SCHEMES },
  allowProtocolRelative: false,
  transformTags: {
    img: (tagName, attribs) => {
      const src = String(attribs.src || '')
      if (!isAllowedImgSrc(src)) {
        // src 제거 → 허용되지 않은 host는 빈 img로 전락 → sanitize-html이 렌더 제거
        return { tagName, attribs: {} }
      }
      return { tagName, attribs }
    },
  },
}

/**
 * sanitize 결과 LRU 캐시
 * 모달 히스토리 뒤로가기 시 동일 html을 재방문하는 패턴이 많아서
 * 같은 html 재처리하는 수백ms 비용을 0으로 만듦
 */
// 관세법(330조+) 같은 대용량 법령 전체조문 모드에서 32로는 매 스크롤마다
// 캐시 미스 → sanitize-html 재실행(수십 ms/건) → 본문 랙. 넉넉히 확장.
const SANITIZE_CACHE_MAX = 1024
const sanitizeCache = new Map<string, string>()

/**
 * 렌더링 전 HTML sanitize
 * 법령/판례 HTML에서 허용된 태그/속성만 통과시킴
 */
export function sanitizeForRender(html: string): string {
  if (!html) return ''
  const cached = sanitizeCache.get(html)
  if (cached !== undefined) {
    // LRU: 최근 사용으로 이동
    sanitizeCache.delete(html)
    sanitizeCache.set(html, cached)
    return cached
  }
  const result = sanitizeHtml(html, sanitizeOptions)
  sanitizeCache.set(html, result)
  if (sanitizeCache.size > SANITIZE_CACHE_MAX) {
    const oldestKey = sanitizeCache.keys().next().value
    if (oldestKey !== undefined) sanitizeCache.delete(oldestKey)
  }
  return result
}
