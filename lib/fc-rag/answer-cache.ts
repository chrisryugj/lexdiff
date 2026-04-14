/**
 * FC-RAG Answer Cache
 *
 * 동일 질의 재호출 시 LLM을 거치지 않고 캐시된 답변을 반환.
 * Upstash Redis를 source-of-truth, 로컬 Map을 fallback으로 사용
 * (engine-shared.ts 대화 컨텍스트 스토어와 동일 전략).
 *
 * ── 키 전략 ──
 *   lexdiff:fcrag:ans:v1:{sha256(normalize(query))}
 *   - v1: 스키마/프롬프트 변경 시 prefix bump 으로 일괄 무효화
 *   - normalize: trim + whitespace collapse + lowercase
 *
 * ── Skip 조건 ──
 *   - conversationId 있음 (이전 맥락 의존 → 캐시 불가)
 *   - preEvidence 있음 (클라이언트가 이미 데이터 보유)
 *   - 답변 warnings 존재 or confidenceLevel === 'low'
 *
 * ── TTL ──
 *   6시간 (법령 개정 반영 지연 허용 한도). 프롬프트/도구 스키마 변경 시
 *   CACHE_KEY_VERSION 을 올려 즉시 무효화.
 */

import { createHash } from 'crypto'
import type { FCRAGResult } from './engine-shared'

const CACHE_KEY_VERSION = 'v7'
const CACHE_TTL_S = 6 * 60 * 60 // 6h
const CACHE_TTL_MS = CACHE_TTL_S * 1000
const MAP_MAX_SIZE = 500

// ── Upstash Redis lazy init (engine-shared.ts 와 동일 패턴) ──
type RedisLike = {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>
}
let cachedRedis: RedisLike | null | undefined
function getRedis(): RedisLike | null {
  if (cachedRedis !== undefined) return cachedRedis
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    cachedRedis = null
    return null
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require('@upstash/redis') as typeof import('@upstash/redis')
    cachedRedis = new Redis({ url, token }) as unknown as RedisLike
    return cachedRedis
  } catch {
    cachedRedis = null
    return null
  }
}

// ── 로컬 Map fallback ──
interface MapEntry { result: FCRAGResult; expiry: number }
const localStore = new Map<string, MapEntry>()

function mapEvictAndStore(key: string, entry: MapEntry): void {
  const now = Date.now()
  // TTL 만료 정리
  for (const [k, v] of localStore) {
    if (v.expiry < now) localStore.delete(k)
  }
  // 사이즈 한도 LRU (가장 먼저 만료되는 것부터 축출)
  while (localStore.size >= MAP_MAX_SIZE) {
    let oldestKey: string | null = null
    let oldestExpiry = Infinity
    for (const [k, v] of localStore) {
      if (v.expiry < oldestExpiry) { oldestExpiry = v.expiry; oldestKey = k }
    }
    if (!oldestKey) break
    localStore.delete(oldestKey)
  }
  localStore.set(key, entry)
}

// ── 질의 정규화 + fingerprint ──

/** 공백 접기 + 양끝 trim + lowercase. 한글은 lowercase 영향 없음, 영문 대소문자만 정규화. */
function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase()
}

function buildCacheKey(query: string): string {
  const hash = createHash('sha256').update(normalizeQuery(query)).digest('hex').slice(0, 32)
  return `lexdiff:fcrag:ans:${CACHE_KEY_VERSION}:${hash}`
}

// ── Public API ──

export interface CacheLookupOptions {
  /** 대화 맥락이 있으면 캐시 조회 스킵 (이전 턴 의존) */
  conversationId?: string
  /** preEvidence(클라이언트 제공 데이터)가 있으면 스킵 */
  hasPreEvidence?: boolean
}

/**
 * 캐시된 답변 조회. hit → FCRAGResult, miss → null.
 * Redis 우선, 장애 시 Map fallback.
 */
export async function getCachedAnswer(
  query: string,
  opts?: CacheLookupOptions,
): Promise<FCRAGResult | null> {
  if (opts?.conversationId) return null
  if (opts?.hasPreEvidence) return null

  const key = buildCacheKey(query)
  const redis = getRedis()

  if (redis) {
    try {
      const hit = await redis.get<FCRAGResult>(key)
      if (hit && typeof hit === 'object' && 'answer' in hit) {
        // Redis 성공 결과를 Map에도 캐시 (장애 대비)
        mapEvictAndStore(key, { result: hit, expiry: Date.now() + CACHE_TTL_MS })
        return hit
      }
    } catch {
      // Redis 장애 → Map fallback
    }
  }

  const local = localStore.get(key)
  if (local && local.expiry > Date.now()) return local.result
  if (local) localStore.delete(key)
  return null
}

/**
 * 답변 캐시 저장. warnings/low confidence는 저장하지 않음 (품질 보장).
 * Best-effort: Redis 장애 시 Map에만 저장.
 */
export async function cacheAnswer(
  query: string,
  result: FCRAGResult,
  opts?: CacheLookupOptions,
): Promise<void> {
  if (opts?.conversationId) return
  if (opts?.hasPreEvidence) return

  // 품질 필터: 경고 있거나 confidence 낮으면 저장 금지
  if (result.warnings && result.warnings.length > 0) return
  if (result.confidenceLevel === 'low') return
  if (result.isTruncated) return
  if (!result.answer || result.answer.length < 50) return

  const key = buildCacheKey(query)
  const redis = getRedis()

  if (redis) {
    try {
      await redis.set(key, result, { ex: CACHE_TTL_S })
    } catch {
      // Redis 장애 → Map에만 저장 (best-effort)
    }
  }
  mapEvictAndStore(key, { result, expiry: Date.now() + CACHE_TTL_MS })
}
