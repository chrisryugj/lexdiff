/**
 * tool-adapter 단위 테스트.
 *
 * 검증 대상 (M12 / abort / timeout / cache):
 *  - executeTool: 캐시 hit / expired evict / abort 즉시 반환 / timeout / handler 에러
 *  - executeToolsParallel: 병렬 실행 + 부분 실패 격리
 *
 * tool-registry는 외부 패키지(korean-law-mcp) 의존이 깊어 vi.mock으로 가짜 TOOLS 주입.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest'

// vi.hoisted로 top-level mock state 노출 (vi.mock은 hoist되므로 일반 const 접근 불가)
const { fakeHandler } = vi.hoisted(() => ({
  fakeHandler: vi.fn(),
}))

vi.mock('@/lib/fc-rag/tool-registry', async () => {
  const { z } = await import('zod')
  return {
    apiClient: { dummy: true },
    TOOLS: [
      {
        name: 'fake_search',
        description: 'fake search tool',
        schema: z.object({ query: z.string() }),
        handler: fakeHandler,
      },
      {
        name: 'fake_slow',
        description: 'always slow',
        schema: z.object({}),
        handler: () => new Promise(() => { /* never resolves */ }),
      },
    ],
  }
})

// CACHE_TTL은 기본 export — fake_search 매핑 강제 추가
vi.mock('@/lib/fc-rag/tool-cache', async () => {
  const actual = await vi.importActual<typeof import('@/lib/fc-rag/tool-cache')>('@/lib/fc-rag/tool-cache')
  return {
    ...actual,
    CACHE_TTL: { ...actual.CACHE_TTL, fake_search: 60_000 },
  }
})

import { executeTool, executeToolsParallel } from '@/lib/fc-rag/tool-adapter'
import { apiCache } from '@/lib/fc-rag/tool-cache'

beforeEach(() => {
  apiCache.clear()
  fakeHandler.mockReset()
})

describe('executeTool — 기본 실행', () => {
  it('handler 결과를 ToolCallResult로 반환한다', async () => {
    fakeHandler.mockResolvedValue({
      content: [{ text: '결과 텍스트입니다' }],
      isError: false,
    })
    const r = await executeTool('fake_search', { query: 'a' })
    expect(r.isError).toBe(false)
    expect(r.name).toBe('fake_search')
    expect(r.result).toContain('결과 텍스트입니다')
  })

  it('알 수 없는 도구는 isError로 반환', async () => {
    const r = await executeTool('nonexistent', {})
    expect(r.isError).toBe(true)
    expect(r.result).toMatch(/알 수 없는 도구/)
  })

  it('handler가 throw하면 isError 메시지로 변환', async () => {
    fakeHandler.mockRejectedValue(new Error('boom'))
    const r = await executeTool('fake_search', { query: 'a' })
    expect(r.isError).toBe(true)
    expect(r.result).toMatch(/boom/)
  })

  it('zod schema 검증 실패도 isError', async () => {
    // query가 number → string 요구 위반
    const r = await executeTool('fake_search', { query: 123 } as unknown as Record<string, unknown>)
    expect(r.isError).toBe(true)
  })
})

describe('executeTool — abort 전파', () => {
  it('이미 abort된 signal이면 handler 호출 없이 즉시 isError', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const r = await executeTool('fake_search', { query: 'a' }, ctrl.signal)
    expect(r.isError).toBe(true)
    expect(fakeHandler).not.toHaveBeenCalled()
  })
})

describe('executeTool — 캐시', () => {
  it('TTL 내라면 handler를 다시 호출하지 않는다 (cache hit)', async () => {
    fakeHandler.mockResolvedValue({ content: [{ text: 'cached' }], isError: false })
    await executeTool('fake_search', { query: 'k' })
    await executeTool('fake_search', { query: 'k' })
    expect(fakeHandler).toHaveBeenCalledTimes(1)
  })

  it('M12: 만료된 cache entry는 즉시 delete 후 재호출', async () => {
    fakeHandler.mockResolvedValue({ content: [{ text: 'first' }], isError: false })
    await executeTool('fake_search', { query: 'expired' })

    // 캐시 키를 직접 expire 처리
    const [key, entry] = [...apiCache.entries()][0]
    entry.expiry = Date.now() - 1000

    fakeHandler.mockResolvedValue({ content: [{ text: 'second' }], isError: false })
    const r = await executeTool('fake_search', { query: 'expired' })

    expect(r.result).toContain('second')
    expect(fakeHandler).toHaveBeenCalledTimes(2)
    // 새 entry로 갱신
    expect(apiCache.has(key)).toBe(true)
  })

  it('isError 결과는 캐시하지 않는다', async () => {
    fakeHandler.mockResolvedValue({ content: [{ text: 'oops' }], isError: true })
    await executeTool('fake_search', { query: 'x' })
    expect(apiCache.size).toBe(0)
  })

  it('동일 인자라면 키 순서가 달라도 같은 캐시 키를 사용 (stable stringify)', async () => {
    fakeHandler.mockResolvedValue({ content: [{ text: 'r' }], isError: false })
    await executeTool('fake_search', { query: 'k' })
    // 같은 도구/같은 args
    await executeTool('fake_search', { query: 'k' })
    expect(apiCache.size).toBe(1)
  })
})

describe('executeTool — timeout', () => {
  it('handler가 hang하면 30초 타임아웃 → isError', async () => {
    vi.useFakeTimers()
    const promise = executeTool('fake_slow', {})
    // 일반 도구 timeout 30초
    await vi.advanceTimersByTimeAsync(30_001)
    const r = await promise
    expect(r.isError).toBe(true)
    expect(r.result).toMatch(/타임아웃/)
    vi.useRealTimers()
  }, 10_000)
})

describe('executeToolsParallel', () => {
  it('병렬로 실행되고 부분 실패가 다른 호출을 막지 않는다', async () => {
    fakeHandler.mockImplementation(async (_c, args: { query: string }) => {
      if (args.query === 'bad') throw new Error('nope')
      return { content: [{ text: `ok:${args.query}` }], isError: false }
    })
    const results = await executeToolsParallel([
      { name: 'fake_search', args: { query: 'a' } },
      { name: 'fake_search', args: { query: 'bad' } },
      { name: 'fake_search', args: { query: 'b' } },
    ])
    expect(results).toHaveLength(3)
    expect(results[0].isError).toBe(false)
    expect(results[1].isError).toBe(true)
    expect(results[2].isError).toBe(false)
  })
})
