import { NextRequest, NextResponse } from 'next/server'
import { learnFromSuccessfulSearch, getSessionId, createSearchPattern } from '@/lib/search-learning'
import { normalizeSearchQuery } from '@/lib/search-normalizer'
import { parseSearchQuery } from '@/lib/law-parser'
import { debugLogger } from '@/lib/debug-logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { rawQuery, apiResult } = body

    if (!rawQuery || typeof rawQuery !== 'string') {
      return NextResponse.json(
        { error: '검색어를 입력해주세요' },
        { status: 400 }
      )
    }

    if (!apiResult) {
      return NextResponse.json(
        { error: 'API 결과가 필요합니다' },
        { status: 400 }
      )
    }

    debugLogger.info('📚 검색 학습 API 호출', { rawQuery })

    const normalized = normalizeSearchQuery(rawQuery)
    const pattern = createSearchPattern(normalized)
    const parsed = parseSearchQuery(normalized)

    const result = await learnFromSuccessfulSearch({
      rawQuery,
      normalizedQuery: normalized,
      pattern,
      parsed,
      apiResult,
      sessionId: getSessionId(),
    })

    debugLogger.success('📚 검색 학습 완료', { pattern, queryId: result.queryId })

    return NextResponse.json({
      success: true,
      queryId: result.queryId,
      resultId: result.resultId,
      pattern,
    })
  } catch (error: any) {
    debugLogger.error('검색 학습 API 실패', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || '학습 중 오류가 발생했습니다',
      },
      { status: 500 }
    )
  }
}
