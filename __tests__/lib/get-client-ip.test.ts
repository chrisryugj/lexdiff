/**
 * H-SEC1: getClientIP trust hierarchy tests
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { getClientIP } from '@/lib/get-client-ip'

function makeRequest(headers: Record<string, string>): Request {
  return new Request('http://localhost/test', { headers })
}

describe('getClientIP (H-SEC1)', () => {
  const originalVercel = process.env.VERCEL
  const originalProxy = process.env.NEXT_PUBLIC_TRUST_PROXY

  beforeEach(() => {
    delete process.env.VERCEL
    delete process.env.NEXT_PUBLIC_TRUST_PROXY
  })
  afterEach(() => {
    if (originalVercel !== undefined) process.env.VERCEL = originalVercel
    if (originalProxy !== undefined) process.env.NEXT_PUBLIC_TRUST_PROXY = originalProxy
  })

  test('Vercel 환경: x-vercel-forwarded-for만 신뢰', () => {
    process.env.VERCEL = '1'
    const req = makeRequest({ 'x-vercel-forwarded-for': '203.0.113.1' })
    expect(getClientIP(req)).toBe('203.0.113.1')
  })

  test('Vercel 환경 + 스푸핑된 x-forwarded-for → 무시하고 anonymous', () => {
    process.env.VERCEL = '1'
    const req = makeRequest({ 'x-forwarded-for': '1.2.3.4' })
    expect(getClientIP(req)).toBe('anonymous')
  })

  test('Vercel 환경에서 Vercel 헤더 없으면 anonymous (quota bucket 공유)', () => {
    process.env.VERCEL = '1'
    const req = makeRequest({})
    expect(getClientIP(req)).toBe('anonymous')
  })

  test('Vercel 아닌 환경 + TRUST_PROXY=false → 127.0.0.1', () => {
    const req = makeRequest({ 'x-forwarded-for': '1.2.3.4' })
    expect(getClientIP(req)).toBe('127.0.0.1')
  })

  test('TRUST_PROXY=true → x-forwarded-for 허용', () => {
    process.env.NEXT_PUBLIC_TRUST_PROXY = 'true'
    const req = makeRequest({ 'x-forwarded-for': '10.0.0.5, 172.16.0.1' })
    expect(getClientIP(req)).toBe('10.0.0.5')
  })

  test('TRUST_PROXY=true + x-real-ip fallback', () => {
    process.env.NEXT_PUBLIC_TRUST_PROXY = 'true'
    const req = makeRequest({ 'x-real-ip': '10.0.0.7' })
    expect(getClientIP(req)).toBe('10.0.0.7')
  })
})
