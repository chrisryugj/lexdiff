/**
 * 법제처(law.go.kr) URL 상수
 *
 * 하드코딩된 law.go.kr URL을 중앙 관리하여
 * 도메인 변경, HTTPS 전환 등에 일괄 대응
 */

export const LAW_GO_KR = {
  /** 기본 도메인 (상대 경로 → 절대 URL 변환용) */
  BASE: 'https://www.law.go.kr',

  /** DRF API 법령 조회 엔드포인트 */
  DRF_LAW_SERVICE: 'https://www.law.go.kr/DRF/lawService.do',

  /** DRF API 법령 검색 엔드포인트 */
  DRF_LAW_SEARCH: 'https://www.law.go.kr/DRF/lawSearch.do',

  /** LSW 법령정보 뷰어 */
  LSW_INFO: 'https://www.law.go.kr/LSW/lsInfoP.do',

  /** 법령 프론트 경로 (법제처 웹 뷰어) */
  LAW_VIEW: 'https://www.law.go.kr/법령',

  /** 자치법규 프론트 경로 */
  ORDINANCE_VIEW: 'https://www.law.go.kr/자치법규',
} as const

/**
 * 상대 경로를 법제처 절대 URL로 변환
 * - `/LSW/...` → `https://www.law.go.kr/LSW/...`
 * - `//www.law.go.kr/...` → `https://www.law.go.kr/...`
 * - `./path` → `https://www.law.go.kr/path`
 */
export function toLawAbsoluteUrl(href: string): string {
  if (!href) return ''
  if (/^https?:/i.test(href)) return href
  if (href.startsWith('//')) return `https:${href}`
  if (href.startsWith('/')) return `${LAW_GO_KR.BASE}${href}`
  return `${LAW_GO_KR.BASE}/${href.replace(/^\./, '')}`
}
