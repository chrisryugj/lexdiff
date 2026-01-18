/**
 * File Search RAG API
 *
 * Google File Search를 사용한 RAG
 * 기존 /api/rag-analyze와 독립적으로 동작
 */

import { queryFileSearchStream } from '@/lib/file-search-client'
import { recordAIUsage, isQuotaExceeded, getUsageHeaders, getUsageWarningMessage } from '@/lib/usage-tracker'
import { NextRequest } from 'next/server'

/**
 * 클라이언트 IP 추출
 */
function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  const realIP = request.headers.get('x-real-ip')
  if (realIP) {
    return realIP
  }
  return '127.0.0.1'
}

export async function POST(request: NextRequest) {
  try {
    const clientIP = getClientIP(request)

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 일일 쿼터 검사
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (isQuotaExceeded(clientIP)) {
      return Response.json(
        { error: '일일 AI 검색 한도를 초과했습니다. 내일 다시 시도해주세요.' },
        {
          status: 429,
          headers: getUsageHeaders(clientIP),
        }
      )
    }

    const { query, metadataFilter } = await request.json()

    if (!query || typeof query !== 'string') {
      return Response.json({ error: 'Query is required' }, { status: 400 })
    }

    // ✅ Phase 11-B: 전체 응답을 모아서 한 번에 반환 (SSE 제거, ChatGPT 스타일 타이핑 효과용)
    let fullResponse = ''
    let citations: any[] = []
    let finishReason: string | null = null
    let queryType: string = 'general'
    const warnings: string[] = []

    try {
      // File Search 스트리밍 쿼리 (백그라운드에서 전체 수집)
      for await (const chunk of queryFileSearchStream(query, { metadataFilter })) {
        if (chunk.done) {
          // 마지막 청크
          citations = chunk.citations || []
          finishReason = chunk.finishReason || null
          queryType = (chunk as any).queryType || 'general'

          // ⚠️ 신뢰도 낮음 경고
          if (citations.length === 0) {
            warnings.push('File Search Store에서 관련 조문을 찾지 못했습니다.')
          }

          // ⚠️ MAX_TOKENS 경고
          if (finishReason === 'MAX_TOKENS') {
            warnings.push('답변이 길어서 중간에 잘렸을 수 있습니다. 더 구체적인 질문을 해보세요.')
          }
        } else {
          // 경고 메시지 수집
          if (chunk.warning) {
            warnings.push(chunk.warning)
          }

          // 텍스트 청크 수집
          if (chunk.text) {
            fullResponse += chunk.text
          }
        }
      }

      // ✅ 신뢰도 계산
      const avgScore = citations.length > 0
        ? citations.reduce((sum, c) => sum + (c.relevanceScore || 0), 0) / citations.length
        : 0

      const confidenceLevel =
        citations.length >= 3 && avgScore > 0.7 ? 'high' :
        citations.length >= 1 && avgScore > 0.4 ? 'medium' : 'low'

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 사용량 기록
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const usageStats = recordAIUsage(clientIP, fullResponse.length)
      const warningMessage = getUsageWarningMessage(usageStats)

      if (warningMessage) {
        warnings.push(warningMessage)
      }

      // ✅ 전체 응답 반환 (JSON)
      return Response.json(
        {
          answer: fullResponse,
          citations,
          finishReason,
          confidenceLevel,
          queryType,
          warnings: warnings.length > 0 ? warnings : undefined,
          usage: {
            daily: usageStats.dailyUsage,
            remaining: usageStats.remainingQuota,
            percentUsed: Math.round(usageStats.percentUsed * 100),
          }
        },
        {
          headers: getUsageHeaders(clientIP),
        }
      )
    } catch (error) {
      console.error('File Search streaming error:', error)
      throw error
    }
  } catch (error) {
    console.error('File Search RAG error:', error)
    return Response.json(
      {
        error: 'Failed to query File Search',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
