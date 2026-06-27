/**
 * quality-evaluator 현행성 백스톱 테스트.
 *
 * 회귀 방지 대상 (현행성 누수 감사 LEAK-1 / LP-5):
 *  - 도구 결과에 연혁/시행예정/구법령명 위험 마커가 있는데 답변이 현행성을 전혀
 *    언급하지 않으면 marginal 이하로 강등 + 경고(→ answer-cache 저장 차단).
 *  - 정상(현행) 조회·현행성 언급 답변은 강등하지 않음(거짓양성 방지).
 */

import { describe, expect, test } from 'vitest'
import { evaluateResponseQuality } from '@/lib/fc-rag/quality-evaluator'
import type { ToolCallResult } from '@/lib/fc-rag/tool-adapter'

function tool(name: string, result: string, isError = false): ToolCallResult {
  return { name, result, isError, args: {} }
}

// 도구·인용 점수를 충분히 확보해 백스톱이 없으면 pass(>=55) 가 되도록 구성한 베이스.
const STRONG_TOOLS = [
  tool('search_law', '총 1건\n[현행] 도로교통법 ...'.padEnd(200, '.')),
  tool('get_batch_articles', '도로교통법\n제44조(음주운전 금지) ...'.padEnd(200, '.')),
]
const STRONG_ANSWER = '## 결론\n「도로교통법」 제44조에 따라 ... 「도로교통법」 제148조의2 ...'

describe('evaluateResponseQuality — 현행성 백스톱', () => {
  test('연혁 마커가 도구결과에 있는데 답변이 현행성 미언급 → marginal 이하 + 경고', () => {
    const toolResults = [
      ...STRONG_TOOLS,
      tool('get_historical_law', '⚠️[연혁-과거버전] 아래는 과거 시점 법령 본문임\n개인정보보호법 제29조 ...'),
    ]
    // 답변이 시행일/현행/연혁 등을 일절 언급 안 함
    const answer = '## 결론\n「개인정보보호법」 제29조에 따라 안전조치 의무가 있음. 「개인정보보호법」 제29조 ...'
    const r = evaluateResponseQuality(toolResults, answer)
    expect(r.level).not.toBe('pass')
    expect(r.warnings.some(w => w.includes('현행성'))).toBe(true)
  })

  test('efYd 시행일자 경고 마커 + 현행성 미언급 → 강등', () => {
    const toolResults = [
      ...STRONG_TOOLS,
      tool('get_batch_articles', '⚠️ 특정 시행일자(efYd=20190101) 버전 조회 — 현행 법령이 아닐 수 있음.\n도로교통법\n제44조 ...'),
    ]
    const answer = '## 결론\n「도로교통법」 제44조 위반 시 처벌됨. 「도로교통법」 제44조 ...'
    const r = evaluateResponseQuality(toolResults, answer)
    expect(r.level).not.toBe('pass')
    expect(r.warnings.some(w => w.includes('현행성'))).toBe(true)
  })

  test('연혁 마커가 있어도 답변이 현행성을 명시하면 강등 안 함 (거짓양성 방지)', () => {
    const toolResults = [
      ...STRONG_TOOLS,
      tool('get_historical_law', '⚠️[연혁-과거버전] 아래는 과거 시점 법령 본문임\n개인정보보호법 제29조 ...'),
    ]
    // 답변이 연혁/시행일을 명시 → ACK
    const answer = '## 결론\n질문하신 시점은 연혁(개정 전) 기준임. 현행 「개인정보보호법」 제29조의 시행일은 ... '
    const r = evaluateResponseQuality(toolResults, answer)
    expect(r.warnings.some(w => w.includes('현행성 라벨 미반영'))).toBe(false)
  })

  test('정상 현행 조회(위험 마커 없음)는 백스톱 미발동 + pass 유지', () => {
    const answer = STRONG_ANSWER
    const r = evaluateResponseQuality(STRONG_TOOLS, answer)
    expect(r.warnings.some(w => w.includes('현행성 라벨 미반영'))).toBe(false)
    expect(r.level).toBe('pass')
  })

  test("정상 조회에 항상 붙는 'ℹ️ 조회기준일'은 위험 마커가 아님 (거짓양성 방지)", () => {
    const toolResults = [
      ...STRONG_TOOLS,
      tool('get_law_text', 'ℹ️ 조회기준일 2026-06-27 현재 [현행]\n주택임대차보호법 제7조 ...'),
    ]
    const r = evaluateResponseQuality(toolResults, STRONG_ANSWER)
    expect(r.warnings.some(w => w.includes('현행성 라벨 미반영'))).toBe(false)
  })
})
