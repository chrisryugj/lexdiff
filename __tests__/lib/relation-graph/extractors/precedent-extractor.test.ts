import { describe, it, expect } from 'vitest'
import { extractRelationsFromPrecedents } from '@/lib/relation-graph/extractors/precedent-extractor'
import type { PrecedentSearchResult } from '@/lib/precedent-parser'

function makePrecedent(overrides: Partial<PrecedentSearchResult> = {}): PrecedentSearchResult {
  return {
    id: '12345',
    name: '관세 과세가격 사건',
    caseNumber: '2023두1234',
    court: '대법원',
    date: '20230615',
    type: '판결',
    link: '',
    ...overrides,
  }
}

describe('extractRelationsFromPrecedents', () => {
  it('판례 검색 결과 → interprets 엣지 생성', () => {
    const precedents = [makePrecedent()]

    const result = extractRelationsFromPrecedents(
      'MST_100000', '관세법', '003800', precedents,
    )

    expect(result.edges).toHaveLength(1)
    expect(result.edges[0]).toMatchObject({
      from_id: 'prec:12345',
      to_id: 'MST_100000',
      relation: 'interprets',
      to_article: '003800',
    })
  })

  it('판례 노드가 생성된다', () => {
    const result = extractRelationsFromPrecedents(
      'MST_100000', '관세법', '003800', [makePrecedent()],
    )

    const precNode = result.nodes.find(n => n.id === 'prec:12345')
    expect(precNode).toBeDefined()
    expect(precNode!.type).toBe('precedent')
    expect(precNode!.title).toBe('관세 과세가격 사건')
  })

  it('법령 노드도 함께 생성된다', () => {
    const result = extractRelationsFromPrecedents(
      'MST_100000', '관세법', '003800', [makePrecedent()],
    )

    const lawNode = result.nodes.find(n => n.id === 'MST_100000')
    expect(lawNode).toBeDefined()
    expect(lawNode!.type).toBe('law')
  })

  it('여러 판례 → 각각 별도 엣지', () => {
    const precedents = [
      makePrecedent({ id: '111', caseNumber: '2023두111' }),
      makePrecedent({ id: '222', caseNumber: '2023두222' }),
      makePrecedent({ id: '333', caseNumber: '2023두333' }),
    ]

    const result = extractRelationsFromPrecedents(
      'MST_100000', '관세법', '003800', precedents,
    )

    expect(result.edges).toHaveLength(3)
    expect(result.nodes).toHaveLength(4) // 1 법령 + 3 판례
  })

  it('빈 판례 배열 → 법령 노드만 생성, 엣지 없음', () => {
    const result = extractRelationsFromPrecedents(
      'MST_100000', '관세법', '003800', [],
    )

    expect(result.edges).toHaveLength(0)
    expect(result.nodes).toHaveLength(1) // 법령 노드만
  })

  it('id 없는 판례 → 스킵', () => {
    const result = extractRelationsFromPrecedents(
      'MST_100000', '관세법', '003800',
      [makePrecedent({ id: '' })],
    )

    expect(result.edges).toHaveLength(0)
  })

  it('중복 판례 ID → 디딥', () => {
    const result = extractRelationsFromPrecedents(
      'MST_100000', '관세법', '003800',
      [makePrecedent({ id: '111' }), makePrecedent({ id: '111' })],
    )

    expect(result.edges).toHaveLength(1)
  })

  it('metadata에 판례 정보가 포함된다', () => {
    const result = extractRelationsFromPrecedents(
      'MST_100000', '관세법', '003800',
      [makePrecedent({ caseNumber: '2023두1234', court: '대법원' })],
    )

    expect(result.edges[0].metadata).toMatchObject({
      caseNumber: '2023두1234',
      court: '대법원',
    })
  })
})
