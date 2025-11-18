/**
 * List All Stores API
 * GET /api/admin/list-stores
 *
 * Lists all File Search Stores in the account
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'GEMINI_API_KEY가 설정되지 않았습니다' },
        { status: 500 }
      )
    }

    console.log('[List Stores API] Fetching all stores...')

    const url = `https://generativelanguage.googleapis.com/v1beta/fileSearchStores`

    const response = await fetch(url, {
      headers: {
        'x-goog-api-key': apiKey
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[List Stores API] ❌ Request failed:', errorText)
      return NextResponse.json(
        {
          success: false,
          error: `Store 목록 조회 실패: ${response.status}`
        },
        { status: response.status }
      )
    }

    const data = await response.json()
    const stores = data.fileSearchStores || []
    const currentStoreId = process.env.GEMINI_FILE_SEARCH_STORE_ID || null

    console.log('[List Stores API] ✅ Found', stores.length, 'stores')

    return NextResponse.json({
      success: true,
      stores: stores.map((store: any) => ({
        id: store.name,
        displayName: store.displayName,
        createTime: store.createTime,
        updateTime: store.updateTime,
        isActive: store.name === currentStoreId
      })),
      currentStoreId
    })
  } catch (error: any) {
    console.error('[List Stores API] ❌ Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Store 목록 조회 중 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}
