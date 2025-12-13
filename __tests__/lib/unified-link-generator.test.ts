import { describe, it, expect } from 'vitest'
import { generateLinks, linkifyRefsB, linkifyRefsAI } from '../../lib/unified-link-generator'

describe('unified-link-generator', () => {
  describe('generateLinks - safe 모드 (「」 패턴만)', () => {
    it('「법령명」 단독 패턴 링크 생성', () => {
      const text = '「관세법」에 따르면'
      const result = generateLinks(text, { mode: 'safe' })
      expect(result).toContain('data-ref="law"')
      expect(result).toContain('data-law="관세법"')
    })

    it('「법령명」 제N조 패턴 링크 생성', () => {
      const text = '「관세법」 제38조에 따라'
      const result = generateLinks(text, { mode: 'safe' })
      expect(result).toContain('data-ref="law-article"')
      expect(result).toContain('data-law="관세법"')
      expect(result).toContain('data-article="제38조"')
    })

    it('가지 조문 링크 생성', () => {
      const text = '「도로법」 제10조의2에 따른'
      const result = generateLinks(text, { mode: 'safe' })
      expect(result).toContain('data-article="제10조의2"')
    })

    it('항/호 정보 포함', () => {
      const text = '「관세법」 제38조제1항제2호'
      const result = generateLinks(text, { mode: 'safe' })
      expect(result).toContain('제38조제1항제2호')
    })

    it('「」 없는 패턴은 링크 안함 (safe 모드)', () => {
      const text = '관세법 제38조에 따라'
      const result = generateLinks(text, { mode: 'safe' })
      expect(result).not.toContain('data-ref="law-article"')
    })

    it('시행령/시행규칙 타입 감지', () => {
      const text = '「관세법 시행령」 제55조'
      const result = generateLinks(text, { mode: 'safe' })
      expect(result).toContain('data-law-type="decree"')
    })
  })

  describe('generateLinks - aggressive 모드 (모든 패턴)', () => {
    it('「」 없는 법령명 링크 생성', () => {
      const text = '관세법 제38조에 따라'
      const result = generateLinks(text, { mode: 'aggressive' })
      expect(result).toContain('data-ref="law-article"')
      expect(result).toContain('data-law="관세법"')
    })

    it('시행령 패턴 인식', () => {
      const text = '관세법 시행령 제55조를 적용'
      const result = generateLinks(text, { mode: 'aggressive' })
      expect(result).toContain('data-law="관세법 시행령"')
    })

    it('조례 패턴 인식', () => {
      const text = '서울시 도시계획조례 제10조'
      const result = generateLinks(text, { mode: 'aggressive' })
      expect(result).toContain('data-ref="law-article"')
    })
  })

  describe('generateLinks - 내부 조문 참조', () => {
    it('독립적인 제N조 링크 생성', () => {
      const text = '제5조에 따른 규정'
      const result = generateLinks(text, { mode: 'safe' })
      expect(result).toContain('data-ref="article"')
      expect(result).toContain('data-article="제5조"')
    })

    it('제N조의M 패턴 인식', () => {
      const text = '제10조의2를 적용'
      const result = generateLinks(text, { mode: 'safe' })
      expect(result).toContain('data-article="제10조의2"')
    })

    it('제N조제M항 패턴 인식', () => {
      const text = '제5조제2항에 따라'
      const result = generateLinks(text, { mode: 'safe' })
      expect(result).toContain('제5조제2항')
    })

    it('「」 내부의 조문은 별도 처리 안함', () => {
      const text = '「관세법」 제38조'
      const result = generateLinks(text, { mode: 'safe' })
      // 「관세법」 제38조가 하나의 링크로 처리되어야 함
      const linkCount = (result.match(/data-ref=/g) || []).length
      expect(linkCount).toBe(1)
    })
  })

  describe('generateLinks - 같은 법 참조 (enableSameRef)', () => {
    it('같은 법 제N조 패턴', () => {
      const text = '「관세법」 제38조 및 같은 법 제39조'
      const result = generateLinks(text, { mode: 'safe', enableSameRef: true })
      expect(result).toContain('data-law="관세법"')
      // 같은 법 참조도 관세법으로 연결되어야 함
    })

    it('시행령 참조 (상위법 기준)', () => {
      const text = '「관세법」 제38조 및 시행령 제55조'
      const result = generateLinks(text, {
        mode: 'safe',
        enableSameRef: true,
        currentLawName: '관세법'
      })
      expect(result).toContain('같은')
    })
  })

  describe('generateLinks - 대통령령/부령 패턴', () => {
    it('대통령령으로 정하는 패턴', () => {
      const text = '대통령령으로 정하는 바에 따라'
      const result = generateLinks(text, { mode: 'safe' })
      expect(result).toContain('data-ref="related"')
      expect(result).toContain('data-kind="decree"')
    })

    it('XXX부령으로 정하는 패턴', () => {
      const text = '기획재정부령으로 정하는 사항'
      const result = generateLinks(text, { mode: 'safe' })
      expect(result).toContain('data-ref="related"')
      expect(result).toContain('data-kind="rule"')
    })
  })

  describe('generateLinks - 행정규칙 패턴 (enableAdminRules)', () => {
    it('관세청장이 정하는 패턴', () => {
      const text = '관세청장이 정하는 바에 따라'
      const result = generateLinks(text, { mode: 'safe', enableAdminRules: true })
      expect(result).toContain('data-ref="regulation"')
      expect(result).toContain('data-kind="administrative"')
    })

    it('장관이 정하는 패턴', () => {
      const text = '기획재정부장관이 정하는 기준'
      const result = generateLinks(text, { mode: 'safe', enableAdminRules: true })
      expect(result).toContain('data-ref="regulation"')
    })

    it('enableAdminRules 비활성화 시 링크 안함', () => {
      const text = '관세청장이 정하는 바에 따라'
      const result = generateLinks(text, { mode: 'safe', enableAdminRules: false })
      expect(result).not.toContain('data-ref="regulation"')
    })
  })

  describe('충돌 해결 (겹치는 패턴)', () => {
    it('「」 패턴이 일반 패턴보다 우선', () => {
      const text = '「관세법」 제38조'
      const result = generateLinks(text, { mode: 'aggressive' })
      // 하나의 링크만 생성되어야 함
      const linkCount = (result.match(/<a /g) || []).length
      expect(linkCount).toBe(1)
    })

    it('긴 매칭이 짧은 매칭보다 우선', () => {
      const text = '「관세법 시행령」 제55조'
      const result = generateLinks(text, { mode: 'safe' })
      expect(result).toContain('data-law="관세법 시행령"')
      // "관세법"만 따로 링크되면 안됨
    })
  })

  describe('linkifyRefsB - 호환성 함수', () => {
    it('safe 모드 + enableSameRef + enableAdminRules 적용', () => {
      const text = '「관세법」 제38조 및 같은 법 제39조, 관세청장이 정하는'
      const result = linkifyRefsB(text, '관세법')
      expect(result).toContain('data-ref="law-article"')
      expect(result).toContain('data-ref="regulation"')
    })
  })

  describe('linkifyRefsAI - AI 답변용 (aggressive 모드)', () => {
    it('HTML 이스케이프 처리', () => {
      const text = '&lt;관세법&gt; 제38조'
      const result = linkifyRefsAI(text)
      // 디코드 후 링크 생성 - 조문 링크가 생성되었는지 확인
      expect(result).toContain('data-article="제38조"')
    })

    it('aggressive 모드로 동작', () => {
      const escapedText = '관세법 제38조에 따라'
      const result = linkifyRefsAI(escapedText)
      expect(result).toContain('data-ref="law-article"')
    })

    it('생성된 링크 태그 보존', () => {
      const text = '관세법 제38조'
      const result = linkifyRefsAI(text)
      expect(result).toContain('<a ')
      expect(result).toContain('</a>')
    })
  })

  describe('접근성 - aria-label', () => {
    it('법령 참조 aria-label 포함', () => {
      const text = '「관세법」 제38조'
      const result = generateLinks(text, { mode: 'safe' })
      expect(result).toContain('aria-label=')
    })

    it('조문 이동 aria-label 포함', () => {
      const text = '제5조에 따라'
      const result = generateLinks(text, { mode: 'safe' })
      expect(result).toContain('aria-label=')
    })
  })

  describe('Edge Cases', () => {
    it('빈 문자열 처리', () => {
      const result = generateLinks('', { mode: 'safe' })
      expect(result).toBe('')
    })

    it('링크 대상 없는 텍스트', () => {
      const text = '일반적인 텍스트입니다.'
      const result = generateLinks(text, { mode: 'safe' })
      expect(result).toBe(text)
    })

    it('여러 법령 동시 처리', () => {
      const text = '「관세법」 제38조, 「도로법」 제10조'
      const result = generateLinks(text, { mode: 'safe' })
      const linkCount = (result.match(/<a /g) || []).length
      expect(linkCount).toBe(2)
    })

    it('특수문자 포함 법령명', () => {
      const text = '「부가가치세법」 제38조'
      const result = generateLinks(text, { mode: 'safe' })
      expect(result).toContain('data-law="부가가치세법"')
    })
  })
})
