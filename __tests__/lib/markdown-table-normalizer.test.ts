import { describe, it, expect } from 'vitest'
import { normalizeMarkdownTable } from '@/lib/markdown-table-normalizer'

describe('normalizeMarkdownTable', () => {
  it('정상 표는 그대로 유지한다', () => {
    const table = [
      '| 비교 항목 | 서울 | 부산 |',
      '|---|---|---|',
      '| 지원 대상 | 전 시민 | 등록 장애인 |',
    ].join('\n')
    expect(normalizeMarkdownTable(table)).toBe(table)
  })

  it('구분행이 없으면 헤더 다음에 삽입한다', () => {
    const input = [
      '| 비교 항목 | 서울 | 부산 |',
      '| 지원 대상 | 전 시민 | 등록 장애인 |',
    ].join('\n')
    const out = normalizeMarkdownTable(input)
    const lines = out.split('\n')
    expect(lines[1]).toBe('|---|---|---|')
    expect(lines).toHaveLength(3)
  })

  it('셀 내부 개행으로 끊긴 행을 직전 행에 이어붙인다', () => {
    const input = [
      '| 비교 항목 | 서울 | 부산 |',
      '|---|---|---|',
      '| 지원 내용 | 월 10만원,',
      '교통비 별도 | 월 5만원 |',
    ].join('\n')
    const out = normalizeMarkdownTable(input)
    const lines = out.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[2]).toContain('월 10만원,')
    expect(lines[2]).toContain('교통비 별도')
  })

  it('코드펜스로 감싼 표를 벗겨낸다', () => {
    const input = '```markdown\n| a | b |\n|---|---|\n| 1 | 2 |\n```'
    const out = normalizeMarkdownTable(input)
    expect(out.startsWith('|')).toBe(true)
    expect(out).not.toContain('```')
  })

  it('열 개수가 부족한 행은 빈 셀로 패딩한다', () => {
    const input = [
      '| 비교 항목 | 서울 | 부산 |',
      '|---|---|---|',
      '| 벌칙 | 과태료 |',
    ].join('\n')
    const out = normalizeMarkdownTable(input)
    const lastRow = out.split('\n')[2]
    expect(lastRow.split('|').filter((_, i, a) => i > 0 && i < a.length - 1)).toHaveLength(3)
  })

  it('열 개수가 넘치는 행은 마지막 셀에 병합한다', () => {
    const input = [
      '| 비교 항목 | 서울 | 부산 |',
      '|---|---|---|',
      '| 대상 | 시민 | 구민 | 추가내용 |',
    ].join('\n')
    const out = normalizeMarkdownTable(input)
    const lastRow = out.split('\n')[2]
    const cells = lastRow.split('|').map((c) => c.trim()).filter(Boolean)
    expect(cells).toHaveLength(3)
    expect(cells[2]).toBe('구민 / 추가내용')
  })

  it('표가 없는 텍스트는 그대로 반환한다', () => {
    expect(normalizeMarkdownTable('그냥 텍스트')).toBe('그냥 텍스트')
    expect(normalizeMarkdownTable('')).toBe('')
  })

  it('표 앞뒤 텍스트를 보존한다', () => {
    const input = ['요약 문장.', '| a | b |', '| 1 | 2 |', '끝 문장.'].join('\n')
    const out = normalizeMarkdownTable(input)
    expect(out).toContain('요약 문장.')
    expect(out).toContain('끝 문장.')
    expect(out.split('\n')[2]).toBe('|---|---|')
  })
})
