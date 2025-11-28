/**
 * Batch Delete Store Documents API
 * DELETE /api/admin/batch-delete-documents
 *
 * Deletes multiple documents from the File Search Store
 * Uses force=true to delete documents with chunks
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface BatchDeleteRequest {
  documentIds: string[]
}

export async function DELETE(request: NextRequest) {
  try {
    const body: BatchDeleteRequest = await request.json()
    const { documentIds } = body

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'documentIds 배열이 필요합니다' },
        { status: 400 }
      )
    }

    const apiKey = process.env.GEMINI_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'GEMINI_API_KEY가 설정되지 않았습니다' },
        { status: 500 }
      )
    }

    console.log(`[Batch Delete Documents API] Deleting ${documentIds.length} documents...`)

    const results = {
      success: [] as string[],
      failed: [] as { id: string; error: string }[]
    }

    // Delete documents in parallel (with rate limiting)
    const BATCH_SIZE = 5
    for (let i = 0; i < documentIds.length; i += BATCH_SIZE) {
      const batch = documentIds.slice(i, i + BATCH_SIZE)

      await Promise.all(
        batch.map(async (documentId) => {
          try {
            // Use force=true to delete document with all its chunks
            const url = `https://generativelanguage.googleapis.com/v1beta/${documentId}?force=true`

            const response = await fetch(url, {
              method: 'DELETE',
              headers: {
                'x-goog-api-key': apiKey
              }
            })

            if (!response.ok) {
              const errorText = await response.text()
              console.error(`[Batch Delete] ❌ Failed to delete ${documentId}:`, errorText)
              results.failed.push({
                id: documentId,
                error: `${response.status}: ${errorText}`
              })
            } else {
              console.log(`[Batch Delete] ✅ Deleted: ${documentId}`)
              results.success.push(documentId)
            }
          } catch (err: any) {
            console.error(`[Batch Delete] ❌ Error deleting ${documentId}:`, err)
            results.failed.push({
              id: documentId,
              error: err.message
            })
          }
        })
      )

      // Rate limiting: wait 200ms between batches
      if (i + BATCH_SIZE < documentIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    }

    console.log(
      `[Batch Delete Documents API] ✅ Complete: ${results.success.length} success, ${results.failed.length} failed`
    )

    return NextResponse.json({
      success: true,
      results,
      total: documentIds.length,
      successCount: results.success.length,
      failedCount: results.failed.length
    })
  } catch (error: any) {
    console.error('[Batch Delete Documents API] ❌ Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || '일괄 삭제 중 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}
