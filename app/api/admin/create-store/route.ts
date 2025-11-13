/**
 * Create Store API
 * POST /api/admin/create-store
 *
 * Creates a new File Search Store and automatically updates .env.local
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

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

    // Automatically update .env.local
    try {
      const envPath = path.join(process.cwd(), '.env.local')
      let envContent = ''

      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf-8')
      }

      // Update or add GEMINI_FILE_SEARCH_STORE_ID
      const storeIdPattern = /^GEMINI_FILE_SEARCH_STORE_ID=.*$/m
      const newStoreIdLine = `GEMINI_FILE_SEARCH_STORE_ID=${newStoreId}`

      if (storeIdPattern.test(envContent)) {
        // Replace existing line
        envContent = envContent.replace(storeIdPattern, newStoreIdLine)
      } else {
        // Add new line
        envContent += `\n${newStoreIdLine}\n`
      }

      fs.writeFileSync(envPath, envContent, 'utf-8')

      console.log('[Create Store API] ✅ .env.local updated with new Store ID')

      // Update process.env for immediate use (note: this only affects current process)
      process.env.GEMINI_FILE_SEARCH_STORE_ID = newStoreId
    } catch (envError: any) {
      console.error('[Create Store API] ⚠️ Failed to update .env.local:', envError)
      // Don't fail the request if env update fails
    }

    return NextResponse.json({
      success: true,
      store: {
        id: newStoreId,
        displayName: storeData.displayName,
        createTime: storeData.createTime,
        updateTime: storeData.updateTime
      },
      message: `✅ 새 Store 생성 완료!\n.env.local이 자동으로 업데이트되었습니다.\n\n⚠️ 서버 재시작이 필요합니다.`
    })
  } catch (error: any) {
    console.error('[Create Store API] ❌ Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Store 생성 중 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}
