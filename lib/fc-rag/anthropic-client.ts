/**
 * Anthropic SDK 직접 호출 클라이언트
 *
 * Gateway 없이 Anthropic API를 직접 호출.
 * auth-profiles.json에서 OAuth 토큰 동적 읽기.
 * tool_use 멀티턴은 engine.ts에서 처리.
 */

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { join } from 'path'

export const CLAUDE_MODEL = 'claude-sonnet-4-6-20250514'

const AUTH_PROFILES_PATH = join(
  process.env.HOME || process.env.USERPROFILE || '',
  '.openclaw/agents/lexdiff-law/agent/auth-profiles.json',
)

let cachedClient: Anthropic | null = null
let cachedToken = ''

function getAnthropicToken(): string {
  try {
    const raw = readFileSync(AUTH_PROFILES_PATH, 'utf8')
    const data = JSON.parse(raw)
    const lastGoodKey = data.lastGood?.anthropic
    if (lastGoodKey && data.profiles?.[lastGoodKey]?.token) {
      return data.profiles[lastGoodKey].token
    }
    // fallback: 아무 anthropic 프로필 찾기
    for (const [, profile] of Object.entries(data.profiles || {})) {
      const p = profile as Record<string, unknown>
      if (p.provider === 'anthropic' && p.token) return p.token as string
    }
  } catch { /* ignore */ }
  return process.env.ANTHROPIC_API_KEY || ''
}

function getClient(): Anthropic {
  const token = getAnthropicToken()
  if (!token) {
    throw new Error('Anthropic API 키가 설정되지 않았습니다. (auth-profiles.json 또는 ANTHROPIC_API_KEY 환경변수 필요)')
  }
  if (!cachedClient || token !== cachedToken) {
    cachedToken = token
    cachedClient = new Anthropic({ apiKey: token })
  }
  return cachedClient
}

export interface DirectMessage {
  role: 'user' | 'assistant'
  content: string | Anthropic.MessageParam['content']
}

export interface DirectResponse {
  content: Anthropic.ContentBlock[]
  stopReason: string | null
  usage: { inputTokens: number; outputTokens: number }
}

/**
 * Anthropic Messages API 직접 호출
 */
export async function callAnthropic(
  systemPrompt: string,
  messages: DirectMessage[],
  options?: {
    maxTokens?: number
    temperature?: number
    tools?: Anthropic.Tool[]
    signal?: AbortSignal
  },
): Promise<DirectResponse> {
  const { maxTokens = 4096, temperature = 0, tools, signal } = options || {}
  const client = getClient()

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: messages as Anthropic.MessageParam[],
    ...(tools && tools.length > 0 ? { tools } : {}),
  }, signal ? { signal } : undefined)

  return {
    content: response.content,
    stopReason: response.stop_reason,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  }
}

// ── 호환 래퍼: 기존 callGateway 인터페이스 유지 (summarize, benchmark 등) ──

export interface GatewayMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface GatewayResponse {
  id: string
  choices: Array<{ index: number; message: { role: string; content: string }; finish_reason: string }>
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

export async function callGateway(
  messages: GatewayMessage[],
  options?: { maxTokens?: number; temperature?: number; signal?: AbortSignal },
): Promise<GatewayResponse> {
  const { maxTokens = 4096, temperature = 0, signal } = options || {}

  const systemMsg = messages.find(m => m.role === 'system')?.content || ''
  const chatMessages: DirectMessage[] = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const response = await callAnthropic(systemMsg, chatMessages, { maxTokens, temperature, signal })

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => 'text' in b ? b.text : '')
    .join('')

  return {
    id: `direct-${Date.now()}`,
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: response.stopReason || 'stop' }],
    usage: {
      prompt_tokens: response.usage.inputTokens,
      completion_tokens: response.usage.outputTokens,
      total_tokens: response.usage.inputTokens + response.usage.outputTokens,
    },
  }
}
