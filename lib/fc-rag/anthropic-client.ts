/**
 * Anthropic SDK 클라이언트 제공 모듈.
 *
 * 토큰 소스 우선순위:
 * 1. ANTHROPIC_API_KEY 환경변수 (Vercel 등 클라우드 배포용)
 * 2. OpenClaw auth-profiles.json (로컬 개발용, 토큰 갱신 자동 반영)
 */

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const AUTH_PROFILES_PATH = join(
  homedir(), '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json',
)

export const CLAUDE_MODEL = 'claude-sonnet-4-6-20250514'

interface AuthProfiles {
  profiles: Record<string, { type: string; provider: string; token?: string }>
  lastGood?: Record<string, string>
}

/**
 * Anthropic 토큰 획득.
 * 1) ANTHROPIC_API_KEY 환경변수 (Vercel 등 클라우드)
 * 2) OpenClaw auth-profiles.json (로컬)
 */
function getAnthropicToken(): string {
  // 1) 환경변수 우선 (Vercel 배포)
  const envKey = process.env.ANTHROPIC_API_KEY
  if (envKey) return envKey

  // 2) OpenClaw auth-profiles.json (로컬 개발)
  if (!existsSync(AUTH_PROFILES_PATH)) {
    throw new Error(
      'ANTHROPIC_API_KEY 환경변수가 없고, OpenClaw auth-profiles.json도 없습니다.',
    )
  }

  const raw = readFileSync(AUTH_PROFILES_PATH, 'utf-8')
  const data: AuthProfiles = JSON.parse(raw)

  const lastGoodId = data.lastGood?.anthropic
  if (lastGoodId) {
    const profile = data.profiles[lastGoodId]
    if (profile?.token) return profile.token
  }

  for (const [id, profile] of Object.entries(data.profiles)) {
    if (id.startsWith('anthropic:') && profile.token) {
      return profile.token
    }
  }

  throw new Error(
    'OpenClaw auth-profiles.json에 Anthropic 토큰이 없습니다.',
  )
}

let _client: Anthropic | null = null
let _lastToken: string | null = null

/**
 * Anthropic 클라이언트 반환.
 * 토큰이 변경되었으면 클라이언트를 재생성.
 */
export function getAnthropicClient(): Anthropic {
  const token = getAnthropicToken()
  if (_client && _lastToken === token) return _client
  _client = new Anthropic({ apiKey: token })
  _lastToken = token
  return _client
}
