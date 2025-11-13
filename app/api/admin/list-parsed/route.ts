/**
 * List Parsed Laws API
 * GET /api/admin/list-parsed
 *
 * Returns list of all locally saved parsed laws
 */

import { NextRequest, NextResponse } from 'next/server'
import { listParsedLaws } from '@/lib/file-storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    console.log('[List Parsed API] Fetching list of parsed laws...')

    const laws = await listParsedLaws()

    console.log(`[List Parsed API] ✅ Found ${laws.length} parsed laws`)

    return NextResponse.json({
      success: true,
      laws,
      count: laws.length
    })
  } catch (error: any) {
    console.error('[List Parsed API] ❌ Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || '목록 조회 중 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}
