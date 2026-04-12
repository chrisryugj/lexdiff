/**
 * H-SEC2: conversationId format enforcement
 */
import { describe, test, expect } from 'vitest'
import { ragRequestSchema } from '@/lib/api-validation'

describe('ragRequestSchema.conversationId (H-SEC2)', () => {
  const base = { query: 'hello' }

  test('UUID v4 accepted', () => {
    const r = ragRequestSchema.safeParse({ ...base, conversationId: '550e8400-e29b-41d4-a716-446655440000' })
    expect(r.success).toBe(true)
  })

  test('optional (absent) accepted', () => {
    expect(ragRequestSchema.safeParse(base).success).toBe(true)
  })

  test('너무 짧은 ID 거부', () => {
    const r = ragRequestSchema.safeParse({ ...base, conversationId: 'abc123' })
    expect(r.success).toBe(false)
  })

  test('짧은 legacy 포맷 (q-123-ab) 거부', () => {
    const r = ragRequestSchema.safeParse({ ...base, conversationId: 'q-123-ab' })
    expect(r.success).toBe(false)
  })

  test('특수문자 포함 거부', () => {
    const r = ragRequestSchema.safeParse({ ...base, conversationId: 'abc$%^&*()1234567890' })
    expect(r.success).toBe(false)
  })

  test('빈 문자열 거부', () => {
    const r = ragRequestSchema.safeParse({ ...base, conversationId: '' })
    expect(r.success).toBe(false)
  })

  test('64자 초과 거부', () => {
    const r = ragRequestSchema.safeParse({ ...base, conversationId: 'a'.repeat(65) })
    expect(r.success).toBe(false)
  })

  test('16자 base36 accepted', () => {
    const r = ragRequestSchema.safeParse({ ...base, conversationId: '01h8x5y6z7w8v9u0' })
    expect(r.success).toBe(true)
  })
})
