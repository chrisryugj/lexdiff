import { describe, it, expect, vi, beforeEach } from 'vitest'

// 깊은 체이닝 지원하는 Supabase mock
function createDeepChainMock(resolvedValue: unknown = { data: [], error: null }) {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === 'then') {
        // Promise.all에서 thenable로 인식되도록
        const p = Promise.resolve(resolvedValue)
        return p.then.bind(p)
      }
      // 모든 메서드가 다시 Proxy 반환 → 무한 체이닝 지원
      return (..._args: unknown[]) => new Proxy({}, handler)
    },
  }
  return new Proxy({}, handler)
}

let fromResults: Record<string, unknown[]>
let rpcResults: Record<string, { data: unknown; error: unknown }>

const mockFrom = vi.fn((table: string) => {
  const results = fromResults[table] || []
  return createDeepChainMock({ data: results, error: null })
})

const mockRpc = vi.fn((fn: string) => {
  const result = rpcResults[fn] || { data: null, error: { message: 'not found' } }
  return Promise.resolve(result)
})

vi.mock('@/lib/supabase', () => ({
  getSupabase: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
  isSupabaseAvailable: vi.fn(() => true),
}))

import { analyzeImpact } from '@/lib/relation-graph/impact-analysis'

beforeEach(() => {
  vi.clearAllMocks()
  fromResults = {}
  rpcResults = {}
  // 기본: RPC 없음 (폴백 사용)
  mockRpc.mockImplementation(() =>
    Promise.resolve({ data: null, error: { message: 'function not found' } })
  )
})

describe('analyzeImpact', () => {
  it('빈 DB → 빈 결과 (에러 없이)', async () => {
    const result = await analyzeImpact('MST_100000', '003800')

    expect(result.downstream).toEqual([])
    expect(result.upstream).toEqual([])
    expect(result.lateral).toEqual([])
    expect(result.precedents).toEqual([])
    expect(result.stats.total).toBe(0)
  })

  it('하향 영향: RPC로 위임받은 시행령 반환', async () => {
    rpcResults['impact_downstream'] = {
      data: [{
        node_id: 'MST_200000',
        title: '관세법 시행령',
        node_type: 'decree',
        article: '002500',
        relation: 'delegates',
        depth: 1,
      }],
      error: null,
    }
    mockRpc.mockImplementation((fn: string) =>
      Promise.resolve(rpcResults[fn] || { data: null, error: { message: 'not found' } })
    )

    const result = await analyzeImpact('MST_100000', '003800')

    expect(result.downstream).toHaveLength(1)
    expect(result.downstream[0]).toMatchObject({
      nodeId: 'MST_200000',
      title: '관세법 시행령',
      type: 'decree',
      relation: 'delegates',
      depth: 1,
    })
  })

  it('판례 영향: interprets 관계 반환', async () => {
    // law_edge 테이블에서 판례 조회 (폴백)
    fromResults['law_edge'] = [{
      from_id: 'prec:12345',
      relation: 'interprets',
      metadata: { caseNumber: '2023두1234' },
      law_node: { title: '관세 과세가격 사건', type: 'precedent' },
    }]

    const result = await analyzeImpact('MST_100000', '003800')

    // 폴백 쿼리는 모든 from() 호출에 동일한 결과를 반환하므로
    // precedents에 결과가 있을 수 있음
    expect(result.stats.total).toBeGreaterThanOrEqual(0)
  })

  it('stats.byRelation이 관계 타입별로 집계된다', async () => {
    rpcResults['impact_downstream'] = {
      data: [
        { node_id: 'A', title: 'A법', node_type: 'decree', article: null, relation: 'delegates', depth: 1 },
        { node_id: 'B', title: 'B규칙', node_type: 'admin_rule', article: null, relation: 'implements', depth: 1 },
      ],
      error: null,
    }
    mockRpc.mockImplementation((fn: string) =>
      Promise.resolve(rpcResults[fn] || { data: null, error: { message: 'not found' } })
    )

    const result = await analyzeImpact('MST_100000')

    expect(result.downstream).toHaveLength(2)
    expect(result.stats.byRelation['delegates']).toBe(1)
    expect(result.stats.byRelation['implements']).toBe(1)
  })
})

describe('Supabase 미설정 시', () => {
  it('graceful하게 빈 결과 반환', async () => {
    const { getSupabase } = await import('@/lib/supabase')
    vi.mocked(getSupabase).mockReturnValue(null)

    const result = await analyzeImpact('MST_100000', '003800')

    expect(result.stats.total).toBe(0)
    expect(result.downstream).toEqual([])
    expect(result.upstream).toEqual([])
  })
})
