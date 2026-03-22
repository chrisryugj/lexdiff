import { describe, it, expect } from 'vitest'
import { extractRelationsFromThreeTier } from '@/lib/relation-graph/extractors/three-tier-extractor'
import type { ThreeTierData } from '@/lib/law-types'

function makeThreeTierData(overrides: Partial<ThreeTierData> = {}): ThreeTierData {
  return {
    meta: {
      lawId: 'MST_100000',
      lawName: '관세법',
      lawSummary: '',
      sihyungryungId: 'MST_200000',
      sihyungryungName: '관세법 시행령',
      sihyungkyuchikId: 'MST_300000',
      sihyungkyuchikName: '관세법 시행규칙',
      exists: true,
      basis: 'L',
    },
    articles: [],
    kndType: '위임조문',
    ...overrides,
  }
}

describe('extractRelationsFromThreeTier', () => {
  it('위임조문 1건 → delegates 엣지 1개', () => {
    const data = makeThreeTierData({
      articles: [{
        jo: '003800', joNum: '제38조', content: '관세의 과세가격은...', title: '과세가격',
        delegations: [{
          type: '시행령', lawName: '관세법 시행령', jo: '002500', joNum: '제25조',
          title: '과세가격 결정방법', content: '법 제30조에 따른...',
        }],
        citations: [],
      }],
    })

    const result = extractRelationsFromThreeTier('MST_100000', '관세법', data)

    expect(result.edges).toHaveLength(1)
    expect(result.edges[0]).toMatchObject({
      from_id: 'MST_100000',
      to_id: 'MST_200000',
      relation: 'delegates',
      from_article: '003800',
      to_article: '002500',
    })
  })

  it('시행령 + 시행규칙 → 각각 별도 엣지', () => {
    const data = makeThreeTierData({
      articles: [{
        jo: '001000', joNum: '제10조', content: '', title: '',
        delegations: [
          { type: '시행령', lawName: '관세법 시행령', jo: '000500', joNum: '제5조', content: '' },
          { type: '시행규칙', lawName: '관세법 시행규칙', jo: '000300', joNum: '제3조', content: '' },
        ],
        citations: [],
      }],
    })

    const result = extractRelationsFromThreeTier('MST_100000', '관세법', data)

    expect(result.edges).toHaveLength(2)
    expect(result.edges[0].relation).toBe('delegates')
    expect(result.edges[0].to_id).toBe('MST_200000') // 시행령
    expect(result.edges[1].relation).toBe('delegates')
    expect(result.edges[1].to_id).toBe('MST_300000') // 시행규칙
  })

  it('행정규칙 → implements 엣지', () => {
    const data = makeThreeTierData({
      articles: [{
        jo: '002000', joNum: '제20조', content: '', title: '',
        delegations: [{
          type: '행정규칙', lawName: '관세청 고시 제2024-15호',
          content: '관세의 납부방법에 관한 사항',
        }],
        citations: [],
      }],
    })

    const result = extractRelationsFromThreeTier('MST_100000', '관세법', data)

    expect(result.edges).toHaveLength(1)
    expect(result.edges[0].relation).toBe('implements')
    expect(result.edges[0].to_id).toBe('name:관세청 고시 제2024-15호')
  })

  it('빈 delegations → 엣지 0개', () => {
    const data = makeThreeTierData({
      articles: [{
        jo: '001000', joNum: '제10조', content: '', title: '',
        delegations: [],
        citations: [],
      }],
    })

    const result = extractRelationsFromThreeTier('MST_100000', '관세법', data)

    expect(result.edges).toHaveLength(0)
    // 소스 + 메타 노드는 여전히 생성
    expect(result.nodes.length).toBeGreaterThanOrEqual(1)
  })

  it('lawName 없는 DelegationItem → 스킵', () => {
    const data = makeThreeTierData({
      articles: [{
        jo: '001000', joNum: '제10조', content: '', title: '',
        delegations: [{
          type: '시행령', content: '내용만 있고 법령명 없음',
        }],
        citations: [],
      }],
    })

    const result = extractRelationsFromThreeTier('MST_100000', '관세법', data)
    expect(result.edges).toHaveLength(0)
  })

  it('소스 법령 + 메타 시행령/시행규칙 노드가 생성된다', () => {
    const data = makeThreeTierData()

    const result = extractRelationsFromThreeTier('MST_100000', '관세법', data)

    const nodeIds = result.nodes.map(n => n.id)
    expect(nodeIds).toContain('MST_100000')
    expect(nodeIds).toContain('MST_200000')
    expect(nodeIds).toContain('MST_300000')
  })

  it('같은 조문에서 같은 대상으로 중복 엣지 방지', () => {
    const data = makeThreeTierData({
      articles: [{
        jo: '003800', joNum: '제38조', content: '', title: '',
        delegations: [
          { type: '시행령', lawName: '관세법 시행령', jo: '002500', joNum: '제25조', content: 'A' },
          { type: '시행령', lawName: '관세법 시행령', jo: '002500', joNum: '제25조', content: 'B' },
        ],
        citations: [],
      }],
    })

    const result = extractRelationsFromThreeTier('MST_100000', '관세법', data)
    expect(result.edges).toHaveLength(1) // 중복 제거
  })
})
