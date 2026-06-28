import { describe, expect, it } from 'vitest'
import { diffLines } from '@/lib/text-line-diff'

describe('diffLines — 결정론 라인 diff', () => {
  it('동일 텍스트는 변경 0', () => {
    const r = diffLines('제1조 목적\n제2조 정의', '제1조 목적\n제2조 정의')
    expect(r.added).toBe(0)
    expect(r.removed).toBe(0)
    expect(r.ops.every((o) => o.type === 'same')).toBe(true)
  })

  it('라인 수정은 del + add 로 표현', () => {
    const r = diffLines('제3조 과태료 100만원 이하', '제3조 과태료 300만원 이하')
    expect(r.removed).toBe(1)
    expect(r.added).toBe(1)
    expect(r.ops.find((o) => o.type === 'del')?.text).toContain('100만원')
    expect(r.ops.find((o) => o.type === 'add')?.text).toContain('300만원')
  })

  it('신설 라인은 add, 유지 라인은 same', () => {
    const r = diffLines('제1조 목적', '제1조 목적\n제1조의2 적용범위')
    expect(r.added).toBe(1)
    expect(r.removed).toBe(0)
    expect(r.ops.filter((o) => o.type === 'same')).toHaveLength(1)
  })

  it('<P> 문단 마커·태그를 정규화하고 공백만 다른 건 동일 취급', () => {
    const r = diffLines('<P>제1조  목적</P>', '제1조 목적')
    expect(r.added).toBe(0)
    expect(r.removed).toBe(0)
  })

  it('결정론적 — 동일 입력 동일 출력', () => {
    const a = '제1조 목적\n제2조 정의\n제3조 적용'
    const b = '제1조 목적\n제2조 정의 신규\n제3조 적용'
    expect(diffLines(a, b)).toEqual(diffLines(a, b))
  })
})
