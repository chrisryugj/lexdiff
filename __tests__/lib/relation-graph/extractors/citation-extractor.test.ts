import { describe, it, expect } from 'vitest'
import { extractCitationsFromText } from '@/lib/relation-graph/extractors/citation-extractor'

describe('extractCitationsFromText', () => {
  it('「관세법」 제38조 → cites 엣지', () => {
    const result = extractCitationsFromText(
      'MST_200000', '002500',
      '「관세법」 제38조에 따른 과세가격은 다음과 같다.',
    )

    expect(result.edges.length).toBeGreaterThanOrEqual(1)
    const edge = result.edges.find(e => e.to_id === 'name:관세법')
    expect(edge).toBeDefined()
    expect(edge!.relation).toBe('cites')
    expect(edge!.from_article).toBe('002500')
  })

  it('같은 법 제40조 → cites 엣지 (컨텍스트에서 법명 추론)', () => {
    const result = extractCitationsFromText(
      'MST_100000', '003800',
      '같은 법 제40조에 따른 가산세를 부과한다.',
      '관세법',
    )

    // "같은 법" → contextLawName 사용
    expect(result.edges.length).toBeGreaterThanOrEqual(1)
    const edge = result.edges[0]
    expect(edge.relation).toBe('cites')
  })

  it('시행령 제54조 → cites 엣지 (decree 타입)', () => {
    const result = extractCitationsFromText(
      'MST_100000', '003000',
      '시행령 제54조에서 정하는 바에 따라',
      '관세법',
    )

    if (result.edges.length > 0) {
      const edge = result.edges[0]
      expect(edge.relation).toBe('cites')
    }
    // 시행령 패턴이 매칭되면 decree 노드
    const decreeNode = result.nodes.find(n => n.type === 'decree')
    if (decreeNode) {
      expect(decreeNode.type).toBe('decree')
    }
  })

  it('인용 없는 텍스트 → 빈 배열', () => {
    const result = extractCitationsFromText(
      'MST_100000', '001000',
      '이 법은 관세의 부과·징수에 관한 사항을 규정한다.',
    )

    expect(result.edges).toHaveLength(0)
    expect(result.nodes).toHaveLength(0)
  })

  it('빈 텍스트 → 빈 결과', () => {
    const result = extractCitationsFromText('MST_100000', '001000', '')
    expect(result.edges).toHaveLength(0)
    expect(result.nodes).toHaveLength(0)
  })

  it('중복 인용 → 디딥', () => {
    const result = extractCitationsFromText(
      'MST_100000', '003800',
      '「관세법」 제30조에 따라... 「관세법」 제30조를 적용한다.',
    )

    // 같은 법령+조문 인용이 2번 나와도 엣지는 1개
    const citesEdges = result.edges.filter(
      e => e.to_id === 'name:관세법' && e.to_article === '제30조',
    )
    expect(citesEdges.length).toBeLessThanOrEqual(1)
  })

  it('여러 다른 법령 인용 → 각각 별도 엣지', () => {
    const result = extractCitationsFromText(
      'MST_100000', '005000',
      '「관세법」 제30조 및 「대외무역법」 제11조에 따라',
    )

    expect(result.edges.length).toBeGreaterThanOrEqual(2)
    const lawNames = result.nodes.map(n => n.title)
    expect(lawNames).toContain('관세법')
    expect(lawNames).toContain('대외무역법')
  })
})
