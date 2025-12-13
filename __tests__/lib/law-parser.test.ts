import { describe, it, expect } from 'vitest'
import { buildJO, formatJO, formatSimpleJo, normalizeArticle, parseSearchQuery, parseRelatedLawTitle, extractRelatedLaws } from '../../lib/law-parser'

describe('law-parser', () => {
  describe('buildJO - 조문번호 → 6자리 JO 코드 변환', () => {
    it('기본 조문 번호 변환 (38조 → 003800)', () => {
      expect(buildJO('38조')).toBe('003800')
    })

    it('제 접두사 포함 (제38조 → 003800)', () => {
      expect(buildJO('제38조')).toBe('003800')
    })

    it('가지 조문 변환 (10조의2 → 001002)', () => {
      expect(buildJO('10조의2')).toBe('001002')
    })

    it('제 접두사 + 가지 조문 (제10조의2 → 001002)', () => {
      expect(buildJO('제10조의2')).toBe('001002')
    })

    it('1자리 조문 (제5조 → 000500)', () => {
      expect(buildJO('제5조')).toBe('000500')
    })

    it('3자리 조문 (제123조 → 012300)', () => {
      expect(buildJO('제123조')).toBe('012300')
    })

    it('4자리 조문 (제1234조 → 123400)', () => {
      expect(buildJO('제1234조')).toBe('123400')
    })

    it('숫자만 입력 (38 → 003800)', () => {
      expect(buildJO('38')).toBe('003800')
    })

    it('하이픈 구분자 지원 (10조-2 → 001002)', () => {
      expect(buildJO('10조-2')).toBe('001002')
    })

    it('항/호 정보 무시 (제38조제1항 → 003800)', () => {
      expect(buildJO('제38조제1항')).toBe('003800')
    })

    it('공백 제거 (제 38 조 → 003800)', () => {
      expect(buildJO('제 38 조')).toBe('003800')
    })

    it('잘못된 입력 시 에러 발생', () => {
      expect(() => buildJO('abc')).toThrow()
    })
  })

  describe('formatJO - 6자리 JO 코드 → 조문번호 변환', () => {
    it('기본 조문 (003800 → 제38조)', () => {
      expect(formatJO('003800')).toBe('제38조')
    })

    it('가지 조문 (001002 → 제10조의2)', () => {
      expect(formatJO('001002')).toBe('제10조의2')
    })

    it('1자리 조문 (000500 → 제5조)', () => {
      expect(formatJO('000500')).toBe('제5조')
    })

    it('이미 포맷된 경우 그대로 반환', () => {
      expect(formatJO('제38조')).toBe('제38조')
    })

    it('짧은 형식 지원 (38 → 제38조)', () => {
      expect(formatJO('38')).toBe('제38조')
    })

    it('빈 문자열 처리', () => {
      expect(formatJO('')).toBe('')
    })

    it('4자리 조문 (123400 → 제1234조)', () => {
      expect(formatJO('123400')).toBe('제1234조')
    })
  })

  describe('formatSimpleJo - 법령/조례 JO 코드 변환', () => {
    it('법령 기본 조문 (003800 → 제38조)', () => {
      expect(formatSimpleJo('003800', false)).toBe('제38조')
    })

    it('법령 가지 조문 (001002 → 제10조의2)', () => {
      expect(formatSimpleJo('001002', false)).toBe('제10조의2')
    })

    it('조례 기본 조문 (010000 → 제1조)', () => {
      expect(formatSimpleJo('010000', true)).toBe('제1조')
    })

    it('조례 가지 조문 (010100 → 제1조의1)', () => {
      expect(formatSimpleJo('010100', true)).toBe('제1조의1')
    })

    it('조례 서브넘버 포함 (010102 → 제1조의1-2)', () => {
      expect(formatSimpleJo('010102', true)).toBe('제1조의1-2')
    })

    it('8자리 코드 지원 (00380000 → 제38조)', () => {
      expect(formatSimpleJo('00380000')).toBe('제38조')
    })

    it('8자리 가지 조문 (00100200 → 제10조의2)', () => {
      expect(formatSimpleJo('00100200')).toBe('제10조의2')
    })

    it('이미 포맷된 경우 그대로 반환', () => {
      expect(formatSimpleJo('제38조')).toBe('제38조')
    })
  })

  describe('normalizeArticle - 조문번호 정규화', () => {
    it('38조 → 제38조', () => {
      expect(normalizeArticle('38조')).toBe('제38조')
    })

    it('10조의2 → 제10조의2', () => {
      expect(normalizeArticle('10조의2')).toBe('제10조의2')
    })

    it('제5조 → 제5조 (이미 정규화)', () => {
      expect(normalizeArticle('제5조')).toBe('제5조')
    })

    it('숫자만 (38 → 제38조)', () => {
      expect(normalizeArticle('38')).toBe('제38조')
    })
  })

  describe('parseSearchQuery - 검색어 파싱', () => {
    it('법령명만 입력', () => {
      const result = parseSearchQuery('관세법')
      expect(result.lawName).toBe('관세법')
      expect(result.article).toBeUndefined()
    })

    it('법령명 + 조문번호', () => {
      const result = parseSearchQuery('관세법 38조')
      expect(result.lawName).toBe('관세법')
      expect(result.article).toBe('제38조')
      expect(result.jo).toBe('003800')
    })

    it('법령명 + 제조문번호', () => {
      const result = parseSearchQuery('관세법 제38조')
      expect(result.lawName).toBe('관세법')
      expect(result.article).toBe('제38조')
      expect(result.jo).toBe('003800')
    })

    it('법령명 + 가지 조문', () => {
      const result = parseSearchQuery('관세법 제10조의2')
      expect(result.lawName).toBe('관세법')
      expect(result.article).toBe('제10조의2')
      expect(result.jo).toBe('001002')
    })

    it('항 정보 추출', () => {
      const result = parseSearchQuery('관세법 제38조제1항')
      expect(result.lawName).toBe('관세법')
      expect(result.article).toBe('제38조')
      expect(result.clause).toBe('1')
    })

    it('호 정보 추출', () => {
      const result = parseSearchQuery('관세법 제38조제1항제2호')
      expect(result.lawName).toBe('관세법')
      expect(result.clause).toBe('1')
      expect(result.item).toBe('2')
    })

    it('시행령 법령명', () => {
      const result = parseSearchQuery('관세법 시행령 제55조')
      expect(result.lawName).toBe('관세법 시행령')
      expect(result.article).toBe('제55조')
    })

    it('공백 없는 입력 (행정법2조)', () => {
      const result = parseSearchQuery('행정법2조')
      expect(result.lawName).toBe('행정법')
      expect(result.article).toBe('제2조')
    })
  })

  describe('parseRelatedLawTitle - 관련법령 제목 파싱', () => {
    it('기본 패턴 파싱', () => {
      const result = parseRelatedLawTitle('관세법 제38조 (신고납부)')
      expect(result).not.toBeNull()
      expect(result?.lawName).toBe('관세법')
      expect(result?.article).toBe('제38조')
      expect(result?.title).toBe('(신고납부)')
      expect(result?.jo).toBe('003800')
    })

    it('가지 조문 파싱', () => {
      const result = parseRelatedLawTitle('도로법 제10조의2 (도로 관리)')
      expect(result).not.toBeNull()
      expect(result?.lawName).toBe('도로법')
      expect(result?.article).toBe('제10조의2')
      expect(result?.jo).toBe('001002')
    })

    it('마크다운 볼드 제거', () => {
      const result = parseRelatedLawTitle('**관세법 제38조 (신고납부)**')
      expect(result).not.toBeNull()
      expect(result?.lawName).toBe('관세법')
    })

    it('이모지 제거', () => {
      const result = parseRelatedLawTitle('📜 관세법 제38조 (신고납부)')
      expect(result).not.toBeNull()
      expect(result?.lawName).toBe('관세법')
    })

    it('시행령 파싱', () => {
      const result = parseRelatedLawTitle('관세법 시행령 제55조 (세율)')
      expect(result).not.toBeNull()
      expect(result?.lawName).toBe('관세법 시행령')
    })

    it('잘못된 형식 시 null 반환', () => {
      const result = parseRelatedLawTitle('단순 텍스트')
      expect(result).toBeNull()
    })

    it('source 타입 지정', () => {
      const result = parseRelatedLawTitle('관세법 제38조 (신고납부)', 'excerpt')
      expect(result?.source).toBe('excerpt')
    })
  })

  describe('extractRelatedLaws - 마크다운에서 법령 추출', () => {
    it('발췌조문 헤더 추출', () => {
      const markdown = `**📜 관세법 제38조 (신고납부)**
관세를 납부하여야 한다.`
      const laws = extractRelatedLaws(markdown)
      expect(laws.length).toBeGreaterThanOrEqual(1)
      expect(laws.some(l => l.lawName === '관세법' && l.source === 'excerpt')).toBe(true)
    })

    it('「」 인용 괄호 패턴 추출', () => {
      const markdown = `「관세법」 제38조에 따라 신고납부합니다.`
      const laws = extractRelatedLaws(markdown)
      expect(laws.some(l => l.lawName === '관세법')).toBe(true)
    })

    it('가지 조문 인용 추출', () => {
      const markdown = `「도로법」 제10조의2에 따른 규정`
      const laws = extractRelatedLaws(markdown)
      // 정규식 패턴이 제N조의M 형식을 인식하는지 확인
      expect(laws.some(l => l.lawName === '도로법')).toBe(true)
    })

    it('중복 제거 안함 (source별 그룹화)', () => {
      const markdown = `**📜 관세법 제38조 (신고납부)**
내용입니다.

🔗 관련 법령
- 📜 관세법 제38조`
      const laws = extractRelatedLaws(markdown)
      // 같은 법령이 excerpt와 related 둘 다 있을 수 있음
      const sameLaws = laws.filter(l => l.lawName === '관세법' && l.article === '제38조')
      expect(sameLaws.length).toBeGreaterThanOrEqual(1)
    })

    it('인용 괄호 없는 법령명 추출', () => {
      const markdown = `관세법 제38조를 적용합니다.`
      const laws = extractRelatedLaws(markdown)
      expect(laws.some(l => l.lawName === '관세법')).toBe(true)
    })

    it('시행령/시행규칙 구분', () => {
      const markdown = `「관세법 시행령」 제55조 및 「관세법 시행규칙」 제10조`
      const laws = extractRelatedLaws(markdown)
      expect(laws.some(l => l.lawName === '관세법 시행령')).toBe(true)
      expect(laws.some(l => l.lawName === '관세법 시행규칙')).toBe(true)
    })
  })
})
