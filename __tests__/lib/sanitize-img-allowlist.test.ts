/**
 * M11: img src allowlist 회귀
 */
import { describe, test, expect } from 'vitest'
import { sanitizeForRender } from '@/lib/sanitize-html-render'

describe('sanitizeForRender img allowlist (M11)', () => {
  test('law.go.kr 호스트 img 허용', () => {
    const out = sanitizeForRender('<p><img src="https://www.law.go.kr/pic.png" alt="x"></p>')
    expect(out).toContain('src="https://www.law.go.kr/pic.png"')
  })

  test('제3자 호스트 img의 src 제거', () => {
    const out = sanitizeForRender('<p><img src="https://evil.com/tracker.png" alt="t"></p>')
    expect(out).not.toContain('evil.com')
  })

  test('tracking pixel (1x1 gif) 제거', () => {
    const out = sanitizeForRender('<img src="https://tracker.example/px.gif" width="1" height="1" alt="">')
    expect(out).not.toContain('tracker.example')
  })

  test('javascript: src 차단', () => {
    const out = sanitizeForRender('<img src="javascript:alert(1)" alt="">')
    expect(out).not.toContain('javascript:')
  })

  test('data: URL 차단', () => {
    const out = sanitizeForRender('<img src="data:image/png;base64,abc" alt="">')
    expect(out).not.toContain('data:image')
  })

  test('scourt.go.kr 허용', () => {
    const out = sanitizeForRender('<img src="https://www.scourt.go.kr/image.jpg" alt="">')
    expect(out).toContain('scourt.go.kr')
  })
})
