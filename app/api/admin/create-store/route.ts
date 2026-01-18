/**
 * Create Store API
 * POST /api/admin/create-store
 *
 * Creates a new File Search Store and automatically updates .env.local
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface CreateStoreRequest {
  displayName?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateStoreRequest = await request.json()
    const { displayName } = body

    const apiKey = process.env.GEMINI_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'GEMINI_API_KEY가 설정되지 않았습니다' },
        { status: 500 }
      )
    }

    const storeName = displayName || `lexdiff-store-${Date.now()}`

    console.log('[Create Store API] Creating store:', storeName)

    const url = `https://generativelanguage.googleapis.com/v1beta/fileSearchStores`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        displayName: storeName
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Create Store API] ❌ Creation failed:', errorText)
      return NextResponse.json(
        {
          success: false,
          error: `Store 생성 실패: ${response.status}`
        },
        { status: response.status }
      )
    }

    const storeData = await response.json()
    const newStoreId = storeData.name

    console.log('[Create Store API] ✅ Store created:', newStoreId)

    // ⚠️ 프로덕션 환경에서는 파일 시스템 쓰기 불가 (Vercel read-only)
    // 환경변수는 Vercel 대시보드에서 수동 설정 필요

    return NextResponse.json({
      success: true,
      store: {
        id: newStoreId,
        displayName: storeData.displayName,
        createTime: storeData.createTime,
        updateTime: storeData.updateTime
      },
      message: `✅ 새 Store 생성 완료!\n\n📋 다음 단계:\n1. Vercel 대시보드 → Settings → Environment Variables\n2. GEMINI_FILE_SEARCH_STORE_ID = ${newStoreId}\n3. Redeploy 실행`,
      envValue: `GEMINI_FILE_SEARCH_STORE_ID=${newStoreId}`
    })
  } catch (error) {
    console.error('[Create Store API] ❌ Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Store 생성 중 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}
