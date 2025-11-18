/**
 * File Search RAG API
 *
 * Google File Search를 사용한 RAG
 * 기존 /api/rag-analyze와 독립적으로 동작
 */

import { queryFileSearchStream } from '@/lib/file-search-client'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { query, metadataFilter } = await request.json()

    if (!query || typeof query !== 'string') {
      return Response.json({ error: 'Query is required' }, { status: 400 })
    }

    // Server-Sent Events (SSE) 스트리밍
    const encoder = new TextEncoder()
    let fullResponse = ''
    let citations: any[] = []
    let finishReason: string | null = null

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // File Search 스트리밍 쿼리
          for await (const chunk of queryFileSearchStream(query, { metadataFilter })) {
            if (chunk.done) {
              // 마지막 청크 - citation + finishReason 포함
              citations = chunk.citations || []
              finishReason = chunk.finishReason || null

              // ✅ 신뢰도 계산 (groundingChunks 개수 기반)
              const confidenceLevel = citations.length >= 3 ? 'high' : citations.length >= 1 ? 'medium' : 'low'

              // ⚠️ 신뢰도 낮음 경고
              if (citations.length === 0) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({
                    type: 'warning',
                    message: '⚠️ File Search Store에서 관련 조문을 찾지 못했습니다. 답변이 일반 지식에 기반할 수 있습니다.'
                  })}\n\n`)
                )
              }

              // ⚠️ MAX_TOKENS 경고 전송
              if (finishReason === 'MAX_TOKENS') {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({
                    type: 'warning',
                    message: '⚠️ 답변이 길어서 중간에 잘렸을 수 있습니다. 더 구체적인 질문을 해보세요.'
                  })}\n\n`)
                )
              }

              // Citation + Confidence 전송
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  type: 'citations',
                  citations,
                  finishReason,
                  confidenceLevel
                })}\n\n`)
              )
            } else {
              // 경고 메시지가 있으면 전송
              if (chunk.warning) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({
                    type: 'warning',
                    message: chunk.warning
                  })}\n\n`)
                )
              }

              // 텍스트 청크
              if (chunk.text) {
                fullResponse += chunk.text
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({
                    type: 'text',
                    text: chunk.text
                  })}\n\n`)
                )
              }
            }
          }

          // 완료 시그널
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error) {
          console.error('File Search streaming error:', error)
          controller.error(error)
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
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
