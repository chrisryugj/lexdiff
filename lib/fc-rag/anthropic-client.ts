/**
 * OpenClaw auth-profiles.json에서 Anthropic OAuth 토큰을 동적으로 읽어
 * @anthropic-ai/sdk 클라이언트를 제공하는 모듈.
 *
 * 토큰이 갱신되면 다음 호출에서 자동으로 새 토큰을 사용.
 */

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
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
 * auth-profiles.json에서 최신 Anthropic 토큰 읽기.
 * lastGood 프로필 우선, 없으면 아무 anthropic 프로필 사용.
 */
function getAnthropicToken(): string {
  const raw = readFileSync(AUTH_PROFILES_PATH, 'utf-8')
  const data: AuthProfiles = JSON.parse(raw)

  // lastGood 프로필 우선
  const lastGoodId = data.lastGood?.anthropic
  if (lastGoodId) {
    const profile = data.profiles[lastGoodId]
    if (profile?.token) return profile.token
  }

  // fallback: 아무 anthropic 토큰
  for (const [id, profile] of Object.entries(data.profiles)) {
    if (id.startsWith('anthropic:') && profile.token) {
      return profile.token
    }
  }

  throw new Error(
    'OpenClaw auth-profiles.json에 Anthropic 토큰이 없습니다. ' +
    'OpenClaw Gateway에서 Anthropic 인증을 설정해주세요.',
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
