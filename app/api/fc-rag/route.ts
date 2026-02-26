/**
 * FC-RAG API Endpoint
 *
 * File Search RAG를 대체하는 Function Calling 기반 RAG.
 * korean-law-mcp 도구를 Gemini Function Calling으로 실시간 호출.
 *
 * 기존 /api/file-search-rag와 동일한 응답 포맷 유지.
 */

import { executeRAG } from '@/lib/fc-rag/engine'
import { recordAIUsage, isQuotaExceeded, getUsageHeaders, getUsageWarningMessage } from '@/lib/usage-tracker'
import { NextRequest } from 'next/server'

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const realIP = request.headers.get('x-real-ip')
  if (realIP) return realIP
  return '127.0.0.1'
}

export async function POST(request: NextRequest) {
  try {
    const clientIP = getClientIP(request)
    const userApiKey = request.headers.get('X-User-API-Key') || undefined

    // BYO-Key가 없을 때만 쿼터 검사
    if (!userApiKey && isQuotaExceeded(clientIP)) {
      return Response.json(
        { error: '일일 AI 검색 한도를 초과했습니다. 내일 다시 시도해주세요.' },
        { status: 429, headers: getUsageHeaders(clientIP) }
      )
    }

    const { query } = await request.json()

    if (!query || typeof query !== 'string') {
      return Response.json({ error: 'Query is required' }, { status: 400 })
    }

    // FC-RAG 실행
    const result = await executeRAG(query, userApiKey)

    // 사용량 기록 (BYO-Key가 아닐 때만)
    const warnings = [...(result.warnings || [])]
    let usageHeaders = {}

    if (!userApiKey) {
      const usageStats = recordAIUsage(clientIP, result.answer.length)
      const warningMessage = getUsageWarningMessage(usageStats)
      if (warningMessage) warnings.push(warningMessage)
      usageHeaders = getUsageHeaders(clientIP)
    }

    return Response.json(
      {
        answer: result.answer,
        citations: result.citations,
        confidenceLevel: result.confidenceLevel,
        queryType: result.queryType,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
      { headers: usageHeaders }
    )
  } catch (error) {
    return Response.json(
      {
        error: 'FC-RAG 처리 중 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
