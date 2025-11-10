import { NextRequest, NextResponse } from 'next/server'
import { intelligentSearch } from '@/lib/search-strategy'
import { debugLogger } from '@/lib/debug-logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { rawQuery } = await request.json()

    if (!rawQuery || typeof rawQuery !== 'string') {
      return NextResponse.json(
        { error: '검색어를 입력해주세요' },
        { status: 400 }
      )
    }

    debugLogger.info('🔍 Intelligent search API 호출', { rawQuery })

    const result = await intelligentSearch(rawQuery)

    return NextResponse.json({
      success: true,
      data: result.data,
      source: result.source,
      time: result.time,
      pattern: result.pattern,
      variantUsed: result.variantUsed,
    })
  } catch (error: any) {
    debugLogger.error('Intelligent search API 실패', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || '검색 중 오류가 발생했습니다',
      },
      { status: 500 }
    )
  }
}
