/**
 * adminRuleToLawData — 행정규칙 본문 → 법령 뷰어용 변환
 *
 * 조문형식여부=N 인 고시(제N조 없이 □/ㅇ 문단으로만 구성)와 원문 이미지 참조를
 * 다루는 경로의 회귀 감시.
 */

import { describe, it, expect } from 'vitest'
import { parseAdminRuleContent, adminRuleToLawData } from '@/lib/admrul-parser'

const wrap = (body: string, name = '테스트 고시') => `<?xml version="1.0" encoding="UTF-8"?><AdmRulService>`
  + `<행정규칙기본정보><행정규칙일련번호>2100000000001</행정규칙일련번호>`
  + `<행정규칙명><![CDATA[${name}]]></행정규칙명><행정규칙종류>고시</행정규칙종류>`
  + `<발령일자>20260102</발령일자><행정규칙ID>99999</행정규칙ID><시행일자>20260102</시행일자>`
  + `</행정규칙기본정보>${body}</AdmRulService>`

describe('adminRuleToLawData', () => {
  it('조문형식 Y — 제N조를 조문코드로 변환', () => {
    const xml = wrap(
      '<조문내용><![CDATA[제1조(목적) 목적 조문.]]></조문내용>'
      + '<조문내용><![CDATA[제38조의2(가지조문) 가지 조문.]]></조문내용>'
    )
    const { meta, articles } = adminRuleToLawData(parseAdminRuleContent(xml)!)

    expect(meta.lawType).toBe('고시')
    expect(articles).toHaveLength(2)
    expect(articles[0]).toMatchObject({ jo: '000100', joNum: '제1조', title: '목적' })
    expect(articles[1]).toMatchObject({ jo: '003802', joNum: '제38조의2' })
  })

  it('조문형식 N — 본문 전체를 단일 항목으로 (빈 화면 방지)', () => {
    const xml = wrap('<조문내용><![CDATA[□ 목 적\n ㅇ 이 고시는 … 하기 위함]]></조문내용>')
    const { articles } = adminRuleToLawData(parseAdminRuleContent(xml)!)

    expect(articles).toHaveLength(1)
    expect(articles[0].content).toContain('□ 목 적')
  })

  it('조문형식 N 폴백은 없는 조문번호("제0조")를 만들지 않는다', () => {
    const xml = wrap('<조문내용><![CDATA[□ 목 적\n ㅇ 본문]]></조문내용>')
    const { articles } = adminRuleToLawData(parseAdminRuleContent(xml)!)

    // jo가 6자리 숫자면 formatSimpleJo가 "제0조"로 풀어낸다 → 코드가 아닌 라벨이어야 한다
    expect(articles[0].jo).not.toMatch(/^\d{6}$/)
    expect(articles[0].joNum).toBe('본문')
  })

  it('원문 이미지 참조는 자리표시로 바꾸고 </img> 를 본문에 남기지 않는다', () => {
    const xml = wrap('<조문내용><![CDATA[제1조(목적) 인정품목\n\n<img id="158658713">\n</img>\n\n끝.]]></조문내용>')
    const { articles } = adminRuleToLawData(parseAdminRuleContent(xml)!)

    expect(articles[0].content).not.toContain('</img>')
    expect(articles[0].content).not.toContain('<img')
    expect(articles[0].content).toContain('[그림]')
  })
})
