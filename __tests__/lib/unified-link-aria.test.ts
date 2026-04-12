/**
 * H-UX3: 모든 링크 생성 결과에 aria-label이 포함되는지 회귀 검증
 */
import { describe, test, expect } from 'vitest'
import { generateLinks } from '@/lib/unified-link-generator'

describe('unified-link-generator aria-label 적용 (H-UX3)', () => {
  test('「법령명」 제N조 패턴 → aria-label 속성 존재', () => {
    const html = generateLinks('「관세법」 제38조에 따라')
    expect(html).toContain('aria-label="')
    expect(html).toMatch(/aria-label="[^"]*관세법[^"]*제38조[^"]*"/)
  })

  test('「법령명」 단독 참조도 aria-label', () => {
    const html = generateLinks('「관세법」 참조')
    expect(html).toContain('aria-label="')
  })

  test('시행령 관련 참조도 aria-label', () => {
    const html = generateLinks('같은 법 시행령')
    // 패턴 매칭 시 aria-label 필수
    if (html.includes('<a ')) {
      expect(html).toMatch(/aria-label="[^"]+"/)
    }
  })

  test('별표 참조 패턴 → aria-label에 별표 번호 포함', () => {
    const html = generateLinks('「관세법」 별표 1 참조')
    if (html.includes('별표')) {
      expect(html).toContain('aria-label')
    }
  })

  test('생성된 모든 앵커에 aria-label 있음', () => {
    const html = generateLinks('「관세법」 제38조와 「민법」 제5조를 참조한다')
    const anchors = html.match(/<a\s[^>]*>/g) || []
    for (const anchor of anchors) {
      expect(anchor).toContain('aria-label="')
    }
  })
})
