/**
 * Switch Store API
 * POST /api/admin/switch-store
 *
 * Switches the active File Search Store by updating .env.local
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface SwitchStoreRequest {
  storeId: string
}

export async function POST(request: NextRequest) {
  try {
    const body: SwitchStoreRequest = await request.json()
    const { storeId } = body

    if (!storeId) {
      return NextResponse.json(
        { success: false, error: 'storeId가 필요합니다' },
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

    // Validate that the store exists
    console.log('[Switch Store API] Validating store:', storeId)

    const validateUrl = `https://generativelanguage.googleapis.com/v1beta/${storeId}`

    const validateResponse = await fetch(validateUrl, {
      headers: {
        'x-goog-api-key': apiKey
      }
    })

    if (!validateResponse.ok) {
      const errorText = await validateResponse.text()
      console.error('[Switch Store API] ❌ Store validation failed:', errorText)
      return NextResponse.json(
        {
          success: false,
          error: `Store가 존재하지 않거나 접근할 수 없습니다: ${validateResponse.status}`
        },
        { status: 400 }
      )
    }

    const storeData = await validateResponse.json()

    console.log('[Switch Store API] ✅ Store validated:', storeData.displayName)

    // Update .env.local
    try {
      const envPath = path.join(process.cwd(), '.env.local')
      let envContent = ''

      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf-8')
      }

      // Update or add GEMINI_FILE_SEARCH_STORE_ID
      const storeIdPattern = /^GEMINI_FILE_SEARCH_STORE_ID=.*$/m
      const newStoreIdLine = `GEMINI_FILE_SEARCH_STORE_ID=${storeId}`

      if (storeIdPattern.test(envContent)) {
        // Replace existing line
        envContent = envContent.replace(storeIdPattern, newStoreIdLine)
      } else {
        // Add new line
        envContent += `\n${newStoreIdLine}\n`
      }

      fs.writeFileSync(envPath, envContent, 'utf-8')

      console.log('[Switch Store API] ✅ .env.local updated with Store ID')

      // Update process.env for immediate use (note: this only affects current process)
      process.env.GEMINI_FILE_SEARCH_STORE_ID = storeId
    } catch (envError: any) {
      console.error('[Switch Store API] ❌ Failed to update .env.local:', envError)
      return NextResponse.json(
        {
          success: false,
          error: `.env.local 업데이트 실패: ${envError.message}`
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      storeId,
      displayName: storeData.displayName,
      message: `✅ Store 전환 완료: ${storeData.displayName}\n\n⚠️ 서버 재시작이 필요합니다.`
    })
  } catch (error: any) {
    console.error('[Switch Store API] ❌ Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Store 전환 중 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}
