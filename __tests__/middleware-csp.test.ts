/**
 * M2: CSP nonce 헬퍼 단위 테스트.
 *
 * `buildCspWithNonce`는 middleware.ts에서 export된 순수 함수. 플래그 on/off
 * 분기는 middleware 함수 전체를 import하면 NextRequest mock이 필요해 과다.
 * 여기서는 CSP 문자열 구조와 보안 요구사항만 검증한다.
 */

import { describe, expect, it } from 'vitest'
import { buildCspWithNonce } from '@/proxy'

describe('buildCspWithNonce (M2)', () => {
  const nonce = 'abc123def456'
  const csp = buildCspWithNonce(nonce)

  it('nonce가 script-src에 포함되고 unsafe-inline은 제거된다', () => {
    expect(csp).toContain(`'nonce-${nonce}'`)
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
  })

  it('style-src도 nonce 기반', () => {
    expect(csp).toMatch(new RegExp(`style-src[^;]*'nonce-${nonce}'`))
    expect(csp).not.toMatch(/style-src[^;]*unsafe-inline/)
  })

  it('strict-dynamic으로 번들 파생 script 허용', () => {
    expect(csp).toContain("'strict-dynamic'")
  })

  it('허용 도메인 whitelist 유지 (법제처/Gemini/폰트 CDN)', () => {
    expect(csp).toContain('https://www.law.go.kr')
    expect(csp).toContain('https://generativelanguage.googleapis.com')
    expect(csp).toContain('https://cdn.jsdelivr.net')
    expect(csp).toContain('https://hangeul.pstatic.net')
  })

  it('default-src self, frame-ancestors self', () => {
    expect(csp).toMatch(/default-src 'self'/)
    expect(csp).toMatch(/frame-ancestors 'self'/)
  })

  it('nonce가 다르면 결과도 다름 (요청별 고유)', () => {
    expect(buildCspWithNonce('n1')).not.toEqual(buildCspWithNonce('n2'))
  })
})
