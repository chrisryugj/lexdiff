/**
 * korean-law-mcp 도구 → LLM Function Calling 어댑터
 *
 * korean-law-mcp의 개별 도구를 직접 import하여
 * FunctionDeclaration으로 변환 + 실행하는 얇은 브릿지 레이어.
 *
 * ── 모듈 구조 ──
 * tool-registry.ts : 도구 import/정의 (TOOLS 배열) + API 클라이언트
 * tool-cache.ts    : 캐시 인프라 + 결과 압축 유틸
 * tool-adapter.ts  : 선언 변환 + 실행 (이 파일)
 */

import { zodToJsonSchema } from 'zod-to-json-schema'
import type { FunctionDeclaration } from '@google/genai'
import { TOOLS, apiClient } from './tool-registry'
import {
  apiCache, CACHE_TTL, evictOldest, stableStringify,
  truncateForContext, compressSearchResult, compressAiSearchResult, isEmptySearchResult,
} from './tool-cache'

// ─── Gemini FunctionDeclaration 변환 ───

let _cachedDeclarations: FunctionDeclaration[] | null = null

export function getToolDeclarations(): FunctionDeclaration[] {
  if (_cachedDeclarations) return _cachedDeclarations

  _cachedDeclarations = TOOLS.map(tool => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jsonSchema = zodToJsonSchema(tool.schema as any, { target: 'openApi3' })

    const params: Record<string, unknown> = {
      type: 'OBJECT' as const,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      properties: (jsonSchema as any).properties || {},
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((jsonSchema as any).required?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      params.required = (jsonSchema as any).required
    }

    // apiKey는 LLM이 사용할 필요 없는 내부 파라미터 — 토큰 절약을 위해 제거
    if (params.properties && typeof params.properties === 'object' && 'apiKey' in (params.properties as Record<string, unknown>)) {
      const props = { ...(params.properties as Record<string, unknown>) }
      delete props.apiKey
      params.properties = props
      if (Array.isArray(params.required)) {
        params.required = (params.required as string[]).filter(k => k !== 'apiKey')
      }
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: params,
    } as FunctionDeclaration
  })

  return _cachedDeclarations
}

// ─── Anthropic Tool 변환 ───

interface AnthropicTool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

let _cachedAnthropicTools: AnthropicTool[] | null = null

export function getAnthropicToolDefinitions(): AnthropicTool[] {
  if (_cachedAnthropicTools) return _cachedAnthropicTools

  _cachedAnthropicTools = TOOLS.map(tool => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jsonSchema = zodToJsonSchema(tool.schema as any, { target: 'openApi3' })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties = { ...((jsonSchema as any).properties || {}) }
    delete properties.apiKey
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const required: string[] = ((jsonSchema as any).required || []).filter((k: string) => k !== 'apiKey')

    return {
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object' as const,
        properties,
        ...(required.length ? { required } : {}),
      },
    }
  })

  return _cachedAnthropicTools
}

// ─── 도구 실행 ───

export interface ToolCallResult {
  name: string
  result: string
  isError: boolean
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ToolCallResult> {
  if (signal?.aborted) {
    return { name, result: '요청이 취소되었습니다.', isError: true }
  }

  const tool = TOOLS.find(t => t.name === name)
  if (!tool) {
    return { name, result: `알 수 없는 도구: ${name}`, isError: true }
  }

  // 캐시 조회
  const cacheKey = `${name}:${stableStringify(args)}`
  const cached = apiCache.get(cacheKey)
  if (cached && Date.now() < cached.expiry) {
    return cached.result
  }

  try {
    if (signal?.aborted) {
      return { name, result: '요청이 취소되었습니다.', isError: true }
    }
    const parsedArgs = tool.schema.parse(args)

    // 개별 도구 타임아웃 (법제처 API hang 방지)
    // P1-AI-8: chain 도구는 내부적으로 여러 API를 순차 호출하므로 더 긴 timeout 필요
    const isChainTool = name.startsWith('chain_')
    const TOOL_TIMEOUT_MS = isChainTool ? 90_000 : 30_000
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`도구 타임아웃 (${TOOL_TIMEOUT_MS}ms): ${name}`)), TOOL_TIMEOUT_MS)
    })
    let response: Awaited<ReturnType<typeof tool.handler>>
    try {
      response = await Promise.race([
        tool.handler(apiClient, parsedArgs),
        timeoutPromise,
      ])
    } finally {
      clearTimeout(timer)
    }
    const text = response.content.map(c => c.text).join('\n')
    const truncated = truncateForContext(text, name)
    const result: ToolCallResult = {
      name,
      result: name === 'search_law'
        ? compressSearchResult(truncated)
        : name === 'search_ai_law'
          ? compressAiSearchResult(truncated)
          : truncated,
      isError: response.isError || false,
    }

    // 성공 시 캐시 저장 (빈 검색 결과는 캐시하지 않음)
    const ttl = CACHE_TTL[name]
    if (ttl && !result.isError) {
      const isEmptySearch = name.startsWith('search_') && isEmptySearchResult(result.result)
      if (!isEmptySearch) {
        apiCache.set(cacheKey, { result, expiry: Date.now() + ttl })
        evictOldest()
      }
    }

    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { name, result: `도구 실행 오류: ${message}`, isError: true }
  }
}

export async function executeToolsParallel(
  calls: Array<{ name: string; args: Record<string, unknown> }>,
  signal?: AbortSignal,
): Promise<ToolCallResult[]> {
  return Promise.all(calls.map(c => executeTool(c.name, c.args, signal)))
}
