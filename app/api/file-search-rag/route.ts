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

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // File Search 스트리밍 쿼리
          for await (const chunk of queryFileSearchStream(query, { metadataFilter })) {
            if (chunk.done) {
              // 마지막 청크 - citation 포함
              citations = chunk.citations || []

              // Citation 전송
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  type: 'citations',
                  citations
                })}\n\n`)
              )
            } else {
              // 텍스트 청크
              fullResponse += chunk.text
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  type: 'text',
                  text: chunk.text
                })}\n\n`)
              )
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
