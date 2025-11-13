/**
 * Delete Store Document API
 * DELETE /api/admin/delete-store-document
 *
 * Deletes a document from the File Search Store
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface DeleteDocumentRequest {
  documentId: string
}

export async function DELETE(request: NextRequest) {
  try {
    const body: DeleteDocumentRequest = await request.json()
    const { documentId } = body

    if (!documentId) {
      return NextResponse.json({ success: false, error: 'documentId가 필요합니다' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'GEMINI_API_KEY가 설정되지 않았습니다' },
        { status: 500 }
      )
    }

    console.log(`[Delete Store Document API] Deleting document: ${documentId}`)

    const url = `https://generativelanguage.googleapis.com/v1beta/${documentId}`

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'x-goog-api-key': apiKey
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Delete Store Document API] ❌ Delete failed:', errorText)
      return NextResponse.json(
        {
          success: false,
          error: `문서 삭제 실패: ${response.status}`
        },
        { status: response.status }
      )
    }

    console.log(`[Delete Store Document API] ✅ Deleted: ${documentId}`)

    return NextResponse.json({
      success: true,
      message: '문서가 삭제되었습니다',
      documentId
    })
  } catch (error: any) {
    console.error('[Delete Store Document API] ❌ Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || '문서 삭제 중 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}
