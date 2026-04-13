/**
 * H-SEC3: CORS origin 화이트리스트 매칭
 */
import { describe, test, expect } from 'vitest'
import { isAllowedOrigin } from '@/proxy'

describe('isAllowedOrigin (H-SEC3)', () => {
  test('정적 프로덕션 도메인 허용', () => {
    expect(isAllowedOrigin('https://lexdiff.vercel.app')).toBe(true)
  })

  test('Vercel 프리뷰 URL 정규식 매칭', () => {
    expect(isAllowedOrigin('https://lexdiff-abc123-lexdiff.vercel.app')).toBe(true)
    expect(isAllowedOrigin('https://lexdiff-git-main-lexdiff.vercel.app')).toBe(true)
  })

  test('localhost 허용 (dev)', () => {
    expect(isAllowedOrigin('http://localhost:3000')).toBe(true)
    expect(isAllowedOrigin('http://127.0.0.1:3000')).toBe(true)
  })

  test('타 도메인 거부', () => {
    expect(isAllowedOrigin('https://evil.com')).toBe(false)
    expect(isAllowedOrigin('https://lexdiff.evil.com')).toBe(false)
    expect(isAllowedOrigin('https://lexdiff.vercel.app.evil.com')).toBe(false)
  })

  test('protocol mismatch 거부 (http: prod)', () => {
    expect(isAllowedOrigin('http://lexdiff.vercel.app')).toBe(false)
  })

  test('null/empty 거부', () => {
    expect(isAllowedOrigin(null)).toBe(false)
    expect(isAllowedOrigin('')).toBe(false)
  })

  test('subdomain 공격 벡터 거부', () => {
    // 정규식이 앵커링 되어 있는지
    expect(isAllowedOrigin('https://attacker-lexdiff-vercel.app')).toBe(false)
    expect(isAllowedOrigin('https://lexdiff-abc.vercel.appx')).toBe(false)
  })
})
