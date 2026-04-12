/**
 * C3: revision-parser 서버/클라이언트 공통 동작 테스트
 *
 * 목적: DOMParser 의존을 제거하고 fast-xml-parser 기반으로 재작성한 후
 * Node 런타임(vitest default env)에서 정상 파싱되는지 확인.
 */
import { describe, test, expect } from 'vitest'
import { parseArticleHistoryXML, parseRevisionHistoryXML } from '@/lib/revision-parser'

const ARTICLE_HISTORY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <law>
    <법령정보>
      <공포일자>20200101</공포일자>
      <공포번호>16930</공포번호>
      <제개정구분명>일부개정</제개정구분명>
      <시행일자>20200401</시행일자>
      <소관부처명>기획재정부</소관부처명>
      <법령구분명>법률</법령구분명>
    </법령정보>
    <조문정보>
      <변경사유>자구수정</변경사유>
      <조문링크>/abc/def</조문링크>
      <조문번호>38</조문번호>
    </조문정보>
  </law>
  <law>
    <법령정보>
      <공포일자>20190615</공포일자>
      <제개정구분명>전부개정</제개정구분명>
    </법령정보>
    <조문정보>
      <변경사유><![CDATA[용어 통일 — 「조사」 → 「검사」]]></변경사유>
    </조문정보>
  </law>
</response>`

const REVISION_HISTORY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<LawSearch>
  <law>
    <공포일자>20220915</공포일자>
    <공포번호>18923</공포번호>
    <제개정구분명>일부개정</제개정구분명>
    <시행일자>20230101</시행일자>
    <법령명_한글>관세법</법령명_한글>
  </law>
  <law>
    <공포일자>20210512</공포일자>
    <공포번호>18053</공포번호>
    <제개정구분명>타법개정</제개정구분명>
    <법령명_한글>관세법</법령명_한글>
  </law>
</LawSearch>`

const HTML_ERROR_PAGE = `<!DOCTYPE html><html><body>Error 500</body></html>`

describe('parseArticleHistoryXML (C3 서버 호환)', () => {
  test('정상 XML → 2건 파싱', () => {
    const result = parseArticleHistoryXML(ARTICLE_HISTORY_XML)
    expect(result).toHaveLength(2)
    expect(result[0].date).toBe('2020-01-01')
    expect(result[0].type).toBe('자구수정')
    expect(result[0].articleLink).toBe('https://www.law.go.kr/abc/def')
  })

  test('CDATA 포함 변경사유 처리', () => {
    const result = parseArticleHistoryXML(ARTICLE_HISTORY_XML)
    expect(result[1].type).toContain('용어 통일')
  })

  test('HTML 에러 페이지 → 빈 배열', () => {
    expect(parseArticleHistoryXML(HTML_ERROR_PAGE)).toEqual([])
  })

  test('빈 문자열 → 빈 배열 (throw 안 함)', () => {
    expect(parseArticleHistoryXML('')).toEqual([])
  })

  test('잘못된 XML → 빈 배열', () => {
    expect(parseArticleHistoryXML('<broken')).toEqual([])
  })
})

describe('parseRevisionHistoryXML (C3 서버 호환)', () => {
  test('LawSearch 래퍼 내부 law[] 파싱', () => {
    const result = parseRevisionHistoryXML(REVISION_HISTORY_XML)
    expect(result).toHaveLength(2)
    expect(result[0].promulgationDate).toBe('20220915')
    expect(result[0].promulgationNumber).toBe('18923')
    expect(result[0].revisionType).toBe('일부개정')
    expect(result[0].effectiveDate).toBe('20230101')
    expect(result[0].lawName).toBe('관세법')
  })

  test('alias (공포일자 vs 공포일) — 둘 중 하나만 있어도 추출', () => {
    const xml = `<?xml version="1.0"?><r><law><공포일>20200101</공포일><제개정구분>개정</제개정구분></law></r>`
    const result = parseRevisionHistoryXML(xml)
    expect(result).toHaveLength(1)
    expect(result[0].promulgationDate).toBe('20200101')
    expect(result[0].revisionType).toBe('개정')
  })

  test('HTML 에러 페이지 → 빈 배열', () => {
    expect(parseRevisionHistoryXML(HTML_ERROR_PAGE)).toEqual([])
  })
})
