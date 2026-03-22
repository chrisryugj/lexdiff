import { describe, it, expect, vi, beforeEach } from 'vitest'

// Supabase 클라이언트 mock
const mockSelect = vi.fn()
const mockSingle = vi.fn()
const mockUpsert = vi.fn()
const mockDelete = vi.fn()
const mockEq = vi.fn()
const mockOr = vi.fn()

function createChainMock() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    select: mockSelect,
    single: mockSingle,
    upsert: mockUpsert,
    delete: mockDelete,
    eq: mockEq,
    or: mockOr,
  }
  // 각 메서드가 chain 자신을 반환하도록
  for (const fn of Object.values(chain)) {
    fn.mockReturnValue(chain)
  }
  return chain
}

const mockChain = createChainMock()
const mockFrom = vi.fn().mockReturnValue(mockChain)

vi.mock('@/lib/supabase', () => ({
  getSupabase: vi.fn(() => ({ from: mockFrom })),
  isSupabaseAvailable: vi.fn(() => true),
}))

import {
  upsertNode, getNodeById, deleteNode,
  upsertEdge, bulkUpsertEdges, getEdgesFrom, getEdgesTo,
  storeExtractionResult,
} from '@/lib/relation-graph/relation-db'

beforeEach(() => {
  vi.clearAllMocks()
  // 기본 chain 재설정
  for (const fn of Object.values(mockChain)) {
    fn.mockReturnValue(mockChain)
  }
})

describe('upsertNode', () => {
  it('노드를 upsert하고 결과를 반환한다', async () => {
    const mockNode = {
      id: 'MST_100000', title: '관세법', type: 'law', status: 'active',
      effective_date: null, created_at: '2026-01-01', updated_at: '2026-01-01',
    }
    mockSingle.mockResolvedValueOnce({ data: mockNode, error: null })

    const result = await upsertNode({
      id: 'MST_100000', title: '관세법', type: 'law',
    })

    expect(result).toEqual(mockNode)
    expect(mockFrom).toHaveBeenCalledWith('law_node')
    expect(mockUpsert).toHaveBeenCalled()
  })

  it('에러 시 null 반환 (크래시 없음)', async () => {
    mockSingle.mockResolvedValueOnce({
      data: null, error: { message: 'test error' },
    })

    const result = await upsertNode({
      id: 'MST_X', title: 'test', type: 'law',
    })

    expect(result).toBeNull()
  })
})

describe('getNodeById', () => {
  it('ID로 노드를 조회한다', async () => {
    const mockNode = { id: 'MST_100000', title: '관세법', type: 'law' }
    mockSingle.mockResolvedValueOnce({ data: mockNode, error: null })

    const result = await getNodeById('MST_100000')
    expect(result).toEqual(mockNode)
  })

  it('없는 노드는 null 반환', async () => {
    mockSingle.mockResolvedValueOnce({
      data: null, error: { message: 'not found' },
    })

    const result = await getNodeById('NONEXIST')
    expect(result).toBeNull()
  })
})

describe('deleteNode', () => {
  it('노드와 연관 엣지를 삭제한다', async () => {
    // 엣지 삭제 → 노드 삭제
    mockOr.mockResolvedValueOnce({ error: null })
    mockEq.mockResolvedValueOnce({ error: null })

    const result = await deleteNode('MST_100000')
    expect(result).toBe(true)
    expect(mockFrom).toHaveBeenCalledWith('law_edge') // 엣지 먼저
    expect(mockFrom).toHaveBeenCalledWith('law_node') // 노드 삭제
  })
})

describe('upsertEdge', () => {
  it('엣지를 upsert한다', async () => {
    const mockEdge = {
      id: 1, from_id: 'A', to_id: 'B', relation: 'delegates',
      from_article: '003800', to_article: '002500',
      metadata: {}, created_at: '', updated_at: '',
    }
    mockSingle.mockResolvedValueOnce({ data: mockEdge, error: null })

    const result = await upsertEdge({
      from_id: 'A', to_id: 'B', relation: 'delegates',
      from_article: '003800', to_article: '002500',
    })

    expect(result).toEqual(mockEdge)
  })

  it('nullable 필드를 null로 채운다', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 2 }, error: null })

    await upsertEdge({
      from_id: 'A', to_id: 'B', relation: 'cites',
    })

    // upsert 호출 시 from_article, to_article이 null로 채워져야 함
    const upsertCall = mockUpsert.mock.calls[0][0]
    expect(upsertCall.from_article).toBeNull()
    expect(upsertCall.to_article).toBeNull()
    expect(upsertCall.metadata).toEqual({})
  })
})

describe('bulkUpsertEdges', () => {
  it('빈 배열이면 0 반환', async () => {
    const result = await bulkUpsertEdges([])
    expect(result).toBe(0)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('여러 엣지를 한번에 upsert한다', async () => {
    mockUpsert.mockReturnValueOnce(
      Promise.resolve({ error: null, count: 3 })
    )

    const result = await bulkUpsertEdges([
      { from_id: 'A', to_id: 'B', relation: 'delegates' },
      { from_id: 'A', to_id: 'C', relation: 'delegates' },
      { from_id: 'B', to_id: 'D', relation: 'implements' },
    ])

    expect(result).toBe(3)
  })
})

describe('getEdgesFrom', () => {
  it('특정 노드에서 나가는 엣지를 조회한다', async () => {
    const mockEdges = [
      { id: 1, from_id: 'A', to_id: 'B', relation: 'delegates' },
    ]
    mockEq.mockResolvedValueOnce({ data: mockEdges, error: null })

    const result = await getEdgesFrom('A')
    expect(result).toEqual(mockEdges)
  })

  it('article 필터를 적용한다', async () => {
    // eq chain: 첫 번째는 chain 반환, 마지막은 결과 반환
    mockEq
      .mockReturnValueOnce(mockChain)           // from_id
      .mockResolvedValueOnce({ data: [], error: null }) // from_article (terminal)

    await getEdgesFrom('A', '003800')
    expect(mockEq).toHaveBeenCalledWith('from_id', 'A')
    expect(mockEq).toHaveBeenCalledWith('from_article', '003800')
  })

  it('에러 시 빈 배열 반환', async () => {
    mockEq.mockResolvedValueOnce({ data: null, error: { message: 'err' } })

    const result = await getEdgesFrom('A')
    expect(result).toEqual([])
  })
})

describe('getEdgesTo', () => {
  it('특정 노드로 들어오는 엣지를 조회한다', async () => {
    const mockEdges = [
      { id: 1, from_id: 'X', to_id: 'A', relation: 'interprets' },
    ]
    mockEq.mockResolvedValueOnce({ data: mockEdges, error: null })

    const result = await getEdgesTo('A')
    expect(result).toEqual(mockEdges)
  })
})

describe('storeExtractionResult', () => {
  it('노드 먼저 저장 후 엣지 저장', async () => {
    // bulkUpsertNodes mock
    mockUpsert.mockReturnValueOnce(
      Promise.resolve({ error: null, count: 2 })
    )
    // bulkUpsertEdges mock
    mockUpsert.mockReturnValueOnce(
      Promise.resolve({ error: null, count: 1 })
    )

    const result = await storeExtractionResult({
      nodes: [
        { id: 'A', title: '관세법', type: 'law' },
        { id: 'B', title: '관세법시행령', type: 'decree' },
      ],
      edges: [
        { from_id: 'A', to_id: 'B', relation: 'delegates' },
      ],
    })

    expect(result.nodeCount).toBe(2)
    expect(result.edgeCount).toBe(1)
  })
})

describe('Supabase 미설정 시 graceful degradation', () => {
  it('getSupabase가 null이면 모든 함수가 안전하게 반환', async () => {
    // getSupabase를 null로 오버라이드
    const { getSupabase } = await import('@/lib/supabase')
    vi.mocked(getSupabase).mockReturnValue(null)

    expect(await upsertNode({ id: 'X', title: 'T', type: 'law' })).toBeNull()
    expect(await getNodeById('X')).toBeNull()
    expect(await deleteNode('X')).toBe(false)
    expect(await upsertEdge({ from_id: 'A', to_id: 'B', relation: 'cites' })).toBeNull()
    expect(await bulkUpsertEdges([{ from_id: 'A', to_id: 'B', relation: 'cites' }])).toBe(0)
    expect(await getEdgesFrom('A')).toEqual([])
    expect(await getEdgesTo('A')).toEqual([])
  })
})
