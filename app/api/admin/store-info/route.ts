/**
 * Store Info API
 * GET /api/admin/store-info
 *
 * Returns detailed information about the current File Search Store
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const storeId = process.env.GEMINI_FILE_SEARCH_STORE_ID
    const apiKey = process.env.GEMINI_API_KEY

    if (!storeId) {
      return NextResponse.json({
        success: false,
        error: 'GEMINI_FILE_SEARCH_STORE_ID가 설정되지 않았습니다',
        hasStore: false
      })
    }

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'GEMINI_API_KEY가 설정되지 않았습니다' },
        { status: 500 }
      )
    }

    console.log('[Store Info API] Fetching store info:', storeId)

    // Get store details
    const url = `https://generativelanguage.googleapis.com/v1beta/${storeId}`

    const response = await fetch(url, {
      headers: {
        'x-goog-api-key': apiKey
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Store Info API] ❌ Request failed:', errorText)
      return NextResponse.json(
        {
          success: false,
          error: `Store 정보 조회 실패: ${response.status}`,
          hasStore: true,
          storeId
        },
        { status: response.status }
      )
    }

    const storeData = await response.json()

    console.log('[Store Info API] ✅ Store info retrieved')

    return NextResponse.json({
      success: true,
      hasStore: true,
      store: {
        id: storeData.name,
        displayName: storeData.displayName,
        createTime: storeData.createTime,
        updateTime: storeData.updateTime
      }
    })
  } catch (error: any) {
    console.error('[Store Info API] ❌ Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Store 정보 조회 중 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}
