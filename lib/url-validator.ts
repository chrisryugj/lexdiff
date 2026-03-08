/**
 * URL 유효성 검증 (SSRF 방어)
 * 허용된 도메인만 서버에서 fetch 가능
 */

const ALLOWED_DOMAINS = [
  'www.law.go.kr',
  'law.go.kr',
  'likms.assembly.go.kr',
]

export function validateExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) return false
    if (!ALLOWED_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d))) return false
    // 내부 IP 차단
    if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0|localhost)/i.test(parsed.hostname)) return false
    return true
  } catch {
    return false
  }
}

export function isAllowedUrl(url: string): boolean {
  // 내부 경로는 허용 (/api/... 등)
  if (url.startsWith('/')) return true
  return validateExternalUrl(url)
}
