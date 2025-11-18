/**
 * Delete Store API
 * DELETE /api/admin/delete-store
 *
 * Deletes a File Search Store
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface DeleteStoreRequest {
  storeId: string
}

export async function DELETE(request: NextRequest) {
  try {
    const body: DeleteStoreRequest = await request.json()
    const { storeId } = body

    if (!storeId) {
      return NextResponse.json(
        { success: false, error: 'storeId가 필요합니다' },
        { status: 400 }
      )
    }

    const apiKey = process.env.GEMINI_API_KEY
    const currentStoreId = process.env.GEMINI_FILE_SEARCH_STORE_ID

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'GEMINI_API_KEY가 설정되지 않았습니다' },
        { status: 500 }
      )
    }

    // Prevent deleting the currently active store
    if (storeId === currentStoreId) {
      return NextResponse.json(
        {
          success: false,
          error: '현재 활성화된 Store는 삭제할 수 없습니다. 다른 Store로 전환 후 삭제하세요.'
        },
        { status: 400 }
      )
    }

    console.log('[Delete Store API] Deleting store:', storeId)

    // Use force=true to delete non-empty stores
    const url = `https://generativelanguage.googleapis.com/v1beta/${storeId}?force=true`

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'x-goog-api-key': apiKey
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Delete Store API] ❌ Deletion failed:', errorText)
      return NextResponse.json(
        {
          success: false,
          error: `Store 삭제 실패: ${response.status}`
        },
        { status: response.status }
      )
    }

    console.log('[Delete Store API] ✅ Store deleted:', storeId)

    return NextResponse.json({
      success: true,
      message: 'Store가 삭제되었습니다'
    })
  } catch (error: any) {
    console.error('[Delete Store API] ❌ Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Store 삭제 중 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}
